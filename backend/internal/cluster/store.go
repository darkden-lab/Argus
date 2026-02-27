package cluster

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrClusterNameExists is returned when a cluster with the same name already exists.
var ErrClusterNameExists = errors.New("cluster name already exists")

type Store struct {
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

func (s *Store) CreateCluster(ctx context.Context, name, apiServerURL string, kubeconfigEnc []byte) (*Cluster, error) {
	var c Cluster
	err := s.pool.QueryRow(ctx,
		`INSERT INTO clusters (name, api_server_url, kubeconfig_enc, status, connection_type)
		 VALUES ($1, $2, $3, 'disconnected', 'kubeconfig')
		 RETURNING id, name, api_server_url, status, connection_type, agent_id, created_at`,
		name, apiServerURL, kubeconfigEnc,
	).Scan(&c.ID, &c.Name, &c.APIServerURL, &c.Status, &c.ConnectionType, &c.AgentID, &c.CreatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && strings.Contains(pgErr.ConstraintName, "clusters_name_unique") {
			return nil, ErrClusterNameExists
		}
		return nil, fmt.Errorf("failed to create cluster: %w", err)
	}
	return &c, nil
}

func (s *Store) GetCluster(ctx context.Context, id string) (*Cluster, error) {
	var c Cluster
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, api_server_url, status, connection_type, agent_id, created_at, last_health
		 FROM clusters WHERE id = $1`,
		id,
	).Scan(&c.ID, &c.Name, &c.APIServerURL, &c.Status, &c.ConnectionType, &c.AgentID, &c.CreatedAt, &c.LastHealth)
	if err != nil {
		return nil, fmt.Errorf("cluster not found: %w", err)
	}
	return &c, nil
}

func (s *Store) ListClusters(ctx context.Context) ([]*Cluster, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, api_server_url, status, connection_type, agent_id, created_at, last_health
		 FROM clusters ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list clusters: %w", err)
	}
	defer rows.Close()

	var clusters []*Cluster
	for rows.Next() {
		var c Cluster
		if err := rows.Scan(&c.ID, &c.Name, &c.APIServerURL, &c.Status, &c.ConnectionType, &c.AgentID, &c.CreatedAt, &c.LastHealth); err != nil {
			return nil, fmt.Errorf("failed to scan cluster: %w", err)
		}
		clusters = append(clusters, &c)
	}
	return clusters, rows.Err()
}

func (s *Store) UpdateCluster(ctx context.Context, id, name, apiServerURL string) (*Cluster, error) {
	var c Cluster
	err := s.pool.QueryRow(ctx,
		`UPDATE clusters SET name = $2, api_server_url = $3
		 WHERE id = $1
		 RETURNING id, name, api_server_url, status, connection_type, agent_id, created_at, last_health`,
		id, name, apiServerURL,
	).Scan(&c.ID, &c.Name, &c.APIServerURL, &c.Status, &c.ConnectionType, &c.AgentID, &c.CreatedAt, &c.LastHealth)
	if err != nil {
		return nil, fmt.Errorf("failed to update cluster: %w", err)
	}
	return &c, nil
}

func (s *Store) DeleteCluster(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM clusters WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete cluster: %w", err)
	}
	return nil
}

func (s *Store) UpdateClusterStatus(ctx context.Context, id, status string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE clusters SET status = $2, last_health = NOW() WHERE id = $1`,
		id, status,
	)
	if err != nil {
		return fmt.Errorf("failed to update cluster status: %w", err)
	}
	return nil
}
