package sse

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/ai"
	"github.com/darkden-lab/argus/backend/internal/ai/tools"
	"github.com/darkden-lab/argus/backend/internal/auth"
)

const (
	maxContentLen = 100 * 1024 // 100KB
	maxIDLen      = 256
)

// AIHandler handles AI chat via SSE (streaming) and REST (actions).
type AIHandler struct {
	hub           *Hub
	jwtService    *auth.JWTService
	apiKeyService *auth.APIKeyService
	aiService     *ai.Service
	historyStore  *ai.HistoryStore
	taskRunner    *ai.TaskRunner
}

// NewAIHandler creates a new AI SSE+REST handler.
func NewAIHandler(hub *Hub, jwtService *auth.JWTService, apiKeyService *auth.APIKeyService, aiService *ai.Service, historyStore *ai.HistoryStore, taskRunner *ai.TaskRunner) *AIHandler {
	return &AIHandler{
		hub:           hub,
		jwtService:    jwtService,
		apiKeyService: apiKeyService,
		aiService:     aiService,
		historyStore:  historyStore,
		taskRunner:    taskRunner,
	}
}

// RegisterRoutes registers AI SSE and REST endpoints.
func (h *AIHandler) RegisterRoutes(r *mux.Router, protected *mux.Router) {
	// SSE endpoint — auth handled internally (supports query param for EventSource)
	r.HandleFunc("/api/ai/stream", h.HandleStream).Methods(http.MethodGet)

	// REST endpoints — auth via middleware
	protected.HandleFunc("/api/ai/messages", h.HandleSendMessage).Methods(http.MethodPost)
	protected.HandleFunc("/api/ai/messages/confirm", h.HandleConfirmAction).Methods(http.MethodPost)
	protected.HandleFunc("/api/ai/context", h.HandleContextUpdate).Methods(http.MethodPost)
	protected.HandleFunc("/api/ai/tasks", h.HandleStartTask).Methods(http.MethodPost)
	protected.HandleFunc("/api/ai/tasks/{taskID}", h.HandleCancelTask).Methods(http.MethodDelete)
}

// HandleStream establishes an SSE connection for AI events.
func (h *AIHandler) HandleStream(w http.ResponseWriter, r *http.Request) {
	claims := RequireAuth(w, r, h.jwtService, h.apiKeyService)
	if claims == nil {
		return
	}

	// Check AI config
	_, config := h.aiService.Snapshot()
	if !config.Enabled {
		writeSSEError(w, "ai:error", "AI assistant is not enabled. Please enable it in Settings > AI Configuration.")
		return
	}
	if validErr := config.Validate(); validErr != nil {
		writeSSEError(w, "ai:error", "AI provider is not fully configured: "+validErr.Error()+". Update the configuration in Settings > AI Configuration.")
		return
	}

	client := h.hub.Register(claims.UserID, w)
	if client == nil {
		return
	}
	defer h.hub.Unregister(client.ID)

	log.Printf("sse/ai: user %s connected (client %s)", claims.UserID, client.ID)

	// Block until client disconnects
	<-r.Context().Done()
	log.Printf("sse/ai: user %s disconnected (client %s)", claims.UserID, client.ID)
}

type sendMessageRequest struct {
	Content        string                 `json:"content"`
	ConversationID string                 `json:"conversation_id"`
	Context        map[string]interface{} `json:"context"`
	AgentID        string                 `json:"agent_id"`
}

// HandleSendMessage handles POST /api/ai/messages — starts AI processing.
func (h *AIHandler) HandleSendMessage(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	userID := claims.UserID

	var req sendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate lengths
	if len(req.Content) > maxContentLen || len(req.ConversationID) > maxIDLen || len(req.AgentID) > maxIDLen {
		http.Error(w, `{"error":"input too long"}`, http.StatusBadRequest)
		return
	}
	if req.Content == "" {
		http.Error(w, `{"error":"content is required"}`, http.StatusBadRequest)
		return
	}

	// Build chat context
	var chatCtx ai.ChatContext
	if req.Context != nil {
		if cid, ok := req.Context["cluster_id"].(string); ok {
			chatCtx.ClusterID = cid
		}
		if ns, ok := req.Context["namespace"].(string); ok {
			chatCtx.Namespace = ns
		}
	}

	ctx := context.Background()

	// Verify conversation ownership if provided
	if req.ConversationID != "" && h.historyStore != nil {
		owned, ownerErr := h.historyStore.VerifyConversationOwnership(ctx, req.ConversationID, userID)
		if ownerErr != nil || !owned {
			http.Error(w, `{"error":"conversation not found"}`, http.StatusNotFound)
			return
		}
	}

	// Ensure conversation exists
	conversationID := req.ConversationID
	if conversationID == "" {
		if h.historyStore != nil {
			title := truncateForTitle(req.Content)
			if title == "" {
				title = "New conversation"
			}
			conv, err := h.historyStore.CreateConversation(ctx, userID, title, chatCtx.ClusterID, chatCtx.Namespace)
			if err != nil {
				log.Printf("sse/ai: failed to create conversation: %v", err)
				conversationID = "temp-" + userID
			} else {
				conversationID = conv.ID
				// Notify via SSE
				h.hub.SendToUser(userID, Event{
					Type: "ai:conversation_created",
					Data: map[string]interface{}{
						"conversation_id": conv.ID,
						"title":           conv.Title,
					},
				})
			}
		} else {
			conversationID = "temp-" + userID
		}
	}

	// Save user message
	h.aiService.SaveMessage(ctx, conversationID, ai.Message{Role: ai.RoleUser, Content: req.Content})

	// Return 202 immediately, process in background
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"conversation_id": conversationID,
		"status":          "processing",
	})

	// Process message in goroutine
	go h.processMessage(userID, conversationID, req.Content, chatCtx)
}

