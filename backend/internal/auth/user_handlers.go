package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserManagementHandlers provides HTTP handlers for user CRUD operations.
type UserManagementHandlers struct {
	service *AuthService
	pool    *pgxpool.Pool
}

// NewUserManagementHandlers creates a new UserManagementHandlers instance.
func NewUserManagementHandlers(service *AuthService, pool *pgxpool.Pool) *UserManagementHandlers {
	return &UserManagementHandlers{service: service, pool: pool}
}

// RegisterRoutes registers user management routes on the given router.
// These routes should be mounted on a protected (authenticated) subrouter.
func (h *UserManagementHandlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/users", h.handleListUsers).Methods("GET")
	r.HandleFunc("/api/users", h.handleCreateUser).Methods("POST")
	r.HandleFunc("/api/users/{id}", h.handleDeleteUser).Methods("DELETE")
}

// requireAdmin checks if the requesting user has the admin role. Returns true
// if the user is authorized, false if a response was already written.
func (h *UserManagementHandlers) requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "unauthorized"})
		return false
	}

	if h.pool == nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "service unavailable"})
		return false
	}

	var exists bool
	err := h.pool.QueryRow(r.Context(),
		`SELECT EXISTS(
			SELECT 1 FROM roles r
			JOIN user_roles ur ON ur.role_id = r.id
			WHERE ur.user_id = $1 AND r.name = 'admin'
		)`, claims.UserID).Scan(&exists)
	if err != nil || !exists {
		writeJSON(w, http.StatusForbidden, errorResponse{Error: "admin role required"})
		return false
	}
	return true
}

type createUserRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// handleListUsers returns all users in the system. Requires admin role.
func (h *UserManagementHandlers) handleListUsers(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}

	users, err := h.service.ListUsers(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to list users"})
		return
	}

	writeJSON(w, http.StatusOK, users)
}

// handleCreateUser creates a new local user account. Requires admin role.
func (h *UserManagementHandlers) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}

	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}

	if req.Email == "" || req.Password == "" || req.DisplayName == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "email, password, and display_name are required"})
		return
	}

	if _, err := mail.ParseAddress(req.Email); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid email format"})
		return
	}

	if len(req.Password) < 8 {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "password must be at least 8 characters"})
		return
	}

	user, err := h.service.Register(r.Context(), req.Email, req.Password, req.DisplayName)
	if err != nil {
		writeJSON(w, http.StatusConflict, errorResponse{Error: "user already exists or creation failed"})
		return
	}

	writeJSON(w, http.StatusCreated, user)
}

// handleDeleteUser deletes a user by ID. Requires admin role. Users cannot delete themselves.
func (h *UserManagementHandlers) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]
	if id == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "user id is required"})
		return
	}

	// Prevent self-deletion
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "unauthorized"})
		return
	}
	if claims.UserID == id {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "cannot delete your own account"})
		return
	}

	if err := h.service.DeleteUser(r.Context(), id); err != nil {
		if errors.Is(err, ErrUserNotFound) {
			writeJSON(w, http.StatusNotFound, errorResponse{Error: "user not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to delete user"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "user deleted"})
}
