'use strict';
/* Remontar palete, planejar a carga por rota e editar a carga (16/11/2026).

   Pedido do Gustavo e do Vicenzo no caso Bioflora: "vamos ter que remontar
   para atender o frete do cliente"; "funcionalidade de planejamento de
   remontar palete, remontar carga, editar como um CRUD". O plano por rota usa
   os números reais da planilha do Gustavo (CARGA: PF 418 + GVT 418 caixas por
   produto, sobra na 3ª rota; Sunrise só 395 por rota). */
const assert = require('node:assert/strict');
const R = require('./public/shared/remontar-palete.js');
const {prepararFinalizacao} = require('./functions/conferencia_pa');
const {prepararAgenda} = require('./functions/agenda_expedicao');
const {prepararFaturamento} = require('./functions/faturamento_carga');
const CargasPA = require('./public/shared/cargas-pa.js');

const clone = (x) => JSON.parse(JSON.stringify(x));
let n = 0; const ok = (m) => { n++; console.log('  ok  ' + m); };

// ── 1. Plano por rota (planilha do Gustavo) ──────────────────────────
const pal = (sku, id, cx, parcial, op) => ({itemKey: sku, loteKey: 'pa_' + id, lote: {itemCodigo: sku, itemNome: sku, identificadorPalete: 'PA-' + id,
  opLote: op || id, opKey: op || id, caixasFechadas: cx, unidadesPorCaixa: 6, unidadesCaixaParcial: parcial, saldoLote: cx * 6 + parcial}});
const paletes = [pal('INFINITY', '26264-06', 430, 4), pal('INFINITY', '26264-07', 483, 5), pal('SUNRISE', '26264-14', 327, 3), pal('SUNRISE', '26264-13', 466, 0)];
const plano = R.planejarRotas(paletes, [{nome: 'PF', caixas: {INFINITY: 418, SUNRISE: 395}}, {nome: 'GVT', caixas: {INFINITY: 418, SUNRISE: 395}}]);
const inf = plano.skus.find((s) => s.sku === 'INFINITY'), sun = plano.skus.find((s) => s.sku === 'SUNRISE');
assert.equal(inf.disponivel, 913); assert.equal(inf.pedido, 836); assert.equal(inf.sobra, 77, 'Infinity Rouge: 913 − 836 = 77 (Palete 3a Rota)');
assert.equal(sun.disponivel, 793); assert.equal(sun.sobra, 3, 'Sunrise Muse [FINAL]: 793 − 790 = 3');
assert.deepEqual(inf.porRota.map((r) => [r.rota, r.atendido, r.falta]), [['PF', 418, 0], ['GVT', 418, 0]]);
// Soma das caixas por rota = cota; nenhuma caixa usada duas vezes.
const pf = plano.rotas[0];
const caixasPf = pf.inteiros.filter((x) => x.sku === 'INFINITY').reduce((t, x) => t + x.caixas, 0) + pf.transferencias.filter((x) => x.sku === 'INFINITY').reduce((t, x) => t + x.caixas, 0);
assert.equal(caixasPf, 418);
assert.ok(plano.operacoes.every((o) => o.caixas > 0 && o.destino.tipo === 'PALETE' && /^R-(PF|GVT)-/.test(o.destino.identificador)), 'operações levam a paletes de rota');
// Falta: a "Sunrise Muse Tentativa" da planilha pedia 418+418 sem estoque (−836).
const semEstoque = R.planejarRotas([], [{nome: 'PF', caixas: {SUNRISE: 418}}, {nome: 'GVT', caixas: {SUNRISE: 418}}]);
assert.equal(semEstoque.skus[0].sobra, -836, 'falta aparece negativa, como na planilha');
assert.equal(semEstoque.skus[0].porRota[0].falta, 418);
ok('plano por rota: 418 + 418 por produto, sobra 77 (Infinity) e 3 (Sunrise), falta −836 sem estoque');

