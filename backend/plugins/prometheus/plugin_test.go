package prometheus

import (
	"testing"
)

func TestPrometheusPluginID(t *testing.T) {
	p := New()
	if p.ID() != "prometheus" {
		t.Errorf("expected ID 'prometheus', got '%s'", p.ID())
	}
}

func TestManifest(t *testing.T) {
	p := New()
	m := p.Manifest()

	if m.ID != "prometheus" {
		t.Errorf("expected manifest ID 'prometheus', got '%s'", m.ID)
	}
	if m.Name != "Prometheus Operator" {
		t.Errorf("expected manifest Name 'Prometheus Operator', got '%s'", m.Name)
	}
	if m.Version != "1.0.0" {
		t.Errorf("expected manifest Version '1.0.0', got '%s'", m.Version)
	}
	if len(m.Backend.Watchers) != 4 {
		t.Errorf("expected 4 watchers, got %d", len(m.Backend.Watchers))
	}
	if len(m.Frontend.Navigation) != 1 {
		t.Errorf("expected 1 nav item, got %d", len(m.Frontend.Navigation))
	}
	if len(m.Frontend.Routes) != 5 {
		t.Errorf("expected 5 frontend routes, got %d", len(m.Frontend.Routes))
	}
	if len(m.Frontend.Widgets) != 2 {
		t.Errorf("expected 2 widgets, got %d", len(m.Frontend.Widgets))
	}
}
