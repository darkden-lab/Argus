package config

import (
	"fmt"
	"log"
	"os"
)

// Default values for dev secrets — used to detect unchanged defaults in production.
const (
	defaultJWTSecret     = "dev-secret-change-in-prod"
	defaultEncryptionKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	defaultDatabaseURL   = "postgres://dashboard:devpassword@localhost:5432/argus?sslmode=disable"
)

type Config struct {
	AppEnv         string
	Port           string
	DatabaseURL    string
	JWTSecret      string
	EncryptionKey  string
	MigrationsPath string
	OIDCIssuer     string
	OIDCClientID   string
	OIDCClientSecret string
	OIDCRedirectURL  string

	// Kafka / Notifications
	KafkaBrokers       string
	KafkaConsumerGroup string
	SMTPHost           string
	SMTPPort           string
	SMTPUser           string
	SMTPPass           string
	SMTPFrom           string
	NotificationFrom   string

	// Frontend
	FrontendURL string

	// Security
	AllowedOrigins string

	// gRPC (Cluster Agent)
	GRPCPort    string
	GRPCTLSCert string
	GRPCTLSKey  string
}

// Validate checks that production environments do not use default dev secrets.
// In development, it logs warnings for any default secrets still in use.
func (c *Config) Validate() error {
	type check struct {
		name  string
		value string
		def   string
	}
	checks := []check{
		{"JWT_SECRET", c.JWTSecret, defaultJWTSecret},
		{"ENCRYPTION_KEY", c.EncryptionKey, defaultEncryptionKey},
		{"DATABASE_URL", c.DatabaseURL, defaultDatabaseURL},
	}

	isProduction := c.AppEnv == "production"
	for _, ch := range checks {
		if ch.value == ch.def {
			if isProduction {
				return fmt.Errorf("config: %s must not use the default value in production", ch.name)
			}
			log.Printf("WARNING: %s is using the default dev value — change it before deploying to production", ch.name)
		}
	}
	return nil
}

func Load() *Config {
	return &Config{
		AppEnv:         getEnv("APP_ENV", "development"),
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", defaultDatabaseURL),
		JWTSecret:      getEnv("JWT_SECRET", defaultJWTSecret),
		EncryptionKey:  getEnv("ENCRYPTION_KEY", defaultEncryptionKey),
		MigrationsPath:   getEnv("MIGRATIONS_PATH", "migrations"),
		OIDCIssuer:       getEnv("OIDC_ISSUER", ""),
		OIDCClientID:     getEnv("OIDC_CLIENT_ID", ""),
		OIDCClientSecret: getEnv("OIDC_CLIENT_SECRET", ""),
		OIDCRedirectURL:  getEnv("OIDC_REDIRECT_URL", "http://localhost:8080/api/auth/oidc/callback"),

		KafkaBrokers:       getEnv("KAFKA_BROKERS", ""),
		KafkaConsumerGroup: getEnv("KAFKA_CONSUMER_GROUP", "argus-notifications"),
		SMTPHost:           getEnv("SMTP_HOST", ""),
		SMTPPort:           getEnv("SMTP_PORT", "587"),
		SMTPUser:           getEnv("SMTP_USER", ""),
		SMTPPass:           getEnv("SMTP_PASS", ""),
		SMTPFrom:           getEnv("SMTP_FROM", ""),
		NotificationFrom:   getEnv("NOTIFICATION_FROM_NAME", "K8s Dashboard"),

		FrontendURL:    getEnv("FRONTEND_URL", "http://localhost:3000"),
		AllowedOrigins: getEnv("ALLOWED_ORIGINS", "http://localhost:3000"),

		GRPCPort:    getEnv("GRPC_PORT", "9090"),
		GRPCTLSCert: getEnv("GRPC_TLS_CERT", ""),
		GRPCTLSKey:  getEnv("GRPC_TLS_KEY", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
