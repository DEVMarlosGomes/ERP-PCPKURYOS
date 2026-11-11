'use strict';
/* Cobranças internas (11/11/2026): regras puras de functions/cobrancas.js.
     node run_cobrancas_test.js
   O serviço inteiro (gravação + e-mail) e as regras do banco rodam no emulador:
   run_cobrancas_emulator_test.js. */
const assert = require('assert/strict');
const C = require('./functions/cobrancas.js');

const usuarios = {
  ana: {nome: 'Ana PCP', role: 'pcp', email: 'ana@kuryos.com.br'},
  bia: {nome: 'Bia Qualidade', role: 'qualidade', email: 'bia@kuryos.com.br'},
  caio: {nome: 'Caio Produção', role: 'production'},
  adm: {nome: 'Admin', role: 'admin', email: 'adm@kuryos.com.br'},
  off: {nome: 'Desligado', role: 'pcp', email: 'off@kuryos.com.br', desativado: true},
  pend: {nome: 'Pendente', role: 'pending', email: 'p@kuryos.com.br'},
};
let n = 0;
const ok = (m) => { n++; console.log('  ok  ' + m); };
const falha = (fn, code, re) => assert.throws(fn, (e) => e.code === code && (!re || re.test(e.message)));
const T0 = '2026-11-11T12:00:00.000Z';
const mais = (min) => new Date(Date.parse(T0) + min * 60000).toISOString();

// ── Criação
const plano = C.criar({titulo: '  Enviar laudo do lote 2611-04 ', descricao: 'Precisa até sexta', para: ['bia', 'caio', 'bia', 'ana'], prazo: '2026-11-14', prioridade: 'alta', link: 'qualidade.html?tab=fila'}, usuarios, 'ana', T0);
assert.equal(plano.cobranca.titulo, 'Enviar laudo do lote 2611-04');
assert.deepEqual(Object.keys(plano.cobranca.para), ['bia', 'caio'], 'sem repetido e sem o próprio autor');
assert.equal(plano.cobranca.para.bia.nome, 'Bia Qualidade', 'nome vem do perfil, não do navegador');
assert.deepEqual(plano.cobranca.de, {uid: 'ana', nome: 'Ana PCP'});
assert.equal(plano.cobranca.status, 'ABERTA');
assert.deepEqual(plano.notificar, ['bia', 'caio']);
assert.equal(plano.evento.tipo, 'CRIADA');
ok('criação normaliza título, tira repetido e o próprio autor, nomes do perfil');

falha(() => C.criar({titulo: 'ab', para: ['bia']}, usuarios, 'ana', T0), 'invalid-argument', /título/);
falha(() => C.criar({titulo: 'Cobrar', para: []}, usuarios, 'ana', T0), 'invalid-argument', /quem vai receber/);
falha(() => C.criar({titulo: 'Cobrar', para: ['ana']}, usuarios, 'ana', T0), 'invalid-argument', /a si mesmo/);
falha(() => C.criar({titulo: 'Cobrar', para: ['off']}, usuarios, 'ana', T0), 'failed-precondition');
falha(() => C.criar({titulo: 'Cobrar', para: ['pend']}, usuarios, 'ana', T0), 'failed-precondition');
falha(() => C.criar({titulo: 'Cobrar', para: ['naoexiste']}, usuarios, 'ana', T0), 'failed-precondition');
falha(() => C.criar({titulo: 'Cobrar', para: ['bia'], prazo: '14/11/2026'}, usuarios, 'ana', T0), 'invalid-argument', /Prazo/);
falha(() => C.criar({titulo: 'Cobrar', para: ['bia'], link: 'https://fora.com/x.html'}, usuarios, 'ana', T0), 'invalid-argument', /Link/);
falha(() => C.criar({titulo: 'Cobrar', para: ['bia'], link: 'javascript:alert(1)'}, usuarios, 'ana', T0), 'invalid-argument', /Link/);
const muitos = {};
for (let i = 0; i < 21; i++) muitos['u' + i] = {nome: 'U' + i, role: 'pcp'};
falha(() => C.criar({titulo: 'Cobrar', para: Object.keys(muitos)}, Object.assign({}, usuarios, muitos), 'ana', T0), 'invalid-argument', /No máximo 20/);
assert.equal(C.criar({titulo: 'Cobrar', para: ['bia'], prioridade: 'qualquer'}, usuarios, 'ana', T0).cobranca.prioridade, 'normal');
ok('recusa título curto, sem destinatário, a si mesmo, inativo/pendente/inexistente, prazo e link inválidos, mais de 20');

