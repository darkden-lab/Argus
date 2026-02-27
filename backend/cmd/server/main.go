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
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/darkden-lab/argus/backend/docs"
	"github.com/darkden-lab/argus/backend/pkg/agentpb"
	"github.com/darkden-lab/argus/backend/internal/ai"
	"github.com/darkden-lab/argus/backend/internal/ai/providers"
	"github.com/darkden-lab/argus/backend/internal/ai/rag"
	"github.com/darkden-lab/argus/backend/internal/audit"
	"github.com/darkden-lab/argus/backend/internal/auth"
	"github.com/darkden-lab/argus/backend/internal/cluster"
	"github.com/darkden-lab/argus/backend/internal/config"
	"github.com/darkden-lab/argus/backend/internal/core"
	"github.com/darkden-lab/argus/backend/internal/db"
	mw "github.com/darkden-lab/argus/backend/internal/middleware"
	"github.com/darkden-lab/argus/backend/internal/notifications"
	"github.com/darkden-lab/argus/backend/internal/plugin"
	"github.com/darkden-lab/argus/backend/internal/proxy"
	"github.com/darkden-lab/argus/backend/internal/rbac"
	"github.com/darkden-lab/argus/backend/internal/settings"
	"github.com/darkden-lab/argus/backend/internal/setup"
	"github.com/darkden-lab/argus/backend/internal/terminal"
	"github.com/darkden-lab/argus/backend/internal/ws"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	pluginCalico "github.com/darkden-lab/argus/backend/plugins/calico"
	pluginCeph "github.com/darkden-lab/argus/backend/plugins/ceph"
	pluginCnpg "github.com/darkden-lab/argus/backend/plugins/cnpg"
	pluginHelm "github.com/darkden-lab/argus/backend/plugins/helm"
	pluginIstio "github.com/darkden-lab/argus/backend/plugins/istio"
	pluginKeda "github.com/darkden-lab/argus/backend/plugins/keda"
	pluginMariadb "github.com/darkden-lab/argus/backend/plugins/mariadb"
	pluginPrometheus "github.com/darkden-lab/argus/backend/plugins/prometheus"
)

