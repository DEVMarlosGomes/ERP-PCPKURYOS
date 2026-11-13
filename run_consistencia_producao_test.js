/* Consistência produção × estoque × expedição (13/11/2026).

   Cada bloco reproduz um caso REAL medido em produção:
   - Sunrise (PED-0001__PRF-BIOF-0004): OP 26264/14 confirmada em 12/11 e só
     conferida em 13/11 -- a tela acusava "diferença 1.962" quando a produção
     só estava aguardando a conferência de PA.
   - Rose Absolut (OP 26302/01): planejada 690, apontada 3.470 porque o
     granel de outro SKU foi envasado nela. Confirmada com aviso e sem RNC.
   - Flor D'Aura (OP 26282/03): conferida com 1.792; o apontamento subiu
     depois para 4.308 e as 2.516 a mais nunca entraram no estoque. */
const assert = require('assert');
const path = require('path');
const CP = require(path.join(__dirname, 'public', 'shared', 'conciliacao-pedidos.js'));
const CO = require(path.join(__dirname, 'public', 'shared', 'consistencia-producao.js'));

const palete = (opKey, saldo, extra) => Object.assign({itemTipo: 'produto', saldoLote: saldo, opKey}, extra || {});
const conf = (extra) => Object.assign({finalizadoEm: '2026-10-01T15:00:00Z', conciliacao: {motivo: 'RECONTAGEM_CONFERE_OP'}, divergencia: 0}, extra || {});

// ── 1. Sunrise: produção aguardando conferência não é divergência ──────────
let base = {
  pedidos: {'PED-0001__PRF-BIOF-0004': {produzido: 4758}},
  ops: {
    '26264-13': {skuPedidoKey: 'PED-0001__PRF-BIOF-0004', lote: '26264/13', produzido: 2796, status: 'Concluído', dataEmissao: '2026-09-21T18:29:53Z'},
    '26264-14': {skuPedidoKey: 'PED-0001__PRF-BIOF-0004', lote: '26264/14', produzido: 1962, status: 'Concluído', dataEmissao: '2026-09-21T18:30:27Z', confirmadoEm: '2026-11-12T11:53:31Z'}
  },
  estoque_lotes: {'PRF-BIOF-0004': {a: palete('26264-13', 2016), b: palete('26264-13', 780)}},
  conferencias_pa: {'26264-13': conf()},
  expedicoes_comerciais: {}, solicitacoes_descarte: {}
};
let r = CP.calcular(base).porPedido['PED-0001__PRF-BIOF-0004'];
assert.equal(r.aguardandoConferencia.total, 1962, 'OP confirmada sem conferência de PA fica em "aguardando conferência"');
assert.equal(r.diferenca, 0, 'aguardando conferência entra na conta: não é unidade sumida');
assert.equal(r.situacao, 'AGUARDANDO_CONFERENCIA');
assert.equal(r.porOp['26264-14'].situacao, 'AGUARDANDO_CONFERENCIA');
assert.equal(r.porOp['26264-13'].situacao, 'OK');
assert.match(CP.descrever(r).detalhe, /Aguardando conferência de PA: 1\.962 · 26264\/14/);
assert.equal(CP.descrever(r).rotulo, 'Aguardando conferência');

// Depois da conferência (13/11 16:46, 1.965 contadas, RNC-PA +3) volta ao normal.
base.estoque_lotes['PRF-BIOF-0004'].c = palete('26264-14', 1965);
base.conferencias_pa['26264-14'] = conf({conciliacao: {diferenca: 3, motivo: 'APONTAMENTO_PRODUCAO_INCORRETO'}, divergencia: 3, rncNumero: 'RNC-PA-26264-14'});
r = CP.calcular(base).porPedido['PED-0001__PRF-BIOF-0004'];
assert.equal(r.aguardandoConferencia.total, 0);
assert.equal(r.situacao, 'OK_APONTADA', 'a diferença +3 já tem RNC da conferência');

// OP anterior à Conferência de PA (corte 10/09) segue a regra antiga: sem
// registro, não "aguardando" -- nunca teve como ser conferida.
r = CP.calcular({pedidos: {P: {produzido: 100}}, ops: {O: {skuPedidoKey: 'P', produzido: 100, dataEmissao: '2026-08-01T00:00:00Z'}}}).porPedido.P;
assert.equal(r.situacao, 'SEM_REGISTRO');
assert.equal(r.aguardandoConferencia.total, 0);

