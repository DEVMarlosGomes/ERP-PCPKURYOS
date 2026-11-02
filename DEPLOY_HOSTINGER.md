# Implantação do ERP/PCP Kuryos na Hostinger

Versão do diagnóstico: **01/11/2026**. Este documento prepara o ambiente, mas
não altera DNS, Firebase nem o servidor atual. Antes da aplicação real, registrar
o commit validado, o domínio, o IP e a janela de corte.

## 1. Diagnóstico confirmado no código

### Arquitetura atual

| Camada | Implementação | Dependências em produção |
|---|---|---|
| ERP principal | HTML/CSS/JavaScript estático em `public/` | Firebase Auth, Realtime Database, Storage e chamadas callable |
| CRM e P&D | React 18 + Vite 8 em `crm-frontend/`; o build é incorporado em `public/static/crm` | Firebase Web SDK 12 |
| Backend | Node.js 24 em `functions/render-server.js`, reutilizando `functions/index.js` | 25 callables, 2 APIs HTTP, 6 escutas do RTDB e 4 agendas |
| Dados | Firebase Realtime Database `erpkuryos` | Não existe banco SQL/local neste deploy |
| Arquivos | Firebase Storage | Upload é direto do navegador para o Firebase |
| Identidade | Firebase Authentication | O novo domínio precisa ser autorizado no console Firebase |
| Implantação anterior | Vercel (`vercel.json`) + Render (`render.yaml`) | Será mantida como rollback até o aceite do corte |

O frontend principal não tem etapa de build. O Docker apenas recompila o CRM a
partir do lockfile e o integra ao diretório estático. O backend usa
`npm ci --omit=dev` e o lockfile de `functions/`.

Não há servidor WebSocket próprio. O navegador mantém conexões de saída com o
Firebase. O backend precisa permanecer ativo porque mantém escutas do RTDB e
agendas; por isso não pode ser tratado como site estático ou função eventual.

### Bloqueios encontrados e tratados

1. `firebase-admin 14.5.0` removeu os atalhos `admin.database()`/`admin.auth()`
   usados pelo backend. `functions/index.js` e `functions/render-server.js`
   foram atualizados para as APIs modulares. Sem isso, as 37 funções não
   carregavam.
2. A origem do backend estava fixa no Render em `public/auth_check.js` e
   `crm-frontend/src/lib/servidor.js`. No domínio próprio, ela agora usa
   `https://<DOMINIO_DO_ERP>/api`; Vercel continua no Render até o cutover.
3. O teste do adaptador ainda esperava 36 funções. Foi atualizado para 37,
   incluindo `emitirOpServidor`.
4. A credencial administrativa não pode entrar na imagem nem no bundle. Ela é
   montada em `/run/secrets/firebase_service_account`, fora do Git.

### Limites arquiteturais importantes

- Deve existir **uma única réplica** do container `functions`. Duas réplicas
  duplicariam escutas/agendas e podem produzir efeitos repetidos.
- Algumas operações fazem transação sobre a raiz do RTDB. Isso preserva a
  atomicidade, mas consome memória proporcional ao banco; acompanhar RAM e
  duração das ações.
- Uma VPS é um ponto único de falha. Caddy reinicia automaticamente os
  containers, mas isso não equivale a alta disponibilidade.
- A migração para PostgreSQL/MinIO/Keycloak não faz parte deste primeiro deploy.
  Ela deve ser um projeto separado, com dupla escrita, reconciliação, ensaio e
  rollback próprios.

## 2. Modalidade Hostinger recomendada

### Recomendação principal: VPS KVM 2

Usar Ubuntu 24.04 LTS, Docker Engine, Compose Plugin e os dois containers deste
repositório. A hospedagem Node.js gerenciada aceita Node 24, porém a própria
Hostinger informa que ela não suporta workers sempre ativos. As escutas e agendas
do ERP exigem essa característica; portanto VPS é a opção compatível.

Dimensionamento inicial:

- 2 vCPU, 8 GB RAM e 100 GB NVMe (KVM 2);
- uma instância do backend, uma do Caddy;
- premissa: 10–30 acessos simultâneos, uploads direto ao Firebase e até algumas
  dezenas de ações de servidor por minuto;
- 20 GB reservados para sistema/imagens, 20 GB para builds/releases, 20 GB para
  backups locais temporários e restante como margem;
- avaliar upgrade se RAM sustentada passar de 70%, disco de 75%, CPU de 70% por
  15 minutos, health checks falharem ou operações se aproximarem de 120 s.

