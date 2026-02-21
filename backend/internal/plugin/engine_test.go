package plugin

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

type mockPlugin struct {
	manifest      Manifest
	enableErr     error
	disableErr    error
	routesCalled  bool
	watcherCalled bool
}

func (m *mockPlugin) ID() string             { return m.manifest.ID }
func (m *mockPlugin) Manifest() Manifest     { return m.manifest }
func (m *mockPlugin) RegisterRoutes(router *mux.Router, cm *cluster.Manager) {
	m.routesCalled = true
}
func (m *mockPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
	m.watcherCalled = true
}
func (m *mockPlugin) OnEnable(ctx context.Context, pool *pgxpool.Pool) error  { return m.enableErr }
func (m *mockPlugin) OnDisable(ctx context.Context, pool *pgxpool.Pool) error { return m.disableErr }

func newMockPlugin(id, name, version string) *mockPlugin {
	return &mockPlugin{
		manifest: Manifest{
			ID:      id,
			Name:    name,
			Version: version,
		},
	}
}

func TestRegisterPlugin(t *testing.T) {
	e := NewEngine(nil)
	p := newMockPlugin("prometheus", "Prometheus", "1.0.0")

	if err := e.Register(p); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	m, err := e.GetManifest("prometheus")
	if err != nil {
		t.Fatalf("GetManifest failed: %v", err)
	}
	if m.ID != "prometheus" {
		t.Errorf("expected ID 'prometheus', got '%s'", m.ID)
	}
	if m.Name != "Prometheus" {
		t.Errorf("expected Name 'Prometheus', got '%s'", m.Name)
	}
}

func TestEnableDisable(t *testing.T) {
	e := NewEngine(nil)
	p := newMockPlugin("istio", "Istio", "1.0.0")
	ctx := context.Background()

	if err := e.Register(p); err != nil {
		t.Fatalf("Register failed: %v", err)
	}

	// Initially not enabled
	enabled := e.ListEnabled(ctx)
	if len(enabled) != 0 {
		t.Fatalf("expected 0 enabled plugins, got %d", len(enabled))
	}

	// Enable
	if err := e.Enable(ctx, "istio"); err != nil {
		t.Fatalf("Enable failed: %v", err)
	}

	enabled = e.ListEnabled(ctx)
	if len(enabled) != 1 {
		t.Fatalf("expected 1 enabled plugin, got %d", len(enabled))
	}
	if enabled[0].ID != "istio" {
		t.Errorf("expected enabled plugin 'istio', got '%s'", enabled[0].ID)
	}

	// Disable
	if err := e.Disable(ctx, "istio"); err != nil {
		t.Fatalf("Disable failed: %v", err)
	}

	enabled = e.ListEnabled(ctx)
	if len(enabled) != 0 {
		t.Fatalf("expected 0 enabled plugins after disable, got %d", len(enabled))
	}
}

func TestListEnabled(t *testing.T) {
	e := NewEngine(nil)
	ctx := context.Background()

	p1 := newMockPlugin("prometheus", "Prometheus", "1.0.0")
	p2 := newMockPlugin("istio", "Istio", "1.0.0")
	p3 := newMockPlugin("calico", "Calico", "1.0.0")

	_ = e.Register(p1)
	_ = e.Register(p2)
	_ = e.Register(p3)

	_ = e.Enable(ctx, "prometheus")
	_ = e.Enable(ctx, "calico")

	enabled := e.ListEnabled(ctx)
	if len(enabled) != 2 {
		t.Fatalf("expected 2 enabled plugins, got %d", len(enabled))
	}

	ids := make(map[string]bool)
	for _, m := range enabled {
		ids[m.ID] = true
	}
	if !ids["prometheus"] || !ids["calico"] {
		t.Errorf("expected prometheus and calico to be enabled, got %v", ids)
	}
	if ids["istio"] {
		t.Error("istio should not be enabled")
	}
}

func TestDuplicateRegister(t *testing.T) {
	e := NewEngine(nil)
	p := newMockPlugin("prometheus", "Prometheus", "1.0.0")

	if err := e.Register(p); err != nil {
		t.Fatalf("First register failed: %v", err)
	}

	err := e.Register(p)
	if err == nil {
		t.Fatal("expected error on duplicate register, got nil")
	}
}