// ── 2. Transferência: regras ─────────────────────────────────────────
const AG = '2026-11-16T20:00:00.000Z';
function base() {
  const l = (id, cx, parcial, extra) => Object.assign({itemTipo: 'produto', itemCodigo: 'PRF-BIOF-0006', itemNome: 'ROSE ABSOLUT', identificadorPalete: id,
    opKey: '26264-17', opLote: '26264/17', status: 'LIBERADO_EXPEDICAO', qualidade: {decisao: 'LIBERADO_EXPEDICAO'}, skuPedidoKey: 'PED-0001__PRF',
    propriedade: {tipo: 'CLIENTE', clienteKey: 'bioflora'}, loteInterno: 'AK-1', enderecoKey: 'E1', enderecoCodigo: 'GAL-1-1-1',
    caixasFechadas: cx, unidadesPorCaixa: 6, unidadesCaixaParcial: parcial, saldoLote: cx * 6 + parcial}, extra || {});
  return {estoque_lotes: {PRF: {
    'pa_26264-17_p1': l('PA-26264-17-P1', 400, 0),
    'pa_26264-17_p2': l('PA-26264-17-P2', 360, 0, {enderecoKey: 'E2', enderecoCodigo: 'GAL-1-1-2'}),
    'pa_26302-01_p1': l('PA-26302-01-P1', 243, 2, {opKey: '26302-01', opLote: '26302/01'})
  }, OUTRO: {'pa_x_p1': {itemCodigo: 'OUTRO', identificadorPalete: 'PA-X-P1', caixasFechadas: 10, unidadesPorCaixa: 6, unidadesCaixaParcial: 0, saldoLote: 60, opKey: 'x'}}}};
}
let b = base();
assert.throws(() => R.planejar(b, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 401, destino: {tipo: 'NOVO'}}, {}), /só 400 caixa/);
assert.throws(() => R.planejar(b, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 0, destino: {tipo: 'NOVO'}}, {}), /Nada a transferir/);
assert.throws(() => R.planejar(b, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 1, parcial: true, destino: {tipo: 'NOVO'}}, {}), /não tem caixa parcial/);
assert.throws(() => R.planejar(b, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 10, destino: {tipo: 'NOVO'}}, {emCarga: () => true}), /carga agendada/);
assert.throws(() => R.planejar(b, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 10, destino: {tipo: 'NOVO', identificador: 'pa-26264-17-p2'}}, {}), /Já existe um palete PA-26264-17-P2/);
// Novo palete: cópia da origem (dono, Qualidade, pedido, lote interno) com as caixas movidas.
let p = R.planejar(b, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 100, destino: {tipo: 'NOVO', identificador: 'R-PF-01'}}, {autor: 'Logística', agora: AG});
assert.equal(p.qtd, 600); assert.deepEqual([p.origemDepois.caixasFechadas, p.origemDepois.saldoLote], [300, 1800]);
assert.equal(p.destinoNovo.identificadorPalete, 'R-PF-01'); assert.equal(p.destinoNovo.saldoLote, 600);
assert.deepEqual(p.destinoNovo.propriedade, {tipo: 'CLIENTE', clienteKey: 'bioflora'}, 'dono segue');
assert.equal(p.destinoNovo.qualidade.decisao, 'LIBERADO_EXPEDICAO'); assert.equal(p.destinoNovo.skuPedidoKey, 'PED-0001__PRF'); assert.equal(p.destinoNovo.loteInterno, 'AK-1');
assert.equal(p.destinoNovo.remontagem.deIdentificador, 'PA-26264-17-P1');
// Mesmo lote e mesma condição: junta no registro de destino.
p = R.planejar(b, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 40, destino: {tipo: 'REGISTRO', itemKey: 'PRF', loteKey: 'pa_26264-17_p2'}}, {agora: AG});
assert.equal(p.juntou, true); assert.equal(p.destinoKey, 'pa_26264-17_p2'); assert.deepEqual([p.destinoDepois.caixasFechadas, p.destinoDepois.saldoLote], [400, 2400]);
// Lote diferente no mesmo palete físico: palete MISTO, registro próprio com a identificação e o endereço do destino.
p = R.planejar(b, {itemKey: 'PRF', loteKey: 'pa_26302-01_p1', caixas: 43, parcial: true, destino: {tipo: 'REGISTRO', itemKey: 'PRF', loteKey: 'pa_26264-17_p2'}}, {agora: AG});
assert.equal(p.juntou, false); assert.equal(p.destinoNovo.identificadorPalete, 'PA-26264-17-P2'); assert.equal(p.destinoNovo.enderecoCodigo, 'GAL-1-1-2');
assert.equal(p.destinoNovo.opLote, '26302/01', 'o lote de origem continua rastreado'); assert.equal(p.destinoNovo.remontagem.paleteMisto, true);
assert.equal(p.qtd, 43 * 6 + 2, 'caixa parcial vai inteira');
// Outro produto no mesmo palete físico (destino de outro item): também vira registro próprio.
p = R.planejar(b, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 5, destino: {tipo: 'REGISTRO', itemKey: 'OUTRO', loteKey: 'pa_x_p1'}}, {agora: AG});
assert.equal(p.juntou, false); assert.equal(p.destinoNovo.identificadorPalete, 'PA-X-P1');
// Duas parciais do mesmo lote no mesmo palete: recusa.
b.estoque_lotes.PRF['pa_26264-17_p2'].caixasFechadas = 359; b.estoque_lotes.PRF['pa_26264-17_p2'].unidadesCaixaParcial = 3; b.estoque_lotes.PRF['pa_26264-17_p2'].saldoLote = 359 * 6 + 3;
b.estoque_lotes.PRF['pa_26264-17_p1'].caixasFechadas = 399; b.estoque_lotes.PRF['pa_26264-17_p1'].unidadesCaixaParcial = 4; b.estoque_lotes.PRF['pa_26264-17_p1'].saldoLote = 399 * 6 + 4;
assert.throws(() => R.planejar(b, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 1, parcial: true, destino: {tipo: 'REGISTRO', itemKey: 'PRF', loteKey: 'pa_26264-17_p2'}}, {}), /no máximo uma caixa parcial/);
ok('transferência: limites, palete novo (cópia com dono/Qualidade/pedido), junta no mesmo lote, palete misto, parcial inteira');

