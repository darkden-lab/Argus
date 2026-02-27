package core

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/httputil"
	corev1 "k8s.io/api/core/v1"
)

// LogsHandler provides endpoints for streaming pod logs.
type LogsHandler struct {
	clusterMgr *cluster.Manager
	jwtService *auth.JWTService
}

// NewLogsHandler creates a new LogsHandler.
func NewLogsHandler(cm *cluster.Manager, jwtService *auth.JWTService) *LogsHandler {
	return &LogsHandler{clusterMgr: cm, jwtService: jwtService}
}

// RegisterRoutes registers the pod logs endpoint.
// The handler manages auth internally (via query param or header) to support
// EventSource streaming which cannot send Authorization headers.
func (h *LogsHandler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/api/clusters/{clusterID}/namespaces/{namespace}/pods/{pod}/logs", h.GetPodLogs).Methods(http.MethodGet)
}

// GetPodLogs streams or returns logs for a pod.
// Query params: container, tailLines (default 100), previous, follow, token.
func (h *LogsHandler) GetPodLogs(w http.ResponseWriter, r *http.Request) {
	// Authenticate via token query param or Authorization header
	// (same pattern as terminal handler — needed for EventSource SSE)
	token := r.URL.Query().Get("token")
	if token == "" {
		authHeader := r.Header.Get("Authorization")
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "bearer") {
			token = parts[1]
		}
	}

	if token == "" {
		httputil.WriteError(w, http.StatusUnauthorized, "missing authorization")
		return
	}

	claims, err := h.jwtService.ValidateToken(token)
	if err != nil {
		httputil.WriteError(w, http.StatusUnauthorized, "invalid or expired token")
		return
	}

	// Inject claims into context for downstream use
	ctx := auth.ContextWithClaims(r.Context(), claims)
	r = r.WithContext(ctx)

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
				_, _ = fmt.Fprintf(w, "data: %s\n\n", buf[:n])
				flusher.Flush()
			}
			if err != nil {
				if err != io.EOF {
					_, _ = fmt.Fprintf(w, "event: error\ndata: %s\n\n", err.Error())
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
