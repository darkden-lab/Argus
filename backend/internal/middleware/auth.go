package middleware

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/darkden-lab/argus/backend/internal/auth"
)

func AuthMiddleware(jwtService *auth.JWTService, apiKeyService ...*auth.APIKeyService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Check X-API-Key header first
			if apiKey := r.Header.Get("X-API-Key"); apiKey != "" {
				if len(apiKeyService) > 0 && apiKeyService[0] != nil {
					claims, err := apiKeyService[0].ValidateKey(r.Context(), apiKey)
					if err != nil {
						writeError(w, http.StatusUnauthorized, "invalid or expired API key")
						return
					}
					ctx := auth.ContextWithClaims(r.Context(), claims)
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
				writeError(w, http.StatusUnauthorized, "API key authentication not available")
				return
			}

			// Fall through to JWT authentication
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				writeError(w, http.StatusUnauthorized, "missing authorization header")
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
				writeError(w, http.StatusUnauthorized, "invalid authorization header format")
				return
			}

			claims, err := jwtService.ValidateToken(parts[1])
			if err != nil {
				writeError(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}

			ctx := auth.ContextWithClaims(r.Context(), claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
