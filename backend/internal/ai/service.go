package ai

import (
	"context"
	"fmt"
	"log"

	"github.com/darkden-lab/argus/backend/internal/ai/rag"
	"github.com/darkden-lab/argus/backend/internal/ai/tools"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/jackc/pgx/v5/pgxpool"
)

const systemPrompt = `You are a Kubernetes assistant integrated into the K8s Dashboard.
You help users understand and manage their Kubernetes clusters.

You have access to tools that can read and modify cluster resources.
For read-only operations, execute them immediately.
For write operations (apply, delete, scale, restart), ALWAYS request user confirmation first.

When answering:
- Be concise and actionable
- Include relevant kubectl commands when helpful
- Explain error messages and suggest fixes
- Reference specific resources by name when possible

Current context is provided by the user's active page in the dashboard.`

// Service orchestrates the AI chat pipeline: RAG retrieval, LLM calls, and
// tool execution.
type Service struct {
	provider   LLMProvider
	retriever  *rag.Retriever
	executor   *tools.Executor
	confirmMgr *tools.ConfirmationManager
	pool       *pgxpool.Pool
	config     AIConfig
}

// NewService creates a new AI service orchestrator.
func NewService(
	provider LLMProvider,
	retriever *rag.Retriever,
	clusterMgr *cluster.Manager,
	pool *pgxpool.Pool,
	config AIConfig,
) *Service {
	return &Service{
		provider:   provider,
		retriever:  retriever,
		executor:   tools.NewExecutor(clusterMgr),
		confirmMgr: tools.NewConfirmationManager(),
		pool:       pool,
		config:     config,
	}
}

