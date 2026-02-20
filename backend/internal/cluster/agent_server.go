package cluster

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/k8s-dashboard/backend/internal/agentpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// AgentConnection represents a live agent connected via gRPC stream.
type AgentConnection struct {
	ClusterID string
	Stream    grpc.BidiStreamingServer[agentpb.AgentMessage, agentpb.DashboardMessage]
	// pending tracks in-flight K8s requests awaiting a response from the agent.
	pending map[string]chan *agentpb.K8SResponse
	mu      sync.Mutex
	cancel  context.CancelFunc
}

// AgentServer implements the ClusterAgent gRPC service.
type AgentServer struct {
	agentpb.UnimplementedClusterAgentServer
	pool       *pgxpool.Pool
	store      *Store
	jwtSecret  []byte
	agents     map[string]*AgentConnection // clusterID -> connection
	mu         sync.RWMutex
}

func NewAgentServer(pool *pgxpool.Pool, store *Store, jwtSecret string) *AgentServer {
	return &AgentServer{
		pool:      pool,
		store:     store,
		jwtSecret: []byte(jwtSecret),
		agents:    make(map[string]*AgentConnection),
	}
}

// Register validates a one-time registration token, creates the cluster entry,
// and returns permanent agent credentials.
func (s *AgentServer) Register(ctx context.Context, req *agentpb.RegisterRequest) (*agentpb.RegisterResponse, error) {
	if req.Token == "" {
		return nil, status.Error(codes.InvalidArgument, "token is required")
	}
	if req.ClusterName == "" {
		return nil, status.Error(codes.InvalidArgument, "cluster_name is required")
	}

	// Hash the token and look it up.
	tokenHash := hashToken(req.Token)

	var tokenID, createdBy, permissions string
	var used bool
	var expiresAt time.Time
	err := s.pool.QueryRow(ctx,
		`SELECT id, created_by, permissions, used, expires_at
		 FROM agent_tokens WHERE token_hash = $1`, tokenHash,
	).Scan(&tokenID, &createdBy, &permissions, &used, &expiresAt)
	if err != nil {
		return nil, status.Error(codes.Unauthenticated, "invalid registration token")
	}

	if used {
		return nil, status.Error(codes.PermissionDenied, "token already used")
	}
	if time.Now().After(expiresAt) {
		return nil, status.Error(codes.PermissionDenied, "token expired")
	}

	// Create the cluster entry with connection_type = 'agent'.
	agentID := uuid.New().String()
	var clusterID string
	err = s.pool.QueryRow(ctx,
		`INSERT INTO clusters (name, api_server_url, connection_type, agent_id, status)
		 VALUES ($1, '', 'agent', $2, 'connected')
		 RETURNING id`,
		req.ClusterName, agentID,
	).Scan(&clusterID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create cluster: %v", err)
	}

	// Mark the token as used.
	_, err = s.pool.Exec(ctx,
		`UPDATE agent_tokens SET used = true, used_at = NOW(), cluster_id = $2 WHERE id = $1`,
		tokenID, clusterID,
	)
	if err != nil {
		log.Printf("WARNING: failed to mark agent token as used: %v", err)
	}

	// Generate a permanent agent JWT.
	agentToken, err := s.generateAgentToken(clusterID, agentID)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to generate agent token: %v", err)
	}

	log.Printf("Agent registered: cluster=%s name=%s", clusterID, req.ClusterName)

	return &agentpb.RegisterResponse{
		ClusterId:  clusterID,
		AgentToken: agentToken,
	}, nil
}

