package keda

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/k8s-dashboard/backend/internal/cluster"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

type handlers struct {
	cm *cluster.Manager
}

func newHandlers(cm *cluster.Manager) *handlers {
	return &handlers{cm: cm}
}

// --- ScaledObjects ---

func (h *handlers) ListScaledObjects(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrScaledObjects, true)
}
func (h *handlers) GetScaledObject(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrScaledObjects, true)
}
func (h *handlers) CreateScaledObject(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrScaledObjects, true)
}
func (h *handlers) UpdateScaledObject(w http.ResponseWriter, r *http.Request) {
	h.update(w, r, gvrScaledObjects, true)
}
func (h *handlers) DeleteScaledObject(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrScaledObjects, true)
}

// --- ScaledJobs ---

func (h *handlers) ListScaledJobs(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrScaledJobs, true)
}
func (h *handlers) GetScaledJob(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrScaledJobs, true)
}
func (h *handlers) CreateScaledJob(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrScaledJobs, true)
}
func (h *handlers) UpdateScaledJob(w http.ResponseWriter, r *http.Request) {
	h.update(w, r, gvrScaledJobs, true)
}
func (h *handlers) DeleteScaledJob(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrScaledJobs, true)
}

// --- TriggerAuthentications (namespaced) ---

func (h *handlers) ListTriggerAuthentications(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrTriggerAuthentications, true)
}
func (h *handlers) GetTriggerAuthentication(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrTriggerAuthentications, true)
}
func (h *handlers) CreateTriggerAuthentication(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrTriggerAuthentications, true)
}
func (h *handlers) DeleteTriggerAuthentication(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrTriggerAuthentications, true)
}

// --- ClusterTriggerAuthentications (cluster-scoped, no namespace) ---

func (h *handlers) ListClusterTriggerAuthentications(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrClusterTriggerAuthentications, false)
}
func (h *handlers) GetClusterTriggerAuthentication(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrClusterTriggerAuthentications, false)
}
func (h *handlers) DeleteClusterTriggerAuthentication(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrClusterTriggerAuthentications, false)
}

// --- Generic helpers ---

// clusterAndNamespace extracts ?clusterID= and ?namespace= from the query string.
// If namespaced is false the namespace is ignored (cluster-scoped resources).
func clusterAndNamespace(r *http.Request, namespaced bool) (clusterID, namespace string) {
	q := r.URL.Query()
	clusterID = q.Get("clusterID")
	if namespaced {
		namespace = q.Get("namespace")
	}
	return
}

func (h *handlers) list(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource, namespaced bool) {
	clusterID, namespace := clusterAndNamespace(r, namespaced)
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

func (h *handlers) get(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource, namespaced bool) {
	clusterID, namespace := clusterAndNamespace(r, namespaced)
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

func (h *handlers) create(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource, namespaced bool) {
	clusterID, namespace := clusterAndNamespace(r, namespaced)

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

func (h *handlers) update(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource, namespaced bool) {
	clusterID, namespace := clusterAndNamespace(r, namespaced)

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

func (h *handlers) del(w http.ResponseWriter, r *http.Request, gvr schema.GroupVersionResource, namespaced bool) {
	clusterID, namespace := clusterAndNamespace(r, namespaced)
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

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func errMsg(msg string) map[string]string {
	return map[string]string{"error": msg}
}