// OP de retrabalho não entra em conferência própria.
r = CP.calcular({pedidos: {P: {produzido: 0}}, ops: {
  O: {skuPedidoKey: 'P', produzido: 50, dataEmissao: '2026-10-01T00:00:00Z', tipoOrdem: 'RETRABALHO'}}}).porPedido.P;
assert.equal(r.aguardandoConferencia.total, 0);

// OP com saída/estoque de qualquer origem não está "aguardando" (legado já registrado).
r = CP.calcular({pedidos: {P: {produzido: 100}}, ops: {O: {skuPedidoKey: 'P', produzido: 100, dataEmissao: '2026-10-01T00:00:00Z'}},
  expedicoes_comerciais: {c: {itens: {a: {qtd: 100, opKey: 'O'}}}}}).porPedido.P;
assert.equal(r.aguardandoConferencia.total, 0);
assert.equal(r.situacao, 'OK');

// Agregar (pedido comercial) soma o aguardando e mantém a pior situação.
const ag = CP.agregar([
  CP.calcular(base).porPedido['PED-0001__PRF-BIOF-0004'],
  CP.calcular({pedidos: {P: {produzido: 10}}, ops: {O: {skuPedidoKey: 'P', produzido: 10, dataEmissao: '2026-10-01T00:00:00Z'}}}).porPedido.P
]);
assert.equal(ag.aguardandoConferencia.total, 10);
assert.equal(ag.situacao, 'AGUARDANDO_CONFERENCIA', 'aguardando é pior que OK_APONTADA');
assert.equal(CP.agregar([ag, {situacao: 'DIVERGENTE', produzido: 1, expedido: {total: 0, motivos: {}}, estoque: {total: 0, origens: {}},
  divergenciaApontada: {total: 0, ocorrencias: []}, porOp: {}}]).situacao, 'DIVERGENTE');

// ── 2. Rose Absolut: superprodução grosseira abre RNC na confirmação ──────
const opRose = {skuPedidoKey: 'PED-0001__PRF-BIOF-0006', lote: '26302/01', sku: 'PRF-BIOF-0006',
  produto: 'BODY SPLASH B.BALM ROSE ABSOLUT VITAMINA E 200ML', qtdPlanejada: 690, produzido: 3470,
  status: 'Concluído', dataEmissao: '2026-10-29T12:51:23Z', confirmadoEm: '2026-11-14T11:18:41Z'};
let achados = CO.avaliarOp('26302-01', opRose, null, null);
assert.equal(achados.length, 1);
assert.equal(achados[0].tipo, 'SUPERPRODUCAO');
assert.equal(achados[0].chave, 'RNC-SP-26302-01');
assert.equal(achados[0].qtd, 2780, 'quantidade envolvida = apontado - planejado');

// Encher 10-30% acima é rotina (excedente de granel): 22% das OPs desde 10/09.
assert.deepEqual(CO.avaliarOp('X', Object.assign({}, opRose, {produzido: 1035}), null, null), [], '150% exatos não abre');
assert.equal(CO.avaliarOp('X', Object.assign({}, opRose, {produzido: 1036}), null, null).length, 1, 'acima de 150% abre');
// Corte prospectivo: OP confirmada antes da regra não vira RNC retroativa.
assert.deepEqual(CO.avaliarOp('X', Object.assign({}, opRose, {confirmadoEm: '2026-11-04T11:18:41Z'}), null, null), []);
// Concluída pelo seletor manual (sem confirmadoEm): vale a data real de fim.
assert.equal(CO.avaliarOp('X', Object.assign({}, opRose, {confirmadoEm: null, dataFimReal: '2026-11-15T10:00:00Z'}), null, null).length, 1);
assert.deepEqual(CO.avaliarOp('X', Object.assign({}, opRose, {confirmadoEm: null, dataFimReal: null}), null, null), []);
// Só OP concluída; retrabalho e cancelada ficam de fora; sem planejado não há base.
assert.deepEqual(CO.avaliarOp('X', Object.assign({}, opRose, {status: 'Em Produção'}), null, null), []);
assert.deepEqual(CO.avaliarOp('X', Object.assign({}, opRose, {tipoOrdem: 'RETRABALHO'}), null, null), []);
assert.deepEqual(CO.avaliarOp('X', Object.assign({}, opRose, {qtdPlanejada: 0}), null, null), []);
// A confirmação avalia ANTES de gravar: `confirmando` substitui status/data.
assert.equal(CO.avaliarOp('X', Object.assign({}, opRose, {status: 'Aguardando Confirmação', confirmadoEm: null}), null, null,
  {confirmandoEm: '2026-11-14T12:00:00Z'}).length, 1);

