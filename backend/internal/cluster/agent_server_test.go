package cluster

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestHashToken(t *testing.T) {
	h1 := hashToken("test-token-123")
	h2 := hashToken("test-token-123")
	h3 := hashToken("different-token")

	if h1 != h2 {
		t.Error("same input should produce same hash")
	}
	if h1 == h3 {
		t.Error("different input should produce different hash")
	}
	if len(h1) != 64 {
		t.Errorf("expected SHA-256 hex length 64, got %d", len(h1))
	}
}

func TestGenerateAndValidateAgentToken(t *testing.T) {
	secret := "test-secret-key-for-agents"
	server := &AgentServer{
		jwtSecret: []byte(secret),
	}

	clusterID := "cluster-uuid-123"
	agentID := "agent-uuid-456"

	token, err := server.generateAgentToken(clusterID, agentID)
	if err != nil {
		t.Fatalf("generateAgentToken failed: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	// Validate the token.
	claims, err := server.validateAgentToken(token)
	if err != nil {
		t.Fatalf("validateAgentToken failed: %v", err)
	}
	if claims.ClusterID != clusterID {
		t.Errorf("expected cluster_id %s, got %s", clusterID, claims.ClusterID)
	}
	if claims.AgentID != agentID {
		t.Errorf("expected agent_id %s, got %s", agentID, claims.AgentID)
	}
	if claims.Subject != agentID {
		t.Errorf("expected subject %s, got %s", agentID, claims.Subject)
	}
}

func TestValidateAgentToken_Invalid(t *testing.T) {
	server := &AgentServer{
		jwtSecret: []byte("secret-a"),
	}

	// Token signed with a different secret should fail.
	wrongServer := &AgentServer{
		jwtSecret: []byte("secret-b"),
	}
	token, _ := wrongServer.generateAgentToken("c1", "a1")

	_, err := server.validateAgentToken(token)
	if err == nil {
		t.Error("expected error validating token signed with wrong secret")
	}
}

func TestValidateAgentToken_Expired(t *testing.T) {
	secret := "test-secret"
	server := &AgentServer{
		jwtSecret: []byte(secret),
	}

	// Create an expired token manually.
	now := time.Now().Add(-2 * time.Hour)
	claims := AgentClaims{
		ClusterID: "c1",
		AgentID:   "a1",
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   "a1",
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(1 * time.Hour)), // expired 1h ago
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, _ := token.SignedString([]byte(secret))

	_, err := server.validateAgentToken(tokenStr)
	if err == nil {
		t.Error("expected error validating expired token")
	}
}

func TestNewAgentServer(t *testing.T) {
	server := NewAgentServer(nil, nil, "test-secret")
	if server == nil {
		t.Fatal("expected non-nil server")
	}
	if server.agents == nil {
		t.Error("expected agents map to be initialized")
	}
}

func TestIsAgentConnected(t *testing.T) {
	server := NewAgentServer(nil, nil, "test-secret")

	if server.IsAgentConnected("nonexistent") {
		t.Error("expected false for nonexistent cluster")
	}

	server.agents["test-cluster"] = &AgentConnection{ClusterID: "test-cluster"}
	if !server.IsAgentConnected("test-cluster") {
		t.Error("expected true for connected cluster")
	}
}
