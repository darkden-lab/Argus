package audit

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Entry represents a single audit log entry.
type Entry struct {
	ID        string          `json:"id"`
	UserID    *string         `json:"user_id"`
	ClusterID *string         `json:"cluster_id"`
	Action    string          `json:"action"`
	Resource  string          `json:"resource"`
	Details   json.RawMessage `json:"details"`
	Timestamp time.Time       `json:"timestamp"`
}

// ListParams holds the query filters for listing audit entries.
type ListParams struct {
	UserID    string
	ClusterID string
	Action    string
	FromDate  string
	ToDate    string
	Limit     int
	Offset    int
}

// Store provides CRUD operations for the audit_log table.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore creates a new audit Store.
func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// Insert records a new audit log entry.
func (s *Store) Insert(ctx context.Context, userID, clusterID *string, action, resource string, details json.RawMessage) error {
	if details == nil {
		details = json.RawMessage("{}")
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO audit_log (user_id, cluster_id, action, resource, details) VALUES ($1, $2, $3, $4, $5)`,
		userID, clusterID, action, resource, details,
	)
	return err
}

// List returns audit log entries matching the given filters.
func (s *Store) List(ctx context.Context, params ListParams) ([]Entry, int, error) {
	if params.Limit <= 0 || params.Limit > 100 {
		params.Limit = 50
	}

	// Build dynamic query
	query := `SELECT id, user_id, cluster_id, action, resource, details, timestamp FROM audit_log WHERE 1=1`
	countQuery := `SELECT COUNT(*) FROM audit_log WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if params.UserID != "" {
		query += ` AND user_id = $` + itoa(argIdx)
		countQuery += ` AND user_id = $` + itoa(argIdx)
		args = append(args, params.UserID)
		argIdx++
	}
	if params.ClusterID != "" {
		query += ` AND cluster_id = $` + itoa(argIdx)
		countQuery += ` AND cluster_id = $` + itoa(argIdx)
		args = append(args, params.ClusterID)
		argIdx++
	}
	if params.Action != "" {
		query += ` AND action = $` + itoa(argIdx)
		countQuery += ` AND action = $` + itoa(argIdx)
		args = append(args, params.Action)
		argIdx++
	}
	if params.FromDate != "" {
		query += ` AND timestamp >= $` + itoa(argIdx)
		countQuery += ` AND timestamp >= $` + itoa(argIdx)
		args = append(args, params.FromDate)
		argIdx++
	}
	if params.ToDate != "" {
		query += ` AND timestamp <= $` + itoa(argIdx)
		countQuery += ` AND timestamp <= $` + itoa(argIdx)
		args = append(args, params.ToDate)
		argIdx++
	}

	// Count total
	var total int
	err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	// Fetch page
	query += ` ORDER BY timestamp DESC LIMIT $` + itoa(argIdx)
	args = append(args, params.Limit)
	argIdx++
	query += ` OFFSET $` + itoa(argIdx)
	args = append(args, params.Offset)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var entries []Entry
	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.UserID, &e.ClusterID, &e.Action, &e.Resource, &e.Details, &e.Timestamp); err != nil {
			return nil, 0, err
		}
		entries = append(entries, e)
	}

	if entries == nil {
		entries = []Entry{}
	}

	return entries, total, rows.Err()
}

// itoa converts int to string without importing strconv.
func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return itoa(n/10) + string(rune('0'+n%10))
}
