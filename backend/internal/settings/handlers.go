package settings

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/config"
	"github.com/darkden-lab/argus/backend/internal/crypto"
	"github.com/darkden-lab/argus/backend/internal/httputil"
)

// OidcConfig represents the OIDC configuration returned to and received from
// the frontend. The client_secret is never exposed via the GET endpoint.
type OidcConfig struct {
	Enabled      bool     `json:"enabled"`
	ProviderType string   `json:"provider_type"`
	ProviderName string   `json:"provider_name"`
	IssuerURL    string   `json:"issuer_url"`
	ClientID     string   `json:"client_id"`
	ClientSecret string   `json:"client_secret,omitempty"`
	RedirectURL  string   `json:"redirect_url"`
	GroupsClaim  string   `json:"groups_claim"`
	ExtraScopes  []string `json:"extra_scopes,omitempty"`
	TenantID     string   `json:"tenant_id,omitempty"`
}

// Handlers provides HTTP handlers for application settings.
type Handlers struct {
	pool *pgxpool.Pool
	cfg  *config.Config
}

// NewHandlers creates a new Handlers.
func NewHandlers(pool *pgxpool.Pool, cfg *config.Config) *Handlers {
	return &Handlers{pool: pool, cfg: cfg}
}

// RegisterRoutes wires the settings endpoints onto the provided router.
func (h *Handlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/settings/oidc", h.GetOIDC).Methods("GET")
	r.HandleFunc("/api/settings/oidc", h.UpdateOIDC).Methods("PUT")
	r.HandleFunc("/api/settings/oidc/test", h.TestOIDC).Methods("POST")
}

// RegisterPublicRoutes registers settings routes that don't require authentication.
func (h *Handlers) RegisterPublicRoutes(r *mux.Router) {
	r.HandleFunc("/api/settings/oidc/providers", h.GetOIDCProviders).Methods("GET")
}

// GetOIDC handles GET /api/settings/oidc.
// It first tries to read the configuration from the database; if no row
// exists it falls back to the values loaded from environment variables.
func (h *Handlers) GetOIDC(w http.ResponseWriter, r *http.Request) {
	// Try reading from the database first.
	if h.pool != nil {
		var raw []byte
		err := h.pool.QueryRow(r.Context(),
			"SELECT value FROM settings WHERE key = $1", "oidc",
		).Scan(&raw)

		if err == nil {
			var oc OidcConfig
			if jsonErr := json.Unmarshal(raw, &oc); jsonErr == nil {
				oc.ClientSecret = "" // Never expose the secret
				httputil.WriteJSON(w, http.StatusOK, oc)
				return
			}
		}
		// If the key is simply missing (pgx.ErrNoRows) we fall through to
		// the env-var defaults. Any other error is also non-fatal here;
		// we prefer returning defaults over an error page.
	}

	// Fallback: derive from env-var config.
	oc := OidcConfig{
		Enabled:      h.cfg.OIDCIssuer != "" && h.cfg.OIDCClientID != "",
		IssuerURL:    h.cfg.OIDCIssuer,
		ClientID:     h.cfg.OIDCClientID,
		ProviderName: "",
		RedirectURL:  h.cfg.OIDCRedirectURL,
	}
	httputil.WriteJSON(w, http.StatusOK, oc)
}

// UpdateOIDC handles PUT /api/settings/oidc.
// It upserts the provided OIDC configuration into the settings table and
// returns the saved value.
func (h *Handlers) UpdateOIDC(w http.ResponseWriter, r *http.Request) {
	if h.pool == nil {
		httputil.WriteError(w, http.StatusServiceUnavailable, "database not available")
		return
	}

	var oc OidcConfig
	if err := json.NewDecoder(r.Body).Decode(&oc); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// If client_secret is provided, encrypt it before storing
	if oc.ClientSecret != "" {
		encrypted, err := crypto.Encrypt([]byte(oc.ClientSecret), h.cfg.EncryptionKey)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to encrypt client secret")
			return
		}
		oc.ClientSecret = hex.EncodeToString(encrypted)
	} else {
		// If empty, preserve existing secret from DB
		existingOC := h.getExistingOIDCConfig(r.Context())
		if existingOC != nil {
			oc.ClientSecret = existingOC.ClientSecret
		}
	}

	raw, err := json.Marshal(oc)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to marshal config")
		return
	}

	if err := upsertSetting(r.Context(), h.pool, "oidc", raw); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to save settings")
		return
	}

	// Don't return the secret
	oc.ClientSecret = ""
	httputil.WriteJSON(w, http.StatusOK, oc)
}

// TestOIDC handles POST /api/settings/oidc/test.
// It validates an OIDC issuer URL by attempting provider discovery.
func (h *Handlers) TestOIDC(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IssuerURL string `json:"issuer_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.IssuerURL == "" {
		httputil.WriteError(w, http.StatusBadRequest, "issuer_url is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	_, err := oidc.NewProvider(ctx, req.IssuerURL)
	if err != nil {
		httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "OIDC provider discovered successfully",
	})
}

// GetOIDCProviders handles GET /api/settings/oidc/providers.
// Returns all available OIDC provider presets (public endpoint).
func (h *Handlers) GetOIDCProviders(w http.ResponseWriter, r *http.Request) {
	httputil.WriteJSON(w, http.StatusOK, auth.GetProviderPresets())
}

// getExistingOIDCConfig reads the current OIDC config from the database.
func (h *Handlers) getExistingOIDCConfig(ctx context.Context) *OidcConfig {
	if h.pool == nil {
		return nil
	}
	var raw []byte
	err := h.pool.QueryRow(ctx,
		"SELECT value FROM settings WHERE key = $1", "oidc",
	).Scan(&raw)
	if err != nil {
		return nil
	}
	var oc OidcConfig
	if json.Unmarshal(raw, &oc) != nil {
		return nil
	}
	return &oc
}

// upsertSetting performs an INSERT ... ON CONFLICT UPDATE into the settings
// table.
func upsertSetting(ctx context.Context, pool *pgxpool.Pool, key string, value []byte) error {
	_, err := pool.Exec(ctx,
		`INSERT INTO settings (key, value, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (key) DO UPDATE
		   SET value = EXCLUDED.value,
		       updated_at = NOW()`,
		key, value,
	)
	return err
}
