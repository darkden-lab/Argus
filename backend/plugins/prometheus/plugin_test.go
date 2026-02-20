package prometheus

import (
	"encoding/json"
	"testing"
)

func TestPrometheusPluginID(t *testing.T) {
	p := New()
	if p.ID() != "prometheus" {
		t.Errorf("expected ID 'prometheus', got '%s'", p.ID())
	}
}

func TestGenerateServiceMonitor(t *testing.T) {
	cfg := ServiceMonitorConfig{
		Name:        "my-app-monitor",
		Namespace:   "monitoring",
		ServiceName: "my-app",
		Port:        "http-metrics",
		Path:        "/custom/metrics",
		Interval:    "15s",
		Labels: map[string]string{
			"team": "backend",
		},
		ClusterID: "cluster-1",
	}

	obj := GenerateServiceMonitor(cfg)

	if obj.GetName() != "my-app-monitor" {
		t.Errorf("expected name 'my-app-monitor', got '%s'", obj.GetName())
	}
	if obj.GetNamespace() != "monitoring" {
		t.Errorf("expected namespace 'monitoring', got '%s'", obj.GetNamespace())
	}
	if obj.GetKind() != "ServiceMonitor" {
		t.Errorf("expected kind 'ServiceMonitor', got '%s'", obj.GetKind())
	}

	spec, ok := obj.Object["spec"].(map[string]interface{})
	if !ok {
		t.Fatal("spec is not a map")
	}

	selector := spec["selector"].(map[string]interface{})
	matchLabels := selector["matchLabels"].(map[string]interface{})
	if matchLabels["app"] != "my-app" {
		t.Errorf("expected matchLabels app='my-app', got '%v'", matchLabels["app"])
	}
	if matchLabels["team"] != "backend" {
		t.Errorf("expected matchLabels team='backend', got '%v'", matchLabels["team"])
	}

	endpoints := spec["endpoints"].([]interface{})
	if len(endpoints) != 1 {
		t.Fatalf("expected 1 endpoint, got %d", len(endpoints))
	}
	ep := endpoints[0].(map[string]interface{})
	if ep["port"] != "http-metrics" {
		t.Errorf("expected port 'http-metrics', got '%v'", ep["port"])
	}
	if ep["path"] != "/custom/metrics" {
		t.Errorf("expected path '/custom/metrics', got '%v'", ep["path"])
	}
	if ep["interval"] != "15s" {
		t.Errorf("expected interval '15s', got '%v'", ep["interval"])
	}
}

func TestGenerateServiceMonitorDefaults(t *testing.T) {
	cfg := ServiceMonitorConfig{
		Name: "minimal-monitor",
	}

	obj := GenerateServiceMonitor(cfg)

	if obj.GetName() != "minimal-monitor" {
		t.Errorf("expected name 'minimal-monitor', got '%s'", obj.GetName())
	}
	if obj.GetNamespace() != "default" {
		t.Errorf("expected default namespace 'default', got '%s'", obj.GetNamespace())
	}

	spec := obj.Object["spec"].(map[string]interface{})
	endpoints := spec["endpoints"].([]interface{})
	ep := endpoints[0].(map[string]interface{})

	if ep["path"] != "/metrics" {
		t.Errorf("expected default path '/metrics', got '%v'", ep["path"])
	}
	if ep["interval"] != "30s" {
		t.Errorf("expected default interval '30s', got '%v'", ep["interval"])
	}
	if _, hasPort := ep["port"]; hasPort {
		t.Error("expected no port key when port is empty")
	}

	// Verify it's valid JSON
	data, err := json.Marshal(obj.Object)
	if err != nil {
		t.Fatalf("failed to marshal to JSON: %v", err)
	}
	if len(data) == 0 {
		t.Error("expected non-empty JSON output")
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
