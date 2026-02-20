package prometheus

import (
	"context"
	"encoding/json"
	"io"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/k8s-dashboard/backend/internal/cluster"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const (
	group   = "monitoring.coreos.com"
	version = "v1"
)

type Handlers struct {
	cm *cluster.Manager
}

func NewHandlers(cm *cluster.Manager) *Handlers {
	return &Handlers{cm: cm}
}

func (h *Handlers) gvr(resource string) schema.GroupVersionResource {
	return schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
}

func (h *Handlers) ListResources(resource string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterID := mux.Vars(r)["cluster"]
		namespace := r.URL.Query().Get("namespace")

		client, err := h.cm.GetClient(clusterID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
			return
		}

		var list *unstructured.UnstructuredList
		if namespace != "" {
			list, err = client.DynClient.Resource(h.gvr(resource)).Namespace(namespace).List(context.Background(), metav1.ListOptions{})
		} else {
			list, err = client.DynClient.Resource(h.gvr(resource)).Namespace("").List(context.Background(), metav1.ListOptions{})
		}
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, list.Items)
	}
}

func (h *Handlers) GetResource(resource string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		clusterID := vars["cluster"]
		namespace := vars["namespace"]
		name := vars["name"]

		client, err := h.cm.GetClient(clusterID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
			return
		}

		obj, err := client.DynClient.Resource(h.gvr(resource)).Namespace(namespace).Get(context.Background(), name, metav1.GetOptions{})
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusOK, obj)
	}
}

func (h *Handlers) CreateResource(resource string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		clusterID := mux.Vars(r)["cluster"]

		client, err := h.cm.GetClient(clusterID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
			return
		}

		obj := &unstructured.Unstructured{}
		if err := json.Unmarshal(body, &obj.Object); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		namespace := obj.GetNamespace()
		if namespace == "" {
			namespace = "default"
		}

		created, err := client.DynClient.Resource(h.gvr(resource)).Namespace(namespace).Create(context.Background(), obj, metav1.CreateOptions{})
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		writeJSON(w, http.StatusCreated, created)
	}
}

func (h *Handlers) DeleteResource(resource string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		clusterID := vars["cluster"]
		namespace := vars["namespace"]
		name := vars["name"]

		client, err := h.cm.GetClient(clusterID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
			return
		}

		err = client.DynClient.Resource(h.gvr(resource)).Namespace(namespace).Delete(context.Background(), name, metav1.DeleteOptions{})
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *Handlers) CreateServiceMonitorWizard(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]

	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "cluster not found"})
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}

	var cfg ServiceMonitorConfig
	if err := json.Unmarshal(body, &cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	if cfg.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}

	cfg.ClusterID = clusterID
	obj := GenerateServiceMonitor(cfg)

	namespace := obj.GetNamespace()
	created, err := client.DynClient.Resource(h.gvr("servicemonitors")).Namespace(namespace).Create(context.Background(), obj, metav1.CreateOptions{})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, created)
}

func (h *Handlers) PreviewServiceMonitorWizard(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}

	var cfg ServiceMonitorConfig
	if err := json.Unmarshal(body, &cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	if cfg.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}

	obj := GenerateServiceMonitor(cfg)
	writeJSON(w, http.StatusOK, obj)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
