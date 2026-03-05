package socketio

import (
	"bytes"
	"context"
	"log"
	"sync"

	"github.com/zishang520/socket.io/v2/socket"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/terminal"
)

// terminalSession holds per-socket terminal state without requiring
// the gorilla/websocket-based terminal.Session.
type terminalSession struct {
	clusterID   string
	namespace   string
	mode        terminal.Mode
	smartParser *terminal.SmartParser
	mu          sync.RWMutex
}

// registerTerminalNamespace sets up the /terminal namespace.
func registerTerminalNamespace(io *socket.Server, jwtService *auth.JWTService, clusterMgr *cluster.Manager) {
	nsp := io.Of("/terminal", nil)
	nsp.Use(authMiddleware(jwtService))

	_ = nsp.On("connection", func(clients ...interface{}) {
		client := clients[0].(*socket.Socket)
		userID := getUserID(client)
		log.Printf("socketio/terminal: user %s connected", userID)

		sess := &terminalSession{
			mode:        terminal.ModeSmart,
			smartParser: terminal.NewSmartParser(clusterMgr),
		}

		// Send connected confirmation
		_ = client.Emit("connected", map[string]string{"data": "Terminal session established"})

		_ = client.On("set_context", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			clusterID, _ := data["cluster_id"].(string)
			namespace, _ := data["namespace"].(string)

			sess.mu.Lock()
			sess.clusterID = clusterID
			sess.namespace = namespace
			sess.mu.Unlock()

			_ = client.Emit("output", map[string]string{
				"type":       "output",
				"data":       "Context set to cluster=" + clusterID + " namespace=" + namespace + "\r\n",
				"cluster_id": clusterID,
				"namespace":  namespace,
			})
			log.Printf("socketio/terminal: user %s context set cluster=%s namespace=%s", userID, clusterID, namespace)
		})

		_ = client.On("input", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			input, _ := data["data"].(string)
			if input == "" {
				return
			}

			sess.mu.RLock()
			clusterID := sess.clusterID
			namespace := sess.namespace
			mode := sess.mode
			sess.mu.RUnlock()

			if clusterID == "" {
				_ = client.Emit("error", map[string]string{
					"type": "error",
					"data": "No cluster selected. Use set_context to select a cluster.\r\n",
				})
				return
			}

			_, err := clusterMgr.GetClient(clusterID)
			if err != nil {
				_ = client.Emit("error", map[string]string{
					"type": "error",
					"data": "Cluster not available: " + err.Error() + "\r\n",
				})
				return
			}

			ctx := context.Background()

			switch mode {
			case terminal.ModeSmart:
				cmd, err := sess.smartParser.Parse(input)
				if err != nil {
					_ = client.Emit("error", map[string]string{"type": "error", "data": "Parse error: " + err.Error() + "\r\n"})
					return
				}
				if cmd.Namespace == "" {
					cmd.Namespace = namespace
				}
				result, err := sess.smartParser.Execute(ctx, clusterID, cmd)
				if err != nil {
					_ = client.Emit("error", map[string]string{"type": "error", "data": "Error: " + err.Error() + "\r\n"})
					return
				}
				_ = client.Emit("output", map[string]string{
					"type":       "output",
					"data":       result + "\r\n",
					"cluster_id": clusterID,
					"namespace":  namespace,
				})

			case terminal.ModeRaw:
				exec := terminal.NewExecSession(clusterMgr, clusterID, namespace)
				_, err := exec.FindOrCreateToolsPod(ctx)
				if err != nil {
					_ = client.Emit("error", map[string]string{"type": "error", "data": "Error: " + err.Error() + "\r\n"})
					return
				}
				var stdout, stderr bytes.Buffer
				err = exec.Exec(ctx, []string{"sh", "-c", input}, nil, &stdout, &stderr)
				if err != nil {
					_ = client.Emit("error", map[string]string{"type": "error", "data": "Exec error: " + err.Error() + "\r\n"})
					return
				}
				output := stdout.String()
				if errOut := stderr.String(); errOut != "" {
					output += errOut
				}
				_ = client.Emit("output", map[string]string{
					"type":       "output",
					"data":       output + "\r\n",
					"cluster_id": clusterID,
					"namespace":  namespace,
				})
			}
		})

		_ = client.On("resize", func(args ...interface{}) {
			// Terminal resize — currently no-op for smart mode
		})

		_ = client.On("mode", func(args ...interface{}) {
			if len(args) == 0 {
				return
			}
			data, ok := args[0].(map[string]interface{})
			if !ok {
				return
			}
			modeStr, _ := data["mode"].(string)
			newMode := terminal.Mode(modeStr)
			if newMode != terminal.ModeSmart && newMode != terminal.ModeRaw {
				_ = client.Emit("error", map[string]string{"type": "error", "data": "invalid mode: " + modeStr})
				return
			}
			sess.mu.Lock()
			sess.mode = newMode
			sess.mu.Unlock()
			_ = client.Emit("mode_changed", map[string]string{"mode": modeStr})
			log.Printf("socketio/terminal: user %s mode changed to %s", userID, modeStr)
		})

		_ = client.On("disconnect", func(...interface{}) {
			log.Printf("socketio/terminal: user %s disconnected", userID)
		})
	})
}
