package prometheus

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/plugin"
	"github.com/darkden-lab/argus/backend/internal/prometheus"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const (
	group   = "monitoring.coreos.com"
	version = "v1"
)

type Handlers struct {
	cm    *cluster.Manager
	pool  *pgxpool.Pool
	store *plugin.Store
}

func NewHandlers(cm *cluster.Manager, pool *pgxpool.Pool) *Handlers {
	var store *plugin.Store
	if pool != nil {
		store = plugin.NewStore(pool)
	}
	return &Handlers{cm: cm, pool: pool, store: store}
}

func (h *Handlers) gvr(resource string) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
}

func (h *Handlers) ListResources(resource string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterID := mux.Vars(r)["cluster"]
		namespace := r.URL.Query().Get("namespace")

		client, err := h.cm.GetClient(clusterID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
			return
		}

		var list *unstructured.UnstructuredList
		if namespace != "" {
			list, err = client.DynClient.Resource(h.gvr(resource)).Namespace(namespace).List(context.Background(), metav1.ListOptions{})
		} else {
			list, err = client.DynClient.Resource(h.gvr(resource)).Namespace("").List(context.Background(), metav1.ListOptions{})
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, list.Items)
	}
}

func (h *Handlers) GetResource(resource string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		clusterID := vars["cluster"]
		namespace := vars["namespace"]
		name := vars["name"]

		client, err := h.cm.GetClient(clusterID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
			return
		}

		obj, err := client.DynClient.Resource(h.gvr(resource)).Namespace(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, obj)
	}
}

func (h *Handlers) CreateResource(resource string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterID := mux.Vars(r)["cluster"]

		client, err := h.cm.GetClient(clusterID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
			return
		}

		obj := &unstructured.Unstructured{}
		if err := json.Unmarshal(body, &obj.Object); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		namespace := obj.GetNamespace()
		if namespace == "" {
			namespace = "default"
		}

		created, err := client.DynClient.Resource(h.gvr(resource)).Namespace(namespace).Create(context.Background(), obj, metav1.CreateOptions{})
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusCreated, created)
	}
}

func (h *Handlers) DeleteResource(resource string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		clusterID := vars["cluster"]
		namespace := vars["namespace"]
		name := vars["name"]

		client, err := h.cm.GetClient(clusterID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
			return
		}

		err = client.DynClient.Resource(h.gvr(resource)).Namespace(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *Handlers) CreateServiceMonitorWizard(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]

	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}

	var cfg ServiceMonitorConfig
	if err := json.Unmarshal(body, &cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	if cfg.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}

	cfg.ClusterID = clusterID
	obj := GenerateServiceMonitor(cfg)

	namespace := obj.GetNamespace()
	created, err := client.DynClient.Resource(h.gvr("servicemonitors")).Namespace(namespace).Create(context.Background(), obj, metav1.CreateOptions{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, created)
}

func (h *Handlers) PreviewServiceMonitorWizard(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}

	var cfg ServiceMonitorConfig
	if err := json.Unmarshal(body, &cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	if cfg.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}

	obj := GenerateServiceMonitor(cfg)
	writeJSON(w, http.StatusOK, obj)
}

// DiscoverPrometheus finds Prometheus instances in the cluster.
func (h *Handlers) DiscoverPrometheus(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]
	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
		return
	}

	instances, err := prometheus.DiscoverInstances(r.Context(), client.Clientset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if instances == nil {
		instances = []prometheus.PrometheusInstance{}
	}
	writeJSON(w, http.StatusOK, instances)
}

// GetConfig returns the saved Prometheus config for a cluster.
func (h *Handlers) GetConfig(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]
	cfg := h.loadConfig(r.Context(), clusterID)
	writeJSON(w, http.StatusOK, cfg)
}

// SaveConfig saves the Prometheus config for a cluster.
func (h *Handlers) SaveConfig(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]

	var cfg prometheus.PrometheusConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid config"})
		return
	}

	if h.store == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database not available"})
		return
	}

	configJSON, err := json.Marshal(cfg)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to marshal config"})
		return
	}

	if err := h.store.SavePluginState(r.Context(), "prometheus", clusterID, "configured", configJSON); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save config"})
		return
	}

	writeJSON(w, http.StatusOK, cfg)
}

