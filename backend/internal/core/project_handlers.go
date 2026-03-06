package core

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/httputil"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
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

// ProjectDB represents a project stored in the database.
type ProjectDB struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Color       string   `json:"color"`
	ClusterID   string   `json:"clusterId"`
	CreatedBy   *string  `json:"createdBy,omitempty"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
	Namespaces  []string `json:"namespaces"`
}

type createProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Color       string `json:"color"`
}

type updateProjectRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	Color       *string `json:"color,omitempty"`
}

type assignNamespacesRequest struct {
	Namespaces []string `json:"namespaces"`
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

	// Collect project -> namespaces from namespace labels.
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

	// Enrich with DB projects that may not have K8s labels yet
	if h.pool != nil {
		dbProjects, _ := h.listDBProjects(ctx, clusterID)
		for _, dbp := range dbProjects {
			if _, exists := projectNamespaces[dbp.Name]; !exists {
				projectNamespaces[dbp.Name] = dbp.Namespaces
			}
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

// CreateProject creates a project in DB.
func (h *ConvenienceHandlers) CreateProject(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]

	var req createProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		httputil.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Color == "" {
		req.Color = "#6366f1"
	}

	var userID *string
	if claims, ok := auth.ClaimsFromContext(r.Context()); ok && claims.UserID != "" {
		userID = &claims.UserID
	}

	ctx := r.Context()
	var proj ProjectDB
	err := h.pool.QueryRow(ctx,
		`INSERT INTO projects (name, description, color, cluster_id, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, description, color, cluster_id, created_by, created_at, updated_at`,
		strings.TrimSpace(req.Name), req.Description, req.Color, clusterID, userID,
	).Scan(&proj.ID, &proj.Name, &proj.Description, &proj.Color, &proj.ClusterID, &proj.CreatedBy, &proj.CreatedAt, &proj.UpdatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			httputil.WriteError(w, http.StatusConflict, "project already exists in this cluster")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}
	proj.Namespaces = []string{}

	httputil.WriteJSON(w, http.StatusCreated, proj)
}

// UpdateProject updates project metadata in DB.
func (h *ConvenienceHandlers) UpdateProject(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]
	projectName := mux.Vars(r)["project"]

	var req updateProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()

	setClauses := []string{"updated_at = NOW()"}
	args := []interface{}{}
	argIdx := 1

	if req.Name != nil {
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", argIdx))
		args = append(args, strings.TrimSpace(*req.Name))
		argIdx++
	}
	if req.Description != nil {
		setClauses = append(setClauses, fmt.Sprintf("description = $%d", argIdx))
		args = append(args, *req.Description)
		argIdx++
	}
	if req.Color != nil {
		setClauses = append(setClauses, fmt.Sprintf("color = $%d", argIdx))
		args = append(args, *req.Color)
		argIdx++
	}

	args = append(args, projectName, clusterID)
	query := fmt.Sprintf(
		`UPDATE projects SET %s WHERE name = $%d AND cluster_id = $%d
		 RETURNING id, name, description, color, cluster_id, created_by, created_at, updated_at`,
		strings.Join(setClauses, ", "), argIdx, argIdx+1,
	)

	var proj ProjectDB
	err := h.pool.QueryRow(ctx, query, args...).Scan(
		&proj.ID, &proj.Name, &proj.Description, &proj.Color,
		&proj.ClusterID, &proj.CreatedBy, &proj.CreatedAt, &proj.UpdatedAt,
	)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			httputil.WriteError(w, http.StatusNotFound, "project not found")
			return
		}
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	proj.Namespaces = h.getProjectNamespacesDB(ctx, proj.ID)
	httputil.WriteJSON(w, http.StatusOK, proj)
}

// DeleteProject deletes a project from DB and removes labels from all associated namespaces.
func (h *ConvenienceHandlers) DeleteProject(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]
	projectName := mux.Vars(r)["project"]
	ctx := r.Context()

	var projectID string
	err := h.pool.QueryRow(ctx,
		`SELECT id FROM projects WHERE name = $1 AND cluster_id = $2`,
		projectName, clusterID,
	).Scan(&projectID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "project not found")
		return
	}

	namespaces := h.getProjectNamespacesDB(ctx, projectID)

	// Remove K8s labels from namespaces
	if client, clientErr := h.clusterMgr.GetClient(clusterID); clientErr == nil {
		for _, ns := range namespaces {
			removeProjectFromLabel(ctx, client, ns, projectName)
		}
	}

	// Delete from DB (cascades to project_namespaces)
	_, err = h.pool.Exec(ctx, `DELETE FROM projects WHERE id = $1`, projectID)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// AssignNamespaces assigns one or more namespaces to a project in DB and syncs K8s labels.
func (h *ConvenienceHandlers) AssignNamespaces(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]
	projectName := mux.Vars(r)["project"]
	ctx := r.Context()

	var req assignNamespacesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		httputil.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Namespaces) == 0 {
		httputil.WriteError(w, http.StatusBadRequest, "namespaces array is required")
		return
	}

	var projectID string
	err := h.pool.QueryRow(ctx,
		`SELECT id FROM projects WHERE name = $1 AND cluster_id = $2`,
		projectName, clusterID,
	).Scan(&projectID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "project not found")
		return
	}

	for _, ns := range req.Namespaces {
		_, err := h.pool.Exec(ctx,
			`INSERT INTO project_namespaces (project_id, namespace) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			projectID, ns,
		)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, err.Error())
			return
		}
	}

	// Sync K8s labels
	if client, clientErr := h.clusterMgr.GetClient(clusterID); clientErr == nil {
		for _, ns := range req.Namespaces {
			addProjectToLabel(ctx, client, ns, projectName)
		}
	}

	allNs := h.getProjectNamespacesDB(ctx, projectID)
	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{"namespaces": allNs})
}

