package config

import "os"

type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      string
	EncryptionKey  string
	MigrationsPath string
}

func Load() *Config {
	return &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://dashboard:devpassword@localhost:5432/k8sdashboard?sslmode=disable"),
		JWTSecret:      getEnv("JWT_SECRET", "dev-secret-change-in-prod"),
		EncryptionKey:  getEnv("ENCRYPTION_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
		MigrationsPath: getEnv("MIGRATIONS_PATH", "migrations"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
