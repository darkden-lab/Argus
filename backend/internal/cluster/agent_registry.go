package cluster

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// AgentToken represents a registration token record.
type AgentToken struct {
	ID          string     `json:"id"`
	ClusterName string     `json:"cluster_name"`
	CreatedBy   string     `json:"created_by"`
	Permissions string     `json:"permissions"`
	Used        bool       `json:"used"`
	ClusterID   *string    `json:"cluster_id,omitempty"`
	ExpiresAt   time.Time  `json:"expires_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UsedAt      *time.Time `json:"used_at,omitempty"`
}

// AgentRegistry manages agent registration tokens.
type AgentRegistry struct {
	pool *pgxpool.Pool
}

func NewAgentRegistry(pool *pgxpool.Pool) *AgentRegistry {
	return &AgentRegistry{pool: pool}
}

// GenerateToken creates a new registration token for agent enrollment.
// Returns the raw token (to be shown once) and the stored record.
func (r *AgentRegistry) GenerateToken(ctx context.Context, clusterName, createdBy, permissions string) (string, *AgentToken, error) {
	if permissions == "" {
		permissions = "read-only"
	}

	rawToken, err := generateRandomToken(32)
	if err != nil {
		return "", nil, fmt.Errorf("failed to generate token: %w", err)
	}

	tokenHash := hashTokenString(rawToken)
	expiresAt := time.Now().Add(24 * time.Hour)

	var t AgentToken
	err = r.pool.QueryRow(ctx,
		`INSERT INTO agent_tokens (token_hash, cluster_name, created_by, permissions, expires_at)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, cluster_name, created_by, permissions, used, expires_at, created_at`,
		tokenHash, clusterName, createdBy, permissions, expiresAt,
	).Scan(&t.ID, &t.ClusterName, &t.CreatedBy, &t.Permissions, &t.Used, &t.ExpiresAt, &t.CreatedAt)
	if err != nil {
		return "", nil, fmt.Errorf("failed to store token: %w", err)
	}

	return rawToken, &t, nil
}

// GetToken retrieves a token record by ID.
func (r *AgentRegistry) GetToken(ctx context.Context, id string) (*AgentToken, error) {
	var t AgentToken
	err := r.pool.QueryRow(ctx,
		`SELECT id, cluster_name, created_by, permissions, used, cluster_id, expires_at, created_at, used_at
		 FROM agent_tokens WHERE id = $1`, id,
	).Scan(&t.ID, &t.ClusterName, &t.CreatedBy, &t.Permissions, &t.Used, &t.ClusterID, &t.ExpiresAt, &t.CreatedAt, &t.UsedAt)
	if err != nil {
		return nil, fmt.Errorf("token not found: %w", err)
	}
	return &t, nil
}

// ListTokens returns tokens created by a specific user.
func (r *AgentRegistry) ListTokens(ctx context.Context, createdBy string) ([]*AgentToken, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, cluster_name, created_by, permissions, used, cluster_id, expires_at, created_at, used_at
		 FROM agent_tokens WHERE created_by = $1 ORDER BY created_at DESC`, createdBy,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list tokens: %w", err)
	}
	defer rows.Close()

	var tokens []*AgentToken
	for rows.Next() {
		var t AgentToken
		if err := rows.Scan(&t.ID, &t.ClusterName, &t.CreatedBy, &t.Permissions, &t.Used, &t.ClusterID, &t.ExpiresAt, &t.CreatedAt, &t.UsedAt); err != nil {
			return nil, fmt.Errorf("failed to scan token: %w", err)
		}
		tokens = append(tokens, &t)
	}
	return tokens, rows.Err()
}

// RevokeToken deletes a token by ID. Only unused tokens can be revoked.
func (r *AgentRegistry) RevokeToken(ctx context.Context, id string) error {
	result, err := r.pool.Exec(ctx,
		`DELETE FROM agent_tokens WHERE id = $1 AND used = false`, id,
	)
	if err != nil {
		return fmt.Errorf("failed to revoke token: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("token not found or already used")
	}
	return nil
}

func generateRandomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashTokenString(token string) string {
	h := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", h)
}
