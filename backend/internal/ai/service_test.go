package ai

import (
	"strings"
	"testing"
)

func TestBuildSystemPrompt_NoContext(t *testing.T) {
	s := &Service{config: DefaultConfig()}
	prompt := s.buildSystemPrompt(ChatContext{})

	if !strings.Contains(prompt, "Kubernetes assistant") {
		t.Error("expected system prompt to contain 'Kubernetes assistant'")
	}
	if strings.Contains(prompt, "current context") {
		t.Error("expected no context section when ChatContext is empty")
	}
}

func TestBuildSystemPrompt_WithContext(t *testing.T) {
	s := &Service{config: DefaultConfig()}
	prompt := s.buildSystemPrompt(ChatContext{
		ClusterID: "cluster-1",
		Namespace: "production",
		Resource:  "deployments",
		Name:      "nginx",
	})

	if !strings.Contains(prompt, "cluster-1") {
		t.Error("expected cluster ID in prompt")
	}
	if !strings.Contains(prompt, "production") {
		t.Error("expected namespace in prompt")
	}
	if !strings.Contains(prompt, "deployments/nginx") {
		t.Error("expected resource/name in prompt")
	}
}

func TestNilIfEmpty(t *testing.T) {
	if nilIfEmpty("") != nil {
		t.Error("expected nil for empty string")
	}
	result := nilIfEmpty("test")
	if result == nil || *result != "test" {
		t.Error("expected pointer to 'test'")
	}
}
