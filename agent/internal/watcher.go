package internal

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"sync"

	pb "github.com/darkden-lab/argus/backend/pkg/agentpb"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

// WatchSender is a function that sends a watch event to the dashboard.
type WatchSender func(event *pb.WatchEvent)

// WatchManager manages Kubernetes watch subscriptions from the dashboard.
type WatchManager struct {
	dynClient dynamic.Interface
	watches   map[string]context.CancelFunc
	mu        sync.Mutex
}

func NewWatchManager() *WatchManager {
	config, err := rest.InClusterConfig()
	if err != nil {
		log.Printf("WARNING: in-cluster config not available for watcher: %v", err)
		return &WatchManager{
			watches: make(map[string]context.CancelFunc),
		}
	}

	dynClient, err := dynamic.NewForConfig(config)
	if err != nil {
		log.Printf("WARNING: failed to create dynamic client for watcher: %v", err)
		return &WatchManager{
			watches: make(map[string]context.CancelFunc),
		}
	}

	return &WatchManager{
		dynClient: dynClient,
		watches:   make(map[string]context.CancelFunc),
	}
}

// Subscribe starts a watch on the given path and sends events through the sender.
func (wm *WatchManager) Subscribe(ctx context.Context, sub *pb.WatchSubscribe, sender WatchSender) {
	if wm.dynClient == nil {
		log.Printf("Watch subscribe failed: no dynamic client available")
		return
	}

	watchCtx, cancel := context.WithCancel(ctx)

	wm.mu.Lock()
	if old, ok := wm.watches[sub.WatchId]; ok {
		old()
	}
	wm.watches[sub.WatchId] = cancel
	wm.mu.Unlock()

	go wm.runWatch(watchCtx, sub, sender)
}

// Unsubscribe stops a watch by its ID.
func (wm *WatchManager) Unsubscribe(watchID string) {
	wm.mu.Lock()
	if cancel, ok := wm.watches[watchID]; ok {
		cancel()
		delete(wm.watches, watchID)
	}
	wm.mu.Unlock()
}

// StopAll cancels all active watches.
func (wm *WatchManager) StopAll() {
	wm.mu.Lock()
	for id, cancel := range wm.watches {
		cancel()
		delete(wm.watches, id)
	}
	wm.mu.Unlock()
}

func (wm *WatchManager) runWatch(ctx context.Context, sub *pb.WatchSubscribe, sender WatchSender) {
	defer func() {
		wm.mu.Lock()
		delete(wm.watches, sub.WatchId)
		wm.mu.Unlock()
	}()

	gvr, namespace := parseWatchPath(sub.Path)
	if gvr.Resource == "" {
		log.Printf("Watch: could not parse path %s", sub.Path)
		return
	}

	opts := metav1.ListOptions{}
	if sub.ResourceVersion != "" {
		opts.ResourceVersion = sub.ResourceVersion
	}

	var resource dynamic.ResourceInterface
	if namespace != "" {
		resource = wm.dynClient.Resource(gvr).Namespace(namespace)
	} else {
		resource = wm.dynClient.Resource(gvr)
	}

	watcher, err := resource.Watch(ctx, opts)
	if err != nil {
		log.Printf("Watch failed for %s: %v", sub.Path, err)
		sender(&pb.WatchEvent{
			WatchId:   sub.WatchId,
			EventType: "ERROR",
			Object:    []byte(`{"error":"` + err.Error() + `"}`),
		})
		return
	}
	defer watcher.Stop()

	log.Printf("Watch started: id=%s path=%s", sub.WatchId, sub.Path)

	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-watcher.ResultChan():
			if !ok {
				return
			}
			obj, err := json.Marshal(event.Object)
			if err != nil {
				log.Printf("Watch: failed to marshal event object: %v", err)
				continue
			}
			sender(&pb.WatchEvent{
				WatchId:   sub.WatchId,
				EventType: string(event.Type),
				Object:    obj,
			})
		}
	}
}

// parseWatchPath extracts GVR and namespace from a K8s API path.
func parseWatchPath(path string) (schema.GroupVersionResource, string) {
	parts := splitPath(path)
	if len(parts) == 0 {
		return schema.GroupVersionResource{}, ""
	}

	// /api/v1/...
	if parts[0] == "api" && len(parts) >= 3 {
		version := parts[1]
		if parts[2] == "namespaces" && len(parts) >= 5 {
			return schema.GroupVersionResource{Group: "", Version: version, Resource: parts[4]}, parts[3]
		}
		return schema.GroupVersionResource{Group: "", Version: version, Resource: parts[2]}, ""
	}

	// /apis/<group>/<version>/...
	if parts[0] == "apis" && len(parts) >= 4 {
		group := parts[1]
		version := parts[2]
		if parts[3] == "namespaces" && len(parts) >= 6 {
			return schema.GroupVersionResource{Group: group, Version: version, Resource: parts[5]}, parts[4]
		}
		return schema.GroupVersionResource{Group: group, Version: version, Resource: parts[3]}, ""
	}

	return schema.GroupVersionResource{}, ""
}

func splitPath(path string) []string {
	return filterEmpty(strings.Split(path, "/"))
}

func filterEmpty(ss []string) []string {
	var result []string
	for _, s := range ss {
		if s != "" {
			result = append(result, s)
		}
	}
	return result
}
