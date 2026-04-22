#!/bin/bash
# Update the backend on Linux host
# Usage: ./update_host.sh [prod|dev]
set -e

ENV=${1:-dev}
DIR=$([ "$ENV" = "prod" ] && echo "/opt/classroom" || echo "/opt/classroom-dev")
SERVICE="classroom-backend$([ "$ENV" = "dev" ] && echo "-dev" || echo "")"

echo "==> Updating $ENV backend ($DIR)"

cd "$DIR"

echo "→ Backup DB"
./deploy/scripts/backup-db.sh "$ENV"

echo "→ Pull latest code"
git fetch origin
git pull origin "$(git rev-parse --abbrev-ref HEAD)"

echo "→ Install dependencies"
cd backend && uv sync --frozen

echo "→ Apply migrations"
uv run alembic upgrade head && cd ..

echo "→ Restart service"
sudo systemctl restart "$SERVICE"
sleep 3

echo "→ Health check"
PORT=$([ "$ENV" = "prod" ] && echo "8080" || echo "8082")
curl -sf "http://127.0.0.1:$PORT/api/healthz" && echo "" && echo "✓ Update successful"
