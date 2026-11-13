/* Financeiro — relatórios do WebMais (12/11/2026, Entrega A). Funções PURAS, sem
 * banco e sem DOM, sobre o motor `Financeiro` (shared/financeiro.js). Só LEEM `fin/`.
 *
 * Cada relatório devolve a mesma estrutura dos relatórios da F8:
 *   {titulo, colunas: [{chave, rotulo, tipo: texto|data|valor, semTotal?}], linhas, totais, avisos?, erro?}
 * e por isso serve a tela, a impressão e o CSV com o mesmo total. Regra para que o
 * total do CSV feche com a soma das linhas: linha de subtotal (destaque) nunca põe
 * valor numa coluna que se soma; ela usa uma coluna própria com `semTotal`.
 *
 * Mapa WebMais → função:
 *   Caixas e bancos › Espelho de caixa diário ........ relEspelhoDiario
 *   Caixas e bancos › Saldo das contas / movimentação . relSaldosContas
 *   Caixas e bancos › Lançamento bancário ............. relMovimentos
 *   Caixas e bancos › Fluxo realizado/previsto ........ relRealizadoPrevisto
 *   Caixas e bancos › Gastos elemento/centro de custo . relGastosCentroCusto
 *   A pagar › Lançamento de despesas .................. relLancamentoDespesas
 *   A pagar › Fornecedores em aberto / A receber › Clientes em aberto ... relEmAberto
 *   Principais fornecedores (narração) ................ relRanking
 *   A pagar › Evolução de pagamento ................... relEvolucao
 *   A receber › Composição de vencimentos ............. relComposicaoVencimentos
 *   A receber › Conta corrente p/ cliente ............. relContaCorrente
 *   A receber › Conciliação de clientes ............... relConciliacaoParceiros
 *   A receber › Cálculo de antecipação ................ relAntecipacao
 *   Prazo médio de recebimento e de pagamento ......... relPrazosMedios
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./financeiro'));
  else root.FinanceiroRelatorios = factory(root.Financeiro);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(F) {
  'use strict';

  // Mesmos centros padrão da Controladoria (controladoria.js, CENTROS_PADRAO); o teste
  // confere que as duas listas não se separam. Centros cadastrados lá se somam a estes.
  var CENTROS_PADRAO = { PRODUCAO: 'Produção (geral)', MANIPULACAO: 'Manipulação', ROTULAGEM: 'Rotulagem', LOGISTICA: 'Logística',
    QUALIDADE: 'Qualidade', COMERCIAL: 'Comercial', ADMINISTRATIVO: 'Administrativo' };
  var ROT_NAT = { MATERIA_PRIMA: 'Matéria-prima', EMBALAGEM: 'Embalagem', USO_E_CONSUMO: 'Uso e consumo', OUTROS: 'Outros', FRETE: 'Frete', FOLHA: 'Folha',
    CUSTO_FIXO_PRODUCAO: 'Custo fixo da produção', CUSTO_FIXO_ADM: 'Custo fixo administrativo', DESPESA_COMERCIAL: 'Despesa comercial', PLR: 'PLR',
    IMPOSTOS: 'Impostos', RECEITA_VENDA: 'Receita de vendas', OUTRAS_RECEITAS: 'Outras receitas' };
  var ROT_ORIGEM = { RECEBIMENTO: 'Recebimento', NF_SAIDA: 'NF de saída', OPERACAO: 'Operação do mês', BONUS: 'PLR', MANUAL: 'Manual', IMPORTACAO: 'Saldo de abertura', RENEGOCIACAO: 'Renegociação' };
  var SEM_CC = 'Sem centro de custo';

  /* ── Utilitários ─────────────────────────────────────────────────────── */
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function cent(v) { return Math.round(num(v)); }
  function dataOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10)); }
  function diffDias(a, b) { return Math.round((new Date(String(a).slice(0, 10) + 'T12:00:00Z') - new Date(String(b).slice(0, 10) + 'T12:00:00Z')) / 864e5); }
  function dentro(d, de, ate) { d = String(d || '').slice(0, 10); return !!d && (!de || d >= de) && (!ate || d <= ate); }
  function vals(o) { return Object.keys(o || {}).map(function(k) { return o[k]; }).filter(Boolean); }
  function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function mascaraDoc(v) {
    var d = soDigitos(v);
    if (d.length === 14) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
    if (d.length === 11) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
    return String(v == null ? '' : v);
  }
  function somaCol(linhas, colunas) {
    var t = {};
    colunas.forEach(function(c) { if (c.tipo === 'valor' && !c.semTotal) t[c.chave] = linhas.reduce(function(s, l) { return s + (cent(l[c.chave]) || 0); }, 0); });
    return t;
  }
  function pct(parte, total) { return total ? (Math.round(parte * 1000 / total) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%' : ''; }
  function dias(n) { return n == null ? '' : n + ' d'; }
  function vazio(titulo, erro) { return { titulo: titulo, colunas: [], linhas: [], totais: {}, erro: erro }; }
  function rotNat(n) { return ROT_NAT[n] || n || ''; }
  function nomeParc(t) { return (t && t.parceiro && t.parceiro.nome) || ''; }
  // O mesmo fornecedor/cliente com nomes escritos diferente: o CNPJ manda; sem CNPJ, o nome.
  function chaveParc(t) { var d = soDigitos(t && t.parceiro && t.parceiro.cnpj); return d.length >= 11 ? 'D' + d : 'N' + nomeParc(t).trim().toUpperCase(); }
  function filtroParc(t, q) { q = String(q || '').trim().toUpperCase(); return !q || nomeParc(t).toUpperCase().indexOf(q) >= 0 || soDigitos(t.parceiro && t.parceiro.cnpj).indexOf(soDigitos(q) || '§') >= 0; }
  // Título nascido de renegociação: o gasto/receita já está no original (Entrega B). Por emissão ele
  // não conta de novo; por pagamento, a baixa dele conta normalmente.
  function ehReneg(t) { return !!(t && t.origem && t.origem.tipo === 'RENEGOCIACAO'); }
  var ROT_STATUS = { RENEGOCIADO: 'Renegociado', CANCELADO: 'Cancelado', ABATIDO: 'Abatido' };
  function tipoDe(o) { return o && o.tipo === 'RECEBER' ? 'RECEBER' : 'PAGAR'; }
  function rotParceiro(tipo) { return tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente'; }
  function nomeConta(fin, k) { return (((fin || {}).contas_bancarias || {})[k] || {}).nome || k || ''; }
  function centros(extra) {
    var c = {};
    Object.keys(CENTROS_PADRAO).forEach(function(k) { c[k] = CENTROS_PADRAO[k]; });
    Object.keys(extra || {}).forEach(function(k) { var x = extra[k]; if (x) c[k] = typeof x === 'string' ? x : (x.nome || k); });
    return c;
  }
  // Baixas estornadas (o estorno guarda `estorna`).
  function estornadas(fin) { var e = {}; vals((fin || {}).baixas).forEach(function(x) { if (x.tipo === 'ESTORNO') e[x.estorna] = true; }); return e; }
  // Divide um valor entre as naturezas do título (recebimento com MP e embalagem) na
  // proporção de `porNatureza`; centavos inteiros, a última fatia absorve o resto.
  function ratear(valor, t) {
    var pn = t && t.porNatureza, ks = pn ? Object.keys(pn).filter(function(k) { return num(pn[k]) > 0; }).sort() : [];
    var base = ks.reduce(function(s, k) { return s + num(pn[k]); }, 0);
    if (ks.length < 2 || !(base > 0)) return [{ natureza: (t && t.natureza) || 'OUTROS', valor: valor }];
    var usado = 0;
    return ks.map(function(k, i) {
      var v = i === ks.length - 1 ? valor - usado : Math.round(valor * num(pn[k]) / base); usado += v;
      return { natureza: k, valor: v };
    });
  }
  function temNatureza(t, nat) { return t.natureza === nat || !!(t.porNatureza && num(t.porNatureza[nat]) > 0); }
  function multiNatureza(t) { var pn = t && t.porNatureza; return !!pn && Object.keys(pn).filter(function(k) { return num(pn[k]) > 0; }).length > 1; }
  function valorNaNatureza(valor, t, nat) {
    if (!nat) return valor;
    return ratear(valor, t).filter(function(x) { return x.natureza === nat; }).reduce(function(s, x) { return s + x.valor; }, 0);
  }
  function inicioPeriodo(d, g) {
    d = String(d).slice(0, 10);
    if (g === 'MES') return d.slice(0, 8) + '01';
    if (g === 'SEMANA') { var x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); }
    return d;
  }
  // Períodos de `de` a `ate`. Mais de 400 colunas não cabe numa tela: devolve null.
  function periodos(de, ate, g) {
    var out = [], ini = inicioPeriodo(de, g);
    while (ini <= ate) {
      var prox = F.somarPeriodo(ini, g, 1);
      out.push({ inicio: ini, fim: F.addDias(prox, -1) });
      if (out.length > 400) return null;
      ini = prox;
    }
    return out;
  }
  function validarPeriodo(o) {
    if (!dataOk(o.de) || !dataOk(o.ate)) return 'Informe o período (de e até).';
    if (o.de > o.ate) return 'A data inicial é depois da final.';
    return null;
  }

  /* ── Caixas e bancos ─────────────────────────────────────────────────── */
  /* Espelho de caixa diário. f: {data, conta?}. Cada conta: saldo anterior, os
     lançamentos do dia e o saldo final (linhas em destaque, só na coluna Saldo). */
  function relEspelhoDiario(fin, f) {
    var o = f || {}, cs = (fin || {}).contas_bancarias || {}, ks = Object.keys(cs);
    var titulo = 'Espelho de caixa diário';
    if (!dataOk(o.data)) return vazio(titulo, 'Informe o dia.');
    if (o.conta) { if (!cs[o.conta]) return vazio(titulo, 'Conta não encontrada.'); ks = [o.conta]; }
    if (!ks.length) return vazio(titulo, 'Nenhuma conta cadastrada (Cadastros).');
    var linhas = [], saldoFinal = 0;
    ks.forEach(function(k) {
      var ex = F.extratoConta(fin, k, o.data, o.data); if (!ex.ok) return;
      linhas.push({ conta: ex.nome, historico: 'Saldo anterior', saldo: ex.saldoAnteriorCentavos, destaque: true });
      ex.linhas.forEach(function(l) {
        var ini = l.tipo === 'SALDO_INICIAL';
        linhas.push({ conta: ex.nome, historico: l.historico + (ini ? ' (abertura da conta)' : ''), entrada: !ini && l.valorCentavos > 0 ? l.valorCentavos : null,
          saida: l.valorCentavos < 0 ? -l.valorCentavos : null, saldo: l.saldoCentavos });
      });
      if (!ex.linhas.length) linhas.push({ conta: ex.nome, historico: 'Sem movimento no dia' });
      linhas.push({ conta: ex.nome, historico: 'Saldo final do dia', saldo: ex.saldoFinalCentavos, destaque: true });
      saldoFinal += ex.saldoFinalCentavos;
    });
    var colunas = [{ chave: 'conta', rotulo: 'Conta', tipo: 'texto' }, { chave: 'historico', rotulo: 'Histórico', tipo: 'texto' },
      { chave: 'entrada', rotulo: 'Entrada', tipo: 'valor' }, { chave: 'saida', rotulo: 'Saída', tipo: 'valor' }, { chave: 'saldo', rotulo: 'Saldo', tipo: 'valor', semTotal: true }];
    var tot = somaCol(linhas, colunas); tot.saldo = saldoFinal; // total do Saldo = soma dos saldos finais
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: tot };
  }
  /* Saldo das contas e movimentação por conta. f: {de, ate}.
     Saldo anterior + abertura + entradas − saídas = saldo final (conferido no teste). */
  function relSaldosContas(fin, f) {
    var o = f || {}, cs = (fin || {}).contas_bancarias || {}, titulo = 'Saldo das contas';
    var err = validarPeriodo(o); if (err) return vazio(titulo, err);
    var linhas = Object.keys(cs).map(function(k) {
      var ex = F.extratoConta(fin, k, o.de, o.ate), ab = 0;
      ex.linhas.forEach(function(l) { if (l.tipo === 'SALDO_INICIAL') ab += l.valorCentavos; });
      return { conta: ex.nome, tipo: F.TIPOS_CONTA[ex.tipo] || ex.tipo, anterior: ex.saldoAnteriorCentavos, abertura: ab,
        entradas: ex.entradasCentavos, saidas: ex.saidasCentavos, final: ex.saldoFinalCentavos };
    });
    var colunas = [{ chave: 'conta', rotulo: 'Conta', tipo: 'texto' }, { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' }, { chave: 'anterior', rotulo: 'Saldo anterior', tipo: 'valor' },
      { chave: 'abertura', rotulo: 'Abertura no período', tipo: 'valor' }, { chave: 'entradas', rotulo: 'Entradas', tipo: 'valor' }, { chave: 'saidas', rotulo: 'Saídas', tipo: 'valor' },
      { chave: 'final', rotulo: 'Saldo final', tipo: 'valor' }];
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas),
      avisos: linhas.length ? [] : ['Nenhuma conta cadastrada (Cadastros).'] };
  }
  /* Lançamento bancário: tarifa, IOF, juros, rendimento e transferência (fin/movimentos).
     f: {de, ate, conta (origem), destino, tipo}. Estorno entra negativo. */
  function relMovimentos(fin, f) {
    var o = f || {}, x = fin || {}, titulo = 'Lançamentos bancários';
    var err = validarPeriodo(o); if (err) return vazio(titulo, err);
    var linhas = [];
    Object.keys(x.movimentos || {}).forEach(function(k) {
      var m = x.movimentos[k]; if (!m || !dentro(m.data, o.de, o.ate)) return;
      if (o.conta && m.conta !== o.conta) return;
      if (o.destino && m.destino !== o.destino) return;
      if (o.tipo && m.tipo !== o.tipo) return;
      var est = m.tipoRegistro === 'ESTORNO', rot = (F.TIPOS_MOVIMENTO[m.tipo] || {}).rotulo || m.tipo;
      linhas.push({ data: m.data, tipo: (est ? 'Estorno: ' : '') + rot, origem: nomeConta(x, m.conta), destino: m.destino ? nomeConta(x, m.destino) : '',
        historico: m.historico || '', por: m.criadoPor || '', valor: (est ? -1 : 1) * cent(m.valorCentavos), criado: String(m.criadoEm || '') });
    });
    linhas.sort(function(a, b) { return a.data.localeCompare(b.data) || a.criado.localeCompare(b.criado); });
    linhas.forEach(function(l) { delete l.criado; });
    var colunas = [{ chave: 'data', rotulo: 'Data', tipo: 'data' }, { chave: 'tipo', rotulo: 'Tipo', tipo: 'texto' }, { chave: 'origem', rotulo: 'Conta (origem)', tipo: 'texto' },
      { chave: 'destino', rotulo: 'Conta destino', tipo: 'texto' }, { chave: 'historico', rotulo: 'Histórico', tipo: 'texto' }, { chave: 'por', rotulo: 'Lançado por', tipo: 'texto' },
      { chave: 'valor', rotulo: 'Valor', tipo: 'valor' }];
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas) };
  }
  /* Fluxo de caixa realizado × previsto. f: {de, ate, granularidade DIA|SEMANA|MES}.
     Previsto = parcelas com vencimento no período (o que estava combinado); realizado =
     principal das baixas no período (estorno abate). Juros, multa e desconto ficam de
     fora dos dois lados para a comparação ser do mesmo valor. */
  function relRealizadoPrevisto(fin, f) {
    var o = f || {}, g = ['DIA', 'SEMANA', 'MES'].indexOf(o.granularidade) >= 0 ? o.granularidade : 'MES', titulo = 'Fluxo de caixa realizado × previsto';
    var err = validarPeriodo(o); if (err) return vazio(titulo, err);
    var ps = periodos(o.de, o.ate, g); if (!ps) return vazio(titulo, 'Período longo demais para esta periodicidade: escolha por semana ou por mês.');
    var linhas = ps.map(function(p) { return { periodo: p.inicio, inicio: p.inicio, fim: p.fim, prevE: 0, realE: 0, difE: 0, prevS: 0, realS: 0, difS: 0 }; });
    function lin(d) { for (var i = 0; i < linhas.length; i++) if (d >= linhas[i].inicio && d <= linhas[i].fim) return linhas[i]; return null; }
    var semData = { PAGAR: 0, RECEBER: 0 };
    F.carteira(fin).forEach(function(s) {
      // Devolvido, renegociado ou cancelado: o combinado deixou de valer (o título novo da renegociação prevê).
      if (s.status === 'ABATIDO' || s.status === 'RENEGOCIADO' || s.status === 'CANCELADO') return;
      var rec = s.titulo.tipo === 'RECEBER';
      if (!s.parcelas.length) { semData[s.titulo.tipo] += cent(s.titulo.valorCentavos); return; }
      s.parcelas.forEach(function(p) { var l = lin(p.vencimento); if (l) l[rec ? 'prevE' : 'prevS'] += p.valorCentavos; });
    });
    vals((fin || {}).baixas).forEach(function(x) {
      var l = lin(x.data); if (!l) return;
      l[x.tituloTipo === 'RECEBER' ? 'realE' : 'realS'] += (x.tipo === 'ESTORNO' ? -1 : 1) * cent(x.valorCentavos);
    });
    linhas.forEach(function(l) { l.difE = l.realE - l.prevE; l.difS = l.realS - l.prevS; delete l.inicio; delete l.fim; });
    var colunas = [{ chave: 'periodo', rotulo: { DIA: 'Dia', SEMANA: 'Semana de', MES: 'Mês de' }[g], tipo: 'data' },
      { chave: 'prevE', rotulo: 'Entradas previstas', tipo: 'valor' }, { chave: 'realE', rotulo: 'Entradas realizadas', tipo: 'valor' }, { chave: 'difE', rotulo: 'Diferença (entradas)', tipo: 'valor' },
      { chave: 'prevS', rotulo: 'Saídas previstas', tipo: 'valor' }, { chave: 'realS', rotulo: 'Saídas realizadas', tipo: 'valor' }, { chave: 'difS', rotulo: 'Diferença (saídas)', tipo: 'valor' }];
    var av = ['Previsto = parcelas que venciam no período; realizado = principal baixado no período (juros, multa e desconto à parte). Pagamento adiantado ou atrasado aparece como diferença nos dois períodos.'];
    if (semData.PAGAR || semData.RECEBER) av.push('Fora do previsto por não ter vencimento: a pagar R$ ' + (semData.PAGAR / 100).toFixed(2).replace('.', ',') + ' · a receber R$ ' + (semData.RECEBER / 100).toFixed(2).replace('.', ',') + ' (Complementos).');
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas), avisos: av };
  }
  /* Gastos por centro de custo e elemento (natureza). f: {de, ate, dataBase EMISSAO|PAGAMENTO,
     centroCusto, natureza, centros (cadastrados na Controladoria)}. Linha por título e
     natureza; subtotal por natureza e por centro na coluna própria "Subtotal". */
  function relGastosCentroCusto(fin, f) {
    var o = f || {}, x = fin || {}, nomes = centros(o.centros), pag = o.dataBase === 'PAGAMENTO';
    var titulo = 'Gastos por centro de custo' + (pag ? ' (pagos)' : ' (lançados)');
    var err = validarPeriodo(o); if (err) return vazio(titulo, err);
    var itens = [], rateado = false;
    function add(t, id, data, valor) {
      var cc = t.centroCusto || '';
      if (o.centroCusto && (o.centroCusto === '_SEM' ? cc : cc !== o.centroCusto)) return;
      if (multiNatureza(t)) rateado = true;
      ratear(valor, t).forEach(function(r) {
        if (o.natureza && r.natureza !== o.natureza) return;
        if (!r.valor) return;
        itens.push({ cc: cc, centro: cc ? (nomes[cc] || cc) : SEM_CC, natureza: rotNat(r.natureza), documento: t.documento || id, parceiro: nomeParc(t), data: data, valor: r.valor });
      });
    }
    if (pag) {
      vals(x.baixas).forEach(function(b) {
        if (b.tituloTipo !== 'PAGAR' || !dentro(b.data, o.de, o.ate)) return;
        if (o.semAdiantamentos && b.forma === 'ADIANTAMENTO') return; // "não exibir adiantamentos"
        var t = (x.titulos || {})[b.titulo]; if (!t) return;
        add(t, b.titulo, b.data, (b.tipo === 'ESTORNO' ? -1 : 1) * cent(b.valorCentavos));
      });
    } else {
      Object.keys(x.titulos || {}).forEach(function(id) {
        var t = x.titulos[id]; if (!t || t.tipo !== 'PAGAR' || ehReneg(t) || !dentro(t.emissao, o.de, o.ate)) return;
        add(t, id, t.emissao, cent(t.valorCentavos));
      });
    }
    // Centro sem nome primeiro? Não: "Sem centro de custo" por último, para não esconder o que tem dono.
    itens.sort(function(a, b) { return (a.cc ? 0 : 1) - (b.cc ? 0 : 1) || a.centro.localeCompare(b.centro) || a.natureza.localeCompare(b.natureza) || String(a.data).localeCompare(String(b.data)); });
    var linhas = [], i = 0;
    while (i < itens.length) {
      var c = itens[i].centro, totC = 0;
      while (i < itens.length && itens[i].centro === c) {
        var n = itens[i].natureza, totN = 0;
        while (i < itens.length && itens[i].centro === c && itens[i].natureza === n) {
          var it = itens[i++]; totN += it.valor;
          linhas.push({ centro: it.centro, natureza: it.natureza, documento: it.documento, parceiro: it.parceiro, data: it.data, valor: it.valor });
        }
        linhas.push({ centro: c, natureza: n, documento: 'Subtotal ' + n, subtotal: totN, destaque: true });
        totC += totN;
      }
      linhas.push({ centro: c, documento: 'Total do centro ' + c, subtotal: totC, destaque: true });
    }
    var colunas = [{ chave: 'centro', rotulo: 'Centro de custo', tipo: 'texto' }, { chave: 'natureza', rotulo: 'Elemento (natureza)', tipo: 'texto' },
      { chave: 'documento', rotulo: 'Documento', tipo: 'texto' }, { chave: 'parceiro', rotulo: 'Fornecedor', tipo: 'texto' },
      { chave: 'data', rotulo: pag ? 'Pagamento' : 'Emissão', tipo: 'data' }, { chave: 'valor', rotulo: 'Valor', tipo: 'valor' }, { chave: 'subtotal', rotulo: 'Subtotal', tipo: 'valor', semTotal: true }];
    var av = [];
    if (itens.some(function(it) { return !it.cc; })) av.push('Títulos sem centro de custo aparecem em "' + SEM_CC + '": o recebimento contra pedido de compra nasce assim; no título manual, informe o centro ao lançar.');
    if (rateado) av.push('Recebimento com mais de uma natureza (ex.: matéria-prima e embalagem) é dividido na proporção dos itens.');
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas), avisos: av };
  }

  /* ── A pagar e a receber ─────────────────────────────────────────────── */
  /* Lançamento de despesas: títulos a pagar por emissão, um por linha.
     f: {de, ate, usuario, centroCusto, natureza, situacao ABERTOS|QUITADOS|TODOS, parceiro, origem, centros} */
  function relLancamentoDespesas(fin, f) {
    var o = f || {}, nomes = centros(o.centros), q = String(o.usuario || '').trim().toUpperCase(), titulo = 'Lançamento de despesas';
    var err = validarPeriodo(o); if (err) return vazio(titulo, err);
    var linhas = [], renegs = 0;
    F.carteira(fin).forEach(function(s) {
      var t = s.titulo;
      if (t.tipo !== 'PAGAR' || !dentro(t.emissao, o.de, o.ate) || !filtroParc(t, o.parceiro)) return;
      if (ehReneg(t)) { renegs++; return; }
      if (o.natureza && !temNatureza(t, o.natureza)) return;
      if (o.centroCusto && (o.centroCusto === '_SEM' ? t.centroCusto : t.centroCusto !== o.centroCusto)) return;
      if (o.origem && (t.origem && t.origem.tipo) !== o.origem) return;
      if (q && String(t.criadoPor || '').toUpperCase().indexOf(q) < 0) return;
      if (o.situacao === 'ABERTOS' && !(s.saldoCentavos > 0)) return;
      if (o.situacao === 'QUITADOS' && s.saldoCentavos > 0) return;
      var p = s.abertas[0];
      linhas.push({ emissao: t.emissao, documento: t.documento || s.id, parceiro: nomeParc(t), natureza: rotNat(t.natureza), centro: t.centroCusto ? (nomes[t.centroCusto] || t.centroCusto) : '',
        origem: ROT_ORIGEM[t.origem && t.origem.tipo] || (t.origem && t.origem.tipo) || '', usuario: t.criadoPor || '', condicao: F.resumoParcelas(s),
        vencimento: p ? p.vencimento : '', valor: cent(t.valorCentavos), pago: cent(s.pagoCentavos), aberto: s.saldoCentavos,
        situacao: s.saldoCentavos <= 0 ? (ROT_STATUS[s.status] || 'Quitado') : s.semVencimento ? 'Sem vencimento' : (s.bloqueio ? 'Bloqueado' : 'Em aberto') });
    });
    linhas.sort(function(a, b) { return String(a.emissao).localeCompare(String(b.emissao)) || a.parceiro.localeCompare(b.parceiro); });
    var colunas = [{ chave: 'emissao', rotulo: 'Emissão', tipo: 'data' }, { chave: 'documento', rotulo: 'Documento', tipo: 'texto' }, { chave: 'parceiro', rotulo: 'Fornecedor', tipo: 'texto' },
      { chave: 'natureza', rotulo: 'Natureza', tipo: 'texto' }, { chave: 'centro', rotulo: 'Centro de custo', tipo: 'texto' }, { chave: 'origem', rotulo: 'Origem', tipo: 'texto' },
      { chave: 'usuario', rotulo: 'Lançado por', tipo: 'texto' }, { chave: 'condicao', rotulo: 'Parcelas', tipo: 'texto' }, { chave: 'vencimento', rotulo: 'Próx. vencimento', tipo: 'data' },
      { chave: 'valor', rotulo: 'Valor', tipo: 'valor' }, { chave: 'pago', rotulo: 'Pago', tipo: 'valor' }, { chave: 'aberto', rotulo: 'Em aberto', tipo: 'valor' }, { chave: 'situacao', rotulo: 'Situação', tipo: 'texto' }];
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas),
      avisos: renegs ? [renegs + ' título(s) de renegociação fora da lista: a despesa já está no título original (aparece como "Renegociado").'] : [] };
  }
  /* Em aberto por parceiro, com a posição de vencimento (fornecedores/clientes em aberto).
     f: {tipo, hoje, natureza, parceiro}. Mesmas faixas do aging; o total bate com ele. */
  function relEmAberto(fin, f) {
    var o = f || {}, tipo = tipoDe(o), por = {}, titulo = (tipo === 'PAGAR' ? 'Fornecedores' : 'Clientes') + ' em aberto';
    if (!dataOk(o.hoje)) return vazio(titulo, 'Data de referência inválida.');
    F.carteira(fin).forEach(function(s) {
      var t = s.titulo;
      if (t.tipo !== tipo || s.saldoCentavos <= 0 || !filtroParc(t, o.parceiro)) return;
      if (o.natureza && t.natureza !== o.natureza) return;
      var k = chaveParc(t), l = por[k] = por[k] || { parceiro: nomeParc(t), cnpj: mascaraDoc(t.parceiro && t.parceiro.cnpj), n: 0, proximo: '', atraso: null,
        A_VENCER: 0, D1_30: 0, D31_60: 0, D61_90: 0, D90: 0, SEM_VENCIMENTO: 0 };
      l.n++;
      if (s.semVencimento) { l.SEM_VENCIMENTO += s.saldoCentavos; return; }
      s.abertas.forEach(function(p) {
        var d = diffDias(o.hoje, p.vencimento);
        l[d <= 0 ? 'A_VENCER' : d <= 30 ? 'D1_30' : d <= 60 ? 'D31_60' : d <= 90 ? 'D61_90' : 'D90'] += p.abertoCentavos;
        if (d <= 0 && (!l.proximo || p.vencimento < l.proximo)) l.proximo = p.vencimento;
        if (d > 0 && (l.atraso == null || d > l.atraso)) l.atraso = d;
      });
    });
    // Adiantamento ainda disponível do parceiro (Entrega B): coluna própria, fora do total em aberto.
    var ads = F.saldosAdiantamentos(fin);
    Object.keys(ads).forEach(function(k) {
      var a = ads[k]; if (a.tipo !== tipo || !(a.saldoCentavos > 0) || !filtroParc({ parceiro: a.parceiro }, o.parceiro)) return;
      var pk = F.chaveParceiro(a.parceiro);
      if (!por[pk]) { if (o.natureza) return; por[pk] = { parceiro: a.parceiro.nome || '', cnpj: mascaraDoc(a.parceiro.cnpj), n: 0, proximo: '', atraso: null, A_VENCER: 0, D1_30: 0, D31_60: 0, D61_90: 0, D90: 0, SEM_VENCIMENTO: 0 }; }
      por[pk].adiantamento = (por[pk].adiantamento || 0) + a.saldoCentavos;
    });
    var linhas = Object.keys(por).map(function(k) {
      var l = por[k]; l.total = l.A_VENCER + l.D1_30 + l.D31_60 + l.D61_90 + l.D90 + l.SEM_VENCIMENTO; l.vencido = l.D1_30 + l.D31_60 + l.D61_90 + l.D90;
      l.adiantamento = l.adiantamento || 0;
      l.titulos = String(l.n); l.maiorAtraso = dias(l.atraso); delete l.n; delete l.atraso; return l;
    }).sort(function(a, b) { return b.total - a.total || a.parceiro.localeCompare(b.parceiro); });
    var colunas = [{ chave: 'parceiro', rotulo: rotParceiro(tipo), tipo: 'texto' }, { chave: 'cnpj', rotulo: 'CNPJ', tipo: 'texto' }, { chave: 'titulos', rotulo: 'Títulos', tipo: 'texto' },
      { chave: 'proximo', rotulo: 'Próx. vencimento', tipo: 'data' }, { chave: 'maiorAtraso', rotulo: 'Maior atraso', tipo: 'texto' },
      { chave: 'A_VENCER', rotulo: 'A vencer', tipo: 'valor' }, { chave: 'D1_30', rotulo: 'Vencido 1–30', tipo: 'valor' }, { chave: 'D31_60', rotulo: '31–60', tipo: 'valor' },
      { chave: 'D61_90', rotulo: '61–90', tipo: 'valor' }, { chave: 'D90', rotulo: 'Mais de 90', tipo: 'valor' }, { chave: 'SEM_VENCIMENTO', rotulo: 'Sem vencimento', tipo: 'valor' },
      { chave: 'vencido', rotulo: 'Total vencido', tipo: 'valor' }, { chave: 'total', rotulo: 'Total em aberto', tipo: 'valor' },
      { chave: 'adiantamento', rotulo: 'Adiantamento disponível', tipo: 'valor' }];
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas) };
  }
  /* Adiantamentos a fornecedores (PAGAR) ou de clientes (RECEBER), com o compensado e o
     saldo ainda disponível. Estornado não aparece. f: {tipo, parceiro} */
  function relAdiantamentos(fin, f) {
    var o = f || {}, tipo = tipoDe(o), ads = F.saldosAdiantamentos(fin), linhas = [];
    Object.keys(ads).forEach(function(k) {
      var a = ads[k]; if (a.tipo !== tipo || a.estornado || !filtroParc({ parceiro: a.parceiro }, o.parceiro)) return;
      linhas.push({ data: a.data, documento: a.documento || k, parceiro: a.parceiro.nome || '', cnpj: mascaraDoc(a.parceiro.cnpj), conta: nomeConta(fin, a.conta),
        valor: a.valorCentavos, compensado: a.compensadoCentavos, saldo: a.saldoCentavos, situacao: a.saldoCentavos > 0 ? 'Em aberto' : 'Compensado' });
    });
    linhas.sort(function(a, b) { return String(a.data).localeCompare(String(b.data)) || a.parceiro.localeCompare(b.parceiro); });
    var colunas = [{ chave: 'data', rotulo: 'Data', tipo: 'data' }, { chave: 'documento', rotulo: 'Documento', tipo: 'texto' }, { chave: 'parceiro', rotulo: rotParceiro(tipo), tipo: 'texto' },
      { chave: 'cnpj', rotulo: 'CNPJ', tipo: 'texto' }, { chave: 'conta', rotulo: 'Conta', tipo: 'texto' }, { chave: 'valor', rotulo: 'Valor', tipo: 'valor' },
      { chave: 'compensado', rotulo: 'Compensado', tipo: 'valor' }, { chave: 'saldo', rotulo: 'Saldo disponível', tipo: 'valor' }, { chave: 'situacao', rotulo: 'Situação', tipo: 'texto' }];
    return { titulo: tipo === 'PAGAR' ? 'Adiantamentos a fornecedores' : 'Adiantamentos de clientes', colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas) };
  }
  /* Valor de cada título/baixa que entra no período, para ranking e evolução.
     base EMISSAO: valor dos títulos emitidos; PAGAMENTO: principal baixado (estorno abate). */
  function fatos(fin, tipo, base, de, ate, natureza) {
    var x = fin || {}, out = [];
    if (base === 'PAGAMENTO') {
      vals(x.baixas).forEach(function(b) {
        if (b.tituloTipo !== tipo || !dentro(b.data, de, ate)) return;
        var t = (x.titulos || {})[b.titulo]; if (!t) return;
        var v = valorNaNatureza((b.tipo === 'ESTORNO' ? -1 : 1) * cent(b.valorCentavos), t, natureza);
        if (v) out.push({ t: t, id: b.titulo, data: b.data, valor: v, doc: b.tipo === 'ESTORNO' ? 0 : 1 });
      });
    } else {
      Object.keys(x.titulos || {}).forEach(function(id) {
        var t = x.titulos[id]; if (!t || t.tipo !== tipo || ehReneg(t) || !dentro(t.emissao, de, ate)) return;
        var v = valorNaNatureza(cent(t.valorCentavos), t, natureza);
        if (v) out.push({ t: t, id: id, data: t.emissao, valor: v, doc: 1 });
      });
    }
    return out;
  }
  /* Principais fornecedores/clientes (curva ABC). f: {tipo, de, ate, dataBase EMISSAO|PAGAMENTO, natureza, top}.
     Com `top`, os demais somam numa linha só: o total não muda. */
  function relRanking(fin, f) {
    var o = f || {}, tipo = tipoDe(o), pag = o.dataBase === 'PAGAMENTO';
    var titulo = 'Principais ' + (tipo === 'PAGAR' ? 'fornecedores' : 'clientes') + (pag ? (tipo === 'PAGAR' ? ' (pago)' : ' (recebido)') : ' (lançado)');
    var err = validarPeriodo(o); if (err) return vazio(titulo, err);
    var por = {}, docs = {};
    fatos(fin, tipo, pag ? 'PAGAMENTO' : 'EMISSAO', o.de, o.ate, o.natureza).forEach(function(x) {
      var k = chaveParc(x.t), l = por[k] = por[k] || { parceiro: nomeParc(x.t), cnpj: mascaraDoc(x.t.parceiro && x.t.parceiro.cnpj), valor: 0 };
      l.valor += x.valor; docs[k] = docs[k] || {}; if (x.doc) docs[k][x.id] = true;
    });
    var ord = Object.keys(por).filter(function(k) { return por[k].valor; }).sort(function(a, b) { return por[b].valor - por[a].valor || por[a].parceiro.localeCompare(por[b].parceiro); });
    var total = ord.reduce(function(s, k) { return s + por[k].valor; }, 0), acum = 0, top = Math.round(num(o.top));
    var linhas = [];
    ord.forEach(function(k, i) {
      var l = por[k]; acum += l.valor;
      var fr = total ? acum / total : 0;
      linhas.push({ posicao: String(i + 1), parceiro: l.parceiro, cnpj: l.cnpj, documentos: String(Object.keys(docs[k]).length), valor: l.valor,
        participacao: pct(l.valor, total), acumulado: pct(acum, total), classe: fr <= 0.8 + 1e-9 || i === 0 ? 'A' : fr <= 0.95 + 1e-9 ? 'B' : 'C' });
    });
    if (top > 0 && linhas.length > top) {
      var resto = linhas.slice(top), soma = resto.reduce(function(s, l) { return s + l.valor; }, 0);
      linhas = linhas.slice(0, top).concat([{ posicao: '', parceiro: 'Demais (' + resto.length + ')', cnpj: '', documentos: String(resto.reduce(function(s, l) { return s + Number(l.documentos); }, 0)),
        valor: soma, participacao: pct(soma, total), acumulado: pct(total, total), classe: '' }]);
    }
    var colunas = [{ chave: 'posicao', rotulo: '#', tipo: 'texto' }, { chave: 'parceiro', rotulo: rotParceiro(tipo), tipo: 'texto' }, { chave: 'cnpj', rotulo: 'CNPJ', tipo: 'texto' },
      { chave: 'documentos', rotulo: 'Títulos', tipo: 'texto' }, { chave: 'valor', rotulo: 'Valor', tipo: 'valor' }, { chave: 'participacao', rotulo: 'Participação', tipo: 'texto' },
      { chave: 'acumulado', rotulo: 'Acumulado', tipo: 'texto' }, { chave: 'classe', rotulo: 'Curva ABC', tipo: 'texto' }];
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas),
      avisos: ['Curva ABC: A até 80% do valor acumulado, B até 95%, C o resto.' + (pag ? ' Pago = principal baixado (juros, multa e desconto à parte).' : '')] };
  }
  /* Evolução de pagamento/recebimento por mês. f: {tipo, de, ate, agrupar PARCEIRO|NATUREZA, natureza}.
     Linha por parceiro (ou natureza), coluna por mês, principal baixado. */
  function relEvolucao(fin, f) {
    var o = f || {}, tipo = tipoDe(o), porNat = o.agrupar === 'NATUREZA';
    var titulo = 'Evolução de ' + (tipo === 'PAGAR' ? 'pagamentos' : 'recebimentos');
    var err = validarPeriodo(o); if (err) return vazio(titulo, err);
    var meses = periodos(o.de, o.ate, 'MES'); if (!meses || meses.length > 36) return vazio(titulo, 'Escolha no máximo 36 meses.');
    var chaves = meses.map(function(m) { return m.inicio.slice(0, 7); }), por = {};
    fatos(fin, tipo, 'PAGAMENTO', o.de, o.ate, null).forEach(function(x) {
      (porNat ? ratear(x.valor, x.t) : [{ natureza: null, valor: valorNaNatureza(x.valor, x.t, o.natureza) }]).forEach(function(r) {
        if (porNat && o.natureza && r.natureza !== o.natureza) return;
        if (!r.valor) return;
        var k = porNat ? r.natureza : chaveParc(x.t), l = por[k];
        if (!l) { l = por[k] = { grupo: porNat ? rotNat(r.natureza) : nomeParc(x.t), total: 0 }; chaves.forEach(function(c) { l[c] = 0; }); }
        l[x.data.slice(0, 7)] += r.valor; l.total += r.valor;
      });
    });
    var linhas = Object.keys(por).map(function(k) { return por[k]; }).filter(function(l) { return l.total; }).sort(function(a, b) { return b.total - a.total || a.grupo.localeCompare(b.grupo); });
    var colunas = [{ chave: 'grupo', rotulo: porNat ? 'Natureza' : rotParceiro(tipo), tipo: 'texto' }].concat(chaves.map(function(c) { return { chave: c, rotulo: c.slice(5, 7) + '/' + c.slice(0, 4), tipo: 'valor' }; }))
      .concat([{ chave: 'total', rotulo: 'Total', tipo: 'valor' }]);
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas), avisos: ['Principal ' + (tipo === 'PAGAR' ? 'pago' : 'recebido') + ' no mês da baixa (estorno abate); juros, multa e desconto à parte.'] };
  }
  /* Composição de vencimentos: o saldo em aberto por faixa — vencidos, mês corrente,
     próximos meses, depois e sem vencimento. f: {tipo, hoje, meses (padrão 6), parceiro}. */
  function relComposicaoVencimentos(fin, f) {
    var o = f || {}, tipo = tipoDe(o), nM = Math.min(24, Math.max(1, Math.round(num(o.meses)) || 6));
    var titulo = 'Composição de vencimentos — ' + (tipo === 'PAGAR' ? 'a pagar' : 'a receber');
    if (!dataOk(o.hoje)) return vazio(titulo, 'Data de referência inválida.');
    var ini = o.hoje.slice(0, 8) + '01', faixas = [{ faixa: 'Vencidos (antes de hoje)', k: 'V' }];
    for (var i = 0; i < nM; i++) { var m = F.somarPeriodo(ini, 'MES', i); faixas.push({ faixa: 'Vence em ' + m.slice(5, 7) + '/' + m.slice(0, 4) + (i === 0 ? ' (a partir de hoje)' : ''), k: m.slice(0, 7) }); }
    var fim = F.somarPeriodo(ini, 'MES', nM);
    faixas.push({ faixa: 'Depois de ' + F.addDias(fim, -1).split('-').reverse().join('/'), k: 'D' }, { faixa: 'Sem vencimento', k: 'S' });
    var por = {}; faixas.forEach(function(x) { por[x.k] = { faixa: x.faixa, n: 0, valor: 0, parc: {} }; });
    F.carteira(fin).forEach(function(s) {
      if (s.titulo.tipo !== tipo || s.saldoCentavos <= 0 || !filtroParc(s.titulo, o.parceiro)) return;
      if (s.semVencimento) { por.S.n++; por.S.valor += s.saldoCentavos; por.S.parc[chaveParc(s.titulo)] = 1; return; }
      s.abertas.forEach(function(p) {
        var k = p.vencimento < o.hoje ? 'V' : p.vencimento >= fim ? 'D' : p.vencimento.slice(0, 7);
        por[k].n++; por[k].valor += p.abertoCentavos; por[k].parc[chaveParc(s.titulo)] = 1;
      });
    });
    var total = faixas.reduce(function(s, x) { return s + por[x.k].valor; }, 0), acum = 0;
    var linhas = faixas.map(function(x) {
      var l = por[x.k]; acum += l.valor;
      return { faixa: l.faixa, parcelas: String(l.n), parceiros: String(Object.keys(l.parc).length), valor: l.valor, participacao: pct(l.valor, total), acumulado: pct(acum, total) };
    });
    var colunas = [{ chave: 'faixa', rotulo: 'Vencimento', tipo: 'texto' }, { chave: 'parcelas', rotulo: 'Parcelas', tipo: 'texto' }, { chave: 'parceiros', rotulo: tipo === 'PAGAR' ? 'Fornecedores' : 'Clientes', tipo: 'texto' },
      { chave: 'valor', rotulo: 'Em aberto', tipo: 'valor' }, { chave: 'participacao', rotulo: 'Participação', tipo: 'texto' }, { chave: 'acumulado', rotulo: 'Acumulado', tipo: 'texto' }];
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas) };
  }
  /* Eventos da conta de um parceiro: título emitido, baixa (principal), estorno e abatimento.
     sinal +1 aumenta o que o parceiro deve (receber) ou o que devemos a ele (pagar). */
  function eventosParceiros(fin, tipo, q) {
    var x = fin || {}, tit = x.titulos || {}, out = [];
    Object.keys(tit).forEach(function(id) {
      var t = tit[id]; if (!t || t.tipo !== tipo || !filtroParc(t, q)) return;
      out.push({ k: chaveParc(t), t: t, data: t.emissao || '', ordem: 0, tipo: 'EMITIDO', valor: cent(t.valorCentavos), documento: t.documento || id,
        historico: (tipo === 'RECEBER' ? 'Título a receber' : 'Título a pagar') + (t.origem && ROT_ORIGEM[t.origem.tipo] ? ' (' + ROT_ORIGEM[t.origem.tipo].toLowerCase() + ')' : '') });
    });
    vals(x.baixas).forEach(function(b) {
      var t = tit[b.titulo]; if (!t || t.tipo !== tipo || !filtroParc(t, q)) return;
      var est = b.tipo === 'ESTORNO';
      out.push({ k: chaveParc(t), t: t, data: b.data || '', ordem: 1, tipo: est ? 'ESTORNO' : 'BAIXA', valor: (est ? 1 : -1) * cent(b.valorCentavos), documento: t.documento || b.titulo,
        historico: (est ? 'Estorno de ' : '') + (tipo === 'RECEBER' ? 'recebimento' : 'pagamento') + (b.historico ? ' · ' + b.historico : '') });
    });
    vals(x.abatimentos).forEach(function(a) {
      var t = tit[a.titulo]; if (!t || t.tipo !== tipo || !filtroParc(t, q)) return;
      out.push({ k: chaveParc(t), t: t, data: a.data || '', ordem: 2, tipo: 'ABATIMENTO', valor: -cent(a.valorCentavos), documento: t.documento || a.titulo,
        historico: 'Abatimento' + (a.motivo ? ' (' + String(a.motivo).toLowerCase() + ')' : '') });
    });
    out.sort(function(a, b) { return a.k.localeCompare(b.k) || String(a.data).localeCompare(String(b.data)) || a.ordem - b.ordem; });
    return out;
  }
  /* Conta corrente por parceiro. f: {tipo, parceiro (contém), de, ate}.
     Receber: débito = título (cliente passa a dever), crédito = recebimento.
     Pagar: crédito = título (passamos a dever), débito = pagamento. */
  function relContaCorrente(fin, f) {
    var o = f || {}, tipo = tipoDe(o), titulo = 'Conta corrente — ' + (tipo === 'PAGAR' ? 'fornecedor' : 'cliente');
    var err = validarPeriodo(o); if (err) return vazio(titulo, err);
    if (!String(o.parceiro || '').trim()) return vazio(titulo, 'Digite o nome ou o CNPJ do ' + (tipo === 'PAGAR' ? 'fornecedor' : 'cliente') + '.');
    var ev = eventosParceiros(fin, tipo, o.parceiro), linhas = [], saldoTotal = 0, i = 0;
    while (i < ev.length) {
      var k = ev[i].k, nome = nomeParc(ev[i].t), saldo = 0, periodo = [];
      while (i < ev.length && ev[i].k === k) {
        var e = ev[i++];
        if (e.data && e.data < o.de) { saldo += e.valor; continue; }
        if (e.data > o.ate) continue;
        periodo.push(e);
      }
      linhas.push({ parceiro: nome, historico: 'Saldo anterior', saldo: saldo, destaque: true });
      periodo.forEach(function(e2) {
        saldo += e2.valor;
        var aumenta = e2.valor > 0; // aumenta a dívida (do cliente com a Kuryos ou da Kuryos com o fornecedor)
        var deb = tipo === 'RECEBER' ? (aumenta ? e2.valor : null) : (aumenta ? null : -e2.valor);
        var cre = tipo === 'RECEBER' ? (aumenta ? null : -e2.valor) : (aumenta ? e2.valor : null);
        linhas.push({ parceiro: nome, data: e2.data, documento: e2.documento, historico: e2.historico, debito: deb, credito: cre, saldo: saldo });
      });
      linhas.push({ parceiro: nome, historico: 'Saldo em ' + o.ate.split('-').reverse().join('/'), saldo: saldo, destaque: true });
      saldoTotal += saldo;
    }
    var colunas = [{ chave: 'parceiro', rotulo: rotParceiro(tipo), tipo: 'texto' }, { chave: 'data', rotulo: 'Data', tipo: 'data' }, { chave: 'documento', rotulo: 'Documento', tipo: 'texto' },
      { chave: 'historico', rotulo: 'Histórico', tipo: 'texto' }, { chave: 'debito', rotulo: 'Débito', tipo: 'valor' }, { chave: 'credito', rotulo: 'Crédito', tipo: 'valor' },
      { chave: 'saldo', rotulo: tipo === 'RECEBER' ? 'Saldo devedor' : 'Saldo a pagar', tipo: 'valor', semTotal: true }];
    var tot = somaCol(linhas, colunas); tot.saldo = saldoTotal;
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: tot, avisos: ev.length ? [] : ['Nenhum título para "' + o.parceiro + '".'] };
  }
  /* Conciliação por parceiro: saldo anterior + emitido − baixado − abatido = saldo final.
     f: {tipo, de, ate, parceiro}. A coluna "Confere" compara com a carteira de hoje
     quando o período chega até hoje. */
  function relConciliacaoParceiros(fin, f) {
    var o = f || {}, tipo = tipoDe(o), titulo = 'Conciliação de ' + (tipo === 'PAGAR' ? 'fornecedores' : 'clientes');
    var err = validarPeriodo(o); if (err) return vazio(titulo, err);
    var por = {};
    eventosParceiros(fin, tipo, o.parceiro).forEach(function(e) {
      var l = por[e.k] = por[e.k] || { parceiro: nomeParc(e.t), cnpj: mascaraDoc(e.t.parceiro && e.t.parceiro.cnpj), anterior: 0, emitido: 0, baixado: 0, abatido: 0, final: 0 };
      if (e.data > o.ate) return;
      if (e.data && e.data < o.de) l.anterior += e.valor;
      else if (e.tipo === 'EMITIDO') l.emitido += e.valor;
      else if (e.tipo === 'ABATIMENTO') l.abatido += -e.valor;
      else l.baixado += -e.valor; // baixa (positiva) menos estorno
      l.final += e.valor;
    });
    var linhas = Object.keys(por).map(function(k) { return por[k]; }).filter(function(l) { return l.anterior || l.emitido || l.baixado || l.abatido || l.final; })
      .sort(function(a, b) { return b.final - a.final || a.parceiro.localeCompare(b.parceiro); });
    var colunas = [{ chave: 'parceiro', rotulo: rotParceiro(tipo), tipo: 'texto' }, { chave: 'cnpj', rotulo: 'CNPJ', tipo: 'texto' }, { chave: 'anterior', rotulo: 'Saldo anterior', tipo: 'valor' },
      { chave: 'emitido', rotulo: tipo === 'RECEBER' ? 'Faturado' : 'Lançado', tipo: 'valor' }, { chave: 'baixado', rotulo: tipo === 'RECEBER' ? 'Recebido' : 'Pago', tipo: 'valor' },
      { chave: 'abatido', rotulo: 'Abatido', tipo: 'valor' }, { chave: 'final', rotulo: 'Saldo final', tipo: 'valor' }];
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas),
      avisos: ['Saldo anterior + ' + (tipo === 'RECEBER' ? 'faturado − recebido' : 'lançado − pago') + ' − abatido = saldo final (principal; juros e desconto à parte).'] };
  }
  /* Cálculo de antecipação (desconto de duplicatas). f: {data, taxaMensal (%), parceiro}.
     Desconto comercial simples: deságio = valor × taxa × dias ÷ 30. Sem IOF e tarifa. */
  function relAntecipacao(fin, f) {
    var o = f || {}, taxa = num(String(o.taxaMensal == null ? '' : o.taxaMensal).replace(',', '.')), titulo = 'Cálculo de antecipação';
    if (!dataOk(o.data)) return vazio(titulo, 'Informe a data da antecipação.');
    if (!(taxa > 0) || taxa >= 20) return vazio(titulo, 'Informe a taxa mensal do banco (ex.: 2,5 para 2,5% ao mês).');
    var linhas = [], vencidas = 0, semVenc = 0;
    F.carteira(fin).forEach(function(s) {
      var t = s.titulo; if (t.tipo !== 'RECEBER' || s.saldoCentavos <= 0 || !filtroParc(t, o.parceiro)) return;
      if (s.semVencimento) { semVenc += s.saldoCentavos; return; }
      s.abertas.forEach(function(p) {
        var d = diffDias(p.vencimento, o.data);
        if (d <= 0) { vencidas += p.abertoCentavos; return; }
        var des = Math.round(p.abertoCentavos * taxa / 100 * d / 30);
        linhas.push({ vencimento: p.vencimento, documento: t.documento || s.id, parcela: p.n + '/' + p.de, parceiro: nomeParc(t), dias: String(d), valor: p.abertoCentavos, desagio: des, liquido: p.abertoCentavos - des });
      });
    });
    linhas.sort(function(a, b) { return a.vencimento.localeCompare(b.vencimento) || a.parceiro.localeCompare(b.parceiro); });
    var colunas = [{ chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data' }, { chave: 'documento', rotulo: 'Documento', tipo: 'texto' }, { chave: 'parcela', rotulo: 'Parcela', tipo: 'texto' },
      { chave: 'parceiro', rotulo: 'Cliente', tipo: 'texto' }, { chave: 'dias', rotulo: 'Dias', tipo: 'texto' }, { chave: 'valor', rotulo: 'Valor', tipo: 'valor' },
      { chave: 'desagio', rotulo: 'Deságio', tipo: 'valor' }, { chave: 'liquido', rotulo: 'Líquido', tipo: 'valor' }];
    var tot = somaCol(linhas, colunas), av = ['Desconto comercial simples a ' + String(taxa).replace('.', ',') + '% ao mês: deságio = valor × taxa × dias ÷ 30. IOF e tarifa do banco não estão incluídos.'];
    if (tot.valor) {
      var prazo = Math.round(linhas.reduce(function(s, l) { return s + l.valor * Number(l.dias); }, 0) / tot.valor);
      av.push('Prazo médio ponderado: ' + prazo + ' dias; custo efetivo no período: ' + pct(tot.desagio, tot.liquido) + ' sobre o líquido.');
    }
    if (vencidas) av.push('Parcelas já vencidas ficam de fora (R$ ' + (vencidas / 100).toFixed(2).replace('.', ',') + '): banco não antecipa título vencido.');
    if (semVenc) av.push('Títulos sem vencimento ficam de fora (R$ ' + (semVenc / 100).toFixed(2).replace('.', ',') + '): informe o prazo em Complementos.');
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: tot, avisos: av };
  }
  /* Prazo médio de recebimento (PMR) e de pagamento (PMP) no período, geral e por
     parceiro. f: {tipo, de, ate}. Prazo realizado = dias da emissão até a baixa,
     ponderado pelo principal (mesma conta do Painel); prazo concedido = dias da
     emissão até o vencimento das parcelas do título. Atraso = realizado − concedido. */
  function relPrazosMedios(fin, f) {
    var o = f || {}, tipo = tipoDe(o), x = fin || {}, est = estornadas(x), titulo = 'Prazo médio de ' + (tipo === 'PAGAR' ? 'pagamento (PMP)' : 'recebimento (PMR)');
    var err = validarPeriodo(o); if (err) return vazio(titulo, err);
    var conc = {};
    F.carteira(x).forEach(function(s) {
      var t = s.titulo; if (!t.emissao || !s.parcelas.length) return;
      var v = s.parcelas.reduce(function(a, p) { return a + p.valorCentavos; }, 0);
      if (v > 0) conc[s.id] = s.parcelas.reduce(function(a, p) { return a + p.valorCentavos * Math.max(0, diffDias(p.vencimento, t.emissao)); }, 0) / v;
    });
    var por = {}, geral = { v: 0, real: 0, vc: 0, conc: 0, n: 0 };
    Object.keys(x.baixas || {}).forEach(function(k) {
      var b = x.baixas[k], t = b && (x.titulos || {})[b.titulo];
      if (!t || t.tipo !== tipo || b.tipo !== 'BAIXA' || est[k] || !t.emissao || !dentro(b.data, o.de, o.ate)) return;
      var v = cent(b.valorCentavos), d = Math.max(0, diffDias(b.data, t.emissao)), pk = chaveParc(t);
      var l = por[pk] = por[pk] || { parceiro: nomeParc(t), v: 0, real: 0, vc: 0, conc: 0, n: 0 };
      [l, geral].forEach(function(a) { a.v += v; a.real += v * d; a.n++; if (conc[b.titulo] != null) { a.vc += v; a.conc += v * conc[b.titulo]; } });
    });
    function linha(a, nome, destaque) {
      var r = a.v ? Math.round(a.real / a.v) : null, c = a.vc ? Math.round(a.conc / a.vc) : null;
      var l = { parceiro: nome, baixas: String(a.n), prazo: dias(r), concedido: dias(c), atraso: r != null && c != null ? dias(r - c) : '' };
      if (destaque) { l.destaque = true; l.valorGeral = a.v; } else l.valor = a.v;
      return l;
    }
    var linhas = Object.keys(por).map(function(k) { return linha(por[k], por[k].parceiro); }).sort(function(a, b) { return b.valor - a.valor || a.parceiro.localeCompare(b.parceiro); });
    if (linhas.length) linhas.unshift(linha(geral, 'Geral (' + (tipo === 'PAGAR' ? 'PMP' : 'PMR') + ')', true));
    var colunas = [{ chave: 'parceiro', rotulo: rotParceiro(tipo), tipo: 'texto' }, { chave: 'baixas', rotulo: 'Baixas', tipo: 'texto' }, { chave: 'valor', rotulo: 'Principal baixado', tipo: 'valor' },
      { chave: 'valorGeral', rotulo: 'Total geral', tipo: 'valor', semTotal: true },
      { chave: 'prazo', rotulo: 'Prazo médio realizado', tipo: 'texto' }, { chave: 'concedido', rotulo: 'Prazo concedido', tipo: 'texto' }, { chave: 'atraso', rotulo: 'Atraso médio', tipo: 'texto' }];
    var tot = somaCol(linhas, colunas); tot.valorGeral = geral.v;
    return { titulo: titulo, colunas: colunas, linhas: linhas, totais: tot,
      avisos: linhas.length ? ['Dias da emissão até a baixa, ponderados pelo principal. Atraso negativo = ' + (tipo === 'PAGAR' ? 'pagou' : 'recebeu') + ' antes do vencimento.'] : ['Sem baixa no período: sem baixa não há prazo.'] };
  }

  return {
    CENTROS_PADRAO: CENTROS_PADRAO, SEM_CC: SEM_CC, centros: centros, ratear: ratear,
    relEspelhoDiario: relEspelhoDiario, relSaldosContas: relSaldosContas, relMovimentos: relMovimentos, relRealizadoPrevisto: relRealizadoPrevisto,
    relGastosCentroCusto: relGastosCentroCusto, relLancamentoDespesas: relLancamentoDespesas, relEmAberto: relEmAberto, relRanking: relRanking,
    relEvolucao: relEvolucao, relComposicaoVencimentos: relComposicaoVencimentos, relContaCorrente: relContaCorrente,
    relConciliacaoParceiros: relConciliacaoParceiros, relAntecipacao: relAntecipacao, relPrazosMedios: relPrazosMedios, relAdiantamentos: relAdiantamentos
  };
});
