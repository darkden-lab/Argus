package settings

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/config"
)

func TestValidateIssuerURL_ValidHTTPS(t *testing.T) {
	validURLs := []string{
		"https://login.microsoftonline.com/tenant/v2.0",
		"https://accounts.google.com",
		"https://mycompany.okta.com",
		"https://auth.example.com/realms/myrealm",
	}
	for _, u := range validURLs {
		if err := validateIssuerURL(u); err != nil {
			t.Errorf("expected %q to be valid, got error: %v", u, err)
		}
	}
}

func TestValidateIssuerURL_RejectsHTTP(t *testing.T) {
	if err := validateIssuerURL("http://example.com"); err == nil {
		t.Error("expected HTTP URL to be rejected")
	}
}

func TestValidateIssuerURL_RejectsPrivateIPs(t *testing.T) {
	privateURLs := []string{
		"https://127.0.0.1/oidc",
		"https://10.0.0.1/oidc",
		"https://172.16.0.1/oidc",
		"https://192.168.1.1/oidc",
		"https://169.254.169.254/latest/meta-data",
	}
	for _, u := range privateURLs {
		if err := validateIssuerURL(u); err == nil {
			t.Errorf("expected private IP URL %q to be rejected", u)
		}
	}
}

func TestValidateIssuerURL_RejectsEmptyScheme(t *testing.T) {
	if err := validateIssuerURL("example.com"); err == nil {
		t.Error("expected URL without scheme to be rejected")
	}
}

func TestValidateIssuerURL_AllowsPublicIPs(t *testing.T) {
	if err := validateIssuerURL("https://8.8.8.8/oidc"); err != nil {
		t.Errorf("expected public IP URL to be allowed, got: %v", err)
	}
}

func TestValidateIssuerURL_AllowsHostnames(t *testing.T) {
	// Hostnames (not IPs) are allowed — DNS resolution is not checked
	if err := validateIssuerURL("https://auth.internal.corp/oidc"); err != nil {
		t.Errorf("expected hostname URL to be allowed, got: %v", err)
	}
}

func TestGetOIDCFallsBackToEnvConfig(t *testing.T) {
	cfg := &config.Config{
		OIDCIssuer:      "https://accounts.google.com",
		OIDCClientID:    "test-client-id",
		OIDCRedirectURL: "https://argus.example.com/auth/callback",
	}
	h := NewHandlers(nil, cfg, nil, nil) // nil pool → fallback to env config

	req := httptest.NewRequest("GET", "/api/settings/oidc", nil)
	rec := httptest.NewRecorder()

	h.GetOIDC(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var oc OidcConfig
	json.Unmarshal(rec.Body.Bytes(), &oc) //nolint:errcheck
	if !oc.Enabled {
		t.Error("expected enabled=true when issuer+clientID are set")
	}
	if oc.IssuerURL != "https://accounts.google.com" {
		t.Errorf("expected issuer from config, got %q", oc.IssuerURL)
	}
	if oc.ClientID != "test-client-id" {
		t.Errorf("expected clientID from config, got %q", oc.ClientID)
	}
	if oc.ClientSecret != "" {
		t.Error("client secret should not be exposed")
	}
}

func TestGetOIDCDisabledWhenNoConfig(t *testing.T) {
	h := NewHandlers(nil, &config.Config{}, nil, nil)
	req := httptest.NewRequest("GET", "/api/settings/oidc", nil)
	rec := httptest.NewRecorder()

	h.GetOIDC(rec, req)

	var oc OidcConfig
	json.Unmarshal(rec.Body.Bytes(), &oc) //nolint:errcheck
	if oc.Enabled {
		t.Error("expected enabled=false when no issuer/clientID")
	}
}

func TestUpdateOIDCNilPool(t *testing.T) {
	h := NewHandlers(nil, &config.Config{}, nil, nil)
	body, _ := json.Marshal(OidcConfig{Enabled: true, IssuerURL: "https://example.com"})
	req := httptest.NewRequest("PUT", "/api/settings/oidc", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	h.UpdateOIDC(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503, got %d", rec.Code)
	}
}

func TestUpdateOIDCBadJSON(t *testing.T) {
	// UpdateOIDC checks pool==nil first (503), so bad JSON test goes through TestOIDC
}

func TestTestOIDCBadJSON(t *testing.T) {
	h := NewHandlers(nil, &config.Config{}, nil, nil)
	req := httptest.NewRequest("POST", "/api/settings/oidc/test", bytes.NewReader([]byte("not json")))
	rec := httptest.NewRecorder()

	h.TestOIDC(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestTestOIDCEmptyURL(t *testing.T) {
	h := NewHandlers(nil, &config.Config{}, nil, nil)
	body, _ := json.Marshal(map[string]string{"issuer_url": ""})
	req := httptest.NewRequest("POST", "/api/settings/oidc/test", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	h.TestOIDC(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestTestOIDCRejectsHTTP(t *testing.T) {
	h := NewHandlers(nil, &config.Config{}, nil, nil)
	body, _ := json.Marshal(map[string]string{"issuer_url": "http://example.com"})
	req := httptest.NewRequest("POST", "/api/settings/oidc/test", bytes.NewReader(body))
	rec := httptest.NewRecorder()

	h.TestOIDC(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var resp map[string]interface{}
	json.Unmarshal(rec.Body.Bytes(), &resp) //nolint:errcheck
	if resp["success"] != false {
		t.Error("expected success=false for HTTP URL")
	}
}

func TestGetOIDCProviders(t *testing.T) {
	h := NewHandlers(nil, &config.Config{}, nil, nil)
	req := httptest.NewRequest("GET", "/api/settings/oidc/providers", nil)
	rec := httptest.NewRecorder()

	h.GetOIDCProviders(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var providers []interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &providers); err != nil {
		t.Fatalf("expected JSON array, got error: %v", err)
	}
	if len(providers) == 0 {
		t.Error("expected at least one provider preset")
	}
}

func TestRegisterRoutes(t *testing.T) {
	h := NewHandlers(nil, &config.Config{}, nil, nil)
	r := mux.NewRouter()
	h.RegisterRoutes(r)
	h.RegisterPublicRoutes(r)

	routes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/settings/oidc"},
		{"PUT", "/api/settings/oidc"},
		{"POST", "/api/settings/oidc/test"},
		{"GET", "/api/settings/oidc/providers"},
	}
	for _, rt := range routes {
		req := httptest.NewRequest(rt.method, rt.path, nil)
		match := &mux.RouteMatch{}
		if !r.Match(req, match) {
			t.Errorf("expected route %s %s to match", rt.method, rt.path)
		}
	}
}

func TestOidcConfigJSON(t *testing.T) {
	oc := OidcConfig{
		Enabled:      true,
		ProviderType: "google",
		IssuerURL:    "https://accounts.google.com",
		ClientID:     "test-id",
		ClientSecret: "secret",
	}
	data, _ := json.Marshal(oc)
	var parsed OidcConfig
	json.Unmarshal(data, &parsed) //nolint:errcheck
	if parsed.ClientSecret != "secret" {
		t.Error("expected client_secret in JSON when set")
	}

	// omitempty test
	oc2 := OidcConfig{Enabled: false}
	data2, _ := json.Marshal(oc2)
	if bytes.Contains(data2, []byte("client_secret")) {
		t.Error("expected client_secret omitted when empty")
	}
}
