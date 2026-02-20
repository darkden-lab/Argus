package terminal

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/k8s-dashboard/backend/internal/cluster"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// SmartParser parses kubectl-like commands and translates them to client-go
// API calls, returning formatted output.
type SmartParser struct {
	clusterMgr *cluster.Manager
}

// NewSmartParser creates a new smart mode parser.
func NewSmartParser(clusterMgr *cluster.Manager) *SmartParser {
	return &SmartParser{clusterMgr: clusterMgr}
}

// ParsedCommand represents a parsed kubectl-like command.
type ParsedCommand struct {
	Verb      string   // get, describe, logs, delete, scale, rollout, top, exec, edit, apply
	Resource  string   // pods, deployments, services, etc.
	Name      string   // resource name (optional)
	Namespace string   // -n flag value
	Output    string   // -o flag value (json, yaml, wide)
	Labels    string   // -l flag value
	AllNS     bool     // --all-namespaces
	Args      []string // remaining arguments
}

// Parse takes a raw input string and parses it into a structured command.
func (p *SmartParser) Parse(input string) (*ParsedCommand, error) {
	parts := strings.Fields(input)
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty command")
	}

	// Strip leading "kubectl" or "k" if present
	if parts[0] == "kubectl" || parts[0] == "k" {
		parts = parts[1:]
	}

	if len(parts) == 0 {
		return nil, fmt.Errorf("no verb specified")
	}

	cmd := &ParsedCommand{
		Verb: parts[0],
	}

	// Parse remaining args
	i := 1
	for i < len(parts) {
		switch {
		case parts[i] == "-n" || parts[i] == "--namespace":
			if i+1 < len(parts) {
				cmd.Namespace = parts[i+1]
				i += 2
			} else {
				return nil, fmt.Errorf("missing namespace value")
			}
		case parts[i] == "-o" || parts[i] == "--output":
			if i+1 < len(parts) {
				cmd.Output = parts[i+1]
				i += 2
			} else {
				return nil, fmt.Errorf("missing output value")
			}
		case parts[i] == "-l" || parts[i] == "--selector":
			if i+1 < len(parts) {
				cmd.Labels = parts[i+1]
				i += 2
			} else {
				return nil, fmt.Errorf("missing label selector")
			}
		case parts[i] == "-A" || parts[i] == "--all-namespaces":
			cmd.AllNS = true
			i++
		case strings.HasPrefix(parts[i], "-o="):
			cmd.Output = strings.TrimPrefix(parts[i], "-o=")
			i++
		case strings.HasPrefix(parts[i], "-n="):
			cmd.Namespace = strings.TrimPrefix(parts[i], "-n=")
			i++
		case strings.HasPrefix(parts[i], "-l="):
			cmd.Labels = strings.TrimPrefix(parts[i], "-l=")
			i++
		default:
			if cmd.Resource == "" {
				// resource/name or just resource
				if strings.Contains(parts[i], "/") {
					split := strings.SplitN(parts[i], "/", 2)
					cmd.Resource = split[0]
					cmd.Name = split[1]
				} else {
					cmd.Resource = parts[i]
				}
			} else if cmd.Name == "" {
				cmd.Name = parts[i]
			} else {
				cmd.Args = append(cmd.Args, parts[i])
			}
			i++
		}
	}

	return cmd, nil
}

// Execute runs a parsed command against the cluster and returns the output.
func (p *SmartParser) Execute(ctx context.Context, clusterID string, cmd *ParsedCommand) (string, error) {
	client, err := p.clusterMgr.GetClient(clusterID)
	if err != nil {
		return "", fmt.Errorf("cluster %s not available: %w", clusterID, err)
	}

	switch cmd.Verb {
	case "get":
		return p.executeGet(ctx, client, cmd)
	case "describe":
		return p.executeDescribe(ctx, client, cmd)
	case "logs", "log":
		return p.executeLogs(ctx, client, cmd)
	case "version":
		return p.executeVersion(ctx, client)
	default:
		return "", fmt.Errorf("unsupported command: %s (supported: get, describe, logs, version)", cmd.Verb)
	}
}

func (p *SmartParser) executeGet(ctx context.Context, client *cluster.ClusterClient, cmd *ParsedCommand) (string, error) {
	if cmd.Resource == "" {
		return "", fmt.Errorf("resource type required: kubectl get <resource>")
	}

	gvr := smartKindToGVR(cmd.Resource)
	ns := cmd.Namespace
	if cmd.AllNS {
		ns = ""
	}

	opts := metav1.ListOptions{}
	if cmd.Labels != "" {
		opts.LabelSelector = cmd.Labels
	}

	if cmd.Name != "" {
		// Get specific resource
		obj, err := client.DynClient.Resource(gvr).Namespace(ns).Get(ctx, cmd.Name, metav1.GetOptions{})
		if err != nil {
			return "", err
		}

		if cmd.Output == "json" {
			data, _ := json.MarshalIndent(obj.Object, "", "  ")
			return string(data), nil
		}
		if cmd.Output == "yaml" {
			data, _ := json.MarshalIndent(obj.Object, "", "  ")
			return string(data), nil // Simplified; real impl would use YAML
		}

		return formatSingleResource(obj.GetName(), obj.GetNamespace(), obj.GetCreationTimestamp().Time), nil
	}

	list, err := client.DynClient.Resource(gvr).Namespace(ns).List(ctx, opts)
	if err != nil {
		return "", err
	}

	if cmd.Output == "json" {
		data, _ := json.MarshalIndent(list, "", "  ")
		return string(data), nil
	}

	return formatResourceTable(cmd.Resource, list.Items, cmd.AllNS), nil
}

