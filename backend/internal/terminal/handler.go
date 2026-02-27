package terminal

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     ws.CheckOrigin,
}

// Handler manages terminal WebSocket connections.
type Handler struct {
	jwtService *auth.JWTService
	clusterMgr *cluster.Manager
	sessions   map[string]*Session
	mu         sync.RWMutex
}

// NewHandler creates a new terminal WebSocket handler.
func NewHandler(jwtService *auth.JWTService, clusterMgr *cluster.Manager) *Handler {
	return &Handler{
		jwtService: jwtService,
		clusterMgr: clusterMgr,
		sessions:   make(map[string]*Session),
	}
}

// RegisterRoutes wires the terminal WebSocket endpoint.
func (h *Handler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/ws/terminal", h.ServeTerminal).Methods(http.MethodGet)
}

// TerminalMessage is the JSON envelope exchanged over the terminal WebSocket.
type TerminalMessage struct {
	Type      string `json:"type"`                // "input", "output", "resize", "set_context", "error", "connected"
	Data      string `json:"data,omitempty"`       // command input or output text
	ClusterID string `json:"cluster_id,omitempty"` // target cluster
	Namespace string `json:"namespace,omitempty"`  // target namespace
	Mode      string `json:"mode,omitempty"`       // "smart" or "raw"
	Cols      int    `json:"cols,omitempty"`        // terminal columns (resize)
	Rows      int    `json:"rows,omitempty"`        // terminal rows (resize)
}

// ServeTerminal upgrades an HTTP GET /ws/terminal request to a WebSocket
// connection for interactive terminal access.
func (h *Handler) ServeTerminal(w http.ResponseWriter, r *http.Request) {
	// Authenticate via token query param or Authorization header
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
		return
	}

	session := NewSession(claims.UserID, conn, h.clusterMgr)
	h.addSession(session)

	// Extract cluster and namespace from query parameters (frontend sends these)
	clusterID := r.URL.Query().Get("cluster")
	namespace := r.URL.Query().Get("namespace")
	if clusterID != "" {
		session.SetContext(clusterID, namespace)
		log.Printf("terminal: session %s initial context cluster=%s namespace=%s", session.ID, clusterID, namespace)
	}

	// Send connected confirmation
	h.sendMessage(conn, TerminalMessage{
		Type: "connected",
		Data: "Terminal session established",
	})

	go h.readPump(session)
	go h.writePump(session)
}

func (h *Handler) readPump(s *Session) {
	defer func() {
		h.removeSession(s.ID)
		s.Close()
	}()

	s.conn.SetReadLimit(16384) // 16KB max per message
	for {
		_, msg, err := s.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("terminal: session %s read error: %v", s.ID, err)
			}
			return
		}

		var tm TerminalMessage
		if err := json.Unmarshal(msg, &tm); err != nil {
			h.sendToSession(s, TerminalMessage{Type: "error", Data: "invalid message format"})
			continue
		}

		switch tm.Type {
		case "input":
			s.HandleInput(tm.Data)
		case "resize":
			s.HandleResize(tm.Cols, tm.Rows)
		case "set_context":
			s.SetContext(tm.ClusterID, tm.Namespace)
			h.sendToSession(s, TerminalMessage{
				Type:      "output",
				Data:      "Context set to cluster=" + tm.ClusterID + " namespace=" + tm.Namespace + "\r\n",
				ClusterID: tm.ClusterID,
				Namespace: tm.Namespace,
			})
		default:
			h.sendToSession(s, TerminalMessage{Type: "error", Data: "unknown message type: " + tm.Type})
		}
	}
}

func (h *Handler) writePump(s *Session) {
	defer s.conn.Close()

	for msg := range s.output {
		data, err := json.Marshal(msg)
		if err != nil {
			log.Printf("terminal: session %s marshal error: %v", s.ID, err)
			continue
		}
		if err := s.conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("terminal: session %s write error: %v", s.ID, err)
			return
		}
	}
}

func (h *Handler) addSession(s *Session) {
	h.mu.Lock()
	h.sessions[s.ID] = s
	h.mu.Unlock()
	log.Printf("terminal: session %s created for user %s", s.ID, s.UserID)
}

func (h *Handler) removeSession(id string) {
	h.mu.Lock()
	delete(h.sessions, id)
	h.mu.Unlock()
	log.Printf("terminal: session %s removed", id)
}

func (h *Handler) sendToSession(s *Session, msg TerminalMessage) {
	select {
	case s.output <- msg:
	default:
		log.Printf("terminal: session %s output channel full, dropping message", s.ID)
	}
}

func (h *Handler) sendMessage(conn *websocket.Conn, msg TerminalMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	conn.WriteMessage(websocket.TextMessage, data)
}
