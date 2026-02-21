package prometheus

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
	ID:          "prometheus",
	Name:        "Prometheus Operator",
	Version:     "1.0.0",
	Description: "Monitor Kubernetes clusters with Prometheus Operator CRDs",
	Permissions: []string{"read:monitoring", "write:monitoring"},
	Backend: plugin.BackendManifest{
		Watchers: []plugin.WatcherDefinition{
			{Group: "monitoring.coreos.com", Version: "v1", Resource: "servicemonitors"},
			{Group: "monitoring.coreos.com", Version: "v1", Resource: "podmonitors"},
			{Group: "monitoring.coreos.com", Version: "v1", Resource: "prometheusrules"},
			{Group: "monitoring.coreos.com", Version: "v1", Resource: "alertmanagers"},
		},
	},
	Frontend: plugin.FrontendManifest{
		Navigation: []plugin.NavItem{
			{Label: "Prometheus", Icon: "prometheus", Path: "/plugins/prometheus"},
		},
		Routes: []plugin.FrontendRoute{
			{Path: "/plugins/prometheus", Component: "PrometheusOverview"},
			{Path: "/plugins/prometheus/servicemonitors", Component: "ServiceMonitorList"},
			{Path: "/plugins/prometheus/podmonitors", Component: "PodMonitorList"},
			{Path: "/plugins/prometheus/rules", Component: "PrometheusRuleList"},
			{Path: "/plugins/prometheus/alertmanagers", Component: "AlertmanagerList"},
		},
		Widgets: []plugin.Widget{
			{ID: "prometheus-alerts", Type: "dashboard", Component: "PrometheusAlertWidget"},
			{ID: "prometheus-targets", Type: "dashboard", Component: "PrometheusTargetWidget"},
		},
	},
}

type PrometheusPlugin struct{}

func New() *PrometheusPlugin {
	return &PrometheusPlugin{}
}

func (p *PrometheusPlugin) ID() string {
	return manifest.ID
}

func (p *PrometheusPlugin) Manifest() plugin.Manifest {
	return manifest
}

func (p *PrometheusPlugin) RegisterRoutes(router *mux.Router, cm *cluster.Manager) {
	h := NewHandlers(cm)
	sub := router.PathPrefix("/api/plugins/prometheus").Subrouter()

	sub.HandleFunc("/{cluster}/servicemonitors", h.ListResources("servicemonitors")).Methods("GET")
	sub.HandleFunc("/{cluster}/servicemonitors", h.CreateResource("servicemonitors")).Methods("POST")
	sub.HandleFunc("/{cluster}/servicemonitors/{namespace}/{name}", h.GetResource("servicemonitors")).Methods("GET")
	sub.HandleFunc("/{cluster}/servicemonitors/{namespace}/{name}", h.DeleteResource("servicemonitors")).Methods("DELETE")

	sub.HandleFunc("/{cluster}/podmonitors", h.ListResources("podmonitors")).Methods("GET")
	sub.HandleFunc("/{cluster}/podmonitors", h.CreateResource("podmonitors")).Methods("POST")
	sub.HandleFunc("/{cluster}/podmonitors/{namespace}/{name}", h.GetResource("podmonitors")).Methods("GET")
	sub.HandleFunc("/{cluster}/podmonitors/{namespace}/{name}", h.DeleteResource("podmonitors")).Methods("DELETE")

	sub.HandleFunc("/{cluster}/prometheusrules", h.ListResources("prometheusrules")).Methods("GET")
	sub.HandleFunc("/{cluster}/prometheusrules", h.CreateResource("prometheusrules")).Methods("POST")
	sub.HandleFunc("/{cluster}/prometheusrules/{namespace}/{name}", h.GetResource("prometheusrules")).Methods("GET")
	sub.HandleFunc("/{cluster}/prometheusrules/{namespace}/{name}", h.DeleteResource("prometheusrules")).Methods("DELETE")

	sub.HandleFunc("/{cluster}/alertmanagers", h.ListResources("alertmanagers")).Methods("GET")
	sub.HandleFunc("/{cluster}/alertmanagers/{namespace}/{name}", h.GetResource("alertmanagers")).Methods("GET")

	// Wizard routes
	sub.HandleFunc("/{cluster}/wizard/servicemonitor", h.CreateServiceMonitorWizard).Methods("POST")
	sub.HandleFunc("/{cluster}/wizard/servicemonitor/preview", h.PreviewServiceMonitorWizard).Methods("POST")
}

func (p *PrometheusPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
	for _, w := range manifest.Backend.Watchers {
		cm.RegisterCRDWatcher(hub, w.Group, w.Version, w.Resource, manifest.ID)
	}
	log.Printf("prometheus: registered %d CRD watchers", len(manifest.Backend.Watchers))
}

func (p *PrometheusPlugin) OnEnable(ctx context.Context, pool *pgxpool.Pool) error {
	log.Printf("prometheus: plugin enabled")
	return nil
}

func (p *PrometheusPlugin) OnDisable(ctx context.Context, pool *pgxpool.Pool) error {
	log.Printf("prometheus: plugin disabled")
	return nil
}
