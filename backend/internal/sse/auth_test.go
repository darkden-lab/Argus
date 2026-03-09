package sse

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/darkden-lab/argus/backend/internal/auth"
)

func TestAuthenticate_BearerHeader(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret-key-at-least-32chars!!")
	token, _ := jwtSvc.GenerateToken("user1", "admin@example.com")

	r := httptest.NewRequest(http.MethodGet, "/api/ai/stream", nil)
	r.Header.Set("Authorization", "Bearer "+token)

	claims := Authenticate(r, jwtSvc, nil)
	if claims == nil {
		t.Fatal("expected claims, got nil")
	}
	if claims.UserID != "user1" {
		t.Errorf("expected user1, got %s", claims.UserID)
	}
}

func TestAuthenticate_QueryToken(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret-key-at-least-32chars!!")
	token, _ := jwtSvc.GenerateToken("user2", "viewer@example.com")

	r := httptest.NewRequest(http.MethodGet, "/api/ai/stream?token="+token, nil)

	claims := Authenticate(r, jwtSvc, nil)
	if claims == nil {
		t.Fatal("expected claims, got nil")
	}
	if claims.UserID != "user2" {
		t.Errorf("expected user2, got %s", claims.UserID)
	}
}

func TestAuthenticate_NoCredentials(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret-key-at-least-32chars!!")

	r := httptest.NewRequest(http.MethodGet, "/api/ai/stream", nil)

	claims := Authenticate(r, jwtSvc, nil)
	if claims != nil {
		t.Error("expected nil claims for missing auth")
	}
}

func TestAuthenticate_InvalidToken(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret-key-at-least-32chars!!")

	r := httptest.NewRequest(http.MethodGet, "/api/ai/stream", nil)
	r.Header.Set("Authorization", "Bearer invalid-token")

	claims := Authenticate(r, jwtSvc, nil)
	if claims != nil {
		t.Error("expected nil claims for invalid token")
	}
}

func TestRequireAuth_Returns401(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret-key-at-least-32chars!!")

	r := httptest.NewRequest(http.MethodGet, "/api/ai/stream", nil)
	w := httptest.NewRecorder()

	claims := RequireAuth(w, r, jwtSvc, nil)
	if claims != nil {
		t.Error("expected nil claims")
	}
	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}
