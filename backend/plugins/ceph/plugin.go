package ceph

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

// Rook Ceph CRD GVRs (ceph.rook.io/v1)
var (
	gvrCephClusters         = schema.GroupVersionResource{Group: "ceph.rook.io", Version: "v1", Resource: "cephclusters"}
	gvrCephBlockPools       = schema.GroupVersionResource{Group: "ceph.rook.io", Version: "v1", Resource: "cephblockpools"}
	gvrCephFilesystems      = schema.GroupVersionResource{Group: "ceph.rook.io", Version: "v1", Resource: "cephfilesystems"}
	gvrCephObjectStores     = schema.GroupVersionResource{Group: "ceph.rook.io", Version: "v1", Resource: "cephobjectstores"}
	gvrCephObjectStoreUsers = schema.GroupVersionResource{Group: "ceph.rook.io", Version: "v1", Resource: "cephobjectstoreusers"}

	allWatchedGVRs = []schema.GroupVersionResource{
		gvrCephClusters,
		gvrCephBlockPools,
		gvrCephFilesystems,
		gvrCephObjectStores,
		gvrCephObjectStoreUsers,
	}
)

// CephPlugin implements plugin.Plugin for Rook Ceph storage CRD management.
type CephPlugin struct {
	manifest plugin.Manifest
}

// New creates a CephPlugin by loading the manifest.json embedded next to
// this source file.
func New() (*CephPlugin, error) {
	m, err := loadManifest()
	if err != nil {
		return nil, err
	}
	return &CephPlugin{manifest: m}, nil
}

// ID satisfies plugin.Plugin.
func (p *CephPlugin) ID() string { return "ceph" }

// Manifest satisfies plugin.Plugin.
func (p *CephPlugin) Manifest() plugin.Manifest { return p.manifest }

// RegisterRoutes wires all Ceph CRUD endpoints onto the provided router.
func (p *CephPlugin) RegisterRoutes(r *mux.Router, cm *cluster.Manager) {
	h := newHandlers(cm)

	cl := r.PathPrefix("/api/plugins/ceph/clusters").Subrouter()
	cl.HandleFunc("", h.ListCephClusters).Methods("GET")
	cl.HandleFunc("", h.CreateCephCluster).Methods("POST")
	cl.HandleFunc("/{name}", h.GetCephCluster).Methods("GET")
	cl.HandleFunc("/{name}", h.UpdateCephCluster).Methods("PUT")
	cl.HandleFunc("/{name}", h.DeleteCephCluster).Methods("DELETE")

	bp := r.PathPrefix("/api/plugins/ceph/blockpools").Subrouter()
	bp.HandleFunc("", h.ListCephBlockPools).Methods("GET")
	bp.HandleFunc("", h.CreateCephBlockPool).Methods("POST")
	bp.HandleFunc("/{name}", h.GetCephBlockPool).Methods("GET")
	bp.HandleFunc("/{name}", h.UpdateCephBlockPool).Methods("PUT")
	bp.HandleFunc("/{name}", h.DeleteCephBlockPool).Methods("DELETE")

	fs := r.PathPrefix("/api/plugins/ceph/filesystems").Subrouter()
	fs.HandleFunc("", h.ListCephFilesystems).Methods("GET")
	fs.HandleFunc("", h.CreateCephFilesystem).Methods("POST")
	fs.HandleFunc("/{name}", h.GetCephFilesystem).Methods("GET")
	fs.HandleFunc("/{name}", h.UpdateCephFilesystem).Methods("PUT")
	fs.HandleFunc("/{name}", h.DeleteCephFilesystem).Methods("DELETE")

	os := r.PathPrefix("/api/plugins/ceph/objectstores").Subrouter()
	os.HandleFunc("", h.ListCephObjectStores).Methods("GET")
	os.HandleFunc("", h.CreateCephObjectStore).Methods("POST")
	os.HandleFunc("/{name}", h.GetCephObjectStore).Methods("GET")
	os.HandleFunc("/{name}", h.UpdateCephObjectStore).Methods("PUT")
	os.HandleFunc("/{name}", h.DeleteCephObjectStore).Methods("DELETE")

	ou := r.PathPrefix("/api/plugins/ceph/objectstoreusers").Subrouter()
	ou.HandleFunc("", h.ListCephObjectStoreUsers).Methods("GET")
	ou.HandleFunc("", h.CreateCephObjectStoreUser).Methods("POST")
	ou.HandleFunc("/{name}", h.DeleteCephObjectStoreUser).Methods("DELETE")
}

// RegisterWatchers starts a background watch goroutine for each Ceph CRD on
// every cluster currently known to the ClusterManager.
func (p *CephPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
	clusters, err := cm.ListClusters(context.Background())
	if err != nil {
		log.Printf("ceph: failed to list clusters for watchers: %v", err)
		return
	}

	for _, c := range clusters {
		for _, gvr := range allWatchedGVRs {
			go p.watchGVR(hub, cm, c.ID, gvr)
		}
	}
}

func (p *CephPlugin) watchGVR(hub *ws.Hub, cm *cluster.Manager, clusterID string, gvr schema.GroupVersionResource) {
	client, err := cm.GetClient(clusterID)
	if err != nil {
		log.Printf("ceph watcher: cluster %s not available: %v", clusterID, err)
		return
	}

	watcher, err := client.DynClient.Resource(gvr).Namespace("").Watch(context.Background(), metav1.ListOptions{})
	if err != nil {
		log.Printf("ceph watcher: failed to start watch for %s on cluster %s: %v", gvr.Resource, clusterID, err)
		return
	}
	defer watcher.Stop()

	log.Printf("ceph watcher: watching %s on cluster %s", gvr.Resource, clusterID)

	for event := range watcher.ResultChan() {
		eventType := watchEventType(event.Type)
		if eventType == "" {
			continue
		}

		objBytes, err := json.Marshal(event.Object)
		if err != nil {
			log.Printf("ceph watcher: failed to marshal event object: %v", err)
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
func (p *CephPlugin) OnEnable(_ context.Context, _ *pgxpool.Pool) error {
	log.Printf("ceph plugin enabled")
	return nil
}

// OnDisable is called when the plugin is deactivated.
func (p *CephPlugin) OnDisable(_ context.Context, _ *pgxpool.Pool) error {
	log.Printf("ceph plugin disabled")
	return nil
}

func loadManifest() (plugin.Manifest, error) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		return plugin.Manifest{}, fmt.Errorf("ceph: could not determine plugin source path")
	}
	manifestPath := filepath.Join(filepath.Dir(filename), "manifest.json")

	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return plugin.Manifest{}, fmt.Errorf("ceph: failed to read manifest: %w", err)
	}

	var m plugin.Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return plugin.Manifest{}, fmt.Errorf("ceph: failed to parse manifest: %w", err)
	}
	return m, nil
}

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
