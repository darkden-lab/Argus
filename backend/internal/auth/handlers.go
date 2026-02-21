package auth

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

type Handlers struct {
	service *AuthService
}

func NewHandlers(service *AuthService) *Handlers {
	return &Handlers{service: service}
}

// RegisterRoutes registers public auth routes (no auth middleware required).
func (h *Handlers) RegisterRoutes(r *mux.Router) {
	api := r.PathPrefix("/api/auth").Subrouter()
	api.HandleFunc("/login", h.handleLogin).Methods("POST")
	api.HandleFunc("/refresh", h.handleRefresh).Methods("POST")
}

// RegisterProtectedRoutes registers auth routes that require authentication.
func (h *Handlers) RegisterProtectedRoutes(r *mux.Router) {
	r.HandleFunc("/api/auth/me", h.handleMe).Methods("GET")
	r.HandleFunc("/api/auth/logout", h.handleLogout).Methods("POST")
}

type registerRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type logoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type authResponse struct {
	User         *User  `json:"user,omitempty"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

type errorResponse struct {
	Error string `json:"error"`
}

func (h *Handlers) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
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
		writeJSON(w, http.StatusConflict, errorResponse{Error: "user already exists or registration failed"})
		return
	}

	accessToken, err := h.service.jwt.GenerateToken(user.ID, user.Email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to generate token"})
		return
	}

	refreshToken, err := h.service.jwt.GenerateRefreshToken(user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to generate refresh token"})
		return
	}

	writeJSON(w, http.StatusCreated, authResponse{
		User:         user,
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	})
}

func (h *Handlers) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}

	if req.Email == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "email and password are required"})
		return
	}

	accessToken, refreshToken, err := h.service.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "invalid credentials"})
		return
	}

	writeJSON(w, http.StatusOK, authResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	})
}

func (h *Handlers) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}

	if req.RefreshToken == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "refresh_token is required"})
		return
	}

	accessToken, err := h.service.RefreshToken(r.Context(), req.RefreshToken)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "invalid refresh token"})
		return
	}

	writeJSON(w, http.StatusOK, authResponse{
		AccessToken: accessToken,
	})
}

func (h *Handlers) handleMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "unauthorized"})
		return
	}

	user, err := h.service.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errorResponse{Error: "user not found"})
		return
	}

	writeJSON(w, http.StatusOK, user)
}

func (h *Handlers) handleLogout(w http.ResponseWriter, r *http.Request) {
	var req logoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid request body"})
		return
	}

	if req.RefreshToken == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "refresh_token is required"})
		return
	}

	if err := h.service.RevokeRefreshToken(r.Context(), req.RefreshToken); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "failed to revoke token"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "logged out successfully"})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
