package keda

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

// KEDA CRD GVRs (keda.sh/v1alpha1)
var (
	gvrScaledObjects               = schema.GroupVersionResource{Group: "keda.sh", Version: "v1alpha1", Resource: "scaledobjects"}
	gvrScaledJobs                  = schema.GroupVersionResource{Group: "keda.sh", Version: "v1alpha1", Resource: "scaledjobs"}
	gvrTriggerAuthentications      = schema.GroupVersionResource{Group: "keda.sh", Version: "v1alpha1", Resource: "triggerauthentications"}
	gvrClusterTriggerAuthentications = schema.GroupVersionResource{Group: "keda.sh", Version: "v1alpha1", Resource: "clustertriggerauthentications"}

	// namespacedGVRs are watched per-namespace; clusterGVRs are cluster-scoped.
	namespacedGVRs = []schema.GroupVersionResource{
		gvrScaledObjects,
		gvrScaledJobs,
		gvrTriggerAuthentications,
	}
	clusterGVRs = []schema.GroupVersionResource{
		gvrClusterTriggerAuthentications,
	}
)

// KedaPlugin implements plugin.Plugin for KEDA CRD management.
type KedaPlugin struct {
	manifest plugin.Manifest
}

// New creates a KedaPlugin by loading manifest.json from the plugin directory.
func New() (*KedaPlugin, error) {
	m, err := loadManifest()
	if err != nil {
		return nil, err
	}
	return &KedaPlugin{manifest: m}, nil
}

func (p *KedaPlugin) ID() string                { return "keda" }
func (p *KedaPlugin) Manifest() plugin.Manifest { return p.manifest }

// RegisterRoutes wires all KEDA CRUD endpoints.
func (p *KedaPlugin) RegisterRoutes(r *mux.Router, cm *cluster.Manager) {
	h := newHandlers(cm)

	// ScaledObjects
	so := r.PathPrefix("/api/plugins/keda/scaledobjects").Subrouter()
	so.HandleFunc("", h.ListScaledObjects).Methods("GET")
	so.HandleFunc("", h.CreateScaledObject).Methods("POST")
	so.HandleFunc("/{name}", h.GetScaledObject).Methods("GET")
	so.HandleFunc("/{name}", h.UpdateScaledObject).Methods("PUT")
	so.HandleFunc("/{name}", h.DeleteScaledObject).Methods("DELETE")

	// ScaledJobs
	sj := r.PathPrefix("/api/plugins/keda/scaledjobs").Subrouter()
	sj.HandleFunc("", h.ListScaledJobs).Methods("GET")
	sj.HandleFunc("", h.CreateScaledJob).Methods("POST")
	sj.HandleFunc("/{name}", h.GetScaledJob).Methods("GET")
	sj.HandleFunc("/{name}", h.UpdateScaledJob).Methods("PUT")
	sj.HandleFunc("/{name}", h.DeleteScaledJob).Methods("DELETE")

	// TriggerAuthentications (namespaced)
	ta := r.PathPrefix("/api/plugins/keda/triggerauthentications").Subrouter()
	ta.HandleFunc("", h.ListTriggerAuthentications).Methods("GET")
	ta.HandleFunc("", h.CreateTriggerAuthentication).Methods("POST")
	ta.HandleFunc("/{name}", h.GetTriggerAuthentication).Methods("GET")
	ta.HandleFunc("/{name}", h.DeleteTriggerAuthentication).Methods("DELETE")

	// ClusterTriggerAuthentications (cluster-scoped)
	cta := r.PathPrefix("/api/plugins/keda/clustertriggerauthentications").Subrouter()
	cta.HandleFunc("", h.ListClusterTriggerAuthentications).Methods("GET")
	cta.HandleFunc("/{name}", h.GetClusterTriggerAuthentication).Methods("GET")
	cta.HandleFunc("/{name}", h.DeleteClusterTriggerAuthentication).Methods("DELETE")
}

// RegisterWatchers starts background watch goroutines for all KEDA CRDs on
// every known cluster and broadcasts events to the WebSocket hub.
func (p *KedaPlugin) RegisterWatchers(hub *ws.Hub, cm *cluster.Manager) {
	clusters, err := cm.ListClusters(context.Background())
	if err != nil {
		log.Printf("keda: failed to list clusters for watchers: %v", err)
		return
	}

	for _, c := range clusters {
		for _, gvr := range namespacedGVRs {
			go p.watchGVR(hub, cm, c.ID, gvr, "")
		}
		for _, gvr := range clusterGVRs {
			// Cluster-scoped resources: watch with empty namespace (all namespaces)
			go p.watchGVR(hub, cm, c.ID, gvr, "")
		}
	}
}

func (p *KedaPlugin) watchGVR(hub *ws.Hub, cm *cluster.Manager, clusterID string, gvr schema.GroupVersionResource, namespace string) {
	client, err := cm.GetClient(clusterID)
	if err != nil {
		log.Printf("keda watcher: cluster %s not available: %v", clusterID, err)
		return
	}

	watcher, err := client.DynClient.Resource(gvr).Namespace(namespace).Watch(context.Background(), metav1.ListOptions{})
	if err != nil {
		log.Printf("keda watcher: failed to start watch for %s on cluster %s: %v", gvr.Resource, clusterID, err)
		return
	}
	defer watcher.Stop()

	log.Printf("keda watcher: watching %s on cluster %s", gvr.Resource, clusterID)

	for event := range watcher.ResultChan() {
		eventType := watchEventType(event.Type)
		if eventType == "" {
			continue
		}

		objBytes, err := json.Marshal(event.Object)
		if err != nil {
			log.Printf("keda watcher: failed to marshal event object: %v", err)
			continue
		}

		subKey := fmt.Sprintf("%s//%s", clusterID, gvr.Resource)
		hub.BroadcastToSubscribers(subKey, ws.WatchEvent{
			Cluster:   clusterID,
			Resource:  gvr.Resource,
			Namespace: namespace,
			Type:      eventType,
			Object:    json.RawMessage(objBytes),
		})
	}
}

func (p *KedaPlugin) OnEnable(_ context.Context, _ *pgxpool.Pool) error {
	log.Printf("keda plugin enabled")
	return nil
}

func (p *KedaPlugin) OnDisable(_ context.Context, _ *pgxpool.Pool) error {
	log.Printf("keda plugin disabled")
	return nil
}

func loadManifest() (plugin.Manifest, error) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		return plugin.Manifest{}, fmt.Errorf("keda: could not determine plugin source path")
	}
	manifestPath := filepath.Join(filepath.Dir(filename), "manifest.json")

	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return plugin.Manifest{}, fmt.Errorf("keda: failed to read manifest: %w", err)
	}

	var m plugin.Manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return plugin.Manifest{}, fmt.Errorf("keda: failed to parse manifest: %w", err)
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
