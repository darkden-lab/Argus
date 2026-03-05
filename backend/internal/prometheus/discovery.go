package prometheus

import (
	"context"
	"log"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// Well-known label selectors for Prometheus services.
var labelSelectors = []string{
	"app.kubernetes.io/name=prometheus",
	"app=prometheus",
	"app.kubernetes.io/name=prometheus-server",
	"app=kube-prometheus-stack-prometheus",
}

// Well-known namespaces where Prometheus is commonly installed.
var commonNamespaces = []string{
	"monitoring",
	"istio-system",
	"prometheus",
	"observability",
	"default",
}

// Well-known Prometheus service names.
var commonNames = []string{
	"prometheus",
	"prometheus-server",
	"prometheus-kube-prometheus-prometheus",
	"prometheus-operated",
}

// DiscoverInstances finds all Prometheus service instances in a cluster.
// It searches by label selectors and well-known service names/namespaces.
// Returns all instances found (deduplicated) for the user to choose from.
func DiscoverInstances(ctx context.Context, clientset kubernetes.Interface) ([]PrometheusInstance, error) {
	seen := make(map[string]bool) // key: "namespace/name"
	var instances []PrometheusInstance

	addInstance := func(namespace, name string, port int, portName string, labels map[string]string) {
		key := namespace + "/" + name
		if seen[key] {
			return
		}
		seen[key] = true
		instances = append(instances, PrometheusInstance{
			Namespace:   namespace,
			ServiceName: name,
			Port:        port,
			PortName:    portName,
			Labels:      labels,
		})
	}

	// Strategy 1: Search by labels across all namespaces
	for _, selector := range labelSelectors {
		svcList, err := clientset.CoreV1().Services("").List(ctx, metav1.ListOptions{
			LabelSelector: selector,
		})
		if err != nil {
			log.Printf("prometheus/discovery: label search %q failed: %v", selector, err)
			continue
		}
		for _, svc := range svcList.Items {
			port, portName := findPrometheusPort(svc.Spec.Ports)
			addInstance(svc.Namespace, svc.Name, int(port), portName, svc.Labels)
		}
	}

	// Strategy 2: Well-known names in common namespaces
	for _, ns := range commonNamespaces {
		for _, name := range commonNames {
			svc, err := clientset.CoreV1().Services(ns).Get(ctx, name, metav1.GetOptions{})
			if err != nil {
				continue
			}
			port, portName := findPrometheusPort(svc.Spec.Ports)
			addInstance(svc.Namespace, svc.Name, int(port), portName, svc.Labels)
		}
	}

	return instances, nil
}

// findPrometheusPort selects the best port from a service's port list.
// It prefers ports named "http", "web", or "http-web", falling back to 9090.
func findPrometheusPort(ports []corev1.ServicePort) (int32, string) {
	for _, p := range ports {
		if p.Name == "http" || p.Name == "web" || p.Name == "http-web" {
			return p.Port, p.Name
		}
	}
	if len(ports) > 0 {
		return ports[0].Port, ports[0].Name
	}
	return 9090, ""
}
