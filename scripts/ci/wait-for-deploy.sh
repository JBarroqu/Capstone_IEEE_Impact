#!/usr/bin/env bash
# Deploy: wait until APP_URL/api/v1/health reports the expected commit (Render sets RENDER_GIT_COMMIT), then smoke-test.
# Usage: scripts/ci/wait-for-deploy.sh <app-url> <commit-sha> [timeout-minutes]
set -euo pipefail
url="${1%/}"; sha="$2"; minutes="${3:-25}"
deadline=$(( $(date +%s) + minutes * 60 ))
seen=""
while :; do
  body=$(curl -fsS --max-time 20 "$url/api/v1/health" 2>/dev/null || true)
  live=$(printf '%s' "$body" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("commit") or "")' 2>/dev/null || true)
  if [ "$live" = "$sha" ]; then echo "Live: $sha"; break; fi
  if [ "$live" != "$seen" ]; then echo "Waiting for $sha (live now: ${live:-unreachable or no commit})"; seen="$live"; fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::$url did not report commit $sha within $minutes minutes. Check the deploy log on Render; the previous version keeps serving if the new one failed its health check."
    exit 1
  fi
  sleep 20
done

fail=0
check() { if eval "$2"; then echo "ok    $1"; else echo "::error::smoke check failed: $1"; fail=1; fi; }
check "home page serves the app" "curl -fsS --max-time 20 '$url/' | grep -q '<div id=\"root\">'"
check "public config answers"    "curl -fsS --max-time 20 '$url/api/v1/config' | grep -q '\"ok\":true'"
check "signed-out /me is 401"    "[ \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 '$url/api/v1/me')\" = 401 ]"
check "API docs off in public"   "[ \"\$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 '$url/docs')\" != 200 ] || ! curl -fsS --max-time 20 '$url/docs' | grep -qi swagger"
exit $fail
