package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/ai/rag"
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
}

// NewAdminHandlers creates admin API handlers for AI.
func NewAdminHandlers(pool *pgxpool.Pool, indexer *rag.Indexer, config AIConfig, rbacWriteGuard mux.MiddlewareFunc, service *Service, factory ProviderFactory) *AdminHandlers {
	return &AdminHandlers{
		pool:            pool,
		indexer:         indexer,
		config:          config,
		rbacWriteGuard:  rbacWriteGuard,
		service:         service,
		providerFactory: factory,
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
	Enabled    bool   `json:"enabled"`
	Configured bool   `json:"configured"`
	Provider   string `json:"provider"`
	Model      string `json:"model"`
	Message    string `json:"message,omitempty"`
}

func (h *AdminHandlers) getStatus(w http.ResponseWriter, r *http.Request) {
	cfg := h.config

	// Try to load from DB if available (may have been updated at runtime)
	if h.pool != nil {
		var dbCfg AIConfig
		err := h.pool.QueryRow(r.Context(),
			`SELECT provider, model, embed_model, COALESCE(base_url, ''), max_tokens, temperature, enabled
			 FROM ai_config LIMIT 1`,
		).Scan(&dbCfg.Provider, &dbCfg.Model, &dbCfg.EmbedModel, &dbCfg.BaseURL, &dbCfg.MaxTokens, &dbCfg.Temperature, &dbCfg.Enabled)
		if err == nil {
			cfg = dbCfg
		}
	}

	status := AIStatus{
		Enabled:  cfg.Enabled,
		Provider: string(cfg.Provider),
		Model:    cfg.Model,
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
	err := h.pool.QueryRow(r.Context(),
		`SELECT provider, model, embed_model, COALESCE(base_url, ''), max_tokens, temperature, enabled
		 FROM ai_config LIMIT 1`,
	).Scan(&cfg.Provider, &cfg.Model, &cfg.EmbedModel, &cfg.BaseURL, &cfg.MaxTokens, &cfg.Temperature, &cfg.Enabled)
	if err != nil {
		writeAIJSON(w, http.StatusOK, DefaultConfig())
		return
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

	_, err := h.pool.Exec(r.Context(),
		`UPDATE ai_config SET
			provider = $1, model = $2, embed_model = $3, base_url = NULLIF($4, ''),
			max_tokens = $5, temperature = $6, enabled = $7, updated_at = NOW()
		 WHERE true`,
		cfg.Provider, cfg.Model, cfg.EmbedModel, cfg.BaseURL, cfg.MaxTokens, cfg.Temperature, cfg.Enabled,
	)
	if err != nil {
		writeAIJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to update config"})
		return
	}

	// Hot-reload the AI provider so changes take effect immediately.
	// If the request omitted api_key, preserve the one from the running config.
	if h.service != nil && h.providerFactory != nil {
		if cfg.APIKey == "" {
			_, current := h.service.Snapshot()
			cfg.APIKey = current.APIKey
		}
		newProvider := h.providerFactory(cfg)
		h.service.UpdateProvider(newProvider, cfg)
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

	go h.indexer.RunOnce(r.Context())
	writeAIJSON(w, http.StatusAccepted, map[string]string{"status": "reindex_started"})
}

func writeAIJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
