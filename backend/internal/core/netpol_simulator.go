package core

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/httputil"
	"github.com/darkden-lab/argus/backend/pkg/agentpb"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// NetPolSimulatorHandler evaluates network connectivity between two pods by
// analysing the NetworkPolicy resources in the destination namespace.
type NetPolSimulatorHandler struct {
	clusterMgr *cluster.Manager
}

// NewNetPolSimulatorHandler creates a new handler.
func NewNetPolSimulatorHandler(cm *cluster.Manager) *NetPolSimulatorHandler {
	return &NetPolSimulatorHandler{clusterMgr: cm}
}

// RegisterRoutes wires the simulate endpoint.
func (h *NetPolSimulatorHandler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc(
		"/api/clusters/{clusterID}/network-policies/simulate",
		h.Simulate,
	).Methods(http.MethodGet)
}

// simulationResult is the JSON response for the simulator.
type simulationResult struct {
	Allowed         bool     `json:"allowed"`
	Reason          string   `json:"reason"`
	MatchedPolicies []string `json:"matchedPolicies"`
}

// Simulate evaluates whether traffic from a source pod to a destination pod
// on a given port would be allowed by the cluster's NetworkPolicies.
//
// Query params:
//   - sourceNamespace (required)
//   - sourcePod      (required)
//   - destNamespace   (required)
//   - destPod         (required)
//   - port            (optional, integer)
func (h *NetPolSimulatorHandler) Simulate(w http.ResponseWriter, r *http.Request) {
	clusterID := mux.Vars(r)["clusterID"]
	q := r.URL.Query()

	srcNs := q.Get("sourceNamespace")
	srcPod := q.Get("sourcePod")
	dstNs := q.Get("destNamespace")
	dstPod := q.Get("destPod")
	portStr := q.Get("port")

	if srcNs == "" || srcPod == "" || dstNs == "" || dstPod == "" {
		httputil.WriteError(w, http.StatusBadRequest, "sourceNamespace, sourcePod, destNamespace, and destPod are required")
		return
	}
	if !isValidK8sSegment(srcNs) || !isValidK8sSegment(srcPod) || !isValidK8sSegment(dstNs) || !isValidK8sSegment(dstPod) {
		httputil.WriteError(w, http.StatusBadRequest, "invalid namespace or pod name")
		return
	}

	var port int
	if portStr != "" {
		p, err := strconv.Atoi(portStr)
		if err != nil || p < 1 || p > 65535 {
			httputil.WriteError(w, http.StatusBadRequest, "port must be an integer between 1 and 65535")
			return
		}
		port = p
	}

	client, err := h.clusterMgr.GetClient(clusterID)
	if err != nil {
		// Fallback to agent proxy - we can't do the simulation server-side
		// without direct K8s access, so return an error.
		agentSrv := h.clusterMgr.GetAgentServer()
		if agentSrv == nil || !agentSrv.IsAgentConnected(clusterID) {
			httputil.WriteError(w, http.StatusNotFound, "cluster not found or not connected")
			return
		}
		// Build the simulation via agent by fetching necessary resources
		h.simulateViaAgent(w, r, clusterID, srcNs, srcPod, dstNs, dstPod, port)
		return
	}

	// Fetch the destination pod to get its labels
	destPodObj, err := client.Clientset.CoreV1().Pods(dstNs).Get(r.Context(), dstPod, metav1.GetOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, fmt.Sprintf("destination pod not found: %v", err))
		return
	}
	destPodLabels := destPodObj.Labels

	// Fetch the source pod to get its labels and namespace labels
	srcPodObj, err := client.Clientset.CoreV1().Pods(srcNs).Get(r.Context(), srcPod, metav1.GetOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusNotFound, fmt.Sprintf("source pod not found: %v", err))
		return
	}
	srcPodLabels := srcPodObj.Labels

	// Fetch source namespace labels
	srcNsObj, err := client.Clientset.CoreV1().Namespaces().Get(r.Context(), srcNs, metav1.GetOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, fmt.Sprintf("failed to get source namespace: %v", err))
		return
	}
	srcNsLabels := srcNsObj.Labels

	// Fetch all NetworkPolicies in destination namespace
	npGVR := schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"}
	npList, err := client.DynClient.Resource(npGVR).Namespace(dstNs).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, fmt.Sprintf("failed to list network policies: %v", err))
		return
	}

	result := evaluateNetworkPolicies(npList.Items, destPodLabels, srcPodLabels, srcNsLabels, srcNs, port)
	httputil.WriteJSON(w, http.StatusOK, result)
}

