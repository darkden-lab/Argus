package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// OIDCGroupMapper maps OIDC groups to internal RBAC roles.
type OIDCGroupMapper struct {
	pool *pgxpool.Pool
}

// NewOIDCGroupMapper creates a new mapper.
func NewOIDCGroupMapper(pool *pgxpool.Pool) *OIDCGroupMapper {
	return &OIDCGroupMapper{pool: pool}
}

// MapGroupsToRoles looks up the oidc_role_mappings table for the given groups
// and assigns matching roles to the user. This is additive -- it only adds roles,
// never removes them.
func (m *OIDCGroupMapper) MapGroupsToRoles(ctx context.Context, userID string, groups []string) error {
	if m.pool == nil || len(groups) == 0 {
		return nil
	}

	// Find all mappings that match any of the user's groups
	rows, err := m.pool.Query(ctx,
		`SELECT DISTINCT role_id, cluster_id, namespace
		 FROM oidc_role_mappings
		 WHERE oidc_group = ANY($1)`,
		groups,
	)
	if err != nil {
		return fmt.Errorf("querying group mappings: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var roleID string
		var clusterID *string
		var namespace *string
		if err := rows.Scan(&roleID, &clusterID, &namespace); err != nil {
			return fmt.Errorf("scanning mapping row: %w", err)
		}

		// Insert into user_roles (ignore conflicts - additive only).
		// Use a conditional INSERT to avoid duplicates since user_roles
		// may not have a unique constraint on (user_id, role_id).
		_, err := m.pool.Exec(ctx,
			`INSERT INTO user_roles (user_id, role_id, cluster_id, namespace)
			 SELECT $1, $2, $3, $4
			 WHERE NOT EXISTS (
			     SELECT 1 FROM user_roles
			     WHERE user_id = $1 AND role_id = $2
			       AND cluster_id IS NOT DISTINCT FROM $3
			       AND namespace IS NOT DISTINCT FROM $4
			 )`,
			userID, roleID, clusterID, namespace,
		)
		if err != nil {
			log.Printf("oidc: failed to assign role %s to user %s: %v", roleID, userID, err)
		}
	}

	return rows.Err()
}

// ApplyDefaultRole assigns the configured default role to a user if they have no roles.
func (m *OIDCGroupMapper) ApplyDefaultRole(ctx context.Context, userID string) error {
	if m.pool == nil {
		return nil
	}

	// Check if user already has any roles
	var hasRoles bool
	err := m.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id = $1)`,
		userID,
	).Scan(&hasRoles)
	if err != nil {
		return fmt.Errorf("checking existing roles: %w", err)
	}
	if hasRoles {
		return nil
	}

	// Read default role from settings
	var raw []byte
	err = m.pool.QueryRow(ctx,
		`SELECT value FROM settings WHERE key = $1`,
		"oidc_default_role",
	).Scan(&raw)
	if err != nil {
		// No default role configured -- that's fine
		return nil
	}

	var defaultRole string
	if err := json.Unmarshal(raw, &defaultRole); err != nil || defaultRole == "" {
		return nil
	}

	// Assign the default role (global scope, no cluster/namespace)
	_, err = m.pool.Exec(ctx,
		`INSERT INTO user_roles (user_id, role_id)
		 SELECT $1, id FROM roles WHERE name = $2
		 WHERE NOT EXISTS (
		     SELECT 1 FROM user_roles ur
		     JOIN roles r ON ur.role_id = r.id
		     WHERE ur.user_id = $1 AND r.name = $2
		 )`,
		userID, defaultRole,
	)
	if err != nil {
		return fmt.Errorf("assigning default role: %w", err)
	}

	return nil
}
