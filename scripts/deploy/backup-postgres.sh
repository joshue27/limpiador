#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/var/backups/limpiador/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
docker compose exec -T postgres pg_dump -U limpiador limpiador | gzip > "$BACKUP_DIR/limpiador-$TIMESTAMP.sql.gz"
find "$BACKUP_DIR" -type f -name 'limpiador-*.sql.gz' -mtime "+$RETENTION_DAYS" -delete
