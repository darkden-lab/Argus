package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (e *Executor) clusterHealthCheck(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	type nodeStatus struct {
		Name       string `json:"name"`
		Ready      bool   `json:"ready"`
		Conditions []struct {
			Type   string `json:"type"`
			Status string `json:"status"`
		} `json:"conditions,omitempty"`
	}

	// Nodes
	nodes, err := client.Clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list nodes: %w", err)
	}

	nodeStatuses := make([]nodeStatus, 0, len(nodes.Items))
	for _, n := range nodes.Items {
		ns := nodeStatus{Name: n.Name}
		for _, c := range n.Status.Conditions {
			if c.Type == corev1.NodeReady {
				ns.Ready = c.Status == corev1.ConditionTrue
			}
		}
		nodeStatuses = append(nodeStatuses, ns)
	}

	// Pods by phase
	pods, err := client.Clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list pods: %w", err)
	}

	podCounts := map[string]int{}
	for _, p := range pods.Items {
		podCounts[string(p.Status.Phase)]++
	}

	// Recent warning events (last 30 min)
	thirtyMinAgo := time.Now().Add(-30 * time.Minute)
	events, err := client.Clientset.CoreV1().Events("").List(ctx, metav1.ListOptions{
		FieldSelector: "type=Warning",
	})
	if err != nil {
		return "", fmt.Errorf("failed to list events: %w", err)
	}

	type warningEvent struct {
		Object  string `json:"object"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Count   int32  `json:"count"`
	}

	var warnings []warningEvent
	for _, ev := range events.Items {
		evTime := ev.LastTimestamp.Time
		if evTime.IsZero() {
			evTime = ev.CreationTimestamp.Time
		}
		if evTime.After(thirtyMinAgo) {
			warnings = append(warnings, warningEvent{
				Object:  ev.InvolvedObject.Kind + "/" + ev.InvolvedObject.Name,
				Reason:  ev.Reason,
				Message: ev.Message,
				Count:   ev.Count,
			})
		}
	}

	// PVC status
	pvcs, err := client.Clientset.CoreV1().PersistentVolumeClaims("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list PVCs: %w", err)
	}

	pvcCounts := map[string]int{}
	for _, pvc := range pvcs.Items {
		pvcCounts[string(pvc.Status.Phase)]++
	}

	report := map[string]interface{}{
		"nodes":           nodeStatuses,
		"node_count":      len(nodes.Items),
		"pod_counts":      podCounts,
		"total_pods":      len(pods.Items),
		"warning_events":  warnings,
		"warning_count":   len(warnings),
		"pvc_status":      pvcCounts,
		"total_pvcs":      len(pvcs.Items),
	}

	data, _ := json.MarshalIndent(report, "", "  ")
	return fmt.Sprintf("Cluster Health Report:\n%s", string(data)), nil
}

func (e *Executor) securityScan(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	ns := args["namespace"]
	pods, err := client.Clientset.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list pods: %w", err)
	}

	type securityIssue struct {
		Pod       string `json:"pod"`
		Namespace string `json:"namespace"`
		Container string `json:"container"`
		Issue     string `json:"issue"`
		Severity  string `json:"severity"`
	}

	var issues []securityIssue

	for _, pod := range pods.Items {
		podNs := pod.Namespace
		podName := pod.Name

		// Pod-level checks
		if pod.Spec.HostNetwork {
			issues = append(issues, securityIssue{Pod: podName, Namespace: podNs, Issue: "hostNetwork enabled", Severity: "HIGH"})
		}
		if pod.Spec.HostPID {
			issues = append(issues, securityIssue{Pod: podName, Namespace: podNs, Issue: "hostPID enabled", Severity: "HIGH"})
		}
		if pod.Spec.HostIPC {
			issues = append(issues, securityIssue{Pod: podName, Namespace: podNs, Issue: "hostIPC enabled", Severity: "HIGH"})
		}

		for _, c := range pod.Spec.Containers {
			// Privileged
			if c.SecurityContext != nil && c.SecurityContext.Privileged != nil && *c.SecurityContext.Privileged {
				issues = append(issues, securityIssue{Pod: podName, Namespace: podNs, Container: c.Name, Issue: "privileged container", Severity: "CRITICAL"})
			}

			// RunAsRoot
			if c.SecurityContext != nil && c.SecurityContext.RunAsNonRoot != nil && !*c.SecurityContext.RunAsNonRoot {
				issues = append(issues, securityIssue{Pod: podName, Namespace: podNs, Container: c.Name, Issue: "runAsNonRoot not set or false", Severity: "MEDIUM"})
			} else if c.SecurityContext == nil || c.SecurityContext.RunAsNonRoot == nil {
				if pod.Spec.SecurityContext == nil || pod.Spec.SecurityContext.RunAsNonRoot == nil {
					issues = append(issues, securityIssue{Pod: podName, Namespace: podNs, Container: c.Name, Issue: "no runAsNonRoot setting", Severity: "LOW"})
				}
			}

			// Latest tag
			if strings.HasSuffix(c.Image, ":latest") || !strings.Contains(c.Image, ":") {
				issues = append(issues, securityIssue{Pod: podName, Namespace: podNs, Container: c.Name, Issue: fmt.Sprintf("using latest/untagged image: %s", c.Image), Severity: "MEDIUM"})
			}

			// Missing resource limits
			if c.Resources.Limits.Cpu().IsZero() && c.Resources.Limits.Memory().IsZero() {
				issues = append(issues, securityIssue{Pod: podName, Namespace: podNs, Container: c.Name, Issue: "no resource limits set", Severity: "LOW"})
			}
		}
	}

	report := map[string]interface{}{
		"pods_scanned": len(pods.Items),
		"issues_found": len(issues),
		"issues":       issues,
	}

	data, _ := json.MarshalIndent(report, "", "  ")
	return fmt.Sprintf("Security Scan Report:\n%s", string(data)), nil
}

func (e *Executor) resourceUsageReport(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	ns := args["namespace"]
	pods, err := client.Clientset.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list pods: %w", err)
	}

	type nsUsage struct {
		CPURequests    int64 `json:"cpu_requests_millicores"`
		CPULimits      int64 `json:"cpu_limits_millicores"`
		MemoryRequests int64 `json:"memory_requests_mib"`
		MemoryLimits   int64 `json:"memory_limits_mib"`
		PodCount       int   `json:"pod_count"`
	}

	usageByNs := map[string]*nsUsage{}

	for _, pod := range pods.Items {
		if pod.Status.Phase == corev1.PodSucceeded || pod.Status.Phase == corev1.PodFailed {
			continue
		}
		u, ok := usageByNs[pod.Namespace]
		if !ok {
			u = &nsUsage{}
			usageByNs[pod.Namespace] = u
		}
		u.PodCount++
		for _, c := range pod.Spec.Containers {
			u.CPURequests += c.Resources.Requests.Cpu().MilliValue()
			u.CPULimits += c.Resources.Limits.Cpu().MilliValue()
			u.MemoryRequests += c.Resources.Requests.Memory().Value() / (1024 * 1024)
			u.MemoryLimits += c.Resources.Limits.Memory().Value() / (1024 * 1024)
		}
	}

	// Node capacity for context
	nodes, err := client.Clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list nodes: %w", err)
	}

	totalCPU := int64(0)
	totalMem := int64(0)
	for _, n := range nodes.Items {
		totalCPU += n.Status.Capacity.Cpu().MilliValue()
		totalMem += n.Status.Capacity.Memory().Value() / (1024 * 1024)
	}

	report := map[string]interface{}{
		"namespaces":                usageByNs,
		"cluster_cpu_capacity_m":    totalCPU,
		"cluster_memory_capacity_mib": totalMem,
		"node_count":               len(nodes.Items),
	}

	data, _ := json.MarshalIndent(report, "", "  ")
	return fmt.Sprintf("Resource Usage Report:\n%s", string(data)), nil
}

func (e *Executor) compareClusters(ctx context.Context, args map[string]string) (string, error) {
	type clusterSummary struct {
		ClusterID       string   `json:"cluster_id"`
		NodeCount       int      `json:"node_count"`
		Namespaces      []string `json:"namespaces"`
		DeploymentCount int      `json:"deployment_count"`
		PodCount        int      `json:"pod_count"`
		Error           string   `json:"error,omitempty"`
	}

	getSummary := func(clusterID string) clusterSummary {
		summary := clusterSummary{ClusterID: clusterID}
		client, err := e.clusterMgr.GetClient(clusterID)
		if err != nil {
			summary.Error = err.Error()
			return summary
		}

		nodes, err := client.Clientset.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
		if err == nil {
			summary.NodeCount = len(nodes.Items)
		}

		nsList, err := client.Clientset.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
		if err == nil {
			for _, ns := range nsList.Items {
				summary.Namespaces = append(summary.Namespaces, ns.Name)
			}
		}

		deploys, err := client.DynClient.Resource(kindToGVR("deployments")).Namespace("").List(ctx, metav1.ListOptions{})
		if err == nil {
			summary.DeploymentCount = len(deploys.Items)
		}

		pods, err := client.Clientset.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
		if err == nil {
			summary.PodCount = len(pods.Items)
		}

		return summary
	}

	c1 := getSummary(args["cluster_id_1"])
	c2 := getSummary(args["cluster_id_2"])

	report := map[string]interface{}{
		"cluster_1": c1,
		"cluster_2": c2,
	}

	data, _ := json.MarshalIndent(report, "", "  ")
	return fmt.Sprintf("Cluster Comparison:\n%s", string(data)), nil
}
