package internal

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	pb "github.com/k8s-dashboard/backend/pkg/agentpb"
	"k8s.io/client-go/rest"
)

// Proxy handles K8s API requests from the dashboard by forwarding them
// to the local Kubernetes API server using the agent's ServiceAccount.
type Proxy struct {
	config *rest.Config
	client *http.Client
}

func NewProxy() *Proxy {
	config, err := rest.InClusterConfig()
	if err != nil {
		log.Printf("WARNING: in-cluster config not available: %v (running outside cluster?)", err)
		return &Proxy{}
	}

	transport, err := rest.TransportFor(config)
	if err != nil {
		log.Printf("WARNING: failed to create transport: %v", err)
		return &Proxy{}
	}

	return &Proxy{
		config: config,
		client: &http.Client{Transport: transport},
	}
}

// HandleRequest processes a K8s API request and returns the response.
func (p *Proxy) HandleRequest(ctx context.Context, req *pb.K8SRequest) *pb.K8SResponse {
	if p.config == nil || p.client == nil {
		return &pb.K8SResponse{
			RequestId:  req.RequestId,
			StatusCode: http.StatusServiceUnavailable,
			Error:      "agent not running in a Kubernetes cluster",
		}
	}

	url := p.config.Host + req.Path
	if len(req.QueryParams) > 0 {
		params := make([]string, 0, len(req.QueryParams))
		for k, v := range req.QueryParams {
			params = append(params, k+"="+v)
		}
		url += "?" + strings.Join(params, "&")
	}

	var bodyReader io.Reader
	if len(req.Body) > 0 {
		bodyReader = strings.NewReader(string(req.Body))
	}

	httpReq, err := http.NewRequestWithContext(ctx, req.Method, url, bodyReader)
	if err != nil {
		return &pb.K8SResponse{
			RequestId:  req.RequestId,
			StatusCode: http.StatusInternalServerError,
			Error:      fmt.Sprintf("failed to create request: %v", err),
		}
	}

	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}
	if httpReq.Header.Get("Content-Type") == "" && len(req.Body) > 0 {
		httpReq.Header.Set("Content-Type", "application/json")
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return &pb.K8SResponse{
			RequestId:  req.RequestId,
			StatusCode: http.StatusBadGateway,
			Error:      fmt.Sprintf("k8s API request failed: %v", err),
		}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return &pb.K8SResponse{
			RequestId:  req.RequestId,
			StatusCode: int32(resp.StatusCode),
			Error:      fmt.Sprintf("failed to read response body: %v", err),
		}
	}

	headers := make(map[string]string)
	for k := range resp.Header {
		headers[k] = resp.Header.Get(k)
	}

	return &pb.K8SResponse{
		RequestId:  req.RequestId,
		StatusCode: int32(resp.StatusCode),
		Body:       body,
		Headers:    headers,
	}
}
