package ceph

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/k8s-dashboard/backend/internal/cluster"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// handlers holds the ClusterManager reference used by all Ceph HTTP handlers.
type handlers struct {
	cm *cluster.Manager
}

func newHandlers(cm *cluster.Manager) *handlers {
	return &handlers{cm: cm}
}

// --- CephClusters ---

func (h *handlers) ListCephClusters(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrCephClusters)
}

func (h *handlers) GetCephCluster(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrCephClusters)
}

func (h *handlers) CreateCephCluster(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrCephClusters)
}

func (h *handlers) UpdateCephCluster(w http.ResponseWriter, r *http.Request) {
	h.update(w, r, gvrCephClusters)
}

func (h *handlers) DeleteCephCluster(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrCephClusters)
}

// --- CephBlockPools ---

func (h *handlers) ListCephBlockPools(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrCephBlockPools)
}

func (h *handlers) GetCephBlockPool(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrCephBlockPools)
}

func (h *handlers) CreateCephBlockPool(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrCephBlockPools)
}

func (h *handlers) UpdateCephBlockPool(w http.ResponseWriter, r *http.Request) {
	h.update(w, r, gvrCephBlockPools)
}

func (h *handlers) DeleteCephBlockPool(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrCephBlockPools)
}

// --- CephFilesystems ---

func (h *handlers) ListCephFilesystems(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrCephFilesystems)
}

func (h *handlers) GetCephFilesystem(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrCephFilesystems)
}

func (h *handlers) CreateCephFilesystem(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrCephFilesystems)
}

func (h *handlers) UpdateCephFilesystem(w http.ResponseWriter, r *http.Request) {
	h.update(w, r, gvrCephFilesystems)
}

func (h *handlers) DeleteCephFilesystem(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrCephFilesystems)
}

// --- CephObjectStores ---

func (h *handlers) ListCephObjectStores(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrCephObjectStores)
}

func (h *handlers) GetCephObjectStore(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrCephObjectStores)
}

func (h *handlers) CreateCephObjectStore(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrCephObjectStores)
}

func (h *handlers) UpdateCephObjectStore(w http.ResponseWriter, r *http.Request) {
	h.update(w, r, gvrCephObjectStores)
}

func (h *handlers) DeleteCephObjectStore(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrCephObjectStores)
}

// --- CephObjectStoreUsers ---

func (h *handlers) ListCephObjectStoreUsers(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrCephObjectStoreUsers)
}

func (h *handlers) CreateCephObjectStoreUser(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrCephObjectStoreUsers)
}

func (h *handlers) DeleteCephObjectStoreUser(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrCephObjectStoreUsers)
}

// --- Generic dynamic-client helpers ---

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

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func errMsg(msg string) map[string]string {
	return map[string]string{"error": msg}
}
