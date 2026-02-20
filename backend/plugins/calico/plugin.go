package calico

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
	ID:          "calico",
	Name:        "Calico Network Policy",
	Version:     "1.0.0",
	Description: "Manage Calico network policies and IP pools",
	Permissions: []string{"read:networking", "write:networking"},
	Backend: plugin.BackendManifest{
		Watchers: []plugin.WatcherDefinition{
			{Group: "crd.projectcalico.org", Version: "v1", Resource: "networkpolicies"},
			{Group: "crd.projectcalico.org", Version: "v1", Resource: "globalnetworkpolicies"},
			{Group: "crd.projectcalico.org", Version: "v1", Resource: "hostendpoints"},
			{Group: "crd.projectcalico.org", Version: "v1", Resource: "ippools"},
		},
	},
	Frontend: plugin.FrontendManifest{
		Navigation: []plugin.NavItem{
			{Label: "Calico", Icon: "calico", Path: "/plugins/calico"},
		},
		Routes: []plugin.FrontendRoute{
			{Path: "/plugins/calico", Component: "CalicoOverview"},
			{Path: "/plugins/calico/networkpolicies", Component: "NetworkPolicyList"},
			{Path: "/plugins/calico/globalnetworkpolicies", Component: "GlobalNetworkPolicyList"},
			{Path: "/plugins/calico/hostendpoints", Component: "HostEndpointList"},
			{Path: "/plugins/calico/ippools", Component: "IPPoolList"},
		},
		Widgets: []plugin.Widget{
			{ID: "calico-policies", Type: "dashboard", Component: "CalicoPolicyWidget"},
			{ID: "calico-endpoints", Type: "dashboard", Component: "CalicoEndpointWidget"},
		},
	},
}

type CalicoPlugin struct{}

func New() *CalicoPlugin {
	return &CalicoPlugin{}
}

func (p *CalicoPlugin) ID() string {
	return manifest.ID
}

func (p *CalicoPlugin) Manifest() plugin.Manifest {
	return manifest
}

func (p *CalicoPlugin) RegisterRoutes(router *mux.Router, cm *cluster.Manager) {
	h := NewHandlers(cm)
	sub := router.PathPrefix("/api/plugins/calico").Subrouter()

	sub.HandleFunc("/{cluster}/networkpolicies", h.ListResources("networkpolicies")).Methods("GET")
	sub.HandleFunc("/{cluster}/networkpolicies", h.CreateResource("networkpolicies")).Methods("POST")
	sub.HandleFunc("/{cluster}/networkpolicies/{namespace}/{name}", h.GetResource("networkpolicies")).Methods("GET")
	sub.HandleFunc("/{cluster}/networkpolicies/{namespace}/{name}", h.DeleteResource("networkpolicies")).Methods("DELETE")

	sub.HandleFunc("/{cluster}/globalnetworkpolicies", h.ListClusterResources("globalnetworkpolicies")).Methods("GET")
	sub.HandleFunc("/{cluster}/globalnetworkpolicies", h.CreateClusterResource("globalnetworkpolicies")).Methods("POST")
	sub.HandleFunc("/{cluster}/globalnetworkpolicies/{name}", h.GetClusterResource("globalnetworkpolicies")).Methods("GET")
	sub.HandleFunc("/{cluster}/globalnetworkpolicies/{name}", h.DeleteClusterResource("globalnetworkpolicies")).Methods("DELETE")

	sub.HandleFunc("/{cluster}/hostendpoints", h.ListClusterResources("hostendpoints")).Methods("GET")
	sub.HandleFunc("/{cluster}/hostendpoints/{name}", h.GetClusterResource("hostendpoints")).Methods("GET")

	sub.HandleFunc("/{cluster}/ippools", h.ListClusterResources("ippools")).Methods("GET")
	sub.HandleFunc("/{cluster}/ippools/{name}", h.GetClusterResource("ippools")).Methods("GET")
}

func (p *CalicoPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
	log.Printf("calico: watcher registration (stub)")
}

func (p *CalicoPlugin) OnEnable(ctx context.Context, pool *pgxpool.Pool) error {
	log.Printf("calico: plugin enabled")
	return nil
}

func (p *CalicoPlugin) OnDisable(ctx context.Context, pool *pgxpool.Pool) error {
	log.Printf("calico: plugin disabled")
	return nil
}
