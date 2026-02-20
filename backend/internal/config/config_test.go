package config

import (
	"os"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	cfg := Load()

	if cfg.Port != "8080" {
		t.Errorf("expected default port '8080', got '%s'", cfg.Port)
	}
	if cfg.JWTSecret != "dev-secret-change-in-prod" {
		t.Errorf("expected default JWT secret, got '%s'", cfg.JWTSecret)
	}
	if cfg.MigrationsPath != "migrations" {
		t.Errorf("expected default migrations path, got '%s'", cfg.MigrationsPath)
	}
	if cfg.OIDCIssuer != "" {
		t.Errorf("expected empty OIDC issuer by default, got '%s'", cfg.OIDCIssuer)
	}
	if cfg.OIDCRedirectURL != "http://localhost:8080/api/auth/oidc/callback" {
		t.Errorf("expected default OIDC redirect URL, got '%s'", cfg.OIDCRedirectURL)
	}
}

func TestLoadFromEnv(t *testing.T) {
	os.Setenv("PORT", "9090")
	os.Setenv("JWT_SECRET", "my-secret")
	defer os.Unsetenv("PORT")
	defer os.Unsetenv("JWT_SECRET")

	cfg := Load()

	if cfg.Port != "9090" {
		t.Errorf("expected port '9090', got '%s'", cfg.Port)
	}
	if cfg.JWTSecret != "my-secret" {
		t.Errorf("expected JWT secret 'my-secret', got '%s'", cfg.JWTSecret)
	}
}

func TestGetEnvFallback(t *testing.T) {
	result := getEnv("NONEXISTENT_VAR_12345", "fallback")
	if result != "fallback" {
		t.Errorf("expected 'fallback', got '%s'", result)
	}
}
