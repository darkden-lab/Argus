package auth

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

// UserManagementHandlers provides HTTP handlers for user CRUD operations.
type UserManagementHandlers struct {
	service *AuthService
}

// NewUserManagementHandlers creates a new UserManagementHandlers instance.
func NewUserManagementHandlers(service *AuthService) *UserManagementHandlers {
	return &UserManagementHandlers{service: service}
}

// RegisterRoutes registers user management routes on the given router.
// These routes should be mounted on a protected (authenticated) subrouter.
func (h *UserManagementHandlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/users", h.handleListUsers).Methods("GET")
	r.HandleFunc("/api/users", h.handleCreateUser).Methods("POST")
	r.HandleFunc("/api/users/{id}", h.handleDeleteUser).Methods("DELETE")
}

type createUserRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

// handleListUsers returns all users in the system.
func (h *UserManagementHandlers) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.service.ListUsers(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to list users"})
		return
	}

	writeJSON(w, http.StatusOK, users)
}

// handleCreateUser creates a new local user account.
func (h *UserManagementHandlers) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}

	if req.Email == "" || req.Password == "" || req.DisplayName == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "email, password, and display_name are required"})
		return
	}

	user, err := h.service.Register(r.Context(), req.Email, req.Password, req.DisplayName)
	if err != nil {
		writeJSON(w, http.StatusConflict, errorResponse{Error: "user already exists or creation failed"})
		return
	}

	writeJSON(w, http.StatusCreated, user)
}

// handleDeleteUser deletes a user by ID. Users cannot delete themselves.
func (h *UserManagementHandlers) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
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
		if err.Error() == "user not found" {
			writeJSON(w, http.StatusNotFound, errorResponse{Error: "user not found"})
			return
		}
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to delete user"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "user deleted"})
}
