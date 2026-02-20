package cluster

import (
	"testing"
)

func TestNewManager(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)
	if m == nil {
		t.Fatal("expected non-nil Manager")
	}
	if m.encryptionKey != key {
		t.Fatal("expected encryption key to be set")
	}
	if m.clients == nil {
		t.Fatal("expected clients map to be initialized")
	}
}

func TestGetClientNotFound(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)

	_, err := m.GetClient("nonexistent-cluster")
	if err == nil {
		t.Fatal("expected error for nonexistent cluster, got nil")
	}
}
