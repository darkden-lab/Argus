# Full Stack Perfection - Design Document

**Date**: 2026-02-21
**Approach**: Parallel by domain (Dark Den Team)
**Goal**: Make Argus production-perfect across all layers

## Context

Argus is a multi-cluster Kubernetes dashboard (Go backend + Next.js frontend + PostgreSQL). After thorough analysis:
- Frontend: 95% complete (24 pages, 47 components, 28 test suites)
- Backend: 80% complete (builds clean, but security gaps and low test coverage in key areas)
- Infrastructure: 85% complete (functional but missing production hardening)

## Streams of Work

### Stream 1: Backend Security & Completeness

**1.1 Refresh Token Revocation (CRITICAL)**
- Implement token revocation table in PostgreSQL
- Add migration for `revoked_tokens` table
- Modify auth service to check revocation on token validation
- Add logout endpoint that revokes refresh tokens
- File: `backend/internal/auth/service.go` (TODO at line 57)

**1.2 Plugin Watcher Stubs (MEDIUM)**
- Implement Prometheus watcher: watch ServiceMonitor, PrometheusRule CRDs
- Implement Calico watcher: watch NetworkPolicy, IPPool CRDs
- Files: `backend/plugins/prometheus/plugin.go`, `backend/plugins/calico/plugin.go`

**1.3 Backend Test Coverage (HIGH)**
- Write tests for all 8 plugin handlers (~2000 LOC untested)
- Increase AI/RAG coverage from 5-14% to >50%
- Increase core package coverage from 4% to >40%
- Increase audit package coverage from 16% to >50%
- Add settings package tests (currently 0%)

### Stream 2: Infrastructure Hardening

**2.1 Docker Compose Fixes**
- Add health check to frontend service
- Add restart policies (`unless-stopped`)
- Add resource limits (mem/cpu) for all services
- Fix ENCRYPTION_KEY length (32 -> 64 chars for AES-256)

**2.2 Dockerfile Fixes**
- Fix agent healthcheck: use grpc_health_probe or proper HTTP endpoint instead of wget on gRPC port

**2.3 Helm Chart Improvements**
- Add HorizontalPodAutoscaler templates for backend and frontend
- Add TLS certificate volume mounts for backend gRPC and agent
- Fix frontend liveness probe path (/ -> /login)
- Add PostgreSQL resource limits
- Add ServiceMonitor template for Prometheus integration

**2.4 CI/CD Improvements**
- Update Jenkinsfile Go version from 1.22 to 1.25
- Add Trivy security scanning step to GitHub Actions CI
- Add coverage threshold gates

**2.5 Makefile Enhancements**
- Add `make help` target
- Add `make cli-build` and `make agent-build` targets
- Add `make docker-logs` for debugging

### Stream 3: Frontend Polish

**3.1 Middleware Migration**
- Evaluate Next.js 16 proxy convention as replacement for deprecated middleware.ts
- If stable, migrate auth redirect logic; if not, document decision

### Stream 4: Quality Gates (ALL FOUR, always)

**4.1 Code Review** - Review all changes across streams
**4.2 QA/Testing** - Run all tests, write additional tests for new code
**4.3 Security Audit** - Verify refresh token fix, scan for new vulnerabilities
**4.4 Performance Check** - Verify no regressions, check new DB queries

### Stream 5: Validation

**5.1 Docker Build** - Build all 3 images successfully
**5.2 Docker Compose** - Full stack up with health checks passing
**5.3 Backend Tests** - `go test ./...` all pass
**5.4 Frontend Tests** - `npm test` all pass
**5.5 Lint** - `make lint` clean
**5.6 Local K8s Deploy** - Deploy via Helm to local cluster (if available)

## Success Criteria

- Zero security TODOs remaining
- All plugin watchers implemented (no stubs)
- Backend test coverage: >40% overall (up from ~30%)
- Docker Compose starts cleanly with all health checks green
- Helm charts include HPA and proper probes
- CI/CD includes security scanning
- All existing tests still pass
- No new linting errors
