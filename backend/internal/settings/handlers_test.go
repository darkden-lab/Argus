package settings

import "testing"

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
