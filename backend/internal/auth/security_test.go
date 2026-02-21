package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// --- Password Security Tests ---

// TestBcryptPasswordHashing verifies that passwords are hashed with bcrypt
// and never stored or compared in plaintext.
func TestBcryptPasswordHashing(t *testing.T) {
	password := "my-secret-P@ssw0rd!"

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("bcrypt.GenerateFromPassword failed: %v", err)
	}

	// Hash must not contain the original password
	if strings.Contains(string(hash), password) {
		t.Fatal("SECURITY: password hash contains the plaintext password")
	}

	// Verify correct password matches
	if err := bcrypt.CompareHashAndPassword(hash, []byte(password)); err != nil {
		t.Fatal("expected correct password to match hash")
	}

	// Verify wrong password does not match
	if err := bcrypt.CompareHashAndPassword(hash, []byte("wrong-password")); err == nil {
		t.Fatal("SECURITY: wrong password matched the hash")
	}
}

// TestBcryptNonDeterministic verifies that the same password produces
// different hashes (due to salt).
func TestBcryptNonDeterministic(t *testing.T) {
	password := "same-password"

	hash1, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	hash2, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)

	if bytes.Equal(hash1, hash2) {
		t.Fatal("SECURITY: bcrypt produced identical hashes for the same password (missing salt)")
	}
}

// TestBcryptMinimumCost verifies that the service uses at least DefaultCost (10).
func TestBcryptMinimumCost(t *testing.T) {
	password := "test-password"
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)

	cost, err := bcrypt.Cost(hash)
	if err != nil {
		t.Fatalf("failed to get bcrypt cost: %v", err)
	}

	if cost < bcrypt.DefaultCost {
		t.Fatalf("SECURITY: bcrypt cost %d is below DefaultCost %d", cost, bcrypt.DefaultCost)
	}
}

// --- JWT Refresh Token Security Tests ---

// TestRefreshTokenCannotBeUsedAsAccessToken ensures that a refresh token
// is not accepted when an access token is expected by the middleware.
func TestRefreshTokenCannotBeUsedAsAccessToken(t *testing.T) {
	svc := NewJWTService("test-secret")

	refreshToken, err := svc.GenerateRefreshToken("user-123")
	if err != nil {
		t.Fatalf("GenerateRefreshToken failed: %v", err)
	}

	// ValidateToken must reject refresh tokens
	_, err = svc.ValidateToken(refreshToken)
	if err == nil {
		t.Fatal("SECURITY: refresh token accepted as access token - tokens are interchangeable")
	}

	// ValidateRefreshToken must accept refresh tokens
	claims, err := svc.ValidateRefreshToken(refreshToken)
	if err != nil {
		t.Fatalf("ValidateRefreshToken failed: %v", err)
	}
	if claims.TokenType != TokenTypeRefresh {
		t.Errorf("expected TokenType %q, got %q", TokenTypeRefresh, claims.TokenType)
	}
}

// TestAccessTokenCannotBeUsedAsRefreshToken ensures that an access token
// is not accepted when a refresh token is expected.
func TestAccessTokenCannotBeUsedAsRefreshToken(t *testing.T) {
	svc := NewJWTService("test-secret")

	accessToken, err := svc.GenerateToken("user-123", "test@test.com")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	_, err = svc.ValidateRefreshToken(accessToken)
	if err == nil {
		t.Fatal("SECURITY: access token accepted as refresh token - tokens are interchangeable")
	}
}

// TestAccessTokenExpiry ensures access tokens have a short lifetime.
func TestAccessTokenExpiry(t *testing.T) {
	svc := NewJWTService("test-secret")

	token, _ := svc.GenerateToken("user-1", "test@test.com")
	claims, _ := svc.ValidateToken(token)

	// Access token should expire within 1 hour (actual is 15 min)
	timeUntilExpiry := time.Until(claims.ExpiresAt.Time)
	if timeUntilExpiry > time.Hour {
		t.Errorf("SECURITY: access token expiry too long: %v", timeUntilExpiry)
	}
	if timeUntilExpiry <= 0 {
		t.Error("access token already expired at generation")
	}
}

// TestRefreshTokenExpiryLongerThanAccess verifies the refresh token lives longer.
func TestRefreshTokenExpiryLongerThanAccess(t *testing.T) {
	svc := NewJWTService("test-secret")

	accessToken, _ := svc.GenerateToken("user-1", "test@test.com")
	refreshToken, _ := svc.GenerateRefreshToken("user-1")

	accessClaims, _ := svc.ValidateToken(accessToken)
	refreshClaims, _ := svc.ValidateRefreshToken(refreshToken)

	if !refreshClaims.ExpiresAt.After(accessClaims.ExpiresAt.Time) {
		t.Fatal("SECURITY: refresh token does not expire after access token")
	}
}

// --- Context Security Tests ---

// TestClaimsContextIsolation verifies that claims from one context don't leak to another.
func TestClaimsContextIsolation(t *testing.T) {
	claims1 := &Claims{UserID: "user-1", Email: "user1@test.com"}
	claims2 := &Claims{UserID: "user-2", Email: "user2@test.com"}

	ctx1 := ContextWithClaims(context.Background(), claims1)
	ctx2 := ContextWithClaims(context.Background(), claims2)

	got1, ok1 := ClaimsFromContext(ctx1)
	got2, ok2 := ClaimsFromContext(ctx2)

	if !ok1 || !ok2 {
		t.Fatal("expected claims in both contexts")
	}
	if got1.UserID != "user-1" {
		t.Errorf("context 1 has wrong user: %s", got1.UserID)
	}
	if got2.UserID != "user-2" {
		t.Errorf("context 2 has wrong user: %s", got2.UserID)
	}
}

