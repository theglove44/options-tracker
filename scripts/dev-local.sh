#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${LOCAL_API_PORT:-8787}"

if [[ -f ".env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source ".env"
  set +a
fi

if [[ -f ".env.local" ]]; then
  # shellcheck disable=SC1091
  set -a
  source ".env.local"
  set +a
fi

# For local development, always prefer a freshly generated access token when
# refresh credentials are available. This avoids stale token failures.
if [[ -n "${TASTYTRADE_REFRESH_TOKEN:-}" && -n "${TASTYTRADE_CLIENT_ID:-}" && -n "${TASTYTRADE_CLIENT_SECRET:-}" ]]; then
  if GENERATED_ACCESS_TOKEN="$(bash scripts/get-access-token.sh 2>/dev/null)"; then
    export TASTYTRADE_ACCESS_TOKEN="$GENERATED_ACCESS_TOKEN"
    echo "[local-api] refreshed TASTYTRADE_ACCESS_TOKEN from refresh token"
  elif [[ -n "${TASTYTRADE_ACCESS_TOKEN:-}" ]]; then
    echo "[local-api] token refresh failed, keeping existing TASTYTRADE_ACCESS_TOKEN"
  else
    echo "[local-api] token refresh failed and no TASTYTRADE_ACCESS_TOKEN is set"
  fi
fi

node scripts/local-api-server.mjs &
API_PID=$!

cleanup() {
  kill "$API_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

npm run dev -- --host 0.0.0.0 --port "${PORT:-5173}"
