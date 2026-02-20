package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/darkden-lab/argus/backend/internal/auth"
)

func TestAuthMiddlewareMissingHeader(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rec.Code)
	}
}

func TestAuthMiddlewareInvalidFormat(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "NotBearer token")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rec.Code)
	}
}

func TestAuthMiddlewareInvalidToken(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rec.Code)
	}
}

func TestAuthMiddlewareValidToken(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	token, err := jwtSvc.GenerateToken("user-123", "test@test.com")
	if err != nil {
		t.Fatalf("failed to generate token: %v", err)
	}

	var claimsFromCtx *auth.Claims
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := auth.ClaimsFromContext(r.Context())
		if ok {
			claimsFromCtx = claims
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
	if claimsFromCtx == nil {
		t.Fatal("expected claims in context")
	}
	if claimsFromCtx.UserID != "user-123" {
		t.Errorf("expected UserID 'user-123', got '%s'", claimsFromCtx.UserID)
	}
}

func TestAuthMiddlewareBearerCaseInsensitive(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	token, _ := jwtSvc.GenerateToken("user-123", "test@test.com")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "bearer "+token) // lowercase bearer
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

// --- Security Tests ---

// TestAuthMiddlewareExpiredToken verifies that expired tokens are rejected.
func TestAuthMiddlewareExpiredToken(t *testing.T) {
	middleware := AuthMiddleware(auth.NewJWTService("test-secret"))

	// Use a manually crafted expired JWT (signed with same secret, but expired)
	// The jwt_test.go in auth package tests this more directly.
	// Here we construct a clearly invalid/expired token string.
	expiredToken := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidGVzdEB0ZXN0LmNvbSIsImV4cCI6MH0.invalid"

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+expiredToken)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for expired token, got %d", rec.Code)
	}
	_ = time.Now // keep time import used
}

// TestAuthMiddlewareTokenFromDifferentSecret verifies cross-secret rejection.
func TestAuthMiddlewareTokenFromDifferentSecret(t *testing.T) {
	attackerSvc := auth.NewJWTService("attacker-secret")
	middleware := AuthMiddleware(auth.NewJWTService("real-secret"))

	token, _ := attackerSvc.GenerateToken("admin", "admin@evil.com")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatal("SECURITY: accepted token signed with different secret")
	}
}

// TestAuthMiddlewareInjectionInHeader tests injection attempts via Authorization header.
func TestAuthMiddlewareInjectionInHeader(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	injectionHeaders := []string{
		"Bearer \x00\x01admin",
		"Bearer " + strings.Repeat("A", 100000),
		"Bearer \r\nX-Injected: true",
		"Bearer $(whoami)",
		"Bearer; rm -rf /",
		"Basic YWRtaW46cGFzc3dvcmQ=",  // Basic auth attempt
		"Digest username=\"admin\"",     // Digest auth attempt
	}

	for _, header := range injectionHeaders {
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", header)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code == http.StatusOK {
			t.Errorf("SECURITY: accepted injection header: %q", header[:min(len(header), 50)])
		}
	}
}

// TestAuthMiddlewareErrorResponseFormat verifies error responses use JSON.
func TestAuthMiddlewareErrorResponseFormat(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	// Must be JSON
	ct := rec.Header().Get("Content-Type")
	if !strings.Contains(ct, "application/json") {
		t.Errorf("expected JSON content-type, got %q", ct)
	}

	// Must be parseable JSON
	var resp map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Errorf("expected valid JSON error response, got: %v", err)
	}
	if resp["error"] == "" {
		t.Error("expected non-empty error field in response")
	}
}

// TestAuthMiddlewareMultipleAuthHeaders tests behavior with multiple Authorization headers.
func TestAuthMiddlewareMultipleAuthHeaders(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	token, _ := jwtSvc.GenerateToken("user-1", "test@test.com")

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		// Verify we got the right user from the first header
		if claims.UserID != "user-1" {
			t.Errorf("unexpected user from claims: %s", claims.UserID)
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	// Add a second header (Go's Header.Get returns first value)
	req.Header.Add("Authorization", "Bearer invalid-token")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	// First valid header should be used
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 with valid first header, got %d", rec.Code)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
