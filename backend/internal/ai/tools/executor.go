package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/k8s-dashboard/backend/internal/ai"
	"github.com/k8s-dashboard/backend/internal/cluster"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	yamlutil "k8s.io/apimachinery/pkg/util/yaml"
)

// ToolResult is the outcome of executing a tool call.
type ToolResult struct {
	ToolCallID string `json:"tool_call_id"`
	Content    string `json:"content"`
	IsError    bool   `json:"is_error"`
}

// Executor runs AI tool calls against Kubernetes clusters.
type Executor struct {
	clusterMgr *cluster.Manager
}

// NewExecutor creates a tool executor.
func NewExecutor(clusterMgr *cluster.Manager) *Executor {
	return &Executor{clusterMgr: clusterMgr}
}

// Execute runs a single tool call and returns the result. Write operations
// should only be executed after user confirmation (checked by the caller).
func (e *Executor) Execute(ctx context.Context, call ai.ToolCall) ToolResult {
	result, err := e.dispatch(ctx, call)
	if err != nil {
		return ToolResult{
			ToolCallID: call.ID,
			Content:    fmt.Sprintf("Error: %s", err.Error()),
			IsError:    true,
		}
	}
	return ToolResult{
		ToolCallID: call.ID,
		Content:    result,
	}
}

func (e *Executor) dispatch(ctx context.Context, call ai.ToolCall) (string, error) {
	var args map[string]string
	if err := json.Unmarshal([]byte(call.Arguments), &args); err != nil {
		return "", fmt.Errorf("invalid tool arguments: %w", err)
	}

	switch call.Name {
	case "get_resources":
		return e.getResources(ctx, args)
	case "describe_resource":
		return e.describeResource(ctx, args)
	case "get_events":
		return e.getEvents(ctx, args)
	case "get_logs":
		return e.getLogs(ctx, args)
	case "get_metrics":
		return e.getMetrics(ctx, args)
	case "search_resources":
		return e.searchResources(ctx, args)
	case "apply_yaml":
		return e.applyYAML(ctx, args)
	case "delete_resource":
		return e.deleteResource(ctx, args)
	case "scale_resource":
		return e.scaleResource(ctx, args)
	case "restart_resource":
		return e.restartResource(ctx, args)
	default:
		return "", fmt.Errorf("unknown tool: %s", call.Name)
	}
}

func (e *Executor) getResources(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	gvr := kindToGVR(args["kind"])
	ns := args["namespace"]

	opts := metav1.ListOptions{}
	if ls := args["label_selector"]; ls != "" {
		opts.LabelSelector = ls
	}
	if fs := args["field_selector"]; fs != "" {
		opts.FieldSelector = fs
	}

	list, err := client.DynClient.Resource(gvr).Namespace(ns).List(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("failed to list %s: %w", args["kind"], err)
	}

	type resourceSummary struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		Age       string `json:"age"`
	}

	summaries := make([]resourceSummary, 0, len(list.Items))
	for _, item := range list.Items {
		age := ""
		if ts := item.GetCreationTimestamp(); !ts.IsZero() {
			age = time.Since(ts.Time).Round(time.Second).String()
		}
		summaries = append(summaries, resourceSummary{
			Name:      item.GetName(),
			Namespace: item.GetNamespace(),
			Age:       age,
		})
	}

	data, _ := json.MarshalIndent(summaries, "", "  ")
	return fmt.Sprintf("Found %d %s:\n%s", len(summaries), args["kind"], string(data)), nil
}

func (e *Executor) describeResource(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	gvr := kindToGVR(args["kind"])
	obj, err := client.DynClient.Resource(gvr).Namespace(args["namespace"]).Get(ctx, args["name"], metav1.GetOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to get %s/%s: %w", args["kind"], args["name"], err)
	}

	data, _ := json.MarshalIndent(obj.Object, "", "  ")
	return string(data), nil
}

