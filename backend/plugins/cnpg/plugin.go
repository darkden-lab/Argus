package cnpg

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

// CloudNativePG CRD GVRs (postgresql.cnpg.io/v1)
var (
	gvrClusters         = schema.GroupVersionResource{Group: "postgresql.cnpg.io", Version: "v1", Resource: "clusters"}
	gvrBackups          = schema.GroupVersionResource{Group: "postgresql.cnpg.io", Version: "v1", Resource: "backups"}
	gvrScheduledBackups = schema.GroupVersionResource{Group: "postgresql.cnpg.io", Version: "v1", Resource: "scheduledbackups"}
	gvrPoolers          = schema.GroupVersionResource{Group: "postgresql.cnpg.io", Version: "v1", Resource: "poolers"}

	allWatchedGVRs = []schema.GroupVersionResource{
		gvrClusters,
		gvrBackups,
		gvrScheduledBackups,
		gvrPoolers,
	}
)

// CnpgPlugin implements plugin.Plugin for CloudNativePG CRD management.
type CnpgPlugin struct {
	manifest plugin.Manifest
}

// New creates a CnpgPlugin by loading the manifest.json embedded next to
// this source file.
func New() (*CnpgPlugin, error) {
	m, err := loadManifest()
	if err != nil {
		return nil, err
	}
	return &CnpgPlugin{manifest: m}, nil
}

// ID satisfies plugin.Plugin.
func (p *CnpgPlugin) ID() string { return "cnpg" }

// Manifest satisfies plugin.Plugin.
func (p *CnpgPlugin) Manifest() plugin.Manifest { return p.manifest }

// RegisterRoutes wires all CNPG CRUD endpoints onto the provided router.
func (p *CnpgPlugin) RegisterRoutes(r *mux.Router, cm *cluster.Manager) {
	h := newHandlers(cm)

	cl := r.PathPrefix("/api/plugins/cnpg/clusters").Subrouter()
	cl.HandleFunc("", h.ListClusters).Methods("GET")
	cl.HandleFunc("", h.CreateCluster).Methods("POST")
	cl.HandleFunc("/{name}", h.GetCluster).Methods("GET")
	cl.HandleFunc("/{name}", h.UpdateCluster).Methods("PUT")
	cl.HandleFunc("/{name}", h.DeleteCluster).Methods("DELETE")

	bk := r.PathPrefix("/api/plugins/cnpg/backups").Subrouter()
	bk.HandleFunc("", h.ListBackups).Methods("GET")
	bk.HandleFunc("", h.CreateBackup).Methods("POST")
	bk.HandleFunc("/{name}", h.DeleteBackup).Methods("DELETE")

	sb := r.PathPrefix("/api/plugins/cnpg/scheduledbackups").Subrouter()
	sb.HandleFunc("", h.ListScheduledBackups).Methods("GET")
	sb.HandleFunc("", h.CreateScheduledBackup).Methods("POST")
	sb.HandleFunc("/{name}", h.DeleteScheduledBackup).Methods("DELETE")

	pl := r.PathPrefix("/api/plugins/cnpg/poolers").Subrouter()
	pl.HandleFunc("", h.ListPoolers).Methods("GET")
	pl.HandleFunc("", h.CreatePooler).Methods("POST")
	pl.HandleFunc("/{name}", h.DeletePooler).Methods("DELETE")
}

// RegisterWatchers starts a background watch goroutine for each CNPG CRD on
// every cluster currently known to the ClusterManager, and broadcasts events
// to WebSocket subscribers.
func (p *CnpgPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
	clusters, err := cm.ListClusters(context.Background())
	if err != nil {
		log.Printf("cnpg: failed to list clusters for watchers: %v", err)
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
func (p *CnpgPlugin) watchGVR(hub *ws.Hub, cm *cluster.Manager, clusterID string, gvr schema.GroupVersionResource) {
	client, err := cm.GetClient(clusterID)
	if err != nil {
		log.Printf("cnpg watcher: cluster %s not available: %v", clusterID, err)
		return
	}

	watcher, err := client.DynClient.Resource(gvr).Namespace("").Watch(context.Background(), metav1.ListOptions{})
	if err != nil {
		log.Printf("cnpg watcher: failed to start watch for %s on cluster %s: %v", gvr.Resource, clusterID, err)
		return
	}
	defer watcher.Stop()

	log.Printf("cnpg watcher: watching %s on cluster %s", gvr.Resource, clusterID)

	for event := range watcher.ResultChan() {
		eventType := watchEventType(event.Type)
		if eventType == "" {
			continue
		}

		objBytes, err := json.Marshal(event.Object)
		if err != nil {
			log.Printf("cnpg watcher: failed to marshal event object: %v", err)
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
func (p *CnpgPlugin) OnEnable(_ context.Context, _ *pgxpool.Pool) error {
	log.Printf("cnpg plugin enabled")
	return nil
}

// OnDisable is called when the plugin is deactivated.
func (p *CnpgPlugin) OnDisable(_ context.Context, _ *pgxpool.Pool) error {
	log.Printf("cnpg plugin disabled")
	return nil
}

// loadManifest reads manifest.json from the same directory as this Go file.
func loadManifest() (plugin.Manifest, error) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		return plugin.Manifest{}, fmt.Errorf("cnpg: could not determine plugin source path")
	}
	manifestPath := filepath.Join(filepath.Dir(filename), "manifest.json")

	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return plugin.Manifest{}, fmt.Errorf("cnpg: failed to read manifest: %w", err)
	}

	var m plugin.Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return plugin.Manifest{}, fmt.Errorf("cnpg: failed to parse manifest: %w", err)
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
