package internal

import (
	"context"
	"net/http"
	"testing"

	pb "github.com/darkden-lab/argus/backend/pkg/agentpb"
)

func TestProxyHandleRequest_NoCluster(t *testing.T) {
	p := &Proxy{} // no config = not in cluster

	resp := p.HandleRequest(context.Background(), &pb.K8SRequest{
		RequestId: "test-1",
		Method:    "GET",
		Path:      "/api/v1/pods",
	})

	if resp.RequestId != "test-1" {
		t.Errorf("expected request_id test-1, got %s", resp.RequestId)
	}
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("expected status %d, got %d", http.StatusServiceUnavailable, resp.StatusCode)
	}
	if resp.Error == "" {
		t.Error("expected non-empty error")
	}
}

func TestNewProxy_OutsideCluster(t *testing.T) {
	// Outside a cluster, NewProxy should not panic.
	p := NewProxy()
	if p == nil {
		t.Fatal("expected non-nil proxy")
	}
}
