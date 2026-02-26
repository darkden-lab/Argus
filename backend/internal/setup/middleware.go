package setup

import (
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/mux"

	"github.com/darkden-lab/argus/backend/internal/httputil"
)

// guardState holds a cached result of the setup-required check so we don't
// hit the database on every single protected request.
type guardState struct {
	mu            sync.Mutex
	required      bool
	lastCheck     time.Time
	initialized   bool
	cacheDuration time.Duration
}

func newGuardState(cacheDuration time.Duration) *guardState {
	return &guardState{
		cacheDuration: cacheDuration,
	}
}

// isSetupRequired returns the cached value if fresh, or re-queries the service.
func (g *guardState) isSetupRequired(service *Service, r *http.Request) (bool, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	now := time.Now()
	if g.initialized && now.Sub(g.lastCheck) < g.cacheDuration {
		return g.required, nil
	}

	required, err := service.IsSetupRequired(r.Context())
	if err != nil {
		return false, err
	}

	g.required = required
	g.lastCheck = now
	g.initialized = true

	// Once setup is complete, it will never become required again.
	// Set a very long cache duration to effectively stop DB queries.
	if !required {
		g.cacheDuration = 24 * time.Hour
	}

	return required, nil
}

// GuardMiddleware blocks all requests through the protected subrouter when
// the initial setup has not been completed. It returns 403 with a JSON body
// indicating that setup is required.
//
// The setup-required check is cached in memory with a 30-second TTL to avoid
// hitting the database on every request. Once setup completes, the cache is
// extended to 24 hours (the flag never reverts to "required").
func GuardMiddleware(service *Service) mux.MiddlewareFunc {
	state := newGuardState(30 * time.Second)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			required, err := state.isSetupRequired(service, r)
			if err != nil {
				// If we previously confirmed setup is complete, fail open
				// (safe — setup never reverts to required).
				if state.initialized && !state.required {
					next.ServeHTTP(w, r)
					return
				}
				// Unknown state (never checked or was required) — deny.
				httputil.WriteJSON(w, http.StatusServiceUnavailable, map[string]string{
					"error":   "setup_check_failed",
					"message": "Unable to verify system state. Please try again.",
				})
				return
			}

			if required {
				httputil.WriteJSON(w, http.StatusForbidden, map[string]string{
					"error":   "setup_required",
					"message": "Initial setup is required",
				})
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
