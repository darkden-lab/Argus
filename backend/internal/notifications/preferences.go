package notifications

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Preference represents a user's notification preference for a category/channel.
type Preference struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Category  string    `json:"category"`
	ChannelID *string   `json:"channel_id,omitempty"`
	Frequency string    `json:"frequency"` // realtime, daily, weekly, none
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// PreferencesStore provides CRUD operations for notification_preferences.
type PreferencesStore struct {
	pool *pgxpool.Pool
}

// NewPreferencesStore creates a new PreferencesStore.
func NewPreferencesStore(pool *pgxpool.Pool) *PreferencesStore {
	return &PreferencesStore{pool: pool}
}

// GetByUser returns all notification preferences for a user.
func (s *PreferencesStore) GetByUser(ctx context.Context, userID string) ([]Preference, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, category, channel_id, frequency, enabled, created_at, updated_at
		 FROM notification_preferences WHERE user_id = $1 ORDER BY category, channel_id`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var prefs []Preference
	for rows.Next() {
		var p Preference
		if err := rows.Scan(&p.ID, &p.UserID, &p.Category, &p.ChannelID, &p.Frequency, &p.Enabled, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		prefs = append(prefs, p)
	}

	if prefs == nil {
		prefs = []Preference{}
	}

	return prefs, rows.Err()
}

// GetByCategory returns all preferences for a given category across all users.
// Useful for determining who should receive notifications for a specific event.
func (s *PreferencesStore) GetByCategory(ctx context.Context, category string) ([]Preference, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, category, channel_id, frequency, enabled, created_at, updated_at
		 FROM notification_preferences WHERE category = $1 AND enabled = true`,
		category,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var prefs []Preference
	for rows.Next() {
		var p Preference
		if err := rows.Scan(&p.ID, &p.UserID, &p.Category, &p.ChannelID, &p.Frequency, &p.Enabled, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		prefs = append(prefs, p)
	}

	if prefs == nil {
		prefs = []Preference{}
	}

	return prefs, rows.Err()
}

// Set creates or updates a preference using upsert on the unique constraint.
func (s *PreferencesStore) Set(ctx context.Context, pref *Preference) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO notification_preferences (user_id, category, channel_id, frequency, enabled)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id, category, channel_id) DO UPDATE
		 SET frequency = EXCLUDED.frequency, enabled = EXCLUDED.enabled, updated_at = NOW()`,
		pref.UserID, pref.Category, pref.ChannelID, pref.Frequency, pref.Enabled,
	)
	return err
}
