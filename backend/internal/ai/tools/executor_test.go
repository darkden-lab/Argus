package tools

import (
	"testing"

	"k8s.io/apimachinery/pkg/runtime/schema"
)

func TestKindToGVR(t *testing.T) {
	tests := []struct {
		kind     string
		expected schema.GroupVersionResource
	}{
		{"pods", schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}},
		{"pod", schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}},
		{"deployments", schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}},
		{"deploy", schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}},
		{"services", schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}},
		{"svc", schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}},
		{"configmaps", schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"}},
		{"cm", schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"}},
		{"statefulsets", schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}},
		{"sts", schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}},
		{"daemonsets", schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "daemonsets"}},
		{"ds", schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "daemonsets"}},
		{"jobs", schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "jobs"}},
		{"cronjobs", schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "cronjobs"}},
		{"cj", schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "cronjobs"}},
		{"ingresses", schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}},
		{"ing", schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}},
		{"pvc", schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumeclaims"}},
		{"sa", schema.GroupVersionResource{Group: "", Version: "v1", Resource: "serviceaccounts"}},
		{"nodes", schema.GroupVersionResource{Group: "", Version: "v1", Resource: "nodes"}},
		{"secrets", schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"}},
	}

	for _, tt := range tests {
		t.Run(tt.kind, func(t *testing.T) {
			got := kindToGVR(tt.kind)
			if got != tt.expected {
				t.Errorf("kindToGVR(%q) = %v, want %v", tt.kind, got, tt.expected)
			}
		})
	}
}

func TestRequiresConfirm(t *testing.T) {
	writeTools := []string{"apply_yaml", "delete_resource", "scale_resource", "restart_resource"}
	for _, name := range writeTools {
		if !RequiresConfirm(name) {
			t.Errorf("RequiresConfirm(%q) = false, want true", name)
		}
	}

	readTools := []string{"get_resources", "describe_resource", "get_events", "get_logs", "get_metrics", "search_resources"}
	for _, name := range readTools {
		if RequiresConfirm(name) {
			t.Errorf("RequiresConfirm(%q) = true, want false", name)
		}
	}
}

func TestAllToolsCount(t *testing.T) {
	all := AllTools()
	readOnly := ReadOnlyTools()
	write := WriteTools()

	if len(all) != len(readOnly)+len(write) {
		t.Errorf("AllTools() has %d tools, expected %d (read=%d + write=%d)",
			len(all), len(readOnly)+len(write), len(readOnly), len(write))
	}

	if len(readOnly) != 6 {
		t.Errorf("ReadOnlyTools() has %d tools, expected 6", len(readOnly))
	}

	if len(write) != 4 {
		t.Errorf("WriteTools() has %d tools, expected 4", len(write))
	}
}
