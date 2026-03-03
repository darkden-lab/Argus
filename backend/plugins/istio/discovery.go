package istio

import (
	"context"
	"log"

	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/prometheus"
)

// discoverPrometheusInstances finds all Prometheus services in a cluster.
// Delegates to the shared prometheus.DiscoverInstances package.
func discoverPrometheusInstances(ctx context.Context, cm *cluster.Manager, clusterID string) []prometheus.PrometheusInstance {
	client, err := cm.GetClient(clusterID)
	if err != nil {
		log.Printf("istio/discovery: cluster %s not available: %v", clusterID, err)
		return nil
	}

	instances, err := prometheus.DiscoverInstances(ctx, client.Clientset)
	if err != nil {
		log.Printf("istio/discovery: failed to discover Prometheus in cluster %s: %v", clusterID, err)
		return nil
	}
	return instances
}
