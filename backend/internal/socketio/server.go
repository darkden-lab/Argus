package socketio

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/zishang520/engine.io/v2/types"
	"github.com/zishang520/socket.io/v2/socket"
	"github.com/darkden-lab/argus/backend/internal/ai"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/notifications"
	"github.com/darkden-lab/argus/backend/internal/terminal"
	"github.com/darkden-lab/argus/backend/internal/ws"
)

// Server wraps the Socket.IO server and provides namespace-based handlers.
type Server struct {
	io      *socket.Server
	handler http.Handler
}

// Deps holds all dependencies needed by the Socket.IO namespaces.
type Deps struct {
	JWTService    *auth.JWTService
	Hub           *ws.Hub
	AIService     *ai.Service
	ClusterMgr    *cluster.Manager
	NotifWSHandler *notifications.WSHandler
	TerminalHandler *terminal.Handler
}

// NewServer creates and configures the Socket.IO server with all namespaces.
func NewServer(deps Deps) *Server {
	opts := socket.DefaultServerOptions()
	opts.SetMaxHttpBufferSize(1_000_000)
	opts.SetConnectTimeout(5000 * time.Millisecond)
	opts.SetCors(&types.Cors{
		Origin:      "*",
		Credentials: true,
	})

	io := socket.NewServer(nil, nil)

	// Register namespaces
	registerK8sNamespace(io, deps.JWTService, deps.Hub)
	registerAINamespace(io, deps.JWTService, deps.AIService)
	registerTerminalNamespace(io, deps.JWTService, deps.ClusterMgr)
	registerNotificationsNamespace(io, deps.JWTService, deps.NotifWSHandler)

	return &Server{
		io:      io,
		handler: io.ServeHandler(opts),
	}
}

// Handler returns the http.Handler that serves Socket.IO requests.
func (s *Server) Handler() http.Handler {
	return s.handler
}

// Close gracefully shuts down the Socket.IO server.
func (s *Server) Close() {
	s.io.Close(nil)
}

// authMiddleware creates a Socket.IO middleware that validates JWT from handshake auth.
func authMiddleware(jwtService *auth.JWTService) func(*socket.Socket, func(*socket.ExtendedError)) {
	return func(s *socket.Socket, next func(*socket.ExtendedError)) {
		authData := s.Handshake().Auth
		if authData == nil {
			next(socket.NewExtendedError("authentication required", nil))
			return
		}

		tokenRaw, ok := authData.(map[string]interface{})
		if !ok {
			next(socket.NewExtendedError("invalid auth format", nil))
			return
		}

		token, ok := tokenRaw["token"].(string)
		if !ok || token == "" {
			next(socket.NewExtendedError("token required", nil))
			return
		}

		claims, err := jwtService.ValidateToken(token)
		if err != nil {
			next(socket.NewExtendedError("invalid token", nil))
			return
		}

		// Store claims in socket data for handlers to use
		s.SetData(claims)
		log.Printf("socketio: authenticated user %s on namespace %s", claims.UserID, s.Nsp().Name())
		next(nil)
	}
}

// getUserID extracts the user ID from the socket's stored claims.
func getUserID(s *socket.Socket) string {
	claims, ok := s.Data().(*auth.Claims)
	if !ok {
		return ""
	}
	return claims.UserID
}

// getClaims extracts the JWT claims from the socket's stored data.
func getClaims(s *socket.Socket) *auth.Claims {
	claims, ok := s.Data().(*auth.Claims)
	if !ok {
		return nil
	}
	return claims
}

// emitError sends an error event to the socket.
func emitError(s *socket.Socket, msg string) {
	s.Emit("error", fmt.Sprintf(`{"error":"%s"}`, msg))
}
