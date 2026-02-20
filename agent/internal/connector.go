package internal

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"

	pb "github.com/k8s-dashboard/backend/pkg/agentpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// RequestHandler processes incoming K8s requests from the dashboard.
type RequestHandler func(ctx context.Context, req *pb.K8SRequest) *pb.K8SResponse

// Connector manages the gRPC connection to the dashboard backend.
type Connector struct {
	config  *Config
	handler RequestHandler
	conn    *grpc.ClientConn
	client  pb.ClusterAgentClient
}

func NewConnector(cfg *Config, handler RequestHandler) *Connector {
	return &Connector{
		config:  cfg,
		handler: handler,
	}
}

// Run connects to the dashboard, registers if needed, and maintains the stream.
// It retries with exponential backoff on failure.
func (c *Connector) Run(ctx context.Context) error {
	if err := c.dial(ctx); err != nil {
		return fmt.Errorf("initial connection failed: %w", err)
	}
	defer c.conn.Close()

	// Register if not already registered.
	if !c.config.IsRegistered() {
		if err := c.register(ctx); err != nil {
			return fmt.Errorf("registration failed: %w", err)
		}
	}

	// Main reconnect loop.
	attempt := 0
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		err := c.stream(ctx)
		if ctx.Err() != nil {
			return ctx.Err()
		}

		attempt++
		delay := backoff(attempt)
		log.Printf("Stream disconnected (attempt %d), reconnecting in %v: %v", attempt, delay, err)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(delay):
		}

		// Re-establish the gRPC connection.
		if c.conn != nil {
			c.conn.Close()
		}
		if err := c.dial(ctx); err != nil {
			log.Printf("Reconnect dial failed: %v", err)
			continue
		}
		// Reset attempt counter on successful reconnect.
		attempt = 0
	}
}

func (c *Connector) dial(ctx context.Context) error {
	conn, err := grpc.NewClient(
		c.config.DashboardURL,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return fmt.Errorf("failed to dial %s: %w", c.config.DashboardURL, err)
	}
	c.conn = conn
	c.client = pb.NewClusterAgentClient(conn)
	return nil
}

func (c *Connector) register(ctx context.Context) error {
	log.Printf("Registering agent with cluster name %q...", c.config.ClusterName)

	resp, err := c.client.Register(ctx, &pb.RegisterRequest{
		Token:       c.config.Token,
		ClusterName: c.config.ClusterName,
	})
	if err != nil {
		return err
	}

	c.config.ClusterID = resp.ClusterId
	c.config.AgentToken = resp.AgentToken

	log.Printf("Registered successfully: cluster_id=%s", resp.ClusterId)
	return nil
}

func (c *Connector) stream(ctx context.Context) error {
	// Attach the agent token as metadata.
	md := metadata.Pairs("authorization", "Bearer "+c.config.AgentToken)
	streamCtx := metadata.NewOutgoingContext(ctx, md)

	stream, err := c.client.Stream(streamCtx)
	if err != nil {
		return fmt.Errorf("failed to open stream: %w", err)
	}

	log.Printf("Stream connected: cluster_id=%s", c.config.ClusterID)

	// Process incoming messages from the dashboard.
	for {
		msg, err := stream.Recv()
		if err != nil {
			return fmt.Errorf("stream recv: %w", err)
		}

		switch payload := msg.Payload.(type) {
		case *pb.DashboardMessage_K8SRequest:
			go c.handleK8sRequest(ctx, stream, payload.K8SRequest)
		case *pb.DashboardMessage_Ping:
			_ = stream.Send(&pb.AgentMessage{
				Payload: &pb.AgentMessage_Pong{
					Pong: &pb.Pong{
						Timestamp: timestamppb.Now(),
					},
				},
			})
		case *pb.DashboardMessage_WatchSubscribe:
			log.Printf("Watch subscribe request: watch_id=%s path=%s",
				payload.WatchSubscribe.WatchId, payload.WatchSubscribe.Path)
			// Watch handling will be implemented in task 3.2
		case *pb.DashboardMessage_WatchUnsubscribe:
			log.Printf("Watch unsubscribe: watch_id=%s", payload.WatchUnsubscribe.WatchId)
		}
	}
}

func (c *Connector) handleK8sRequest(ctx context.Context, stream pb.ClusterAgent_StreamClient, req *pb.K8SRequest) {
	resp := c.handler(ctx, req)
	if err := stream.Send(&pb.AgentMessage{
		Payload: &pb.AgentMessage_K8SResponse{
			K8SResponse: resp,
		},
	}); err != nil {
		log.Printf("Failed to send K8s response for request %s: %v", req.RequestId, err)
	}
}

// backoff returns an exponential backoff duration capped at 60s.
func backoff(attempt int) time.Duration {
	base := time.Second
	max := 60 * time.Second
	d := time.Duration(math.Pow(2, float64(attempt))) * base
	if d > max {
		return max
	}
	return d
}
