.PHONY: dev build test test-backend test-frontend lint lint-backend lint-frontend \
       coverage coverage-backend coverage-frontend clean \
       docker-up docker-down proto \
       migrate-up migrate-down helm-lint e2e-smoke

# ---------------------------------------------------------------------------
# Docker Compose
# ---------------------------------------------------------------------------
dev:
	docker compose up

build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

# ---------------------------------------------------------------------------
# Testing
# ---------------------------------------------------------------------------
test-backend:
	cd backend && go test ./...

test-frontend:
	cd frontend && npm test

test: test-backend test-frontend

# ---------------------------------------------------------------------------
# Linting
# ---------------------------------------------------------------------------
lint-backend:
	cd backend && go vet ./...

lint-frontend:
	cd frontend && npm run lint

lint: lint-backend lint-frontend

# ---------------------------------------------------------------------------
# Coverage
# ---------------------------------------------------------------------------
coverage-backend:
	cd backend && go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out

coverage-frontend:
	cd frontend && npm run test:coverage

coverage: coverage-backend coverage-frontend

# ---------------------------------------------------------------------------
# Clean
# ---------------------------------------------------------------------------
clean:
	rm -f backend/coverage.out
	rm -rf frontend/coverage
	rm -rf frontend/.next
	rm -rf frontend/node_modules/.cache

# ---------------------------------------------------------------------------
# Database migrations (requires golang-migrate CLI)
# ---------------------------------------------------------------------------
DATABASE_URL ?= postgres://dashboard:devpassword@localhost:5432/argus?sslmode=disable

migrate-up:
	migrate -database "$(DATABASE_URL)" -path backend/migrations up

migrate-down:
	migrate -database "$(DATABASE_URL)" -path backend/migrations down 1

# ---------------------------------------------------------------------------
# Helm
# ---------------------------------------------------------------------------
helm-lint:
	helm lint deploy/helm/argus
	helm lint deploy/helm/argus-agent

# ---------------------------------------------------------------------------
# E2E Smoke Test
# ---------------------------------------------------------------------------
e2e-smoke:
	bash scripts/e2e-smoke.sh

# ---------------------------------------------------------------------------
# Protobuf
# ---------------------------------------------------------------------------
proto:
	@echo "Generating Go code from proto files..."
	protoc \
		--proto_path=proto \
		--go_out=backend --go_opt=module=github.com/darkden-lab/argus/backend \
		--go-grpc_out=backend --go-grpc_opt=module=github.com/darkden-lab/argus/backend \
		proto/agent/v1/agent.proto
	@echo "Proto generation complete: backend/pkg/agentpb/"
