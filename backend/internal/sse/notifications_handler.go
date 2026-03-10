package sse

import (
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/notifications"
)

// NotificationsHandler handles real-time notifications via SSE.
type NotificationsHandler struct {
	hub           *Hub
	jwtService    *auth.JWTService
	apiKeyService *auth.APIKeyService
}

// NewNotificationsHandler creates a new notifications SSE handler and wires
// SSE broadcast functions into the notifications WSHandler.
func NewNotificationsHandler(hub *Hub, jwtService *auth.JWTService, apiKeyService *auth.APIKeyService, notifWSHandler *notifications.WSHandler) *NotificationsHandler {
	h := &NotificationsHandler{
		hub:           hub,
		jwtService:    jwtService,
		apiKeyService: apiKeyService,
	}

	// Wire SSE broadcast into notifications system (replaces Socket.IO broadcast)
	notifWSHandler.SetSSEBroadcast(func(userID string, data []byte) {
		hub.SendToUser(userID, Event{Type: "notify:new", Data: jsonRawCompat(data)})
	})
	notifWSHandler.SetSSEBroadcastAll(func(data []byte) {
		hub.Broadcast(Event{Type: "notify:new", Data: jsonRawCompat(data)})
	})

	return h
}

// RegisterRoutes registers the notifications SSE endpoint.
func (h *NotificationsHandler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/notifications/stream", h.HandleStream).Methods(http.MethodGet)
}

// HandleStream establishes an SSE connection for real-time notifications.
func (h *NotificationsHandler) HandleStream(w http.ResponseWriter, r *http.Request) {
	claims := RequireAuth(w, r, h.jwtService, h.apiKeyService)
	if claims == nil {
		return
	}

	client := h.hub.Register(claims.UserID, w)
	if client == nil {
		return
	}
	defer h.hub.Unregister(client.ID)

	log.Printf("sse/notifications: user %s connected (client %s)", claims.UserID, client.ID)
	<-r.Context().Done()
	log.Printf("sse/notifications: user %s disconnected (client %s)", claims.UserID, client.ID)
}

// jsonRawCompat wraps raw JSON bytes so they pass through json.Marshal unchanged.
type jsonRawCompat []byte

func (j jsonRawCompat) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	return j, nil
}
