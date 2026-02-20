package mariadb

import (
	"testing"

	"github.com/k8s-dashboard/backend/internal/plugin"
	k8swatch "k8s.io/apimachinery/pkg/watch"
)

func TestMariaDBPluginID(t *testing.T) {
	p := &MariaDBPlugin{manifest: buildTestManifest()}
	if got := p.ID(); got != "mariadb" {
		t.Errorf("expected ID %q, got %q", "mariadb", got)
	}
}

func TestMariaDBPluginManifest(t *testing.T) {
	p := &MariaDBPlugin{manifest: buildTestManifest()}
	m := p.Manifest()

	if m.ID != "mariadb" {
		t.Errorf("expected manifest ID %q, got %q", "mariadb", m.ID)
	}
	if m.Name != "MariaDB Operator" {
		t.Errorf("expected manifest name %q, got %q", "MariaDB Operator", m.Name)
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

func TestMariaDBPluginManifestFromFile(t *testing.T) {
	p, err := New()
	if err != nil {
		t.Fatalf("New() returned error: %v", err)
	}
	m := p.Manifest()
	if m.ID != "mariadb" {
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
		{"mariadbs", "k8s.mariadb.com/v1alpha1, Resource=mariadbs"},
		{"backups", "k8s.mariadb.com/v1alpha1, Resource=backups"},
		{"restores", "k8s.mariadb.com/v1alpha1, Resource=restores"},
		{"connections", "k8s.mariadb.com/v1alpha1, Resource=connections"},
		{"databases", "k8s.mariadb.com/v1alpha1, Resource=databases"},
		{"users", "k8s.mariadb.com/v1alpha1, Resource=users"},
		{"grants", "k8s.mariadb.com/v1alpha1, Resource=grants"},
	}
	gvrs := map[string]string{
		"mariadbs":    gvrMariaDBs.String(),
		"backups":     gvrBackups.String(),
		"restores":    gvrRestores.String(),
		"connections": gvrConnections.String(),
		"databases":   gvrDatabases.String(),
		"users":       gvrUsers.String(),
		"grants":      gvrGrants.String(),
	}
	for _, tc := range cases {
		if got := gvrs[tc.name]; got != tc.expected {
			t.Errorf("GVR %s String() = %q, want %q", tc.name, got, tc.expected)
		}
	}
}

func buildTestManifest() plugin.Manifest {
	return plugin.Manifest{
		ID:          "mariadb",
		Name:        "MariaDB Operator",
		Version:     "1.0.0",
		Description: "test",
		Permissions: []string{"mariadb:*"},
		Backend: plugin.BackendManifest{
			Routes: []plugin.RouteDefinition{
				{Method: "GET", Path: "/api/plugins/mariadb/instances", Handler: "ListMariaDBs"},
			},
			Watchers: []plugin.WatcherDefinition{
				{Group: "k8s.mariadb.com", Version: "v1alpha1", Resource: "mariadbs"},
			},
		},
		Frontend: plugin.FrontendManifest{
			Navigation: []plugin.NavItem{
				{Label: "MariaDB", Icon: "database", Path: "/plugins/mariadb"},
			},
		},
	}
}
