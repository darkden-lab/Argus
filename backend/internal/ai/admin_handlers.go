package ai

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/ai/rag"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminHandlers provides REST endpoints for AI configuration and management.
type AdminHandlers struct {
	pool    *pgxpool.Pool
	indexer *rag.Indexer
}

// NewAdminHandlers creates admin API handlers for AI.
func NewAdminHandlers(pool *pgxpool.Pool, indexer *rag.Indexer) *AdminHandlers {
	return &AdminHandlers{
		pool:    pool,
		indexer: indexer,
	}
}

// RegisterRoutes wires the AI admin REST endpoints.
func (h *AdminHandlers) RegisterRoutes(r *mux.Router) {
	ai := r.PathPrefix("/api/ai").Subrouter()
	ai.HandleFunc("/config", h.getConfig).Methods(http.MethodGet)
	ai.HandleFunc("/config", h.updateConfig).Methods(http.MethodPut)
	ai.HandleFunc("/config/test", h.testConnection).Methods(http.MethodPost)
	ai.HandleFunc("/rag/status", h.ragStatus).Methods(http.MethodGet)
	ai.HandleFunc("/rag/reindex", h.triggerReindex).Methods(http.MethodPost)
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

	writeAIJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "Configuration is valid"})
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