func TestRegister_ValidationErrors(t *testing.T) {
	tests := []struct {
		name    string
		id      string
		pName   string
		version string
		wantErr string
	}{
		{"empty ID", "", "Prometheus", "1.0.0", "must have an ID"},
		{"empty name", "prometheus", "", "1.0.0", "must have a name"},
		{"empty version", "prometheus", "Prometheus", "", "must have a version"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := NewEngine(nil)
			p := newMockPlugin(tt.id, tt.pName, tt.version)
			err := e.Register(p)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
		})
	}
}

func TestGetManifest_NotFound(t *testing.T) {
	e := NewEngine(nil)

	_, err := e.GetManifest("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent plugin, got nil")
	}
}

func TestEnable_NotFound(t *testing.T) {
	e := NewEngine(nil)
	ctx := context.Background()

	err := e.Enable(ctx, "nonexistent")
	if err == nil {
		t.Fatal("expected error enabling nonexistent plugin, got nil")
	}
}

func TestDisable_NotFound(t *testing.T) {
	e := NewEngine(nil)
	ctx := context.Background()

	err := e.Disable(ctx, "nonexistent")
	if err == nil {
		t.Fatal("expected error disabling nonexistent plugin, got nil")
	}
}

func TestEnable_OnEnableError(t *testing.T) {
	e := NewEngine(nil)
	ctx := context.Background()
	p := newMockPlugin("failing", "Failing", "1.0.0")
	p.enableErr = fmt.Errorf("initialization failed")

	_ = e.Register(p)
	err := e.Enable(ctx, "failing")
	if err == nil {
		t.Fatal("expected error when OnEnable fails, got nil")
	}

	// Should not be enabled after failure
	enabled := e.ListEnabled(ctx)
	if len(enabled) != 0 {
		t.Errorf("expected 0 enabled plugins after failed enable, got %d", len(enabled))
	}
}

func TestDisable_OnDisableError(t *testing.T) {
	e := NewEngine(nil)
	ctx := context.Background()
	p := newMockPlugin("failing", "Failing", "1.0.0")
	p.disableErr = fmt.Errorf("cleanup failed")

	_ = e.Register(p)
	_ = e.Enable(ctx, "failing")

	err := e.Disable(ctx, "failing")
	if err == nil {
		t.Fatal("expected error when OnDisable fails, got nil")
	}

	// Should remain enabled after failed disable
	enabled := e.ListEnabled(ctx)
	if len(enabled) != 1 {
		t.Errorf("expected 1 enabled plugin after failed disable, got %d", len(enabled))
	}
}

func TestListAll(t *testing.T) {
	e := NewEngine(nil)
	ctx := context.Background()

	p1 := newMockPlugin("prometheus", "Prometheus", "1.0.0")
	p2 := newMockPlugin("istio", "Istio", "2.0.0")
	_ = e.Register(p1)
	_ = e.Register(p2)
	_ = e.Enable(ctx, "prometheus")

	all := e.ListAll()
	if len(all) != 2 {
		t.Fatalf("expected 2 plugins, got %d", len(all))
	}

	infoMap := make(map[string]PluginInfo)
	for _, info := range all {
		infoMap[info.Manifest.ID] = info
	}

	if !infoMap["prometheus"].Enabled {
		t.Error("prometheus should be enabled")
	}
	if infoMap["istio"].Enabled {
		t.Error("istio should not be enabled")
	}
}

func TestListAll_Empty(t *testing.T) {
	e := NewEngine(nil)
	all := e.ListAll()
	if len(all) != 0 {
		t.Errorf("expected empty list, got %d", len(all))
	}
}

func TestRegisterAllRoutes_OnlyEnabled(t *testing.T) {
	e := NewEngine(nil)
	ctx := context.Background()
	router := mux.NewRouter()

	p1 := newMockPlugin("prometheus", "Prometheus", "1.0.0")
	p2 := newMockPlugin("istio", "Istio", "1.0.0")
	_ = e.Register(p1)
	_ = e.Register(p2)
	_ = e.Enable(ctx, "prometheus")

	e.RegisterAllRoutes(router, nil)

	if !p1.routesCalled {
		t.Error("expected RegisterRoutes called on enabled plugin")
	}
	if p2.routesCalled {
		t.Error("expected RegisterRoutes NOT called on disabled plugin")
	}
}

