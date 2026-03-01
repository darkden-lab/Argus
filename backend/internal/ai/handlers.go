package ai

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     ws.CheckOrigin,
}

// ChatHandler handles WebSocket connections for AI chat.
type ChatHandler struct {
	service    *Service
	jwtService *auth.JWTService
	config     AIConfig
}

// NewChatHandler creates a new AI chat WebSocket handler.
func NewChatHandler(service *Service, jwtService *auth.JWTService, config AIConfig) *ChatHandler {
	return &ChatHandler{
		service:    service,
		jwtService: jwtService,
		config:     config,
	}
}

// RegisterRoutes wires the AI WebSocket and REST endpoints.
func (h *ChatHandler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/ws/ai/chat", h.ServeChat).Methods(http.MethodGet)
}

// ChatWSMessage is the JSON envelope for AI chat WebSocket messages.
type ChatWSMessage struct {
	Type           string      `json:"type"`            // "user_message", "confirm_action", "new_conversation", "load_history", "context_update"
	Content        string      `json:"content,omitempty"`
	ConversationID string      `json:"conversation_id,omitempty"`
	ConfirmationID string      `json:"confirmation_id,omitempty"`
	Approved       bool        `json:"approved,omitempty"`
	Context        ChatContext `json:"context,omitempty"`
}

// ChatWSResponse is sent from server to client.
type ChatWSResponse struct {
	Type           string `json:"type"`            // "assistant_message", "stream_delta", "stream_end", "confirm_request", "error", "conversation_created", "history_message", "history_end"
	Content        string `json:"content,omitempty"`
	Role           string `json:"role,omitempty"`
	Error          string `json:"error,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	ConfirmationID string `json:"confirmation_id,omitempty"`
	ToolName       string `json:"tool_name,omitempty"`
	ToolArgs       string `json:"tool_args,omitempty"`
}

// ServeChat upgrades to WebSocket for AI chat streaming.
func (h *ChatHandler) ServeChat(w http.ResponseWriter, r *http.Request) {
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

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	// Send an immediate status message so the frontend knows whether AI is usable
	if !h.config.Enabled {
		writeWSJSON(conn, ChatWSResponse{
			Type:    "error",
			Content: "AI assistant is not enabled. Please enable it in Settings > AI Configuration.",
			Error:   "not configured",
		})
		// Keep connection open so client can receive the error, then close gracefully
		conn.Close()
		return
	}
	if validErr := h.config.Validate(); validErr != nil {
		writeWSJSON(conn, ChatWSResponse{
			Type:    "error",
			Content: "AI provider is not fully configured: " + validErr.Error() + ". Update the configuration in Settings > AI Configuration.",
			Error:   "not configured",
		})
		conn.Close()
		return
	}

	var currentConversation string
	var currentContext ChatContext

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("ai chat: read error: %v", err)
			}
			return
		}

		var wsMsg ChatWSMessage
		if err := json.Unmarshal(msg, &wsMsg); err != nil {
			writeWSJSON(conn, ChatWSResponse{Type: "error", Content: "invalid message format", Error: "invalid message format"})
			continue
		}

		switch wsMsg.Type {
		case "user_message":
			if currentConversation == "" && wsMsg.ConversationID == "" {
				currentConversation = "temp-" + claims.UserID
			} else if wsMsg.ConversationID != "" {
				currentConversation = wsMsg.ConversationID
			}

			// Stream response
			stream, err := h.service.ProcessMessageStream(
				r.Context(), claims.UserID, currentConversation, wsMsg.Content, currentContext,
			)
			if err != nil {
				writeWSJSON(conn, ChatWSResponse{Type: "error", Content: err.Error(), Error: err.Error()})
				continue
			}

			for {
				delta, err := stream.Next()
				if err != nil {
					break
				}
				if delta.Content != "" {
					writeWSJSON(conn, ChatWSResponse{
						Type:    "stream_delta",
						Content: delta.Content,
					})
				}
				if delta.FinishReason != "" {
					break
				}
			}
			stream.Close()

			writeWSJSON(conn, ChatWSResponse{Type: "stream_end"})

		case "confirm_action":
			mgr := h.service.GetConfirmationManager()
			if wsMsg.Approved {
				_ = mgr.Approve(wsMsg.ConfirmationID)
			} else {
				_ = mgr.Reject(wsMsg.ConfirmationID)
			}

		case "context_update":
			currentContext = wsMsg.Context

		case "load_history":
			convID := wsMsg.ConversationID
			if convID == "" {
				convID = currentConversation
			}
			if convID == "" {
				writeWSJSON(conn, ChatWSResponse{Type: "error", Content: "no conversation_id provided", Error: "no conversation_id"})
				break
			}
			history, err := h.service.LoadHistory(r.Context(), convID)
			if err != nil {
				writeWSJSON(conn, ChatWSResponse{Type: "error", Content: "failed to load history: " + err.Error(), Error: err.Error()})
				break
			}
			for _, msg := range history {
				writeWSJSON(conn, ChatWSResponse{
					Type:           "history_message",
					Content:        msg.Content,
					Role:           string(msg.Role),
					ConversationID: convID,
				})
			}
			writeWSJSON(conn, ChatWSResponse{Type: "history_end", ConversationID: convID})
			currentConversation = convID

		case "new_conversation":
			currentConversation = ""
			writeWSJSON(conn, ChatWSResponse{Type: "conversation_created"})

		default:
			writeWSJSON(conn, ChatWSResponse{Type: "error", Content: "unknown message type", Error: "unknown message type"})
		}
	}
}

func writeWSJSON(conn *websocket.Conn, msg ChatWSResponse) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	conn.WriteMessage(websocket.TextMessage, data)
}
