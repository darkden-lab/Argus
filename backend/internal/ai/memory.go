package ai

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Memory represents a user-saved fact or preference for AI personalization.
type Memory struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Content   string    `json:"content"`
	Category  string    `json:"category"` // preference, fact, learning, general
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// MemoryStore handles CRUD operations for AI memories.
type MemoryStore struct {
	pool *pgxpool.Pool
}

// NewMemoryStore creates a new MemoryStore.
func NewMemoryStore(pool *pgxpool.Pool) *MemoryStore {
	return &MemoryStore{pool: pool}
}

// List returns all memories for the given user, ordered by most recently updated.
func (s *MemoryStore) List(ctx context.Context, userID string) ([]Memory, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, content, category, created_at, updated_at
		 FROM ai_memories
		 WHERE user_id = $1
		 ORDER BY updated_at DESC
		 LIMIT 50`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var memories []Memory
	for rows.Next() {
		var m Memory
		if err := rows.Scan(&m.ID, &m.UserID, &m.Content, &m.Category, &m.CreatedAt, &m.UpdatedAt); err != nil {
			continue
		}
		memories = append(memories, m)
	}
	return memories, nil
}

// Create inserts a new memory for the user.
func (s *MemoryStore) Create(ctx context.Context, userID, content, category string) (*Memory, error) {
	if category == "" {
		category = "general"
	}

	var m Memory
	err := s.pool.QueryRow(ctx,
		`INSERT INTO ai_memories (user_id, content, category)
		 VALUES ($1, $2, $3)
		 RETURNING id, user_id, content, category, created_at, updated_at`,
		userID, content, category,
	).Scan(&m.ID, &m.UserID, &m.Content, &m.Category, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// Update modifies an existing memory, verifying ownership via user_id.
func (s *MemoryStore) Update(ctx context.Context, id, userID, content, category string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE ai_memories SET content = $1, category = $2, updated_at = NOW()
		 WHERE id = $3 AND user_id = $4`,
		content, category, id, userID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("memory not found or access denied")
	}
	return nil
}

// Delete removes a memory, verifying ownership via user_id.
func (s *MemoryStore) Delete(ctx context.Context, id, userID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM ai_memories WHERE id = $1 AND user_id = $2`,
		id, userID,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("memory not found or access denied")
	}
	return nil
}

// LoadForPrompt formats all user memories as text suitable for system prompt injection.
func (s *MemoryStore) LoadForPrompt(ctx context.Context, userID string) (string, error) {
	memories, err := s.List(ctx, userID)
	if err != nil {
		return "", err
	}
	if len(memories) == 0 {
		return "", nil
	}

	var b strings.Builder
	b.WriteString("\n\n## User Memories\nThe user has saved these facts/preferences. Use them to personalize responses:\n")
	for _, m := range memories {
		b.WriteString("- ")
		if m.Category != "general" {
			b.WriteString("[")
			b.WriteString(m.Category)
			b.WriteString("] ")
		}
		b.WriteString(m.Content)
		b.WriteString("\n")
	}
	return b.String(), nil
}
