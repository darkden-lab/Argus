package notifications

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// Topic constants for notification events.
const (
	TopicClusterHealth  = "cluster.health"
	TopicClusterAdded   = "cluster.added"
	TopicClusterRemoved = "cluster.removed"
	TopicWorkloadCrash  = "workload.crash"
	TopicWorkloadScale  = "workload.scale"
	TopicWorkloadDeploy = "workload.deploy"
	TopicNodeReady      = "node.ready"
	TopicNodeNotReady   = "node.not_ready"
	TopicSecurityRBAC   = "security.rbac"
	TopicSecuritySecret = "security.secret"
	TopicPluginInstall  = "plugin.install"
	TopicPluginError    = "plugin.error"
	TopicAuditAction    = "audit.action"
)

// Category groups related topics for user preference management.
type Category string

const (
	CategoryCluster  Category = "cluster"
	CategoryWorkload Category = "workload"
	CategoryNode     Category = "node"
	CategorySecurity Category = "security"
	CategoryPlugin   Category = "plugin"
	CategoryAudit    Category = "audit"
)

// Severity indicates the urgency of the event.
type Severity string

const (
	SeverityInfo     Severity = "info"
	SeverityWarning  Severity = "warning"
	SeverityCritical Severity = "critical"
)

// Event represents a notification event published through the broker.
type Event struct {
	ID        string          `json:"id"`
	Topic     string          `json:"topic"`
	Category  Category        `json:"category"`
	Severity  Severity        `json:"severity"`
	Title     string          `json:"title"`
	Body      string          `json:"body"`
	Metadata  json.RawMessage `json:"metadata,omitempty"`
	Timestamp time.Time       `json:"timestamp"`
}

// NewEvent creates a new Event with a generated UUID and the current timestamp.
func NewEvent(topic string, category Category, severity Severity, title, body string, metadata json.RawMessage) Event {
	return Event{
		ID:        uuid.New().String(),
		Topic:     topic,
		Category:  category,
		Severity:  severity,
		Title:     title,
		Body:      body,
		Metadata:  metadata,
		Timestamp: time.Now().UTC(),
	}
}

// EventHandler is a callback invoked when a subscribed event is received.
type EventHandler func(event Event)
