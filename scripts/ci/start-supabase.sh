#!/usr/bin/env bash
# CI: start local Supabase with only the services the tests use, retrying image pulls, then write .env.local.
# Kept: Postgres, Auth (gotrue), Storage, PostgREST, Kong (the :54321 gateway) and Mailpit (magic-link emails for e2e).
set -euo pipefail
EXCLUDE="realtime,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"
for attempt in 1 2 3; do
  if supabase start -x "$EXCLUDE"; then
    node scripts/env-local.mjs
    exit 0
  fi
  echo "::warning::supabase start failed (attempt $attempt of 3); retrying"
  supabase stop --no-backup || true
  sleep $((attempt * 15))
done
echo "::error::Supabase did not start after 3 attempts"
exit 1
