package core

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/httputil"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// ResourceHandler handles generic CRUD operations on any K8s resource
// using the dynamic client. Group "_" is treated as the core group (empty string).
type ResourceHandler struct {
	clusterMgr *cluster.Manager
}

func NewResourceHandler(cm *cluster.Manager) *ResourceHandler {
	return &ResourceHandler{clusterMgr: cm}
}

// RegisterRoutes wires the generic resource CRUD routes.
// URL pattern: /api/clusters/{clusterID}/resources/{group}/{version}/{resource}
func (h *ResourceHandler) RegisterRoutes(r *mux.Router) {
	base := r.PathPrefix("/api/clusters/{clusterID}/resources/{group}/{version}/{resource}").Subrouter()
	base.HandleFunc("", h.List).Methods(http.MethodGet)
	base.HandleFunc("", h.Create).Methods(http.MethodPost)
	base.HandleFunc("/{name}", h.Get).Methods(http.MethodGet)
	base.HandleFunc("/{name}", h.Update).Methods(http.MethodPut)
	base.HandleFunc("/{name}", h.Delete).Methods(http.MethodDelete)
}

// gvr builds a schema.GroupVersionResource from URL path variables.
// "_" is the placeholder for the core API group (empty string).
func gvrFromVars(vars map[string]string) schema.GroupVersionResource {
	group := vars["group"]
	if group == "_" {
		group = ""
	}
	return schema.GroupVersionResource{
		Group:    group,
		Version:  vars["version"],
		Resource: vars["resource"],
	}
}

// List returns a JSON array of resources matching the optional ?namespace= query param.
func (h *ResourceHandler) List(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["clusterID"]
	gvr := gvrFromVars(vars)
	namespace := r.URL.Query().Get("namespace")

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "cluster not found")
		return
	}

	list, err := client.DynClient.Resource(gvr).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, list)
}

// Get returns a single named resource.
func (h *ResourceHandler) Get(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["clusterID"]
	name := vars["name"]
	gvr := gvrFromVars(vars)
	namespace := r.URL.Query().Get("namespace")

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "cluster not found")
		return
	}

	obj, err := client.DynClient.Resource(gvr).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, obj)
}

// Create applies the resource from the request body.
func (h *ResourceHandler) Create(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["clusterID"]
	gvr := gvrFromVars(vars)
	namespace := r.URL.Query().Get("namespace")

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "cluster not found")
		return
	}

	var obj unstructured.Unstructured
	if err := json.NewDecoder(r.Body).Decode(&obj.Object); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	created, err := client.DynClient.Resource(gvr).Namespace(namespace).Create(r.Context(), &obj, metav1.CreateOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, created)
}

// Update replaces an existing resource.
func (h *ResourceHandler) Update(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["clusterID"]
	gvr := gvrFromVars(vars)
	namespace := r.URL.Query().Get("namespace")

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "cluster not found")
		return
	}

	var obj unstructured.Unstructured
	if err := json.NewDecoder(r.Body).Decode(&obj.Object); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	updated, err := client.DynClient.Resource(gvr).Namespace(namespace).Update(r.Context(), &obj, metav1.UpdateOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, updated)
}

// Delete removes a named resource.
func (h *ResourceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["clusterID"]
	name := vars["name"]
	gvr := gvrFromVars(vars)
	namespace := r.URL.Query().Get("namespace")

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "cluster not found")
		return
	}

	if err := client.DynClient.Resource(gvr).Namespace(namespace).Delete(r.Context(), name, metav1.DeleteOptions{}); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
