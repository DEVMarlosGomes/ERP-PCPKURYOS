// Registro do ajuste executado UMA vez em 17/11/2026 (ver AUDITORIA_AJUSTE_BIOFLORA_20261116.md).
// Lia os JSONs baixados (só leitura) da pasta da sessão; não rode de novo: os valores já foram aplicados.
// Ajuste Bioflora (16/11/2026): paletes ao físico da planilha do Gustavo e
// apontamento da 26302/01 (3.470 -> 1.460). Decisão do usuário: "4 PODE".
// Uso: node ajuste.js            -> plano + simulação de consistência (nada grava)
//      node ajuste.js --um       -> grava SÓ o primeiro palete (conferir)
//      node ajuste.js --aplicar  -> grava o resto
// Gravação por caminhos PLANOS (CLAUDE.md: update com objeto aninhado apaga campos).
const fs = require('fs'), path = require('path'), {execFileSync} = require('child_process');
const D = __dirname, REPO = 'c:/Users/Marlos/Documents/PCP-Kuryos-main';
const J = (n) => JSON.parse(fs.readFileSync(D + '/' + n + '.json', 'utf8') || 'null') || {};
global.ExpedicaoPA = require(REPO + '/public/shared/expedicao.js');
const Conc = require(REPO + '/public/shared/conciliacao-pedidos.js');
const CO = require(REPO + '/public/shared/consistencia-producao.js');
const AGORA = new Date().toISOString();
const POR = 'Claude (ajuste Bioflora pedido pelo Marlos)';
const MOTIVO = 'Ajuste ao físico final da Bioflora (planilha do Gustavo, 16/11/2026), após o retrabalho do envase trocado (RNC-2026-011 / RR-26302-01-1).';

// Composição final de cada palete (planilha, 6 un/cx). Lote com 2 paletes e 1 linha na planilha:
// a diferença vai no palete que já tinha a caixa parcial / o maior (anotado no relatório).
const ALVO = {
  'PRF-BIOF-0002/pa_26264-06_p1': [430, 4],
  'PRF-BIOF-0002/pa_26264-07_p2': [339, 5],   // 26264/07: P1 144 cx fica; P2 336+5 -> 339+5 (total 483+5 = 2.903)
  'PRF-BIOF-0005/pa_26264-15_p1': [474, 0],
  'PRF-BIOF-0003/pa_26264-21_p1': [483, 0],
  'PRF-BIOF-0006/pa_26302-01_p1': [243, 2],
  'PRF-BIOF-0006/pa_26264-17_p2': [376, 0],   // 26264/17: P1 384 fica; P2 375 -> 376 (total 760 cx = 4.560)
  'PRF-BIOF-0007/pa_26315-02_p1': [485, 0]
};
const lotes = J('estoque_lotes'), ops = J('ops'), pedidos = J('pedidos'), registros = J('registros');
const updates = {}, linhasRelatorio = [];
let ordem = 0;
for (const [ref, [cx, par]] of Object.entries(ALVO)) {
  const [i, k] = ref.split('/'), l = lotes[i][k];
  if (!l) throw new Error('palete sumiu: ' + ref);
  const upc = Number(l.unidadesPorCaixa) || 6, novo = cx * upc + par, antes = {caixasFechadas: l.caixasFechadas, unidadesCaixaParcial: l.unidadesCaixaParcial || 0, saldoLote: l.saldoLote};
  if (antes.caixasFechadas * upc + antes.unidadesCaixaParcial !== antes.saldoLote) throw new Error('composição atual não fecha: ' + ref);
  const p = 'estoque_lotes/' + i + '/' + k + '/';
  const id = 'aj_bioflora_20261116';
  const u = {};
  u[p + 'caixasFechadas'] = cx; u[p + 'unidadesCaixaParcial'] = par; u[p + 'saldoLote'] = novo; u[p + 'atualizadoEm'] = AGORA;
  u[p + 'ajustesSaldo/' + id + '/em'] = AGORA; u[p + 'ajustesSaldo/' + id + '/por'] = POR; u[p + 'ajustesSaldo/' + id + '/motivo'] = MOTIVO;
  u[p + 'ajustesSaldo/' + id + '/antes'] = antes; u[p + 'ajustesSaldo/' + id + '/depois'] = {caixasFechadas: cx, unidadesCaixaParcial: par, saldoLote: novo};
  const mov = 'movimentos_estoque/' + i + '/aj_bioflora_20261116_' + k;
  u[mov] = {tipo: 'ajuste', motivo: 'AJUSTE AO FÍSICO (planilha Bioflora 16/11)', qtd: novo - antes.saldoLote, saldoApos: novo, loteKey: k,
    ref: (l.identificadorPalete || k) + ': ' + antes.saldoLote + ' -> ' + novo, enderecoKey: l.enderecoKey || null, enderecoCodigo: l.enderecoCodigo || null,
    itemTipo: l.itemTipo || 'produto', itemCodigo: l.itemCodigo || i, itemNome: l.itemNome || null, unidade: l.unidade || 'un', autor: POR, em: AGORA};
  updates[ref] = {ordem: ordem++, u};
  linhasRelatorio.push([l.identificadorPalete, l.opLote, antes.caixasFechadas + '+' + antes.unidadesCaixaParcial + ' = ' + antes.saldoLote, cx + '+' + par + ' = ' + novo, novo - antes.saldoLote]);
  l.caixasFechadas = cx; l.unidadesCaixaParcial = par; l.saldoLote = novo;  // para a simulação
}

