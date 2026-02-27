package core

import (
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/httputil"
	corev1 "k8s.io/api/core/v1"
)

// LogsHandler provides endpoints for streaming pod logs.
type LogsHandler struct {
	clusterMgr *cluster.Manager
}

// NewLogsHandler creates a new LogsHandler.
func NewLogsHandler(cm *cluster.Manager) *LogsHandler {
	return &LogsHandler{clusterMgr: cm}
}

// RegisterRoutes registers the pod logs endpoint.
func (h *LogsHandler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/clusters/{clusterID}/namespaces/{namespace}/pods/{pod}/logs", h.GetPodLogs).Methods(http.MethodGet)
}

// GetPodLogs streams or returns logs for a pod.
// Query params: container, tailLines (default 100), previous, follow.
func (h *LogsHandler) GetPodLogs(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["clusterID"]
	namespace := vars["namespace"]
	pod := vars["pod"]

	if !isValidK8sSegment(namespace) || !isValidK8sSegment(pod) {
		httputil.WriteError(w, http.StatusBadRequest, "invalid namespace or pod name")
		return
	}

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, "cluster not found")
		return
	}

	q := r.URL.Query()
	container := q.Get("container")
	previous := q.Get("previous") == "true"
	follow := q.Get("follow") == "true"

	tailLines := int64(100)
	if tl := q.Get("tailLines"); tl != "" {
		if v, err := strconv.ParseInt(tl, 10, 64); err == nil && v > 0 {
			tailLines = v
		}
	}

	opts := &corev1.PodLogOptions{
		TailLines: &tailLines,
		Previous:  previous,
		Follow:    follow,
	}
	if container != "" {
		opts.Container = container
	}

	logReq := client.Clientset.CoreV1().Pods(namespace).GetLogs(pod, opts)
	stream, err := logReq.Stream(r.Context())
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, fmt.Sprintf("failed to stream logs: %v", err))
		return
	}
	defer stream.Close()

	if follow {
		// SSE streaming mode
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.WriteHeader(http.StatusOK)

		flusher, ok := w.(http.Flusher)
		if !ok {
			httputil.WriteError(w, http.StatusInternalServerError, "streaming not supported")
			return
		}

		buf := make([]byte, 4096)
		for {
			n, err := stream.Read(buf)
			if n > 0 {
				fmt.Fprintf(w, "data: %s\n\n", buf[:n])
				flusher.Flush()
			}
			if err != nil {
				if err != io.EOF {
					fmt.Fprintf(w, "event: error\ndata: %s\n\n", err.Error())
					flusher.Flush()
				}
				return
			}
		}
	} else {
		// Non-streaming: read all and return as JSON
		data, err := io.ReadAll(stream)
		if err != nil {
			httputil.WriteError(w, http.StatusInternalServerError, fmt.Sprintf("failed to read logs: %v", err))
			return
		}

		httputil.WriteJSON(w, http.StatusOK, map[string]string{
			"logs": string(data),
		})
	}
}
