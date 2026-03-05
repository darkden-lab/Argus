package ai

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/ai/rag"
	"github.com/darkden-lab/argus/backend/internal/crypto"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProviderFactory creates an LLMProvider from the given config.
type ProviderFactory func(AIConfig) LLMProvider

// AdminHandlers provides REST endpoints for AI configuration and management.
type AdminHandlers struct {
	pool            *pgxpool.Pool
	indexer         *rag.Indexer
	config          AIConfig
	rbacWriteGuard  mux.MiddlewareFunc
	service         *Service
	providerFactory ProviderFactory
	encryptionKey   string
}

// NewAdminHandlers creates admin API handlers for AI.
func NewAdminHandlers(pool *pgxpool.Pool, indexer *rag.Indexer, config AIConfig, rbacWriteGuard mux.MiddlewareFunc, service *Service, factory ProviderFactory, encryptionKey string) *AdminHandlers {
	return &AdminHandlers{
		pool:            pool,
		indexer:         indexer,
		config:          config,
		rbacWriteGuard:  rbacWriteGuard,
		service:         service,
		providerFactory: factory,
		encryptionKey:   encryptionKey,
	}
}

// RegisterRoutes wires the AI admin REST endpoints.
func (h *AdminHandlers) RegisterRoutes(r *mux.Router) {
	ai := r.PathPrefix("/api/ai").Subrouter()
	ai.HandleFunc("/config", h.getConfig).Methods(http.MethodGet)
	ai.HandleFunc("/status", h.getStatus).Methods(http.MethodGet)
	ai.HandleFunc("/rag/status", h.ragStatus).Methods(http.MethodGet)

	// Write endpoints require ai:write RBAC
	writeAI := ai.PathPrefix("").Subrouter()
	if h.rbacWriteGuard != nil {
		writeAI.Use(h.rbacWriteGuard)
	}
	writeAI.HandleFunc("/config", h.updateConfig).Methods(http.MethodPut)
	writeAI.HandleFunc("/config/test", h.testConnection).Methods(http.MethodPost)
	writeAI.HandleFunc("/rag/reindex", h.triggerReindex).Methods(http.MethodPost)
}

// AIStatus is the response for the /api/ai/status endpoint.
type AIStatus struct {
	Enabled             bool   `json:"enabled"`
	Configured          bool   `json:"configured"`
	Provider            string `json:"provider"`
	Model               string `json:"model"`
	ToolPermissionLevel string `json:"tool_permission_level"`
	Message             string `json:"message,omitempty"`
}

func (h *AdminHandlers) getStatus(w http.ResponseWriter, r *http.Request) {
	cfg := h.config

	// Try to load from DB if available (may have been updated at runtime)
	if h.pool != nil {
		var dbCfg AIConfig
		var headersJSON []byte
		var encAPIKey []byte
		err := h.pool.QueryRow(r.Context(),
			`SELECT provider, model, embed_model, COALESCE(base_url, ''), max_tokens, temperature, enabled, tool_permission_level, COALESCE(custom_headers, '{}'), encrypted_api_key
			 FROM ai_config LIMIT 1`,
		).Scan(&dbCfg.Provider, &dbCfg.Model, &dbCfg.EmbedModel, &dbCfg.BaseURL, &dbCfg.MaxTokens, &dbCfg.Temperature, &dbCfg.Enabled, &dbCfg.ToolPermissionLevel, &headersJSON, &encAPIKey)
		if err == nil {
			if len(headersJSON) > 0 {
				_ = json.Unmarshal(headersJSON, &dbCfg.CustomHeaders)
			}
			if len(encAPIKey) > 0 {
				if plain, err := crypto.Decrypt(encAPIKey, h.encryptionKey); err == nil {
					dbCfg.APIKey = string(plain)
				}
			}
			cfg = dbCfg
		}
	}

	status := AIStatus{
		Enabled:             cfg.Enabled,
		Provider:            string(cfg.Provider),
		Model:               cfg.Model,
		ToolPermissionLevel: string(cfg.ToolPermissionLevel),
	}

	if !cfg.Enabled {
		status.Configured = false
		status.Message = "AI assistant is disabled. Enable it in Settings > AI Configuration."
	} else if err := cfg.Validate(); err != nil {
		status.Configured = false
		status.Message = "AI provider is not fully configured. " + err.Error()
	} else {
		status.Configured = true
		status.Message = "AI assistant is ready."
	}

	writeAIJSON(w, http.StatusOK, status)
}

func (h *AdminHandlers) getConfig(w http.ResponseWriter, r *http.Request) {
	if h.pool == nil {
		writeAIJSON(w, http.StatusOK, DefaultConfig())
		return
	}

	var cfg AIConfig
	var headersJSON []byte
	var encAPIKey []byte
	err := h.pool.QueryRow(r.Context(),
		`SELECT provider, model, embed_model, COALESCE(base_url, ''), max_tokens, temperature, enabled, tool_permission_level, COALESCE(custom_headers, '{}'), encrypted_api_key
		 FROM ai_config LIMIT 1`,
	).Scan(&cfg.Provider, &cfg.Model, &cfg.EmbedModel, &cfg.BaseURL, &cfg.MaxTokens, &cfg.Temperature, &cfg.Enabled, &cfg.ToolPermissionLevel, &headersJSON, &encAPIKey)
	if err != nil {
		writeAIJSON(w, http.StatusOK, DefaultConfig())
		return
	}
	if len(headersJSON) > 0 {
		_ = json.Unmarshal(headersJSON, &cfg.CustomHeaders)
	}
	// Signal the frontend that an API key is stored without exposing it
	if len(encAPIKey) > 0 {
		cfg.APIKey = "••••••••"
	}

	writeAIJSON(w, http.StatusOK, cfg)
}

