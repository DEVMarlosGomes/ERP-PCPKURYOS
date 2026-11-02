#!/usr/bin/env sh
set -eu
ROOT=${KURYOS_ROOT:-/opt/kuryos}
PREVIOUS=${1:-}
if [ -z "$PREVIOUS" ]; then
  test -f "$ROOT/previous-release" || { echo "Informe o commit ou mantenha $ROOT/previous-release." >&2; exit 1; }
  PREVIOUS=$(basename "$(cat "$ROOT/previous-release")")
fi
exec "$ROOT/repo/scripts/hostinger/deploy.sh" "$PREVIOUS"

