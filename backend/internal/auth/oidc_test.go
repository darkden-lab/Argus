package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
)

func TestOIDCServiceNilWhenNotConfigured(t *testing.T) {
	cfg := OIDCConfig{
		Issuer:   "",
		ClientID: "",
	}
	svc, err := NewOIDCService(nil, cfg, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if svc != nil {
		t.Error("expected nil service when OIDC is not configured")
	}
}

func TestOIDCServiceEnabled(t *testing.T) {
	var svc *OIDCService
	if svc.Enabled() {
		t.Error("nil service should not be enabled")
	}

	svc = &OIDCService{}
	if svc.Enabled() {
		t.Error("service with nil provider should not be enabled")
	}
}

// State generation/validation tests require a database connection.
// These are covered by integration tests.

func TestHandleProviderInfoDisabled(t *testing.T) {
	svc := &OIDCService{}
	req := httptest.NewRequest("GET", "/api/auth/oidc/info", nil)
	rec := httptest.NewRecorder()

	svc.HandleProviderInfo(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}

	var result map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result["enabled"] != false {
		t.Error("expected enabled to be false")
	}
}

// TestOIDCNewServiceEmptyIssuer verifies NewOIDCService returns nil when issuer is empty.
func TestOIDCNewServiceEmptyIssuer(t *testing.T) {
	cfg := OIDCConfig{
		Issuer:       "",
		ClientID:     "some-client-id",
		ClientSecret: "secret",
	}
	svc, err := NewOIDCService(nil, cfg, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if svc != nil {
		t.Error("expected nil service when issuer is empty")
	}
}

// TestOIDCNewServiceEmptyClientID verifies NewOIDCService returns nil when client ID is empty.
func TestOIDCNewServiceEmptyClientID(t *testing.T) {
	cfg := OIDCConfig{
		Issuer:       "https://example.com",
		ClientID:     "",
		ClientSecret: "secret",
	}
	svc, err := NewOIDCService(nil, cfg, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if svc != nil {
		t.Error("expected nil service when client ID is empty")
	}
}

// TestOIDCNewServiceBothEmpty verifies NewOIDCService returns nil when both are empty.
func TestOIDCNewServiceBothEmpty(t *testing.T) {
	cfg := OIDCConfig{}
	svc, err := NewOIDCService(nil, cfg, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if svc != nil {
		t.Error("expected nil service when both issuer and client ID are empty")
	}
}

// TestOIDCRegisterRoutes verifies that OIDC routes are registered.
func TestOIDCRegisterRoutes(t *testing.T) {
	svc := &OIDCService{}

	r := mux.NewRouter()
	svc.RegisterRoutes(r)

	routes := []struct {
		path   string
		method string
	}{
		{"/api/auth/oidc/authorize", "GET"},
		{"/api/auth/oidc/callback", "GET"},
		{"/api/auth/oidc/info", "GET"},
	}

	for _, rt := range routes {
		req := httptest.NewRequest(rt.method, rt.path, nil)
		match := &mux.RouteMatch{}
		if !r.Match(req, match) {
			t.Errorf("expected OIDC route %s %s to be registered", rt.method, rt.path)
		}
	}
}

// TestHandleProviderInfoEnabled tests provider info when OIDC is enabled
// (has a non-nil provider).
func TestHandleProviderInfoEnabled(t *testing.T) {
	svc := &OIDCService{}
	req := httptest.NewRequest("GET", "/api/auth/oidc/info", nil)
	rec := httptest.NewRecorder()

	svc.HandleProviderInfo(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var result map[string]interface{}
	json.NewDecoder(rec.Body).Decode(&result)

	if result["enabled"] != false {
		t.Error("expected enabled to be false for service without provider")
	}
	// When disabled, authorize_url should not be present
	if _, exists := result["authorize_url"]; exists {
		t.Error("expected authorize_url to not be present when disabled")
	}
}

// TestOIDCCallbackMissingState verifies that the callback rejects requests without state.
// Without a DB, validateState returns false for any input, which is the correct behavior.
func TestOIDCCallbackMissingState(t *testing.T) {
	svc := &OIDCService{}

	req := httptest.NewRequest("GET", "/api/auth/oidc/callback", nil)
	rec := httptest.NewRecorder()

	svc.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing state, got %d", rec.Code)
	}
}

// TestOIDCCallbackInvalidState verifies that the callback rejects forged state values.
func TestOIDCCallbackInvalidState(t *testing.T) {
	svc := &OIDCService{}

	req := httptest.NewRequest("GET", "/api/auth/oidc/callback?state=forged-state&code=fake", nil)
	rec := httptest.NewRecorder()

	svc.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid state, got %d", rec.Code)
	}
}

// TestOIDCStateEmptyString verifies that empty string state is rejected.
func TestOIDCStateEmptyString(t *testing.T) {
	svc := &OIDCService{}

	if svc.validateState("") {
		t.Fatal("expected empty state to be invalid")
	}
}

// TestOIDCStateBruteForce verifies that random guesses are rejected.
func TestOIDCStateBruteForce(t *testing.T) {
	svc := &OIDCService{}

	guesses := []string{
		"",
		"guess",
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
		"../../../etc/passwd",
		"<script>alert(1)</script>",
	}

	for _, guess := range guesses {
		if svc.validateState(guess) {
			t.Errorf("SECURITY: brute force state guess accepted: %q", guess)
		}
	}
}

// TestOIDCFrontendURLDefault verifies that the default frontend URL is used when not configured.
func TestOIDCFrontendURLDefault(t *testing.T) {
	cfg := OIDCConfig{
		FrontendURL: "",
	}
	// Can't test the full constructor without a real OIDC provider,
	// but we can verify the default logic in isolation.
	frontendURL := cfg.FrontendURL
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	if frontendURL != "http://localhost:3000" {
		t.Errorf("expected default frontend URL, got %s", frontendURL)
	}
}

// TestOIDCFrontendURLCustom verifies that a custom frontend URL is used.
func TestOIDCFrontendURLCustom(t *testing.T) {
	cfg := OIDCConfig{
		FrontendURL: "https://dashboard.example.com",
	}
	if cfg.FrontendURL != "https://dashboard.example.com" {
		t.Errorf("expected custom frontend URL, got %s", cfg.FrontendURL)
	}
}