// ── 3. Flor D'Aura: conferida e depois descasada -> RNC ──────────────────
base = {
  pedidos: {'30__MRARBS12': {produzido: 4308}},
  ops: {'26282-03': {skuPedidoKey: '30__MRARBS12', lote: '26282/03', sku: 'MRARBS12', produto: 'BODY SPLASH FLOR DAURA 200ML',
    qtdPlanejada: 3360, produzido: 4308, status: 'Concluído', dataEmissao: '2026-10-09T00:00:00Z', confirmadoEm: '2026-10-28T19:27:09Z'}},
  estoque_lotes: {MRARBS12: {p1: palete('26282-03', 0, {status: 'EXPEDIDO'})}},
  expedicoes_comerciais: {e: {status: 'EXPEDIDO', itens: {a: {qtd: 1792, opKey: '26282-03'}}}},
  conferencias_pa: {'26282-03': conf({finalizadoEm: '2026-10-16T10:16:09Z', qtdApontada: 1792})}
};
let conc = CP.calcular(base);
achados = CO.avaliar(base, conc, {});
assert.equal(achados.length, 1);
assert.equal(achados[0].tipo, 'SALDO_DESCASADO');
assert.equal(achados[0].chave, 'RNC-CS-26282-03');
assert.equal(achados[0].qtd, 2516);
assert.match(achados[0].descricao, /4\.308/);
assert.match(achados[0].descricao, /1\.792/);

// Conferida e batendo: nada. Sem conferência: é "aguardando", não RNC.
base.expedicoes_comerciais.e.itens.a.qtd = 4308;
assert.deepEqual(CO.avaliar(base, CP.calcular(base), {}), []);
delete base.conferencias_pa['26282-03'];
base.expedicoes_comerciais = {};
assert.deepEqual(CO.avaliar(base, CP.calcular(base), {}), [], 'aguardando conferência não abre RNC');
// Diferença já apontada pela Logística (RNC-PA) não abre outra.
base = {pedidos: {P: {produzido: 100}}, ops: {O: {skuPedidoKey: 'P', produzido: 100, status: 'Concluído', dataEmissao: '2026-10-01'}},
  estoque_lotes: {S: {a: palete('O', 95)}}, conferencias_pa: {O: conf({divergencia: -5, conciliacao: {diferenca: -5}})}};
assert.deepEqual(CO.avaliar(base, CP.calcular(base), {}), []);

// ── 4. Registro da RNC ────────────────────────────────────────────────────
const rnc = CO.registroRnc(CO.avaliarOp('26302-01', opRose, null, null)[0], '2026-11-14T12:00:00Z', 'Adlai');
assert.equal(rnc.numero, 'RNC-SP-26302-01');
assert.equal(rnc.status, 'ABERTA');
assert.equal(rnc.origem, 'PRODUCAO');
assert.equal(rnc.automatica, true);
assert.equal(rnc.categoria, 'CONSISTENCIA');
assert.equal(rnc.tipoInconsistencia, 'SUPERPRODUCAO');
assert.equal(rnc.opKey, '26302-01');
assert.equal(rnc.opLote, '26302/01');
assert.equal(rnc.itemTipo, 'produto');
assert.equal(rnc.itemCodigo, 'PRF-BIOF-0006');
assert.equal(rnc.qtdEnvolvida, 2780);
assert.equal(rnc.classificacao, 'MAIOR');
assert.equal(rnc.abertaPor, 'Adlai');
assert.match(rnc.descricao, /3\.470/);
assert.match(rnc.descricao, /690/);

