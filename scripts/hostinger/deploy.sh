#!/usr/bin/env sh
set -eu

# Uso na VPS: KURYOS_ROOT=/opt/kuryos ./scripts/hostinger/deploy.sh <commit-ou-tag>
# Não modifica volumes, não executa migrações e serializa deploys com flock.
REF=${1:?Uso: deploy.sh <commit-ou-tag>}
ROOT=${KURYOS_ROOT:-/opt/kuryos}
REPO="$ROOT/repo"
CONFIG="$ROOT/config/.env.production"
RELEASES="$ROOT/releases"
LOCK="$ROOT/deploy.lock"

test -d "$REPO/.git" || { echo "Repositório ausente em $REPO" >&2; exit 1; }
test -f "$CONFIG" || { echo "Configuração ausente em $CONFIG" >&2; exit 1; }
mkdir -p "$RELEASES" "$ROOT/backups"

exec 9>"$LOCK"
flock -n 9 || { echo "Outro deploy está em andamento." >&2; exit 1; }

git -C "$REPO" fetch --prune --tags origin
SHA=$(git -C "$REPO" rev-parse --verify "$REF^{commit}")
RELEASE="$RELEASES/$SHA"
if [ ! -d "$RELEASE" ]; then
  git -C "$REPO" worktree add --detach "$RELEASE" "$SHA"
fi

export APP_VERSION="$SHA"
COMPOSE="docker compose --project-name kuryos --env-file $CONFIG -f $RELEASE/compose.production.yml"

echo "Construindo versão $SHA"
$COMPOSE build --pull
$COMPOSE config --quiet
$COMPOSE up -d --no-build --remove-orphans

FUNCTIONS_ID=$($COMPOSE ps -q functions)
WEB_ID=$($COMPOSE ps -q web)
i=0
while [ "$i" -lt 30 ]; do
  F_STATUS=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$FUNCTIONS_ID")
  W_STATUS=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$WEB_ID")
  [ "$F_STATUS" = healthy ] && [ "$W_STATUS" = healthy ] && break
  i=$((i + 1))
  sleep 4
done
if [ "$F_STATUS" != healthy ] || [ "$W_STATUS" != healthy ]; then
  echo "Versão não ficou saudável (functions=$F_STATUS web=$W_STATUS)." >&2
  $COMPOSE logs --tail 200 >&2
  exit 1
fi

if [ -L "$ROOT/current" ]; then
  readlink "$ROOT/current" > "$ROOT/previous-release" || true
fi
ln -sfn "$RELEASE" "$ROOT/current.new"
mv -Tf "$ROOT/current.new" "$ROOT/current"
printf '%s\n' "$SHA" > "$ROOT/current-version"
echo "Versão saudável: $SHA"