// RemoveNamespace removes a namespace from a project in DB and syncs K8s labels.
func (h *ConvenienceHandlers) RemoveNamespace(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]
	projectName := mux.Vars(r)["project"]
	namespace := mux.Vars(r)["namespace"]
	ctx := r.Context()

	var projectID string
	err := h.pool.QueryRow(ctx,
		`SELECT id FROM projects WHERE name = $1 AND cluster_id = $2`,
		projectName, clusterID,
	).Scan(&projectID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "project not found")
		return
	}

	_, err = h.pool.Exec(ctx,
		`DELETE FROM project_namespaces WHERE project_id = $1 AND namespace = $2`,
		projectID, namespace,
	)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Remove K8s label
	if client, clientErr := h.clusterMgr.GetClient(clusterID); clientErr == nil {
		removeProjectFromLabel(ctx, client, namespace, projectName)
	}

	allNs := h.getProjectNamespacesDB(ctx, projectID)
	httputil.WriteJSON(w, http.StatusOK, map[string]interface{}{"namespaces": allNs})
}

// --- DB helpers ---

func (h *ConvenienceHandlers) getProjectNamespacesDB(ctx context.Context, projectID string) []string {
	rows, err := h.pool.Query(ctx,
		`SELECT namespace FROM project_namespaces WHERE project_id = $1 ORDER BY namespace`, projectID)
	if err != nil {
		return []string{}
	}
	defer rows.Close()

	var namespaces []string
	for rows.Next() {
		var ns string
		if err := rows.Scan(&ns); err == nil {
			namespaces = append(namespaces, ns)
		}
	}
	// Best-effort: ignore rows.Err() for this helper
	if namespaces == nil {
		return []string{}
	}
	return namespaces
}

func (h *ConvenienceHandlers) listDBProjects(ctx context.Context, clusterID string) ([]ProjectDB, error) {
	rows, err := h.pool.Query(ctx,
		`SELECT p.id, p.name, p.description, p.color, p.cluster_id, p.created_by, p.created_at, p.updated_at
		 FROM projects p WHERE p.cluster_id = $1`, clusterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var projects []ProjectDB
	for rows.Next() {
		var p ProjectDB
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Color, &p.ClusterID, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt); err != nil {
			continue
		}
		p.Namespaces = h.getProjectNamespacesDB(ctx, p.ID)
		projects = append(projects, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return projects, nil
}

// --- K8s label helpers ---

func addProjectToLabel(ctx context.Context, client *cluster.ClusterClient, namespace, projectName string) {
	ns, err := client.Clientset.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{})
	if err != nil {
		return
	}
	current := ns.Labels[projectLabel]
	if containsProject(current, projectName) {
		return
	}
	var newLabel string
	if current == "" {
		newLabel = projectName
	} else {
		newLabel = current + "," + projectName
	}
	patch := fmt.Sprintf(`{"metadata":{"labels":{%q:%q}}}`, projectLabel, newLabel)
	client.Clientset.CoreV1().Namespaces().Patch(ctx, namespace, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{}) //nolint:errcheck
}

func removeProjectFromLabel(ctx context.Context, client *cluster.ClusterClient, namespace, projectName string) {
	ns, err := client.Clientset.CoreV1().Namespaces().Get(ctx, namespace, metav1.GetOptions{})
	if err != nil {
		return
	}
	current := ns.Labels[projectLabel]
	if !containsProject(current, projectName) {
		return
	}
	// Remove project from comma-separated list
	var remaining []string
	for _, p := range splitProjects(current) {
		if p != projectName {
			remaining = append(remaining, p)
		}
	}
	var patch string
	if len(remaining) == 0 {
		// Remove label entirely using JSON merge patch with null
		patch = fmt.Sprintf(`{"metadata":{"labels":{%q:null}}}`, projectLabel)
		client.Clientset.CoreV1().Namespaces().Patch(ctx, namespace, types.MergePatchType, []byte(patch), metav1.PatchOptions{}) //nolint:errcheck
	} else {
		newLabel := strings.Join(remaining, ",")
		patch = fmt.Sprintf(`{"metadata":{"labels":{%q:%q}}}`, projectLabel, newLabel)
		client.Clientset.CoreV1().Namespaces().Patch(ctx, namespace, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{}) //nolint:errcheck
	}
}

// --- Utility functions ---

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
