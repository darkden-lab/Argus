package prometheus

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"testing"

	"k8s.io/client-go/rest"
)

// roundTripFunc is a helper that implements http.RoundTripper.
type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

// jsonResponse creates an http.Response with a JSON body.
func jsonResponse(status int, body interface{}) *http.Response {
	data, _ := json.Marshal(body)
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(bytes.NewReader(data)),
		Header:     http.Header{"Content-Type": {"application/json"}},
	}
}

func TestMain(m *testing.M) {
	os.Exit(m.Run())
}

func TestQuery(t *testing.T) {
	buildTransport = func(_ *rest.Config) (http.RoundTripper, error) {
		return roundTripFunc(func(req *http.Request) (*http.Response, error) {
			// Verify URL path
			expectedPath := "/api/v1/namespaces/monitoring/services/prometheus:9090/proxy/api/v1/query"
			if req.URL.Path != expectedPath {
				t.Errorf("unexpected path: %s, want %s", req.URL.Path, expectedPath)
			}
			if req.URL.Query().Get("query") != "up" {
				t.Errorf("unexpected query param: %s", req.URL.Query().Get("query"))
			}
			return jsonResponse(200, map[string]interface{}{
				"status": "success",
				"data": map[string]interface{}{
					"resultType": "vector",
					"result": []map[string]interface{}{
						{
							"metric": map[string]string{"instance": "localhost:9090"},
							"value":  []interface{}{1234567890.0, "1"},
						},
					},
				},
			}), nil
		}), nil
	}

	restConfig := &rest.Config{Host: "https://k8s-api:6443"}
	cfg := PrometheusConfig{Namespace: "monitoring", ServiceName: "prometheus", Port: 9090}

	result, err := Query(context.Background(), restConfig, cfg, "up")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Status != "success" {
		t.Errorf("expected status 'success', got %q", result.Status)
	}
	if result.Data.ResultType != "vector" {
		t.Errorf("expected resultType 'vector', got %q", result.Data.ResultType)
	}
	if len(result.Data.Result) != 1 {
		t.Errorf("expected 1 result, got %d", len(result.Data.Result))
	}
}

func TestQuery_ErrorStatus(t *testing.T) {
	buildTransport = func(_ *rest.Config) (http.RoundTripper, error) {
		return roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return jsonResponse(200, map[string]interface{}{
				"status": "error",
				"error":  "bad query",
			}), nil
		}), nil
	}

	restConfig := &rest.Config{Host: "https://k8s-api:6443"}
	cfg := PrometheusConfig{Namespace: "monitoring", ServiceName: "prometheus", Port: 9090}

	_, err := Query(context.Background(), restConfig, cfg, "invalid{")
	if err == nil {
		t.Fatal("expected error for failed query")
	}
	if !strings.Contains(err.Error(), "status=error") {
		t.Errorf("expected error about status, got: %v", err)
	}
}

func TestQuery_HTTPError(t *testing.T) {
	buildTransport = func(_ *rest.Config) (http.RoundTripper, error) {
		return roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: 503,
				Body:       io.NopCloser(bytes.NewReader([]byte("service unavailable"))),
				Header:     http.Header{},
			}, nil
		}), nil
	}

	restConfig := &rest.Config{Host: "https://k8s-api:6443"}
	cfg := PrometheusConfig{Namespace: "monitoring", ServiceName: "prometheus", Port: 9090}

	_, err := Query(context.Background(), restConfig, cfg, "up")
	if err == nil {
		t.Fatal("expected error for HTTP 503")
	}
	if !strings.Contains(err.Error(), "503") {
		t.Errorf("expected error about 503, got: %v", err)
	}
}

