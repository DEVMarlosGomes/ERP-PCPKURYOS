/* Duplicidade de material no Cadastros (CAD-01, PROMPT_ENGENHARIA_PACOTE_20261021.md).
 *
 * Pedido do usuário (21/10/2026): ao adicionar MPGR/MPES nova, o cadastro verifica se já
 * existe; se existir, só vincula. Medido em 22/10 (AUDITORIA_PACOTE_20261021.md §6.2):
 * 9 grupos de nome repetido entre os ativos (ex.: GLICERINA MPGR-00008 × MPGR-00077), e o
 * INCI NÃO serve como chave — PARFUM aparece em 90 fragrâncias e nomes comerciais
 * diferentes têm o mesmo INCI de propósito (Cetiol CC = Carbonato de dicaprilila).
 * Por isso: bloqueio só por tipo + nome normalizado; INCI e código do fornecedor só
 * sugerem candidato. Funções puras, sem DOM nem banco. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DuplicidadeMaterial = factory();
})(typeof self !== 'undefined' ? self : this, function() {
  var INCI_GENERICO = { PARFUM: true, FRAGRANCE: true, AROMA: true, AQUA: true, WATER: true };

  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
      .replace(/[^A-Z0-9%]+/g, ' ').trim();
  }
  function chaveMaterial(tipo, nome) { return String(tipo || '').toUpperCase() + '|' + normalizar(nome); }

  function codigosFornecedor(m) {
    var out = [];
    Object.keys((m && m.fornecedores) || {}).forEach(function(k) {
      var c = normalizar(m.fornecedores[k] && m.fornecedores[k].codigoFornecedor);
      if (c) out.push(c);
    });
    return out;
  }

  /* novo = { tipo, nome, inci, codigoFornecedor }; materiais = allMateriais.
     Retorna os ativos parecidos, do mais forte para o mais fraco, com o motivo. */
  function candidatos(novo, materiais, excluirKey) {
    var n = novo || {};
    var tipo = String(n.tipo || '').toUpperCase();
    var nome = normalizar(n.nome);
    var inci = normalizar(n.inci);
    var codigo = normalizar(n.codigoFornecedor);
    var achados = [];
    Object.keys(materiais || {}).forEach(function(key) {
      var m = materiais[key];
      if (!m || m.ativo === false || key === excluirKey) return;
      var nomeM = normalizar(m.mpNome);
      var motivo = null, forca = 0;
      if (nome && nomeM && String(m.tipo || '').toUpperCase() === tipo && nomeM === nome) { motivo = 'mesmo nome'; forca = 3; }
      else if (nome.length >= 6 && nomeM.length >= 6 && String(m.tipo || '').toUpperCase() === tipo && (nomeM.indexOf(nome) !== -1 || nome.indexOf(nomeM) !== -1)) { motivo = 'nome parecido'; forca = 2; }
      else if (codigo && codigosFornecedor(m).indexOf(codigo) !== -1) { motivo = 'mesmo código do fornecedor'; forca = 2; }
      else if (inci && !INCI_GENERICO[inci] && normalizar(m.inci) === inci) { motivo = 'mesmo INCI'; forca = 1; }
      if (motivo) achados.push({ key: key, mpCodigo: m.mpCodigo || key, mpNome: m.mpNome || '', tipo: m.tipo || '', motivo: motivo, forca: forca });
    });
    return achados.sort(function(a, b) { return b.forca - a.forca || a.mpCodigo.localeCompare(b.mpCodigo); });
  }

  // Duplicata exata (mesmo tipo e nome): criar outro é recusado; o caminho é vincular.
  function duplicataExata(lista) {
    return (lista || []).filter(function(c) { return c.motivo === 'mesmo nome'; })[0] || null;
  }

  // Fecha a tarefa da fila do P&D apontando para o material que já existe.
  function vinculo(material, materialKey, autor, agora) {
    return { status: 'VINCULADO', materialKey: materialKey, mpCodigo: (material && material.mpCodigo) || materialKey,
      vinculadoEm: agora, vinculadoPor: autor || '' };
  }

  /* Índice materiais_chave/{tipo|NOME} → material (regra do banco: uma chave, um dono).
     anterior = material gravado (null ao criar); novo = dados a gravar; indice = materiais_chave.
     Devolve { chave, updates: {chave: materialKey|null}, erro }. Criar sempre reserva a chave.
     Duplicata antiga (dos 9 grupos medidos em 22/10) que não muda de nome segue salvando: só
     não ganha a chave, que é do primeiro código. Inativar libera a chave; renomear troca. */
  function mudancasDoIndice(anterior, novo, materialKey, indice) {
    var ix = indice || {};
    var tomada = function(ch) { return ch && ix[ch] && ix[ch] !== materialKey; };
    var nova = chaveMaterial(novo.tipo, novo.mpNome);
    if (!anterior) {
      if (tomada(nova)) return { erro: 'Já existe ' + ix[nova] + ' com este tipo e nome.' };
      var u0 = {}; u0[nova] = materialKey;
      return { chave: nova, updates: u0 };
    }
    var desejada = novo.ativo === false ? null : nova;
    var antiga = anterior.ativo === false ? null : (anterior.chaveDuplicidade || chaveMaterial(anterior.tipo, anterior.mpNome));
    if (desejada === antiga) return { chave: ix[desejada] === materialKey ? desejada : (anterior.chaveDuplicidade || null), updates: {} };
    var updates = {};
    if (antiga && ix[antiga] === materialKey) updates[antiga] = null;
    if (desejada) {
      if (tomada(desejada)) return { erro: 'Já existe ' + ix[desejada] + ' com este tipo e nome.' };
      updates[desejada] = materialKey;
    }
    return { chave: desejada, updates: updates };
  }

  // Backfill do índice a partir dos materiais ativos: o menor código de cada chave é o dono.
  function indiceInicial(materiais) {
    var donos = {};
    Object.keys(materiais || {}).sort().forEach(function(key) {
      var m = materiais[key];
      if (!m || m.ativo === false || !normalizar(m.mpNome)) return;
      var ch = chaveMaterial(m.tipo, m.mpNome);
      if (!donos[ch]) donos[ch] = key;
    });
    return donos;
  }

  return { normalizar: normalizar, chaveMaterial: chaveMaterial, candidatos: candidatos, duplicataExata: duplicataExata, vinculo: vinculo,
    mudancasDoIndice: mudancasDoIndice, indiceInicial: indiceInicial };
});
