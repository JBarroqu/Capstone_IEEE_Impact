#!/bin/sh
# npm run backup: dump the database into backups/ (git-ignored).
# Uses the docker compose Postgres if it is running, otherwise DATABASE_URL from .env (local Postgres).
set -e
cd "$(dirname "$0")/.."
mkdir -p backups
out="backups/wish_engine-$(date +%Y%m%d-%H%M%S).sql"
# Dump to a file first (not a pipe) so a failed pg_dump stops the script instead of leaving an empty .gz.
trap 'rm -f "$out"' EXIT
if docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  docker compose exec -T db pg_dump -U wish wish_engine > "$out"
else
  url=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//')
  pg_dump "$url" > "$out"
fi
gzip "$out"
trap - EXIT
out="$out.gz"
echo "wrote $out ($(du -h "$out" | cut -f1))"
