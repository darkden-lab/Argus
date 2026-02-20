package mariadb

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/k8s-dashboard/backend/internal/cluster"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// handlers holds the ClusterManager reference used by all MariaDB HTTP handlers.
type handlers struct {
	cm *cluster.Manager
}

func newHandlers(cm *cluster.Manager) *handlers {
	return &handlers{cm: cm}
}

// --- MariaDB instances ---

func (h *handlers) ListMariaDBs(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrMariaDBs)
}

func (h *handlers) GetMariaDB(w http.ResponseWriter, r *http.Request) {
	h.get(w, r, gvrMariaDBs)
}

func (h *handlers) CreateMariaDB(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrMariaDBs)
}

func (h *handlers) UpdateMariaDB(w http.ResponseWriter, r *http.Request) {
	h.update(w, r, gvrMariaDBs)
}

func (h *handlers) DeleteMariaDB(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrMariaDBs)
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

// --- Restores ---

func (h *handlers) ListRestores(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrRestores)
}

func (h *handlers) CreateRestore(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrRestores)
}

func (h *handlers) DeleteRestore(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrRestores)
}

// --- Connections ---

func (h *handlers) ListConnections(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrConnections)
}

func (h *handlers) CreateConnection(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrConnections)
}

func (h *handlers) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrConnections)
}

// --- Databases ---

func (h *handlers) ListDatabases(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrDatabases)
}

func (h *handlers) CreateDatabase(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrDatabases)
}

func (h *handlers) DeleteDatabase(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrDatabases)
}

// --- Users ---

func (h *handlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrUsers)
}

func (h *handlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrUsers)
}

func (h *handlers) DeleteUser(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrUsers)
}

// --- Grants ---

func (h *handlers) ListGrants(w http.ResponseWriter, r *http.Request) {
	h.list(w, r, gvrGrants)
}

func (h *handlers) CreateGrant(w http.ResponseWriter, r *http.Request) {
	h.create(w, r, gvrGrants)
}

func (h *handlers) DeleteGrant(w http.ResponseWriter, r *http.Request) {
	h.del(w, r, gvrGrants)
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
