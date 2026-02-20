package providers

import (
	"testing"

	"github.com/darkden-lab/argus/backend/internal/ai"
)

func TestClaudeName(t *testing.T) {
	c := NewClaude("test-key", "")
	if c.Name() != "claude" {
		t.Errorf("expected name 'claude', got %q", c.Name())
	}
}

func TestClaudeDefaultModel(t *testing.T) {
	c := NewClaude("test-key", "")
	if c.model != "claude-sonnet-4-20250514" {
		t.Errorf("expected default model, got %q", c.model)
	}
}

func TestClaudeBuildRequest(t *testing.T) {
	c := NewClaude("test-key", "claude-sonnet-4-20250514")

	req := ai.ChatRequest{
		Messages: []ai.Message{
			{Role: ai.RoleSystem, Content: "You are a K8s assistant"},
			{Role: ai.RoleUser, Content: "List my pods"},
		},
		Tools: []ai.Tool{
			{
				Name:        "get_resources",
				Description: "Get K8s resources",
				Parameters: ai.ToolParams{
					Type:       "object",
					Properties: map[string]ai.ToolParam{
						"kind": {Type: "string", Description: "Resource kind"},
					},
					Required: []string{"kind"},
				},
			},
		},
		MaxTokens: 1024,
	}

	cr, err := c.buildRequest(req)
	if err != nil {
		t.Fatalf("buildRequest failed: %v", err)
	}

	if cr.System != "You are a K8s assistant" {
		t.Errorf("expected system message, got %q", cr.System)
	}

	// System message should not be in messages array
	if len(cr.Messages) != 1 {
		t.Errorf("expected 1 message (user), got %d", len(cr.Messages))
	}

	if len(cr.Tools) != 1 {
		t.Errorf("expected 1 tool, got %d", len(cr.Tools))
	}

	if cr.MaxTokens != 1024 {
		t.Errorf("expected max_tokens 1024, got %d", cr.MaxTokens)
	}
}

func TestClaudeToResponse(t *testing.T) {
	c := NewClaude("test-key", "")

	resp := claudeResponse{
		Content: []claudeContentBlock{
			{Type: "text", Text: "Here are your pods"},
		},
		StopReason: "end_turn",
		Usage:      claudeUsage{InputTokens: 10, OutputTokens: 20},
	}

	result := c.toResponse(resp)

	if result.Message.Content != "Here are your pods" {
		t.Errorf("unexpected content: %q", result.Message.Content)
	}

	if result.FinishReason != "stop" {
		t.Errorf("expected finish_reason 'stop', got %q", result.FinishReason)
	}

	if result.Usage.TotalTokens != 30 {
		t.Errorf("expected total tokens 30, got %d", result.Usage.TotalTokens)
	}
}

func TestClaudeToResponseWithToolUse(t *testing.T) {
	c := NewClaude("test-key", "")

	resp := claudeResponse{
		Content: []claudeContentBlock{
			{Type: "text", Text: "Let me check"},
			{Type: "tool_use", ID: "tu_1", Name: "get_resources", Input: map[string]any{"kind": "pods"}},
		},
		StopReason: "tool_use",
	}

	result := c.toResponse(resp)

	if result.Message.Content != "Let me check" {
		t.Errorf("unexpected content: %q", result.Message.Content)
	}

	if len(result.Message.ToolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(result.Message.ToolCalls))
	}

	if result.Message.ToolCalls[0].Name != "get_resources" {
		t.Errorf("unexpected tool name: %q", result.Message.ToolCalls[0].Name)
	}

	if result.FinishReason != "tool_calls" {
		t.Errorf("expected finish_reason 'tool_calls', got %q", result.FinishReason)
	}
}
