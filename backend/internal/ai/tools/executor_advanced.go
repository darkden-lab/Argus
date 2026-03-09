package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

func (e *Executor) getNetworkPolicies(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	ns := args["namespace"]
	netpols, err := client.Clientset.NetworkingV1().NetworkPolicies(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to list network policies: %w", err)
	}

	type netpolSummary struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
		PodSelector string `json:"pod_selector"`
		PolicyTypes []string `json:"policy_types"`
	}

	summaries := make([]netpolSummary, 0, len(netpols.Items))
	for _, np := range netpols.Items {
		var policyTypes []string
		for _, pt := range np.Spec.PolicyTypes {
			policyTypes = append(policyTypes, string(pt))
		}
		sel := ""
		if len(np.Spec.PodSelector.MatchLabels) > 0 {
			parts := make([]string, 0)
			for k, v := range np.Spec.PodSelector.MatchLabels {
				parts = append(parts, k+"="+v)
			}
			sel = strings.Join(parts, ",")
		}
		summaries = append(summaries, netpolSummary{
			Name:        np.Name,
			Namespace:   np.Namespace,
			PodSelector: sel,
			PolicyTypes: policyTypes,
		})
	}

	data, _ := json.MarshalIndent(summaries, "", "  ")
	return fmt.Sprintf("Found %d network policies:\n%s", len(summaries), string(data)), nil
}

func (e *Executor) analyzeRBAC(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	subjectKind := args["subject_kind"]
	subjectName := args["subject_name"]
	ns := args["namespace"]

	type permission struct {
		RoleName string   `json:"role_name"`
		RoleKind string   `json:"role_kind"`
		Binding  string   `json:"binding"`
		Rules    []rbacv1.PolicyRule `json:"rules"`
	}

	var permissions []permission

	// Check ClusterRoleBindings
	crbs, err := client.Clientset.RbacV1().ClusterRoleBindings().List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, crb := range crbs.Items {
			for _, subject := range crb.Subjects {
				if subject.Kind == subjectKind && subject.Name == subjectName {
					if ns != "" && subject.Namespace != "" && subject.Namespace != ns {
						continue
					}
					cr, err := client.Clientset.RbacV1().ClusterRoles().Get(ctx, crb.RoleRef.Name, metav1.GetOptions{})
					if err == nil {
						permissions = append(permissions, permission{
							RoleName: crb.RoleRef.Name,
							RoleKind: "ClusterRole",
							Binding:  "ClusterRoleBinding/" + crb.Name,
							Rules:    cr.Rules,
						})
					}
				}
			}
		}
	}

	// Check RoleBindings
	rbs, err := client.Clientset.RbacV1().RoleBindings(ns).List(ctx, metav1.ListOptions{})
	if err == nil {
		for _, rb := range rbs.Items {
			for _, subject := range rb.Subjects {
				if subject.Kind == subjectKind && subject.Name == subjectName {
					if rb.RoleRef.Kind == "ClusterRole" {
						cr, err := client.Clientset.RbacV1().ClusterRoles().Get(ctx, rb.RoleRef.Name, metav1.GetOptions{})
						if err == nil {
							permissions = append(permissions, permission{
								RoleName: rb.RoleRef.Name,
								RoleKind: "ClusterRole",
								Binding:  "RoleBinding/" + rb.Name + " (ns: " + rb.Namespace + ")",
								Rules:    cr.Rules,
							})
						}
					} else {
						role, err := client.Clientset.RbacV1().Roles(rb.Namespace).Get(ctx, rb.RoleRef.Name, metav1.GetOptions{})
						if err == nil {
							permissions = append(permissions, permission{
								RoleName: rb.RoleRef.Name,
								RoleKind: "Role",
								Binding:  "RoleBinding/" + rb.Name + " (ns: " + rb.Namespace + ")",
								Rules:    role.Rules,
							})
						}
					}
				}
			}
		}
	}

	report := map[string]interface{}{
		"subject_kind":    subjectKind,
		"subject_name":    subjectName,
		"namespace":       ns,
		"permissions":     permissions,
		"binding_count":   len(permissions),
	}

	data, _ := json.MarshalIndent(report, "", "  ")
	return fmt.Sprintf("RBAC Analysis:\n%s", string(data)), nil
}

// execAllowedCommands is the allowlist of base commands permitted for AI pod exec.
var execAllowedCommands = map[string]bool{
	"ls": true, "cat": true, "head": true, "tail": true, "env": true,
	"ps": true, "kubectl": true, "grep": true, "find": true, "df": true,
	"du": true, "whoami": true, "hostname": true, "date": true, "uname": true,
	"id": true, "wc": true, "sort": true, "uniq": true, "tr": true,
	"cut": true, "awk": true, "sed": true, "top": true, "free": true,
	"uptime": true, "printenv": true, "stat": true, "file": true,
	"which": true, "echo": true,
}

// execBlockedPatterns contains dangerous command patterns (from terminal/middleware.go).
var execBlockedPatterns = []string{
	"rm -rf /",
	":(){ :|:& };:",
	"> /dev/sda",
	"mkfs",
	"dd if=/dev/zero",
	"chmod -R 777 /",
}

// execShellMetachars are shell metacharacters blocked in AI exec commands.
var execShellMetachars = []string{"|", "&&", "||", ";", "$(", "`"}

