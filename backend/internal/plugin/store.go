package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type PluginRecord struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Version     string    `json:"version"`
	Manifest    Manifest  `json:"manifest"`
	Enabled     bool      `json:"enabled"`
	InstalledAt time.Time `json:"installed_at"`
}

type PluginState struct {
	PluginID    string          `json:"plugin_id"`
	ClusterID   string          `json:"cluster_id"`
	Status      string          `json:"status"`
	Config      json.RawMessage `json:"config"`
	InstalledAt time.Time       `json:"installed_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) SavePlugin(ctx context.Context, m Manifest) error {
	manifestJSON, err := json.Marshal(m)
	if err != nil {
		return fmt.Errorf("failed to marshal manifest: %w", err)
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO plugins (id, name, version, manifest, enabled)
		 VALUES ($1, $2, $3, $4, false)
		 ON CONFLICT (id) DO UPDATE SET name = $2, version = $3, manifest = $4`,
		m.ID, m.Name, m.Version, manifestJSON,
	)
	if err != nil {
		return fmt.Errorf("failed to save plugin: %w", err)
	}
	return nil
}

func (s *Store) GetPlugin(ctx context.Context, id string) (*PluginRecord, error) {
	var r PluginRecord
	var manifestJSON []byte
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, version, manifest, enabled, installed_at
		 FROM plugins WHERE id = $1`,
		id,
	).Scan(&r.ID, &r.Name, &r.Version, &manifestJSON, &r.Enabled, &r.InstalledAt)
	if err != nil {
		return nil, fmt.Errorf("plugin not found: %w", err)
	}
	if err := json.Unmarshal(manifestJSON, &r.Manifest); err != nil {
		return nil, fmt.Errorf("failed to unmarshal manifest: %w", err)
	}
	return &r, nil
}

func (s *Store) ListPlugins(ctx context.Context) ([]*PluginRecord, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, version, manifest, enabled, installed_at
		 FROM plugins ORDER BY installed_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list plugins: %w", err)
	}
	defer rows.Close()

	var plugins []*PluginRecord
	for rows.Next() {
		var r PluginRecord
		var manifestJSON []byte
		if err := rows.Scan(&r.ID, &r.Name, &r.Version, &manifestJSON, &r.Enabled, &r.InstalledAt); err != nil {
			return nil, fmt.Errorf("failed to scan plugin: %w", err)
		}
		if err := json.Unmarshal(manifestJSON, &r.Manifest); err != nil {
			return nil, fmt.Errorf("failed to unmarshal manifest: %w", err)
		}
		plugins = append(plugins, &r)
	}
	return plugins, rows.Err()
}

func (s *Store) UpdatePluginStatus(ctx context.Context, id string, enabled bool) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE plugins SET enabled = $2 WHERE id = $1`,
		id, enabled,
	)
	if err != nil {
		return fmt.Errorf("failed to update plugin status: %w", err)
	}
	return nil
}

func (s *Store) SavePluginState(ctx context.Context, pluginID, clusterID, status string, config json.RawMessage) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO plugin_state (plugin_id, cluster_id, status, config)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (plugin_id, cluster_id)
		 DO UPDATE SET status = $3, config = $4, updated_at = NOW()`,
		pluginID, clusterID, status, config,
	)
	if err != nil {
		return fmt.Errorf("failed to save plugin state: %w", err)
	}
	return nil
}

func (s *Store) GetPluginState(ctx context.Context, pluginID, clusterID string) (*PluginState, error) {
	var ps PluginState
	err := s.pool.QueryRow(ctx,
		`SELECT plugin_id, cluster_id, status, config, installed_at, updated_at
		 FROM plugin_state WHERE plugin_id = $1 AND cluster_id = $2`,
		pluginID, clusterID,
	).Scan(&ps.PluginID, &ps.ClusterID, &ps.Status, &ps.Config, &ps.InstalledAt, &ps.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("plugin state not found: %w", err)
	}
	return &ps, nil
}