// ── Ciclo
const c0 = plano.cobranca;
const bia = {uid: 'bia', perfil: usuarios.bia}, ana = {uid: 'ana', perfil: usuarios.ana}, adm = {uid: 'adm', perfil: usuarios.adm}, caio = {uid: 'caio', perfil: usuarios.caio};
const r1 = C.aplicarAcao(c0, 'RESPONDER', bia, {texto: 'Sai amanhã cedo'}, mais(5));
assert.equal(r1.cobranca.status, 'RESPONDIDA');
assert.deepEqual(r1.notificar.sort(), ['ana', 'caio'], 'resposta avisa os outros participantes');
assert.equal(c0.status, 'ABERTA', 'não muta o original');
const r1b = C.aplicarAcao(c0, 'RESPONDER', ana, {texto: 'Obrigada'}, mais(5));
assert.equal(r1b.cobranca.status, 'ABERTA', 'quem cobrou comentando não marca como respondida');
falha(() => C.aplicarAcao(c0, 'RESPONDER', bia, {texto: '  '}, mais(5)), 'invalid-argument');
falha(() => C.aplicarAcao(c0, 'RESPONDER', adm, {texto: 'x'}, mais(5)), 'permission-denied', /participa/);
falha(() => C.aplicarAcao(c0, 'RESPONDER', {uid: 'zz', perfil: usuarios.caio}, {texto: 'x'}, mais(5)), 'permission-denied');
ok('resposta do cobrado vira RESPONDIDA e avisa os outros; ADM e estranho não respondem');

falha(() => C.aplicarAcao(r1.cobranca, 'COBRAR_NOVAMENTE', ana, {}, mais(10)), 'failed-precondition', /Aguarde 20 min/);
falha(() => C.aplicarAcao(r1.cobranca, 'COBRAR_NOVAMENTE', bia, {}, mais(40)), 'permission-denied');
const r2 = C.aplicarAcao(r1.cobranca, 'COBRAR_NOVAMENTE', ana, {texto: 'Preciso hoje'}, mais(31));
assert.equal(r2.cobranca.status, 'ABERTA');
assert.equal(r2.cobranca.vezesCobrada, 2);
assert.deepEqual(r2.notificar, ['bia', 'caio']);
falha(() => C.aplicarAcao(r2.cobranca, 'COBRAR_NOVAMENTE', ana, {}, mais(40)), 'failed-precondition', /Aguarde/);
ok('cobrar de novo: só quem cobrou, intervalo de 30 min, volta a ABERTA e avisa os cobrados');

const r3 = C.aplicarAcao(r2.cobranca, 'CONCLUIR', caio, {}, mais(50));
assert.equal(r3.cobranca.status, 'CONCLUIDA');
assert.deepEqual(r3.cobranca.concluidaPor, {uid: 'caio', nome: 'Caio Produção'});
assert.deepEqual(r3.notificar.sort(), ['ana', 'bia']);
falha(() => C.aplicarAcao(r3.cobranca, 'RESPONDER', bia, {texto: 'x'}, mais(51)), 'failed-precondition', /Reabra/);
falha(() => C.aplicarAcao(r3.cobranca, 'CANCELAR', ana, {texto: 'motivo longo'}, mais(51)), 'failed-precondition');
falha(() => C.aplicarAcao(r3.cobranca, 'REABRIR', bia, {texto: 'não ficou bom'}, mais(51)), 'permission-denied');
falha(() => C.aplicarAcao(r3.cobranca, 'REABRIR', ana, {texto: ''}, mais(51)), 'invalid-argument');
const r4 = C.aplicarAcao(r3.cobranca, 'REABRIR', ana, {texto: 'Faltou a assinatura'}, mais(52));
assert.equal(r4.cobranca.status, 'ABERTA');
assert.equal(r4.cobranca.concluidaPor, undefined);
assert.deepEqual(r4.notificar, ['bia', 'caio']);
ok('concluir por qualquer cobrado; encerrada não aceita resposta; só quem cobrou reabre, com motivo');

