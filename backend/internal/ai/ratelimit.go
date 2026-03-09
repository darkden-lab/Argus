package ai

import (
	"fmt"
	"sync"
	"time"
)

const (
	defaultMaxMessages  = 10
	defaultWindowPeriod = time.Minute
)

// RateLimiter implements a token-bucket rate limiter per user for AI messages.
type RateLimiter struct {
	maxMessages int
	window      time.Duration
	buckets     map[string]*messageBucket
	mu          sync.Mutex
}

type messageBucket struct {
	count     int
	windowEnd time.Time
}

// NewRateLimiter creates a new rate limiter with the given limits.
func NewRateLimiter(maxMessages int, window time.Duration) *RateLimiter {
	if maxMessages <= 0 {
		maxMessages = defaultMaxMessages
	}
	if window <= 0 {
		window = defaultWindowPeriod
	}
	return &RateLimiter{
		maxMessages: maxMessages,
		window:      window,
		buckets:     make(map[string]*messageBucket),
	}
}

// Allow checks if a user is within rate limits. Returns nil if allowed,
// or an error describing the rate limit if exceeded.
func (rl *RateLimiter) Allow(userID string) error {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	bucket, ok := rl.buckets[userID]
	if !ok || now.After(bucket.windowEnd) {
		rl.buckets[userID] = &messageBucket{
			count:     1,
			windowEnd: now.Add(rl.window),
		}
		return nil
	}

	bucket.count++
	if bucket.count > rl.maxMessages {
		remaining := bucket.windowEnd.Sub(now).Round(time.Second)
		return fmt.Errorf("rate limit exceeded: maximum %d messages per %s, try again in %s", rl.maxMessages, rl.window, remaining)
	}
	return nil
}

// Cleanup removes stale rate limit entries. Call periodically.
func (rl *RateLimiter) Cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	for userID, bucket := range rl.buckets {
		if now.After(bucket.windowEnd.Add(time.Minute)) {
			delete(rl.buckets, userID)
		}
	}
}
