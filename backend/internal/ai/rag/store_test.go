package rag

import (
	"strings"
	"testing"
)

func TestFormatContext_Empty(t *testing.T) {
	result := FormatContext(nil)
	if result != "" {
		t.Errorf("expected empty string for nil results, got %q", result)
	}
}

func TestFormatContext_WithResults(t *testing.T) {
	results := []SearchResult{
		{
			Embedding: Embedding{
				SourceType: "k8s_docs",
				SourceID:   "pods-overview",
				Content:    "Pods are the smallest deployable units.",
			},
			Score: 0.95,
		},
		{
			Embedding: Embedding{
				SourceType: "crd",
				SourceID:   "my-custom-resource",
				Content:    "A CRD for managing widgets.",
			},
			Score: 0.82,
		},
	}

	output := FormatContext(results)

	if !strings.Contains(output, "Relevant Context") {
		t.Error("expected 'Relevant Context' header")
	}
	if !strings.Contains(output, "k8s_docs/pods-overview") {
		t.Error("expected source reference")
	}
	if !strings.Contains(output, "Pods are the smallest") {
		t.Error("expected content in output")
	}
	if !strings.Contains(output, "0.95") {
		t.Error("expected score in output")
	}
}

func TestNewRetriever_DefaultTopK(t *testing.T) {
	r := NewRetriever(nil, nil, 0)
	if r.topK != 5 {
		t.Errorf("expected default topK=5, got %d", r.topK)
	}
}