// ── 3. executar() com um banco em memória: total do lote conservado ──
function bancoFalso(dados) {
  const partes = (p) => String(p || '').split('/').filter(Boolean);
  const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), dados);
  const gravar = (p, v) => { const ks = partes(p); let o = dados; ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; }); if (v == null) delete o[ks.at(-1)]; else o[ks.at(-1)] = clone(v); };
  let seq = 0;
  const ref = (p) => ({
    once() { const v = ler(p); const c = v === undefined ? null : clone(v); return Promise.resolve({val: () => clone(c)}); },
    push() { seq++; return {key: 'm' + seq}; },
    transaction(fn) { const atual = ler(p); const r = fn(atual === undefined ? null : clone(atual)); if (r === undefined) return Promise.resolve({committed: false}); gravar(p, r); return Promise.resolve({committed: true}); },
    update(u) { Object.entries(u).forEach(([k, v]) => gravar(k, v)); return Promise.resolve(); }
  });
  return {ref: (p) => ref(p || ''), dados};
}
(async () => {
  const db = bancoFalso(base());
  const total = () => Object.values(db.dados.estoque_lotes.PRF).filter((l) => l.opKey === '26264-17').reduce((t, l) => t + l.saldoLote, 0);
  const antes = total();
  const r1 = await R.executar(db, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 18, destino: {tipo: 'PALETE', identificador: 'R-PF-ROSE'}}, {autor: 'Logística', operacaoId: 'op1'});
  assert.equal(total(), antes, 'o total do lote não muda');
  const novo = db.dados.estoque_lotes.PRF[r1.destinoKey];
  assert.equal(novo.identificadorPalete, 'R-PF-ROSE'); assert.equal(novo.saldoLote, 108);
  assert.equal(db.dados.estoque_lotes.PRF['pa_26264-17_p1'].remontagemEmAndamento, undefined, 'trava liberada');
  assert.equal(db.dados.estoque_lotes.PRF['pa_26264-17_p1'].historicoRemontagem.op1.papel, 'ORIGEM');
  assert.equal(Object.values(db.dados.movimentos_estoque.PRF)[0].motivo, 'REMONTAGEM DE PALETE');
  // Segunda transferência para o mesmo palete de rota, mesmo lote: junta.
  const r2 = await R.executar(db, {itemKey: 'PRF', loteKey: 'pa_26264-17_p2', caixas: 2, destino: {tipo: 'PALETE', identificador: 'R-PF-ROSE'}}, {operacaoId: 'op2'});
  assert.equal(r2.juntou, true); assert.equal(db.dados.estoque_lotes.PRF[r1.destinoKey].saldoLote, 120);
  assert.equal(total(), antes);
  // Esvaziar a origem: fica com saldo 0 e o histórico (nada se apaga).
  await R.executar(db, {itemKey: 'PRF', loteKey: 'pa_26264-17_p2', caixas: 358, destino: {tipo: 'PALETE', identificador: 'R-PF-ROSE'}}, {operacaoId: 'op3'});
  assert.equal(db.dados.estoque_lotes.PRF['pa_26264-17_p2'].saldoLote, 0); assert.ok(db.dados.estoque_lotes.PRF['pa_26264-17_p2'].historicoRemontagem.op3);
  assert.equal(total(), antes);
  // Origem mudou entre a tela e a gravação: recusa sem mexer em nada.
  const dbx = bancoFalso(base());
  const orig = dbx.ref; dbx.ref = (p) => { const r = orig(p); if (p === 'estoque_lotes/PRF') { const once = r.once; r.once = () => once().then((s) => { Object.assign(dbx.dados.estoque_lotes.PRF['pa_26264-17_p1'], {caixasFechadas: 300, saldoLote: 1800}); return s; }); } return r; };
  await assert.rejects(R.executar(dbx, {itemKey: 'PRF', loteKey: 'pa_26264-17_p1', caixas: 1, destino: {tipo: 'NOVO'}}, {}), /mudou/);
  ok('executar: conserva o total do lote, junta no palete de rota, esvaziado fica com histórico, concorrência recusada');

  // ── 4. Editar os paletes de uma carga agendada (servidor) ───────────
  const agora = '2026-09-17T13:00:00.000Z';
  function aplicar(bs, updates) { for (const [path, value] of Object.entries(updates)) { const ps = path.split('/'); let x = bs; for (const q of ps.slice(0, -1)) x = x[q] || (x[q] = {}); x[ps.at(-1)] = clone(value); } return bs; }
  function fixture() {
    const op = {status: 'Concluído', sku: 'PA001', lote: '26254/01', produto: 'Creme', cliente: 'Cliente A', produzidoLinha: 775, skuPedidoKey: 'PED-001__PA001', dataFimReal: agora};
    const conf = {qtdApontada: 775, contagens: {c1: {total: 775, contadoEm: agora, paletes: {
      p1: {numero: 1, caixasFechadas: 12, unidadesPorCaixa: 24, unidadesCaixaParcial: 7, qtdUnidades: 295, enderecoKey: 'A1'},
      p2: {numero: 2, caixasFechadas: 10, unidadesPorCaixa: 24, unidadesCaixaParcial: 0, qtdUnidades: 240, enderecoKey: 'A1'},
      p3: {numero: 3, caixasFechadas: 10, unidadesPorCaixa: 24, unidadesCaixaParcial: 0, qtdUnidades: 240, enderecoKey: 'A1'}}}}};
    const bs = {usuarios: {u1: {role: 'logistica', nome: 'Logística'}}, ops: {op1: op}, conferencias_pa: {op1: conf},
      enderecos_estoque: {A1: {codigo: 'PA-A1', ativo: true}}, estoque_lotes: {}, produtos: {PA001: {sku: 'PA001', descricao: 'Creme', kgCaixa: 8}},
      pedidos: {'PED-001__PA001': {id: 'PED-001', parentPedidoId: 'PED-001', sku: 'PA001', cliente: 'Cliente A', produzido: 775}},
      pedidos_comerciais: {'PED-001': {numeroFormatado: 'PED-001', clienteKey: 'c1', cliente: 'Cliente A', status: 'LIBERADO_PCP', numeroPedidoCliente: '34',
        frete: {tipo: 'FOB', enderecoEntrega: 'Rua A, 100'}, itens: [{sku: 'PA001', qtd: 800, valorUnitario: 2.7, expedido: 0}]}},
      clientes: {c1: {nome: 'Cliente A'}}};
    aplicar(bs, prepararFinalizacao({opKey: 'op1', op, conf, enderecos: bs.enderecos_estoque, lotesItem: {}, autor: 'Conferente', agora}).updates);
    for (const k of ['pa_op1_p1', 'pa_op1_p2', 'pa_op1_p3']) { const l = bs.estoque_lotes.PA001[k]; l.status = 'LIBERADO_EXPEDICAO'; l.qualidade = {decisao: 'LIBERADO_EXPEDICAO', inspecionadoPor: 'CQ', em: agora}; }
    return bs;
  }
  const ref = (bs, k) => ({itemKey: 'PA001', loteKey: k, quantidade: bs.estoque_lotes.PA001[k].saldoLote, enderecoKey: 'A1', skuPedidoKey: 'PED-001__PA001'});
  let bs = fixture();
  const ag = prepararAgenda(bs, {agendaKey: 'ag1', revisao: 0, dataAgendada: '2026-09-18', tipo: 'COLETA', paletes: [ref(bs, 'pa_op1_p1'), ref(bs, 'pa_op1_p2')]}, 'Logística', 'u1', agora);
  bs.agendamentos_expedicao = {ag1: ag};
  const editar = (paletes, extra) => prepararAgenda(bs, Object.assign({agendaKey: 'ag1', revisao: bs.agendamentos_expedicao.ag1.revisao, editarPaletes: true,
    motivo: 'Remontada para o frete do cliente', paletes}, extra || {}), 'Logística', 'u1', agora);
  assert.throws(() => editar([ref(bs, 'pa_op1_p1')], {motivo: ''}), /motivo/);
  assert.throws(() => editar([ref(bs, 'pa_op1_p1')], {revisao: 9}), /mudou em outra tela/);
  // Tira o P2 e põe o P3.
  let ed = editar([ref(bs, 'pa_op1_p1'), ref(bs, 'pa_op1_p3')]);
  assert.deepEqual(ed.paletes.map((x) => x.loteKey), ['pa_op1_p1', 'pa_op1_p3']);
  assert.equal(ed.revisao, 2); assert.equal(ed.tipo, 'COLETA'); assert.equal(ed.dataAgendada, '2026-09-18', 'transporte e data mantidos');
  const h = ed.historico.r2;
  assert.equal(h.acao, 'EDITAR_PALETES'); assert.equal(h.motivo, 'Remontada para o frete do cliente');
  assert.deepEqual(h.antes.map((x) => x.ref), ['PA001/pa_op1_p1', 'PA001/pa_op1_p2']); assert.deepEqual(h.depois.map((x) => x.ref), ['PA001/pa_op1_p1', 'PA001/pa_op1_p3']);
  // Palete de outra carga ativa: recusa.
  bs.agendamentos_expedicao.ag2 = prepararAgenda(bs, {agendaKey: 'ag2', revisao: 0, dataAgendada: '2026-09-19', tipo: 'COLETA', paletes: [ref(bs, 'pa_op1_p3')]}, 'Logística', 'u1', agora);
  assert.throws(() => editar([ref(bs, 'pa_op1_p1'), ref(bs, 'pa_op1_p3')]), /já está na carga/);
  delete bs.agendamentos_expedicao.ag2;
  // Faturamento SOLICITADO: a edição marca a solicitação como desatualizada; a NF espera nova solicitação.
  const sol = prepararFaturamento(bs, {agendaKey: 'ag1', revisao: 1, acao: 'SOLICITAR', solicitacaoId: 's1'}, 'Logística', 'u1', agora);
  bs.agendamentos_expedicao.ag1 = sol.agenda;
  ed = editar([ref(bs, 'pa_op1_p1'), ref(bs, 'pa_op1_p3')]);
  assert.ok(ed.faturamento.desatualizada, 'solicitação marcada como desatualizada');
  bs.agendamentos_expedicao.ag1 = ed;
  assert.equal(CargasPA.acoes(ed).registrarNf, false, 'tela não oferece NF sobre composição velha');
  assert.equal(CargasPA.acoes(ed).solicitarFaturamento, true, 'tela oferece solicitar de novo');
  assert.throws(() => prepararFaturamento(bs, {agendaKey: 'ag1', revisao: ed.revisao, acao: 'REGISTRAR_NF', nf: {numero: '1', serie: '1', valor: 10, emitidaEm: '2026-09-17'}}, 'Fin', 'u2', agora), /solicitar de novo/);
  const sol2 = prepararFaturamento(bs, {agendaKey: 'ag1', revisao: ed.revisao, acao: 'SOLICITAR', solicitacaoId: 's2'}, 'Logística', 'u1', agora);
  assert.equal(sol2.agenda.faturamento.desatualizada, undefined, 'nova solicitação limpa a marca');
  assert.equal(sol2.solicitacao.totalUnidades, 535, 'solicitação nova com os paletes atuais');
  bs.agendamentos_expedicao.ag1 = sol2.agenda;
  // Com NF registrada: a composição não muda mais.
  const nf = prepararFaturamento(bs, {agendaKey: 'ag1', revisao: sol2.agenda.revisao, acao: 'REGISTRAR_NF', nf: {numero: '1', serie: '1', valor: 10, emitidaEm: '2026-09-17'}}, 'Fin', 'u2', agora);
  bs.agendamentos_expedicao.ag1 = nf.agenda;
  assert.throws(() => editar([ref(bs, 'pa_op1_p1')]), /já faturada/);
  assert.equal(CargasPA.acoes(nf.agenda).editarPaletes, false);
  ok('editar carga: troca paletes com motivo e histórico antes/depois, revisão, outra carga, solicitação desatualizada, NF trava');

  console.log('OK run_remontar_palete_test: ' + n + ' grupos.');
})().catch((e) => { console.error(e); process.exit(1); });