// simulateViaAgent attempts to run the simulation by fetching resources through the agent.
func (h *NetPolSimulatorHandler) simulateViaAgent(w http.ResponseWriter, r *http.Request, clusterID, srcNs, srcPod, dstNs, dstPod string, port int) {
	agentSrv := h.clusterMgr.GetAgentServer()

	ctx, cancel := context.WithTimeout(r.Context(), agentProxyTimeout)
	defer cancel()

	// Fetch destination pod
	destPodResp, err := agentSrv.SendK8sRequest(ctx, clusterID, &agentpb.K8SRequest{
		Method: "GET",
		Path:   fmt.Sprintf("/api/v1/namespaces/%s/pods/%s", dstNs, dstPod),
	})
	if err != nil || destPodResp.Error != "" {
		httputil.WriteError(w, http.StatusNotFound, "destination pod not found via agent")
		return
	}

	destPodObj, err := parseUnstructured(destPodResp.Body)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to parse destination pod")
		return
	}

	// Fetch source pod
	srcPodResp, err := agentSrv.SendK8sRequest(ctx, clusterID, &agentpb.K8SRequest{
		Method: "GET",
		Path:   fmt.Sprintf("/api/v1/namespaces/%s/pods/%s", srcNs, srcPod),
	})
	if err != nil || srcPodResp.Error != "" {
		httputil.WriteError(w, http.StatusNotFound, "source pod not found via agent")
		return
	}

	srcPodObj, err := parseUnstructured(srcPodResp.Body)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to parse source pod")
		return
	}

	// Fetch source namespace
	srcNsResp, err := agentSrv.SendK8sRequest(ctx, clusterID, &agentpb.K8SRequest{
		Method: "GET",
		Path:   fmt.Sprintf("/api/v1/namespaces/%s", srcNs),
	})
	if err != nil || srcNsResp.Error != "" {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to get source namespace via agent")
		return
	}

	srcNsObj, err := parseUnstructured(srcNsResp.Body)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to parse source namespace")
		return
	}

	// Fetch network policies in dest namespace
	npResp, err := agentSrv.SendK8sRequest(ctx, clusterID, &agentpb.K8SRequest{
		Method: "GET",
		Path:   fmt.Sprintf("/apis/networking.k8s.io/v1/namespaces/%s/networkpolicies", dstNs),
	})
	if err != nil || npResp.Error != "" {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to list network policies via agent")
		return
	}

	npListObj, err := parseUnstructured(npResp.Body)
	if err != nil {
		httputil.WriteError(w, http.StatusInternalServerError, "failed to parse network policies")
		return
	}

	destPodLabels := extractLabels(destPodObj)
	srcPodLabels := extractLabels(srcPodObj)
	srcNsLabels := extractLabels(srcNsObj)

	items := extractItems(npListObj)
	result := evaluateNetworkPolicies(items, destPodLabels, srcPodLabels, srcNsLabels, srcNs, port)
	httputil.WriteJSON(w, http.StatusOK, result)
}

