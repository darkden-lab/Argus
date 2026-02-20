package internal

import (
	"fmt"
	"os"
)

type Config struct {
	DashboardURL string
	Token        string
	ClusterName  string
	AgentToken   string
	ClusterID    string
}

func LoadConfig() (*Config, error) {
	cfg := &Config{
		DashboardURL: getEnv("DASHBOARD_URL", ""),
		Token:        getEnv("AGENT_REGISTRATION_TOKEN", ""),
		ClusterName:  getEnv("CLUSTER_NAME", ""),
		AgentToken:   getEnv("AGENT_TOKEN", ""),
		ClusterID:    getEnv("CLUSTER_ID", ""),
	}

	if cfg.DashboardURL == "" {
		return nil, fmt.Errorf("DASHBOARD_URL is required")
	}

	// Either registration token (first run) or permanent agent token (reconnect)
	if cfg.Token == "" && cfg.AgentToken == "" {
		return nil, fmt.Errorf("AGENT_REGISTRATION_TOKEN or AGENT_TOKEN is required")
	}

	if cfg.Token != "" && cfg.ClusterName == "" {
		return nil, fmt.Errorf("CLUSTER_NAME is required for registration")
	}

	return cfg, nil
}

// IsRegistered returns true if the agent has permanent credentials.
func (c *Config) IsRegistered() bool {
	return c.AgentToken != "" && c.ClusterID != ""
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