func TestGetAlerts(t *testing.T) {
	buildTransport = func(_ *rest.Config) (http.RoundTripper, error) {
		return roundTripFunc(func(req *http.Request) (*http.Response, error) {
			expectedPath := "/api/v1/namespaces/monitoring/services/prom:9090/proxy/api/v1/alerts"
			if req.URL.Path != expectedPath {
				t.Errorf("unexpected path: %s, want %s", req.URL.Path, expectedPath)
			}
			return jsonResponse(200, map[string]interface{}{
				"status": "success",
				"data": map[string]interface{}{
					"alerts": []map[string]interface{}{
						{
							"labels":   map[string]string{"alertname": "HighCPU", "severity": "warning"},
							"state":    "firing",
							"activeAt": "2024-01-01T00:00:00Z",
						},
					},
				},
			}), nil
		}), nil
	}

	restConfig := &rest.Config{Host: "https://k8s-api:6443"}
	cfg := PrometheusConfig{Namespace: "monitoring", ServiceName: "prom", Port: 9090}

	result, err := GetAlerts(context.Background(), restConfig, cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Data.Alerts) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(result.Data.Alerts))
	}
	if result.Data.Alerts[0].State != "firing" {
		t.Errorf("expected state 'firing', got %q", result.Data.Alerts[0].State)
	}
}

func TestGetTargets(t *testing.T) {
	buildTransport = func(_ *rest.Config) (http.RoundTripper, error) {
		return roundTripFunc(func(req *http.Request) (*http.Response, error) {
			return jsonResponse(200, map[string]interface{}{
				"status": "success",
				"data": map[string]interface{}{
					"activeTargets": []map[string]interface{}{
						{
							"scrapePool": "kubernetes-pods",
							"scrapeUrl":  "http://10.0.0.1:9090/metrics",
							"health":     "up",
							"lastScrape": "2024-01-01T00:00:00Z",
							"lastError":  "",
						},
						{
							"scrapePool": "kubernetes-pods",
							"scrapeUrl":  "http://10.0.0.2:8080/metrics",
							"health":     "down",
							"lastScrape": "2024-01-01T00:00:00Z",
							"lastError":  "connection refused",
						},
					},
				},
			}), nil
		}), nil
	}

	restConfig := &rest.Config{Host: "https://k8s-api:6443"}
	cfg := PrometheusConfig{Namespace: "monitoring", ServiceName: "prometheus", Port: 9090}

	result, err := GetTargets(context.Background(), restConfig, cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Data.ActiveTargets) != 2 {
		t.Fatalf("expected 2 targets, got %d", len(result.Data.ActiveTargets))
	}
	if result.Data.ActiveTargets[0].Health != "up" {
		t.Errorf("expected first target health 'up', got %q", result.Data.ActiveTargets[0].Health)
	}
	if result.Data.ActiveTargets[1].Health != "down" {
		t.Errorf("expected second target health 'down', got %q", result.Data.ActiveTargets[1].Health)
	}
}

func TestDoProxyGet_URLConstruction(t *testing.T) {
	var capturedURL *url.URL
	buildTransport = func(_ *rest.Config) (http.RoundTripper, error) {
		return roundTripFunc(func(req *http.Request) (*http.Response, error) {
			capturedURL = req.URL
			return jsonResponse(200, map[string]string{"ok": "true"}), nil
		}), nil
	}

	restConfig := &rest.Config{Host: "https://my-cluster:6443"}

	_, err := doProxyGet(context.Background(), restConfig, "custom-ns", "my-prom", 8080, "api/v1/query", url.Values{"query": {"up"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expectedPath := "/api/v1/namespaces/custom-ns/services/my-prom:8080/proxy/api/v1/query"
	if capturedURL.Path != expectedPath {
		t.Errorf("expected path %q, got %q", expectedPath, capturedURL.Path)
	}
	if capturedURL.Host != "my-cluster:6443" {
		t.Errorf("expected host 'my-cluster:6443', got %q", capturedURL.Host)
	}
	if capturedURL.Query().Get("query") != "up" {
		t.Errorf("expected query param 'up', got %q", capturedURL.Query().Get("query"))
	}
}
