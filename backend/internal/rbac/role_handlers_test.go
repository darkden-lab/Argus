package rbac

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/gorilla/mux"
)

// adminCtx returns a context with admin claims and a seeded RBAC engine
// that grants global wildcard permissions.
func adminCtx(e *Engine) context.Context {
	seedCache(e, "admin-user", []Permission{
		{Resource: "*", Action: "*", ScopeType: "global"},
	})
	claims := &auth.Claims{UserID: "admin-user", Email: "admin@test.com"}
	return auth.ContextWithClaims(context.Background(), claims)
}

// callRoleHandlerSafe calls a handler function with panic recovery.
// Returns (status_code, panicked).
func callRoleHandlerSafe(fn func(rec *httptest.ResponseRecorder)) (int, bool) {
	rec := httptest.NewRecorder()
	panicked := false
	func() {
		defer func() {
			if r := recover(); r != nil {
				panicked = true
			}
		}()
		fn(rec)
	}()
	return rec.Code, panicked
}

// --- Create Role ---

func TestHandleCreateRole_MissingName(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)
	ctx := adminCtx(e)

	body, _ := json.Marshal(map[string]string{"name": ""})
	req := httptest.NewRequest("POST", "/api/roles", bytes.NewBuffer(body)).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleCreateRole(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestHandleCreateRole_ReservedName(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)
	ctx := adminCtx(e)

	reserved := []string{"admin", "operator", "developer", "viewer"}
	for _, name := range reserved {
		body, _ := json.Marshal(map[string]string{"name": name})
		req := httptest.NewRequest("POST", "/api/roles", bytes.NewBuffer(body)).WithContext(ctx)
		rec := httptest.NewRecorder()

		h.handleCreateRole(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Errorf("expected 400 for reserved name %q, got %d", name, rec.Code)
		}
	}
}

func TestHandleCreateRole_Success(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)
	ctx := adminCtx(e)

	body, _ := json.Marshal(map[string]string{"name": "custom-role", "description": "A custom role"})
	req := httptest.NewRequest("POST", "/api/roles", bytes.NewBuffer(body)).WithContext(ctx)

	// Validation passes, but DB is nil so it panics at the INSERT
	code, panicked := callRoleHandlerSafe(func(rec *httptest.ResponseRecorder) {
		h.handleCreateRole(rec, req)
	})
	if !panicked && code == http.StatusBadRequest {
		t.Fatal("expected to pass validation (should reach DB layer)")
	}
}

func TestHandleCreateRole_Unauthorized(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)

	// No claims in context
	body, _ := json.Marshal(map[string]string{"name": "test-role"})
	req := httptest.NewRequest("POST", "/api/roles", bytes.NewBuffer(body))
	rec := httptest.NewRecorder()

	h.handleCreateRole(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestHandleCreateRole_BadJSON(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)
	ctx := adminCtx(e)

	req := httptest.NewRequest("POST", "/api/roles", bytes.NewBufferString("not json")).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleCreateRole(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d", rec.Code)
	}
}

// --- Delete Role ---

func TestHandleDeleteRole_Unauthorized(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)

	req := httptest.NewRequest("DELETE", "/api/roles/some-id", nil)
	req = mux.SetURLVars(req, map[string]string{"id": "some-id"})
	rec := httptest.NewRecorder()

	h.handleDeleteRole(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestHandleDeleteRole_ReachesDB(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)
	ctx := adminCtx(e)

	req := httptest.NewRequest("DELETE", "/api/roles/some-id", nil).WithContext(ctx)
	req = mux.SetURLVars(req, map[string]string{"id": "some-id"})

	// Auth passes, but DB is nil so it panics at SELECT name FROM roles
	code, panicked := callRoleHandlerSafe(func(rec *httptest.ResponseRecorder) {
		h.handleDeleteRole(rec, req)
	})
	if !panicked && (code == http.StatusUnauthorized || code == http.StatusForbidden) {
		t.Fatal("expected to pass auth check (should reach DB layer)")
	}
}

// --- List Role Permissions ---

func TestHandleListRolePermissions_Unauthorized(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)

	req := httptest.NewRequest("GET", "/api/roles/some-id/permissions", nil)
	req = mux.SetURLVars(req, map[string]string{"id": "some-id"})
	rec := httptest.NewRecorder()

	h.handleListRolePermissions(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestHandleListRolePermissions_ReachesDB(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)
	ctx := adminCtx(e)

	req := httptest.NewRequest("GET", "/api/roles/role-id/permissions", nil).WithContext(ctx)
	req = mux.SetURLVars(req, map[string]string{"id": "role-id"})

	code, panicked := callRoleHandlerSafe(func(rec *httptest.ResponseRecorder) {
		h.handleListRolePermissions(rec, req)
	})
	if !panicked && (code == http.StatusUnauthorized || code == http.StatusForbidden) {
		t.Fatal("expected to pass auth check (should reach DB layer)")
	}
}

// --- Add Role Permission ---

