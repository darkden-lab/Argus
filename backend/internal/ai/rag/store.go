package rag

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Embedding represents a stored vector embedding chunk.
type Embedding struct {
	ID         string            `json:"id"`
	SourceType string            `json:"source_type"` // "k8s_docs", "crd", "plugin", "cluster_resource"
	SourceID   string            `json:"source_id"`
	ChunkIndex int               `json:"chunk_index"`
	Content    string            `json:"content"`
	Embedding  []float32         `json:"embedding,omitempty"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

// SearchResult is a single result from a similarity search.
type SearchResult struct {
	Embedding
	Score float64 `json:"score"` // cosine similarity score
}

// Store provides CRUD operations for vector embeddings using pgvector.
type Store struct {
	pool *pgxpool.Pool
}

// NewStore creates a new RAG store.
func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// InsertEmbedding stores a new embedding chunk. If a chunk with the same
// source_type, source_id, and chunk_index exists, it is updated.
func (s *Store) InsertEmbedding(ctx context.Context, e Embedding) error {
	query := `
		INSERT INTO ai_embeddings (source_type, source_id, chunk_index, content, embedding, metadata)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (id) DO UPDATE SET
			content = EXCLUDED.content,
			embedding = EXCLUDED.embedding,
			metadata = EXCLUDED.metadata,
			updated_at = NOW()
	`

	_, err := s.pool.Exec(ctx, query,
		e.SourceType, e.SourceID, e.ChunkIndex, e.Content, e.Embedding, e.Metadata,
	)
	if err != nil {
		return fmt.Errorf("rag store: insert embedding: %w", err)
	}
	return nil
}

// InsertBatch inserts multiple embeddings efficiently.
func (s *Store) InsertBatch(ctx context.Context, embeddings []Embedding) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("rag store: begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback after commit is a no-op

	for _, e := range embeddings {
		_, err := tx.Exec(ctx,
			`INSERT INTO ai_embeddings (source_type, source_id, chunk_index, content, embedding, metadata)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			e.SourceType, e.SourceID, e.ChunkIndex, e.Content, e.Embedding, e.Metadata,
		)
		if err != nil {
			return fmt.Errorf("rag store: batch insert: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// Search finds the top-K most similar embeddings to the query vector using
// cosine similarity.
func (s *Store) Search(ctx context.Context, queryVec []float32, topK int, sourceType string) ([]SearchResult, error) {
	if topK <= 0 {
		topK = 5
	}

	query := `
		SELECT id, source_type, source_id, chunk_index, content, metadata,
		       1 - (embedding <=> $1::vector) as score
		FROM ai_embeddings
		WHERE ($2 = '' OR source_type = $2)
		ORDER BY embedding <=> $1::vector
		LIMIT $3
	`

	rows, err := s.pool.Query(ctx, query, queryVec, sourceType, topK)
	if err != nil {
		return nil, fmt.Errorf("rag store: search: %w", err)
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var r SearchResult
		if err := rows.Scan(&r.ID, &r.SourceType, &r.SourceID, &r.ChunkIndex, &r.Content, &r.Metadata, &r.Score); err != nil {
			return nil, fmt.Errorf("rag store: scan result: %w", err)
		}
		results = append(results, r)
	}

	return results, rows.Err()
}

// DeleteBySource removes all embeddings for a given source.
func (s *Store) DeleteBySource(ctx context.Context, sourceType, sourceID string) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM ai_embeddings WHERE source_type = $1 AND source_id = $2`,
		sourceType, sourceID,
	)
	return err
}

// Count returns the total number of embeddings, optionally filtered by source type.
func (s *Store) Count(ctx context.Context, sourceType string) (int64, error) {
	var count int64
	query := `SELECT COUNT(*) FROM ai_embeddings WHERE ($1 = '' OR source_type = $1)`
	err := s.pool.QueryRow(ctx, query, sourceType).Scan(&count)
	return count, err
}
