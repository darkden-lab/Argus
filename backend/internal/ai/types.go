package ai

import (
	"context"
	"io"
)

// Role represents who sent a message in a conversation.
type Role string

const (
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleSystem    Role = "system"
	RoleTool      Role = "tool"
)

// Message is a single message in a conversation.
type Message struct {
	Role       Role       `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

// ToolCall represents a request from the LLM to invoke a tool.
type ToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON-encoded arguments
}

// Tool describes a function that the LLM can invoke.
type Tool struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Parameters  ToolParams `json:"parameters"`
}

// ToolParams describes the JSON Schema for a tool's parameters.
type ToolParams struct {
	Type       string                `json:"type"` // "object"
	Properties map[string]ToolParam  `json:"properties"`
	Required   []string              `json:"required,omitempty"`
}

// ToolParam describes a single parameter in a tool's schema.
type ToolParam struct {
	Type        string   `json:"type"`
	Description string   `json:"description"`
	Enum        []string `json:"enum,omitempty"`
}

// ChatRequest is the input to an LLM chat completion call.
type ChatRequest struct {
	Messages    []Message `json:"messages"`
	Tools       []Tool    `json:"tools,omitempty"`
	Model       string    `json:"model,omitempty"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
	Temperature float64   `json:"temperature,omitempty"`
	Stream      bool      `json:"stream,omitempty"`
}

// ChatResponse is the output from an LLM chat completion call.
type ChatResponse struct {
	Message    Message `json:"message"`
	FinishReason string `json:"finish_reason"` // "stop", "tool_calls", "length"
	Usage      Usage   `json:"usage"`
}

// Usage tracks token consumption.
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// StreamDelta represents a single chunk in a streaming response.
type StreamDelta struct {
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	FinishReason string   `json:"finish_reason,omitempty"`
}

// EmbedRequest is the input to an embedding call.
type EmbedRequest struct {
	Input []string `json:"input"`
	Model string   `json:"model,omitempty"`
}

// EmbedResponse is the output from an embedding call.
type EmbedResponse struct {
	Embeddings [][]float32 `json:"embeddings"`
	Usage      Usage       `json:"usage"`
}

// LLMProvider is the interface that all LLM backends must implement.
type LLMProvider interface {
	// Chat sends a chat completion request and returns the full response.
	Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error)

	// ChatStream sends a streaming chat completion request. The caller must
	// read StreamDelta values from the returned StreamReader until it returns
	// io.EOF. Close must be called when done.
	ChatStream(ctx context.Context, req ChatRequest) (StreamReader, error)

	// Embed generates vector embeddings for the given input texts.
	Embed(ctx context.Context, req EmbedRequest) (*EmbedResponse, error)

	// Name returns the provider identifier (e.g. "claude", "openai", "ollama").
	Name() string
}

// StreamReader reads streaming deltas from an LLM response.
type StreamReader interface {
	// Next returns the next delta. Returns io.EOF when the stream is complete.
	Next() (*StreamDelta, error)
	// Close releases resources associated with the stream.
	io.Closer
}
