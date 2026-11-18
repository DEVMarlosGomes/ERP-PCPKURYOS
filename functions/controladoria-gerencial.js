/* Controladoria gerencial — funções PURAS. Cópia byte a byte em functions/.
 *
 * Paridade com a Controladoria do WebMais (ERPmais5) que a Kuryos usa hoje
 * (docs/controladoria-webmais-paridade.md):
 *   Bloqueio/Liberação de Período ......... janela liberada por módulo (validarBloqueio, periodoLiberado)
 *   DRE - Demonst. Resultado Econômico .... dreGerencial (grupo › centro › elemento, várias colunas)
 *   Índices Gerenciais - Rel. Comercial ... calcularIndices + validarIndices (retrato por AAAA-MM)
 *   Exportação Contábil - Domínio ......... exportarDominio (+ relatório de inconsistências)
 *
 * Nada aqui grava nem recalcula custo: tudo lê ctl/lancamentos (os documentos
 * balanceados que controladoria.js derivou). Valor que não se mede é null com
 * motivo, nunca zero.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./controladoria'));
  else root.ControladoriaGerencial = factory(root.Controladoria);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Ctl) {
  'use strict';

  var VERSAO = 'controladoria-gerencial-v1-20261117';
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function dataOk(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }
  function compOk(c) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(c || '')); }
  function somarMes(c, k) { var a = Number(c.slice(0, 4)), m = Number(c.slice(5, 7)) + k; while (m < 1) { m += 12; a--; } while (m > 12) { m -= 12; a++; } return a + '-' + (m < 10 ? '0' : '') + m; }
  function mesesEntre(de, ate) { var out = [], c = de; while (c <= ate && out.length < 240) { out.push(c); c = somarMes(c, 1); } return out; }

  /* ── 1. Bloqueio/Liberação de Período ──────────────────────────────────
     Igual ao WebMais: para cada módulo, a janela LIBERADA (de/até). Data fora
     dela é recusada. Módulo sem janela fica liberado (o comportamento de hoje).
     O fechamento contábil (ctl/fechamentos) continua valendo por cima disso. */
  var MODULOS_BLOQUEIO = [
    { chave: 'NF_ENTRADA', nome: 'N.F. Entrada' },
    { chave: 'NF_SAIDA', nome: 'N.F. Saída' },
    { chave: 'ESTOQUE', nome: 'Movto Estoque' },
    { chave: 'FINANCEIRO', nome: 'Movto Financ.' },
    { chave: 'PRODUCAO', nome: 'Movto Prod.' },
    { chave: 'CONTABIL', nome: 'Movto Contábil' },
    { chave: 'FISCAL', nome: 'Movto Fiscal' }
  ];
  function validarBloqueio(d) {
    var x = d || {}, mods = x.modulos || {}, out = {};
    for (var i = 0; i < MODULOS_BLOQUEIO.length; i++) {
      var k = MODULOS_BLOQUEIO[i].chave, j = mods[k];
      if (!j || (!j.de && !j.ate)) continue;
      var de = String(j.de || '').slice(0, 10), ate = String(j.ate || '').slice(0, 10);
      if (!dataOk(de) || !dataOk(ate)) return { ok: false, motivo: MODULOS_BLOQUEIO[i].nome + ': informe as duas datas (dd/mm/aaaa).' };
      if (de > ate) return { ok: false, motivo: MODULOS_BLOQUEIO[i].nome + ': a data inicial é depois da final.' };
      out[k] = { de: de, ate: ate };
    }
    var just = String(x.justificativa || '').trim();
    if (just.length < 10) return { ok: false, motivo: 'Justifique a alteração (mínimo 10 caracteres): ela fica no histórico.' };
    return { ok: true, modulos: out, justificativa: just.slice(0, 500) };
  }
  // cfg = ctl/bloqueio_periodo (o registro vigente); devolve {ok} ou {ok:false, motivo}.
  function periodoLiberado(cfg, modulo, dataISO) {
    var j = ((cfg || {}).modulos || {})[modulo];
    if (!j) return { ok: true };
    var d = String(dataISO || '').slice(0, 10), nome = (MODULOS_BLOQUEIO.filter(function(m) { return m.chave === modulo; })[0] || {}).nome || modulo;
    if (!dataOk(d)) return { ok: false, motivo: 'Data inválida para ' + nome + '.' };
    if (d < j.de || d > j.ate) return { ok: false, motivo: nome + ': período bloqueado. Liberado de ' + br(j.de) + ' até ' + br(j.ate) + ' (Controladoria › Bloqueio de período).' };
    return { ok: true };
  }
  function br(iso) { return String(iso).split('-').reverse().join('/'); }

  /* ── 2. DRE gerencial no layout do WebMais ─────────────────────────────
     Grupo › centro de custo › elemento (ou conta, quando o lançamento não tem
     elemento), uma coluna por período. Receita positiva, custo e despesa
     negativos (como o WebMais imprime). Grupos sem valor somem, salvo
     "mostrar zerado". Mapa das contas no documento de paridade. */
  var GRUPOS_DRE = [
    { cod: '1', rot: 'RECEITA OPERACIONAL BRUTA', contas: ['RECEITA_BRUTA', 'OUTRAS_RECEITAS'] },
    { cod: '2', rot: '(-) DEDUÇÕES DA RECEITA', contas: ['DEDUCOES'] },
    { cod: '3', rot: '= RECEITA OPERACIONAL LÍQUIDA', total: ['1', '2'] },
    { cod: '4', rot: '(-) CUSTO VARIÁVEL (CPV / CMV)', contas: ['CPV', 'PERDAS'] },
    { cod: '5', rot: '= LUCRO BRUTO', total: ['3', '4'] },
    { cod: '6', rot: '(-) DESPESAS VARIÁVEIS', contas: ['DESP_COM', 'PERDAS_CLIENTES'] },
    { cod: '7', rot: '= MARGEM DE CONTRIBUIÇÃO (RESULTADO OPERACIONAL)', total: ['5', '6'] },
    { cod: '8', rot: '(-) CUSTOS FIXOS DE PRODUÇÃO', contas: ['FOLHA_PRODUCAO', 'MOD_APLICADA', 'CIF'] },
    { cod: '9', rot: '(-) DESPESAS FIXAS (SG&A)', contas: ['DESP_ADM', 'PLR'] },
    { cod: '10', rot: '= RESULTADO ANTES DO FINANCEIRO', total: ['7', '8', '9'] },
    { cod: '11', rot: '(+/-) RESULTADO FINANCEIRO', contas: ['RECEITA_FIN', 'DESP_FIN'] },
    { cod: '12', rot: '= RESULTADO GERENCIAL DO PERÍODO', total: ['10', '11'] }
  ];
  var GRUPO_DA_CONTA = {};
  GRUPOS_DRE.forEach(function(g) { (g.contas || []).forEach(function(c) { GRUPO_DA_CONTA[c] = g.cod; }); });
  var PERIODICIDADES = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };

  function colunasDe(de, ate, periodicidade) {
    var passo = PERIODICIDADES[periodicidade] || 1, meses = mesesEntre(de, ate), cols = [];
    var nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    for (var i = 0; i < meses.length; i += passo) {
      var ms = meses.slice(i, i + passo), a = ms[0], z = ms[ms.length - 1];
      var rot = ms.length === 1 ? nomes[Number(a.slice(5, 7)) - 1] + '-' + a.slice(0, 4) : nomes[Number(a.slice(5, 7)) - 1] + '/' + a.slice(2, 4) + '–' + nomes[Number(z.slice(5, 7)) - 1] + '/' + z.slice(2, 4);
      cols.push({ chave: a, rotulo: rot, meses: ms });
    }
    return cols;
  }
  // o: {de, ate (AAAA-MM), periodicidade, cc (filtro), mostrarZerado, elementos (fin/elementos para o nome)}
  function dreGerencial(ctl, o) {
    var x = o || {};
    if (!compOk(x.de) || !compOk(x.ate) || x.de > x.ate) return { ok: false, motivo: 'Período inválido.' };
    var cols = colunasDe(x.de, x.ate, x.periodicidade), colDoMes = {};
    cols.forEach(function(c) { c.meses.forEach(function(m) { colDoMes[m] = c.chave; }); });
    var plano = Ctl.planoDeContas(ctl), centros = Ctl.centrosDeCusto(ctl, {}), els = x.elementos || {};
    var arv = {}, docs = 0;
    GRUPOS_DRE.forEach(function(g) { arv[g.cod] = { v: {}, ccs: {} }; });
    function soma(obj, col, v) { obj[col] = (obj[col] || 0) + v; }
    Ctl.docsDe(ctl, function(d, m) { return !!colDoMes[m]; }).forEach(function(d) {
      var col = colDoMes[String(d.chave).split('/')[0]], usou = false;
      (d.partidas || []).forEach(function(p) {
        var g = GRUPO_DA_CONTA[p.conta]; if (!g) return;
        var cc = p.cc || '_SEM';
        if (x.cc && cc !== x.cc) return;
        // Sinal do WebMais: receita +, custo/despesa − (crédito − débito serve aos dois).
        var v = p.creditoCentavos - p.debitoCentavos;
        var nCc = arv[g].ccs[cc] = arv[g].ccs[cc] || { v: {}, folhas: {} };
        var folha = p.elemento ? 'E:' + p.elemento : 'C:' + p.conta;
        var nF = nCc.folhas[folha] = nCc.folhas[folha] || { v: {} };
        soma(arv[g].v, col, v); soma(nCc.v, col, v); soma(nF.v, col, v); usou = true;
      });
      if (usou) docs++;
    });
    function tot(vs) { return cols.reduce(function(s, c) { return s + (vs[c.chave] || 0); }, 0); }
    function vazio(vs) { return cols.every(function(c) { return !(vs[c.chave] || 0); }); }
    // Totais em cascata.
    GRUPOS_DRE.forEach(function(g) { if (g.total) g.total.forEach(function(k) { cols.forEach(function(c) { soma(arv[g.cod].v, c.chave, arv[k].v[c.chave] || 0); }); }); });
    var linhas = [];
    GRUPOS_DRE.forEach(function(g) {
      var n = arv[g.cod];
      if (!g.total && vazio(n.v) && !x.mostrarZerado) return;
      linhas.push({ nivel: 0, tipo: g.total ? 'TOTAL' : 'GRUPO', codigo: g.cod, rotulo: g.cod + ' - ' + g.rot, valores: n.v, total: tot(n.v) });
      if (g.total) return;
      Object.keys(n.ccs).sort(function(a, b) { return a === '_SEM' ? 1 : b === '_SEM' ? -1 : a.localeCompare(b); }).forEach(function(cc, i) {
        var nc = n.ccs[cc], cod2 = g.cod + '.' + (i + 1);
        if (vazio(nc.v) && !x.mostrarZerado) return;
        linhas.push({ nivel: 1, tipo: 'CENTRO', codigo: cod2, cc: cc, rotulo: cod2 + ' - ' + (cc === '_SEM' ? 'SEM CENTRO DE CUSTO' : String((centros[cc] || {}).nome || cc).toUpperCase()), valores: nc.v, total: tot(nc.v) });
        Object.keys(nc.folhas).sort().forEach(function(f, j) {
          var nf = nc.folhas[f];
          if (vazio(nf.v) && !x.mostrarZerado) return;
          var cod3 = cod2 + '.' + ('00' + (j + 1)).slice(-3), k = f.slice(2);
          var nome = f[0] === 'E' ? k + ' - ' + String((els[k] || {}).nome || 'Elemento ' + k).toUpperCase() : ((plano[k] || {}).codigo || '') + ' - ' + String((plano[k] || {}).nome || k).toUpperCase();
          linhas.push({ nivel: 2, tipo: f[0] === 'E' ? 'ELEMENTO' : 'CONTA', codigo: cod3, chave: k, rotulo: cod3 + ' - ' + nome, valores: nf.v, total: tot(nf.v) });
        });
      });
    });
    return { ok: true, colunas: cols, linhas: linhas, documentos: docs, filtros: { de: x.de, ate: x.ate, periodicidade: PERIODICIDADES[x.periodicidade] ? x.periodicidade : 'MENSAL', cc: x.cc || null, mostrarZerado: !!x.mostrarZerado } };
  }

  /* ── 3. Índices gerenciais (Rel. Comercial) ────────────────────────────
     Médias dos N meses que terminam na competência, a partir do razão.
     Divisão por zero vira null ("não medido"). Os percentuais que a base não
     tem (comissão, ICMS da filial, frete, Simples) são INFORMADOS pela
     controladoria e gravados no mesmo retrato. */
  var CAMPOS_INFORMADOS = ['comissaoPct', 'icmsFilialPct', 'fretePct', 'freteFilialPct', 'simplesPct', 'mediaFaturamentoKg', 'mediaFaturamentoCpl'];
  function calcularIndices(ctl, comp, o) {
    var x = o || {}, n = Math.max(1, Math.min(24, Math.round(num(x.meses) || 12)));
    if (!compOk(comp)) return { ok: false, motivo: 'Competência no formato AAAA-MM.' };
    var ini = somarMes(comp, -(n - 1)), meses = mesesEntre(ini, comp), set = {};
    meses.forEach(function(m) { set[m] = 1; });
    var s = { receita: 0, fixa: 0, producao: 0, estocagem: 0, finFixa: 0, finVariavel: 0, perdas: 0, saidaMateriais: 0 }, mesesComReceita = {};
    Ctl.docsDe(ctl, function(d, m) { return !!set[m]; }).forEach(function(d) {
      var m = String(d.chave).split('/')[0], ori = (d.origem || {}).tipo;
      (d.partidas || []).forEach(function(p) {
        var deb = p.debitoCentavos - p.creditoCentavos;
        if (p.conta === 'RECEITA_BRUTA' || p.conta === 'OUTRAS_RECEITAS') { s.receita -= deb; if (-deb) mesesComReceita[m] = 1; }
        else if (p.conta === 'DESP_ADM' || p.conta === 'PLR') { if (p.cc === 'LOGISTICA') s.estocagem += deb; else s.fixa += deb; }
        else if (p.conta === 'FOLHA_PRODUCAO' || p.conta === 'MOD_APLICADA' || p.conta === 'CIF') { if (p.cc === 'LOGISTICA') s.estocagem += deb; else s.producao += deb; }
        else if (p.conta === 'DESP_FIN') { if (ori === 'MOVIMENTO') s.finFixa += deb; else s.finVariavel += deb; }
        else if (p.conta === 'PERDAS') s.perdas += deb;
        if (p.conta === 'ESTOQUE_MATERIAIS' && ori === 'RAZAO_CUSTOS') s.saidaMateriais += p.creditoCentavos;
      });
    });
    function media(v) { return Math.round(v / n); }
    function idx(a, b) { return b ? Math.round((a / b) * 1e6) / 1e6 : null; }
    var mf = media(s.receita);
    return {
      ok: true, competencia: comp, meses: n, de: ini, ate: comp, mesesComReceita: Object.keys(mesesComReceita).length,
      mediaFaturamentoCentavos: mf,
      mediaDespesaFixaCentavos: media(s.fixa), mediaDespesaProducaoCentavos: media(s.producao), mediaDespesaEstocagemCentavos: media(s.estocagem),
      indiceDespesaFixa: idx(s.fixa, s.receita), indiceDespesaProducao: idx(s.producao, s.receita), indiceDespesaEstocagem: idx(s.estocagem, s.receita),
      indiceFinanceiraFixa: idx(s.finFixa, s.receita), indiceFinanceiraVariavel: idx(s.finVariavel, s.receita),
      perdaMateriaPrimaPct: s.saidaMateriais ? Math.round((s.perdas / s.saidaMateriais) * 1e8) / 1e6 : null,
      motivos: s.receita ? {} : { indices: 'Sem receita no razão entre ' + ini + ' e ' + comp + ': índice sobre faturamento não é medido.' }
    };
  }
  // Índice por kg: despesa média ÷ kg médio faturado (informado, até a NF trazer peso).
  function porKg(mediaCentavos, kg) { return kg > 0 ? Math.round((mediaCentavos / 100 / kg) * 1e6) / 1e6 : null; }
  function validarIndices(d, calculado) {
    var x = d || {}, inf = {};
    if (!calculado || !calculado.ok) return { ok: false, motivo: 'Calcule os índices da competência antes de lançar.' };
    for (var i = 0; i < CAMPOS_INFORMADOS.length; i++) {
      var k = CAMPOS_INFORMADOS[i], v = x[k];
      if (v === '' || v == null) { inf[k] = null; continue; }
      var n = Number(String(v).replace(',', '.'));
      if (!isFinite(n) || n < 0) return { ok: false, motivo: 'Valor inválido em ' + k + '.' };
      if (/Pct$/.test(k) && n > 100) return { ok: false, motivo: k + ' acima de 100%.' };
      inf[k] = Math.round(n * 1e6) / 1e6;
    }
    var kg = inf.mediaFaturamentoKg;
    var reg = Object.assign({}, calculado, { informados: inf,
      indiceDespesaFixaKg: kg ? porKg(calculado.mediaDespesaFixaCentavos, kg) : null,
      indiceDespesaProducaoKg: kg ? porKg(calculado.mediaDespesaProducaoCentavos, kg) : null,
      versaoMotor: VERSAO });
    delete reg.ok;
    return { ok: true, registro: reg };
  }

  /* ── 4. Exportação contábil para o Domínio Sistemas ────────────────────
     Leiaute de importação de lançamentos em texto separado por ";" (um par
     débito/crédito por linha): Data;Conta débito;Conta crédito;Valor;Cód. histórico;Histórico.
     Documento com várias partidas é decomposto em pares sem perder centavo.
     Conferir o leiaute com o escritório antes do primeiro envio: no WebMais
     ele também nasce "Não configurado". Sem código Domínio na conta, a linha
     não sai e vira inconsistência (mesmo relatório do WebMais). */
  function paresDoDocumento(partidas) {
    var deb = [], cre = [], out = [];
    (partidas || []).forEach(function(p) { if (p.debitoCentavos) deb.push({ conta: p.conta, v: p.debitoCentavos }); if (p.creditoCentavos) cre.push({ conta: p.conta, v: p.creditoCentavos }); });
    var i = 0, j = 0;
    while (i < deb.length && j < cre.length) {
      var v = Math.min(deb[i].v, cre[j].v);
      out.push({ debito: deb[i].conta, credito: cre[j].conta, valorCentavos: v });
      deb[i].v -= v; cre[j].v -= v;
      if (!deb[i].v) i++;
      if (!cre[j].v) j++;
    }
    return out;
  }
  function limpar(t) { return String(t == null ? '' : t).replace(/[;\r\n]+/g, ' ').trim().slice(0, 200); }
  // layout = ctl/parametros/dominio: {codigoEmpresa, historicoPadrao, contas: {CHAVE: codigoReduzido}}
  function exportarDominio(ctl, de, ate, layout) {
    var L = layout || {}, contas = L.contas || {}, inc = [], linhas = [], seq = 0, hoje = new Date().toISOString().slice(0, 10);
    function erro(grupo, id, msg) { inc.push({ seq: ('00000' + (++seq)).slice(-6), grupo: grupo, identificador: id || '', descricao: msg }); }
    if (!dataOk(de) || !dataOk(ate) || de > ate) { erro('Período', '', 'Período inválido.'); return { ok: false, linhas: [], inconsistencias: inc, texto: '' }; }
    if (!/^\d{1,7}$/.test(String(L.codigoEmpresa || ''))) erro('Layout', '', 'Layout não configurado: informe o código da empresa no Domínio (Empresa Destino).');
    var plano = Ctl.planoDeContas(ctl), semCodigo = {};
    var docs = Ctl.docsDe(ctl, function(d) { var x = String(d.data || '').slice(0, 10); return x >= de && x <= ate; })
      .sort(function(a, b) { return String(a.data).localeCompare(String(b.data)) || a.chave.localeCompare(b.chave); });
    if (!docs.length) erro('Contábil', '', 'Sem movimentação de lançamentos contábeis para exportar.');
    docs.forEach(function(d) {
      paresDoDocumento(d.partidas).forEach(function(par) {
        var cd = contas[par.debito], cc = contas[par.credito];
        [[par.debito, cd], [par.credito, cc]].forEach(function(x) { if (!/^\d{1,7}$/.test(String(x[1] || '')) && !semCodigo[x[0]]) { semCodigo[x[0]] = 1; erro('Plano de contas', ((plano[x[0]] || {}).codigo || '') + ' ' + ((plano[x[0]] || {}).nome || x[0]), 'Conta sem código reduzido do Domínio.'); } });
        if (!/^\d{1,7}$/.test(String(cd || '')) || !/^\d{1,7}$/.test(String(cc || ''))) return;
        linhas.push([br(String(d.data).slice(0, 10)), cd, cc, (par.valorCentavos / 100).toFixed(2).replace('.', ','), String(L.historicoPadrao || ''), limpar(d.historico) + ' [' + d.chave + ']'].join(';'));
      });
    });
    var ok = !inc.length;
    return { ok: ok, linhas: linhas, inconsistencias: inc, texto: ok ? linhas.join('\r\n') + '\r\n' : '', geradoEm: hoje, layout: 'dominio-lancamentos-csv-v1' };
  }

  return {
    VERSAO: VERSAO, MODULOS_BLOQUEIO: MODULOS_BLOQUEIO, GRUPOS_DRE: GRUPOS_DRE, PERIODICIDADES: PERIODICIDADES, CAMPOS_INFORMADOS: CAMPOS_INFORMADOS,
    validarBloqueio: validarBloqueio, periodoLiberado: periodoLiberado, colunasDe: colunasDe, dreGerencial: dreGerencial,
    calcularIndices: calcularIndices, validarIndices: validarIndices, paresDoDocumento: paresDoDocumento, exportarDominio: exportarDominio
  };
});
