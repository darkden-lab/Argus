package ai

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/darkden-lab/argus/backend/internal/ai/rag"
	"github.com/darkden-lab/argus/backend/internal/ai/tools"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/plugin"
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
	mu          sync.RWMutex
	provider    LLMProvider
	retriever   *rag.Retriever
	executor    *tools.Executor
	confirmMgr  *tools.ConfirmationManager
	pool        *pgxpool.Pool
	config      AIConfig
	memoryStore *MemoryStore
	agentStore  *AgentStore
}

// NewService creates a new AI service orchestrator.
func NewService(
	provider LLMProvider,
	retriever *rag.Retriever,
	clusterMgr *cluster.Manager,
	pluginEngine *plugin.Engine,
	pool *pgxpool.Pool,
	config AIConfig,
	memoryStore *MemoryStore,
) *Service {
	return &Service{
		provider:    provider,
		retriever:   retriever,
		executor:    tools.NewExecutor(clusterMgr, pluginEngine, pool),
		confirmMgr:  tools.NewConfirmationManager(),
		pool:        pool,
		config:      config,
		memoryStore: memoryStore,
	}
}

// SetRetriever sets the RAG retriever after construction.
// This breaks a circular dependency: Service → Embedder → Service.
func (s *Service) SetRetriever(r *rag.Retriever) {
	s.retriever = r
}

// SetAgentStore sets the agent store after construction.
func (s *Service) SetAgentStore(store *AgentStore) {
	s.agentStore = store
}

// GetAgentStore returns the agent store (used by handlers for agent lookup).
func (s *Service) GetAgentStore() *AgentStore {
	return s.agentStore
}

// UpdateProvider swaps the active LLM provider and config at runtime.
// This is safe to call concurrently with ProcessMessage.
func (s *Service) UpdateProvider(provider LLMProvider, config AIConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.provider = provider
	s.config = config
	log.Printf("ai service: provider updated to %s (model=%s, enabled=%v)", config.Provider, config.Model, config.Enabled)
}

// ChatContext holds the page context sent by the frontend.
type ChatContext struct {
	ClusterID string `json:"cluster_id,omitempty"`
	Namespace string `json:"namespace,omitempty"`
	Resource  string `json:"resource,omitempty"`
	Name      string `json:"name,omitempty"`
}

// Snapshot returns a consistent copy of the current provider and config.
func (s *Service) Snapshot() (LLMProvider, AIConfig) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.provider, s.config
}

// ProcessMessage handles a user message through the full AI pipeline:
// 1. Load conversation history
// 2. Retrieve RAG context
// 3. Build prompt with system message + context + history
// 4. Call LLM with tools
// 5. Handle tool calls or return text response
func (s *Service) ProcessMessage(ctx context.Context, userID string, conversationID string, userMessage string, pageCtx ChatContext) (*ChatResponse, error) {
	provider, cfg := s.Snapshot()

	if !cfg.Enabled {
		return nil, fmt.Errorf("AI assistant is not enabled, enable it in Settings > AI Configuration")
	}

	// Build messages
	messages := []Message{
		{Role: RoleSystem, Content: s.buildSystemPrompt(ctx, userID, pageCtx)},
	}

	// Load conversation history (with summarization for long conversations)
	history, err := s.getHistoryWithSummary(ctx, conversationID)
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

	// Call LLM with tools based on permission level
	allTools := tools.ToolsForLevel(string(cfg.ToolPermissionLevel))
	req := ChatRequest{
		Messages:    messages,
		Tools:       allTools,
		MaxTokens:   cfg.MaxTokens,
		Temperature: cfg.Temperature,
	}

	resp, err := provider.Chat(ctx, req)
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
	provider, cfg := s.Snapshot()
	req := ChatRequest{
		Messages:    messages,
		Tools:       allTools,
		MaxTokens:   cfg.MaxTokens,
		Temperature: cfg.Temperature,
	}

	return provider.Chat(ctx, req)
}

// ProcessMessageStream handles a user message with streaming response.
func (s *Service) ProcessMessageStream(ctx context.Context, userID string, conversationID string, userMessage string, pageCtx ChatContext) (StreamReader, error) {
	provider, cfg := s.Snapshot()

	if !cfg.Enabled {
		return nil, fmt.Errorf("AI assistant is not enabled, enable it in Settings > AI Configuration")
	}

	messages := []Message{
		{Role: RoleSystem, Content: s.buildSystemPrompt(ctx, userID, pageCtx)},
	}

	history, _ := s.getHistoryWithSummary(ctx, conversationID)
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

	toolDefs := tools.ToolsForLevel(string(cfg.ToolPermissionLevel))
	req := ChatRequest{
		Messages:    messages,
		Tools:       toolDefs,
		MaxTokens:   cfg.MaxTokens,
		Temperature: cfg.Temperature,
		Stream:      true,
	}

	return provider.ChatStream(ctx, req)
}

