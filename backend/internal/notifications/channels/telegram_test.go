package channels

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/k8s-dashboard/backend/internal/notifications"
)

func TestTelegramChannel_Send(t *testing.T) {
	var receivedBody map[string]interface{}
	var receivedPath string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &receivedBody)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	ch, err := NewTelegramChannel("test-tg", TelegramConfig{
		BotToken: "123:ABC",
		ChatID:   "-100123456",
	})
	if err != nil {
		t.Fatalf("NewTelegramChannel failed: %v", err)
	}
	ch.baseURL = server.URL

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

	if receivedPath != "/bot123:ABC/sendMessage" {
		t.Errorf("expected path /bot123:ABC/sendMessage, got %s", receivedPath)
	}
	if receivedBody["chat_id"] != "-100123456" {
		t.Errorf("expected chat_id -100123456, got %v", receivedBody["chat_id"])
	}
	if receivedBody["parse_mode"] != "HTML" {
		t.Errorf("expected parse_mode HTML, got %v", receivedBody["parse_mode"])
	}

	text := receivedBody["text"].(string)
	if !strings.Contains(text, "Pod crashed") {
		t.Errorf("expected title in text, got %q", text)
	}
	if !strings.Contains(text, "nginx-abc123 OOMKilled") {
		t.Errorf("expected body in text, got %q", text)
	}
}

func TestTelegramChannel_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer server.Close()

	ch, _ := NewTelegramChannel("test-tg", TelegramConfig{BotToken: "bad", ChatID: "123"})
	ch.baseURL = server.URL

	event := notifications.NewEvent(notifications.TopicClusterHealth, notifications.CategoryCluster, notifications.SeverityInfo, "Test", "Test", nil)
	if err := ch.Send(event, nil); err == nil {
		t.Error("expected error for server error response")
	}
}

func TestTelegramChannel_NameAndType(t *testing.T) {
	ch, _ := NewTelegramChannel("my-tg", TelegramConfig{BotToken: "tok", ChatID: "123"})
	if ch.Name() != "my-tg" {
		t.Errorf("expected name 'my-tg', got %q", ch.Name())
	}
	if ch.Type() != "telegram" {
		t.Errorf("expected type 'telegram', got %q", ch.Type())
	}
}

func TestNewTelegramChannel_Validation(t *testing.T) {
	_, err := NewTelegramChannel("test", TelegramConfig{})
	if err == nil {
		t.Error("expected error for missing bot_token")
	}

	_, err = NewTelegramChannel("test", TelegramConfig{BotToken: "tok"})
	if err == nil {
		t.Error("expected error for missing chat_id")
	}

	_, err = NewTelegramChannel("test", TelegramConfig{BotToken: "tok", ChatID: "123"})
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestFormatTelegramMessage(t *testing.T) {
	event := notifications.NewEvent(
		notifications.TopicNodeNotReady,
		notifications.CategoryNode,
		notifications.SeverityWarning,
		"Node not ready",
		"node-3 reporting NotReady",
		nil,
	)

	msg := formatTelegramMessage(event)
	if !strings.Contains(msg, "<b>Node not ready</b>") {
		t.Errorf("expected bold title in message, got %q", msg)
	}
	if !strings.Contains(msg, "node-3 reporting NotReady") {
		t.Errorf("expected body in message, got %q", msg)
	}
	if !strings.Contains(msg, "WARNING") {
		t.Errorf("expected WARNING severity in message, got %q", msg)
	}
}
