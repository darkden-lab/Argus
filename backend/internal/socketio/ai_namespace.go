package socketio

import (
	"context"
	"encoding/json"
	"log"

	"github.com/zishang520/socket.io/v2/socket"
	"github.com/darkden-lab/argus/backend/internal/ai"
	"github.com/darkden-lab/argus/backend/internal/auth"
)

// registerAINamespace sets up the /ai namespace for AI chat streaming.
func registerAINamespace(io *socket.Server, jwtService *auth.JWTService, aiService *ai.Service) {
	nsp := io.Of("/ai", nil)
	nsp.Use(authMiddleware(jwtService))

	_ = nsp.On("connection", func(clients ...interface{}) {
		client := clients[0].(*socket.Socket)
		claims := getClaims(client)
		if claims == nil {
			client.Disconnect(true)
			return
		}
		userID := claims.UserID
		log.Printf("socketio/ai: user %s connected", userID)

		// Per-connection state
		var currentConversation string
		var currentContext ai.ChatContext
		var currentAgent *ai.Agent
		ctx := context.Background()

		// Check AI config on connect
		_, config := aiService.Snapshot()
		if !config.Enabled {
			_ = client.Emit("error", map[string]string{
				"error":   "not configured",
				"content": "AI assistant is not enabled. Please enable it in Settings > AI Configuration.",
			})
			client.Disconnect(true)
			return
		}
		if validErr := config.Validate(); validErr != nil {
			_ = client.Emit("error", map[string]string{
				"error":   "not configured",
				"content": "AI provider is not fully configured: " + validErr.Error() + ". Update the configuration in Settings > AI Configuration.",
			})
			client.Disconnect(true)
			return
		}

		_ = client.On("user_message", func(args ...interface{}) {
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

			if convID != "" {
				currentConversation = convID
			} else if currentConversation == "" {
				currentConversation = "temp-" + userID
			}

			// Update context from message
			if ctxData, ok := data["context"].(map[string]interface{}); ok {
				if cid, ok := ctxData["cluster_id"].(string); ok && cid != "" {
					currentContext.ClusterID = cid
				}
				if ns, ok := ctxData["namespace"].(string); ok && ns != "" {
					currentContext.Namespace = ns
				}
			}

			// Allow selecting agent inline
			if agentID != "" && aiService.HasAgentStore() {
				agent, err := aiService.GetAgent(ctx, agentID)
				if err == nil {
					currentAgent = agent
				}
			}

			// Stream response
			stream, err := aiService.ProcessMessageStream(
				ctx, userID, currentConversation, content, currentContext,
			)
			if err != nil {
				_ = client.Emit("error", map[string]string{"error": err.Error(), "content": err.Error()})
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
					_ = client.Emit("stream_delta", map[string]string{"content": delta.Content})
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

			// Execute tools if needed
			if finishReason == "tool_calls" && len(validToolCalls) > 0 {
				resp, err := aiService.ExecuteToolsAndRespond(
					ctx, userID, currentConversation, content, currentContext, contentBuf, validToolCalls,
				)
				if err != nil {
					_ = client.Emit("error", map[string]string{"error": err.Error(), "content": err.Error()})
				} else {
					_ = client.Emit("stream_delta", map[string]string{"content": resp.Message.Content})
				}
			}

			_ = client.Emit("stream_end", map[string]interface{}{})

			_ = currentAgent // suppress unused (used for future agent-specific logic)
		})

		_ = client.On("select_agent", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			agentID, _ := data["agent_id"].(string)

			if agentID == "" {
				currentAgent = nil
				currentConversation = ""
				_ = client.Emit("agent_selected", map[string]string{"agent_id": ""})
				return
			}

			if !aiService.HasAgentStore() {
				_ = client.Emit("error", map[string]string{"error": "agent system not available"})
				return
			}

			agent, err := aiService.GetAgent(ctx, agentID)
			if err != nil {
				_ = client.Emit("error", map[string]string{"error": "agent not found"})
				return
			}
			currentAgent = agent
			currentConversation = ""
			_ = client.Emit("agent_selected", map[string]interface{}{
				"agent_id":   agent.ID,
				"agent_name": agent.Name,
			})
		})

		_ = client.On("start_task", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}

			if !aiService.HasAgentStore() {
				_ = client.Emit("error", map[string]string{"error": "agent system not available"})
				return
			}

			agentID, _ := data["agent_id"].(string)
			if agentID == "" && currentAgent != nil {
				agentID = currentAgent.ID
			}
			if agentID == "" {
				_ = client.Emit("error", map[string]string{"error": "no agent selected for task"})
				return
			}

			agent, err := aiService.GetAgent(ctx, agentID)
			if err != nil {
				_ = client.Emit("error", map[string]string{"error": "agent not found"})
				return
			}

			title, _ := data["task_title"].(string)
			content, _ := data["content"].(string)
			if title == "" {
				title = content
			}

			task := &ai.AgentTask{
				UserID:  userID,
				AgentID: agentID,
				Title:   title,
				Status:  "pending",
			}
			if createErr := aiService.CreateTask(ctx, task); createErr != nil {
				_ = client.Emit("error", map[string]string{"error": "failed to create task: " + createErr.Error()})
				return
			}

			_ = client.Emit("task_created", map[string]string{
				"task_id":    task.ID,
				"agent_id":   agent.ID,
				"agent_name": agent.Name,
			})
		})

		_ = client.On("cancel_task", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			taskID, _ := data["task_id"].(string)
			_ = client.Emit("task_completed", map[string]string{"task_id": taskID})
		})

		_ = client.On("confirm_action", func(args ...interface{}) {
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
			if approved {
				_ = mgr.Approve(confirmID)
			} else {
				_ = mgr.Reject(confirmID)
			}
		})

		_ = client.On("context_update", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			if ctxData, ok := data["context"].(map[string]interface{}); ok {
				if cid, ok := ctxData["cluster_id"].(string); ok {
					currentContext.ClusterID = cid
				}
				if ns, ok := ctxData["namespace"].(string); ok {
					currentContext.Namespace = ns
				}
			} else {
				// Direct context fields
				if cid, ok := data["cluster_id"].(string); ok {
					currentContext.ClusterID = cid
				}
				if ns, ok := data["namespace"].(string); ok {
					currentContext.Namespace = ns
				}
			}
		})

		_ = client.On("load_history", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			convID, _ := data["conversation_id"].(string)
			if convID == "" {
				convID = currentConversation
			}
			if convID == "" {
				_ = client.Emit("error", map[string]string{"error": "no conversation_id provided"})
				return
			}

			history, err := aiService.LoadHistory(ctx, convID)
			if err != nil {
				_ = client.Emit("error", map[string]string{"error": "failed to load history: " + err.Error()})
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
			currentConversation = convID
		})

		_ = client.On("new_conversation", func(...interface{}) {
			currentConversation = ""
			_ = client.Emit("conversation_created", map[string]interface{}{})
		})

		_ = client.On("disconnect", func(...interface{}) {
			log.Printf("socketio/ai: user %s disconnected", userID)
		})
	})

	// Ensure json import is used
	_ = json.Marshal
}
