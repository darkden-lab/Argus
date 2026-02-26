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
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/db"
	"golang.org/x/oauth2"
)

// OIDCConfig holds the configuration needed to set up OIDC.
type OIDCConfig struct {
	Issuer       string
	ClientID     string
	ClientSecret string
	RedirectURL  string
	FrontendURL  string
}

// oidcStateEntry holds a state value with its expiry time.
type oidcStateEntry struct {
	expiry time.Time
}

// oidcStates stores OIDC state parameters in memory with TTL.
var oidcStates sync.Map

var stateCleanupOnce sync.Once

func startStateCleanup() {
	stateCleanupOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(1 * time.Hour)
			defer ticker.Stop()
			for range ticker.C {
				now := time.Now()
				oidcStates.Range(func(key, value interface{}) bool {
					entry := value.(oidcStateEntry)
					if now.After(entry.expiry) {
						oidcStates.Delete(key)
					}
					return true
				})
			}
		}()
	})
}

// OIDCService handles OIDC authentication flows.
type OIDCService struct {
	mu           sync.RWMutex
	provider     *oidc.Provider
	oauth2Config oauth2.Config
	verifier     *oidc.IDTokenVerifier
	db           *db.DB
	pool         *pgxpool.Pool
	jwt          *JWTService
	frontendURL  string
	groupMapper  *OIDCGroupMapper
}

// NewOIDCService creates a new OIDCService. Returns nil, nil if OIDC is not configured.
func NewOIDCService(ctx context.Context, cfg OIDCConfig, database *db.DB, jwtService *JWTService, pool *pgxpool.Pool) (*OIDCService, error) {
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

	frontendURL := cfg.FrontendURL
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	startStateCleanup()

	return &OIDCService{
		provider:     provider,
		oauth2Config: oauth2Cfg,
		verifier:     verifier,
		db:           database,
		pool:         pool,
		jwt:          jwtService,
		frontendURL:  frontendURL,
		groupMapper:  NewOIDCGroupMapper(pool),
	}, nil
}

