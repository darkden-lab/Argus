package cluster

import "time"

type Cluster struct {
	ID             string     `json:"id"`
	Name           string     `json:"name"`
	APIServerURL   string     `json:"api_server_url"`
	Status         string     `json:"status"`
	ConnectionType string     `json:"connection_type"`
	AgentID        *string    `json:"agent_id,omitempty"`
	Labels         string     `json:"labels,omitempty"`
	NodeCount      *int       `json:"node_count,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	LastHealth     *time.Time `json:"last_health,omitempty"`
}
