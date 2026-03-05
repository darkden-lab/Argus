package rbac

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/httputil"
)

// RoleHandlers provides HTTP handlers for role management (CRUD + assignments).
type RoleHandlers struct {
	pool   *pgxpool.Pool
	engine *Engine
}

// NewRoleHandlers creates a new RoleHandlers with the given database pool and RBAC engine.
func NewRoleHandlers(pool *pgxpool.Pool, engine *Engine) *RoleHandlers {
	return &RoleHandlers{pool: pool, engine: engine}
}

// RegisterRoutes registers role management routes on the given router.
func (h *RoleHandlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/roles", h.handleListRoles).Methods("GET")
	r.HandleFunc("/api/roles", h.handleCreateRole).Methods("POST")
	r.HandleFunc("/api/roles/assignments", h.handleListAssignments).Methods("GET")
	r.HandleFunc("/api/roles/assign", h.handleAssignRole).Methods("POST")
	r.HandleFunc("/api/roles/revoke/{id}", h.handleRevokeRole).Methods("DELETE")
	r.HandleFunc("/api/roles/{id}", h.handleDeleteRole).Methods("DELETE")
	r.HandleFunc("/api/roles/{id}/permissions", h.handleListRolePermissions).Methods("GET")
	r.HandleFunc("/api/roles/{id}/permissions", h.handleAddRolePermission).Methods("POST")
	r.HandleFunc("/api/roles/{id}/permissions/{permId}", h.handleRemoveRolePermission).Methods("DELETE")
}

// --- Response types ---

type rolePermissionResponse struct {
	ID        string `json:"id"`
	Resource  string `json:"resource"`
	Action    string `json:"action"`
	ScopeType string `json:"scope_type"`
	ScopeID   string `json:"scope_id"`
}

type roleResponse struct {
	ID          string                   `json:"id"`
	Name        string                   `json:"name"`
	Description string                   `json:"description"`
	Permissions []rolePermissionResponse `json:"permissions"`
}

type assignmentResponse struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	RoleName    string `json:"role_name"`
	ClusterID   string `json:"cluster_id"`
	Namespace   string `json:"namespace"`
}

// --- Helpers ---

// requirePermission checks whether the caller has the given resource/action permission.
// Returns false and writes the appropriate error response if not allowed.
func (h *RoleHandlers) requirePermission(w http.ResponseWriter, r *http.Request, resource, action string) bool {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return false
	}

	allowed, err := h.engine.Evaluate(r.Context(), Request{
		UserID:   claims.UserID,
		Resource: resource,
		Action:   action,
	})
	if err != nil {
		log.Printf("ERROR: RBAC evaluation failed for user %s: %v", claims.UserID, err)
		httputil.WriteError(w, http.StatusInternalServerError, "permission check failed")
		return false
	}
	if !allowed {
		httputil.WriteError(w, http.StatusForbidden, "insufficient permissions")
		return false
	}
	return true
}

// --- Handlers ---

// handleListRoles returns all roles with their associated permissions.
func (h *RoleHandlers) handleListRoles(w http.ResponseWriter, r *http.Request) {
	if !h.requirePermission(w, r, "roles", "read") {
		return
	}

	query := `
		SELECT r.id, r.name, COALESCE(r.description, ''),
		       COALESCE(json_agg(json_build_object(
		           'id', rp.id::text,
		           'resource', rp.resource,
		           'action', rp.action,
		           'scope_type', rp.scope_type,
		           'scope_id', COALESCE(rp.scope_id, '')
		       )) FILTER (WHERE rp.id IS NOT NULL), '[]') as permissions
		FROM roles r
		LEFT JOIN role_permissions rp ON r.id = rp.role_id
		GROUP BY r.id, r.name, r.description, r.created_at
		ORDER BY r.created_at
	`

	rows, err := h.pool.Query(r.Context(), query)
	if err != nil {
		log.Printf("ERROR: failed to list roles: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list roles")
		return
	}
	defer rows.Close()

	roles := make([]roleResponse, 0)
	for rows.Next() {
		var role roleResponse
		var permsJSON []byte

		if err := rows.Scan(&role.ID, &role.Name, &role.Description, &permsJSON); err != nil {
			log.Printf("ERROR: failed to scan role: %v", err)
			httputil.WriteError(w, http.StatusInternalServerError, "failed to scan role")
			return
		}

		if err := json.Unmarshal(permsJSON, &role.Permissions); err != nil {
			log.Printf("ERROR: failed to unmarshal permissions for role %s: %v", role.Name, err)
			role.Permissions = []rolePermissionResponse{}
		}

		roles = append(roles, role)
	}

	if err := rows.Err(); err != nil {
		log.Printf("ERROR: failed to iterate roles: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list roles")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, roles)
}