func TestRegisterAllWatchers_OnlyEnabled(t *testing.T) {
	e := NewEngine(nil)
	ctx := context.Background()
	hub := ws.NewHub()

	p1 := newMockPlugin("prometheus", "Prometheus", "1.0.0")
	p2 := newMockPlugin("istio", "Istio", "1.0.0")
	_ = e.Register(p1)
	_ = e.Register(p2)
	_ = e.Enable(ctx, "prometheus")

	e.RegisterAllWatchers(hub, nil)

	if !p1.watcherCalled {
		t.Error("expected RegisterWatchers called on enabled plugin")
	}
	if p2.watcherCalled {
		t.Error("expected RegisterWatchers NOT called on disabled plugin")
	}
}

func TestNewEngine(t *testing.T) {
	e := NewEngine(nil)
	if e == nil {
		t.Fatal("expected non-nil engine")
	}
	if e.plugins == nil {
		t.Error("expected plugins map to be initialized")
	}
	if e.enabled == nil {
		t.Error("expected enabled map to be initialized")
	}
}

func TestGetManifest_ReturnsFullManifest(t *testing.T) {
	e := NewEngine(nil)
	p := &mockPlugin{
		manifest: Manifest{
			ID:          "test-plugin",
			Name:        "Test Plugin",
			Version:     "2.1.0",
			Description: "A test plugin",
			Permissions: []string{"read", "write"},
		},
	}
	_ = e.Register(p)

	m, err := e.GetManifest("test-plugin")
	if err != nil {
		t.Fatalf("GetManifest failed: %v", err)
	}
	if m.Description != "A test plugin" {
		t.Errorf("expected description 'A test plugin', got %q", m.Description)
	}
	if len(m.Permissions) != 2 {
		t.Errorf("expected 2 permissions, got %d", len(m.Permissions))
	}
	if m.Version != "2.1.0" {
		t.Errorf("expected version '2.1.0', got %q", m.Version)
	}
}

// --- Plugin Handlers Tests ---

func TestHandlers_HandleList(t *testing.T) {
	e := NewEngine(nil)
	ctx := context.Background()
	p := newMockPlugin("prometheus", "Prometheus", "1.0.0")
	_ = e.Register(p)
	_ = e.Enable(ctx, "prometheus")

	h := NewHandlers(e)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest("GET", "/api/plugins", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}
}

func TestHandlers_HandleListEnabled(t *testing.T) {
	e := NewEngine(nil)
	ctx := context.Background()
	p1 := newMockPlugin("prometheus", "Prometheus", "1.0.0")
	p2 := newMockPlugin("istio", "Istio", "1.0.0")
	_ = e.Register(p1)
	_ = e.Register(p2)
	_ = e.Enable(ctx, "prometheus")

	h := NewHandlers(e)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest("GET", "/api/plugins/enabled", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestHandlers_HandleEnable_NotFound(t *testing.T) {
	e := NewEngine(nil)
	h := NewHandlers(e)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest("POST", "/api/plugins/nonexistent/enable", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}
}

func TestHandlers_HandleDisable_NotFound(t *testing.T) {
	e := NewEngine(nil)
	h := NewHandlers(e)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest("POST", "/api/plugins/nonexistent/disable", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", rec.Code)
	}
}

func TestHandlers_EnableDisableFlow(t *testing.T) {
	e := NewEngine(nil)
	p := newMockPlugin("istio", "Istio", "1.0.0")
	_ = e.Register(p)

	h := NewHandlers(e)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	// Enable
	req := httptest.NewRequest("POST", "/api/plugins/istio/enable", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200 on enable, got %d", rec.Code)
	}

	// Disable
	req = httptest.NewRequest("POST", "/api/plugins/istio/disable", nil)
	rec = httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200 on disable, got %d", rec.Code)
	}
}

func TestHandlers_ListEmpty(t *testing.T) {
	e := NewEngine(nil)
	h := NewHandlers(e)
	r := mux.NewRouter()
	h.RegisterRoutes(r)

	req := httptest.NewRequest("GET", "/api/plugins", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
	// Should return [] not null
	body := rec.Body.String()
	if body == "null\n" {
		t.Error("expected empty array, got null")
	}
}

func TestNewHandlers(t *testing.T) {
	e := NewEngine(nil)
	h := NewHandlers(e)
	if h == nil {
		t.Fatal("expected non-nil handlers")
	}
}

func TestNewStore(t *testing.T) {
	s := NewStore(nil)
	if s == nil {
		t.Fatal("expected non-nil store")
	}
}