func (h *AIHandler) processMessage(userID, conversationID, content string, chatCtx ai.ChatContext) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("sse/ai: panic in processMessage: %v\n%s", r, debug.Stack())
			h.hub.SendToUser(userID, Event{Type: "ai:error", Data: map[string]string{"error": "internal error"}})
			h.hub.SendToUser(userID, Event{Type: "ai:stream_end", Data: map[string]interface{}{}})
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	stream, err := h.aiService.ProcessMessageStream(ctx, userID, conversationID, content, chatCtx)
	if err != nil {
		h.hub.SendToUser(userID, Event{Type: "ai:error", Data: map[string]string{"error": err.Error(), "content": err.Error()}})
		h.hub.SendToUser(userID, Event{Type: "ai:stream_end", Data: map[string]interface{}{}})
		return
	}

	// Consume stream
	var contentBuf string
	var accToolCalls []ai.ToolCall
	var finishReason string

	for {
		delta, err := stream.Next()
		if err != nil {
			break
		}
		if delta.Content != "" {
			contentBuf += delta.Content
			h.hub.SendToUser(userID, Event{Type: "ai:stream_delta", Data: map[string]string{"content": delta.Content}})
		}
		for _, tc := range delta.ToolCalls {
			if tc.ID != "" {
				accToolCalls = append(accToolCalls, tc)
			} else if len(accToolCalls) > 0 {
				last := &accToolCalls[len(accToolCalls)-1]
				last.Arguments += tc.Arguments
				if tc.Name != "" {
					last.Name = tc.Name
				}
			}
		}
		if delta.FinishReason != "" {
			finishReason = delta.FinishReason
			break
		}
	}
	stream.Close()

	// Filter valid tool calls
	var validToolCalls []ai.ToolCall
	for _, tc := range accToolCalls {
		if tc.Name != "" && tc.ID != "" {
			validToolCalls = append(validToolCalls, tc)
		}
	}

	// Execute tools if needed — with confirmation flow
	if finishReason == "tool_calls" && len(validToolCalls) > 0 {
		confirmNotify := func(req *tools.ConfirmationRequest) {
			h.hub.SendToUser(userID, Event{
				Type: "ai:confirm_request",
				Data: map[string]interface{}{
					"confirmation_id": req.ID,
					"tool_name":       req.ToolCall.Name,
					"tool_args":       req.ToolCall.Arguments,
					"content":         "Confirm action: " + req.ToolCall.Name,
				},
			})
		}

		resp, err := h.aiService.ExecuteToolsWithNotify(
			ctx, userID, conversationID, content, chatCtx, contentBuf, validToolCalls, confirmNotify,
		)
		if err != nil {
			h.hub.SendToUser(userID, Event{Type: "ai:error", Data: map[string]string{"error": err.Error(), "content": err.Error()}})
		} else {
			h.hub.SendToUser(userID, Event{Type: "ai:stream_delta", Data: map[string]string{"content": resp.Message.Content}})
			h.aiService.SaveMessage(ctx, conversationID, ai.Message{Role: ai.RoleAssistant, Content: resp.Message.Content})
		}
	} else if contentBuf != "" {
		h.aiService.SaveMessage(ctx, conversationID, ai.Message{Role: ai.RoleAssistant, Content: contentBuf})
	}

	h.hub.SendToUser(userID, Event{Type: "ai:stream_end", Data: map[string]interface{}{}})
}

type confirmRequest struct {
	ConfirmationID string `json:"confirmation_id"`
	Approved       bool   `json:"approved"`
}

