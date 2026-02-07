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

node scripts/local-api-server.mjs &
API_PID=$!

cleanup() {
  kill "$API_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

npm run dev -- --host 0.0.0.0 --port "${PORT:-5173}"
