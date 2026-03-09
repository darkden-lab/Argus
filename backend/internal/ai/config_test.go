package ai

import (
	"strings"
	"testing"
)

func TestConfigValidate(t *testing.T) {
	tests := []struct {
		name    string
		config  AIConfig
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid claude config with api key",
			config: AIConfig{
				Provider:    ProviderClaude,
				APIKey:      "sk-test-key",
				Model:       "claude-sonnet-4-20250514",
				MaxTokens:   4096,
				Temperature: 0.1,
			},
			wantErr: false,
		},
		{
			name: "valid claude config with custom headers (no api key)",
			config: AIConfig{
				Provider:      ProviderClaude,
				Model:         "claude-sonnet-4-20250514",
				MaxTokens:     4096,
				Temperature:   0.1,
				CustomHeaders: map[string]string{"Authorization": "Bearer proxy-key"},
			},
			wantErr: false,
		},
		{
			name: "valid openai config with api key",
			config: AIConfig{
				Provider:    ProviderOpenAI,
				APIKey:      "sk-openai-key",
				Model:       "gpt-4",
				MaxTokens:   4096,
				Temperature: 0.7,
			},
			wantErr: false,
		},
		{
			name: "valid openai config with custom headers (no api key)",
			config: AIConfig{
				Provider:      ProviderOpenAI,
				Model:         "gpt-4",
				MaxTokens:     4096,
				Temperature:   0.5,
				CustomHeaders: map[string]string{"X-Api-Key": "custom-key"},
			},
			wantErr: false,
		},
		{
			name: "valid ollama config",
			config: AIConfig{
				Provider:    ProviderOllama,
				BaseURL:     "http://localhost:11434",
				Model:       "llama3",
				MaxTokens:   2048,
				Temperature: 0.0,
			},
			wantErr: false,
		},
		{
			name: "invalid: empty model",
			config: AIConfig{
				Provider:    ProviderClaude,
				APIKey:      "sk-test",
				Model:       "",
				MaxTokens:   4096,
				Temperature: 0.1,
			},
			wantErr: true,
			errMsg:  "model must not be empty",
		},
		{
			name: "invalid: MaxTokens zero",
			config: AIConfig{
				Provider:    ProviderClaude,
				APIKey:      "sk-test",
				Model:       "claude-sonnet-4-20250514",
				MaxTokens:   0,
				Temperature: 0.1,
			},
			wantErr: true,
			errMsg:  "max_tokens must be greater than 0",
		},
		{
			name: "invalid: MaxTokens negative",
			config: AIConfig{
				Provider:    ProviderClaude,
				APIKey:      "sk-test",
				Model:       "claude-sonnet-4-20250514",
				MaxTokens:   -1,
				Temperature: 0.1,
			},
			wantErr: true,
			errMsg:  "max_tokens must be greater than 0",
		},
		{
			name: "invalid: negative temperature",
			config: AIConfig{
				Provider:    ProviderClaude,
				APIKey:      "sk-test",
				Model:       "claude-sonnet-4-20250514",
				MaxTokens:   4096,
				Temperature: -0.5,
			},
			wantErr: true,
			errMsg:  "temperature must be >= 0",
		},
		{
			name: "invalid: unknown provider",
			config: AIConfig{
				Provider:    "gemini",
				APIKey:      "key",
				Model:       "gemini-pro",
				MaxTokens:   4096,
				Temperature: 0.5,
			},
			wantErr: true,
			errMsg:  "unknown provider",
		},
		{
			name: "invalid: claude without api key or custom headers",
			config: AIConfig{
				Provider:    ProviderClaude,
				Model:       "claude-sonnet-4-20250514",
				MaxTokens:   4096,
				Temperature: 0.1,
			},
			wantErr: true,
			errMsg:  "requires AI_API_KEY or custom headers",
		},
		{
			name: "invalid: openai without api key or custom headers",
			config: AIConfig{
				Provider:    ProviderOpenAI,
				Model:       "gpt-4",
				MaxTokens:   4096,
				Temperature: 0.5,
			},
			wantErr: true,
			errMsg:  "requires AI_API_KEY or custom headers",
		},
		{
			name: "invalid: ollama without base URL",
			config: AIConfig{
				Provider:    ProviderOllama,
				Model:       "llama3",
				MaxTokens:   2048,
				Temperature: 0.0,
			},
			wantErr: true,
			errMsg:  "requires AI_BASE_URL",
		},
		{
			name: "valid: zero temperature is allowed",
			config: AIConfig{
				Provider:    ProviderClaude,
				APIKey:      "sk-test",
				Model:       "claude-sonnet-4-20250514",
				MaxTokens:   1,
				Temperature: 0.0,
			},
			wantErr: false,
		},
		{
			name: "invalid: claude with empty custom headers map and no api key",
			config: AIConfig{
				Provider:      ProviderClaude,
				Model:         "claude-sonnet-4-20250514",
				MaxTokens:     4096,
				Temperature:   0.1,
				CustomHeaders: map[string]string{},
			},
			wantErr: true,
			errMsg:  "requires AI_API_KEY or custom headers",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()
			if tt.wantErr {
				if err == nil {
					t.Errorf("Validate() returned nil, want error containing %q", tt.errMsg)
					return
				}
				if !strings.Contains(err.Error(), tt.errMsg) {
					t.Errorf("Validate() error = %q, want it to contain %q", err.Error(), tt.errMsg)
				}
			} else {
				if err != nil {
					t.Errorf("Validate() returned error: %v, want nil", err)
				}
			}
		})
	}
}

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()

	if cfg.Provider != ProviderClaude {
		t.Errorf("DefaultConfig().Provider = %q, want %q", cfg.Provider, ProviderClaude)
	}
	if cfg.Model == "" {
		t.Error("DefaultConfig().Model is empty")
	}
	if cfg.MaxTokens <= 0 {
		t.Errorf("DefaultConfig().MaxTokens = %d, want > 0", cfg.MaxTokens)
	}
	if cfg.Enabled {
		t.Error("DefaultConfig().Enabled = true, want false")
	}
	if cfg.ToolPermissionLevel != ToolsAll {
		t.Errorf("DefaultConfig().ToolPermissionLevel = %q, want %q", cfg.ToolPermissionLevel, ToolsAll)
	}
}
