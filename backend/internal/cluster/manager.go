package cluster

import (
	"context"
	"fmt"
	"log"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/k8s-dashboard/backend/internal/crypto"
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
}

func NewManager(pool *pgxpool.Pool, encryptionKey string) *Manager {
	return &Manager{
		pool:          pool,
		store:         NewStore(pool),
		clients:       make(map[string]*ClusterClient),
		encryptionKey: encryptionKey,
	}
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

func (m *Manager) GetClient(clusterID string) (*ClusterClient, error) {
	m.mu.RLock()
	client, ok := m.clients[clusterID]
	m.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("no client found for cluster %s", clusterID)
	}
	return client, nil
}

func (m *Manager) ListClusters(ctx context.Context) ([]*Cluster, error) {
	return m.store.ListClusters(ctx)
}

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

func (m *Manager) LoadExisting(ctx context.Context) error {
	rows, err := m.pool.Query(ctx,
		`SELECT id, kubeconfig_enc FROM clusters`,
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
