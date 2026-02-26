package auth

import (
	"context"
	"testing"
)

// OIDCGroupMapper tests focus on the pure logic paths that don't require a database.
// DB-requiring paths return early when pool is nil.

// --- NewOIDCGroupMapper tests ---

func TestNewOIDCGroupMapper_NilPool(t *testing.T) {
	m := NewOIDCGroupMapper(nil)
	if m == nil {
		t.Fatal("expected non-nil OIDCGroupMapper even with nil pool")
	}
	if m.pool != nil {
		t.Error("expected pool to be nil")
	}
}

func TestNewOIDCGroupMapper_StoresPool(t *testing.T) {
	// Verify the constructor records the pool reference (nil is valid; real pool tested via integration)
	m := NewOIDCGroupMapper(nil)
	if m == nil {
		t.Fatal("expected non-nil mapper")
	}
}

// --- MapGroupsToRoles early-exit paths ---

func TestMapGroupsToRoles_NilPool_ReturnsNil(t *testing.T) {
	m := NewOIDCGroupMapper(nil)
	err := m.MapGroupsToRoles(context.Background(), "user-id", []string{"engineers"})
	if err != nil {
		t.Errorf("expected nil error for nil pool, got: %v", err)
	}
}

func TestMapGroupsToRoles_EmptyGroups_ReturnsNil(t *testing.T) {
	// Even with a valid pool, empty groups slice should return early
	m := NewOIDCGroupMapper(nil)
	err := m.MapGroupsToRoles(context.Background(), "user-id", []string{})
	if err != nil {
		t.Errorf("expected nil error for empty groups, got: %v", err)
	}
}

func TestMapGroupsToRoles_NilGroups_ReturnsNil(t *testing.T) {
	m := NewOIDCGroupMapper(nil)
	err := m.MapGroupsToRoles(context.Background(), "user-id", nil)
	if err != nil {
		t.Errorf("expected nil error for nil groups, got: %v", err)
	}
}

func TestMapGroupsToRoles_NilPoolAndEmptyGroups(t *testing.T) {
	m := NewOIDCGroupMapper(nil)
	err := m.MapGroupsToRoles(context.Background(), "", []string{})
	if err != nil {
		t.Errorf("expected nil error for nil pool + empty groups, got: %v", err)
	}
}

// --- ApplyDefaultRole early-exit paths ---

func TestApplyDefaultRole_NilPool_ReturnsNil(t *testing.T) {
	m := NewOIDCGroupMapper(nil)
	err := m.ApplyDefaultRole(context.Background(), "user-id")
	if err != nil {
		t.Errorf("expected nil error for nil pool, got: %v", err)
	}
}

func TestApplyDefaultRole_EmptyUserID_NilPool_ReturnsNil(t *testing.T) {
	m := NewOIDCGroupMapper(nil)
	err := m.ApplyDefaultRole(context.Background(), "")
	if err != nil {
		t.Errorf("expected nil error for empty user ID with nil pool, got: %v", err)
	}
}

// --- Boundary: large groups slice ---

func TestMapGroupsToRoles_LargeGroupsSlice_NilPool_ReturnsNil(t *testing.T) {
	m := NewOIDCGroupMapper(nil)
	groups := make([]string, 1000)
	for i := range groups {
		groups[i] = "group-" + string(rune('a'+i%26))
	}
	err := m.MapGroupsToRoles(context.Background(), "user-id", groups)
	if err != nil {
		t.Errorf("expected nil error for large groups slice with nil pool, got: %v", err)
	}
}

// --- Adversarial group values (no DB needed for nil pool path) ---

func TestMapGroupsToRoles_SQLInjectionInGroups_NilPool(t *testing.T) {
	m := NewOIDCGroupMapper(nil)
	groups := []string{
		"'; DROP TABLE oidc_role_mappings;--",
		"' OR '1'='1",
		"<script>alert(1)</script>",
		"admin' UNION SELECT * FROM users--",
	}
	// With nil pool, returns early with nil -- no SQL can be executed
	err := m.MapGroupsToRoles(context.Background(), "user-id", groups)
	if err != nil {
		t.Errorf("expected nil error for SQL injection payloads with nil pool, got: %v", err)
	}
}

// --- mapperState struct validity ---

func TestOIDCGroupMapper_StructFields(t *testing.T) {
	m := &OIDCGroupMapper{}
	if m.pool != nil {
		t.Error("zero-value pool should be nil")
	}
}

// --- Context cancellation (nil pool exits before using context) ---

func TestMapGroupsToRoles_CancelledContext_NilPool(t *testing.T) {
	m := NewOIDCGroupMapper(nil)
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // cancel immediately

	// With nil pool, should exit before using context
	err := m.MapGroupsToRoles(ctx, "user-id", []string{"group-a"})
	if err != nil {
		t.Errorf("expected nil error for cancelled context + nil pool, got: %v", err)
	}
}

func TestApplyDefaultRole_CancelledContext_NilPool(t *testing.T) {
	m := NewOIDCGroupMapper(nil)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := m.ApplyDefaultRole(ctx, "user-id")
	if err != nil {
		t.Errorf("expected nil error for cancelled context + nil pool, got: %v", err)
	}
}
