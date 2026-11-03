#!/usr/bin/env sh
set -eu
command -v crontab >/dev/null
ROOT=${KURYOS_ROOT:-/opt/kuryos}
test "$ROOT" = /opt/kuryos || { echo 'Revise o agendamento para outra instalação.' >&2; exit 1; }
mkdir -p /home/deploy/.local/state/kuryos
chmod 700 /home/deploy/.local/state/kuryos
umask 077
if crontab -l 2>/dev/null | grep -q '# kuryos-security-backup'; then
  echo 'Agendamento já instalado.'
  exit 0
fi
(crontab -l 2>/dev/null || true; printf '%s\n' '15 3 * * * umask 077; /opt/kuryos/current/scripts/hostinger/backup.sh >> /home/deploy/.local/state/kuryos/backup.log 2>&1 # kuryos-security-backup') | crontab -
echo 'Backup diário agendado às 03:15 no fuso da VPS.'
