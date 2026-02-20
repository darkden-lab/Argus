package istio

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// handlers holds the ClusterManager reference used by all Istio HTTP handlers.
type handlers struct {
	cm *cluster.Manager
}

func newHandlers(cm *cluster.Manager) *handlers {
	return &handlers{cm: cm}
}

// --- VirtualServices ---

func (h *handlers) ListVirtualServices(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrVirtualServices)
}

func (h *handlers) GetVirtualService(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrVirtualServices)
}

func (h *handlers) CreateVirtualService(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrVirtualServices)
}

func (h *handlers) UpdateVirtualService(w http.ResponseWriter, r *http.Request) {
	h.update(w, r, gvrVirtualServices)
}

func (h *handlers) DeleteVirtualService(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrVirtualServices)
}

// --- Gateways ---

func (h *handlers) ListGateways(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrGateways)
}

func (h *handlers) GetGateway(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrGateways)
}

func (h *handlers) CreateGateway(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrGateways)
}

func (h *handlers) DeleteGateway(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrGateways)
}

// --- DestinationRules ---

func (h *handlers) ListDestinationRules(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrDestinationRules)
}

// --- ServiceEntries ---

func (h *handlers) ListServiceEntries(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrServiceEntries)
}

// --- Generic dynamic-client helpers ---

// clusterAndNamespace extracts ?clusterID= and ?namespace= query params.
func clusterAndNamespace(r *http.Request) (clusterID, namespace string) {
	q := r.URL.Query()
	return q.Get("clusterID"), q.Get("namespace")
}

func (h *handlers) list(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource) {
	clusterID, namespace := clusterAndNamespace(r)
	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errMsg("cluster not found"))
		return
	}

	list, err := client.DynClient.Resource(gvr).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *handlers) get(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource) {
	clusterID, namespace := clusterAndNamespace(r)
	name := mux.Vars(r)["name"]

	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errMsg("cluster not found"))
		return
	}

	obj, err := client.DynClient.Resource(gvr).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		writeJSON(w, http.StatusNotFound, errMsg(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, obj)
}

func (h *handlers) create(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource) {
	clusterID, namespace := clusterAndNamespace(r)

	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errMsg("cluster not found"))
		return
	}

	var obj unstructured.Unstructured
	if err := json.NewDecoder(r.Body).Decode(&obj.Object); err != nil {
		writeJSON(w, http.StatusBadRequest, errMsg("invalid request body"))
		return
	}

	created, err := client.DynClient.Resource(gvr).Namespace(namespace).Create(r.Context(), &obj, metav1.CreateOptions{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (h *handlers) update(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource) {
	clusterID, namespace := clusterAndNamespace(r)

	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errMsg("cluster not found"))
		return
	}

	var obj unstructured.Unstructured
	if err := json.NewDecoder(r.Body).Decode(&obj.Object); err != nil {
		writeJSON(w, http.StatusBadRequest, errMsg("invalid request body"))
		return
	}

	updated, err := client.DynClient.Resource(gvr).Namespace(namespace).Update(r.Context(), &obj, metav1.UpdateOptions{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *handlers) del(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource) {
	clusterID, namespace := clusterAndNamespace(r)
	name := mux.Vars(r)["name"]

	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, errMsg("cluster not found"))
		return
	}

	if err := client.DynClient.Resource(gvr).Namespace(namespace).Delete(r.Context(), name, metav1.DeleteOptions{}); err != nil {
		writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// writeJSON serialises data as JSON with the given HTTP status.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func errMsg(msg string) map[string]string {
	return map[string]string{"error": msg}
}
