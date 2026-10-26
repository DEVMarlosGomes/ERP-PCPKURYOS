'use strict';
/* PCP-02: prontidão para emitir OP (shared/prontidao-op.js) e a ligação na tela de emissão. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { prontidaoOp } = require('./public/shared/prontidao-op.js');

const ok = { status: 'APROVADA' };
const COMPLETO = { volume: 200, unidadeVolume: 'ml', prazoValidadeMeses: 24, densidadeGranel: 1, unCx: 24, kgCaixa: 5.2 };
const tudo = (produto, extra = {}) => prontidaoOp({ produto: { ...COMPLETO, ...produto }, formula: ok, bom: ok, especificacao: ok, ...extra });

// Legado (sem origemCrm): itens do CRM não se aplicam; o que falta vira aviso, não trava.
let r = tudo({ sku: 'WKBM0001' });
assert.deepEqual([r.crm, r.pode, r.aviso, r.faltando], [false, true, false, []]);
r = tudo({ sku: 'WKBM0001' }, { bom: { status: 'RASCUNHO' }, pendentesBom: 2 });
assert.deepEqual([r.pode, r.aviso, r.faltando], [true, true, ['cadastro', 'aprovacoes']]);
assert.match(r.itens.find((i) => i.chave === 'aprovacoes').rotulo, /falta: BOM/);
assert.match(r.itens.find((i) => i.chave === 'cadastro').rotulo, /2 pendentes/);

// SKU do CRM aguardando CGI: trava, com o motivo.
r = tudo({ sku: 'PRF-LUMI-0001', origemCrm: { orcamentoId: 'O1', origem_contratual_status: 'aguardando_cgi', kickoffStatus: 'aprovado' } });
assert.deepEqual([r.crm, r.pode, r.faltando], [true, false, ['cgi']]);

// CGI assinado e tudo aprovado: libera. SKU antiga (gerada no CGI, sem orçamento/kickoffStatus) também.
r = tudo({ origemCrm: { orcamentoId: 'O1', origem_contratual_status: 'cgi_assinado', kickoffStatus: 'aprovado', cgiContratoId: 'C1' } });
assert.deepEqual([r.pode, r.faltando], [true, []]);
r = tudo({ origemCrm: { cgiContratoId: 'C1', origem_contratual_status: 'cgi_assinado' } });
assert.deepEqual([r.pode, r.faltando], [true, []]);

// CRM com especificação em rascunho e item pendente: trava pelos dois.
r = tudo({ origemCrm: { cgiContratoId: 'C1', origem_contratual_status: 'cgi_assinado' } }, { especificacao: { status: 'RASCUNHO' }, pendentesFormula: 1 });
assert.deepEqual([r.pode, r.faltando], [false, ['cadastro', 'aprovacoes']]);
assert.match(r.avisoInsumos, /Dia D/);

// KO-09: SKU do CRM só vai para produção com o cadastro completo; legado não muda.
r = tudo({ origemCrm: { cgiContratoId: 'C1', origem_contratual_status: 'cgi_assinado' }, densidadeGranel: null, kgCaixa: 0 });
assert.deepEqual([r.pode, r.faltando], [false, ['sku']]);
assert.match(r.itens.find((i) => i.chave === 'sku').rotulo, /falta: densidade, kg\/caixa/);
r = prontidaoOp({ produto: { sku: 'LEG' }, formula: ok, bom: ok, especificacao: ok });
assert.deepEqual([r.pode, r.aviso], [true, false], 'legado sem cadastro completo segue como antes');

// Ligação na tela (o defeito costuma estar na ligação, não na função).
const html = fs.readFileSync(path.join(__dirname, 'public', 'emitir_op.html'), 'utf8');
assert.ok(html.indexOf('src="shared/prontidao-op.js"') > 0, 'emitir_op carrega o módulo');
assert.match(html, /ProntidaoOp\.prontidaoOp\(/, 'tela calcula a prontidão');
assert.match(html, /if \(prontidaoAtual && !prontidaoAtual\.pode\)/, 'emitir respeita a trava');
assert.match(html, /prontidaoNaEmissao:/, 'OP guarda a prontidão do momento da emissão');

console.log('run_prontidao_op_test: OK');
