package istio

import (
	"testing"

	"github.com/darkden-lab/argus/backend/internal/plugin"
	k8swatch "k8s.io/apimachinery/pkg/watch"
)

func TestIstioPluginID(t *testing.T) {
	p := &IstioPlugin{manifest: buildTestManifest()}
	if got := p.ID(); got != "istio" {
		t.Errorf("expected ID %q, got %q", "istio", got)
	}
}

func TestIstioPluginManifest(t *testing.T) {
	p := &IstioPlugin{manifest: buildTestManifest()}
	m := p.Manifest()

	if m.ID != "istio" {
		t.Errorf("expected manifest ID %q, got %q", "istio", m.ID)
	}
	if m.Name != "Istio Service Mesh" {
		t.Errorf("expected manifest name %q, got %q", "Istio Service Mesh", m.Name)
	}
	if m.Version != "1.0.0" {
		t.Errorf("expected version %q, want %q", m.Version, "1.0.0")
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

func TestIstioPluginManifestFromFile(t *testing.T) {
	// Exercises the full loadManifest path to catch JSON syntax errors early.
	p, err := New()
	if err != nil {
		t.Fatalf("New() returned error: %v", err)
	}
	m := p.Manifest()
	if m.ID != "istio" {
		t.Errorf("manifest loaded from file has wrong ID: %q", m.ID)
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
		{"virtualservices", "networking.istio.io/v1, Resource=virtualservices"},
		{"gateways", "networking.istio.io/v1, Resource=gateways"},
		{"destinationrules", "networking.istio.io/v1, Resource=destinationrules"},
		{"serviceentries", "networking.istio.io/v1, Resource=serviceentries"},
	}
	gvrs := map[string]string{
		"virtualservices":  gvrVirtualServices.String(),
		"gateways":         gvrGateways.String(),
		"destinationrules": gvrDestinationRules.String(),
		"serviceentries":   gvrServiceEntries.String(),
	}
	for _, tc := range cases {
		if got := gvrs[tc.name]; got != tc.expected {
			t.Errorf("GVR %s String() = %q, want %q", tc.name, got, tc.expected)
		}
	}
}

// buildTestManifest returns a minimal Manifest for unit tests that avoids
// hitting the filesystem.
func buildTestManifest() plugin.Manifest {
	return plugin.Manifest{
		ID:          "istio",
		Name:        "Istio Service Mesh",
		Version:     "1.0.0",
		Description: "test",
		Permissions: []string{"istio:*"},
		Backend: plugin.BackendManifest{
			Routes: []plugin.RouteDefinition{
				{Method: "GET", Path: "/api/plugins/istio/virtualservices", Handler: "ListVirtualServices"},
			},
			Watchers: []plugin.WatcherDefinition{
				{Group: "networking.istio.io", Version: "v1", Resource: "virtualservices"},
			},
		},
		Frontend: plugin.FrontendManifest{
			Navigation: []plugin.NavItem{
				{Label: "Istio", Icon: "network", Path: "/plugins/istio"},
			},
		},
	}
}