// handleListAssignments returns all user-role assignments.
func (h *RoleHandlers) handleListAssignments(w http.ResponseWriter, r *http.Request) {
	if !h.requirePermission(w, r, "roles", "read") {
		return
	}
	query := `
		SELECT ur.id, u.email, COALESCE(u.display_name, ''), r.name,
		       COALESCE(ur.cluster_id::text, ''), COALESCE(ur.namespace, '')
		FROM user_roles ur
		JOIN users u ON ur.user_id = u.id
		JOIN roles r ON ur.role_id = r.id
		ORDER BY u.email, r.name
	`

	rows, err := h.pool.Query(r.Context(), query)
	if err != nil {
		log.Printf("ERROR: failed to list assignments: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list assignments")
		return
	}
	defer rows.Close()

	assignments := make([]assignmentResponse, 0)
	for rows.Next() {
		var a assignmentResponse
		if err := rows.Scan(&a.ID, &a.Email, &a.DisplayName, &a.RoleName, &a.ClusterID, &a.Namespace); err != nil {
			log.Printf("ERROR: failed to scan assignment: %v", err)
			httputil.WriteError(w, http.StatusInternalServerError, "failed to scan assignment")
			return
		}
		assignments = append(assignments, a)
	}

	if err := rows.Err(); err != nil {
		log.Printf("ERROR: failed to iterate assignments: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list assignments")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, assignments)
}

// handleAssignRole assigns a role to a user, optionally scoped to a cluster/namespace.
func (h *RoleHandlers) handleAssignRole(w http.ResponseWriter, r *http.Request) {
	if !h.requirePermission(w, r, "roles", "write") {
		return
	}

	var req struct {
		UserEmail string `json:"user_email"`
		RoleName  string `json:"role_name"`
		ClusterID string `json:"cluster_id"`
		Namespace string `json:"namespace"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.UserEmail == "" || req.RoleName == "" {
		httputil.WriteError(w, http.StatusBadRequest, "user_email and role_name are required")
		return
	}

	ctx := r.Context()

	// Look up user by email
	var userID string
	err := h.pool.QueryRow(ctx, "SELECT id FROM users WHERE email = $1", req.UserEmail).Scan(&userID)
	if err != nil {
		log.Printf("WARNING: user not found for email %s: %v", req.UserEmail, err)
		httputil.WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	// Look up role by name
	var roleID string
	err = h.pool.QueryRow(ctx, "SELECT id FROM roles WHERE name = $1", req.RoleName).Scan(&roleID)
	if err != nil {
		log.Printf("WARNING: role not found for name %s: %v", req.RoleName, err)
		httputil.WriteError(w, http.StatusNotFound, "role not found")
		return
	}

	// Validate cluster_id if provided
	if req.ClusterID != "" {
		var exists string
		err = h.pool.QueryRow(ctx, "SELECT id FROM clusters WHERE id = $1", req.ClusterID).Scan(&exists)
		if err != nil {
			if err == pgx.ErrNoRows {
				httputil.WriteError(w, http.StatusBadRequest, "cluster_id does not exist")
			} else {
				log.Printf("ERROR: failed to validate cluster_id %s: %v", req.ClusterID, err)
				httputil.WriteError(w, http.StatusInternalServerError, "failed to validate cluster")
			}
			return
		}
	}

	// Insert into user_roles
	var clusterIDParam interface{}
	if req.ClusterID != "" {
		clusterIDParam = req.ClusterID
	}

	var namespaceParam interface{}
	if req.Namespace != "" {
		namespaceParam = req.Namespace
	}

	var assignmentID string
	err = h.pool.QueryRow(ctx,
		`INSERT INTO user_roles (user_id, role_id, cluster_id, namespace)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id`,
		userID, roleID, clusterIDParam, namespaceParam,
	).Scan(&assignmentID)
	if err != nil {
		log.Printf("ERROR: failed to assign role: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to assign role")
		return
	}

	// Invalidate RBAC cache for the user
	h.engine.InvalidateCache(userID)

	httputil.WriteJSON(w, http.StatusCreated, map[string]string{
		"id":      assignmentID,
		"message": "role assigned successfully",
	})
}

// handleRevokeRole removes a user-role assignment by its ID.
func (h *RoleHandlers) handleRevokeRole(w http.ResponseWriter, r *http.Request) {
	if !h.requirePermission(w, r, "roles", "write") {
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]
	if id == "" {
		httputil.WriteError(w, http.StatusBadRequest, "assignment id is required")
		return
	}

	ctx := r.Context()

	// Look up user_id first so we can invalidate the cache
	var userID string
	err := h.pool.QueryRow(ctx, "SELECT user_id FROM user_roles WHERE id = $1", id).Scan(&userID)
	if err != nil {
		log.Printf("WARNING: assignment not found for id %s: %v", id, err)
		httputil.WriteError(w, http.StatusNotFound, "assignment not found")
		return
	}

	// Delete the assignment
	_, err = h.pool.Exec(ctx, "DELETE FROM user_roles WHERE id = $1", id)
	if err != nil {
		log.Printf("ERROR: failed to revoke role: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to revoke role")
		return
	}

	// Invalidate RBAC cache for the user
	h.engine.InvalidateCache(userID)

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"message": "role revoked successfully"})
}

// handleCreateRole creates a new custom role. Built-in role names are protected.
func (h *RoleHandlers) handleCreateRole(w http.ResponseWriter, r *http.Request) {
	if !h.requirePermission(w, r, "roles", "write") {
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}

	builtInRoles := map[string]bool{"admin": true, "operator": true, "developer": true, "viewer": true}
	if builtInRoles[req.Name] {
		httputil.WriteError(w, http.StatusBadRequest, "cannot create role with reserved name")
		return
	}

	var id string
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id`,
		req.Name, req.Description,
	).Scan(&id)
	if err != nil {
		log.Printf("ERROR: failed to create role: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to create role")
		return
	}
	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": id, "message": "role created"})
}

