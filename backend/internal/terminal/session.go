package terminal

import (
	"log"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/k8s-dashboard/backend/internal/cluster"
)

// Mode identifies how the terminal processes commands.
type Mode string

const (
	ModeSmart Mode = "smart" // kubectl-like parsed commands
	ModeRaw   Mode = "raw"   // raw shell exec in pod
)

// Session represents an active terminal session for a user.
type Session struct {
	ID         string
	UserID     string
	ClusterID  string
	Namespace  string
	Mode       Mode
	History    []string
	conn       *websocket.Conn
	clusterMgr *cluster.Manager
	output     chan TerminalMessage
	done       chan struct{}
	closeOnce  sync.Once

	// Terminal dimensions
	cols int
	rows int
	mu   sync.RWMutex
}

// NewSession creates a terminal session.
func NewSession(userID string, conn *websocket.Conn, clusterMgr *cluster.Manager) *Session {
	return &Session{
		ID:         uuid.New().String(),
		UserID:     userID,
		Mode:       ModeSmart,
		History:    make([]string, 0, 100),
		conn:       conn,
		clusterMgr: clusterMgr,
		output:     make(chan TerminalMessage, 256),
		done:       make(chan struct{}),
		cols:       80,
		rows:       24,
	}
}

// SetContext updates the cluster and namespace for this session.
func (s *Session) SetContext(clusterID, namespace string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ClusterID = clusterID
	s.Namespace = namespace
}

// GetContext returns the current cluster and namespace.
func (s *Session) GetContext() (string, string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ClusterID, s.Namespace
}

// HandleInput processes a command entered by the user.
func (s *Session) HandleInput(input string) {
	if input == "" {
		return
	}

	s.mu.Lock()
	s.History = append(s.History, input)
	s.mu.Unlock()

	clusterID, namespace := s.GetContext()
	if clusterID == "" {
		s.output <- TerminalMessage{
			Type: "error",
			Data: "No cluster selected. Use set_context to select a cluster.\r\n",
		}
		return
	}

	_, err := s.clusterMgr.GetClient(clusterID)
	if err != nil {
		s.output <- TerminalMessage{
			Type: "error",
			Data: "Cluster not available: " + err.Error() + "\r\n",
		}
		return
	}

	// For now, echo back the command (smart mode parser will be added in task #45)
	s.output <- TerminalMessage{
		Type:      "output",
		Data:      "$ " + input + "\r\n",
		ClusterID: clusterID,
		Namespace: namespace,
	}

	log.Printf("terminal: session %s user %s command: %s (cluster=%s ns=%s)",
		s.ID, s.UserID, input, clusterID, namespace)
}

// HandleResize updates the terminal dimensions.
func (s *Session) HandleResize(cols, rows int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if cols > 0 {
		s.cols = cols
	}
	if rows > 0 {
		s.rows = rows
	}
}

// Close terminates the session and releases resources.
func (s *Session) Close() {
	s.closeOnce.Do(func() {
		close(s.done)
		close(s.output)
		log.Printf("terminal: session %s closed", s.ID)
	})
}
