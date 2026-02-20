package cluster

import "time"

type Cluster struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	APIServerURL string    `json:"api_server_url"`
	Status       string    `json:"status"`
	Labels       string    `json:"labels,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	LastHealth   *time.Time `json:"last_health,omitempty"`
}
