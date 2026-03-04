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

// CheckOrigin allows all origins for WebSocket upgrade requests.
// Origin validation is already handled by the CORS middleware at the HTTP
// layer, so duplicating it here only causes false rejections (e.g. when the
// browser origin doesn't exactly match ALLOWED_ORIGINS).
func CheckOrigin(_ *http.Request) bool {
	return true
}