// ProxyQuery proxies a PromQL query to Prometheus via the K8s API server.
func (h *Handlers) ProxyQuery(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]
	query := r.URL.Query().Get("query")
	if query == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "query parameter required"})
		return
	}

	client, cfg, err := h.getClientAndConfig(r.Context(), clusterID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	result, err := prometheus.Query(r.Context(), client.RestConfig, cfg, query)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// GetAlerts returns active Prometheus alerts.
func (h *Handlers) GetAlerts(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]

	client, cfg, err := h.getClientAndConfig(r.Context(), clusterID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	result, err := prometheus.GetAlerts(r.Context(), client.RestConfig, cfg)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// GetTargets returns Prometheus scrape targets.
func (h *Handlers) GetTargets(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]

	client, cfg, err := h.getClientAndConfig(r.Context(), clusterID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	result, err := prometheus.GetTargets(r.Context(), client.RestConfig, cfg)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// MetricsOverview is the response for the metrics overview endpoint.
type MetricsOverview struct {
	CPUUsage     *float64 `json:"cpuUsage"`
	MemoryUsage  *float64 `json:"memoryUsage"`
	AlertsCount  int      `json:"alertsCount"`
	TargetsUp    int      `json:"targetsUp"`
	TargetsTotal int      `json:"targetsTotal"`
}

// GetMetricsOverview returns pre-computed cluster metrics.
func (h *Handlers) GetMetricsOverview(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]

	client, cfg, err := h.getClientAndConfig(r.Context(), clusterID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	overview := MetricsOverview{}

	// CPU usage
	cpuResult, err := prometheus.Query(r.Context(), client.RestConfig, cfg,
		`1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))`)
	if err == nil && len(cpuResult.Data.Result) > 0 {
		if v, err := parsePrometheusValue(cpuResult.Data.Result[0].Value[1]); err == nil {
			pct := v * 100
			overview.CPUUsage = &pct
		}
	}

	// Memory usage
	memResult, err := prometheus.Query(r.Context(), client.RestConfig, cfg,
		`1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes))`)
	if err == nil && len(memResult.Data.Result) > 0 {
		if v, err := parsePrometheusValue(memResult.Data.Result[0].Value[1]); err == nil {
			pct := v * 100
			overview.MemoryUsage = &pct
		}
	}

	// Active alerts count
	alertsResult, err := prometheus.GetAlerts(r.Context(), client.RestConfig, cfg)
	if err == nil {
		for _, a := range alertsResult.Data.Alerts {
			if a.State == "firing" {
				overview.AlertsCount++
			}
		}
	}

	// Targets health
	targetsResult, err := prometheus.GetTargets(r.Context(), client.RestConfig, cfg)
	if err == nil {
		overview.TargetsTotal = len(targetsResult.Data.ActiveTargets)
		for _, t := range targetsResult.Data.ActiveTargets {
			if t.Health == "up" {
				overview.TargetsUp++
			}
		}
	}

	writeJSON(w, http.StatusOK, overview)
}

func (h *Handlers) loadConfig(ctx context.Context, clusterID string) prometheus.PrometheusConfig {
	if h.store == nil {
		return prometheus.PrometheusConfig{}
	}
	state, err := h.store.GetPluginState(ctx, "prometheus", clusterID)
	if err != nil {
		return prometheus.PrometheusConfig{}
	}
	var cfg prometheus.PrometheusConfig
	if err := json.Unmarshal(state.Config, &cfg); err != nil {
		return prometheus.PrometheusConfig{}
	}
	return cfg
}

func (h *Handlers) getClientAndConfig(ctx context.Context, clusterID string) (*cluster.ClusterClient, prometheus.PrometheusConfig, error) {
	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		return nil, prometheus.PrometheusConfig{}, fmt.Errorf("cluster not found")
	}

	cfg := h.loadConfig(ctx, clusterID)
	if cfg.ServiceName == "" {
		return nil, prometheus.PrometheusConfig{}, fmt.Errorf("prometheus not configured for this cluster")
	}

	return client, cfg, nil
}

func parsePrometheusValue(raw json.RawMessage) (float64, error) {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return 0, err
	}
	return strconv.ParseFloat(s, 64)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
