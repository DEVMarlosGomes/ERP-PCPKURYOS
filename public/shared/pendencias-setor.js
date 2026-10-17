/* Pendências da Emissão de OP para os setores (pedido do usuário, 17/10/2026):
   "na tela de OP quando tiver algo faltando abrir um quadro para completar, e cada setor
   receber essa informação".

   O que falta no produto/fórmula/BOM para emitir a OP:
     - quem emite completa na hora o que souber (modal "Completar agora");
     - o que ficar em branco vira pendência em pendencias_setor/{chave} para o setor dono do dado,
       que vê a barra "Pendências da Emissão de OP" na tela dele e resolve ali mesmo.
   Setor dono: volume, Un./caixa e peso por caixa → Cadastros; densidade e validade → Qualidade
   (saem do estudo de estabilidade/especificação); material fora do cadastro → Cadastros.
   A pendência fecha sozinha quando o dado aparece no cadastro (por quem quer que seja).
   Uma chave por produto + campo/item: avisar de novo não duplica, só conta o aviso.
   Funções puras: nada aqui lê ou grava no banco. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PendenciasSetor = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var SETORES = { CADASTROS: 'Cadastros', QUALIDADE: 'Qualidade' };
  var UNIDADES_VOLUME = ['ml', 'l', 'g', 'kg'];

  // obrigatorio: trava a emissão; senão é aviso (a OP pergunta "emitir mesmo assim?").
  var CAMPOS = {
    volume: { rotulo: 'Volume nominal', setor: 'CADASTROS', onde: 'Cadastros › Produtos › Identificação', obrigatorio: true, tipo: 'volume' },
    densidadeGranel: { rotulo: 'Densidade do granel (g/mL)', setor: 'QUALIDADE', onde: 'Cadastros › Produtos › Parâmetros de Lote', obrigatorio: true, tipo: 'decimal', min: 0.3, max: 3 },
    prazoValidadeMeses: { rotulo: 'Prazo de validade (meses)', setor: 'QUALIDADE', onde: 'Cadastros › Produtos › Parâmetros de Lote', obrigatorio: true, tipo: 'inteiro', min: 1, max: 120 },
    unCx: { rotulo: 'Unidades por caixa', setor: 'CADASTROS', onde: 'Cadastros › Produtos › Embalagem', obrigatorio: false, tipo: 'inteiro', min: 1, max: 100000 },
    kgCaixa: { rotulo: 'Peso por caixa (kg)', setor: 'CADASTROS', onde: 'Cadastros › Produtos › Embalagem', obrigatorio: false, tipo: 'decimal', min: 0.001, max: 2000 }
  };

  function txt(v) { return String(v == null ? '' : v).trim(); }
  function num(v) { var n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : NaN; }
  function chaveSegura(s) { return String(s).replace(/[.#$\[\]\/]/g, '_'); }

  function campoPreenchido(produto, campo) {
    var p = produto || {};
    if (campo === 'volume') return num(p.volume) > 0 && UNIDADES_VOLUME.indexOf(txt(p.unidadeVolume || 'ml').toLowerCase()) >= 0;
    if (campo === 'unCx' || campo === 'prazoValidadeMeses') return parseInt(p[campo], 10) > 0;
    return num(p[campo]) > 0;
  }

  // densidadeNaTela: a OP aceita densidade digitada no dimensionamento (vale para aquela OP).
  function faltasDoProduto(produto, opcoes) {
    var o = opcoes || {};
    return Object.keys(CAMPOS).filter(function(c) {
      if (c === 'densidadeGranel' && num(o.densidadeNaTela) > 0) return false;
      return !campoPreenchido(produto, c);
    }).map(function(c) { return Object.assign({ campo: c }, CAMPOS[c]); });
  }

  // Valor digitado no quadro → valor gravável (ou erro). Volume vem com a unidade.
  function validarValor(campo, valor, unidade) {
    var meta = CAMPOS[campo];
    if (!meta) return { erro: 'Campo desconhecido: ' + campo };
    if (txt(valor) === '') return { vazio: true };
    var n = num(valor);
    if (meta.tipo === 'volume') {
      var u = txt(unidade || 'ml').toLowerCase();
      if (!(n > 0)) return { erro: meta.rotulo + ': informe um número maior que zero.' };
      if (UNIDADES_VOLUME.indexOf(u) < 0) return { erro: meta.rotulo + ': unidade deve ser ml, L, g ou kg.' };
      return { valores: { volume: n, unidadeVolume: u } };
    }
    if (!isFinite(n) || n < meta.min || n > meta.max) return { erro: meta.rotulo + ': valor entre ' + meta.min + ' e ' + meta.max + '.' };
    if (meta.tipo === 'inteiro' && Math.round(n) !== n) return { erro: meta.rotulo + ': número inteiro.' };
    var out = {}; out[campo] = n;
    return { valores: out };
  }

  function chave(produtoKey, ref) { return chaveSegura(produtoKey) + '__' + chaveSegura(ref); }

  function base(produtoKey, produto, autor, agora) {
    return { produtoKey: produtoKey, sku: txt((produto || {}).sku) || produtoKey, descricao: txt((produto || {}).descricao),
      cliente: txt((produto || {}).cliente), status: 'ABERTA', origem: 'EMISSAO_OP', criadoEm: agora, criadoPor: autor || '',
      ultimoAvisoEm: agora, ultimoAvisoPor: autor || '', avisos: 1 };
  }

  function pendenciaDeCampo(produtoKey, produto, campo, autor, agora) {
    var meta = CAMPOS[campo];
    return Object.assign(base(produtoKey, produto, autor, agora), {
      tipo: 'DADO_PRODUTO', setor: meta.setor, campo: campo, rotulo: meta.rotulo, onde: meta.onde, obrigatorio: meta.obrigatorio,
      texto: meta.rotulo + ' do produto ' + (txt((produto || {}).sku) || produtoKey) + ' — falta para emitir a OP.'
    });
  }

  // item: { colecao: 'formulas'|'bom', versaoKey, itemKey, texto }
  function pendenciaDeItem(produtoKey, produto, item, autor, agora) {
    var onde = item.colecao === 'bom' ? 'BOM' : 'Fórmula';
    return Object.assign(base(produtoKey, produto, autor, agora), {
      tipo: 'MATERIAL', setor: 'CADASTROS', colecao: item.colecao, versaoKey: item.versaoKey, itemKey: item.itemKey,
      rotulo: 'Material fora do cadastro (' + onde + ')', onde: 'Cadastros › Materiais e Cadastros › Fórmulas / BOM', obrigatorio: true,
      texto: onde + ' do ' + (txt((produto || {}).sku) || produtoKey) + ': "' + (txt(item.texto) || item.itemKey) + '" não está no cadastro de materiais. Cadastre e escolha o material no item.'
    });
  }

  function refDe(p) { return p.tipo === 'MATERIAL' ? p.colecao + '_' + p.itemKey : p.campo; }

  // Grava (update com caminhos planos) a pendência nova ou reaviso da que já existe.
  function gravacaoAviso(atual, nova) {
    var k = chave(nova.produtoKey, refDe(nova));
    var up = {};
    if (atual && atual.status === 'ABERTA') {
      up['pendencias_setor/' + k + '/ultimoAvisoEm'] = nova.ultimoAvisoEm;
      up['pendencias_setor/' + k + '/ultimoAvisoPor'] = nova.ultimoAvisoPor;
      up['pendencias_setor/' + k + '/avisos'] = (Number(atual.avisos) || 1) + 1;
    } else {
      up['pendencias_setor/' + k] = nova;
    }
    return up;
  }

  function gravacaoResolvida(k, autor, agora, como) {
    var up = {};
    up['pendencias_setor/' + k + '/status'] = 'RESOLVIDA';
    up['pendencias_setor/' + k + '/resolvidaEm'] = agora;
    up['pendencias_setor/' + k + '/resolvidaPor'] = autor || '';
    up['pendencias_setor/' + k + '/resolvidaComo'] = como || '';
    return up;
  }

  // Pendência aberta que o cadastro já resolveu (dado preenchido / item com material cadastrado).
  // codigoNoCadastro(codigo) → boolean, do chamador (ItensCadastro).
  function jaResolvida(p, dados) {
    var d = dados || {};
    if (!p || p.status !== 'ABERTA') return false;
    if (p.tipo === 'DADO_PRODUTO') return campoPreenchido(d.produto, p.campo);
    if (p.tipo === 'MATERIAL') {
      var it = d.item || {};
      var cod = p.colecao === 'bom' ? it.materialCodigo : it.mpCodigo;
      return !!(cod && d.codigoNoCadastro && d.codigoNoCadastro(cod));
    }
    return false;
  }

  function abertasDoSetor(todas, setores) {
    var alvo = [].concat(setores || []);
    return Object.keys(todas || {}).map(function(k) { return [k, todas[k]]; })
      .filter(function(e) { return e[1] && e[1].status === 'ABERTA' && (!alvo.length || alvo.indexOf(e[1].setor) >= 0); })
      .sort(function(a, b) { return (b[1].obrigatorio ? 1 : 0) - (a[1].obrigatorio ? 1 : 0) || txt(a[1].criadoEm).localeCompare(txt(b[1].criadoEm)); });
  }

  return {
    SETORES: SETORES, CAMPOS: CAMPOS, UNIDADES_VOLUME: UNIDADES_VOLUME,
    campoPreenchido: campoPreenchido, faltasDoProduto: faltasDoProduto, validarValor: validarValor, chave: chave, refDe: refDe,
    pendenciaDeCampo: pendenciaDeCampo, pendenciaDeItem: pendenciaDeItem, gravacaoAviso: gravacaoAviso,
    gravacaoResolvida: gravacaoResolvida, jaResolvida: jaResolvida, abertasDoSetor: abertasDoSetor
  };
});
