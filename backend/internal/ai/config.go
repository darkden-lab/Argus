package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/darkden-lab/argus/backend/internal/crypto"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProviderType identifies the LLM backend.
type ProviderType string

const (
	ProviderClaude ProviderType = "claude"
	ProviderOpenAI ProviderType = "openai"
	ProviderOllama ProviderType = "ollama"
)

// ToolPermissionLevel controls which tools the AI assistant can use.
type ToolPermissionLevel string

const (
	ToolsDisabled ToolPermissionLevel = "disabled"
	ToolsReadOnly ToolPermissionLevel = "read_only"
	ToolsAll      ToolPermissionLevel = "all"
)

// AIConfig holds the configuration for the AI subsystem.
type AIConfig struct {
	Provider            ProviderType        `json:"provider"`
	APIKey              string              `json:"api_key,omitempty"`
	Model               string              `json:"model"`
	BaseURL             string              `json:"base_url,omitempty"` // For Ollama or custom endpoints
	EmbedModel          string              `json:"embed_model,omitempty"`
	MaxTokens           int                 `json:"max_tokens"`
	Temperature         float64             `json:"temperature"`
	Enabled             bool                `json:"enabled"`
	ToolPermissionLevel ToolPermissionLevel `json:"tool_permission_level"`
	CustomHeaders       map[string]string   `json:"custom_headers,omitempty"`
}

// DefaultConfig returns sensible defaults for AI configuration.
func DefaultConfig() AIConfig {
	return AIConfig{
		Provider:    ProviderClaude,
		Model:       "claude-sonnet-4-20250514",
		EmbedModel:  "text-embedding-3-small",
		MaxTokens:   4096,
		Temperature: 0.1,
		Enabled:             false,
		ToolPermissionLevel: ToolsAll,
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
	if h := os.Getenv("AI_CUSTOM_HEADERS"); h != "" {
		var headers map[string]string
		if err := json.Unmarshal([]byte(h), &headers); err == nil {
			cfg.CustomHeaders = headers
		}
	}

	return cfg
}

// LoadConfigFromDB loads AI configuration from the database. DB values always
// take precedence; the fallback (env vars) is only used when the DB has no row
// or the query fails.
func LoadConfigFromDB(ctx context.Context, pool *pgxpool.Pool, fallback AIConfig, encryptionKey string) AIConfig {
	if pool == nil {
		return fallback
	}

	var dbCfg AIConfig
	var headersJSON []byte
	var encAPIKey []byte
	err := pool.QueryRow(ctx,
		`SELECT provider, model, embed_model, COALESCE(base_url, ''), max_tokens, temperature, enabled, tool_permission_level, COALESCE(custom_headers, '{}'), encrypted_api_key
		 FROM ai_config LIMIT 1`,
	).Scan(&dbCfg.Provider, &dbCfg.Model, &dbCfg.EmbedModel, &dbCfg.BaseURL, &dbCfg.MaxTokens, &dbCfg.Temperature, &dbCfg.Enabled, &dbCfg.ToolPermissionLevel, &headersJSON, &encAPIKey)
	if err != nil {
		return fallback
	}

	if len(headersJSON) > 0 {
		_ = json.Unmarshal(headersJSON, &dbCfg.CustomHeaders)
	}

	// Decrypt API key from DB
	if len(encAPIKey) > 0 && encryptionKey != "" {
		if plain, err := crypto.Decrypt(encAPIKey, encryptionKey); err == nil {
			dbCfg.APIKey = string(plain)
		}
	}

	// Env vars only fill in what the DB doesn't have
	if dbCfg.APIKey == "" && fallback.APIKey != "" {
		dbCfg.APIKey = fallback.APIKey
	}
	if dbCfg.CustomHeaders == nil && len(fallback.CustomHeaders) > 0 {
		dbCfg.CustomHeaders = fallback.CustomHeaders
	}

	return dbCfg
}

// Validate checks that the configuration has all required fields for the
// selected provider.
func (c AIConfig) Validate() error {
	switch c.Provider {
	case ProviderClaude:
		if c.APIKey == "" && len(c.CustomHeaders) == 0 {
			return fmt.Errorf("ai: claude provider requires AI_API_KEY or custom headers")
		}
	case ProviderOpenAI:
		if c.APIKey == "" && len(c.CustomHeaders) == 0 {
			return fmt.Errorf("ai: openai provider requires AI_API_KEY or custom headers")
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