func TestHandleAddRolePermission_MissingFields(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)
	ctx := adminCtx(e)

	tests := []struct {
		name string
		body map[string]string
	}{
		{"missing resource", map[string]string{"action": "read", "scope_type": "global"}},
		{"missing action", map[string]string{"resource": "pods", "scope_type": "global"}},
		{"missing scope_type", map[string]string{"resource": "pods", "action": "read"}},
		{"all empty", map[string]string{}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(tt.body)
			req := httptest.NewRequest("POST", "/api/roles/role-id/permissions", bytes.NewBuffer(body)).WithContext(ctx)
			req = mux.SetURLVars(req, map[string]string{"id": "role-id"})
			rec := httptest.NewRecorder()

			h.handleAddRolePermission(rec, req)

			if rec.Code != http.StatusBadRequest {
				t.Errorf("expected 400 for %s, got %d", tt.name, rec.Code)
			}
		})
	}
}

func TestHandleAddRolePermission_Success(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)
	ctx := adminCtx(e)

	body, _ := json.Marshal(map[string]string{
		"resource":   "pods",
		"action":     "read",
		"scope_type": "global",
	})
	req := httptest.NewRequest("POST", "/api/roles/role-id/permissions", bytes.NewBuffer(body)).WithContext(ctx)
	req = mux.SetURLVars(req, map[string]string{"id": "role-id"})

	// Validation passes, panics at DB
	code, panicked := callRoleHandlerSafe(func(rec *httptest.ResponseRecorder) {
		h.handleAddRolePermission(rec, req)
	})
	if !panicked && code == http.StatusBadRequest {
		t.Fatal("expected to pass validation (should reach DB layer)")
	}
}

func TestHandleAddRolePermission_Unauthorized(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)

	body, _ := json.Marshal(map[string]string{
		"resource":   "pods",
		"action":     "read",
		"scope_type": "global",
	})
	req := httptest.NewRequest("POST", "/api/roles/role-id/permissions", bytes.NewBuffer(body))
	req = mux.SetURLVars(req, map[string]string{"id": "role-id"})
	rec := httptest.NewRecorder()

	h.handleAddRolePermission(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

// --- Remove Role Permission ---

func TestHandleRemoveRolePermission_Unauthorized(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)

	req := httptest.NewRequest("DELETE", "/api/roles/role-id/permissions/perm-id", nil)
	req = mux.SetURLVars(req, map[string]string{"id": "role-id", "permId": "perm-id"})
	rec := httptest.NewRecorder()

	h.handleRemoveRolePermission(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", rec.Code)
	}
}

func TestHandleRemoveRolePermission_ReachesDB(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)
	ctx := adminCtx(e)

	req := httptest.NewRequest("DELETE", "/api/roles/role-id/permissions/perm-id", nil).WithContext(ctx)
	req = mux.SetURLVars(req, map[string]string{"id": "role-id", "permId": "perm-id"})

	code, panicked := callRoleHandlerSafe(func(rec *httptest.ResponseRecorder) {
		h.handleRemoveRolePermission(rec, req)
	})
	if !panicked && (code == http.StatusUnauthorized || code == http.StatusForbidden) {
		t.Fatal("expected to pass auth check (should reach DB layer)")
	}
}

// --- Route Registration ---

func TestRoleHandlersRegisterRoutes(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)

	r := mux.NewRouter()
	h.RegisterRoutes(r)

	routes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/roles"},
		{"POST", "/api/roles"},
		{"DELETE", "/api/roles/123"},
		{"GET", "/api/roles/123/permissions"},
		{"POST", "/api/roles/123/permissions"},
		{"DELETE", "/api/roles/123/permissions/456"},
		{"GET", "/api/roles/assignments"},
		{"POST", "/api/roles/assign"},
		{"DELETE", "/api/roles/revoke/123"},
	}

	for _, rt := range routes {
		req := httptest.NewRequest(rt.method, rt.path, nil)
		match := &mux.RouteMatch{}
		if !r.Match(req, match) {
			t.Errorf("expected route %s %s to be registered", rt.method, rt.path)
		}
	}
}

func TestNewRoleHandlers(t *testing.T) {
	e := newTestEngine()
	h := NewRoleHandlers(nil, e)

	if h == nil {
		t.Fatal("expected non-nil RoleHandlers")
	}
	if h.engine != e {
		t.Fatal("expected engine to be set")
	}
}

// --- Forbidden (user without roles write permission) ---

func TestHandleCreateRole_Forbidden(t *testing.T) {
	e := newTestEngine()
	// User only has read permission for roles
	seedCache(e, "readonly-user", []Permission{
		{Resource: "roles", Action: "read", ScopeType: "global"},
	})
	h := NewRoleHandlers(nil, e)

	claims := &auth.Claims{UserID: "readonly-user", Email: "reader@test.com"}
	ctx := auth.ContextWithClaims(context.Background(), claims)

	body, _ := json.Marshal(map[string]string{"name": "new-role"})
	req := httptest.NewRequest("POST", "/api/roles", bytes.NewBuffer(body)).WithContext(ctx)
	rec := httptest.NewRecorder()

	h.handleCreateRole(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rec.Code)
	}
}
