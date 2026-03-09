package sse

import (
	"context"
	"net/http"
	"strings"

	"github.com/darkden-lab/argus/backend/internal/auth"
)

// Authenticate extracts and validates auth credentials from an HTTP request.
// Supports: Authorization: Bearer <jwt>, ?token=<jwt>, ?apiKey=<key>.
// Returns claims on success, or writes a 401 error and returns nil.
func Authenticate(r *http.Request, jwtService *auth.JWTService, apiKeyService *auth.APIKeyService) *auth.Claims {
	// Try API key from query param
	if apiKey := r.URL.Query().Get("apiKey"); apiKey != "" && apiKeyService != nil {
		claims, err := apiKeyService.ValidateKey(context.Background(), apiKey)
		if err != nil {
			return nil
		}
		return claims
	}

	// Try JWT from query param (for EventSource which can't send headers)
	token := r.URL.Query().Get("token")

	// Try JWT from Authorization header
	if token == "" {
		authHeader := r.Header.Get("Authorization")
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
			token = parts[1]
		}
	}

	if token == "" {
		return nil
	}

	claims, err := jwtService.ValidateToken(token)
	if err != nil {
		return nil
	}
	return claims
}

// RequireAuth is a helper that authenticates and writes 401 on failure.
func RequireAuth(w http.ResponseWriter, r *http.Request, jwtService *auth.JWTService, apiKeyService *auth.APIKeyService) *auth.Claims {
	claims := Authenticate(r, jwtService, apiKeyService)
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
	}
	return claims
}
