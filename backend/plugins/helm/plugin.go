package helm

import (
	"context"
	"log"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/plugin"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

var manifest = plugin.Manifest{
	ID:          "helm",
	Name:        "Helm Releases",
	Version:     "1.0.0",
	Description: "View and manage Helm chart releases: list, inspect, upgrade, rollback, uninstall",
	Permissions: []string{"read:helm", "write:helm"},
	Backend: plugin.BackendManifest{
		Watchers: []plugin.WatcherDefinition{},
	},
	Frontend: plugin.FrontendManifest{
		Navigation: []plugin.NavItem{
			{Label: "Helm", Icon: "package", Path: "/plugins/helm"},
		},
		Routes: []plugin.FrontendRoute{
			{Path: "/plugins/helm", Component: "HelmOverview"},
			{Path: "/plugins/helm/releases/:name", Component: "HelmReleaseDetail"},
		},
		Widgets: []plugin.Widget{
			{ID: "helm-releases-count", Type: "dashboard", Component: "HelmReleasesCountWidget"},
		},
	},
}

type HelmPlugin struct{}

func New() *HelmPlugin {
	return &HelmPlugin{}
}

func (p *HelmPlugin) ID() string {
	return manifest.ID
}

func (p *HelmPlugin) Manifest() plugin.Manifest {
	return manifest
}

func (p *HelmPlugin) RegisterRoutes(router *mux.Router, cm *cluster.Manager) {
	h := NewHandlers(cm)
	sub := router.PathPrefix("/api/plugins/helm").Subrouter()

	sub.HandleFunc("/{cluster}/releases", h.ListReleases).Methods("GET")
	sub.HandleFunc("/{cluster}/releases", h.InstallRelease).Methods("POST")
	sub.HandleFunc("/{cluster}/releases/{name}", h.GetRelease).Methods("GET")
	sub.HandleFunc("/{cluster}/releases/{name}", h.UpgradeRelease).Methods("PUT")
	sub.HandleFunc("/{cluster}/releases/{name}", h.UninstallRelease).Methods("DELETE")
	sub.HandleFunc("/{cluster}/releases/{name}/rollback", h.RollbackRelease).Methods("POST")
	sub.HandleFunc("/{cluster}/releases/{name}/history", h.GetReleaseHistory).Methods("GET")
	sub.HandleFunc("/{cluster}/releases/{name}/values", h.GetReleaseValues).Methods("GET")
}

func (p *HelmPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
	// Helm does not use K8s CRD watches.
}

func (p *HelmPlugin) OnEnable(ctx context.Context, pool *pgxpool.Pool) error {
	log.Printf("helm: plugin enabled")
	return nil
}

func (p *HelmPlugin) OnDisable(ctx context.Context, pool *pgxpool.Pool) error {
	log.Printf("helm: plugin disabled")
	return nil
}
