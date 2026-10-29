/* Financeiro — funções PURAS (PROMPT_FINANCEIRO.md). Cópia byte a byte em functions/.
 *
 * O Financeiro é o RAZÃO AUXILIAR (subledger, no vocabulário do SAP): títulos a
 * pagar e a receber, baixas, bancos, conciliação e fluxo de caixa. Ele LÊ os fatos
 * que os outros módulos já gravam -- recebimento contra PC, NF registrada na carga,
 * operação do mês do Custos, bônus fechado -- e nunca escreve neles. O razão geral
 * é da Controladoria (controladoria.js), que lê o que este motor deriva.
 *
 * Regras que mandam aqui:
 *  - Dinheiro em CENTAVOS INTEIROS; R$ só na tela.
 *  - Valor ausente nunca vira zero: fato sem valor não gera título, gera COMPLEMENTO.
 *  - Título é imutável. Condição de pagamento que falta é informada à parte
 *    (fin/condicoes/{titulo}) e as parcelas são DERIVADAS na leitura; devolução e
 *    cancelamento viram ABATIMENTO; baixa errada vira ESTORNO da baixa.
 *  - Chave determinística por fato: derivar duas vezes não duplica.
 *  - Material do cliente não gera conta a pagar (o estoque tem dono).
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    var prop;
    try { prop = require('./propriedade_estoque'); } catch (e) { prop = require('./propriedade-estoque'); }
    module.exports = factory(require('./custos'), prop);
  } else root.Financeiro = factory(root.Custos, root.PropriedadeEstoque);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(Custos, Prop) {
  'use strict';

  var VERSAO = 'financeiro-v1-20261028';

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function san(k) { return String(k == null ? '' : k).replace(/[.#$\/\[\]]/g, '_'); }
  function centavos(v) {
    if (v == null || v === '') return null;
    var n;
    if (typeof v === 'number') n = v;
    else {
      var s = String(v).replace(/[R$\s]/g, '');
      // "1.234,56" (padrão BR) ou "1234.56": a vírgula decide qual é o decimal.
      n = s.indexOf(',') >= 0 ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s);
    }
    return isFinite(n) ? Math.round(n * 100) : null;
  }
  function dataOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').slice(0, 10)); }
  function addDias(iso, n) {
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function diffDias(a, b) { return Math.round((new Date(String(a).slice(0, 10) + 'T12:00:00Z') - new Date(String(b).slice(0, 10) + 'T12:00:00Z')) / 864e5); }
  function segunda(iso) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
  function vals(o) { return Object.keys(o || {}).map(function(k) { return o[k]; }).filter(Boolean); }

  /* ── Condição de pagamento ─────────────────────────────────────────────
     Formatos reais (28/10): "28", "28/42", "0", "30 DIAS", "15/30/45/60",
     "20% A VISTA, 30/45", "20 % Sinal / 10 / 30", "90% pedido/10% entrega",
     "30% sinal / 20% entrega / 30/45/60". Parte com % fixa a fatia; números
     soltos dividem o resto em partes iguais. SINAL/PEDIDO é adiantamento
     (vence na base e leva aviso: costuma ser pago antes da nota). O que não
     se entende ("ST a vista, restante 30/45/60") NÃO é adivinhado: ok=false. */
  var PALAVRAS_DIA0 = { 'A VISTA': 'A_VISTA', 'AVISTA': 'A_VISTA', 'VISTA': 'A_VISTA', 'ENTREGA': 'ENTREGA', 'NA ENTREGA': 'ENTREGA',
    'SINAL': 'SINAL', 'PEDIDO': 'SINAL', 'NO PEDIDO': 'SINAL', 'ENTRADA': 'SINAL', 'ANTECIPADO': 'SINAL' };
  /* Parcelamento "Nx" (FIN-01, 28/10). Regra: N parcelas IGUAIS; os prazos são
     os informados depois do "x" ou, quando vem um prazo só (ou nenhum), o
     primeiro prazo (padrão 30) e os seguintes de 30 em 30 dias:
       "2x 30/60" = "2x30-60" = "30/60"   ·   "3x" = "3 x 30" = "30/60/90"   ·   "2x 28" = "28/58".
     Também vale "N vezes". Com mais de um prazo, eles têm que ser N. Volta
     null quando o texto não começa por "Nx" (segue a leitura normal). */
  var INTERVALO_PADRAO_DIAS = 30, MAX_PARCELAS = 60;
  function expandirParcelamento(t, bruto) {
    var m = t.match(/^(\d{1,3})\s*(?:X|VEZES)(?![A-Z])\s*(.*)$/);
    if (!m) return null;
    var n = Number(m[1]);
    if (!(n >= 1 && n <= MAX_PARCELAS)) return { ok: false, motivo: 'número de parcelas deve ser de 1 a ' + MAX_PARCELAS + ': "' + bruto + '"' };
    var lista = m[2].split(/[\/\-\s]+/).filter(Boolean);
    if (lista.some(function(s) { return !/^\d{1,3}$/.test(s); })) return { ok: false, motivo: 'condição não reconhecida: "' + bruto + '"' };
    var dias = lista.map(Number);
    if (dias.length <= 1) {
      var primeiro = dias.length ? dias[0] : INTERVALO_PADRAO_DIAS;
      dias = [];
      for (var i = 0; i < n; i++) dias.push(primeiro + i * INTERVALO_PADRAO_DIAS);
    } else if (dias.length !== n) return { ok: false, motivo: '"' + bruto + '" tem ' + dias.length + ' prazos para ' + n + ' parcelas' };
    return { ok: true, texto: dias.join('/') };
  }
  function normalizarTexto(bruto) {
    return bruto.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\bDIAS?\b|\bDDL\b|\bDD\b/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function lerCondicao(txt) {
    var bruto = String(txt == null ? '' : txt).trim();
    if (!bruto) return { ok: false, motivo: 'sem condição de pagamento' };
    var t = normalizarTexto(bruto);
    var nx = expandirParcelamento(t, bruto);
    if (nx && !nx.ok) return nx;
    if (nx) t = nx.texto;
    if (PALAVRAS_DIA0[t])return { ok: true, partes: [{ dias: 0, pct: 100, tipo: PALAVRAS_DIA0[t] }], avisos: [] };
    var segs = t.split(/[,;\/]|\bE\b/).map(function(s) { return s.trim(); }).filter(Boolean);
    var partes = [], soltas = [], avisos = [];
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i], m;
      if ((m = s.match(/^(\d+(?:[.,]\d+)?)\s*%\s*(.*)$/))) {
        var pct = num(m[1].replace(',', '.')), resto = m[2].trim();
        if (!resto) { partes.push({ dias: 0, pct: pct, tipo: 'A_VISTA' }); continue; }
        if (PALAVRAS_DIA0[resto]) { partes.push({ dias: 0, pct: pct, tipo: PALAVRAS_DIA0[resto] }); continue; }
        var md = resto.match(/^(?:EM |COM )?(\d{1,3})$/);
        if (md) { partes.push({ dias: Number(md[1]), pct: pct, tipo: 'PRAZO' }); continue; }
        return { ok: false, motivo: 'condição não reconhecida: "' + bruto + '"' };
      }
      if ((m = s.match(/^(\d{1,3})$/))) { soltas.push(Number(m[1])); continue; }
      return { ok: false, motivo: 'condição não reconhecida: "' + bruto + '"' };
    }
    var fixado = partes.reduce(function(a, p) { return a + p.pct; }, 0);
    if (fixado > 100.0001) return { ok: false, motivo: 'percentuais somam mais de 100%: "' + bruto + '"' };
    if (soltas.length) {
      var cada = (100 - fixado) / soltas.length;
      if (!(cada > 0)) return { ok: false, motivo: 'prazos sem percentual a distribuir: "' + bruto + '"' };
      soltas.forEach(function(d) { partes.push({ dias: d, pct: cada, tipo: d === 0 ? 'A_VISTA' : 'PRAZO' }); });
    } else if (Math.abs(fixado - 100) > 0.0001) return { ok: false, motivo: 'percentuais não fecham 100%: "' + bruto + '"' };
    if (partes.some(function(p) { return p.dias > 365; })) return { ok: false, motivo: 'prazo acima de 365 dias: "' + bruto + '"' };
    if (partes.some(function(p) { return p.tipo === 'SINAL'; })) avisos.push('Condição com sinal/adiantamento: confira se já foi pago antes da nota.');
    return { ok: true, partes: partes, avisos: avisos };
  }

  /* Parcelas de um valor: a última absorve o arredondamento (nunca some centavo). */
  function parcelas(condicao, baseISO, valorCentavos) {
    var c = typeof condicao === 'object' && condicao && condicao.partes ? condicao : lerCondicao(condicao);
    if (!c.ok) return { ok: false, motivo: c.motivo };
    if (!dataOk(baseISO)) return { ok: false, motivo: 'sem data base para o vencimento' };
    var v = Math.round(num(valorCentavos)), usado = 0;
    var ps = c.partes.slice().sort(function(a, b) { return a.dias - b.dias; }).map(function(p, i, arr) {
      var valor = i === arr.length - 1 ? v - usado : Math.round(v * p.pct / 100);
      usado += valor;
      return { n: i + 1, de: arr.length, vencimento: addDias(baseISO, p.dias), valorCentavos: valor, tipo: p.tipo };
    });
    return { ok: true, parcelas: ps, avisos: c.avisos || [] };
  }

  /* Forma GRAVADA de uma condição: o "Nx" vira a lista de prazos ("2x 30/60" ->
     "30/60"); o resto fica como veio. Inválida -> null. O formato no banco não
     muda: continua uma string que lerCondicao entende. */
  function normalizarCondicao(txt) {
    var bruto = String(txt == null ? '' : txt).trim();
    if (!bruto || !lerCondicao(bruto).ok) return null;
    var nx = expandirParcelamento(normalizarTexto(bruto), bruto);
    return nx ? nx.texto : bruto;
  }
  /* Os campos do formulário -> condição canônica. Campo vazio = 30 dias (1º prazo
     e intervalo). 1 parcela no dia 0 = "À VISTA". Volta {ok, condicao} ou {ok:false, motivo}. */
  function montarCondicao(o) {
    var x = o || {};
    function inteiro(v, padrao) { return v == null || String(v).trim() === '' ? padrao : Number(String(v).trim()); }
    var n = inteiro(x.nParcelas, NaN), p = inteiro(x.primeiroPrazoDias, INTERVALO_PADRAO_DIAS), iv = inteiro(x.intervaloDias, INTERVALO_PADRAO_DIAS);
    if (!(Number.isInteger(n) && n >= 1 && n <= MAX_PARCELAS)) return { ok: false, motivo: 'Nº de parcelas deve ser um inteiro de 1 a ' + MAX_PARCELAS + '.' };
    if (!(Number.isInteger(p) && p >= 0 && p <= 365)) return { ok: false, motivo: '1º vencimento deve ser de 0 a 365 dias.' };
    if (n > 1 && !(Number.isInteger(iv) && iv >= 1 && iv <= 365)) return { ok: false, motivo: 'Intervalo entre parcelas deve ser de 1 a 365 dias.' };
    var ultimo = p + (n - 1) * iv;
    if (ultimo > 365) return { ok: false, motivo: 'A última parcela venceria em ' + ultimo + ' dias; o limite é 365.' };
    if (n === 1 && p === 0) return { ok: true, condicao: 'À VISTA' };
    var dias = [];
    for (var i = 0; i < n; i++) dias.push(p + i * iv);
    return { ok: true, condicao: dias.join('/') };
  }
  /* Prévia das parcelas de um lançamento manual, antes de lançar. Mesmo caminho
     da leitura (situacao): vencimento fixo = parcela única; senão a condição a
     partir da emissão. [{n, de, vencimento, valorCentavos, tipo}], a última absorve o centavo. */
  function previaParcelas(l) {
    var x = l || {};
    var v = typeof x.valorCentavos === 'number' ? Math.round(x.valorCentavos) : centavos(x.valor);
    if (!(v > 0)) return { ok: false, motivo: 'Valor inválido.' };
    var emissao = String(x.emissao || '').slice(0, 10);
    if (!dataOk(emissao)) return { ok: false, motivo: 'Data de emissão inválida (AAAA-MM-DD).' };
    if (x.vencimento) {
      if (!dataOk(x.vencimento)) return { ok: false, motivo: 'Vencimento inválido (AAAA-MM-DD).' };
      return { ok: true, parcelas: [{ n: 1, de: 1, vencimento: String(x.vencimento).slice(0, 10), valorCentavos: v, tipo: 'PRAZO' }], avisos: [] };
    }
    if (!String(x.condicao || '').trim()) return { ok: false, motivo: 'Sem vencimento nem condição: o título entra sem prazo e vai para Complementos.' };
    var c = lerCondicao(x.condicao);
    if (!c.ok) return { ok: false, motivo: 'Condição de pagamento: ' + c.motivo };
    return parcelas(c, emissao, v);
  }
  /* Coluna "Parcelas" das listas: "1/2 paga", "0/3 recebidas", "+ parcial". */
  function resumoParcelas(sit) {
    var s = sit || {}, ps = s.parcelas || [];
    if (!ps.length) return '—';
    var abertas = {}, parcial = false;
    (s.abertas || []).forEach(function(a) { abertas[a.n] = true; if (a.abertoCentavos < a.valorCentavos) parcial = true; });
    var quitadas = ps.filter(function(p) { return !abertas[p.n]; }).length;
    var verbo = s.titulo && s.titulo.tipo === 'RECEBER' ? 'recebida' : 'paga';
    return quitadas + '/' + ps.length + ' ' + verbo + (quitadas === 1 ? '' : 's') + (parcial ? ' + parcial' : '');
  }

  /* ── Derivação: fato -> título ───────────────────────────────────────── */
  function nomeParceiro(cad, key, alternativo) {
    var x = (cad || {})[key] || {};
    return { key: key || null, nome: x.razaoSocial || x.nomeFantasia || x.nome || alternativo || null, cnpj: x.cnpj || null };
  }
  // Condição do PC: o PC, depois a proposta vencedora da cotação de origem.
  function condicaoDoPc(pc, cotacoes) {
    if (Array.isArray(pc.prazoPagamentoParcelas) && pc.prazoPagamentoParcelas.length && String(pc.condicaoPagamento || '').trim() !== '')
      return { texto: pc.prazoPagamentoParcelas.join('/'), fonte: 'PC' };
    if (String(pc.condicaoPagamento || '').trim()) return { texto: String(pc.condicaoPagamento), fonte: 'PC' };
    var cot = (cotacoes || {})[pc.origemProcessoCotacaoKey];
    var venc = cot && cot.fornecedoresConvidados && cot.fornecedoresConvidados[cot.fornecedorVencedorConvidadoKey];
    if (venc && String(venc.condicaoPagamento || '').trim()) return { texto: String(venc.condicaoPagamento), fonte: 'COTACAO' };
    return { texto: null, fonte: null };
  }
  function ehDoCliente(pc, item, lote) {
    if (lote && lote.custoFonte === 'CLIENTE') return true;
    try { return Prop.camposDoLote(pc, item).propriedade.tipo === Prop.CLIENTE; } catch (e) { return false; }
  }
  // Custo por unidade de estoque de uma linha recebida: o do lote (gravado no recebimento) ou o do item do PC.
  function custoDaLinha(pc, linha, lotes) {
    var item = (pc.itens || {})[linha.itemKey] || {};
    var lote = ((lotes || {})[san(linha.materialCodigo)] || {})[linha.loteKey] || null;
    if (ehDoCliente(pc, item, lote)) return { cliente: true };
    if (lote && lote.custoFonte === 'PAGO' && num(lote.custoUnitario) > 0) return { valor: num(lote.custoUnitario), item: item };
    var c = Custos.custoUnitarioItemPC(item);
    return c.valor > 0 ? { valor: c.valor, item: item } : { valor: null, motivo: c.motivo || 'item do PC sem preço', item: item };
  }

  /* Títulos a pagar dos recebimentos + abatimentos (devolução, cancelamento). */
  function derivarRecebimentos(base) {
    var b = base || {}, titulos = {}, abatimentos = {}, complementos = [];
    Object.keys(b.pedidos_compra || {}).forEach(function(pcKey) {
      var pc = b.pedidos_compra[pcKey]; if (!pc) return;
      Object.keys(pc.recebimentos || {}).forEach(function(recKey) {
        var rec = pc.recebimentos[recKey]; if (!rec) return;
        var id = 'REC_' + san(pcKey) + '_' + san(recKey);
        var linhas = rec.itensRecebidos || {}, total = 0, porNatureza = {}, semValor = [], deKuryos = 0, unit = {};
        Object.keys(linhas).forEach(function(lk) {
          var l = linhas[lk]; if (!l) return;
          var c = custoDaLinha(pc, l, b.estoque_lotes);
          if (c.cliente) return;
          deKuryos++;
          if (c.valor == null) { semValor.push((l.materialCodigo || lk) + ' (' + c.motivo + ')'); return; }
          unit[lk] = c.valor;
          var v = Math.round(num(l.qtdRecebidaAgora != null ? l.qtdRecebidaAgora : l.qtdRecebida) * c.valor * 100);
          total += v;
          var nat = Custos.naturezaDoMaterial({ mpCodigo: l.materialCodigo });
          porNatureza[nat] = (porNatureza[nat] || 0) + v;
        });
        if (!deKuryos) return; // tudo do cliente: nada a pagar
        var ref = { tipo: 'RECEBIMENTO', ref: pcKey + '/' + recKey, pc: pc.numeroFormatado || pc.numero || pcKey };
        if (semValor.length) {
          complementos.push({ id: id, tipo: 'SEM_VALOR', origem: ref, texto: 'Recebimento ' + (rec.notaFiscal ? 'NF ' + rec.notaFiscal + ' ' : '') + 'do PC ' + ref.pc + ' sem valor: ' + semValor.join('; '), acao: 'Corrigir o preço no PC (Compras) ou lançar o título manualmente' });
          return;
        }
        var cond = condicaoDoPc(pc, b.processos_cotacao);
        var nat = Object.keys(porNatureza).sort(function(x, y) { return porNatureza[y] - porNatureza[x]; })[0] || 'OUTROS';
        titulos[id] = {
          tipo: 'PAGAR', origem: ref, parceiro: Object.assign({ tipo: 'FORNECEDOR' }, nomeParceiro(b.fornecedores, pc.fornecedorKey, pc.fornecedorNome)),
          documento: rec.notaFiscal ? 'NF ' + rec.notaFiscal : null, emissao: String(rec.data || '').slice(0, 10) || null,
          competencia: String(rec.data || '').slice(0, 7) || null, valorCentavos: total, moeda: 'BRL',
          natureza: nat, porNatureza: porNatureza, centroCusto: null,
          condicao: cond.texto, condicaoFonte: cond.fonte, baseVencimento: String(rec.data || '').slice(0, 10) || null, versao: VERSAO
        };
        // Devolução parcial: abate a parte devolvida, ao mesmo custo da entrada.
        Object.keys(rec.devolucoes || {}).forEach(function(ek) {
          var ev = rec.devolucoes[ek], l = ev && linhas[ev.linhaKey];
          if (!l || unit[ev.linhaKey] == null) return;
          abatimentos[id + '_dev_' + san(ek)] = { titulo: id, motivo: 'DEVOLUCAO', valorCentavos: Math.round(num(ev.quantidade) * unit[ev.linhaKey] * 100),
            data: String(ev.em || '').slice(0, 10), ref: pcKey + '/' + recKey + '/devolucoes/' + ek };
        });
        if (rec.status === 'CANCELADO') {
          var devolvido = Object.keys(abatimentos).filter(function(k) { return abatimentos[k].titulo === id; })
            .reduce(function(s, k) { return s + abatimentos[k].valorCentavos; }, 0);
          abatimentos[id + '_cancel'] = { titulo: id, motivo: 'CANCELAMENTO', valorCentavos: Math.max(0, total - devolvido),
            data: String(rec.canceladoEm || rec.atualizadoEm || rec.data || '').slice(0, 10), ref: pcKey + '/' + recKey };
        }
      });
    });
    return { titulos: titulos, abatimentos: abatimentos, complementos: complementos };
  }

  /* Itens faturados por uma NF: os paletes dela na solicitação de faturamento. */
  function itensDaNf(fat, nf) {
    var sols = vals((fat || {}).solicitacoes).sort(function(a, b) { return String(a.em || '').localeCompare(String(b.em || '')); });
    var itens = sols.length ? (sols[sols.length - 1].itens || []) : [];
    var paletes = (nf && nf.paletes) || [];
    if (!paletes.length) return itens;
    return itens.filter(function(i) { return paletes.indexOf(i.itemKey + '/' + i.loteKey) >= 0; });
  }
  // Condição do cliente: pedido comercial do item faturado, depois o cadastro do cliente.
  function condicaoDoCliente(b, agenda, itens) {
    for (var i = 0; i < itens.length; i++) {
      var pc = (b.pedidos_comerciais || {})[itens[i].pedidoId];
      if (pc && String(pc.prazoPagamento || '').trim()) return { texto: String(pc.prazoPagamento), fonte: 'PEDIDO_COMERCIAL' };
    }
    var cli = (b.clientes || {})[agenda.clienteKey];
    if (cli && String(cli.condicaoPagamento || '').trim()) return { texto: String(cli.condicaoPagamento), fonte: 'CLIENTE' };
    return { texto: null, fonte: null };
  }

  /* Títulos a receber das NFs registradas nas cargas. O título é o valor DA NOTA.
     Pedido com parte fora da nota (percentualNF < 100) aparece como complemento
     DIFERENCA_FISCAL -- o módulo não inventa recebível nem esconde a diferença. */
  function derivarNfs(base) {
    var b = base || {}, titulos = {}, complementos = [];
    Object.keys(b.agendamentos_expedicao || {}).forEach(function(ak) {
      var a = b.agendamentos_expedicao[ak], fat = a && a.faturamento;
      if (!fat || !fat.nfs) return;
      var somaNfs = 0;
      Object.keys(fat.nfs).forEach(function(nk) {
        var nf = fat.nfs[nk]; if (!nf) return;
        var id = 'NF_' + san(ak) + '_' + san(nk);
        var ref = { tipo: 'NF_SAIDA', ref: ak + '/' + nk, nf: nf.numero + (nf.serie ? '/' + nf.serie : '') };
        var v = centavos(nf.valor);
        if (!(v > 0)) { complementos.push({ id: id, tipo: 'SEM_VALOR', origem: ref, texto: 'NF ' + ref.nf + ' de ' + (a.cliente || 'cliente') + ' registrada sem valor', acao: 'Lançar o título a receber manualmente com o valor da nota' }); return; }
        somaNfs += v;
        var itens = itensDaNf(fat, nf), cond = condicaoDoCliente(b, a, itens);
        titulos[id] = {
          tipo: 'RECEBER', origem: ref, parceiro: Object.assign({ tipo: 'CLIENTE' }, nomeParceiro(b.clientes, a.clienteKey, a.cliente)),
          documento: 'NF ' + ref.nf, chaveNfe: nf.chaveNfe || null, emissao: String(nf.emitidaEm || '').slice(0, 10) || null,
          competencia: String(nf.emitidaEm || '').slice(0, 7) || null, valorCentavos: v, moeda: 'BRL',
          natureza: 'RECEITA_VENDA', porNatureza: { RECEITA_VENDA: v }, centroCusto: 'COMERCIAL',
          condicao: cond.texto, condicaoFonte: cond.fonte, baseVencimento: String(nf.emitidaEm || '').slice(0, 10) || null,
          itens: itens.map(function(i) { return { sku: i.sku || null, lote: i.lote || null, unidades: num(i.unidades), valorCentavos: centavos(i.valor) || 0, pedidoId: i.pedidoId || null }; }),
          versao: VERSAO
        };
      });
      var sols = vals(fat.solicitacoes).sort(function(x, y) { return String(x.em || '').localeCompare(String(y.em || '')); });
      var solicitado = sols.length ? centavos(sols[sols.length - 1].totalValor) : null;
      if (solicitado > 0 && somaNfs > 0 && solicitado - somaNfs > 100) {
        complementos.push({ id: 'DIF_' + san(ak), tipo: 'DIFERENCA_FISCAL', origem: { tipo: 'CARGA', ref: ak },
          texto: 'Carga de ' + (a.cliente || 'cliente') + ': pedido R$ ' + (solicitado / 100).toFixed(2) + ' × notas R$ ' + (somaNfs / 100).toFixed(2) + ' (diferença R$ ' + ((solicitado - somaNfs) / 100).toFixed(2) + ')',
          acao: 'Conciliar com o contador; se a diferença for recebível, lançar título manual', valorCentavos: solicitado - somaNfs });
      }
    });
    return { titulos: titulos, complementos: complementos };
  }

  /* Recorrentes da operação do mês (Custos › Parâmetros) e PLR do bônus fechado.
     Se a operação for corrigida depois, o título não muda: nasce um título de
     AJUSTE (a mais) ou um abatimento (a menos), com chave pelo valor novo. */
  function derivarRecorrentes(base) {
    var b = base || {}, titulos = {}, abatimentos = {};
    var par = (b.fin && b.fin.parametros) || {}, existentes = (b.fin && b.fin.titulos) || {}, abats = (b.fin && b.fin.abatimentos) || {};
    var diaFolha = Math.min(28, Math.max(1, num(par.vencimentoFolhaDia) || 5)), diaFixos = Math.min(28, Math.max(1, num(par.vencimentoFixosDia) || 10));
    function vencNoMesSeguinte(comp, dia) { var a = Number(comp.slice(0, 4)), m = Number(comp.slice(5, 7)) + 1; if (m > 12) { m = 1; a++; } return a + '-' + (m < 10 ? '0' : '') + m + '-' + (dia < 10 ? '0' : '') + dia; }
    function esperado(id, v, modelo) {
      var atual = existentes[id];
      if (!atual) { if (v > 0) titulos[id] = Object.assign({ valorCentavos: v }, modelo); return; }
      var vigente = atual.valorCentavos;
      Object.keys(existentes).forEach(function(k) { if (k.indexOf(id + '_aj_') === 0) vigente += existentes[k].valorCentavos; });
      Object.keys(abats).forEach(function(k) { if (abats[k].titulo === id && abats[k].motivo === 'AJUSTE_RECORRENTE') vigente -= abats[k].valorCentavos; });
      if (v > vigente) titulos[id + '_aj_' + v] = Object.assign({}, modelo, { valorCentavos: v - vigente, ajusteDe: id });
      else if (v < vigente) abatimentos[id + '_aj_' + v] = { titulo: id, motivo: 'AJUSTE_RECORRENTE', valorCentavos: vigente - v, data: modelo.emissao, ref: modelo.origem.ref };
    }
    var ops = (b.custos && b.custos.operacao) || {};
    Object.keys(ops).forEach(function(comp) {
      if (!/^\d{4}-\d{2}$/.test(comp)) return;
      var o = ops[comp] || {}, emissao = comp + '-01';
      var folha = centavos(o.folhaProducao);
      if (folha != null) esperado('OPER_' + comp + '_FOLHA', folha, { tipo: 'PAGAR', origem: { tipo: 'OPERACAO', ref: 'custos/operacao/' + comp + '/folhaProducao' },
        parceiro: { tipo: 'COLABORADORES', key: null, nome: 'Folha da produção', cnpj: null }, documento: 'Folha ' + comp, emissao: emissao, competencia: comp,
        moeda: 'BRL', natureza: 'FOLHA', porNatureza: null, centroCusto: 'PRODUCAO', condicao: null, vencimentoFixo: vencNoMesSeguinte(comp, diaFolha), versao: VERSAO });
      Object.keys(o.fixos || {}).forEach(function(fk) {
        var f = o.fixos[fk] || {}, v = centavos(f.valor); if (v == null) return;
        var adm = f.rateio === 'ADMINISTRATIVO';
        esperado('OPER_' + comp + '_FIXO_' + san(fk), v, { tipo: 'PAGAR', origem: { tipo: 'OPERACAO', ref: 'custos/operacao/' + comp + '/fixos/' + fk },
          parceiro: { tipo: 'DIVERSOS', key: null, nome: f.descricao || 'Custo fixo', cnpj: null }, documento: (f.descricao || 'Custo fixo') + ' ' + comp, emissao: emissao,
          competencia: comp, moeda: 'BRL', natureza: adm ? 'CUSTO_FIXO_ADM' : 'CUSTO_FIXO_PRODUCAO', porNatureza: null, centroCusto: adm ? 'ADMINISTRATIVO' : 'PRODUCAO',
          condicao: null, vencimentoFixo: vencNoMesSeguinte(comp, diaFixos), versao: VERSAO });
      });
    });
    var fech = (b.resultado && b.resultado.fechamentos) || {};
    Object.keys(fech).forEach(function(comp) {
      var f = fech[comp]; if (!f || f.bonusValendo !== true || !(num(f.bonus) > 0)) return;
      esperado('PLR_' + comp, centavos(f.bonus), { tipo: 'PAGAR', origem: { tipo: 'BONUS', ref: 'resultado/fechamentos/' + comp },
        parceiro: { tipo: 'COLABORADORES', key: null, nome: 'PLR da fábrica', cnpj: null }, documento: 'PLR ' + comp, emissao: String(f.fechadoEm || comp + '-28').slice(0, 10),
        competencia: comp, moeda: 'BRL', natureza: 'PLR', porNatureza: null, centroCusto: 'PRODUCAO', condicao: null,
        vencimentoFixo: vencNoMesSeguinte(comp, diaFolha), versao: VERSAO });
    });
    return { titulos: titulos, abatimentos: abatimentos };
  }

  /* Derivação completa: só o que ainda NÃO existe vai para o banco (append-only). */
  function derivar(base) {
    var b = base || {}, existT = (b.fin && b.fin.titulos) || {}, existA = (b.fin && b.fin.abatimentos) || {};
    var r = derivarRecebimentos(b), n = derivarNfs(b), o = derivarRecorrentes(b);
    var novosT = {}, novosA = {};
    [r.titulos, n.titulos, o.titulos].forEach(function(m) { Object.keys(m).forEach(function(k) { if (!existT[k]) novosT[k] = m[k]; }); });
    [r.abatimentos, o.abatimentos].forEach(function(m) { Object.keys(m).forEach(function(k) { if (!existA[k]) novosA[k] = m[k]; }); });
    return { titulos: novosT, abatimentos: novosA, complementosDerivacao: r.complementos.concat(n.complementos) };
  }

  /* ── Situação de cada título ─────────────────────────────────────────── */
  function movimentosPorTitulo(fin) {
    var f = fin || {}, por = {};
    function de(id) { return por[id] = por[id] || { baixas: [], abatimentos: [], pago: 0, abatido: 0 }; }
    Object.keys(f.baixas || {}).forEach(function(k) {
      var x = f.baixas[k]; if (!x || !x.titulo) return;
      var m = de(x.titulo); m.baixas.push(Object.assign({ id: k }, x));
      m.pago += x.tipo === 'ESTORNO' ? -num(x.valorCentavos) : num(x.valorCentavos);
    });
    Object.keys(f.abatimentos || {}).forEach(function(k) {
      var x = f.abatimentos[k]; if (!x || !x.titulo) return;
      var m = de(x.titulo); m.abatimentos.push(Object.assign({ id: k }, x)); m.abatido += num(x.valorCentavos);
    });
    return por;
  }
  /* Parcelas abertas de um título: as derivadas da condição (do título ou a
     informada em fin/condicoes), com o já pago/abatido abatendo da mais antiga. */
  function situacao(id, t, mov, condInformada) {
    var m = mov || { baixas: [], abatimentos: [], pago: 0, abatido: 0 };
    var valor = num(t.valorCentavos), saldo = valor - m.pago - m.abatido;
    var cond = condInformada && condInformada.condicao ? condInformada.condicao : t.condicao;
    var ps;
    if (t.vencimentoFixo) ps = { ok: true, parcelas: [{ n: 1, de: 1, vencimento: t.vencimentoFixo, valorCentavos: valor, tipo: 'PRAZO' }], avisos: [] };
    else if (condInformada && condInformada.vencimento) ps = { ok: true, parcelas: [{ n: 1, de: 1, vencimento: condInformada.vencimento, valorCentavos: valor, tipo: 'PRAZO' }], avisos: [] };
    else ps = parcelas(cond, condInformada && condInformada.base || t.baseVencimento, valor);
    var abertas = [];
    if (ps.ok) {
      var quitado = m.pago + m.abatido;
      ps.parcelas.forEach(function(p) {
        var usa = Math.min(p.valorCentavos, Math.max(0, quitado)); quitado -= usa;
        if (p.valorCentavos - usa > 0) abertas.push(Object.assign({}, p, { abertoCentavos: p.valorCentavos - usa }));
      });
    }
    var status = saldo <= 0 ? (m.abatido >= valor && m.pago <= 0 ? 'ABATIDO' : 'QUITADO') : (m.pago + m.abatido > 0 ? 'PARCIAL' : 'ABERTO');
    return { id: id, titulo: t, saldoCentavos: Math.max(0, saldo), pagoCentavos: m.pago, abatidoCentavos: m.abatido, status: status,
      semVencimento: !ps.ok && saldo > 0, motivoVencimento: ps.ok ? null : ps.motivo, parcelas: ps.ok ? ps.parcelas : [], abertas: abertas,
      avisos: ps.avisos || [], baixas: m.baixas, abatimentos: m.abatimentos };
  }
  function carteira(fin) {
    var f = fin || {}, mov = movimentosPorTitulo(f), cond = f.condicoes || {}, bloq = f.bloqueios || {};
    return Object.keys(f.titulos || {}).map(function(id) {
      var s = situacao(id, f.titulos[id], mov[id], cond[id]);
      s.bloqueio = bloq[id] && bloq[id].ativo !== false ? bloq[id] : null;
      return s;
    });
  }

  /* Complementos: tudo que a derivação não completou + títulos sem vencimento. */
  function complementos(base) {
    var b = base || {}, lista = derivar(b).complementosDerivacao.slice();
    carteira(b.fin).forEach(function(s) {
      if (s.semVencimento) lista.push({ id: s.id, tipo: 'SEM_VENCIMENTO', origem: s.titulo.origem, titulo: s.id,
        texto: (s.titulo.tipo === 'PAGAR' ? 'A pagar' : 'A receber') + ' ' + (s.titulo.parceiro && s.titulo.parceiro.nome || '') + ' — ' + (s.titulo.documento || s.id) + ': ' + s.motivoVencimento,
        acao: 'Informar a condição ou o vencimento', valorCentavos: s.saldoCentavos });
    });
    return lista;
  }

  /* ── Baixa, estorno, lote ─────────────────────────────────────────────── */
  /* d: {titulo, data, valor (principal, centavos), juros?, multa?, desconto?, conta} */
  function validarBaixa(sit, d, contas) {
    var x = d || {};
    if (!sit) return { ok: false, motivo: 'Título não encontrado.' };
    if (sit.bloqueio && sit.titulo.tipo === 'PAGAR') return { ok: false, motivo: 'Título bloqueado para pagamento: ' + (sit.bloqueio.motivo || 'sem motivo') + '.' };
    var v = Math.round(num(x.valorCentavos));
    if (!(v > 0)) return { ok: false, motivo: 'Informe o valor da baixa.' };
    if (v > sit.saldoCentavos) return { ok: false, motivo: 'A baixa (R$ ' + (v / 100).toFixed(2) + ') passa do saldo do título (R$ ' + (sit.saldoCentavos / 100).toFixed(2) + ').' };
    if (!dataOk(x.data)) return { ok: false, motivo: 'Data da baixa inválida.' };
    if (!x.conta || !(contas || {})[x.conta]) return { ok: false, motivo: 'Escolha a conta bancária.' };
    var juros = Math.round(num(x.jurosCentavos)), multa = Math.round(num(x.multaCentavos)), desc = Math.round(num(x.descontoCentavos));
    if (juros < 0 || multa < 0 || desc < 0) return { ok: false, motivo: 'Juros, multa e desconto não podem ser negativos.' };
    if (desc > v) return { ok: false, motivo: 'Desconto maior que a baixa.' };
    return { ok: true, registro: { tipo: 'BAIXA', titulo: sit.id, tituloTipo: sit.titulo.tipo, data: String(x.data).slice(0, 10), valorCentavos: v,
      jurosCentavos: juros, multaCentavos: multa, descontoCentavos: desc, variacaoCambialCentavos: 0,
      liquidoCentavos: v + juros + multa - desc, conta: x.conta, natureza: sit.titulo.natureza || null, origemTitulo: sit.titulo.origem || null } };
  }
  function validarEstorno(baixas, baixaId) {
    var b = (baixas || {})[baixaId];
    if (!b || b.tipo !== 'BAIXA') return { ok: false, motivo: 'Baixa não encontrada.' };
    var ja = Object.keys(baixas).some(function(k) { var x = baixas[k]; return x && x.tipo === 'ESTORNO' && x.estorna === baixaId; });
    if (ja) return { ok: false, motivo: 'Esta baixa já foi estornada.' };
    return { ok: true, registro: Object.assign({}, b, { tipo: 'ESTORNO', estorna: baixaId }) };
  }
  // Segregação de funções: quem cria o lote não aprova (Borderô / F110 com aprovação).
  function validarAprovacaoLote(lote, uid) {
    if (!lote) return { ok: false, motivo: 'Lote não encontrado.' };
    if (lote.status !== 'AGUARDANDO') return { ok: false, motivo: 'Lote já ' + String(lote.status || '').toLowerCase() + '.' };
    if (lote.criadoPorUid === uid) return { ok: false, motivo: 'Quem montou o lote não pode aprová-lo: peça a outra pessoa.' };
    if (!Object.keys(lote.titulos || {}).length) return { ok: false, motivo: 'Lote sem títulos.' };
    return { ok: true };
  }

  /* Título manual ou importado. linha: {tipo, parceiro, cnpj?, documento?, emissao, vencimento?, condicao?, valor, natureza?} */
  var NATUREZAS = ['MATERIA_PRIMA', 'EMBALAGEM', 'USO_E_CONSUMO', 'OUTROS', 'FRETE', 'FOLHA', 'CUSTO_FIXO_PRODUCAO', 'CUSTO_FIXO_ADM',
    'DESPESA_COMERCIAL', 'PLR', 'IMPOSTOS', 'RECEITA_VENDA', 'OUTRAS_RECEITAS'];
  function validarTituloManual(l, origemTipo) {
    var x = l || {}, tipo = String(x.tipo || '').toUpperCase();
    if (tipo !== 'PAGAR' && tipo !== 'RECEBER') return { ok: false, motivo: 'Tipo deve ser PAGAR ou RECEBER.' };
    var v = typeof x.valorCentavos === 'number' ? Math.round(x.valorCentavos) : centavos(x.valor);
    if (!(v > 0)) return { ok: false, motivo: 'Valor inválido.' };
    var nome = String(x.parceiro || '').trim();
    if (!nome) return { ok: false, motivo: 'Informe o fornecedor/cliente.' };
    var emissao = String(x.emissao || '').slice(0, 10);
    if (!dataOk(emissao)) return { ok: false, motivo: 'Data de emissão inválida (AAAA-MM-DD).' };
    if (x.vencimento && !dataOk(x.vencimento)) return { ok: false, motivo: 'Vencimento inválido (AAAA-MM-DD).' };
    var nat = String(x.natureza || (tipo === 'RECEBER' ? 'RECEITA_VENDA' : 'OUTROS')).toUpperCase();
    if (NATUREZAS.indexOf(nat) < 0) return { ok: false, motivo: 'Natureza desconhecida: ' + nat + '.' };
    // Condição informada (sem vencimento): tem que ser entendida e é gravada na forma canônica.
    var cond = null;
    if (!x.vencimento && String(x.condicao || '').trim()) {
      cond = normalizarCondicao(x.condicao);
      if (!cond) return { ok: false, motivo: 'Condição de pagamento: ' + lerCondicao(x.condicao).motivo };
    }
    return { ok: true, titulo: { tipo: tipo, origem: { tipo: origemTipo || 'MANUAL', ref: null }, parceiro: { tipo: tipo === 'PAGAR' ? 'FORNECEDOR' : 'CLIENTE', key: x.parceiroKey || null, nome: nome.slice(0, 120), cnpj: String(x.cnpj || '').trim() || null },
      documento: String(x.documento || '').trim().slice(0, 60) || null, emissao: emissao, competencia: emissao.slice(0, 7), valorCentavos: v, moeda: 'BRL',
      natureza: nat, porNatureza: null, centroCusto: x.centroCusto || null, condicao: cond,
      vencimentoFixo: x.vencimento ? String(x.vencimento).slice(0, 10) : null, baseVencimento: emissao, historico: String(x.historico || '').slice(0, 300) || null, versao: VERSAO } };
  }
  /* Planilha de títulos em aberto (colar do Excel): tipo;parceiro;cnpj;documento;emissao;vencimento;valor;natureza
     Aceita ; ou TAB, data DD/MM/AAAA ou AAAA-MM-DD, valor 1.234,56. */
  function lerPlanilhaTitulos(texto) {
    var linhas = String(texto || '').split(/\r?\n/).map(function(s) { return s.trim(); }).filter(Boolean);
    var ok = [], erros = [];
    function data(s) { s = String(s || '').trim(); var m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? m[3] + '-' + m[2] + '-' + m[1] : s; }
    linhas.forEach(function(l, i) {
      var c = l.split(/\t|;/).map(function(s) { return s.trim(); });
      if (i === 0 && /tipo/i.test(c[0])) return;
      var r = validarTituloManual({ tipo: c[0], parceiro: c[1], cnpj: c[2], documento: c[3], emissao: data(c[4]), vencimento: c[5] ? data(c[5]) : null,
        valor: c[6], natureza: c[7] || null }, 'IMPORTACAO');
      if (r.ok) ok.push(r.titulo); else erros.push('Linha ' + (i + 1) + ': ' + r.motivo);
    });
    return { titulos: ok, erros: erros };
  }
  // Chave determinística de um título importado/manual: o mesmo documento não entra duas vezes.
  function chaveManual(t) {
    var s = [t.tipo, t.parceiro.nome, t.documento || '', t.emissao, t.valorCentavos, t.vencimentoFixo || t.condicao || ''].join('|');
    var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return (t.origem.tipo === 'IMPORTACAO' ? 'IMP_' : 'MAN_') + (h >>> 0).toString(36) + '_' + t.valorCentavos;
  }

  /* ── Bancos, fluxo de caixa, aging ───────────────────────────────────── */
  function saldosBancarios(fin, ate) {
    var f = fin || {}, out = {};
    Object.keys(f.contas_bancarias || {}).forEach(function(k) {
      var c = f.contas_bancarias[k]; if (!c) return;
      out[k] = { conta: k, nome: c.nome || k, saldoInicialCentavos: Math.round(num(c.saldoInicialCentavos)), dataSaldoInicial: c.dataSaldoInicial || null, movimentoCentavos: 0, saldoCentavos: 0 };
    });
    Object.keys(f.baixas || {}).forEach(function(k) {
      var x = f.baixas[k]; if (!x || !out[x.conta]) return;
      if (ate && x.data > ate) return;
      if (out[x.conta].dataSaldoInicial && x.data < out[x.conta].dataSaldoInicial) return;
      var sinal = (x.tituloTipo === 'RECEBER' ? 1 : -1) * (x.tipo === 'ESTORNO' ? -1 : 1);
      out[x.conta].movimentoCentavos += sinal * num(x.liquidoCentavos);
    });
    Object.keys(out).forEach(function(k) { out[k].saldoCentavos = out[k].saldoInicialCentavos + out[k].movimentoCentavos; });
    return out;
  }
  /* Compromissos (expectativa, nunca título): PC ainda não recebido e carteira de
     pedidos comerciais não faturada. Recalculados a cada leitura. */
  function compromissos(base) {
    var b = base || {}, lista = [];
    Object.keys(b.pedidos_compra || {}).forEach(function(k) {
      var pc = b.pedidos_compra[k];
      if (!pc || ['ENVIADO', 'RECEBIDO_PARCIAL', 'APROVADO'].indexOf(pc.status) < 0) return;
      var total = 0, semValor = 0;
      Object.keys(pc.itens || {}).forEach(function(ik) {
        var it = pc.itens[ik] || {};
        if (ehDoCliente(pc, it, null)) return;
        var falta = num(it.qtdEmUnidadeEstoque || it.qtd) - num(it.qtdRecebida);
        if (!(falta > 0)) return;
        var c = Custos.custoUnitarioItemPC(it);
        if (c.valor > 0) total += Math.round(falta * c.valor * 100); else semValor++;
      });
      if (!(total > 0)) return;
      var cond = condicaoDoPc(pc, b.processos_cotacao), dataBase = String(pc.dataPrevistaEntrega || '').slice(0, 10);
      var ps = parcelas(cond.texto, dataBase, total);
      lista.push({ id: 'PC_' + san(k), tipo: 'PAGAR', origem: { tipo: 'PEDIDO_COMPRA', ref: k, pc: pc.numeroFormatado || pc.numero || k },
        parceiro: nomeParceiro(b.fornecedores, pc.fornecedorKey, pc.fornecedorNome).nome, valorCentavos: total, itensSemValor: semValor,
        parcelas: ps.ok ? ps.parcelas : [], semData: !ps.ok, motivo: ps.ok ? null : ps.motivo });
    });
    // Carteira comercial: total do pedido menos o já faturado dele (itens de NF com o mesmo pedidoId).
    var faturado = {};
    Object.keys(b.agendamentos_expedicao || {}).forEach(function(ak) {
      var fat = (b.agendamentos_expedicao[ak] || {}).faturamento;
      vals(fat && fat.nfs).forEach(function(nf) { itensDaNf(fat, nf).forEach(function(i) { if (i.pedidoId) faturado[i.pedidoId] = (faturado[i.pedidoId] || 0) + (centavos(i.valor) || 0); }); });
    });
    Object.keys(b.pedidos_comerciais || {}).forEach(function(k) {
      var p = b.pedidos_comerciais[k], total = p && centavos(p.totalValor);
      if (!(total > 0)) return;
      var resta = total - (faturado[k] || 0);
      if (!(resta > 0)) return;
      lista.push({ id: 'PV_' + san(k), tipo: 'RECEBER', origem: { tipo: 'PEDIDO_COMERCIAL', ref: k }, parceiro: p.cliente || null,
        valorCentavos: resta, parcelas: [], semData: true, motivo: 'pedido sem data de faturamento', condicao: p.prazoPagamento || null });
    });
    return lista;
  }
  /* Fluxo de caixa por semana: realizado (baixas) das semanas passadas e projetado
     (parcelas abertas + compromissos) das próximas. Título é FATO; compromisso é
     EXPECTATIVA -- ficam em colunas separadas. Sem data -> balde próprio. */
  function fluxoDeCaixa(base, hoje, semanas) {
    var b = base || {}, n = semanas || 13, ini = segunda(hoje);
    var cols = [];
    for (var i = -4; i < n; i++) cols.push({ semana: addDias(ini, 7 * i), passada: i < 0, entradas: 0, saidas: 0, entradasPrevistas: 0, saidasPrevistas: 0 });
    var atrasado = { entradas: 0, saidas: 0 }, semData = { entradas: 0, saidas: 0, entradasPrevistas: 0, saidasPrevistas: 0 }, depois = { entradas: 0, saidas: 0 };
    function col(d) { var k = Math.floor(diffDias(d, ini) / 7) + 4; return k >= 0 && k < cols.length ? cols[k] : null; }
    vals((b.fin || {}).baixas).forEach(function(x) {
      if (x.data >= ini) return;
      var c = col(x.data); if (!c) return;
      var v = num(x.liquidoCentavos) * (x.tipo === 'ESTORNO' ? -1 : 1);
      if (x.tituloTipo === 'RECEBER') c.entradas += v; else c.saidas += v;
    });
    carteira(b.fin).forEach(function(s) {
      if (s.saldoCentavos <= 0) return;
      var lado = s.titulo.tipo === 'RECEBER' ? 'entradas' : 'saidas';
      if (s.semVencimento) { semData[lado] += s.saldoCentavos; return; }
      s.abertas.forEach(function(p) {
        if (p.vencimento < ini) atrasado[lado] += p.abertoCentavos;
        else { var c = col(p.vencimento); if (c) c[lado] += p.abertoCentavos; else depois[lado] += p.abertoCentavos; }
      });
    });
    compromissos(b).forEach(function(c) {
      var lado = c.tipo === 'RECEBER' ? 'entradasPrevistas' : 'saidasPrevistas';
      if (c.semData) { semData[lado] += c.valorCentavos; return; }
      c.parcelas.forEach(function(p) { var k = col(p.vencimento < ini ? ini : p.vencimento); if (k) k[lado] += p.valorCentavos; });
    });
    var bancos = saldosBancarios(b.fin, hoje);
    var saldo = Object.keys(bancos).reduce(function(s, k) { return s + bancos[k].saldoCentavos; }, 0);
    var acum = saldo + atrasado.entradas - atrasado.saidas;
    cols.forEach(function(c) {
      if (c.passada) return;
      acum += c.entradas - c.saidas + c.entradasPrevistas - c.saidasPrevistas;
      c.saldoProjetadoCentavos = acum;
    });
    return { semanas: cols, atrasado: atrasado, semData: semData, depois: depois, saldoAtualCentavos: saldo };
  }
  function aging(base, hoje) {
    var faixas = ['A_VENCER', 'D1_30', 'D31_60', 'D61_90', 'D90', 'SEM_VENCIMENTO'];
    var out = { PAGAR: {}, RECEBER: {} };
    faixas.forEach(function(f) { out.PAGAR[f] = 0; out.RECEBER[f] = 0; });
    carteira((base || {}).fin).forEach(function(s) {
      if (s.saldoCentavos <= 0) return;
      var t = out[s.titulo.tipo];
      if (s.semVencimento) { t.SEM_VENCIMENTO += s.saldoCentavos; return; }
      s.abertas.forEach(function(p) {
        var d = diffDias(hoje, p.vencimento);
        t[d <= 0 ? 'A_VENCER' : d <= 30 ? 'D1_30' : d <= 60 ? 'D31_60' : d <= 90 ? 'D61_90' : 'D90'] += p.abertoCentavos;
      });
    });
    return out;
  }
  // Prazo médio (dias, ponderado pelo valor) entre emissão e baixa, nos últimos 90 dias.
  function prazosMedios(fin, hoje) {
    var acc = { PAGAR: [0, 0], RECEBER: [0, 0] }, tit = (fin || {}).titulos || {}, desde = addDias(hoje, -90);
    var estornadas = {};
    vals((fin || {}).baixas).forEach(function(x) { if (x.tipo === 'ESTORNO') estornadas[x.estorna] = true; });
    Object.keys((fin || {}).baixas || {}).forEach(function(k) {
      var x = fin.baixas[k], t = x && tit[x.titulo];
      if (!t || x.tipo !== 'BAIXA' || estornadas[k] || x.data < desde || !t.emissao) return;
      acc[t.tipo][0] += num(x.valorCentavos) * Math.max(0, diffDias(x.data, t.emissao)); acc[t.tipo][1] += num(x.valorCentavos);
    });
    return { pmr: acc.RECEBER[1] ? Math.round(acc.RECEBER[0] / acc.RECEBER[1]) : null, pmp: acc.PAGAR[1] ? Math.round(acc.PAGAR[0] / acc.PAGAR[1]) : null };
  }

  /* ── Conciliação bancária (OFX) ───────────────────────────────────────── */
  function lerOfx(texto) {
    var t = String(texto || ''), linhas = [], re = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi, m;
    function campo(bloco, nome) { var r = new RegExp('<' + nome + '>([^<\\r\\n]*)', 'i').exec(bloco); return r ? r[1].trim() : ''; }
    while ((m = re.exec(t))) {
      var bl = m[1], dt = campo(bl, 'DTPOSTED'), v = campo(bl, 'TRNAMT').replace(',', '.'), fitid = campo(bl, 'FITID');
      if (!/^\d{8}/.test(dt) || !isFinite(parseFloat(v))) continue;
      linhas.push({ fitid: fitid || (dt.slice(0, 8) + '_' + v + '_' + linhas.length), data: dt.slice(0, 4) + '-' + dt.slice(4, 6) + '-' + dt.slice(6, 8),
        valorCentavos: Math.round(parseFloat(v) * 100), memo: (campo(bl, 'MEMO') || campo(bl, 'NAME')).slice(0, 140), tipo: campo(bl, 'TRNTYPE') || null });
    }
    var conta = campo(t, 'ACCTID') || null;
    return { conta: conta, linhas: linhas, erro: linhas.length ? null : 'Nenhum lançamento encontrado no arquivo (OFX esperado).' };
  }
  /* Sugestões para uma linha do extrato. Nunca casa sozinho "o mais próximo":
     um candidato só = sugestão; vários = o usuário escolhe; nenhum = criar baixa/título. */
  function sugerirConciliacao(linha, base, conta, tolDias) {
    var b = base || {}, f = b.fin || {}, tol = tolDias == null ? 3 : tolDias, conciliadas = {};
    vals(f.conciliacoes).forEach(function(c) { if (c.baixa) conciliadas[c.baixa] = true; });
    var estornadas = {};
    vals(f.baixas).forEach(function(x) { if (x.tipo === 'ESTORNO') estornadas[x.estorna] = true; });
    var alvo = Math.abs(linha.valorCentavos), tipo = linha.valorCentavos >= 0 ? 'RECEBER' : 'PAGAR';
    var baixas = Object.keys(f.baixas || {}).filter(function(k) {
      var x = f.baixas[k];
      return x && x.tipo === 'BAIXA' && !estornadas[k] && !conciliadas[k] && x.conta === conta && x.tituloTipo === tipo &&
        num(x.liquidoCentavos) === alvo && Math.abs(diffDias(x.data, linha.data)) <= tol;
    }).map(function(k) { return { tipo: 'BAIXA', baixa: k, titulo: f.baixas[k].titulo }; });
    if (baixas.length) return { candidatos: baixas };
    var titulos = [];
    carteira(f).forEach(function(s) {
      if (s.titulo.tipo !== tipo || s.saldoCentavos <= 0) return;
      s.abertas.forEach(function(p) { if (p.abertoCentavos === alvo && Math.abs(diffDias(p.vencimento, linha.data)) <= Math.max(tol, 10)) titulos.push({ tipo: 'TITULO', titulo: s.id, parcela: p.n }); });
      if (!s.abertas.length && s.saldoCentavos === alvo) titulos.push({ tipo: 'TITULO', titulo: s.id, parcela: null });
    });
    return { candidatos: titulos };
  }

  return {
    VERSAO: VERSAO, NATUREZAS: NATUREZAS,
    centavos: centavos, lerCondicao: lerCondicao, parcelas: parcelas, addDias: addDias,
    normalizarCondicao: normalizarCondicao, montarCondicao: montarCondicao, previaParcelas: previaParcelas, resumoParcelas: resumoParcelas,
    condicaoDoPc: condicaoDoPc, derivarRecebimentos: derivarRecebimentos, derivarNfs: derivarNfs, derivarRecorrentes: derivarRecorrentes, derivar: derivar,
    itensDaNf: itensDaNf, movimentosPorTitulo: movimentosPorTitulo, situacao: situacao, carteira: carteira, complementos: complementos,
    validarBaixa: validarBaixa, validarEstorno: validarEstorno, validarAprovacaoLote: validarAprovacaoLote,
    validarTituloManual: validarTituloManual, lerPlanilhaTitulos: lerPlanilhaTitulos, chaveManual: chaveManual,
    saldosBancarios: saldosBancarios, compromissos: compromissos, fluxoDeCaixa: fluxoDeCaixa, aging: aging, prazosMedios: prazosMedios,
    lerOfx: lerOfx, sugerirConciliacao: sugerirConciliacao
  };
});
