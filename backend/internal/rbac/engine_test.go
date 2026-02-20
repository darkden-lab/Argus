package rbac

import (
	"testing"
	"time"
)

func newTestEngine() *Engine {
	return &Engine{
		cache: make(map[string]*cachedPermissions),
		ttl:   5 * time.Minute,
	}
}

func seedCache(e *Engine, userID string, perms []Permission) {
	e.mu.Lock()
	e.cache[userID] = &cachedPermissions{
		permissions: perms,
		expiresAt:   time.Now().Add(e.ttl),
	}
	e.mu.Unlock()
}

func TestEvaluateGlobalAdmin(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "admin-user", []Permission{
		{Resource: "*", Action: "*", ScopeType: "global"},
	})

	allowed, err := e.Evaluate(nil, Request{
		UserID:    "admin-user",
		Action:    "delete",
		Resource:  "pods",
		ClusterID: "cluster-1",
		Namespace: "production",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allowed {
		t.Fatal("expected global admin to be allowed")
	}
}

func TestEvaluateClusterScoped(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "cluster-user", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "cluster", ScopeID: "cluster-1"},
	})

	// Should be allowed for cluster-1
	allowed, err := e.Evaluate(nil, Request{
		UserID:    "cluster-user",
		Action:    "read",
		Resource:  "pods",
		ClusterID: "cluster-1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allowed {
		t.Fatal("expected cluster-scoped user to be allowed for cluster-1")
	}

	// Should be denied for cluster-2
	allowed, err = e.Evaluate(nil, Request{
		UserID:    "cluster-user",
		Action:    "read",
		Resource:  "pods",
		ClusterID: "cluster-2",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Fatal("expected cluster-scoped user to be denied for cluster-2")
	}
}

func TestEvaluateNamespaceScoped(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "ns-user", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "namespace", ScopeID: "cluster-1/dev"},
	})

	// Should be allowed for cluster-1/dev
	allowed, err := e.Evaluate(nil, Request{
		UserID:    "ns-user",
		Action:    "read",
		Resource:  "pods",
		ClusterID: "cluster-1",
		Namespace: "dev",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allowed {
		t.Fatal("expected namespace-scoped user to be allowed for cluster-1/dev")
	}

	// Should be denied for cluster-1/prod
	allowed, err = e.Evaluate(nil, Request{
		UserID:    "ns-user",
		Action:    "read",
		Resource:  "pods",
		ClusterID: "cluster-1",
		Namespace: "prod",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Fatal("expected namespace-scoped user to be denied for cluster-1/prod")
	}
}

func TestEvaluateDenied(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "limited-user", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "global"},
	})

	// Should be denied for write action
	allowed, err := e.Evaluate(nil, Request{
		UserID:   "limited-user",
		Action:   "write",
		Resource: "pods",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Fatal("expected user to be denied write access")
	}

	// Should be denied for different resource
	allowed, err = e.Evaluate(nil, Request{
		UserID:   "limited-user",
		Action:   "read",
		Resource: "deployments",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Fatal("expected user to be denied access to deployments")
	}
}

func TestMatchPermissionWildcard(t *testing.T) {
	e := newTestEngine()

	// Wildcard action
	perm := Permission{Resource: "pods", Action: "*", ScopeType: "global"}
	req := Request{UserID: "u", Action: "delete", Resource: "pods"}
	if !e.matchPermission(perm, req) {
		t.Fatal("expected wildcard action to match any action")
	}

	// Wildcard resource
	perm = Permission{Resource: "*", Action: "read", ScopeType: "global"}
	req = Request{UserID: "u", Action: "read", Resource: "services"}
	if !e.matchPermission(perm, req) {
		t.Fatal("expected wildcard resource to match any resource")
	}

	// Both wildcards
	perm = Permission{Resource: "*", Action: "*", ScopeType: "global"}
	req = Request{UserID: "u", Action: "write", Resource: "secrets", ClusterID: "c1", Namespace: "ns"}
	if !e.matchPermission(perm, req) {
		t.Fatal("expected full wildcard to match any request")
	}
}

func TestCacheInvalidation(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "cache-user", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "global"},
	})

	// Verify cache has the user
	e.mu.RLock()
	_, exists := e.cache["cache-user"]
	e.mu.RUnlock()
	if !exists {
		t.Fatal("expected user to be in cache")
	}

	// Invalidate
	e.InvalidateCache("cache-user")

	// Verify cache no longer has the user
	e.mu.RLock()
	_, exists = e.cache["cache-user"]
	e.mu.RUnlock()
	if exists {
		t.Fatal("expected user to be removed from cache after invalidation")
	}
}
