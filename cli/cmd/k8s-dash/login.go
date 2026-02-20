package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/pkg/browser"
	"github.com/spf13/cobra"
)

func newLoginCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "login",
		Short: "Authenticate with the K8s Dashboard and configure kubeconfig",
		Long: `Opens a browser for dashboard login. After authentication, generates
kubeconfig entries for each accessible cluster.`,
		RunE: runLogin,
	}
}

type loginCallback struct {
	Token    string `json:"token"`
	Email    string `json:"email"`
}

type clusterInfo struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	APIServerURL string `json:"api_server_url"`
}

func runLogin(cmd *cobra.Command, args []string) error {
	srv := getServer()
	if srv == "" {
		return fmt.Errorf("--server is required or set K8S_DASH_SERVER environment variable")
	}

	fmt.Printf("Authenticating with %s...\n", srv)

	// Start local callback server
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return fmt.Errorf("failed to start callback server: %w", err)
	}
	defer listener.Close()

	port := listener.Addr().(*net.TCPAddr).Port
	callbackURL := fmt.Sprintf("http://127.0.0.1:%d/callback", port)

	tokenCh := make(chan loginCallback, 1)
	errCh := make(chan error, 1)

	mux := http.NewServeMux()
	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		email := r.URL.Query().Get("email")
		if token == "" {
			errCh <- fmt.Errorf("no token received in callback")
			http.Error(w, "No token received", http.StatusBadRequest)
			return
		}

		tokenCh <- loginCallback{Token: token, Email: email}
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, "<html><body><h1>Login successful!</h1><p>You can close this window.</p></body></html>")
	})

	go func() {
		if err := http.Serve(listener, mux); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	// Open browser
	loginURL := fmt.Sprintf("%s/api/auth/cli-login?callback=%s", srv, callbackURL)
	if err := browser.OpenURL(loginURL); err != nil {
		fmt.Printf("Open this URL in your browser:\n  %s\n\n", loginURL)
	} else {
		fmt.Println("Browser opened for login. Waiting for authentication...")
	}

	// Wait for callback
	select {
	case cb := <-tokenCh:
		fmt.Printf("Authenticated as %s\n", cb.Email)

		// Save config
		cfg := cliConfig{
			Server: srv,
			Token:  cb.Token,
			Email:  cb.Email,
		}
		if err := saveConfig(cfg); err != nil {
			return fmt.Errorf("failed to save config: %w", err)
		}

		// Fetch clusters and generate kubeconfig
		clusters, err := fetchClusters(srv, cb.Token)
		if err != nil {
			fmt.Printf("Warning: could not fetch clusters: %v\n", err)
			fmt.Println("Login saved. Run 'k8s-dash contexts' later to see available clusters.")
			return nil
		}

		fmt.Printf("\nAvailable clusters (%d):\n", len(clusters))
		for _, c := range clusters {
			fmt.Printf("  - %s (%s)\n", c.Name, c.ID)
		}

		fmt.Println("\nLogin successful! Use 'k8s-dash contexts' to see clusters.")
		return nil

	case err := <-errCh:
		return fmt.Errorf("callback error: %w", err)

	case <-time.After(5 * time.Minute):
		return fmt.Errorf("login timed out after 5 minutes")
	}
}

func fetchClusters(serverURL, token string) ([]clusterInfo, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("GET", serverURL+"/api/clusters", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	var clusters []clusterInfo
	if err := json.NewDecoder(resp.Body).Decode(&clusters); err != nil {
		return nil, err
	}
	return clusters, nil
}

// Config management
type cliConfig struct {
	Server string `json:"server"`
	Token  string `json:"token"`
	Email  string `json:"email"`
}

func configDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".k8s-dash")
}

func configPath() string {
	return filepath.Join(configDir(), "config.json")
}

func saveConfig(cfg cliConfig) error {
	dir := configDir()
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), data, 0600)
}

func loadConfig() (*cliConfig, error) {
	data, err := os.ReadFile(configPath())
	if err != nil {
		return nil, fmt.Errorf("not logged in (run 'k8s-dash login' first)")
	}
	var cfg cliConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func getServer() string {
	if server != "" {
		return server
	}
	if s := os.Getenv("K8S_DASH_SERVER"); s != "" {
		return s
	}
	cfg, err := loadConfig()
	if err == nil && cfg.Server != "" {
		return cfg.Server
	}
	return ""
}
