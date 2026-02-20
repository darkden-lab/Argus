package prometheus

import (
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

// ServiceMonitorConfig is the simplified form input for the wizard.
type ServiceMonitorConfig struct {
	Name        string            `json:"name"`
	Namespace   string            `json:"namespace"`
	ServiceName string            `json:"service_name"`
	Port        string            `json:"port"`
	Path        string            `json:"path"`
	Interval    string            `json:"interval"`
	Labels      map[string]string `json:"labels"`
	ClusterID   string            `json:"cluster_id"`
}

// GenerateServiceMonitor takes a simplified config and produces a full
// ServiceMonitor unstructured object ready to be applied to a cluster.
func GenerateServiceMonitor(cfg ServiceMonitorConfig) *unstructured.Unstructured {
	if cfg.Path == "" {
		cfg.Path = "/metrics"
	}
	if cfg.Interval == "" {
		cfg.Interval = "30s"
	}
	if cfg.Namespace == "" {
		cfg.Namespace = "default"
	}

	matchLabels := cfg.Labels
	if matchLabels == nil {
		matchLabels = map[string]string{}
	}
	if cfg.ServiceName != "" {
		matchLabels["app"] = cfg.ServiceName
	}

	// Convert matchLabels to map[string]interface{} for unstructured
	matchLabelsIface := map[string]interface{}{}
	for k, v := range matchLabels {
		matchLabelsIface[k] = v
	}

	endpoint := map[string]interface{}{
		"path":     cfg.Path,
		"interval": cfg.Interval,
	}
	if cfg.Port != "" {
		endpoint["port"] = cfg.Port
	}

	obj := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "monitoring.coreos.com/v1",
			"kind":       "ServiceMonitor",
			"metadata": map[string]interface{}{
				"name":      cfg.Name,
				"namespace": cfg.Namespace,
				"labels": map[string]interface{}{
					"app.kubernetes.io/managed-by": "argus",
				},
			},
			"spec": map[string]interface{}{
				"selector": map[string]interface{}{
					"matchLabels": matchLabelsIface,
				},
				"endpoints": []interface{}{endpoint},
				"namespaceSelector": map[string]interface{}{
					"matchNames": []interface{}{cfg.Namespace},
				},
			},
		},
	}

	return obj
}
