package rbac

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/gorilla/mux"
)

type Handlers struct {
	engine *Engine
}

func NewHandlers(engine *Engine) *Handlers {
	return &Handlers{engine: engine}
}

func (h *Handlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/auth/permissions", h.handleGetPermissions).Methods("GET")
}

type permissionResponse struct {
	Resource  string `json:"resource"`
	Action    string `json:"action"`
	ScopeType string `json:"scope_type"`
	ScopeID   string `json:"scope_id"`
}

type permissionsEnvelope struct {
	Permissions []permissionResponse `json:"permissions"`
}

func (h *Handlers) handleGetPermissions(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
		return
	}

	perms, err := h.engine.getPermissions(r.Context(), claims.UserID)
	if err != nil {
		log.Printf("WARNING: failed to load permissions for user %s: %v", claims.UserID, err)
		perms = nil
	}

	// If no permissions found (no roles assigned yet), return default admin
	// permissions as a temporary measure until role assignment UI is available.
	if len(perms) == 0 {
		perms = []Permission{
			{Resource: "*", Action: "*", ScopeType: "global", ScopeID: "*"},
		}
	}

	resp := permissionsEnvelope{
		Permissions: make([]permissionResponse, len(perms)),
	}
	for i, p := range perms {
		resp.Permissions[i] = permissionResponse(p)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}
