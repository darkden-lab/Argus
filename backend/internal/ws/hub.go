package ws

import (
	"encoding/json"
	"log"
	"sync"
)

// WatchEvent is the message sent to WebSocket subscribers when a K8s watch
// produces an event for a resource they are subscribed to.
type WatchEvent struct {
	Cluster   string          `json:"cluster"`
	Resource  string          `json:"resource"`
	Namespace string          `json:"namespace"`
	Type      string          `json:"type"` // ADDED | MODIFIED | DELETED
	Object    json.RawMessage `json:"object"`
}

// subscriptionKey builds a canonical key for a (cluster, resource, namespace)
// tuple that is used to fan-out events to interested clients.
func subscriptionKey(clusterID, resource, namespace string) string {
	return clusterID + "/" + resource + "/" + namespace
}

// EventHook is a callback invoked whenever a WatchEvent is broadcast through
// the Hub. It can be used by external systems (e.g. the notification producer)
// to react to K8s watch events.
type EventHook func(event WatchEvent)

// Hub manages the lifecycle of WebSocket clients and broadcasts events to
// subscribers. It is safe for concurrent use.
type Hub struct {
	clients    map[string]*Client
	register   chan *Client
	unregister chan *Client
	broadcast  chan broadcastMsg
	mu         sync.RWMutex
	hooksMu    sync.RWMutex
	hooks      []EventHook
}

type broadcastMsg struct {
	subKey string
	data   []byte
}

// NewHub allocates and initialises a Hub. Call Run() in a goroutine to start
// the event loop.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		register:   make(chan *Client, 16),
		unregister: make(chan *Client, 16),
		broadcast:  make(chan broadcastMsg, 256),
	}
}

// Run is the hub's main event loop. It must be executed in a dedicated
// goroutine. It stops when all channels are drained and the process exits.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("ws: client %s registered (user=%s)", client.ID, client.UserID)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("ws: client %s unregistered", client.ID)

		case msg := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.clients {
				if client.IsSubscribed(msg.subKey) {
					select {
					case client.send <- msg.data:
					default:
						// Slow consumer: drop the message to avoid blocking.
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

// OnEvent registers a hook that is called for every WatchEvent broadcast
// through the hub. Hooks are called synchronously from BroadcastToSubscribers,
// so they should not block.
func (h *Hub) OnEvent(hook EventHook) {
	h.hooksMu.Lock()
	defer h.hooksMu.Unlock()
	h.hooks = append(h.hooks, hook)
}

// BroadcastToSubscribers encodes event as JSON and enqueues it for delivery
// to every client that has subscribed to the matching (cluster, resource,
// namespace) tuple. It also invokes any registered event hooks.
func (h *Hub) BroadcastToSubscribers(subKey string, event WatchEvent) {
	// Invoke hooks
	h.hooksMu.RLock()
	for _, hook := range h.hooks {
		hook(event)
	}
	h.hooksMu.RUnlock()

	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("ws: failed to marshal event: %v", err)
		return
	}
	h.broadcast <- broadcastMsg{subKey: subKey, data: data}
}

// Register enqueues a new client for addition to the hub.
func (h *Hub) Register(c *Client) {
	h.register <- c
}

// Unregister enqueues a client for removal from the hub.
func (h *Hub) Unregister(c *Client) {
	h.unregister <- c
}
