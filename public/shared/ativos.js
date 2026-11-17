/* Manutenção › Cadastro de Ativos (19/10/2026).

   Pedido do usuário: "talvez isto valha um módulo à parte, de manutenção, onde
   fazemos a gestão de ativos (máquinas e equipamentos) e podemos expandir pra
   de fato a área de manutenção. Os demais módulos do sistema consomem estes
   cadastros."

   Primeiro degrau: só o cadastro e a situação de cada equipamento. É o que a
   spec do CQ (ERP_Kuryos_Modulo_CQ_v1.1) precisa para a assepsia de reator e
   de linha (CK-3/CK-4) e para a calibração de instrumentos (CK-8): saber QUAL
   equipamento, de que linha, se pede assepsia e se pede calibração. Ordem de
   serviço, preventiva e MTBF/MTTR vêm depois, em cima deste mesmo cadastro.

   Gravação:
     ativos/{id}                 o equipamento (id = chave push)
     ativos_historico/{id}/{k}   cada mudança de situação (só acrescenta)
   Funções PURAS, testadas em run_ativos_test.js. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ativos = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  /* Tipos de equipamento. `assepsia` e `calibracao` são o PADRÃO do tipo --
     cada ativo pode mudar. Os da manipulação e da linha de envase saem da
     spec (CK-3: tachos, espátulas, béqueres, homogeneizadores; CK-4:
     envasadora, fechadora, rotuladora, esteira, bicos, mangueiras); os de
     calibração, do CK-8 e da revisão da Qualidade em 17/09 (balanças,
     estufas, pHmetro, termo-higrômetro, régua de 30/60 cm). */
  var TIPOS = {
    REATOR:          {rotulo: 'Reator',                          sigla: 'RT', area: 'MANIPULACAO', assepsia: true,  calibracao: false, unidade: 'kg'},
    TACHO:           {rotulo: 'Tacho / tanque',                  sigla: 'TC', area: 'MANIPULACAO', assepsia: true,  calibracao: false, unidade: 'kg'},
    HOMOGENEIZADOR:  {rotulo: 'Homogeneizador / misturador',     sigla: 'HM', area: 'MANIPULACAO', assepsia: true,  calibracao: false, unidade: ''},
    UTENSILIO:       {rotulo: 'Utensílio (espátula, béquer...)', sigla: 'UT', area: 'MANIPULACAO', assepsia: true,  calibracao: false, unidade: ''},
    ENVASADORA:      {rotulo: 'Envasadora',                      sigla: 'EV', area: 'ENVASE',      assepsia: true,  calibracao: false, unidade: 'un/h'},
    FECHADORA:       {rotulo: 'Fechadora / tampadora',           sigla: 'FC', area: 'ENVASE',      assepsia: true,  calibracao: false, unidade: 'un/h'},
    ESTEIRA:         {rotulo: 'Esteira',                         sigla: 'ES', area: 'ENVASE',      assepsia: true,  calibracao: false, unidade: ''},
    ROTULADORA:      {rotulo: 'Rotuladora',                      sigla: 'RO', area: 'ROTULAGEM',   assepsia: false, calibracao: false, unidade: 'un/h'},
    CODIFICADORA:    {rotulo: 'Codificadora / datador',          sigla: 'CD', area: 'ENVASE',      assepsia: false, calibracao: false, unidade: ''},
    BALANCA:         {rotulo: 'Balança',                         sigla: 'BL', area: 'LABORATORIO', assepsia: false, calibracao: true,  unidade: 'kg'},
    PHMETRO:         {rotulo: 'pHmetro',                         sigla: 'PH', area: 'LABORATORIO', assepsia: false, calibracao: true,  unidade: ''},
    TERMOHIGROMETRO: {rotulo: 'Termo-higrômetro',                sigla: 'TH', area: 'LABORATORIO', assepsia: false, calibracao: true,  unidade: ''},
    ESTUFA:          {rotulo: 'Estufa',                          sigla: 'EF', area: 'LABORATORIO', assepsia: false, calibracao: true,  unidade: ''},
    VISCOSIMETRO:    {rotulo: 'Viscosímetro',                    sigla: 'VS', area: 'LABORATORIO', assepsia: false, calibracao: true,  unidade: ''},
    DENSIMETRO:      {rotulo: 'Densímetro / picnômetro',         sigla: 'DS', area: 'LABORATORIO', assepsia: false, calibracao: true,  unidade: ''},
    REGUA:           {rotulo: 'Régua / paquímetro',              sigla: 'RG', area: 'LABORATORIO', assepsia: false, calibracao: true,  unidade: ''},
    TORQUIMETRO:     {rotulo: 'Torquímetro',                     sigla: 'TQ', area: 'LABORATORIO', assepsia: false, calibracao: true,  unidade: ''},
    UTILIDADE:       {rotulo: 'Utilidade (compressor, deionizador...)', sigla: 'UD', area: 'UTILIDADES', assepsia: false, calibracao: false, unidade: ''},
    OUTRO:           {rotulo: 'Outro',                           sigla: 'OT', area: 'OUTRA',       assepsia: false, calibracao: false, unidade: ''}
  };
  var AREAS = {
    MANIPULACAO: 'Manipulação', ENVASE: 'Envase', ROTULAGEM: 'Rotulagem', LABORATORIO: 'Laboratório',
    ARMAZEM: 'Armazém', UTILIDADES: 'Utilidades', OUTRA: 'Outra'
  };
  var SITUACOES = {
    OPERACIONAL: {rotulo: 'Operacional', cor: 'ok'},
    EM_MANUTENCAO: {rotulo: 'Em manutenção', cor: 'warn'},
    INATIVO: {rotulo: 'Inativo', cor: 'mute'}
  };
  var PERIODICIDADE_PADRAO_MESES = 12; // spec D-08: calibração anual

  function txt(v) { return String(v == null ? '' : v).trim(); }
  function chave(s) { return txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' '); }
  function num(v) { if (v === '' || v == null) return null; var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; }
  function bool(v, padrao) { return v === true || v === false ? v : !!padrao; }

  function padroesDoTipo(tipo) { return TIPOS[tipo] || TIPOS.OUTRO; }

  function nomeFornecedor(f) { f = f || {}; return txt(f.nomeFantasia) || txt(f.razaoSocial) || ''; }

  /* Ativo pronto para gravar: textos limpos, código em maiúsculas, números.
     `fornecedores` (opcional, o nó inteiro): com ele, o fabricante e a
     assistência técnica escolhidos do cadastro (16/11/2026) gravam também o
     nome -- a lista e a busca não precisam ler fornecedores/ para mostrar. */
  function normalizar(f, fornecedores) {
    f = f || {};
    var tipo = TIPOS[f.tipo] ? f.tipo : 'OUTRO';
    var p = padroesDoTipo(tipo);
    var exigeCalibracao = bool(f.exigeCalibracao, p.calibracao);
    var per = num(f.calibracaoPeriodicidadeMeses);
    var fabKey = txt(f.fornecedorFabricanteKey) || null, assKey = txt(f.fornecedorAssistenciaKey) || null;
    var fabNome = fabKey && fornecedores && fornecedores[fabKey] ? nomeFornecedor(fornecedores[fabKey]) : txt(f.fornecedorFabricanteNome);
    var assNome = assKey && fornecedores && fornecedores[assKey] ? nomeFornecedor(fornecedores[assKey]) : txt(f.fornecedorAssistenciaNome);
    return {
      codigo: txt(f.codigo).toUpperCase().replace(/\s+/g, '-'),
      nome: txt(f.nome),
      tipo: tipo,
      area: AREAS[f.area] ? f.area : p.area,
      linha: txt(f.linha) || null,
      capacidade: num(f.capacidade),
      capacidadeUnidade: txt(f.capacidadeUnidade) || p.unidade || null,
      // Texto livre continua valendo (68 dos 70 ativos importados têm só o
      // texto); escolhido do cadastro, o nome do fornecedor preenche o vazio.
      fabricante: txt(f.fabricante) || fabNome || null,
      fornecedorFabricanteKey: fabKey,
      fornecedorFabricanteNome: fabKey ? (fabNome || null) : null,
      fornecedorAssistenciaKey: assKey,
      fornecedorAssistenciaNome: assKey ? (assNome || null) : null,
      modelo: txt(f.modelo) || null,
      numeroSerie: txt(f.numeroSerie) || null,
      patrimonio: txt(f.patrimonio) || null,
      dataAquisicao: txt(f.dataAquisicao) || null,
      situacao: SITUACOES[f.situacao] ? f.situacao : 'OPERACIONAL',
      exigeAssepsia: bool(f.exigeAssepsia, p.assepsia),
      exigeCalibracao: exigeCalibracao,
      calibracaoPeriodicidadeMeses: exigeCalibracao ? (per == null ? PERIODICIDADE_PADRAO_MESES : per) : null,
      obs: txt(f.obs) || null
    };
  }

  // Lista de erros (vazia = pode gravar). `existentes` = {id: ativo}.
  function validar(a, existentes, idAtual) {
    var erros = [];
    if (!a.codigo) erros.push('Informe o código (TAG) do equipamento.');
    if (!a.nome) erros.push('Informe o nome do equipamento.');
    if (!TIPOS[a.tipo]) erros.push('Escolha o tipo do equipamento.');
    if (!AREAS[a.area]) erros.push('Escolha a área.');
    if (a.capacidade != null && (isNaN(a.capacidade) || a.capacidade < 0)) erros.push('A capacidade precisa ser um número maior ou igual a zero.');
    if (a.exigeCalibracao && !(a.calibracaoPeriodicidadeMeses > 0)) erros.push('Informe de quantos em quantos meses o equipamento é calibrado.');
    if (a.codigo) {
      var dup = Object.keys(existentes || {}).find(function(k) {
        return k !== idAtual && existentes[k] && chave(existentes[k].codigo) === chave(a.codigo);
      });
      if (dup) erros.push('Já existe um equipamento com o código ' + a.codigo + ' (' + (existentes[dup].nome || '') + ').');
    }
    return erros;
  }

  // Próximo código livre da sigla do tipo: RT-01, RT-02... (só sugere).
  function sugerirCodigo(tipo, existentes) {
    var sigla = padroesDoTipo(tipo).sigla, maior = 0;
    Object.keys(existentes || {}).forEach(function(k) {
      var m = /^([A-Z]+)-(\d+)$/.exec(chave((existentes[k] || {}).codigo).replace(/ /g, ''));
      if (m && m[1] === sigla) maior = Math.max(maior, Number(m[2]));
    });
    return sigla + '-' + String(maior + 1).padStart(2, '0');
  }

  function lista(ativos) {
    return Object.keys(ativos || {}).map(function(k) { return Object.assign({id: k}, ativos[k]); })
      .filter(function(a) { return a && a.codigo; });
  }

  function resumo(ativos) {
    var r = {total: 0, porSituacao: {OPERACIONAL: 0, EM_MANUTENCAO: 0, INATIVO: 0}, porArea: {}, assepsia: 0, calibracao: 0};
    lista(ativos).forEach(function(a) {
      r.total++;
      var s = SITUACOES[a.situacao] ? a.situacao : 'OPERACIONAL';
      r.porSituacao[s]++;
      r.porArea[a.area] = (r.porArea[a.area] || 0) + 1;
      if (s !== 'INATIVO' && a.exigeAssepsia) r.assepsia++;
      if (s !== 'INATIVO' && a.exigeCalibracao) r.calibracao++;
    });
    return r;
  }

  /* f = {busca, tipo, area, situacao, linha, marcador} -- marcador:
     'assepsia' | 'calibracao' | 'EM_MANUTENCAO' | 'INATIVO'... */
  function filtrar(ativos, f) {
    f = f || {};
    var ps = chave(f.busca).split(' ').filter(Boolean);
    return lista(ativos).filter(function(a) {
      if (f.tipo && a.tipo !== f.tipo) return false;
      if (f.area && a.area !== f.area) return false;
      if (f.situacao && (a.situacao || 'OPERACIONAL') !== f.situacao) return false;
      if (f.linha && chave(a.linha) !== chave(f.linha)) return false;
      if (f.marcador === 'assepsia' && !(a.exigeAssepsia && a.situacao !== 'INATIVO')) return false;
      if (f.marcador === 'calibracao' && !(a.exigeCalibracao && a.situacao !== 'INATIVO')) return false;
      if (!ps.length) return true;
      var alvo = chave([a.codigo, a.nome, (TIPOS[a.tipo] || {}).rotulo, AREAS[a.area], a.linha, a.fabricante, a.fornecedorAssistenciaNome, a.modelo, a.numeroSerie, a.patrimonio].join(' '));
      return ps.every(function(p) { return alvo.indexOf(p) >= 0; });
    }).sort(function(x, y) { return String(x.codigo).localeCompare(String(y.codigo), 'pt-BR', {numeric: true}); });
  }

  /* Mudança de situação: devolve {erro} ou {updates} (caminhos planos, para
     um update só) já com a linha do histórico. Parar ou inativar exige
     motivo -- é o que a manutenção vai querer saber depois. */
  function mudarSituacao(id, ativo, nova, o) {
    o = o || {};
    if (!SITUACOES[nova]) return {erro: 'Situação inválida.'};
    var atual = (ativo && ativo.situacao) || 'OPERACIONAL';
    if (atual === nova) return {erro: 'O equipamento já está ' + SITUACOES[nova].rotulo.toLowerCase() + '.'};
    var motivo = txt(o.motivo);
    if (nova !== 'OPERACIONAL' && !motivo) return {erro: 'Informe o motivo.'};
    var u = {};
    u['ativos/' + id + '/situacao'] = nova;
    u['ativos/' + id + '/situacaoDesde'] = o.agora;
    u['ativos/' + id + '/situacaoMotivo'] = motivo || null;
    u['ativos/' + id + '/atualizadoEm'] = o.agora;
    u['ativos/' + id + '/atualizadoPor'] = o.por || null;
    u['ativos_historico/' + id + '/' + o.chaveHistorico] = {de: atual, para: nova, motivo: motivo || null, por: o.por || null, em: o.agora};
    return {updates: u};
  }

  // Para os outros módulos: equipamentos ativos de uma linha / de um tipo.
  function daLinha(ativos, linha, opcoes) {
    opcoes = opcoes || {};
    return lista(ativos).filter(function(a) {
      return chave(a.linha) === chave(linha) && a.situacao !== 'INATIVO' &&
        (!opcoes.assepsia || a.exigeAssepsia);
    });
  }
  function porTipo(ativos, tipos) {
    var t = [].concat(tipos || []);
    return lista(ativos).filter(function(a) { return t.indexOf(a.tipo) >= 0 && a.situacao !== 'INATIVO'; });
  }

  /* Leitura simples para outros módulos escolherem um equipamento (KO-13, Bloco
     Operacional do Kickoff, reunião de 28/10/2026): só o que um seletor precisa,
     sem os inativos, em ordem de código. Quem consome lê ativos/ (regra: todo
     usuário logado lê) e passa o nó inteiro aqui. */
  function paraSelecao(ativos, opcoes) {
    opcoes = opcoes || {};
    return filtrar(ativos, {area: opcoes.area || null, tipo: opcoes.tipo || null, linha: opcoes.linha || null})
      .filter(function(a) { return a.situacao !== 'INATIVO'; })
      .map(function(a) {
        return {id: a.id, codigo: a.codigo, nome: a.nome, rotulo: a.codigo + ' — ' + a.nome, tipo: a.tipo,
          tipoRotulo: (TIPOS[a.tipo] || TIPOS.OUTRO).rotulo, area: a.area, areaRotulo: AREAS[a.area] || '', linha: a.linha || null,
          situacao: a.situacao || 'OPERACIONAL', capacidade: a.capacidade == null ? null : a.capacidade, capacidadeUnidade: a.capacidadeUnidade || null};
      });
  }

  /* ── Integração com Cadastros, Compras e Logística (16/11/2026) ──────────
     Pedido do usuário: "ao precisar de algo para orçamentos, logística,
     compras e afins tudo esteja conectado". O ativo passa a apontar para o
     cadastro (fornecedores e materiais) e a abrir a Solicitação de Compra do
     fluxo normal de Compras, com a origem no equipamento:
       ativo -> SC (origem.tipo ATIVO) -> cotação -> PC -> recebimento/atesto
     O elo SC -> cotação -> PC já existe (origemSolicitacaoKey nos itens);
     comprasDoAtivo só o percorre de volta. */

  // Peça de reposição é material MN (Peça de manutenção); MU (Uso e Consumo)
  // também serve -- lubrificante, EPI, material de limpeza do equipamento.
  var TIPOS_PECA = ['MN', 'MU'];

  /* Fabricante em texto livre -> fornecedores do cadastro com nome parecido.
     Medido em 16/11: dos 26 fabricantes distintos, só 4 casam com o
     cadastro; o resto pede cadastro novo, e a tela diz isso em vez de
     escolher sozinha. */
  /* A MARCA (primeira palavra que não é genérica) precisa casar. O ensaio com
     os 70 ativos reais mostrou o porquê: casando qualquer palavra, "CYCLOP
     SISTEMA DE EMBALAGENS" sugeria "AZ EMBALAGENS" e "ERLI MAQUINAS" sugeria
     três fábricas de máquinas sem relação. */
  var GENERICAS = ['LTDA', 'EIRELI', 'ME', 'EPP', 'SA', 'SRL', 'INDUSTRIA', 'INDUSTRIAL', 'COMERCIO', 'DE', 'DO', 'DA', 'DOS', 'DAS', 'E',
    'MAQ', 'MAQUINA', 'MAQUINAS', 'MACHINES', 'SISTEMA', 'SISTEMAS', 'EMBALAGEM', 'EMBALAGENS', 'EQUIPAMENTO', 'EQUIPAMENTOS',
    'BRASIL', 'DO BRASIL', 'TECNOLOGIA', 'SOLUCOES', 'SERVICOS', 'LINE', 'GROUP', 'GRUPO'];
  function sugerirFornecedores(texto, fornecedores, limite) {
    var alvo = chave(texto).replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (alvo.length < 3 || /^(N ?I|NAO INFORMADO|MADE IN CHINA)$/.test(alvo)) return [];
    var palavras = alvo.split(' ').filter(function(p) { return p.length >= 3 && GENERICAS.indexOf(p) < 0; });
    if (!palavras.length || palavras[0].length < 4) return [];
    var marca = palavras[0], colada = palavras.length > 1 ? palavras[0] + palavras[1] : null;
    return Object.keys(fornecedores || {}).map(function(k) {
      var f = fornecedores[k] || {};
      if (f.ativo === false) return null;
      var nome = chave(nomeFornecedor(f) + ' ' + txt(f.razaoSocial)).replace(/[^A-Z0-9 ]/g, ' ');
      var compacto = nome.replace(/ /g, '');
      var temMarca = (' ' + nome + ' ').indexOf(' ' + marca) >= 0 || (colada && compacto.indexOf(colada) >= 0);
      if (!temMarca) return null;
      var acertos = palavras.filter(function(p) { return nome.indexOf(p) >= 0; }).length;
      return {key: k, nome: nomeFornecedor(f), acertos: acertos};
    }).filter(Boolean).sort(function(a, b) { return b.acertos - a.acertos || a.nome.localeCompare(b.nome, 'pt-BR'); })
      .slice(0, limite || 5).map(function(x) { return {key: x.key, nome: x.nome}; });
  }

  // Peça do ativo a partir do material do cadastro. o = {qtd, obs}.
  function pecaDoMaterial(material, o) {
    o = o || {};
    if (!material || !txt(material.mpCodigo)) return {erro: 'Escolha o material no cadastro.'};
    if (TIPOS_PECA.indexOf(material.tipo) < 0) {
      return {erro: txt(material.mpCodigo) + ' é ' + (material.tipo || 'sem tipo') + '. Peça de equipamento é MN (Peça de manutenção) ou MU (Uso e Consumo); cadastre a peça em Cadastros › Materiais.'};
    }
    var qtd = num(o.qtd);
    if (qtd != null && (isNaN(qtd) || qtd < 0)) return {erro: 'A quantidade de referência precisa ser um número maior ou igual a zero.'};
    return {materialCodigo: txt(material.mpCodigo), materialNome: txt(material.mpNome), unidade: txt(material.unidade) || null,
      qtdReferencia: qtd == null ? null : qtd, obs: txt(o.obs).slice(0, 200) || null};
  }

  /* Solicitação de Compra aberta pelo ativo. linhas = [{tipo: 'PECA',
     materialCodigo, materialNome, unidade, qtd, obs} | {tipo: 'SERVICO',
     descricao, qtd, obs}]. o = {justificativa, por, agora, novaChave()}.
     Devolve {erro} ou {registro} SEM número (o número sai do contador de SC
     na hora de gravar, como em Compras). */
  function montarSolicitacao(ativoId, ativo, linhas, o) {
    o = o || {};
    ativo = ativo || {};
    if (!ativoId || !ativo.codigo) return {erro: 'Equipamento não encontrado.'};
    var just = txt(o.justificativa);
    if (just.length < 10) return {erro: 'Explique o motivo da compra (mínimo 10 caracteres): o que quebrou, o que vai ser trocado.'};
    var itens = {}, erros = [];
    (linhas || []).forEach(function(l, i) {
      var qtd = num(l && l.qtd);
      if (l && l.tipo === 'SERVICO') {
        var d = txt(l.descricao);
        if (d.length < 5) { erros.push('Linha ' + (i + 1) + ': descreva o serviço.'); return; }
        if (!(qtd > 0)) { erros.push('Linha ' + (i + 1) + ': informe a quantidade.'); return; }
        itens[o.novaChave()] = {tipoItem: 'SERVICO', descricao: d.slice(0, 300), materialCodigo: '', materialNome: d.slice(0, 300),
          qtd: qtd, unidade: 'SV', obs: txt(l.obs).slice(0, 300)};
        return;
      }
      if (!l || !txt(l.materialCodigo)) { erros.push('Linha ' + (i + 1) + ': escolha a peça.'); return; }
      if (!(qtd > 0)) { erros.push('Linha ' + (i + 1) + ': informe a quantidade.'); return; }
      itens[o.novaChave()] = {materialCodigo: txt(l.materialCodigo), materialNome: txt(l.materialNome), qtd: qtd,
        unidade: txt(l.unidade), obs: txt(l.obs).slice(0, 300)};
    });
    if (erros.length) return {erro: erros.join(' ')};
    if (!Object.keys(itens).length) return {erro: 'Inclua ao menos uma peça ou um serviço.'};
    return {registro: {
      itens: itens,
      justificativa: 'Manutenção ' + ativo.codigo + ' — ' + txt(ativo.nome) + ': ' + just,
      solicitante: o.por || null, status: 'PENDENTE', aprovacao: null, rejeicao: null,
      criadoPor: o.por || null, criadoEm: o.agora || null,
      origemModulo: 'MANUTENCAO', origemTela: 'ativos',
      origem: {tipo: 'ATIVO', ativoId: ativoId, ativoCodigo: ativo.codigo, ativoNome: txt(ativo.nome) || null,
        fornecedorAssistenciaKey: ativo.fornecedorAssistenciaKey || null, fornecedorFabricanteKey: ativo.fornecedorFabricanteKey || null}
    }};
  }

  /* De volta: o que foi pedido para este ativo e em que pé está.
     SC (origem.ativoId) -> cotações (solicitacoesOrigem) -> PCs (item.origemSolicitacaoKey). */
  function comprasDoAtivo(ativoId, solicitacoes, processos, pedidosCompra) {
    var scs = Object.keys(solicitacoes || {}).filter(function(k) {
      var s = solicitacoes[k];
      return s && s.origem && s.origem.tipo === 'ATIVO' && s.origem.ativoId === ativoId;
    });
    return scs.map(function(k) {
      var s = solicitacoes[k];
      var cotacoes = Object.keys(processos || {}).filter(function(p) { return processos[p] && (processos[p].solicitacoesOrigem || {})[k]; })
        .map(function(p) { return {key: p, numero: processos[p].numeroFormatado || processos[p].numero || p, status: processos[p].status || ''}; });
      var pcs = Object.keys(pedidosCompra || {}).filter(function(p) {
        var pc = pedidosCompra[p] || {};
        return Object.keys(pc.itens || {}).some(function(i) { return (pc.itens[i] || {}).origemSolicitacaoKey === k; });
      }).map(function(p) {
        var pc = pedidosCompra[p];
        return {key: p, numero: pc.numeroFormatado || pc.numero || p, status: pc.status || '', fornecedor: pc.fornecedorNome || '',
          dataPrevista: pc.dataPrevista || pc.dataPrevistaEntrega || null};
      });
      var itens = Object.keys(s.itens || {}).map(function(i) { return s.itens[i]; });
      return {key: k, numero: s.numeroFormatado || s.numero || k, status: s.status || 'PENDENTE', criadoEm: s.criadoEm || '',
        justificativa: s.justificativa || '', itens: itens, cotacoes: cotacoes, pcs: pcs};
    }).sort(function(a, b) { return String(b.criadoEm).localeCompare(String(a.criadoEm)); });
  }

  // Etapa legível da compra de um ativo (para a lista do equipamento).
  function etapaCompra(c) {
    var pcs = c.pcs || [];
    if (c.status === 'REJEITADA') return {rotulo: 'Rejeitada por Compras', cor: 'bad'};
    if (pcs.length) {
      if (pcs.every(function(p) { return p.status === 'RECEBIDO_TOTAL'; })) return {rotulo: 'Recebido / serviço atestado', cor: 'ok'};
      if (pcs.every(function(p) { return p.status === 'CANCELADO'; })) return {rotulo: 'PC cancelado', cor: 'bad'};
      if (pcs.some(function(p) { return p.status === 'RECEBIDO_PARCIAL'; })) return {rotulo: 'Recebido em parte', cor: 'warn'};
      return {rotulo: 'Pedido de Compra emitido', cor: 'info'};
    }
    if (c.cotacoes && c.cotacoes.length) return {rotulo: 'Em cotação (orçamento)', cor: 'info'};
    if (c.status === 'APROVADA' || c.status === 'CONSOLIDADA') return {rotulo: 'Aprovada, aguardando cotação', cor: 'info'};
    return {rotulo: 'Aguardando aprovação de Compras', cor: 'warn'};
  }

  return {
    TIPOS_PECA: TIPOS_PECA, nomeFornecedor: nomeFornecedor, sugerirFornecedores: sugerirFornecedores,
    pecaDoMaterial: pecaDoMaterial, montarSolicitacao: montarSolicitacao, comprasDoAtivo: comprasDoAtivo, etapaCompra: etapaCompra,
    TIPOS: TIPOS, AREAS: AREAS, SITUACOES: SITUACOES, PERIODICIDADE_PADRAO_MESES: PERIODICIDADE_PADRAO_MESES,
    padroesDoTipo: padroesDoTipo, normalizar: normalizar, validar: validar, sugerirCodigo: sugerirCodigo,
    lista: lista, resumo: resumo, filtrar: filtrar, mudarSituacao: mudarSituacao, daLinha: daLinha, porTipo: porTipo,
    paraSelecao: paraSelecao
  };
});
