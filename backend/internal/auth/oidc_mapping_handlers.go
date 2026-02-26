package auth

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/darkden-lab/argus/backend/internal/httputil"
)

// OIDCMappingHandlers provides CRUD endpoints for OIDC group -> role mappings.
type OIDCMappingHandlers struct {
	pool *pgxpool.Pool
}

// NewOIDCMappingHandlers creates new mapping handlers.
func NewOIDCMappingHandlers(pool *pgxpool.Pool) *OIDCMappingHandlers {
	return &OIDCMappingHandlers{pool: pool}
}

// RegisterRoutes registers mapping endpoints on the protected router.
func (h *OIDCMappingHandlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/settings/oidc/mappings", h.listMappings).Methods("GET")
	r.HandleFunc("/api/settings/oidc/mappings", h.createMapping).Methods("POST")
	r.HandleFunc("/api/settings/oidc/mappings/{id}", h.deleteMapping).Methods("DELETE")
	r.HandleFunc("/api/settings/oidc/default-role", h.getDefaultRole).Methods("GET")
	r.HandleFunc("/api/settings/oidc/default-role", h.updateDefaultRole).Methods("PUT")
}

type mappingResponse struct {
	ID        string  `json:"id"`
	OIDCGroup string  `json:"oidc_group"`
	RoleID    string  `json:"role_id"`
	RoleName  string  `json:"role_name"`
	ClusterID *string `json:"cluster_id,omitempty"`
	Namespace *string `json:"namespace,omitempty"`
	CreatedAt string  `json:"created_at"`
}

type createMappingRequest struct {
	OIDCGroup string  `json:"oidc_group"`
	RoleName  string  `json:"role_name"`
	ClusterID *string `json:"cluster_id,omitempty"`
	Namespace *string `json:"namespace,omitempty"`
}

func (h *OIDCMappingHandlers) listMappings(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(r.Context(),
		`SELECT m.id, m.oidc_group, m.role_id, r.name, m.cluster_id, m.namespace, m.created_at
		 FROM oidc_role_mappings m
		 JOIN roles r ON m.role_id = r.id
		 ORDER BY m.oidc_group, r.name`)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list mappings")
		return
	}
	defer rows.Close()

	var mappings []mappingResponse
	for rows.Next() {
		var m mappingResponse
		if err := rows.Scan(&m.ID, &m.OIDCGroup, &m.RoleID, &m.RoleName, &m.ClusterID, &m.Namespace, &m.CreatedAt); err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, "failed to scan mapping")
			return
		}
		mappings = append(mappings, m)
	}
	if mappings == nil {
		mappings = []mappingResponse{}
	}
	httputil.WriteJSON(w, http.StatusOK, mappings)
}

func (h *OIDCMappingHandlers) createMapping(w http.ResponseWriter, r *http.Request) {
	var req createMappingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.OIDCGroup == "" || req.RoleName == "" {
		httputil.WriteError(w, http.StatusBadRequest, "oidc_group and role_name are required")
		return
	}

	// Look up the role ID first to avoid RETURNING issues with subquery literals
	var roleID string
	err := h.pool.QueryRow(r.Context(),
		`SELECT id FROM roles WHERE name = $1`, req.RoleName,
	).Scan(&roleID)
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "role not found: "+req.RoleName)
		return
	}

	var m mappingResponse
	err = h.pool.QueryRow(r.Context(),
		`INSERT INTO oidc_role_mappings (oidc_group, role_id, cluster_id, namespace)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, oidc_group, role_id, cluster_id, namespace, created_at`,
		req.OIDCGroup, roleID, req.ClusterID, req.Namespace,
	).Scan(&m.ID, &m.OIDCGroup, &m.RoleID, &m.ClusterID, &m.Namespace, &m.CreatedAt)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create mapping: "+err.Error())
		return
	}
	m.RoleName = req.RoleName

	httputil.WriteJSON(w, http.StatusCreated, m)
}

func (h *OIDCMappingHandlers) deleteMapping(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	result, err := h.pool.Exec(r.Context(),
		`DELETE FROM oidc_role_mappings WHERE id = $1`, id)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to delete mapping")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "mapping not found")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"message": "mapping deleted"})
}

func (h *OIDCMappingHandlers) getDefaultRole(w http.ResponseWriter, r *http.Request) {
	var raw []byte
	err := h.pool.QueryRow(r.Context(),
		`SELECT value FROM settings WHERE key = $1`, "oidc_default_role",
	).Scan(&raw)

	role := ""
	if err == nil {
		json.Unmarshal(raw, &role) //nolint:errcheck // best-effort decode
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"default_role": role})
}

func (h *OIDCMappingHandlers) updateDefaultRole(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DefaultRole string `json:"default_role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	raw, _ := json.Marshal(req.DefaultRole)
	_, err := h.pool.Exec(r.Context(),
		`INSERT INTO settings (key, value, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (key) DO UPDATE
		   SET value = EXCLUDED.value, updated_at = NOW()`,
		"oidc_default_role", raw,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to save default role")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"default_role": req.DefaultRole})
}
