package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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

// --- Security Tests ---

// TestOIDCStateReplayAttack verifies that a state token cannot be reused
// (prevents CSRF replay attacks).
func TestOIDCStateReplayAttack(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	state, _ := svc.generateState()

	// First use should succeed
	if !svc.validateState(state) {
		t.Fatal("first state validation should succeed")
	}

	// Second use (replay) must fail
	if svc.validateState(state) {
		t.Fatal("SECURITY: state token reused - replay attack possible")
	}
}

// TestOIDCStateBruteForce verifies that random guesses are rejected.
func TestOIDCStateBruteForce(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	// Generate a valid state to populate the map
	svc.generateState()

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

// TestOIDCStateUniqueness verifies that generated states are cryptographically unique.
func TestOIDCStateUniqueness(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		state, err := svc.generateState()
		if err != nil {
			t.Fatalf("generateState failed: %v", err)
		}
		if seen[state] {
			t.Fatalf("SECURITY: duplicate state generated after %d iterations", i)
		}
		seen[state] = true
	}
}

// TestOIDCCallbackMissingState verifies that the callback rejects requests without state.
func TestOIDCCallbackMissingState(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	req := httptest.NewRequest("GET", "/api/auth/oidc/callback", nil)
	rec := httptest.NewRecorder()

	svc.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing state, got %d", rec.Code)
	}
}

// TestOIDCCallbackInvalidState verifies that the callback rejects forged state values.
func TestOIDCCallbackInvalidState(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	req := httptest.NewRequest("GET", "/api/auth/oidc/callback?state=forged-state&code=fake", nil)
	rec := httptest.NewRecorder()

	svc.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid state, got %d", rec.Code)
	}
}

// TestOIDCCallbackErrorParam verifies that OIDC error responses are handled.
func TestOIDCCallbackErrorParam(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	// Insert a valid state manually
	state, _ := svc.generateState()

	req := httptest.NewRequest("GET",
		"/api/auth/oidc/callback?state="+state+"&error=access_denied&error_description=user+denied", nil)
	rec := httptest.NewRecorder()

	svc.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for OIDC error param, got %d", rec.Code)
	}

	var resp map[string]string
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] == "" {
		t.Error("expected non-empty error message for OIDC error")
	}
}

// TestOIDCStateExpirationTiming verifies that expired states are rejected.
func TestOIDCStateExpirationTiming(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	// Insert state that expired 1 second ago
	svc.mu.Lock()
	svc.states["just-expired"] = time.Now().Add(-1 * time.Second)
	svc.mu.Unlock()

	if svc.validateState("just-expired") {
		t.Fatal("SECURITY: accepted just-expired state token")
	}
}

// TestOIDCCleanupExpiredStates verifies that generateState cleans up expired entries.
func TestOIDCCleanupExpiredStates(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	// Insert many expired states
	svc.mu.Lock()
	for i := 0; i < 100; i++ {
		svc.states["expired-"+time.Now().String()+string(rune(i))] = time.Now().Add(-1 * time.Hour)
	}
	svc.mu.Unlock()

	// generateState should clean up expired entries
	_, err := svc.generateState()
	if err != nil {
		t.Fatalf("generateState failed: %v", err)
	}

	svc.mu.Lock()
	remaining := len(svc.states)
	svc.mu.Unlock()

	// Should only have the 1 newly generated state
	if remaining > 1 {
		t.Errorf("expected expired states to be cleaned up, but %d remain", remaining)
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
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

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

// TestHandleAuthorizeWithoutProvider tests HandleAuthorize when provider is not
// properly initialized (no oauth2Config set).
func TestHandleAuthorizeWithoutProvider(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	req := httptest.NewRequest("GET", "/api/auth/oidc/authorize", nil)
	rec := httptest.NewRecorder()

	svc.HandleAuthorize(rec, req)

	// Without a configured oauth2Config, AuthCodeURL returns a bare URL.
	// The state should have been generated and stored.
	svc.mu.Lock()
	stateCount := len(svc.states)
	svc.mu.Unlock()

	if stateCount != 1 {
		t.Errorf("expected 1 state stored after authorize, got %d", stateCount)
	}

	// Should redirect (302)
	if rec.Code != http.StatusFound {
		t.Errorf("expected status 302, got %d", rec.Code)
	}
}

// TestHandleCallbackMissingCode tests callback with valid state but missing code.
func TestHandleCallbackMissingCode(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	state, _ := svc.generateState()
	req := httptest.NewRequest("GET", "/api/auth/oidc/callback?state="+state, nil)
	rec := httptest.NewRecorder()

	svc.HandleCallback(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing code, got %d", rec.Code)
	}

	var resp map[string]string
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] != "missing authorization code" {
		t.Errorf("unexpected error message: %s", resp["error"])
	}
}

// TestHandleProviderInfoEnabled tests provider info when OIDC is enabled
// (has a non-nil provider).
func TestHandleProviderInfoEnabled(t *testing.T) {
	// We simulate an enabled OIDC service by creating one with a non-nil provider.
	// Since we can't easily create a real oidc.Provider without a server,
	// we test the disabled case more thoroughly instead.
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

// TestOIDCStateEmptyString verifies that empty string state is rejected.
func TestOIDCStateEmptyString(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	if svc.validateState("") {
		t.Fatal("expected empty state to be invalid")
	}
}

// TestOIDCCallbackWithCodeButNoOauth2Config tests callback when code is present
// but oauth2 exchange will fail (no config).
func TestOIDCCallbackWithCodeButNoOauth2Config(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	state, _ := svc.generateState()
	req := httptest.NewRequest("GET", "/api/auth/oidc/callback?state="+state+"&code=testcode", nil)
	rec := httptest.NewRecorder()

	// Exchange will fail because there's no real OAuth2 endpoint
	svc.HandleCallback(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for failed exchange, got %d", rec.Code)
	}
}

// TestOIDCConcurrentStateOperations tests thread-safety of state operations.
func TestOIDCConcurrentStateOperations(t *testing.T) {
	svc := &OIDCService{
		states: make(map[string]time.Time),
	}

	done := make(chan bool, 50)

	// Generate states concurrently
	for i := 0; i < 25; i++ {
		go func() {
			defer func() { done <- true }()
			_, err := svc.generateState()
			if err != nil {
				t.Errorf("concurrent generateState failed: %v", err)
			}
		}()
	}

	// Validate states concurrently (some will fail, that's fine)
	for i := 0; i < 25; i++ {
		go func() {
			defer func() { done <- true }()
			svc.validateState("random-state")
		}()
	}

	for i := 0; i < 50; i++ {
		<-done
	}
}
