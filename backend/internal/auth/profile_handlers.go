package auth

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// ProfileHandlers provides HTTP handlers for user profile and preferences management.
type ProfileHandlers struct {
	service *AuthService
	pool    *pgxpool.Pool
}

// NewProfileHandlers creates a new ProfileHandlers instance.
func NewProfileHandlers(service *AuthService, pool *pgxpool.Pool) *ProfileHandlers {
	return &ProfileHandlers{service: service, pool: pool}
}

// RegisterRoutes registers profile routes on the given protected router.
func (h *ProfileHandlers) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/users/me", h.handleUpdateProfile).Methods("PATCH")
	r.HandleFunc("/api/users/me/password", h.handleChangePassword).Methods("PATCH")
	r.HandleFunc("/api/users/me/preferences", h.handleGetPreferences).Methods("GET")
	r.HandleFunc("/api/users/me/preferences", h.handleSetPreferences).Methods("PUT")
}

// UserPreferences represents user display and behavior preferences.
type UserPreferences struct {
	Theme             string `json:"theme"`
	Language          string `json:"language"`
	SidebarCompact    bool   `json:"sidebar_compact"`
	AnimationsEnabled bool   `json:"animations_enabled"`
}

// handleUpdateProfile updates the authenticated user's display_name and/or email.
// OIDC users cannot change their email.
func (h *ProfileHandlers) handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "unauthorized"})
		return
	}

	var req struct {
		DisplayName string `json:"display_name"`
		Email       string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}

	ctx := r.Context()

	var authProvider string
	err := h.pool.QueryRow(ctx, "SELECT auth_provider FROM users WHERE id = $1", claims.UserID).Scan(&authProvider)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to fetch user"})
		return
	}

	if req.Email != "" && authProvider == "oidc" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "OIDC users cannot change their email"})
		return
	}
	if req.Email != "" {
		if _, err := mail.ParseAddress(req.Email); err != nil {
			writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid email format"})
			return
		}
	}

	setClauses := []string{}
	args := []interface{}{}
	argIdx := 1
	if req.DisplayName != "" {
		setClauses = append(setClauses, fmt.Sprintf("display_name = $%d", argIdx))
		args = append(args, req.DisplayName)
		argIdx++
	}
	if req.Email != "" {
		setClauses = append(setClauses, fmt.Sprintf("email = $%d", argIdx))
		args = append(args, req.Email)
		argIdx++
	}
	if len(setClauses) == 0 {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "no fields to update"})
		return
	}
	args = append(args, claims.UserID)

	query := "UPDATE users SET " + strings.Join(setClauses, ", ") + fmt.Sprintf(" WHERE id = $%d RETURNING id, email, display_name, auth_provider, created_at", argIdx)

	var user User
	err = h.pool.QueryRow(ctx, query, args...).Scan(&user.ID, &user.Email, &user.DisplayName, &user.AuthProvider, &user.CreatedAt)
	if err != nil {
		log.Printf("ERROR: failed to update profile for user %s: %v", claims.UserID, err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to update profile"})
		return
	}

	writeJSON(w, http.StatusOK, user)
}

// handleChangePassword changes the authenticated user's password.
// OIDC users cannot change their password. Requires current_password.
func (h *ProfileHandlers) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "unauthorized"})
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "current_password and new_password are required"})
		return
	}
	if len(req.NewPassword) < 8 {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "new password must be at least 8 characters"})
		return
	}

	ctx := r.Context()

	var authProvider, passwordHash string
	err := h.pool.QueryRow(ctx,
		"SELECT auth_provider, COALESCE(password_hash, '') FROM users WHERE id = $1",
		claims.UserID,
	).Scan(&authProvider, &passwordHash)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to fetch user"})
		return
	}
	if authProvider == "oidc" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "OIDC users cannot change their password"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.CurrentPassword)); err != nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "current password is incorrect"})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to hash password"})
		return
	}

	_, err = h.pool.Exec(ctx, "UPDATE users SET password_hash = $1 WHERE id = $2", string(newHash), claims.UserID)
	if err != nil {
		log.Printf("ERROR: failed to change password for user %s: %v", claims.UserID, err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to change password"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "password changed successfully"})
}

// handleGetPreferences returns the authenticated user's preferences.
// Returns defaults if no preferences have been saved yet.
func (h *ProfileHandlers) handleGetPreferences(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "unauthorized"})
		return
	}

	prefs := UserPreferences{
		Theme:             "system",
		Language:          "en",
		SidebarCompact:    false,
		AnimationsEnabled: true,
	}

	err := h.pool.QueryRow(r.Context(),
		"SELECT theme, language, sidebar_compact, animations_enabled FROM user_preferences WHERE user_id = $1",
		claims.UserID,
	).Scan(&prefs.Theme, &prefs.Language, &prefs.SidebarCompact, &prefs.AnimationsEnabled)
	if err != nil {
		// No preferences row yet — return defaults (not an error)
		writeJSON(w, http.StatusOK, prefs)
		return
	}

	writeJSON(w, http.StatusOK, prefs)
}

// handleSetPreferences saves (upserts) the authenticated user's preferences.
func (h *ProfileHandlers) handleSetPreferences(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "unauthorized"})
		return
	}

	var req UserPreferences
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}

	validThemes := map[string]bool{"dark": true, "light": true, "system": true}
	if req.Theme != "" && !validThemes[req.Theme] {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid theme value"})
		return
	}
	if req.Theme == "" {
		req.Theme = "system"
	}
	if req.Language == "" {
		req.Language = "en"
	}

	_, err := h.pool.Exec(r.Context(),
		`INSERT INTO user_preferences (user_id, theme, language, sidebar_compact, animations_enabled, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (user_id) DO UPDATE SET
		     theme = EXCLUDED.theme,
		     language = EXCLUDED.language,
		     sidebar_compact = EXCLUDED.sidebar_compact,
		     animations_enabled = EXCLUDED.animations_enabled,
		     updated_at = EXCLUDED.updated_at`,
		claims.UserID, req.Theme, req.Language, req.SidebarCompact, req.AnimationsEnabled, time.Now(),
	)
	if err != nil {
		log.Printf("ERROR: failed to save preferences for user %s: %v", claims.UserID, err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to save preferences"})
		return
	}

	writeJSON(w, http.StatusOK, req)
}
