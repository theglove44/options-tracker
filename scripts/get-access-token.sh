#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. Install it first (brew install jq)." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/.env" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

if [[ -f "$ROOT_DIR/.env.local" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ROOT_DIR/.env.local"
  set +a
fi

required_vars=(
  TASTYTRADE_REFRESH_TOKEN
  TASTYTRADE_CLIENT_ID
  TASTYTRADE_CLIENT_SECRET
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing env var: $var_name" >&2
    exit 1
  fi
done

response="$(
  curl -sS -X POST "https://api.tastytrade.com/oauth/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    --data-urlencode "grant_type=refresh_token" \
    --data-urlencode "refresh_token=${TASTYTRADE_REFRESH_TOKEN}" \
    --data-urlencode "client_id=${TASTYTRADE_CLIENT_ID}" \
    --data-urlencode "client_secret=${TASTYTRADE_CLIENT_SECRET}"
)"

access_token="$(echo "$response" | jq -r '.access_token // .data.access_token // .data["access-token"] // empty')"

if [[ -z "$access_token" ]]; then
  echo "Failed to generate access token." >&2
  echo "$response" | jq . >&2 || echo "$response" >&2
  exit 1
fi

echo "$access_token"
