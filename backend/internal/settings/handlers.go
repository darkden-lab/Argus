package settings

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/darkden-lab/argus/backend/internal/config"
)

// OidcConfig represents the OIDC configuration returned to and received from
// the frontend.  The client_secret is never exposed via the GET endpoint.
type OidcConfig struct {
	Enabled      bool   `json:"enabled"`
	IssuerURL    string `json:"issuer_url"`
	ClientID     string `json:"client_id"`
	ProviderName string `json:"provider_name"`
	RedirectURL  string `json:"redirect_url"`
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
				writeJSON(w, http.StatusOK, oc)
				return
			}
		}
		// If the key is simply missing (pgx.ErrNoRows) we fall through to
		// the env-var defaults.  Any other error is also non-fatal here;
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
	writeJSON(w, http.StatusOK, oc)
}

// UpdateOIDC handles PUT /api/settings/oidc.
// It upserts the provided OIDC configuration into the settings table and
// returns the saved value.
func (h *Handlers) UpdateOIDC(w http.ResponseWriter, r *http.Request) {
	if h.pool == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error": "database not available",
		})
		return
	}

	var oc OidcConfig
	if err := json.NewDecoder(r.Body).Decode(&oc); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid request body",
		})
		return
	}

	raw, err := json.Marshal(oc)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to marshal config",
		})
		return
	}

	if err := upsertSetting(r.Context(), h.pool, "oidc", raw); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to save settings",
		})
		return
	}

	writeJSON(w, http.StatusOK, oc)
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

// writeJSON is a small helper that writes a JSON response.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data) //nolint:errcheck
}
