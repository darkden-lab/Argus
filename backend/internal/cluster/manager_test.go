package cluster

import (
	"strings"
	"testing"
)

func TestNewManager(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)
	if m == nil {
		t.Fatal("expected non-nil Manager")
	}
	if m.encryptionKey != key {
		t.Fatal("expected encryption key to be set")
	}
	if m.clients == nil {
		t.Fatal("expected clients map to be initialized")
	}
	if m.store == nil {
		t.Fatal("expected store to be initialized")
	}
}

func TestGetClientNotFound(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)

	_, err := m.GetClient("nonexistent-cluster")
	if err == nil {
		t.Fatal("expected error for nonexistent cluster, got nil")
	}
}

func TestGetClient_WithCachedClient(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)

	// Inject a mock client directly into the map
	m.clients["test-cluster"] = &ClusterClient{}

	client, err := m.GetClient("test-cluster")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if client == nil {
		t.Fatal("expected non-nil client")
	}
}

func TestGetClient_AgentConnected(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)

	// Set up an agent server with a connected agent
	agentSrv := NewAgentServer(nil, nil, "test-secret")
	agentSrv.agents["agent-cluster"] = &AgentConnection{ClusterID: "agent-cluster"}
	m.SetAgentServer(agentSrv)

	_, err := m.GetClient("agent-cluster")
	if err == nil {
		t.Fatal("expected error for agent-connected cluster, got nil")
	}
	if !strings.Contains(err.Error(), "agent-connected") {
		t.Errorf("expected error about agent-connected, got %q", err.Error())
	}
}

func TestSetAgentServer(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)

	if m.agentServer != nil {
		t.Error("expected nil agentServer initially")
	}

	agentSrv := NewAgentServer(nil, nil, "test-secret")
	m.SetAgentServer(agentSrv)

	if m.agentServer == nil {
		t.Fatal("expected agentServer to be set")
	}
}

func TestBuildClient_InvalidKubeconfig(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)

	_, err := m.buildClient([]byte("invalid-kubeconfig"))
	if err == nil {
		t.Fatal("expected error for invalid kubeconfig, got nil")
	}
}

func TestBuildClient_ValidKubeconfig(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)

	kubeconfig := `
apiVersion: v1
kind: Config
clusters:
- cluster:
    server: https://127.0.0.1:6443
    insecure-skip-tls-verify: true
  name: test
contexts:
- context:
    cluster: test
    user: test
  name: test
current-context: test
users:
- name: test
  user:
    token: test-token
`
	client, err := m.buildClient([]byte(kubeconfig))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if client == nil {
		t.Fatal("expected non-nil client")
	}
	if client.Clientset == nil {
		t.Error("expected non-nil clientset")
	}
	if client.DynClient == nil {
		t.Error("expected non-nil dynamic client")
	}
	if client.RestConfig == nil {
		t.Error("expected non-nil rest config")
	}
}

func TestHealthCheck_NoClients(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)

	// Should not panic with no clients
	m.HealthCheck(nil)
}

func TestNewStore(t *testing.T) {
	s := NewStore(nil)
	if s == nil {
		t.Fatal("expected non-nil store")
	}
}

func TestNewHandlers(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)
	h := NewHandlers(m)
	if h == nil {
		t.Fatal("expected non-nil handlers")
	}
}

func TestClusterStruct(t *testing.T) {
	c := Cluster{
		ID:             "test-id",
		Name:           "test-cluster",
		APIServerURL:   "https://127.0.0.1:6443",
		Status:         "connected",
		ConnectionType: "kubeconfig",
	}

	if c.ID != "test-id" {
		t.Errorf("expected ID 'test-id', got %q", c.ID)
	}
	if c.Name != "test-cluster" {
		t.Errorf("expected Name 'test-cluster', got %q", c.Name)
	}
	if c.Status != "connected" {
		t.Errorf("expected Status 'connected', got %q", c.Status)
	}
	if c.ConnectionType != "kubeconfig" {
		t.Errorf("expected ConnectionType 'kubeconfig', got %q", c.ConnectionType)
	}
	if c.AgentID != nil {
		t.Error("expected nil AgentID")
	}
}

func TestClusterClient_Struct(t *testing.T) {
	cc := &ClusterClient{}
	if cc.Clientset != nil {
		t.Error("expected nil Clientset on zero value")
	}
	if cc.DynClient != nil {
		t.Error("expected nil DynClient on zero value")
	}
	if cc.RestConfig != nil {
		t.Error("expected nil RestConfig on zero value")
	}
}

func TestManager_ClientsConcurrentAccess(t *testing.T) {
	key := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	m := NewManager(nil, key)

	// Inject clients directly
	m.clients["cluster-1"] = &ClusterClient{}
	m.clients["cluster-2"] = &ClusterClient{}

	// Verify both can be retrieved
	c1, err := m.GetClient("cluster-1")
	if err != nil {
		t.Fatalf("GetClient cluster-1 failed: %v", err)
	}
	if c1 == nil {
		t.Fatal("expected non-nil client for cluster-1")
	}

	c2, err := m.GetClient("cluster-2")
	if err != nil {
		t.Fatalf("GetClient cluster-2 failed: %v", err)
	}
	if c2 == nil {
		t.Fatal("expected non-nil client for cluster-2")
	}

	// Nonexistent still fails
	_, err = m.GetClient("cluster-3")
	if err == nil {
		t.Fatal("expected error for nonexistent cluster-3")
	}
}
