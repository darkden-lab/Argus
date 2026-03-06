package auth

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/httputil"
)

type APIKeyHandlers struct {
	service *APIKeyService
}

func NewAPIKeyHandlers(service *APIKeyService) *APIKeyHandlers {
	return &APIKeyHandlers{service: service}
}

func (h *APIKeyHandlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/auth/api-keys", h.handleList).Methods("GET")
	r.HandleFunc("/api/auth/api-keys", h.handleCreate).Methods("POST")
	r.HandleFunc("/api/auth/api-keys/{id}", h.handleRevoke).Methods("DELETE")
}

func (h *APIKeyHandlers) handleCreate(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Name          string `json:"name"`
		ExpiresInDays int    `json:"expires_in_days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if len(req.Name) > 255 {
		httputil.WriteError(w, http.StatusBadRequest, "name must be 255 characters or less")
		return
	}

	if req.ExpiresInDays < 0 {
		httputil.WriteError(w, http.StatusBadRequest, "expires_in_days must not be negative")
		return
	}

	var expiresAt *time.Time
	if req.ExpiresInDays > 0 {
		t := time.Now().AddDate(0, 0, req.ExpiresInDays)
		expiresAt = &t
	}

	resp, err := h.service.CreateKey(r.Context(), claims.UserID, req.Name, expiresAt)
	if err != nil {
		if strings.Contains(err.Error(), "maximum number of API keys") {
			httputil.WriteError(w, http.StatusConflict, err.Error())
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create API key")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, resp)
}

func (h *APIKeyHandlers) handleList(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	keys, err := h.service.ListKeys(r.Context(), claims.UserID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list API keys")
		return
	}

	if keys == nil {
		keys = []APIKey{}
	}
	httputil.WriteJSON(w, http.StatusOK, keys)
}

func (h *APIKeyHandlers) handleRevoke(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	keyID := mux.Vars(r)["id"]
	if err := h.service.RevokeKey(r.Context(), claims.UserID, keyID); err != nil {
		httputil.WriteError(w, http.StatusNotFound, "API key not found")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
