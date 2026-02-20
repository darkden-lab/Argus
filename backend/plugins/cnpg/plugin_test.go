package cnpg

import (
	"testing"

	"github.com/darkden-lab/argus/backend/internal/plugin"
	k8swatch "k8s.io/apimachinery/pkg/watch"
)

func TestCnpgPluginID(t *testing.T) {
	p := &CnpgPlugin{manifest: buildTestManifest()}
	if got := p.ID(); got != "cnpg" {
		t.Errorf("expected ID %q, got %q", "cnpg", got)
	}
}

func TestCnpgPluginManifest(t *testing.T) {
	p := &CnpgPlugin{manifest: buildTestManifest()}
	m := p.Manifest()

	if m.ID != "cnpg" {
		t.Errorf("expected manifest ID %q, got %q", "cnpg", m.ID)
	}
	if m.Name != "CloudNativePG" {
		t.Errorf("expected manifest name %q, got %q", "CloudNativePG", m.Name)
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

func TestCnpgPluginManifestFromFile(t *testing.T) {
	p, err := New()
	if err != nil {
		t.Fatalf("New() returned error: %v", err)
	}
	m := p.Manifest()
	if m.ID != "cnpg" {
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
		{"clusters", "postgresql.cnpg.io/v1, Resource=clusters"},
		{"backups", "postgresql.cnpg.io/v1, Resource=backups"},
		{"scheduledbackups", "postgresql.cnpg.io/v1, Resource=scheduledbackups"},
		{"poolers", "postgresql.cnpg.io/v1, Resource=poolers"},
	}
	gvrs := map[string]string{
		"clusters":         gvrClusters.String(),
		"backups":          gvrBackups.String(),
		"scheduledbackups": gvrScheduledBackups.String(),
		"poolers":          gvrPoolers.String(),
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
		ID:          "cnpg",
		Name:        "CloudNativePG",
		Version:     "1.0.0",
		Description: "test",
		Permissions: []string{"cnpg:*"},
		Backend: plugin.BackendManifest{
			Routes: []plugin.RouteDefinition{
				{Method: "GET", Path: "/api/plugins/cnpg/clusters", Handler: "ListClusters"},
			},
			Watchers: []plugin.WatcherDefinition{
				{Group: "postgresql.cnpg.io", Version: "v1", Resource: "clusters"},
			},
		},
		Frontend: plugin.FrontendManifest{
			Navigation: []plugin.NavItem{
				{Label: "CloudNativePG", Icon: "database", Path: "/plugins/cnpg"},
			},
		},
	}
}
