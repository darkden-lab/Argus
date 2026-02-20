package config

import "os"

type Config struct {
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

	// gRPC (Cluster Agent)
	GRPCPort    string
	GRPCTLSCert string
	GRPCTLSKey  string
}

func Load() *Config {
	return &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://dashboard:devpassword@localhost:5432/k8sdashboard?sslmode=disable"),
		JWTSecret:      getEnv("JWT_SECRET", "dev-secret-change-in-prod"),
		EncryptionKey:  getEnv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
		MigrationsPath:   getEnv("MIGRATIONS_PATH", "migrations"),
		OIDCIssuer:       getEnv("OIDC_ISSUER", ""),
		OIDCClientID:     getEnv("OIDC_CLIENT_ID", ""),
		OIDCClientSecret: getEnv("OIDC_CLIENT_SECRET", ""),
		OIDCRedirectURL:  getEnv("OIDC_REDIRECT_URL", "http://localhost:8080/api/auth/oidc/callback"),

		KafkaBrokers:       getEnv("KAFKA_BROKERS", ""),
		KafkaConsumerGroup: getEnv("KAFKA_CONSUMER_GROUP", "k8s-dashboard-notifications"),
		SMTPHost:           getEnv("SMTP_HOST", ""),
		SMTPPort:           getEnv("SMTP_PORT", "587"),
		SMTPUser:           getEnv("SMTP_USER", ""),
		SMTPPass:           getEnv("SMTP_PASS", ""),
		SMTPFrom:           getEnv("SMTP_FROM", ""),
		NotificationFrom:   getEnv("NOTIFICATION_FROM_NAME", "K8s Dashboard"),

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
