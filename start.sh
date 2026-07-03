#!/usr/bin/env bash
# SDS 360 — Dev Startup Script
set -euo pipefail

# ── Colors ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

# ── Setup ──────────────────────────────────────────────────────────────────────
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"
cd "$ROOT"

log()  { echo -e "${BLUE}[sds360]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  !${NC} $*"; }
fail() { echo -e "${RED}  ✗${NC} $*"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }

# ── Graceful shutdown ──────────────────────────────────────────────────────────
PIDS=()
cleanup() {
  echo -e "\n${YELLOW}Stopping all services...${NC}"
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# ── Banner ─────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════╗"
echo "  ║   SDS 360 — Dev Server            ║"
echo "  ║   危险品安全数据管理与培训系统      ║"
echo "  ╚═══════════════════════════════════╝"
echo -e "${NC}"

# ── Step 1: Prerequisites ──────────────────────────────────────────────────────
step "Checking prerequisites"

command -v node >/dev/null 2>&1 || fail "Node.js not found. Install from https://nodejs.org"
command -v pnpm >/dev/null 2>&1 || fail "pnpm not found. Run: npm install -g pnpm"

NODE_VER=$(node -v)
PNPM_VER=$(pnpm -v)
ok "Node $NODE_VER"
ok "pnpm $PNPM_VER"

# ── Step 2: .env ───────────────────────────────────────────────────────────────
step "Environment"

if [ ! -f "$ROOT/.env" ]; then
  warn ".env not found — creating from .env.example"
  cp "$ROOT/.env.example" "$ROOT/.env"
  warn "Fill in real credentials for AI / S3 / email features."
else
  ok ".env present"
fi

# ── Step 3: MongoDB ────────────────────────────────────────────────────────────
step "MongoDB"

check_mongo() {
  if command -v mongosh >/dev/null 2>&1; then
    mongosh --eval "db.runCommand({ping:1})" --quiet 2>/dev/null | grep -q "ok: 1" && return 0
  fi
  # fallback: try nc on port 27017
  nc -z 127.0.0.1 27017 2>/dev/null && return 0
  return 1
}

if check_mongo; then
  ok "MongoDB running"
else
  warn "MongoDB not responding — attempting to start..."
  if command -v brew >/dev/null 2>&1; then
    # Try common Homebrew service names
    for svc in mongodb-community mongodb-community@7.0 mongodb-community@6.0; do
      brew services start "$svc" 2>/dev/null && break || true
    done
    sleep 3
    check_mongo && ok "MongoDB started" || fail "MongoDB failed to start. Start it manually and retry."
  else
    fail "MongoDB is not running. Start it and retry."
  fi
fi

# ── Step 4: Redis ──────────────────────────────────────────────────────────────
step "Redis"

check_redis() {
  redis-cli -p "${REDIS_PORT:-6379}" ping 2>/dev/null | grep -q "PONG" && return 0
  return 1
}

if check_redis; then
  ok "Redis running"
else
  warn "Redis not running — attempting to start..."
  if command -v brew >/dev/null 2>&1; then
    command -v redis-server >/dev/null 2>&1 || { log "Installing Redis via Homebrew..."; brew install redis; }
    brew services start redis
    sleep 2
    check_redis && ok "Redis started" || fail "Redis failed to start."
  else
    fail "Redis is not running. Start it and retry."
  fi
fi

# ── Step 5: Dependencies ───────────────────────────────────────────────────────
step "Installing dependencies"

# Use --no-frozen-lockfile in case lockfile is slightly out of sync
pnpm install --no-frozen-lockfile 2>&1 \
  | grep -E "^(Done|Packages|devDependencies|dependencies|Error)" \
  | head -10 \
  || true
ok "Dependencies ready"

# ── Step 6: Start services ─────────────────────────────────────────────────────
step "Starting services"

# Customer app — port 3000
pnpm --filter @sds360/app dev >"$LOG_DIR/app.log" 2>&1 &
PIDS+=($!)
log "  app     PID=$! → log: .logs/app.log"

# Super-admin portal — port 3001
pnpm --filter @sds360/admin dev >"$LOG_DIR/admin.log" 2>&1 &
PIDS+=($!)
log "  admin   PID=$! → log: .logs/admin.log"

# BullMQ workers
pnpm --filter @sds360/workers dev >"$LOG_DIR/workers.log" 2>&1 &
PIDS+=($!)
log "  workers PID=$! → log: .logs/workers.log"

# ── Step 7: Wait & health check ────────────────────────────────────────────────
step "Waiting for services to be ready (up to 30s)..."

wait_ready() {
  local log="$1" pattern="$2" label="$3" secs=0
  while [ $secs -lt 30 ]; do
    grep -q "$pattern" "$log" 2>/dev/null && { ok "$label ready"; return 0; }
    sleep 1; secs=$((secs + 1))
  done
  warn "$label did not report ready in 30s — check ${log##$ROOT/}"
  return 1
}

APP_OK=0; ADMIN_OK=0; WORKERS_OK=0

wait_ready "$LOG_DIR/app.log"     "Ready in"        "app (http://localhost:3000)" && APP_OK=1     || true
wait_ready "$LOG_DIR/admin.log"   "Ready in"        "admin (http://localhost:3001)" && ADMIN_OK=1 || true
wait_ready "$LOG_DIR/workers.log" "workers started" "workers (BullMQ)" && WORKERS_OK=1            || true

# ── Status board ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}┌──────────────────────────────────────────────────────────┐${NC}"
echo -e "${BOLD}│  SDS 360 — Running Services                              │${NC}"
echo -e "${BOLD}├──────────────────────────────────────────────────────────┤${NC}"

if [ "$APP_OK" -eq 1 ]; then
  echo -e "${BOLD}│${NC}  ${GREEN}✓${NC}  app      ${CYAN}http://localhost:3000${NC}  (customer portal)     ${BOLD}│${NC}"
else
  echo -e "${BOLD}│${NC}  ${RED}✗${NC}  app      FAILED  →  check .logs/app.log               ${BOLD}│${NC}"
fi

if [ "$ADMIN_OK" -eq 1 ]; then
  echo -e "${BOLD}│${NC}  ${GREEN}✓${NC}  admin    ${CYAN}http://localhost:3001${NC}  (super-admin portal)  ${BOLD}│${NC}"
else
  echo -e "${BOLD}│${NC}  ${RED}✗${NC}  admin    FAILED  →  check .logs/admin.log             ${BOLD}│${NC}"
fi

if [ "$WORKERS_OK" -eq 1 ]; then
  echo -e "${BOLD}│${NC}  ${GREEN}✓${NC}  workers  BullMQ connected                              ${BOLD}│${NC}"
else
  echo -e "${BOLD}│${NC}  ${RED}✗${NC}  workers  FAILED  →  check .logs/workers.log            ${BOLD}│${NC}"
fi

echo -e "${BOLD}├──────────────────────────────────────────────────────────┤${NC}"
echo -e "${BOLD}│${NC}  ${YELLOW}Ctrl+C${NC} to stop all services                              ${BOLD}│${NC}"
echo -e "${BOLD}│${NC}  Logs: .logs/{app,admin,workers}.log                      ${BOLD}│${NC}"
echo -e "${BOLD}└──────────────────────────────────────────────────────────┘${NC}"
echo ""

# ── Tail merged log output ─────────────────────────────────────────────────────
# Label each log line with its source
tail_labeled() {
  local label="$1" log="$2" color="$3"
  tail -f "$log" 2>/dev/null | while IFS= read -r line; do
    echo -e "${color}[${label}]${NC} ${line}"
  done &
  PIDS+=($!)
}

tail_labeled "app    " "$LOG_DIR/app.log"     "$CYAN"
tail_labeled "admin  " "$LOG_DIR/admin.log"   "$BLUE"
tail_labeled "workers" "$LOG_DIR/workers.log" "$GREEN"

# Keep the script alive; trap handles cleanup on Ctrl+C
wait "${PIDS[0]}" 2>/dev/null || true
