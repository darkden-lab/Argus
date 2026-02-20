package notifications

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ChannelConfig represents a configured notification channel (admin-managed).
type ChannelConfig struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"`
	Name      string    `json:"name"`
	ConfigEnc []byte    `json:"-"`         // encrypted config, never exposed in JSON
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ChannelStore provides CRUD operations for the notification_channels table.
type ChannelStore struct {
	pool *pgxpool.Pool
}

// NewChannelStore creates a new ChannelStore.
func NewChannelStore(pool *pgxpool.Pool) *ChannelStore {
	return &ChannelStore{pool: pool}
}

// Create inserts a new notification channel.
func (s *ChannelStore) Create(ctx context.Context, ch *ChannelConfig) error {
	return s.pool.QueryRow(ctx,
		`INSERT INTO notification_channels (type, name, config_enc, enabled)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, created_at, updated_at`,
		ch.Type, ch.Name, ch.ConfigEnc, ch.Enabled,
	).Scan(&ch.ID, &ch.CreatedAt, &ch.UpdatedAt)
}

// List returns all configured notification channels.
func (s *ChannelStore) List(ctx context.Context) ([]ChannelConfig, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, type, name, config_enc, enabled, created_at, updated_at
		 FROM notification_channels ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []ChannelConfig
	for rows.Next() {
		var ch ChannelConfig
		if err := rows.Scan(&ch.ID, &ch.Type, &ch.Name, &ch.ConfigEnc, &ch.Enabled, &ch.CreatedAt, &ch.UpdatedAt); err != nil {
			return nil, err
		}
		channels = append(channels, ch)
	}

	if channels == nil {
		channels = []ChannelConfig{}
	}

	return channels, rows.Err()
}

// GetByID returns a single notification channel by ID.
func (s *ChannelStore) GetByID(ctx context.Context, id string) (*ChannelConfig, error) {
	var ch ChannelConfig
	err := s.pool.QueryRow(ctx,
		`SELECT id, type, name, config_enc, enabled, created_at, updated_at
		 FROM notification_channels WHERE id = $1`, id,
	).Scan(&ch.ID, &ch.Type, &ch.Name, &ch.ConfigEnc, &ch.Enabled, &ch.CreatedAt, &ch.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &ch, nil
}

// Update modifies an existing notification channel.
func (s *ChannelStore) Update(ctx context.Context, ch *ChannelConfig) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE notification_channels
		 SET type = $1, name = $2, config_enc = $3, enabled = $4, updated_at = NOW()
		 WHERE id = $5`,
		ch.Type, ch.Name, ch.ConfigEnc, ch.Enabled, ch.ID,
	)
	return err
}

// Delete removes a notification channel by ID.
func (s *ChannelStore) Delete(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM notification_channels WHERE id = $1`, id,
	)
	return err
}

// ListEnabled returns all enabled notification channels.
func (s *ChannelStore) ListEnabled(ctx context.Context) ([]ChannelConfig, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, type, name, config_enc, enabled, created_at, updated_at
		 FROM notification_channels WHERE enabled = true ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var channels []ChannelConfig
	for rows.Next() {
		var ch ChannelConfig
		if err := rows.Scan(&ch.ID, &ch.Type, &ch.Name, &ch.ConfigEnc, &ch.Enabled, &ch.CreatedAt, &ch.UpdatedAt); err != nil {
			return nil, err
		}
		channels = append(channels, ch)
	}

	if channels == nil {
		channels = []ChannelConfig{}
	}

	return channels, rows.Err()
}