// evaluateNetworkPolicies checks if ingress traffic from the source to the
// destination pod would be allowed, given all NetworkPolicies in the dest namespace.
func evaluateNetworkPolicies(
	policies []unstructured.Unstructured,
	destPodLabels map[string]string,
	srcPodLabels map[string]string,
	srcNsLabels map[string]string,
	srcNs string,
	port int,
) simulationResult {
	// Find all policies that select the destination pod AND have Ingress policy type
	var selectingPolicies []unstructured.Unstructured
	var policyNames []string

	for _, np := range policies {
		spec, ok := np.Object["spec"].(map[string]interface{})
		if !ok {
			continue
		}

		// Check if this policy selects the destination pod
		podSelector := extractMapSelector(spec, "podSelector")
		if !labelsMatchSelector(destPodLabels, podSelector) {
			continue
		}

		// Check if this policy covers Ingress
		policyTypes := extractStringSlice(spec, "policyTypes")
		hasIngress := false
		if len(policyTypes) == 0 {
			// If no policyTypes specified, ingress is covered if there are ingress rules
			// or if spec has ingress field
			if _, exists := spec["ingress"]; exists {
				hasIngress = true
			}
		} else {
			for _, pt := range policyTypes {
				if pt == "Ingress" {
					hasIngress = true
					break
				}
			}
		}

		if !hasIngress {
			continue
		}

		selectingPolicies = append(selectingPolicies, np)
		name, _, _ := unstructured.NestedString(np.Object, "metadata", "name")
		policyNames = append(policyNames, name)
	}

	// If no policies select this pod with Ingress type, all traffic is allowed (default)
	if len(selectingPolicies) == 0 {
		return simulationResult{
			Allowed:         true,
			Reason:          "No NetworkPolicy selects the destination pod for ingress. All ingress traffic is allowed by default.",
			MatchedPolicies: nil,
		}
	}

	// Check if any policy explicitly allows this traffic
	for _, np := range selectingPolicies {
		spec := np.Object["spec"].(map[string]interface{})
		ingressRules, ok := spec["ingress"].([]interface{})
		if !ok {
			continue
		}

		// Empty ingress list means deny all ingress
		if len(ingressRules) == 0 {
			continue
		}

		for _, ruleRaw := range ingressRules {
			rule, ok := ruleRaw.(map[string]interface{})
			if !ok {
				continue
			}

			// Check port match if port specified
			if port > 0 {
				if !portMatchesRule(port, rule) {
					continue
				}
			}

			// Check "from" peers
			fromPeers, hasFrom := rule["from"].([]interface{})
			if !hasFrom {
				// No "from" means all sources are allowed (for this rule)
				name, _, _ := unstructured.NestedString(np.Object, "metadata", "name")
				return simulationResult{
					Allowed:         true,
					Reason:          fmt.Sprintf("Policy '%s' allows all ingress sources (no 'from' restriction).", name),
					MatchedPolicies: policyNames,
				}
			}

			for _, peerRaw := range fromPeers {
				peer, ok := peerRaw.(map[string]interface{})
				if !ok {
					continue
				}

				if peerMatchesSource(peer, srcPodLabels, srcNsLabels, srcNs) {
					name, _, _ := unstructured.NestedString(np.Object, "metadata", "name")
					return simulationResult{
						Allowed:         true,
						Reason:          fmt.Sprintf("Policy '%s' explicitly allows this traffic.", name),
						MatchedPolicies: policyNames,
					}
				}
			}
		}
	}

	// If we get here, policies select the dest pod but none explicitly allow the source
	return simulationResult{
		Allowed:         false,
		Reason:          fmt.Sprintf("Destination pod is selected by %d NetworkPolicy(ies) but no ingress rule allows traffic from the source.", len(selectingPolicies)),
		MatchedPolicies: policyNames,
	}
}

// labelsMatchSelector checks if a set of labels satisfies a selector's matchLabels.
func labelsMatchSelector(labels map[string]string, selectorLabels map[string]string) bool {
	// Empty selector matches everything
	if len(selectorLabels) == 0 {
		return true
	}
	for k, v := range selectorLabels {
		if labels[k] != v {
			return false
		}
	}
	return true
}

// extractMapSelector extracts matchLabels from a selector at the given field.
func extractMapSelector(spec map[string]interface{}, field string) map[string]string {
	sel, ok := spec[field].(map[string]interface{})
	if !ok {
		return nil
	}
	ml, ok := sel["matchLabels"].(map[string]interface{})
	if !ok {
		return nil
	}
	result := make(map[string]string, len(ml))
	for k, v := range ml {
		if s, ok := v.(string); ok {
			result[k] = s
		}
	}
	return result
}

