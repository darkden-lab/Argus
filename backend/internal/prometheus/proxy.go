package prometheus

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"k8s.io/client-go/rest"
	"k8s.io/client-go/transport"
)

const proxyTimeout = 15 * time.Second

// buildTransport creates an http.RoundTripper from a rest.Config.
// Exposed as a var so tests can override it.
var buildTransport = func(restConfig *rest.Config) (http.RoundTripper, error) {
	transportConfig, err := restConfig.TransportConfig()
	if err != nil {
		return nil, fmt.Errorf("failed to get transport config: %w", err)
	}
	rt, err := transport.New(transportConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create transport: %w", err)
	}
	return rt, nil
}

// Query executes a PromQL query against Prometheus via the K8s API server proxy.
func Query(ctx context.Context, restConfig *rest.Config, cfg PrometheusConfig, promQL string) (*QueryResult, error) {
	params := url.Values{"query": {promQL}}
	data, err := doProxyGet(ctx, restConfig, cfg.Namespace, cfg.ServiceName, cfg.Port, "api/v1/query", params)
	if err != nil {
		return nil, fmt.Errorf("prometheus query failed: %w", err)
	}
	var result QueryResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("failed to decode prometheus response: %w", err)
	}
	if result.Status != "success" {
		return nil, fmt.Errorf("prometheus query failed: status=%s", result.Status)
	}
	return &result, nil
}

// GetAlerts retrieves active alerts from Prometheus via the K8s API server proxy.
func GetAlerts(ctx context.Context, restConfig *rest.Config, cfg PrometheusConfig) (*AlertsResult, error) {
	data, err := doProxyGet(ctx, restConfig, cfg.Namespace, cfg.ServiceName, cfg.Port, "api/v1/alerts", nil)
	if err != nil {
		return nil, fmt.Errorf("prometheus alerts request failed: %w", err)
	}
	var result AlertsResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("failed to decode alerts response: %w", err)
	}
	return &result, nil
}

// GetTargets retrieves scrape targets from Prometheus via the K8s API server proxy.
func GetTargets(ctx context.Context, restConfig *rest.Config, cfg PrometheusConfig) (*TargetsResult, error) {
	data, err := doProxyGet(ctx, restConfig, cfg.Namespace, cfg.ServiceName, cfg.Port, "api/v1/targets", nil)
	if err != nil {
		return nil, fmt.Errorf("prometheus targets request failed: %w", err)
	}
	var result TargetsResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("failed to decode targets response: %w", err)
	}
	return &result, nil
}

// doProxyGet makes an authenticated GET request to a Prometheus endpoint through
// the K8s API server service proxy.
// URL pattern: {k8s-host}/api/v1/namespaces/{ns}/services/{svc}:{port}/proxy/{path}
func doProxyGet(ctx context.Context, restConfig *rest.Config, namespace, service string, port int, path string, params url.Values) ([]byte, error) {
	// Build the K8s API server proxy URL
	host := strings.TrimRight(restConfig.Host, "/")
	proxyPath := fmt.Sprintf("/api/v1/namespaces/%s/services/%s:%d/proxy/%s",
		namespace, service, port, path)

	u, err := url.Parse(host + proxyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to build proxy URL: %w", err)
	}
	if params != nil {
		u.RawQuery = params.Encode()
	}

	rt, err := buildTransport(restConfig)
	if err != nil {
		return nil, err
	}

	client := &http.Client{
		Transport: rt,
		Timeout:   proxyTimeout,
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("proxy request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("prometheus returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	return body, nil
}
