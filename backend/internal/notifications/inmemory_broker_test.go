package notifications

import (
	"encoding/json"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestInMemoryBroker_PublishSubscribe(t *testing.T) {
	broker := NewInMemoryBroker()
	defer broker.Close()

	var received Event
	done := make(chan struct{})

	_, err := broker.Subscribe(TopicClusterHealth, func(e Event) {
		received = e
		close(done)
	})
	if err != nil {
		t.Fatalf("subscribe failed: %v", err)
	}

	event := NewEvent(TopicClusterHealth, CategoryCluster, SeverityWarning, "Cluster unhealthy", "Cluster prod-1 is down", nil)
	if err := broker.Publish(TopicClusterHealth, event); err != nil {
		t.Fatalf("publish failed: %v", err)
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for event")
	}

	if received.ID != event.ID {
		t.Errorf("expected event ID %s, got %s", event.ID, received.ID)
	}
	if received.Title != "Cluster unhealthy" {
		t.Errorf("expected title 'Cluster unhealthy', got %q", received.Title)
	}
	if received.Severity != SeverityWarning {
		t.Errorf("expected severity %s, got %s", SeverityWarning, received.Severity)
	}
}

func TestInMemoryBroker_MultipleSubscribers(t *testing.T) {
	broker := NewInMemoryBroker()
	defer broker.Close()

	var count atomic.Int32
	var wg sync.WaitGroup
	wg.Add(3)

	for i := 0; i < 3; i++ {
		_, err := broker.Subscribe(TopicWorkloadCrash, func(e Event) {
			count.Add(1)
			wg.Done()
		})
		if err != nil {
			t.Fatalf("subscribe %d failed: %v", i, err)
		}
	}

	event := NewEvent(TopicWorkloadCrash, CategoryWorkload, SeverityCritical, "Pod crashed", "nginx-abc123 OOMKilled", nil)
	if err := broker.Publish(TopicWorkloadCrash, event); err != nil {
		t.Fatalf("publish failed: %v", err)
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for all subscribers")
	}

	if got := count.Load(); got != 3 {
		t.Errorf("expected 3 handler calls, got %d", got)
	}
}

func TestInMemoryBroker_TopicFiltering(t *testing.T) {
	broker := NewInMemoryBroker()
	defer broker.Close()

	var clusterCount, workloadCount atomic.Int32
	clusterDone := make(chan struct{}, 1)
	workloadDone := make(chan struct{}, 1)

	_, err := broker.Subscribe(TopicClusterHealth, func(e Event) {
		clusterCount.Add(1)
		select {
		case clusterDone <- struct{}{}:
		default:
		}
	})
	if err != nil {
		t.Fatalf("subscribe cluster failed: %v", err)
	}

	_, err = broker.Subscribe(TopicWorkloadCrash, func(e Event) {
		workloadCount.Add(1)
		select {
		case workloadDone <- struct{}{}:
		default:
		}
	})
	if err != nil {
		t.Fatalf("subscribe workload failed: %v", err)
	}

	// Publish only to cluster topic
	event := NewEvent(TopicClusterHealth, CategoryCluster, SeverityInfo, "Healthy", "All good", nil)
	if err := broker.Publish(TopicClusterHealth, event); err != nil {
		t.Fatalf("publish failed: %v", err)
	}

	select {
	case <-clusterDone:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for cluster event")
	}

	// Give a moment for any erroneous delivery to the workload handler.
	time.Sleep(100 * time.Millisecond)

	if got := clusterCount.Load(); got != 1 {
		t.Errorf("expected 1 cluster event, got %d", got)
	}
	if got := workloadCount.Load(); got != 0 {
		t.Errorf("expected 0 workload events, got %d", got)
	}
}

func TestInMemoryBroker_EventMetadata(t *testing.T) {
	broker := NewInMemoryBroker()
	defer broker.Close()

	meta := json.RawMessage(`{"cluster_id":"abc-123","namespace":"default"}`)
	event := NewEvent(TopicWorkloadDeploy, CategoryWorkload, SeverityInfo, "Deploy", "Deployed v2", meta)

	var received Event
	done := make(chan struct{})

	_, err := broker.Subscribe(TopicWorkloadDeploy, func(e Event) {
		received = e
		close(done)
	})
	if err != nil {
		t.Fatalf("subscribe failed: %v", err)
	}

	if err := broker.Publish(TopicWorkloadDeploy, event); err != nil {
		t.Fatalf("publish failed: %v", err)
	}

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out")
	}

	if received.Metadata == nil {
		t.Fatal("expected metadata, got nil")
	}
	var m map[string]string
	if err := json.Unmarshal(received.Metadata, &m); err != nil {
		t.Fatalf("unmarshal metadata: %v", err)
	}
	if m["cluster_id"] != "abc-123" {
		t.Errorf("expected cluster_id abc-123, got %s", m["cluster_id"])
	}
}

func TestInMemoryBroker_ClosePreventsFurtherUse(t *testing.T) {
	broker := NewInMemoryBroker()
	broker.Close()

	if err := broker.Publish(TopicClusterHealth, Event{}); err == nil {
		t.Error("expected error publishing after close")
	}

	if _, err := broker.Subscribe(TopicClusterHealth, func(e Event) {}); err == nil {
		t.Error("expected error subscribing after close")
	}
}

func TestInMemoryBroker_DoubleCloseIsNoop(t *testing.T) {
	broker := NewInMemoryBroker()
	if err := broker.Close(); err != nil {
		t.Fatalf("first close failed: %v", err)
	}
	if err := broker.Close(); err != nil {
		t.Fatalf("second close failed: %v", err)
	}
}

func TestNewEvent_GeneratesIDAndTimestamp(t *testing.T) {
	e := NewEvent(TopicNodeReady, CategoryNode, SeverityInfo, "Node ready", "node-1 is ready", nil)

	if e.ID == "" {
		t.Error("expected non-empty ID")
	}
	if e.Timestamp.IsZero() {
		t.Error("expected non-zero timestamp")
	}
	if e.Topic != TopicNodeReady {
		t.Errorf("expected topic %s, got %s", TopicNodeReady, e.Topic)
	}
	if e.Category != CategoryNode {
		t.Errorf("expected category %s, got %s", CategoryNode, e.Category)
	}
}
