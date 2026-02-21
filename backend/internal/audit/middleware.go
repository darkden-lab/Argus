package audit

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/auth"
)

// Middleware records all write operations (POST, PUT, DELETE) to the audit_log table.
func Middleware(store *Store) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Only audit write operations
			if r.Method != http.MethodPost && r.Method != http.MethodPut && r.Method != http.MethodDelete {
				next.ServeHTTP(w, r)
				return
			}

			// Capture response status
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)

			// Only log successful writes (2xx and 3xx)
			if rec.status >= 400 {
				return
			}

			// Extract user from context
			var userID *string
			claims, ok := auth.ClaimsFromContext(r.Context())
			if ok && claims.UserID != "" {
				uid := claims.UserID
				userID = &uid
			}

			// Extract cluster ID from path if present
			var clusterID *string
			vars := mux.Vars(r)
			if cid, ok := vars["clusterID"]; ok && cid != "" {
				clusterID = &cid
			} else if cid, ok := vars["id"]; ok && cid != "" {
				// cluster handlers use {id}
				if strings.Contains(r.URL.Path, "/clusters/") {
					clusterID = &cid
				}
			}

			// Build action from method + path
			action := strings.ToLower(r.Method) + " " + r.URL.Path

			// Build resource from URL path
			resource := r.URL.Path

			details, _ := json.Marshal(map[string]interface{}{
				"method":      r.Method,
				"path":        r.URL.Path,
				"status":      rec.status,
				"remote_addr": r.RemoteAddr,
			})

			if err := store.Insert(r.Context(), userID, clusterID, action, resource, details); err != nil {
				log.Printf("audit: failed to log entry: %v", err)
			}
		})
	}
}

// statusRecorder wraps http.ResponseWriter to capture the status code.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}
