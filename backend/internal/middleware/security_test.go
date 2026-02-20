package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/darkden-lab/argus/backend/internal/auth"
)

// --- Middleware Security Tests ---

// TestAuthMiddlewareDoesNotLeakTokenInResponse verifies that the auth middleware
// does not include the token in error responses.
func TestAuthMiddlewareDoesNotLeakTokenInResponse(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	testToken := "eyJhbGciOiJIUzI1NiJ9.invalid-but-recognizable-token.sig"
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+testToken)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	body := rec.Body.String()
	if strings.Contains(body, testToken) {
		t.Error("SECURITY: auth error response contains the submitted token")
	}
}

// TestAuthMiddlewareEmptyBearer verifies that "Bearer " with empty token is rejected.
func TestAuthMiddlewareEmptyBearer(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer ")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code == http.StatusOK {
		t.Error("SECURITY: accepted empty Bearer token")
	}
}

// TestAuthMiddlewareOnlyBearerNoToken tests "Bearer" without a space and token.
func TestAuthMiddlewareOnlyBearerNoToken(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer")
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code == http.StatusOK {
		t.Error("SECURITY: accepted 'Bearer' without token")
	}
}

// TestAuthMiddlewareWhitespaceToken tests that whitespace-only tokens are rejected.
func TestAuthMiddlewareWhitespaceToken(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	whitespaceTokens := []string{
		"Bearer  ",
		"Bearer \t",
		"Bearer \n",
		"Bearer    \t  ",
	}

	for _, header := range whitespaceTokens {
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", header)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code == http.StatusOK {
			t.Errorf("SECURITY: accepted whitespace token with header %q", header)
		}
	}
}

// TestAuthMiddlewareClaimsAreSetCorrectly verifies that claims from a valid
// token are properly propagated to the request context.
func TestAuthMiddlewareClaimsAreSetCorrectly(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	token, _ := jwtSvc.GenerateToken("user-42", "user42@test.com")

	var extractedClaims *auth.Claims
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := auth.ClaimsFromContext(r.Context())
		if ok {
			extractedClaims = claims
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if extractedClaims == nil {
		t.Fatal("claims not set in context")
	}
	if extractedClaims.UserID != "user-42" {
		t.Errorf("expected UserID 'user-42', got %q", extractedClaims.UserID)
	}
	if extractedClaims.Email != "user42@test.com" {
		t.Errorf("expected Email 'user42@test.com', got %q", extractedClaims.Email)
	}
}

// TestAuthMiddlewareRejectsNonBearerSchemes verifies that other auth schemes are rejected.
func TestAuthMiddlewareRejectsNonBearerSchemes(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	schemes := []string{
		"Basic dXNlcjpwYXNz",
		"Digest username=\"admin\"",
		"NTLM TlRMTVNT",
		"Negotiate YIIBhg",
		"Token abc123",
		"JWT eyJhbGciOiJIUzI1NiJ9.e30.test",
	}

	for _, header := range schemes {
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", header)
		rec := httptest.NewRecorder()

		handler.ServeHTTP(rec, req)

		if rec.Code == http.StatusOK {
			t.Errorf("SECURITY: accepted non-Bearer auth scheme: %q", header)
		}
	}
}

// TestAuthMiddlewareResponseHeaders verifies security-relevant response headers.
func TestAuthMiddlewareResponseHeaders(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret")
	middleware := AuthMiddleware(jwtSvc)

	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Request without auth - should get error with JSON content type
	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	ct := rec.Header().Get("Content-Type")
	if ct == "" || strings.Contains(ct, "text/html") {
		t.Errorf("SECURITY: error response has Content-Type %q (should be application/json)", ct)
	}
}

// TestWriteErrorFunction verifies the writeError helper function.
func TestWriteErrorFunction(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, http.StatusForbidden, "access denied")

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rec.Code)
	}

	ct := rec.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected Content-Type 'application/json', got %q", ct)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "access denied") {
		t.Errorf("expected error message in body, got: %s", body)
	}
}
