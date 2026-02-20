package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleRegisterBadJSON(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	body := bytes.NewBufferString("{invalid json}")
	req := httptest.NewRequest("POST", "/api/auth/register", body)
	rec := httptest.NewRecorder()

	h.handleRegister(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}
}

func TestHandleRegisterMissingFields(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	payload := map[string]string{"email": "test@test.com"}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleRegister(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}

	var resp errorResponse
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp.Error == "" {
		t.Error("expected non-empty error message")
	}
}

func TestHandleLoginBadJSON(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	body := bytes.NewBufferString("not json")
	req := httptest.NewRequest("POST", "/api/auth/login", body)
	rec := httptest.NewRecorder()

	h.handleLogin(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}
}

func TestHandleLoginMissingFields(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	payload := map[string]string{"email": "test@test.com"}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleLogin(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}
}

func TestHandleRefreshBadJSON(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	body := bytes.NewBufferString("not json")
	req := httptest.NewRequest("POST", "/api/auth/refresh", body)
	rec := httptest.NewRecorder()

	h.handleRefresh(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}
}

func TestHandleRefreshMissingToken(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	payload := map[string]string{"refresh_token": ""}
	body, _ := json.Marshal(payload)
	req := httptest.NewRequest("POST", "/api/auth/refresh", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleRefresh(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}
}

func TestHandleMeUnauthorized(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewHandlers(authSvc)

	req := httptest.NewRequest("GET", "/api/auth/me", nil)
	rec := httptest.NewRecorder()

	h.handleMe(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rec.Code)
	}
}

func TestWriteJSON(t *testing.T) {
	rec := httptest.NewRecorder()
	writeJSON(rec, http.StatusOK, map[string]string{"key": "value"})

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
	if rec.Header().Get("Content-Type") != "application/json" {
		t.Errorf("expected Content-Type 'application/json', got '%s'", rec.Header().Get("Content-Type"))
	}

	var result map[string]string
	json.NewDecoder(rec.Body).Decode(&result)
	if result["key"] != "value" {
		t.Errorf("expected key='value', got '%s'", result["key"])
	}
}

func TestContextClaims(t *testing.T) {
	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)

	got, ok := ClaimsFromContext(ctx)
	if !ok {
		t.Fatal("expected claims in context")
	}
	if got.UserID != "user-1" {
		t.Errorf("expected UserID 'user-1', got '%s'", got.UserID)
	}
	if got.Email != "test@test.com" {
		t.Errorf("expected Email 'test@test.com', got '%s'", got.Email)
	}
}

func TestContextClaimsMissing(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	_, ok := ClaimsFromContext(req.Context())
	if ok {
		t.Error("expected no claims in empty context")
	}
}
