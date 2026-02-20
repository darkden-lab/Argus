package helm

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/k8s-dashboard/backend/internal/cluster"
	"helm.sh/helm/v3/pkg/action"
	"helm.sh/helm/v3/pkg/chart/loader"
	"helm.sh/helm/v3/pkg/cli"
	"helm.sh/helm/v3/pkg/release"
)

type Handlers struct {
	cm *cluster.Manager
}

func NewHandlers(cm *cluster.Manager) *Handlers {
	return &Handlers{cm: cm}
}

// getActionConfig creates a Helm action.Configuration from a cluster's rest.Config.
func (h *Handlers) getActionConfig(clusterID, namespace string) (*action.Configuration, error) {
	client, err := h.cm.GetClient(clusterID)
	if err != nil {
		return nil, fmt.Errorf("cluster not found: %w", err)
	}

	cfg := new(action.Configuration)
	err = cfg.Init(
		&simpleRESTClientGetter{
			restConfig: client.RestConfig,
			namespace:  namespace,
		},
		namespace,
		"secrets",
		log.Printf,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to init helm config: %w", err)
	}

	return cfg, nil
}

// ReleaseInfo is a simplified release response.
type ReleaseInfo struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Revision   int    `json:"revision"`
	Status     string `json:"status"`
	Chart      string `json:"chart"`
	AppVersion string `json:"app_version"`
	Updated    string `json:"updated"`
}

func releaseToInfo(r *release.Release) ReleaseInfo {
	chart := ""
	appVersion := ""
	if r.Chart != nil && r.Chart.Metadata != nil {
		chart = fmt.Sprintf("%s-%s", r.Chart.Metadata.Name, r.Chart.Metadata.Version)
		appVersion = r.Chart.Metadata.AppVersion
	}
	updated := ""
	if !r.Info.LastDeployed.IsZero() {
		updated = r.Info.LastDeployed.String()
	}
	return ReleaseInfo{
		Name:       r.Name,
		Namespace:  r.Namespace,
		Revision:   r.Version,
		Status:     string(r.Info.Status),
		Chart:      chart,
		AppVersion: appVersion,
		Updated:    updated,
	}
}

func (h *Handlers) ListReleases(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]
	namespace := r.URL.Query().Get("namespace")

	cfg, err := h.getActionConfig(clusterID, namespace)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	listAction := action.NewList(cfg)
	listAction.AllNamespaces = namespace == ""
	listAction.All = true

	results, err := listAction.Run()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	releases := make([]ReleaseInfo, len(results))
	for i, r := range results {
		releases[i] = releaseToInfo(r)
	}

	writeJSON(w, http.StatusOK, releases)
}

func (h *Handlers) GetRelease(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["cluster"]
	name := vars["name"]
	namespace := r.URL.Query().Get("namespace")

	cfg, err := h.getActionConfig(clusterID, namespace)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	getAction := action.NewGet(cfg)
	rel, err := getAction.Run(name)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	detail := map[string]interface{}{
		"release":  releaseToInfo(rel),
		"manifest": rel.Manifest,
		"notes":    rel.Info.Notes,
		"values":   rel.Config,
	}

	writeJSON(w, http.StatusOK, detail)
}

type InstallRequest struct {
	ChartRef    string                 `json:"chart_ref"`
	ReleaseName string                 `json:"release_name"`
	Namespace   string                 `json:"namespace"`
	Values      map[string]interface{} `json:"values"`
	RepoURL     string                 `json:"repo_url"`
}

func (h *Handlers) InstallRelease(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["cluster"]

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}

	var req InstallRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	if req.ReleaseName == "" || req.ChartRef == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "release_name and chart_ref are required"})
		return
	}
	if req.Namespace == "" {
		req.Namespace = "default"
	}

	cfg, err := h.getActionConfig(clusterID, req.Namespace)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	installAction := action.NewInstall(cfg)
	installAction.ReleaseName = req.ReleaseName
	installAction.Namespace = req.Namespace
	installAction.CreateNamespace = true

	// Locate chart
	chartPath, err := installAction.ChartPathOptions.LocateChart(req.ChartRef, cli.New())
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("chart not found: %v", err)})
		return
	}

	chartObj, err := loader.Load(chartPath)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("failed to load chart: %v", err)})
		return
	}

	rel, err := installAction.Run(chartObj, req.Values)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, releaseToInfo(rel))
}

type UpgradeRequest struct {
	ChartRef string                 `json:"chart_ref"`
	Values   map[string]interface{} `json:"values"`
	RepoURL  string                 `json:"repo_url"`
}

func (h *Handlers) UpgradeRelease(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["cluster"]
	name := vars["name"]
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		namespace = "default"
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}

	var req UpgradeRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	cfg, err := h.getActionConfig(clusterID, namespace)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	upgradeAction := action.NewUpgrade(cfg)
	upgradeAction.Namespace = namespace

	chartPath, err := upgradeAction.ChartPathOptions.LocateChart(req.ChartRef, cli.New())
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("chart not found: %v", err)})
		return
	}

	chartObj, err := loader.Load(chartPath)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("failed to load chart: %v", err)})
		return
	}

	rel, err := upgradeAction.Run(name, chartObj, req.Values)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, releaseToInfo(rel))
}

type RollbackRequest struct {
	Revision int `json:"revision"`
}

func (h *Handlers) RollbackRelease(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["cluster"]
	name := vars["name"]
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		namespace = "default"
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}

	var req RollbackRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	cfg, err := h.getActionConfig(clusterID, namespace)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	rollbackAction := action.NewRollback(cfg)
	if req.Revision > 0 {
		rollbackAction.Version = req.Revision
	}

	if err := rollbackAction.Run(name); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "rolled back"})
}

func (h *Handlers) UninstallRelease(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["cluster"]
	name := vars["name"]
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		namespace = "default"
	}

	cfg, err := h.getActionConfig(clusterID, namespace)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	uninstallAction := action.NewUninstall(cfg)
	resp, err := uninstallAction.Run(name)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "uninstalled",
		"info":   resp.Info,
	})
}

func (h *Handlers) GetReleaseHistory(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["cluster"]
	name := vars["name"]
	namespace := r.URL.Query().Get("namespace")

	cfg, err := h.getActionConfig(clusterID, namespace)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	historyAction := action.NewHistory(cfg)
	historyAction.Max = 20

	results, err := historyAction.Run(name)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	history := make([]ReleaseInfo, len(results))
	for i, r := range results {
		history[i] = releaseToInfo(r)
	}

	writeJSON(w, http.StatusOK, history)
}

func (h *Handlers) GetReleaseValues(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["cluster"]
	name := vars["name"]
	namespace := r.URL.Query().Get("namespace")

	cfg, err := h.getActionConfig(clusterID, namespace)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	getValuesAction := action.NewGetValues(cfg)
	getValuesAction.AllValues = r.URL.Query().Get("all") == "true"

	values, err := getValuesAction.Run(name)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, values)
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