func main() {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		log.Fatalf("Config validation failed: %v", err)
	}

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
	rbacHandlers := rbac.NewHandlers(rbacEngine)

	// JWT & Auth
	jwtService := auth.NewJWTService(cfg.JWTSecret)
	authService := auth.NewAuthService(database, jwtService)
	authHandlers := auth.NewHandlers(authService)

	// Setup wizard
	setupService := setup.NewService(pool)
	setupHandlers := setup.NewHandlers(setupService, authService, jwtService, pool)

	// OIDC (optional)
	oidcService, err := auth.NewOIDCService(ctx, auth.OIDCConfig{
		Issuer:       cfg.OIDCIssuer,
		ClientID:     cfg.OIDCClientID,
		ClientSecret: cfg.OIDCClientSecret,
		RedirectURL:  cfg.OIDCRedirectURL,
		FrontendURL:  cfg.FrontendURL,
	}, database, jwtService, pool)
	if err != nil {
		log.Printf("WARNING: OIDC setup failed: %v (OIDC disabled)", err)
	}

	// RBAC Guards for endpoint protection
	settingsWriteGuard := rbac.RBACMiddleware(rbacEngine, "settings", "write")
	clustersWriteGuard := rbac.RBACMiddleware(rbacEngine, "clusters", "write")
	pluginsWriteGuard := rbac.RBACMiddleware(rbacEngine, "plugins", "write")
	notificationsWriteGuard := rbac.RBACMiddleware(rbacEngine, "notifications", "write")
	aiWriteGuard := rbac.RBACMiddleware(rbacEngine, "ai", "write")
	auditReadGuard := rbac.RBACMiddleware(rbacEngine, "audit", "read")

	// Audit Log
	auditStore := audit.NewStore(pool)
	auditHandlers := audit.NewHandlers(auditStore, auditReadGuard)

	// Plugin Engine
	pluginEngine := plugin.NewEngine(pool)
	registerPlugins(pluginEngine)
	if err := pluginEngine.RestoreEnabled(ctx); err != nil {
		log.Printf("WARNING: failed to restore plugin state: %v", err)
	}

	// WebSocket Hub
	hub := ws.NewHub()
	go hub.Run()
	wsHandler := ws.NewWSHandler(hub, jwtService)

	// Notifications System
	broker, err := notifications.NewBroker(cfg)
	if err != nil {
		log.Printf("WARNING: notification broker setup failed: %v", err)
	}
	var notifHandlers *notifications.Handlers
	if broker != nil {
		defer broker.Close() //nolint:errcheck // best-effort cleanup on shutdown

		notifStore := notifications.NewNotificationStore(pool)
		prefStore := notifications.NewPreferencesStore(pool)
		chanStore := notifications.NewChannelStore(pool)
		notifRouter := notifications.NewRouter(notifStore, prefStore, chanStore)

		// EventProducer: hooks into K8s watch events and publishes to broker
		producer := notifications.NewEventProducer(broker)
		producer.HookIntoHub(hub)

		// Consumer: subscribes to all topics and routes to channels
		consumer := notifications.NewConsumer(broker, notifRouter)
		if err := consumer.Start(); err != nil {
			log.Printf("WARNING: notification consumer failed to start: %v", err)
		}

		// Digest aggregator
		digest := notifications.NewDigestAggregator(prefStore, chanStore, notifStore, notifRouter.GetChannels())
		digest.Start()

		notifHandlers = notifications.NewHandlers(notifStore, prefStore, chanStore, notifRouter, cfg.EncryptionKey, notificationsWriteGuard)
		log.Println("Notifications system initialized")
	}

	// Router
	r := mux.NewRouter()

	// Rate limiting: 100 req/s per IP with burst of 200
	r.Use(mw.RateLimitMiddleware(100, 200))

	// Health check (no auth)
	r.HandleFunc("/healthz", healthzHandler).Methods("GET")

	// API documentation (no auth)
	docs.RegisterRoutes(r)

	// Agent install script (no auth - must be curl-able)
	agentRegistry := cluster.NewAgentRegistry(pool)
	agentHandlers := cluster.NewAgentHandlers(clusterMgr, agentRegistry)
	agentHandlers.RegisterPublicRoutes(r)

	// Setup wizard routes (public, no auth required)
	setupHandlers.RegisterRoutes(r)

	// Settings public routes (OIDC provider presets, no auth required)
	settingsHandlers := settings.NewHandlers(pool, cfg, settingsWriteGuard, oidcService)
	settingsHandlers.RegisterPublicRoutes(r)

	// Auth routes with strict rate limiting (10 req/s, burst 20 per IP)
	authSubrouter := r.PathPrefix("").Subrouter()
	authSubrouter.Use(mw.StrictRateLimitMiddleware(10, 20))
	authHandlers.RegisterRoutes(authSubrouter)
	if oidcService != nil && oidcService.Enabled() {
		oidcService.RegisterRoutes(authSubrouter)
		log.Println("OIDC authentication enabled")
	}

	// Protected routes
	protected := r.PathPrefix("").Subrouter()
	protected.Use(mw.AuthMiddleware(jwtService))
	// Guard: block all protected routes if initial setup is pending
	protected.Use(setup.GuardMiddleware(setupService))
	if pool != nil {
		protected.Use(audit.Middleware(auditStore))
	}

	// Auth protected routes (/api/auth/me, /api/auth/permissions)
	authHandlers.RegisterProtectedRoutes(protected)
	rbacHandlers.RegisterRoutes(protected)

	// Role management routes
	roleHandlers := rbac.NewRoleHandlers(pool, rbacEngine)
	roleHandlers.RegisterRoutes(protected)

	// User management routes
	userMgmtHandlers := auth.NewUserManagementHandlers(authService, pool)
	userMgmtHandlers.RegisterRoutes(protected)

	// OIDC group -> role mapping routes (write endpoints require settings:write RBAC)
	oidcMappingHandlers := auth.NewOIDCMappingHandlers(pool, rbac.RBACMiddleware(rbacEngine, "settings", "write"))
	oidcMappingHandlers.RegisterRoutes(protected)

	// Cluster routes
	clusterHandlers := cluster.NewHandlers(clusterMgr, clustersWriteGuard)
	clusterHandlers.RegisterRoutes(protected)

	// Agent token management routes (protected)
	agentHandlers.RegisterRoutes(protected)

	// Core resource routes
	resourceHandler := core.NewResourceHandler(clusterMgr)
	resourceHandler.RegisterRoutes(protected)

	// Convenience routes (namespaces, nodes, events)
	convenienceHandlers := core.NewConvenienceHandlers(clusterMgr)
	convenienceHandlers.RegisterRoutes(protected)

	// Pod logs endpoint (auth handled internally to support EventSource SSE)
	logsHandler := core.NewLogsHandler(clusterMgr, jwtService)
	logsHandler.RegisterRoutes(r)

	// Network Policy simulator
	netpolSimHandler := core.NewNetPolSimulatorHandler(clusterMgr)
	netpolSimHandler.RegisterRoutes(protected)

	// Audit log routes
	auditHandlers.RegisterRoutes(protected)

	// Settings routes (protected)
	settingsHandlers.RegisterRoutes(protected)

	// Notification routes
	if notifHandlers != nil {
		notifHandlers.RegisterRoutes(protected)
	}

	// Notifications WebSocket (auth handled inside handler)
	notifWSHandler := notifications.NewWSHandler(jwtService)
	notifWSHandler.RegisterRoutes(r)

	// Plugin management routes
	pluginHandlers := plugin.NewHandlers(pluginEngine, pluginsWriteGuard)
	pluginHandlers.RegisterRoutes(protected)

	// Plugin-registered routes (with gate middleware to block disabled plugins)
	pluginRouter := protected.PathPrefix("").Subrouter()
	pluginRouter.Use(pluginEngine.PluginGateMiddleware())
	pluginEngine.SetDependencies(hub, clusterMgr, pluginRouter)
	pluginEngine.RegisterAllRoutes(pluginRouter, clusterMgr)
	pluginEngine.RegisterAllWatchers(hub, clusterMgr)

	// K8s Reverse Proxy (protected)
	k8sProxy := proxy.NewK8sProxy(clusterMgr, rbacEngine)
	k8sProxy.RegisterRoutes(protected)

	// WebSocket
	wsHandler.RegisterRoutes(r)

	// Terminal WebSocket (auth handled inside handler)
	terminalHandler := terminal.NewHandler(jwtService, clusterMgr)
	terminalHandler.RegisterRoutes(r)

	// AI Chat system
	aiCfg := ai.LoadConfigFromEnv()

	// Provider factory: creates an LLMProvider from config (reused for hot-reload)
	aiProviderFactory := func(cfg ai.AIConfig) ai.LLMProvider {
		switch cfg.Provider {
		case ai.ProviderClaude:
			return providers.NewClaude(cfg.APIKey, cfg.Model)
		case ai.ProviderOpenAI:
			return providers.NewOpenAI(cfg.APIKey, cfg.Model, cfg.BaseURL)
		case ai.ProviderOllama:
			return providers.NewOllama(cfg.BaseURL, cfg.Model)
		default:
			return providers.NewClaude(cfg.APIKey, cfg.Model)
		}
	}

	aiProvider := aiProviderFactory(aiCfg)

	// Create Service first so the embedder can track its active provider.
	aiService := ai.NewService(aiProvider, nil, clusterMgr, pool, aiCfg)

	var aiIndexer *rag.Indexer
	if pool != nil {
		ragStore := rag.NewStore(pool)
		embedder := ai.NewProviderEmbedder(aiService)
		aiRetriever := rag.NewRetriever(ragStore, embedder, 5)
		aiService.SetRetriever(aiRetriever)
		aiIndexer = rag.NewIndexer(ragStore, embedder, clusterMgr)
		aiIndexer.Start(ctx)
		defer aiIndexer.Stop()
	}
	aiChatHandler := ai.NewChatHandler(aiService, jwtService, aiCfg)
	aiChatHandler.RegisterRoutes(r)

	aiAdminHandlers := ai.NewAdminHandlers(pool, aiIndexer, aiCfg, aiWriteGuard, aiService, aiProviderFactory)
	aiAdminHandlers.RegisterRoutes(protected)

	log.Printf("AI system initialized (provider=%s, enabled=%v)", aiCfg.Provider, aiCfg.Enabled)

	// Start health check ticker
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			clusterMgr.HealthCheck(ctx)
		}
	}()

	// HTTP Server — security headers wrap CORS which wraps the router,
	// so all responses include security headers and OPTIONS preflight
	// requests are handled before mux routing (which would 404 on OPTIONS).
	srv := &http.Server{
		Addr:           ":" + cfg.Port,
		Handler:        securityHeadersMiddleware(corsMiddleware(r)),
		ReadTimeout:    15 * time.Second,
		WriteTimeout:   15 * time.Second,
		IdleTimeout:    60 * time.Second,
		MaxHeaderBytes: 1 << 20, // 1 MB
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

func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; frame-ancestors 'none'")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "http://localhost:3000"
	}

	origins := make(map[string]bool)
	for _, o := range strings.Split(allowedOrigins, ",") {
		origins[strings.TrimSpace(o)] = true
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}

		if origins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else if len(origins) == 1 {
			// Single origin mode: always set it (for dev convenience)
			for o := range origins {
				w.Header().Set("Access-Control-Allow-Origin", o)
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

