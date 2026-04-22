#!/bin/bash
set -e

BRANCH=${1:-master}
ENV=$([ "$BRANCH" = "master" ] && echo "prod" || echo "dev")
DIR=$([ "$ENV" = "prod" ] && echo "/opt/classroom" || echo "/opt/classroom-dev")
SERVICE="classroom-backend$([ "$ENV" = "dev" ] && echo "-dev" || echo "")"
HEALTH_URL="https://$([ "$ENV" = "prod" ] && echo "266602.fornex.cloud" || echo "dev.266602.fornex.cloud")/api/healthz"

echo "==> Deploy $BRANCH → $ENV ($DIR)"

cd "$DIR"

echo "→ Backup DB"
./deploy/scripts/backup-db.sh "$ENV"

echo "→ Pull code"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "→ Install deps"
cd backend && uv sync --frozen && cd ..

echo "→ Migrate DB"
cd backend && uv run alembic upgrade head && cd ..

echo "→ Restart service"
sudo systemctl restart "$SERVICE"

echo "→ Healthcheck"
for i in {1..5}; do
    sleep 3
    if curl -sf "$HEALTH_URL" > /dev/null; then
        echo "✓ Deploy successful ($ENV)"
        exit 0
    fi
done

echo "✗ Healthcheck failed — rolling back"
cd backend && git reset --hard HEAD~1
uv run alembic downgrade -1 && cd ..
sudo systemctl restart "$SERVICE"
exit 1