// extractStringSlice extracts a []string from a field.
func extractStringSlice(spec map[string]interface{}, field string) []string {
	arr, ok := spec[field].([]interface{})
	if !ok {
		return nil
	}
	result := make([]string, 0, len(arr))
	for _, v := range arr {
		if s, ok := v.(string); ok {
			result = append(result, s)
		}
	}
	return result
}

// portMatchesRule checks if the given port is allowed by a rule.
func portMatchesRule(port int, rule map[string]interface{}) bool {
	portsArr, ok := rule["ports"].([]interface{})
	if !ok || len(portsArr) == 0 {
		// No ports restriction means all ports allowed
		return true
	}

	for _, pRaw := range portsArr {
		p, ok := pRaw.(map[string]interface{})
		if !ok {
			continue
		}

		// Port can be a number or string
		rulePort := 0
		switch v := p["port"].(type) {
		case float64:
			rulePort = int(v)
		case int64:
			rulePort = int(v)
		}

		if rulePort == 0 {
			// No specific port means all ports
			return true
		}

		endPort := 0
		switch v := p["endPort"].(type) {
		case float64:
			endPort = int(v)
		case int64:
			endPort = int(v)
		}

		if endPort > 0 {
			if port >= rulePort && port <= endPort {
				return true
			}
		} else if port == rulePort {
			return true
		}
	}

	return false
}

// peerMatchesSource checks whether a source pod matches a NetworkPolicy peer.
func peerMatchesSource(peer map[string]interface{}, srcPodLabels, srcNsLabels map[string]string, srcNs string) bool {
	_, hasPodSel := peer["podSelector"]
	_, hasNsSel := peer["namespaceSelector"]
	_, hasIPBlock := peer["ipBlock"]

	if hasIPBlock {
		// We can't check IP-based rules without knowing the source pod IP;
		// conservatively return false.
		return false
	}

	if hasPodSel && hasNsSel {
		// Both must match
		psMl := extractPeerSelector(peer, "podSelector")
		nsMl := extractPeerSelector(peer, "namespaceSelector")
		return labelsMatchSelector(srcPodLabels, psMl) && labelsMatchSelector(srcNsLabels, nsMl)
	}

	if hasNsSel {
		nsMl := extractPeerSelector(peer, "namespaceSelector")
		return labelsMatchSelector(srcNsLabels, nsMl)
	}

	if hasPodSel {
		// podSelector alone means same namespace
		psMl := extractPeerSelector(peer, "podSelector")
		return labelsMatchSelector(srcPodLabels, psMl)
	}

	// No selector at all means all sources
	return true
}

// extractPeerSelector extracts matchLabels from a peer selector.
func extractPeerSelector(peer map[string]interface{}, field string) map[string]string {
	sel, ok := peer[field].(map[string]interface{})
	if !ok {
		return nil
	}
	ml, ok := sel["matchLabels"].(map[string]interface{})
	if !ok {
		return nil // empty selector matches everything
	}
	result := make(map[string]string, len(ml))
	for k, v := range ml {
		if s, ok := v.(string); ok {
			result[k] = s
		}
	}
	return result
}

// parseUnstructured parses raw JSON bytes into an Unstructured object.
func parseUnstructured(data []byte) (*unstructured.Unstructured, error) {
	obj := &unstructured.Unstructured{}
	if err := obj.UnmarshalJSON(data); err != nil {
		return nil, err
	}
	return obj, nil
}

// extractLabels extracts the metadata.labels map from an Unstructured object.
func extractLabels(obj *unstructured.Unstructured) map[string]string {
	labels, _, _ := unstructured.NestedStringMap(obj.Object, "metadata", "labels")
	return labels
}

// extractItems extracts the items array from a list Unstructured object.
func extractItems(obj *unstructured.Unstructured) []unstructured.Unstructured {
	items, ok := obj.Object["items"].([]interface{})
	if !ok {
		return nil
	}
	result := make([]unstructured.Unstructured, 0, len(items))
	for _, item := range items {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		result = append(result, unstructured.Unstructured{Object: m})
	}
	return result
}
