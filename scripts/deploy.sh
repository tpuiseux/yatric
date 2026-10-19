#!/usr/bin/env bash
# Deploys the committed code (HEAD) to a server running the app with
# Docker Compose, as described in the README. Settings come from
# .env.deploy at the repo root (see .env.deploy.example).
#
#   npm run deploy              # the web app
#   npm run deploy -- --bridge  # the web app, then the Garmin bridge
#
# Each run backs up the database and the previous code first, and prints
# the command to roll back.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env.deploy ]]; then
  set -a
  # shellcheck source=/dev/null
  source .env.deploy
  set +a
fi

: "${DEPLOY_HOST:?Set DEPLOY_HOST in .env.deploy (an ssh host)}"
: "${DEPLOY_DIR:?Set DEPLOY_DIR in .env.deploy (the folder holding compose.yml)}"
DEPLOY_CONTAINER="${DEPLOY_CONTAINER:-yatric}"
DEPLOY_DB="${DEPLOY_DB:-/data/yatric.db}"
DEPLOY_URL="${DEPLOY_URL:-}"
BRIDGE_DIR="${BRIDGE_DIR:-}"
BRIDGE_SERVICE="${BRIDGE_SERVICE:-garmin-bridge}"

WITH_BRIDGE=false
for arg in "$@"; do
  case "$arg" in
    --bridge) WITH_BRIDGE=true ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# Only committed code goes out: refuse rather than deploy something
# that doesn't match any commit.
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Uncommitted changes - commit or stash them first:" >&2
  git status --short >&2
  exit 1
fi

COMMIT="$(git rev-parse --short HEAD)"
TS="$(date +%Y%m%d%H%M%S)"
echo "Deploying $COMMIT ($(git log -1 --format=%s)) to $DEPLOY_HOST:$DEPLOY_DIR"
if [[ -n "$(git log --oneline '@{u}..HEAD' 2>/dev/null)" ]]; then
  echo "Note: $COMMIT isn't pushed yet."
fi

step "1/4 Backing up the database and the current code"
ssh "$DEPLOY_HOST" "set -e
  cd $DEPLOY_DIR
  docker exec $DEPLOY_CONTAINER node -e \"new (require('node:sqlite').DatabaseSync)('$DEPLOY_DB').exec(\\\"VACUUM INTO '$DEPLOY_DB.bak-$TS'\\\")\" 2>/dev/null
  tar czf app.bak-$TS.tgz app
  echo \"database: $DEPLOY_DB.bak-$TS, code: $DEPLOY_DIR/app.bak-$TS.tgz\""

step "2/4 Copying the code"
ssh "$DEPLOY_HOST" "cd $DEPLOY_DIR && rm -rf app && mkdir app"
git archive HEAD | ssh "$DEPLOY_HOST" "tar -C $DEPLOY_DIR/app -xf -"

step "3/4 Building and restarting"
ssh "$DEPLOY_HOST" "cd $DEPLOY_DIR && docker compose build --quiet && docker compose up -d"

step "4/4 Checking"
ok=false
for _ in $(seq 1 15); do
  if ssh "$DEPLOY_HOST" "docker logs --since 2m $DEPLOY_CONTAINER 2>&1 | grep -q 'Listening on'"; then
    ok=true
    break
  fi
  sleep 2
done
ssh "$DEPLOY_HOST" "docker logs --tail 5 $DEPLOY_CONTAINER 2>&1"
if [[ -n "$DEPLOY_URL" ]]; then
  status="$(curl -s -o /dev/null -w '%{http_code}' "$DEPLOY_URL/login")"
  echo "$DEPLOY_URL/login -> $status"
  [[ "$status" == "200" ]] || ok=false
fi

if [[ "$WITH_BRIDGE" == true ]]; then
  : "${BRIDGE_DIR:?Set BRIDGE_DIR in .env.deploy to deploy the Garmin bridge}"
  step "Garmin bridge"
  ssh "$DEPLOY_HOST" "cd $BRIDGE_DIR && for f in *.py *.sql; do [ -f \"\$f\" ] && cp \"\$f\" \"\$f.bak-$TS\"; done; true"
  git archive HEAD garmin-bridge | ssh "$DEPLOY_HOST" \
    "tar -C $BRIDGE_DIR --strip-components=1 -xf - --wildcards '*.py' '*.sql' '*.txt'"
  ssh "$DEPLOY_HOST" "sudo systemctl restart $BRIDGE_SERVICE && sleep 2 && systemctl is-active $BRIDGE_SERVICE"
fi

ROLLBACK="ssh $DEPLOY_HOST 'cd $DEPLOY_DIR && rm -rf app && tar xzf app.bak-$TS.tgz && docker compose build --quiet && docker compose up -d'"
if [[ "$ok" == true ]]; then
  step "Deployed $COMMIT."
  echo "To roll back: $ROLLBACK"
else
  step "The app didn't come up cleanly - check the logs above."
  echo "To roll back: $ROLLBACK"
  exit 1
fi
