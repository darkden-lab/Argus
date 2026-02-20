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

// --- Security Tests ---

// TestRBACPrivilegeEscalationViaScopeManipulation tests that a namespace-scoped
// user cannot escalate to global or cluster scope.
func TestRBACPrivilegeEscalationViaScopeManipulation(t *testing.T) {
	e := newTestEngine()

	// User only has namespace-level access to cluster-1/dev
	seedCache(e, "ns-user", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "namespace", ScopeID: "cluster-1/dev"},
	})

	// Try accessing cluster-1/prod (different namespace)
	allowed, _ := e.Evaluate(nil, Request{
		UserID:    "ns-user",
		Action:    "read",
		Resource:  "pods",
		ClusterID: "cluster-1",
		Namespace: "prod",
	})
	if allowed {
		t.Fatal("SECURITY: namespace user escalated to different namespace")
	}

	// Try accessing cluster-2/dev (different cluster, same ns name)
	allowed, _ = e.Evaluate(nil, Request{
		UserID:    "ns-user",
		Action:    "read",
		Resource:  "pods",
		ClusterID: "cluster-2",
		Namespace: "dev",
	})
	if allowed {
		t.Fatal("SECURITY: namespace user escalated to different cluster")
	}

	// Try without specifying cluster/namespace (global scope attempt)
	allowed, _ = e.Evaluate(nil, Request{
		UserID:   "ns-user",
		Action:   "read",
		Resource: "pods",
	})
	if allowed {
		t.Fatal("SECURITY: namespace user accessed resource without cluster/namespace scope")
	}
}

// TestRBACActionEscalation verifies that read-only user cannot write or delete.
func TestRBACActionEscalation(t *testing.T) {
	e := newTestEngine()

	seedCache(e, "reader", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "global"},
	})

	actions := []string{"write", "delete", "admin", "exec", "create", "update", "patch"}
	for _, action := range actions {
		allowed, _ := e.Evaluate(nil, Request{
			UserID:   "reader",
			Action:   action,
			Resource: "pods",
		})
		if allowed {
			t.Errorf("SECURITY: read-only user was allowed action %q", action)
		}
	}
}

// TestRBACResourceEscalation verifies that a pods-only user cannot access secrets.
func TestRBACResourceEscalation(t *testing.T) {
	e := newTestEngine()

	seedCache(e, "pod-user", []Permission{
		{Resource: "pods", Action: "*", ScopeType: "global"},
	})

	sensitiveResources := []string{"secrets", "configmaps", "serviceaccounts", "roles", "clusterroles", "nodes"}
	for _, res := range sensitiveResources {
		allowed, _ := e.Evaluate(nil, Request{
			UserID:   "pod-user",
			Action:   "read",
			Resource: res,
		})
		if allowed {
			t.Errorf("SECURITY: pods-only user was allowed access to %q", res)
		}
	}
}

// TestRBACClusterScopedUserCannotAccessOtherClusters verifies cluster isolation.
func TestRBACClusterScopedUserCannotAccessOtherClusters(t *testing.T) {
	e := newTestEngine()

	seedCache(e, "cluster-admin", []Permission{
		{Resource: "*", Action: "*", ScopeType: "cluster", ScopeID: "cluster-1"},
	})

	// Should work for cluster-1
	allowed, _ := e.Evaluate(nil, Request{
		UserID:    "cluster-admin",
		Action:    "delete",
		Resource:  "pods",
		ClusterID: "cluster-1",
	})
	if !allowed {
		t.Fatal("cluster-admin should have access to cluster-1")
	}

	// Must be denied for cluster-2
	allowed, _ = e.Evaluate(nil, Request{
		UserID:    "cluster-admin",
		Action:    "delete",
		Resource:  "pods",
		ClusterID: "cluster-2",
	})
	if allowed {
		t.Fatal("SECURITY: cluster-1 admin escalated to cluster-2")
	}
}

