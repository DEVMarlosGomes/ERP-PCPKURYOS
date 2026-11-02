#!/usr/bin/env sh
set -eu
# Valida e extrai um backup em diretório isolado. Nunca grava no Firebase.
SOURCE=${1:?Uso: restore-drill.sh <diretorio-do-backup> [destino-vazio]}
DEST=${2:-"${SOURCE}.restore-drill"}
test -f "$SOURCE/manifest.json" || { echo "manifest.json ausente" >&2; exit 1; }
test -f "$SOURCE/rtdb.json.gz" || { echo "rtdb.json.gz ausente" >&2; exit 1; }
test ! -e "$DEST" || { echo "Destino já existe: $DEST" >&2; exit 1; }
gzip -t "$SOURCE/rtdb.json.gz"
mkdir -m 700 "$DEST"
gzip -dc "$SOURCE/rtdb.json.gz" > "$DEST/rtdb.json"
node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')); JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'))" "$DEST/rtdb.json" "$SOURCE/manifest.json"
cp "$SOURCE/manifest.json" "$DEST/manifest.json"
echo "Restauração isolada validada em $DEST (nenhuma escrita no Firebase)."

