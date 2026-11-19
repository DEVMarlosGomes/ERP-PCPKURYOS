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
  // Níveis da proposta de 13/11: Urgente fura a fila; Alta nesta semana; Normal pela ordem; Baixa quando houver folga.
  var ROTULO_PRIORIDADE = {P0: 'Urgente', P1: 'Alta', P2: 'Normal', P3: 'Baixa'};
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
    // Ordem da coluna: quem já foi posicionado no quadro (ordem) vem primeiro, na ordem dada;
    // o resto por prioridade (P0 primeiro) e o mais recente antes.
    function nivel(p) { var n = parseInt(String(p || '').slice(1), 10); return isNaN(n) ? 9 : n; }
    STATUS.forEach(function(s) {
      colunas[s].sort(function(a, b) {
        var oa = typeof a.ordem === 'number', ob = typeof b.ordem === 'number';
        if (oa && ob && a.ordem !== b.ordem) return a.ordem - b.ordem;
        if (oa !== ob) return oa ? -1 : 1;
        return nivel(a.prioridade) - nivel(b.prioridade) || String(b.atualizadaEm || '').localeCompare(String(a.atualizadaEm || ''));
      });
    });
    return colunas;
  }
  /* Posição de um cartão solto sobre outro (entra ANTES dele) ou no fim da coluna (alvo null).
     colunaOrdenada = a coluna como o quadro mostra (porStatus), já sem o cartão que se move. */
  function ordemParaSoltar(colunaOrdenada, alvoId) {
    var lista = (colunaOrdenada || []).map(function(x, i) { return typeof x.ordem === 'number' ? x.ordem : (i + 1) * 1000; });
    var ids = (colunaOrdenada || []).map(function(x) { return x.id; });
    var i = alvoId ? ids.indexOf(alvoId) : -1;
    if (i < 0) return lista.length ? lista[lista.length - 1] + 1000 : 1000;
    var depois = lista[i], antes = i > 0 ? lista[i - 1] : depois - 2000;
    return (antes + depois) / 2;
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
    STATUS: STATUS, ROTULO_STATUS: ROTULO_STATUS, ROTULO_TIPO: ROTULO_TIPO, ROTULO_IMPACTO: ROTULO_IMPACTO, ROTULO_PRIORIDADE: ROTULO_PRIORIDADE, ordemParaSoltar: ordemParaSoltar,
    TIPOS_ACEITOS: TIPOS_ACEITOS, LIMITE_BYTES: LIMITE_BYTES, MAX_ANEXOS: MAX_ANEXOS,
    nomeSeguro: nomeSeguro, caminhoAnexo: caminhoAnexo, validarArquivo: validarArquivo,
    validarArquivos: validarArquivos, validarFormulario: validarFormulario, porStatus: porStatus,
    requestId: requestId, dataHora: dataHora
  };
});
