package mariadb

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/plugin"
	"github.com/darkden-lab/argus/backend/internal/ws"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	k8swatch "k8s.io/apimachinery/pkg/watch"
)

//go:embed manifest.json
var manifestJSON []byte

// MariaDB Operator CRD GVRs (k8s.mariadb.com/v1alpha1)
var (
	gvrMariaDBs    = schema.GroupVersionResource{Group: "k8s.mariadb.com", Version: "v1alpha1", Resource: "mariadbs"}
	gvrBackups     = schema.GroupVersionResource{Group: "k8s.mariadb.com", Version: "v1alpha1", Resource: "backups"}
	gvrRestores    = schema.GroupVersionResource{Group: "k8s.mariadb.com", Version: "v1alpha1", Resource: "restores"}
	gvrConnections = schema.GroupVersionResource{Group: "k8s.mariadb.com", Version: "v1alpha1", Resource: "connections"}
	gvrDatabases   = schema.GroupVersionResource{Group: "k8s.mariadb.com", Version: "v1alpha1", Resource: "databases"}
	gvrUsers       = schema.GroupVersionResource{Group: "k8s.mariadb.com", Version: "v1alpha1", Resource: "users"}
	gvrGrants      = schema.GroupVersionResource{Group: "k8s.mariadb.com", Version: "v1alpha1", Resource: "grants"}

	allWatchedGVRs = []schema.GroupVersionResource{
		gvrMariaDBs,
		gvrBackups,
		gvrRestores,
		gvrConnections,
		gvrDatabases,
		gvrUsers,
		gvrGrants,
	}
)

// MariaDBPlugin implements plugin.Plugin for MariaDB Operator CRD management.
type MariaDBPlugin struct {
	manifest plugin.Manifest
}

// New creates a MariaDBPlugin by loading the manifest.json embedded next to
// this source file.
func New() (*MariaDBPlugin, error) {
	m, err := loadManifest()
	if err != nil {
		return nil, err
	}
	return &MariaDBPlugin{manifest: m}, nil
}

// ID satisfies plugin.Plugin.
func (p *MariaDBPlugin) ID() string { return "mariadb" }

// Manifest satisfies plugin.Plugin.
func (p *MariaDBPlugin) Manifest() plugin.Manifest { return p.manifest }

// RegisterRoutes wires all MariaDB CRUD endpoints onto the provided router.
func (p *MariaDBPlugin) RegisterRoutes(r *mux.Router, cm *cluster.Manager) {
	h := newHandlers(cm)

	inst := r.PathPrefix("/api/plugins/mariadb/instances").Subrouter()
	inst.HandleFunc("", h.ListMariaDBs).Methods("GET")
	inst.HandleFunc("", h.CreateMariaDB).Methods("POST")
	inst.HandleFunc("/{name}", h.GetMariaDB).Methods("GET")
	inst.HandleFunc("/{name}", h.UpdateMariaDB).Methods("PUT")
	inst.HandleFunc("/{name}", h.DeleteMariaDB).Methods("DELETE")

	bk := r.PathPrefix("/api/plugins/mariadb/backups").Subrouter()
	bk.HandleFunc("", h.ListBackups).Methods("GET")
	bk.HandleFunc("", h.CreateBackup).Methods("POST")
	bk.HandleFunc("/{name}", h.DeleteBackup).Methods("DELETE")

	rs := r.PathPrefix("/api/plugins/mariadb/restores").Subrouter()
	rs.HandleFunc("", h.ListRestores).Methods("GET")
	rs.HandleFunc("", h.CreateRestore).Methods("POST")
	rs.HandleFunc("/{name}", h.DeleteRestore).Methods("DELETE")

	cn := r.PathPrefix("/api/plugins/mariadb/connections").Subrouter()
	cn.HandleFunc("", h.ListConnections).Methods("GET")
	cn.HandleFunc("", h.CreateConnection).Methods("POST")
	cn.HandleFunc("/{name}", h.DeleteConnection).Methods("DELETE")

	db := r.PathPrefix("/api/plugins/mariadb/databases").Subrouter()
	db.HandleFunc("", h.ListDatabases).Methods("GET")
	db.HandleFunc("", h.CreateDatabase).Methods("POST")
	db.HandleFunc("/{name}", h.DeleteDatabase).Methods("DELETE")

	us := r.PathPrefix("/api/plugins/mariadb/users").Subrouter()
	us.HandleFunc("", h.ListUsers).Methods("GET")
	us.HandleFunc("", h.CreateUser).Methods("POST")
	us.HandleFunc("/{name}", h.DeleteUser).Methods("DELETE")

	gr := r.PathPrefix("/api/plugins/mariadb/grants").Subrouter()
	gr.HandleFunc("", h.ListGrants).Methods("GET")
	gr.HandleFunc("", h.CreateGrant).Methods("POST")
	gr.HandleFunc("/{name}", h.DeleteGrant).Methods("DELETE")
}

// RegisterWatchers starts a background watch goroutine for each MariaDB CRD on
// every cluster currently known to the ClusterManager, and broadcasts events
// to WebSocket subscribers.
func (p *MariaDBPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
	clusters, err := cm.ListClusters(context.Background())
	if err != nil {
		log.Printf("mariadb: failed to list clusters for watchers: %v", err)
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
func (p *MariaDBPlugin) watchGVR(hub *ws.Hub, cm *cluster.Manager, clusterID string, gvr schema.GroupVersionResource) {
	client, err := cm.GetClient(clusterID)
	if err != nil {
		log.Printf("mariadb watcher: cluster %s not available: %v", clusterID, err)
		return
	}

	watcher, err := client.DynClient.Resource(gvr).Namespace("").Watch(context.Background(), metav1.ListOptions{})
	if err != nil {
		log.Printf("mariadb watcher: failed to start watch for %s on cluster %s: %v", gvr.Resource, clusterID, err)
		return
	}
	defer watcher.Stop()

	log.Printf("mariadb watcher: watching %s on cluster %s", gvr.Resource, clusterID)

	for event := range watcher.ResultChan() {
		eventType := watchEventType(event.Type)
		if eventType == "" {
			continue
		}

		objBytes, err := json.Marshal(event.Object)
		if err != nil {
			log.Printf("mariadb watcher: failed to marshal event object: %v", err)
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
func (p *MariaDBPlugin) OnEnable(_ context.Context, _ *pgxpool.Pool) error {
	log.Printf("mariadb plugin enabled")
	return nil
}

// OnDisable is called when the plugin is deactivated.
func (p *MariaDBPlugin) OnDisable(_ context.Context, _ *pgxpool.Pool) error {
	log.Printf("mariadb plugin disabled")
	return nil
}

// loadManifest parses the embedded manifest.json.
func loadManifest() (plugin.Manifest, error) {
	var m plugin.Manifest
	if err := json.Unmarshal(manifestJSON, &m); err != nil {
		return plugin.Manifest{}, fmt.Errorf("mariadb: failed to parse manifest: %w", err)
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
