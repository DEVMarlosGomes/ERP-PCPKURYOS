'use strict';
/* Contrato da Central de Ajuda: o índice precisa explicar a cadeia completa,
   nomear cada dono e apontar apenas para portas reais do sistema. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = __dirname;
const html = fs.readFileSync(path.join(raiz, 'public', 'manuais.html'), 'utf8');
let n = 0;
function ok(cond, msg) { n++; assert.ok(cond, msg); }

ok(/id="fluxo-ponta-a-ponta"/.test(html), 'falta o fluxo ponta a ponta');
ok(/id="setores"/.test(html), 'falta a visão por setor');
ok(/id="dependencias-operacionais"/.test(html), 'falta separar dependências operacionais');
ok(/id="workflow-search"/.test(html), 'falta busca');
ok(/data-help-filter="todos"/.test(html), 'falta filtro geral');
ok(/shared\/manuais-workflow\.js/.test(html), 'comportamento da ajuda deve ficar no módulo exclusivo');

const setores = [
  'Comercial', 'P&amp;D', 'Cadastros', 'PCP', 'Compras', 'Armazém',
  'Manipulação', 'Produção e Rotulagem', 'Qualidade', 'Expedição',
  'Financeiro e Controladoria', 'RH', 'Manutenção', 'Administração e Auditoria'
];
setores.forEach((setor) => ok(html.includes(setor), 'setor ausente: ' + setor));

['Entrada', 'Funcionalidades', 'Saída', 'Próxima etapa'].forEach((campo) =>
  ok(html.includes(field(campo)), 'campo de handoff ausente: ' + campo));

function field(texto) { return '<dt>' + texto + '</dt>'; }

const passos = [...html.matchAll(/class="workflow-step[^"\n]*"/g)];
ok(passos.length >= 16, 'fluxo principal deve ter ao menos 16 passagens, achou ' + passos.length);
ok(/badge-orange[^>]*>Manual</.test(html), 'passos manuais precisam estar marcados');
ok(/Dia D/.test(html) && /trava de saldo/.test(html), 'Dia D e a dependência da trava de saldo precisam estar explícitos');
ok(/15 minutos/.test(html), 'granularidade decidida do planejamento precisa constar');
ok(/ritmo real/.test(html), 'reprogramação por ritmo real precisa constar');

const links = [...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1].split('?')[0]);
const externos = /^(?:https?:|mailto:|tel:)/;
links.filter((href) => !externos.test(href)).forEach((href) => {
  const destino = path.join(raiz, 'public', href);
  ok(fs.existsSync(destino), 'link local não existe: ' + href);
});

console.log('OK Central de Ajuda: ' + n + ' contratos — fluxo completo, setores, handoffs, dependências e links reais.');
