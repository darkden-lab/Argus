package plugin

import (
	"context"
	"testing"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

type mockPlugin struct {
	manifest Manifest
}

func (m *mockPlugin) ID() string                                                  { return m.manifest.ID }
func (m *mockPlugin) Manifest() Manifest                                          { return m.manifest }
func (m *mockPlugin) RegisterRoutes(router *mux.Router, cm *cluster.Manager)      {}
func (m *mockPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager)           {}
func (m *mockPlugin) OnEnable(ctx context.Context, pool *pgxpool.Pool) error      { return nil }
func (m *mockPlugin) OnDisable(ctx context.Context, pool *pgxpool.Pool) error     { return nil }

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