// Apontamento 26302/01: Linha 2 de 2.358 -> 348 (soma Linha 3.470 -> 1.460).
const REG = {data: '2026-10-30', key: '-P5DELvireea04fjuoCc'};
const reg = registros[REG.data][REG.key];
if (reg.lote !== '26302/01' || Number(reg.quantidade) !== 2358) throw new Error('registro mudou: ' + JSON.stringify(reg));
const op = ops['26302-01'], ped = pedidos['PED-0001__PRF-BIOF-0006'];
if (op.produzidoLinha !== 3470 || ped.produzido !== 8024) throw new Error('OP/pedido mudaram: ' + op.produzidoLinha + ' ' + ped.produzido);
const DELTA = -2010;
const uAp = {};
const rp = 'registros/' + REG.data + '/' + REG.key + '/';
uAp[rp + 'quantidade'] = 2358 + DELTA;
uAp[rp + 'obs'] = ((reg.obs ? reg.obs + ' | ' : '') + 'Ajuste 16/11/2026: 2.358 -> 348. 2.010 un. eram Sunrise Muse envasadas como Rose; reenvasadas na OP 26264/14 (RNC-2026-011, RR-26302-01-1).').slice(0, 1000);
uAp[rp + 'ajusteProducao'] = {em: AGORA, por: POR, antes: 2358, depois: 348, motivo: MOTIVO};
uAp['ops/26302-01/produzidoLinha'] = 1460;
uAp['ops/26302-01/produzido'] = 1460;
uAp['ops/26302-01/ajustesProducao/aj_bioflora_20261116'] = {em: AGORA, por: POR, campo: 'produzidoLinha', antes: 3470, depois: 1460, motivo: MOTIVO, registro: REG.data + '/' + REG.key};
uAp['pedidos/PED-0001__PRF-BIOF-0006/produzido'] = 8024 + DELTA;
uAp['pedidos/PED-0001__PRF-BIOF-0006/ultimoApontamento'] = AGORA;
updates['APONTAMENTO 26302/01'] = {ordem: ordem++, u: uAp};
linhasRelatorio.push(['OP 26302/01 (Linha)', '26302/01', '3.470 (registro 2.358 + 1.112)', '1.460 (registro 348 + 1.112)', DELTA]);
linhasRelatorio.push(['Pedido PED-0001 Rose', 'PRF-BIOF-0006', '8.024', '6.014', DELTA]);

