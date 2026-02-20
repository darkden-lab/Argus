package keda

import (
	"testing"

	"github.com/k8s-dashboard/backend/internal/plugin"
	k8swatch "k8s.io/apimachinery/pkg/watch"
)

func TestKedaPluginID(t *testing.T) {
	p := &KedaPlugin{manifest: buildTestManifest()}
	if got := p.ID(); got != "keda" {
		t.Errorf("expected ID %q, got %q", "keda", got)
	}
}

func TestKedaPluginManifest(t *testing.T) {
	p := &KedaPlugin{manifest: buildTestManifest()}
	m := p.Manifest()

	if m.ID != "keda" {
		t.Errorf("expected manifest ID %q, got %q", "keda", m.ID)
	}
	if m.Name != "KEDA Autoscaling" {
		t.Errorf("expected manifest name %q, got %q", "KEDA Autoscaling", m.Name)
	}
	if m.Version != "1.0.0" {
		t.Errorf("expected version %q, got %q", "1.0.0", m.Version)
	}
	if len(m.Backend.Routes) == 0 {
		t.Error("expected at least one backend route")
	}
	if len(m.Backend.Watchers) == 0 {
		t.Error("expected at least one backend watcher")
	}
	if len(m.Frontend.Navigation) == 0 {
		t.Error("expected at least one navigation item")
	}
}

func TestKedaPluginManifestFromFile(t *testing.T) {
	p, err := New()
	if err != nil {
		t.Fatalf("New() returned error: %v", err)
	}
	m := p.Manifest()
	if m.ID != "keda" {
		t.Errorf("manifest loaded from file has wrong ID: %q", m.ID)
	}
	// Verify cluster-scoped resource is present in watchers
	found := false
	for _, w := range m.Backend.Watchers {
		if w.Resource == "clustertriggerauthentications" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected clustertriggerauthentications in watchers")
	}
}

func TestWatchEventType(t *testing.T) {
	cases := []struct {
		input    k8swatch.EventType
		expected string
	}{
		{k8swatch.Added, "ADDED"},
		{k8swatch.Modified, "MODIFIED"},
		{k8swatch.Deleted, "DELETED"},
		{k8swatch.Error, ""},
		{k8swatch.Bookmark, ""},
	}
	for _, tc := range cases {
		got := watchEventType(tc.input)
		if got != tc.expected {
			t.Errorf("watchEventType(%q) = %q, want %q", tc.input, got, tc.expected)
		}
	}
}

func TestGVRs(t *testing.T) {
	cases := []struct {
		name     string
		expected string
	}{
		{"scaledobjects", "keda.sh/v1alpha1, Resource=scaledobjects"},
		{"scaledjobs", "keda.sh/v1alpha1, Resource=scaledjobs"},
		{"triggerauthentications", "keda.sh/v1alpha1, Resource=triggerauthentications"},
		{"clustertriggerauthentications", "keda.sh/v1alpha1, Resource=clustertriggerauthentications"},
	}
	gvrs := map[string]string{
		"scaledobjects":                gvrScaledObjects.String(),
		"scaledjobs":                   gvrScaledJobs.String(),
		"triggerauthentications":       gvrTriggerAuthentications.String(),
		"clustertriggerauthentications": gvrClusterTriggerAuthentications.String(),
	}
	for _, tc := range cases {
		if got := gvrs[tc.name]; got != tc.expected {
			t.Errorf("GVR %s String() = %q, want %q", tc.name, got, tc.expected)
		}
	}
}

func TestNamespacedAndClusterGVRs(t *testing.T) {
	if len(namespacedGVRs) != 3 {
		t.Errorf("expected 3 namespaced GVRs, got %d", len(namespacedGVRs))
	}
	if len(clusterGVRs) != 1 {
		t.Errorf("expected 1 cluster-scoped GVR, got %d", len(clusterGVRs))
	}
	if clusterGVRs[0].Resource != "clustertriggerauthentications" {
		t.Errorf("expected clustertriggerauthentications in clusterGVRs, got %q", clusterGVRs[0].Resource)
	}
}

func buildTestManifest() plugin.Manifest {
	return plugin.Manifest{
		ID:          "keda",
		Name:        "KEDA Autoscaling",
		Version:     "1.0.0",
		Description: "test",
		Permissions: []string{"keda:*"},
		Backend: plugin.BackendManifest{
			Routes: []plugin.RouteDefinition{
				{Method: "GET", Path: "/api/plugins/keda/scaledobjects", Handler: "ListScaledObjects"},
			},
			Watchers: []plugin.WatcherDefinition{
				{Group: "keda.sh", Version: "v1alpha1", Resource: "scaledobjects"},
			},
		},
		Frontend: plugin.FrontendManifest{
			Navigation: []plugin.NavItem{
				{Label: "KEDA", Icon: "scaling", Path: "/plugins/keda"},
			},
		},
	}
}
