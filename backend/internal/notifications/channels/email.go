package channels

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"net/smtp"
	"strings"
)

// EmailConfig holds the configuration for the email channel.
type EmailConfig struct {
	Provider    string `json:"provider"`     // "smtp" or "sendgrid"
	SMTPHost    string `json:"smtp_host"`    // SMTP only
	SMTPPort    string `json:"smtp_port"`    // SMTP only
	SMTPUser    string `json:"smtp_user"`    // SMTP only
	SMTPPass    string `json:"smtp_pass"`    // SMTP only
	SendGridKey string `json:"sendgrid_key"` // SendGrid only
	FromAddress string `json:"from_address"`
	FromName    string `json:"from_name"`
}

// TemplateData holds the data available to notification templates.
type TemplateData struct {
	Title     string
	Body      string
	Severity  string
	Category  string
	Timestamp string
	AppName   string
}

// TemplateProvider allows the email channel to load templates from an external source.
type TemplateProvider interface {
	// GetSubjectTemplate returns the subject template string for the given channel type.
	// Returns empty string if no custom template is found.
	GetSubjectTemplate(channelType string) string

	// GetBodyTemplate returns the body template string for the given channel type.
	// Returns empty string if no custom template is found.
	GetBodyTemplate(channelType string) string
}

// EmailChannel sends notifications via email using SMTP or SendGrid.
type EmailChannel struct {
	name             string
	config           EmailConfig
	sender           emailSender
	templateProvider TemplateProvider
}

// emailSender abstracts the sending mechanism for testing.
type emailSender interface {
	send(from, to, subject, htmlBody string) error
}

// NewEmailChannel creates an EmailChannel from the given config.
func NewEmailChannel(name string, config EmailConfig) (*EmailChannel, error) {
	ch := &EmailChannel{
		name:   name,
		config: config,
	}

	switch config.Provider {
	case "smtp":
		if config.SMTPHost == "" || config.SMTPPort == "" {
			return nil, fmt.Errorf("smtp_host and smtp_port are required for SMTP provider")
		}
		ch.sender = &smtpSender{config: config}
	case "sendgrid":
		if config.SendGridKey == "" {
			return nil, fmt.Errorf("sendgrid_key is required for SendGrid provider")
		}
		ch.sender = &sendGridSender{config: config}
	default:
		return nil, fmt.Errorf("unsupported email provider: %s", config.Provider)
	}

	return ch, nil
}

// SetTemplateProvider sets a provider for loading custom templates from the database.
func (c *EmailChannel) SetTemplateProvider(tp TemplateProvider) {
	c.templateProvider = tp
}

func (c *EmailChannel) Send(msg Message, recipients []string) error {
	data := TemplateData{
		Title:     msg.Title,
		Body:      msg.Body,
		Severity:  msg.Severity,
		Category:  msg.Category,
		Timestamp: msg.Timestamp.Format("2006-01-02 15:04:05 UTC"),
		AppName:   "Argus K8s Dashboard",
	}

	subject, err := c.renderSubject(data)
	if err != nil {
		return fmt.Errorf("render subject template: %w", err)
	}

	htmlBody, err := c.renderBody(data)
	if err != nil {
		return fmt.Errorf("render email template: %w", err)
	}

	from := c.config.FromAddress
	if c.config.FromName != "" {
		from = fmt.Sprintf("%s <%s>", c.config.FromName, c.config.FromAddress)
	}

	for _, to := range recipients {
		if err := c.sender.send(from, to, subject, htmlBody); err != nil {
			return fmt.Errorf("send to %s: %w", to, err)
		}
	}
	return nil
}

func (c *EmailChannel) Name() string { return c.name }
func (c *EmailChannel) Type() string { return "email" }

// templateFuncMap provides helper functions available inside templates.
var templateFuncMap = template.FuncMap{
	"upper": strings.ToUpper,
	"lower": strings.ToLower,
}

