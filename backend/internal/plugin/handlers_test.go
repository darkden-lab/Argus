package plugin

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

// fakePlugin implements Plugin for testing.
type fakePlugin struct {
	id       string
	manifest Manifest
}

func (f *fakePlugin) ID() string        { return f.id }
func (f *fakePlugin) Manifest() Manifest { return f.manifest }
func (f *fakePlugin) RegisterRoutes(_ *mux.Router, _ *cluster.Manager) {}
func (f *fakePlugin) RegisterWatchers(_ *ws.Hub, _ *cluster.Manager)   {}
func (f *fakePlugin) OnEnable(_ context.Context, _ *pgxpool.Pool) error  { return nil }
func (f *fakePlugin) OnDisable(_ context.Context, _ *pgxpool.Pool) error { return nil }

func newTestEngine(plugins ...*fakePlugin) *Engine {
	e := NewEngine(nil)
	for _, p := range plugins {
		e.Register(p) //nolint:errcheck
	}
	return e
}

func TestHandleListEmpty(t *testing.T) {
	e := NewEngine(nil)
	h := NewHandlers(e, nil)

	req := httptest.NewRequest("GET", "/api/plugins", nil)
	rec := httptest.NewRecorder()
	h.handleList(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var body []PluginInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to decode: %v", err)
	}
	if len(body) != 0 {
		t.Errorf("expected empty list, got %d items", len(body))
	}
}

func TestHandleListWithPlugins(t *testing.T) {
	e := newTestEngine(
		&fakePlugin{id: "prometheus", manifest: Manifest{ID: "prometheus", Name: "Prometheus", Version: "1.0.0"}},
		&fakePlugin{id: "istio", manifest: Manifest{ID: "istio", Name: "Istio", Version: "2.0.0"}},
	)
	h := NewHandlers(e, nil)

	req := httptest.NewRequest("GET", "/api/plugins", nil)
	rec := httptest.NewRecorder()
	h.handleList(rec, req)

	var body []PluginInfo
	json.Unmarshal(rec.Body.Bytes(), &body) //nolint:errcheck
	if len(body) != 2 {
		t.Errorf("expected 2 plugins, got %d", len(body))
	}
}

func TestHandleListEnabledEmpty(t *testing.T) {
	e := newTestEngine(
		&fakePlugin{id: "prometheus", manifest: Manifest{ID: "prometheus", Name: "Prometheus", Version: "1.0.0"}},
	)
	h := NewHandlers(e, nil)

	req := httptest.NewRequest("GET", "/api/plugins/enabled", nil)
	rec := httptest.NewRecorder()
	h.handleListEnabled(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	var body []Manifest
	json.Unmarshal(rec.Body.Bytes(), &body) //nolint:errcheck
	if len(body) != 0 {
		t.Errorf("expected empty list (none enabled), got %d", len(body))
	}
}

func TestHandleListEnabledWithEnabled(t *testing.T) {
	e := newTestEngine(
		&fakePlugin{id: "prometheus", manifest: Manifest{ID: "prometheus", Name: "Prometheus", Version: "1.0.0"}},
	)
	e.Enable(context.Background(), "prometheus") //nolint:errcheck
	h := NewHandlers(e, nil)

	req := httptest.NewRequest("GET", "/api/plugins/enabled", nil)
	rec := httptest.NewRecorder()
	h.handleListEnabled(rec, req)

	var body []Manifest
	json.Unmarshal(rec.Body.Bytes(), &body) //nolint:errcheck
	if len(body) != 1 {
		t.Errorf("expected 1 enabled plugin, got %d", len(body))
	}
	if body[0].ID != "prometheus" {
		t.Errorf("expected prometheus, got %q", body[0].ID)
	}
}

func TestHandleEnableNotFound(t *testing.T) {
	e := NewEngine(nil)
	h := NewHandlers(e, nil)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest("POST", "/api/plugins/nonexistent/enable", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestHandleEnableSuccess(t *testing.T) {
	e := newTestEngine(
		&fakePlugin{id: "prometheus", manifest: Manifest{ID: "prometheus", Name: "Prometheus", Version: "1.0.0"}},
	)
	h := NewHandlers(e, nil)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest("POST", "/api/plugins/prometheus/enable", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}

	var body map[string]string
	json.Unmarshal(rec.Body.Bytes(), &body) //nolint:errcheck
	if body["status"] != "enabled" {
		t.Errorf("expected status=enabled, got %q", body["status"])
	}

	if !e.IsEnabled("prometheus") {
		t.Error("expected prometheus to be enabled after enable call")
	}
}

func TestHandleDisableNotFound(t *testing.T) {
	e := NewEngine(nil)
	h := NewHandlers(e, nil)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest("POST", "/api/plugins/nonexistent/disable", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", rec.Code)
	}
}

func TestHandleDisableSuccess(t *testing.T) {
	e := newTestEngine(
		&fakePlugin{id: "prometheus", manifest: Manifest{ID: "prometheus", Name: "Prometheus", Version: "1.0.0"}},
	)
	e.Enable(context.Background(), "prometheus") //nolint:errcheck
	h := NewHandlers(e, nil)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest("POST", "/api/plugins/prometheus/disable", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", rec.Code)
	}
	if e.IsEnabled("prometheus") {
		t.Error("expected prometheus to be disabled after disable call")
	}
}

func TestRegisterRoutes(t *testing.T) {
	e := NewEngine(nil)
	h := NewHandlers(e, nil)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	routes := []struct {
		method string
		path   string
	}{
		{"GET", "/api/plugins"},
		{"GET", "/api/plugins/enabled"},
		{"POST", "/api/plugins/test/enable"},
		{"POST", "/api/plugins/test/disable"},
	}
	for _, rt := range routes {
		req := httptest.NewRequest(rt.method, rt.path, nil)
		match := &mux.RouteMatch{}
		if !r.Match(req, match) {
			t.Errorf("expected route %s %s to match", rt.method, rt.path)
		}
	}
}

func TestPluginGateMiddleware(t *testing.T) {
	e := newTestEngine(
		&fakePlugin{id: "prometheus", manifest: Manifest{ID: "prometheus", Name: "Prometheus", Version: "1.0.0"}},
	)
	// prometheus is NOT enabled

	handler := e.PluginGateMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Request to disabled plugin should 404
	req := httptest.NewRequest("GET", "/api/plugins/prometheus/someroute", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for disabled plugin, got %d", rec.Code)
	}

	// Enable and retry
	e.Enable(context.Background(), "prometheus") //nolint:errcheck

	rec2 := httptest.NewRecorder()
	handler.ServeHTTP(rec2, req)
	if rec2.Code != http.StatusOK {
		t.Errorf("expected 200 for enabled plugin, got %d", rec2.Code)
	}
}

func TestPluginGateMiddlewareNonPluginPath(t *testing.T) {
	e := NewEngine(nil)
	handler := e.PluginGateMiddleware()(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/api/clusters", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected 200 for non-plugin path, got %d", rec.Code)
	}
}