func (e *Executor) getPodExec(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	if client.RestConfig == nil {
		return "", fmt.Errorf("exec not available: no REST config for cluster %s", args["cluster_id"])
	}

	rawCmd := args["command"]

	// Block shell metacharacters in the raw command string
	for _, meta := range execShellMetachars {
		if strings.Contains(rawCmd, meta) {
			return "", fmt.Errorf("command not allowed: shell metacharacter %q is not permitted", meta)
		}
	}

	// Block dangerous patterns (reused from terminal/middleware.go)
	lowerCmd := strings.ToLower(rawCmd)
	for _, pattern := range execBlockedPatterns {
		if strings.Contains(lowerCmd, strings.ToLower(pattern)) {
			return "", fmt.Errorf("command not allowed: contains dangerous pattern %q", pattern)
		}
	}

	command := strings.Fields(rawCmd)
	if len(command) == 0 {
		return "", fmt.Errorf("command is required")
	}

	// Check that the base command is in the allowlist
	baseCmd := command[0]
	// Handle absolute paths like /bin/ls -> ls
	if idx := strings.LastIndex(baseCmd, "/"); idx >= 0 {
		baseCmd = baseCmd[idx+1:]
	}
	if !execAllowedCommands[baseCmd] {
		return "", fmt.Errorf("command not allowed: %s", baseCmd)
	}

	execOpts := &corev1.PodExecOptions{
		Command: command,
		Stdout:  true,
		Stderr:  true,
	}
	if c := args["container"]; c != "" {
		execOpts.Container = c
	}

	req := client.Clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(args["pod"]).
		Namespace(args["namespace"]).
		SubResource("exec").
		VersionedParams(execOpts, scheme.ParameterCodec)

	exec, err := remotecommand.NewSPDYExecutor(client.RestConfig, "POST", req.URL())
	if err != nil {
		return "", fmt.Errorf("failed to create executor: %w", err)
	}

	var stdout, stderr bytes.Buffer
	err = exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdout: &stdout,
		Stderr: &stderr,
	})

	result := map[string]string{
		"stdout": stdout.String(),
		"stderr": stderr.String(),
	}
	if err != nil {
		result["error"] = err.Error()
	}

	data, _ := json.MarshalIndent(result, "", "  ")
	return string(data), nil
}

func (e *Executor) portForwardInfo(_ context.Context, args map[string]string) (string, error) {
	ns := args["namespace"]
	resType := args["resource_type"]
	resName := args["resource_name"]
	port := args["port"]

	cmd := fmt.Sprintf("kubectl port-forward -n %s %s/%s %s", ns, resType, resName, port)

	info := map[string]string{
		"command":       cmd,
		"resource":      fmt.Sprintf("%s/%s", resType, resName),
		"namespace":     ns,
		"port":          port,
		"instructions":  fmt.Sprintf("Run the following command to set up port forwarding:\n  %s\nThen access the service at localhost:%s", cmd, strings.Split(port, ":")[0]),
	}

	data, _ := json.MarshalIndent(info, "", "  ")
	return string(data), nil
}

func (e *Executor) rollbackDeployment(ctx context.Context, args map[string]string) (string, error) {
	client, err := e.clusterMgr.GetClient(args["cluster_id"])
	if err != nil {
		return "", err
	}

	ns := args["namespace"]
	name := args["deployment"]

	// Get current deployment to find its revision
	deploy, err := client.Clientset.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to get deployment %s: %w", name, err)
	}

	// Get ReplicaSets to find the target revision
	rsList, err := client.Clientset.AppsV1().ReplicaSets(ns).List(ctx, metav1.ListOptions{
		LabelSelector: metav1.FormatLabelSelector(deploy.Spec.Selector),
	})
	if err != nil {
		return "", fmt.Errorf("failed to list replica sets: %w", err)
	}

	targetRevision := int64(0)
	if rev := args["revision"]; rev != "" {
		targetRevision, err = strconv.ParseInt(rev, 10, 64)
		if err != nil {
			return "", fmt.Errorf("invalid revision: %w", err)
		}
	}

	// Find the target ReplicaSet
	var targetRS string
	currentRev := int64(0)
	previousRev := int64(0)

	for _, rs := range rsList.Items {
		revStr := rs.Annotations["deployment.kubernetes.io/revision"]
		if revStr == "" {
			continue
		}
		rev, _ := strconv.ParseInt(revStr, 10, 64)
		if rev > currentRev {
			previousRev = currentRev
			currentRev = rev
		} else if rev > previousRev {
			previousRev = rev
		}
		if targetRevision > 0 && rev == targetRevision {
			targetRS = rs.Name
		}
	}

	if targetRevision == 0 {
		targetRevision = previousRev
	}

	if targetRevision == 0 {
		return "", fmt.Errorf("no previous revision found for deployment %s", name)
	}

	// Use patch to rollback by setting the revision annotation
	patch := fmt.Sprintf(`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/rollback-revision":"%d"}}}}}`, targetRevision)

	// Actually rollback using the rollback subresource pattern: patch with revision
	// The simplest way is to get the target RS's pod template and patch the deployment
	for _, rs := range rsList.Items {
		revStr := rs.Annotations["deployment.kubernetes.io/revision"]
		rev, _ := strconv.ParseInt(revStr, 10, 64)
		if rev == targetRevision {
			targetRS = rs.Name
			// Patch the deployment with the target RS's pod template spec
			templatePatch, _ := json.Marshal(map[string]interface{}{
				"spec": map[string]interface{}{
					"template": rs.Spec.Template,
				},
			})
			patch = string(templatePatch)
			break
		}
	}

	_, err = client.DynClient.Resource(kindToGVR("deployments")).Namespace(ns).Patch(
		ctx,
		name,
		types.MergePatchType,
		[]byte(patch),
		metav1.PatchOptions{},
	)
	if err != nil {
		return "", fmt.Errorf("failed to rollback deployment %s: %w", name, err)
	}

	msg := fmt.Sprintf("Rolled back deployment %s/%s to revision %d", ns, name, targetRevision)
	if targetRS != "" {
		msg += fmt.Sprintf(" (ReplicaSet: %s)", targetRS)
	}
	return msg, nil
}
