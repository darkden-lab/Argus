package ws

import (
	"net/http"
	"os"
	"strings"
	"sync"
)

var (
	allowedOrigins     []string
	allowedOriginsOnce sync.Once
)

// loadAllowedOrigins reads the ALLOWED_ORIGINS environment variable (comma-
// separated) and caches the result. If the variable is empty, it defaults to
// "http://localhost:3000" for local development.
func loadAllowedOrigins() []string {
	allowedOriginsOnce.Do(func() {
		raw := os.Getenv("ALLOWED_ORIGINS")
		if raw == "" {
			raw = "http://localhost:3000"
		}
		for _, o := range strings.Split(raw, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				allowedOrigins = append(allowedOrigins, o)
			}
		}
	})
	return allowedOrigins
}

// CheckOrigin validates the Origin header of an incoming HTTP request against
// the list of allowed origins configured via the ALLOWED_ORIGINS environment
// variable. It is intended to be used as the CheckOrigin field of a
// gorilla/websocket.Upgrader.
func CheckOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// No Origin header — same-origin request or non-browser client.
		return true
	}
	for _, allowed := range loadAllowedOrigins() {
		if strings.EqualFold(origin, allowed) {
			return true
		}
	}
	return false
}