// HandleConfirmAction handles POST /api/ai/messages/confirm.
func (h *AIHandler) HandleConfirmAction(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req confirmRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	mgr := h.aiService.GetConfirmationManager()
	var err error
	if req.Approved {
		err = mgr.Approve(req.ConfirmationID)
	} else {
		err = mgr.Reject(req.ConfirmationID)
	}
	if err != nil {
		log.Printf("sse/ai: confirm_action error for %s: %v", req.ConfirmationID, err)
		http.Error(w, `{"error":"failed to process confirmation: `+err.Error()+`"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

type contextUpdateRequest struct {
	ClusterID string `json:"cluster_id"`
	Namespace string `json:"namespace"`
}

// HandleContextUpdate handles POST /api/ai/context.
func (h *AIHandler) HandleContextUpdate(w http.ResponseWriter, r *http.Request) {
	// Context is now sent inline with each message, so this is a no-op
	// kept for API compatibility
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

type startTaskRequest struct {
	AgentID   string `json:"agent_id"`
	TaskTitle string `json:"task_title"`
	Content   string `json:"content"`
}

// HandleStartTask handles POST /api/ai/tasks.
func (h *AIHandler) HandleStartTask(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	userID := claims.UserID

	var req startTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if !h.aiService.HasAgentStore() {
		http.Error(w, `{"error":"agent system not available"}`, http.StatusServiceUnavailable)
		return
	}

	if req.AgentID == "" {
		http.Error(w, `{"error":"agent_id is required"}`, http.StatusBadRequest)
		return
	}

	if len(req.AgentID) > maxIDLen || len(req.TaskTitle) > maxContentLen || len(req.Content) > maxContentLen {
		http.Error(w, `{"error":"input exceeds maximum allowed length"}`, http.StatusBadRequest)
		return
	}

	ctx := context.Background()

	agent, err := h.aiService.GetAgent(ctx, req.AgentID)
	if err != nil {
		http.Error(w, `{"error":"agent not found"}`, http.StatusNotFound)
		return
	}

	title := req.TaskTitle
	if title == "" {
		title = req.Content
	}

	task := &ai.AgentTask{
		UserID:  userID,
		AgentID: req.AgentID,
		Title:   title,
		Status:  "pending",
	}
	if createErr := h.aiService.CreateTask(ctx, task); createErr != nil {
		http.Error(w, `{"error":"failed to create task: `+createErr.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	// Parse workflow steps
	var totalSteps int
	if len(agent.WorkflowSteps) > 0 {
		var steps []map[string]string
		if err := json.Unmarshal(agent.WorkflowSteps, &steps); err == nil {
			totalSteps = len(steps)
		}
	}

	// Notify via SSE
	h.hub.SendToUser(userID, Event{
		Type: "ai:task_created",
		Data: map[string]interface{}{
			"task_id":     task.ID,
			"agent_id":    agent.ID,
			"agent_name":  agent.Name,
			"title":       task.Title,
			"total_steps": totalSteps,
		},
	})

	// Run task in background
	if h.taskRunner != nil {
		progressCb := func(taskID string, progress int, step string, completedSteps int) {
			h.hub.SendToUser(userID, Event{
				Type: "ai:task_progress",
				Data: map[string]interface{}{
					"task_id":         taskID,
					"progress":        progress,
					"current_step":    step,
					"completed_steps": completedSteps,
				},
			})
		}
		completeCb := func(taskID string, result string) {
			h.hub.SendToUser(userID, Event{
				Type: "ai:task_completed",
				Data: map[string]interface{}{
					"task_id": taskID,
					"result":  result,
				},
			})
		}
		failCb := func(taskID string, errMsg string) {
			h.hub.SendToUser(userID, Event{
				Type: "ai:task_failed",
				Data: map[string]interface{}{
					"task_id": taskID,
					"error":   errMsg,
				},
			})
		}
		go h.taskRunner.RunTaskWithCallbacks(ctx, task, agent, userID, progressCb, completeCb, failCb)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"task_id":     task.ID,
		"status":      "pending",
		"total_steps": totalSteps,
	})
}

// HandleCancelTask handles DELETE /api/ai/tasks/{taskID}.
func (h *AIHandler) HandleCancelTask(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	userID := claims.UserID
	taskID := mux.Vars(r)["taskID"]

	if h.taskRunner == nil || !h.aiService.HasAgentStore() {
		http.Error(w, `{"error":"agent system not available"}`, http.StatusServiceUnavailable)
		return
	}

	store := h.aiService.GetAgentStore()
	if store == nil {
		http.Error(w, `{"error":"agent system not available"}`, http.StatusServiceUnavailable)
		return
	}

	task, err := store.GetTask(r.Context(), taskID)
	if err != nil || task.UserID != userID {
		http.Error(w, `{"error":"task not found"}`, http.StatusNotFound)
		return
	}

	h.taskRunner.CancelTask(taskID)

	h.hub.SendToUser(userID, Event{
		Type: "ai:task_cancelled",
		Data: map[string]interface{}{"task_id": taskID},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "cancelled"})
}

// truncateForTitle creates a short title from the first message content.
func truncateForTitle(content string) string {
	runes := []rune(content)
	if len(runes) <= 50 {
		return content
	}
	return string(runes[:47]) + "..."
}

// writeSSEError writes a single SSE error event and closes the connection.
func writeSSEError(w http.ResponseWriter, eventType, message string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, message, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	data, _ := json.Marshal(map[string]string{"error": "not configured", "content": message})
	//nolint:errcheck
	w.Write([]byte("event: " + eventType + "\ndata: " + string(data) + "\n\n"))
	flusher.Flush()
}
