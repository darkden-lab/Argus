package channels

import (
	"strings"
	"testing"

	"github.com/k8s-dashboard/backend/internal/notifications"
)

// mockSender records sent emails for assertions.
type mockSender struct {
	calls []sentEmail
	err   error
}

type sentEmail struct {
	from, to, subject, body string
}

func (m *mockSender) send(from, to, subject, body string) error {
	m.calls = append(m.calls, sentEmail{from, to, subject, body})
	return m.err
}

func TestEmailChannel_Send(t *testing.T) {
	mock := &mockSender{}
	ch := &EmailChannel{
		name:   "test-email",
		config: EmailConfig{FromAddress: "noreply@example.com", FromName: "K8s Dashboard"},
		sender: mock,
	}

	event := notifications.NewEvent(
		notifications.TopicClusterHealth,
		notifications.CategoryCluster,
		notifications.SeverityWarning,
		"Cluster unhealthy",
		"Cluster prod-1 is unreachable",
		nil,
	)

	err := ch.Send(event, []string{"user@example.com", "admin@example.com"})
	if err != nil {
		t.Fatalf("Send failed: %v", err)
	}

	if len(mock.calls) != 2 {
		t.Fatalf("expected 2 sends, got %d", len(mock.calls))
	}

	// Check first email
	first := mock.calls[0]
	if first.to != "user@example.com" {
		t.Errorf("expected to=user@example.com, got %s", first.to)
	}
	if !strings.Contains(first.subject, "WARNING") {
		t.Errorf("expected subject to contain WARNING, got %q", first.subject)
	}
	if !strings.Contains(first.subject, "Cluster unhealthy") {
		t.Errorf("expected subject to contain title, got %q", first.subject)
	}
	if !strings.Contains(first.body, "severity-warning") {
		t.Errorf("expected HTML body with severity class, got %q", first.body)
	}
	if !strings.Contains(first.body, "Cluster prod-1 is unreachable") {
		t.Errorf("expected body text in HTML, got %q", first.body)
	}
}

func TestEmailChannel_NameAndType(t *testing.T) {
	ch := &EmailChannel{name: "my-email", config: EmailConfig{}}
	if ch.Name() != "my-email" {
		t.Errorf("expected name 'my-email', got %q", ch.Name())
	}
	if ch.Type() != "email" {
		t.Errorf("expected type 'email', got %q", ch.Type())
	}
}

func TestNewEmailChannel_SMTPValidation(t *testing.T) {
	_, err := NewEmailChannel("test", EmailConfig{Provider: "smtp"})
	if err == nil {
		t.Error("expected error for missing SMTP config")
	}

	_, err = NewEmailChannel("test", EmailConfig{
		Provider: "smtp",
		SMTPHost: "smtp.example.com",
		SMTPPort: "587",
	})
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestNewEmailChannel_SendGridValidation(t *testing.T) {
	_, err := NewEmailChannel("test", EmailConfig{Provider: "sendgrid"})
	if err == nil {
		t.Error("expected error for missing SendGrid key")
	}

	_, err = NewEmailChannel("test", EmailConfig{
		Provider:    "sendgrid",
		SendGridKey: "SG.test-key",
	})
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
}

func TestNewEmailChannel_UnsupportedProvider(t *testing.T) {
	_, err := NewEmailChannel("test", EmailConfig{Provider: "mailgun"})
	if err == nil {
		t.Error("expected error for unsupported provider")
	}
}

func TestRenderEmailTemplate(t *testing.T) {
	event := notifications.NewEvent(
		notifications.TopicWorkloadCrash,
		notifications.CategoryWorkload,
		notifications.SeverityCritical,
		"Pod CrashLoopBackOff",
		"nginx-abc123 is crashing",
		nil,
	)

	html, err := renderEmailTemplate(event)
	if err != nil {
		t.Fatalf("render failed: %v", err)
	}

	if !strings.Contains(html, "severity-critical") {
		t.Error("expected severity-critical class in HTML")
	}
	if !strings.Contains(html, "Pod CrashLoopBackOff") {
		t.Error("expected title in HTML")
	}
	if !strings.Contains(html, "nginx-abc123 is crashing") {
		t.Error("expected body in HTML")
	}
	if !strings.Contains(html, "workload") {
		t.Error("expected category in HTML")
	}
}
