'use strict';
/* Fiscal — servidor (functions/fiscal_servidor.js) contra banco simulado: importação
   idempotente (XML imutável), eventos, período bloqueado/fechado, cadastros com histórico,
   apuração, EFD/SINTEGRA com retrato, fechamento, reabertura (ADM), transmissão e retificador.
   Também prova que nenhum update mistura caminho pai e filho (o RTDB recusa). */
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const Srv = require('./functions/fiscal_servidor');
const Fis = require('./functions/fiscal');
const X = require('./test-fixtures/fiscal-xml');

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); };
const eq = (a, b, m) => { n++; assert.deepEqual(a, b, m); };
function lanca(fn, re, m) { n++; assert.throws(fn, re, m); }
const util = { gzip: (t) => zlib.gzipSync(Buffer.from(t, 'utf8')).toString('base64'), sha256: (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex') };
const adm = { uid: 'u1', nome: 'Gustavo', role: 'admin' }, fiscal = { uid: 'u2', nome: 'Fiscal', role: 'pcp' };
let relogio = 0;
const agora = () => new Date(Date.UTC(2026, 10, 25, 12, 0, relogio++)).toISOString();
function semConflito(updates, m) {
  const ks = Object.keys(updates).sort();
  for (let i = 0; i < ks.length; i++) for (let j = 0; j < ks.length; j++) if (i !== j && ks[j].startsWith(ks[i] + '/')) assert.fail(m + ': ' + ks[i] + ' e ' + ks[j] + ' no mesmo update');
  n++;
}
function aplicar(b, updates) {
  semConflito(updates, 'aplicar');
  const c = JSON.parse(JSON.stringify(b));
  Object.entries(updates).forEach(([k, v]) => {
    const p = k.split('/'); let o = c;
    for (let i = 0; i < p.length - 1; i++) o = o[p[i]] = o[p[i]] || {};
    if (v === null) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = JSON.parse(JSON.stringify(v));
  });
  return c;
}
const ESTAB = { cnpj: X.KURYOS.cnpj, ie: X.KURYOS.ie, nome: X.KURYOS.nome, uf: 'SP', codMun: '3550308', cnae: '2063100', regime: 'NORMAL',
  codReceitaIcms: '046-2', diaVencimentoIcms: 20, contabilista: { nome: 'CONTADOR', cpf: '52998224725', crc: 'SP123456O8', codMun: '3550308', email: 'c@x.com' } };
const M = X.mesDeTeste();
const arq = (k) => ({ nome: k + '.xml', texto: typeof M[k] === 'string' ? M[k] : M[k].xml });

// ── 1. Importação ─────────────────────────────────────────────────────────
let base = { fis: {}, ctl: {} };
// cancelamento ANTES da nota no mesmo lote: fica pendente e é aplicado quando a nota chega
const lote = ['cancelamento', 'compraMp', 'compraPr', 'usoConsumo', 'simples', 'remessaCliente', 'saidaEncomenda', 'venda', 'vendaCancelada', 'cce', 'inut', 'frete'].map(arq);
let r = Srv.prepararImportacao(base, { arquivos: lote }, fiscal, agora(), util);
semConflito(r.updates, 'importação');
eq(r.resultados.filter((x) => x.ok).length, lote.length, 'todos os arquivos importados');
base = aplicar(base, r.updates);
const docs = base.fis.documentos;
eq(Object.keys(docs).length, 10, '9 documentos + 1 inutilização');
eq(docs[M.vendaCancelada.chave].situacao, '02', 'cancelamento que veio antes da nota é aplicado');
ok(docs[M.venda.chave].eventos['110110_1'], 'carta de correção guardada no documento (sem mudar a nota)');
eq(docs[M.venda.chave].situacao, '00', 'CC-e não cancela');
ok(!base.fis.eventos_pendentes, 'nenhum evento pendente sobrou');
ok(base.fis_xml[M.compraMp.chave].gz && base.fis_xml[M.compraMp.chave].sha256 === util.sha256(M.compraMp.xml), 'XML bruto guardado comprimido com hash');
eq(zlib.gunzipSync(Buffer.from(base.fis_xml[M.compraMp.chave].gz, 'base64')).toString('utf8'), M.compraMp.xml, 'XML guardado inteiro (imutável)');
eq(docs[M.compraMp.chave].indOper + docs[M.compraMp.chave].indEmit, '01', 'documento relativo à empresa');
eq(r.xmlsEntrada.map((x) => x.nome).sort(), ['compraMp.xml', 'compraPr.xml', 'remessaCliente.xml', 'simples.xml', 'usoConsumo.xml'], 'só NF-e de entrada de terceiro vai para o Financeiro');
// Idempotência
r = Srv.prepararImportacao(base, { arquivos: [arq('compraMp')] }, fiscal, agora(), util);
ok(r.resultados[0].repetido && !Object.keys(r.updates).length, 'mesmo XML de novo: repetido, nada muda');
// XML imutável
const adulterado = M.compraMp.xml.replace('<xNome>EMBALAGENS PAULISTA LTDA</xNome>', '<xNome>OUTRO NOME</xNome>');
lanca(() => Srv.prepararImportacao(base, { arquivos: [{ nome: 'x.xml', texto: adulterado }] }, fiscal, agora(), util), /imutável/, 'mesma chave com outro conteúdo: recusado');
// Sem protocolo → depois com protocolo: troca permitida
const semP = X.nfe({ emit: X.FORN_SP, dest: X.KURYOS, n: 5000, data: '2026-11-10', cStat: null, itens: [{ cProd: 'A', xProd: 'A', ncm: '39233000', cfop: '5101', un: 'UN', q: 1, vUn: 1 }] });
let b2 = aplicar(base, Srv.prepararImportacao(base, { arquivos: [{ nome: 's.xml', texto: semP.xml }] }, fiscal, agora(), util).updates);
eq(b2.fis.documentos[semP.chave].situacao, 'SEM_PROTOCOLO', 'nota sem protocolo entra marcada');
const comP = X.nfe({ emit: X.FORN_SP, dest: X.KURYOS, n: 5000, data: '2026-11-10', itens: [{ cProd: 'A', xProd: 'A', ncm: '39233000', cfop: '5101', un: 'UN', q: 1, vUn: 1 }] });
b2 = aplicar(b2, Srv.prepararImportacao(b2, { arquivos: [{ nome: 'p.xml', texto: comP.xml }] }, fiscal, agora(), util).updates);
eq(b2.fis.documentos[semP.chave].situacao, '00', 'o autorizado substitui o sem protocolo');
// Nota de outra empresa: erro só daquele arquivo
const outra = X.nfe({ emit: X.FORN_SP, dest: X.FORN_PR, n: 1, data: '2026-11-10', itens: [{ cProd: 'A', xProd: 'A', ncm: '1', cfop: '6101', un: 'UN', q: 1, vUn: 1 }] });
r = Srv.prepararImportacao(base, { arquivos: [{ nome: 'outra.xml', texto: outra.xml }, { nome: 'nova.xml', texto: X.nfe({ emit: X.FORN_SP, dest: X.KURYOS, n: 6000, data: '2026-11-11', itens: [{ cProd: 'B', xProd: 'B', ncm: '39233000', cfop: '5101', un: 'UN', q: 1, vUn: 1 }] }).xml }] }, fiscal, agora(), util);
ok(!r.resultados[0].ok && /não é da empresa/.test(r.resultados[0].motivo) && r.resultados[1].ok, 'arquivo de outra empresa recusado, o resto entra');
lanca(() => Srv.prepararImportacao(base, { arquivos: [{ nome: 'o.xml', texto: outra.xml }] }, fiscal, agora(), util), /não é da empresa/, 'lote sem nenhum válido: erro com o motivo');
// Bloqueio de período (Controladoria › Bloqueio, módulo FISCAL) e mês fechado
const bq = Object.assign({}, base, { ctl: { bloqueio_periodo: { modulos: { FISCAL: { de: '2026-12-01', ate: '2050-12-31' } } } } });
r = Srv.prepararImportacao(bq, { arquivos: [{ nome: 'n.xml', texto: X.nfe({ emit: X.FORN_SP, dest: X.KURYOS, n: 7000, data: '2026-11-12', itens: [{ cProd: 'C', xProd: 'C', ncm: '39233000', cfop: '5101', un: 'UN', q: 1, vUn: 1 }] }).xml }, arq('compraMp')] }, fiscal, agora(), util);
ok(!r.resultados[0].ok && /Movto Fiscal.*bloqueado/.test(r.resultados[0].motivo), 'documento fora da janela liberada (FISCAL) é recusado');
const fech = aplicar(base, { 'fis/fechamentos/2026-11': { status: 'FECHADO' } });
lanca(() => Srv.prepararImportacao(fech, { arquivos: [{ nome: 'n.xml', texto: X.nfe({ emit: X.FORN_SP, dest: X.KURYOS, n: 7001, data: '2026-11-12', itens: [{ cProd: 'C', xProd: 'C', ncm: '39233000', cfop: '5101', un: 'UN', q: 1, vUn: 1 }] }).xml }] }, fiscal, agora(), util), /fechado/, 'mês fiscal fechado não recebe documento');

// ── 2. Cadastros ──────────────────────────────────────────────────────────
r = Srv.prepararCadastro(base, { tipo: 'ESTABELECIMENTO', dados: ESTAB }, adm, agora());
semConflito(r.updates, 'estabelecimento');
base = aplicar(base, r.updates);
eq(base.fis.estabelecimento.contabilista.crc, 'SP123456O8', 'contabilista gravado');
lanca(() => Srv.prepararCadastro(base, { tipo: 'ESTABELECIMENTO', dados: Object.assign({}, ESTAB, { regime: 'SIMPLES' }) }, fiscal, agora()), /Só o ADM muda o regime/, 'regime só o ADM muda');
lanca(() => Srv.prepararCadastro(base, { tipo: 'ESTABELECIMENTO', dados: Object.assign({}, ESTAB, { cnpj: '123' }) }, adm, agora()), /CNPJ/, 'CNPJ inválido recusado');
r = Srv.prepararCadastro(base, { tipo: 'REGRAS_SUGERIDAS', mes: '2026-11', tipoItemPorCfop: { '5102': '07' } }, fiscal, agora());
base = aplicar(base, r.updates);
eq(r.criadas.sort(), ['5101', '5102', '5353', '5901', '6101'], 'sugestão em lote para cada CFOP sem regra no mês');
eq(base.fis.regras_entrada['5102'].cfopEntrada, '1556', '5102 de uso e consumo → 1556');
r = Srv.prepararCadastro(base, { tipo: 'REGRA', dados: Object.assign({}, base.fis.regras_entrada['5101'], { creditaIPI: false }) }, fiscal, agora());
base = aplicar(base, r.updates);
ok(Object.keys(base.fis.historico.regras_entrada['5101']).length === 1, 'regra alterada: a anterior vai para o histórico');
lanca(() => Srv.prepararCadastro(base, { tipo: 'DEPARA', dados: { fornecedor: X.FORN_SP.cnpj, cProd: 'FR-200', item: 'NAO-EXISTE' } }, fiscal, agora()), /Itens fiscais/, 'de-para exige o item interno cadastrado');
base = aplicar(base, Srv.prepararCadastro(base, { tipo: 'ITEM', dados: { codigo: 'FR-200ML', descr: 'FRASCO 200ML', un: 'UN', tipoItem: '02', ncm: '39233000', material: 'EP-0001' } }, fiscal, agora()).updates);
base = aplicar(base, Srv.prepararCadastro(base, { tipo: 'DEPARA', dados: { fornecedor: X.FORN_SP.cnpj, cProd: 'FR-200', item: 'FR-200ML' } }, fiscal, agora()).updates);
ok(base.fis.de_para_itens[X.FORN_SP.cnpj]['FR-200'].item === 'FR-200ML', 'de-para gravado por fornecedor/código');
r = Srv.prepararCadastro(base, { tipo: 'DATA_ENTRADA', chave: M.compraPr.chave, data: '2026-11-06' }, fiscal, agora());
base = aplicar(base, r.updates);
eq(Fis.dataEscrituracao(base.fis.documentos[M.compraPr.chave]), '2026-11-06', 'data de entrada informada muda a escrituração');
lanca(() => Srv.prepararCadastro(base, { tipo: 'DATA_ENTRADA', chave: M.venda.chave, data: '2026-11-25' }, fiscal, agora()), /entrada de terceiro/, 'saída não tem data de entrada');

// ── 3. Apuração ───────────────────────────────────────────────────────────
lanca(() => Srv.prepararApuracao(base, { mes: '2026-11', ajustes: [{ codigo: 'XX', valorCentavos: 1 }] }, fiscal, agora()), /Ajuste inválido/, 'ajuste com código ruim recusado');
r = Srv.prepararApuracao(base, { mes: '2026-11', ajustes: [{ codigo: 'SP020799', descricao: 'Outros créditos', valorCentavos: 10000 }], saldoCredorAnteriorInformado: 0 }, fiscal, agora());
base = aplicar(base, r.updates);
eq(base.fis.apuracao['2026-11'].e110.VL_TOT_AJ_CREDITOS, 10000, 'apuração com o ajuste');
ok(base.fis.apuracao['2026-11'].e110.VL_ICMS_RECOLHER > 0, 'ICMS a recolher calculado');

// ── 4. EFD ────────────────────────────────────────────────────────────────
r = Srv.prepararEfd(base, { mes: '2026-11' }, fiscal, agora(), util);
ok(r.ok, 'EFD gerada: ' + (r.inconsistencias || []).filter((i) => i.impeditivo).map((i) => i.descricao).join(' | '));
semConflito(r.updates, 'efd');
ok(/^\|0000\|020\|0\|01112026\|30112026\|/.test(r.texto), 'texto do arquivo devolvido');
base = aplicar(base, r.updates);
const idEfd = r.id;
const meta = base.fis.arquivos['2026-11'][idEfd];
ok(meta.hash === util.sha256(r.texto) && meta.totaisPorRegistro.C100 === 10 && meta.e110, 'retrato: hash, totais por registro e E110');
eq(zlib.gunzipSync(Buffer.from(base.fis_arquivos[idEfd].gz, 'base64')).toString('utf8'), r.texto, 'conteúdo guardado em fis_arquivos');
ok(base.fis.arquivos['2026-11'][idEfd].e110.VL_TOT_AJ_CREDITOS === 10000, 'o ajuste da apuração entrou no arquivo');
// Faturamento com NF sem XML: impeditivo
const comFat = Object.assign({}, base, { agendamentos_expedicao: { a: { faturamento: { nfs: { x: { numero: '999', chaveNfe: X.chave(35, '2611', X.KURYOS.cnpj, '55', 2, 999), emitidaEm: '2026-11-20', valor: 1 } } } } } });
const rf = Srv.prepararEfd(comFat, { mes: '2026-11' }, fiscal, agora(), util);
ok(!rf.ok && !Object.keys(rf.updates).length && rf.inconsistencias.some((i) => /Faturamento/.test(i.grupo)), 'NF do Faturamento sem XML: nada gravado, relatório de inconsistências');
lanca(() => Srv.prepararEfd(base, { mes: '2026-11', codFin: 1 }, fiscal, agora(), util), /retificador\) só depois/, 'retificador só depois de transmitir o original');
// Transmissão
lanca(() => Srv.prepararTransmissao(base, { mes: '2026-11', arquivo: idEfd, recibo: '1' }, fiscal, agora()), /recibo/, 'recibo obrigatório');
base = aplicar(base, Srv.prepararTransmissao(base, { mes: '2026-11', arquivo: idEfd, recibo: 'AB12CD34EF56', data: '2026-12-10' }, fiscal, agora()).updates);
lanca(() => Srv.prepararTransmissao(base, { mes: '2026-11', arquivo: idEfd, recibo: 'AB12CD34EF56' }, fiscal, agora()), /já foi registrada/, 'transmissão não se registra duas vezes');
lanca(() => Srv.prepararEfd(base, { mes: '2026-11' }, fiscal, agora(), util), /já foi transmitido/, 'original transmitido não se sobrescreve');
r = Srv.prepararEfd(base, { mes: '2026-11', codFin: 1 }, fiscal, agora(), util);
ok(r.ok && /^\|0000\|020\|1\|/.test(r.texto), 'substituto: COD_FIN 1');
base = aplicar(base, r.updates);
eq(Object.keys(base.fis.arquivos['2026-11']).length, 2, 'original e substituto guardados lado a lado');

// ── 5. Fechamento e reabertura ────────────────────────────────────────────
lanca(() => Srv.prepararFechamento(base, { mes: '2026-10' }, fiscal, agora()), /Gere o SPED/, 'fechar exige o arquivo do mês');
base = aplicar(base, Srv.prepararFechamento(base, { mes: '2026-11' }, fiscal, agora()).updates);
eq(base.fis.fechamentos['2026-11'].status, 'FECHADO', 'mês fechado');
r = Srv.prepararEfd(base, { mes: '2026-11' }, fiscal, agora(), util);
ok(r.jaFechado && r.arquivo === base.fis.fechamentos['2026-11'].arquivo && !Object.keys(r.updates).length, 'mês fechado: devolve o arquivo guardado, não regera');
lanca(() => Srv.prepararApuracao(base, { mes: '2026-11', ajustes: [] }, fiscal, agora()), /fechado/, 'apuração de mês fechado não muda');
lanca(() => Srv.prepararCadastro(base, { tipo: 'DATA_ENTRADA', chave: M.compraMp.chave, data: '2026-11-04' }, fiscal, agora()), /fechado/, 'data de entrada em mês fechado não muda');
lanca(() => Srv.prepararReabertura(base, { mes: '2026-11', justificativa: 'Retificar a nota 470 do cliente' }, fiscal, agora()), /Só o ADM/, 'só o ADM reabre');
lanca(() => Srv.prepararReabertura(base, { mes: '2026-11', justificativa: 'curta' }, adm, agora()), /Justifique/, 'reabrir exige justificativa');
r = Srv.prepararReabertura(base, { mes: '2026-11', justificativa: 'Retificar a nota 470 do cliente' }, adm, agora());
semConflito(r.updates, 'reabertura');
base = aplicar(base, r.updates);
eq(base.fis.fechamentos['2026-11'].status, 'REABERTO', 'reaberto, com histórico');
// Saldo credor do mês seguinte vem da apuração anterior
const sa = Srv.saldosAnteriores(aplicar(base, { 'fis/apuracao/2026-11/e110/VL_SLD_CREDOR_TRANSPORTAR': 777 }), '2026-12');
eq([sa.saldoCredorTransportar, sa.fonte], [777, 'APURACAO_ANTERIOR'], 'saldo credor anterior vem da apuração do mês anterior');

// ── 6. SINTEGRA e inventário ──────────────────────────────────────────────
r = Srv.prepararSintegra(base, { mes: '2026-11', finalidade: 1 }, fiscal, agora(), util);
ok(r.ok && r.texto.split('\r\n').filter(Boolean).every((l) => l.length === 126), 'SINTEGRA gerado e guardado');
ok(Object.keys(r.updates).some((k) => k.startsWith('fis_arquivos/SINTEGRA_')), 'retrato do SINTEGRA');
const bInv = Object.assign({}, base, { estoque: { 'EP-0001': { saldoAtual: 100 } }, materiais: { 'EP-0001': { mpCodigo: 'EP-0001', unidade: 'UN', tipo: 'EP' } }, custos_precos: { 'EP-0001': { valor: 0.85, unidade: 'UN' } } });
r = Srv.prepararInventario(bInv, { data: '2026-12-31' }, fiscal, agora());
ok(r.ok && r.updates['fis/inventarios/2026-12-31'].itens[0].codItem === 'FR-200ML', 'inventário usa o item fiscal ligado ao material');
const bInv2 = aplicar(bInv, r.updates);
ok(Srv.inventarioDoMes(bInv2, '2027-02', false).data === '2026-12-31', 'fevereiro usa o inventário de 31/12');
r = Srv.prepararInventario(Object.assign({}, base, { estoque: { 'EP-0001': { saldoAtual: -1 } } }), { data: '2026-12-31' }, fiscal, agora());
ok(!r.ok && r.inconsistencias.some((i) => /negativo/.test(i.descricao)), 'inventário com saldo negativo: gravado com a inconsistência (a tela mostra), EFD bloqueia');

// ── 7. Permissões ─────────────────────────────────────────────────────────
ok(Srv.ehFiscal({ role: 'admin' }) && Srv.ehFiscal({ role: 'pcp', modulos: { fiscal: true } }) && !Srv.ehFiscal({ role: 'pcp', modulos: { financeiro: true } }), 'Fiscal: ADM ou módulo fiscal');
ok(Srv.podeImportar({ role: 'x', modulos: { financeiro: true } }) && !Srv.podeImportar({ role: 'x', modulos: {} }), 'importar XML: também o Financeiro (Q8)');

console.log(`OK fiscal (servidor): ${n} verificações — importação idempotente, eventos, bloqueio/fechamento, cadastros com histórico, apuração, EFD/SINTEGRA com retrato, transmissão e retificador, reabertura só ADM, inventário.`);
