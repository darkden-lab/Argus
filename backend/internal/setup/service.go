package setup

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Service handles first-run setup state checks and transitions.
type Service struct {
	pool *pgxpool.Pool
}

// NewService creates a new setup Service.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// IsSetupRequired returns true when the initial admin setup has NOT been
// completed yet. It checks the settings table for the "system_setup_completed"
// key. As a fallback it also checks whether any user with the admin role
// exists (covers edge cases where the migration ran but the flag is missing).
func (s *Service) IsSetupRequired(ctx context.Context) (bool, error) {
	if s.pool == nil {
		return false, nil
	}

	// Primary check: settings flag.
	var value string
	err := s.pool.QueryRow(ctx,
		`SELECT value::text FROM settings WHERE key = $1`,
		"system_setup_completed",
	).Scan(&value)

	if err == nil {
		// Flag exists — setup is done.
		return false, nil
	}
	if err != pgx.ErrNoRows {
		return false, fmt.Errorf("checking setup flag: %w", err)
	}

	// Fallback: check if an admin user already exists.
	var adminExists bool
	err = s.pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM user_roles ur
			JOIN roles r ON ur.role_id = r.id
			WHERE r.name = 'admin'
		)`,
	).Scan(&adminExists)
	if err != nil {
		return false, fmt.Errorf("checking admin existence: %w", err)
	}

	if adminExists {
		// Admin exists but flag is missing — fix inconsistency.
		if markErr := s.MarkSetupComplete(ctx); markErr != nil {
			return false, fmt.Errorf("auto-marking setup complete: %w", markErr)
		}
		return false, nil
	}

	return true, nil
}

// MarkSetupComplete inserts the system_setup_completed flag into settings.
func (s *Service) MarkSetupComplete(ctx context.Context) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO settings (key, value, updated_at)
		 VALUES ($1, $2, NOW())
		 ON CONFLICT (key) DO UPDATE
		   SET value = EXCLUDED.value,
		       updated_at = NOW()`,
		"system_setup_completed", "true",
	)
	if err != nil {
		return fmt.Errorf("marking setup complete: %w", err)
	}
	return nil
}
