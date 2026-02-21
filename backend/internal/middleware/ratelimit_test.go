package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

// okHandler is a simple handler that returns 200 OK.
var okHandler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("ok"))
})

func TestRateLimitMiddleware_AllowsWithinLimit(t *testing.T) {
	middleware := RateLimitMiddleware(10, 5)
	handler := middleware(okHandler)

	// First 5 requests (burst) should all succeed.
	for i := 0; i < 5; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		req.RemoteAddr = "192.168.1.1:12345"
		rr := httptest.NewRecorder()

		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("request %d: expected status 200, got %d", i+1, rr.Code)
		}
	}
}

func TestRateLimitMiddleware_BlocksOverLimit(t *testing.T) {
	// 1 RPS with burst of 2: first 2 pass, third should be blocked.
	middleware := RateLimitMiddleware(1, 2)
	handler := middleware(okHandler)

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
		req.RemoteAddr = "10.0.0.1:12345"
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Fatalf("request %d: expected 200, got %d", i+1, rr.Code)
		}
	}

	// Third request should be rate limited.
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.RemoteAddr = "10.0.0.1:12345"
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("expected status 429, got %d", rr.Code)
	}

	// Verify JSON error body.
	var body map[string]string
	if err := json.NewDecoder(rr.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}
	if body["error"] != "rate limit exceeded" {
		t.Errorf("expected error 'rate limit exceeded', got %q", body["error"])
	}
}

func TestRateLimitMiddleware_SeparateLimitersPerIP(t *testing.T) {
	// Burst of 1: each IP gets one request before being limited.
	middleware := RateLimitMiddleware(1, 1)
	handler := middleware(okHandler)

	// First IP exhausts its burst.
	req1 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req1.RemoteAddr = "10.0.0.1:12345"
	rr1 := httptest.NewRecorder()
	handler.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusOK {
		t.Fatalf("IP1 first request: expected 200, got %d", rr1.Code)
	}

	// First IP should now be limited.
	req1b := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req1b.RemoteAddr = "10.0.0.1:12345"
	rr1b := httptest.NewRecorder()
	handler.ServeHTTP(rr1b, req1b)
	if rr1b.Code != http.StatusTooManyRequests {
		t.Errorf("IP1 second request: expected 429, got %d", rr1b.Code)
	}

	// Second IP should still be able to make a request.
	req2 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req2.RemoteAddr = "10.0.0.2:12345"
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Errorf("IP2 first request: expected 200, got %d", rr2.Code)
	}
}

func TestStrictRateLimitMiddleware_StricterThanRegular(t *testing.T) {
	// Regular: burst of 5.
	regular := RateLimitMiddleware(10, 5)
	regularHandler := regular(okHandler)

	// Strict: burst of 2.
	strict := StrictRateLimitMiddleware(1, 2)
	strictHandler := strict(okHandler)

	ip := "172.16.0.1:12345"

	// Send 3 requests through each. Regular should allow all 3, strict should block the 3rd.
	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
		req.RemoteAddr = ip
		rr := httptest.NewRecorder()
		regularHandler.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Errorf("regular request %d: expected 200, got %d", i+1, rr.Code)
		}
	}

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
		req.RemoteAddr = ip
		rr := httptest.NewRecorder()
		strictHandler.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("strict request %d: expected 200, got %d", i+1, rr.Code)
		}
	}

	// Third strict request should be blocked.
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", nil)
	req.RemoteAddr = ip
	rr := httptest.NewRecorder()
	strictHandler.ServeHTTP(rr, req)
	if rr.Code != http.StatusTooManyRequests {
		t.Errorf("strict request 3: expected 429, got %d", rr.Code)
	}
}

func TestRateLimitMiddleware_XForwardedForIgnored(t *testing.T) {
	middleware := RateLimitMiddleware(1, 1)
	handler := middleware(okHandler)

	// First request with X-Forwarded-For — should use RemoteAddr, not XFF.
	req1 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req1.RemoteAddr = "10.0.0.1:12345"
	req1.Header.Set("X-Forwarded-For", "203.0.113.50")
	rr1 := httptest.NewRecorder()
	handler.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusOK {
		t.Fatalf("First request: expected 200, got %d", rr1.Code)
	}

	// Second request with DIFFERENT XFF but same RemoteAddr — should be rate
	// limited because XFF is intentionally ignored (prevents IP spoofing).
	req2 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req2.RemoteAddr = "10.0.0.1:12345"
	req2.Header.Set("X-Forwarded-For", "198.51.100.99")
	rr2 := httptest.NewRecorder()
	handler.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusTooManyRequests {
		t.Errorf("Same RemoteAddr different XFF: expected 429, got %d (XFF must be ignored)", rr2.Code)
	}

	// Request from a DIFFERENT RemoteAddr should NOT be limited.
	req3 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req3.RemoteAddr = "10.0.0.2:12345"
	req3.Header.Set("X-Forwarded-For", "203.0.113.50")
	rr3 := httptest.NewRecorder()
	handler.ServeHTTP(rr3, req3)
	if rr3.Code != http.StatusOK {
		t.Errorf("Different RemoteAddr: expected 200, got %d", rr3.Code)
	}
}

func TestRateLimitMiddleware_WithMuxRouter(t *testing.T) {
	r := mux.NewRouter()
	r.Use(RateLimitMiddleware(1, 1))
	r.HandleFunc("/api/test", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(http.StatusOK)
	}).Methods(http.MethodGet)

	// First request succeeds.
	req1 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req1.RemoteAddr = "10.0.0.1:12345"
	rr1 := httptest.NewRecorder()
	r.ServeHTTP(rr1, req1)
	if rr1.Code != http.StatusOK {
		t.Fatalf("mux request 1: expected 200, got %d", rr1.Code)
	}

	// Second request is rate limited.
	req2 := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req2.RemoteAddr = "10.0.0.1:12345"
	rr2 := httptest.NewRecorder()
	r.ServeHTTP(rr2, req2)
	if rr2.Code != http.StatusTooManyRequests {
		t.Errorf("mux request 2: expected 429, got %d", rr2.Code)
	}
}

func TestClientIP(t *testing.T) {
	tests := []struct {
		name       string
		remoteAddr string
		xff        string
		want       string
	}{
		{
			name:       "RemoteAddr with port",
			remoteAddr: "192.168.1.1:8080",
			want:       "192.168.1.1",
		},
		{
			name:       "RemoteAddr without port",
			remoteAddr: "192.168.1.1",
			want:       "192.168.1.1",
		},
		{
			name:       "XFF ignored for security - uses RemoteAddr",
			remoteAddr: "10.0.0.1:1234",
			xff:        "203.0.113.50",
			want:       "10.0.0.1",
		},
		{
			name:       "XFF multiple IPs still ignored",
			remoteAddr: "10.0.0.1:1234",
			xff:        "203.0.113.50, 70.41.3.18, 150.172.238.178",
			want:       "10.0.0.1",
		},
		{
			name:       "XFF with whitespace still ignored",
			remoteAddr: "10.0.0.1:1234",
			xff:        "  203.0.113.50  ",
			want:       "10.0.0.1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			req.RemoteAddr = tt.remoteAddr
			if tt.xff != "" {
				req.Header.Set("X-Forwarded-For", tt.xff)
			}
			got := clientIP(req)
			if got != tt.want {
				t.Errorf("clientIP() = %q, want %q", got, tt.want)
			}
		})
	}
}