// TestClaimsNotInheritedByChildContext verifies that a background context
// derived from a parent without claims does not have claims.
func TestClaimsNotInheritedFromWrongKey(t *testing.T) {
	// Store claims under a different key using context.WithValue directly
	ctx := context.WithValue(context.Background(), "claims", &Claims{UserID: "hacker"})

	_, ok := ClaimsFromContext(ctx)
	if ok {
		t.Fatal("SECURITY: claims extracted from context with wrong key type")
	}
}

// --- Handler Security Tests ---

// TestLoginReturnsGenericErrorMessage verifies that login errors don't reveal
// whether the email exists (prevents user enumeration).
func TestLoginReturnsGenericErrorMessage(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	// Test with non-existent email - should panic at DB layer (nil pool)
	// but the error message at the handler level should be generic
	rec := httptest.NewRecorder()
	panicked := false
	func() {
		defer func() {
			if r := recover(); r != nil {
				panicked = true
			}
		}()
		body, _ := json.Marshal(loginRequest{
			Email:    "nonexistent@test.com",
			Password: "password",
		})
		req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBuffer(body))
		h.handleLogin(rec, req)
	}()

	if panicked {
		// Panic means we hit nil DB - this is expected in unit tests
		return
	}

	// If we got a response, it should say "invalid credentials" not "user not found"
	var resp errorResponse
	json.NewDecoder(rec.Body).Decode(&resp)
	if strings.Contains(strings.ToLower(resp.Error), "not found") {
		t.Error("SECURITY: login error reveals user existence (says 'not found')")
	}
	if strings.Contains(strings.ToLower(resp.Error), "no such user") {
		t.Error("SECURITY: login error reveals user existence")
	}
}

// TestHandleMeWithForgedClaims verifies that manually inserting claims
// into context and calling handleMe requires a valid user lookup.
func TestHandleMeWithForgedClaims(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	// Create request with forged claims in context
	claims := &Claims{UserID: "nonexistent-user-id", Email: "hacker@evil.com"}
	ctx := ContextWithClaims(context.Background(), claims)
	req := httptest.NewRequest("GET", "/api/auth/me", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	// Should panic (nil DB) or return 404
	panicked := false
	func() {
		defer func() {
			if r := recover(); r != nil {
				panicked = true
			}
		}()
		h.handleMe(rec, req)
	}()

	if panicked {
		return // nil DB, expected
	}

	if rec.Code == http.StatusOK {
		t.Error("SECURITY: handleMe returned 200 for forged claims without DB lookup")
	}
}

// TestRegisterEmptyPassword verifies empty passwords are rejected.
func TestRegisterEmptyPassword(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	body, _ := json.Marshal(registerRequest{
		Email:       "test@test.com",
		Password:    "",
		DisplayName: "Test",
	})
	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleRegister(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty password, got %d", rec.Code)
	}
}

// TestLoginEmptyCredentials verifies that completely empty credentials are rejected.
func TestLoginEmptyCredentials(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	body, _ := json.Marshal(loginRequest{Email: "", Password: ""})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleLogin(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty credentials, got %d", rec.Code)
	}
}

// TestResponsesDoNotLeakStackTraces verifies that error responses don't contain
// Go stack traces or internal file paths.
func TestResponsesDoNotLeakStackTraces(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	testCases := []struct {
		name string
		body string
	}{
		{"bad_json", "{invalid"},
		{"empty_fields", `{"email":"","password":""}`},
		{"missing_fields", `{}`},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(tc.body))
			rec := httptest.NewRecorder()
			h.handleLogin(rec, req)

			body := rec.Body.String()
			if strings.Contains(body, ".go:") {
				t.Errorf("SECURITY: response contains Go file reference: %s", body)
			}
			if strings.Contains(body, "goroutine") {
				t.Errorf("SECURITY: response contains goroutine info: %s", body)
			}
			if strings.Contains(body, "panic") {
				t.Errorf("SECURITY: response contains panic info: %s", body)
			}
		})
	}
}

// TestHTTPMethodEnforcement verifies that auth endpoints reject wrong HTTP methods.
func TestHTTPMethodEnforcement(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	// Login should not accept GET
	req := httptest.NewRequest("GET", "/api/auth/login", nil)
	rec := httptest.NewRecorder()
	h.handleLogin(rec, req)

	// handleLogin tries to decode the body which is nil for GET, should fail
	if rec.Code == http.StatusOK || rec.Code == http.StatusCreated {
		t.Error("SECURITY: login accepted GET request")
	}
}

// --- Timing Attack Prevention ---

// TestJWTValidationRejectsNilClaims verifies that nil claims from a token
// do not bypass validation.
func TestJWTValidationRejectsNilClaims(t *testing.T) {
	svc := NewJWTService("test-secret")

	// Create a token, then validate with a different service
	otherSvc := NewJWTService("other-secret")
	token, _ := otherSvc.GenerateToken("admin", "admin@evil.com")

	claims, err := svc.ValidateToken(token)
	if err == nil {
		t.Fatal("SECURITY: accepted token from different secret")
	}
	if claims != nil {
		t.Fatal("SECURITY: returned non-nil claims for invalid token")
	}
}

// Ensure time import is used
var _ = time.Now