func (p *SmartParser) executeDescribe(ctx context.Context, client *cluster.ClusterClient, cmd *ParsedCommand) (string, error) {
	if cmd.Resource == "" || cmd.Name == "" {
		return "", fmt.Errorf("usage: describe <resource> <name>")
	}

	gvr := smartKindToGVR(cmd.Resource)
	obj, err := client.DynClient.Resource(gvr).Namespace(cmd.Namespace).Get(ctx, cmd.Name, metav1.GetOptions{})
	if err != nil {
		return "", err
	}

	data, _ := json.MarshalIndent(obj.Object, "", "  ")
	return string(data), nil
}

func (p *SmartParser) executeLogs(ctx context.Context, client *cluster.ClusterClient, cmd *ParsedCommand) (string, error) {
	if cmd.Resource == "" && cmd.Name == "" {
		return "", fmt.Errorf("usage: logs <pod-name>")
	}

	podName := cmd.Resource
	if cmd.Name != "" {
		podName = cmd.Name
	}

	ns := cmd.Namespace
	if ns == "" {
		ns = "default"
	}

	tailLines := int64(50)
	opts := &corev1.PodLogOptions{TailLines: &tailLines}
	stream, err := client.Clientset.CoreV1().Pods(ns).GetLogs(podName, opts).Stream(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get logs: %w", err)
	}
	defer stream.Close()

	buf := make([]byte, 32*1024)
	n, _ := stream.Read(buf)
	return string(buf[:n]), nil
}

func (p *SmartParser) executeVersion(ctx context.Context, client *cluster.ClusterClient) (string, error) {
	ver, err := client.Clientset.Discovery().ServerVersion()
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("Server Version: %s\nPlatform: %s", ver.GitVersion, ver.Platform), nil
}

// smartKindToGVR maps kubectl shortnames to GVR.
func smartKindToGVR(kind string) schema.GroupVersionResource {
	kind = strings.ToLower(kind)
	switch kind {
	case "po", "pod", "pods":
		return schema.GroupVersionResource{Version: "v1", Resource: "pods"}
	case "svc", "service", "services":
		return schema.GroupVersionResource{Version: "v1", Resource: "services"}
	case "deploy", "deployment", "deployments":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}
	case "ds", "daemonset", "daemonsets":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "daemonsets"}
	case "sts", "statefulset", "statefulsets":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}
	case "rs", "replicaset", "replicasets":
		return schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "replicasets"}
	case "cm", "configmap", "configmaps":
		return schema.GroupVersionResource{Version: "v1", Resource: "configmaps"}
	case "secret", "secrets":
		return schema.GroupVersionResource{Version: "v1", Resource: "secrets"}
	case "ns", "namespace", "namespaces":
		return schema.GroupVersionResource{Version: "v1", Resource: "namespaces"}
	case "no", "node", "nodes":
		return schema.GroupVersionResource{Version: "v1", Resource: "nodes"}
	case "ing", "ingress", "ingresses":
		return schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}
	case "job", "jobs":
		return schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "jobs"}
	case "cj", "cronjob", "cronjobs":
		return schema.GroupVersionResource{Group: "batch", Version: "v1", Resource: "cronjobs"}
	case "pvc", "persistentvolumeclaim", "persistentvolumeclaims":
		return schema.GroupVersionResource{Version: "v1", Resource: "persistentvolumeclaims"}
	case "pv", "persistentvolume", "persistentvolumes":
		return schema.GroupVersionResource{Version: "v1", Resource: "persistentvolumes"}
	case "sa", "serviceaccount", "serviceaccounts":
		return schema.GroupVersionResource{Version: "v1", Resource: "serviceaccounts"}
	case "ev", "event", "events":
		return schema.GroupVersionResource{Version: "v1", Resource: "events"}
	default:
		resource := kind
		if !strings.HasSuffix(resource, "s") {
			resource += "s"
		}
		return schema.GroupVersionResource{Version: "v1", Resource: resource}
	}
}

func formatResourceTable(kind string, items []unstructuredItem, showNS bool) string {
	if len(items) == 0 {
		return fmt.Sprintf("No resources found in %s.", kind)
	}

	var sb strings.Builder
	if showNS {
		sb.WriteString(fmt.Sprintf("%-20s %-40s %s\n", "NAMESPACE", "NAME", "AGE"))
	} else {
		sb.WriteString(fmt.Sprintf("%-40s %s\n", "NAME", "AGE"))
	}

	for _, item := range items {
		age := "unknown"
		ts := item.GetCreationTimestamp()
		if !ts.IsZero() {
			age = formatAge(time.Since(ts.Time))
		}
		if showNS {
			sb.WriteString(fmt.Sprintf("%-20s %-40s %s\n", item.GetNamespace(), item.GetName(), age))
		} else {
			sb.WriteString(fmt.Sprintf("%-40s %s\n", item.GetName(), age))
		}
	}

	return sb.String()
}

func formatSingleResource(name, ns string, created time.Time) string {
	age := formatAge(time.Since(created))
	return fmt.Sprintf("NAME: %s  NAMESPACE: %s  AGE: %s", name, ns, age)
}

func formatAge(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

// Type alias needed for formatResourceTable
type unstructuredItem = unstructured.Unstructured
