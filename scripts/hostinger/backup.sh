#!/usr/bin/env sh
set -eu
ROOT=${KURYOS_ROOT:-/opt/kuryos}
CONFIG="$ROOT/config/.env.production"
RELEASE=${KURYOS_RELEASE:-$ROOT/current}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
TARGET="/backups/$STAMP"

test -f "$CONFIG" || { echo "Configuração ausente em $CONFIG" >&2; exit 1; }
APP_VERSION=$(cat "$ROOT/current-version")
export APP_VERSION
COMPOSE="docker compose --project-name kuryos --env-file $CONFIG -f $RELEASE/compose.production.yml"

$COMPOSE exec -T functions node ops/backup-firebase.js "$TARGET"

# Carrega apenas para decidir se o repositório externo foi configurado; nada é impresso.
set -a
# O caminho absoluto de produção é configurável por KURYOS_ROOT.
# shellcheck disable=SC1090
. "$CONFIG"
set +a
case "${RESTIC_REPOSITORY:-}" in
  ""|*"<"*) echo "Backup local criado; armazenamento externo ainda não configurado." ;;
  *)
    $COMPOSE --profile backup run --rm restic backup /backups --tag kuryos
    $COMPOSE --profile backup run --rm restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
    ;;
esac

BACKUP_ROOT=$(readlink -f "$ROOT/backups")
ROOT_REAL=$(readlink -f "$ROOT")
case "$BACKUP_ROOT" in
  "$ROOT_REAL"/backups) ;;
  *) echo "Diretório de backup inseguro: $BACKUP_ROOT" >&2; exit 1 ;;
esac
find "$BACKUP_ROOT" -mindepth 2 -type f -mtime +7 -delete
find "$BACKUP_ROOT" -mindepth 1 -depth -type d -empty -delete
echo "Backup concluído: $STAMP"

