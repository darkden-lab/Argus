package proxy

import (
	"log"
	"net/http"
	"net/http/httputil"
	"strings"

	"github.com/gorilla/mux"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"k8s.io/client-go/transport"
)

// K8sProxy is a reverse proxy that forwards authenticated requests to a
// Kubernetes API server. It extracts the cluster ID from the URL, looks up
// the cluster's rest.Config, and proxies the request through.
type K8sProxy struct {
	clusterMgr *cluster.Manager
}

// NewK8sProxy creates a new Kubernetes API proxy.
func NewK8sProxy(clusterMgr *cluster.Manager) *K8sProxy {
	return &K8sProxy{clusterMgr: clusterMgr}
}

// RegisterRoutes wires the proxy endpoints onto the given router.
// The router should already have auth middleware applied.
func (p *K8sProxy) RegisterRoutes(r *mux.Router) {
	r.PathPrefix("/api/proxy/k8s/{cluster_id}/").HandlerFunc(p.handleProxy)
}

func (p *K8sProxy) handleProxy(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	clusterID := vars["cluster_id"]

	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	client, err := p.clusterMgr.GetClient(clusterID)
	if err != nil {
		http.Error(w, `{"error":"cluster not found"}`, http.StatusNotFound)
		return
	}

	// Strip the proxy prefix to get the actual K8s API path
	prefix := "/api/proxy/k8s/" + clusterID
	targetPath := strings.TrimPrefix(r.URL.Path, prefix)
	if targetPath == "" {
		targetPath = "/"
	}

	// Build transport from the cluster's rest.Config
	transportConfig, err := client.RestConfig.TransportConfig()
	if err != nil {
		log.Printf("proxy: failed to get transport config for cluster %s: %v", clusterID, err)
		http.Error(w, `{"error":"failed to configure transport"}`, http.StatusInternalServerError)
		return
	}

	rt, err := transport.New(transportConfig)
	if err != nil {
		log.Printf("proxy: failed to create transport for cluster %s: %v", clusterID, err)
		http.Error(w, `{"error":"failed to create transport"}`, http.StatusInternalServerError)
		return
	}

	// Create reverse proxy
	target := client.RestConfig.Host
	director := func(req *http.Request) {
		req.URL.Scheme = "https"
		if strings.HasPrefix(target, "http://") {
			req.URL.Scheme = "http"
		}
		req.URL.Host = strings.TrimPrefix(strings.TrimPrefix(target, "https://"), "http://")
		req.URL.Path = targetPath
		req.URL.RawQuery = r.URL.RawQuery

		// Remove hop-by-hop headers
		req.Header.Del("Authorization")
		req.Header.Del("Connection")

		// Set impersonation header so the K8s API server knows which user is
		// making the request (the dashboard's service account is the one
		// authenticating to the cluster, but the actual user identity is
		// forwarded).
		req.Header.Set("Impersonate-User", claims.Email)
	}

	proxy := &httputil.ReverseProxy{
		Director:  director,
		Transport: rt,
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("proxy: error forwarding to cluster %s: %v", clusterID, err)
			http.Error(w, `{"error":"proxy error"}`, http.StatusBadGateway)
		},
	}

	log.Printf("proxy: user %s -> cluster %s %s %s", claims.UserID, clusterID, r.Method, targetPath)
	proxy.ServeHTTP(w, r)
}
