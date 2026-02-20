package channels

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/k8s-dashboard/backend/internal/notifications"
)

func TestTeamsChannel_Send(t *testing.T) {
	var receivedBody map[string]interface{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &receivedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ch, err := NewTeamsChannel("test-teams", TeamsConfig{WebhookURL: server.URL})
	if err != nil {
		t.Fatalf("NewTeamsChannel failed: %v", err)
	}

	event := notifications.NewEvent(
		notifications.TopicNodeNotReady,
		notifications.CategoryNode,
		notifications.SeverityWarning,
		"Node not ready",
		"node-3 reporting NotReady condition",
		nil,
	)

	if err := ch.Send(event, nil); err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	if receivedBody["type"] != "message" {
		t.Errorf("expected type 'message', got %v", receivedBody["type"])
	}

	attachments, ok := receivedBody["attachments"].([]interface{})
	if !ok || len(attachments) == 0 {
		t.Fatal("expected attachments in Teams payload")
	}

	att := attachments[0].(map[string]interface{})
	if att["contentType"] != "application/vnd.microsoft.card.adaptive" {
		t.Errorf("expected adaptive card content type, got %v", att["contentType"])
	}
}

func TestTeamsChannel_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
	}))
	defer server.Close()

	ch, _ := NewTeamsChannel("test-teams", TeamsConfig{WebhookURL: server.URL})
	event := notifications.NewEvent(notifications.TopicClusterHealth, notifications.CategoryCluster, notifications.SeverityInfo, "Test", "Test", nil)

	if err := ch.Send(event, nil); err == nil {
		t.Error("expected error for server error response")
	}
}

func TestTeamsChannel_NameAndType(t *testing.T) {
	ch, _ := NewTeamsChannel("my-teams", TeamsConfig{WebhookURL: "https://outlook.webhook.office.com/test"})
	if ch.Name() != "my-teams" {
		t.Errorf("expected name 'my-teams', got %q", ch.Name())
	}
	if ch.Type() != "teams" {
		t.Errorf("expected type 'teams', got %q", ch.Type())
	}
}

func TestNewTeamsChannel_Validation(t *testing.T) {
	_, err := NewTeamsChannel("test", TeamsConfig{})
	if err == nil {
		t.Error("expected error for missing webhook URL")
	}
}

func TestTeamsSeverityColor(t *testing.T) {
	tests := []struct {
		severity notifications.Severity
		style    string
	}{
		{notifications.SeverityCritical, "attention"},
		{notifications.SeverityWarning, "warning"},
		{notifications.SeverityInfo, "accent"},
	}

	for _, tt := range tests {
		got := teamsSeverityColor(tt.severity)
		if got != tt.style {
			t.Errorf("severity %s: expected style %s, got %s", tt.severity, tt.style, got)
		}
	}
}
