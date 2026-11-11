/* Nome do material numa versão APROVADA de Fórmula/BOM (11/11/2026).
   O item da versão guarda o nome de quando entrou nela; a emissão da OP mostra o nome ATUAL do cadastro
   de Materiais (nomeMaterialAtual em emitir_op.html, decisão de 30/09). Com o mesmo código e nomes
   diferentes, as duas telas pareciam divergir ("os itens da OP estão divergentes do cadastro": ET-00071
   gravado "MASTER 406X306X184MM", cadastro "371X280X197MM"). A versão aprovada passa a mostrar o nome
   atual e, quando difere, o gravado embaixo, menor. O dado gravado não muda.
     NomeMaterialVersao.html(codigo, nomeGravado, material, esc) -> HTML da célula (esc = escapeHtml da tela)
     NomeMaterialVersao.mesmoNome(a, b) -> ignora caixa, acento, espaço e pontuação
   Teste: run_nome_material_versao_test.js */
(function(raiz) {
  function chave(s) {
    return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '');
  }
  function mesmoNome(a, b) { return chave(a) === chave(b); }
  function html(codigo, nomeGravado, material, esc) {
    var atual = String((material && material.mpNome) || '').trim();
    var gravado = String(nomeGravado || '').trim();
    var inicio = esc(codigo || '') + ' — ';
    // Fora do cadastro (ou cadastro ainda carregando): mostra o gravado, como a emissão da OP.
    if (!atual) return inicio + esc(gravado);
    return inicio + esc(atual) +
      (gravado && !mesmoNome(gravado, atual) ? '<div class="field-hint">Nome gravado nesta versão: ' + esc(gravado) + '</div>' : '');
  }
  var api = {html: html, mesmoNome: mesmoNome};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.NomeMaterialVersao = api;
})(typeof window !== 'undefined' ? window : globalThis);
