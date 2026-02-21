package cluster

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/crypto"
	"github.com/darkden-lab/argus/backend/internal/ws"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

type ClusterClient struct {
	Clientset  kubernetes.Interface
	DynClient  dynamic.Interface
	RestConfig *rest.Config
}

type Manager struct {
	pool          *pgxpool.Pool
	store         *Store
	clients       map[string]*ClusterClient
	mu            sync.RWMutex
	encryptionKey string
	agentServer   *AgentServer
}

func NewManager(pool *pgxpool.Pool, encryptionKey string) *Manager {
	return &Manager{
		pool:          pool,
		store:         NewStore(pool),
		clients:       make(map[string]*ClusterClient),
		encryptionKey: encryptionKey,
	}
}

// SetAgentServer sets the gRPC agent server reference so the manager can
// route K8s requests to agent-connected clusters.
func (m *Manager) SetAgentServer(srv *AgentServer) {
	m.agentServer = srv
}

func (m *Manager) AddCluster(ctx context.Context, name, apiServerURL string, kubeconfig []byte) (*Cluster, error) {
	encrypted, err := crypto.Encrypt(kubeconfig, m.encryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to encrypt kubeconfig: %w", err)
	}

	cluster, err := m.store.CreateCluster(ctx, name, apiServerURL, encrypted)
	if err != nil {
		return nil, err
	}

	client, err := m.buildClient(kubeconfig)
	if err != nil {
		return cluster, fmt.Errorf("cluster stored but client creation failed: %w", err)
	}

	m.mu.Lock()
	m.clients[cluster.ID] = client
	m.mu.Unlock()

	return cluster, nil
}

func (m *Manager) RemoveCluster(ctx context.Context, id string) error {
	if err := m.store.DeleteCluster(ctx, id); err != nil {
		return err
	}

	m.mu.Lock()
	delete(m.clients, id)
	m.mu.Unlock()

	return nil
}

// GetClient returns the Kubernetes client for a cluster. For kubeconfig-based
// clusters it returns the cached client. For agent-based clusters it returns
// nil (use GetClusterConnectionType + AgentServer.SendK8sRequest instead).
func (m *Manager) GetClient(clusterID string) (*ClusterClient, error) {
	m.mu.RLock()
	client, ok := m.clients[clusterID]
	m.mu.RUnlock()

	if ok {
		return client, nil
	}

	// Check if this is an agent cluster.
	if m.agentServer != nil && m.agentServer.IsAgentConnected(clusterID) {
		return nil, fmt.Errorf("cluster %s is agent-connected; use agent proxy", clusterID)
	}

	return nil, fmt.Errorf("no client found for cluster %s", clusterID)
}

// GetClusterConnectionType returns the connection type for a cluster.
func (m *Manager) GetClusterConnectionType(ctx context.Context, clusterID string) (string, error) {
	c, err := m.store.GetCluster(ctx, clusterID)
	if err != nil {
		return "", err
	}
	return c.ConnectionType, nil
}

// IsAgentCluster checks whether a cluster uses agent-based connection.
func (m *Manager) IsAgentCluster(ctx context.Context, clusterID string) bool {
	ct, err := m.GetClusterConnectionType(ctx, clusterID)
	if err != nil {
		return false
	}
	return ct == "agent"
}

func (m *Manager) ListClusters(ctx context.Context) ([]*Cluster, error) {
	return m.store.ListClusters(ctx)
}

// HealthCheck runs health checks on kubeconfig-based clusters only.
// Agent clusters are health-checked via gRPC heartbeat (Ping/Pong).
func (m *Manager) HealthCheck(ctx context.Context) {
	m.mu.RLock()
	ids := make([]string, 0, len(m.clients))
	for id := range m.clients {
		ids = append(ids, id)
	}
	m.mu.RUnlock()

	for _, id := range ids {
		m.mu.RLock()
		client, ok := m.clients[id]
		m.mu.RUnlock()
		if !ok {
			continue
		}

		_, err := client.Clientset.Discovery().ServerVersion()
		status := "connected"
		if err != nil {
			status = "unreachable"
			log.Printf("Health check failed for cluster %s: %v", id, err)
		}

		if err := m.store.UpdateClusterStatus(ctx, id, status); err != nil {
			log.Printf("Failed to update status for cluster %s: %v", id, err)
		}
	}
}

