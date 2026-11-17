/* ══════════════════════════════════════════════════════════════════════
   REMONTAR PALETE E PLANEJAR A CARGA POR ROTA (16/11/2026)

   Pedido do Gustavo e do Vicenzo (caso Bioflora): "vamos ter que remontar
   para atender o frete do cliente" -- uma função para reordenar e remontar
   paletes, editar como um CRUD. O frete do cliente veio em rotas (PF, GVT)
   com N caixas de cada produto por rota e a sobra numa 3ª rota; o estoque
   tinha um palete por lote.

   O que este módulo faz (decisões do usuário em 16/11):
   - TRANSFERIR caixas de um palete para outro. Mesmo lote do produto e
     mesma condição (Qualidade, pedido, dono) => junta no mesmo registro.
     Lote diferente => palete MISTO: o lote vira um registro próprio com a
     identificação física do palete de destino ("pode juntar lotes
     diferentes num palete só, cada lote rastreado separado").
   - o total de cada lote nunca muda; a caixa parcial é UMA caixa física
     (vai inteira); nada se apaga (palete esvaziado fica com saldo 0 e o
     histórico da remontagem);
   - palete numa carga agendada não se mexe: tire-o da carga antes
     (Acompanhamento › Editar paletes da carga);
   - PLANO POR ROTA: dadas as caixas de cada produto por rota, diz quais
     paletes vão inteiros, de quais tirar caixas e quanto sobra (a "3ª
     rota" da planilha) ou falta.

   Funções puras (sem DOM); executar() grava com o SDK do navegador, no
   mesmo padrão do desmembrar (a regra de estoque_lotes já libera a
   Logística). Todo registro novo é cópia do de origem: propriedade, destino,
   loteInterno, Qualidade, validade e pedido seguem junto.
   ══════════════════════════════════════════════════════════════════════ */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RemontarPalete = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var MOTIVO = 'REMONTAGEM DE PALETE';

  function inteiro(v) { var n = Number(v); return Number.isFinite(n) && Math.floor(n) === n ? n : NaN; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function limpaChave(v) { return String(v == null ? '' : v).replace(/[^A-Za-z0-9_-]/g, '_'); }
  function limpaId(v) { return String(v == null ? '' : v).replace(/[^A-Za-z0-9 ._\/-]/g, '').trim().toUpperCase().slice(0, 40); }
  function erro(msg) { var e = new Error(msg); e.remontar = true; return e; }

  function composicao(lote) {
    lote = lote || {};
    var caixas = inteiro(lote.caixasFechadas || 0), multiplo = inteiro(lote.unidadesPorCaixa), parcial = inteiro(lote.unidadesCaixaParcial || 0), saldo = Number(lote.saldoLote);
    if (!(caixas >= 0) || !(parcial >= 0) || !Number.isFinite(saldo) || saldo < 0) return null;
    if (caixas > 0 && !(multiplo > 0)) return null;
    if (multiplo > 0 && parcial >= multiplo) return null;
    if (caixas * (multiplo > 0 ? multiplo : 0) + parcial !== saldo) return null;
    return {caixas: caixas, multiplo: multiplo > 0 ? multiplo : null, parcial: parcial, saldo: saldo};
  }

  // Mesmo lote do produto e mesma condição: pode virar um registro só.
  function mesmaCondicao(a, b) {
    a = a || {}; b = b || {};
    var lote = function(l) { return String(l.opKey || l.opLote || l.loteOrigem || ''); };
    var q = function(l) { return String(l.status || '') + '|' + String((l.qualidade || {}).decisao || ''); };
    var dono = function(l) { return JSON.stringify(l.propriedade || null) + '|' + String(l.skuPedidoKey || '') + '|' + String(l.loteInterno || ''); };
    return !!lote(a) && lote(a) === lote(b) && a.itemCodigo === b.itemCodigo && q(a) === q(b) && dono(a) === dono(b) &&
      Number(a.unidadesPorCaixa || 0) === Number(b.unidadesPorCaixa || 0);
  }

  function identificadoresUsados(estoqueLotes) {
    var s = {};
    Object.keys(estoqueLotes || {}).forEach(function(i) {
      Object.keys(estoqueLotes[i] || {}).forEach(function(k) { var l = estoqueLotes[i][k]; if (l && l.identificadorPalete) s[String(l.identificadorPalete).toUpperCase()] = true; });
    });
    return s;
  }
  function novaChave(lote, lotesDoItem) {
    var prefixo = 'pa_' + limpaChave(lote.opKey || lote.opLote || 'remontagem') + '_p';
    var maior = 0;
    Object.keys(lotesDoItem || {}).forEach(function(k) { var m = /_p(\d+)$/.exec(k); if (m && k.indexOf(prefixo) === 0) maior = Math.max(maior, Number(m[1])); });
    var n = maior, chave;
    do { n++; chave = prefixo + n; } while ((lotesDoItem || {})[chave]);
    return {chave: chave, numero: n};
  }
  function novoIdentificador(origem, usados) {
    var base = String(origem.identificadorPalete || '').replace(/-P\d+$/i, '') || ('PA-' + limpaChave(origem.opLote || origem.opKey || 'LOTE'));
    var n = 1, id;
    do { n++; id = (base + '-P' + n).toUpperCase(); } while (usados[id]);
    return id;
  }

  /* Plano de uma transferência. Não muta nada.
     req: {itemKey, loteKey, caixas, parcial (bool), destino: {tipo: 'REGISTRO'|'PALETE'|'NOVO', itemKey?, loteKey?, identificador?, enderecoKey?, enderecoCodigo?}}
     base: {estoque_lotes}; ctx: {autor, agora, motivo, emCarga(itemKey, loteKey)} */
  function planejar(base, req, ctx) {
    ctx = ctx || {}; req = req || {};
    var lotes = (base && base.estoque_lotes) || {};
    var itemKey = req.itemKey, loteKey = req.loteKey;
    var origem = (lotes[itemKey] || {})[loteKey];
    if (!origem) throw erro('Palete de origem não encontrado. Atualize a tela.');
    if (ctx.emCarga && ctx.emCarga(itemKey, loteKey)) throw erro('O palete ' + (origem.identificadorPalete || loteKey) + ' está numa carga agendada. Tire-o da carga (Acompanhamento › Editar paletes) antes de remontar.');
    var c = composicao(origem);
    if (!c) throw erro('A composição do palete ' + (origem.identificadorPalete || loteKey) + ' não fecha com o saldo (caixas × unidades + parcial). Corrija antes de remontar.');
    var cx = inteiro(req.caixas === '' || req.caixas == null ? 0 : req.caixas), levaParcial = !!req.parcial;
    if (!(cx >= 0)) throw erro('Informe as caixas a transferir (número inteiro).');
    if (cx > c.caixas) throw erro('O palete ' + (origem.identificadorPalete || loteKey) + ' tem só ' + c.caixas + ' caixa(s) fechada(s).');
    if (levaParcial && !(c.parcial > 0)) throw erro('Este palete não tem caixa parcial.');
    var qtd = cx * (c.multiplo || 0) + (levaParcial ? c.parcial : 0);
    if (!(qtd > 0)) throw erro('Nada a transferir: informe caixas ou a caixa parcial.');
    var destino = req.destino || {};
    var agora = ctx.agora || new Date().toISOString(), autor = ctx.autor || null, motivo = String(ctx.motivo || MOTIVO).slice(0, 200);
    var opId = ctx.operacaoId || ('rm_' + Date.now().toString(36));
    var plano = {itemKey: itemKey, loteKey: loteKey, qtd: qtd, caixas: cx, parcial: levaParcial ? c.parcial : 0,
      antes: {caixasFechadas: c.caixas, unidadesCaixaParcial: c.parcial, saldoLote: c.saldo}};
    plano.origemDepois = {caixasFechadas: c.caixas - cx, unidadesCaixaParcial: levaParcial ? 0 : c.parcial, saldoLote: c.saldo - qtd, atualizadoEm: agora};

    var registro = destino.tipo === 'REGISTRO' ? (lotes[destino.itemKey] || {})[destino.loteKey] : null;
    if (destino.tipo === 'REGISTRO') {
      if (!registro) throw erro('Palete de destino não encontrado. Atualize a tela.');
      if (destino.itemKey === itemKey && destino.loteKey === loteKey) throw erro('Origem e destino são o mesmo palete.');
      if (ctx.emCarga && ctx.emCarga(destino.itemKey, destino.loteKey)) throw erro('O palete de destino ' + (registro.identificadorPalete || destino.loteKey) + ' está numa carga agendada. Tire-o da carga antes.');
    }
    var identificador, enderecoKey, enderecoCodigo;
    if (registro) { identificador = registro.identificadorPalete || destino.loteKey; enderecoKey = registro.enderecoKey; enderecoCodigo = registro.enderecoCodigo; }
    else if (destino.tipo === 'PALETE') {
      identificador = limpaId(destino.identificador);
      if (!identificador) throw erro('Informe a identificação do palete de destino.');
      enderecoKey = destino.enderecoKey || origem.enderecoKey; enderecoCodigo = destino.enderecoCodigo || origem.enderecoCodigo;
    } else if (destino.tipo === 'NOVO') {
      var usados = identificadoresUsados(lotes);
      identificador = destino.identificador ? limpaId(destino.identificador) : novoIdentificador(origem, usados);
      if (!identificador) throw erro('Identificação do palete novo inválida.');
      if (destino.identificador && usados[identificador]) throw erro('Já existe um palete ' + identificador + '. Escolha "palete existente" ou outra identificação.');
      enderecoKey = destino.enderecoKey || origem.enderecoKey; enderecoCodigo = destino.enderecoCodigo || origem.enderecoCodigo;
    } else throw erro('Escolha o destino das caixas.');

    // Junta no mesmo registro: mesmo item, mesmo lote, mesma condição e mesmo palete físico.
    var alvo = null;
    if (registro && destino.itemKey === itemKey && mesmaCondicao(origem, registro)) alvo = {loteKey: destino.loteKey, lote: registro};
    if (!alvo && (destino.tipo === 'PALETE' || registro)) {
      var doItem = lotes[itemKey] || {};
      Object.keys(doItem).some(function(k) {
        var l = doItem[k];
        if (k !== loteKey && l && String(l.identificadorPalete || '').toUpperCase() === String(identificador).toUpperCase() && mesmaCondicao(origem, l)) { alvo = {loteKey: k, lote: l}; return true; }
        return false;
      });
    }
    plano.identificadorDestino = identificador;
    var registroHist = {em: agora, por: autor, motivo: motivo, qtd: qtd, caixas: cx, parcial: plano.parcial,
      de: origem.identificadorPalete || loteKey, para: identificador};
    if (alvo) {
      var ca = composicao(alvo.lote);
      if (!ca) throw erro('A composição do palete de destino não fecha com o saldo. Corrija antes de juntar.');
      if (plano.parcial > 0 && ca.parcial > 0) throw erro('O palete de destino já tem uma caixa parcial deste lote: um palete leva no máximo uma caixa parcial por lote. Junte as unidades nas caixas fisicamente e corrija a contagem antes.');
      plano.destinoKey = alvo.loteKey;
      plano.destinoAntes = {caixasFechadas: ca.caixas, unidadesCaixaParcial: ca.parcial, saldoLote: ca.saldo};
      plano.destinoDepois = {caixasFechadas: ca.caixas + cx, unidadesCaixaParcial: ca.parcial + plano.parcial, saldoLote: ca.saldo + qtd, atualizadoEm: agora};
      plano.juntou = true;
    } else {
      var nova = novaChave(origem, lotes[itemKey]);
      var filho = clone(origem);
      delete filho.desmembramento; delete filho.historicoRemontagem;
      filho.identificadorPalete = identificador; filho.paleteNumero = nova.numero;
      filho.enderecoKey = enderecoKey || null; filho.enderecoCodigo = enderecoCodigo || null;
      filho.caixasFechadas = cx; filho.unidadesCaixaParcial = plano.parcial; filho.saldoLote = qtd; filho.qtdOriginal = qtd;
      filho.atualizadoEm = agora; filho.criadoPor = origem.criadoPor || autor;
      filho.remontagem = {deLoteKey: loteKey, deIdentificador: origem.identificadorPalete || null, em: agora, por: autor, motivo: motivo,
        paleteMisto: destino.tipo !== 'NOVO' && !alvo ? true : null};
      plano.destinoKey = nova.chave;
      plano.destinoNovo = filho;
      plano.juntou = false;
    }
    plano.historico = {id: limpaChave(opId), dados: registroHist};
    plano.movimento = {tipo: 'transferencia', motivo: motivo, qtd: qtd, saldoApos: null,
      ref: (origem.identificadorPalete || loteKey) + ' -> ' + identificador, loteKey: plano.destinoKey,
      enderecoKey: enderecoKey || null, enderecoCodigo: enderecoCodigo || null,
      itemTipo: origem.itemTipo || null, itemCodigo: origem.itemCodigo || null, itemNome: origem.itemNome || null, unidade: origem.unidade || 'un',
      autor: autor, em: agora};
    return plano;
  }

  /* Grava: (1) reserva a origem numa transação (nada mudou desde a tela), (2)
     aplica o destino (transação no registro que junta, ou cria o novo), (3)
     movimento de estoque. Falhou o (2): a origem volta ao que era. */
  function executar(db, req, ctx) {
    ctx = ctx || {};
    return db.ref('estoque_lotes/' + req.itemKey).once('value').then(function(snap) {
      var lotesItem = snap.val() || {};
      var lotesDest = req.destino && req.destino.tipo === 'REGISTRO' && req.destino.itemKey !== req.itemKey
        ? db.ref('estoque_lotes/' + req.destino.itemKey).once('value').then(function(s) { return s.val() || {}; }) : Promise.resolve(null);
      return Promise.all([lotesItem, lotesDest, ctx.todosLotes ? Promise.resolve(ctx.todosLotes) : db.ref('estoque_lotes').once('value').then(function(s) { return s.val() || {}; })]);
    }).then(function(r) {
      var todos = r[2] || {};
      var base = {estoque_lotes: Object.assign({}, todos)};
      base.estoque_lotes[req.itemKey] = r[0];
      if (r[1]) base.estoque_lotes[req.destino.itemKey] = r[1];
      var plano = planejar(base, req, ctx);
      var origemRef = db.ref('estoque_lotes/' + req.itemKey + '/' + req.loteKey);
      var falhou = null;
      return origemRef.transaction(function(atual) {
        if (!atual) return atual;
        falhou = null;
        if (Number(atual.saldoLote) !== plano.antes.saldoLote || Number(atual.caixasFechadas || 0) !== plano.antes.caixasFechadas ||
            Number(atual.unidadesCaixaParcial || 0) !== plano.antes.unidadesCaixaParcial || (atual.remontagemEmAndamento)) {
          falhou = 'O palete de origem mudou enquanto você montava a transferência. Atualize a tela e refaça.';
          return;
        }
        Object.keys(plano.origemDepois).forEach(function(k) { atual[k] = plano.origemDepois[k]; });
        atual.historicoRemontagem = atual.historicoRemontagem || {};
        atual.historicoRemontagem[plano.historico.id] = Object.assign({papel: 'ORIGEM'}, plano.historico.dados);
        atual.remontagemEmAndamento = true;
        return atual;
      }, undefined, false).then(function(res) {
        if (!res.committed) throw erro(falhou || 'Não foi possível reservar o palete de origem. Atualize a tela e tente de novo.');
        var passoDestino;
        if (plano.juntou) {
          var falhouDest = null;
          passoDestino = db.ref('estoque_lotes/' + req.itemKey + '/' + plano.destinoKey).transaction(function(atual) {
            if (!atual) return atual;
            falhouDest = null;
            if (Number(atual.saldoLote) !== plano.destinoAntes.saldoLote || Number(atual.caixasFechadas || 0) !== plano.destinoAntes.caixasFechadas ||
                Number(atual.unidadesCaixaParcial || 0) !== plano.destinoAntes.unidadesCaixaParcial) { falhouDest = 'O palete de destino mudou. Atualize a tela e refaça.'; return; }
            Object.keys(plano.destinoDepois).forEach(function(k) { atual[k] = plano.destinoDepois[k]; });
            atual.historicoRemontagem = atual.historicoRemontagem || {};
            atual.historicoRemontagem[plano.historico.id] = Object.assign({papel: 'DESTINO'}, plano.historico.dados);
            return atual;
          }, undefined, false).then(function(rd) { if (!rd.committed) throw erro(falhouDest || 'Não foi possível gravar no palete de destino.'); });
        } else {
          var novo = clone(plano.destinoNovo);
          novo.historicoRemontagem = {}; novo.historicoRemontagem[plano.historico.id] = Object.assign({papel: 'DESTINO'}, plano.historico.dados);
          passoDestino = db.ref('estoque_lotes/' + req.itemKey + '/' + plano.destinoKey).transaction(function(atual) {
            if (atual) return;  // a chave nova já existe: não sobrescreve
            return novo;
          }, undefined, false).then(function(rd) { if (!rd.committed) throw erro('Outro palete foi criado com a mesma chave agora. Atualize a tela e refaça.'); });
        }
        return passoDestino.then(function() {
          var u = {};
          var mov = db.ref('movimentos_estoque/' + req.itemKey).push().key;
          u['movimentos_estoque/' + req.itemKey + '/' + mov] = plano.movimento;
          u['estoque_lotes/' + req.itemKey + '/' + req.loteKey + '/remontagemEmAndamento'] = null;
          return db.ref().update(u);
        }, function(e) {
          // Desfaz a origem.
          return origemRef.transaction(function(atual) {
            if (!atual) return atual;
            atual.caixasFechadas = plano.antes.caixasFechadas; atual.unidadesCaixaParcial = plano.antes.unidadesCaixaParcial; atual.saldoLote = plano.antes.saldoLote;
            if (atual.historicoRemontagem) delete atual.historicoRemontagem[plano.historico.id];
            delete atual.remontagemEmAndamento;
            return atual;
          }, undefined, false).then(function() { throw erro((e && e.message) || 'Falha ao gravar o destino; o palete de origem foi mantido.'); });
        }).then(function() { return plano; });
      });
    });
  }

  /* ── Plano por rota ──────────────────────────────────────────────────
     paletes: [{itemKey, loteKey, lote}] disponíveis (mesmo cliente, fora de carga).
     rotas: [{nome, caixas: {SKU: n}}] na ordem de prioridade.
     Devolve, por SKU: disponível, pedido por rota, sobra/falta; por rota: os
     paletes que vão INTEIROS e as caixas a TIRAR de um palete (operações). */
  function planejarRotas(paletes, rotas) {
    var porSku = {};
    (paletes || []).forEach(function(p) {
      var l = p && p.lote; if (!l) return;
      var c = composicao(l); if (!c) return;
      var sku = l.itemCodigo || p.itemKey;
      (porSku[sku] = porSku[sku] || {sku: sku, nome: l.itemNome || '', paletes: [], disponivel: 0, parciais: 0}).paletes.push({itemKey: p.itemKey, loteKey: p.loteKey,
        identificador: l.identificadorPalete || p.loteKey, lote: l.opLote || l.loteOrigem || '', caixas: c.caixas, parcial: c.parcial, multiplo: c.multiplo, restam: c.caixas});
      porSku[sku].disponivel += c.caixas; if (c.parcial) porSku[sku].parciais++;
    });
    var nomes = (rotas || []).map(function(r) { return limpaId(r.nome) || 'ROTA'; });
    var resultado = {skus: [], rotas: nomes.map(function(n) { return {nome: n, inteiros: [], transferencias: [], caixas: 0}; }), operacoes: []};
    var todosSkus = {};
    Object.keys(porSku).forEach(function(s) { todosSkus[s] = true; });
    (rotas || []).forEach(function(r) { Object.keys(r.caixas || {}).forEach(function(s) { if (Number(r.caixas[s]) > 0) todosSkus[s] = true; }); });
    Object.keys(todosSkus).sort().forEach(function(sku) {
      var g = porSku[sku] || {sku: sku, nome: '', paletes: [], disponivel: 0, parciais: 0};
      // Maiores primeiro: menos paletes divididos.
      var fila = g.paletes.slice().sort(function(a, b) { return b.caixas - a.caixas || String(a.identificador).localeCompare(String(b.identificador)); });
      var pedidoTotal = 0, linha = {sku: sku, nome: g.nome, disponivel: g.disponivel, porRota: [], parciais: g.parciais};
      (rotas || []).forEach(function(r, ri) {
        var pedido = Math.max(0, inteiro(Number((r.caixas || {})[sku]) || 0) || 0), falta = pedido;
        pedidoTotal += pedido;
        var atendido = 0;
        fila.forEach(function(p) {
          if (falta <= 0 || p.restam <= 0) return;
          if (p.restam <= falta && p.restam === p.caixas) {
            // Palete inteiro para a rota (a caixa parcial dele vai junto).
            resultado.rotas[ri].inteiros.push({itemKey: p.itemKey, loteKey: p.loteKey, identificador: p.identificador, sku: sku, caixas: p.caixas, parcial: p.parcial});
            falta -= p.restam; atendido += p.restam; p.restam = 0; p.inteiro = nomes[ri];
            return;
          }
          var tira = Math.min(p.restam, falta);
          var destinoId = ('R-' + nomes[ri] + '-' + sku).toUpperCase().slice(0, 40);
          resultado.rotas[ri].transferencias.push({itemKey: p.itemKey, loteKey: p.loteKey, identificador: p.identificador, sku: sku, caixas: tira, destino: destinoId});
          resultado.operacoes.push({rota: nomes[ri], sku: sku, itemKey: p.itemKey, loteKey: p.loteKey, de: p.identificador, caixas: tira, parcial: false,
            destino: {tipo: 'PALETE', identificador: destinoId}});
          falta -= tira; atendido += tira; p.restam -= tira;
        });
        resultado.rotas[ri].caixas += atendido;
        linha.porRota.push({rota: nomes[ri], pedido: pedido, atendido: atendido, falta: falta});
      });
      linha.pedido = pedidoTotal;
      linha.sobra = g.disponivel - pedidoTotal;  // negativo = falta (a planilha mostrava -836)
      linha.sobraPaletes = fila.filter(function(p) { return p.restam > 0 || (p.parcial && !p.inteiro); }).map(function(p) {
        return {identificador: p.identificador, caixas: p.restam, parcial: p.inteiro ? 0 : p.parcial};
      });
      resultado.skus.push(linha);
    });
    return resultado;
  }

  return {composicao: composicao, mesmaCondicao: mesmaCondicao, planejar: planejar, executar: executar, planejarRotas: planejarRotas, MOTIVO: MOTIVO};
});