func (e *Executor) getEvents(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	ns := args["namespace"]
	opts := metav1.ListOptions{}
	if name := args["involved_name"]; name != "" {
		opts.FieldSelector = "involvedObject.name=" + name
	}

	events, err := client.Clientset.CoreV1().Events(ns).List(ctx, opts)
	if err != nil {
		return "", fmt.Errorf("failed to list events: %w", err)
	}

	type eventSummary struct {
		Type    string `json:"type"`
		Reason  string `json:"reason"`
		Message string `json:"message"`
		Object  string `json:"object"`
		Age     string `json:"age"`
		Count   int32  `json:"count"`
	}

	summaries := make([]eventSummary, 0, len(events.Items))
	for _, ev := range events.Items {
		age := ""
		if !ev.LastTimestamp.IsZero() {
			age = time.Since(ev.LastTimestamp.Time).Round(time.Second).String()
		}
		summaries = append(summaries, eventSummary{
			Type:    ev.Type,
			Reason:  ev.Reason,
			Message: ev.Message,
			Object:  ev.InvolvedObject.Kind + "/" + ev.InvolvedObject.Name,
			Age:     age,
			Count:   ev.Count,
		})
	}

	data, _ := json.MarshalIndent(summaries, "", "  ")
	return fmt.Sprintf("Found %d events:\n%s", len(summaries), string(data)), nil
}

func (e *Executor) getLogs(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	tailLines := int64(100)
	if tl := args["tail_lines"]; tl != "" {
		if n, err := strconv.ParseInt(tl, 10, 64); err == nil && n > 0 {
			tailLines = n
		}
	}

	opts := &corev1.PodLogOptions{
		TailLines: &tailLines,
	}
	if c := args["container"]; c != "" {
		opts.Container = c
	}
	if args["previous"] == "true" {
		opts.Previous = true
	}

	stream, err := client.Clientset.CoreV1().Pods(args["namespace"]).GetLogs(args["pod_name"], opts).Stream(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get logs for %s: %w", args["pod_name"], err)
	}
	defer stream.Close()

	logBytes, err := io.ReadAll(io.LimitReader(stream, 64*1024)) // 64KB max
	if err != nil {
		return "", fmt.Errorf("failed to read logs: %w", err)
	}

	return string(logBytes), nil
}

func (e *Executor) getMetrics(ctx context.Context, args map[string]string) (string, error) {
	_, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	return "Metrics collection requires metrics-server. Use 'get_resources' with kind 'pods' and check resource requests/limits in pod spec for capacity planning.", nil
}

func (e *Executor) searchResources(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	query := strings.ToLower(args["query"])
	ns := args["namespace"]

	kinds := []string{"pods", "deployments", "services", "configmaps", "statefulsets", "daemonsets", "jobs", "ingresses"}
	if k := args["kind"]; k != "" {
		kinds = []string{k}
	}

	type searchResult struct {
		Kind      string `json:"kind"`
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}

	var results []searchResult
	for _, kind := range kinds {
		gvr := kindToGVR(kind)
		list, err := client.DynClient.Resource(gvr).Namespace(ns).List(ctx, metav1.ListOptions{})
		if err != nil {
			continue
		}
		for _, item := range list.Items {
			if strings.Contains(strings.ToLower(item.GetName()), query) {
				results = append(results, searchResult{
					Kind:      kind,
					Name:      item.GetName(),
					Namespace: item.GetNamespace(),
				})
			}
		}
	}

	data, _ := json.MarshalIndent(results, "", "  ")
	return fmt.Sprintf("Found %d resources matching %q:\n%s", len(results), args["query"], string(data)), nil
}

func (e *Executor) applyYAML(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	decoder := yamlutil.NewYAMLOrJSONDecoder(strings.NewReader(args["yaml"]), 4096)
	var obj unstructured.Unstructured
	if err := decoder.Decode(&obj); err != nil {
		return "", fmt.Errorf("failed to decode YAML: %w", err)
	}

	gvk := obj.GroupVersionKind()
	gvr := schema.GroupVersionResource{
		Group:    gvk.Group,
		Version:  gvk.Version,
		Resource: strings.ToLower(gvk.Kind) + "s",
	}

	ns := args["namespace"]
	if obj.GetNamespace() != "" {
		ns = obj.GetNamespace()
	}

	result, err := client.DynClient.Resource(gvr).Namespace(ns).Apply(
		ctx,
		obj.GetName(),
		&obj,
		metav1.ApplyOptions{FieldManager: "k8s-dashboard-ai"},
	)
	if err != nil {
		return "", fmt.Errorf("failed to apply: %w", err)
	}

	return fmt.Sprintf("Applied %s/%s in namespace %s", result.GetKind(), result.GetName(), result.GetNamespace()), nil
}