// Enabled returns true if OIDC is configured.
func (s *OIDCService) Enabled() bool {
	if s == nil {
		return false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.provider != nil
}

// Reload reads the OIDC configuration from the database and recreates the
// provider, oauth2 config, and verifier. This allows runtime config changes
// without restarting the server.
func (s *OIDCService) Reload(ctx context.Context, pool *pgxpool.Pool) error {
	if s == nil || pool == nil {
		return nil
	}

	var raw []byte
	err := pool.QueryRow(ctx, "SELECT value FROM settings WHERE key = $1", "oidc").Scan(&raw)
	if err != nil {
		return fmt.Errorf("failed to read OIDC config from DB: %w", err)
	}

	var cfg struct {
		Enabled      bool   `json:"enabled"`
		IssuerURL    string `json:"issuer_url"`
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
		RedirectURL  string `json:"redirect_url"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return fmt.Errorf("failed to parse OIDC config: %w", err)
	}

	if !cfg.Enabled || cfg.IssuerURL == "" || cfg.ClientID == "" {
		// OIDC disabled — clear the provider
		s.mu.Lock()
		s.provider = nil
		s.mu.Unlock()
		log.Println("oidc: reload — OIDC disabled")
		return nil
	}

	provider, err := oidc.NewProvider(ctx, cfg.IssuerURL)
	if err != nil {
		return fmt.Errorf("failed to discover OIDC provider at %s: %w", cfg.IssuerURL, err)
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

	s.mu.Lock()
	s.provider = provider
	s.oauth2Config = oauth2Cfg
	s.verifier = verifier
	s.mu.Unlock()

	log.Printf("oidc: reload — provider reconfigured (issuer=%s)", cfg.IssuerURL)
	return nil
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

	s.mu.RLock()
	url := s.oauth2Config.AuthCodeURL(state)
	s.mu.RUnlock()
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

	s.mu.RLock()
	oauth2Cfg := s.oauth2Config
	verifier := s.verifier
	s.mu.RUnlock()

	oauth2Token, err := oauth2Cfg.Exchange(r.Context(), code)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to exchange authorization code"})
		return
	}

	rawIDToken, ok := oauth2Token.Extra("id_token").(string)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "no id_token in response"})
		return
	}

	idToken, err := verifier.Verify(r.Context(), rawIDToken)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, errorResponse{Error: "invalid ID token"})
		return
	}

	var claims struct {
		Subject string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Groups  []string
	}

	// Extract standard claims (sub, email, name)
	if err := idToken.Claims(&claims); err != nil {
		writeJSON(w, http.StatusInternalServerError, errorResponse{Error: "failed to extract claims"})
		return
	}

	// Extract groups from a dynamic claim name (configurable via OIDC settings).
	// Use allClaims map to support configurable claim names (not just "groups").
	groupsClaim := "groups" // default
	if s.pool != nil {
		var raw []byte
		if err := s.pool.QueryRow(r.Context(), "SELECT value FROM settings WHERE key = $1", "oidc").Scan(&raw); err == nil {
			var oidcCfg struct {
				GroupsClaim string `json:"groups_claim"`
			}
			if json.Unmarshal(raw, &oidcCfg) == nil && oidcCfg.GroupsClaim != "" {
				groupsClaim = oidcCfg.GroupsClaim
			}
		}
	}

	var allClaims map[string]interface{}
	if err := idToken.Claims(&allClaims); err == nil {
		if groupsRaw, ok := allClaims[groupsClaim]; ok {
			if groupsList, ok := groupsRaw.([]interface{}); ok {
				for _, g := range groupsList {
					if gs, ok := g.(string); ok {
						claims.Groups = append(claims.Groups, gs)
					}
				}
			}
		}
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

	// Map OIDC groups to RBAC roles
	if len(claims.Groups) > 0 {
		if err := s.groupMapper.MapGroupsToRoles(r.Context(), user.ID, claims.Groups); err != nil {
			log.Printf("oidc: failed to map groups to roles: %v", err)
		}
	}

	// Apply default role if user has no roles
	if err := s.groupMapper.ApplyDefaultRole(r.Context(), user.ID); err != nil {
		log.Printf("oidc: failed to apply default role: %v", err)
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

	// Redirect to frontend with tokens in URL fragment (not sent to server in Referer)
	redirectURL := fmt.Sprintf("%s/auth/oidc/callback#access_token=%s&refresh_token=%s",
		s.frontendURL, accessToken, refreshToken)
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

// HandleProviderInfo returns OIDC provider configuration for the frontend.
func (s *OIDCService) HandleProviderInfo(w http.ResponseWriter, r *http.Request) {
	info := map[string]interface{}{
		"enabled": s.Enabled(),
	}
	if s.Enabled() {
		info["authorize_url"] = "/api/auth/oidc/authorize"
		// Read provider_name from settings DB
		if s.pool != nil {
			var raw []byte
			err := s.pool.QueryRow(r.Context(),
				"SELECT value FROM settings WHERE key = $1", "oidc",
			).Scan(&raw)
			if err == nil {
				var oidcSettings struct {
					ProviderName string `json:"provider_name"`
				}
				if json.Unmarshal(raw, &oidcSettings) == nil && oidcSettings.ProviderName != "" {
					info["provider_name"] = oidcSettings.ProviderName
				}
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(info)
}

// generateState creates a cryptographically random state parameter and stores it in the database.
func (s *OIDCService) generateState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	state := base64.URLEncoding.EncodeToString(b)

	if err := s.storeState(state, time.Now().Add(10*time.Minute)); err != nil {
		return "", fmt.Errorf("failed to store OIDC state: %w", err)
	}

	return state, nil
}

// storeState persists an OIDC state parameter in memory with an expiry time.
func (s *OIDCService) storeState(state string, expiry time.Time) error {
	oidcStates.Store(state, oidcStateEntry{expiry: expiry})
	return nil
}

// validateState checks if a state parameter is valid and removes it.
func (s *OIDCService) validateState(state string) bool {
	val, ok := oidcStates.LoadAndDelete(state)
	if !ok {
		return false
	}
	entry := val.(oidcStateEntry)
	return time.Now().Before(entry.expiry)
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
