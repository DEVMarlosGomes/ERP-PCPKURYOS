/* Motor de Chamados: validação do formulário, caminhos de upload e organização
   do quadro. UMD para a tela e para os testes Node. A autorização real fica na
   callable `chamadoSistema`; este arquivo nunca decide permissão. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Chamados = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var STATUS = ['NOVO', 'NA_FILA', 'EM_ANDAMENTO', 'VALIDAR', 'CONCLUIDO'];
  var ROTULO_STATUS = {NOVO: 'Novo', NA_FILA: 'Na fila', EM_ANDAMENTO: 'Em andamento', VALIDAR: 'Validar', CONCLUIDO: 'Concluído', RECUSADO: 'Recusado', DUPLICADO: 'Duplicado'};
  var ROTULO_TIPO = {ERRO: 'Erro', MELHORIA: 'Melhoria', DUVIDA: 'Dúvida'};
  var ROTULO_IMPACTO = {BAIXO: 'Baixo', MEDIO: 'Médio', ALTO: 'Alto', CRITICO: 'Crítico'};
  var TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp'];
  var LIMITE_BYTES = 10 * 1024 * 1024;
  var MAX_ANEXOS = 3;

  function texto(v) { return String(v == null ? '' : v).trim(); }
  function nomeSeguro(nome) {
    return (texto(nome) || 'print').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(-100) || 'print';
  }
  function caminhoAnexo(uid, id, arquivo, indice, agoraMs) {
    var prefixo = [uid, id].map(function(v) { return texto(v).replace(/[^a-zA-Z0-9_-]/g, ''); });
    var instante = Number(agoraMs) || Date.now();
    return 'chamados/' + prefixo[0] + '/' + prefixo[1] + '/' + instante + '_' + Number(indice || 0) + '_' + nomeSeguro(arquivo && arquivo.name);
  }
  function validarArquivo(arquivo) {
    if (!arquivo || !arquivo.name) return 'Escolha uma imagem.';
    if (!(Number(arquivo.size) > 0)) return 'O arquivo está vazio.';
    if (Number(arquivo.size) > LIMITE_BYTES) return 'Cada print pode ter no máximo 10 MB.';
    if (TIPOS_ACEITOS.indexOf(texto(arquivo.type).toLowerCase()) < 0) return 'Use um print PNG, JPG ou WebP.';
    return '';
  }
  function validarArquivos(arquivos) {
    var lista = Array.prototype.slice.call(arquivos || []);
    var erros = [];
    if (lista.length > MAX_ANEXOS) erros.push('Você pode anexar no máximo 3 prints.');
    lista.slice(0, MAX_ANEXOS).forEach(function(a, i) {
      var e = validarArquivo(a);
      if (e) erros.push('Print ' + (i + 1) + ': ' + e);
    });
    return {ok: !erros.length, erros: erros};
  }
  function validarFormulario(dados, arquivos) {
    var erros = [];
    if (['ERRO', 'MELHORIA', 'DUVIDA'].indexOf(texto(dados && dados.tipo).toUpperCase()) < 0) erros.push('Escolha o tipo do chamado.');
    if (['BAIXO', 'MEDIO', 'ALTO', 'CRITICO'].indexOf(texto(dados && dados.impacto).toUpperCase()) < 0) erros.push('Escolha o impacto.');
    if (texto(dados && dados.titulo).length < 6) erros.push('Resuma o chamado em pelo menos 6 caracteres.');
    if (texto(dados && dados.descricao).length < 12) erros.push('Descreva o que aconteceu e o que você esperava.');
    var arq = validarArquivos(arquivos);
    return {ok: !erros.length && arq.ok, erros: erros.concat(arq.erros)};
  }
  function porStatus(itens) {
    var colunas = {};
    STATUS.forEach(function(s) { colunas[s] = []; });
    (itens || []).forEach(function(item) {
      if (colunas[item.status]) colunas[item.status].push(item);
    });
    STATUS.forEach(function(s) {
      colunas[s].sort(function(a, b) {
        var pa = Number(String(a.prioridade || 'P9').slice(1)) || 9;
        var pb = Number(String(b.prioridade || 'P9').slice(1)) || 9;
        return pa - pb || String(b.atualizadaEm || '').localeCompare(String(a.atualizadaEm || ''));
      });
    });
    return colunas;
  }
  function requestId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '_');
    return 'ch_' + Date.now() + '_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  function dataHora(v) {
    var d = new Date(v);
    return isNaN(d) ? '—' : d.toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
  }

  return {
    STATUS: STATUS, ROTULO_STATUS: ROTULO_STATUS, ROTULO_TIPO: ROTULO_TIPO, ROTULO_IMPACTO: ROTULO_IMPACTO,
    TIPOS_ACEITOS: TIPOS_ACEITOS, LIMITE_BYTES: LIMITE_BYTES, MAX_ANEXOS: MAX_ANEXOS,
    nomeSeguro: nomeSeguro, caminhoAnexo: caminhoAnexo, validarArquivo: validarArquivo,
    validarArquivos: validarArquivos, validarFormulario: validarFormulario, porStatus: porStatus,
    requestId: requestId, dataHora: dataHora
  };
});
