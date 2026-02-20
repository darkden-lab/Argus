package ai

import (
	"fmt"
	"os"
)

// ProviderType identifies the LLM backend.
type ProviderType string

const (
	ProviderClaude ProviderType = "claude"
	ProviderOpenAI ProviderType = "openai"
	ProviderOllama ProviderType = "ollama"
)

// AIConfig holds the configuration for the AI subsystem.
type AIConfig struct {
	Provider    ProviderType `json:"provider"`
	APIKey      string       `json:"api_key,omitempty"`
	Model       string       `json:"model"`
	BaseURL     string       `json:"base_url,omitempty"` // For Ollama or custom endpoints
	EmbedModel  string       `json:"embed_model,omitempty"`
	MaxTokens   int          `json:"max_tokens"`
	Temperature float64      `json:"temperature"`
	Enabled     bool         `json:"enabled"`
}

// DefaultConfig returns sensible defaults for AI configuration.
func DefaultConfig() AIConfig {
	return AIConfig{
		Provider:    ProviderClaude,
		Model:       "claude-sonnet-4-20250514",
		EmbedModel:  "text-embedding-3-small",
		MaxTokens:   4096,
		Temperature: 0.1,
		Enabled:     false,
	}
}

// LoadConfigFromEnv loads AI configuration from environment variables, falling
// back to defaults for any value not set.
func LoadConfigFromEnv() AIConfig {
	cfg := DefaultConfig()

	if p := os.Getenv("AI_PROVIDER"); p != "" {
		cfg.Provider = ProviderType(p)
	}
	if k := os.Getenv("AI_API_KEY"); k != "" {
		cfg.APIKey = k
	}
	if m := os.Getenv("AI_MODEL"); m != "" {
		cfg.Model = m
	}
	if u := os.Getenv("AI_BASE_URL"); u != "" {
		cfg.BaseURL = u
	}
	if em := os.Getenv("AI_EMBED_MODEL"); em != "" {
		cfg.EmbedModel = em
	}
	if os.Getenv("AI_ENABLED") == "true" {
		cfg.Enabled = true
	}

	return cfg
}

// Validate checks that the configuration has all required fields for the
// selected provider.
func (c AIConfig) Validate() error {
	switch c.Provider {
	case ProviderClaude:
		if c.APIKey == "" {
			return fmt.Errorf("ai: claude provider requires AI_API_KEY")
		}
	case ProviderOpenAI:
		if c.APIKey == "" {
			return fmt.Errorf("ai: openai provider requires AI_API_KEY")
		}
	case ProviderOllama:
		if c.BaseURL == "" {
			return fmt.Errorf("ai: ollama provider requires AI_BASE_URL")
		}
	default:
		return fmt.Errorf("ai: unknown provider %q", c.Provider)
	}
	return nil
}
