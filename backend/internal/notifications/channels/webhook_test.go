package channels

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestWebhookChannel_SendDefaultPayload(t *testing.T) {
	var receivedBody map[string]interface{}
	var receivedHeaders http.Header

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHeaders = r.Header
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &receivedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ch, err := NewWebhookChannel("test-webhook", WebhookConfig{
		URL:     server.URL,
		Headers: map[string]string{"X-Custom": "myvalue"},
	})
	if err != nil {
		t.Fatalf("NewWebhookChannel failed: %v", err)
	}

	msg := Message{
		ID:        "evt-1",
		Topic:     "plugin.install",
		Category:  "plugin",
		Severity:  "info",
		Title:     "Plugin installed",
		Body:      "Prometheus plugin installed on cluster-1",
		Timestamp: time.Now(),
	}

	if err := ch.Send(msg, nil); err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	if receivedBody["title"] != "Plugin installed" {
		t.Errorf("expected title 'Plugin installed', got %v", receivedBody["title"])
	}
	if receivedBody["severity"] != "info" {
		t.Errorf("expected severity 'info', got %v", receivedBody["severity"])
	}
	if receivedHeaders.Get("X-Custom") != "myvalue" {
		t.Errorf("expected X-Custom header 'myvalue', got %q", receivedHeaders.Get("X-Custom"))
	}
	if receivedHeaders.Get("Content-Type") != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", receivedHeaders.Get("Content-Type"))
	}
}

func TestWebhookChannel_SendWithTemplate(t *testing.T) {
	var receivedBody map[string]interface{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		json.Unmarshal(body, &receivedBody)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	tmpl := `{"alert":"{{.Title}}","level":"{{.Severity}}","msg":"{{.Body}}"}`

	ch, err := NewWebhookChannel("test-webhook", WebhookConfig{
		URL:             server.URL,
		PayloadTemplate: tmpl,
	})
	if err != nil {
		t.Fatalf("NewWebhookChannel failed: %v", err)
	}

	msg := Message{
		ID:        "evt-2",
		Topic:     "cluster.health",
		Category:  "cluster",
		Severity:  "critical",
		Title:     "Cluster down",
		Body:      "prod-1 unreachable",
		Timestamp: time.Now(),
	}

	if err := ch.Send(msg, nil); err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	if receivedBody["alert"] != "Cluster down" {
		t.Errorf("expected alert 'Cluster down', got %v", receivedBody["alert"])
	}
	if receivedBody["level"] != "critical" {
		t.Errorf("expected level 'critical', got %v", receivedBody["level"])
	}
}

func TestWebhookChannel_CustomMethod(t *testing.T) {
	var receivedMethod string

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMethod = r.Method
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	ch, _ := NewWebhookChannel("test", WebhookConfig{URL: server.URL, Method: "put"})
	msg := Message{Severity: "info", Title: "Test", Body: "Test", Timestamp: time.Now()}

	if err := ch.Send(msg, nil); err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	if receivedMethod != "PUT" {
		t.Errorf("expected PUT, got %s", receivedMethod)
	}
}

func TestWebhookChannel_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	ch, _ := NewWebhookChannel("test", WebhookConfig{URL: server.URL})
	msg := Message{Severity: "info", Title: "Test", Body: "Test", Timestamp: time.Now()}

	if err := ch.Send(msg, nil); err == nil {
		t.Error("expected error for server error response")
	}
}

func TestWebhookChannel_NameAndType(t *testing.T) {
	ch, _ := NewWebhookChannel("my-hook", WebhookConfig{URL: "https://example.com/hook"})
	if ch.Name() != "my-hook" {
		t.Errorf("expected name 'my-hook', got %q", ch.Name())
	}
	if ch.Type() != "webhook" {
		t.Errorf("expected type 'webhook', got %q", ch.Type())
	}
}

func TestNewWebhookChannel_Validation(t *testing.T) {
	_, err := NewWebhookChannel("test", WebhookConfig{})
	if err == nil {
		t.Error("expected error for missing URL")
	}

	_, err = NewWebhookChannel("test", WebhookConfig{URL: "https://example.com", PayloadTemplate: "{{.Invalid"})
	if err == nil {
		t.Error("expected error for invalid template")
	}
}

func TestNewWebhookChannel_DefaultMethod(t *testing.T) {
	ch, err := NewWebhookChannel("test", WebhookConfig{URL: "https://example.com"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ch.config.Method != "POST" {
		t.Errorf("expected default method POST, got %s", ch.config.Method)
	}
}
