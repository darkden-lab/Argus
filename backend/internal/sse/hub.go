package sse

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Event represents a Server-Sent Event.
type Event struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// Client represents a connected SSE client.
type Client struct {
	ID     string
	UserID string
	writer http.ResponseWriter
	sendCh chan Event
	done   chan struct{}

	subMu         sync.RWMutex
	subscriptions map[string]bool // for K8s watches: "cluster/resource/ns"
}

// IsSubscribed checks if the client is subscribed to a given key.
func (c *Client) IsSubscribed(key string) bool {
	c.subMu.RLock()
	defer c.subMu.RUnlock()
	return c.subscriptions[key]
}

// Subscribe adds a subscription key.
func (c *Client) Subscribe(key string) {
	c.subMu.Lock()
	defer c.subMu.Unlock()
	c.subscriptions[key] = true
}

// Unsubscribe removes a subscription key.
func (c *Client) Unsubscribe(key string) {
	c.subMu.Lock()
	defer c.subMu.Unlock()
	delete(c.subscriptions, key)
}

// Hub manages SSE client connections per user.
type Hub struct {
	mu      sync.RWMutex
	clients map[string]*Client  // clientID -> Client
	users   map[string][]string // userID -> []clientID
}

// NewHub creates a new SSE Hub.
func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]*Client),
		users:   make(map[string][]string),
	}
}

// Register creates a new SSE client for the given user, sets SSE headers,
// and starts the write loop. Returns the client (caller should block on
// request context done, then call Unregister).
func (h *Hub) Register(userID string, w http.ResponseWriter) *Client {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return nil
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	clientID := uuid.New().String()
	client := &Client{
		ID:            clientID,
		UserID:        userID,
		writer:        w,
		sendCh:        make(chan Event, 256),
		done:          make(chan struct{}),
		subscriptions: make(map[string]bool),
	}

	h.mu.Lock()
	h.clients[clientID] = client
	h.users[userID] = append(h.users[userID], clientID)
	h.mu.Unlock()

	// Flush headers immediately
	flusher.Flush()

	// Start write loop
	go client.writeLoop(flusher)

	log.Printf("sse: registered client %s for user %s", clientID, userID)
	return client
}

// Unregister removes a client and cleans up.
func (h *Hub) Unregister(clientID string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	client, ok := h.clients[clientID]
	if !ok {
		return
	}

	// Signal writeLoop to stop
	select {
	case <-client.done:
	default:
		close(client.done)
	}

	delete(h.clients, clientID)

	// Remove from user index
	userClients := h.users[client.UserID]
	for i, id := range userClients {
		if id == clientID {
			h.users[client.UserID] = append(userClients[:i], userClients[i+1:]...)
			break
		}
	}
	if len(h.users[client.UserID]) == 0 {
		delete(h.users, client.UserID)
	}

	log.Printf("sse: unregistered client %s (user %s)", clientID, client.UserID)
}

// SendToUser sends an event to all SSE clients for a given user.
func (h *Hub) SendToUser(userID string, event Event) {
	h.mu.RLock()
	clientIDs := h.users[userID]
	h.mu.RUnlock()

	for _, id := range clientIDs {
		h.SendToClient(id, event)
	}
}

// SendToClient sends an event to a specific client.
func (h *Hub) SendToClient(clientID string, event Event) {
	h.mu.RLock()
	client, ok := h.clients[clientID]
	h.mu.RUnlock()

	if !ok {
		return
	}

	select {
	case client.sendCh <- event:
	case <-client.done:
	default:
		// Channel full — drop event to avoid blocking
		log.Printf("sse: dropping event for client %s (buffer full)", clientID)
	}
}

// Broadcast sends an event to all connected clients.
func (h *Hub) Broadcast(event Event) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, client := range h.clients {
		select {
		case client.sendCh <- event:
		case <-client.done:
		default:
		}
	}
}

// GetAllClients returns a snapshot of all connected clients.
func (h *Hub) GetAllClients() []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	result := make([]*Client, 0, len(h.clients))
	for _, c := range h.clients {
		result = append(result, c)
	}
	return result
}

// GetUserClients returns all clients for a given user.
func (h *Hub) GetUserClients(userID string) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var result []*Client
	for _, id := range h.users[userID] {
		if c, ok := h.clients[id]; ok {
			result = append(result, c)
		}
	}
	return result
}

// writeLoop is the per-client goroutine that writes events and keepalives.
func (c *Client) writeLoop(flusher http.Flusher) {
	keepalive := time.NewTicker(15 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-c.done:
			return

		case event := <-c.sendCh:
			data, err := json.Marshal(event.Data)
			if err != nil {
				log.Printf("sse: marshal error for client %s: %v", c.ID, err)
				continue
			}

			_, writeErr := fmt.Fprintf(c.writer, "event: %s\ndata: %s\n\n", event.Type, data)
			if writeErr != nil {
				return
			}
			flusher.Flush()

		case <-keepalive.C:
			_, writeErr := fmt.Fprintf(c.writer, ": keepalive\n\n")
			if writeErr != nil {
				return
			}
			flusher.Flush()
		}
	}
}
