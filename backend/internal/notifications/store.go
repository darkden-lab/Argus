package notifications

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Notification represents a stored notification for a user.
type Notification struct {
	ID           string          `json:"id"`
	UserID       string          `json:"user_id"`
	Category     string          `json:"category"`
	Severity     string          `json:"severity"`
	Title        string          `json:"title"`
	Body         string          `json:"body"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
	Read         bool            `json:"read"`
	ChannelsSent []string        `json:"channels_sent"`
	CreatedAt    time.Time       `json:"created_at"`
}

// NotificationListParams holds filters and pagination for listing notifications.
type NotificationListParams struct {
	UserID   string
	Category string
	ReadOnly *bool // nil = all, true = read only, false = unread only
	Limit    int
	Offset   int
}

// NotificationStore provides CRUD operations for the notifications table.
type NotificationStore struct {
	pool *pgxpool.Pool
}

// NewNotificationStore creates a new NotificationStore.
func NewNotificationStore(pool *pgxpool.Pool) *NotificationStore {
	return &NotificationStore{pool: pool}
}

// Insert stores a new notification.
func (s *NotificationStore) Insert(ctx context.Context, n *Notification) error {
	if n.Metadata == nil {
		n.Metadata = json.RawMessage("{}")
	}
	if n.ChannelsSent == nil {
		n.ChannelsSent = []string{}
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO notifications (user_id, category, severity, title, body, metadata, channels_sent)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		n.UserID, n.Category, n.Severity, n.Title, n.Body, n.Metadata, n.ChannelsSent,
	)
	return err
}

// List returns notifications matching the given filters with pagination.
func (s *NotificationStore) List(ctx context.Context, params NotificationListParams) ([]Notification, int, error) {
	if params.Limit <= 0 || params.Limit > 100 {
		params.Limit = 50
	}

	query := `SELECT id, user_id, category, severity, title, body, metadata, read, channels_sent, created_at
	          FROM notifications WHERE user_id = $1`
	countQuery := `SELECT COUNT(*) FROM notifications WHERE user_id = $1`
	args := []interface{}{params.UserID}
	argIdx := 2

	if params.Category != "" {
		query += ` AND category = $` + strconv.Itoa(argIdx)
		countQuery += ` AND category = $` + strconv.Itoa(argIdx)
		args = append(args, params.Category)
		argIdx++
	}
	if params.ReadOnly != nil {
		query += ` AND read = $` + strconv.Itoa(argIdx)
		countQuery += ` AND read = $` + strconv.Itoa(argIdx)
		args = append(args, *params.ReadOnly)
		argIdx++
	}

	var total int
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query += ` ORDER BY created_at DESC LIMIT $` + strconv.Itoa(argIdx)
	args = append(args, params.Limit)
	argIdx++
	query += ` OFFSET $` + strconv.Itoa(argIdx)
	args = append(args, params.Offset)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var notifications []Notification
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Category, &n.Severity, &n.Title, &n.Body, &n.Metadata, &n.Read, &n.ChannelsSent, &n.CreatedAt); err != nil {
			return nil, 0, err
		}
		notifications = append(notifications, n)
	}

	if notifications == nil {
		notifications = []Notification{}
	}

	return notifications, total, rows.Err()
}

// MarkRead marks a single notification as read for the given user.
func (s *NotificationStore) MarkRead(ctx context.Context, userID, notificationID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2`,
		notificationID, userID,
	)
	return err
}

// MarkAllRead marks all unread notifications as read for the given user.
func (s *NotificationStore) MarkAllRead(ctx context.Context, userID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
		userID,
	)
	return err
}

// GetUnreadCount returns the number of unread notifications for a user.
func (s *NotificationStore) GetUnreadCount(ctx context.Context, userID string) (int, error) {
	var count int
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false`,
		userID,
	).Scan(&count)
	return count, err
}
