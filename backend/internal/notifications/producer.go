package notifications

import (
	"encoding/json"
	"log"
	"strings"

	"github.com/k8s-dashboard/backend/internal/ws"
)

// EventProducer translates system events (K8s watch events, audit actions,
// health checks) into notification events and publishes them to the broker.
type EventProducer struct {
	broker MessageBroker
}

// NewEventProducer creates a new EventProducer that publishes to the given broker.
func NewEventProducer(broker MessageBroker) *EventProducer {
	return &EventProducer{broker: broker}
}

// HookIntoHub registers a WatchEvent hook on the WebSocket hub so that K8s
// watch events are automatically translated into notification events.
func (p *EventProducer) HookIntoHub(hub *ws.Hub) {
	hub.OnEvent(func(we ws.WatchEvent) {
		p.handleWatchEvent(we)
	})
}

// PublishAuditEvent publishes an audit-related notification event.
func (p *EventProducer) PublishAuditEvent(action, resource string, details json.RawMessage) {
	event := NewEvent(TopicAuditAction, CategoryAudit, SeverityInfo, action, resource, details)
	if err := p.broker.Publish(TopicAuditAction, event); err != nil {
		log.Printf("notifications: failed to publish audit event: %v", err)
	}
}

// PublishClusterHealthEvent publishes a cluster health change event.
func (p *EventProducer) PublishClusterHealthEvent(clusterID, clusterName, status string) {
	severity := SeverityInfo
	title := "Cluster healthy"
	topic := TopicClusterHealth

	if status != "connected" {
		severity = SeverityCritical
		title = "Cluster unhealthy"
	}

	meta, _ := json.Marshal(map[string]string{
		"cluster_id":   clusterID,
		"cluster_name": clusterName,
		"status":       status,
	})

	event := NewEvent(topic, CategoryCluster, severity, title, clusterName+" is "+status, meta)
	if err := p.broker.Publish(topic, event); err != nil {
		log.Printf("notifications: failed to publish cluster health event: %v", err)
	}
}

func (p *EventProducer) handleWatchEvent(we ws.WatchEvent) {
	topic, category, severity := classifyWatchEvent(we)
	if topic == "" {
		return // not a notifiable event
	}

	meta, _ := json.Marshal(map[string]string{
		"cluster":   we.Cluster,
		"resource":  we.Resource,
		"namespace": we.Namespace,
		"type":      we.Type,
	})

	title := we.Type + " " + we.Resource
	body := "Resource " + we.Resource + " " + strings.ToLower(we.Type) + " in " + we.Cluster
	if we.Namespace != "" {
		body += "/" + we.Namespace
	}

	event := NewEvent(topic, category, severity, title, body, meta)
	if err := p.broker.Publish(topic, event); err != nil {
		log.Printf("notifications: failed to publish watch event: %v", err)
	}
}

func classifyWatchEvent(we ws.WatchEvent) (string, Category, Severity) {
	resource := strings.ToLower(we.Resource)
	eventType := strings.ToUpper(we.Type)

	switch {
	case resource == "nodes" && eventType == "MODIFIED":
		return TopicNodeReady, CategoryNode, SeverityWarning
	case resource == "nodes" && eventType == "DELETED":
		return TopicNodeNotReady, CategoryNode, SeverityCritical
	case (resource == "deployments" || resource == "statefulsets" || resource == "daemonsets") && eventType == "MODIFIED":
		return TopicWorkloadDeploy, CategoryWorkload, SeverityInfo
	case resource == "pods" && eventType == "DELETED":
		return TopicWorkloadCrash, CategoryWorkload, SeverityWarning
	case (resource == "deployments" || resource == "replicasets") && eventType == "ADDED":
		return TopicWorkloadScale, CategoryWorkload, SeverityInfo
	default:
		return "", "", ""
	}
}
