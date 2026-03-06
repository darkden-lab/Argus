package socketio

import (
	"encoding/json"
	"log"

	"github.com/zishang520/socket.io/v2/socket"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/ws"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// registerK8sNamespace sets up the /k8s namespace for K8s watch events.
// Clients emit "subscribe"/"unsubscribe" with {cluster, resource, namespace}
// and receive "watch_event" when events occur on subscribed resources.
func registerK8sNamespace(io *socket.Server, jwtService *auth.JWTService, apiKeyService *auth.APIKeyService, hub *ws.Hub, clusterMgr *cluster.Manager) {
	nsp := io.Of("/k8s", nil)
	nsp.Use(authMiddleware(jwtService, apiKeyService))

	// Hook into the Hub to broadcast events to Socket.IO rooms
	hub.OnEvent(func(event ws.WatchEvent) {
		roomKey := event.Cluster + "/" + event.Resource + "/" + event.Namespace
		data, err := json.Marshal(event)
		if err != nil {
			return
		}
		var raw map[string]interface{}
		_ = json.Unmarshal(data, &raw)
		_ = nsp.To(socket.Room(roomKey)).Emit("watch_event", raw)
	})

	_ = nsp.On("connection", func(clients ...interface{}) {
		client := clients[0].(*socket.Socket)
		userID := getUserID(client)
		log.Printf("socketio/k8s: user %s connected", userID)

		_ = client.On("subscribe", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			clusterID, _ := data["cluster"].(string)
			resource, _ := data["resource"].(string)
			namespace, _ := data["namespace"].(string)

			if clusterID == "" || resource == "" {
				emitError(client, "cluster and resource are required")
				return
			}

			roomKey := clusterID + "/" + resource + "/" + namespace
			client.Join(socket.Room(roomKey))
			log.Printf("socketio/k8s: user %s subscribed to %s", userID, roomKey)
		})

		_ = client.On("unsubscribe", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			clusterID, _ := data["cluster"].(string)
			resource, _ := data["resource"].(string)
			namespace, _ := data["namespace"].(string)

			roomKey := clusterID + "/" + resource + "/" + namespace
			client.Leave(socket.Room(roomKey))
			log.Printf("socketio/k8s: user %s unsubscribed from %s", userID, roomKey)
		})

		_ = client.On("namespace:watch", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			clusterID, _ := data["cluster"].(string)
			if clusterID == "" {
				emitError(client, "cluster is required for namespace:watch")
				return
			}

			k8sClient, err := clusterMgr.GetClient(clusterID)
			if err != nil {
				emitError(client, "cluster not available: "+err.Error())
				return
			}

			nsList, err := k8sClient.Clientset.CoreV1().Namespaces().List(client.Request().Context(), metav1.ListOptions{})
			if err != nil {
				emitError(client, "failed to list namespaces: "+err.Error())
				return
			}

			type nsInfo struct {
				Name   string            `json:"name"`
				Labels map[string]string `json:"labels"`
			}
			entries := make([]nsInfo, len(nsList.Items))
			for i, ns := range nsList.Items {
				entries[i] = nsInfo{Name: ns.Name, Labels: ns.Labels}
			}

			payload := map[string]interface{}{
				"cluster":    clusterID,
				"namespaces": entries,
			}
			_ = client.Emit("namespace:list", payload)
			log.Printf("socketio/k8s: sent namespace:list to user %s for cluster %s (%d namespaces)", userID, clusterID, len(entries))
		})

		_ = client.On("disconnect", func(...interface{}) {
			log.Printf("socketio/k8s: user %s disconnected", userID)
		})
	})
}