// TestRBACNoPermissions verifies that a user with no permissions is denied everything.
func TestRBACNoPermissions(t *testing.T) {
	e := newTestEngine()

	seedCache(e, "empty-user", []Permission{})

	allowed, _ := e.Evaluate(nil, Request{
		UserID:   "empty-user",
		Action:   "read",
		Resource: "pods",
	})
	if allowed {
		t.Fatal("SECURITY: user with no permissions was allowed access")
	}
}

// TestRBACUnknownScopeType verifies that unknown scope types are denied.
func TestRBACUnknownScopeType(t *testing.T) {
	e := newTestEngine()

	seedCache(e, "weird-scope", []Permission{
		{Resource: "*", Action: "*", ScopeType: "custom-scope", ScopeID: "whatever"},
		{Resource: "*", Action: "*", ScopeType: "", ScopeID: ""},
		{Resource: "*", Action: "*", ScopeType: "GLOBAL", ScopeID: ""},  // case sensitivity
	})

	allowed, _ := e.Evaluate(nil, Request{
		UserID:   "weird-scope",
		Action:   "read",
		Resource: "pods",
	})
	if allowed {
		t.Fatal("SECURITY: unknown scope type was allowed (should default deny)")
	}
}

// TestRBACCacheExpiration verifies that expired cache entries are not used.
func TestRBACCacheExpiration(t *testing.T) {
	e := newTestEngine()

	// Insert cache entry that's already expired
	e.mu.Lock()
	e.cache["expired-user"] = &cachedPermissions{
		permissions: []Permission{
			{Resource: "*", Action: "*", ScopeType: "global"},
		},
		expiresAt: time.Now().Add(-1 * time.Second),
	}
	e.mu.Unlock()

	// This should fail because the cache is expired and there's no DB pool
	// to reload from, resulting in a nil pointer dereference or error
	func() {
		defer func() { recover() }()
		allowed, err := e.Evaluate(nil, Request{
			UserID:   "expired-user",
			Action:   "read",
			Resource: "pods",
		})
		// If we get here without panic, the expired cache was used (bad)
		if err == nil && allowed {
			t.Fatal("SECURITY: expired cache entry was used without revalidation")
		}
	}()
}

// TestRBACPathTraversalInScopeID tests that path traversal patterns in scope IDs
// don't match unexpected scopes.
func TestRBACPathTraversalInScopeID(t *testing.T) {
	e := newTestEngine()

	seedCache(e, "traversal-user", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "namespace", ScopeID: "cluster-1/dev"},
	})

	traversalAttempts := []Request{
		{UserID: "traversal-user", Action: "read", Resource: "pods", ClusterID: "cluster-1", Namespace: "../prod"},
		{UserID: "traversal-user", Action: "read", Resource: "pods", ClusterID: "cluster-1/dev/../cluster-2", Namespace: "dev"},
		{UserID: "traversal-user", Action: "read", Resource: "pods", ClusterID: "cluster-1", Namespace: "dev/../../admin"},
	}

	for _, req := range traversalAttempts {
		allowed, _ := e.Evaluate(nil, req)
		if allowed {
			t.Errorf("SECURITY: path traversal accepted: cluster=%s ns=%s", req.ClusterID, req.Namespace)
		}
	}
}

// TestRBACConcurrentAccess verifies thread safety of the RBAC engine.
func TestRBACConcurrentAccess(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "concurrent-user", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "global"},
	})

	done := make(chan bool, 100)
	for i := 0; i < 100; i++ {
		go func() {
			defer func() { done <- true }()
			e.Evaluate(nil, Request{
				UserID:   "concurrent-user",
				Action:   "read",
				Resource: "pods",
			})
			e.InvalidateCache("other-user")
			seedCache(e, "another-user", []Permission{
				{Resource: "pods", Action: "read", ScopeType: "global"},
			})
		}()
	}

	for i := 0; i < 100; i++ {
		<-done
	}
}
