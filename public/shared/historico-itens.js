/* Histórico item a item de Fórmula / BOM / Especificação (11/11/2026).

   Pedido: "o ADM e o responsável do cadastro conseguem editar, excluir ou
   substituir itens de BOM, fórmula e especificações, tudo gravado no banco
   com histórico". Cada ação vira, NA HORA, uma linha em
   {formulas|bom|especificacoes}/{versao}/historicoAlteracoes com quem, quando,
   o que era (antes) e o que ficou (depois) -- em rascunho e em aprovada.
   O "Finalizar edição" (rascunho) e o "Concluir alteração" (aprovada) seguem
   gravando o resumo com a justificativa do lote.

   evento(tipo, itemKey, antes, depois, opts) -> {acao, itemKey, antes, depois, descricao, mudancas} | null
     antes/depois: o item como está no banco (null = não existia / foi excluído).
     acao: INCLUIR | EDITAR | EXCLUIR | SUBSTITUIR (troca do material, ou do ensaio na Especificação).
     null quando nada que importa mudou (evita linha vazia no histórico).
     opts.acao força a ação (ex.: SUBSTITUIR pelo botão ⇄ mesmo que só a % mude junto).
   retrato(tipo, item) -> só os campos do item que contam (o que o histórico guarda).
   rotuloAcao(acao) -> "Substituição", "Exclusão"...
   Funções puras; mesmo arquivo no navegador (window.HistoricoItens) e no Node. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./diff-versao.js'));
  else root.HistoricoItens = factory(root.DiffVersao);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(DiffVersao) {
  'use strict';

  var CAMPOS = {
    formulas: ['mpCodigo', 'mpNome', 'fase', 'ordemAdicao', 'percentualMM'],
    bom: ['materialCodigo', 'materialNome', 'qtdPorPeca', 'pecasPorUnidade'],
    especificacoes: ['ensaio', 'especificacaoTexto', 'minimo', 'maximo', 'metodo', 'critico']
  };
  var ROTULOS = {
    INCLUIR: 'Inclusão', EDITAR: 'Edição', EXCLUIR: 'Exclusão', SUBSTITUIR: 'Substituição',
    CRIADA: 'Versão criada', EDICAO: 'Edição finalizada', RESUMO_ALTERACAO: 'Alteração concluída',
    ALTERAR_APROVADA: 'Alteração em aprovada', AJUSTE: 'Ajuste'
  };

  function vazio(v) { return v === undefined || v === null || v === ''; }

  function retrato(tipo, it) {
    var campos = CAMPOS[tipo];
    if (!campos) throw new Error('Componente desconhecido: ' + tipo);
    if (!it) return null;
    var r = {};
    campos.forEach(function(c) { if (!vazio(it[c])) r[c] = it[c]; });
    return r;
  }

  function codigoDe(tipo, it) {
    return it ? (it[DiffVersao.COMPONENTES[tipo].codigo] || '') : '';
  }

  function rotuloAcao(acao) { return ROTULOS[acao] || acao || ''; }

  function evento(tipo, itemKey, antes, depois, opts) {
    opts = opts || {};
    var cfg = DiffVersao.COMPONENTES[tipo];
    if (!cfg) throw new Error('Componente desconhecido: ' + tipo);
    var a = retrato(tipo, antes), d = retrato(tipo, depois);
    var ia = {}, id = {};
    if (a) ia[itemKey] = a;
    if (d) id[itemKey] = d;
    var mud = DiffVersao.diffComponente(tipo, {itens: ia}, {itens: id});
    // BOM: "1 a cada N peças" muda pecasPorUnidade; o diff só olha qtdPorPeca.
    if (!mud.length && a && d && tipo === 'bom' && String(a.pecasPorUnidade || '') !== String(d.pecasPorUnidade || '')) {
      mud = [{tipo: 'ALTERADO', chave: itemKey, item: codigoDe(tipo, d) || '(sem código)',
        campos: [{campo: '1 a cada N peças', de: a.pecasPorUnidade || null, para: d.pecasPorUnidade || null}]}];
    }
    if (!mud.length && !opts.acao) return null;
    var acao = opts.acao;
    if (!acao) {
      if (!a) acao = 'INCLUIR';
      else if (!d) acao = 'EXCLUIR';
      else if (codigoDe(tipo, a) && codigoDe(tipo, a) !== codigoDe(tipo, d)) acao = 'SUBSTITUIR';
      else acao = 'EDITAR';
    }
    var textos = mud.map(function(m) {
      var t = DiffVersao.textoMudanca(tipo, m);
      if (t === 'Incluído: (sem código)') return 'Linha nova (a preencher)';
      // Linha nova recebendo o primeiro material não é troca de nada.
      return t.indexOf('Trocado: (sem código) por ') === 0 ? 'Definido: ' + t.slice('Trocado: (sem código) por '.length) : t;
    });
    return {
      acao: acao,
      itemKey: itemKey,
      antes: a,
      depois: d,
      descricao: cfg.nome + ' · ' + rotuloAcao(acao) + ': ' + (textos[0] ? textos[0].replace(/^Trocado: /, '') : (codigoDe(tipo, d || a) || '(sem código)')),
      mudancas: textos
    };
  }

  return {CAMPOS: CAMPOS, retrato: retrato, evento: evento, rotuloAcao: rotuloAcao};
});
