package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/db"
	"golang.org/x/oauth2"
)

// OIDCConfig holds the configuration needed to set up OIDC.
type OIDCConfig struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

// OIDCService handles OIDC authentication flows.
type OIDCService struct {
	provider     *oidc.Provider
	oauth2Config oauth2.Config
	verifier     *oidc.IDTokenVerifier
	db           *db.DB
	jwt          *JWTService
	states       map[string]time.Time
	mu           sync.Mutex
}

// NewOIDCService creates a new OIDCService. Returns nil, nil if OIDC is not configured.
func NewOIDCService(ctx context.Context, cfg OIDCConfig, database *db.DB, jwtService *JWTService) (*OIDCService, error) {
	if cfg.Issuer == "" || cfg.ClientID == "" {
		return nil, nil
	}

	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return nil, fmt.Errorf("failed to discover OIDC provider: %w", err)
	}

	oauth2Cfg := oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  cfg.RedirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}

	verifier := provider.Verifier(&oidc.Config{
		ClientID: cfg.ClientID,
	})

	return &OIDCService{
		provider:     provider,
		oauth2Config: oauth2Cfg,
		verifier:     verifier,
		db:           database,
		jwt:          jwtService,
		states:       make(map[string]time.Time),
	}, nil
}

// Enabled returns true if OIDC is configured.
func (s *OIDCService) Enabled() bool {
	return s != nil && s.provider != nil
}

// RegisterRoutes registers OIDC endpoints on the router (no auth middleware required).
func (s *OIDCService) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/auth/oidc/authorize", s.HandleAuthorize).Methods("GET")
	r.HandleFunc("/api/auth/oidc/callback", s.HandleCallback).Methods("GET")
	r.HandleFunc("/api/auth/oidc/info", s.HandleProviderInfo).Methods("GET")
}

// HandleAuthorize redirects the user to the OIDC provider's authorize endpoint.
func (s *OIDCService) HandleAuthorize(w http.ResponseWriter, r *http.Request) {
	state, err := s.generateState()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to generate state"})
		return
	}

	url := s.oauth2Config.AuthCodeURL(state)
	http.Redirect(w, r, url, http.StatusFound)
}

// HandleCallback processes the OIDC callback, exchanges the code for tokens,
// validates the ID token, upserts the user, and issues a JWT.
func (s *OIDCService) HandleCallback(w http.ResponseWriter, r *http.Request) {
	state := r.URL.Query().Get("state")
	if !s.validateState(state) {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "invalid state parameter"})
		return
	}

	if errParam := r.URL.Query().Get("error"); errParam != "" {
		desc := r.URL.Query().Get("error_description")
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: fmt.Sprintf("OIDC error: %s - %s", errParam, desc)})
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "missing authorization code"})
		return
	}

	oauth2Token, err := s.oauth2Config.Exchange(r.Context(), code)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to exchange authorization code"})
		return
	}

	rawIDToken, ok := oauth2Token.Extra("id_token").(string)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "no id_token in response"})
		return
	}

	idToken, err := s.verifier.Verify(r.Context(), rawIDToken)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "invalid ID token"})
		return
	}

	var claims struct {
		Subject string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to extract claims"})
		return
	}

	if claims.Email == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "email claim is required"})
		return
	}
	if claims.Name == "" {
		claims.Name = claims.Email
	}

	user, err := s.upsertOIDCUser(r.Context(), claims.Subject, claims.Email, claims.Name)
	if err != nil {
		log.Printf("oidc: failed to upsert user: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to create/update user"})
		return
	}

	accessToken, err := s.jwt.GenerateToken(user.ID, user.Email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to generate access token"})
		return
	}

	refreshToken, err := s.jwt.GenerateRefreshToken(user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to generate refresh token"})
		return
	}

	// Redirect to frontend with tokens as query params
	frontendURL := fmt.Sprintf("http://localhost:3000/auth/callback?access_token=%s&refresh_token=%s",
		accessToken, refreshToken)
	http.Redirect(w, r, frontendURL, http.StatusFound)
}

// HandleProviderInfo returns OIDC provider configuration for the frontend.
func (s *OIDCService) HandleProviderInfo(w http.ResponseWriter, r *http.Request) {
	info := map[string]interface{}{
		"enabled": s.Enabled(),
	}
	if s.Enabled() {
		info["authorize_url"] = "/api/auth/oidc/authorize"
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(info)
}

// generateState creates a cryptographically random state parameter.
func (s *OIDCService) generateState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	state := base64.URLEncoding.EncodeToString(b)

	s.mu.Lock()
	s.states[state] = time.Now().Add(10 * time.Minute)
	for k, v := range s.states {
		if time.Now().After(v) {
			delete(s.states, k)
		}
	}
	s.mu.Unlock()

	return state, nil
}

// validateState checks if a state parameter is valid and removes it.
func (s *OIDCService) validateState(state string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	expiry, ok := s.states[state]
	if !ok {
		return false
	}
	delete(s.states, state)
	return time.Now().Before(expiry)
}

// upsertOIDCUser creates or updates a user from OIDC claims.
func (s *OIDCService) upsertOIDCUser(ctx context.Context, subject, email, displayName string) (*User, error) {
	var user User
	err := s.db.Pool.QueryRow(ctx,
		`INSERT INTO users (email, display_name, auth_provider, oidc_subject)
		 VALUES ($1, $2, 'oidc', $3)
		 ON CONFLICT (email)
		 DO UPDATE SET
			display_name = EXCLUDED.display_name,
			oidc_subject = EXCLUDED.oidc_subject,
			last_login = NOW()
		 RETURNING id, email, display_name, auth_provider, created_at, last_login`,
		email, displayName, subject,
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.AuthProvider, &user.CreatedAt, &user.LastLogin)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert OIDC user: %w", err)
	}
	return &user, nil
}
