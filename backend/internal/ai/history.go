package ai

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Conversation represents an AI chat conversation.
type Conversation struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Title     string    `json:"title"`
	ClusterID string    `json:"cluster_id,omitempty"`
	Namespace string    `json:"namespace,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// HistoryStore manages conversation and message persistence.
type HistoryStore struct {
	pool *pgxpool.Pool
}

// NewHistoryStore creates a new history store.
func NewHistoryStore(pool *pgxpool.Pool) *HistoryStore {
	return &HistoryStore{pool: pool}
}

// CreateConversation creates a new conversation.
func (s *HistoryStore) CreateConversation(ctx context.Context, userID, title, clusterID, namespace string) (*Conversation, error) {
	var conv Conversation
	err := s.pool.QueryRow(ctx,
		`INSERT INTO ai_conversations (user_id, title, cluster_id, namespace)
		 VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''))
		 RETURNING id, user_id, title, COALESCE(cluster_id::text, ''), COALESCE(namespace, ''), created_at, updated_at`,
		userID, title, clusterID, namespace,
	).Scan(&conv.ID, &conv.UserID, &conv.Title, &conv.ClusterID, &conv.Namespace, &conv.CreatedAt, &conv.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create conversation: %w", err)
	}
	return &conv, nil
}

// ListConversations returns all conversations for a user, ordered by most recent.
func (s *HistoryStore) ListConversations(ctx context.Context, userID string, limit int) ([]Conversation, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, title, COALESCE(cluster_id::text, ''), COALESCE(namespace, ''), created_at, updated_at
		 FROM ai_conversations
		 WHERE user_id = $1
		 ORDER BY updated_at DESC
		 LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conversations []Conversation
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.UserID, &c.Title, &c.ClusterID, &c.Namespace, &c.CreatedAt, &c.UpdatedAt); err != nil {
			continue
		}
		conversations = append(conversations, c)
	}

	return conversations, rows.Err()
}

// GetMessages returns all messages in a conversation.
func (s *HistoryStore) GetMessages(ctx context.Context, conversationID string, limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 100
	}

	rows, err := s.pool.Query(ctx,
		`SELECT role, content, COALESCE(tool_call_id, '')
		 FROM ai_messages
		 WHERE conversation_id = $1
		 ORDER BY created_at ASC
		 LIMIT $2`,
		conversationID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var m Message
		var roleStr string
		if err := rows.Scan(&roleStr, &m.Content, &m.ToolCallID); err != nil {
			continue
		}
		m.Role = Role(roleStr)
		messages = append(messages, m)
	}

	return messages, rows.Err()
}

// DeleteConversation removes a conversation and all its messages.
func (s *HistoryStore) DeleteConversation(ctx context.Context, conversationID, userID string) error {
	result, err := s.pool.Exec(ctx,
		`DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2`,
		conversationID, userID,
	)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("conversation not found")
	}
	return nil
}

// UpdateTitle updates a conversation's title.
func (s *HistoryStore) UpdateTitle(ctx context.Context, conversationID, title string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE ai_conversations SET title = $1, updated_at = NOW() WHERE id = $2`,
		title, conversationID,
	)
	return err
}