// ExecuteToolsAndRespond handles the tool-call loop for streaming: it rebuilds
// the conversation, executes the accumulated tool calls, and re-invokes the LLM
// to produce a final text response.
func (s *Service) ExecuteToolsAndRespond(ctx context.Context, userID string, conversationID string, userMessage string, pageCtx ChatContext, assistantContent string, toolCalls []ToolCall) (*ChatResponse, error) {
	provider, cfg := s.Snapshot()

	// Rebuild messages (same as ProcessMessageStream)
	messages := []Message{
		{Role: RoleSystem, Content: s.buildSystemPrompt(ctx, userID, pageCtx)},
	}
	history, _ := s.getHistoryWithSummary(ctx, conversationID)
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

	// Add assistant message with tool calls
	messages = append(messages, Message{
		Role:      RoleAssistant,
		Content:   assistantContent,
		ToolCalls: toolCalls,
	})

	allTools := tools.ToolsForLevel(string(cfg.ToolPermissionLevel))

	// Execute each tool
	for _, call := range toolCalls {
		if tools.RequiresConfirm(call.Name) {
			status, err := s.confirmMgr.RequestConfirmation(ctx, userID, call)
			if err != nil || status != tools.ConfirmationApproved {
				messages = append(messages, Message{
					Role:       RoleTool,
					Content:    "Action cancelled by user or timed out.",
					ToolCallID: call.ID,
				})
				continue
			}
		}
		result := s.executor.Execute(ctx, call)
		messages = append(messages, Message{
			Role:       RoleTool,
			Content:    result.Content,
			ToolCallID: call.ID,
		})
	}

	req := ChatRequest{
		Messages:    messages,
		Tools:       allTools,
		MaxTokens:   cfg.MaxTokens,
		Temperature: cfg.Temperature,
	}

	return provider.Chat(ctx, req)
}

// GetConfirmationManager returns the confirmation manager for WebSocket handlers.
func (s *Service) GetConfirmationManager() *tools.ConfirmationManager {
	return s.confirmMgr
}

func (s *Service) buildSystemPrompt(ctx context.Context, userID string, pageCtx ChatContext) string {
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

	// Inject user memories
	if s.memoryStore != nil && userID != "" {
		memoryText, err := s.memoryStore.LoadForPrompt(ctx, userID)
		if err != nil {
			log.Printf("ai service: failed to load memories: %v", err)
		} else if memoryText != "" {
			prompt += memoryText
		}
	}

	return prompt
}

// BuildAgentSystemPrompt returns the system prompt for the given agent,
// augmented with page context and user memories.
func (s *Service) BuildAgentSystemPrompt(ctx context.Context, userID string, agent *Agent, pageCtx ChatContext) string {
	prompt := agent.SystemPrompt

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

	if s.memoryStore != nil && userID != "" {
		memoryText, err := s.memoryStore.LoadForPrompt(ctx, userID)
		if err != nil {
			log.Printf("ai service: failed to load memories for agent: %v", err)
		} else if memoryText != "" {
			prompt += memoryText
		}
	}

	return prompt
}

// ResolveAgentTools returns the tools available for an agent, intersecting the agent's
// allowed tools with the global permission level. Never escalates beyond global config.
func (s *Service) ResolveAgentTools(agent *Agent) []Tool {
	_, cfg := s.Snapshot()

	// Determine effective permission level: min of agent level and global level
	globalLevel := string(cfg.ToolPermissionLevel)
	agentLevel := agent.ToolPermissionLevel
	if agentLevel == "" {
		agentLevel = globalLevel
	}

	// Never escalate: if global is read_only, agent cannot be "all"
	effectiveLevel := agentLevel
	if globalLevel == "disabled" {
		effectiveLevel = "disabled"
	} else if globalLevel == "read_only" && agentLevel == "all" {
		effectiveLevel = "read_only"
	}

	allTools := tools.ToolsForLevel(effectiveLevel)
	if len(agent.AllowedTools) == 0 {
		return allTools
	}

	allowed := make(map[string]bool, len(agent.AllowedTools))
	for _, t := range agent.AllowedTools {
		allowed[t] = true
	}

	var filtered []Tool
	for _, t := range allTools {
		if allowed[t.Name] {
			filtered = append(filtered, t)
		}
	}
	return filtered
}

// LoadHistory returns the conversation history for the given conversation ID.
func (s *Service) LoadHistory(ctx context.Context, conversationID string) ([]Message, error) {
	return s.loadHistory(ctx, conversationID)
}

