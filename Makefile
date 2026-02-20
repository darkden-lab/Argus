.PHONY: dev build test test-backend test-frontend docker-up docker-down

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
