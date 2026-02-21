.PHONY: dev build test test-backend test-frontend lint lint-backend lint-frontend \
       coverage coverage-backend coverage-frontend clean \
       docker-up docker-down docker-logs proto \
       migrate-up migrate-down helm-lint e2e-smoke \
       cli-build agent-build help

# ---------------------------------------------------------------------------
# Docker Compose
# ---------------------------------------------------------------------------
dev: ## Start full stack with Docker Compose (foreground)
	docker compose up

build: ## Build all Docker images
	docker compose build

docker-up: ## Start all services in background
	docker compose up -d

docker-down: ## Stop and remove all services
	docker compose down

docker-logs: ## Tail logs from all running services
	docker compose logs -f

# ---------------------------------------------------------------------------
# Testing
# ---------------------------------------------------------------------------
test-backend: ## Run all backend Go tests
	cd backend && go test ./...

test-frontend: ## Run all frontend Jest tests
	cd frontend && npm test

test: test-backend test-frontend ## Run all tests (backend + frontend)

# ---------------------------------------------------------------------------
# Linting
# ---------------------------------------------------------------------------
lint-backend: ## Run go vet on backend
	cd backend && go vet ./...

lint-frontend: ## Run ESLint on frontend
	cd frontend && npm run lint

lint: lint-backend lint-frontend ## Run all linters

# ---------------------------------------------------------------------------
# Coverage
# ---------------------------------------------------------------------------
coverage-backend: ## Generate backend test coverage report
	cd backend && go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out

coverage-frontend: ## Generate frontend test coverage report
	cd frontend && npm run test:coverage

coverage: coverage-backend coverage-frontend ## Generate all coverage reports

# ---------------------------------------------------------------------------
# Build (Go binaries)
# ---------------------------------------------------------------------------
cli-build: ## Build the argus CLI binary
	cd cli && go build -o ../bin/argus ./cmd/argus/

agent-build: ## Build the cluster agent binary
	cd agent && go build -o ../bin/argus-agent ./cmd/agent/

# ---------------------------------------------------------------------------
# Clean
# ---------------------------------------------------------------------------
clean: ## Remove build artifacts and caches
	rm -f backend/coverage.out
	rm -rf frontend/coverage
	rm -rf frontend/.next
	rm -rf frontend/node_modules/.cache
	rm -rf bin/

# ---------------------------------------------------------------------------
# Database migrations (requires golang-migrate CLI)
# ---------------------------------------------------------------------------
DATABASE_URL ?= postgres://dashboard:devpassword@localhost:5432/argus?sslmode=disable

migrate-up: ## Run all pending database migrations
	migrate -database "$(DATABASE_URL)" -path backend/migrations up

migrate-down: ## Rollback the last database migration
	migrate -database "$(DATABASE_URL)" -path backend/migrations down 1

# ---------------------------------------------------------------------------
# Helm
# ---------------------------------------------------------------------------
helm-lint: ## Lint all Helm charts
	helm lint deploy/helm/argus
	helm lint deploy/helm/argus-agent

# ---------------------------------------------------------------------------
# E2E Smoke Test
# ---------------------------------------------------------------------------
e2e-smoke: ## Run full Docker Compose E2E smoke test
	bash scripts/e2e-smoke.sh

# ---------------------------------------------------------------------------
# Protobuf
# ---------------------------------------------------------------------------
proto: ## Generate Go code from protobuf definitions
	@echo "Generating Go code from proto files..."
	protoc \
		--proto_path=proto \
		--go_out=backend --go_opt=module=github.com/darkden-lab/argus/backend \
		--go-grpc_out=backend --go-grpc_opt=module=github.com/darkden-lab/argus/backend \
		proto/agent/v1/agent.proto
	@echo "Proto generation complete: backend/pkg/agentpb/"

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
help: ## Show this help message
	@echo "Argus - Multi-cluster Kubernetes Dashboard"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
