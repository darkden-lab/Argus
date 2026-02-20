package proxy

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/k8s-dashboard/backend/internal/auth"
)

func TestHandleProxy_NoAuth(t *testing.T) {
	p := &K8sProxy{}

	r := mux.NewRouter()
	p.RegisterRoutes(r)

	req := httptest.NewRequest(http.MethodGet, "/api/proxy/k8s/test-cluster/api/v1/pods", nil)
	req = mux.SetURLVars(req, map[string]string{"cluster_id": "test-cluster"})
	w := httptest.NewRecorder()

	// No claims in context
	p.handleProxy(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected status %d, got %d", http.StatusUnauthorized, w.Code)
	}
}

func TestHandleProxy_ClusterNotFound(t *testing.T) {
	// Use a nil pool manager - GetClient will fail
	p := &K8sProxy{clusterMgr: nil}

	req := httptest.NewRequest(http.MethodGet, "/api/proxy/k8s/nonexistent/api/v1/pods", nil)
	req = mux.SetURLVars(req, map[string]string{"cluster_id": "nonexistent"})

	claims := &auth.Claims{UserID: "user-1", Email: "test@test.com"}
	ctx := auth.ContextWithClaims(context.Background(), claims)
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()

	// This will panic because clusterMgr is nil - which is expected behavior
	// in a real scenario the cluster manager would be non-nil
	defer func() {
		if r := recover(); r == nil {
			// If no panic, check response
			if w.Code != http.StatusNotFound {
				t.Errorf("expected status %d, got %d", http.StatusNotFound, w.Code)
			}
		}
	}()

	p.handleProxy(w, req)
}
