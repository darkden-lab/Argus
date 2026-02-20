package rag

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/darkden-lab/argus/backend/internal/cluster"
)

// Indexer periodically indexes content sources into the vector store for RAG.
type Indexer struct {
	store      *Store
	embedder   Embedder
	clusterMgr *cluster.Manager

	interval time.Duration
	done     chan struct{}
	running  bool
	mu       sync.Mutex

	// Status tracking
	LastRun   time.Time `json:"last_run"`
	Status    string    `json:"status"` // "idle", "running", "error"
	DocsCount int64     `json:"docs_count"`
	Error     string    `json:"error,omitempty"`
}

// NewIndexer creates a new RAG indexer.
func NewIndexer(store *Store, embedder Embedder, clusterMgr *cluster.Manager) *Indexer {
	return &Indexer{
		store:      store,
		embedder:   embedder,
		clusterMgr: clusterMgr,
		interval:   1 * time.Hour,
		done:       make(chan struct{}),
		Status:     "idle",
	}
}

// Start begins the periodic indexing goroutine.
func (idx *Indexer) Start(ctx context.Context) {
	idx.mu.Lock()
	if idx.running {
		idx.mu.Unlock()
		return
	}
	idx.running = true
	idx.mu.Unlock()

	go func() {
		idx.RunOnce(ctx)

		ticker := time.NewTicker(idx.interval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				idx.RunOnce(ctx)
			case <-idx.done:
				return
			case <-ctx.Done():
				return
			}
		}
	}()

	log.Printf("rag indexer: started with interval %s", idx.interval)
}

// Stop halts the periodic indexer.
func (idx *Indexer) Stop() {
	idx.mu.Lock()
	defer idx.mu.Unlock()
	if idx.running {
		close(idx.done)
		idx.running = false
	}
}

// RunOnce performs a single indexing pass over all content sources.
func (idx *Indexer) RunOnce(ctx context.Context) {
	idx.mu.Lock()
	idx.Status = "running"
	idx.mu.Unlock()

	log.Printf("rag indexer: starting indexing pass")

	var indexErr error
	defer func() {
		idx.mu.Lock()
		idx.LastRun = time.Now()
		if indexErr != nil {
			idx.Status = "error"
			idx.Error = indexErr.Error()
		} else {
			idx.Status = "idle"
			idx.Error = ""
		}
		count, _ := idx.store.Count(ctx, "")
		idx.DocsCount = count
		idx.mu.Unlock()
	}()

	if err := idx.indexK8sDocs(ctx); err != nil {
		log.Printf("rag indexer: k8s docs error: %v", err)
		indexErr = err
	}

	if err := idx.indexClusterCRDs(ctx); err != nil {
		log.Printf("rag indexer: CRD indexing error: %v", err)
	}

	log.Printf("rag indexer: pass complete")
}

func (idx *Indexer) indexK8sDocs(ctx context.Context) error {
	docs := builtinK8sDocs()
	if len(docs) == 0 {
		return nil
	}

	var contents []string
	for _, doc := range docs {
		contents = append(contents, doc.Content)
	}

	batchSize := 20
	for i := 0; i < len(contents); i += batchSize {
		end := i + batchSize
		if end > len(contents) {
			end = len(contents)
		}
		batch := contents[i:end]

		vecs, err := idx.embedder.EmbedTexts(ctx, batch)
		if err != nil {
			return err
		}

		var embeddings []Embedding
		for j, vec := range vecs {
			docIdx := i + j
			embeddings = append(embeddings, Embedding{
				SourceType: docs[docIdx].SourceType,
				SourceID:   docs[docIdx].SourceID,
				ChunkIndex: docs[docIdx].ChunkIndex,
				Content:    docs[docIdx].Content,
				Embedding:  vec,
			})
		}

		if err := idx.store.InsertBatch(ctx, embeddings); err != nil {
			return err
		}
	}

	log.Printf("rag indexer: indexed %d k8s doc chunks", len(docs))
	return nil
}

func (idx *Indexer) indexClusterCRDs(ctx context.Context) error {
	clusters, err := idx.clusterMgr.ListClusters(ctx)
	if err != nil {
		return err
	}

	for _, c := range clusters {
		client, err := idx.clusterMgr.GetClient(c.ID)
		if err != nil {
			continue
		}

		crdList, err := client.Clientset.Discovery().ServerPreferredResources()
		if err != nil {
			log.Printf("rag indexer: failed to discover resources for cluster %s: %v", c.ID, err)
			continue
		}

		var crdDocs []docChunk
		for _, group := range crdList {
			for _, res := range group.APIResources {
				if !strings.Contains(group.GroupVersion, "/") {
					continue
				}
				content := formatCRDDescription(group.GroupVersion, res.Name, res.Kind, res.Verbs.String())
				crdDocs = append(crdDocs, docChunk{
					SourceType: "crd",
					SourceID:   c.ID + "/" + group.GroupVersion + "/" + res.Name,
					Content:    content,
				})
			}
		}

		if len(crdDocs) == 0 {
			continue
		}

		batchSize := 20
		for i := 0; i < len(crdDocs); i += batchSize {
			end := i + batchSize
			if end > len(crdDocs) {
				end = len(crdDocs)
			}

			var texts []string
			for _, d := range crdDocs[i:end] {
				texts = append(texts, d.Content)
			}

			vecs, err := idx.embedder.EmbedTexts(ctx, texts)
			if err != nil {
				log.Printf("rag indexer: embed CRDs error: %v", err)
				break
			}

			var embeddings []Embedding
			for j, vec := range vecs {
				docIdx := i + j
				embeddings = append(embeddings, Embedding{
					SourceType: crdDocs[docIdx].SourceType,
					SourceID:   crdDocs[docIdx].SourceID,
					Content:    crdDocs[docIdx].Content,
					Embedding:  vec,
				})
			}

			if err := idx.store.InsertBatch(ctx, embeddings); err != nil {
				log.Printf("rag indexer: insert CRDs error: %v", err)
				break
			}
		}

		log.Printf("rag indexer: indexed %d CRDs from cluster %s", len(crdDocs), c.Name)
	}

	return nil
}

