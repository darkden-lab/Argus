package rbac

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/gorilla/mux"
)

func TestHandleGetPermissionsUnauthorized(t *testing.T) {
	h := NewHandlers(newTestEngine())

	req := httptest.NewRequest("GET", "/api/auth/permissions", nil)
	rec := httptest.NewRecorder()

	h.handleGetPermissions(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected status 401, got %d", rec.Code)
	}

	var resp map[string]string
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] != "unauthorized" {
		t.Errorf("expected error 'unauthorized', got '%s'", resp["error"])
	}
}

func TestHandleGetPermissionsNoRoles(t *testing.T) {
	e := newTestEngine()
	// Seed empty permissions: user has no roles assigned.
	seedCache(e, "user-1", []Permission{})

	h := NewHandlers(e)

	claims := &auth.Claims{UserID: "user-1", Email: "newuser@test.com"}
	ctx := auth.ContextWithClaims(context.Background(), claims)
	req := httptest.NewRequest("GET", "/api/auth/permissions", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleGetPermissions(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var resp permissionsEnvelope
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	// Deny-by-default: users with no roles must receive an empty permissions list,
	// NOT a wildcard admin grant.
	if len(resp.Permissions) != 0 {
		t.Errorf("SECURITY: expected 0 permissions for user with no roles, got %d: %+v",
			len(resp.Permissions), resp.Permissions)
	}
}

func TestHandleGetPermissionsWithRoles(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "user-2", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "cluster", ScopeID: "cluster-1"},
		{Resource: "deployments", Action: "write", ScopeType: "namespace", ScopeID: "cluster-1/dev"},
	})

	h := NewHandlers(e)

	claims := &auth.Claims{UserID: "user-2", Email: "dev@test.com"}
	ctx := auth.ContextWithClaims(context.Background(), claims)
	req := httptest.NewRequest("GET", "/api/auth/permissions", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleGetPermissions(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var resp permissionsEnvelope
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if len(resp.Permissions) != 2 {
		t.Fatalf("expected 2 permissions, got %d", len(resp.Permissions))
	}

	if resp.Permissions[0].Resource != "pods" {
		t.Errorf("expected first permission resource 'pods', got '%s'", resp.Permissions[0].Resource)
	}
	if resp.Permissions[0].ScopeType != "cluster" {
		t.Errorf("expected first permission scope_type 'cluster', got '%s'", resp.Permissions[0].ScopeType)
	}
	if resp.Permissions[1].Resource != "deployments" {
		t.Errorf("expected second permission resource 'deployments', got '%s'", resp.Permissions[1].Resource)
	}
}

func TestHandleGetPermissionsContentType(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "user-3", []Permission{})

	h := NewHandlers(e)

	claims := &auth.Claims{UserID: "user-3", Email: "user@test.com"}
	ctx := auth.ContextWithClaims(context.Background(), claims)
	req := httptest.NewRequest("GET", "/api/auth/permissions", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleGetPermissions(rec, req)

	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type 'application/json', got '%s'", ct)
	}
}

func TestRBACHandlersRegisterRoutes(t *testing.T) {
	h := NewHandlers(newTestEngine())

	r := mux.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest("GET", "/api/auth/permissions", nil)
	match := &mux.RouteMatch{}
	if !r.Match(req, match) {
		t.Error("expected route GET /api/auth/permissions to be registered")
	}
}

func TestNewRBACHandlers(t *testing.T) {
	e := newTestEngine()
	h := NewHandlers(e)

	if h == nil {
		t.Fatal("expected non-nil Handlers")
	}
	if h.engine != e {
		t.Fatal("expected engine to be set")
	}
}
