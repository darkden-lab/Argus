package socketio

import (
	"log"

	"github.com/zishang520/socket.io/v2/socket"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/notifications"
)

// registerNotificationsNamespace sets up the /notifications namespace.
// Each user joins a room named after their userID so broadcasts can target them.
func registerNotificationsNamespace(io *socket.Server, jwtService *auth.JWTService, notifWSHandler *notifications.WSHandler) {
	nsp := io.Of("/notifications", nil)
	nsp.Use(authMiddleware(jwtService))

	// Wire up the notifications WSHandler to broadcast via Socket.IO
	notifWSHandler.SetSocketIOBroadcast(func(userID string, data []byte) {
		nsp.To(socket.Room("user:" + userID)).Emit("notification", string(data))
	})
	notifWSHandler.SetSocketIOBroadcastAll(func(data []byte) {
		nsp.Emit("notification", string(data))
	})

	nsp.On("connection", func(clients ...interface{}) {
		client := clients[0].(*socket.Socket)
		userID := getUserID(client)
		log.Printf("socketio/notifications: user %s connected", userID)

		// Join user-specific room for targeted notifications
		client.Join(socket.Room("user:" + userID))

		client.On("disconnect", func(...interface{}) {
			log.Printf("socketio/notifications: user %s disconnected", userID)
		})
	})
}
