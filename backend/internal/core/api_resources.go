package core

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/httputil"
	"github.com/darkden-lab/argus/backend/pkg/agentpb"
)

// APIResourceEntry represents a single API resource available in a cluster.
type APIResourceEntry struct {
	Kind       string   `json:"kind"`
	Group      string   `json:"group"`
	Version    string   `json:"version"`
	Resource   string   `json:"resource"`
	Namespaced bool     `json:"namespaced"`
	Verbs      []string `json:"verbs"`
}

// ListAPIResources returns all preferred API resources discovered in the cluster.
func (h *ConvenienceHandlers) ListAPIResources(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		// Fallback to agent proxy — request /apis endpoint.
		proxyAgentResponse(w, r, h.clusterMgr, clusterID, &agentpb.K8SRequest{
			Method: "GET",
			Path:   "/apis",
		})
		return
	}

	lists, err := client.Clientset.Discovery().ServerPreferredResources()
	if err != nil {
		// Discovery may return partial results along with an error.
		if lists == nil {
			httputil.WriteError(w, http.StatusInternalServerError, fmt.Sprintf("discovery failed: %v", err))
			return
		}
	}

	var entries []APIResourceEntry
	for _, list := range lists {
		gv := list.GroupVersion
		group, version := parseGroupVersion(gv)

		for _, res := range list.APIResources {
			// Skip sub-resources like pods/log, pods/status
			if strings.Contains(res.Name, "/") {
				continue
			}

			verbs := make([]string, len(res.Verbs))
			copy(verbs, res.Verbs)

			entries = append(entries, APIResourceEntry{
				Kind:       res.Kind,
				Group:      group,
				Version:    version,
				Resource:   res.Name,
				Namespaced: res.Namespaced,
				Verbs:      verbs,
			})
		}
	}

	httputil.WriteJSON(w, http.StatusOK, entries)
}

// parseGroupVersion splits "apps/v1" into ("apps", "v1") and "v1" into ("", "v1").
func parseGroupVersion(gv string) (string, string) {
	parts := strings.SplitN(gv, "/", 2)
	if len(parts) == 1 {
		return "", parts[0]
	}
	return parts[0], parts[1]
}

