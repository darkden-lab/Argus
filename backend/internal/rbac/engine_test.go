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

// TestNewEngine verifies the NewEngine constructor.
func TestNewEngine(t *testing.T) {
	e := NewEngine(nil)
	if e == nil {
		t.Fatal("expected non-nil Engine")
	}
	if e.cache == nil {
		t.Fatal("expected non-nil cache map")
	}
	if e.ttl != 5*time.Minute {
		t.Errorf("expected TTL of 5 minutes, got %v", e.ttl)
	}
}

// TestMatchPermissionExactResource tests exact resource matching (no wildcard).
func TestMatchPermissionExactResource(t *testing.T) {
	e := newTestEngine()

	perm := Permission{Resource: "pods", Action: "read", ScopeType: "global"}

	// Exact match
	if !e.matchPermission(perm, Request{Action: "read", Resource: "pods"}) {
		t.Fatal("expected exact resource match to succeed")
	}

	// Different resource
	if e.matchPermission(perm, Request{Action: "read", Resource: "deployments"}) {
		t.Fatal("expected different resource to fail")
	}
}

// TestMatchPermissionExactAction tests exact action matching (no wildcard).
func TestMatchPermissionExactAction(t *testing.T) {
	e := newTestEngine()

	perm := Permission{Resource: "pods", Action: "read", ScopeType: "global"}

	// Exact match
	if !e.matchPermission(perm, Request{Action: "read", Resource: "pods"}) {
		t.Fatal("expected exact action match to succeed")
	}

	// Different action
	if e.matchPermission(perm, Request{Action: "write", Resource: "pods"}) {
		t.Fatal("expected different action to fail")
	}
}

// TestMatchPermissionClusterScopeEmptyClusterID tests cluster scope
// when request has no ClusterID (should match).
func TestMatchPermissionClusterScopeEmptyClusterID(t *testing.T) {
	e := newTestEngine()

	perm := Permission{Resource: "pods", Action: "read", ScopeType: "cluster", ScopeID: "cluster-1"}

	// No ClusterID in request means "any cluster" for cluster-scoped perms
	req := Request{Action: "read", Resource: "pods", ClusterID: ""}
	if !e.matchPermission(perm, req) {
		t.Fatal("expected cluster-scoped perm to match when request has no cluster ID")
	}
}

// TestMatchPermissionNamespaceScopeOnlyNamespace tests namespace scope
// when request has namespace but no cluster ID.
func TestMatchPermissionNamespaceScopeOnlyNamespace(t *testing.T) {
	e := newTestEngine()

	perm := Permission{Resource: "pods", Action: "read", ScopeType: "namespace", ScopeID: "dev"}

	// Only namespace, no cluster
	req := Request{Action: "read", Resource: "pods", Namespace: "dev"}
	if !e.matchPermission(perm, req) {
		t.Fatal("expected namespace-only match to succeed")
	}

	// Wrong namespace
	req = Request{Action: "read", Resource: "pods", Namespace: "prod"}
	if e.matchPermission(perm, req) {
		t.Fatal("expected wrong namespace to fail")
	}
}

// TestMatchPermissionNamespaceScopeEmptyRequest tests namespace scope
// when request has neither cluster nor namespace.
func TestMatchPermissionNamespaceScopeEmptyRequest(t *testing.T) {
	e := newTestEngine()

	perm := Permission{Resource: "pods", Action: "read", ScopeType: "namespace", ScopeID: "cluster-1/dev"}

	// No cluster or namespace in request
	req := Request{Action: "read", Resource: "pods"}
	if e.matchPermission(perm, req) {
		t.Fatal("expected namespace perm to fail when request has no namespace")
	}
}

// TestEvaluateMultiplePermissions tests evaluation with multiple permissions
// where the second one matches.
func TestEvaluateMultiplePermissions(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "multi-perm-user", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "global"},
		{Resource: "deployments", Action: "write", ScopeType: "global"},
		{Resource: "services", Action: "*", ScopeType: "cluster", ScopeID: "cluster-1"},
	})

	// First perm matches
	allowed, _ := e.Evaluate(nil, Request{
		UserID: "multi-perm-user", Action: "read", Resource: "pods",
	})
	if !allowed {
		t.Fatal("expected first permission to match")
	}

	// Second perm matches
	allowed, _ = e.Evaluate(nil, Request{
		UserID: "multi-perm-user", Action: "write", Resource: "deployments",
	})
	if !allowed {
		t.Fatal("expected second permission to match")
	}

	// Third perm matches (wildcard action)
	allowed, _ = e.Evaluate(nil, Request{
		UserID: "multi-perm-user", Action: "delete", Resource: "services", ClusterID: "cluster-1",
	})
	if !allowed {
		t.Fatal("expected third permission to match")
	}

	// None match
	allowed, _ = e.Evaluate(nil, Request{
		UserID: "multi-perm-user", Action: "delete", Resource: "pods",
	})
	if allowed {
		t.Fatal("expected no permission to match delete on pods")
	}
}

// TestGetPermissionsCacheMiss tests that getPermissions attempts DB load
// when cache misses (nil pool causes panic/error).
func TestGetPermissionsCacheMiss(t *testing.T) {
	e := newTestEngine()

	// No cached permissions, no pool - should fail
	func() {
		defer func() { recover() }()
		_, err := e.getPermissions(nil, "unknown-user")
		if err == nil {
			t.Fatal("expected error when loading permissions with nil pool")
		}
	}()
}

// TestGetPermissionsFromCache tests that getPermissions returns cached data.
func TestGetPermissionsFromCache(t *testing.T) {
	e := newTestEngine()
	expectedPerms := []Permission{
		{Resource: "pods", Action: "read", ScopeType: "global"},
	}
	seedCache(e, "cached-user", expectedPerms)

	perms, err := e.getPermissions(nil, "cached-user")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(perms) != 1 {
		t.Fatalf("expected 1 permission, got %d", len(perms))
	}
	if perms[0].Resource != "pods" {
		t.Errorf("expected resource 'pods', got '%s'", perms[0].Resource)
	}
}

// TestInvalidateCacheNonExistentUser tests that invalidating a non-existent
// user does not panic.
func TestInvalidateCacheNonExistentUser(t *testing.T) {
	e := newTestEngine()

	// Should not panic
	e.InvalidateCache("nonexistent-user")
}

// TestMatchPermissionNamespaceScopeWithClusterOnly tests namespace scope
// when request has cluster but no namespace.
func TestMatchPermissionNamespaceScopeWithClusterOnly(t *testing.T) {
	e := newTestEngine()

	perm := Permission{Resource: "pods", Action: "read", ScopeType: "namespace", ScopeID: "cluster-1/dev"}

	// Cluster but no namespace
	req := Request{Action: "read", Resource: "pods", ClusterID: "cluster-1"}
	if e.matchPermission(perm, req) {
		t.Fatal("expected namespace perm to fail when request has cluster but no namespace")
	}
}

// TestEvaluateUserNotInCache tests that Evaluate returns error when user
// is not cached and DB pool is nil.
func TestEvaluateUserNotInCache(t *testing.T) {
	e := newTestEngine()

	panicked := false
	func() {
		defer func() {
			if r := recover(); r != nil {
				panicked = true
			}
		}()
		_, err := e.Evaluate(nil, Request{
			UserID:   "no-cache-user",
			Action:   "read",
			Resource: "pods",
		})
		if err == nil && !panicked {
			t.Fatal("expected error or panic when user not in cache and no DB")
		}
	}()
}
