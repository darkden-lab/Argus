package middleware

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"golang.org/x/time/rate"
)

// ipLimiter holds a rate limiter and the last time it was accessed.
type ipLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

// rateLimiterStore manages per-IP rate limiters with automatic cleanup.
type rateLimiterStore struct {
	limiters sync.Map
	rps      float64
	burst    int
	stopCh   chan struct{}
}

// newRateLimiterStore creates a store that periodically evicts stale entries.
func newRateLimiterStore(rps float64, burst int) *rateLimiterStore {
	s := &rateLimiterStore{
		rps:    rps,
		burst:  burst,
		stopCh: make(chan struct{}),
	}
	go s.cleanup()
	return s
}

// getLimiter returns the rate limiter for the given IP, creating one if needed.
func (s *rateLimiterStore) getLimiter(ip string) *rate.Limiter {
	now := time.Now()

	if v, ok := s.limiters.Load(ip); ok {
		entry := v.(*ipLimiter)
		entry.lastSeen = now
		return entry.limiter
	}

	limiter := rate.NewLimiter(rate.Limit(s.rps), s.burst)
	entry := &ipLimiter{limiter: limiter, lastSeen: now}
	actual, loaded := s.limiters.LoadOrStore(ip, entry)
	if loaded {
		existing := actual.(*ipLimiter)
		existing.lastSeen = now
		return existing.limiter
	}
	return limiter
}

// cleanup removes entries that haven't been seen in 3 minutes.
func (s *rateLimiterStore) cleanup() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			now := time.Now()
			s.limiters.Range(func(key, value any) bool {
				entry := value.(*ipLimiter)
				if now.Sub(entry.lastSeen) > 3*time.Minute {
					s.limiters.Delete(key)
				}
				return true
			})
		case <-s.stopCh:
			return
		}
	}
}


// clientIP extracts the client IP address from the request, checking
// X-Forwarded-For first, then falling back to RemoteAddr.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For may contain a comma-separated list; take the first.
		if idx := strings.IndexByte(xff, ','); idx != -1 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}

	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		// RemoteAddr might not have a port.
		return r.RemoteAddr
	}
	return ip
}

// RateLimitMiddleware returns a gorilla/mux middleware that enforces per-IP
// rate limiting using a token bucket algorithm. rps is the sustained
// requests-per-second rate and burst is the maximum burst size.
func RateLimitMiddleware(rps float64, burst int) mux.MiddlewareFunc {
	store := newRateLimiterStore(rps, burst)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			limiter := store.getLimiter(ip)

			if !limiter.Allow() {
				writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// StrictRateLimitMiddleware is like RateLimitMiddleware but intended for
// sensitive endpoints (e.g. authentication) where tighter limits are
// appropriate. It uses a separate limiter store so that auth rate limits
// are independent of general API limits.
func StrictRateLimitMiddleware(rps float64, burst int) mux.MiddlewareFunc {
	store := newRateLimiterStore(rps, burst)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ip := clientIP(r)
			limiter := store.getLimiter(ip)

			if !limiter.Allow() {
				writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
