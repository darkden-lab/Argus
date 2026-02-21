package ws

import (
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/darkden-lab/argus/backend/internal/auth"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     CheckOrigin,
}

// WSHandler upgrades HTTP connections to WebSocket and spawns the read/write
// pumps for the new client.
type WSHandler struct {
	hub        *Hub
	jwtService *auth.JWTService
}

func NewWSHandler(hub *Hub, jwtService *auth.JWTService) *WSHandler {
	return &WSHandler{hub: hub, jwtService: jwtService}
}

// RegisterRoutes wires the WebSocket endpoint.
func (h *WSHandler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/ws", h.ServeWS).Methods(http.MethodGet)
}

// ServeWS upgrades an HTTP GET /ws request to a WebSocket connection.
// Authentication is performed by reading the JWT from:
//  1. The `token` query parameter, or
//  2. The `Authorization: Bearer <token>` header.
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

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// upgrader already wrote the error response.
		return
	}

	client := NewClient(h.hub, conn, claims.UserID)
	h.hub.Register(client)

	go client.WritePump()
	go client.ReadPump()
}