// handleDeleteRole deletes a custom role. Built-in roles cannot be deleted.
func (h *RoleHandlers) handleDeleteRole(w http.ResponseWriter, r *http.Request) {
	if !h.requirePermission(w, r, "roles", "write") {
		return
	}

	id := mux.Vars(r)["id"]

	var name string
	err := h.pool.QueryRow(r.Context(), "SELECT name FROM roles WHERE id = $1", id).Scan(&name)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "role not found")
		return
	}

	builtInRoles := map[string]bool{"admin": true, "operator": true, "developer": true, "viewer": true}
	if builtInRoles[name] {
		httputil.WriteError(w, http.StatusBadRequest, "cannot delete built-in role")
		return
	}

	h.engine.InvalidateUsersWithRole(r.Context(), id)

	_, err = h.pool.Exec(r.Context(), "DELETE FROM roles WHERE id = $1", id)
	if err != nil {
		log.Printf("ERROR: failed to delete role: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to delete role")
		return
	}
	httputil.WriteJSON(w, http.StatusOK, map[string]string{"message": "role deleted"})
}

// handleListRolePermissions returns all permissions for a specific role.
func (h *RoleHandlers) handleListRolePermissions(w http.ResponseWriter, r *http.Request) {
	if !h.requirePermission(w, r, "roles", "read") {
		return
	}

	roleID := mux.Vars(r)["id"]

	rows, err := h.pool.Query(r.Context(),
		`SELECT id::text, resource, action, scope_type, COALESCE(scope_id, '')
		 FROM role_permissions WHERE role_id = $1 ORDER BY resource, action`,
		roleID)
	if err != nil {
		log.Printf("ERROR: failed to list role permissions: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list permissions")
		return
	}
	defer rows.Close()

	perms := make([]rolePermissionResponse, 0)
	for rows.Next() {
		var p rolePermissionResponse
		if err := rows.Scan(&p.ID, &p.Resource, &p.Action, &p.ScopeType, &p.ScopeID); err != nil {
			log.Printf("ERROR: failed to scan permission: %v", err)
			httputil.WriteError(w, http.StatusInternalServerError, "failed to scan permission")
			return
		}
		perms = append(perms, p)
	}
	httputil.WriteJSON(w, http.StatusOK, perms)
}

// handleAddRolePermission adds a permission to a role.
func (h *RoleHandlers) handleAddRolePermission(w http.ResponseWriter, r *http.Request) {
	if !h.requirePermission(w, r, "roles", "write") {
		return
	}

	roleID := mux.Vars(r)["id"]

	var req struct {
		Resource  string `json:"resource"`
		Action    string `json:"action"`
		ScopeType string `json:"scope_type"`
		ScopeID   string `json:"scope_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Resource == "" || req.Action == "" || req.ScopeType == "" {
		httputil.WriteError(w, http.StatusBadRequest, "resource, action, and scope_type are required")
		return
	}

	var scopeID interface{}
	if req.ScopeID != "" {
		scopeID = req.ScopeID
	}

	var permID string
	err := h.pool.QueryRow(r.Context(),
		`INSERT INTO role_permissions (role_id, resource, action, scope_type, scope_id)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT DO NOTHING
		 RETURNING id::text`,
		roleID, req.Resource, req.Action, req.ScopeType, scopeID,
	).Scan(&permID)
	if err != nil {
		log.Printf("ERROR: failed to add permission: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to add permission")
		return
	}

	h.engine.InvalidateUsersWithRole(r.Context(), roleID)

	httputil.WriteJSON(w, http.StatusCreated, map[string]string{"id": permID, "message": "permission added"})
}

// handleRemoveRolePermission removes a specific permission from a role.
func (h *RoleHandlers) handleRemoveRolePermission(w http.ResponseWriter, r *http.Request) {
	if !h.requirePermission(w, r, "roles", "write") {
		return
	}

	vars := mux.Vars(r)
	roleID := vars["id"]
	permID := vars["permId"]

	result, err := h.pool.Exec(r.Context(),
		"DELETE FROM role_permissions WHERE id = $1 AND role_id = $2",
		permID, roleID)
	if err != nil {
		log.Printf("ERROR: failed to remove permission: %v", err)
		httputil.WriteError(w, http.StatusInternalServerError, "failed to remove permission")
		return
	}
	if result.RowsAffected() == 0 {
		httputil.WriteError(w, http.StatusNotFound, "permission not found")
		return
	}

	h.engine.InvalidateUsersWithRole(r.Context(), roleID)

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"message": "permission removed"})
}
