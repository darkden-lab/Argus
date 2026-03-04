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
}

// NewChatHandler creates a new AI chat WebSocket handler.
func NewChatHandler(service *Service, jwtService *auth.JWTService) *ChatHandler {
	return &ChatHandler{
		service:    service,
		jwtService: jwtService,
	}
}

// RegisterRoutes wires the AI WebSocket and REST endpoints.
func (h *ChatHandler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/ws/ai/chat", h.ServeChat).Methods(http.MethodGet)
}

// ChatWSMessage is the JSON envelope for AI chat WebSocket messages.
type ChatWSMessage struct {
	Type           string      `json:"type"`            // "user_message", "confirm_action", "new_conversation", "load_history", "context_update", "select_agent", "start_task", "cancel_task"
	Content        string      `json:"content,omitempty"`
	ConversationID string      `json:"conversation_id,omitempty"`
	ConfirmationID string      `json:"confirmation_id,omitempty"`
	Approved       bool        `json:"approved,omitempty"`
	Context        ChatContext `json:"context,omitempty"`
	AgentID        string      `json:"agent_id,omitempty"`
	TaskID         string      `json:"task_id,omitempty"`
	TaskTitle      string      `json:"task_title,omitempty"`
}

// ChatWSResponse is sent from server to client.
type ChatWSResponse struct {
	Type           string `json:"type"`            // "assistant_message", "stream_delta", "stream_end", "confirm_request", "error", "conversation_created", "history_message", "history_end", "agent_selected", "task_created", "task_progress", "task_completed", "task_failed"
	Content        string `json:"content,omitempty"`
	Role           string `json:"role,omitempty"`
	Error          string `json:"error,omitempty"`
	ConversationID string `json:"conversation_id,omitempty"`
	ConfirmationID string `json:"confirmation_id,omitempty"`
	ToolName       string `json:"tool_name,omitempty"`
	ToolArgs       string `json:"tool_args,omitempty"`
	AgentID        string `json:"agent_id,omitempty"`
	AgentName      string `json:"agent_name,omitempty"`
	TaskID         string `json:"task_id,omitempty"`
	Progress       int    `json:"progress,omitempty"`
	CurrentStep    string `json:"current_step,omitempty"`
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

	// Read the current config from the service so runtime changes are picked up
	_, config := h.service.Snapshot()

	// Send an immediate status message so the frontend knows whether AI is usable
	if !config.Enabled {
		writeWSJSON(conn, ChatWSResponse{
			Type:    "error",
			Content: "AI assistant is not enabled. Please enable it in Settings > AI Configuration.",
			Error:   "not configured",
		})
		conn.Close()
		return
	}
	if validErr := config.Validate(); validErr != nil {
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
	var currentAgent *Agent

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

			// Allow selecting agent inline with the message
			if wsMsg.AgentID != "" && h.service.agentStore != nil {
				agent, agentErr := h.service.agentStore.GetByID(r.Context(), wsMsg.AgentID)
				if agentErr == nil {
					currentAgent = agent
				}
			}

			// Update context from user message if provided
			if wsMsg.Context.ClusterID != "" || wsMsg.Context.Namespace != "" {
				currentContext = wsMsg.Context
			}

			// Stream response, handling tool call loops
			stream, err := h.service.ProcessMessageStream(
				r.Context(), claims.UserID, currentConversation, wsMsg.Content, currentContext,
			)
			if err != nil {
				writeWSJSON(conn, ChatWSResponse{Type: "error", Content: err.Error(), Error: err.Error()})
				continue
			}

			// Consume stream, accumulating content and tool calls
			var contentBuf string
			var accToolCalls []ToolCall
			var finishReason string
			for {
				delta, err := stream.Next()
				if err != nil {
					break
				}
				if delta.Content != "" {
					contentBuf += delta.Content
					writeWSJSON(conn, ChatWSResponse{
						Type:    "stream_delta",
						Content: delta.Content,
					})
				}
				for _, tc := range delta.ToolCalls {
					merged := false
					for i := range accToolCalls {
						if accToolCalls[i].ID != "" && tc.ID == accToolCalls[i].ID {
							accToolCalls[i].Arguments += tc.Arguments
							if tc.Name != "" {
								accToolCalls[i].Name = tc.Name
							}
							merged = true
							break
						}
					}
					if !merged && tc.ID != "" {
						accToolCalls = append(accToolCalls, tc)
					}
				}
				if delta.FinishReason != "" {
					finishReason = delta.FinishReason
					break
				}
			}
			stream.Close()

			// Filter out tool calls with empty name or ID (streaming artifacts)
			var validToolCalls []ToolCall
			for _, tc := range accToolCalls {
				if tc.Name != "" && tc.ID != "" {
					validToolCalls = append(validToolCalls, tc)
				}
			}

			// If the LLM wants to call tools, execute them and re-invoke
			if finishReason == "tool_calls" && len(validToolCalls) > 0 {
				resp, err := h.service.ExecuteToolsAndRespond(
					r.Context(), claims.UserID, currentConversation, wsMsg.Content, currentContext, contentBuf, validToolCalls,
				)
				if err != nil {
					writeWSJSON(conn, ChatWSResponse{Type: "error", Content: err.Error(), Error: err.Error()})
				} else {
					writeWSJSON(conn, ChatWSResponse{
						Type:    "stream_delta",
						Content: resp.Message.Content,
					})
				}
			}

			writeWSJSON(conn, ChatWSResponse{Type: "stream_end"})

		case "select_agent":
			if wsMsg.AgentID == "" {
				// Deselect agent — return to default assistant
				currentAgent = nil
				currentConversation = ""
				writeWSJSON(conn, ChatWSResponse{
					Type:    "agent_selected",
					AgentID: "",
				})
				break
			}
			if h.service.agentStore == nil {
				writeWSJSON(conn, ChatWSResponse{Type: "error", Content: "agent system not available", Error: "agent system not available"})
				break
			}
			agent, agentErr := h.service.agentStore.GetByID(r.Context(), wsMsg.AgentID)
			if agentErr != nil {
				writeWSJSON(conn, ChatWSResponse{Type: "error", Content: "agent not found", Error: "agent not found"})
				break
			}
			currentAgent = agent
			currentConversation = "" // start fresh conversation with this agent
			writeWSJSON(conn, ChatWSResponse{
				Type:      "agent_selected",
				AgentID:   agent.ID,
				AgentName: agent.Name,
			})

		case "start_task":
			if h.service.agentStore == nil {
				writeWSJSON(conn, ChatWSResponse{Type: "error", Content: "agent system not available", Error: "agent system not available"})
				break
			}
			agentID := wsMsg.AgentID
			if agentID == "" && currentAgent != nil {
				agentID = currentAgent.ID
			}
			if agentID == "" {
				writeWSJSON(conn, ChatWSResponse{Type: "error", Content: "no agent selected for task", Error: "no agent"})
				break
			}
			agent, agentErr := h.service.agentStore.GetByID(r.Context(), agentID)
			if agentErr != nil {
				writeWSJSON(conn, ChatWSResponse{Type: "error", Content: "agent not found", Error: "agent not found"})
				break
			}
			task := &AgentTask{
				UserID:  claims.UserID,
				AgentID: agentID,
				Title:   wsMsg.TaskTitle,
				Status:  "pending",
			}
			if task.Title == "" {
				task.Title = wsMsg.Content
			}
			if createErr := h.service.agentStore.CreateTask(r.Context(), task); createErr != nil {
				writeWSJSON(conn, ChatWSResponse{Type: "error", Content: "failed to create task: " + createErr.Error(), Error: createErr.Error()})
				break
			}
			writeWSJSON(conn, ChatWSResponse{
				Type:      "task_created",
				TaskID:    task.ID,
				AgentID:   agent.ID,
				AgentName: agent.Name,
			})

		case "cancel_task":
			writeWSJSON(conn, ChatWSResponse{
				Type:   "task_completed",
				TaskID: wsMsg.TaskID,
			})

			// Suppress unused variable warning for currentAgent
			_ = currentAgent

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
