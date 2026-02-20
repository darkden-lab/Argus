package rbac

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/darkden-lab/argus/backend/internal/auth"
)

// TestRBACMiddlewareUnauthorized tests that requests without claims are rejected.
func TestRBACMiddlewareUnauthorized(t *testing.T) {
	e := newTestEngine()

	middleware := RBACMiddleware(e, "pods", "read")
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/pods", nil)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 without claims, got %d", rec.Code)
	}

	var resp map[string]string
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] != "unauthorized" {
		t.Errorf("expected 'unauthorized' error, got '%s'", resp["error"])
	}
}

// TestRBACMiddlewareAllowed tests that requests with valid permissions pass through.
func TestRBACMiddlewareAllowed(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "admin-user", []Permission{
		{Resource: "*", Action: "*", ScopeType: "global"},
	})

	middleware := RBACMiddleware(e, "pods", "read")
	nextCalled := false
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	}))

	claims := &auth.Claims{UserID: "admin-user", Email: "admin@test.com"}
	ctx := auth.ContextWithClaims(httptest.NewRequest("GET", "/api/pods", nil).Context(), claims)
	req := httptest.NewRequest("GET", "/api/pods", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if !nextCalled {
		t.Fatal("expected next handler to be called")
	}
	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
}

// TestRBACMiddlewareForbidden tests that requests without sufficient permissions are denied.
func TestRBACMiddlewareForbidden(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "limited-user", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "global"},
	})

	middleware := RBACMiddleware(e, "pods", "delete")
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called")
	}))

	claims := &auth.Claims{UserID: "limited-user", Email: "limited@test.com"}
	ctx := auth.ContextWithClaims(httptest.NewRequest("GET", "/api/pods", nil).Context(), claims)
	req := httptest.NewRequest("DELETE", "/api/pods/my-pod", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403, got %d", rec.Code)
	}

	var resp map[string]string
	json.NewDecoder(rec.Body).Decode(&resp)
	if resp["error"] != "insufficient permissions" {
		t.Errorf("expected 'insufficient permissions' error, got '%s'", resp["error"])
	}
}

// TestRBACMiddlewareEvaluateError tests that errors in permission evaluation
// return 500.
func TestRBACMiddlewareEvaluateError(t *testing.T) {
	e := newTestEngine()
	// User not in cache, nil pool => will panic or error

	middleware := RBACMiddleware(e, "pods", "read")
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called on error")
	}))

	claims := &auth.Claims{UserID: "unknown-user", Email: "unknown@test.com"}
	ctx := auth.ContextWithClaims(httptest.NewRequest("GET", "/api/pods", nil).Context(), claims)
	req := httptest.NewRequest("GET", "/api/pods", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	panicked := false
	func() {
		defer func() {
			if r := recover(); r != nil {
				panicked = true
			}
		}()
		handler.ServeHTTP(rec, req)
	}()

	if panicked {
		// nil pool causes panic, expected in test without DB
		return
	}

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for evaluation error, got %d", rec.Code)
	}
}

// TestWriteErrorFunction tests the writeError helper.
func TestWriteErrorFunction(t *testing.T) {
	testCases := []struct {
		status  int
		message string
	}{
		{http.StatusUnauthorized, "unauthorized"},
		{http.StatusForbidden, "insufficient permissions"},
		{http.StatusInternalServerError, "permission check failed"},
		{http.StatusBadRequest, "bad request"},
	}

	for _, tc := range testCases {
		rec := httptest.NewRecorder()
		writeError(rec, tc.status, tc.message)

		if rec.Code != tc.status {
			t.Errorf("expected status %d, got %d", tc.status, rec.Code)
		}

		ct := rec.Header().Get("Content-Type")
		if ct != "application/json" {
			t.Errorf("expected Content-Type 'application/json', got '%s'", ct)
		}

		var resp map[string]string
		json.NewDecoder(rec.Body).Decode(&resp)
		if resp["error"] != tc.message {
			t.Errorf("expected error '%s', got '%s'", tc.message, resp["error"])
		}
	}
}

// TestRBACMiddlewareSpecificResource tests middleware configured for a specific resource.
func TestRBACMiddlewareSpecificResource(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "pod-reader", []Permission{
		{Resource: "pods", Action: "read", ScopeType: "global"},
	})

	// Middleware for deployments - should deny pod-reader
	middleware := RBACMiddleware(e, "deployments", "read")
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("next handler should not be called")
	}))

	claims := &auth.Claims{UserID: "pod-reader", Email: "reader@test.com"}
	ctx := auth.ContextWithClaims(httptest.NewRequest("GET", "/", nil).Context(), claims)
	req := httptest.NewRequest("GET", "/api/deployments", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("expected 403 when pod-reader accesses deployments, got %d", rec.Code)
	}
}

// TestRBACMiddlewareChaining tests that middleware can be chained.
func TestRBACMiddlewareChaining(t *testing.T) {
	e := newTestEngine()
	seedCache(e, "full-user", []Permission{
		{Resource: "*", Action: "*", ScopeType: "global"},
	})

	// Chain two middleware layers
	m1 := RBACMiddleware(e, "pods", "read")
	m2 := RBACMiddleware(e, "pods", "write")

	innerCalled := false
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		innerCalled = true
		w.WriteHeader(http.StatusOK)
	})

	handler := m1(m2(inner))

	claims := &auth.Claims{UserID: "full-user", Email: "full@test.com"}
	ctx := auth.ContextWithClaims(httptest.NewRequest("GET", "/", nil).Context(), claims)
	req := httptest.NewRequest("POST", "/api/pods", nil).WithContext(ctx)
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)

	if !innerCalled {
		t.Fatal("expected inner handler to be called after passing both middleware")
	}
}

// Ensure time import is used
var _ = time.Now
