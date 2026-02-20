package terminal

import (
	"context"
	"fmt"
	"io"
	"log"

	"github.com/k8s-dashboard/backend/internal/cluster"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

const (
	defaultShellImage = "bitnami/kubectl:latest"
	toolsPodLabel     = "app=dashboard-tools"
)

// ExecSession manages a raw shell exec session inside a pod.
type ExecSession struct {
	clusterMgr *cluster.Manager
	clusterID  string
	namespace  string
	podName    string
	container  string
}

// NewExecSession creates a new raw exec session.
func NewExecSession(clusterMgr *cluster.Manager, clusterID, namespace string) *ExecSession {
	return &ExecSession{
		clusterMgr: clusterMgr,
		clusterID:  clusterID,
		namespace:  namespace,
	}
}

// FindOrCreateToolsPod looks for an existing dashboard-tools pod or creates one.
func (e *ExecSession) FindOrCreateToolsPod(ctx context.Context) (string, error) {
	client, err := e.clusterMgr.GetClient(e.clusterID)
	if err != nil {
		return "", fmt.Errorf("exec: cluster not available: %w", err)
	}

	ns := e.namespace
	if ns == "" {
		ns = "default"
	}

	// Look for existing tools pod
	pods, err := client.Clientset.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{
		LabelSelector: toolsPodLabel,
	})
	if err != nil {
		return "", fmt.Errorf("exec: list pods: %w", err)
	}

	for _, pod := range pods.Items {
		if pod.Status.Phase == corev1.PodRunning {
			e.podName = pod.Name
			if len(pod.Spec.Containers) > 0 {
				e.container = pod.Spec.Containers[0].Name
			}
			return pod.Name, nil
		}
	}

	// Create a tools pod
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			GenerateName: "dashboard-tools-",
			Namespace:    ns,
			Labels: map[string]string{
				"app": "dashboard-tools",
			},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:    "tools",
					Image:   defaultShellImage,
					Command: []string{"sleep", "3600"},
					Stdin:   true,
					TTY:     true,
				},
			},
			RestartPolicy: corev1.RestartPolicyNever,
		},
	}

	created, err := client.Clientset.CoreV1().Pods(ns).Create(ctx, pod, metav1.CreateOptions{})
	if err != nil {
		return "", fmt.Errorf("exec: create tools pod: %w", err)
	}

	e.podName = created.Name
	e.container = "tools"

	log.Printf("exec: created tools pod %s/%s", ns, created.Name)
	return created.Name, nil
}

// Exec executes a command in the tools pod and returns stdout/stderr.
func (e *ExecSession) Exec(ctx context.Context, command []string, stdin io.Reader, stdout, stderr io.Writer) error {
	client, err := e.clusterMgr.GetClient(e.clusterID)
	if err != nil {
		return fmt.Errorf("exec: cluster not available: %w", err)
	}

	ns := e.namespace
	if ns == "" {
		ns = "default"
	}

	req := client.Clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(e.podName).
		Namespace(ns).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: e.container,
			Command:   command,
			Stdin:     stdin != nil,
			Stdout:    true,
			Stderr:    true,
			TTY:       stdin != nil,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(client.RestConfig, "POST", req.URL())
	if err != nil {
		return fmt.Errorf("exec: create executor: %w", err)
	}

	streamOpts := remotecommand.StreamOptions{
		Stdout: stdout,
		Stderr: stderr,
	}
	if stdin != nil {
		streamOpts.Stdin = stdin
	}

	return executor.StreamWithContext(ctx, streamOpts)
}

// Cleanup removes the tools pod if it was created by this session.
func (e *ExecSession) Cleanup(ctx context.Context) error {
	if e.podName == "" {
		return nil
	}

	client, err := e.clusterMgr.GetClient(e.clusterID)
	if err != nil {
		return err
	}

	ns := e.namespace
	if ns == "" {
		ns = "default"
	}

	return client.Clientset.CoreV1().Pods(ns).Delete(ctx, e.podName, metav1.DeleteOptions{})
}
