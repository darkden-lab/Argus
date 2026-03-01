package terminal

import (
	"bytes"
	"context"
	"log"
	"sync"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/darkden-lab/argus/backend/internal/cluster"
)

// Mode identifies how the terminal processes commands.
type Mode string

const (
	ModeSmart Mode = "smart" // kubectl-like parsed commands
	ModeRaw   Mode = "raw"   // raw shell exec in pod
)

// Session represents an active terminal session for a user.
type Session struct {
	ID          string
	UserID      string
	ClusterID   string
	Namespace   string
	Mode        Mode
	History     []string
	conn        *websocket.Conn
	clusterMgr  *cluster.Manager
	smartParser *SmartParser
	output      chan TerminalMessage
	done        chan struct{}
	closeOnce   sync.Once

	// Terminal dimensions
	cols int
	rows int
	mu   sync.RWMutex
}

// NewSession creates a terminal session.
func NewSession(userID string, conn *websocket.Conn, clusterMgr *cluster.Manager) *Session {
	return &Session{
		ID:          uuid.New().String(),
		UserID:      userID,
		Mode:        ModeSmart,
		History:     make([]string, 0, 100),
		conn:        conn,
		clusterMgr:  clusterMgr,
		smartParser: NewSmartParser(clusterMgr),
		output:      make(chan TerminalMessage, 256),
		done:        make(chan struct{}),
		cols:        80,
		rows:        24,
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

	log.Printf("terminal: session %s user %s command: %s (cluster=%s ns=%s mode=%s)",
		s.ID, s.UserID, input, clusterID, namespace, s.Mode)

	ctx := context.Background()

	s.mu.RLock()
	mode := s.Mode
	s.mu.RUnlock()

	switch mode {
	case ModeSmart:
		cmd, err := s.smartParser.Parse(input)
		if err != nil {
			s.output <- TerminalMessage{
				Type: "error",
				Data: "Parse error: " + err.Error() + "\r\n",
			}
			return
		}
		if cmd.Namespace == "" {
			cmd.Namespace = namespace
		}
		result, err := s.smartParser.Execute(ctx, clusterID, cmd)
		if err != nil {
			s.output <- TerminalMessage{
				Type: "error",
				Data: "Error: " + err.Error() + "\r\n",
			}
			return
		}
		s.output <- TerminalMessage{
			Type:      "output",
			Data:      result + "\r\n",
			ClusterID: clusterID,
			Namespace: namespace,
		}

	case ModeRaw:
		exec := NewExecSession(s.clusterMgr, clusterID, namespace)
		_, err := exec.FindOrCreateToolsPod(ctx)
		if err != nil {
			s.output <- TerminalMessage{
				Type: "error",
				Data: "Error: " + err.Error() + "\r\n",
			}
			return
		}
		var stdout, stderr bytes.Buffer
		err = exec.Exec(ctx, []string{"sh", "-c", input}, nil, &stdout, &stderr)
		if err != nil {
			s.output <- TerminalMessage{
				Type: "error",
				Data: "Exec error: " + err.Error() + "\r\n",
			}
			return
		}
		output := stdout.String()
		if errOut := stderr.String(); errOut != "" {
			output += errOut
		}
		s.output <- TerminalMessage{
			Type:      "output",
			Data:      output + "\r\n",
			ClusterID: clusterID,
			Namespace: namespace,
		}
	}
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
