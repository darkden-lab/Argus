package tools

// ToolCall represents a request from the LLM to invoke a tool.
// This is defined locally to avoid an import cycle with the ai package.
type ToolCall struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// Tool describes a function that the LLM can invoke.
type Tool struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Parameters  ToolParams `json:"parameters"`
}

// ToolParams describes the JSON Schema for a tool's parameters.
type ToolParams struct {
	Type       string               `json:"type"`
	Properties map[string]ToolParam `json:"properties"`
	Required   []string             `json:"required,omitempty"`
}

// ToolParam describes a single parameter in a tool's schema.
type ToolParam struct {
	Type        string   `json:"type"`
	Description string   `json:"description"`
	Enum        []string `json:"enum,omitempty"`
}

// RequiresConfirm returns true if the named tool is a write operation that
// must be confirmed by the user before execution.
func RequiresConfirm(toolName string) bool {
	switch toolName {
	case "apply_yaml", "delete_resource", "scale_resource", "restart_resource":
		return true
	default:
		return false
	}
}

// AllTools returns the complete set of K8s tools available to the AI assistant.
func AllTools() []Tool {
	return append(ReadOnlyTools(), WriteTools()...)
}

// ReadOnlyTools returns tools that only read cluster state.
func ReadOnlyTools() []Tool {
	return []Tool{
		{
			Name:        "get_resources",
			Description: "List Kubernetes resources of a given kind in a namespace or across all namespaces. Returns a JSON array of resource objects.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id":     {Type: "string", Description: "The cluster ID to query"},
					"kind":           {Type: "string", Description: "Resource kind (e.g. pods, deployments, services, configmaps, secrets, ingresses, nodes)"},
					"namespace":      {Type: "string", Description: "Namespace to query. Empty string means all namespaces"},
					"label_selector": {Type: "string", Description: "Optional label selector (e.g. app=nginx)"},
					"field_selector": {Type: "string", Description: "Optional field selector (e.g. status.phase=Running)"},
				},
				Required: []string{"cluster_id", "kind"},
			},
		},
		{
			Name:        "describe_resource",
			Description: "Get detailed information about a specific Kubernetes resource, including its spec, status, events, and conditions.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"kind":       {Type: "string", Description: "Resource kind (e.g. pod, deployment, service)"},
					"name":       {Type: "string", Description: "Resource name"},
					"namespace":  {Type: "string", Description: "Namespace of the resource"},
				},
				Required: []string{"cluster_id", "kind", "name", "namespace"},
			},
		},
		{
			Name:        "get_events",
			Description: "Get Kubernetes events, optionally filtered by namespace or resource.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id":    {Type: "string", Description: "The cluster ID"},
					"namespace":     {Type: "string", Description: "Namespace to query. Empty for all namespaces"},
					"involved_name": {Type: "string", Description: "Optional: filter events related to a specific resource name"},
				},
				Required: []string{"cluster_id"},
			},
		},
		{
			Name:        "get_logs",
			Description: "Get container logs from a pod.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"namespace":  {Type: "string", Description: "Pod namespace"},
					"pod_name":   {Type: "string", Description: "Name of the pod"},
					"container":  {Type: "string", Description: "Container name (optional, uses first container if empty)"},
					"tail_lines": {Type: "string", Description: "Number of lines from the end to return (default: 100)"},
					"previous":   {Type: "string", Description: "If 'true', return previous terminated container logs"},
				},
				Required: []string{"cluster_id", "namespace", "pod_name"},
			},
		},
		{
			Name:        "get_metrics",
			Description: "Get resource usage metrics (CPU, memory) for pods or nodes.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id":  {Type: "string", Description: "The cluster ID"},
					"metric_type": {Type: "string", Description: "Type of metrics: 'pods' or 'nodes'", Enum: []string{"pods", "nodes"}},
					"namespace":   {Type: "string", Description: "Namespace (only for pod metrics)"},
				},
				Required: []string{"cluster_id", "metric_type"},
			},
		},
		{
			Name:        "search_resources",
			Description: "Search for resources across the cluster by name pattern, label, or annotation.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"query":      {Type: "string", Description: "Search query (matches resource names)"},
					"kind":       {Type: "string", Description: "Optional: limit search to a specific kind"},
					"namespace":  {Type: "string", Description: "Optional: limit search to a namespace"},
				},
				Required: []string{"cluster_id", "query"},
			},
		},
	}
}

// WriteTools returns tools that modify cluster state and require user confirmation.
func WriteTools() []Tool {
	return []Tool{
		{
			Name:        "apply_yaml",
			Description: "Apply a Kubernetes YAML manifest to the cluster. REQUIRES USER CONFIRMATION before execution.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"namespace":  {Type: "string", Description: "Target namespace"},
					"yaml":       {Type: "string", Description: "The YAML manifest to apply"},
				},
				Required: []string{"cluster_id", "namespace", "yaml"},
			},
		},
		{
			Name:        "delete_resource",
			Description: "Delete a Kubernetes resource. REQUIRES USER CONFIRMATION before execution.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"kind":       {Type: "string", Description: "Resource kind"},
					"name":       {Type: "string", Description: "Resource name"},
					"namespace":  {Type: "string", Description: "Resource namespace"},
				},
				Required: []string{"cluster_id", "kind", "name", "namespace"},
			},
		},
		{
			Name:        "scale_resource",
			Description: "Scale a Deployment, StatefulSet, or ReplicaSet to a specified number of replicas. REQUIRES USER CONFIRMATION.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"kind":       {Type: "string", Description: "Resource kind (deployment, statefulset, replicaset)", Enum: []string{"deployment", "statefulset", "replicaset"}},
					"name":       {Type: "string", Description: "Resource name"},
					"namespace":  {Type: "string", Description: "Resource namespace"},
					"replicas":   {Type: "string", Description: "Desired number of replicas"},
				},
				Required: []string{"cluster_id", "kind", "name", "namespace", "replicas"},
			},
		},
		{
			Name:        "restart_resource",
			Description: "Trigger a rolling restart of a Deployment or StatefulSet. REQUIRES USER CONFIRMATION.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"kind":       {Type: "string", Description: "Resource kind (deployment, statefulset)", Enum: []string{"deployment", "statefulset"}},
					"name":       {Type: "string", Description: "Resource name"},
					"namespace":  {Type: "string", Description: "Resource namespace"},
				},
				Required: []string{"cluster_id", "kind", "name", "namespace"},
			},
		},
	}
}
