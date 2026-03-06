package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/mux"
)

// newAPIKeyHandlerRequest creates a request with claims injected into context
func newAPIKeyHandlerRequest(method, path string, body []byte, userID, email string) *http.Request {
	var req *http.Request
	if body != nil {
		req = httptest.NewRequest(method, path, bytes.NewBuffer(body))
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	req.Header.Set("Content-Type", "application/json")

	claims := &Claims{UserID: userID, Email: email}
	ctx := ContextWithClaims(context.Background(), claims)
	return req.WithContext(ctx)
}

func TestAPIKeyHandleCreateBadJSON(t *testing.T) {
	h := NewAPIKeyHandlers(&APIKeyService{})

	req := newAPIKeyHandlerRequest("POST", "/api/auth/api-keys", []byte("not json"), "user1", "test@test.com")
	rec := httptest.NewRecorder()

	h.handleCreate(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}
}

func TestAPIKeyHandleCreateEmptyName(t *testing.T) {
	h := NewAPIKeyHandlers(&APIKeyService{})

	payload := map[string]interface{}{"name": "", "expires_in_days": 30}
	body, _ := json.Marshal(payload)
	req := newAPIKeyHandlerRequest("POST", "/api/auth/api-keys", body, "user1", "test@test.com")
	rec := httptest.NewRecorder()

	h.handleCreate(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}

	var resp map[string]string
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["error"] != "name is required" {
		t.Errorf("expected 'name is required', got %q", resp["error"])
	}
}

func TestAPIKeyHandleCreateNameTooLong(t *testing.T) {
	h := NewAPIKeyHandlers(&APIKeyService{})

	longName := strings.Repeat("a", 256)
	payload := map[string]interface{}{"name": longName, "expires_in_days": 0}
	body, _ := json.Marshal(payload)
	req := newAPIKeyHandlerRequest("POST", "/api/auth/api-keys", body, "user1", "test@test.com")
	rec := httptest.NewRecorder()

	h.handleCreate(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}

	var resp map[string]string
	json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["error"] != "name must be 255 characters or less" {
		t.Errorf("expected name length error, got %q", resp["error"])
	}
}

func TestAPIKeyHandleCreateNoClaims(t *testing.T) {
	h := NewAPIKeyHandlers(&APIKeyService{})

	req := httptest.NewRequest("POST", "/api/auth/api-keys", nil)
	rec := httptest.NewRecorder()

	h.handleCreate(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rec.Code)
	}
}

func TestAPIKeyHandleListNoClaims(t *testing.T) {
	h := NewAPIKeyHandlers(&APIKeyService{})

	req := httptest.NewRequest("GET", "/api/auth/api-keys", nil)
	rec := httptest.NewRecorder()

	h.handleList(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rec.Code)
	}
}

func TestAPIKeyHandleRevokeNoClaims(t *testing.T) {
	h := NewAPIKeyHandlers(&APIKeyService{})

	req := httptest.NewRequest("DELETE", "/api/auth/api-keys/123", nil)
	rec := httptest.NewRecorder()

	h.handleRevoke(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rec.Code)
	}
}

func TestAPIKeyHandlersRegisterRoutes(t *testing.T) {
	h := NewAPIKeyHandlers(&APIKeyService{})
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	tests := []struct {
		method string
		path   string
	}{
		{"GET", "/api/auth/api-keys"},
		{"POST", "/api/auth/api-keys"},
		{"DELETE", "/api/auth/api-keys/test-id"},
	}

	for _, tt := range tests {
		route := r.GetRoute("")
		_ = route // routes are registered, just verify no panic
		req := httptest.NewRequest(tt.method, tt.path, nil)
		match := &mux.RouteMatch{}
		if !r.Match(req, match) {
			t.Errorf("expected route %s %s to match", tt.method, tt.path)
		}
	}
}

func TestAPIKeyUserIDNotInJSON(t *testing.T) {
	key := APIKey{
		ID:       "test-id",
		UserID:   "secret-user-id",
		Name:     "Test Key",
		KeyPrefix: "argus_abc123",
		IsActive: true,
	}

	data, err := json.Marshal(key)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	if strings.Contains(string(data), "secret-user-id") {
		t.Error("UserID should not be included in JSON output")
	}
	if strings.Contains(string(data), "user_id") {
		t.Error("user_id field should not be in JSON output")
	}
}

func TestAPIKeyHandleCreateNegativeExpiry(t *testing.T) {
	h := NewAPIKeyHandlers(&APIKeyService{})

	payload := map[string]interface{}{"name": "test", "expires_in_days": -1}
	body, _ := json.Marshal(payload)
	req := newAPIKeyHandlerRequest("POST", "/api/auth/api-keys", body, "user1", "test@test.com")
	rec := httptest.NewRecorder()

	h.handleCreate(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}

	var resp map[string]string
	json.Unmarshal(rec.Body.Bytes(), &resp) //nolint:errcheck
	if resp["error"] != "expires_in_days must not be negative" {
		t.Errorf("expected negative expiry error, got %q", resp["error"])
	}
}

func TestMaxKeysPerUserConstant(t *testing.T) {
	if maxKeysPerUser <= 0 {
		t.Error("maxKeysPerUser should be positive")
	}
	if maxKeysPerUser > 100 {
		t.Error("maxKeysPerUser should be reasonable (<=100)")
	}
}

func TestGenerateAPIKey(t *testing.T) {
	key, prefix, err := generateAPIKey()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.HasPrefix(key, "argus_") {
		t.Errorf("key should start with 'argus_', got %q", key[:10])
	}

	if len(prefix) != 14 {
		t.Errorf("prefix should be 14 chars, got %d", len(prefix))
	}

	if prefix != key[:14] {
		t.Errorf("prefix should be first 14 chars of key")
	}

	// Ensure uniqueness
	key2, _, err := generateAPIKey()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if key == key2 {
		t.Error("two generated keys should not be identical")
	}
}
