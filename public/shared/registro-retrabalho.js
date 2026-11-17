/* ══════════════════════════════════════════════════════════════════════
   REGISTRO RETROSPECTIVO DE RETRABALHO (16/11/2026)
   Prompt: PROMPT_RNC_RETRABALHO_26302_01.md. Primeiro caso: envase trocado
   da OP 26302/01 (Rose Absolut) com o granel do Sunrise Muse.

   É DOCUMENTO, não execução. O retrabalho já aconteceu e o pedido já
   seguiu: o registro amarra a RNC, as etapas (identificação, retrabalho,
   envase de retrabalho) e o balanço de quantidades, e não mexe em OP,
   pedido, estoque, palete, conferência, expedição nem linha. Por isso não é
   uma OP de retrabalho (shared/retrabalho-op.js), que entraria na
   Conferência de PA e na fila das linhas, nem usa retrabalhos/ (ocupa linha).

   Regra que fecha o caso: qtd de origem = Σ destinos + Σ perdas, e em cada
   etapa entrada = saída + perda. Sem isso não sai de EM_PREENCHIMENTO.

   Funções PURAS (sem DOM, sem Firebase). Cópia byte a byte em
   functions/registro_retrabalho_motor.js (conferida em
   run_registro_retrabalho_test.js). Gravação só pela callable
   `registroRetrabalho` (functions/registro_retrabalho.js).
   ══════════════════════════════════════════════════════════════════════ */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RegistroRetrabalho = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var STATUS = {
    EM_PREENCHIMENTO: 'Em preenchimento',
    AGUARDANDO_DECISAO: 'Aguardando decisão',
    ENCERRADO: 'Encerrado'
  };
  var ACOES = {CRIAR: 'Abrir registro', SALVAR: 'Salvar', ENVIAR: 'Enviar para decisão', REABRIR: 'Devolver ao preenchimento', ENCERRAR: 'Encerrar'};
  var TIPOS_ETAPA = {
    IDENTIFICACAO_RNC: 'Identificação e segregação (RNC)',
    RETRABALHO: 'Retrabalho (desenvase / reclassificação)',
    ENVASE_RETRABALHO: 'Envase de retrabalho'
  };
  var ORDEM_ETAPAS = ['IDENTIFICACAO_RNC', 'RETRABALHO', 'ENVASE_RETRABALHO'];
  var MOTIVOS_PERDA = {
    PERDA_DESENVASE: 'Perda no desenvase',
    DESCARTE: 'Descarte',
    AMOSTRA_RETENCAO: 'Amostra de retenção / análise',
    QUEBRA: 'Quebra / avaria',
    ERRO_CONTAGEM: 'Erro de contagem',
    OUTRO: 'Outro (descrever)'
  };
  var LIMITE_TEXTO = 2000;

  function erro(code, message) { var e = new Error(message); e.code = code; return e; }
  function texto(v, max) { return String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, max || 300); }
  function qtd(v) {
    if (v === '' || v == null) return null;
    var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return isFinite(n) ? Math.round(n * 1000) / 1000 : NaN;
  }
  function num(v) { var n = qtd(v); return n == null || isNaN(n) ? 0 : n; }
  function milhar(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  // Nome legível dos campos que o histórico guarda (relatório e tela).
  var CAMPOS = {status: 'Situação', descricao: 'Descrição', ocorridaEm: 'Data da ocorrência', origem: 'Origem',
    destinos: 'Destinos', perdas: 'Perdas', etapas: 'Etapas', decisao: 'Decisão'};
  function chaveSegura(v) { return String(v == null ? '' : v).replace(/[.#$\[\]\/]/g, '-'); }
  // O RTDB não grava objeto/array vazio: tudo que é lista chega como objeto, array ou ausente.
  function lista(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    return Object.keys(v).sort().map(function(k) { return Object.assign({_k: k}, v[k]); });
  }
  function clonar(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  /* ── Permissão ──────────────────────────────────────────────────────
     Qualidade por role, funcoes OU modulos: o `PODE_DECIDIR` de
     functions/retrabalhos.js só olha role, e foi esse o defeito do caso
     Yasmin (multi-função, 13/11). Leitura também para PCP e Logística. */
  function perfil(u) {
    var ativo = !!u && !!u.role && u.role !== 'pending' && u.role !== 'tv' && u.desativado !== true;
    var f = (u && u.funcoes) || {}, m = (u && u.modulos) || {};
    var admin = ativo && (u.role === 'admin' || f.admin === true);
    var qualidade = ativo && (u.role === 'qualidade' || f.qualidade === true || m.qualidade === true);
    var leitor = ativo && (admin || qualidade || u.role === 'pcp' || f.pcp === true ||
      u.role === 'logistica' || f.logistica === true || m.logistica === true);
    return {ativo: ativo, admin: admin, qualidade: qualidade, edita: admin || qualidade, le: leitor};
  }

  /* ── Estrutura ────────────────────────────────────────────────────── */
  function etapaVazia(tipo, n) {
    return {n: n, tipo: tipo, recurso: '', inicio: '', fim: '', responsaveis: '', procedimento: '',
      qtdEntrada: null, qtdSaida: null, qtdPerda: null, materiais: {}, evidencias: [], observacao: '',
      preenchidoPor: '', preenchidoEm: ''};
  }
  function etapasPadrao() {
    var o = {};
    ORDEM_ETAPAS.forEach(function(t, i) { o['e' + (i + 1)] = etapaVazia(t, i + 1); });
    return o;
  }
  // Etapas em ordem, sempre com os campos (o RTDB some com os vazios).
  function etapas(r) {
    var e = (r && r.etapas) || {};
    return Object.keys(e).sort().map(function(k) {
      var x = Object.assign(etapaVazia(e[k].tipo, e[k].n), e[k]);
      x._k = k; x.materiais = lista(e[k].materiais); x.evidencias = lista(e[k].evidencias);
      return x;
    });
  }

  /* ── Balanço ──────────────────────────────────────────────────────── */
  function balanco(r) {
    r = r || {};
    var origem = num((r.origem || {}).qtd);
    var destinos = lista(r.destinos), perdas = lista(r.perdas);
    var somaDest = destinos.reduce(function(s, d) { return s + num(d.qtd); }, 0);
    var somaPerda = perdas.reduce(function(s, p) { return s + num(p.qtd); }, 0);
    var dif = Math.round((origem - somaDest - somaPerda) * 1000) / 1000;
    var avisos = [];
    destinos.forEach(function(d) {
      if (d.qtdConferida != null && num(d.qtd) !== num(d.qtdConferida)) {
        avisos.push('Lote ' + (d.lote || '?') + ': informado ' + milhar(num(d.qtd)) + ' un., a Conferência de PA contou ' + milhar(num(d.qtdConferida)) + '.');
      }
    });
    var ets = etapas(r).map(function(e) {
      var ent = qtd(e.qtdEntrada), sai = qtd(e.qtdSaida), per = qtd(e.qtdPerda);
      var temNumeros = ent != null && sai != null;
      var d = temNumeros ? Math.round((num(ent) - num(sai) - num(per)) * 1000) / 1000 : null;
      return {k: e._k, n: e.n, tipo: e.tipo, entrada: ent, saida: sai, perda: per, diferenca: d, fecha: temNumeros && d === 0};
    });
    return {origem: origem, destinos: somaDest, perdas: somaPerda, diferenca: dif, fecha: dif === 0 && origem > 0,
      etapas: ets, avisos: avisos};
  }

  // O que falta para enviar à decisão. Lista vazia = pode enviar.
  function pendencias(r) {
    var out = [], b = balanco(r);
    if (!b.fecha) {
      out.push(b.origem > 0
        ? 'Balanço não fecha: origem ' + b.origem + ' − destinos ' + b.destinos + ' − perdas ' + b.perdas + ' = ' + b.diferenca + ' un. Declare o destino da diferença.'
        : 'Informe a quantidade de origem.');
    }
    lista((r || {}).perdas).forEach(function(p, i) {
      if (!MOTIVOS_PERDA[p.motivo]) out.push('Perda ' + (i + 1) + ': escolha o motivo.');
      if (p.motivo === 'OUTRO' && !texto(p.observacao)) out.push('Perda ' + (i + 1) + ': descreva o motivo "Outro".');
    });
    etapas(r).forEach(function(e, i) {
      var rot = 'Etapa ' + e.n + ' (' + (TIPOS_ETAPA[e.tipo] || e.tipo) + ')';
      if (!texto(e.responsaveis)) out.push(rot + ': informe os responsáveis.');
      if (!texto(e.inicio)) out.push(rot + ': informe o início.');
      if (!texto(e.procedimento)) out.push(rot + ': descreva o que foi feito.');
      var be = b.etapas[i];
      if (be.entrada == null || be.saida == null) out.push(rot + ': informe entrada e saída.');
      else if (!be.fecha) out.push(rot + ': entrada ' + be.entrada + ' ≠ saída ' + be.saida + ' + perda ' + num(be.perda) + ' (diferença ' + be.diferenca + ').');
    });
    return out;
  }

  /* ── Normalização do que vem do navegador ─────────────────────────── */
  function normalizarQtd(v, rotulo) {
    var n = qtd(v);
    if (n == null) return null;
    if (isNaN(n) || n < 0) throw erro('invalid-argument', rotulo + ': quantidade inválida.');
    return n;
  }
  function normalizarEtapa(atual, d) {
    d = d || {};
    var e = Object.assign({}, atual);
    ['recurso', 'responsaveis'].forEach(function(c) { if (c in d) e[c] = texto(d[c], 300); });
    ['inicio', 'fim'].forEach(function(c) {
      if (!(c in d)) return;
      var s = texto(d[c], 16);
      if (s && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s)) throw erro('invalid-argument', 'Etapa ' + e.n + ': data inválida.');
      e[c] = s;
    });
    ['procedimento', 'observacao'].forEach(function(c) { if (c in d) e[c] = texto(d[c], LIMITE_TEXTO); });
    [['qtdEntrada', 'entrada'], ['qtdSaida', 'saída'], ['qtdPerda', 'perda']].forEach(function(p) {
      if (p[0] in d) e[p[0]] = normalizarQtd(d[p[0]], 'Etapa ' + e.n + ' ' + p[1]);
    });
    if ('materiais' in d) {
      var m = {};
      lista(d.materiais).slice(0, 30).forEach(function(x, i) {
        var cod = texto(x.codigo, 60), nome = texto(x.nome, 200);
        if (!cod && !nome) return;
        m['m' + String(i + 1).padStart(2, '0')] = {codigo: cod, nome: nome,
          consumido: normalizarQtd(x.consumido, 'Material ' + (cod || nome)),
          recuperado: normalizarQtd(x.recuperado, 'Material ' + (cod || nome)),
          descartado: normalizarQtd(x.descartado, 'Material ' + (cod || nome))};
      });
      e.materiais = m;
    }
    if ('evidencias' in d) {
      e.evidencias = lista(d.evidencias).slice(0, 20).map(function(f) {
        return {url: texto(f.url, 1000), caminho: texto(f.caminho, 400), nomeOriginal: texto(f.nomeOriginal, 200),
          legenda: texto(f.legenda, 200), enviadoPor: texto(f.enviadoPor, 120), enviadoEm: texto(f.enviadoEm, 30)};
      }).filter(function(f) { return f.url && /^https:\/\//.test(f.url); });
    }
    delete e._k;
    return e;
  }

  /* ── Criação: snapshot do que o sistema já tem, sem tocar em nada ──
     ctx = {rnc, opOrigem, opsDestino: {opKey: op}, conferencias: {opKey: conf}}
     (lidos pelo servidor; aqui só copiados). */
  function montar(dados, ctx, ator, agora) {
    var d = dados || {}, c = ctx || {};
    var rncNumero = texto(d.rncNumero, 60);
    if (!rncNumero || !c.rnc) throw erro('invalid-argument', 'Escolha uma RNC existente.');
    var opKey = texto(d.opKeyOrigem, 60);
    var op = c.opOrigem;
    if (!opKey || !op) throw erro('invalid-argument', 'Escolha a OP de origem.');
    if (op.tipoOrdem === 'RETRABALHO') throw erro('invalid-argument', 'A origem é a OP original, não uma OP de retrabalho.');
    var qtdOrigem = normalizarQtd(d.qtdOrigem != null && d.qtdOrigem !== '' ? d.qtdOrigem : op.produzido, 'Origem');
    if (!qtdOrigem) throw erro('invalid-argument', 'Informe a quantidade de origem.');
    var destinos = {};
    var dd = lista(d.destinos);
    if (!dd.length) throw erro('invalid-argument', 'Informe ao menos um lote de destino.');
    dd.slice(0, 10).forEach(function(x, i) {
      var k = texto(x.opKey, 60), o = (c.opsDestino || {})[k];
      if (!k || !o) throw erro('invalid-argument', 'Destino ' + (i + 1) + ': OP não encontrada.');
      var conf = (c.conferencias || {})[k] || null;
      destinos['d' + (i + 1)] = {
        opKey: k, lote: o.lote || k, sku: o.sku || '', produto: o.produto || '',
        qtd: normalizarQtd(x.qtd, 'Destino ' + (i + 1)),
        qtdApontada: o.produzido != null ? num(o.produzido) : null,
        qtdConferida: conf && conf.qtdPaletizada != null ? num(conf.qtdPaletizada) : null,
        granelLote: texto(x.granelLote, 60), observacao: texto(x.observacao, 500)
      };
    });
    var relacionadas = {};
    lista(d.rncsRelacionadas).forEach(function(n) {
      var s = texto(typeof n === 'string' ? n : n.numero, 60);
      if (s && s !== rncNumero) relacionadas[chaveSegura(s)] = s;
    });
    return {
      status: 'EM_PREENCHIMENTO',
      retrospectivo: true, semEfeitoOperacional: true,
      rncNumero: rncNumero,
      rncResumo: {status: c.rnc.status || '', classificacao: c.rnc.classificacao || '', opLoteNaRnc: c.rnc.opLote || '',
        qtdEnvolvida: c.rnc.qtdEnvolvida != null ? c.rnc.qtdEnvolvida : null, disposicao: c.rnc.disposicao || ''},
      rncsRelacionadas: relacionadas,
      descricao: texto(d.descricao, LIMITE_TEXTO),
      ocorridaEm: texto(d.ocorridaEm, 10),
      origem: {opKey: opKey, lote: op.lote || opKey, sku: op.sku || '', produto: op.produto || '', cliente: op.cliente || '',
        pedidoKey: op.skuPedidoKey || '', qtdPlanejada: op.qtdPlanejada != null ? num(op.qtdPlanejada) : null,
        qtdApontada: op.produzido != null ? num(op.produzido) : null, qtd: qtdOrigem},
      destinos: destinos,
      perdas: {},
      etapas: etapasPadrao(),
      criadoEm: agora, criadoPor: {uid: ator.uid, nome: ator.nome},
      atualizadoEm: agora, atualizadoPor: {uid: ator.uid, nome: ator.nome}
    };
  }

  // Diferença legível entre dois estados (para o histórico: antes/depois).
  function diferencas(antes, depois) {
    var out = {};
    ['status', 'descricao', 'ocorridaEm', 'origem', 'destinos', 'perdas', 'etapas', 'decisao'].forEach(function(c) {
      var a = JSON.stringify(antes ? antes[c] : null) || 'null', b = JSON.stringify(depois ? depois[c] : null) || 'null';
      if (a !== b) out[c] = {antes: a.slice(0, 4000), depois: b.slice(0, 4000)};
    });
    return out;
  }

  /* Aplica uma ação. Devolve {registro, evento}. Lança erro com code. */
  function aplicarAcao(atual, acao, ator, dados, agora, ctx) {
    if (!ACOES[acao]) throw erro('invalid-argument', 'Ação desconhecida.');
    var p = perfil(ator && ator.usuario);
    if (!p.ativo) throw erro('permission-denied', 'Seu acesso está inativo.');
    if (!p.edita) throw erro('permission-denied', 'Só a Qualidade (ou o administrador) registra o retrabalho.');
    var d = dados || {}, r;
    if (acao === 'CRIAR') {
      if (atual) throw erro('failed-precondition', 'Este registro já existe.');
      r = montar(d, ctx, ator, agora);
    } else {
      if (!atual) throw erro('not-found', 'Registro não encontrado.');
      if (atual.status === 'ENCERRADO') throw erro('failed-precondition', 'Este registro já foi encerrado.');
      r = clonar(atual); delete r.historico;
      if (acao === 'SALVAR') {
        if (r.status !== 'EM_PREENCHIMENTO') throw erro('failed-precondition', 'O registro está aguardando decisão. Devolva ao preenchimento para editar.');
        if ('descricao' in d) r.descricao = texto(d.descricao, LIMITE_TEXTO);
        if ('ocorridaEm' in d) r.ocorridaEm = texto(d.ocorridaEm, 10);
        if (d.origem && 'qtd' in d.origem) {
          var q = normalizarQtd(d.origem.qtd, 'Origem');
          if (!q) throw erro('invalid-argument', 'Informe a quantidade de origem.');
          r.origem.qtd = q;
        }
        if (d.destinos) {
          Object.keys(d.destinos).forEach(function(k) {
            if (!r.destinos || !r.destinos[k]) throw erro('invalid-argument', 'Destino desconhecido.');
            var x = d.destinos[k] || {};
            if ('qtd' in x) r.destinos[k].qtd = normalizarQtd(x.qtd, 'Destino ' + r.destinos[k].lote);
            if ('granelLote' in x) r.destinos[k].granelLote = texto(x.granelLote, 60);
            if ('observacao' in x) r.destinos[k].observacao = texto(x.observacao, 500);
          });
        }
        if ('perdas' in d) {
          var pe = {};
          lista(d.perdas).slice(0, 20).forEach(function(x, i) {
            var qv = normalizarQtd(x.qtd, 'Perda ' + (i + 1));
            if (qv == null && !x.motivo && !texto(x.observacao)) return;
            pe['p' + String(i + 1).padStart(2, '0')] = {motivo: MOTIVOS_PERDA[x.motivo] ? x.motivo : '', qtd: qv == null ? 0 : qv, observacao: texto(x.observacao, 500)};
          });
          r.perdas = pe;
        }
        if (d.etapas) {
          Object.keys(d.etapas).forEach(function(k) {
            if (!r.etapas || !r.etapas[k]) throw erro('invalid-argument', 'Etapa desconhecida.');
            var e = normalizarEtapa(Object.assign(etapaVazia(r.etapas[k].tipo, r.etapas[k].n), r.etapas[k]), d.etapas[k]);
            e.preenchidoPor = ator.nome; e.preenchidoEm = agora;
            r.etapas[k] = e;
          });
        }
      } else if (acao === 'ENVIAR') {
        if (r.status !== 'EM_PREENCHIMENTO') throw erro('failed-precondition', 'O registro já foi enviado.');
        var falta = pendencias(r);
        if (falta.length) throw erro('failed-precondition', falta[0] + (falta.length > 1 ? ' (+' + (falta.length - 1) + ' pendência(s))' : ''));
        r.status = 'AGUARDANDO_DECISAO';
      } else if (acao === 'REABRIR') {
        if (r.status !== 'AGUARDANDO_DECISAO') throw erro('failed-precondition', 'Só um registro aguardando decisão volta ao preenchimento.');
        if (!texto(d.motivo)) throw erro('invalid-argument', 'Diga por que o registro volta ao preenchimento.');
        r.status = 'EM_PREENCHIMENTO';
      } else if (acao === 'ENCERRAR') {
        if (r.status !== 'AGUARDANDO_DECISAO') throw erro('failed-precondition', 'Envie o registro para decisão antes de encerrar.');
        if (pendencias(r).length) throw erro('failed-precondition', 'O balanço deixou de fechar. Devolva ao preenchimento.');
        var analise = texto(d.analise, LIMITE_TEXTO);
        if (!analise) throw erro('invalid-argument', 'Escreva a análise da Qualidade.');
        r.status = 'ENCERRADO';
        r.decisao = {analise: analise, conclusao: texto(d.conclusao, LIMITE_TEXTO), por: ator.nome, uid: ator.uid, em: agora};
      }
      r.atualizadoEm = agora; r.atualizadoPor = {uid: ator.uid, nome: ator.nome};
    }
    var evento = {acao: acao, em: agora, por: ator.nome, uid: ator.uid,
      motivo: acao === 'REABRIR' ? texto(d.motivo, 500) : null, mudou: diferencas(atual, r)};
    return {registro: r, evento: evento};
  }

  // Chave legível do registro: RR-{opKey}-{n}.
  function proximaChave(opKeyOrigem, existentes) {
    var base = 'RR-' + chaveSegura(opKeyOrigem).toUpperCase() + '-';
    var maior = 0;
    Object.keys(existentes || {}).forEach(function(k) {
      if (k.indexOf(base) !== 0) return;
      var n = parseInt(k.slice(base.length), 10);
      if (!isNaN(n) && n > maior) maior = n;
    });
    return base + (maior + 1);
  }

  return {
    STATUS: STATUS, ACOES: ACOES, CAMPOS: CAMPOS, TIPOS_ETAPA: TIPOS_ETAPA, ORDEM_ETAPAS: ORDEM_ETAPAS, MOTIVOS_PERDA: MOTIVOS_PERDA,
    perfil: perfil, etapasPadrao: etapasPadrao, etapas: etapas, lista: lista,
    balanco: balanco, pendencias: pendencias, montar: montar, aplicarAcao: aplicarAcao,
    proximaChave: proximaChave, chaveSegura: chaveSegura
  };
});
