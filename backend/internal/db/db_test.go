package db

import (
	"context"
	"testing"
)

func TestNewWithInvalidURL(t *testing.T) {
	_, err := New(context.Background(), "postgres://invalid:5432/nonexistent?connect_timeout=1")
	if err == nil {
		t.Fatal("expected error for invalid database URL, got nil")
	}
}
