package notifications

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NotificationTemplate represents a customizable notification template.
type NotificationTemplate struct {
	ID              string    `json:"id"`
	ChannelType     string    `json:"channel_type"`
	Name            string    `json:"name"`
	SubjectTemplate string    `json:"subject_template"`
	BodyTemplate    string    `json:"body_template"`
	IsDefault       bool      `json:"is_default"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// TemplateStore provides CRUD operations for the notification_templates table.
type TemplateStore struct {
	pool *pgxpool.Pool
}

// NewTemplateStore creates a new TemplateStore.
func NewTemplateStore(pool *pgxpool.Pool) *TemplateStore {
	return &TemplateStore{pool: pool}
}

// List returns all notification templates, optionally filtered by channel type.
func (s *TemplateStore) List(ctx context.Context, channelType string) ([]NotificationTemplate, error) {
	query := `SELECT id, channel_type, name, subject_template, body_template, is_default, created_at, updated_at
		 FROM notification_templates`
	args := []interface{}{}

	if channelType != "" {
		query += ` WHERE channel_type = $1`
		args = append(args, channelType)
	}

	query += ` ORDER BY is_default DESC, created_at`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var templates []NotificationTemplate
	for rows.Next() {
		var t NotificationTemplate
		if err := rows.Scan(&t.ID, &t.ChannelType, &t.Name, &t.SubjectTemplate, &t.BodyTemplate, &t.IsDefault, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		templates = append(templates, t)
	}

	if templates == nil {
		templates = []NotificationTemplate{}
	}

	return templates, rows.Err()
}

// GetByID returns a single notification template by ID.
func (s *TemplateStore) GetByID(ctx context.Context, id string) (*NotificationTemplate, error) {
	var t NotificationTemplate
	err := s.pool.QueryRow(ctx,
		`SELECT id, channel_type, name, subject_template, body_template, is_default, created_at, updated_at
		 FROM notification_templates WHERE id = $1`, id,
	).Scan(&t.ID, &t.ChannelType, &t.Name, &t.SubjectTemplate, &t.BodyTemplate, &t.IsDefault, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// GetDefaultTemplate returns the default template for the given channel type.
func (s *TemplateStore) GetDefaultTemplate(ctx context.Context, channelType string) (*NotificationTemplate, error) {
	var t NotificationTemplate
	err := s.pool.QueryRow(ctx,
		`SELECT id, channel_type, name, subject_template, body_template, is_default, created_at, updated_at
		 FROM notification_templates WHERE channel_type = $1 AND is_default = true`, channelType,
	).Scan(&t.ID, &t.ChannelType, &t.Name, &t.SubjectTemplate, &t.BodyTemplate, &t.IsDefault, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// Create inserts a new notification template.
func (s *TemplateStore) Create(ctx context.Context, t *NotificationTemplate) error {
	// If this template is marked as default, unset existing default for the same channel type
	if t.IsDefault {
		if _, err := s.pool.Exec(ctx,
			`UPDATE notification_templates SET is_default = false, updated_at = NOW()
			 WHERE channel_type = $1 AND is_default = true`, t.ChannelType); err != nil {
			return fmt.Errorf("unset existing default: %w", err)
		}
	}

	return s.pool.QueryRow(ctx,
		`INSERT INTO notification_templates (channel_type, name, subject_template, body_template, is_default)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, created_at, updated_at`,
		t.ChannelType, t.Name, t.SubjectTemplate, t.BodyTemplate, t.IsDefault,
	).Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
}

// Update modifies an existing notification template.
func (s *TemplateStore) Update(ctx context.Context, t *NotificationTemplate) error {
	// If this template is being set as default, unset existing default for the same channel type
	if t.IsDefault {
		if _, err := s.pool.Exec(ctx,
			`UPDATE notification_templates SET is_default = false, updated_at = NOW()
			 WHERE channel_type = $1 AND is_default = true AND id != $2`, t.ChannelType, t.ID); err != nil {
			return fmt.Errorf("unset existing default: %w", err)
		}
	}

	_, err := s.pool.Exec(ctx,
		`UPDATE notification_templates
		 SET channel_type = $1, name = $2, subject_template = $3, body_template = $4, is_default = $5, updated_at = NOW()
		 WHERE id = $6`,
		t.ChannelType, t.Name, t.SubjectTemplate, t.BodyTemplate, t.IsDefault, t.ID,
	)
	return err
}

// Delete removes a notification template by ID. Returns an error if attempting
// to delete a default template.
func (s *TemplateStore) Delete(ctx context.Context, id string) error {
	// Check if the template is a default template
	var isDefault bool
	err := s.pool.QueryRow(ctx,
		`SELECT is_default FROM notification_templates WHERE id = $1`, id,
	).Scan(&isDefault)
	if err != nil {
		return err
	}

	if isDefault {
		return fmt.Errorf("cannot delete the default template; set another template as default first")
	}

	_, err = s.pool.Exec(ctx,
		`DELETE FROM notification_templates WHERE id = $1`, id,
	)
	return err
}
