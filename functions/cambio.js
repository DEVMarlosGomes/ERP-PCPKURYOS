/* Dólar ao vivo + spread (PLANO_PD_CRM_AJUSTES.md, Fase 5).

   O servidor do Render busca o dólar comercial a cada 15 min (AwesomeAPI, BCB PTAX, ExchangeRate-API) (função
   atualizarCambio em functions/index.js) e grava em config/cambio:
     usd_brl: { compra, venda, fonte, cotadoEm, atualizadoEm }
     spread_pct: definido pelo ADM
   Toda tela com preço em US$ usa a taxa efetiva = venda × (1 + spread%).
   Fórmula do P&D acompanha o dólar, salvo se alguém fixar a cotação nela.
   Cotação enviada ao cliente congela o câmbio usado (não muda sozinha depois).

   Cópia byte a byte em functions/cambio.js (o servidor usa a mesma leitura das
   fontes). Funções puras: nada aqui lê ou grava no banco. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Cambio = factory();
})(this, function() {
  'use strict';

  var PADRAO_SEM_CAMBIO = 6;   // o mesmo padrão que as fórmulas já usavam
  var MAX_IDADE_MIN = 60;      // 4 rodadas de 15 min sem atualizar = aviso
  var SPREAD_MAX = 20;

  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : null; }
  function r4(n) { return Math.round(n * 10000) / 10000; }

  // https://economia.awesomeapi.com.br/json/last/USD-BRL (dólar comercial, sem chave)
  function deAwesome(json) {
    var c = json && json.USDBRL;
    var compra = num(c && c.bid), venda = num(c && c.ask);
    if (!venda) return null;
    return { compra: compra || venda, venda: venda, fonte: 'AwesomeAPI (dólar comercial)', cotadoEm: String(c.create_date || '') };
  }

  // Banco Central (PTAX, boletins de abertura/intermediários/fechamento do dia). Oficial,
  // gratuito e sem limite de chamadas — a AwesomeAPI responde 429 para o servidor do Render
  // (IP de nuvem compartilhado), então o BCB é a segunda fonte. Janela de 7 dias cobre
  // fim de semana e feriado (pega o boletim mais recente).
  function urlBcbPtax(agora) {
    var fim = new Date(agora || Date.now());
    var ini = new Date(fim.getTime() - 7 * 864e5);
    var fmt = function(d) { return ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2) + '-' + d.getUTCFullYear(); };
    return 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)' +
      "?@moeda='USD'&@dataInicial='" + fmt(ini) + "'&@dataFinalCotacao='" + fmt(fim) + "'&$format=json&$orderby=dataHoraCotacao%20desc&$top=1";
  }

  function deBcbPtax(json) {
    var c = json && Array.isArray(json.value) ? json.value[0] : null;
    var venda = num(c && c.cotacaoVenda);
    if (!venda) return null;
    return { compra: num(c.cotacaoCompra) || venda, venda: venda, fonte: 'Banco Central (PTAX ' + String(c.tipoBoletim || '').toLowerCase() + ')', cotadoEm: String(c.dataHoraCotacao || '').slice(0, 19) };
  }

  // https://open.er-api.com/v6/latest/USD (reserva, taxa única)
  function deErApi(json) {
    var brl = num(json && json.result === 'success' && json.rates && json.rates.BRL);
    if (!brl) return null;
    return { compra: brl, venda: brl, fonte: 'ExchangeRate-API (reserva)', cotadoEm: String(json.time_last_update_utc || '') };
  }

  function validarSpread(valor) {
    var n = Number(String(valor).replace(',', '.'));
    if (!isFinite(n) || n < 0 || n > SPREAD_MAX) return { erro: 'Spread entre 0 e ' + SPREAD_MAX + '%.' };
    return { spread: Math.round(n * 100) / 100 };
  }

  function taxaEfetiva(cambio) {
    var venda = num(cambio && cambio.usd_brl && cambio.usd_brl.venda);
    if (!venda) return null;
    var spread = Number(cambio.spread_pct) || 0;
    return r4(venda * (1 + spread / 100));
  }

  function idadeMinutos(cambio, agora) {
    var t = Date.parse(cambio && cambio.usd_brl && cambio.usd_brl.atualizadoEm);
    var a = Date.parse(agora);
    return isFinite(t) && isFinite(a) ? Math.max(0, Math.round((a - t) / 60000)) : null;
  }

  function situacao(cambio, agora) {
    var taxa = taxaEfetiva(cambio);
    var idade = idadeMinutos(cambio, agora);
    return {
      disponivel: taxa !== null,
      taxa: taxa,
      venda: num(cambio && cambio.usd_brl && cambio.usd_brl.venda),
      spread: Number(cambio && cambio.spread_pct) || 0,
      fonte: (cambio && cambio.usd_brl && cambio.usd_brl.fonte) || '',
      atualizadoEm: (cambio && cambio.usd_brl && cambio.usd_brl.atualizadoEm) || '',
      idadeMin: idade,
      velho: taxa !== null && (idade === null || idade > MAX_IDADE_MIN),
      erro: (cambio && cambio.erro) || ''
    };
  }

  // Taxa que a fórmula usa: fixada nela (cotacao_usd_fixa) > dólar ao vivo > a que ela já tinha > padrão.
  function cotacaoDaFormula(formula, cambio) {
    var f = formula || {};
    if (f.cotacao_usd_fixa && num(f.cotacao_usd)) return { taxa: num(f.cotacao_usd), origem: 'fixa' };
    var viva = taxaEfetiva(cambio);
    if (viva) return { taxa: viva, origem: 'ao_vivo' };
    if (num(f.cotacao_usd)) return { taxa: num(f.cotacao_usd), origem: 'gravada' };
    return { taxa: PADRAO_SEM_CAMBIO, origem: 'padrao' };
  }

  // Cotação enviada ao cliente: grava o câmbio do momento e não acompanha mais o dólar.
  function congelar(cambio, agora) {
    var taxa = taxaEfetiva(cambio);
    if (!taxa) return null;
    return {
      taxa: taxa, venda: num(cambio.usd_brl.venda), spread_pct: Number(cambio.spread_pct) || 0,
      fonte: cambio.usd_brl.fonte || '', cotadoEm: cambio.usd_brl.cotadoEm || '', congeladoEm: agora
    };
  }

  function taxaDaCotacao(proposta, cambio) {
    var c = proposta && proposta.cambio_congelado;
    if (c && num(c.taxa)) return { taxa: num(c.taxa), origem: 'congelada', em: c.congeladoEm || '' };
    var viva = taxaEfetiva(cambio);
    return viva ? { taxa: viva, origem: 'ao_vivo' } : { taxa: PADRAO_SEM_CAMBIO, origem: 'padrao' };
  }

  return {
    PADRAO_SEM_CAMBIO: PADRAO_SEM_CAMBIO, MAX_IDADE_MIN: MAX_IDADE_MIN, SPREAD_MAX: SPREAD_MAX,
    deAwesome: deAwesome, deErApi: deErApi, urlBcbPtax: urlBcbPtax, deBcbPtax: deBcbPtax, validarSpread: validarSpread, taxaEfetiva: taxaEfetiva,
    idadeMinutos: idadeMinutos, situacao: situacao, cotacaoDaFormula: cotacaoDaFormula,
    congelar: congelar, taxaDaCotacao: taxaDaCotacao
  };
});
