package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/k8s-dashboard/backend/internal/auth"
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
