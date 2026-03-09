package sse

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/ws"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// K8sHandler handles K8s watch events via SSE and REST subscribe/unsubscribe.
type K8sHandler struct {
	hub           *Hub
	jwtService    *auth.JWTService
	apiKeyService *auth.APIKeyService
	wsHub         *ws.Hub
	clusterMgr    *cluster.Manager
}

// NewK8sHandler creates a new K8s SSE handler.
func NewK8sHandler(hub *Hub, jwtService *auth.JWTService, apiKeyService *auth.APIKeyService, wsHub *ws.Hub, clusterMgr *cluster.Manager) *K8sHandler {
	h := &K8sHandler{
		hub:           hub,
		jwtService:    jwtService,
		apiKeyService: apiKeyService,
		wsHub:         wsHub,
		clusterMgr:    clusterMgr,
	}

	// Hook into the ws.Hub to broadcast K8s events to SSE clients
	wsHub.OnEvent(func(event ws.WatchEvent) {
		data, err := json.Marshal(event)
		if err != nil {
			return
		}
		var raw map[string]interface{}
		_ = json.Unmarshal(data, &raw)

		subKey := event.Cluster + "/" + event.Resource + "/" + event.Namespace
		for _, client := range hub.GetAllClients() {
			if client.IsSubscribed(subKey) {
				hub.SendToClient(client.ID, Event{Type: "k8s:watch", Data: raw})
			}
		}
	})

	return h
}

// RegisterRoutes registers K8s SSE and REST endpoints.
func (h *K8sHandler) RegisterRoutes(r *mux.Router, protected *mux.Router) {
	// SSE endpoint — auth handled internally
	r.HandleFunc("/api/k8s/events", h.HandleStream).Methods(http.MethodGet)

	// REST endpoints
	protected.HandleFunc("/api/k8s/watch/subscribe", h.HandleSubscribe).Methods(http.MethodPost)
	protected.HandleFunc("/api/k8s/watch/unsubscribe", h.HandleUnsubscribe).Methods(http.MethodPost)
	protected.HandleFunc("/api/k8s/namespaces", h.HandleListNamespaces).Methods(http.MethodPost)
}

// HandleStream establishes an SSE connection for K8s watch events.
func (h *K8sHandler) HandleStream(w http.ResponseWriter, r *http.Request) {
	claims := RequireAuth(w, r, h.jwtService, h.apiKeyService)
	if claims == nil {
		return
	}

	client := h.hub.Register(claims.UserID, w)
	if client == nil {
		return
	}
	defer h.hub.Unregister(client.ID)

	log.Printf("sse/k8s: user %s connected (client %s)", claims.UserID, client.ID)
	<-r.Context().Done()
	log.Printf("sse/k8s: user %s disconnected (client %s)", claims.UserID, client.ID)
}

type watchRequest struct {
	Cluster   string `json:"cluster"`
	Resource  string `json:"resource"`
	Namespace string `json:"namespace"`
}

// HandleSubscribe subscribes the user's SSE clients to a K8s watch.
func (h *K8sHandler) HandleSubscribe(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req watchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Cluster == "" || req.Resource == "" {
		http.Error(w, `{"error":"cluster and resource are required"}`, http.StatusBadRequest)
		return
	}

	subKey := req.Cluster + "/" + req.Resource + "/" + req.Namespace
	clients := h.hub.GetUserClients(claims.UserID)
	for _, c := range clients {
		c.Subscribe(subKey)
	}

	log.Printf("sse/k8s: user %s subscribed to %s (%d clients)", claims.UserID, subKey, len(clients))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "subscribed", "key": subKey})
}

// HandleUnsubscribe unsubscribes the user's SSE clients from a K8s watch.
func (h *K8sHandler) HandleUnsubscribe(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req watchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	subKey := req.Cluster + "/" + req.Resource + "/" + req.Namespace
	clients := h.hub.GetUserClients(claims.UserID)
	for _, c := range clients {
		c.Unsubscribe(subKey)
	}

	log.Printf("sse/k8s: user %s unsubscribed from %s", claims.UserID, subKey)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "unsubscribed", "key": subKey})
}

type namespacesRequest struct {
	Cluster string `json:"cluster"`
}

// HandleListNamespaces lists namespaces for a cluster.
func (h *K8sHandler) HandleListNamespaces(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok || claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req namespacesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Cluster == "" {
		http.Error(w, `{"error":"cluster is required"}`, http.StatusBadRequest)
		return
	}

	k8sClient, err := h.clusterMgr.GetClient(req.Cluster)
	if err != nil {
		http.Error(w, `{"error":"cluster not available: `+err.Error()+`"}`, http.StatusNotFound)
		return
	}

	nsList, err := k8sClient.Clientset.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		http.Error(w, `{"error":"failed to list namespaces: `+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}

	type nsInfo struct {
		Name   string            `json:"name"`
		Labels map[string]string `json:"labels"`
	}
	entries := make([]nsInfo, len(nsList.Items))
	for i, ns := range nsList.Items {
		entries[i] = nsInfo{Name: ns.Name, Labels: ns.Labels}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cluster":    req.Cluster,
		"namespaces": entries,
	})
}
