/* Controladoria — funções PURAS (PROMPT_CONTROLADORIA.md). Cópia byte a byte em functions/.
 *
 * O razão geral gerencial (FI-GL + CO, no vocabulário do SAP): recebe os razões
 * auxiliares e os fatos dos outros módulos e devolve DOCUMENTOS BALANCEADOS
 * (débito = crédito, ao centavo). Nada aqui é recalculado: o custo de produção é
 * o que o módulo de Custos lançou em custos/razao; o caixa é o que o Financeiro
 * baixou em fin/baixas; a receita é a NF registrada na carga.
 *
 * Interligação (só leitura, nenhum módulo muda):
 *   custos/razao, custos/razao_ops  -> estoque, produção em processo, PA, perdas
 *   agendamentos_expedicao/.../nfs  -> receita, deduções estimadas, CPV
 *   custos/operacao, custos/taxas   -> folha, custo fixo, absorção, ociosidade
 *   resultado/fechamentos           -> PLR
 *   fin/baixas, fin/titulos         -> caixa; títulos manuais e saldo de abertura
 *
 * Cada fato vira um documento com chave pela ORIGEM. Se o fato mudar (a operação
 * do mês foi corrigida, a OP foi relançada), o documento antigo é ESTORNADO e
 * nasce uma revisão -- nunca se edita nem se apaga (append-only).
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./custos'), require('./financeiro'), require('./custos-realizado'));
  else root.Controladoria = factory(root.Custos, root.Financeiro, root.CustosRealizado);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Custos, Fin, R) {
  'use strict';

  var VERSAO = 'controladoria-v1-20261028';

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function san(k) { return String(k == null ? '' : k).replace(/[.#$\/\[\]]/g, '_'); }
  function cent(v) { return Math.round(num(v) * 100); }
  function vals(o) { return Object.keys(o || {}).map(function(k) { return o[k]; }).filter(Boolean); }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  /* ── Plano de contas (semente; a diretoria edita nome e referencial) ──── */
  var PLANO_PADRAO = {
    BANCOS:              { codigo: '1.1.1',   nome: 'Bancos', tipo: 'ATIVO' },
    CLIENTES:            { codigo: '1.1.2',   nome: 'Clientes a receber', tipo: 'ATIVO' },
    ESTOQUE_MATERIAIS:   { codigo: '1.1.3.1', nome: 'Estoque de matéria-prima e embalagem', tipo: 'ATIVO' },
    ESTOQUE_USO_CONSUMO: { codigo: '1.1.3.2', nome: 'Estoque de uso e consumo', tipo: 'ATIVO' },
    PEP:                 { codigo: '1.1.3.3', nome: 'Produção em processo', tipo: 'ATIVO' },
    ESTOQUE_PA:          { codigo: '1.1.3.4', nome: 'Estoque de produto acabado', tipo: 'ATIVO' },
    FORNECEDORES:        { codigo: '2.1.1',   nome: 'Fornecedores a pagar', tipo: 'PASSIVO' },
    SALARIOS_PAGAR:      { codigo: '2.1.2',   nome: 'Salários e encargos a pagar', tipo: 'PASSIVO' },
    CONTAS_PAGAR:        { codigo: '2.1.3',   nome: 'Contas a pagar diversas', tipo: 'PASSIVO' },
    IMPOSTOS_RECOLHER:   { codigo: '2.1.4',   nome: 'Impostos sobre vendas a recolher (estimado)', tipo: 'PASSIVO' },
    PLR_PAGAR:           { codigo: '2.1.5',   nome: 'PLR a pagar', tipo: 'PASSIVO' },
    SALDOS_ABERTURA:     { codigo: '2.3.1',   nome: 'Saldos de abertura', tipo: 'PL' },
    RECEITA_BRUTA:       { codigo: '3.1.1',   nome: 'Receita bruta de vendas', tipo: 'RECEITA', grupoDre: 'RECEITA_BRUTA' },
    OUTRAS_RECEITAS:     { codigo: '3.1.2',   nome: 'Outras receitas operacionais', tipo: 'RECEITA', grupoDre: 'OUTRAS_RECEITAS' },
    DEDUCOES:            { codigo: '3.2.1',   nome: 'Impostos sobre vendas (estimado)', tipo: 'DEDUCAO', grupoDre: 'DEDUCOES' },
    CPV:                 { codigo: '4.1.1',   nome: 'Custo do produto vendido', tipo: 'CUSTO', grupoDre: 'CPV' },
    PERDAS:              { codigo: '4.1.2',   nome: 'Perdas de produção', tipo: 'CUSTO', grupoDre: 'PERDAS' },
    FOLHA_PRODUCAO:      { codigo: '4.2.1',   nome: 'Folha da produção', tipo: 'CUSTO', grupoDre: 'CUSTO_FIXO_PRODUCAO' },
    MOD_APLICADA:        { codigo: '4.2.2',   nome: '(−) Mão de obra aplicada às OPs', tipo: 'CUSTO', grupoDre: 'CUSTO_FIXO_PRODUCAO' },
    CIF:                 { codigo: '4.2.3',   nome: 'Custos fixos de produção', tipo: 'CUSTO', grupoDre: 'CUSTO_FIXO_PRODUCAO' },
    DESP_ADM:            { codigo: '5.1.1',   nome: 'Despesas administrativas', tipo: 'DESPESA', grupoDre: 'DESPESAS_ADM' },
    DESP_COM:            { codigo: '5.1.2',   nome: 'Despesas comerciais', tipo: 'DESPESA', grupoDre: 'DESPESAS_COMERCIAIS' },
    PLR:                 { codigo: '5.1.3',   nome: 'Participação nos resultados (PLR)', tipo: 'DESPESA', grupoDre: 'PLR' },
    RECEITA_FIN:         { codigo: '6.1.1',   nome: 'Receitas financeiras', tipo: 'RECEITA', grupoDre: 'RESULTADO_FINANCEIRO' },
    DESP_FIN:            { codigo: '6.1.2',   nome: 'Despesas financeiras', tipo: 'DESPESA', grupoDre: 'RESULTADO_FINANCEIRO' }
  };
  var CENTROS_PADRAO = { PRODUCAO: { nome: 'Produção (geral)', tipo: 'PRODUTIVO' }, MANIPULACAO: { nome: 'Manipulação', tipo: 'PRODUTIVO' },
    ROTULAGEM: { nome: 'Rotulagem', tipo: 'PRODUTIVO' }, LOGISTICA: { nome: 'Logística', tipo: 'APOIO' }, QUALIDADE: { nome: 'Qualidade', tipo: 'APOIO' },
    COMERCIAL: { nome: 'Comercial', tipo: 'COMERCIAL' }, ADMINISTRATIVO: { nome: 'Administrativo', tipo: 'ADMINISTRATIVO' } };
  // A conta de cada natureza (Financeiro e razão de custos falam por natureza).
  var CONTA_DA_NATUREZA = { MATERIA_PRIMA: 'ESTOQUE_MATERIAIS', EMBALAGEM: 'ESTOQUE_MATERIAIS', MATERIA_PRIMA_EMBALAGEM: 'ESTOQUE_MATERIAIS',
    USO_E_CONSUMO: 'ESTOQUE_USO_CONSUMO', OUTROS: 'DESP_ADM', FRETE: 'ESTOQUE_MATERIAIS', FOLHA: 'FOLHA_PRODUCAO', CUSTO_FIXO_PRODUCAO: 'CIF',
    CUSTO_FIXO_ADM: 'DESP_ADM', DESPESA_COMERCIAL: 'DESP_COM', PLR: 'PLR', IMPOSTOS: 'IMPOSTOS_RECOLHER', RECEITA_VENDA: 'RECEITA_BRUTA', OUTRAS_RECEITAS: 'OUTRAS_RECEITAS' };

  function planoDeContas(ctl) {
    var p = {}, edit = (ctl && ctl.plano_contas) || {};
    Object.keys(PLANO_PADRAO).forEach(function(k) { p[k] = Object.assign({ chave: k, ativa: true, contaReferencial: null }, PLANO_PADRAO[k], edit[k] || {}, { tipo: PLANO_PADRAO[k].tipo, grupoDre: PLANO_PADRAO[k].grupoDre || null }); });
    return p;
  }
  function centrosDeCusto(ctl, ops) {
    var c = {}, edit = (ctl && ctl.centros_custo) || {};
    Object.keys(CENTROS_PADRAO).forEach(function(k) { c[k] = Object.assign({ chave: k }, CENTROS_PADRAO[k], edit[k] || {}); });
    vals(ops).forEach(function(o) { var l = R.nomeLinha(o.linha || ''); if (R.ehLinhaEnvase(l)) { var k = san(l).replace(/ /g, '_').toUpperCase(); if (!c[k]) c[k] = { chave: k, nome: l, tipo: 'PRODUTIVO' }; } });
    return c;
  }
  function ccDaLinha(l) { var n = R.nomeLinha(l || ''); return R.ehLinhaEnvase(n) ? san(n).replace(/ /g, '_').toUpperCase() : 'PRODUCAO'; }

  /* ── Documento ───────────────────────────────────────────────────────── */
  function D(conta, v, extra) { return Object.assign({ conta: conta, debitoCentavos: v, creditoCentavos: 0 }, extra || {}); }
  function C(conta, v, extra) { return Object.assign({ conta: conta, debitoCentavos: 0, creditoCentavos: v }, extra || {}); }
  function documentoBalanceado(partidas) {
    var ps = (partidas || []).filter(function(p) { return p && (p.debitoCentavos || p.creditoCentavos); });
    if (!ps.length) return { ok: false, motivo: 'documento sem valor' };
    var d = 0, c = 0;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (!PLANO_PADRAO[p.conta]) return { ok: false, motivo: 'conta inexistente: ' + p.conta };
      if (!Number.isInteger(p.debitoCentavos) || !Number.isInteger(p.creditoCentavos) || p.debitoCentavos < 0 || p.creditoCentavos < 0) return { ok: false, motivo: 'valor não é centavo inteiro positivo' };
      d += p.debitoCentavos; c += p.creditoCentavos;
    }
    if (d !== c) return { ok: false, motivo: 'débito (' + d + ') ≠ crédito (' + c + ')' };
    return { ok: true, partidas: ps, totalCentavos: d };
  }
  function inverter(partidas) { return partidas.map(function(p) { return Object.assign({}, p, { debitoCentavos: p.creditoCentavos, creditoCentavos: p.debitoCentavos }); }); }

  /* ── Fatos -> documentos esperados ───────────────────────────────────── */
  function partidasDoRazao(l, ops) {
    var v = cent(l.valorTotal); if (!(v > 0)) return null;
    var op = l.objeto && l.objeto.tipo === 'OP' ? (ops || {})[l.objeto.id] : null;
    var cc = op ? ccDaLinha(op.linha) : 'PRODUCAO', ex = { natureza: l.natureza || null, sku: l.sku || null };
    if (l.tipo === 'ENTRADA_MATERIAL') return [D(l.natureza === 'USO_E_CONSUMO' ? 'ESTOQUE_USO_CONSUMO' : 'ESTOQUE_MATERIAIS', v, ex), C('FORNECEDORES', v, ex)];
    if (l.tipo === 'CONSUMO_MATERIAL') return [D('PEP', v, Object.assign({ cc: cc }, ex)), C('ESTOQUE_MATERIAIS', v, ex)];
    if (l.tipo === 'HORA_PRODUCAO') return [D('PEP', v, Object.assign({ cc: cc }, ex)), C('MOD_APLICADA', v, { cc: cc })];
    if (l.tipo === 'PERDA') return [D('PERDAS', v, Object.assign({ cc: cc }, ex)), C('ESTOQUE_MATERIAIS', v, ex)];
    return null;
  }
  // Custo de PA de uma OP lançada: consumo + hora da revisão vigente (o que passou pela PEP).
  function custoPaDaOp(rop, razao) {
    var total = 0, achou = 0;
    (rop.lancamentos || []).forEach(function(k) {
      var p = String(k).split('/'), l = ((razao || {})[p[0]] || {})[p[1]];
      if (l && (l.tipo === 'CONSUMO_MATERIAL' || l.tipo === 'HORA_PRODUCAO')) { total += cent(l.valorTotal); achou++; }
    });
    return achou ? total : null;
  }
  function opPorLote(ops) { var m = {}; Object.keys(ops || {}).forEach(function(k) { var o = ops[k]; if (o && o.lote) m[String(o.lote).trim()] = k; }); return m; }

  function documentosEsperados(base) {
    var b = base || {}, out = {}, cus = b.custos || {}, razao = cus.razao || {}, ops = b.ops || {}, rops = cus.razao_ops || {};
    function add(origem, d) {
      var bal = documentoBalanceado(d.partidas);
      if (!bal.ok) return;
      d.partidas = bal.partidas; d.totalCentavos = bal.totalCentavos;
      d.hash = hash(JSON.stringify([d.competencia, d.partidas.map(function(p) { return [p.conta, p.cc || '', p.debitoCentavos, p.creditoCentavos]; })]));
      out[san(origem)] = d;
    }
    // 1. Razão de custos (produção e entrada de material).
    Object.keys(razao).forEach(function(m) {
      Object.keys(razao[m] || {}).forEach(function(id) {
        var l = razao[m][id]; if (!l) return;
        if (l.tipo === 'ESTORNO') {
          var p = String(l.estornaId || '').split('/'), orig = (razao[p[0]] || {})[p[1]];
          var po = orig && partidasDoRazao(orig, ops);
          if (po) add('RZ_' + san(m) + '_' + san(id), { data: String(l.criadoEm || m + '-01').slice(0, 10), competencia: m, historico: 'Estorno no razão de custos: ' + orig.tipo + (orig.objeto ? ' ' + orig.objeto.id : ''),
            origem: { tipo: 'RAZAO_CUSTOS', ref: 'custos/razao/' + m + '/' + id }, partidas: inverter(po) });
          return;
        }
        var ps = partidasDoRazao(l, ops);
        if (ps) add('RZ_' + san(m) + '_' + san(id), { data: String(l.criadoEm || m + '-01').slice(0, 10), competencia: m,
          historico: ({ ENTRADA_MATERIAL: 'Entrada de material', CONSUMO_MATERIAL: 'Consumo da OP', HORA_PRODUCAO: 'Horas da OP', PERDA: 'Perdas da OP' }[l.tipo]) + (l.objeto ? ' ' + l.objeto.id : '') + (l.sku ? ' · ' + l.sku : ''),
          origem: { tipo: 'RAZAO_CUSTOS', ref: 'custos/razao/' + m + '/' + id }, partidas: ps });
      });
    });
    // 2. OP lançada: o que passou pela PEP vira produto acabado.
    Object.keys(rops).forEach(function(k) {
      var rop = rops[k], v = rop && custoPaDaOp(rop, razao); if (!(v > 0)) return;
      var opKey = Object.keys(ops).filter(function(o) { return san(o) === k; })[0] || k, op = ops[opKey] || {};
      var comp = String(op.dataFimReal || rop.lancadoEm || '').slice(0, 7);
      add('OPPA_' + k, { data: String(op.dataFimReal || rop.lancadoEm || '').slice(0, 10), competencia: comp, historico: 'OP ' + opKey + ' concluída: produto acabado (' + (op.sku || '') + ')',
        origem: { tipo: 'OP', ref: 'custos/razao_ops/' + k }, partidas: [D('ESTOQUE_PA', v, { sku: op.sku || null, cc: ccDaLinha(op.linha) }), C('PEP', v, { cc: ccDaLinha(op.linha) })],
        analitico: { op: opKey, sku: op.sku || null, produzido: num(rop.produzido), custoPaCentavos: v } });
    });
    // 3. NF de saída: receita, dedução estimada e CPV (real da OP do lote; senão ficha padrão; senão pendente).
    var porLote = opPorLote(ops);
    Object.keys(b.agendamentos_expedicao || {}).forEach(function(ak) {
      var a = b.agendamentos_expedicao[ak], fat = a && a.faturamento;
      Object.keys((fat && fat.nfs) || {}).forEach(function(nk) {
        var nf = fat.nfs[nk], v = nf && Math.round(num(nf.valor) * 100); if (!(v > 0)) return;
        var comp = String(nf.emitidaEm || '').slice(0, 7), ex = { cliente: a.cliente || null };
        var ps = [D('CLIENTES', v, ex), C('RECEITA_BRUTA', v, Object.assign({ cc: 'COMERCIAL' }, ex))];
        var imp = Custos.impostosPct(cus.parametros, a.clienteKey);
        if (imp != null && imp > 0) { var ded = Math.round(v * imp / 100); ps.push(D('DEDUCOES', ded, ex), C('IMPOSTOS_RECOLHER', ded, ex)); }
        var itens = Fin.itensDaNf(fat, nf), somaItens = itens.reduce(function(s, i) { return s + num(i.valor); }, 0);
        var analitico = [], cob = { real: 0, padrao: 0, pendente: 0 };
        itens.forEach(function(i) {
          var un = num(i.unidades), opKey = porLote[String(i.lote || '').trim()], rop = opKey && rops[san(opKey)];
          var cpv = null, fonte = 'PENDENTE';
          if (rop && num(rop.produzido) > 0) { var pa = custoPaDaOp(rop, razao); if (pa > 0) { cpv = Math.round(pa / num(rop.produzido) * un); fonte = 'REAL'; } }
          if (cpv == null) {
            var fi = ((cus.fichas || {})[comp] || {})[Custos.chaveSku(i.sku || '')];
            if (fi && num(fi.custoVariavel) > 0) { cpv = Math.round(num(fi.custoVariavel) * 100 * un); fonte = 'PADRAO'; }
          }
          cob[fonte === 'REAL' ? 'real' : fonte === 'PADRAO' ? 'padrao' : 'pendente'] += un;
          if (cpv > 0) ps.push(D('CPV', cpv, { sku: i.sku || null, cliente: a.cliente || null, fonte: fonte }), C('ESTOQUE_PA', cpv, { sku: i.sku || null }));
          // Receita do item: a fatia da nota proporcional ao valor do item na solicitação.
          var rec = somaItens > 0 ? Math.round(v * num(i.valor) / somaItens) : (itens.length === 1 ? v : 0);
          analitico.push({ sku: i.sku || null, lote: i.lote || null, pedidoId: i.pedidoId || null, unidades: un, receitaCentavos: rec,
            deducaoCentavos: imp != null ? Math.round(rec * imp / 100) : null, cpvCentavos: cpv, fonteCpv: fonte, op: opKey || null,
            lpRealizadoUn: rop && rop.lp != null && num(rop.produzido) > 0 ? num(rop.lp) / num(rop.produzido) : null });
        });
        add('NF_' + san(ak) + '_' + san(nk), { data: String(nf.emitidaEm).slice(0, 10), competencia: comp, historico: 'NF ' + nf.numero + (nf.serie ? '/' + nf.serie : '') + ' · ' + (a.cliente || ''),
          origem: { tipo: 'NF_SAIDA', ref: 'agendamentos_expedicao/' + ak + '/faturamento/nfs/' + nk }, partidas: ps,
          analitico: { cliente: a.cliente || null, clienteKey: a.clienteKey || null, itens: analitico, cobertura: cob, impostosPct: imp, semItens: !itens.length } });
      });
    });
    // 4. Operação do mês: folha e custos fixos (o que a MOD aplicada não absorver é a ociosidade/absorção).
    Object.keys(cus.operacao || {}).forEach(function(comp) {
      if (!/^\d{4}-\d{2}$/.test(comp)) return;
      var o = cus.operacao[comp] || {}, f = Math.round(num(o.folhaProducao) * 100);
      if (f > 0) add('OPER_' + comp + '_FOLHA', { data: comp + '-01', competencia: comp, historico: 'Folha da produção ' + comp, origem: { tipo: 'OPERACAO', ref: 'custos/operacao/' + comp + '/folhaProducao' },
        partidas: [D('FOLHA_PRODUCAO', f, { cc: 'PRODUCAO' }), C('SALARIOS_PAGAR', f)] });
      Object.keys(o.fixos || {}).forEach(function(fk) {
        var x = o.fixos[fk] || {}, v = Math.round(num(x.valor) * 100); if (!(v > 0)) return;
        var adm = x.rateio === 'ADMINISTRATIVO';
        add('OPER_' + comp + '_FIXO_' + san(fk), { data: comp + '-01', competencia: comp, historico: (x.descricao || 'Custo fixo') + ' ' + comp, origem: { tipo: 'OPERACAO', ref: 'custos/operacao/' + comp + '/fixos/' + fk },
          partidas: [D(adm ? 'DESP_ADM' : 'CIF', v, { cc: adm ? 'ADMINISTRATIVO' : 'PRODUCAO' }), C('CONTAS_PAGAR', v)] });
      });
    });
    // 5. PLR do bônus fechado e valendo.
    Object.keys((b.resultado && b.resultado.fechamentos) || {}).forEach(function(comp) {
      var f = b.resultado.fechamentos[comp]; if (!f || f.bonusValendo !== true) return;
      var v = Math.round(num(f.bonus) * 100); if (!(v > 0)) return;
      add('PLR_' + comp, { data: String(f.fechadoEm || comp + '-28').slice(0, 10), competencia: comp, historico: 'PLR da fábrica ' + comp, origem: { tipo: 'BONUS', ref: 'resultado/fechamentos/' + comp },
        partidas: [D('PLR', v, { cc: 'PRODUCAO' }), C('PLR_PAGAR', v)] });
    });
    // 6. Financeiro: saldo inicial dos bancos, títulos sem fato de origem e baixas.
    var fin = b.fin || {};
    Object.keys(fin.contas_bancarias || {}).forEach(function(k) {
      var cb = fin.contas_bancarias[k], v = cb && Math.round(num(cb.saldoInicialCentavos)); if (!v || !cb.dataSaldoInicial) return;
      var ps = v > 0 ? [D('BANCOS', v, { banco: k }), C('SALDOS_ABERTURA', v)] : [D('SALDOS_ABERTURA', -v), C('BANCOS', -v, { banco: k })];
      add('BANCO_' + san(k), { data: cb.dataSaldoInicial, competencia: String(cb.dataSaldoInicial).slice(0, 7), historico: 'Saldo inicial ' + (cb.nome || k), origem: { tipo: 'BANCO', ref: 'fin/contas_bancarias/' + k }, partidas: ps });
    });
    Object.keys(fin.titulos || {}).forEach(function(id) {
      var t = fin.titulos[id]; if (!t || !t.origem || (t.origem.tipo !== 'MANUAL' && t.origem.tipo !== 'IMPORTACAO')) return;
      var v = Math.round(num(t.valorCentavos)), ex = { parceiro: t.parceiro && t.parceiro.nome || null };
      var contaNat = CONTA_DA_NATUREZA[t.natureza] || (t.tipo === 'RECEBER' ? 'OUTRAS_RECEITAS' : 'DESP_ADM');
      var ps;
      if (t.origem.tipo === 'IMPORTACAO') ps = t.tipo === 'PAGAR' ? [D('SALDOS_ABERTURA', v), C(passivoDoTitulo(t), v, ex)] : [D('CLIENTES', v, ex), C('SALDOS_ABERTURA', v)];
      else ps = t.tipo === 'PAGAR' ? [D(contaNat, v, Object.assign({ cc: t.centroCusto || null }, ex)), C(passivoDoTitulo(t), v, ex)] : [D('CLIENTES', v, ex), C(contaNat, v, Object.assign({ cc: t.centroCusto || null }, ex))];
      add('TIT_' + san(id), { data: t.emissao, competencia: t.competencia, historico: (t.origem.tipo === 'IMPORTACAO' ? 'Saldo de abertura: ' : 'Título manual: ') + (t.documento || '') + ' · ' + (ex.parceiro || ''),
        origem: { tipo: 'TITULO', ref: 'fin/titulos/' + id }, partidas: ps });
    });
    Object.keys(fin.baixas || {}).forEach(function(id) {
      var x = fin.baixas[id], t = x && (fin.titulos || {})[x.titulo]; if (!t) return;
      var ps = partidasDaBaixa(x, t); if (!ps) return;
      add('BX_' + san(id), { data: x.data, competencia: String(x.data).slice(0, 7), historico: (x.tipo === 'ESTORNO' ? 'Estorno de ' : '') + (t.tipo === 'PAGAR' ? 'Pagamento: ' : 'Recebimento: ') + (t.documento || x.titulo) + ' · ' + (t.parceiro && t.parceiro.nome || ''),
        origem: { tipo: 'BAIXA', ref: 'fin/baixas/' + id }, partidas: x.tipo === 'ESTORNO' ? inverter(ps) : ps });
    });
    return out;
  }
  // O passivo (ou ativo) que a baixa liquida: o mesmo que a obrigação creditou na origem.
  function passivoDoTitulo(t) {
    if (t.tipo === 'RECEBER') return 'CLIENTES';
    var o = (t.origem || {}).tipo;
    if (o === 'RECEBIMENTO') return 'FORNECEDORES';
    if (o === 'BONUS' || t.natureza === 'PLR') return 'PLR_PAGAR';
    if (t.natureza === 'FOLHA') return 'SALARIOS_PAGAR';
    if (o === 'OPERACAO') return 'CONTAS_PAGAR';
    if (t.natureza === 'IMPOSTOS') return 'CONTAS_PAGAR';
    return 'FORNECEDORES';
  }
  function partidasDaBaixa(x, t) {
    var v = Math.round(num(x.valorCentavos)), j = Math.round(num(x.jurosCentavos)) + Math.round(num(x.multaCentavos)), d = Math.round(num(x.descontoCentavos));
    var liq = v + j - d, ex = { banco: x.conta || null }, pas = passivoDoTitulo(t);
    if (!(v > 0)) return null;
    if (t.tipo === 'PAGAR') return [D(pas, v), j ? D('DESP_FIN', j) : null, d ? C('RECEITA_FIN', d) : null, C('BANCOS', liq, ex)].filter(Boolean);
    return [D('BANCOS', liq, ex), d ? D('DESP_FIN', d) : null, C(pas, v), j ? C('RECEITA_FIN', j) : null].filter(Boolean);
  }

  /* ── Derivação: o que gravar (append-only, com estorno quando o fato muda) ── */
  function competenciaAberta(comp, fechamentos, agoraComp) {
    var f = (fechamentos || {})[comp];
    if (!f || f.status !== 'FECHADO') return { competencia: comp, deslocado: false };
    // Período fechado é imutável: o lançamento vai para o mês aberto, citando o original.
    var c = agoraComp;
    while ((fechamentos[c] || {}).status === 'FECHADO') { var a = Number(c.slice(0, 4)), m = Number(c.slice(5, 7)) + 1; if (m > 12) { m = 1; a++; } c = a + '-' + (m < 10 ? '0' : '') + m; }
    return { competencia: c, deslocado: true };
  }
  function derivar(base, agora) {
    var b = base || {}, ctl = b.ctl || {}, idx = ctl.derivados || {}, fech = ctl.fechamentos || {};
    var agoraComp = String(agora || '').slice(0, 7);
    var esperados = documentosEsperados(b), updates = {}, novos = 0, estornados = 0;
    function gravar(docKey, doc) {
      var c = competenciaAberta(doc.competencia, fech, agoraComp);
      var reg = Object.assign({}, doc, { competencia: c.competencia, competenciaOriginal: c.deslocado ? doc.competencia : null,
        data: c.deslocado ? String(agora).slice(0, 10) : doc.data, criadoEm: agora, criadoPor: 'servidor', versaoMotor: VERSAO });
      updates['ctl/lancamentos/' + c.competencia + '/' + docKey] = reg;
      return c.competencia + '/' + docKey;
    }
    function estornar(atual, motivo) {
      var p = String(atual.doc).split('/'), docKey = p[1] + '_est';
      var orig = atual.partidas;
      if (!orig) return null;
      return gravar(docKey, { data: String(agora).slice(0, 10), competencia: agoraComp, historico: 'Estorno: ' + motivo, origem: atual.origem, estornaDoc: atual.doc, partidas: inverter(orig), totalCentavos: atual.totalCentavos });
    }
    Object.keys(esperados).forEach(function(o) {
      var d = esperados[o], atual = idx[o];
      if (atual && atual.hash === d.hash && !atual.estornado) return;
      var rev = atual ? num(atual.revisao) + 1 : 1;
      if (atual && !atual.estornado) { estornar(atual, 'o fato de origem mudou (revisão ' + rev + ')'); estornados++; }
      var key = san(o) + '_r' + rev;
      var ref = gravar(key, Object.assign({}, d, { revisao: rev }));
      updates['ctl/derivados/' + o] = { doc: ref, hash: d.hash, revisao: rev, partidas: d.partidas, totalCentavos: d.totalCentavos, origem: d.origem, estornado: false, em: agora };
      novos++;
    });
    // Fato que deixou de existir (fixo removido da operação, título estornado na origem): estorna.
    Object.keys(idx).forEach(function(o) {
      if (esperados[o] || idx[o].estornado) return;
      estornar(idx[o], 'o fato de origem deixou de existir');
      updates['ctl/derivados/' + o + '/estornado'] = true;
      estornados++;
    });
    return { updates: updates, novos: novos, estornados: estornados };
  }

  /* ── Leituras: balancete, DRE, CO-PA ─────────────────────────────────── */
  function docsDe(ctl, filtro) {
    var out = [];
    Object.keys((ctl && ctl.lancamentos) || {}).forEach(function(m) {
      Object.keys(ctl.lancamentos[m] || {}).forEach(function(k) { var d = ctl.lancamentos[m][k]; if (d && (!filtro || filtro(d, m))) out.push(Object.assign({ chave: m + '/' + k }, d)); });
    });
    return out;
  }
  function balancete(ctl, ate) {
    var s = {};
    docsDe(ctl, function(d, m) { return !ate || m <= ate; }).forEach(function(d) {
      (d.partidas || []).forEach(function(p) { var x = s[p.conta] = s[p.conta] || { debitoCentavos: 0, creditoCentavos: 0 }; x.debitoCentavos += p.debitoCentavos; x.creditoCentavos += p.creditoCentavos; });
    });
    var plano = planoDeContas(ctl);
    return Object.keys(plano).map(function(k) {
      var x = s[k] || { debitoCentavos: 0, creditoCentavos: 0 }, t = plano[k].tipo;
      var natural = (t === 'PASSIVO' || t === 'PL' || t === 'RECEITA') ? x.creditoCentavos - x.debitoCentavos : x.debitoCentavos - x.creditoCentavos;
      return Object.assign({ saldoCentavos: natural }, plano[k], x);
    });
  }
  function dre(ctl, comp, extras) {
    var g = {}, docs = docsDe(ctl, function(d, m) { return m === comp; }), cob = { real: 0, padrao: 0, pendente: 0 }, semImposto = 0;
    docs.forEach(function(d) {
      (d.partidas || []).forEach(function(p) {
        var pc = PLANO_PADRAO[p.conta]; if (!pc || !pc.grupoDre) return;
        var credora = pc.tipo === 'RECEITA';
        g[pc.grupoDre] = (g[pc.grupoDre] || 0) + (credora ? p.creditoCentavos - p.debitoCentavos : p.debitoCentavos - p.creditoCentavos);
        if (p.conta === 'RECEITA_FIN') g.RECEITA_FIN = (g.RECEITA_FIN || 0) + p.creditoCentavos - p.debitoCentavos;
        if (p.conta === 'DESP_FIN') g.DESP_FIN = (g.DESP_FIN || 0) + p.debitoCentavos - p.creditoCentavos;
      });
      if (d.origem && d.origem.tipo === 'NF_SAIDA' && d.analitico && !d.estornaDoc) {
        var c = d.analitico.cobertura || {}; cob.real += num(c.real); cob.padrao += num(c.padrao); cob.pendente += num(c.pendente);
        if (d.analitico.impostosPct == null) semImposto++;
      }
    });
    function v(k) { return g[k] || 0; }
    var rb = v('RECEITA_BRUTA') + v('OUTRAS_RECEITAS'), ded = v('DEDUCOES'), rl = rb - ded, cpv = v('CPV'), per = v('PERDAS');
    var mc = rl - cpv - per, cfp = v('CUSTO_FIXO_PRODUCAO'), adm = v('DESPESAS_ADM'), com = v('DESPESAS_COMERCIAIS'), plr = v('PLR');
    var ro = mc - cfp - adm - com - plr, rf = (g.RECEITA_FIN || 0) - (g.DESP_FIN || 0);
    var totalUn = cob.real + cob.padrao + cob.pendente;
    var taxa = extras && extras.taxas ? extras.taxas[comp] : null;
    return {
      competencia: comp, documentos: docs.length,
      linhas: [
        { chave: 'RECEITA_BRUTA', rotulo: 'Receita bruta', valor: rb },
        { chave: 'DEDUCOES', rotulo: '(−) Impostos sobre vendas (estimado)', valor: -ded },
        { chave: 'RECEITA_LIQUIDA', rotulo: '= Receita líquida', valor: rl, total: true },
        { chave: 'CPV', rotulo: '(−) Custo do produto vendido', valor: -cpv },
        { chave: 'PERDAS', rotulo: '(−) Perdas de produção', valor: -per },
        { chave: 'MARGEM', rotulo: '= Margem de contribuição', valor: mc, total: true },
        { chave: 'CUSTO_FIXO_PRODUCAO', rotulo: '(−) Custo fixo de produção não absorvido', valor: -cfp },
        { chave: 'DESPESAS_ADM', rotulo: '(−) Despesas administrativas', valor: -adm },
        { chave: 'DESPESAS_COMERCIAIS', rotulo: '(−) Despesas comerciais', valor: -com },
        { chave: 'PLR', rotulo: '(−) PLR', valor: -plr },
        { chave: 'RESULTADO_OPERACIONAL', rotulo: '= Resultado operacional gerencial', valor: ro, total: true },
        { chave: 'RESULTADO_FINANCEIRO', rotulo: '(±) Resultado financeiro', valor: rf },
        { chave: 'RESULTADO', rotulo: '= Resultado do mês', valor: ro + rf, total: true }
      ],
      margemPct: rl > 0 ? mc / rl * 100 : null,
      coberturaCpv: { unidadesReal: cob.real, unidadesPadrao: cob.padrao, unidadesPendente: cob.pendente,
        pctReal: totalUn ? cob.real / totalUn * 100 : null, pctPadrao: totalUn ? cob.padrao / totalUn * 100 : null, pctPendente: totalUn ? cob.pendente / totalUn * 100 : null },
      nfsSemImposto: semImposto,
      // Ociosidade (memória, já dentro do custo fixo): custo da hora paga e parada, das taxas congeladas do Custos.
      ociosidade: taxa ? { custoCentavos: taxa.custoOciosidadeMes != null ? Math.round(num(taxa.custoOciosidadeMes) * 100) : null, ocupacaoPct: taxa.ocupacaoPct != null ? num(taxa.ocupacaoPct) : null } : null
    };
  }
  /* Rentabilidade (CO-PA) por cliente, SKU ou pedido, das NFs da competência.
     Ao lado, o LP realizado das OPs vendidas (módulo de Custos): diferença de
     preço (nota × preço vigente) e de quantidade (vendido × produzido) explica a distância. */
  function coPa(ctl, comp, nivel) {
    var g = {};
    docsDe(ctl, function(d, m) { return m === comp && d.origem && d.origem.tipo === 'NF_SAIDA' && !d.estornaDoc; }).forEach(function(d) {
      ((d.analitico || {}).itens || []).forEach(function(i) {
        var k = nivel === 'sku' ? (i.sku || 'sem SKU') : nivel === 'pedido' ? (i.pedidoId || 'sem pedido') : (d.analitico.cliente || 'sem cliente');
        var x = g[k] = g[k] || { chave: k, unidades: 0, receita: 0, deducoes: 0, cpv: 0, unidadesSemCpv: 0, deducaoPendente: false, lpRealizado: 0, unidadesComLp: 0 };
        x.unidades += i.unidades; x.receita += i.receitaCentavos;
        if (i.deducaoCentavos == null) x.deducaoPendente = true; else x.deducoes += i.deducaoCentavos;
        if (i.cpvCentavos == null) x.unidadesSemCpv += i.unidades; else x.cpv += i.cpvCentavos;
        if (i.lpRealizadoUn != null) { x.lpRealizado += Math.round(i.lpRealizadoUn * 100 * i.unidades); x.unidadesComLp += i.unidades; }
      });
    });
    return Object.keys(g).map(function(k) {
      var x = g[k];
      x.margem = x.unidadesSemCpv || x.deducaoPendente ? null : x.receita - x.deducoes - x.cpv;
      x.margemPct = x.margem != null && x.receita - x.deducoes > 0 ? x.margem / (x.receita - x.deducoes) * 100 : null;
      return x;
    }).sort(function(a, b) { return b.receita - a.receita; });
  }
  function orcamentoXReal(ctl, ano) {
    var orc = ((ctl && ctl.orcamento) || {})[ano] || {}, real = {};
    docsDe(ctl, function(d, m) { return m.slice(0, 4) === ano; }).forEach(function(d) {
      var mm = d.competencia.slice(5, 7);
      (d.partidas || []).forEach(function(p) {
        var pc = PLANO_PADRAO[p.conta]; if (!pc || !pc.grupoDre) return;
        var k = p.conta + '|' + (p.cc || '_') + '|' + mm, cred = pc.tipo === 'RECEITA';
        real[k] = (real[k] || 0) + (cred ? p.creditoCentavos - p.debitoCentavos : p.debitoCentavos - p.creditoCentavos);
      });
    });
    var linhas = {};
    function lin(conta, cc) { var k = conta + '|' + cc; return linhas[k] = linhas[k] || { conta: conta, cc: cc, meses: {} }; }
    Object.keys(orc).forEach(function(conta) { Object.keys(orc[conta] || {}).forEach(function(cc) { Object.keys(orc[conta][cc] || {}).forEach(function(mm) { var l = lin(conta, cc); (l.meses[mm] = l.meses[mm] || { orcado: 0, real: 0 }).orcado += Math.round(num(orc[conta][cc][mm])); }); }); });
    Object.keys(real).forEach(function(k) { var p = k.split('|'), l = lin(p[0], p[1]); (l.meses[p[2]] = l.meses[p[2]] || { orcado: 0, real: 0 }).real += real[k]; });
    return Object.keys(linhas).map(function(k) {
      var l = linhas[k], o = 0, r = 0;
      Object.keys(l.meses).forEach(function(mm) { o += l.meses[mm].orcado; r += l.meses[mm].real; });
      l.orcado = o; l.real = r; l.variacao = r - o; l.variacaoPct = o ? (r - o) / Math.abs(o) * 100 : null;
      return l;
    }).sort(function(a, b) { return String(PLANO_PADRAO[a.conta] ? PLANO_PADRAO[a.conta].codigo : a.conta).localeCompare(String(PLANO_PADRAO[b.conta] ? PLANO_PADRAO[b.conta].codigo : b.conta)) || a.cc.localeCompare(b.cc); });
  }

  /* ── Reconciliação (conta de reconciliação do SAP) ───────────────────── */
  function reconciliacao(base, ate) {
    var b = base || {}, bal = {}; balancete(b.ctl, ate).forEach(function(x) { bal[x.chave] = x.saldoCentavos; });
    var cart = Fin.carteira(b.fin), lotes = b.estoque_lotes || {};
    var pagarForn = 0, receber = 0, semRazao = 0, semRazaoLista = [];
    cart.forEach(function(s) {
      var t = s.titulo;
      if (t.emissao && ate && t.emissao.slice(0, 7) > ate) return;
      if (t.tipo === 'RECEBER') { receber += s.saldoCentavos; return; }
      if (passivoDoTitulo(t) !== 'FORNECEDORES') return;
      pagarForn += s.saldoCentavos;
      // Recebimento anterior ao custo no lote (27/10): o título existe, a ENTRADA no razão de custos não.
      if (t.origem && t.origem.tipo === 'RECEBIMENTO') {
        var p = String(t.origem.ref).split('/'), rec = (((b.pedidos_compra || {})[p[0]] || {}).recebimentos || {})[p[1]] || {};
        var temCusto = vals(rec.itensRecebidos).some(function(l) { var lo = (lotes[san(l.materialCodigo)] || {})[l.loteKey]; return lo && lo.custoFonte === 'PAGO'; });
        if (!temCusto) { semRazao += s.saldoCentavos; semRazaoLista.push({ titulo: s.id, documento: t.documento, parceiro: t.parceiro && t.parceiro.nome, saldoCentavos: s.saldoCentavos }); }
      }
    });
    var contas = [
      { conta: 'FORNECEDORES', razaoCentavos: bal.FORNECEDORES || 0, financeiroCentavos: pagarForn, explicadoCentavos: semRazao,
        explicacao: semRazaoLista.length ? semRazaoLista.length + ' título(s) de recebimento anterior ao custo no lote (sem ENTRADA no razão de custos)' : null, itens: semRazaoLista },
      { conta: 'CLIENTES', razaoCentavos: bal.CLIENTES || 0, financeiroCentavos: receber, explicadoCentavos: 0, explicacao: null, itens: [] }
    ];
    contas.forEach(function(c) { c.diferencaCentavos = c.razaoCentavos - c.financeiroCentavos; c.naoExplicadoCentavos = c.diferencaCentavos + c.explicadoCentavos; });
    return contas;
  }

  /* ── Fechamento ──────────────────────────────────────────────────────── */
  function checklist(base, comp, agora) {
    var b = base || {}, cus = b.custos || {}, ops = b.ops || {}, rops = cus.razao_ops || {}, idx = (b.ctl || {}).derivados || {};
    var esperados = documentosEsperados(b), itens = [];
    var pend = Object.keys(esperados).filter(function(o) { var x = idx[o]; return esperados[o].competencia === comp && (!x || x.hash !== esperados[o].hash); });
    itens.push({ chave: 'DERIVACAO', ok: !pend.length, texto: pend.length ? pend.length + ' fato(s) do mês ainda sem lançamento (o servidor lança a cada 5 min)' : 'Todos os fatos do mês lançados' });
    var nfsPend = vals(esperados).filter(function(d) { return d.competencia === comp && d.origem.tipo === 'NF_SAIDA' && d.analitico && d.analitico.cobertura.pendente > 0; });
    itens.push({ chave: 'CPV', ok: !nfsPend.length, texto: nfsPend.length ? nfsPend.length + ' NF(s) com CPV pendente (OP sem custo e sem ficha padrão)' : 'CPV de todas as NFs com origem' });
    var opsPend = Object.keys(ops).filter(function(k) { var o = ops[k]; return o && o.status === 'Concluído' && String(o.dataFimReal || '').slice(0, 7) === comp && !rops[san(k)]; });
    itens.push({ chave: 'OPS', ok: !opsPend.length, texto: opsPend.length ? opsPend.length + ' OP(s) concluída(s) no mês aguardando custo completo no Custos' : 'OPs do mês com custo lançado' });
    itens.push({ chave: 'OPERACAO', ok: !!(cus.operacao || {})[comp], texto: (cus.operacao || {})[comp] ? 'Folha e custos fixos do mês informados' : 'Folha e custos fixos do mês não informados (Custos › Parâmetros)' });
    itens.push({ chave: 'TAXAS', ok: !!(cus.taxas || {})[comp], texto: (cus.taxas || {})[comp] ? 'Taxas do mês congeladas' : 'Taxas do mês não congeladas (o Custos congela com a tabela de pontos)' });
    itens.push({ chave: 'IMPOSTOS', ok: Custos.impostosPct(cus.parametros, null) != null, texto: Custos.impostosPct(cus.parametros, null) != null ? '% de impostos definido' : '% de impostos não definido: deduções ficam de fora' });
    var rec = reconciliacao(b, comp).filter(function(c) { return Math.abs(c.naoExplicadoCentavos) > 100; });
    itens.push({ chave: 'RECONCILIACAO', ok: !rec.length, texto: rec.length ? 'Diferença não explicada entre razão e Financeiro em ' + rec.map(function(c) { return c.conta; }).join(', ') : 'Razão e Financeiro reconciliados' });
    var compls = b.fin ? Fin.complementos(b).length : 0;
    itens.push({ chave: 'COMPLEMENTOS', ok: !compls, texto: compls ? compls + ' complemento(s) abertos no Financeiro' : 'Sem complementos abertos no Financeiro' });
    return { competencia: comp, itens: itens, ok: itens.every(function(i) { return i.ok; }), mesCorrente: comp >= String(agora || '').slice(0, 7) };
  }
  function prepararFechamento(base, comp, opcoes) {
    var o = opcoes || {}, f = ((base.ctl || {}).fechamentos || {})[comp];
    if (f && f.status === 'FECHADO') return { ok: false, motivo: comp + ' já está fechado.' };
    var ck = checklist(base, comp, o.agora);
    if (ck.mesCorrente) return { ok: false, motivo: 'Só se fecha mês que já terminou.' };
    if (!ck.ok && !(o.forcar && String(o.justificativa || '').trim().length >= 10)) return { ok: false, motivo: 'Checklist com pendências: ' + ck.itens.filter(function(i) { return !i.ok; }).map(function(i) { return i.texto; }).join('; ') + '. O ADM pode forçar com justificativa.', checklist: ck };
    var d = dre(base.ctl, comp, { taxas: (base.custos || {}).taxas });
    var u = {};
    u['ctl/fechamentos/' + comp + '/status'] = 'FECHADO';
    u['ctl/fechamentos/' + comp + '/fechadoEm'] = o.agora;
    u['ctl/fechamentos/' + comp + '/fechadoPor'] = o.por || null;
    u['ctl/fechamentos/' + comp + '/forcado'] = !ck.ok;
    u['ctl/fechamentos/' + comp + '/justificativa'] = ck.ok ? null : String(o.justificativa).slice(0, 500);
    u['ctl/fechamentos/' + comp + '/checklist'] = ck.itens;
    u['ctl/fechamentos/' + comp + '/dre'] = d.linhas.map(function(l) { return { chave: l.chave, valorCentavos: l.valor }; });
    u['ctl/fechamentos/' + comp + '/versaoMotor'] = VERSAO;
    return { ok: true, updates: u };
  }

  /* ── Lançamento manual (ajuste da diretoria) e export ao contador ───── */
  function validarAjuste(d, plano) {
    var x = d || {}, ps = (x.partidas || []).map(function(p) { return { conta: p.conta, cc: p.cc || null, debitoCentavos: Math.round(num(p.debitoCentavos)), creditoCentavos: Math.round(num(p.creditoCentavos)) }; });
    if (String(x.historico || '').trim().length < 10) return { ok: false, motivo: 'Histórico obrigatório (mínimo 10 caracteres): o ajuste precisa dizer por quê.' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.data || ''))) return { ok: false, motivo: 'Data inválida.' };
    for (var i = 0; i < ps.length; i++) if (plano && plano[ps[i].conta] && plano[ps[i].conta].ativa === false) return { ok: false, motivo: 'Conta inativa: ' + ps[i].conta };
    var bal = documentoBalanceado(ps);
    if (!bal.ok) return { ok: false, motivo: 'Documento recusado: ' + bal.motivo + '.' };
    return { ok: true, doc: { data: x.data, competencia: x.data.slice(0, 7), historico: String(x.historico).trim().slice(0, 300), origem: { tipo: 'AJUSTE', ref: null }, partidas: bal.partidas, totalCentavos: bal.totalCentavos } };
  }
  function exportarContador(ctl, comp) {
    var plano = planoDeContas(ctl), linhas = ['data;documento;conta;codigo;conta_referencial;centro_custo;debito;credito;historico'];
    function br(c) { return (c / 100).toFixed(2).replace('.', ','); }
    function q(s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; }
    docsDe(ctl, function(d, m) { return m === comp; }).sort(function(a, b) { return String(a.data).localeCompare(String(b.data)); }).forEach(function(d) {
      (d.partidas || []).forEach(function(p) {
        var c = plano[p.conta] || {};
        linhas.push([d.data, q(d.chave), q(c.nome), c.codigo || '', c.contaReferencial || '', p.cc || '', br(p.debitoCentavos), br(p.creditoCentavos), q(d.historico)].join(';'));
      });
    });
    return linhas.join('\r\n');
  }

  return {
    VERSAO: VERSAO, PLANO_PADRAO: PLANO_PADRAO, CENTROS_PADRAO: CENTROS_PADRAO, CONTA_DA_NATUREZA: CONTA_DA_NATUREZA,
    planoDeContas: planoDeContas, centrosDeCusto: centrosDeCusto, documentoBalanceado: documentoBalanceado, inverter: inverter,
    partidasDoRazao: partidasDoRazao, passivoDoTitulo: passivoDoTitulo, partidasDaBaixa: partidasDaBaixa,
    documentosEsperados: documentosEsperados, derivar: derivar, docsDe: docsDe, balancete: balancete, dre: dre, coPa: coPa,
    orcamentoXReal: orcamentoXReal, reconciliacao: reconciliacao, checklist: checklist, prepararFechamento: prepararFechamento,
    validarAjuste: validarAjuste, exportarContador: exportarContador
  };
});
