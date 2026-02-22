package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/darkden-lab/argus/agent/internal"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("K8s Dashboard Agent starting...")

	cfg, err := internal.LoadConfig()
	if err != nil {
		log.Fatalf("Configuration error: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown signals.
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		sig := <-sigCh
		log.Printf("Received signal %s, shutting down...", sig)
		cancel()
	}()

	// Start health server for Kubernetes probes.
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("ok")) //nolint:errcheck
		})
		log.Println("Health server listening on :8443")
		if err := http.ListenAndServe(":8443", mux); err != nil {
			log.Printf("Health server error: %v", err)
		}
	}()

	// Create the K8s proxy that handles requests from the dashboard.
	proxy := internal.NewProxy()

	// Create and run the connector.
	connector := internal.NewConnector(cfg, proxy.HandleRequest)

	log.Printf("Connecting to dashboard at %s...", cfg.DashboardURL)
	if err := connector.Run(ctx); err != nil && ctx.Err() == nil {
		log.Fatalf("Agent failed: %v", err)
	}

	log.Println("Agent stopped")
}
