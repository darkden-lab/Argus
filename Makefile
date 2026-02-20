.PHONY: dev build test test-backend test-frontend docker-up docker-down proto

dev:
	docker compose up

build:
	docker compose build

test-backend:
	cd backend && go test ./...

test-frontend:
	cd frontend && npm test

test: test-backend test-frontend

docker-up:
	docker compose up -d

docker-down:
	docker compose down

proto:
	@echo "Generating Go code from proto files..."
	protoc \
		--proto_path=proto \
		--go_out=backend --go_opt=module=github.com/k8s-dashboard/backend \
		--go-grpc_out=backend --go-grpc_opt=module=github.com/k8s-dashboard/backend \
		proto/agent/v1/agent.proto
	@echo "Proto generation complete: backend/pkg/agentpb/"
