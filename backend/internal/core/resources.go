package core

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/httputil"
	"github.com/darkden-lab/argus/backend/pkg/agentpb"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// agentProxyTimeout is the maximum time to wait for an agent to respond.
const agentProxyTimeout = 30 * time.Second

// maxRequestBodySize limits request body size for Create/Update operations.
const maxRequestBodySize = 2 * 1024 * 1024 // 2MB

// k8sNameSegment validates a single Kubernetes path segment (namespace, name, resource, version, group).
// Rejects path traversal characters (/, ..) and empty strings.
var k8sNameSegment = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9.\-]{0,252}$`)

func isValidK8sSegment(s string) bool {
	if s == "" {
		return true // empty is allowed (optional namespace/name)
	}
	return k8sNameSegment.MatchString(s) && !strings.Contains(s, "..")
}

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

// k8sAPIPath builds the Kubernetes API path for a given GVR, namespace, and optional resource name.
func k8sAPIPath(gvr schema.GroupVersionResource, namespace, name string) string {
	var base string
	if gvr.Group == "" {
		base = fmt.Sprintf("/api/%s", gvr.Version)
	} else {
		base = fmt.Sprintf("/apis/%s/%s", gvr.Group, gvr.Version)
	}

	if namespace != "" {
		base += fmt.Sprintf("/namespaces/%s", namespace)
	}
	base += "/" + gvr.Resource

	if name != "" {
		base += "/" + name
	}
	return base
}

// proxyAgentResponse sends a K8s API request through the gRPC agent and writes
// the raw JSON response. This is the shared implementation used by both
// ResourceHandler and ConvenienceHandlers to avoid duplicating proxy logic.
func proxyAgentResponse(w http.ResponseWriter, r *http.Request, mgr *cluster.Manager, clusterID string, req *agentpb.K8SRequest) {
	agentSrv := mgr.GetAgentServer()
	if agentSrv == nil || !agentSrv.IsAgentConnected(clusterID) {
		httputil.WriteError(w, http.StatusNotFound, "cluster not found or agent not connected")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), agentProxyTimeout)
	defer cancel()

	resp, err := agentSrv.SendK8sRequest(ctx, clusterID, req)
	if err != nil {
		httputil.WriteError(w, http.StatusBadGateway, fmt.Sprintf("agent request failed: %v", err))
		return
	}

	if resp.Error != "" {
		status := int(resp.StatusCode)
		if status == 0 {
			status = http.StatusInternalServerError
		}
		httputil.WriteError(w, status, resp.Error)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	status := int(resp.StatusCode)
	if status == 0 {
		status = http.StatusOK
	}
	w.WriteHeader(status)
	w.Write(resp.Body) //nolint:errcheck
}

// validatePathSegments checks that namespace and name values are safe for K8s API path construction.
func validatePathSegments(w http.ResponseWriter, namespace, name string) bool {
	if !isValidK8sSegment(namespace) {
		httputil.WriteError(w, http.StatusBadRequest, "invalid namespace")
		return false
	}
	if !isValidK8sSegment(name) {
		httputil.WriteError(w, http.StatusBadRequest, "invalid resource name")
		return false
	}
	return true
}

// List returns a JSON array of resources matching the optional ?namespace= query param.
func (h *ResourceHandler) List(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["clusterID"]
	gvr := gvrFromVars(vars)
	namespace := r.URL.Query().Get("namespace")
	if !validatePathSegments(w, namespace, "") {
		return
	}

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		// Fallback to agent proxy.
		proxyAgentResponse(w, r, h.clusterMgr, clusterID, &agentpb.K8SRequest{
			Method: "GET",
			Path:   k8sAPIPath(gvr, namespace, ""),
		})
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
	if !validatePathSegments(w, namespace, name) {
		return
	}

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		proxyAgentResponse(w, r, h.clusterMgr, clusterID, &agentpb.K8SRequest{
			Method: "GET",
			Path:   k8sAPIPath(gvr, namespace, name),
		})
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
	if !validatePathSegments(w, namespace, "") {
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBodySize))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "failed to read request body")
		return
	}

	client, clientErr := h.clusterMgr.GetClient(clusterID)
	if clientErr != nil {
		proxyAgentResponse(w, r, h.clusterMgr, clusterID, &agentpb.K8SRequest{
			Method: "POST",
			Path:   k8sAPIPath(gvr, namespace, ""),
			Body:   body,
		})
		return
	}

	var obj unstructured.Unstructured
	if err := json.Unmarshal(body, &obj.Object); err != nil {
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
	name := vars["name"]
	gvr := gvrFromVars(vars)
	namespace := r.URL.Query().Get("namespace")
	if !validatePathSegments(w, namespace, name) {
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBodySize))
	if err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "failed to read request body")
		return
	}

	client, clientErr := h.clusterMgr.GetClient(clusterID)
	if clientErr != nil {
		proxyAgentResponse(w, r, h.clusterMgr, clusterID, &agentpb.K8SRequest{
			Method: "PUT",
			Path:   k8sAPIPath(gvr, namespace, name),
			Body:   body,
		})
		return
	}

	var obj unstructured.Unstructured
	if err := json.Unmarshal(body, &obj.Object); err != nil {
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
	if !validatePathSegments(w, namespace, name) {
		return
	}

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		proxyAgentResponse(w, r, h.clusterMgr, clusterID, &agentpb.K8SRequest{
			Method: "DELETE",
			Path:   k8sAPIPath(gvr, namespace, name),
		})
		return
	}

	if err := client.DynClient.Resource(gvr).Namespace(namespace).Delete(r.Context(), name, metav1.DeleteOptions{}); err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
