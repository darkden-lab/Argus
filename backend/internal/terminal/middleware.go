package terminal

import (
	"log"
	"strings"
	"sync"
	"time"
)

// SecurityMiddleware enforces rate limiting, command timeouts, input
// sanitization, and audit logging for terminal sessions.
type SecurityMiddleware struct {
	maxCommandsPerSecond int
	defaultTimeout       time.Duration
	maxTimeout           time.Duration

	// Per-user rate tracking
	userRates map[string]*rateBucket
	mu        sync.Mutex

	// Dangerous patterns for raw shell input sanitization
	blockedPatterns []string
}

type rateBucket struct {
	count     int
	windowEnd time.Time
}

// NewSecurityMiddleware creates a new terminal security middleware.
func NewSecurityMiddleware() *SecurityMiddleware {
	return &SecurityMiddleware{
		maxCommandsPerSecond: 10,
		defaultTimeout:       30 * time.Second,
		maxTimeout:           5 * time.Minute,
		userRates:            make(map[string]*rateBucket),
		blockedPatterns: []string{
			"rm -rf /",
			":(){ :|:& };:",    // fork bomb
			"> /dev/sda",
			"mkfs",
			"dd if=/dev/zero",
			"chmod -R 777 /",
			"wget|bash",
			"curl|bash",
		},
	}
}

// CheckRateLimit returns true if the user is within rate limits.
func (m *SecurityMiddleware) CheckRateLimit(userID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	bucket, ok := m.userRates[userID]
	if !ok || now.After(bucket.windowEnd) {
		m.userRates[userID] = &rateBucket{
			count:     1,
			windowEnd: now.Add(time.Second),
		}
		return true
	}

	bucket.count++
	if bucket.count > m.maxCommandsPerSecond {
		log.Printf("terminal security: rate limit exceeded for user %s (%d/s)", userID, bucket.count)
		return false
	}
	return true
}

// SanitizeInput checks a raw shell input for dangerous patterns. Returns
// an error message if the input is blocked, or empty string if safe.
func (m *SecurityMiddleware) SanitizeInput(input string) string {
	lower := strings.ToLower(strings.TrimSpace(input))

	for _, pattern := range m.blockedPatterns {
		if strings.Contains(lower, strings.ToLower(pattern)) {
			log.Printf("terminal security: blocked dangerous input pattern: %s", pattern)
			return "Command blocked: contains dangerous pattern '" + pattern + "'"
		}
	}

	// Check for common shell injection patterns
	if strings.Contains(input, "$(") || strings.Contains(input, "`") {
		// Allow backticks and subshells in general, but log them
		log.Printf("terminal security: shell substitution detected in input")
	}

	return ""
}

// GetTimeout returns the timeout for a command. If requested > max, returns max.
func (m *SecurityMiddleware) GetTimeout(requested time.Duration) time.Duration {
	if requested <= 0 {
		return m.defaultTimeout
	}
	if requested > m.maxTimeout {
		return m.maxTimeout
	}
	return requested
}

// AuditLog logs a terminal command execution for audit purposes.
func (m *SecurityMiddleware) AuditLog(userID, sessionID, clusterID, command string) {
	log.Printf("terminal audit: user=%s session=%s cluster=%s command=%q",
		userID, sessionID, clusterID, command)
}

// Cleanup removes stale rate limit entries older than 1 minute.
func (m *SecurityMiddleware) Cleanup() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for userID, bucket := range m.userRates {
		if now.After(bucket.windowEnd.Add(time.Minute)) {
			delete(m.userRates, userID)
		}
	}
}
