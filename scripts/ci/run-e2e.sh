#!/usr/bin/env bash
# CI: serve the built app with the test-only fake model, run the two-user browser test, stop the server.
# Usage: scripts/ci/run-e2e.sh <name> [POLICY=value ...]   Screenshots and the server log go to e2e-artifacts/<name>/.
# E2E_PORT (default 8000) must be on the Supabase auth redirect allow-list (supabase/config.toml).
set -euo pipefail
name="$1"; shift
port="${E2E_PORT:-8000}"
base="http://localhost:$port"
out="e2e-artifacts/$name"; mkdir -p "$out"

# Never test a server we didn't start: a leftover one would answer with other settings and hide failures.
if curl -s -o /dev/null --max-time 2 "$base/api/v1/health"; then
  echo "::error::port $port is already serving something; stop it first"; exit 1
fi

# exec: the subshell becomes uvicorn, so $server is the server itself and the trap really stops it.
(cd backend && exec env ENV=test LLM_FAKE=1 "$@" .venv/bin/uvicorn app.main:app --port "$port" --workers 1) > "$out/server.log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true; wait "$server" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  kill -0 "$server" 2>/dev/null || { echo "::error::server exited before it was ready"; tail -50 "$out/server.log"; exit 1; }
  curl -fsS -o /dev/null "$base/api/v1/health" 2>/dev/null && break
  sleep 1
done
curl -fsS -o /dev/null "$base/api/v1/health" || { echo "::error::server not ready after 60s"; tail -50 "$out/server.log"; exit 1; }

# The settings passed in must be the ones the server is actually using (public ones are visible in /config).
if [ "$#" -gt 0 ]; then
  curl -fsS "$base/api/v1/config" | python3 -c '
import json, sys
live = json.load(sys.stdin)["policies"]
bad = []
for arg in sys.argv[1:]:
    key, want = arg.split("=", 1)
    if key in live and str(live[key]).lower() != want.lower():
        bad.append(f"{key}: asked for {want}, server has {live[key]}")
if bad:
    sys.exit("settings did not take effect: " + "; ".join(bad))
print("settings in effect:", " ".join(sys.argv[1:]))
' "$@"
fi

echo "e2e '$name' with: ${*:-default policies}"
if ! BASE_URL="$base" npx tsx e2e/full-loop.ts --shots="$out"; then
  echo "::error::e2e '$name' failed; screenshots and server log are in the e2e-artifacts upload"
  tail -80 "$out/server.log"
  exit 1
fi
