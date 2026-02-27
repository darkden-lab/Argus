package istio

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// TopologyNode represents a node in the service mesh topology graph.
type TopologyNode struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Type      string `json:"type"`
	Status    string `json:"status"`
}

// TopologyEdge represents an edge (connection) in the topology graph.
type TopologyEdge struct {
	Source   string `json:"source"`
	Target   string `json:"target"`
	Protocol string `json:"protocol,omitempty"`
	Weight   int    `json:"weight,omitempty"`
}

// TopologyResponse is the response envelope for the topology endpoint.
type TopologyResponse struct {
	Nodes []TopologyNode `json:"nodes"`
	Edges []TopologyEdge `json:"edges"`
}

// topologyHandler handles GET /api/plugins/istio/{cluster}/topology
type topologyHandler struct {
	cm *cluster.Manager
}

func newTopologyHandler(cm *cluster.Manager) *topologyHandler {
	return &topologyHandler{cm: cm}
}

// RegisterRoutes registers the topology endpoint on the given router.
func (t *topologyHandler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/plugins/istio/{cluster}/topology", t.GetTopology).Methods("GET")
}

// GetTopology aggregates Istio resources and returns a service mesh topology graph.
func (t *topologyHandler) GetTopology(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]
	namespace := r.URL.Query().Get("namespace")

	client, err := t.cm.GetClient(clusterID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errMsg("cluster not found"))
		return
	}

	nodes := make([]TopologyNode, 0)
	edges := make([]TopologyEdge, 0)
	nodeSet := make(map[string]bool)

	// Fetch Services (core K8s)
	svcGVR := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
	svcList, err := client.DynClient.Resource(svcGVR).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err == nil {
		for _, svc := range svcList.Items {
			id := svc.GetNamespace() + "/" + svc.GetName()
			if !nodeSet[id] {
				nodeSet[id] = true
				nodes = append(nodes, TopologyNode{
					ID:        id,
					Name:      svc.GetName(),
					Namespace: svc.GetNamespace(),
					Type:      "service",
					Status:    "active",
				})
			}
		}
	}

	// Fetch VirtualServices
	vsList, err := client.DynClient.Resource(gvrVirtualServices).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err == nil {
		for _, vs := range vsList.Items {
			id := vs.GetNamespace() + "/vs-" + vs.GetName()
			if !nodeSet[id] {
				nodeSet[id] = true
				nodes = append(nodes, TopologyNode{
					ID:        id,
					Name:      vs.GetName(),
					Namespace: vs.GetNamespace(),
					Type:      "virtualservice",
					Status:    "active",
				})
			}

			// Extract edges from VirtualService hosts -> route destinations
			hosts := extractStringSlice(vs.Object, "spec", "hosts")
			destinations := extractHTTPRouteDestinations(vs.Object)

			for _, host := range hosts {
				sourceID := vs.GetNamespace() + "/" + host
				if !nodeSet[sourceID] {
					nodeSet[sourceID] = true
					nodes = append(nodes, TopologyNode{
						ID:        sourceID,
						Name:      host,
						Namespace: vs.GetNamespace(),
						Type:      "service",
						Status:    "active",
					})
				}
				for _, dest := range destinations {
					targetID := vs.GetNamespace() + "/" + dest.host
					if !nodeSet[targetID] {
						nodeSet[targetID] = true
						nodes = append(nodes, TopologyNode{
							ID:        targetID,
							Name:      dest.host,
							Namespace: vs.GetNamespace(),
							Type:      "service",
							Status:    "active",
						})
					}
					edges = append(edges, TopologyEdge{
						Source:   sourceID,
						Target:   targetID,
						Protocol: "http",
						Weight:   dest.weight,
					})
				}
			}
		}
	}

	// Fetch DestinationRules
	drList, err := client.DynClient.Resource(gvrDestinationRules).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err == nil {
		for _, dr := range drList.Items {
			id := dr.GetNamespace() + "/dr-" + dr.GetName()
			if !nodeSet[id] {
				nodeSet[id] = true
				nodes = append(nodes, TopologyNode{
					ID:        id,
					Name:      dr.GetName(),
					Namespace: dr.GetNamespace(),
					Type:      "destinationrule",
					Status:    "active",
				})
			}

			// Link DestinationRule to its target host
			host, _, _ := unstructured.NestedString(dr.Object, "spec", "host")
			if host != "" {
				targetID := dr.GetNamespace() + "/" + host
				if !nodeSet[targetID] {
					nodeSet[targetID] = true
					nodes = append(nodes, TopologyNode{
						ID:        targetID,
						Name:      host,
						Namespace: dr.GetNamespace(),
						Type:      "service",
						Status:    "active",
					})
				}
				edges = append(edges, TopologyEdge{
					Source: id,
					Target: targetID,
				})
			}
		}
	}

	// Fetch ServiceEntries
	seList, err := client.DynClient.Resource(gvrServiceEntries).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err == nil {
		for _, se := range seList.Items {
			id := se.GetNamespace() + "/se-" + se.GetName()
			if !nodeSet[id] {
				nodeSet[id] = true
				nodes = append(nodes, TopologyNode{
					ID:        id,
					Name:      se.GetName(),
					Namespace: se.GetNamespace(),
					Type:      "serviceentry",
					Status:    "active",
				})
			}
		}
	}

	writeJSON(w, http.StatusOK, TopologyResponse{
		Nodes: nodes,
		Edges: edges,
	})
}

// routeDestination holds an extracted destination host and weight.
type routeDestination struct {
	host   string
	weight int
}

// extractHTTPRouteDestinations extracts destination hosts and weights from
// VirtualService spec.http[].route[].destination.
func extractHTTPRouteDestinations(obj map[string]interface{}) []routeDestination {
	var dests []routeDestination

	httpRoutes, found, _ := unstructured.NestedSlice(obj, "spec", "http")
	if !found {
		return dests
	}

	for _, httpRoute := range httpRoutes {
		routeMap, ok := httpRoute.(map[string]interface{})
		if !ok {
			continue
		}
		routes, found, _ := unstructured.NestedSlice(routeMap, "route")
		if !found {
			continue
		}
		for _, route := range routes {
			routeEntry, ok := route.(map[string]interface{})
			if !ok {
				continue
			}
			host, _, _ := unstructured.NestedString(routeEntry, "destination", "host")
			weight, _, _ := unstructured.NestedFieldNoCopy(routeEntry, "weight")
			w := 100
			if wf, ok := weight.(int64); ok {
				w = int(wf)
			} else if wf, ok := weight.(float64); ok {
				w = int(wf)
			}
			if host != "" {
				dests = append(dests, routeDestination{host: host, weight: w})
			}
		}
	}

	return dests
}

// extractStringSlice extracts a string slice from a nested field.
func extractStringSlice(obj map[string]interface{}, fields ...string) []string {
	slice, found, _ := unstructured.NestedStringSlice(obj, fields...)
	if !found {
		return nil
	}
	return slice
}
