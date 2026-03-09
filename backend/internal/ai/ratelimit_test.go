package ai

import (
	"strings"
	"testing"
	"time"
)

func TestRateLimiter_Allow(t *testing.T) {
	rl := NewRateLimiter(3, time.Minute)

	// First 3 calls should succeed
	for i := 0; i < 3; i++ {
		if err := rl.Allow("user-1"); err != nil {
			t.Fatalf("Allow() call %d returned error: %v", i+1, err)
		}
	}

	// 4th call should fail
	err := rl.Allow("user-1")
	if err == nil {
		t.Fatal("Allow() call 4 returned nil, want rate limit error")
	}
	if !strings.Contains(err.Error(), "rate limit exceeded") {
		t.Errorf("Allow() error = %q, want it to contain 'rate limit exceeded'", err.Error())
	}
}

func TestRateLimiter_DifferentUsers(t *testing.T) {
	rl := NewRateLimiter(2, time.Minute)

	// User A uses both messages
	for i := 0; i < 2; i++ {
		if err := rl.Allow("user-a"); err != nil {
			t.Fatalf("Allow(user-a) call %d returned error: %v", i+1, err)
		}
	}

	// User A is now rate limited
	if err := rl.Allow("user-a"); err == nil {
		t.Error("Allow(user-a) should be rate limited, got nil")
	}

	// User B should still be able to send
	if err := rl.Allow("user-b"); err != nil {
		t.Fatalf("Allow(user-b) returned error: %v, want nil (independent limit)", err)
	}
	if err := rl.Allow("user-b"); err != nil {
		t.Fatalf("Allow(user-b) call 2 returned error: %v, want nil", err)
	}

	// User B is also now rate limited
	if err := rl.Allow("user-b"); err == nil {
		t.Error("Allow(user-b) should be rate limited, got nil")
	}
}

func TestRateLimiter_WindowReset(t *testing.T) {
	// Use a very short window for testing
	rl := NewRateLimiter(2, 100*time.Millisecond)

	// Use up all messages
	for i := 0; i < 2; i++ {
		if err := rl.Allow("user-1"); err != nil {
			t.Fatalf("Allow() call %d returned error: %v", i+1, err)
		}
	}

	// Should be rate limited
	if err := rl.Allow("user-1"); err == nil {
		t.Error("Allow() should be rate limited before window reset")
	}

	// Wait for window to expire
	time.Sleep(150 * time.Millisecond)

	// Should be allowed again
	if err := rl.Allow("user-1"); err != nil {
		t.Errorf("Allow() after window reset returned error: %v, want nil", err)
	}
}

func TestRateLimiter_Defaults(t *testing.T) {
	// Passing zero/negative values should use defaults
	rl := NewRateLimiter(0, 0)

	// Should still work (uses defaults: 10 msgs/min)
	if err := rl.Allow("user-1"); err != nil {
		t.Fatalf("Allow() with default limits returned error: %v", err)
	}
}

func TestRateLimiter_Cleanup(t *testing.T) {
	rl := NewRateLimiter(2, 50*time.Millisecond)

	// Create an entry
	if err := rl.Allow("user-1"); err != nil {
		t.Fatalf("Allow() returned error: %v", err)
	}

	// Wait for window + cleanup grace period to expire
	time.Sleep(200 * time.Millisecond)

	// Cleanup should remove stale entries
	rl.Cleanup()

	// Verify the user can send again (bucket was cleaned up and recreated)
	for i := 0; i < 2; i++ {
		if err := rl.Allow("user-1"); err != nil {
			t.Fatalf("Allow() after Cleanup() call %d returned error: %v", i+1, err)
		}
	}
}