// ── 5. Abertura idempotente (transação; nunca sobrescreve) ────────────────
function dbFalso(inicial) {
  const dados = Object.assign({}, inicial);
  return {dados, ref(caminho) {
    const k = caminho.split('/').pop();
    return {transaction(fn) {
      // O SDK chama primeiro com o cache local (null) e depois com o valor do
      // servidor quando o primeiro palpite não confere.
      let v = fn(null);
      if (dados[k] !== undefined) v = fn(JSON.parse(JSON.stringify(dados[k])));
      if (v === undefined) return Promise.resolve({committed: false, snapshot: {val: () => dados[k]}});
      dados[k] = v;
      return Promise.resolve({committed: true, snapshot: {val: () => v}});
    }};
  }};
}
(async () => {
  const db = dbFalso({'RNC-CS-26282-03': {numero: 'RNC-CS-26282-03', status: 'EM_ANALISE', causaRaiz: 'investigando', automatica: true, categoria: 'CONSISTENCIA'}});
  const itens = CO.avaliar(Object.assign({}, {
    pedidos: {'30__MRARBS12': {produzido: 4308}}, ops: {'26282-03': {skuPedidoKey: '30__MRARBS12', produzido: 4308, status: 'Concluído', dataEmissao: '2026-10-09'}},
    expedicoes_comerciais: {e: {itens: {a: {qtd: 1792, opKey: '26282-03'}}}}, conferencias_pa: {'26282-03': conf()}
  }), CP.calcular({pedidos: {'30__MRARBS12': {produzido: 4308}}, ops: {'26282-03': {skuPedidoKey: '30__MRARBS12', produzido: 4308, status: 'Concluído', dataEmissao: '2026-10-09'}},
    expedicoes_comerciais: {e: {itens: {a: {qtd: 1792, opKey: '26282-03'}}}}, conferencias_pa: {'26282-03': conf()}}), {});
  itens.push(CO.avaliarOp('26302-01', opRose, null, null)[0]);
  const abertas = await CO.abrirRncs(db, itens, '2026-11-14T12:00:00Z', 'PCP');
  assert.deepEqual(abertas, ['RNC-SP-26302-01'], 'só abre a que não existia');
  assert.equal(db.dados['RNC-CS-26282-03'].causaRaiz, 'investigando', 'RNC existente nunca é sobrescrita');
  assert.equal(db.dados['RNC-SP-26302-01'].status, 'ABERTA');
  assert.deepEqual(await CO.abrirRncs(db, itens, '2026-11-14T13:00:00Z', 'PCP'), [], 'repetir não duplica');

  // ── 6. O que aparece no alerta vermelho ─────────────────────────────────
  const ativos = CO.alertasAtivos({
    'RNC-PA-26264-14': {numero: 'RNC-PA-26264-14', status: 'ABERTA', automatica: true, conferenciaOpKey: '26264-14', abertaEm: '2026-11-13T16:46:06Z'},
    'RNC-PA-26264-06': {numero: 'RNC-PA-26264-06', status: 'CONCLUIDA', automatica: true, conferenciaOpKey: '26264-06'},
    'RNC-SP-26302-01': db.dados['RNC-SP-26302-01'],
    'RNC-CS-26282-03': db.dados['RNC-CS-26282-03'],
    'RNC-2026-031': {numero: 'RNC-2026-031', status: 'ABERTA', origem: 'RECEBIMENTO'}
  });
  assert.deepEqual(ativos.map(a => a.numero), ['RNC-SP-26302-01', 'RNC-PA-26264-14', 'RNC-CS-26282-03'],
    'abertas primeiro (mais nova em cima), depois em análise; concluída e RNC manual de recebimento ficam fora');
  assert.equal(CO.alertasAtivos(null).length, 0);

  // ── 7. Quem vê o alerta e quem abre RNC ─────────────────────────────────
  assert.equal(CO.veAlertas({role: 'admin'}), true);
  assert.equal(CO.veAlertas({role: 'pcp'}), true);
  assert.equal(CO.veAlertas({role: 'logistica'}), true);
  assert.equal(CO.veAlertas({role: 'comercial', funcoes: {logistica: true}}), true, 'função extra conta');
  assert.equal(CO.veAlertas({role: 'production'}), false);
  assert.equal(CO.veAlertas(null), false);
  assert.equal(CO.podeAbrirRnc({role: 'pcp'}), true, 'mesmos papéis da regra de nao_conformidades');
  assert.equal(CO.podeAbrirRnc({role: 'qualidade'}), true);
  assert.equal(CO.podeAbrirRnc({role: 'production', modulos: {qualidade: true}}), true);
  assert.equal(CO.podeAbrirRnc({role: 'logistica'}), false, 'logística vê o alerta, mas a regra não deixa gravar RNC');

  console.log('run_consistencia_producao_test: OK');
})().catch(e => { console.error(e); process.exit(1); });
