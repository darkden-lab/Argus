package istio

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/k8s-dashboard/backend/internal/cluster"
	"github.com/k8s-dashboard/backend/internal/plugin"
	"github.com/k8s-dashboard/backend/internal/ws"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8swatch "k8s.io/apimachinery/pkg/watch"
)

// Istio networking CRD GVRs (networking.istio.io/v1)
var (
	gvrVirtualServices  = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1", Resource: "virtualservices"}
	gvrGateways         = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1", Resource: "gateways"}
	gvrDestinationRules = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1", Resource: "destinationrules"}
	gvrServiceEntries   = schema.GroupVersionResource{Group: "networking.istio.io", Version: "v1", Resource: "serviceentries"}

	// allWatchedGVRs is the list iterated by RegisterWatchers.
	allWatchedGVRs = []schema.GroupVersionResource{
		gvrVirtualServices,
		gvrGateways,
		gvrDestinationRules,
		gvrServiceEntries,
	}
)

// IstioPlugin implements plugin.Plugin for Istio service-mesh CRD management.
type IstioPlugin struct {
	manifest plugin.Manifest
}

// New creates an IstioPlugin by loading the manifest.json embedded next to
// this source file.
func New() (*IstioPlugin, error) {
	m, err := loadManifest()
	if err != nil {
		return nil, err
	}
	return &IstioPlugin{manifest: m}, nil
}

// ID satisfies plugin.Plugin.
func (p *IstioPlugin) ID() string { return "istio" }

// Manifest satisfies plugin.Plugin.
func (p *IstioPlugin) Manifest() plugin.Manifest { return p.manifest }

// RegisterRoutes wires all Istio CRUD endpoints onto the provided router.
func (p *IstioPlugin) RegisterRoutes(r *mux.Router, cm *cluster.Manager) {
	h := newHandlers(cm)

	vs := r.PathPrefix("/api/plugins/istio/virtualservices").Subrouter()
	vs.HandleFunc("", h.ListVirtualServices).Methods("GET")
	vs.HandleFunc("", h.CreateVirtualService).Methods("POST")
	vs.HandleFunc("/{name}", h.GetVirtualService).Methods("GET")
	vs.HandleFunc("/{name}", h.UpdateVirtualService).Methods("PUT")
	vs.HandleFunc("/{name}", h.DeleteVirtualService).Methods("DELETE")

	gw := r.PathPrefix("/api/plugins/istio/gateways").Subrouter()
	gw.HandleFunc("", h.ListGateways).Methods("GET")
	gw.HandleFunc("", h.CreateGateway).Methods("POST")
	gw.HandleFunc("/{name}", h.GetGateway).Methods("GET")
	gw.HandleFunc("/{name}", h.DeleteGateway).Methods("DELETE")

	r.HandleFunc("/api/plugins/istio/destinationrules", h.ListDestinationRules).Methods("GET")
	r.HandleFunc("/api/plugins/istio/serviceentries", h.ListServiceEntries).Methods("GET")
}

// RegisterWatchers starts a background watch goroutine for each Istio CRD on
// every cluster currently known to the ClusterManager, and broadcasts events
// to WebSocket subscribers.
func (p *IstioPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
	clusters, err := cm.ListClusters(context.Background())
	if err != nil {
		log.Printf("istio: failed to list clusters for watchers: %v", err)
		return
	}

	for _, c := range clusters {
		for _, gvr := range allWatchedGVRs {
			go p.watchGVR(hub, cm, c.ID, gvr)
		}
	}
}

// watchGVR runs a long-lived watch for a single GVR on a single cluster and
// fans-out events to the WebSocket hub.
func (p *IstioPlugin) watchGVR(hub *ws.Hub, cm *cluster.Manager, clusterID string, gvr schema.GroupVersionResource) {
	client, err := cm.GetClient(clusterID)
	if err != nil {
		log.Printf("istio watcher: cluster %s not available: %v", clusterID, err)
		return
	}

	watcher, err := client.DynClient.Resource(gvr).Namespace("").Watch(context.Background(), metav1.ListOptions{})
	if err != nil {
		log.Printf("istio watcher: failed to start watch for %s on cluster %s: %v", gvr.Resource, clusterID, err)
		return
	}
	defer watcher.Stop()

	log.Printf("istio watcher: watching %s on cluster %s", gvr.Resource, clusterID)

	for event := range watcher.ResultChan() {
		eventType := watchEventType(event.Type)
		if eventType == "" {
			continue
		}

		objBytes, err := json.Marshal(event.Object)
		if err != nil {
			log.Printf("istio watcher: failed to marshal event object: %v", err)
			continue
		}

		subKey := fmt.Sprintf("%s//%s", clusterID, gvr.Resource)
		hub.BroadcastToSubscribers(subKey, ws.WatchEvent{
			Cluster:   clusterID,
			Resource:  gvr.Resource,
			Namespace: "",
			Type:      eventType,
			Object:    json.RawMessage(objBytes),
		})
	}
}

// OnEnable is called when the plugin is activated.
func (p *IstioPlugin) OnEnable(_ context.Context, _ *pgxpool.Pool) error {
	log.Printf("istio plugin enabled")
	return nil
}

// OnDisable is called when the plugin is deactivated.
func (p *IstioPlugin) OnDisable(_ context.Context, _ *pgxpool.Pool) error {
	log.Printf("istio plugin disabled")
	return nil
}

// loadManifest reads manifest.json from the same directory as this Go file.
func loadManifest() (plugin.Manifest, error) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		return plugin.Manifest{}, fmt.Errorf("istio: could not determine plugin source path")
	}
	manifestPath := filepath.Join(filepath.Dir(filename), "manifest.json")

	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return plugin.Manifest{}, fmt.Errorf("istio: failed to read manifest: %w", err)
	}

	var m plugin.Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return plugin.Manifest{}, fmt.Errorf("istio: failed to parse manifest: %w", err)
	}
	return m, nil
}

// watchEventType converts a k8s watch.EventType to the string used in WatchEvent.
func watchEventType(t k8swatch.EventType) string {
	switch t {
	case k8swatch.Added:
		return "ADDED"
	case k8swatch.Modified:
		return "MODIFIED"
	case k8swatch.Deleted:
		return "DELETED"
	default:
		return ""
	}
}
