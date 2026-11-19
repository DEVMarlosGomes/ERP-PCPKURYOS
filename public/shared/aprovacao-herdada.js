/* Manter a aprovação da versão anterior quando o componente não mudou
   (19/11/2026) -- regras puras, sem Firebase e sem DOM.

   Caso real: a v2 do PRF-BIOF-0008 trocou dois itens da FÓRMULA. "+ Nova
   versão a partir desta" copiou o BOM igualzinho, mas em RASCUNHO; Fórmula e
   Especificação foram aprovadas e o BOM ficou esquecido. A Emissão de OP só
   usa versão com as três aprovadas e seguiu na v1 -- e parecia que o sistema
   "não puxava a informação atualizada". Mesma situação em HBHD0007,
   HDR-MISS-0008 e WKBS0002 (base de 19/11).

   Decisão do Marlos (19/11): botão de 1 clique, não herança automática.
   Quando o BOM ou a Especificação em rascunho é IDÊNTICO ao da versão
   anterior aprovada mais recente, quem aprova clica "Manter aprovação da vN"
   e fica registrado (quem, quando, de qual versão). Uma pessoa continua
   respondendo pela aprovação; só não precisa revisar de novo o que não mudou.

   Idêntico = mesmo conjunto de itens com todos os campos iguais, ignorando
   só o que não muda o produto: a ordem de exibição (`posicao`) e o nome de
   exibição do material (o código é que manda). A comparação é por CONTEÚDO,
   não pela chave do item, para não depender de como a versão foi copiada.
   A Fórmula fica de fora: a versão nova existe justamente para mudá-la. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AprovacaoHerdada = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var TIPOS = ['bom', 'especificacoes'];
  var IGNORAR = {posicao: 1, materialNome: 1, mpNome: 1, atualizadoEm: 1, atualizadoPor: 1};

  function versaoNum(v) { return parseInt(String(v || 'v0').replace(/[^\d]/g, ''), 10) || 0; }

  function normalizar(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Math.round(v * 1e6) / 1e6;
    if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v)) && /^-?[\d.,]+$/.test(v.trim())) {
      return Math.round(Number(v.replace(',', '.')) * 1e6) / 1e6;
    }
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'object') return JSON.stringify(ordenar(v));
    return v;
  }
  function ordenar(o) {
    if (Array.isArray(o)) return o.map(ordenar);
    if (!o || typeof o !== 'object') return o;
    var out = {};
    Object.keys(o).sort().forEach(function(k) { out[k] = ordenar(o[k]); });
    return out;
  }
  function assinaturaItem(it) {
    var o = {};
    Object.keys(it || {}).sort().forEach(function(k) {
      if (IGNORAR[k]) return;
      var n = normalizar(it[k]);
      if (n != null) o[k] = n;
    });
    return JSON.stringify(o);
  }
  function assinatura(reg) {
    return Object.keys((reg && reg.itens) || {}).map(function(k) { return assinaturaItem(reg.itens[k]); }).sort();
  }
  function conteudoIgual(a, b) {
    var x = assinatura(a), y = assinatura(b);
    if (x.length !== y.length) return false;
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  /* Versão anterior APROVADA mais recente do mesmo componente, se o conteúdo
     for idêntico ao da versão atual. `colecao` = nó inteiro (bom ou
     especificacoes), chave "produto__versão". {versao, chave} ou null. */
  function versaoAprovadaIgual(tipo, codProduto, versao, colecao) {
    if (TIPOS.indexOf(tipo) < 0 || !codProduto || !versao) return null;
    colecao = colecao || {};
    var atual = colecao[codProduto + '__' + versao];
    if (!atual || (atual.status || 'RASCUNHO') !== 'RASCUNHO') return null;
    if (!Object.keys(atual.itens || {}).length) return null;
    var n = versaoNum(versao), prefixo = codProduto + '__';
    var anteriores = Object.keys(colecao).filter(function(k) {
      if (k.indexOf(prefixo) !== 0) return false;
      var r = colecao[k];
      return r && r.status === 'APROVADA' && versaoNum(k.slice(prefixo.length)) < n;
    }).sort(function(a, b) { return versaoNum(b.slice(prefixo.length)) - versaoNum(a.slice(prefixo.length)); });
    if (!anteriores.length) return null;
    var k = anteriores[0];
    // Só a ÚLTIMA aprovada conta: se ela difere, uma mais antiga igual não
    // serve (o conteúdo voltaria a algo já substituído, e isso pede revisão).
    if (!conteudoIgual(colecao[k], atual)) return null;
    return {versao: colecao[k].versao || k.slice(prefixo.length), chave: k};
  }

  /* Caminhos relativos ao registro para gravar a aprovação mantida. Os dois
     campos de etapa recebem o mesmo carimbo, com `herdadaDe`, para a tela e
     a auditoria dizerem que não foi uma revisão nova. */
  function mudancas(cfg, base, dados) {
    dados = dados || {};
    var em = dados.agora || new Date().toISOString();
    var carimbo = {nome: dados.nome || null, uid: dados.uid || null, em: em, herdadaDe: base.versao};
    var u = {};
    u[cfg.campo1] = carimbo;
    u[cfg.campo2] = carimbo;
    u.status = 'APROVADA';
    u.dataAprovacao = em;
    u.aprovacaoHerdada = {daVersao: base.versao, daChave: base.chave, por: dados.nome || null, porUid: dados.uid || null, em: em};
    return u;
  }

  return {TIPOS: TIPOS, conteudoIgual: conteudoIgual, versaoAprovadaIgual: versaoAprovadaIgual, mudancas: mudancas, versaoNum: versaoNum};
});
