package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/k8s-dashboard/backend/docs"
	"github.com/k8s-dashboard/backend/internal/agentpb"
	"github.com/k8s-dashboard/backend/internal/audit"
	"github.com/k8s-dashboard/backend/internal/auth"
	"github.com/k8s-dashboard/backend/internal/cluster"
	"github.com/k8s-dashboard/backend/internal/config"
	"github.com/k8s-dashboard/backend/internal/core"
	"github.com/k8s-dashboard/backend/internal/db"
	mw "github.com/k8s-dashboard/backend/internal/middleware"
	"github.com/k8s-dashboard/backend/internal/plugin"
	"github.com/k8s-dashboard/backend/internal/proxy"
	"github.com/k8s-dashboard/backend/internal/rbac"
	"github.com/k8s-dashboard/backend/internal/terminal"
	"github.com/k8s-dashboard/backend/internal/ws"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	pluginCalico "github.com/k8s-dashboard/backend/plugins/calico"
	pluginCeph "github.com/k8s-dashboard/backend/plugins/ceph"
	pluginCnpg "github.com/k8s-dashboard/backend/plugins/cnpg"
	pluginHelm "github.com/k8s-dashboard/backend/plugins/helm"
	pluginIstio "github.com/k8s-dashboard/backend/plugins/istio"
	pluginKeda "github.com/k8s-dashboard/backend/plugins/keda"
	pluginMariadb "github.com/k8s-dashboard/backend/plugins/mariadb"
	pluginPrometheus "github.com/k8s-dashboard/backend/plugins/prometheus"
)

func main() {
	cfg := config.Load()

	// Database
	ctx := context.Background()
	database, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Printf("WARNING: database connection failed: %v (continuing without DB)", err)
	} else {
		defer database.Close()
		if err := db.RunMigrations(cfg.DatabaseURL, cfg.MigrationsPath); err != nil {
			log.Printf("WARNING: migrations failed: %v", err)
		}
	}

	// Cluster Manager
	var pool *pgxpool.Pool
	if database != nil {
		pool = database.Pool
	}
	clusterMgr := cluster.NewManager(pool, cfg.EncryptionKey)
	if pool != nil {
		if err := clusterMgr.LoadExisting(ctx); err != nil {
			log.Printf("WARNING: failed to load existing clusters: %v", err)
		}
	}

	// gRPC Agent Server
	agentStore := cluster.NewStore(pool)
	agentServer := cluster.NewAgentServer(pool, agentStore, cfg.JWTSecret)
	clusterMgr.SetAgentServer(agentServer)
	go startGRPCServer(cfg, agentServer)

	// RBAC Engine
	rbacEngine := rbac.NewEngine(pool)

	// JWT & Auth
	jwtService := auth.NewJWTService(cfg.JWTSecret)
	authService := auth.NewAuthService(database, jwtService)
	authHandlers := auth.NewHandlers(authService)

	// OIDC (optional)
	oidcService, err := auth.NewOIDCService(ctx, auth.OIDCConfig{
		Issuer:       cfg.OIDCIssuer,
		ClientID:     cfg.OIDCClientID,
		ClientSecret: cfg.OIDCClientSecret,
		RedirectURL:  cfg.OIDCRedirectURL,
	}, database, jwtService)
	if err != nil {
		log.Printf("WARNING: OIDC setup failed: %v (OIDC disabled)", err)
	}

	// Audit Log
	auditStore := audit.NewStore(pool)
	auditHandlers := audit.NewHandlers(auditStore)

	// Plugin Engine
	pluginEngine := plugin.NewEngine(pool)
	registerPlugins(pluginEngine)

	// WebSocket Hub
	hub := ws.NewHub()
	go hub.Run()
	wsHandler := ws.NewWSHandler(hub, jwtService)

	// Router
	r := mux.NewRouter()

	// CORS middleware
	r.Use(corsMiddleware)

	// Health check (no auth)
	r.HandleFunc("/healthz", healthzHandler).Methods("GET")

	// API documentation (no auth)
	docs.RegisterRoutes(r)

	// Agent install script (no auth - must be curl-able)
	agentRegistry := cluster.NewAgentRegistry(pool)
	agentHandlers := cluster.NewAgentHandlers(clusterMgr, agentRegistry)
	agentHandlers.RegisterPublicRoutes(r)

	// Auth routes (no auth middleware)
	authHandlers.RegisterRoutes(r)
	if oidcService != nil && oidcService.Enabled() {
		oidcService.RegisterRoutes(r)
		log.Println("OIDC authentication enabled")
	}

	// Protected routes
	protected := r.PathPrefix("").Subrouter()
	protected.Use(mw.AuthMiddleware(jwtService))
	if pool != nil {
		protected.Use(audit.Middleware(auditStore))
	}

	// Cluster routes
	clusterHandlers := cluster.NewHandlers(clusterMgr)
	clusterHandlers.RegisterRoutes(protected)

	// Agent token management routes (protected)
	agentHandlers.RegisterRoutes(protected)

	// Core resource routes
	resourceHandler := core.NewResourceHandler(clusterMgr)
	resourceHandler.RegisterRoutes(protected)

	// Convenience routes (namespaces, nodes, events)
	convenienceHandlers := core.NewConvenienceHandlers(clusterMgr)
	convenienceHandlers.RegisterRoutes(protected)

	// Audit log routes
	auditHandlers.RegisterRoutes(protected)

	// Plugin management routes
	pluginHandlers := plugin.NewHandlers(pluginEngine)
	pluginHandlers.RegisterRoutes(protected)

	// Plugin-registered routes
	pluginEngine.RegisterAllRoutes(protected, clusterMgr)
	pluginEngine.RegisterAllWatchers(hub, clusterMgr)

	// K8s Reverse Proxy (protected)
	k8sProxy := proxy.NewK8sProxy(clusterMgr)
	k8sProxy.RegisterRoutes(protected)

	// WebSocket
	wsHandler.RegisterRoutes(r)

	// Terminal WebSocket (auth handled inside handler)
	terminalHandler := terminal.NewHandler(jwtService, clusterMgr)
	terminalHandler.RegisterRoutes(r)

	// Start health check ticker
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			clusterMgr.HealthCheck(ctx)
		}
	}()

	// HTTP Server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		log.Println("Shutting down server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Fatalf("Server shutdown failed: %v", err)
		}
	}()

	log.Printf("Starting server on :%s", cfg.Port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed to start: %v", err)
	}

	log.Println("Server stopped")

	_ = rbacEngine // available for route-level RBAC when needed
}

