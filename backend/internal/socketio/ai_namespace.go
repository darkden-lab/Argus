package socketio

import (
	"context"
	"encoding/json"
	"log"
	"runtime/debug"
	"sync"
	"time"

	"github.com/zishang520/socket.io/v2/socket"
	"github.com/darkden-lab/argus/backend/internal/ai"
	"github.com/darkden-lab/argus/backend/internal/ai/tools"
	"github.com/darkden-lab/argus/backend/internal/auth"
)

const (
	maxContentLen = 100 * 1024 // 100KB
	maxIDLen      = 256
)

func validateStringLen(s string, max int) bool {
	return len(s) <= max
}

// registerAINamespace sets up the /ai namespace for AI chat streaming.
func registerAINamespace(io *socket.Server, jwtService *auth.JWTService, apiKeyService *auth.APIKeyService, aiService *ai.Service, historyStore *ai.HistoryStore, taskRunner *ai.TaskRunner) {
	nsp := io.Of("/ai", nil)
	nsp.Use(authMiddleware(jwtService, apiKeyService))

	_ = nsp.On("connection", func(clients ...interface{}) {
		client := clients[0].(*socket.Socket)
		claims := getClaims(client)
		if claims == nil {
			client.Disconnect(true)
			return
		}
		userID := claims.UserID
		log.Printf("socketio/ai: user %s connected", userID)

		// Per-connection state (mutex-protected)
		var mu sync.Mutex
		var currentConversation string
		var currentContext ai.ChatContext
		var currentAgent *ai.Agent
		connCtx, connCancel := context.WithCancel(context.Background())
		ctx := connCtx

		// Check AI config on connect
		_, config := aiService.Snapshot()
		if !config.Enabled {
			_ = client.Emit("ai_error", map[string]string{
				"error":   "not configured",
				"content": "AI assistant is not enabled. Please enable it in Settings > AI Configuration.",
			})
			connCancel()
			client.Disconnect(true)
			return
		}
		if validErr := config.Validate(); validErr != nil {
			_ = client.Emit("ai_error", map[string]string{
				"error":   "not configured",
				"content": "AI provider is not fully configured: " + validErr.Error() + ". Update the configuration in Settings > AI Configuration.",
			})
			connCancel()
			client.Disconnect(true)
			return
		}

		// Helper: ensure a DB conversation exists, creating one if needed.
		ensureConversation := func(title string) string {
			mu.Lock()
			defer mu.Unlock()
			if currentConversation != "" {
				return currentConversation
			}
			if historyStore == nil {
				// No DB — use a temp ID (messages won't persist)
				currentConversation = "temp-" + userID
				return currentConversation
			}
			if title == "" {
				title = "New conversation"
			}
			conv, err := historyStore.CreateConversation(ctx, userID, title, currentContext.ClusterID, currentContext.Namespace)
			if err != nil {
				log.Printf("socketio/ai: failed to create conversation: %v", err)
				currentConversation = "temp-" + userID
				return currentConversation
			}
			currentConversation = conv.ID
			// Notify frontend of the real conversation_id
			_ = client.Emit("conversation_created", map[string]interface{}{
				"conversation_id": conv.ID,
				"title":           conv.Title,
			})
			return conv.ID
		}

		// ---------- user_message ----------
		_ = client.On("user_message", func(args ...interface{}) {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("socketio/ai: panic in user_message handler: %v\n%s", r, debug.Stack())
					_ = client.Emit("ai_error", map[string]string{"error": "internal error"})
					_ = client.Emit("stream_end", map[string]interface{}{})
				}
			}()

			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			content, _ := data["content"].(string)
			convID, _ := data["conversation_id"].(string)
			agentID, _ := data["agent_id"].(string)

			// Validate input lengths
			if !validateStringLen(content, maxContentLen) || !validateStringLen(convID, maxIDLen) || !validateStringLen(agentID, maxIDLen) {
				_ = client.Emit("ai_error", map[string]string{"error": "input too long"})
				_ = client.Emit("stream_end", map[string]interface{}{})
				return
			}

			// Update context from message
			if ctxData, ok := data["context"].(map[string]interface{}); ok {
				mu.Lock()
				if cid, ok := ctxData["cluster_id"].(string); ok && cid != "" {
					currentContext.ClusterID = cid
				}
				if ns, ok := ctxData["namespace"].(string); ok && ns != "" {
					currentContext.Namespace = ns
				}
				mu.Unlock()
			}

			// Set conversation from client or auto-create
			if convID != "" {
				// C1: Verify the user owns this conversation before accepting it
				if historyStore != nil {
					owned, ownerErr := historyStore.VerifyConversationOwnership(ctx, convID, userID)
					if ownerErr != nil || !owned {
						_ = client.Emit("ai_error", map[string]string{"error": "conversation not found"})
						_ = client.Emit("stream_end", map[string]interface{}{})
						return
					}
				}
				mu.Lock()
				currentConversation = convID
				mu.Unlock()
			}
			activeConv := ensureConversation(truncateForTitle(content))

			// Allow selecting agent inline
			if agentID != "" && aiService.HasAgentStore() {
				agent, err := aiService.GetAgent(ctx, agentID)
				if err == nil {
					mu.Lock()
					currentAgent = agent
					mu.Unlock()
				}
			}

			// Save user message to DB before streaming
			aiService.SaveMessage(ctx, activeConv, ai.Message{Role: ai.RoleUser, Content: content})

			// Stream response with timeout
			streamCtx, streamCancel := context.WithTimeout(ctx, 2*time.Minute)
			defer streamCancel()

			mu.Lock()
			chatCtx := currentContext
			mu.Unlock()

			stream, err := aiService.ProcessMessageStream(
				streamCtx, userID, activeConv, content, chatCtx,
			)
			if err != nil {
				_ = client.Emit("ai_error", map[string]string{"error": err.Error(), "content": err.Error()})
				_ = client.Emit("stream_end", map[string]interface{}{})
				return
			}

			// Consume stream with per-chunk timeout
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
					if emitErr := client.Emit("stream_delta", map[string]string{"content": delta.Content}); emitErr != nil {
						log.Printf("socketio/ai: emit stream_delta failed: %v", emitErr)
						stream.Close()
						_ = client.Emit("ai_error", map[string]string{"error": "stream interrupted"})
						_ = client.Emit("stream_end", map[string]interface{}{})
						return
					}
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
				// Use ExecuteToolsWithNotify so confirm_request is emitted BEFORE blocking
				confirmNotify := func(req *tools.ConfirmationRequest) {
					_ = client.Emit("confirm_request", map[string]interface{}{
						"confirmation_id": req.ID,
						"tool_name":       req.ToolCall.Name,
						"tool_args":       req.ToolCall.Arguments,
						"content":         "Confirm action: " + req.ToolCall.Name,
					})
				}

				resp, err := aiService.ExecuteToolsWithNotify(
					streamCtx, userID, activeConv, content, chatCtx, contentBuf, validToolCalls, confirmNotify,
				)
				if err != nil {
					_ = client.Emit("ai_error", map[string]string{"error": err.Error(), "content": err.Error()})
				} else {
					_ = client.Emit("stream_delta", map[string]string{"content": resp.Message.Content})
					// Save assistant response (tool result) to DB
					aiService.SaveMessage(ctx, activeConv, ai.Message{Role: ai.RoleAssistant, Content: resp.Message.Content})
				}
			} else if contentBuf != "" {
				// Save assistant text response to DB
				aiService.SaveMessage(ctx, activeConv, ai.Message{Role: ai.RoleAssistant, Content: contentBuf})
			}

			_ = client.Emit("stream_end", map[string]interface{}{})
		})

		// ---------- select_agent ----------
		_ = client.On("select_agent", recoverHandler(client, "select_agent", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			agentID, _ := data["agent_id"].(string)

			if !validateStringLen(agentID, maxIDLen) {
				_ = client.Emit("ai_error", map[string]string{"error": "input exceeds maximum allowed length"})
				return
			}

			if agentID == "" {
				mu.Lock()
				currentAgent = nil
				currentConversation = ""
				mu.Unlock()
				_ = client.Emit("agent_selected", map[string]string{"agent_id": ""})
				return
			}

			if !aiService.HasAgentStore() {
				_ = client.Emit("ai_error", map[string]string{"error": "agent system not available"})
				return
			}

			agent, err := aiService.GetAgent(ctx, agentID)
			if err != nil {
				_ = client.Emit("ai_error", map[string]string{"error": "agent not found"})
				return
			}
			mu.Lock()
			currentAgent = agent
			currentConversation = ""
			mu.Unlock()
			_ = client.Emit("agent_selected", map[string]interface{}{
				"agent_id":   agent.ID,
				"agent_name": agent.Name,
			})
		}))

		// ---------- start_task ----------
		_ = client.On("start_task", recoverHandler(client, "start_task", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}

			if !aiService.HasAgentStore() {
				_ = client.Emit("ai_error", map[string]string{"error": "agent system not available"})
				return
			}

			agentID, _ := data["agent_id"].(string)
			mu.Lock()
			if agentID == "" && currentAgent != nil {
				agentID = currentAgent.ID
			}
			mu.Unlock()
			if agentID == "" {
				_ = client.Emit("ai_error", map[string]string{"error": "no agent selected for task"})
				return
			}

			agent, err := aiService.GetAgent(ctx, agentID)
			if err != nil {
				_ = client.Emit("ai_error", map[string]string{"error": "agent not found"})
				return
			}

			title, _ := data["task_title"].(string)
			msgContent, _ := data["content"].(string)

			if !validateStringLen(agentID, maxIDLen) || !validateStringLen(title, maxContentLen) || !validateStringLen(msgContent, maxContentLen) {
				_ = client.Emit("ai_error", map[string]string{"error": "input exceeds maximum allowed length"})
				return
			}

			if title == "" {
				title = msgContent
			}

			task := &ai.AgentTask{
				UserID:  userID,
				AgentID: agentID,
				Title:   title,
				Status:  "pending",
			}
			if createErr := aiService.CreateTask(ctx, task); createErr != nil {
				_ = client.Emit("ai_error", map[string]string{"error": "failed to create task: " + createErr.Error()})
				return
			}

			// Parse workflow steps count for total_steps
			var totalSteps int
			if len(agent.WorkflowSteps) > 0 {
				var steps []map[string]string
				if err := json.Unmarshal(agent.WorkflowSteps, &steps); err == nil {
					totalSteps = len(steps)
				}
			}
			_ = client.Emit("task_created", map[string]interface{}{
				"task_id":     task.ID,
				"agent_id":    agent.ID,
				"agent_name":  agent.Name,
				"title":       task.Title,
				"total_steps": totalSteps,
			})

			// Actually start the task execution in a goroutine
			if taskRunner != nil {
				progressCb := func(taskID string, progress int, step string, completedSteps int) {
					_ = client.Emit("task_progress", map[string]interface{}{
						"task_id":         taskID,
						"progress":        progress,
						"current_step":    step,
						"completed_steps": completedSteps,
					})
				}
				completeCb := func(taskID string, result string) {
					_ = client.Emit("task_completed", map[string]interface{}{
						"task_id": taskID,
						"result":  result,
					})
				}
				failCb := func(taskID string, errMsg string) {
					_ = client.Emit("task_failed", map[string]interface{}{
						"task_id": taskID,
						"error":   errMsg,
					})
				}

				go taskRunner.RunTaskWithCallbacks(context.Background(), task, agent, userID, progressCb, completeCb, failCb)
			}
		}))

		// ---------- cancel_task ----------
		_ = client.On("cancel_task", recoverHandler(client, "cancel_task", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			taskID, _ := data["task_id"].(string)

			// Verify task ownership before cancelling
			if taskRunner != nil && taskID != "" {
				store := aiService.GetAgentStore()
				if store == nil {
					_ = client.Emit("ai_error", map[string]string{"error": "agent system not available"})
					return
				}
				task, err := store.GetTask(ctx, taskID)
				if err != nil || task.UserID != userID {
					_ = client.Emit("ai_error", map[string]string{"error": "task not found"})
					return
				}
				taskRunner.CancelTask(taskID)
			}
			_ = client.Emit("task_cancelled", map[string]interface{}{
				"task_id": taskID,
			})
		}))

		// ---------- confirm_action ----------
		_ = client.On("confirm_action", recoverHandler(client, "confirm_action", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			confirmID, _ := data["confirmation_id"].(string)
			approved, _ := data["approved"].(bool)

			mgr := aiService.GetConfirmationManager()
			var err error
			if approved {
				err = mgr.Approve(confirmID)
			} else {
				err = mgr.Reject(confirmID)
			}
			if err != nil {
				log.Printf("socketio/ai: confirm_action error for %s: %v", confirmID, err)
				_ = client.Emit("ai_error", map[string]string{
					"error": "Failed to process confirmation: " + err.Error(),
				})
			}
		}))

		// ---------- context_update ----------
		_ = client.On("context_update", recoverHandler(client, "context_update", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			if ctxData, ok := data["context"].(map[string]interface{}); ok {
				if cid, ok := ctxData["cluster_id"].(string); ok {
					currentContext.ClusterID = cid
				}
				if ns, ok := ctxData["namespace"].(string); ok {
					currentContext.Namespace = ns
				}
			} else {
				if cid, ok := data["cluster_id"].(string); ok {
					currentContext.ClusterID = cid
				}
				if ns, ok := data["namespace"].(string); ok {
					currentContext.Namespace = ns
				}
			}
		}))

		// ---------- load_history ----------
		_ = client.On("load_history", recoverHandler(client, "load_history", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			convID, _ := data["conversation_id"].(string)

			mu.Lock()
			if convID == "" {
				convID = currentConversation
			}
			mu.Unlock()

			if convID == "" {
				_ = client.Emit("ai_error", map[string]string{"error": "no conversation_id provided"})
				return
			}

			// Verify the user owns this conversation
			if historyStore != nil {
				owned, ownerErr := historyStore.VerifyConversationOwnership(ctx, convID, userID)
				if ownerErr != nil || !owned {
					_ = client.Emit("ai_error", map[string]string{"error": "conversation not found"})
					return
				}
			}

			history, err := aiService.LoadHistory(ctx, convID)
			if err != nil {
				_ = client.Emit("ai_error", map[string]string{"error": "failed to load history: " + err.Error()})
				return
			}

			for _, msg := range history {
				_ = client.Emit("history_message", map[string]string{
					"content":         msg.Content,
					"role":            string(msg.Role),
					"conversation_id": convID,
				})
			}
			_ = client.Emit("history_end", map[string]string{"conversation_id": convID})

			mu.Lock()
			currentConversation = convID
			mu.Unlock()
		}))

		// ---------- new_conversation ----------
		_ = client.On("new_conversation", recoverHandler(client, "new_conversation", func(...interface{}) {
			mu.Lock()
			currentConversation = ""
			mu.Unlock()
			_ = client.Emit("conversation_created", map[string]interface{}{})
		}))

		// ---------- disconnect ----------
		_ = client.On("disconnect", func(...interface{}) {
			log.Printf("socketio/ai: user %s disconnected", userID)
			connCancel()
		})
	})

}

// recoverHandler wraps a Socket.IO event handler with panic recovery.
func recoverHandler(client *socket.Socket, name string, fn func(...interface{})) func(...interface{}) {
	return func(args ...interface{}) {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("socketio/ai: panic in %s handler: %v\n%s", name, r, debug.Stack())
				_ = client.Emit("ai_error", map[string]string{"error": "internal error"})
			}
		}()
		fn(args...)
	}
}

// truncateForTitle creates a short title from the first message content.
// Uses rune slicing for UTF-8 safety (CJK, emoji, etc.).
func truncateForTitle(content string) string {
	runes := []rune(content)
	if len(runes) <= 50 {
		return content
	}
	return string(runes[:47]) + "..."
}