func (h *AdminHandlers) updateConfig(w http.ResponseWriter, r *http.Request) {
	var cfg AIConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if h.pool == nil {
		writeAIJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database not available"})
		return
	}

	headersJSON, err := json.Marshal(cfg.CustomHeaders)
	if err != nil {
		headersJSON = []byte("{}")
	}

	// Determine if we need to update the encrypted API key.
	// The masked placeholder "••••••••" means "keep existing", empty means clear it.
	var encAPIKey []byte
	apiKeyChanged := cfg.APIKey != "••••••••"
	if apiKeyChanged && cfg.APIKey != "" {
		encAPIKey, err = crypto.Encrypt([]byte(cfg.APIKey), h.encryptionKey)
		if err != nil {
			log.Printf("ai: failed to encrypt api key: %v", err)
			writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to encrypt API key"})
			return
		}
	}

	if apiKeyChanged {
		// Update everything including the API key
		_, err = h.pool.Exec(r.Context(),
			`UPDATE ai_config SET
				provider = $1, model = $2, embed_model = $3, base_url = NULLIF($4, ''),
				max_tokens = $5, temperature = $6, enabled = $7, tool_permission_level = $8, custom_headers = $9, encrypted_api_key = $10, updated_at = NOW()
			 WHERE true`,
			cfg.Provider, cfg.Model, cfg.EmbedModel, cfg.BaseURL, cfg.MaxTokens, cfg.Temperature, cfg.Enabled, cfg.ToolPermissionLevel, headersJSON, encAPIKey,
		)
	} else {
		// Keep existing API key untouched
		_, err = h.pool.Exec(r.Context(),
			`UPDATE ai_config SET
				provider = $1, model = $2, embed_model = $3, base_url = NULLIF($4, ''),
				max_tokens = $5, temperature = $6, enabled = $7, tool_permission_level = $8, custom_headers = $9, updated_at = NOW()
			 WHERE true`,
			cfg.Provider, cfg.Model, cfg.EmbedModel, cfg.BaseURL, cfg.MaxTokens, cfg.Temperature, cfg.Enabled, cfg.ToolPermissionLevel, headersJSON,
		)
	}
	if err != nil {
		log.Printf("ai: failed to update config: %v", err)
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update config"})
		return
	}

	// Hot-reload the AI provider so changes take effect immediately.
	if h.service != nil && h.providerFactory != nil {
		_, current := h.service.Snapshot()
		if !apiKeyChanged || cfg.APIKey == "••••••••" {
			cfg.APIKey = current.APIKey
		}
		if cfg.CustomHeaders == nil {
			cfg.CustomHeaders = current.CustomHeaders
		}
		newProvider := h.providerFactory(cfg)
		h.service.UpdateProvider(newProvider, cfg)
	}

	// Don't leak the actual key back to the frontend
	if cfg.APIKey != "" {
		cfg.APIKey = "••••••••"
	}
	writeAIJSON(w, http.StatusOK, cfg)
}

func (h *AdminHandlers) testConnection(w http.ResponseWriter, r *http.Request) {
	var cfg AIConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if err := cfg.Validate(); err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	// If the API key is the masked placeholder, substitute the stored key
	if cfg.APIKey == "••••••••" && h.pool != nil {
		var encKey []byte
		err := h.pool.QueryRow(r.Context(), `SELECT encrypted_api_key FROM ai_config LIMIT 1`).Scan(&encKey)
		if err == nil && len(encKey) > 0 {
			decrypted, err := crypto.Decrypt(encKey, h.encryptionKey)
			if err == nil {
				cfg.APIKey = string(decrypted)
			}
		}
	}

	if h.providerFactory == nil {
		writeAIJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "Configuration is valid (no provider factory to test)"})
		return
	}

	provider := h.providerFactory(cfg)

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	_, err := provider.Chat(ctx, ChatRequest{
		Messages:    []Message{{Role: RoleUser, Content: "Hello"}},
		MaxTokens:   16,
		Temperature: 0,
	})
	if err != nil {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "Connection failed: " + err.Error()})
		return
	}

	writeAIJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "Connection successful"})
}

func (h *AdminHandlers) ragStatus(w http.ResponseWriter, r *http.Request) {
	if h.indexer == nil {
		writeAIJSON(w, http.StatusOK, map[string]string{"status": "not_configured"})
		return
	}

	writeAIJSON(w, http.StatusOK, h.indexer.GetStatus())
}

func (h *AdminHandlers) triggerReindex(w http.ResponseWriter, r *http.Request) {
	if h.indexer == nil {
		writeAIJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "indexer not configured"})
		return
	}

	go h.indexer.RunOnce(context.Background())
	writeAIJSON(w, http.StatusAccepted, map[string]string{"status": "reindex_started"})
}

func writeAIJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
