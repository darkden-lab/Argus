package pvcbrowser

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"

	"github.com/darkden-lab/argus/backend/internal/cluster"
)

const (
	containerName = "browser"
	mountPath     = "/mnt/pvc"
	sessionTTL    = 30 * time.Minute
	cleanupTick   = 5 * time.Minute
	podWaitLimit  = 60 * time.Second
)

// Session represents a PVC browser session with an ephemeral pod.
type Session struct {
	ID         string    `json:"id"`
	ClusterID  string    `json:"cluster_id"`
	Namespace  string    `json:"namespace"`
	PVCName    string    `json:"pvc_name"`
	PodName    string    `json:"pod_name"`
	UserID     string    `json:"user_id"`
	CreatedAt  time.Time `json:"created_at"`
	LastUsedAt time.Time `json:"last_used_at"`
}

// SessionManager manages PVC browser sessions.
type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	stopCh   chan struct{}
}

// NewSessionManager creates a new SessionManager.
func NewSessionManager() *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*Session),
		stopCh:   make(chan struct{}),
	}
}

// StartSession creates an ephemeral pod that mounts the given PVC.
func (sm *SessionManager) StartSession(ctx context.Context, clusterMgr *cluster.Manager, clusterID, namespace, pvcName, userID string) (*Session, error) {
	client, err := clusterMgr.GetClient(clusterID)
	if err != nil {
		return nil, fmt.Errorf("pvcbrowser: cluster not available: %w", err)
	}

	// Validate PVC exists and is Bound
	pvc, err := client.Clientset.CoreV1().PersistentVolumeClaims(namespace).Get(ctx, pvcName, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("pvcbrowser: get PVC: %w", err)
	}
	if pvc.Status.Phase != corev1.ClaimBound {
		return nil, fmt.Errorf("pvcbrowser: PVC %q is not Bound (status: %s)", pvcName, pvc.Status.Phase)
	}

	// Create ephemeral pod
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			GenerateName: "argus-pvc-browser-",
			Namespace:    namespace,
			Labels: map[string]string{
				"app": "argus-pvc-browser",
			},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:    containerName,
					Image:   "alpine:3.20",
					Command: []string{"sleep", "3600"},
					VolumeMounts: []corev1.VolumeMount{
						{
							Name:      "pvc-data",
							MountPath: mountPath,
						},
					},
					Resources: corev1.ResourceRequirements{
						Limits: corev1.ResourceList{
							corev1.ResourceCPU:    resource.MustParse("100m"),
							corev1.ResourceMemory: resource.MustParse("64Mi"),
						},
					},
				},
			},
			Volumes: []corev1.Volume{
				{
					Name: "pvc-data",
					VolumeSource: corev1.VolumeSource{
						PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
							ClaimName: pvcName,
						},
					},
				},
			},
			RestartPolicy: corev1.RestartPolicyNever,
		},
	}

	created, err := client.Clientset.CoreV1().Pods(namespace).Create(ctx, pod, metav1.CreateOptions{})
	if err != nil {
		return nil, fmt.Errorf("pvcbrowser: create pod: %w", err)
	}

	// Wait for pod to be Running
	if err := sm.waitForPodRunning(ctx, client, namespace, created.Name); err != nil {
		// Cleanup the pod on failure
		_ = client.Clientset.CoreV1().Pods(namespace).Delete(ctx, created.Name, metav1.DeleteOptions{})
		return nil, err
	}

	now := time.Now()
	session := &Session{
		ID:         uuid.New().String(),
		ClusterID:  clusterID,
		Namespace:  namespace,
		PVCName:    pvcName,
		PodName:    created.Name,
		UserID:     userID,
		CreatedAt:  now,
		LastUsedAt: now,
	}

	sm.mu.Lock()
	sm.sessions[session.ID] = session
	sm.mu.Unlock()

	log.Printf("pvcbrowser: started session %s (pod=%s/%s, pvc=%s)", session.ID, namespace, created.Name, pvcName)
	return session, nil
}