// renderSubject renders the subject line using a custom template or the default.
func (c *EmailChannel) renderSubject(data TemplateData) (string, error) {
	subjectTmplStr := ""
	if c.templateProvider != nil {
		subjectTmplStr = c.templateProvider.GetSubjectTemplate("email")
	}

	if subjectTmplStr == "" {
		// Fallback: default subject format
		return fmt.Sprintf("[%s] %s", strings.ToUpper(data.Severity), data.Title), nil
	}

	tmpl, err := template.New("subject").Funcs(templateFuncMap).Parse(subjectTmplStr)
	if err != nil {
		log.Printf("notifications: invalid subject template, falling back to default: %v", err)
		return fmt.Sprintf("[%s] %s", strings.ToUpper(data.Severity), data.Title), nil
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		log.Printf("notifications: subject template execution failed, falling back to default: %v", err)
		return fmt.Sprintf("[%s] %s", strings.ToUpper(data.Severity), data.Title), nil
	}

	return buf.String(), nil
}

// renderBody renders the email body using a custom template or the default.
func (c *EmailChannel) renderBody(data TemplateData) (string, error) {
	bodyTmplStr := ""
	if c.templateProvider != nil {
		bodyTmplStr = c.templateProvider.GetBodyTemplate("email")
	}

	if bodyTmplStr == "" {
		// Fallback: use the hardcoded default template
		return renderDefaultEmailTemplate(data)
	}

	tmpl, err := template.New("body").Funcs(templateFuncMap).Parse(bodyTmplStr)
	if err != nil {
		log.Printf("notifications: invalid body template, falling back to default: %v", err)
		return renderDefaultEmailTemplate(data)
	}

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		log.Printf("notifications: body template execution failed, falling back to default: %v", err)
		return renderDefaultEmailTemplate(data)
	}

	return buf.String(), nil
}

// smtpSender sends email via SMTP.
type smtpSender struct {
	config EmailConfig
}

func (s *smtpSender) send(from, to, subject, htmlBody string) error {
	addr := s.config.SMTPHost + ":" + s.config.SMTPPort

	msg := "From: " + from + "\r\n" +
		"To: " + to + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/html; charset=\"UTF-8\"\r\n" +
		"\r\n" + htmlBody

	var auth smtp.Auth
	if s.config.SMTPUser != "" {
		auth = smtp.PlainAuth("", s.config.SMTPUser, s.config.SMTPPass, s.config.SMTPHost)
	}

	return smtp.SendMail(addr, auth, s.config.FromAddress, []string{to}, []byte(msg))
}

// sendGridSender sends email via the SendGrid v3 API.
type sendGridSender struct {
	config EmailConfig
	client *http.Client
}

func (s *sendGridSender) send(from, to, subject, htmlBody string) error {
	if s.client == nil {
		s.client = &http.Client{}
	}

	payload := map[string]interface{}{
		"personalizations": []map[string]interface{}{
			{"to": []map[string]string{{"email": to}}},
		},
		"from":    map[string]string{"email": s.config.FromAddress, "name": s.config.FromName},
		"subject": subject,
		"content": []map[string]string{
			{"type": "text/html", "value": htmlBody},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", "https://api.sendgrid.com/v3/mail/send", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.config.SendGridKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("sendgrid request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("sendgrid returned status %d", resp.StatusCode)
	}
	return nil
}

// defaultEmailTmpl is the fallback template used when no custom template is configured.
var defaultEmailTmpl = template.Must(template.New("email").Parse(`<!DOCTYPE html>
<html>
<head><style>
body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
.card { background: #fff; border-radius: 8px; padding: 24px; max-width: 600px; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.severity-info { border-left: 4px solid #3b82f6; }
.severity-warning { border-left: 4px solid #f59e0b; }
.severity-critical { border-left: 4px solid #ef4444; }
.title { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.body { color: #555; line-height: 1.6; }
.meta { color: #999; font-size: 12px; margin-top: 16px; }
</style></head>
<body>
<div class="card severity-{{.Severity}}">
  <div class="title">{{.Title}}</div>
  <div class="body">{{.Body}}</div>
  <div class="meta">Category: {{.Category}} | {{.Timestamp}}</div>
</div>
</body>
</html>`))

func renderDefaultEmailTemplate(data TemplateData) (string, error) {
	var buf bytes.Buffer
	if err := defaultEmailTmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}
