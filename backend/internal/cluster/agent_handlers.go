package cluster

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/httputil"
)

//go:embed install.sh
var installScript []byte

type AgentHandlers struct {
	manager  *Manager
	registry *AgentRegistry
}

func NewAgentHandlers(manager *Manager, registry *AgentRegistry) *AgentHandlers {
	return &AgentHandlers{
		manager:  manager,
		registry: registry,
	}
}

// RegisterPublicRoutes registers routes that don't require authentication (install script).
func (h *AgentHandlers) RegisterPublicRoutes(r *mux.Router) {
	r.HandleFunc("/api/agents/install.sh", h.handleInstallScript).Methods("GET")
}

// RegisterRoutes registers protected routes for agent token management.
func (h *AgentHandlers) RegisterRoutes(r *mux.Router) {
	api := r.PathPrefix("/api/clusters").Subrouter()
	api.HandleFunc("/agent-token", h.handleGenerateToken).Methods("POST")
	api.HandleFunc("/agent-token", h.handleListTokens).Methods("GET")
	api.HandleFunc("/agent-token/{id}", h.handleGetToken).Methods("GET")
	api.HandleFunc("/agent-token/{id}/install-command", h.handleInstallCommand).Methods("GET")
	api.HandleFunc("/agent-token/{id}", h.handleRevokeToken).Methods("DELETE")
}

func (h *AgentHandlers) handleInstallScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/x-shellscript")
	w.Header().Set("Content-Disposition", "attachment; filename=\"install.sh\"")
	w.WriteHeader(http.StatusOK)
	w.Write(installScript)
}

type generateTokenRequest struct {
	ClusterName string `json:"cluster_name"`
	Permissions string `json:"permissions"`
}

type generateTokenResponse struct {
	TokenID        string      `json:"token_id"`
	InstallCommand string      `json:"install_command"`
	Token          string      `json:"token"`
	TokenInfo      *AgentToken `json:"token_info"`
}

func (h *AgentHandlers) handleGenerateToken(w http.ResponseWriter, r *http.Request) {
	var req generateTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.ClusterName == "" {
		httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "cluster_name is required"})
		return
	}

	// Extract user ID from context (set by auth middleware).
	userID := getUserIDFromContext(r)
	if userID == "" {
		httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	rawToken, tokenInfo, err := h.registry.GenerateToken(r.Context(), req.ClusterName, userID, req.Permissions)
	if err != nil {
		httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to generate token"})
		return
	}

	// Build the install command so the frontend gets it in a single request.
	dashboardURL := r.Header.Get("X-Dashboard-URL")
	if dashboardURL == "" {
		scheme := "https"
		if r.TLS == nil {
			scheme = "http"
		}
		dashboardURL = fmt.Sprintf("%s://%s", scheme, r.Host)
	}

	installCmd := fmt.Sprintf(
		"curl -sSL %s/api/agents/install.sh | bash -s -- \\\n  --dashboard-url %s \\\n  --cluster-name %q \\\n  --token %s",
		dashboardURL, dashboardURL, req.ClusterName, rawToken,
	)

	httputil.WriteJSON(w, http.StatusCreated, generateTokenResponse{
		TokenID:        tokenInfo.ID,
		InstallCommand: installCmd,
		Token:          rawToken,
		TokenInfo:      tokenInfo,
	})
}

func (h *AgentHandlers) handleListTokens(w http.ResponseWriter, r *http.Request) {
	userID := getUserIDFromContext(r)
	if userID == "" {
		httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	tokens, err := h.registry.ListTokens(r.Context(), userID)
	if err != nil {
		httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to list tokens"})
		return
	}

	if tokens == nil {
		tokens = []*AgentToken{}
	}

	httputil.WriteJSON(w, http.StatusOK, tokens)
}

func (h *AgentHandlers) handleGetToken(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	userID := getUserIDFromContext(r)
	if userID == "" {
		httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	token, err := h.registry.GetToken(r.Context(), id)
	if err != nil {
		httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "token not found"})
		return
	}

	if token.CreatedBy != userID {
		httputil.WriteJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	httputil.WriteJSON(w, http.StatusOK, token)
}

func (h *AgentHandlers) handleInstallCommand(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	userID := getUserIDFromContext(r)
	if userID == "" {
		httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	token, err := h.registry.GetToken(r.Context(), id)
	if err != nil {
		httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "token not found"})
		return
	}

	if token.CreatedBy != userID {
		httputil.WriteJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	if token.Used {
		httputil.WriteJSON(w, http.StatusConflict, map[string]string{"error": "token already used"})
		return
	}

	// Build the install command. The actual token is not stored, so we just
	// provide the helm install template. Users should use the token from the
	// generation response.
	dashboardURL := r.Header.Get("X-Dashboard-URL")
	if dashboardURL == "" {
		scheme := "https"
		if r.TLS == nil {
			scheme = "http"
		}
		dashboardURL = fmt.Sprintf("%s://%s", scheme, r.Host)
	}

	installCmd := fmt.Sprintf(
		`curl -sSL %s/api/agents/install.sh | bash -s -- \
  --dashboard-url %s \
  --cluster-name %q \
  --token <YOUR_TOKEN>`,
		dashboardURL, dashboardURL, token.ClusterName,
	)

	httputil.WriteJSON(w, http.StatusOK, map[string]string{
		"install_command": installCmd,
		"cluster_name":   token.ClusterName,
	})
}

func (h *AgentHandlers) handleRevokeToken(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	userID := getUserIDFromContext(r)
	if userID == "" {
		httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// Verify ownership before revoking.
	token, err := h.registry.GetToken(r.Context(), id)
	if err != nil {
		httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "token not found"})
		return
	}

	if token.CreatedBy != userID {
		httputil.WriteJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden"})
		return
	}

	if err := h.registry.RevokeToken(r.Context(), id); err != nil {
		httputil.WriteJSON(w, http.StatusConflict, map[string]string{"error": "token not found or already used"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// getUserIDFromContext extracts the user ID from JWT claims set by the auth middleware.
func getUserIDFromContext(r *http.Request) string {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		return ""
	}
	return claims.UserID
}
