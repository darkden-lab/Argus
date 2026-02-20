package channels

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/k8s-dashboard/backend/internal/notifications"
)

func TestSlackChannel_Send(t *testing.T) {
	var receivedBody map[string]interface{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		if r.Header.Get("Content-Type") != "application/json" {
			t.Errorf("expected Content-Type application/json, got %s", r.Header.Get("Content-Type"))
		}
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &receivedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ch, err := NewSlackChannel("test-slack", SlackConfig{WebhookURL: server.URL})
	if err != nil {
		t.Fatalf("NewSlackChannel failed: %v", err)
	}

	event := notifications.NewEvent(
		notifications.TopicWorkloadCrash,
		notifications.CategoryWorkload,
		notifications.SeverityCritical,
		"Pod crashed",
		"nginx-abc123 OOMKilled",
		nil,
	)

	if err := ch.Send(event, nil); err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	blocks, ok := receivedBody["blocks"].([]interface{})
	if !ok || len(blocks) < 2 {
		t.Fatal("expected at least 2 blocks in Slack payload")
	}

	// Check header block contains title
	header := blocks[0].(map[string]interface{})
	text := header["text"].(map[string]interface{})
	if textVal, ok := text["text"].(string); !ok || textVal == "" {
		t.Error("expected non-empty header text")
	}
}

func TestSlackChannel_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	ch, _ := NewSlackChannel("test-slack", SlackConfig{WebhookURL: server.URL})
	event := notifications.NewEvent(notifications.TopicClusterHealth, notifications.CategoryCluster, notifications.SeverityInfo, "Test", "Test", nil)

	if err := ch.Send(event, nil); err == nil {
		t.Error("expected error for server error response")
	}
}

func TestSlackChannel_NameAndType(t *testing.T) {
	ch, _ := NewSlackChannel("my-slack", SlackConfig{WebhookURL: "https://hooks.slack.com/test"})
	if ch.Name() != "my-slack" {
		t.Errorf("expected name 'my-slack', got %q", ch.Name())
	}
	if ch.Type() != "slack" {
		t.Errorf("expected type 'slack', got %q", ch.Type())
	}
}

func TestNewSlackChannel_Validation(t *testing.T) {
	_, err := NewSlackChannel("test", SlackConfig{})
	if err == nil {
		t.Error("expected error for missing webhook URL")
	}
}

func TestBuildSlackPayload_SeverityColors(t *testing.T) {
	tests := []struct {
		severity notifications.Severity
		color    string
	}{
		{notifications.SeverityCritical, "#ef4444"},
		{notifications.SeverityWarning, "#f59e0b"},
		{notifications.SeverityInfo, "#3b82f6"},
	}

	for _, tt := range tests {
		event := notifications.NewEvent(notifications.TopicClusterHealth, notifications.CategoryCluster, tt.severity, "Test", "Body", nil)
		payload := buildSlackPayload(event)

		attachments := payload["attachments"].([]map[string]interface{})
		if attachments[0]["color"] != tt.color {
			t.Errorf("severity %s: expected color %s, got %s", tt.severity, tt.color, attachments[0]["color"])
		}
	}
}
