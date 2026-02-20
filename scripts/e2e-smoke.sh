#!/usr/bin/env bash
set -euo pipefail

# Argus E2E Smoke Test
# Starts the Docker Compose stack and validates basic functionality.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BACKEND_URL="http://localhost:8080"
FRONTEND_URL="http://localhost:3000"
PASSED=0
FAILED=0

log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((PASSED++)); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; ((FAILED++)); }
log_info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

cleanup() {
    log_info "Tearing down stack..."
    cd "$PROJECT_DIR" && docker compose down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

# Start stack
log_info "Building and starting Docker Compose stack..."
cd "$PROJECT_DIR"
docker compose build --quiet 2>&1 || { log_fail "Docker build failed"; exit 1; }
docker compose up -d 2>&1

# Wait for services
log_info "Waiting for services to start (45s)..."
sleep 45

# Check container health
log_info "Checking container status..."
for svc in backend frontend postgres; do
    if docker compose ps "$svc" 2>/dev/null | grep -q "Up\|running"; then
        log_pass "Container '$svc' is running"
    else
        log_fail "Container '$svc' is NOT running"
        docker compose logs "$svc" --tail=20 2>&1
    fi
done

# Test backend health
log_info "Testing backend health..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/healthz" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    log_pass "Backend /healthz returns 200"
else
    log_fail "Backend /healthz returned $HTTP_CODE"
fi

# Test backend API endpoints
log_info "Testing backend API..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/auth/login" -X POST -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "000" ]; then
    log_pass "Backend /api/auth/login responds ($HTTP_CODE)"
else
    log_fail "Backend /api/auth/login unreachable"
fi

# Test frontend
log_info "Testing frontend..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL/" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "308" ]; then
    log_pass "Frontend responds ($HTTP_CODE)"
else
    log_fail "Frontend returned $HTTP_CODE"
fi

# Summary
echo ""
echo "================================="
echo -e "Results: ${GREEN}${PASSED} passed${NC}, ${RED}${FAILED} failed${NC}"
echo "================================="

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
