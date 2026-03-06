package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type APIKey struct {
	ID         string     `json:"id"`
	UserID     string     `json:"-"`
	Name       string     `json:"name"`
	KeyPrefix  string     `json:"key_prefix"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	IsActive   bool       `json:"is_active"`
	CreatedAt  time.Time  `json:"created_at"`
}

type CreateAPIKeyResponse struct {
	APIKey
	Key string `json:"key"`
}

type APIKeyService struct {
	pool *pgxpool.Pool
}

func NewAPIKeyService(pool *pgxpool.Pool) *APIKeyService {
	return &APIKeyService{pool: pool}
}

func generateAPIKey() (string, string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	key := "argus_" + hex.EncodeToString(b)
	prefix := key[:14] // "argus_" + 8 hex chars
	return key, prefix, nil
}

// maxKeysPerUser is the maximum number of API keys a single user can hold.
const maxKeysPerUser = 25

func (s *APIKeyService) CreateKey(ctx context.Context, userID, name string, expiresAt *time.Time) (*CreateAPIKeyResponse, error) {
	var count int
	if err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM api_keys WHERE user_id = $1 AND is_active = true`, userID,
	).Scan(&count); err != nil {
		return nil, fmt.Errorf("failed to check key count: %w", err)
	}
	if count >= maxKeysPerUser {
		return nil, fmt.Errorf("maximum number of API keys (%d) reached", maxKeysPerUser)
	}

	key, prefix, err := generateAPIKey()
	if err != nil {
		return nil, fmt.Errorf("failed to generate API key: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(key), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash API key: %w", err)
	}

	var apiKey APIKey
	err = s.pool.QueryRow(ctx,
		`INSERT INTO api_keys (user_id, name, key_hash, key_prefix, expires_at)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, user_id, name, key_prefix, last_used_at, expires_at, is_active, created_at`,
		userID, name, string(hash), prefix, expiresAt,
	).Scan(&apiKey.ID, &apiKey.UserID, &apiKey.Name, &apiKey.KeyPrefix,
		&apiKey.LastUsedAt, &apiKey.ExpiresAt, &apiKey.IsActive, &apiKey.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create API key: %w", err)
	}

	return &CreateAPIKeyResponse{
		APIKey: apiKey,
		Key:    key,
	}, nil
}

func (s *APIKeyService) ListKeys(ctx context.Context, userID string) ([]APIKey, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, name, key_prefix, last_used_at, expires_at, is_active, created_at
		 FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list API keys: %w", err)
	}
	defer rows.Close()

	var keys []APIKey
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.ID, &k.UserID, &k.Name, &k.KeyPrefix,
			&k.LastUsedAt, &k.ExpiresAt, &k.IsActive, &k.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan API key: %w", err)
		}
		keys = append(keys, k)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate API keys: %w", err)
	}
	return keys, nil
}

func (s *APIKeyService) RevokeKey(ctx context.Context, userID, keyID string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE api_keys SET is_active = false WHERE id = $1 AND user_id = $2`, keyID, userID)
	if err != nil {
		return fmt.Errorf("failed to revoke API key: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("API key not found")
	}
	return nil
}

func (s *APIKeyService) ValidateKey(ctx context.Context, rawKey string) (*Claims, error) {
	if len(rawKey) < 14 {
		return nil, fmt.Errorf("invalid API key format")
	}
	prefix := rawKey[:14]

	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, key_hash, expires_at, is_active
		 FROM api_keys WHERE key_prefix = $1 AND is_active = true`, prefix)
	if err != nil {
		return nil, fmt.Errorf("failed to query API keys: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id, userID, keyHash string
		var expiresAt *time.Time
		var isActive bool
		if err := rows.Scan(&id, &userID, &keyHash, &expiresAt, &isActive); err != nil {
			continue
		}

		if err := bcrypt.CompareHashAndPassword([]byte(keyHash), []byte(rawKey)); err != nil {
			continue
		}

		// Match found — check expiration
		if expiresAt != nil && time.Now().After(*expiresAt) {
			return nil, fmt.Errorf("API key has expired")
		}

		// Update last_used_at atomically (also re-checks active+expiry to prevent TOCTOU)
		_, _ = s.pool.Exec(ctx,
			`UPDATE api_keys SET last_used_at = NOW()
			 WHERE id = $1 AND is_active = true AND (expires_at IS NULL OR expires_at > NOW())`, id)

		// Look up user email
		var email string
		err := s.pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email)
		if err != nil {
			return nil, fmt.Errorf("failed to look up user: %w", err)
		}

		return &Claims{UserID: userID, Email: email}, nil
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate API keys: %w", err)
	}

	return nil, fmt.Errorf("invalid API key")
}
