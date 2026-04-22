#!/bin/bash
set -e

ENV=${1:-prod}
DIR=$([ "$ENV" = "prod" ] && echo "/opt/classroom" || echo "/opt/classroom-dev")
DB=$([ "$ENV" = "prod" ] && echo "app.db" || echo "app-dev.db")
BACKUP_DIR="$DIR/backups"

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/${DB%.db}_$TIMESTAMP.db"

if [ -f "$DIR/backend/$DB" ]; then
    cp "$DIR/backend/$DB" "$BACKUP_FILE"
    echo "→ DB backed up to $BACKUP_FILE"
    # Keep only last 10 backups
    ls -t "$BACKUP_DIR"/*.db 2>/dev/null | tail -n +11 | xargs -r rm --
else
    echo "→ No DB file found, skipping backup"
fi
