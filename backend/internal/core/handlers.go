package core

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/k8s-dashboard/backend/internal/cluster"
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

// ListNamespaces returns all namespaces in the cluster.
func (h *ConvenienceHandlers) ListNamespaces(w http.ResponseWriter, r *http.Request) {
	client, err := h.getClient(w, r)
	if err != nil {
		return
	}

	nsList, err := client.Clientset.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, nsList)
}

// ListNodes returns all nodes in the cluster.
func (h *ConvenienceHandlers) ListNodes(w http.ResponseWriter, r *http.Request) {
	client, err := h.getClient(w, r)
	if err != nil {
		return
	}

	nodeList, err := client.Clientset.CoreV1().Nodes().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, nodeList)
}

// ListEvents returns events in a given namespace (all namespaces if ?namespace is empty).
func (h *ConvenienceHandlers) ListEvents(w http.ResponseWriter, r *http.Request) {
	client, err := h.getClient(w, r)
	if err != nil {
		return
	}

	namespace := r.URL.Query().Get("namespace")

	// Use the dynamic client so we can list across namespaces without the typed
	// client requiring a specific namespace interface.
	gvr := schema.GroupVersionResource{Group: "", Version: "v1", Resource: "events"}
	eventList, err := client.DynClient.Resource(gvr).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
		return
	}

	writeJSON(w, http.StatusOK, eventList)
}

// getClient is a helper that extracts the clusterID from the URL and returns
// the corresponding ClusterClient, writing an error response on failure.
func (h *ConvenienceHandlers) getClient(w http.ResponseWriter, r *http.Request) (*cluster.ClusterClient, error) {
	clusterID := mux.Vars(r)["clusterID"]
	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errMsg("cluster not found"))
		return nil, err
	}
	return client, nil
}

// writeJSON is a shared JSON response helper used across the core package.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func errMsg(msg string) map[string]string {
	return map[string]string{"error": msg}
}
