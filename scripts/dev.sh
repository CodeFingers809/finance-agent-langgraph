#!/usr/bin/env bash
# Start the full local dev stack: Postgres check, ngrok, backend, frontend.
#
# ngrok is required for Clerk webhooks -- without a public URL, Clerk cannot
# deliver organizationMembership events, so invites never move users between
# organizations.
#
# Usage:  ./scripts/dev.sh
# Set NGROK_DOMAIN in .env to use a reserved static domain (recommended: the
# Clerk webhook endpoint then never needs updating).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
PG_BIN="/opt/homebrew/opt/postgresql@18/bin"
BACKEND_PORT=8000
FRONTEND_PORT=5173

# shellcheck disable=SC1091
[ -f .env ] && set -a && . ./.env && set +a

log()  { printf '\033[1;36m[dev]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dev]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; exit 1; }

PIDS=()
cleanup() {
  log "shutting down..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- Postgres ---------------------------------------------------------------
PG_PORT="${POSTGRES_PORT:-5433}"
if "$PG_BIN/pg_isready" -h localhost -p "$PG_PORT" -q 2>/dev/null; then
  log "postgres up on :$PG_PORT"
else
  log "starting postgres on :$PG_PORT"
  "$PG_BIN/pg_ctl" -D /opt/homebrew/var/postgresql@18 -l /tmp/brew-pg.log start >/dev/null
  sleep 2
  "$PG_BIN/pg_isready" -h localhost -p "$PG_PORT" -q || die "postgres failed to start (see /tmp/brew-pg.log)"
fi

# --- Redis (rate limiting) --------------------------------------------------
# Probe the port directly: redis-cli isn't installed on the host (Redis runs in
# a container), so `redis-cli ping` would report a false failure.
REDIS_HOST_PORT="${REDIS_URL#redis://}"
REDIS_HOST_PORT="${REDIS_HOST_PORT%%/*}"
if nc -z "${REDIS_HOST_PORT%%:*}" "${REDIS_HOST_PORT##*:}" 2>/dev/null; then
  log "redis up on $REDIS_HOST_PORT"
else
  warn "redis not reachable at $REDIS_HOST_PORT -- rate limiting will fail"
fi

# --- Migrations -------------------------------------------------------------
log "applying migrations"
(cd backend && uv run alembic upgrade head 2>&1 | grep -E "Running upgrade|ERROR" || true)

# --- ngrok ------------------------------------------------------------------
command -v ngrok >/dev/null || die "ngrok not installed"
pkill -f "ngrok http $BACKEND_PORT" 2>/dev/null || true
sleep 1

if [ -n "${NGROK_DOMAIN:-}" ]; then
  log "starting ngrok on static domain $NGROK_DOMAIN"
  ngrok http "$BACKEND_PORT" --domain "$NGROK_DOMAIN" --log stdout >/tmp/ngrok.log 2>&1 &
else
  warn "NGROK_DOMAIN unset -- using an ephemeral URL that changes every restart."
  warn "Reserve one at https://dashboard.ngrok.com/domains, then add it to .env."
  ngrok http "$BACKEND_PORT" --log stdout >/tmp/ngrok.log 2>&1 &
fi
PIDS+=($!)

# Read the public URL from ngrok's local API rather than scraping logs.
NGROK_URL=""
for _ in $(seq 1 20); do
  NGROK_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | grep -oE 'https://[a-zA-Z0-9.-]+\.ngrok[a-zA-Z0-9.-]*' | head -1) || true
  [ -n "$NGROK_URL" ] && break
  sleep 0.5
done

if [ -n "$NGROK_URL" ]; then
  log "ngrok:   $NGROK_URL"
  log "webhook: $NGROK_URL/api/v1/webhooks/clerk"
  if [ -z "${NGROK_DOMAIN:-}" ]; then
    warn "Update the Clerk webhook endpoint to the URL above (it changed)."
  fi
else
  warn "could not determine ngrok URL (see /tmp/ngrok.log)"
fi

# --- Backend ----------------------------------------------------------------
log "starting backend on :$BACKEND_PORT"
(cd backend && uv run uvicorn app.main:app --reload --port "$BACKEND_PORT") &
PIDS+=($!)

# --- Frontend ---------------------------------------------------------------
log "starting frontend on :$FRONTEND_PORT"
(cd frontend && npm run dev -- --port "$FRONTEND_PORT") &
PIDS+=($!)

log "stack up. Ctrl-C to stop everything."
wait