// LoadExisting loads kubeconfig-based clusters from the database on startup.
// Agent clusters are not loaded here as they connect via gRPC.
func (m *Manager) LoadExisting(ctx context.Context) error {
	rows, err := m.pool.Query(ctx,
		`SELECT id, kubeconfig_enc FROM clusters WHERE connection_type = 'kubeconfig' AND kubeconfig_enc IS NOT NULL`,
	)
	if err != nil {
		return fmt.Errorf("failed to load clusters: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		var kubeconfigEnc []byte
		if err := rows.Scan(&id, &kubeconfigEnc); err != nil {
			log.Printf("Failed to scan cluster %s: %v", id, err)
			continue
		}

		kubeconfig, err := crypto.Decrypt(kubeconfigEnc, m.encryptionKey)
		if err != nil {
			log.Printf("Failed to decrypt kubeconfig for cluster %s: %v", id, err)
			continue
		}

		client, err := m.buildClient(kubeconfig)
		if err != nil {
			log.Printf("Failed to build client for cluster %s: %v", id, err)
			continue
		}

		m.mu.Lock()
		m.clients[id] = client
		m.mu.Unlock()
	}

	return rows.Err()
}

// RegisterCRDWatcher starts a goroutine per connected kubeconfig-based cluster
// that watches the specified CRD (identified by group/version/resource) and
// broadcasts events through the WebSocket Hub. The pluginID is used to namespace
// the subscription key so clients can subscribe to plugin-specific events.
func (m *Manager) RegisterCRDWatcher(hub *ws.Hub, group, version, resource, pluginID string) {
	m.mu.RLock()
	ids := make([]string, 0, len(m.clients))
	clients := make(map[string]*ClusterClient, len(m.clients))
	for id, c := range m.clients {
		ids = append(ids, id)
		clients[id] = c
	}
	m.mu.RUnlock()

	gvr := schema.GroupVersionResource{
		Group:    group,
		Version:  version,
		Resource: resource,
	}

	for _, clusterID := range ids {
		client := clients[clusterID]
		go m.watchCRD(hub, client.DynClient, clusterID, gvr, pluginID)
	}

	log.Printf("cluster: registered CRD watcher for %s/%s/%s (plugin=%s) on %d cluster(s)",
		group, version, resource, pluginID, len(ids))
}

// watchCRD watches a single CRD on a single cluster and broadcasts events
// through the WebSocket Hub. It runs until the watch channel closes, then
// logs and exits (the watch can be re-established on reconnect).
func (m *Manager) watchCRD(hub *ws.Hub, dynClient dynamic.Interface, clusterID string, gvr schema.GroupVersionResource, pluginID string) {
	watcher, err := dynClient.Resource(gvr).Namespace("").Watch(context.Background(), metav1.ListOptions{})
	if err != nil {
		log.Printf("cluster: failed to watch %s on cluster %s (plugin=%s): %v",
			gvr.Resource, clusterID, pluginID, err)
		return
	}
	defer watcher.Stop()

	subKey := clusterID + "/" + pluginID + "." + gvr.Resource + "/"

	for event := range watcher.ResultChan() {
		objBytes, err := json.Marshal(event.Object)
		if err != nil {
			log.Printf("cluster: failed to marshal watch event: %v", err)
			continue
		}

		hub.BroadcastToSubscribers(subKey, ws.WatchEvent{
			Cluster:  clusterID,
			Resource: pluginID + "." + gvr.Resource,
			Type:     string(event.Type),
			Object:   json.RawMessage(objBytes),
		})
	}
}

func (m *Manager) buildClient(kubeconfig []byte) (*ClusterClient, error) {
	config, err := clientcmd.RESTConfigFromKubeConfig(kubeconfig)
	if err != nil {
		return nil, fmt.Errorf("failed to parse kubeconfig: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create clientset: %w", err)
	}

	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create dynamic client: %w", err)
	}

	return &ClusterClient{
		Clientset:  clientset,
		DynClient:  dynClient,
		RestConfig: config,
	}, nil
}