func (e *Executor) deleteResource(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	gvr := kindToGVR(args["kind"])
	err = client.DynClient.Resource(gvr).Namespace(args["namespace"]).Delete(ctx, args["name"], metav1.DeleteOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to delete %s/%s: %w", args["kind"], args["name"], err)
	}

	return fmt.Sprintf("Deleted %s/%s in namespace %s", args["kind"], args["name"], args["namespace"]), nil
}

func (e *Executor) scaleResource(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	replicas, err := strconv.Atoi(args["replicas"])
	if err != nil {
		return "", fmt.Errorf("invalid replicas value: %w", err)
	}

	gvr := kindToGVR(args["kind"])
	patch := fmt.Sprintf(`{"spec":{"replicas":%d}}`, replicas)

	_, err = client.DynClient.Resource(gvr).Namespace(args["namespace"]).Patch(
		ctx,
		args["name"],
		types.MergePatchType,
		[]byte(patch),
		metav1.PatchOptions{},
	)
	if err != nil {
		return "", fmt.Errorf("failed to scale %s/%s: %w", args["kind"], args["name"], err)
	}

	return fmt.Sprintf("Scaled %s/%s to %d replicas in namespace %s", args["kind"], args["name"], replicas, args["namespace"]), nil
}

func (e *Executor) restartResource(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	gvr := kindToGVR(args["kind"])

	now := time.Now().Format(time.RFC3339)
	patch := fmt.Sprintf(`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`, now)

	_, err = client.DynClient.Resource(gvr).Namespace(args["namespace"]).Patch(
		ctx,
		args["name"],
		types.MergePatchType,
		[]byte(patch),
		metav1.PatchOptions{},
	)
	if err != nil {
		return "", fmt.Errorf("failed to restart %s/%s: %w", args["kind"], args["name"], err)
	}

	return fmt.Sprintf("Rolling restart triggered for %s/%s in namespace %s", args["kind"], args["name"], args["namespace"]), nil
}

// kindToGVR maps common kubectl resource names to GroupVersionResource.
func kindToGVR(kind string) schema.GroupVersionResource {
	kind = strings.ToLower(kind)
	switch kind {
	case "pod", "pods":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "pods"}
	case "service", "services", "svc":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "services"}
	case "configmap", "configmaps", "cm":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "configmaps"}
	case "secret", "secrets":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "secrets"}
	case "namespace", "namespaces", "ns":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "namespaces"}
	case "node", "nodes":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "nodes"}
	case "event", "events":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "events"}
	case "deployment", "deployments", "deploy":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	case "statefulset", "statefulsets", "sts":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}
	case "daemonset", "daemonsets", "ds":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "daemonsets"}
	case "replicaset", "replicasets", "rs":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "replicasets"}
	case "job", "jobs":
		return schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "jobs"}
	case "cronjob", "cronjobs", "cj":
		return schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "cronjobs"}
	case "ingress", "ingresses", "ing":
		return schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}
	case "networkpolicy", "networkpolicies", "netpol":
		return schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"}
	case "persistentvolumeclaim", "persistentvolumeclaims", "pvc":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumeclaims"}
	case "persistentvolume", "persistentvolumes", "pv":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "persistentvolumes"}
	case "serviceaccount", "serviceaccounts", "sa":
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: "serviceaccounts"}
	default:
		resource := kind
		if !strings.HasSuffix(resource, "s") {
			resource += "s"
		}
		return schema.GroupVersionResource{Group: "", Version: "v1", Resource: resource}
	}
}
