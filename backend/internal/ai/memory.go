package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	maxMemoryContentLen = 500  // max runes per individual memory
	maxMemoryTotalLen   = 4000 // max runes for total memory text
)

// memoryInjectionPatterns are prompt injection patterns stripped from memory content.
var memoryInjectionPatterns = []string{
	"[system]:",
	"[SYSTEM]",
	"## System",
	"You are",
	"Ignore previous",
	"Forget all",
	"Override",
}

// sanitizeMemoryContent strips prompt injection patterns and truncates by runes.
func sanitizeMemoryContent(content string) string {
	for _, pattern := range memoryInjectionPatterns {
		content = strings.ReplaceAll(content, pattern, "")
	}
	content = strings.TrimSpace(content)
	// Truncate to maxMemoryContentLen runes for UTF-8 safety
	if utf8.RuneCountInString(content) > maxMemoryContentLen {
		runes := []rune(content)
		content = string(runes[:maxMemoryContentLen])
	}
	return content
}

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
	if err := rows.Err(); err != nil {
		return nil, err
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

// Search returns memories matching the query via case-insensitive text search.
func (s *MemoryStore) Search(ctx context.Context, userID, query string) ([]Memory, error) {
	// Escape LIKE metacharacters so user input is treated literally
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(query)
	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, content, category, created_at, updated_at
		 FROM ai_memories WHERE user_id = $1 AND content ILIKE '%' || $2 || '%'
		 ORDER BY updated_at DESC LIMIT 10`,
		userID, escaped,
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return memories, nil
}

// CreateForTool wraps Create and returns a JSON string for use by AI tool execution.
func (s *MemoryStore) CreateForTool(ctx context.Context, userID, content, category string) (string, error) {
	m, err := s.Create(ctx, userID, content, category)
	if err != nil {
		return "", err
	}
	data, err := json.Marshal(m)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// SearchForTool wraps Search and returns a JSON string for use by AI tool execution.
func (s *MemoryStore) SearchForTool(ctx context.Context, userID, query string) (string, error) {
	memories, err := s.Search(ctx, userID, query)
	if err != nil {
		return "", err
	}
	data, err := json.MarshalIndent(memories, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// DeleteForTool wraps Delete for use by AI tool execution.
func (s *MemoryStore) DeleteForTool(ctx context.Context, id, userID string) error {
	return s.Delete(ctx, id, userID)
}

// LoadForPrompt formats all user memories as text suitable for system prompt injection.
// Memories are sanitized to prevent prompt injection and truncated for safety.
func (s *MemoryStore) LoadForPrompt(ctx context.Context, userID string) (string, error) {
	memories, err := s.List(ctx, userID)
	if err != nil {
		return "", err
	}
	if len(memories) == 0 {
		return "", nil
	}

	var b strings.Builder
	b.WriteString("\n\n<user_memories>\nThe user has saved these facts/preferences. Use them to personalize responses:\n")
	for _, m := range memories {
		content := sanitizeMemoryContent(m.Content)
		if content == "" {
			continue
		}
		b.WriteString("- ")
		if m.Category != "general" {
			b.WriteString("[")
			b.WriteString(m.Category)
			b.WriteString("] ")
		}
		b.WriteString(content)
		b.WriteString("\n")

		// Truncate total memory text
		if utf8.RuneCountInString(b.String()) > maxMemoryTotalLen {
			break
		}
	}
	b.WriteString("</user_memories>")

	// Final truncation to ensure total length is within bounds
	result := b.String()
	if utf8.RuneCountInString(result) > maxMemoryTotalLen {
		runes := []rune(result)
		result = string(runes[:maxMemoryTotalLen])
	}
	return result, nil
}