falha(() => C.aplicarAcao(r4.cobranca, 'CANCELAR', bia, {texto: 'não é comigo'}, mais(53)), 'permission-denied');
falha(() => C.aplicarAcao(r4.cobranca, 'CANCELAR', ana, {texto: 'x'}, mais(53)), 'invalid-argument', /motivo/);
const r5 = C.aplicarAcao(r4.cobranca, 'CANCELAR', adm, {texto: 'Duplicada da outra'}, mais(53));
assert.equal(r5.cobranca.status, 'CANCELADA');
assert.deepEqual(r5.notificar, ['bia', 'caio']);
falha(() => C.aplicarAcao(r5.cobranca, 'RESPONDER', ana, {texto: 'x'}, mais(54)), 'failed-precondition');
falha(() => C.aplicarAcao(r4.cobranca, 'QUALQUER', ana, {}, mais(54)), 'invalid-argument');
falha(() => C.aplicarAcao({}, 'RESPONDER', ana, {texto: 'x'}, mais(54)), 'not-found');
ok('cancelar: quem cobrou ou ADM, com motivo; ação desconhecida e cobrança inexistente recusadas');

// ── Caixa e e-mail
const caixa = C.caminhosCaixa('k1', r1.cobranca, r1.notificar);
assert.equal(caixa['cobrancas_caixa/bia/k1/papel'], 'recebida');
assert.equal(caixa['cobrancas_caixa/bia/k1/aguardaVoce'], false, 'respondida não espera mais o cobrado');
assert.equal(caixa['cobrancas_caixa/ana/k1/papel'], 'enviada');
assert.equal(caixa['cobrancas_caixa/ana/k1/aguardaVoce'], true, 'respondida espera quem cobrou');
assert.equal(caixa['cobrancas_caixa/ana/k1/naoLida'], true);
assert.equal(caixa['cobrancas_caixa/bia/k1/naoLida'], undefined, 'quem agiu não fica com não lida');
assert.equal(caixa['cobrancas_caixa/caio/k1/aguardaVoce'], false);
assert.ok(Object.keys(caixa).every((k) => k.split('/').length === 4), 'só caminhos planos (folha), nunca objeto aninhado');
assert.equal(C.caminhosCaixa('k1', c0, ['bia'])['cobrancas_caixa/bia/k1/aguardaVoce'], true, 'aberta espera o cobrado');
ok('caixa: aguarda o cobrado na aberta e quem cobrou na respondida; naoLida só para quem foi avisado; caminhos planos');

const dest = C.enderecos(['bia', 'caio', 'off', 'ana', 'ana'], usuarios);
assert.deepEqual(dest.para, ['bia@kuryos.com.br', 'ana@kuryos.com.br']);
assert.deepEqual(dest.semEmail, ['Caio Produção', 'Desligado']);
const mail = C.montarEmail('k1', Object.assign({}, c0, {titulo: 'Laudo <b>x</b>', prioridade: 'urgente'}), {tipo: 'COBRADA_NOVAMENTE', nome: 'Ana PCP', texto: 'Hoje & já'});
assert.match(mail.assunto, /^\[URGENTE\] Cobrança: Laudo <b>x<\/b> — Ana PCP cobrou de novo$/);
assert.ok(mail.corpo.includes('Laudo &lt;b&gt;x&lt;/b&gt;'), 'título escapado no HTML');
assert.ok(mail.corpo.includes('Hoje &amp; já'));
assert.ok(mail.corpo.includes('https://kuryoserp.com.br/cobrancas.html?id=k1'), 'link para o domínio atual');
assert.ok(mail.corpo.includes('14/11/2026'));
ok('e-mail: só ativos com e-mail válido, sem repetir; assunto com prioridade; HTML escapado; link do domínio atual');

console.log('OK run_cobrancas_test: ' + n + ' grupos.');
