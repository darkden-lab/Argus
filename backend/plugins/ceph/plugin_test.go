package ceph

import (
	"testing"

	"github.com/darkden-lab/argus/backend/internal/plugin"
	k8swatch "k8s.io/apimachinery/pkg/watch"
)

func TestCephPluginID(t *testing.T) {
	p := &CephPlugin{manifest: buildTestManifest()}
	if got := p.ID(); got != "ceph" {
		t.Errorf("expected ID %q, got %q", "ceph", got)
	}
}

func TestCephPluginManifest(t *testing.T) {
	p := &CephPlugin{manifest: buildTestManifest()}
	m := p.Manifest()

	if m.ID != "ceph" {
		t.Errorf("expected manifest ID %q, got %q", "ceph", m.ID)
	}
	if m.Name != "Rook Ceph Storage" {
		t.Errorf("expected manifest name %q, got %q", "Rook Ceph Storage", m.Name)
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

func TestCephPluginManifestFromFile(t *testing.T) {
	p, err := New()
	if err != nil {
		t.Fatalf("New() returned error: %v", err)
	}
	m := p.Manifest()
	if m.ID != "ceph" {
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
		{"cephclusters", "ceph.rook.io/v1, Resource=cephclusters"},
		{"cephblockpools", "ceph.rook.io/v1, Resource=cephblockpools"},
		{"cephfilesystems", "ceph.rook.io/v1, Resource=cephfilesystems"},
		{"cephobjectstores", "ceph.rook.io/v1, Resource=cephobjectstores"},
		{"cephobjectstoreusers", "ceph.rook.io/v1, Resource=cephobjectstoreusers"},
	}
	gvrs := map[string]string{
		"cephclusters":         gvrCephClusters.String(),
		"cephblockpools":       gvrCephBlockPools.String(),
		"cephfilesystems":      gvrCephFilesystems.String(),
		"cephobjectstores":     gvrCephObjectStores.String(),
		"cephobjectstoreusers": gvrCephObjectStoreUsers.String(),
	}
	for _, tc := range cases {
		if got := gvrs[tc.name]; got != tc.expected {
			t.Errorf("GVR %s String() = %q, want %q", tc.name, got, tc.expected)
		}
	}
}

func buildTestManifest() plugin.Manifest {
	return plugin.Manifest{
		ID:          "ceph",
		Name:        "Rook Ceph Storage",
		Version:     "1.0.0",
		Description: "test",
		Permissions: []string{"ceph:*"},
		Backend: plugin.BackendManifest{
			Routes: []plugin.RouteDefinition{
				{Method: "GET", Path: "/api/plugins/ceph/clusters", Handler: "ListCephClusters"},
			},
			Watchers: []plugin.WatcherDefinition{
				{Group: "ceph.rook.io", Version: "v1", Resource: "cephclusters"},
			},
		},
		Frontend: plugin.FrontendManifest{
			Navigation: []plugin.NavItem{
				{Label: "Ceph Storage", Icon: "hard-drive", Path: "/plugins/ceph"},
			},
		},
	}
}
