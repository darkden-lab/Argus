package core

import (
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/httputil"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const projectLabel = "argus.darkden.net/projects"

// ProjectSummary represents an aggregated view of a project across namespaces.
type ProjectSummary struct {
	Name        string   `json:"name"`
	Namespaces  []string `json:"namespaces"`
	Workloads   int      `json:"workloads"`
	PodsRunning int      `json:"podsRunning"`
	PodsTotal   int      `json:"podsTotal"`
	Health      string   `json:"health"`
}

// ProjectResource is a single K8s resource belonging to a project.
type ProjectResource struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
}

// ProjectDetail is the full detail view for a single project.
type ProjectDetail struct {
	Name       string            `json:"name"`
	Namespaces []string          `json:"namespaces"`
	Resources  []ProjectResource `json:"resources"`
}

// ListProjects aggregates namespaces and workloads by the argus.darkden.net/projects label.
func (h *ConvenienceHandlers) ListProjects(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		httputil.WriteError(w, http.StatusBadGateway, "cluster not available: "+err.Error())
		return
	}

	ctx := r.Context()

	// Collect project → namespaces from namespace labels.
	projectNamespaces := make(map[string][]string)

	nsList, err := client.Clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, ns := range nsList.Items {
		label := ns.Labels[projectLabel]
		if label == "" {
			continue
		}
		for _, proj := range splitProjects(label) {
			projectNamespaces[proj] = appendUnique(projectNamespaces[proj], ns.Name)
		}
	}

	// Collect workload counts and pod status from Deployments.
	projectWorkloads := make(map[string]int)
	projectPodsRunning := make(map[string]int)
	projectPodsTotal := make(map[string]int)

	deplGVR := schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	deplList, err := client.DynClient.Resource(deplGVR).Namespace("").List(ctx, metav1.ListOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, item := range deplList.Items {
		label := item.GetLabels()[projectLabel]
		if label == "" {
			continue
		}
		replicas, _, _ := unstructuredInt64(item.Object, "spec", "replicas")
		readyReplicas, _, _ := unstructuredInt64(item.Object, "status", "readyReplicas")

		for _, proj := range splitProjects(label) {
			projectNamespaces[proj] = appendUnique(projectNamespaces[proj], item.GetNamespace())
			projectWorkloads[proj]++
			projectPodsTotal[proj] += int(replicas)
			projectPodsRunning[proj] += int(readyReplicas)
		}
	}

	projects := make([]ProjectSummary, 0, len(projectNamespaces))
	for name, namespaces := range projectNamespaces {
		total := projectPodsTotal[name]
		running := projectPodsRunning[name]
		health := "unknown"
		if total > 0 {
			if running >= total {
				health = "healthy"
			} else {
				health = "degraded"
			}
		}
		projects = append(projects, ProjectSummary{
			Name:        name,
			Namespaces:  namespaces,
			Workloads:   projectWorkloads[name],
			PodsRunning: running,
			PodsTotal:   total,
			Health:      health,
		})
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{"projects": projects})
}

// GetProject returns all resources belonging to a specific project.
func (h *ConvenienceHandlers) GetProject(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]
	project := mux.Vars(r)["project"]

	if project == "" {
		httputil.WriteError(w, http.StatusBadRequest, "project name required")
		return
	}

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		httputil.WriteError(w, http.StatusBadGateway, "cluster not available: "+err.Error())
		return
	}

	ctx := r.Context()

	// Find namespaces belonging to this project.
	var namespaces []string
	nsList, err := client.Clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, ns := range nsList.Items {
		if containsProject(ns.Labels[projectLabel], project) {
			namespaces = appendUnique(namespaces, ns.Name)
		}
	}

	var resources []ProjectResource

	// Scan Deployments, StatefulSets, Services across project namespaces.
	gvrs := []struct {
		gvr  schema.GroupVersionResource
		kind string
	}{
		{schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}, "Deployment"},
		{schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}, "StatefulSet"},
		{schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}, "Service"},
	}

	for _, g := range gvrs {
		list, err := client.DynClient.Resource(g.gvr).Namespace("").List(ctx, metav1.ListOptions{})
		if err != nil {
			continue
		}
		for _, item := range list.Items {
			if !containsProject(item.GetLabels()[projectLabel], project) {
				continue
			}
			ns := item.GetNamespace()
			namespaces = appendUnique(namespaces, ns)
			resources = append(resources, ProjectResource{
				Kind:      g.kind,
				Name:      item.GetName(),
				Namespace: ns,
			})
		}
	}

	httputil.WriteJSON(w, http.StatusOK, ProjectDetail{
		Name:       project,
		Namespaces: namespaces,
		Resources:  resources,
	})
}

// splitProjects splits a comma-separated label value into trimmed project names.
func splitProjects(label string) []string {
	parts := strings.Split(label, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

// containsProject checks whether a comma-separated label value contains the given project name.
func containsProject(label, project string) bool {
	for _, p := range splitProjects(label) {
		if p == project {
			return true
		}
	}
	return false
}

// appendUnique appends s to slice only if it's not already present.
func appendUnique(slice []string, s string) []string {
	for _, v := range slice {
		if v == s {
			return slice
		}
	}
	return append(slice, s)
}

// unstructuredInt64 extracts a nested int64 from an unstructured object map.
func unstructuredInt64(obj map[string]interface{}, fields ...string) (int64, bool, error) {
	var current interface{} = obj
	for _, f := range fields {
		m, ok := current.(map[string]interface{})
		if !ok {
			return 0, false, nil
		}
		current = m[f]
	}
	if current == nil {
		return 0, false, nil
	}
	switch v := current.(type) {
	case int64:
		return v, true, nil
	case float64:
		return int64(v), true, nil
	}
	return 0, false, nil
}
