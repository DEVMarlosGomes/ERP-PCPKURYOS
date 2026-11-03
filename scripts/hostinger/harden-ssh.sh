#!/usr/bin/env sh
set -eu
# Executar como root pelo console Hostinger. Não exige nem registra senhas.
[ "$(id -u)" = 0 ] || { echo 'Execute como root no console Hostinger.' >&2; exit 1; }
test -s /home/deploy/.ssh/authorized_keys || { echo 'Falta chave do deploy.' >&2; exit 1; }
/usr/sbin/sshd -t
TARGET=/etc/ssh/sshd_config.d/00-kuryos-hardening.conf
test ! -e "$TARGET" || cp -p "$TARGET" "$TARGET.previous"
umask 077
printf '%s\n' 'PermitRootLogin no' 'PasswordAuthentication no' 'KbdInteractiveAuthentication no' 'PubkeyAuthentication yes' 'MaxAuthTries 3' 'LoginGraceTime 30' > "$TARGET"
if ! /usr/sbin/sshd -t; then
  if [ -f "$TARGET.previous" ]; then mv "$TARGET.previous" "$TARGET"; else rm "$TARGET"; fi
  exit 1
fi
systemctl reload ssh
/usr/sbin/sshd -T | sed -n '/^permitrootlogin /p; /^passwordauthentication /p; /^maxauthtries /p'
echo 'Abra nova conexão deploy antes de encerrar o console.'
