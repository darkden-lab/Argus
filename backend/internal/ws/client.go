package ws

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	// writeWait is the maximum time allowed to write a message to the peer.
	writeWait = 10 * time.Second
	// pongWait is the maximum time to wait for a pong reply from the peer.
	pongWait = 60 * time.Second
	// pingPeriod must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10
	// maxMessageSize is the maximum inbound message size in bytes.
	maxMessageSize = 4096
)

// controlMessage is the JSON envelope sent by the frontend to subscribe or
// unsubscribe from a K8s resource watch stream.
type controlMessage struct {
	Action    string `json:"action"`    // "subscribe" | "unsubscribe"
	Cluster   string `json:"cluster"`   // cluster ID
	Resource  string `json:"resource"`  // e.g. "pods", "deployments"
	Namespace string `json:"namespace"` // "" means all namespaces
}

// Client represents a single WebSocket connection.
type Client struct {
	ID            string
	UserID        string
	conn          *websocket.Conn
	subscriptions map[string]bool
	subMu         sync.RWMutex
	send          chan []byte
	hub           *Hub
}

// NewClient creates a Client and registers it with the hub.
func NewClient(hub *Hub, conn *websocket.Conn, userID string) *Client {
	return &Client{
		ID:            uuid.New().String(),
		UserID:        userID,
		conn:          conn,
		subscriptions: make(map[string]bool),
		send:          make(chan []byte, 256),
		hub:           hub,
	}
}

// IsSubscribed reports whether this client is subscribed to subKey.
func (c *Client) IsSubscribed(subKey string) bool {
	c.subMu.RLock()
	defer c.subMu.RUnlock()
	return c.subscriptions[subKey]
}

// ReadPump pumps messages from the WebSocket connection to the hub.
// It runs in its own goroutine per client and handles subscribe / unsubscribe
// control messages sent by the frontend.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ws: client %s read error: %v", c.ID, err)
			}
			break
		}

		var cm controlMessage
		if err := json.Unmarshal(msg, &cm); err != nil {
			log.Printf("ws: client %s sent invalid control message: %v", c.ID, err)
			continue
		}

		key := subscriptionKey(cm.Cluster, cm.Resource, cm.Namespace)
		switch cm.Action {
		case "subscribe":
			c.subMu.Lock()
			c.subscriptions[key] = true
			c.subMu.Unlock()
			log.Printf("ws: client %s subscribed to %s", c.ID, key)
		case "unsubscribe":
			c.subMu.Lock()
			delete(c.subscriptions, key)
			c.subMu.Unlock()
			log.Printf("ws: client %s unsubscribed from %s", c.ID, key)
		default:
			log.Printf("ws: client %s unknown action %q", c.ID, cm.Action)
		}
	}
}

// WritePump pumps messages from the hub's send channel to the WebSocket
// connection. It runs in its own goroutine per client.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
