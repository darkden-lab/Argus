package cnpg

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/k8s-dashboard/backend/internal/cluster"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// handlers holds the ClusterManager reference used by all CNPG HTTP handlers.
type handlers struct {
	cm *cluster.Manager
}

func newHandlers(cm *cluster.Manager) *handlers {
	return &handlers{cm: cm}
}

// --- Clusters ---

func (h *handlers) ListClusters(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrClusters)
}

func (h *handlers) GetCluster(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrClusters)
}

func (h *handlers) CreateCluster(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrClusters)
}

func (h *handlers) UpdateCluster(w http.ResponseWriter, r *http.Request) {
	h.update(w, r, gvrClusters)
}

func (h *handlers) DeleteCluster(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrClusters)
}

// --- Backups ---

func (h *handlers) ListBackups(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrBackups)
}

func (h *handlers) CreateBackup(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrBackups)
}

func (h *handlers) DeleteBackup(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrBackups)
}

// --- ScheduledBackups ---

func (h *handlers) ListScheduledBackups(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrScheduledBackups)
}

func (h *handlers) CreateScheduledBackup(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrScheduledBackups)
}

func (h *handlers) DeleteScheduledBackup(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrScheduledBackups)
}

// --- Poolers ---

func (h *handlers) ListPoolers(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrPoolers)
}

func (h *handlers) CreatePooler(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrPoolers)
}

func (h *handlers) DeletePooler(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrPoolers)
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
