package socketio

import (
	"encoding/json"
	"log"

	"github.com/zishang520/socket.io/v2/socket"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

// registerK8sNamespace sets up the /k8s namespace for K8s watch events.
// Clients emit "subscribe"/"unsubscribe" with {cluster, resource, namespace}
// and receive "watch_event" when events occur on subscribed resources.
func registerK8sNamespace(io *socket.Server, jwtService *auth.JWTService, hub *ws.Hub) {
	nsp := io.Of("/k8s", nil)
	nsp.Use(authMiddleware(jwtService))

	// Hook into the Hub to broadcast events to Socket.IO rooms
	hub.OnEvent(func(event ws.WatchEvent) {
		roomKey := event.Cluster + "/" + event.Resource + "/" + event.Namespace
		data, err := json.Marshal(event)
		if err != nil {
			return
		}
		var raw map[string]interface{}
		json.Unmarshal(data, &raw)
		nsp.To(socket.Room(roomKey)).Emit("watch_event", raw)
	})

	nsp.On("connection", func(clients ...interface{}) {
		client := clients[0].(*socket.Socket)
		userID := getUserID(client)
		log.Printf("socketio/k8s: user %s connected", userID)

		client.On("subscribe", func(args ...interface{}) {
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

		client.On("unsubscribe", func(args ...interface{}) {
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

		client.On("disconnect", func(...interface{}) {
			log.Printf("socketio/k8s: user %s disconnected", userID)
		})
	})
}
