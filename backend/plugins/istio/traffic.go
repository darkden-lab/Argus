package istio

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/plugin"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// TrafficNode represents a workload node in the traffic graph.
type TrafficNode struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Namespace   string  `json:"namespace"`
	Type        string  `json:"type"`
	App         string  `json:"app"`
	Version     string  `json:"version"`
	RequestRate float64 `json:"requestRate"`
	ErrorRate   float64 `json:"errorRate"`
}

// TrafficEdge represents a traffic flow between two workloads.
type TrafficEdge struct {
	Source      string  `json:"source"`
	Target      string  `json:"target"`
	Protocol    string  `json:"protocol"`
	RequestRate float64 `json:"requestRate"`
	ErrorRate   float64 `json:"errorRate"`
}

// TrafficResponse is the response envelope for the traffic endpoint.
type TrafficResponse struct {
	Mode          string         `json:"mode"`
	Nodes         []TrafficNode  `json:"nodes,omitempty"`
	Edges         []TrafficEdge  `json:"edges,omitempty"`
	ResourceNodes []TopologyNode `json:"resourceNodes,omitempty"`
	ResourceEdges []TopologyEdge `json:"resourceEdges,omitempty"`
}

// prometheusResult models the /api/v1/query response.
type prometheusResult struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Value  [2]interface{}    `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

// trafficCache holds cached traffic data.
type trafficCache struct {
	mu      sync.RWMutex
	entries map[string]*cacheEntry
}

type cacheEntry struct {
	data      *TrafficResponse
	expiresAt time.Time
}

func newTrafficCache() *trafficCache {
	return &trafficCache{entries: make(map[string]*cacheEntry)}
}

func (c *trafficCache) get(key string) *TrafficResponse {
	c.mu.RLock()
	defer c.mu.RUnlock()
	e, ok := c.entries[key]
	if !ok || time.Now().After(e.expiresAt) {
		return nil
	}
	return e.data
}

func (c *trafficCache) set(key string, data *TrafficResponse, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = &cacheEntry{data: data, expiresAt: time.Now().Add(ttl)}
}

// trafficHandler handles traffic topology requests.
type trafficHandler struct {
	cm    *cluster.Manager
	pool  *pgxpool.Pool
	store *plugin.Store
	cache *trafficCache
}

func newTrafficHandler(cm *cluster.Manager, pool *pgxpool.Pool) *trafficHandler {
	var store *plugin.Store
	if pool != nil {
		store = plugin.NewStore(pool)
	}
	return &trafficHandler{
		cm:    cm,
		pool:  pool,
		store: store,
		cache: newTrafficCache(),
	}
}

// RegisterTrafficRoutes registers traffic and config endpoints.
func (h *trafficHandler) RegisterTrafficRoutes(r *mux.Router) {
	r.HandleFunc("/api/plugins/istio/{cluster}/traffic", h.GetTraffic).Methods("GET")
	r.HandleFunc("/api/plugins/istio/{cluster}/config", h.GetConfig).Methods("GET")
	r.HandleFunc("/api/plugins/istio/{cluster}/config", h.SaveConfig).Methods("PUT")
}

// istioConfig holds per-cluster Istio plugin config.
type istioConfig struct {
	PrometheusURL string `json:"prometheusUrl"`
}

// GetConfig returns the per-cluster Istio config.
func (h *trafficHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]
	cfg := h.loadConfig(r.Context(), clusterID)
	writeJSON(w, http.StatusOK, cfg)
}

// SaveConfig saves the per-cluster Istio config.
func (h *trafficHandler) SaveConfig(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]

	var cfg istioConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, errMsg("invalid config"))
		return
	}

	if h.store == nil {
		writeJSON(w, http.StatusServiceUnavailable, errMsg("database not available"))
		return
	}

	configJSON, err := json.Marshal(cfg)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errMsg("failed to marshal config"))
		return
	}

	if err := h.store.SavePluginState(r.Context(), "istio", clusterID, "configured", configJSON); err != nil {
		writeJSON(w, http.StatusInternalServerError, errMsg("failed to save config"))
		return
	}

	writeJSON(w, http.StatusOK, cfg)
}

func (h *trafficHandler) loadConfig(ctx context.Context, clusterID string) istioConfig {
	if h.store == nil {
		return istioConfig{}
	}
	state, err := h.store.GetPluginState(ctx, "istio", clusterID)
	if err != nil {
		return istioConfig{}
	}
	var cfg istioConfig
	if err := json.Unmarshal(state.Config, &cfg); err != nil {
		return istioConfig{}
	}
	return cfg
}

// GetTraffic returns traffic topology when Prometheus is available, falls back to resource graph.
func (h *trafficHandler) GetTraffic(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]
	namespace := r.URL.Query().Get("namespace")

	cacheKey := clusterID + ":" + namespace
	if cached := h.cache.get(cacheKey); cached != nil {
		writeJSON(w, http.StatusOK, cached)
		return
	}

	// Resolve Prometheus URL: manual override > auto-discovery
	cfg := h.loadConfig(r.Context(), clusterID)
	promURL := cfg.PrometheusURL
	if promURL == "" {
		promURL = discoverPrometheus(r.Context(), h.cm, clusterID)
	}

	if promURL != "" {
		resp, err := h.buildTrafficGraph(r.Context(), promURL, namespace)
		if err != nil {
			log.Printf("istio/traffic: prometheus query failed, falling back to resource graph: %v", err)
		} else {
			h.cache.set(cacheKey, resp, 15*time.Second)
			writeJSON(w, http.StatusOK, resp)
			return
		}
	}

	// Fallback: resource-based topology
	topoResp := h.getResourceTopology(clusterID, namespace, r)
	h.cache.set(cacheKey, topoResp, 15*time.Second)
	writeJSON(w, http.StatusOK, topoResp)
}

func (h *trafficHandler) getResourceTopology(clusterID, namespace string, r *http.Request) *TrafficResponse {
	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		return &TrafficResponse{Mode: "resource", ResourceNodes: []TopologyNode{}, ResourceEdges: []TopologyEdge{}}
	}

	nodes, edges := buildResourceGraph(r.Context(), client, namespace)
	return &TrafficResponse{
		Mode:          "resource",
		ResourceNodes: nodes,
		ResourceEdges: edges,
	}
}

// buildResourceGraph builds the resource-based topology graph directly (reuses topology logic).
func buildResourceGraph(ctx context.Context, client *cluster.ClusterClient, namespace string) ([]TopologyNode, []TopologyEdge) {
	nodes := make([]TopologyNode, 0)
	edges := make([]TopologyEdge, 0)
	nodeSet := make(map[string]bool)

	svcList, err := client.DynClient.Resource(gvrServices).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, svc := range svcList.Items {
			id := svc.GetNamespace() + "/" + svc.GetName()
			if !nodeSet[id] {
				nodeSet[id] = true
				nodes = append(nodes, TopologyNode{
					ID: id, Name: svc.GetName(), Namespace: svc.GetNamespace(), Type: "service", Status: "active",
				})
			}
		}
	}

	vsList, err := client.DynClient.Resource(gvrVirtualServices).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, vs := range vsList.Items {
			id := vs.GetNamespace() + "/vs-" + vs.GetName()
			if !nodeSet[id] {
				nodeSet[id] = true
				nodes = append(nodes, TopologyNode{
					ID: id, Name: vs.GetName(), Namespace: vs.GetNamespace(), Type: "virtualservice", Status: "active",
				})
			}
			hosts := extractStringSlice(vs.Object, "spec", "hosts")
			destinations := extractHTTPRouteDestinations(vs.Object)
			for _, host := range hosts {
				sourceID := vs.GetNamespace() + "/" + host
				if !nodeSet[sourceID] {
					nodeSet[sourceID] = true
					nodes = append(nodes, TopologyNode{
						ID: sourceID, Name: host, Namespace: vs.GetNamespace(), Type: "service", Status: "active",
					})
				}
				for _, dest := range destinations {
					targetID := vs.GetNamespace() + "/" + dest.host
					if !nodeSet[targetID] {
						nodeSet[targetID] = true
						nodes = append(nodes, TopologyNode{
							ID: targetID, Name: dest.host, Namespace: vs.GetNamespace(), Type: "service", Status: "active",
						})
					}
					edges = append(edges, TopologyEdge{Source: sourceID, Target: targetID, Protocol: "http", Weight: dest.weight})
				}
			}
		}
	}

	drList, err := client.DynClient.Resource(gvrDestinationRules).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, dr := range drList.Items {
			id := dr.GetNamespace() + "/dr-" + dr.GetName()
			if !nodeSet[id] {
				nodeSet[id] = true
				nodes = append(nodes, TopologyNode{
					ID: id, Name: dr.GetName(), Namespace: dr.GetNamespace(), Type: "destinationrule", Status: "active",
				})
			}
			host, _, _ := unstructured.NestedString(dr.Object, "spec", "host")
			if host != "" {
				targetID := dr.GetNamespace() + "/" + host
				if !nodeSet[targetID] {
					nodeSet[targetID] = true
					nodes = append(nodes, TopologyNode{
						ID: targetID, Name: host, Namespace: dr.GetNamespace(), Type: "service", Status: "active",
					})
				}
				edges = append(edges, TopologyEdge{Source: id, Target: targetID})
			}
		}
	}

	seList, err := client.DynClient.Resource(gvrServiceEntries).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, se := range seList.Items {
			id := se.GetNamespace() + "/se-" + se.GetName()
			if !nodeSet[id] {
				nodeSet[id] = true
				nodes = append(nodes, TopologyNode{
					ID: id, Name: se.GetName(), Namespace: se.GetNamespace(), Type: "serviceentry", Status: "active",
				})
			}
		}
	}

	return nodes, edges
}

func (h *trafficHandler) buildTrafficGraph(ctx context.Context, promURL, namespace string) (*TrafficResponse, error) {
	// Query edge request rates
	rateQuery := `sum(rate(istio_requests_total{reporter="source"}[5m])) by (source_workload, source_workload_namespace, destination_service, destination_service_namespace, request_protocol)`
	if namespace != "" {
		rateQuery = fmt.Sprintf(`sum(rate(istio_requests_total{reporter="source",source_workload_namespace="%s"}[5m])) by (source_workload, source_workload_namespace, destination_service, destination_service_namespace, request_protocol)`, namespace)
	}

	// Query edge error rates
	errQuery := `sum(rate(istio_requests_total{reporter="source",response_code=~"5.."}[5m])) by (source_workload, source_workload_namespace, destination_service, destination_service_namespace)`
	if namespace != "" {
		errQuery = fmt.Sprintf(`sum(rate(istio_requests_total{reporter="source",response_code=~"5..",source_workload_namespace="%s"}[5m])) by (source_workload, source_workload_namespace, destination_service, destination_service_namespace)`, namespace)
	}

	rateResult, err := queryPrometheus(ctx, promURL, rateQuery)
	if err != nil {
		return nil, fmt.Errorf("rate query failed: %w", err)
	}

	errResult, err := queryPrometheus(ctx, promURL, errQuery)
	if err != nil {
		return nil, fmt.Errorf("error rate query failed: %w", err)
	}

	// Build error rate lookup
	errRates := make(map[string]float64)
	for _, r := range errResult.Data.Result {
		key := r.Metric["source_workload"] + "/" + r.Metric["source_workload_namespace"] + "->" + r.Metric["destination_service"] + "/" + r.Metric["destination_service_namespace"]
		if val, ok := r.Value[1].(string); ok {
			var f float64
			fmt.Sscanf(val, "%f", &f)
			errRates[key] = f
		}
	}

	nodeMap := make(map[string]*TrafficNode)
	edgeList := make([]TrafficEdge, 0)

	for _, r := range rateResult.Data.Result {
		srcWorkload := r.Metric["source_workload"]
		srcNs := r.Metric["source_workload_namespace"]
		destSvc := r.Metric["destination_service"]
		destNs := r.Metric["destination_service_namespace"]
		protocol := r.Metric["request_protocol"]

		var reqRate float64
		if val, ok := r.Value[1].(string); ok {
			fmt.Sscanf(val, "%f", &reqRate)
		}
		if reqRate < 0.001 {
			continue
		}

		srcID := srcNs + "/" + srcWorkload
		destID := destNs + "/" + destSvc
		errKey := srcWorkload + "/" + srcNs + "->" + destSvc + "/" + destNs
		errRate := errRates[errKey]

		if _, ok := nodeMap[srcID]; !ok {
			nodeMap[srcID] = &TrafficNode{
				ID: srcID, Name: srcWorkload, Namespace: srcNs, Type: "workload", App: srcWorkload,
			}
		}
		if _, ok := nodeMap[destID]; !ok {
			nodeMap[destID] = &TrafficNode{
				ID: destID, Name: destSvc, Namespace: destNs, Type: "service", App: destSvc,
			}
		}

		// Accumulate request rates on nodes
		nodeMap[srcID].RequestRate += reqRate
		nodeMap[destID].RequestRate += reqRate

		var errPct float64
		if reqRate > 0 {
			errPct = (errRate / reqRate) * 100
		}

		edgeList = append(edgeList, TrafficEdge{
			Source: srcID, Target: destID, Protocol: protocol,
			RequestRate: reqRate, ErrorRate: errPct,
		})
	}

	nodes := make([]TrafficNode, 0, len(nodeMap))
	for _, n := range nodeMap {
		nodes = append(nodes, *n)
	}

	return &TrafficResponse{
		Mode:  "traffic",
		Nodes: nodes,
		Edges: edgeList,
	}, nil
}

func queryPrometheus(ctx context.Context, promURL, query string) (*prometheusResult, error) {
	u, err := url.Parse(promURL + "/api/v1/query")
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("query", query)
	u.RawQuery = q.Encode()

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("prometheus returned %d: %s", resp.StatusCode, string(body))
	}

	var result prometheusResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode prometheus response: %w", err)
	}
	if result.Status != "success" {
		return nil, fmt.Errorf("prometheus query failed: status=%s", result.Status)
	}
	return &result, nil
}
