package rbac

import (
	"encoding/json"
	"net/http"

	"github.com/darkden-lab/argus/backend/internal/auth"
)

func RBACMiddleware(engine *Engine, resource, action string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := auth.ClaimsFromContext(r.Context())
			if !ok {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			req := Request{
				UserID:   claims.UserID,
				Action:   action,
				Resource: resource,
			}

			allowed, err := engine.Evaluate(r.Context(), req)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "permission check failed")
				return
			}

			if !allowed {
				writeError(w, http.StatusForbidden, "insufficient permissions")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}
