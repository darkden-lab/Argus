package rag

import (
	"context"
	"fmt"
	"strings"

	"github.com/k8s-dashboard/backend/internal/ai"
)

// Retriever combines embedding generation with similarity search to find
// relevant context for an AI query.
type Retriever struct {
	store    *Store
	provider ai.LLMProvider
	topK     int
}

// NewRetriever creates a new RAG retriever.
func NewRetriever(store *Store, provider ai.LLMProvider, topK int) *Retriever {
	if topK <= 0 {
		topK = 5
	}
	return &Retriever{
		store:    store,
		provider: provider,
		topK:     topK,
	}
}

// RetrieveContext takes a user query, generates its embedding, and returns
// the most relevant chunks from the vector store.
func (r *Retriever) RetrieveContext(ctx context.Context, query string, sourceType string) ([]SearchResult, error) {
	// Generate embedding for the query
	embedResp, err := r.provider.Embed(ctx, ai.EmbedRequest{
		Input: []string{query},
	})
	if err != nil {
		return nil, fmt.Errorf("retriever: embed query: %w", err)
	}

	if len(embedResp.Embeddings) == 0 {
		return nil, fmt.Errorf("retriever: no embedding returned")
	}

	// Search the vector store
	results, err := r.store.Search(ctx, embedResp.Embeddings[0], r.topK, sourceType)
	if err != nil {
		return nil, fmt.Errorf("retriever: search: %w", err)
	}

	return results, nil
}

// FormatContext turns search results into a text block suitable for injection
// into an LLM prompt as context.
func FormatContext(results []SearchResult) string {
	if len(results) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("## Relevant Context\n\n")

	for i, r := range results {
		sb.WriteString(fmt.Sprintf("### Source %d [%s/%s] (relevance: %.2f)\n", i+1, r.SourceType, r.SourceID, r.Score))
		sb.WriteString(r.Content)
		sb.WriteString("\n\n")
	}

	return sb.String()
}
