package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
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

func TestOIDCStateGeneration(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	state1, err := svc.generateState()
	if err != nil {
		t.Fatalf("failed to generate state: %v", err)
	}
	if state1 == "" {
		t.Error("expected non-empty state")
	}

	state2, err := svc.generateState()
	if err != nil {
		t.Fatalf("failed to generate state: %v", err)
	}
	if state1 == state2 {
		t.Error("expected unique states")
	}
}

func TestOIDCStateValidation(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	state, _ := svc.generateState()

	// Valid state should succeed
	if !svc.validateState(state) {
		t.Error("expected state to be valid")
	}

	// Same state should not be reusable
	if svc.validateState(state) {
		t.Error("expected state to be consumed after first validation")
	}

	// Unknown state should fail
	if svc.validateState("unknown-state") {
		t.Error("expected unknown state to be invalid")
	}
}

func TestOIDCStateExpiration(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	// Manually insert expired state
	svc.mu.Lock()
	svc.states["expired-state"] = time.Now().Add(-1 * time.Minute)
	svc.mu.Unlock()

	if svc.validateState("expired-state") {
		t.Error("expected expired state to be invalid")
	}
}

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
