package config

import (
	"os"
	"strings"
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

func TestLoadDefaultAppEnv(t *testing.T) {
	os.Unsetenv("APP_ENV")
	cfg := Load()
	if cfg.AppEnv != "development" {
		t.Errorf("expected default AppEnv 'development', got '%s'", cfg.AppEnv)
	}
}

func TestGetEnvFallback(t *testing.T) {
	result := getEnv("NONEXISTENT_VAR_12345", "fallback")
	if result != "fallback" {
		t.Errorf("expected 'fallback', got '%s'", result)
	}
}

func TestValidateDevDefaultsAllowed(t *testing.T) {
	cfg := &Config{
		AppEnv:        "development",
		JWTSecret:     defaultJWTSecret,
		EncryptionKey: defaultEncryptionKey,
		DatabaseURL:   defaultDatabaseURL,
	}
	if err := cfg.Validate(); err != nil {
		t.Errorf("expected no error in development with defaults, got: %v", err)
	}
}

func TestValidateProdBlocksDefaultJWTSecret(t *testing.T) {
	cfg := &Config{
		AppEnv:        "production",
		JWTSecret:     defaultJWTSecret,
		EncryptionKey: "real-key-abc123",
		DatabaseURL:   "postgres://real:real@prod:5432/argus",
	}
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for default JWT_SECRET in production, got nil")
	}
	if !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Errorf("expected error to mention JWT_SECRET, got: %v", err)
	}
}

func TestValidateProdBlocksDefaultEncryptionKey(t *testing.T) {
	cfg := &Config{
		AppEnv:        "production",
		JWTSecret:     "real-secret",
		EncryptionKey: defaultEncryptionKey,
		DatabaseURL:   "postgres://real:real@prod:5432/argus",
	}
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for default ENCRYPTION_KEY in production, got nil")
	}
	if !strings.Contains(err.Error(), "ENCRYPTION_KEY") {
		t.Errorf("expected error to mention ENCRYPTION_KEY, got: %v", err)
	}
}

func TestValidateProdBlocksDefaultDatabaseURL(t *testing.T) {
	cfg := &Config{
		AppEnv:        "production",
		JWTSecret:     "real-secret",
		EncryptionKey: "real-key-abc123",
		DatabaseURL:   defaultDatabaseURL,
	}
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected error for default DATABASE_URL in production, got nil")
	}
	if !strings.Contains(err.Error(), "DATABASE_URL") {
		t.Errorf("expected error to mention DATABASE_URL, got: %v", err)
	}
}

func TestValidateProdPassesWithRealSecrets(t *testing.T) {
	cfg := &Config{
		AppEnv:        "production",
		JWTSecret:     "super-secret-prod-key",
		EncryptionKey: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
		DatabaseURL:   "postgres://produser:prodpass@db.example.com:5432/argus?sslmode=require",
	}
	if err := cfg.Validate(); err != nil {
		t.Errorf("expected no error in production with real secrets, got: %v", err)
	}
}
