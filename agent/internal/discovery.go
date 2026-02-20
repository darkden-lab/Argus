package internal

import (
	"context"
	"log"
	"runtime"

	pb "github.com/k8s-dashboard/backend/pkg/agentpb"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

const agentVersion = "0.1.0"

// CollectClusterInfo gathers information about the local Kubernetes cluster.
func CollectClusterInfo(ctx context.Context) *pb.ClusterInfo {
	info := &pb.ClusterInfo{
		AgentVersion: agentVersion,
		Platform:     runtime.GOOS + "/" + runtime.GOARCH,
	}

	config, err := rest.InClusterConfig()
	if err != nil {
		log.Printf("Discovery: not running in cluster: %v", err)
		return info
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Printf("Discovery: failed to create clientset: %v", err)
		return info
	}

	// Kubernetes version.
	serverVersion, err := clientset.Discovery().ServerVersion()
	if err != nil {
		log.Printf("Discovery: failed to get server version: %v", err)
	} else {
		info.KubernetesVersion = serverVersion.GitVersion
	}

	// Node count.
	nodes, err := clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("Discovery: failed to list nodes: %v", err)
	} else {
		info.NodeCount = int32(len(nodes.Items))
	}

	// Namespaces.
	namespaces, err := clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		log.Printf("Discovery: failed to list namespaces: %v", err)
	} else {
		for _, ns := range namespaces.Items {
			info.Namespaces = append(info.Namespaces, ns.Name)
		}
	}

	// CRDs (requires apiextensions API access).
	crdList, err := clientset.Discovery().ServerResourcesForGroupVersion("apiextensions.k8s.io/v1")
	if err != nil {
		log.Printf("Discovery: failed to list CRDs: %v", err)
	} else {
		for _, r := range crdList.APIResources {
			info.Crds = append(info.Crds, r.Name)
		}
	}

	log.Printf("Discovery: k8s=%s nodes=%d namespaces=%d crds=%d",
		info.KubernetesVersion, info.NodeCount, len(info.Namespaces), len(info.Crds))

	return info
}
