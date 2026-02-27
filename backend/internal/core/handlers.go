package core

import (
	"fmt"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/httputil"
	"github.com/darkden-lab/argus/backend/pkg/agentpb"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// ConvenienceHandlers provides pre-built endpoints for frequently accessed
// K8s resources (namespaces, nodes, events) so callers don't have to construct
// the generic /resources/{group}/{version}/{resource} URL themselves.
type ConvenienceHandlers struct {
	clusterMgr *cluster.Manager
}

func NewConvenienceHandlers(cm *cluster.Manager) *ConvenienceHandlers {
	return &ConvenienceHandlers{clusterMgr: cm}
}

// RegisterRoutes attaches all convenience endpoints to the provided router.
func (h *ConvenienceHandlers) RegisterRoutes(r *mux.Router) {
	api := r.PathPrefix("/api/clusters/{clusterID}").Subrouter()
	api.HandleFunc("/namespaces", h.ListNamespaces).Methods(http.MethodGet)
	api.HandleFunc("/nodes", h.ListNodes).Methods(http.MethodGet)
	api.HandleFunc("/events", h.ListEvents).Methods(http.MethodGet)
}

// proxyAgentList is a convenience wrapper around proxyAgentResponse for GET requests.
func (h *ConvenienceHandlers) proxyAgentList(w http.ResponseWriter, r *http.Request, clusterID, path string) {
	proxyAgentResponse(w, r, h.clusterMgr, clusterID, &agentpb.K8SRequest{
		Method: "GET",
		Path:   path,
	})
}

// ListNamespaces returns all namespaces in the cluster.
func (h *ConvenienceHandlers) ListNamespaces(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		h.proxyAgentList(w, r, clusterID, "/api/v1/namespaces")
		return
	}

	nsList, err := client.Clientset.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	type nsEntry struct {
		Name string `json:"name"`
	}
	entries := make([]nsEntry, len(nsList.Items))
	for i, ns := range nsList.Items {
		entries[i] = nsEntry{Name: ns.Name}
	}
	httputil.WriteJSON(w, http.StatusOK, entries)
}

// ListNodes returns all nodes in the cluster.
func (h *ConvenienceHandlers) ListNodes(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		h.proxyAgentList(w, r, clusterID, "/api/v1/nodes")
		return
	}

	nodeList, err := client.Clientset.CoreV1().Nodes().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, nodeList)
}

// ListEvents returns events in a given namespace (all namespaces if ?namespace is empty).
func (h *ConvenienceHandlers) ListEvents(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]
	namespace := r.URL.Query().Get("namespace")
	if !isValidK8sSegment(namespace) {
		httputil.WriteError(w, http.StatusBadRequest, "invalid namespace")
		return
	}

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		path := "/api/v1/events"
		if namespace != "" {
			path = fmt.Sprintf("/api/v1/namespaces/%s/events", namespace)
		}
		h.proxyAgentList(w, r, clusterID, path)
		return
	}

	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "events"}
	eventList, err := client.DynClient.Resource(gvr).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, eventList)
}
