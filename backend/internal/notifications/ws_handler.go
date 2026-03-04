package notifications

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

var notifUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     ws.CheckOrigin,
}

// SocketIOBroadcastFunc sends data to a specific user via Socket.IO.
type SocketIOBroadcastFunc func(userID string, data []byte)

// SocketIOBroadcastAllFunc sends data to all connected Socket.IO clients.
type SocketIOBroadcastAllFunc func(data []byte)

// WSHandler manages real-time notification delivery via WebSocket and Socket.IO.
type WSHandler struct {
	jwtService          *auth.JWTService
	mu                  sync.RWMutex
	clients             map[string]map[*websocket.Conn]struct{} // userID -> set of connections
	sioBroadcast        SocketIOBroadcastFunc
	sioBroadcastAll     SocketIOBroadcastAllFunc
}

// NewWSHandler creates a new notifications WebSocket handler.
func NewWSHandler(jwtService *auth.JWTService) *WSHandler {
	return &WSHandler{
		jwtService: jwtService,
		clients:    make(map[string]map[*websocket.Conn]struct{}),
	}
}

// RegisterRoutes wires the notifications WebSocket endpoint.
func (h *WSHandler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/ws/notifications", h.ServeWS).Methods(http.MethodGet)
}

// ServeWS upgrades to WebSocket for real-time notification push.
func (h *WSHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		authHeader := r.Header.Get("Authorization")
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
			token = parts[1]
		}
	}

	if token == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	claims, err := h.jwtService.ValidateToken(token)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := notifUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	h.addClient(claims.UserID, conn)
	log.Printf("notifications ws: user %s connected", claims.UserID)

	// Read pump — keep connection alive and detect disconnects
	go func() {
		defer func() {
			h.removeClient(claims.UserID, conn)
			conn.Close()
			log.Printf("notifications ws: user %s disconnected", claims.UserID)
		}()

		conn.SetReadLimit(512)
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("notifications ws: user %s read error: %v", claims.UserID, err)
				}
				return
			}
		}
	}()
}

// SetSocketIOBroadcast sets the Socket.IO broadcast function for targeted user notifications.
func (h *WSHandler) SetSocketIOBroadcast(fn SocketIOBroadcastFunc) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sioBroadcast = fn
}

// SetSocketIOBroadcastAll sets the Socket.IO broadcast-all function for system-wide notifications.
func (h *WSHandler) SetSocketIOBroadcastAll(fn SocketIOBroadcastAllFunc) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.sioBroadcastAll = fn
}

// Broadcast sends a notification to all connections (WebSocket + Socket.IO) for a given user.
func (h *WSHandler) Broadcast(userID string, notification Notification) {
	data, err := json.Marshal(notification)
	if err != nil {
		return
	}

	h.mu.RLock()
	conns := h.clients[userID]
	sioBroadcast := h.sioBroadcast
	h.mu.RUnlock()

	// Legacy WebSocket clients
	for conn := range conns {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("notifications ws: write error for user %s: %v", userID, err)
			h.removeClient(userID, conn)
			conn.Close()
		}
	}

	// Socket.IO clients
	if sioBroadcast != nil {
		sioBroadcast(userID, data)
	}
}

// BroadcastAll sends a notification to all connected users (system-wide alerts).
func (h *WSHandler) BroadcastAll(notification Notification) {
	data, err := json.Marshal(notification)
	if err != nil {
		return
	}

	h.mu.RLock()
	sioBroadcastAll := h.sioBroadcastAll
	h.mu.RUnlock()

	// Legacy WebSocket clients
	h.mu.RLock()
	for _, conns := range h.clients {
		for conn := range conns {
			if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
				conn.Close()
			}
		}
	}
	h.mu.RUnlock()

	// Socket.IO clients
	if sioBroadcastAll != nil {
		sioBroadcastAll(data)
	}
}

func (h *WSHandler) addClient(userID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[userID] == nil {
		h.clients[userID] = make(map[*websocket.Conn]struct{})
	}
	h.clients[userID][conn] = struct{}{}
}

func (h *WSHandler) removeClient(userID string, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if conns, ok := h.clients[userID]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(h.clients, userID)
		}
	}
}