// ChatContext holds the page context sent by the frontend.
type ChatContext struct {
	ClusterID string `json:"cluster_id,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	Resource  string `json:"resource,omitempty"`
	Name      string `json:"name,omitempty"`
}

// ProcessMessage handles a user message through the full AI pipeline:
// 1. Load conversation history
// 2. Retrieve RAG context
// 3. Build prompt with system message + context + history
// 4. Call LLM with tools
// 5. Handle tool calls or return text response
func (s *Service) ProcessMessage(ctx context.Context, userID string, conversationID string, userMessage string, pageCtx ChatContext) (*ChatResponse, error) {
	if !s.config.Enabled {
		return nil, fmt.Errorf("AI assistant is not enabled, enable it in Settings > AI Configuration")
	}

	// Build messages
	messages := []Message{
		{Role: RoleSystem, Content: s.buildSystemPrompt(pageCtx)},
	}

	// Load conversation history from DB
	history, err := s.loadHistory(ctx, conversationID)
	if err != nil {
		log.Printf("ai service: failed to load history: %v", err)
		// Continue without history
	}
	messages = append(messages, history...)

	// RAG retrieval
	if s.retriever != nil {
		ragResults, err := s.retriever.RetrieveContext(ctx, userMessage, "")
		if err != nil {
			log.Printf("ai service: RAG retrieval failed: %v", err)
		} else if len(ragResults) > 0 {
			ragContext := rag.FormatContext(ragResults)
			messages = append(messages, Message{
				Role:    RoleSystem,
				Content: "Here is relevant context from the knowledge base:\n\n" + ragContext,
			})
		}
	}

	// Add user message
	messages = append(messages, Message{
		Role:    RoleUser,
		Content: userMessage,
	})

	// Call LLM with tools
	allTools := tools.AllTools()
	req := ChatRequest{
		Messages:    messages,
		Tools:       allTools,
		MaxTokens:   s.config.MaxTokens,
		Temperature: s.config.Temperature,
	}

	resp, err := s.provider.Chat(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("ai service: LLM call failed: %w", err)
	}

	// Handle tool calls
	if resp.FinishReason == "tool_calls" && len(resp.Message.ToolCalls) > 0 {
		return s.handleToolCalls(ctx, userID, messages, resp, allTools)
	}

	// Save messages
	s.saveMessage(ctx, conversationID, Message{Role: RoleUser, Content: userMessage})
	s.saveMessage(ctx, conversationID, resp.Message)

	return resp, nil
}

// handleToolCalls executes tool calls and continues the conversation.
func (s *Service) handleToolCalls(ctx context.Context, userID string, messages []Message, resp *ChatResponse, allTools []Tool) (*ChatResponse, error) {
	// Add assistant message with tool calls
	messages = append(messages, resp.Message)

	for _, call := range resp.Message.ToolCalls {
		// Check if tool requires confirmation
		if tools.RequiresConfirm(call.Name) {
			status, err := s.confirmMgr.RequestConfirmation(ctx, userID, call)
			if err != nil || status != tools.ConfirmationApproved {
				// Return a message saying the action was cancelled
				messages = append(messages, Message{
					Role:       RoleTool,
					Content:    "Action cancelled by user or timed out.",
					ToolCallID: call.ID,
				})
				continue
			}
		}

		// Execute the tool
		result := s.executor.Execute(ctx, call)
		messages = append(messages, Message{
			Role:       RoleTool,
			Content:    result.Content,
			ToolCallID: call.ID,
		})
	}

	// Re-invoke LLM with tool results
	req := ChatRequest{
		Messages:    messages,
		Tools:       allTools,
		MaxTokens:   s.config.MaxTokens,
		Temperature: s.config.Temperature,
	}

	return s.provider.Chat(ctx, req)
}

// ProcessMessageStream handles a user message with streaming response.
func (s *Service) ProcessMessageStream(ctx context.Context, userID string, conversationID string, userMessage string, pageCtx ChatContext) (StreamReader, error) {
	if !s.config.Enabled {
		return nil, fmt.Errorf("AI assistant is not enabled, enable it in Settings > AI Configuration")
	}

	messages := []Message{
		{Role: RoleSystem, Content: s.buildSystemPrompt(pageCtx)},
	}

	history, _ := s.loadHistory(ctx, conversationID)
	messages = append(messages, history...)

	if s.retriever != nil {
		ragResults, _ := s.retriever.RetrieveContext(ctx, userMessage, "")
		if len(ragResults) > 0 {
			messages = append(messages, Message{
				Role:    RoleSystem,
				Content: "Relevant context:\n\n" + rag.FormatContext(ragResults),
			})
		}
	}

	messages = append(messages, Message{Role: RoleUser, Content: userMessage})

	req := ChatRequest{
		Messages:    messages,
		Tools:       tools.AllTools(),
		MaxTokens:   s.config.MaxTokens,
		Temperature: s.config.Temperature,
		Stream:      true,
	}

	return s.provider.ChatStream(ctx, req)
}

// GetConfirmationManager returns the confirmation manager for WebSocket handlers.
func (s *Service) GetConfirmationManager() *tools.ConfirmationManager {
	return s.confirmMgr
}

func (s *Service) buildSystemPrompt(pageCtx ChatContext) string {
	prompt := systemPrompt
	if pageCtx.ClusterID != "" {
		prompt += fmt.Sprintf("\n\nUser's current context:\n- Cluster: %s", pageCtx.ClusterID)
		if pageCtx.Namespace != "" {
			prompt += fmt.Sprintf("\n- Namespace: %s", pageCtx.Namespace)
		}
		if pageCtx.Resource != "" {
			prompt += fmt.Sprintf("\n- Viewing: %s", pageCtx.Resource)
			if pageCtx.Name != "" {
				prompt += fmt.Sprintf("/%s", pageCtx.Name)
			}
		}
	}
	return prompt
}

func (s *Service) loadHistory(ctx context.Context, conversationID string) ([]Message, error) {
	if s.pool == nil || conversationID == "" {
		return nil, nil
	}

	rows, err := s.pool.Query(ctx,
		`SELECT role, content, tool_calls, tool_call_id
		 FROM ai_messages
		 WHERE conversation_id = $1
		 ORDER BY created_at ASC
		 LIMIT 50`,
		conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var m Message
		var roleStr string
		var toolCallsJSON *[]byte
		var toolCallID *string

		if err := rows.Scan(&roleStr, &m.Content, &toolCallsJSON, &toolCallID); err != nil {
			continue
		}
		m.Role = Role(roleStr)
		if toolCallID != nil {
			m.ToolCallID = *toolCallID
		}
		messages = append(messages, m)
	}

	return messages, nil
}

func (s *Service) saveMessage(ctx context.Context, conversationID string, msg Message) {
	if s.pool == nil || conversationID == "" {
		return
	}

	_, err := s.pool.Exec(ctx,
		`INSERT INTO ai_messages (conversation_id, role, content, tool_call_id)
		 VALUES ($1, $2, $3, $4)`,
		conversationID, string(msg.Role), msg.Content, nilIfEmpty(msg.ToolCallID),
	)
	if err != nil {
		log.Printf("ai service: failed to save message: %v", err)
	}
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// ProviderEmbedder adapts an LLMProvider to the rag.Embedder interface.
type ProviderEmbedder struct {
	Provider LLMProvider
}

// EmbedTexts implements rag.Embedder.
func (pe *ProviderEmbedder) EmbedTexts(ctx context.Context, input []string) ([][]float32, error) {
	resp, err := pe.Provider.Embed(ctx, EmbedRequest{Input: input})
	if err != nil {
		return nil, err
	}
	return resp.Embeddings, nil
}