func registerPlugins(engine *plugin.Engine) {
	// Simple constructors (no error)
	if err := engine.Register(pluginPrometheus.New()); err != nil {
		log.Printf("WARNING: failed to register prometheus plugin: %v", err)
	}
	if err := engine.Register(pluginCalico.New()); err != nil {
		log.Printf("WARNING: failed to register calico plugin: %v", err)
	}
	if err := engine.Register(pluginHelm.New()); err != nil {
		log.Printf("WARNING: failed to register helm plugin: %v", err)
	}

	// Constructors that return (plugin, error)
	registerPluginWithError(engine, "istio", pluginIstio.New)
	registerPluginWithError(engine, "cnpg", pluginCnpg.New)
	registerPluginWithError(engine, "mariadb", pluginMariadb.New)
	registerPluginWithError(engine, "keda", pluginKeda.New)
	registerPluginWithError(engine, "ceph", pluginCeph.New)
}

func registerPluginWithError[T plugin.Plugin](engine *plugin.Engine, name string, newFn func() (T, error)) {
	p, err := newFn()
	if err != nil {
		log.Printf("WARNING: failed to create %s plugin: %v", name, err)
		return
	}
	if err := engine.Register(p); err != nil {
		log.Printf("WARNING: failed to register %s plugin: %v", name, err)
	}
}

func healthzHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func startGRPCServer(cfg *config.Config, agentSrv *cluster.AgentServer) {
	var opts []grpc.ServerOption

	if cfg.GRPCTLSCert != "" && cfg.GRPCTLSKey != "" {
		cert, err := tls.LoadX509KeyPair(cfg.GRPCTLSCert, cfg.GRPCTLSKey)
		if err != nil {
			log.Printf("WARNING: failed to load gRPC TLS cert: %v (running insecure)", err)
		} else {
			opts = append(opts, grpc.Creds(credentials.NewTLS(&tls.Config{
				Certificates: []tls.Certificate{cert},
				MinVersion:   tls.VersionTLS12,
			})))
		}
	}

	grpcServer := grpc.NewServer(opts...)
	agentpb.RegisterClusterAgentServer(grpcServer, agentSrv)

	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Failed to listen on gRPC port %s: %v", cfg.GRPCPort, err)
	}

	log.Printf("gRPC agent server listening on :%s", cfg.GRPCPort)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("gRPC server failed: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