O KVM 1 (1 vCPU/4 GB) provavelmente inicia o sistema e custa menos, mas deixa
pouca margem para build, transações de raiz, backup e operação simultânea. Para
uma fábrica, o KVM 2 é o ponto de partida prudente.

Preços consultados em 01/11/2026 na página brasileira da Hostinger:

- KVM 2: **R$ 43,99/mês** no contrato de 24 meses (R$ 1.055,76 pagos pelo
  período), renovação informada de **R$ 77,99/mês**;
- KVM 1: R$ 29,99/mês no contrato de 24 meses, renovação de R$ 59,99/mês;
- backups semanais estão incluídos; backup diário é adicional e o preço deve ser
  confirmado no hPanel da conta;
- domínio grátis por um ano aparece na oferta, mas a renovação varia por TLD.

Fontes oficiais: [planos VPS](https://www.hostinger.com/br/servidor-vps),
[limites Node.js gerenciado](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/),
[opções Node.js](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/) e
[backups da VPS](https://support.hostinger.com/en/articles/1583232-how-to-back-up-or-restore-a-vps).

O armazenamento externo Restic/S3 e o custo corrente do Firebase continuam
separados. Não há preço inventado neste plano: escolher fornecedor/bucket e
registrar a cotação antes de ativar o cron.

## 3. Arquivos de produção

- `Dockerfile`: build multiestágio, Node 24.17.0 e Caddy 2.10.2 sem `latest`;
- `.dockerignore`: exclui credenciais, dependências locais, logs e artefatos;
- `compose.production.yml`: serviços `web`, `functions` e perfil opcional
  `restic`, health checks, reinício, logs rotacionados e volumes de certificado;
- `deploy/hostinger/Caddyfile`: HTTPS automático, SPA/clean URLs, `/api`, cache
  e cabeçalhos básicos;
- `.env.production.example`: inventário de variáveis públicas e segredos;
- `scripts/hostinger/deploy.sh`: deploy serializado por commit/tag;
- `scripts/hostinger/rollback.sh`: retorno de aplicação sem apagar volumes;
- `scripts/hostinger/backup.sh`: RTDB + Storage e cópia externa criptografada;
- `scripts/hostinger/restore-drill.sh`: restauração somente em diretório isolado.

## 4. Preparação da VPS

Execute no **hPanel**, sem reinstalar uma VPS existente antes de inventariá-la:

1. Confirmar plano, região, IP, sistema atual, backups e serviços já presentes.
2. Se for VPS nova, escolher Ubuntu 24.04 LTS limpo.
3. Criar uma regra de firewall temporária preservando o SSH atual.
4. Anotar `<IP_DA_VPS>`, `<DOMINIO_DO_ERP>` e `<USUARIO_DEPLOY>`.

No **computador local**, criar uma chave dedicada se ainda não existir:

```powershell
ssh-keygen -t ed25519 -a 100 -f "$env:USERPROFILE\.ssh\kuryos_hostinger" -C "deploy-kuryos"
Get-Content "$env:USERPROFILE\.ssh\kuryos_hostinger.pub"
```

Na **VPS**, ainda com o acesso administrativo funcional:

```bash
sudo adduser --disabled-password --gecos '' <USUARIO_DEPLOY>
sudo usermod -aG sudo <USUARIO_DEPLOY>
sudo install -d -m 700 -o <USUARIO_DEPLOY> -g <USUARIO_DEPLOY> /home/<USUARIO_DEPLOY>/.ssh
sudo tee /home/<USUARIO_DEPLOY>/.ssh/authorized_keys >/dev/null
# cole somente a chave pública e pressione Ctrl+D
sudo chown <USUARIO_DEPLOY>:<USUARIO_DEPLOY> /home/<USUARIO_DEPLOY>/.ssh/authorized_keys
sudo chmod 600 /home/<USUARIO_DEPLOY>/.ssh/authorized_keys
```

Testar uma segunda sessão SSH com a chave antes de restringir senhas/root.

Instalar Docker pelo repositório oficial do Docker para Ubuntu e confirmar:

```bash
docker version
docker compose version
```

Criar a estrutura:

```bash
sudo install -d -m 755 /opt/kuryos/{repo,releases,config,secrets,backups}
sudo chown -R <USUARIO_DEPLOY>:<USUARIO_DEPLOY> /opt/kuryos
git clone <URL_DO_REPOSITORIO> /opt/kuryos/repo
cp /opt/kuryos/repo/.env.production.example /opt/kuryos/config/.env.production
chmod 600 /opt/kuryos/config/.env.production
chmod 700 /opt/kuryos/secrets /opt/kuryos/backups
```

Baixar uma nova conta de serviço limitada ao projeto Firebase diretamente em
um computador administrativo e enviá-la por SCP; nunca colar a chave no chat:

```powershell
scp -i "$env:USERPROFILE\.ssh\kuryos_hostinger" `
  .\firebase-service-account.json `
  <USUARIO_DEPLOY>@<IP_DA_VPS>:/opt/kuryos/secrets/firebase-service-account.json
```

Na VPS:

```bash
chmod 600 /opt/kuryos/secrets/firebase-service-account.json
nano /opt/kuryos/config/.env.production
```

Substituir todos os `<PLACEHOLDERS>`. Gerar `OPS_API_KEY`, `PEDIDOS_API_KEY` e
`RESTIC_PASSWORD` com `openssl rand -base64 48`. Não reutilizar senha humana.

## 5. DNS, HTTPS e Firebase

No provedor DNS:

1. Criar `A` para o subdomínio escolhido apontando para `<IP_DA_VPS>`.
2. Criar `AAAA` somente se o IPv6 da VPS estiver configurado e testado.
3. Não alterar MX, SPF ou DKIM.
4. Durante o corte, usar TTL 300; depois estabilizar em 3600 ou mais.

Verificar no computador local:

```powershell
Resolve-DnsName <DOMINIO_DO_ERP>
curl.exe -I https://<DOMINIO_DO_ERP>/healthz
curl.exe https://<DOMINIO_DO_ERP>/api/health
```

Caddy solicita e renova o certificado automaticamente; portas TCP 80/443 e
UDP 443 devem estar abertas. A porta 8080 não é publicada.

No Firebase Console:

1. Authentication → Settings → Authorized domains: adicionar
   `<DOMINIO_DO_ERP>`.
2. Revisar o CORS do bucket antes de testar fotos/anexos. Copiar
   `deploy/hostinger/storage-cors.example.json`, substituir o domínio e aplicar
   com a ferramenta Google Cloud autorizada da organização.
3. Não alterar `authDomain`, regras nem dados nesta implantação.

## 6. Primeiro deploy e cutover

Antes de tocar a produção, registrar:

```text
Versão: <COMMIT_GIT_VALIDADO>
Destino: <DOMINIO_DO_ERP> / <IP_DA_VPS>
Janela: <DATA_HORA_INICIO>–<DATA_HORA_FIM>
Rollback: Vercel + Render, com titularidade de gatilhos definida abaixo
Responsáveis: <NOMES>
```

Na VPS, fazer a primeira subida com gatilhos/agendas desligados para não duplicar
o Render:

```bash
sed -i 's/^DISABLE_TRIGGERS=.*/DISABLE_TRIGGERS=1/; s/^DISABLE_SCHEDULE=.*/DISABLE_SCHEDULE=1/' /opt/kuryos/config/.env.production
cd /opt/kuryos/repo
./scripts/hostinger/deploy.sh <COMMIT_GIT_VALIDADO>
docker compose --project-name kuryos --env-file /opt/kuryos/config/.env.production -f /opt/kuryos/current/compose.production.yml ps
```

Validar login, logout, permissões, leitura, upload e uma escrita controlada no
ambiente isolado. O domínio pode ser ensaiado antes do DNS com `curl --resolve`,
mas o login Firebase no navegador exige domínio autorizado e certificado válido.

Cutover dos workers, nesta ordem:

1. No Render, definir `DISABLE_TRIGGERS=1` e `DISABLE_SCHEDULE=1`; manter os
   endpoints HTTP ligados durante a propagação do frontend.
2. Confirmar nos logs que o Render não iniciou escutas/agendas.
3. Na VPS, colocar `DISABLE_TRIGGERS=0` e `DISABLE_SCHEDULE=0`.
4. Executar novamente o deploy do mesmo commit e confirmar uma única sequência
   de logs `[gatilho] escutando`/`[agenda]`.
5. Alterar DNS e validar o domínio. Só remover Vercel/Render após a janela de
   observação e aceite do usuário.

Firewall final, depois de confirmar o novo SSH:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status verbose
```

As portas publicadas pelo Docker podem contornar regras UFW em algumas
configurações. Este Compose publica somente 80/443; conferir `docker ps` e
`ss -lntup`. Nunca publicar 8080, Firebase Emulator ou banco local.

## 7. Atualização e rollback

Deploy manual por versão, na VPS:

```bash
cd /opt/kuryos/repo
./scripts/hostinger/deploy.sh <COMMIT_OU_TAG_VALIDADO>
cat /opt/kuryos/current-version
```

O script usa `flock`, cria um worktree imutável, identifica imagens com o commit,
executa `docker compose up -d` e só troca o ponteiro `current` depois dos dois
health checks. Não usa `down -v` e não apaga uploads/dados.

Rollback da aplicação:

```bash
cd /opt/kuryos/repo
./scripts/hostinger/rollback.sh
# ou informe um commit específico:
./scripts/hostinger/rollback.sh <COMMIT_ANTERIOR>
```

Rollback de código não desfaz dados. Se uma futura versão mudar esquema, exigir
plano específico de compatibilidade e recuperação antes do deploy.

## 8. Backup e recuperação

Metas iniciais a validar com a direção:

- RPO: 24 horas para RTDB/Storage; reduzir após medir volume e criticidade;
- RTO: 4 horas para aplicação e credenciais; restauração de dados depende do
  volume e da aprovação para gravar novamente no Firebase.

O snapshot da Hostinger protege a VPS, mas não é backup consistente do Firebase.
O script gera:

- `rtdb.json.gz` por leitura administrativa;
- cópia de todos os objetos do Storage, com nomes e gerações no manifesto;
- `manifest.json` com projeto, datas, tamanhos e hashes fornecidos pelo Storage.

Inicializar uma única vez o repositório Restic externo:

```bash
export APP_VERSION=$(cat /opt/kuryos/current-version)
docker compose --project-name kuryos --env-file /opt/kuryos/config/.env.production -f /opt/kuryos/current/compose.production.yml --profile backup run --rm restic init
```

Executar e agendar na VPS:

```bash
/opt/kuryos/current/scripts/hostinger/backup.sh
crontab -e
# 02:15 BRT todos os dias; o servidor deve estar com timezone conferido
15 2 * * * /opt/kuryos/current/scripts/hostinger/backup.sh >>/var/log/kuryos-backup.log 2>&1
```

Retenção externa: 7 diários, 4 semanais e 6 mensais. A cópia local guarda 7 dias.
O bucket externo deve ter versionamento/imutabilidade e credencial somente para o
prefixo de backup.

Teste de recuperação **sem escrever no Firebase**:

```bash
/opt/kuryos/current/scripts/hostinger/restore-drill.sh /opt/kuryos/backups/<CARIMBO>
```

Depois, abrir amostras do JSON e dos objetos. Só considerar o backup validado
após um ensaio documentado de restauração em projeto Firebase isolado. Restaurar
snapshot da VPS pelo hPanel sobrescreve o servidor e não substitui esse ensaio.

## 9. Validação e monitoramento

Checks antes do aceite:

```bash
docker compose --project-name kuryos --env-file /opt/kuryos/config/.env.production -f /opt/kuryos/current/compose.production.yml config --quiet
docker compose --project-name kuryos --env-file /opt/kuryos/config/.env.production -f /opt/kuryos/current/compose.production.yml ps
curl -fsS https://<DOMINIO_DO_ERP>/healthz
curl -fsS https://<DOMINIO_DO_ERP>/api/health
docker compose --project-name kuryos --env-file /opt/kuryos/config/.env.production -f /opt/kuryos/current/compose.production.yml logs --since 15m
```

Validar manualmente por perfil: login/logout, menus, pedido, OP controlada,
apontamento isolado, qualidade, estoque, upload e expedição sem usar registros
fictícios na produção.

Monitoramento mínimo:

- monitor externo para `/healthz` e `/api/health`, a cada 1–5 minutos;
- alertas do hPanel para CPU, RAM e disco; revisar gráficos semanalmente;
- `docker compose ps` e logs JSON rotacionados;
- alerta de expiração/falha TLS pelo monitor externo;
- cron de backup com saída monitorada e teste Restic mensal (`restic check`);
- atualizações de segurança do Ubuntu/Docker em janela mensal, com snapshot e
  rollback definidos.

## 10. Pendências para concluir a publicação

1. Confirmar plano Hostinger já contratado e se a VPS é nova ou contém serviços.
2. Informar `<DOMINIO_DO_ERP>`, `<IP_DA_VPS>` e usuário de deploy (sem senhas).
3. Disponibilizar na VPS a conta de serviço Firebase e segredos do Graph/APIs.
4. Escolher armazenamento S3 compatível para backups externos.
5. Aprovar commit, janela de corte, responsáveis, RPO/RTO e procedimento de
   titularidade única dos gatilhos.
6. Autorizar o domínio no Firebase Auth e revisar CORS do Storage.

Até essas pendências serem resolvidas e o health/login no domínio final serem
confirmados, o sistema deve ser descrito como **preparado**, não publicado.

