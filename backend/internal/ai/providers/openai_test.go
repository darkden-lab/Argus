package providers

import (
	"testing"

	"github.com/k8s-dashboard/backend/internal/ai"
)

func TestOpenAIName(t *testing.T) {
	o := NewOpenAI("test-key", "", "")
	if o.Name() != "openai" {
		t.Errorf("expected name 'openai', got %q", o.Name())
	}
}

func TestOpenAIDefaultModel(t *testing.T) {
	o := NewOpenAI("test-key", "", "")
	if o.model != "gpt-4o" {
		t.Errorf("expected default model 'gpt-4o', got %q", o.model)
	}
}

func TestOpenAIBuildRequest(t *testing.T) {
	o := NewOpenAI("test-key", "gpt-4o", "")

	req := ai.ChatRequest{
		Messages: []ai.Message{
			{Role: ai.RoleSystem, Content: "You are helpful"},
			{Role: ai.RoleUser, Content: "Hello"},
		},
		MaxTokens: 512,
	}

	or := o.buildRequest(req)

	if or.Model != "gpt-4o" {
		t.Errorf("expected model 'gpt-4o', got %q", or.Model)
	}

	if len(or.Messages) != 2 {
		t.Errorf("expected 2 messages, got %d", len(or.Messages))
	}

	if or.MaxTokens != 512 {
		t.Errorf("expected max_tokens 512, got %d", or.MaxTokens)
	}
}

func TestOllamaName(t *testing.T) {
	o := NewOllama("", "")
	if o.Name() != "ollama" {
		t.Errorf("expected name 'ollama', got %q", o.Name())
	}
}

func TestOllamaDefaultValues(t *testing.T) {
	o := NewOllama("", "")
	if o.baseURL != "http://localhost:11434" {
		t.Errorf("expected default base URL, got %q", o.baseURL)
	}
	if o.model != "llama3.1" {
		t.Errorf("expected default model, got %q", o.model)
	}
}
