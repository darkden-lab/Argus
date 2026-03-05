package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

// callProfileHandlerSafe calls a handler with panic recovery.
// Returns (status_code, panicked).
func callProfileHandlerSafe(fn func(rec *httptest.ResponseRecorder)) (int, bool) {
	rec := httptest.NewRecorder()
	panicked := false
	func() {
		defer func() {
			if r := recover(); r != nil {
				panicked = true
			}
		}()
		fn(rec)
	}()
	return rec.Code, panicked
}

// --- Update Profile ---

func TestHandleUpdateProfile_Unauthorized(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	body, _ := json.Marshal(map[string]string{"display_name": "New Name"})
	req := httptest.NewRequest("PATCH", "/api/users/me", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleUpdateProfile(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestHandleUpdateProfile_BadJSON(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)
	req := httptest.NewRequest("PATCH", "/api/users/me", bytes.NewBufferString("not json")).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleUpdateProfile(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestHandleUpdateProfile_ReachesDB(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)

	body, _ := json.Marshal(map[string]string{"display_name": "New Name"})
	req := httptest.NewRequest("PATCH", "/api/users/me", bytes.NewBuffer(body)).WithContext(ctx)

	// Panics at DB layer (SELECT auth_provider FROM users)
	code, panicked := callProfileHandlerSafe(func(rec *httptest.ResponseRecorder) {
		h.handleUpdateProfile(rec, req)
	})
	if !panicked && code == http.StatusBadRequest {
		t.Fatal("expected to pass validation (should reach DB layer)")
	}
}

// --- Change Password ---

func TestHandleChangePassword_Unauthorized(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	body, _ := json.Marshal(map[string]string{
		"current_password": "old", "new_password": "newpass123",
	})
	req := httptest.NewRequest("PATCH", "/api/users/me/password", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleChangePassword(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestHandleChangePassword_BadJSON(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)
	req := httptest.NewRequest("PATCH", "/api/users/me/password", bytes.NewBufferString("bad")).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleChangePassword(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestHandleChangePassword_MissingFields(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)

	tests := []struct {
		name string
		body map[string]string
	}{
		{"both empty", map[string]string{"current_password": "", "new_password": ""}},
		{"missing new", map[string]string{"current_password": "old", "new_password": ""}},
		{"missing current", map[string]string{"current_password": "", "new_password": "newpass123"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.body)
			req := httptest.NewRequest("PATCH", "/api/users/me/password", bytes.NewBuffer(body)).WithContext(ctx)
			rec := httptest.NewRecorder()

			h.handleChangePassword(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for %s, got %d", tt.name, rec.Code)
			}
		})
	}
}

func TestHandleChangePassword_TooShort(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)

	body, _ := json.Marshal(map[string]string{
		"current_password": "oldpass123",
		"new_password":     "short",
	})
	req := httptest.NewRequest("PATCH", "/api/users/me/password", bytes.NewBuffer(body)).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleChangePassword(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for short password, got %d", rec.Code)
	}

	var resp errorResponse
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp.Error != "new password must be at least 8 characters" {
		t.Errorf("expected short password error, got %q", resp.Error)
	}
}

func TestHandleChangePassword_ReachesDB(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)

	body, _ := json.Marshal(map[string]string{
		"current_password": "oldpass123",
		"new_password":     "newpass1234",
	})
	req := httptest.NewRequest("PATCH", "/api/users/me/password", bytes.NewBuffer(body)).WithContext(ctx)

	// Validation passes; panics at DB layer
	code, panicked := callProfileHandlerSafe(func(rec *httptest.ResponseRecorder) {
		h.handleChangePassword(rec, req)
	})
	if !panicked && code == http.StatusBadRequest {
		t.Fatal("expected to pass validation (should reach DB layer)")
	}
}

// --- Get Preferences ---

func TestHandleGetPreferences_Unauthorized(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	req := httptest.NewRequest("GET", "/api/users/me/preferences", nil)
	rec := httptest.NewRecorder()

	h.handleGetPreferences(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestHandleGetPreferences_ReachesDB(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)
	req := httptest.NewRequest("GET", "/api/users/me/preferences", nil).WithContext(ctx)

	// Auth passes; panics at DB layer
	code, panicked := callProfileHandlerSafe(func(rec *httptest.ResponseRecorder) {
		h.handleGetPreferences(rec, req)
	})
	if !panicked && (code == http.StatusUnauthorized) {
		t.Fatal("expected to pass auth (should reach DB layer)")
	}
}

// --- Set Preferences ---

func TestHandleSetPreferences_Unauthorized(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	body, _ := json.Marshal(UserPreferences{Theme: "dark"})
	req := httptest.NewRequest("PUT", "/api/users/me/preferences", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleSetPreferences(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestHandleSetPreferences_BadJSON(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)
	req := httptest.NewRequest("PUT", "/api/users/me/preferences", bytes.NewBufferString("bad")).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleSetPreferences(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestHandleSetPreferences_InvalidTheme(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)

	body, _ := json.Marshal(UserPreferences{Theme: "rainbow"})
	req := httptest.NewRequest("PUT", "/api/users/me/preferences", bytes.NewBuffer(body)).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleSetPreferences(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid theme, got %d", rec.Code)
	}

	var resp errorResponse
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp.Error != "invalid theme value" {
		t.Errorf("expected 'invalid theme value' error, got %q", resp.Error)
	}
}

func TestHandleSetPreferences_ReachesDB(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	claims := &Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := ContextWithClaims(context.Background(), claims)

	body, _ := json.Marshal(UserPreferences{Theme: "dark", Language: "en"})
	req := httptest.NewRequest("PUT", "/api/users/me/preferences", bytes.NewBuffer(body)).WithContext(ctx)

	// Validation passes; panics at DB layer
	code, panicked := callProfileHandlerSafe(func(rec *httptest.ResponseRecorder) {
		h.handleSetPreferences(rec, req)
	})
	if !panicked && code == http.StatusBadRequest {
		t.Fatal("expected to pass validation (should reach DB layer)")
	}
}

// --- Route Registration ---

func TestProfileHandlersRegisterRoutes(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	r := mux.NewRouter()
	h.RegisterRoutes(r)

	routes := []struct {
		method string
		path   string
	}{
		{"PATCH", "/api/users/me"},
		{"PATCH", "/api/users/me/password"},
		{"GET", "/api/users/me/preferences"},
		{"PUT", "/api/users/me/preferences"},
	}

	for _, rt := range routes {
		req := httptest.NewRequest(rt.method, rt.path, nil)
		match := &mux.RouteMatch{}
		if !r.Match(req, match) {
			t.Errorf("expected route %s %s to be registered", rt.method, rt.path)
		}
	}
}

func TestNewProfileHandlers(t *testing.T) {
	svc := NewJWTService("test-secret")
	authSvc := &AuthService{jwt: svc}
	h := NewProfileHandlers(authSvc, nil)

	if h == nil {
		t.Fatal("expected non-nil ProfileHandlers")
	}
	if h.service != authSvc {
		t.Fatal("expected service to be set")
	}
}