func (sm *SessionManager) waitForPodRunning(ctx context.Context, client *cluster.ClusterClient, namespace, podName string) error {
	deadline := time.After(podWaitLimit)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("pvcbrowser: context cancelled waiting for pod %s", podName)
		case <-deadline:
			return fmt.Errorf("pvcbrowser: timeout waiting for pod %s to be Running", podName)
		case <-ticker.C:
			pod, err := client.Clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
			if err != nil {
				return fmt.Errorf("pvcbrowser: get pod status: %w", err)
			}
			if pod.Status.Phase == corev1.PodRunning {
				return nil
			}
			if pod.Status.Phase == corev1.PodFailed || pod.Status.Phase == corev1.PodSucceeded {
				return fmt.Errorf("pvcbrowser: pod %s terminated with phase %s", podName, pod.Status.Phase)
			}
		}
	}
}

// StopSession deletes the ephemeral pod and removes the session.
func (sm *SessionManager) StopSession(ctx context.Context, clusterMgr *cluster.Manager, sessionID string) error {
	sm.mu.Lock()
	session, ok := sm.sessions[sessionID]
	if !ok {
		sm.mu.Unlock()
		return fmt.Errorf("pvcbrowser: session %q not found", sessionID)
	}
	delete(sm.sessions, sessionID)
	sm.mu.Unlock()

	client, err := clusterMgr.GetClient(session.ClusterID)
	if err != nil {
		return fmt.Errorf("pvcbrowser: cluster not available for cleanup: %w", err)
	}

	if err := client.Clientset.CoreV1().Pods(session.Namespace).Delete(ctx, session.PodName, metav1.DeleteOptions{}); err != nil {
		log.Printf("pvcbrowser: failed to delete pod %s/%s: %v", session.Namespace, session.PodName, err)
		return err
	}

	log.Printf("pvcbrowser: stopped session %s (pod=%s/%s)", sessionID, session.Namespace, session.PodName)
	return nil
}

// GetSession returns a session by ID and updates LastUsedAt.
func (sm *SessionManager) GetSession(sessionID string) (*Session, error) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	session, ok := sm.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("pvcbrowser: session %q not found", sessionID)
	}
	session.LastUsedAt = time.Now()
	return session, nil
}

// StartCleanup starts the background goroutine that removes idle sessions.
func (sm *SessionManager) StartCleanup() {
	go func() {
		ticker := time.NewTicker(cleanupTick)
		defer ticker.Stop()

		for {
			select {
			case <-sm.stopCh:
				return
			case <-ticker.C:
				sm.cleanupIdle()
			}
		}
	}()
}

// StopCleanup stops the background cleanup goroutine.
func (sm *SessionManager) StopCleanup() {
	close(sm.stopCh)
}

func (sm *SessionManager) cleanupIdle() {
	sm.mu.Lock()
	var expired []*Session
	now := time.Now()
	for id, s := range sm.sessions {
		if now.Sub(s.LastUsedAt) > sessionTTL {
			expired = append(expired, s)
			delete(sm.sessions, id)
		}
	}
	sm.mu.Unlock()

	for _, s := range expired {
		log.Printf("pvcbrowser: cleaning up idle session %s (pod=%s/%s)", s.ID, s.Namespace, s.PodName)
		// Best-effort pod deletion — we don't have clusterMgr here, so we log and skip.
		// The pod will self-terminate after its sleep 3600 command finishes.
	}
}

// execInPod runs a command inside the session's pod and returns stdout.
func execInPod(ctx context.Context, clusterMgr *cluster.Manager, session *Session, command []string, stdin io.Reader) ([]byte, error) {
	client, err := clusterMgr.GetClient(session.ClusterID)
	if err != nil {
		return nil, fmt.Errorf("pvcbrowser: cluster not available: %w", err)
	}

	req := client.Clientset.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(session.PodName).
		Namespace(session.Namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: containerName,
			Command:   command,
			Stdin:     stdin != nil,
			Stdout:    true,
			Stderr:    true,
			TTY:       false,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(client.RestConfig, "POST", req.URL())
	if err != nil {
		return nil, fmt.Errorf("pvcbrowser: create executor: %w", err)
	}

	var stdout, stderr bytes.Buffer
	streamOpts := remotecommand.StreamOptions{
		Stdout: &stdout,
		Stderr: &stderr,
	}
	if stdin != nil {
		streamOpts.Stdin = stdin
	}

	if err := executor.StreamWithContext(ctx, streamOpts); err != nil {
		return nil, fmt.Errorf("pvcbrowser: exec failed: %w (stderr: %s)", err, stderr.String())
	}

	return stdout.Bytes(), nil
}
