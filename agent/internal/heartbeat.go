package internal

import (
	"context"
	"log"
	"time"

	pb "github.com/darkden-lab/argus/backend/pkg/agentpb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// StreamSender can send agent messages to the dashboard stream.
type StreamSender interface {
	Send(*pb.AgentMessage) error
}

// Heartbeat sends periodic cluster info and handles pong responses.
type Heartbeat struct {
	interval time.Duration
}

func NewHeartbeat(interval time.Duration) *Heartbeat {
	if interval <= 0 {
		interval = 30 * time.Second
	}
	return &Heartbeat{interval: interval}
}

// SendClusterInfo sends cluster discovery info through the stream.
func (h *Heartbeat) SendClusterInfo(ctx context.Context, sender StreamSender) {
	info := CollectClusterInfo(ctx)
	if err := sender.Send(&pb.AgentMessage{
		Payload: &pb.AgentMessage_ClusterInfo{
			ClusterInfo: info,
		},
	}); err != nil {
		log.Printf("Heartbeat: failed to send cluster info: %v", err)
	}
}

// RespondToPing sends a Pong response to a Ping message.
func (h *Heartbeat) RespondToPing(sender StreamSender) {
	if err := sender.Send(&pb.AgentMessage{
		Payload: &pb.AgentMessage_Pong{
			Pong: &pb.Pong{
				Timestamp: timestamppb.Now(),
			},
		},
	}); err != nil {
		log.Printf("Heartbeat: failed to send pong: %v", err)
	}
}

// RunPeriodicInfo periodically sends cluster info updates.
func (h *Heartbeat) RunPeriodicInfo(ctx context.Context, sender StreamSender) {
	ticker := time.NewTicker(h.interval)
	defer ticker.Stop()

	// Send initial info immediately.
	h.SendClusterInfo(ctx, sender)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			h.SendClusterInfo(ctx, sender)
		}
	}
}
