package notifications

import (
	"strings"
	"testing"
	"time"
)

func TestDigestAggregator_AddEvent(t *testing.T) {
	agg := NewDigestAggregator(nil, nil, nil, nil)
	defer agg.Stop()

	event := NewEvent(TopicClusterHealth, CategoryCluster, SeverityWarning, "Test", "Body", nil)
	agg.AddEvent("user-1", event)
	agg.AddEvent("user-1", event)
	agg.AddEvent("user-2", event)

	agg.mu.Lock()
	defer agg.mu.Unlock()

	if len(agg.buffer["user-1"]) != 2 {
		t.Errorf("expected 2 events for user-1, got %d", len(agg.buffer["user-1"]))
	}
	if len(agg.buffer["user-2"]) != 1 {
		t.Errorf("expected 1 event for user-2, got %d", len(agg.buffer["user-2"]))
	}
}

func TestDigestAggregator_Stop(t *testing.T) {
	agg := NewDigestAggregator(nil, nil, nil, nil)
	agg.Start()
	agg.Stop()
	// Should not panic or block
}

func TestBuildDigestMessage(t *testing.T) {
	events := []Event{
		NewEvent(TopicClusterHealth, CategoryCluster, SeverityWarning, "Cluster unhealthy", "Body 1", nil),
		NewEvent(TopicWorkloadCrash, CategoryWorkload, SeverityCritical, "Pod crashed", "Body 2", nil),
		NewEvent(TopicClusterHealth, CategoryCluster, SeverityInfo, "Cluster healthy", "Body 3", nil),
	}

	msg := buildDigestMessage("daily", events)

	if msg.Title != "Your daily notification digest" {
		t.Errorf("expected title 'Your daily notification digest', got %q", msg.Title)
	}
	if msg.Category != "digest" {
		t.Errorf("expected category 'digest', got %q", msg.Category)
	}
	if !strings.Contains(msg.Body, "cluster:") {
		t.Errorf("expected body to contain 'cluster:', got %q", msg.Body)
	}
	if !strings.Contains(msg.Body, "workload:") {
		t.Errorf("expected body to contain 'workload:', got %q", msg.Body)
	}
	if !strings.Contains(msg.Body, "Pod crashed") {
		t.Errorf("expected body to contain event title, got %q", msg.Body)
	}
}

func TestBuildDigestBody_LimitsTenEvents(t *testing.T) {
	events := make([]Event, 15)
	for i := 0; i < 15; i++ {
		events[i] = NewEvent(TopicClusterHealth, CategoryCluster, SeverityInfo, "Event "+intToStr(i), "Body", nil)
	}

	body := buildDigestBody(events)

	// Should contain max 10 "- [" entries
	count := strings.Count(body, "- [")
	if count != 10 {
		t.Errorf("expected 10 recent events in body, got %d", count)
	}
}

func TestBuildDigestMessage_Timestamp(t *testing.T) {
	events := []Event{
		NewEvent(TopicClusterHealth, CategoryCluster, SeverityInfo, "Test", "Body", nil),
	}

	msg := buildDigestMessage("weekly", events)

	if msg.Timestamp.IsZero() {
		t.Error("expected non-zero timestamp")
	}
	if time.Since(msg.Timestamp) > 2*time.Second {
		t.Error("expected timestamp to be recent")
	}
}

func TestIntToStr(t *testing.T) {
	tests := []struct {
		input    int
		expected string
	}{
		{0, "0"},
		{5, "5"},
		{10, "10"},
		{123, "123"},
	}

	for _, tt := range tests {
		got := intToStr(tt.input)
		if got != tt.expected {
			t.Errorf("intToStr(%d) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}