// getHistoryWithSummary returns conversation history with summarization for long conversations.
// When there are more than 50 messages and more than 20 unsummarized, it triggers summarization.
// Returns: [summary as system message] + [last 20 messages verbatim].
func (s *Service) getHistoryWithSummary(ctx context.Context, conversationID string) ([]Message, error) {
	if s.pool == nil || conversationID == "" {
		return nil, nil
	}

	// Count total messages
	var totalCount int
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM ai_messages WHERE conversation_id = $1`,
		conversationID,
	).Scan(&totalCount)
	if err != nil || totalCount <= 50 {
		// Not enough messages to warrant summarization, return normal history
		return s.loadHistory(ctx, conversationID)
	}

	// Check if we have an existing summary
	var summary *string
	var summarizedUpTo *string
	err = s.pool.QueryRow(ctx,
		`SELECT summary, summarized_up_to::text FROM ai_conversations WHERE id = $1`,
		conversationID,
	).Scan(&summary, &summarizedUpTo)
	if err != nil {
		return s.loadHistory(ctx, conversationID)
	}

	// Count unsummarized messages
	var unsummarizedCount int
	if summarizedUpTo != nil && *summarizedUpTo != "" {
		err = s.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM ai_messages WHERE conversation_id = $1 AND created_at > (SELECT created_at FROM ai_messages WHERE id = $2)`,
			conversationID, *summarizedUpTo,
		).Scan(&unsummarizedCount)
	} else {
		unsummarizedCount = totalCount
	}
	if err != nil {
		return s.loadHistory(ctx, conversationID)
	}

	// If we have enough unsummarized messages, trigger summarization
	if unsummarizedCount > 20 {
		s.triggerSummarization(ctx, conversationID)
	}

	// Build the response: summary + last 20 messages
	var messages []Message

	// Re-read summary (may have been updated by summarization)
	err = s.pool.QueryRow(ctx,
		`SELECT summary FROM ai_conversations WHERE id = $1`,
		conversationID,
	).Scan(&summary)
	if err == nil && summary != nil && *summary != "" {
		messages = append(messages, Message{
			Role:    RoleSystem,
			Content: "Previous conversation summary:\n" + *summary,
		})
	}

	// Load last 20 messages
	rows, err := s.pool.Query(ctx,
		`SELECT role, content, tool_calls, tool_call_id
		 FROM ai_messages
		 WHERE conversation_id = $1
		 ORDER BY created_at DESC
		 LIMIT 20`,
		conversationID,
	)
	if err != nil {
		return messages, nil
	}
	defer rows.Close()

	var recent []Message
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
		recent = append(recent, m)
	}

	// Reverse to get chronological order
	for i, j := 0, len(recent)-1; i < j; i, j = i+1, j-1 {
		recent[i], recent[j] = recent[j], recent[i]
	}

	messages = append(messages, recent...)
	return messages, nil
}

// triggerSummarization summarizes older messages and stores the summary.
func (s *Service) triggerSummarization(ctx context.Context, conversationID string) {
	provider, cfg := s.Snapshot()
	if provider == nil {
		return
	}

	// Load all messages except the last 20
	rows, err := s.pool.Query(ctx,
		`SELECT role, content FROM ai_messages
		 WHERE conversation_id = $1
		 ORDER BY created_at ASC`,
		conversationID,
	)
	if err != nil {
		log.Printf("ai service: summarization query failed: %v", err)
		return
	}
	defer rows.Close()

	var allMessages []Message
	var lastMsgID string
	for rows.Next() {
		var m Message
		var roleStr string
		if err := rows.Scan(&roleStr, &m.Content); err != nil {
			continue
		}
		m.Role = Role(roleStr)
		allMessages = append(allMessages, m)
	}

	if len(allMessages) <= 20 {
		return
	}

	// Get the ID of the message up to which we summarize
	err = s.pool.QueryRow(ctx,
		`SELECT id FROM ai_messages
		 WHERE conversation_id = $1
		 ORDER BY created_at DESC
		 OFFSET 19 LIMIT 1`,
		conversationID,
	).Scan(&lastMsgID)
	if err != nil {
		log.Printf("ai service: failed to get summarization boundary: %v", err)
		return
	}

	// Summarize the older messages
	toSummarize := allMessages[:len(allMessages)-20]
	var contentBuf string
	for _, m := range toSummarize {
		contentBuf += fmt.Sprintf("[%s]: %s\n", m.Role, m.Content)
	}

	summaryReq := ChatRequest{
		Messages: []Message{
			{Role: RoleSystem, Content: "Summarize this conversation concisely, preserving key facts, decisions, and context. Output only the summary."},
			{Role: RoleUser, Content: contentBuf},
		},
		MaxTokens:   cfg.MaxTokens,
		Temperature: 0,
	}

	resp, err := provider.Chat(ctx, summaryReq)
	if err != nil {
		log.Printf("ai service: summarization LLM call failed: %v", err)
		return
	}

	// Store summary
	_, err = s.pool.Exec(ctx,
		`UPDATE ai_conversations SET summary = $1, summarized_up_to = $2 WHERE id = $3`,
		resp.Message.Content, lastMsgID, conversationID,
	)
	if err != nil {
		log.Printf("ai service: failed to store summary: %v", err)
	}
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
// It reads the current provider from the Service via snapshot() so that
// hot-reloads are reflected in embedding calls.
type ProviderEmbedder struct {
	service *Service
}

// NewProviderEmbedder creates an embedder that tracks the Service's active provider.
func NewProviderEmbedder(s *Service) *ProviderEmbedder {
	return &ProviderEmbedder{service: s}
}

// EmbedTexts implements rag.Embedder.
func (pe *ProviderEmbedder) EmbedTexts(ctx context.Context, input []string) ([][]float32, error) {
	provider, _ := pe.service.Snapshot()
	resp, err := provider.Embed(ctx, EmbedRequest{Input: input})
	if err != nil {
		return nil, err
	}
	return resp.Embeddings, nil
}
