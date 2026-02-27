package istio

import (
	"context"
	"fmt"
	"log"

	"github.com/darkden-lab/argus/backend/internal/cluster"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// discoverPrometheus attempts to find a Prometheus service in the cluster.
// It searches by label selectors and well-known names in common namespaces.
// Returns an in-cluster URL (e.g. "http://prometheus.monitoring.svc:9090") or empty string.
func discoverPrometheus(ctx context.Context, cm *cluster.Manager, clusterID string) string {
	client, err := cm.GetClient(clusterID)
	if err != nil {
		log.Printf("istio/discovery: cluster %s not available: %v", clusterID, err)
		return ""
	}

	k8s := client.Clientset

	// Strategy 1: Search by labels
	labelSelectors := []string{
		"app.kubernetes.io/name=prometheus",
		"app=prometheus",
		"app.kubernetes.io/name=prometheus-server",
	}
	for _, selector := range labelSelectors {
		svcList, err := k8s.CoreV1().Services("").List(ctx, metav1.ListOptions{
			LabelSelector: selector,
		})
		if err != nil {
			continue
		}
		for _, svc := range svcList.Items {
			port := int32(9090)
			for _, p := range svc.Spec.Ports {
				if p.Name == "http" || p.Name == "web" || p.Name == "http-web" {
					port = p.Port
					break
				}
			}
			url := fmt.Sprintf("http://%s.%s.svc:%d", svc.Name, svc.Namespace, port)
			log.Printf("istio/discovery: found Prometheus via label %q: %s", selector, url)
			return url
		}
	}

	// Strategy 2: Well-known names in common namespaces
	commonNamespaces := []string{"monitoring", "istio-system", "prometheus", "observability", "default"}
	commonNames := []string{"prometheus", "prometheus-server", "prometheus-kube-prometheus-prometheus", "prometheus-operated"}
	for _, ns := range commonNamespaces {
		for _, name := range commonNames {
			svc, err := k8s.CoreV1().Services(ns).Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				continue
			}
			port := int32(9090)
			for _, p := range svc.Spec.Ports {
				if p.Name == "http" || p.Name == "web" || p.Name == "http-web" {
					port = p.Port
					break
				}
			}
			url := fmt.Sprintf("http://%s.%s.svc:%d", svc.Name, svc.Namespace, port)
			log.Printf("istio/discovery: found Prometheus by name: %s", url)
			return url
		}
	}

	return ""
}
