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
				if unmarshalErr := json.Unmarshal(headersJSON, &dbCfg.CustomHeaders); unmarshalErr != nil {
					log.Printf("ai: getStatus: failed to unmarshal custom_headers: %v", unmarshalErr)
				}
			}
			if len(encAPIKey) > 0 {
				if plain, err := crypto.Decrypt(encAPIKey, h.encryptionKey); err == nil {
					dbCfg.APIKey = string(plain)
				}
			}
			// Fall back to the in-memory service config for secrets (env vars / hot-reload)
			if h.service != nil {
				_, svcCfg := h.service.Snapshot()
				if dbCfg.APIKey == "" && svcCfg.APIKey != "" {
					dbCfg.APIKey = svcCfg.APIKey
				}
				if len(dbCfg.CustomHeaders) == 0 && len(svcCfg.CustomHeaders) > 0 {
					dbCfg.CustomHeaders = svcCfg.CustomHeaders
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
		if unmarshalErr := json.Unmarshal(headersJSON, &cfg.CustomHeaders); unmarshalErr != nil {
			log.Printf("ai: getConfig: failed to unmarshal custom_headers: %v", unmarshalErr)
		}
	}
	// Signal the frontend that an API key is stored without exposing it.
	// Check both DB (encrypted_api_key) and in-memory service (env var fallback).
	if len(encAPIKey) > 0 {
		cfg.APIKey = maskedValue
	} else if h.service != nil {
		_, svcCfg := h.service.Snapshot()
		if svcCfg.APIKey != "" {
			cfg.APIKey = maskedValue
		}
	}

	// Mask custom header values (they often contain API keys / subscription keys)
	cfg.CustomHeaders = maskHeaderValues(cfg.CustomHeaders)

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

	// Parameter validation before DB write
	validProviders := map[ProviderType]bool{ProviderClaude: true, ProviderOpenAI: true, ProviderOllama: true}
	if !validProviders[cfg.Provider] {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "provider must be one of: claude, openai, ollama"})
		return
	}
	if cfg.Model == "" {
		writeAIJSON(w, http.StatusBadRequest, map[string]string{"error": "model must not be empty"})
		return
	}
	if cfg.MaxTokens < 1 || cfg.MaxTokens > 128000 {
		cfg.MaxTokens = 4096
	}
	if cfg.Temperature < 0 || cfg.Temperature > 2 {
		cfg.Temperature = 0.1
	}

	// Ensure tool_permission_level is never empty — default to "all"
	if cfg.ToolPermissionLevel == "" {
		cfg.ToolPermissionLevel = ToolsAll
	}

	// Resolve custom headers: merge masked values with existing stored values.
	// This prevents losing header secrets when the frontend sends them back masked.
	var storedHeaders map[string]string
	if h.pool != nil {
		var storedJSON []byte
		_ = h.pool.QueryRow(r.Context(), `SELECT COALESCE(custom_headers, '{}') FROM ai_config LIMIT 1`).Scan(&storedJSON)
		if len(storedJSON) > 0 {
			if unmarshalErr := json.Unmarshal(storedJSON, &storedHeaders); unmarshalErr != nil {
				log.Printf("ai: updateConfig: failed to unmarshal stored custom_headers: %v", unmarshalErr)
			}
		}
	}
	// Fall back to in-memory service headers if DB has none
	if len(storedHeaders) == 0 && h.service != nil {
		_, svcCfg := h.service.Snapshot()
		storedHeaders = svcCfg.CustomHeaders
	}
	headersChanged := !headersAllMasked(cfg.CustomHeaders)
	if headersChanged {
		// Merge: replace masked values with stored, keep new values
		cfg.CustomHeaders = mergeHeaders(cfg.CustomHeaders, storedHeaders)
	} else {
		// All values are masked or no headers sent — keep existing
		cfg.CustomHeaders = storedHeaders
	}

	headersJSON, err := json.Marshal(cfg.CustomHeaders)
	if err != nil {
		headersJSON = []byte("{}")
	}

	// Determine if we need to update the encrypted API key.
	// The masked placeholder "••••••••" means "keep existing".
	// Empty string also means "keep existing" (frontend may not have the key
	// when it was set via env vars and never stored in DB).
	var encAPIKey []byte
	apiKeyChanged := cfg.APIKey != maskedValue && cfg.APIKey != ""
	log.Printf("ai: updateConfig: provider=%s model=%s enabled=%v tools=%s apiKeyLen=%d apiKeyChanged=%v headersChanged=%v headerCount=%d",
		cfg.Provider, cfg.Model, cfg.Enabled, cfg.ToolPermissionLevel, len(cfg.APIKey), apiKeyChanged, headersChanged, len(cfg.CustomHeaders))
	if apiKeyChanged {
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

	// Post-save validation: resolve actual API key and validate if enabled
	if cfg.Enabled {
		resolvedCfg := cfg
		// Resolve the actual API key (same logic as testConnection)
		if resolvedCfg.APIKey == maskedValue || resolvedCfg.APIKey == "" {
			if h.pool != nil {
				var encKey []byte
				scanErr := h.pool.QueryRow(r.Context(), `SELECT encrypted_api_key FROM ai_config LIMIT 1`).Scan(&encKey)
				if scanErr == nil && len(encKey) > 0 {
					if decrypted, decErr := crypto.Decrypt(encKey, h.encryptionKey); decErr == nil {
						resolvedCfg.APIKey = string(decrypted)
					}
				}
			}
			if (resolvedCfg.APIKey == maskedValue || resolvedCfg.APIKey == "") && h.service != nil {
				_, svcCfg := h.service.Snapshot()
				resolvedCfg.APIKey = svcCfg.APIKey
			}
		}
		if validErr := resolvedCfg.Validate(); validErr != nil {
			log.Printf("ai: updateConfig: saved config is enabled but invalid: %v", validErr)
		}
	}

	// Hot-reload the AI provider so changes take effect immediately.
	if h.service != nil && h.providerFactory != nil {
		_, current := h.service.Snapshot()
		if !apiKeyChanged || cfg.APIKey == maskedValue || cfg.APIKey == "" {
			cfg.APIKey = current.APIKey
		}
		if len(cfg.CustomHeaders) == 0 {
			cfg.CustomHeaders = current.CustomHeaders
		}
		if cfg.ToolPermissionLevel == "" {
			cfg.ToolPermissionLevel = current.ToolPermissionLevel
		}
		if cfg.Provider == "" {
			cfg.Provider = current.Provider
		}
		if cfg.Model == "" {
			cfg.Model = current.Model
		}
		newProvider := h.providerFactory(cfg)
		h.service.UpdateProvider(newProvider, cfg)
	}

	// Don't leak secrets back to the frontend
	if cfg.APIKey != "" {
		cfg.APIKey = maskedValue
	}
	cfg.CustomHeaders = maskHeaderValues(cfg.CustomHeaders)
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

	// Resolve masked/empty secrets from stored config
	if cfg.APIKey == maskedValue || cfg.APIKey == "" {
		if h.pool != nil {
			var encKey []byte
			err := h.pool.QueryRow(r.Context(), `SELECT encrypted_api_key FROM ai_config LIMIT 1`).Scan(&encKey)
			if err == nil && len(encKey) > 0 {
				decrypted, err := crypto.Decrypt(encKey, h.encryptionKey)
				if err == nil {
					cfg.APIKey = string(decrypted)
				}
			}
		}
		if cfg.APIKey == maskedValue || cfg.APIKey == "" {
			if h.service != nil {
				_, svcCfg := h.service.Snapshot()
				if svcCfg.APIKey != "" {
					cfg.APIKey = svcCfg.APIKey
				}
			}
		}
	}
	// Resolve masked custom header values
	if headersAllMasked(cfg.CustomHeaders) && h.service != nil {
		_, svcCfg := h.service.Snapshot()
		cfg.CustomHeaders = mergeHeaders(cfg.CustomHeaders, svcCfg.CustomHeaders)
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

const maskedValue = "••••••••"

// maskHeaderValues returns a copy of headers with all values replaced by the mask.
func maskHeaderValues(headers map[string]string) map[string]string {
	if len(headers) == 0 {
		return headers
	}
	masked := make(map[string]string, len(headers))
	for k := range headers {
		masked[k] = maskedValue
	}
	return masked
}

// headersAllMasked returns true if every value in headers equals the mask.
func headersAllMasked(headers map[string]string) bool {
	if len(headers) == 0 {
		return false
	}
	for _, v := range headers {
		if v != maskedValue {
			return false
		}
	}
	return true
}

// mergeHeaders merges incoming headers with the current stored headers.
// Masked values ("••••••••") are replaced with values from stored.
func mergeHeaders(incoming, stored map[string]string) map[string]string {
	if len(incoming) == 0 {
		return stored
	}
	result := make(map[string]string, len(incoming))
	for k, v := range incoming {
		if v == maskedValue {
			if sv, ok := stored[k]; ok {
				result[k] = sv
			}
			// If the key doesn't exist in stored, skip it (don't store the mask)
		} else {
			result[k] = v
		}
	}
	return result
}

func writeAIJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
