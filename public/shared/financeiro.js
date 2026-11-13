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
  // Ordem do vencimento: vencimento fixo do título > duplicatas da NF (XML) >
  // prazo informado no Financeiro > condição do pedido.
  function situacao(id, t, mov, condInformada, nota) {
    var m = mov || { baixas: [], abatimentos: [], pago: 0, abatido: 0 };
    var valor = num(t.valorCentavos), saldo = valor - m.pago - m.abatido;
    var cond = condInformada && condInformada.condicao ? condInformada.condicao : t.condicao;
    var ps, fonte = 'CONDICAO', daNota = !t.vencimentoFixo && nota ? parcelasDaNota(nota, valor) : null;
    if (t.vencimentoFixo) { ps = { ok: true, parcelas: [{ n: 1, de: 1, vencimento: t.vencimentoFixo, valorCentavos: valor, tipo: 'PRAZO' }], avisos: [] }; fonte = 'VENCIMENTO_FIXO'; }
    else if (daNota) { ps = { ok: true, parcelas: daNota, avisos: [] }; fonte = 'NF_XML'; }
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
    // Entrega B: o abatimento líquido de renegociação/cancelamento (desfazer = abatimento
    // negativo de mesmo grupo) dá o nome do status quando o saldo zera.
    var reneg = 0, canc = 0;
    m.abatimentos.forEach(function(a) {
      var v = num(a.valorCentavos);
      if (a.motivo === 'RENEGOCIACAO' || (a.motivo === 'RENEGOCIACAO_DESFEITA' && v < 0)) reneg += v;
      if (a.motivo === 'CANCELAMENTO' || a.motivo === 'CANCELAMENTO_DESFEITO') canc += v;
    });
    var status = saldo <= 0 ? (reneg > 0 ? 'RENEGOCIADO' : canc > 0 ? 'CANCELADO' : m.abatido >= valor && m.pago <= 0 ? 'ABATIDO' : 'QUITADO') : (m.pago + m.abatido > 0 ? 'PARCIAL' : 'ABERTO');
    return { id: id, titulo: t, saldoCentavos: Math.max(0, saldo), pagoCentavos: m.pago, abatidoCentavos: m.abatido, status: status,
      fonteParcelas: fonte, nota: nota ? { chave: nota.chave, numero: nota.numero, serie: nota.serie } : null,
      semVencimento: !ps.ok && saldo > 0, motivoVencimento: ps.ok ? null : ps.motivo, parcelas: ps.ok ? ps.parcelas : [], abertas: abertas,
      avisos: ps.avisos || [], baixas: m.baixas, abatimentos: m.abatimentos };
  }
  function carteira(fin) {
    var f = fin || {}, mov = movimentosPorTitulo(f), cond = f.condicoes || {}, bloq = f.bloqueios || {}, nt = notasPorTitulo(f);
    return Object.keys(f.titulos || {}).map(function(id) {
      var s = situacao(id, f.titulos[id], mov[id], cond[id], nt[id]);
      s.bloqueio = bloq[id] && bloq[id].ativo !== false ? bloq[id] : null;
      return s;
    });
  }

  /* Complementos: tudo que a derivação não completou + títulos sem vencimento. */
  function complementos(base) {
    var b = base || {}, lista = derivar(b).complementosDerivacao.concat(pendenciasNotas(b));
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
    // Centro de custo (12/11/2026): chave da Controladoria (ctl/centros_custo), só A-Z, 0-9 e _.
    var cc = String(x.centroCusto == null ? '' : x.centroCusto).trim();
    if (cc && !/^[A-Z0-9_]{1,40}$/.test(cc)) return { ok: false, motivo: 'Centro de custo inválido: ' + cc.slice(0, 40) + '.' };
    // F9: elemento de custo (código do plano de elementos) e forma de pagamento.
    var elem = String(x.elemento == null ? '' : x.elemento).trim().toUpperCase(), forma = String(x.formaPagamento == null ? '' : x.formaPagamento).trim().toUpperCase();
    if (elem && !/^[0-9A-Z]{1,8}$/.test(elem)) return { ok: false, motivo: 'Elemento de custo inválido: ' + elem.slice(0, 8) + '.' };
    if (forma && !FORMAS_PAGAMENTO[forma]) return { ok: false, motivo: 'Forma de pagamento inválida: ' + forma.slice(0, 20) + '.' };
    // Condição informada (sem vencimento): tem que ser entendida e é gravada na forma canônica.
    var cond = null;
    if (!x.vencimento && String(x.condicao || '').trim()) {
      cond = normalizarCondicao(x.condicao);
      if (!cond) return { ok: false, motivo: 'Condição de pagamento: ' + lerCondicao(x.condicao).motivo };
    }
    return { ok: true, titulo: { tipo: tipo, origem: { tipo: origemTipo || 'MANUAL', ref: null }, parceiro: { tipo: tipo === 'PAGAR' ? 'FORNECEDOR' : 'CLIENTE', key: x.parceiroKey || null, nome: nome.slice(0, 120), cnpj: String(x.cnpj || '').trim() || null },
      documento: String(x.documento || '').trim().slice(0, 60) || null, emissao: emissao, competencia: emissao.slice(0, 7), valorCentavos: v, moeda: 'BRL',
      natureza: nat, porNatureza: null, centroCusto: cc || null, elemento: elem || null, formaPagamento: forma || null, condicao: cond,
      vencimentoFixo: x.vencimento ? String(x.vencimento).slice(0, 10) : null, baseVencimento: emissao, historico: String(x.historico || '').slice(0, 300) || null,
      notaChave: /^\d{44}$/.test(String(x.notaChave || '')) ? String(x.notaChave) : null, versao: VERSAO } };
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
      // Antes da data de abertura a conta não existia: saldo zero (F7 — o DFC de meses anteriores acusava).
      var abriu = !(ate && c.dataSaldoInicial && c.dataSaldoInicial > ate);
      out[k] = { conta: k, nome: c.nome || k, tipo: tipoConta(c), saldoInicialCentavos: abriu ? Math.round(num(c.saldoInicialCentavos)) : 0, dataSaldoInicial: c.dataSaldoInicial || null, movimentoCentavos: 0, saldoCentavos: 0 };
    });
    Object.keys(f.baixas || {}).forEach(function(k) {
      var x = f.baixas[k]; if (!x || !out[x.conta]) return;
      if (ate && x.data > ate) return;
      if (out[x.conta].dataSaldoInicial && x.data < out[x.conta].dataSaldoInicial) return;
      var sinal = (x.tituloTipo === 'RECEBER' ? 1 : -1) * (x.tipo === 'ESTORNO' ? -1 : 1);
      out[x.conta].movimentoCentavos += sinal * num(x.liquidoCentavos);
    });
    // F6: tarifa, rendimento, transferência (e os estornos deles).
    Object.keys(f.movimentos || {}).forEach(function(k) {
      var m = f.movimentos[k]; if (!m) return;
      if (ate && m.data > ate) return;
      var ef = efeitosMovimento(m);
      Object.keys(ef).forEach(function(c) {
        if (!out[c]) return;
        if (out[c].dataSaldoInicial && m.data < out[c].dataSaldoInicial) return;
        out[c].movimentoCentavos += ef[c];
      });
    });
    // Entrega B: adiantamento a fornecedor (sai) e de cliente (entra), com o estorno.
    Object.keys(f.adiantamentos || {}).forEach(function(k) {
      var a = f.adiantamentos[k]; if (!a) return;
      if (ate && a.data > ate) return;
      var ef = efeitosAdiantamento(a);
      Object.keys(ef).forEach(function(c) {
        if (!out[c]) return;
        if (out[c].dataSaldoInicial && a.data < out[c].dataSaldoInicial) return;
        out[c].movimentoCentavos += ef[c];
      });
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
    // F6/F7: tarifa, IOF, juros e rendimento também são realizado (transferência se anula).
    vals((b.fin || {}).movimentos).forEach(function(m) {
      if (!m.data || m.data >= ini || m.tipo === 'TRANSFERENCIA') return;
      var c = col(m.data); if (!c) return;
      fluxosDoMovimento(m).forEach(function(x) { if (x.lado === 'E') c.entradas += x.valorCentavos; else c.saidas -= x.valorCentavos; });
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
  /* ── Fluxo de caixa por período e DFC (F7, 10/11/2026 — docs/financeiro-fase0-lacunas.md) ──
     Realizado = o que passou pelas contas (baixas + movimentos da F6); projetado =
     parcelas abertas + compromissos (pedidos). Transferência entre contas só aparece
     quando se olha UMA conta: no consolidado ela se anula. */
  var GRANULARIDADES = { DIA: { passados: 7, futuros: 30 }, SEMANA: { passados: 4, futuros: 13 }, MES: { passados: 3, futuros: 6 } };
  function inicioPeriodo(d, g) { d = String(d).slice(0, 10); return g === 'MES' ? d.slice(0, 8) + '01' : g === 'SEMANA' ? segunda(d) : d; }
  function somarPeriodo(d, g, n) {
    if (g === 'DIA') return addDias(d, n);
    if (g === 'SEMANA') return addDias(d, 7 * n);
    var y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0') + '-01';
  }
  // Movimento de conta como fluxo: {conta, valor (+entra/-sai), natureza}. Transferência
  // vira duas pernas (só contam com filtro de conta).
  // `lado` é o do lançamento ORIGINAL (E entrada, S saída): o estorno abate do mesmo lado
  // em vez de aparecer como movimento novo do lado oposto.
  function fluxosDoMovimento(m) {
    var ef = efeitosMovimento(m), out = [];
    Object.keys(ef).forEach(function(c) {
      if (!ef[c]) return;
      var lado = m.tipo === 'TRANSFERENCIA' ? (c === m.destino ? 'E' : 'S') : ((TIPOS_MOVIMENTO[m.tipo] || {}).sinal > 0 ? 'E' : 'S');
      out.push({ conta: c, valorCentavos: ef[c], lado: lado, natureza: m.tipo === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'RESULTADO_FINANCEIRO', data: m.data });
    });
    return out;
  }
  // Baixa como fluxo: principal na natureza do título; juros, multa e desconto no resultado financeiro.
  function fluxosDaBaixa(x) {
    var s = (x.tituloTipo === 'RECEBER' ? 1 : -1) * (x.tipo === 'ESTORNO' ? -1 : 1);
    var princ = Math.round(num(x.valorCentavos)), fin = Math.round(num(x.jurosCentavos)) + Math.round(num(x.multaCentavos)) - Math.round(num(x.descontoCentavos));
    var lado = x.tituloTipo === 'RECEBER' ? 'E' : 'S';
    var out = [{ conta: x.conta, valorCentavos: s * princ, lado: lado, natureza: x.natureza || 'OUTROS', data: x.data }];
    if (fin) out.push({ conta: x.conta, valorCentavos: s * fin, lado: lado, natureza: 'RESULTADO_FINANCEIRO', data: x.data });
    return out;
  }
  function fluxosRealizados(fin) {
    var f = fin || {}, out = [];
    vals(f.baixas).forEach(function(x) { if (x.conta && x.data) out = out.concat(fluxosDaBaixa(x)); });
    vals(f.movimentos).forEach(function(m) { if (m.data) out = out.concat(fluxosDoMovimento(m)); });
    vals(f.adiantamentos).forEach(function(a) {
      var ef = efeitosAdiantamento(a); if (!a.data) return;
      Object.keys(ef).forEach(function(c) { if (ef[c]) out.push({ conta: c, valorCentavos: ef[c], lado: a.tipo === 'PAGAR' ? 'S' : 'E', natureza: 'ADIANTAMENTOS', data: a.data }); });
    });
    return out;
  }
  /* op: {granularidade: DIA|SEMANA|MES, conta?, natureza?}. Com conta, o projetado
     (títulos não têm conta) fica de fora e a tela avisa. */
  function fluxoCaixa(base, hoje, op) {
    var b = base || {}, o = op || {}, g = GRANULARIDADES[o.granularidade] ? o.granularidade : 'SEMANA', cfg = GRANULARIDADES[g];
    var ini = inicioPeriodo(hoje, g), cols = [];
    for (var i = -cfg.passados; i < cfg.futuros; i++) {
      var c0 = somarPeriodo(ini, g, i);
      cols.push({ inicio: c0, fim: addDias(somarPeriodo(ini, g, i + 1), -1), passada: i < 0, entradas: 0, saidas: 0, entradasPrevistas: 0, saidasPrevistas: 0 });
    }
    function col(d) { for (var j = 0; j < cols.length; j++) if (d >= cols[j].inicio && d <= cols[j].fim) return cols[j]; return null; }
    var conta = o.conta || null, nat = o.natureza || null;
    var atrasado = { entradas: 0, saidas: 0 }, semData = { entradas: 0, saidas: 0, entradasPrevistas: 0, saidasPrevistas: 0 }, depois = { entradas: 0, saidas: 0 };
    fluxosRealizados(b.fin).forEach(function(x) {
      if (x.data >= ini) return;
      if (conta ? x.conta !== conta : x.natureza === 'TRANSFERENCIA') return;
      if (nat && x.natureza !== nat) return;
      var c = col(x.data); if (!c) return;
      if (x.lado === 'E') c.entradas += x.valorCentavos; else c.saidas -= x.valorCentavos;
    });
    var projeta = !conta;
    if (projeta) {
      carteira(b.fin).forEach(function(s) {
        if (s.saldoCentavos <= 0 || (nat && s.titulo.natureza !== nat)) return;
        var lado = s.titulo.tipo === 'RECEBER' ? 'entradas' : 'saidas';
        if (s.semVencimento) { semData[lado] += s.saldoCentavos; return; }
        s.abertas.forEach(function(p) {
          if (p.vencimento < ini) atrasado[lado] += p.abertoCentavos;
          else { var c = col(p.vencimento); if (c) c[lado] += p.abertoCentavos; else depois[lado] += p.abertoCentavos; }
        });
      });
      // Compromisso de PC não tem uma natureza só: com filtro de natureza, fica de fora.
      compromissos(b).forEach(function(c) {
        if (nat && !(c.tipo === 'RECEBER' && nat === 'RECEITA_VENDA')) return;
        var lado = c.tipo === 'RECEBER' ? 'entradasPrevistas' : 'saidasPrevistas';
        if (c.semData) { semData[lado] += c.valorCentavos; return; }
        c.parcelas.forEach(function(p) { var k = col(p.vencimento < ini ? ini : p.vencimento); if (k) k[lado] += p.valorCentavos; });
      });
    }
    var bancos = saldosBancarios(b.fin, hoje);
    var saldo = Object.keys(bancos).filter(function(k) { return !conta || k === conta; }).reduce(function(s, k) { return s + bancos[k].saldoCentavos; }, 0);
    var acum = saldo + atrasado.entradas - atrasado.saidas;
    cols.forEach(function(c) {
      if (c.passada) return;
      acum += c.entradas - c.saidas + c.entradasPrevistas - c.saidasPrevistas;
      c.saldoProjetadoCentavos = nat ? null : acum; // com filtro de natureza, saldo não faz sentido
    });
    // F9 (NA-06): uma linha por grupo de elemento -- realizado + títulos a vencer (sem as previsões de pedido).
    var porGrupo;
    if (o.porGrupo) {
      var gs = {}, els = elementos(b.fin);
      var linhaG = function(cod) { var gr = (els[cod] || {}).grupo || '9'; if (!gs[gr]) gs[gr] = { grupo: gr, rotulo: GRUPOS_ELEMENTO[gr] || gr, valores: cols.map(function() { return 0; }) }; return gs[gr]; };
      var idx = function(d) { for (var j = 0; j < cols.length; j++) if (d >= cols[j].inicio && d <= cols[j].fim) return j; return -1; };
      fluxosRealizadosPorElemento(b.fin).forEach(function(x) {
        if (x.data >= ini) return;
        if (conta ? x.conta !== conta : false) return;
        if (nat && x.natureza !== nat) return;
        var j = idx(x.data); if (j < 0) return;
        linhaG(x.elemento).valores[j] += x.valorCentavos;
      });
      if (projeta) carteira(b.fin).forEach(function(s2) {
        if (s2.saldoCentavos <= 0 || s2.semVencimento || (nat && s2.titulo.natureza !== nat)) return;
        var sinal = s2.titulo.tipo === 'RECEBER' ? 1 : -1;
        s2.abertas.forEach(function(p) {
          if (p.vencimento < ini) return;
          var j = idx(p.vencimento); if (j < 0) return;
          partesDoTitulo(b.fin, s2.id, p.abertoCentavos).forEach(function(pt) { linhaG(pt.elemento).valores[j] += sinal * pt.valorCentavos; });
        });
      });
      porGrupo = Object.keys(gs).sort().map(function(k) { return gs[k]; });
    }
    var avisos = [];
    if (conta) avisos.push('Com uma conta escolhida, só o realizado aparece: títulos a vencer ainda não têm conta definida.');
    if (nat) avisos.push('Com uma natureza escolhida não há saldo projetado; pedidos de compra (várias naturezas) ficam de fora.');
    var res = { granularidade: g, colunas: cols, atrasado: atrasado, semData: semData, depois: depois, saldoAtualCentavos: saldo, projetado: projeta, avisos: avisos };
    if (porGrupo) res.porGrupo = porGrupo;
    return res;
  }

  /* DFC pelo método direto, realizado, mês a mês. Atividade de cada natureza: o
     padrão abaixo ou fin/parametros/dfcAtividades/{NATUREZA}. Natureza sem atividade
     vai para NAO_CLASSIFICADO (nunca some). Conferência: saldo final = bancos. */
  var ATIVIDADES = { OPERACIONAL: 'Atividades operacionais', INVESTIMENTO: 'Atividades de investimento', FINANCIAMENTO: 'Atividades de financiamento', NAO_CLASSIFICADO: 'Não classificado' };
  var ATIVIDADE_PADRAO = {
    RECEITA_VENDA: 'OPERACIONAL', OUTRAS_RECEITAS: 'OPERACIONAL', MATERIA_PRIMA: 'OPERACIONAL', EMBALAGEM: 'OPERACIONAL', USO_E_CONSUMO: 'OPERACIONAL',
    FRETE: 'OPERACIONAL', FOLHA: 'OPERACIONAL', CUSTO_FIXO_PRODUCAO: 'OPERACIONAL', CUSTO_FIXO_ADM: 'OPERACIONAL', DESPESA_COMERCIAL: 'OPERACIONAL',
    PLR: 'OPERACIONAL', IMPOSTOS: 'OPERACIONAL', OUTROS: 'OPERACIONAL', RESULTADO_FINANCEIRO: 'OPERACIONAL', ADIANTAMENTOS: 'OPERACIONAL'
  };
  var ROTULO_NATUREZA_DFC = { RESULTADO_FINANCEIRO: 'Resultado financeiro (juros, multas, descontos, tarifas, IOF, rendimentos)', ADIANTAMENTOS: 'Adiantamentos a fornecedores e de clientes' };
  function atividadeDe(natureza, parametros) {
    var m = ((parametros || {}).dfcAtividades) || {};
    var a = m[natureza] || ATIVIDADE_PADRAO[natureza];
    return ATIVIDADES[a] ? a : 'NAO_CLASSIFICADO';
  }
  function dfc(fin, deMes, ateMes) {
    var f = fin || {}, meses = [], m = String(deMes).slice(0, 7) + '-01', fimMes = String(ateMes).slice(0, 7) + '-01';
    if (!dataOk(m) || !dataOk(fimMes) || m > fimMes) return { ok: false, motivo: 'Período inválido.' };
    while (m <= fimMes && meses.length < 36) { meses.push(m.slice(0, 7)); m = somarPeriodo(m, 'MES', 1); }
    var par = f.parametros || {}, linhas = {}, totais = {};
    function linha(atv, nat) {
      var k = atv + '|' + nat;
      if (!linhas[k]) { linhas[k] = { atividade: atv, natureza: nat, rotulo: ROTULO_NATUREZA_DFC[nat] || nat, meses: {} }; meses.forEach(function(x) { linhas[k].meses[x] = 0; }); }
      return linhas[k];
    }
    fluxosRealizados(f).forEach(function(x) {
      if (x.natureza === 'TRANSFERENCIA') return; // movimento interno
      var mes = String(x.data).slice(0, 7); if (meses.indexOf(mes) < 0) return;
      var conta = (f.contas_bancarias || {})[x.conta];
      if (!conta || (conta.dataSaldoInicial && x.data < conta.dataSaldoInicial)) return; // o saldosBancarios também ignora
      linha(atividadeDe(x.natureza, par), x.natureza).meses[mes] += x.valorCentavos;
    });
    var colunas = meses.map(function(mes) {
      var ini = mes + '-01', fim = addDias(somarPeriodo(ini, 'MES', 1), -1);
      var antes = saldosBancarios(f, addDias(ini, -1)), depoisB = saldosBancarios(f, fim);
      var si = 0, sf = 0, abertura = 0;
      Object.keys(depoisB).forEach(function(k) {
        var cb = (f.contas_bancarias || {})[k] || {}, ab = cb.dataSaldoInicial;
        // Conta aberta dentro do mês: o saldo de abertura não é fluxo, é abertura.
        if (ab && ab >= ini && ab <= fim) abertura += Math.round(num(cb.saldoInicialCentavos));
        else if (!ab || ab < ini) si += (antes[k] || {}).saldoCentavos || 0;
        sf += depoisB[k].saldoCentavos;
      });
      return { mes: mes, saldoInicialCentavos: si, aberturaContasCentavos: abertura, saldoFinalBancosCentavos: sf };
    });
    var lista = Object.keys(linhas).map(function(k) { return linhas[k]; });
    var ordemAtv = Object.keys(ATIVIDADES);
    lista.sort(function(a, b) { return ordemAtv.indexOf(a.atividade) - ordemAtv.indexOf(b.atividade) || a.rotulo.localeCompare(b.rotulo); });
    var grupos = ordemAtv.map(function(atv) {
      var ls = lista.filter(function(l) { return l.atividade === atv; }), tot = {};
      meses.forEach(function(mes) { tot[mes] = ls.reduce(function(s, l) { return s + l.meses[mes]; }, 0); });
      return { atividade: atv, rotulo: ATIVIDADES[atv], linhas: ls, totais: tot };
    }).filter(function(gr) { return gr.linhas.length; });
    colunas.forEach(function(c) {
      c.variacaoCentavos = grupos.reduce(function(s, gr) { return s + gr.totais[c.mes]; }, 0);
      c.saldoFinalCentavos = c.saldoInicialCentavos + c.aberturaContasCentavos + c.variacaoCentavos;
      c.diferencaCentavos = c.saldoFinalBancosCentavos - c.saldoFinalCentavos;
      c.confere = c.diferencaCentavos === 0;
    });
    return { ok: true, meses: meses, colunas: colunas, grupos: grupos, naoClassificado: grupos.some(function(gr) { return gr.atividade === 'NAO_CLASSIFICADO'; }) };
  }

  /* ── Relatórios (F8, 10/11/2026 — docs/financeiro-fase0-lacunas.md) ─────
     Cada relatório é UMA estrutura {titulo, filtros, colunas, linhas, totais} que serve
     a tela, a impressão e o CSV -- os totais nunca divergem entre eles. Colunas:
     {chave, rotulo, tipo: texto|data|valor}; valor em centavos. */
  // CNPJ/CPF com máscara: o Excel não o trata como número (perderia os zeros à esquerda).
  function mascaraDoc(v) {
    var d = soDigitos(v);
    if (d.length === 14) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
    if (d.length === 11) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
    return String(v == null ? '' : v);
  }
  function dentro(d, de, ate) { d = String(d || '').slice(0, 10); return !!d && (!de || d >= de) && (!ate || d <= ate); }
  function somaCol(linhas, colunas) {
    var t = {};
    colunas.forEach(function(c) { if (c.tipo === 'valor') t[c.chave] = linhas.reduce(function(s, l) { return s + (Math.round(num(l[c.chave])) || 0); }, 0); });
    return t;
  }
  var ROT_SIT = { ABERTO: 'Aberto', PARCIAL: 'Parcial', QUITADO: 'Quitado', ABATIDO: 'Abatido', RENEGOCIADO: 'Renegociado', CANCELADO: 'Cancelado' };
  /* Títulos por PARCELA. f: {tipo PAGAR|RECEBER, data VENCIMENTO|EMISSAO, de, ate, parceiro, situacao ABERTOS|QUITADOS|TODOS, natureza} */
  function relTitulos(fin, f) {
    var o = f || {}, tipo = o.tipo === 'RECEBER' ? 'RECEBER' : 'PAGAR', q = String(o.parceiro || '').trim().toUpperCase(), linhas = [];
    carteira(fin).forEach(function(s) {
      var t = s.titulo;
      if (t.tipo !== tipo || (o.natureza && t.natureza !== o.natureza)) return;
      if (q && String(t.parceiro && t.parceiro.nome || '').toUpperCase().indexOf(q) < 0) return;
      if (o.data === 'EMISSAO' && !dentro(t.emissao, o.de, o.ate)) return;
      var ps = s.parcelas.length ? s.parcelas : [{ n: 1, de: 1, vencimento: null, valorCentavos: num(t.valorCentavos) }];
      ps.forEach(function(p) {
        var ab = s.abertas.filter(function(a) { return a.n === p.n; })[0], aberto = s.parcelas.length ? (ab ? ab.abertoCentavos : 0) : s.saldoCentavos;
        if (o.data !== 'EMISSAO' && (o.de || o.ate) && !dentro(p.vencimento, o.de, o.ate)) return;
        if (o.situacao === 'ABERTOS' && !(aberto > 0)) return;
        if (o.situacao === 'QUITADOS' && aberto > 0) return;
        linhas.push({ documento: t.documento || s.id, parceiro: (t.parceiro && t.parceiro.nome) || '', cnpj: mascaraDoc(t.parceiro && t.parceiro.cnpj), natureza: t.natureza || '',
          emissao: t.emissao || '', parcela: p.n + '/' + p.de, vencimento: p.vencimento || '', valor: p.valorCentavos, aberto: aberto,
          situacao: aberto <= 0 ? 'Quitada' : (p.vencimento && o.hoje && p.vencimento < o.hoje ? 'Vencida' : (s.semVencimento ? 'Sem vencimento' : 'A vencer')) });
      });
    });
    linhas.sort(function(a, b) { return String(a.vencimento || '9999').localeCompare(String(b.vencimento || '9999')) || a.parceiro.localeCompare(b.parceiro); });
    var colunas = [{ chave: 'vencimento', rotulo: 'Vencimento', tipo: 'data' }, { chave: 'documento', rotulo: 'Documento', tipo: 'texto' }, { chave: 'parcela', rotulo: 'Parcela', tipo: 'texto' },
      { chave: 'parceiro', rotulo: tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente', tipo: 'texto' }, { chave: 'cnpj', rotulo: 'CNPJ', tipo: 'texto' }, { chave: 'natureza', rotulo: 'Natureza', tipo: 'texto' },
      { chave: 'emissao', rotulo: 'Emissão', tipo: 'data' }, { chave: 'valor', rotulo: 'Valor da parcela', tipo: 'valor' }, { chave: 'aberto', rotulo: 'Em aberto', tipo: 'valor' }, { chave: 'situacao', rotulo: 'Situação', tipo: 'texto' }];
    return { titulo: tipo === 'PAGAR' ? 'Contas a pagar' : 'Contas a receber', colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas) };
  }
  /* Baixas do período (pagamentos e recebimentos, com os estornos). f: {de, ate, conta, tipo} */
  function relBaixas(fin, f) {
    var o = f || {}, x = fin || {}, linhas = [];
    Object.keys(x.baixas || {}).forEach(function(k) {
      var b = x.baixas[k]; if (!b || !dentro(b.data, o.de, o.ate) || (o.conta && b.conta !== o.conta) || (o.tipo && b.tituloTipo !== o.tipo)) return;
      var t = (x.titulos || {})[b.titulo] || {}, s = b.tipo === 'ESTORNO' ? -1 : 1;
      linhas.push({ data: b.data, operacao: (b.tipo === 'ESTORNO' ? 'Estorno de ' : '') + (b.tituloTipo === 'RECEBER' ? 'recebimento' : 'pagamento'),
        documento: t.documento || b.titulo, parceiro: (t.parceiro && t.parceiro.nome) || '', natureza: b.natureza || t.natureza || '',
        conta: ((x.contas_bancarias || {})[b.conta] || {}).nome || b.conta || '', principal: s * Math.round(num(b.valorCentavos)),
        jurosMulta: s * (Math.round(num(b.jurosCentavos)) + Math.round(num(b.multaCentavos))), desconto: s * Math.round(num(b.descontoCentavos)), liquido: s * Math.round(num(b.liquidoCentavos)) });
    });
    linhas.sort(function(a, b) { return String(a.data).localeCompare(String(b.data)) || a.parceiro.localeCompare(b.parceiro); });
    var colunas = [{ chave: 'data', rotulo: 'Data', tipo: 'data' }, { chave: 'operacao', rotulo: 'Operação', tipo: 'texto' }, { chave: 'documento', rotulo: 'Documento', tipo: 'texto' },
      { chave: 'parceiro', rotulo: 'Parceiro', tipo: 'texto' }, { chave: 'natureza', rotulo: 'Natureza', tipo: 'texto' }, { chave: 'conta', rotulo: 'Conta', tipo: 'texto' },
      { chave: 'principal', rotulo: 'Principal', tipo: 'valor' }, { chave: 'jurosMulta', rotulo: 'Juros + multa', tipo: 'valor' }, { chave: 'desconto', rotulo: 'Desconto', tipo: 'valor' }, { chave: 'liquido', rotulo: 'Líquido', tipo: 'valor' }];
    return { titulo: 'Baixas do período', colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas) };
  }
  /* Aging por título (a vencer e faixas de atraso). f: {tipo, hoje} */
  function relAging(fin, f) {
    var o = f || {}, tipo = o.tipo === 'RECEBER' ? 'RECEBER' : 'PAGAR', linhas = [];
    carteira(fin).forEach(function(s) {
      if (s.titulo.tipo !== tipo || s.saldoCentavos <= 0) return;
      var l = { parceiro: (s.titulo.parceiro && s.titulo.parceiro.nome) || '', documento: s.titulo.documento || s.id, A_VENCER: 0, D1_30: 0, D31_60: 0, D61_90: 0, D90: 0, SEM_VENCIMENTO: 0 };
      if (s.semVencimento) l.SEM_VENCIMENTO = s.saldoCentavos;
      else s.abertas.forEach(function(p) { var d = diffDias(o.hoje, p.vencimento); l[d <= 0 ? 'A_VENCER' : d <= 30 ? 'D1_30' : d <= 60 ? 'D31_60' : d <= 90 ? 'D61_90' : 'D90'] += p.abertoCentavos; });
      l.total = l.A_VENCER + l.D1_30 + l.D31_60 + l.D61_90 + l.D90 + l.SEM_VENCIMENTO;
      linhas.push(l);
    });
    linhas.sort(function(a, b) { return a.parceiro.localeCompare(b.parceiro) || a.documento.localeCompare(b.documento); });
    var colunas = [{ chave: 'parceiro', rotulo: tipo === 'PAGAR' ? 'Fornecedor' : 'Cliente', tipo: 'texto' }, { chave: 'documento', rotulo: 'Documento', tipo: 'texto' },
      { chave: 'A_VENCER', rotulo: 'A vencer', tipo: 'valor' }, { chave: 'D1_30', rotulo: 'Vencido 1–30', tipo: 'valor' }, { chave: 'D31_60', rotulo: '31–60', tipo: 'valor' },
      { chave: 'D61_90', rotulo: '61–90', tipo: 'valor' }, { chave: 'D90', rotulo: 'Mais de 90', tipo: 'valor' }, { chave: 'SEM_VENCIMENTO', rotulo: 'Sem vencimento', tipo: 'valor' }, { chave: 'total', rotulo: 'Total', tipo: 'valor' }];
    return { titulo: 'Aging — ' + (tipo === 'PAGAR' ? 'a pagar' : 'a receber'), colunas: colunas, linhas: linhas, totais: somaCol(linhas, colunas) };
  }
  /* Extrato da conta (F6) como relatório. */
  function relExtrato(fin, f) {
    var o = f || {}, ex = extratoConta(fin, o.conta, o.de, o.ate);
    if (!ex.ok) return { titulo: 'Extrato', colunas: [], linhas: [], totais: {}, erro: ex.motivo };
    var linhas = [{ data: o.de || '', historico: 'Saldo anterior', entrada: 0, saida: 0, saldo: ex.saldoAnteriorCentavos }].concat(ex.linhas.map(function(l) {
      var ini = l.tipo === 'SALDO_INICIAL';
      return { data: l.data, historico: l.historico, entrada: !ini && l.valorCentavos > 0 ? l.valorCentavos : 0, saida: l.valorCentavos < 0 ? -l.valorCentavos : 0, saldo: l.saldoCentavos };
    }));
    var colunas = [{ chave: 'data', rotulo: 'Data', tipo: 'data' }, { chave: 'historico', rotulo: 'Histórico', tipo: 'texto' }, { chave: 'entrada', rotulo: 'Entrada', tipo: 'valor' },
      { chave: 'saida', rotulo: 'Saída', tipo: 'valor' }, { chave: 'saldo', rotulo: 'Saldo', tipo: 'valor', semTotal: true }];
    var tot = somaCol(linhas, colunas); tot.saldo = ex.saldoFinalCentavos; // saldo não se soma: o total é o saldo final
    return { titulo: 'Extrato — ' + ex.nome, colunas: colunas, linhas: linhas, totais: tot };
  }
  /* DFC (F7) como relatório: uma linha por natureza, uma coluna por mês. */
  function relDfc(fin, f) {
    var o = f || {}, d = dfc(fin, o.de, o.ate);
    if (!d.ok) return { titulo: 'Demonstrativo de fluxo de caixa', colunas: [], linhas: [], totais: {}, erro: d.motivo };
    var colunas = [{ chave: 'linha', rotulo: '', tipo: 'texto' }].concat(d.meses.map(function(m) { return { chave: m, rotulo: m.slice(5, 7) + '/' + m.slice(0, 4), tipo: 'valor', semTotal: true }; }));
    function porMes(f2) { var l = {}; d.meses.forEach(function(m, i) { l[m] = f2(m, i); }); return l; }
    var linhas = [Object.assign({ linha: 'Saldo inicial', destaque: true }, porMes(function(m, i) { return d.colunas[i].saldoInicialCentavos + d.colunas[i].aberturaContasCentavos; }))];
    d.grupos.forEach(function(gr) {
      gr.linhas.forEach(function(l) { linhas.push(Object.assign({ linha: gr.rotulo + ' — ' + l.rotulo }, porMes(function(m) { return l.meses[m]; }))); });
      linhas.push(Object.assign({ linha: 'Caixa líquido — ' + gr.rotulo, destaque: true }, porMes(function(m) { return gr.totais[m]; })));
    });
    linhas.push(Object.assign({ linha: 'Variação do caixa', destaque: true }, porMes(function(m, i) { return d.colunas[i].variacaoCentavos; })));
    linhas.push(Object.assign({ linha: 'Saldo final', destaque: true }, porMes(function(m, i) { return d.colunas[i].saldoFinalCentavos; })));
    linhas.push(Object.assign({ linha: 'Diferença contra os bancos', destaque: true }, porMes(function(m, i) { return d.colunas[i].diferencaCentavos; })));
    return { titulo: 'Demonstrativo de fluxo de caixa (método direto)', colunas: colunas, linhas: linhas, totais: {} };
  }
  /* Fluxo de caixa (F7) como relatório. f: {granularidade, conta, natureza, hoje} */
  function relFluxo(base, f) {
    var o = f || {}, fl = fluxoCaixa(base, o.hoje, o);
    var linhas = fl.colunas.map(function(c) {
      return { periodo: c.inicio, situacao: c.passada ? 'Realizado' : 'Projetado', entradas: c.entradas, entradasPrevistas: c.passada ? 0 : c.entradasPrevistas,
        saidas: c.saidas, saidasPrevistas: c.passada ? 0 : c.saidasPrevistas, saldoProjetado: c.passada ? null : c.saldoProjetadoCentavos };
    });
    var colunas = [{ chave: 'periodo', rotulo: { DIA: 'Dia', SEMANA: 'Semana de', MES: 'Mês de' }[fl.granularidade], tipo: 'data' }, { chave: 'situacao', rotulo: '', tipo: 'texto' },
      { chave: 'entradas', rotulo: 'Entradas', tipo: 'valor' }, { chave: 'entradasPrevistas', rotulo: 'Entradas previstas', tipo: 'valor' },
      { chave: 'saidas', rotulo: 'Saídas', tipo: 'valor' }, { chave: 'saidasPrevistas', rotulo: 'Saídas previstas', tipo: 'valor' }, { chave: 'saldoProjetado', rotulo: 'Saldo projetado', tipo: 'valor', semTotal: true }];
    var tot = somaCol(linhas, colunas); delete tot.saldoProjetado;
    return { titulo: 'Fluxo de caixa', colunas: colunas, linhas: linhas, totais: tot, avisos: fl.avisos };
  }
  /* CSV para o Excel em português: separador ";", vírgula decimal sem milhar, data
     dd/mm/aaaa, UTF-8 com BOM (acentos certos ao abrir). Linha de total no fim. */
  // Texto que começa com = + - @ vira fórmula no Excel (injeção em CSV): leva um apóstrofo.
  function celulaCsv(v, texto) {
    var s = String(v == null ? '' : v);
    if (texto && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function valorCsv(c) { if (c == null || c === '') return ''; var n = Math.round(num(c)), neg = n < 0; n = Math.abs(n); return (neg ? '-' : '') + Math.floor(n / 100) + ',' + String(n % 100).padStart(2, '0'); }
  function dataCsv(d) { var s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s; }
  function relatorioCsv(rel) {
    var cols = rel.colunas || [], out = [cols.map(function(c) { return celulaCsv(c.rotulo); }).join(';')];
    (rel.linhas || []).forEach(function(l) {
      out.push(cols.map(function(c) { var v = l[c.chave]; return celulaCsv(c.tipo === 'valor' ? valorCsv(v) : c.tipo === 'data' ? dataCsv(v) : v, c.tipo === 'texto'); }).join(';'));
    });
    if (Object.keys(rel.totais || {}).length) {
      out.push(cols.map(function(c, i) { return i === 0 ? 'Total' : c.tipo === 'valor' && rel.totais[c.chave] != null ? valorCsv(rel.totais[c.chave]) : ''; }).join(';'));
    }
    return '﻿' + out.join('\r\n') + '\r\n';
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

  /* ── Caixas e bancos (F6, 10/11/2026 — docs/financeiro-fase0-lacunas.md) ──
     Movimento de conta que não é baixa de título: tarifa, IOF, juros bancários,
     rendimento e transferência entre contas (suprimento e sangria do caixa são
     transferências). Só o servidor grava (fin/movimentos); erro se corrige com
     ESTORNO (registro inverso), nunca apagando. Caixa físico não fica negativo. */
  var TIPOS_CONTA = { BANCO: 'Banco', CAIXA: 'Caixa', APLICACAO: 'Aplicação' };
  var TIPOS_MOVIMENTO = {
    TARIFA: { sinal: -1, rotulo: 'Tarifa bancária' }, IOF: { sinal: -1, rotulo: 'IOF' },
    JUROS_BANCARIOS: { sinal: -1, rotulo: 'Juros bancários' }, RENDIMENTO: { sinal: 1, rotulo: 'Rendimento' },
    TRANSFERENCIA: { sinal: 0, rotulo: 'Transferência' }
  };
  function tipoConta(c) { return c && TIPOS_CONTA[c.tipo] ? c.tipo : 'BANCO'; }
  // Efeito de um movimento por conta, em centavos (estorno inverte o original).
  function efeitosMovimento(m) {
    if (!m) return {};
    var v = Math.round(num(m.valorCentavos)), inv = m.tipoRegistro === 'ESTORNO' ? -1 : 1, out = {};
    if (m.tipo === 'TRANSFERENCIA') { out[m.conta] = -v * inv; out[m.destino] = (out[m.destino] || 0) + v * inv; return out; }
    var t = TIPOS_MOVIMENTO[m.tipo]; if (!t) return {};
    out[m.conta] = t.sinal * v * inv;
    return out;
  }
  function validarMovimento(d, fin) {
    var x = d || {}, f = fin || {}, contas = f.contas_bancarias || {};
    if (!TIPOS_MOVIMENTO[x.tipo]) return { ok: false, motivo: 'Tipo de movimento inválido.' };
    var v = typeof x.valorCentavos === 'number' ? Math.round(x.valorCentavos) : centavos(x.valor);
    if (!(v > 0)) return { ok: false, motivo: 'Informe o valor.' };
    if (!dataOk(x.data)) return { ok: false, motivo: 'Data inválida.' };
    if (!x.conta || !contas[x.conta]) return { ok: false, motivo: 'Escolha a conta.' };
    if (x.tipo === 'TRANSFERENCIA') {
      if (!x.destino || !contas[x.destino]) return { ok: false, motivo: 'Escolha a conta de destino.' };
      if (x.destino === x.conta) return { ok: false, motivo: 'Origem e destino são a mesma conta.' };
    }
    var reg = { tipoRegistro: 'MOVIMENTO', tipo: x.tipo, conta: x.conta, destino: x.tipo === 'TRANSFERENCIA' ? x.destino : null,
      data: String(x.data).slice(0, 10), valorCentavos: v, historico: String(x.historico || '').trim().slice(0, 300) || TIPOS_MOVIMENTO[x.tipo].rotulo };
    var neg = caixaNegativo(f, reg);
    if (neg) return { ok: false, motivo: neg };
    return { ok: true, registro: reg };
  }
  /* Caixa físico não fica negativo (decisão conservadora da Fase 0, pergunta 5):
     aplicando o registro, nenhuma conta CAIXA pode terminar abaixo de zero. Banco pode
     (cheque especial). `registro` é movimento ou baixa ({conta, liquidoCentavos, tituloTipo}). */
  function caixaNegativo(fin, registro) {
    var f = fin || {}, contas = f.contas_bancarias || {}, efeito = {};
    if (ehAdiantamento(registro)) efeito = efeitosAdiantamento(registro);
    else if (registro.tipoRegistro) efeito = efeitosMovimento(registro);
    else if (registro.conta) efeito[registro.conta] = (registro.tituloTipo === 'RECEBER' ? 1 : -1) * (registro.tipo === 'ESTORNO' ? -1 : 1) * Math.round(num(registro.liquidoCentavos));
    var saldos = saldosBancarios(f, null), erro = null;
    Object.keys(efeito).forEach(function(k) {
      if (erro || tipoConta(contas[k]) !== 'CAIXA' || efeito[k] >= 0) return;
      var depois = ((saldos[k] || {}).saldoCentavos || 0) + efeito[k];
      if (depois < 0) erro = 'O caixa ' + (contas[k].nome || k) + ' ficaria negativo (saldo R$ ' + (((saldos[k] || {}).saldoCentavos || 0) / 100).toFixed(2).replace('.', ',') + '). Faça antes a transferência do banco para o caixa.';
    });
    return erro;
  }
  function validarEstornoMovimento(movs, id) {
    var m = (movs || {})[id];
    if (!m || m.tipoRegistro !== 'MOVIMENTO') return { ok: false, motivo: 'Movimento não encontrado.' };
    var ja = Object.keys(movs).some(function(k) { var x = movs[k]; return x && x.tipoRegistro === 'ESTORNO' && x.estorna === id; });
    if (ja) return { ok: false, motivo: 'Este movimento já foi estornado.' };
    return { ok: true, registro: Object.assign({}, m, { tipoRegistro: 'ESTORNO', estorna: id }) };
  }
  /* Extrato de uma conta: saldo anterior a `de`, linhas do período com saldo acumulado.
     Fontes: saldo inicial, baixas de títulos (com estornos) e movimentos (com estornos). */
  function extratoConta(fin, conta, de, ate) {
    var f = fin || {}, c = (f.contas_bancarias || {})[conta];
    if (!c) return { ok: false, motivo: 'Conta não encontrada.' };
    var linhas = [];
    if (c.dataSaldoInicial) linhas.push({ data: c.dataSaldoInicial, ordem: 0, tipo: 'SALDO_INICIAL', historico: 'Saldo inicial', valorCentavos: Math.round(num(c.saldoInicialCentavos)), ref: null });
    Object.keys(f.baixas || {}).forEach(function(k) {
      var x = f.baixas[k]; if (!x || x.conta !== conta) return;
      if (c.dataSaldoInicial && x.data < c.dataSaldoInicial) return;
      var t = (f.titulos || {})[x.titulo] || {}, sinal = (x.tituloTipo === 'RECEBER' ? 1 : -1) * (x.tipo === 'ESTORNO' ? -1 : 1);
      linhas.push({ data: x.data, ordem: 1, criado: String(x.criadoEm || ''), tipo: x.tipo === 'ESTORNO' ? 'ESTORNO_BAIXA' : 'BAIXA', valorCentavos: sinal * Math.round(num(x.liquidoCentavos)), ref: k, titulo: x.titulo,
        historico: (x.tipo === 'ESTORNO' ? 'Estorno: ' : '') + (x.tituloTipo === 'RECEBER' ? 'Recebimento ' : 'Pagamento ') + (t.documento || x.titulo) + (t.parceiro && t.parceiro.nome ? ' · ' + t.parceiro.nome : '') });
    });
    var estornados = {};
    Object.keys(f.movimentos || {}).forEach(function(k) { var m = f.movimentos[k]; if (m && m.tipoRegistro === 'ESTORNO') estornados[m.estorna] = k; });
    Object.keys(f.movimentos || {}).forEach(function(k) {
      var m = f.movimentos[k], ef = efeitosMovimento(m)[conta]; if (ef == null || !ef) return;
      if (c.dataSaldoInicial && m.data < c.dataSaldoInicial) return;
      var rot = (TIPOS_MOVIMENTO[m.tipo] || {}).rotulo || m.tipo, outra = m.tipo === 'TRANSFERENCIA' ? (m.conta === conta ? m.destino : m.conta) : null;
      linhas.push({ data: m.data, ordem: 1, criado: String(m.criadoEm || ''), tipo: m.tipoRegistro === 'ESTORNO' ? 'ESTORNO_MOVIMENTO' : 'MOVIMENTO', movimento: m.tipo, valorCentavos: ef, ref: k,
        estornavel: m.tipoRegistro === 'MOVIMENTO' && !estornados[k],
        historico: (m.tipoRegistro === 'ESTORNO' ? 'Estorno: ' : '') + rot + (outra ? (m.conta === conta ? ' para ' : ' de ') + (((f.contas_bancarias || {})[outra] || {}).nome || outra) : '') + (m.historico && m.historico !== rot ? ' · ' + m.historico : '') });
    });
    Object.keys(f.adiantamentos || {}).forEach(function(k) {
      var a = f.adiantamentos[k], ef = efeitosAdiantamento(a)[conta]; if (!ef) return;
      if (c.dataSaldoInicial && a.data < c.dataSaldoInicial) return;
      var est = a.tipoRegistro === 'ESTORNO', nomeP = (a.parceiro && a.parceiro.nome) || '';
      linhas.push({ data: a.data, ordem: 1, criado: String(a.criadoEm || ''), tipo: est ? 'ESTORNO_ADIANTAMENTO' : 'ADIANTAMENTO', valorCentavos: ef, ref: k, adiantamento: est ? a.estorna : k,
        historico: (est ? 'Estorno: ' : '') + (a.tipo === 'PAGAR' ? 'Adiantamento a ' : 'Adiantamento de ') + nomeP + (a.documento ? ' · ' + a.documento : '') });
    });
    // No mesmo dia: saldo inicial primeiro, depois na ordem em que foi lançado (como o extrato do banco).
    linhas.sort(function(a, b) { return String(a.data).localeCompare(String(b.data)) || a.ordem - b.ordem || String(a.criado || '').localeCompare(String(b.criado || '')) || String(a.ref).localeCompare(String(b.ref)); });
    var anterior = 0, saldo = 0, periodo = [], entradas = 0, saidas = 0;
    linhas.forEach(function(l) {
      if (de && l.data < de) { anterior += l.valorCentavos; return; }
      if (ate && l.data > ate) return;
      if (!periodo.length) saldo = anterior;
      saldo += l.valorCentavos;
      if (l.tipo !== 'SALDO_INICIAL') { if (l.valorCentavos > 0) entradas += l.valorCentavos; else saidas -= l.valorCentavos; }
      periodo.push(Object.assign({}, l, { saldoCentavos: saldo }));
    });
    return { ok: true, conta: conta, nome: c.nome || conta, tipo: tipoConta(c), saldoAnteriorCentavos: anterior, linhas: periodo,
      entradasCentavos: entradas, saidasCentavos: saidas, saldoFinalCentavos: periodo.length ? saldo : anterior };
  }

  /* ── Adiantamento a fornecedor e de cliente (Entrega B, 12/11/2026 —
     docs/superpowers/specs/2026-11-12-financeiro-entrega-b-design.md) ──
     O dinheiro sai (ou entra) na hora, sem título; depois COMPENSA um título do mesmo
     parceiro por uma baixa sem conta (forma ADIANTAMENTO), que não mexe no banco.
     Estorno do adiantamento só com o saldo integral (nada compensado). */
  function ehAdiantamento(r) { return !!r && (r.tipoRegistro === 'ADIANTAMENTO' || r.tipoRegistro === 'ESTORNO') && (r.tipo === 'PAGAR' || r.tipo === 'RECEBER'); }
  // O mesmo parceiro: pelo CNPJ/CPF quando há; senão pelo nome (maiúsculo, sem espaço nas pontas).
  function chaveParceiro(p) { var d = soDigitos(p && p.cnpj); return d.length >= 11 ? 'D' + d : 'N' + String((p && p.nome) || '').trim().toUpperCase(); }
  function efeitosAdiantamento(a) {
    if (!ehAdiantamento(a) || !a.conta) return {};
    var out = {}; out[a.conta] = (a.tipo === 'PAGAR' ? -1 : 1) * (a.tipoRegistro === 'ESTORNO' ? -1 : 1) * Math.round(num(a.valorCentavos));
    return out;
  }
  function saldosAdiantamentos(fin) {
    var f = fin || {}, ads = f.adiantamentos || {}, out = {};
    Object.keys(ads).forEach(function(k) {
      var a = ads[k]; if (!a || a.tipoRegistro !== 'ADIANTAMENTO') return;
      out[k] = { id: k, tipo: a.tipo, parceiro: a.parceiro || {}, conta: a.conta, data: a.data, documento: a.documento || null, historico: a.historico || null,
        valorCentavos: Math.round(num(a.valorCentavos)), compensadoCentavos: 0, saldoCentavos: 0, estornado: false };
    });
    Object.keys(ads).forEach(function(k) { var a = ads[k]; if (a && a.tipoRegistro === 'ESTORNO' && out[a.estorna]) out[a.estorna].estornado = true; });
    vals(f.baixas).forEach(function(x) {
      if (x.forma !== 'ADIANTAMENTO' || !out[x.adiantamento]) return;
      out[x.adiantamento].compensadoCentavos += (x.tipo === 'ESTORNO' ? -1 : 1) * Math.round(num(x.valorCentavos));
    });
    Object.keys(out).forEach(function(k) { var a = out[k]; a.saldoCentavos = a.estornado ? 0 : a.valorCentavos - a.compensadoCentavos; });
    return out;
  }
  /* d: {tipo PAGAR|RECEBER, parceiro (nome), cnpj?, parceiroKey?, conta, data, valorCentavos | valor, documento?, historico?} */
  function validarAdiantamento(d, fin) {
    var x = d || {}, f = fin || {}, tipo = String(x.tipo || '').toUpperCase();
    if (tipo !== 'PAGAR' && tipo !== 'RECEBER') return { ok: false, motivo: 'Tipo deve ser PAGAR (a fornecedor) ou RECEBER (de cliente).' };
    var nome = String(x.parceiro || '').trim();
    if (!nome) return { ok: false, motivo: 'Informe o ' + (tipo === 'PAGAR' ? 'fornecedor' : 'cliente') + '.' };
    if (!x.conta || !(f.contas_bancarias || {})[x.conta]) return { ok: false, motivo: 'Escolha a conta.' };
    if (!dataOk(x.data)) return { ok: false, motivo: 'Data inválida.' };
    var v = typeof x.valorCentavos === 'number' ? Math.round(x.valorCentavos) : centavos(x.valor);
    if (!(v > 0)) return { ok: false, motivo: 'Informe o valor.' };
    var reg = { tipoRegistro: 'ADIANTAMENTO', tipo: tipo, parceiro: { tipo: tipo === 'PAGAR' ? 'FORNECEDOR' : 'CLIENTE', key: x.parceiroKey || null, nome: nome.slice(0, 120), cnpj: String(x.cnpj || '').trim() || null },
      conta: x.conta, data: String(x.data).slice(0, 10), valorCentavos: v, documento: String(x.documento || '').trim().slice(0, 60) || null,
      historico: String(x.historico || '').trim().slice(0, 300) || null, versao: VERSAO };
    var neg = caixaNegativo(f, reg);
    if (neg) return { ok: false, motivo: neg };
    return { ok: true, registro: reg };
  }
  function validarEstornoAdiantamento(fin, id) {
    var f = fin || {}, a = (f.adiantamentos || {})[id], s = saldosAdiantamentos(f)[id];
    if (!a || a.tipoRegistro !== 'ADIANTAMENTO' || !s) return { ok: false, motivo: 'Adiantamento não encontrado.' };
    if (s.estornado) return { ok: false, motivo: 'Este adiantamento já foi estornado.' };
    if (s.compensadoCentavos !== 0) return { ok: false, motivo: 'Já há compensação com este adiantamento: estorne a compensação no título antes.' };
    var reg = Object.assign({}, a, { tipoRegistro: 'ESTORNO', estorna: id });
    var neg = caixaNegativo(f, reg);
    if (neg) return { ok: false, motivo: neg };
    return { ok: true, registro: reg };
  }
  /* sit: situação do título (carteira); ad: item de saldosAdiantamentos; d: {data, valorCentavos} */
  function validarCompensacao(sit, ad, d) {
    var x = d || {};
    if (!sit) return { ok: false, motivo: 'Título não encontrado.' };
    if (!ad) return { ok: false, motivo: 'Adiantamento não encontrado.' };
    if (ad.estornado) return { ok: false, motivo: 'Adiantamento estornado.' };
    if (ad.tipo !== sit.titulo.tipo) return { ok: false, motivo: ad.tipo === 'PAGAR' ? 'Adiantamento a fornecedor só compensa título a pagar.' : 'Adiantamento de cliente só compensa título a receber.' };
    if (chaveParceiro(ad.parceiro) !== chaveParceiro(sit.titulo.parceiro)) return { ok: false, motivo: 'O adiantamento é de outro ' + (ad.tipo === 'PAGAR' ? 'fornecedor' : 'cliente') + ' (confira nome e CNPJ).' };
    if (sit.bloqueio && sit.titulo.tipo === 'PAGAR') return { ok: false, motivo: 'Título bloqueado para pagamento: ' + (sit.bloqueio.motivo || 'sem motivo') + '.' };
    var v = Math.round(num(x.valorCentavos));
    if (!(v > 0)) return { ok: false, motivo: 'Informe o valor a compensar.' };
    if (v > ad.saldoCentavos) return { ok: false, motivo: 'O adiantamento só tem R$ ' + (ad.saldoCentavos / 100).toFixed(2).replace('.', ',') + ' disponível.' };
    if (v > sit.saldoCentavos) return { ok: false, motivo: 'A compensação passa do saldo do título (R$ ' + (sit.saldoCentavos / 100).toFixed(2).replace('.', ',') + ').' };
    if (!dataOk(x.data)) return { ok: false, motivo: 'Data inválida.' };
    if (String(x.data).slice(0, 10) < String(ad.data).slice(0, 10)) return { ok: false, motivo: 'A compensação não pode ser antes do adiantamento.' };
    return { ok: true, registro: { tipo: 'BAIXA', forma: 'ADIANTAMENTO', adiantamento: ad.id, titulo: sit.id, tituloTipo: sit.titulo.tipo, data: String(x.data).slice(0, 10),
      valorCentavos: v, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, variacaoCambialCentavos: 0, liquidoCentavos: v, conta: null,
      natureza: sit.titulo.natureza || null, origemTitulo: sit.titulo.origem || null } };
  }

  /* ── Renegociação e cancelamento em lote (Entrega B, 12/11/2026) ──
     O título nunca muda: o saldo dos originais é ABATIDO (motivo RENEGOCIACAO ou
     CANCELAMENTO) e a renegociação cria um título NOVO com o total. Desfazer grava
     abatimento negativo de mesmo grupo e marca o registro; nada se apaga. */
  function emLoteAguardando(fin) {
    var out = {}, ls = (fin || {}).lotes_pagamento || {};
    Object.keys(ls).forEach(function(k) { var l = ls[k]; if (l && l.status === 'AGUARDANDO') Object.keys(l.titulos || {}).forEach(function(t) { out[t] = k; }); });
    return out;
  }
  function textoMin(s, n) { return String(s || '').trim().length >= n; }
  // Situações dos títulos pedidos, com as recusas comuns (inexistente, repetido, sem saldo, em lote, tipo/parceiro diferente).
  function selecionarTitulos(fin, ids, mesmoParceiro) {
    var lista = Array.isArray(ids) ? ids.map(String) : [];
    if (!lista.length) return { ok: false, motivo: 'Selecione ao menos um título.' };
    if (lista.length > 200) return { ok: false, motivo: 'No máximo 200 títulos por vez.' };
    var vistos = {}, porId = {}, lote = emLoteAguardando(fin), sits = [];
    carteira(fin).forEach(function(s) { porId[s.id] = s; });
    for (var i = 0; i < lista.length; i++) {
      var id = lista[i], s = porId[id];
      if (vistos[id]) return { ok: false, motivo: 'O título ' + id + ' foi escolhido duas vezes.' };
      vistos[id] = true;
      if (!s) return { ok: false, motivo: 'Título ' + id + ' não encontrado.' };
      var nome = s.titulo.documento || id;
      if (!(s.saldoCentavos > 0)) return { ok: false, motivo: nome + ' não tem saldo em aberto.' };
      if (lote[id]) return { ok: false, motivo: nome + ' está num lote de pagamento aguardando aprovação: recuse o lote antes.' };
      if (sits.length && s.titulo.tipo !== sits[0].titulo.tipo) return { ok: false, motivo: 'Não misture títulos a pagar e a receber.' };
      if (mesmoParceiro && sits.length && chaveParceiro(s.titulo.parceiro) !== chaveParceiro(sits[0].titulo.parceiro)) return { ok: false, motivo: 'Renegociação é de um parceiro só (' + nome + ' é de outro).' };
      sits.push(s);
    }
    return { ok: true, sits: sits };
  }
  /* d: {titulos: [ids], data, condicao? | vencimento?, acrescimoCentavos?, descontoCentavos?, motivo} */
  function montarRenegociacao(fin, d, chave) {
    var x = d || {}, sel = selecionarTitulos(fin, x.titulos, true);
    if (!sel.ok) return sel;
    if (!dataOk(x.data)) return { ok: false, motivo: 'Data inválida.' };
    if (!textoMin(x.motivo, 5)) return { ok: false, motivo: 'Explique o motivo da renegociação.' };
    var a = Math.round(num(x.acrescimoCentavos)), dsc = Math.round(num(x.descontoCentavos));
    if (a < 0 || dsc < 0) return { ok: false, motivo: 'Acréscimo e desconto não podem ser negativos.' };
    var sits = sel.sits, S = sits.reduce(function(t, s) { return t + s.saldoCentavos; }, 0);
    if (dsc >= S) return { ok: false, motivo: 'O desconto não pode zerar a dívida: para isso, cancele.' };
    var data = String(x.data).slice(0, 10), venc = x.vencimento ? String(x.vencimento).slice(0, 10) : null, cond = null;
    if (venc) { if (!dataOk(venc)) return { ok: false, motivo: 'Vencimento inválido.' }; }
    else {
      if (!String(x.condicao || '').trim()) return { ok: false, motivo: 'Informe a nova condição (ex.: 30/60) ou o vencimento.' };
      cond = normalizarCondicao(x.condicao);
      if (!cond) return { ok: false, motivo: 'Condição: ' + lerCondicao(x.condicao).motivo };
    }
    var V = S + a - dsc, rn = 'RN_' + chave, novo = 'RNG_' + chave, ref = 'fin/renegociacoes/' + rn;
    var maior = sits.slice().sort(function(p, q) { return q.saldoCentavos - p.saldoCentavos; })[0].titulo;
    // Natureza na proporção do saldo de cada original (o recebimento já vem dividido em porNatureza).
    var pn = {};
    sits.forEach(function(s) {
      var t = s.titulo, partes = t.porNatureza && Object.keys(t.porNatureza).length > 1 ? t.porNatureza : null;
      if (!partes) { pn[t.natureza || 'OUTROS'] = (pn[t.natureza || 'OUTROS'] || 0) + s.saldoCentavos; return; }
      var ks = Object.keys(partes).sort(), base = ks.reduce(function(t2, k) { return t2 + num(partes[k]); }, 0), usado = 0;
      ks.forEach(function(k, i) { var v = i === ks.length - 1 ? s.saldoCentavos - usado : Math.round(s.saldoCentavos * num(partes[k]) / base); usado += v; pn[k] = (pn[k] || 0) + v; });
    });
    var titulo = { tipo: maior.tipo, origem: { tipo: 'RENEGOCIACAO', ref: ref, titulos: sits.map(function(s) { return s.id; }) },
      parceiro: Object.assign({}, maior.parceiro), documento: ('Reneg. ' + sits.map(function(s) { return s.titulo.documento || s.id; }).join(', ')).slice(0, 60),
      emissao: data, competencia: data.slice(0, 7), valorCentavos: V, moeda: 'BRL', natureza: maior.natureza || 'OUTROS',
      porNatureza: Object.keys(pn).length > 1 ? pn : null, centroCusto: maior.centroCusto || null, condicao: cond, vencimentoFixo: venc,
      baseVencimento: data, historico: String(x.motivo).trim().slice(0, 300), versao: VERSAO };
    if (!venc && !parcelas(cond, data, V).ok) return { ok: false, motivo: 'Condição: ' + parcelas(cond, data, V).motivo };
    var tits = {}, abat = {};
    sits.forEach(function(s) { tits[s.id] = s.saldoCentavos; abat[rn + '_' + san(s.id)] = { titulo: s.id, motivo: 'RENEGOCIACAO', valorCentavos: s.saldoCentavos, data: data, ref: ref }; });
    return { ok: true, titulo: titulo, abatimentos: abat,
      registro: { tipo: maior.tipo, parceiro: Object.assign({}, maior.parceiro), titulos: tits, novoTitulo: novo, acrescimoCentavos: a, descontoCentavos: dsc,
        valorNovoCentavos: V, data: data, motivo: String(x.motivo).trim().slice(0, 300), condicao: cond, vencimento: venc, status: 'ATIVA', versao: VERSAO } };
  }
  function montarDesfazerRenegociacao(fin, rnId, d) {
    var f = fin || {}, x = d || {}, rn = (f.renegociacoes || {})[rnId];
    if (!rn) return { ok: false, motivo: 'Renegociação não encontrada.' };
    if (rn.status !== 'ATIVA') return { ok: false, motivo: 'Esta renegociação já foi desfeita.' };
    if (!textoMin(x.motivo, 5)) return { ok: false, motivo: 'Explique por que desfazer.' };
    if (!dataOk(x.data)) return { ok: false, motivo: 'Data inválida.' };
    var mv = movimentosPorTitulo(f)[rn.novoTitulo] || { pago: 0, abatido: 0 };
    if (mv.pago !== 0 || mv.abatido !== 0) return { ok: false, motivo: 'O título novo já tem baixa ou abatimento: estorne antes de desfazer.' };
    var data = String(x.data).slice(0, 10), ref = 'fin/renegociacoes/' + rnId, abat = {};
    abat[rnId + '_desf_novo'] = { titulo: rn.novoTitulo, motivo: 'RENEGOCIACAO_DESFEITA', valorCentavos: Math.round(num(rn.valorNovoCentavos)), data: data, ref: ref };
    Object.keys(rn.titulos || {}).forEach(function(t) { abat[rnId + '_desf_' + san(t)] = { titulo: t, motivo: 'RENEGOCIACAO_DESFEITA', valorCentavos: -Math.round(num(rn.titulos[t])), data: data, ref: ref }; });
    return { ok: true, abatimentos: abat, status: 'DESFEITA', motivoDesfazer: String(x.motivo).trim().slice(0, 300) };
  }
  // Pode cancelar? Engano desfaz receita/despesa; incobrável vira perda (só a receber).
  function podeCancelar(sit, motivo) {
    if (!sit) return { ok: false, motivo: 'Título não encontrado.' };
    var t = sit.titulo, o = (t.origem || {}).tipo, nome = t.documento || sit.id;
    if (motivo !== 'ENGANO' && motivo !== 'INCOBRAVEL') return { ok: false, motivo: 'Escolha o motivo: emitido por engano ou incobrável.' };
    if (!(sit.saldoCentavos > 0)) return { ok: false, motivo: nome + ' não tem saldo em aberto.' };
    if (t.tipo === 'PAGAR') {
      if (motivo === 'INCOBRAVEL') return { ok: false, motivo: 'Incobrável é só para título a receber.' };
      if (o !== 'MANUAL' && o !== 'IMPORTACAO') return { ok: false, motivo: nome + ': a pagar que veio do ' + (o === 'RECEBIMENTO' ? 'recebimento se cancela em Compras (cancelamento do recebimento)' : o === 'RENEGOCIACAO' ? 'renegociação se desfaz na própria renegociação' : 'fato de origem se corrige na origem') + '.' };
    }
    if (t.tipo === 'RECEBER' && motivo === 'ENGANO') {
      if (o === 'NF_SAIDA') return { ok: false, motivo: nome + ': nota emitida por engano se cancela no Faturamento; aqui só como incobrável.' };
      if (o === 'RENEGOCIACAO') return { ok: false, motivo: nome + ': renegociação errada se desfaz na própria renegociação.' };
    }
    return { ok: true };
  }
  /* d: {titulos: [ids], data, motivo ENGANO|INCOBRAVEL, justificativa} */
  function montarCancelamento(fin, d, chave) {
    var x = d || {}, sel = selecionarTitulos(fin, x.titulos, false);
    if (!sel.ok) return sel;
    if (!dataOk(x.data)) return { ok: false, motivo: 'Data inválida.' };
    if (!textoMin(x.justificativa, 10)) return { ok: false, motivo: 'Escreva a justificativa (ao menos 10 letras): ela fica no histórico.' };
    for (var i = 0; i < sel.sits.length; i++) { var p = podeCancelar(sel.sits[i], x.motivo); if (!p.ok) return p; }
    var cn = 'CN_' + chave, ref = 'fin/cancelamentos/' + cn, data = String(x.data).slice(0, 10), tits = {}, abat = {};
    sel.sits.forEach(function(s) { tits[s.id] = s.saldoCentavos; abat[cn + '_' + san(s.id)] = { titulo: s.id, motivo: 'CANCELAMENTO', tipoCancelamento: x.motivo, valorCentavos: s.saldoCentavos, data: data, ref: ref }; });
    return { ok: true, abatimentos: abat, registro: { tipo: sel.sits[0].titulo.tipo, titulos: tits, motivo: x.motivo, justificativa: String(x.justificativa).trim().slice(0, 300),
      data: data, status: 'ATIVO', versao: VERSAO } };
  }
  function montarDesfazerCancelamento(fin, cnId, d) {
    var f = fin || {}, x = d || {}, cn = (f.cancelamentos || {})[cnId];
    if (!cn) return { ok: false, motivo: 'Cancelamento não encontrado.' };
    if (cn.status !== 'ATIVO') return { ok: false, motivo: 'Este cancelamento já foi desfeito.' };
    if (!textoMin(x.motivo, 5)) return { ok: false, motivo: 'Explique por que desfazer.' };
    if (!dataOk(x.data)) return { ok: false, motivo: 'Data inválida.' };
    var data = String(x.data).slice(0, 10), ref = 'fin/cancelamentos/' + cnId, abat = {};
    Object.keys(cn.titulos || {}).forEach(function(t) { abat[cnId + '_desf_' + san(t)] = { titulo: t, motivo: 'CANCELAMENTO_DESFEITO', valorCentavos: -Math.round(num(cn.titulos[t])), data: data, ref: ref }; });
    return { ok: true, abatimentos: abat, status: 'DESFEITO', motivoDesfazer: String(x.motivo).trim().slice(0, 300) };
  }

  /* ── F9 (12/11/2026): elementos de custo, classificação, liquidação e aberturas do caixa ──
     docs/superpowers/specs/2026-11-12-financeiro-f9-design.md. Elemento = "o nome da conta";
     cada um pertence a uma natureza (que liga à Controladoria e ao DFC por atividade) e a um
     grupo › subgrupo (DFC por elemento). O título não muda: a classificação (elemento, rateio
     entre centros, forma de pagamento) é registro à parte em fin/classificacoes/{titulo}. */
  var GRUPOS_ELEMENTO = { '1': 'Receitas operacionais', '2': 'Custos de produção', '3': 'Despesas operacionais', '4': 'Financeiro', '9': 'A classificar' };
  function el9(nome, grupo, subgrupo, natureza) { return { nome: nome, grupo: grupo, subgrupo: subgrupo, natureza: natureza }; }
  // Proposta: os códigos que o vídeo do WebMais mostra (408, 004, 1101, 1103, 2113) + os demais.
  var ELEMENTOS_PADRAO = {
    '101': el9('Venda de produtos', '1', 'Vendas', 'RECEITA_VENDA'), '102': el9('Serviço de envase e industrialização', '1', 'Vendas', 'RECEITA_VENDA'),
    '103': el9('Outras receitas', '1', 'Outras receitas', 'OUTRAS_RECEITAS'),
    '201': el9('Matéria-prima', '2', 'Materiais', 'MATERIA_PRIMA'), '202': el9('Embalagem', '2', 'Materiais', 'EMBALAGEM'),
    '203': el9('Material de uso e consumo', '2', 'Materiais', 'USO_E_CONSUMO'), '204': el9('Frete sobre compras', '2', 'Materiais', 'FRETE'),
    '1101': el9('Adiantamento salarial', '2', 'Mão de obra', 'FOLHA'), '1102': el9('Salários', '2', 'Mão de obra', 'FOLHA'),
    '1103': el9('Adiantamento 13º', '2', 'Mão de obra', 'FOLHA'), '1104': el9('Encargos e benefícios', '2', 'Mão de obra', 'FOLHA'),
    '1105': el9('Participação nos resultados (PLR)', '2', 'Mão de obra', 'PLR'),
    '205': el9('Custos fixos de produção', '2', 'Custos fixos de produção', 'CUSTO_FIXO_PRODUCAO'), '206': el9('Manutenção de máquinas', '2', 'Custos fixos de produção', 'CUSTO_FIXO_PRODUCAO'),
    '2113': el9('Aluguel', '3', 'Administrativas', 'CUSTO_FIXO_ADM'), '301': el9('Serviços e despesas administrativas', '3', 'Administrativas', 'CUSTO_FIXO_ADM'),
    '302': el9('Material de escritório', '3', 'Administrativas', 'CUSTO_FIXO_ADM'), '303': el9('Telefone e internet', '3', 'Administrativas', 'CUSTO_FIXO_ADM'),
    '304': el9('Contabilidade e honorários', '3', 'Administrativas', 'CUSTO_FIXO_ADM'),
    '305': el9('Despesas comerciais', '3', 'Comerciais', 'DESPESA_COMERCIAL'), '306': el9('Frete sobre vendas', '3', 'Comerciais', 'DESPESA_COMERCIAL'),
    '307': el9('Impostos e taxas', '3', 'Impostos e taxas', 'IMPOSTOS'),
    '401': el9('Juros e multas pagos', '4', 'Resultado financeiro', 'RESULTADO_FINANCEIRO'), '402': el9('Tarifas bancárias e IOF', '4', 'Resultado financeiro', 'RESULTADO_FINANCEIRO'),
    '403': el9('Rendimentos e descontos obtidos', '4', 'Resultado financeiro', 'RESULTADO_FINANCEIRO'),
    '004': el9('Adiantamento', '4', 'Adiantamentos', 'ADIANTAMENTOS'),
    '408': el9('A definir', '9', 'A classificar', 'OUTROS')
  };
  var ELEMENTO_DA_NATUREZA = { RECEITA_VENDA: '101', OUTRAS_RECEITAS: '103', MATERIA_PRIMA: '201', EMBALAGEM: '202', USO_E_CONSUMO: '203', FRETE: '204', FOLHA: '1102',
    PLR: '1105', CUSTO_FIXO_PRODUCAO: '205', CUSTO_FIXO_ADM: '301', DESPESA_COMERCIAL: '305', IMPOSTOS: '307', OUTROS: '408', RESULTADO_FINANCEIRO: '401', ADIANTAMENTOS: '004' };
  var FORMAS_PAGAMENTO = { PIX: 'PIX', BOLETO: 'Boleto', TED: 'TED/DOC', DINHEIRO: 'Dinheiro', CARTAO: 'Cartão', DEBITO_AUTOMATICO: 'Débito automático', CHEQUE: 'Cheque', OUTRA: 'Outra' };
  var NATUREZAS_ELEMENTO = NATUREZAS.concat(['RESULTADO_FINANCEIRO', 'ADIANTAMENTOS']);
  function elementoDaNatureza(nat) { return ELEMENTO_DA_NATUREZA[nat] || '408'; }
  function elementos(fin) {
    var out = {}, cad = (fin || {}).elementos || {};
    Object.keys(ELEMENTOS_PADRAO).forEach(function(k) { out[k] = Object.assign({ codigo: k, ativo: true, padrao: true }, ELEMENTOS_PADRAO[k]); });
    Object.keys(cad).forEach(function(k) { var x = cad[k]; if (x && x.nome) out[k] = Object.assign({}, out[k] || { padrao: false }, x, { codigo: k, ativo: x.ativo !== false }); });
    return out;
  }
  /* d: {codigo, nome, grupo, subgrupo, natureza, ativo?} */
  function validarElemento(d, fin) {
    var x = d || {}, cod = String(x.codigo || '').trim().toUpperCase(), nome = String(x.nome || '').trim();
    if (!/^[0-9A-Z]{1,8}$/.test(cod)) return { ok: false, motivo: 'Código do elemento: de 1 a 8 letras ou números.' };
    if (!nome) return { ok: false, motivo: 'Informe o nome do elemento.' };
    if (!GRUPOS_ELEMENTO[x.grupo]) return { ok: false, motivo: 'Grupo inválido.' };
    if (NATUREZAS_ELEMENTO.indexOf(x.natureza) < 0) return { ok: false, motivo: 'Natureza inválida: ela liga o elemento à Controladoria e ao DFC.' };
    return { ok: true, registro: { codigo: cod, nome: nome.slice(0, 80), grupo: x.grupo, subgrupo: String(x.subgrupo || GRUPOS_ELEMENTO[x.grupo]).trim().slice(0, 60), natureza: x.natureza, ativo: x.ativo !== false } };
  }
  /* sit: situação do título; d: {elemento, formaPagamento?, rateio?: [{centro, percentual}]} */
  function validarClassificacao(sit, d, fin) {
    var x = d || {}, els = elementos(fin);
    if (!sit) return { ok: false, motivo: 'Título não encontrado.' };
    var cod = String(x.elemento || '').trim().toUpperCase(), el = els[cod];
    if (!el) return { ok: false, motivo: 'Elemento não encontrado no plano.' };
    if (!el.ativo) return { ok: false, motivo: 'Elemento inativo.' };
    if (NATUREZAS.indexOf(el.natureza) < 0) return { ok: false, motivo: 'O elemento ' + cod + ' não classifica título (é de movimento financeiro ou adiantamento).' };
    var receita = el.natureza === 'RECEITA_VENDA' || el.natureza === 'OUTRAS_RECEITAS';
    if (receita !== (sit.titulo.tipo === 'RECEBER')) return { ok: false, motivo: sit.titulo.tipo === 'RECEBER' ? 'Título a receber pede elemento de receita.' : 'Elemento de receita não classifica título a pagar.' };
    var forma = String(x.formaPagamento || '').trim().toUpperCase();
    if (forma && !FORMAS_PAGAMENTO[forma]) return { ok: false, motivo: 'Forma de pagamento inválida.' };
    var rat = Array.isArray(x.rateio) ? x.rateio : [], vistos = {}, soma = 0, out = [];
    if (rat.length > 20) return { ok: false, motivo: 'No máximo 20 centros no rateio.' };
    for (var i = 0; i < rat.length; i++) {
      var c = String((rat[i] || {}).centro || '').trim(), pc = Math.round(num(rat[i].percentual) * 100) / 100;
      if (!/^[A-Z0-9_]{1,40}$/.test(c)) return { ok: false, motivo: 'Centro de custo inválido: ' + c.slice(0, 40) + '.' };
      if (vistos[c]) return { ok: false, motivo: 'O centro ' + c + ' aparece duas vezes no rateio.' };
      if (!(pc > 0) || pc > 100) return { ok: false, motivo: 'Percentual do rateio entre 0 e 100.' };
      vistos[c] = true; soma += pc; out.push({ centro: c, percentual: pc });
    }
    if (out.length && Math.abs(soma - 100) > 0.001) return { ok: false, motivo: 'O rateio soma ' + String(Math.round(soma * 100) / 100).replace('.', ',') + '%: precisa dar 100%.' };
    return { ok: true, registro: { elemento: cod, formaPagamento: forma || null, rateio: out.length ? out : null, versao: VERSAO } };
  }
  // Elemento, forma e rateio que valem para o título: classificação > o que o título trouxe > natureza.
  function classificacaoEfetiva(fin, id) {
    var f = fin || {}, t = (f.titulos || {})[id] || {}, c = (f.classificacoes || {})[id];
    if (c && c.elemento) return { elemento: c.elemento, formaPagamento: c.formaPagamento || t.formaPagamento || null, rateio: c.rateio || null, fonte: 'CLASSIFICACAO' };
    if (t.elemento) return { elemento: t.elemento, formaPagamento: t.formaPagamento || null, rateio: null, fonte: 'TITULO' };
    return { elemento: null, formaPagamento: t.formaPagamento || null, rateio: null, fonte: 'NATUREZA' };
  }
  function repartir(valor, pesos) { // centavos inteiros com sinal; a última fatia absorve o resto
    var base = pesos.reduce(function(a, w) { return a + w; }, 0), usado = 0;
    return pesos.map(function(w, i) { var v = i === pesos.length - 1 ? valor - usado : Math.round(valor * w / base); usado += v; return v; });
  }
  /* Partes de um valor do título por elemento × centro: [{elemento, natureza, centro, valorCentavos}]. */
  function partesDoTitulo(fin, id, valor) {
    var f = fin || {}, t = (f.titulos || {})[id] || {}, ce = classificacaoEfetiva(f, id), els = elementos(f), v = Math.round(num(valor));
    if (ce.elemento) {
      var e = els[ce.elemento] || {}, nat = e.natureza || t.natureza || 'OUTROS', rat = ce.rateio && ce.rateio.length ? ce.rateio : [{ centro: t.centroCusto || null, percentual: 100 }];
      var vs = repartir(v, rat.map(function(r) { return num(r.percentual); }));
      return rat.map(function(r, i) { return { elemento: ce.elemento, natureza: nat, centro: r.centro || null, valorCentavos: vs[i] }; });
    }
    var pn = t.porNatureza, ks = pn ? Object.keys(pn).filter(function(k) { return num(pn[k]) > 0; }).sort() : [];
    if (ks.length < 2) return [{ elemento: elementoDaNatureza(t.natureza || 'OUTROS'), natureza: t.natureza || 'OUTROS', centro: t.centroCusto || null, valorCentavos: v }];
    var vs2 = repartir(v, ks.map(function(k) { return num(pn[k]); }));
    return ks.map(function(k, i) { return { elemento: elementoDaNatureza(k), natureza: k, centro: t.centroCusto || null, valorCentavos: vs2[i] }; });
  }
  /* Realizado por elemento (DFC por elemento e fluxo por grupo). Principal da baixa no elemento do
     título; juros e multa no 401; desconto no 403; tarifa/IOF no 402; juros bancários no 401;
     rendimento no 403; adiantamento no 004; transferência fora. Soma = fluxosRealizados sem transferência. */
  function fluxosRealizadosPorElemento(fin) {
    var f = fin || {}, out = [];
    vals(f.baixas).forEach(function(x) {
      if (!x.conta || !x.data) return;
      var sg = (x.tituloTipo === 'RECEBER' ? 1 : -1) * (x.tipo === 'ESTORNO' ? -1 : 1);
      partesDoTitulo(f, x.titulo, sg * Math.round(num(x.valorCentavos))).forEach(function(pt) { out.push({ conta: x.conta, data: x.data, elemento: pt.elemento, natureza: pt.natureza, valorCentavos: pt.valorCentavos }); });
      var jm = Math.round(num(x.jurosCentavos)) + Math.round(num(x.multaCentavos)), ds = Math.round(num(x.descontoCentavos));
      if (jm) out.push({ conta: x.conta, data: x.data, elemento: '401', natureza: 'RESULTADO_FINANCEIRO', valorCentavos: sg * jm });
      if (ds) out.push({ conta: x.conta, data: x.data, elemento: '403', natureza: 'RESULTADO_FINANCEIRO', valorCentavos: -sg * ds });
    });
    vals(f.movimentos).forEach(function(m) {
      if (!m.data || m.tipo === 'TRANSFERENCIA') return;
      var cod = m.tipo === 'RENDIMENTO' ? '403' : m.tipo === 'JUROS_BANCARIOS' ? '401' : '402', ef = efeitosMovimento(m);
      Object.keys(ef).forEach(function(c) { if (ef[c]) out.push({ conta: c, data: m.data, elemento: cod, natureza: 'RESULTADO_FINANCEIRO', valorCentavos: ef[c] }); });
    });
    vals(f.adiantamentos).forEach(function(a) {
      var ef = efeitosAdiantamento(a); if (!a.data) return;
      Object.keys(ef).forEach(function(c) { if (ef[c]) out.push({ conta: c, data: a.data, elemento: '004', natureza: 'ADIANTAMENTOS', valorCentavos: ef[c] }); });
    });
    return out;
  }
  /* DFC realizado aberto por grupo › subgrupo › elemento (CR-03). Saldos e conferência são os do DFC por atividade. */
  function dfcElementos(fin, deMes, ateMes) {
    var f = fin || {}, d = dfc(f, deMes, ateMes); if (!d.ok) return d;
    var els = elementos(f), meses = d.meses, gs = {};
    fluxosRealizadosPorElemento(f).forEach(function(x) {
      var mes = String(x.data).slice(0, 7); if (meses.indexOf(mes) < 0) return;
      var conta = (f.contas_bancarias || {})[x.conta];
      if (!conta || (conta.dataSaldoInicial && x.data < conta.dataSaldoInicial)) return;
      var e = els[x.elemento] || { grupo: '9', subgrupo: 'A classificar', nome: x.elemento }, gk = e.grupo || '9', sk = e.subgrupo || '—';
      var g = gs[gk] = gs[gk] || { grupo: gk, rotulo: GRUPOS_ELEMENTO[gk] || gk, sub: {} };
      var sg = g.sub[sk] = g.sub[sk] || { subgrupo: sk, els: {} };
      var le = sg.els[x.elemento] = sg.els[x.elemento] || { elemento: x.elemento, nome: e.nome || x.elemento, meses: {} };
      meses.forEach(function(m) { if (le.meses[m] == null) le.meses[m] = 0; });
      le.meses[mes] += x.valorCentavos;
    });
    var grupos = Object.keys(gs).sort().map(function(gk) {
      var g = gs[gk], tot = {};
      var subgrupos = Object.keys(g.sub).sort().map(function(sk) {
        var sg = g.sub[sk], st = {};
        var elsL = Object.keys(sg.els).sort().map(function(k) { return sg.els[k]; });
        meses.forEach(function(m) { st[m] = elsL.reduce(function(a, l) { return a + l.meses[m]; }, 0); });
        return { subgrupo: sk, elementos: elsL, totais: st };
      });
      meses.forEach(function(m) { tot[m] = subgrupos.reduce(function(a, sg) { return a + sg.totais[m]; }, 0); });
      return { grupo: gk, rotulo: g.rotulo, subgrupos: subgrupos, totais: tot };
    });
    var colunas = d.colunas.map(function(c) {
      var varEl = grupos.reduce(function(a, g) { return a + g.totais[c.mes]; }, 0), sf = c.saldoInicialCentavos + c.aberturaContasCentavos + varEl;
      return Object.assign({}, c, { variacaoCentavos: varEl, saldoFinalCentavos: sf, diferencaCentavos: c.saldoFinalBancosCentavos - sf, confere: c.saldoFinalBancosCentavos === sf });
    });
    return { ok: true, meses: meses, colunas: colunas, grupos: grupos };
  }
  /* Liquidação por filtro (CB-06/07): parcelas abertas. f: {tipo, de?, ate?, q?, elemento?, hoje} */
  function parcelasParaLiquidar(fin, f) {
    var o = f || {}, tipo = o.tipo === 'RECEBER' ? 'RECEBER' : 'PAGAR', q = String(o.q || '').trim().toUpperCase(), out = [];
    carteira(fin).forEach(function(s) {
      var t = s.titulo;
      if (t.tipo !== tipo || s.saldoCentavos <= 0 || s.semVencimento) return;
      if (q && [t.documento, t.parceiro && t.parceiro.nome, t.parceiro && t.parceiro.cnpj, s.id].join(' ').toUpperCase().indexOf(q) < 0) return;
      var partes = partesDoTitulo(fin, s.id, s.saldoCentavos), cods = partes.map(function(x) { return x.elemento; });
      if (o.elemento && cods.indexOf(o.elemento) < 0) return;
      s.abertas.forEach(function(p) {
        if ((o.de && p.vencimento < o.de) || (o.ate && p.vencimento > o.ate)) return;
        out.push({ titulo: s.id, n: p.n, de: p.de, parceiro: (t.parceiro && t.parceiro.nome) || '', documento: t.documento || s.id, emissao: t.emissao || null, vencimento: p.vencimento,
          dias: o.hoje ? Math.max(0, diffDias(o.hoje, p.vencimento)) : 0, valorCentavos: p.valorCentavos, abertoCentavos: p.abertoCentavos,
          elemento: cods[0] || null, bloqueado: !!(s.bloqueio && tipo === 'PAGAR') });
      });
    });
    out.sort(function(a, b) { return String(a.vencimento).localeCompare(String(b.vencimento)) || a.parceiro.localeCompare(b.parceiro) || a.n - b.n; });
    return out;
  }
  /* d: {itens: [{titulo, valorCentavos}], data, conta} -> uma baixa por título (parcelas somadas). */
  function montarLiquidacao(fin, d) {
    var f = fin || {}, x = d || {}, itens = Array.isArray(x.itens) ? x.itens : [];
    if (!itens.length) return { ok: false, motivo: 'Marque ao menos uma parcela.' };
    if (itens.length > 500) return { ok: false, motivo: 'No máximo 500 parcelas por vez.' };
    var soma = {}, ordem = [];
    itens.forEach(function(i) { var k = String((i || {}).titulo || ''); if (!(k in soma)) { soma[k] = 0; ordem.push(k); } soma[k] += Math.round(num(i.valorCentavos)); });
    var porId = {}; carteira(f).forEach(function(s) { porId[s.id] = s; });
    var bloq = f.bloqueios || {}, tipo = null, baixas = [], total = 0;
    for (var i = 0; i < ordem.length; i++) {
      var id = ordem[i], sit = porId[id];
      if (sit) sit.bloqueio = bloq[id] && bloq[id].ativo !== false ? bloq[id] : null;
      if (sit && tipo && sit.titulo.tipo !== tipo) return { ok: false, motivo: 'Liquide a pagar e a receber separadamente.' };
      var v = validarBaixa(sit, { valorCentavos: soma[id], data: x.data, conta: x.conta }, f.contas_bancarias);
      if (!v.ok) return { ok: false, motivo: ((sit && sit.titulo.documento) || id) + ': ' + v.motivo };
      tipo = sit.titulo.tipo; baixas.push({ titulo: id, registro: v.registro }); total += v.registro.liquidoCentavos;
    }
    var neg = caixaNegativo(f, { conta: x.conta, tituloTipo: tipo, liquidoCentavos: total });
    if (neg) return { ok: false, motivo: neg };
    return { ok: true, tipo: tipo, baixas: baixas, totalCentavos: total };
  }

  /* ── NF de entrada por XML (F5, 10/11/2026 — docs/financeiro-fase0-lacunas.md) ──
     Lê o XML da NF-e modelo 55 sem DOM (igual no navegador e no servidor), só as
     tags de que o financeiro precisa. As DUPLICATAS (cobr/dup) são o vencimento
     oficial. O XML não dá entrada no estoque: isso continua sendo do recebimento. */
  function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function semZeros(v) { var d = soDigitos(v); return d ? d.replace(/^0+(?=\d)/, '') : ''; }
  // "1234.5" (decimal do XML, sempre com ponto) -> centavos, sem passar por ponto flutuante.
  function decCentavos(s) {
    var t = String(s == null ? '' : s).trim();
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    var neg = t.charAt(0) === '-'; if (neg) t = t.slice(1);
    var p = t.split('.'), dec = (p[1] || '') + '000';
    var c = Number(p[0]) * 100 + Number(dec.slice(0, 2)) + (Number(dec.charAt(2)) >= 5 ? 1 : 0);
    return neg ? -c : c;
  }
  function xmlTexto(v) {
    return String(v).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim();
  }
  function tagRe(nome) { return new RegExp('<(?:[A-Za-z_][\\w.-]*:)?' + nome + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?' + nome + '>', 'g'); }
  function tagXml(xml, nome) { var m = tagRe(nome).exec(xml || ''); return m ? m[1] : null; }
  function tagsXml(xml, nome) { var re = tagRe(nome), out = [], m; while ((m = re.exec(xml || ''))) out.push(m[1]); return out; }
  function valXml(xml, nome) { var v = tagXml(xml, nome); return v == null ? null : xmlTexto(v); }
  function numerosNf(txt) { return (String(txt == null ? '' : txt).match(/\d+/g) || []).map(semZeros); }

  function lerXmlNfe(texto) {
    var x = String(texto || '');
    var idm = x.match(/<(?:[A-Za-z_][\w.-]*:)?infNFe\b[^>]*\bId="NFe(\d{44})"/);
    var inf = tagXml(x, 'infNFe');
    if (!inf) return { ok: false, motivo: 'Não é o XML de uma NF-e (falta o grupo infNFe).' };
    var chave = idm ? idm[1] : soDigitos(valXml(x, 'chNFe'));
    if (!/^\d{44}$/.test(chave)) return { ok: false, motivo: 'Chave de acesso (44 dígitos) não encontrada.' };
    var ide = tagXml(inf, 'ide') || '', emit = tagXml(inf, 'emit') || '', dest = tagXml(inf, 'dest') || '';
    var tot = tagXml(tagXml(inf, 'total') || '', 'ICMSTot') || '';
    var modelo = valXml(ide, 'mod');
    if (modelo && modelo !== '55') return { ok: false, motivo: 'Modelo ' + modelo + ': só a NF-e (modelo 55) entra aqui.' };
    var emissao = String(valXml(ide, 'dhEmi') || valXml(ide, 'dEmi') || '').slice(0, 10);
    if (!dataOk(emissao)) return { ok: false, motivo: 'Data de emissão inválida.' };
    var numero = semZeros(valXml(ide, 'nNF'));
    if (!numero) return { ok: false, motivo: 'Número da nota (nNF) ausente.' };
    var valor = decCentavos(valXml(tot, 'vNF'));
    if (!(valor > 0)) return { ok: false, motivo: 'Valor total da nota (vNF) ausente.' };
    var cnpj = soDigitos(valXml(emit, 'CNPJ') || valXml(emit, 'CPF'));
    if (!cnpj) return { ok: false, motivo: 'CNPJ do emitente ausente.' };
    var dups = tagsXml(tagXml(inf, 'cobr') || '', 'dup').map(function(d) {
      return { numero: valXml(d, 'nDup') || null, vencimento: String(valXml(d, 'dVenc') || '').slice(0, 10), valorCentavos: decCentavos(valXml(d, 'vDup')) };
    });
    var avisos = [];
    var dupRuim = dups.some(function(d) { return !dataOk(d.vencimento) || !(d.valorCentavos > 0); });
    if (dupRuim) { avisos.push('Duplicata com vencimento ou valor inválido: o vencimento da nota não será usado.'); dups = []; }
    var somaDup = dups.reduce(function(s, d) { return s + d.valorCentavos; }, 0);
    if (dups.length && somaDup !== valor) avisos.push('As duplicatas somam R$ ' + (somaDup / 100).toFixed(2) + ' e a nota R$ ' + (valor / 100).toFixed(2) + ' (desconto ou retenção na fatura).');
    if (!dups.length && !dupRuim) avisos.push('Nota sem duplicatas: o vencimento segue a condição do pedido de compra.');
    var itens = tagsXml(inf, 'det').map(function(d) {
      var p = tagXml(d, 'prod') || '';
      return { codigo: valXml(p, 'cProd'), descricao: String(valXml(p, 'xProd') || '').slice(0, 120), quantidade: num(valXml(p, 'qCom')),
        unidade: valXml(p, 'uCom'), valorCentavos: decCentavos(valXml(p, 'vProd')), cfop: valXml(p, 'CFOP') };
    });
    return { ok: true, avisos: avisos, nota: {
      chave: chave, modelo: '55', numero: numero, serie: semZeros(valXml(ide, 'serie')) || '0', emissao: emissao, tipoOperacao: valXml(ide, 'tpNF'),
      emitente: { cnpj: cnpj, nome: String(valXml(emit, 'xNome') || '').slice(0, 120), fantasia: String(valXml(emit, 'xFant') || '').slice(0, 120) || null },
      destinatarioCnpj: soDigitos(valXml(dest, 'CNPJ') || valXml(dest, 'CPF')) || null,
      valorTotalCentavos: valor, valorProdutosCentavos: decCentavos(valXml(tot, 'vProd')), freteCentavos: decCentavos(valXml(tot, 'vFrete')) || 0,
      descontoCentavos: decCentavos(valXml(tot, 'vDesc')) || 0, duplicatas: dups, itens: itens.slice(0, 200), totalItens: itens.length } };
  }

  /* Casa a nota com o recebimento: fornecedor pelo CNPJ, recebimento pelo número
     da NF (sem zeros à esquerda). Nunca escolhe entre dois candidatos. */
  function casarNotaEntrada(nota, base) {
    var b = base || {}, titulos = (b.fin && b.fin.titulos) || {}, n = nota || {};
    var cnpj = soDigitos(n.emitente && n.emitente.cnpj);
    var forns = Object.keys(b.fornecedores || {}).filter(function(k) { return cnpj && soDigitos((b.fornecedores[k] || {}).cnpj) === cnpj; });
    if (!forns.length) return { tipo: 'FORNECEDOR_NAO_CADASTRADO' };
    var pcs = Object.keys(b.pedidos_compra || {}).filter(function(k) { var pc = b.pedidos_compra[k]; return pc && forns.indexOf(pc.fornecedorKey) >= 0; });
    if (!pcs.length) return { tipo: 'SEM_PEDIDO', fornecedorKey: forns[0] };
    var achados = [];
    pcs.forEach(function(pk) {
      var pc = b.pedidos_compra[pk];
      Object.keys(pc.recebimentos || {}).forEach(function(rk) {
        var rec = pc.recebimentos[rk];
        if (rec && rec.status !== 'CANCELADO' && numerosNf(rec.notaFiscal).indexOf(n.numero) >= 0)
          achados.push({ pcKey: pk, recKey: rk, pc: pc.numeroFormatado || pc.numero || pk });
      });
    });
    var rotPcs = pcs.map(function(k) { var pc = b.pedidos_compra[k]; return pc.numeroFormatado || pc.numero || k; });
    if (!achados.length) return { tipo: 'SEM_RECEBIMENTO', fornecedorKey: forns[0], pcs: rotPcs };
    if (achados.length > 1) return { tipo: 'AMBIGUA', fornecedorKey: forns[0], recebimentos: achados };
    var a = achados[0], id = 'REC_' + san(a.pcKey) + '_' + san(a.recKey);
    var out = { fornecedorKey: forns[0], pcKey: a.pcKey, recKey: a.recKey, pc: a.pc };
    return Object.assign(out, titulos[id] ? { tipo: 'VINCULADA', titulo: id } : { tipo: 'RECEBIMENTO_SEM_TITULO' });
  }
  // Nota de cada título: a vinculada pelo servidor (nota.titulo) ou a que originou um
  // título manual (titulo.notaChave). Uma nota por título.
  function notasPorTitulo(fin) {
    var f = fin || {}, por = {}, notas = f.notas_entrada || {};
    Object.keys(notas).forEach(function(k) { var n = notas[k]; if (n && n.titulo && !por[n.titulo]) por[n.titulo] = n; });
    Object.keys(f.titulos || {}).forEach(function(id) { var t = f.titulos[id]; if (t && t.notaChave && notas[t.notaChave] && !por[id]) por[id] = notas[t.notaChave]; });
    return por;
  }
  /* Parcelas pelas duplicatas: as DATAS são as da nota; o VALOR é o do título,
     repartido na proporção das duplicatas (a última absorve o centavo). Se a nota
     soma diferente do título, a diferença aparece em Complementos, nunca aqui. */
  function parcelasDaNota(nota, valorCentavos) {
    var ds = ((nota && nota.duplicatas) || []).slice().sort(function(a, b) { return String(a.vencimento).localeCompare(String(b.vencimento)); });
    var soma = ds.reduce(function(s, d) { return s + num(d.valorCentavos); }, 0);
    if (!ds.length || !(soma > 0)) return null;
    var v = Math.round(num(valorCentavos)), usado = 0;
    return ds.map(function(d, i) {
      var valor = i === ds.length - 1 ? v - usado : Math.round(v * num(d.valorCentavos) / soma);
      usado += valor;
      return { n: i + 1, de: ds.length, vencimento: d.vencimento, valorCentavos: valor, tipo: 'PRAZO', duplicata: d.numero || null };
    });
  }
  /* Pendências das notas importadas (entram em Complementos). */
  function pendenciasNotas(base) {
    var b = base || {}, f = b.fin || {}, notas = f.notas_entrada || {}, out = [], porTit = notasPorTitulo(f);
    var vinculadas = {};
    Object.keys(porTit).forEach(function(id) { vinculadas[porTit[id].chave] = id; });
    Object.keys(notas).forEach(function(k) {
      var n = notas[k]; if (!n) return;
      var rot = 'NF ' + n.numero + (n.serie && n.serie !== '0' ? '/' + n.serie : '') + ' de ' + ((n.emitente && n.emitente.nome) || '?');
      var alvo = (n.duplicatas || []).length ? n.duplicatas.reduce(function(s, d) { return s + num(d.valorCentavos); }, 0) : num(n.valorTotalCentavos);
      var ref = { tipo: 'NF_ENTRADA', ref: k };
      if (vinculadas[k]) {
        var t = (f.titulos || {})[vinculadas[k]];
        if (t && Math.abs(alvo - num(t.valorCentavos)) >= 1) out.push({ id: 'NF_' + k, tipo: 'NF_DIVERGENTE', origem: ref, titulo: vinculadas[k], nota: k, valorCentavos: alvo - num(t.valorCentavos),
          texto: rot + ': a nota cobra R$ ' + (alvo / 100).toFixed(2) + ' e o título do recebimento é R$ ' + (num(t.valorCentavos) / 100).toFixed(2) + '. Os vencimentos já seguem a nota.',
          acao: 'Conferir impostos e frete na nota; se a diferença for devida, lance um título manual dela, senão bloqueie o pagamento e fale com o fornecedor' });
        return;
      }
      var c = casarNotaEntrada(n, b);
      var tx = { FORNECEDOR_NAO_CADASTRADO: ['NF_SEM_FORNECEDOR', 'o CNPJ ' + ((n.emitente && n.emitente.cnpj) || '') + ' não está em Fornecedores', 'Cadastre o fornecedor (Cadastros) ou lance o título manual a partir da nota'],
        SEM_PEDIDO: ['NF_SEM_PEDIDO', 'não há pedido de compra deste fornecedor (serviço, consumo, frete?)', 'Lance o título a partir da nota'],
        SEM_RECEBIMENTO: ['NF_SEM_RECEBIMENTO', 'nenhum recebimento com este número nos PCs ' + (c.pcs || []).join(', '), 'Aguarde a Logística receber, ou confira o número da NF no recebimento'],
        AMBIGUA: ['NF_AMBIGUA', 'mais de um recebimento com este número', 'Confira os recebimentos: o financeiro não escolhe sozinho'],
        RECEBIMENTO_SEM_TITULO: ['NF_SEM_TITULO', 'o recebimento do PC ' + (c.pc || '') + ' não gerou título (material do cliente ou sem preço)', 'Veja o complemento do recebimento'],
        VINCULADA: ['NF_A_VINCULAR', 'casa com o recebimento do PC ' + (c.pc || '') + ', falta vincular', 'Vincular agora'] }[c.tipo];
      if (tx) out.push({ id: 'NF_' + k, tipo: tx[0], origem: ref, nota: k, valorCentavos: alvo, texto: rot + ': ' + tx[1] + '.', acao: tx[2] });
    });
    return out;
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
    lerOfx: lerOfx, sugerirConciliacao: sugerirConciliacao,
    lerXmlNfe: lerXmlNfe, casarNotaEntrada: casarNotaEntrada, notasPorTitulo: notasPorTitulo, parcelasDaNota: parcelasDaNota,
    pendenciasNotas: pendenciasNotas, decCentavos: decCentavos,
    TIPOS_CONTA: TIPOS_CONTA, TIPOS_MOVIMENTO: TIPOS_MOVIMENTO, tipoConta: tipoConta, efeitosMovimento: efeitosMovimento,
    validarMovimento: validarMovimento, validarEstornoMovimento: validarEstornoMovimento, caixaNegativo: caixaNegativo, extratoConta: extratoConta,
    GRANULARIDADES: GRANULARIDADES, fluxoCaixa: fluxoCaixa, fluxosRealizados: fluxosRealizados, ATIVIDADES: ATIVIDADES, ATIVIDADE_PADRAO: ATIVIDADE_PADRAO,
    atividadeDe: atividadeDe, dfc: dfc, somarPeriodo: somarPeriodo,
    relTitulos: relTitulos, relBaixas: relBaixas, relAging: relAging, relExtrato: relExtrato, relDfc: relDfc, relFluxo: relFluxo,
    relatorioCsv: relatorioCsv, valorCsv: valorCsv, dataCsv: dataCsv,
    chaveParceiro: chaveParceiro, efeitosAdiantamento: efeitosAdiantamento, saldosAdiantamentos: saldosAdiantamentos, validarAdiantamento: validarAdiantamento,
    validarEstornoAdiantamento: validarEstornoAdiantamento, validarCompensacao: validarCompensacao,
    emLoteAguardando: emLoteAguardando, montarRenegociacao: montarRenegociacao, montarDesfazerRenegociacao: montarDesfazerRenegociacao,
    podeCancelar: podeCancelar, montarCancelamento: montarCancelamento, montarDesfazerCancelamento: montarDesfazerCancelamento,
    GRUPOS_ELEMENTO: GRUPOS_ELEMENTO, ELEMENTOS_PADRAO: ELEMENTOS_PADRAO, FORMAS_PAGAMENTO: FORMAS_PAGAMENTO, elementoDaNatureza: elementoDaNatureza, elementos: elementos,
    validarElemento: validarElemento, validarClassificacao: validarClassificacao, classificacaoEfetiva: classificacaoEfetiva, partesDoTitulo: partesDoTitulo,
    fluxosRealizadosPorElemento: fluxosRealizadosPorElemento, dfcElementos: dfcElementos, parcelasParaLiquidar: parcelasParaLiquidar, montarLiquidacao: montarLiquidacao
  };
});
