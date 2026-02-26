package auth

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/darkden-lab/argus/backend/internal/httputil"
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

func (h *Handlers) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" {
		httputil.WriteError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	accessToken, refreshToken, err := h.service.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		httputil.WriteError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, authResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	})
}

func (h *Handlers) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.RefreshToken == "" {
		httputil.WriteError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	accessToken, err := h.service.RefreshToken(r.Context(), req.RefreshToken)
	if err != nil {
		httputil.WriteError(w, http.StatusUnauthorized, "invalid refresh token")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, authResponse{
		AccessToken: accessToken,
	})
}

func (h *Handlers) handleMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		httputil.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	user, err := h.service.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "user not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, user)
}

func (h *Handlers) handleLogout(w http.ResponseWriter, r *http.Request) {
	var req logoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.RefreshToken == "" {
		httputil.WriteError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	if err := h.service.RevokeRefreshToken(r.Context(), req.RefreshToken); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "failed to revoke token")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"message": "logged out successfully"})
}

// writeJSON is a package-internal convenience wrapper around httputil.WriteJSON,
// kept for compatibility with oidc.go and user_handlers.go callers.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	httputil.WriteJSON(w, status, data)
}
