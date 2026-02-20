package terminal

import (
	"testing"
	"time"
)

func TestParse_GetPods(t *testing.T) {
	p := &SmartParser{}
	cmd, err := p.Parse("get pods")
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Verb != "get" {
		t.Errorf("expected verb 'get', got %q", cmd.Verb)
	}
	if cmd.Resource != "pods" {
		t.Errorf("expected resource 'pods', got %q", cmd.Resource)
	}
}

func TestParse_WithNamespace(t *testing.T) {
	p := &SmartParser{}
	cmd, err := p.Parse("get pods -n kube-system")
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Namespace != "kube-system" {
		t.Errorf("expected namespace 'kube-system', got %q", cmd.Namespace)
	}
}

func TestParse_WithOutput(t *testing.T) {
	p := &SmartParser{}
	cmd, err := p.Parse("get deploy nginx -o json")
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Output != "json" {
		t.Errorf("expected output 'json', got %q", cmd.Output)
	}
	if cmd.Resource != "deploy" {
		t.Errorf("expected resource 'deploy', got %q", cmd.Resource)
	}
	if cmd.Name != "nginx" {
		t.Errorf("expected name 'nginx', got %q", cmd.Name)
	}
}

func TestParse_AllNamespaces(t *testing.T) {
	p := &SmartParser{}
	cmd, err := p.Parse("get pods -A")
	if err != nil {
		t.Fatal(err)
	}
	if !cmd.AllNS {
		t.Error("expected AllNS to be true")
	}
}

func TestParse_ResourceSlashName(t *testing.T) {
	p := &SmartParser{}
	cmd, err := p.Parse("describe pod/nginx-abc123")
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Resource != "pod" {
		t.Errorf("expected resource 'pod', got %q", cmd.Resource)
	}
	if cmd.Name != "nginx-abc123" {
		t.Errorf("expected name 'nginx-abc123', got %q", cmd.Name)
	}
}

func TestParse_StripKubectl(t *testing.T) {
	p := &SmartParser{}
	cmd, err := p.Parse("kubectl get pods")
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Verb != "get" {
		t.Errorf("expected verb 'get', got %q", cmd.Verb)
	}
}

func TestParse_WithLabels(t *testing.T) {
	p := &SmartParser{}
	cmd, err := p.Parse("get pods -l app=nginx")
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Labels != "app=nginx" {
		t.Errorf("expected labels 'app=nginx', got %q", cmd.Labels)
	}
}

func TestParse_EmptyCommand(t *testing.T) {
	p := &SmartParser{}
	_, err := p.Parse("")
	if err == nil {
		t.Error("expected error for empty command")
	}
}

func TestFormatAge(t *testing.T) {
	tests := []struct {
		seconds  int
		expected string
	}{
		{30, "30s"},
		{90, "1m"},
		{3600, "1h"},
		{86400, "1d"},
		{172800, "2d"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			got := formatAge(time.Duration(tt.seconds) * time.Second)
			if got != tt.expected {
				t.Errorf("formatAge(%ds) = %q, want %q", tt.seconds, got, tt.expected)
			}
		})
	}
}