// Recontagem física na Conferência de PA: a planilha é a contagem mais nova. A conciliação
// passa a refletir físico − apontado; o antes fica em recontagens/ (nada se apaga).
const confs = J('conferencias_pa');
const FISICO = {'26264-06': 2584, '26264-07': 2903, '26264-15': 2844, '26264-21': 2898, '26302-01': 1460, '26264-17': 4560, '26315-02': 2910};
const APONT_DEPOIS = {'26302-01': 1460};
const confsDepois = JSON.parse(JSON.stringify(confs));
for (const [opk, fis] of Object.entries(FISICO)) {
  const c = confs[opk];
  if (!c || !c.conciliacao) throw new Error('conferência sem conciliação: ' + opk);
  const ap = APONT_DEPOIS[opk] != null ? APONT_DEPOIS[opk] : Number(ops[opk].produzidoLinha);
  const dif = fis - ap;
  const u = {}, cp = 'conferencias_pa/' + opk + '/';
  u[cp + 'qtdPaletizada'] = fis;
  u[cp + 'conciliacao/diferenca'] = dif;
  u[cp + 'conciliacao/observacao'] = ((c.conciliacao.observacao ? c.conciliacao.observacao + ' | ' : '') + 'Recontagem física 16/11/2026 (planilha Bioflora): ' + fis + ' un.').slice(0, 1000);
  u[cp + 'recontagens/aj_bioflora_20261116'] = {em: AGORA, por: POR, motivo: MOTIVO, fonte: 'Planilha final da Bioflora (Gustavo, 16/11/2026)',
    qtdPaletizadaAntes: c.qtdPaletizada != null ? c.qtdPaletizada : null, diferencaAntes: c.conciliacao.diferenca != null ? c.conciliacao.diferenca : 0,
    qtdApontadaNaRecontagem: ap, qtdPaletizadaDepois: fis, diferencaDepois: dif};
  updates['CONF ' + opk] = {ordem: ordem++, u};
  confsDepois[opk].qtdPaletizada = fis; confsDepois[opk].conciliacao.diferenca = dif;
  linhasRelatorio.push(['Conferência ' + opk, '', 'físico ' + (c.qtdPaletizada) + ' (dif ' + (c.conciliacao.diferenca || 0) + ')', 'físico ' + fis + ' (dif ' + dif + ')', fis - (c.qtdPaletizada || 0)]);
}

// ── Simulação de consistência (antes × depois) para as OPs da Bioflora ──
function rncs(base) {
  const conc = Conc.calcular(base);
  return CO.avaliar(base, conc).filter((x) => /2626[4]|26302|26315/.test(x.opKey || '')).map((x) => x.tipo + ' ' + x.opKey + ' (' + x.qtd + ')');
}
const baseAntes = {ops: J('ops'), pedidos: J('pedidos'), pedidos_comerciais: J('pedidos_comerciais'), estoque_lotes: J('estoque_lotes'),
  conferencias_pa: J('conferencias_pa'), expedicoes_comerciais: J('expedicoes_comerciais'), agendamentos_expedicao: J('agendamentos_expedicao')};
const baseDepois = Object.assign({}, baseAntes, {estoque_lotes: lotes, conferencias_pa: confsDepois});
baseDepois.ops = JSON.parse(JSON.stringify(baseAntes.ops)); baseDepois.ops['26302-01'].produzidoLinha = 1460; baseDepois.ops['26302-01'].produzido = 1460;
baseDepois.pedidos = JSON.parse(JSON.stringify(baseAntes.pedidos)); baseDepois.pedidos['PED-0001__PRF-BIOF-0006'].produzido = 6014;
const antesR = rncs(baseAntes), depoisR = rncs(baseDepois);
console.log('RNC automáticas (motor) ANTES :', antesR.join(' | ') || 'nenhuma');
console.log('RNC automáticas (motor) DEPOIS:', depoisR.join(' | ') || 'nenhuma');
console.table(linhasRelatorio.map((r) => ({palete: r[0], lote: r[1], antes: r[2], depois: r[3], delta: r[4]})));
fs.writeFileSync(D + '/plano_updates.json', JSON.stringify(updates, null, 1));

const modo = process.argv[2];
if (!modo) { console.log('\nSimulação apenas. Nada gravado.'); process.exit(0); }
const F = 'C:/Users/Marlos/AppData/Roaming/npm/firebase.cmd';
function gravar(nome, u) {
  const arq = path.join(D, 'upd_' + String(nome).replace(/[^A-Za-z0-9]/g, '_') + '.json');
  fs.writeFileSync(arq, JSON.stringify(u));
  execFileSync(F, ['database:update', '/', arq, '--project', 'erpkuryos', '--force'], {stdio: 'inherit', shell: true, env: Object.assign({}, process.env, {MSYS_NO_PATHCONV: '1'})});
  console.log('gravado:', nome, Object.keys(u).length, 'caminhos');
}
const lista = Object.entries(updates).sort((a, b) => a[1].ordem - b[1].ordem);
if (modo === '--um') { gravar(lista[0][0], lista[0][1].u); process.exit(0); }
if (modo === '--aplicar') { lista.slice(1).forEach(([n, x]) => gravar(n, x.u)); process.exit(0); }
