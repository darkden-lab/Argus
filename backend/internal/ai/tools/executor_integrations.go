package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (e *Executor) queryPrometheus(ctx context.Context, args map[string]string) (string, error) {
	if e.pluginEngine == nil || !e.pluginEngine.IsEnabled("prometheus") {
		return "", fmt.Errorf("prometheus plugin is not enabled on this cluster, enable it in Settings > Plugins")
	}

	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	// Find Prometheus service in the cluster
	svcs, err := client.Clientset.CoreV1().Services("").List(ctx, metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/name=prometheus",
	})
	if err != nil || len(svcs.Items) == 0 {
		// Fallback: try common service names
		svcs, err = client.Clientset.CoreV1().Services("").List(ctx, metav1.ListOptions{})
		if err != nil {
			return "", fmt.Errorf("failed to list services: %w", err)
		}
		found := false
		for _, svc := range svcs.Items {
			name := strings.ToLower(svc.Name)
			if strings.Contains(name, "prometheus") && strings.Contains(name, "server") {
				found = true
				break
			}
			if name == "prometheus" {
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("could not find Prometheus service in the cluster. Ensure Prometheus is deployed and accessible")
		}
	}

	// Build query URL - use the Kubernetes API proxy to reach Prometheus
	query := args["query"]
	params := url.Values{}
	params.Set("query", query)

	if start := args["start"]; start != "" {
		params.Set("start", start)
	}
	if end := args["end"]; end != "" {
		params.Set("end", end)
	}
	if step := args["step"]; step != "" {
		params.Set("step", step)
	}

	// For instant query
	endpoint := "/api/v1/query"
	if args["start"] != "" || args["end"] != "" {
		endpoint = "/api/v1/query_range"
		if args["start"] == "" {
			params.Set("start", time.Now().Add(-1*time.Hour).Format(time.RFC3339))
		}
		if args["end"] == "" {
			params.Set("end", time.Now().Format(time.RFC3339))
		}
		if args["step"] == "" {
			params.Set("step", "60s")
		}
	}

	promURL := fmt.Sprintf("http://prometheus-server.monitoring.svc.cluster.local:80%s?%s", endpoint, params.Encode())

	httpClient := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", promURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Sprintf("Could not reach Prometheus at %s. The service may not be accessible from the dashboard. Use kubectl port-forward to access it directly.\n\nQuery: %s", promURL, query), nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return string(body), nil
	}

	data, _ := json.MarshalIndent(result, "", "  ")
	return fmt.Sprintf("Prometheus Query: %s\n%s", query, string(data)), nil
}

func (e *Executor) getAlerts(ctx context.Context, args map[string]string) (string, error) {
	if e.pluginEngine == nil || !e.pluginEngine.IsEnabled("prometheus") {
		return "", fmt.Errorf("prometheus plugin is not enabled on this cluster, enable it in Settings > Plugins")
	}

	_, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	alertURL := "http://prometheus-alertmanager.monitoring.svc.cluster.local:9093/api/v2/alerts"

	httpClient := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", alertURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := httpClient.Do(req)
	if err != nil {
		// Fallback: try to get alerts from Prometheus rules API
		promURL := "http://prometheus-server.monitoring.svc.cluster.local:80/api/v1/alerts"
		req2, _ := http.NewRequestWithContext(ctx, "GET", promURL, nil)
		resp2, err2 := httpClient.Do(req2)
		if err2 != nil {
			return "Could not reach Alertmanager or Prometheus alerts API. The services may not be accessible from the dashboard. Use kubectl port-forward to access them directly.", nil
		}
		defer resp2.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(resp2.Body, 64*1024))
		var result map[string]interface{}
		if err := json.Unmarshal(body, &result); err != nil {
			return string(body), nil
		}
		data, _ := json.MarshalIndent(result, "", "  ")
		return fmt.Sprintf("Prometheus Alerts:\n%s", string(data)), nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	var alerts []interface{}
	if err := json.Unmarshal(body, &alerts); err != nil {
		return string(body), nil
	}

	data, _ := json.MarshalIndent(alerts, "", "  ")
	return fmt.Sprintf("Active Alerts (%d):\n%s", len(alerts), string(data)), nil
}

func (e *Executor) getHelmReleases(ctx context.Context, args map[string]string) (string, error) {
	if e.pluginEngine == nil || !e.pluginEngine.IsEnabled("helm") {
		return "", fmt.Errorf("helm plugin is not enabled on this cluster, enable it in Settings > Plugins")
	}

	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	ns := args["namespace"]

	// Helm stores releases as secrets with type helm.sh/release.v1
	secrets, err := client.Clientset.CoreV1().Secrets(ns).List(ctx, metav1.ListOptions{
		LabelSelector: "owner=helm",
	})
	if err != nil {
		return "", fmt.Errorf("failed to list helm secrets: %w", err)
	}

	type helmRelease struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		Version   string `json:"version"`
		Status    string `json:"status"`
	}

	// Deduplicate by release name, keep latest version
	releaseMap := map[string]helmRelease{}
	for _, s := range secrets.Items {
		name := s.Labels["name"]
		version := s.Labels["version"]
		status := s.Labels["status"]

		key := s.Namespace + "/" + name
		existing, ok := releaseMap[key]
		if !ok || version > existing.Version {
			releaseMap[key] = helmRelease{
				Name:      name,
				Namespace: s.Namespace,
				Version:   version,
				Status:    status,
			}
		}
	}

	releases := make([]helmRelease, 0, len(releaseMap))
	for _, r := range releaseMap {
		releases = append(releases, r)
	}

	data, _ := json.MarshalIndent(releases, "", "  ")
	return fmt.Sprintf("Found %d Helm releases:\n%s", len(releases), string(data)), nil
}
