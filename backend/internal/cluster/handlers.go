package cluster

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"

	"github.com/darkden-lab/argus/backend/internal/httputil"
)

type Handlers struct {
	manager *Manager
}

func NewHandlers(manager *Manager) *Handlers {
	return &Handlers{manager: manager}
}

func (h *Handlers) RegisterRoutes(r *mux.Router) {
	api := r.PathPrefix("/api/clusters").Subrouter()
	api.HandleFunc("", h.handleCreate).Methods("POST")
	api.HandleFunc("", h.handleList).Methods("GET")
	api.HandleFunc("/{id}", h.handleGet).Methods("GET")
	api.HandleFunc("/{id}", h.handleDelete).Methods("DELETE")
	api.HandleFunc("/{id}/health", h.handleHealthCheck).Methods("POST")
}

type createClusterRequest struct {
	Name         string `json:"name"`
	APIServerURL string `json:"api_server_url"`
	Kubeconfig   string `json:"kubeconfig"`
}

func (h *Handlers) handleCreate(w http.ResponseWriter, r *http.Request) {
	var req createClusterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || req.APIServerURL == "" || req.Kubeconfig == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name, api_server_url, and kubeconfig are required")
		return
	}

	cluster, err := h.manager.AddCluster(r.Context(), req.Name, req.APIServerURL, []byte(req.Kubeconfig))
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to add cluster")
		return
	}

	httputil.WriteJSON(w, http.StatusCreated, cluster)
}

func (h *Handlers) handleList(w http.ResponseWriter, r *http.Request) {
	clusters, err := h.manager.ListClusters(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list clusters")
		return
	}

	if clusters == nil {
		clusters = []*Cluster{}
	}

	httputil.WriteJSON(w, http.StatusOK, clusters)
}

func (h *Handlers) handleGet(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	cluster, err := h.manager.store.GetCluster(r.Context(), id)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "cluster not found")
		return
	}

	httputil.WriteJSON(w, http.StatusOK, cluster)
}

func (h *Handlers) handleDelete(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	if err := h.manager.RemoveCluster(r.Context(), id); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to remove cluster")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) handleHealthCheck(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]

	client, err := h.manager.GetClient(id)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "cluster not found")
		return
	}

	_, err = client.Clientset.Discovery().ServerVersion()
	status := "connected"
	if err != nil {
		status = "unreachable"
	}

	_ = h.manager.store.UpdateClusterStatus(r.Context(), id, status)

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": status})
}
