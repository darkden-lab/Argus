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
	case "apply_yaml", "delete_resource", "scale_resource", "restart_resource",
		"rollback_deployment", "get_pod_exec", "delete_memory":
		return true
	default:
		return false
	}
}

// ToolsForLevel returns the tools available for the given permission level.
func ToolsForLevel(level string) []Tool {
	switch level {
	case "disabled":
		return nil
	case "read_only":
		return ReadOnlyTools()
	default:
		return AllTools()
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
		{
			Name:        "get_network_policies",
			Description: "List NetworkPolicies in a namespace or across all namespaces.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"namespace":  {Type: "string", Description: "Namespace to query. Empty for all namespaces"},
				},
				Required: []string{"cluster_id"},
			},
		},
		{
			Name:        "analyze_rbac",
			Description: "Analyze RBAC permissions for a user or ServiceAccount. Returns all roles and permissions bound to the subject.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id":   {Type: "string", Description: "The cluster ID"},
					"subject_kind": {Type: "string", Description: "Kind of subject: User or ServiceAccount", Enum: []string{"User", "ServiceAccount"}},
					"subject_name": {Type: "string", Description: "Name of the user or ServiceAccount"},
					"namespace":    {Type: "string", Description: "Optional: namespace to scope the analysis"},
				},
				Required: []string{"cluster_id", "subject_kind", "subject_name"},
			},
		},
		{
			Name:        "port_forward_info",
			Description: "Show port-forward instructions for a resource. Returns the kubectl command to run.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id":    {Type: "string", Description: "The cluster ID"},
					"namespace":     {Type: "string", Description: "Resource namespace"},
					"resource_type": {Type: "string", Description: "Resource type (pod, service, deployment)"},
					"resource_name": {Type: "string", Description: "Resource name"},
					"port":          {Type: "string", Description: "Port to forward (e.g. 8080 or 8080:80)"},
				},
				Required: []string{"cluster_id", "namespace", "resource_type", "resource_name", "port"},
			},
		},
		{
			Name:        "cluster_health_check",
			Description: "Comprehensive cluster health check: node status, pod counts by phase, recent warning events, and PVC status.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
				},
				Required: []string{"cluster_id"},
			},
		},
		{
			Name:        "security_scan",
			Description: "Scan pods for security issues: privileged containers, runAsRoot, hostNetwork, latest image tags, missing resource limits.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"namespace":  {Type: "string", Description: "Namespace to scan. Empty for all namespaces"},
				},
				Required: []string{"cluster_id"},
			},
		},
		{
			Name:        "resource_usage_report",
			Description: "CPU and memory resource usage report: aggregate requests and limits per namespace across all pods.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"namespace":  {Type: "string", Description: "Optional: specific namespace. Empty for all namespaces"},
				},
				Required: []string{"cluster_id"},
			},
		},
		{
			Name:        "compare_clusters",
			Description: "Compare two clusters: node counts, namespace lists, and deployment counts.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id_1": {Type: "string", Description: "First cluster ID"},
					"cluster_id_2": {Type: "string", Description: "Second cluster ID"},
				},
				Required: []string{"cluster_id_1", "cluster_id_2"},
			},
		},
		{
			Name:        "query_prometheus",
			Description: "Execute a PromQL query via the Prometheus plugin. Requires the prometheus plugin to be enabled.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"query":      {Type: "string", Description: "PromQL query string"},
					"start":      {Type: "string", Description: "Optional: start time (RFC3339 or relative like -1h)"},
					"end":        {Type: "string", Description: "Optional: end time (RFC3339 or relative)"},
					"step":       {Type: "string", Description: "Optional: query step (e.g. 15s, 1m)"},
				},
				Required: []string{"cluster_id", "query"},
			},
		},
		{
			Name:        "get_alerts",
			Description: "Get active alerts from Alertmanager. Requires the prometheus plugin to be enabled.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
				},
				Required: []string{"cluster_id"},
			},
		},
		{
			Name:        "get_helm_releases",
			Description: "List Helm releases in the cluster. Requires the helm plugin to be enabled.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"namespace":  {Type: "string", Description: "Optional: namespace to filter releases"},
				},
				Required: []string{"cluster_id"},
			},
		},
		{
			Name:        "save_memory",
			Description: "Save an important fact, preference, or learning about this user for future conversations. Use this proactively when the user shares preferences, environment details, or recurring patterns.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"content":  {Type: "string", Description: "The fact or preference to remember"},
					"category": {Type: "string", Description: "Category: preference, fact, learning, workflow", Enum: []string{"preference", "fact", "learning", "workflow"}},
				},
				Required: []string{"content", "category"},
			},
		},
		{
			Name:        "recall_memory",
			Description: "Search user's saved memories for relevant context. Use before save_memory to avoid duplicates.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"query": {Type: "string", Description: "Search term to find relevant memories"},
				},
				Required: []string{"query"},
			},
		},
		{
			Name:        "delete_memory",
			Description: "Delete a specific user memory by ID. Use when user asks to forget something. REQUIRES USER CONFIRMATION.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"memory_id": {Type: "string", Description: "ID of the memory to delete"},
				},
				Required: []string{"memory_id"},
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
		{
			Name:        "rollback_deployment",
			Description: "Rollback a Deployment to a previous revision. REQUIRES USER CONFIRMATION.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"namespace":  {Type: "string", Description: "Deployment namespace"},
					"deployment": {Type: "string", Description: "Deployment name"},
					"revision":   {Type: "string", Description: "Optional: specific revision number to rollback to. Empty means previous revision"},
				},
				Required: []string{"cluster_id", "namespace", "deployment"},
			},
		},
		{
			Name:        "get_pod_exec",
			Description: "Execute a command in a running pod container. REQUIRES USER CONFIRMATION.",
			Parameters: ToolParams{
				Type: "object",
				Properties: map[string]ToolParam{
					"cluster_id": {Type: "string", Description: "The cluster ID"},
					"namespace":  {Type: "string", Description: "Pod namespace"},
					"pod":        {Type: "string", Description: "Pod name"},
					"container":  {Type: "string", Description: "Optional: container name (uses first container if empty)"},
					"command":    {Type: "string", Description: "Command to execute (e.g. 'ls -la /tmp')"},
				},
				Required: []string{"cluster_id", "namespace", "pod", "command"},
			},
		},
	}
}