// Stream handles the bidirectional stream between dashboard and agent.
// The agent authenticates via metadata "authorization" bearing an agent JWT.
func (s *AgentServer) Stream(stream grpc.BidiStreamingServer[agentpb.AgentMessage, agentpb.DashboardMessage]) error {
	// Extract and validate the agent token from metadata.
	md, ok := metadata.FromIncomingContext(stream.Context())
	if !ok {
		return status.Error(codes.Unauthenticated, "missing metadata")
	}

	authValues := md.Get("authorization")
	if len(authValues) == 0 {
		return status.Error(codes.Unauthenticated, "missing authorization")
	}

	tokenStr := authValues[0]
	if len(tokenStr) > 7 && tokenStr[:7] == "Bearer " {
		tokenStr = tokenStr[7:]
	}

	claims, err := s.validateAgentToken(tokenStr)
	if err != nil {
		return status.Errorf(codes.Unauthenticated, "invalid agent token: %v", err)
	}

	clusterID := claims.ClusterID

	// Set up the connection.
	ctx, cancel := context.WithCancel(stream.Context())
	conn := &AgentConnection{
		ClusterID: clusterID,
		Stream:    stream,
		pending:   make(map[string]chan *agentpb.K8SResponse),
		cancel:    cancel,
	}

	// Register the connection.
	s.mu.Lock()
	old, existed := s.agents[clusterID]
	s.agents[clusterID] = conn
	s.mu.Unlock()

	if existed && old.cancel != nil {
		old.cancel()
	}

	// Update cluster status.
	_ = s.store.UpdateClusterStatus(ctx, clusterID, "connected")
	log.Printf("Agent stream started: cluster=%s", clusterID)

	defer func() {
		s.mu.Lock()
		if s.agents[clusterID] == conn {
			delete(s.agents, clusterID)
		}
		s.mu.Unlock()
		cancel()
		_ = s.store.UpdateClusterStatus(context.Background(), clusterID, "disconnected")
		log.Printf("Agent stream ended: cluster=%s", clusterID)
	}()

	// Start a ping ticker for heartbeat.
	go s.pingLoop(ctx, conn)

	// Read loop: process incoming messages from the agent.
	for {
		msg, err := stream.Recv()
		if err != nil {
			return err
		}

		switch payload := msg.Payload.(type) {
		case *agentpb.AgentMessage_K8SResponse:
			s.handleK8sResponse(conn, payload.K8SResponse)
		case *agentpb.AgentMessage_WatchEvent:
			// Watch events will be forwarded to WebSocket hub in future tasks.
			log.Printf("Watch event from cluster %s: watch=%s type=%s",
				clusterID, payload.WatchEvent.WatchId, payload.WatchEvent.EventType)
		case *agentpb.AgentMessage_Pong:
			// Pong received, update health.
			_ = s.store.UpdateClusterStatus(ctx, clusterID, "connected")
		case *agentpb.AgentMessage_ClusterInfo:
			log.Printf("Cluster info from %s: k8s=%s nodes=%d",
				clusterID, payload.ClusterInfo.KubernetesVersion, payload.ClusterInfo.NodeCount)
		}
	}
}

// SendK8sRequest sends a K8s API request to a connected agent and waits for the response.
func (s *AgentServer) SendK8sRequest(ctx context.Context, clusterID string, req *agentpb.K8SRequest) (*agentpb.K8SResponse, error) {
	s.mu.RLock()
	conn, ok := s.agents[clusterID]
	s.mu.RUnlock()

	if !ok {
		return nil, fmt.Errorf("no agent connected for cluster %s", clusterID)
	}

	if req.RequestId == "" {
		req.RequestId = uuid.New().String()
	}

	// Create a response channel.
	ch := make(chan *agentpb.K8SResponse, 1)
	conn.mu.Lock()
	conn.pending[req.RequestId] = ch
	conn.mu.Unlock()

	defer func() {
		conn.mu.Lock()
		delete(conn.pending, req.RequestId)
		conn.mu.Unlock()
	}()

	// Send the request to the agent.
	err := conn.Stream.Send(&agentpb.DashboardMessage{
		Payload: &agentpb.DashboardMessage_K8SRequest{
			K8SRequest: req,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to send request to agent: %w", err)
	}

	// Wait for response or context cancellation.
	select {
	case resp := <-ch:
		return resp, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

// IsAgentConnected checks whether a given cluster has a live agent stream.
func (s *AgentServer) IsAgentConnected(clusterID string) bool {
	s.mu.RLock()
	_, ok := s.agents[clusterID]
	s.mu.RUnlock()
	return ok
}

// handleK8sResponse routes a response from an agent to the waiting caller.
func (s *AgentServer) handleK8sResponse(conn *AgentConnection, resp *agentpb.K8SResponse) {
	conn.mu.Lock()
	ch, ok := conn.pending[resp.RequestId]
	conn.mu.Unlock()

	if ok {
		select {
		case ch <- resp:
		default:
		}
	}
}

// pingLoop sends periodic Ping messages to the agent.
func (s *AgentServer) pingLoop(ctx context.Context, conn *AgentConnection) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			err := conn.Stream.Send(&agentpb.DashboardMessage{
				Payload: &agentpb.DashboardMessage_Ping{
					Ping: &agentpb.Ping{
						Timestamp: timestamppb.Now(),
					},
				},
			})
			if err != nil {
				log.Printf("Failed to send ping to cluster %s: %v", conn.ClusterID, err)
				return
			}
		}
	}
}

// AgentClaims holds the JWT claims for agent tokens.
type AgentClaims struct {
	ClusterID string `json:"cluster_id"`
	AgentID   string `json:"agent_id"`
	jwt.RegisteredClaims
}

func (s *AgentServer) generateAgentToken(clusterID, agentID string) (string, error) {
	now := time.Now()
	claims := AgentClaims{
		ClusterID: clusterID,
		AgentID:   agentID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   agentID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(365 * 24 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *AgentServer) validateAgentToken(tokenStr string) (*AgentClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &AgentClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*AgentClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid agent claims")
	}
	return claims, nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", h)
}