// GetStatus returns the current indexer status.
func (idx *Indexer) GetStatus() map[string]interface{} {
	idx.mu.Lock()
	defer idx.mu.Unlock()
	return map[string]interface{}{
		"status":     idx.Status,
		"last_run":   idx.LastRun,
		"docs_count": idx.DocsCount,
		"error":      idx.Error,
	}
}

// -- Content sources --

type docChunk struct {
	SourceType string
	SourceID   string
	ChunkIndex int
	Content    string
}

func formatCRDDescription(groupVersion, name, kind, verbs string) string {
	return "Custom Resource: " + kind + " (" + name + ")\n" +
		"API: " + groupVersion + "\n" +
		"Verbs: " + verbs
}

// builtinK8sDocs returns a set of core K8s documentation chunks for RAG.
func builtinK8sDocs() []docChunk {
	return []docChunk{
		{SourceType: "k8s_docs", SourceID: "pods-overview", Content: "A Pod is the smallest deployable unit in Kubernetes. It represents a single instance of a running process in your cluster. Pods contain one or more containers. Containers in a Pod share networking and storage. Use kubectl get pods to list pods. Common issues: CrashLoopBackOff means the container keeps crashing, ImagePullBackOff means the image cannot be pulled."},
		{SourceType: "k8s_docs", SourceID: "deployments-overview", Content: "A Deployment provides declarative updates for Pods and ReplicaSets. You describe a desired state in a Deployment, and the Deployment Controller changes the actual state to the desired state. Use Deployments to roll out new versions, scale applications, and manage rollbacks. kubectl rollout status deployment/<name> shows rollout progress."},
		{SourceType: "k8s_docs", SourceID: "services-overview", Content: "A Service is an abstract way to expose an application running on a set of Pods as a network service. Types: ClusterIP (internal), NodePort (external via node port), LoadBalancer (external via cloud LB), ExternalName (CNAME). Services use label selectors to find target Pods."},
		{SourceType: "k8s_docs", SourceID: "configmaps-secrets", Content: "ConfigMaps hold non-confidential configuration data as key-value pairs. Secrets hold sensitive data like passwords and tokens (base64-encoded, not encrypted by default). Both can be mounted as volumes or exposed as environment variables."},
		{SourceType: "k8s_docs", SourceID: "namespaces", Content: "Namespaces provide a way to divide cluster resources between multiple users or teams. Default namespaces: default, kube-system, kube-public, kube-node-lease. Use ResourceQuotas and LimitRanges to control resource usage per namespace."},
		{SourceType: "k8s_docs", SourceID: "troubleshooting-pods", Content: "Common pod troubleshooting: 1) kubectl describe pod <name> - check events and conditions. 2) kubectl logs <pod> - check container logs. 3) kubectl get events - check cluster events. Common states: Pending (not scheduled), Running, Succeeded, Failed, Unknown. CrashLoopBackOff: check logs for crash reason. OOMKilled: increase memory limits."},
		{SourceType: "k8s_docs", SourceID: "scaling", Content: "Horizontal Pod Autoscaler (HPA) automatically scales pods based on CPU/memory usage or custom metrics. Vertical Pod Autoscaler (VPA) adjusts resource requests/limits. Manual scaling: kubectl scale deployment <name> --replicas=N."},
		{SourceType: "k8s_docs", SourceID: "networking", Content: "Kubernetes networking model: every Pod gets its own IP address. Pods can communicate with all other Pods without NAT. Agents on a node can communicate with all Pods on that node. Ingress manages external access to services, typically HTTP. NetworkPolicies control traffic flow at the IP address or port level."},
		{SourceType: "k8s_docs", SourceID: "storage", Content: "PersistentVolume (PV) is a piece of storage provisioned by an administrator or dynamically. PersistentVolumeClaim (PVC) is a request for storage by a user. StorageClass describes classes of storage. Access modes: ReadWriteOnce, ReadOnlyMany, ReadWriteMany."},
		{SourceType: "k8s_docs", SourceID: "rbac", Content: "Role-Based Access Control (RBAC) regulates access to resources. Role/ClusterRole define permissions. RoleBinding/ClusterRoleBinding bind roles to users or service accounts. Use kubectl auth can-i to test permissions."},
	}
}
