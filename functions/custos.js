/* Motor de custo de produto — funções PURAS.
 *
 * Nada aqui lê banco, escreve banco ou toca no DOM. Recebe dado, devolve
 * número com procedência. É o mesmo padrão do motor de MRP em utils.js e do
 * `calcularCustoItemCotacao`, pelo mesmo motivo: custo errado sai plausível,
 * então tem que dar pra testar a conta isolada da tela.
 *
 * A REGRA QUE MANDA EM TUDO AQUI: material sem preço nunca vale zero.
 * Zero não deixa a ficha incompleta, deixa a ficha BARATA -- e a margem sai
 * alta, errada e convincente. Mesma disciplina do balde BACKLOG do MRP: o
 * buraco aparece, não some. Toda função devolve `completo`, `semCusto[]` e a
 * procedência de cada linha; quem chama decide se pode mostrar o número.
 *
 * Ver PLANO_CUSTOS.md para o porquê de cada decisão.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Custos = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Procedência de um número de custo. Carimbada linha a linha, porque uma
  // ficha misturando preço pago e preço-alvo sem dizer qual é qual vale menos
  // que ficha nenhuma.
  var PROCEDENCIA = {
    PAGO: 'PAGO',            // preço efetivamente pago num Pedido de Compra
    COTADO: 'COTADO',        // proposta de fornecedor, ainda não comprada
    MANUAL: 'MANUAL',        // digitado por alguém, sem documento por trás
    ESTIMADO_PD: 'ESTIMADO_PD', // preço por kg que o P&D pôs na fórmula da amostra
    ESTIMADO: 'ESTIMADO',    // derivado (ex.: tempo de batelada por faixa de massa)
    CLIENTE: 'CLIENTE',      // material fornecido pelo cliente: custo zero DE VERDADE
    SEM_CUSTO: 'SEM_CUSTO'   // não existe preço -- NUNCA vira zero
  };

  // O estágio mais maduro vence (PLANO_CUSTOS_RESULTADO.md §1.3): o que foi pago
  // vale mais que a proposta, que vale mais que o digitado sem documento, que vale
  // mais que a estimativa do P&D. Empate de estágio: o mais recente.
  var MATURIDADE = { PAGO: 4, COTADO: 3, MANUAL: 2, ESTIMADO_PD: 1 };

  // Natureza de custo. Vem do prefixo do código do material, que é a mesma
  // taxonomia de TIPO_LABELS em cadastros.html. Existe aqui por um motivo
  // específico: é o "plano de contas gerencial" mínimo. Qualquer financeiro
  // que a Kuryos comprar depois vai pedir para onde cada real foi -- e o
  // mapeamento fica trivial se a natureza já estiver carimbada na origem.
  var NATUREZA = {
    MPGR: 'MATERIA_PRIMA',
    MPES: 'MATERIA_PRIMA',
    EP: 'EMBALAGEM',
    ES: 'EMBALAGEM',
    ET: 'EMBALAGEM',
    MU: 'USO_E_CONSUMO'
  };

  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function norm(c) { return String(c == null ? '' : c).trim().toUpperCase(); }
  function un(u) { return String(u == null ? '' : u).trim().toUpperCase(); }

  function naturezaDoMaterial(material) {
    var t = norm(material && material.tipo);
    if (NATUREZA[t]) return NATUREZA[t];
    var cod = norm(material && material.mpCodigo);
    var pref = cod.split('-')[0];
    return NATUREZA[pref] || 'OUTROS';
  }

  /* Índice código -> {key, material}. O cadastro é chaveado por uma key
     sanitizada, mas fórmula e BOM referenciam pelo `mpCodigo`. Medido em
     produção: 841 itens de fórmula têm código e os 841 existem no cadastro,
     então o índice por código é confiável -- mas a função devolve `null` em
     vez de chutar quando não acha. */
  function indexarMateriais(materiais) {
    var idx = {};
    Object.keys(materiais || {}).forEach(function(key) {
      var m = materiais[key];
      if (!m) return;
      var cod = norm(m.mpCodigo);
      if (cod) idx[cod] = { key: key, material: m };
    });
    return idx;
  }

  /* Preço de um material, na unidade em que o material é cadastrado.
     `precos` é o nó `custos_precos` chaveado pela MESMA key do cadastro de
     materiais -- e não pelo mpCodigo, porque a key é o que não muda quando
     alguém corrige o código. */
  function precoDoMaterial(codigo, idx, precos) {
    var cod = norm(codigo);
    var achado = idx[cod];
    if (!achado) {
      return { valor: null, fonte: PROCEDENCIA.SEM_CUSTO, motivo: 'material não existe no cadastro', codigo: cod };
    }
    var p = (precos || {})[achado.key];
    // Material do cliente custa zero para a Kuryos, e esse é o ÚNICO zero que vale:
    // ele vem carimbado CLIENTE, nunca de um preço que faltou.
    var doCliente = p && p.fonte === PROCEDENCIA.CLIENTE && num(p.valor) === 0;
    if (!p || !(num(p.valor) > 0 || doCliente)) {
      return { valor: null, fonte: PROCEDENCIA.SEM_CUSTO, motivo: 'sem preço cadastrado',
        codigo: cod, key: achado.key, material: achado.material };
    }
    return {
      valor: num(p.valor),
      // A unidade do PREÇO é a unidade do cadastro do material salvo se quem
      // digitou disse outra coisa. Guardar as duas separadas é o que impede o
      // erro de 11,67x que o motor de cotação já documentou: aplicar fator de
      // conversão onde a unidade já era a mesma.
      unidade: un(p.unidade || achado.material.unidade),
      fonte: p.fonte || PROCEDENCIA.MANUAL,
      ref: p.ref || null,
      codigo: cod, key: achado.key, material: achado.material
    };
  }

  /* Converte um preço para R$/kg. Só aceita o que é convertível SEM
     suposição: kg direto, g por 1000. Litro/ml exigiriam a densidade do
     próprio material (existe em 8 de 911 cadastros) -- sem ela a conversão é
     um chute, e um chute aqui vira custo de fórmula inteiro errado. */
  function precoPorKg(preco) {
    if (!preco || preco.valor == null) return { valor: null, motivo: 'sem preço' };
    if (preco.fonte === PROCEDENCIA.CLIENTE) return { valor: 0 };  // zero em qualquer unidade
    var u = un(preco.unidade);
    if (u === 'KG') return { valor: preco.valor };
    if (u === 'G') return { valor: preco.valor * 1000 };
    if (u === 'L' || u === 'ML') {
      var d = num(preco.material && preco.material.densidade);
      if (!(d > 0)) return { valor: null, motivo: 'preço em ' + u + ' e material sem densidade cadastrada' };
      // R$/L ÷ (kg/L) = R$/kg ; ml converte pra litro antes.
      var porLitro = u === 'ML' ? preco.valor * 1000 : preco.valor;
      return { valor: porLitro / d };
    }
    return { valor: null, motivo: 'preço em "' + (preco.unidade || '—') + '", que não converte para kg' };
  }

  /* Custo de UM QUILO de fórmula.
     A fórmula é % m/m, então este número NÃO depende de densidade nenhuma --
     densidade só entra depois, para ir de kg para unidade envasada. Medido:
     densidade existe em 6 de 377 produtos, então desacoplar os dois é o que
     permite entregar custo de fórmula hoje em vez de esperar 371 cadastros. */
  function custoPorKgFormula(formula, idx, precos) {
    var itens = Object.keys(((formula || {}).itens) || {}).map(function(k) { return formula.itens[k]; });
    var linhas = [], semCusto = [], incompativeis = [];
    var custo = 0, pctComPreco = 0, pctTotal = 0;

    itens.forEach(function(it) {
      var pct = num(it.percentualMM);
      pctTotal += pct;
      var preco = precoDoMaterial(it.mpCodigo, idx, precos);
      var porKg = precoPorKg(preco);
      var linha = {
        codigo: norm(it.mpCodigo), nome: it.mpNome || null, fase: it.fase || null,
        percentualMM: pct, precoPorKg: porKg.valor,
        custoNoKg: porKg.valor != null ? (pct / 100) * porKg.valor : null,
        fonte: porKg.valor != null ? preco.fonte : PROCEDENCIA.SEM_CUSTO,
        natureza: preco.material ? naturezaDoMaterial(preco.material) : null,
        // Sem preço, o motivo é o do preço ("não existe no cadastro" ≠ "sem preço",
        // Regra 3); com preço que não converte, o da conversão. Antes o genérico
        // "sem preço" da conversão escondia o material órfão (ensaio de 26/10).
        motivo: porKg.valor != null ? null : (preco.valor == null ? preco.motivo : porKg.motivo)
      };
      linhas.push(linha);
      if (linha.custoNoKg != null) { custo += linha.custoNoKg; pctComPreco += pct; }
      else if (preco.valor != null) incompativeis.push(linha);
      else semCusto.push(linha);
    });

    return {
      // `custoPorKg` é o custo da PARTE conhecida, e por isso vem sempre
      // junto de `completo` e de `pctCobertoMM` -- a tela não pode exibir um
      // sem os outros.
      //
      // NULL, e não 0, quando NADA foi precificado. Devolver 0 aqui foi um
      // bug real, pego pelo harness da tela contra a base de produção: com a
      // base sem nenhum preço, granel 0 + embalagem 0 davam um
      // `custoMaterialPorPeca` de R$ 0,00 que a ficha exibia como total. É
      // exatamente o "sem preço virou zero" que este módulo existe para
      // impedir, e os testes sintéticos não pegaram porque toda fixture
      // parcial tinha pelo menos um item com preço.
      custoPorKg: (itens.length && pctComPreco > 0) ? custo : null,
      completo: itens.length > 0 && semCusto.length === 0 && incompativeis.length === 0,
      pctCobertoMM: pctTotal > 0 ? (pctComPreco / pctTotal) * 100 : 0,
      somaPercentual: pctTotal,
      linhas: linhas, semCusto: semCusto, incompativeis: incompativeis
    };
  }

  /* Massa de granel em UMA peça, em kg.
     Mesma matemática de explodirMateriaisNecessarios() em utils.js -- volume
     nominal, overfill, perda de processo e densidade. Repetida aqui em vez de
     importada porque este módulo é standalone (roda em Node no teste sem
     carregar os 254 KB do utils.js); se as duas divergirem, utils.js é a
     referência.

     Densidade ausente ou -1 devolve `ok: false` com motivo, NUNCA um número.
     O marcador -1 de cadastros importados já gerou consumo negativo de
     fórmula uma vez (ver baixarEstoqueConsumo em form.html). */
  function massaGranelPorPeca(produto) {
    var p = produto || {};
    var vol = num(p.volume);
    var unidadeVol = String(p.unidadeVolume || 'ml').toLowerCase();
    var litros;
    if (unidadeVol === 'ml') litros = vol / 1000;
    else if (unidadeVol === 'l') litros = vol;
    else return { ok: false, kg: null, motivo: 'unidade de volume "' + (p.unidadeVolume || '—') + '" não reconhecida' };
    if (!(litros > 0)) return { ok: false, kg: null, motivo: 'produto sem volume nominal' };

    var densidade = num(p.densidadeGranel);
    if (!(densidade > 0)) return { ok: false, kg: null, motivo: 'produto sem densidade de granel cadastrada' };

    var overfill = num(p.overfillPct);
    var perda = num(p.perdaProcessoPct);
    var volumeFinalL = litros * (1 + overfill / 100);
    var volumeGranelL = volumeFinalL * (1 + perda / 100);
    return { ok: true, kg: volumeGranelL * densidade, volumeGranelL: volumeGranelL, densidade: densidade };
  }

  /* Custo de embalagem por peça, a partir do BOM.
     `qtdPorPeca` está na unidade do próprio material, e o preço também --
     então aqui a multiplicação é direta e NÃO há conversão. Se um dia
     aparecer preço numa unidade diferente da do cadastro, a linha vai para
     `incompativeis` em vez de ser multiplicada assim mesmo. */
  function custoEmbalagemPorPeca(bomVersao, idx, precos) {
    var itens = Object.keys(((bomVersao || {}).itens) || {}).map(function(k) { return bomVersao.itens[k]; });
    var linhas = [], semCusto = [], incompativeis = [];
    var custo = 0, custeadas = 0;

    itens.forEach(function(it) {
      var qtd = num(it.qtdPorPeca);
      var preco = precoDoMaterial(it.materialCodigo, idx, precos);
      var unidadeCadastro = un(preco.material && preco.material.unidade);
      var mesmaUnidade = !preco.unidade || !unidadeCadastro || preco.unidade === unidadeCadastro;
      var podeCustear = preco.valor != null && mesmaUnidade && qtd > 0;
      var linha = {
        codigo: norm(it.materialCodigo), nome: it.materialNome || null,
        qtdPorPeca: qtd, unidade: unidadeCadastro || null,
        precoUnitario: preco.valor, custoNaPeca: podeCustear ? qtd * preco.valor : null,
        fonte: podeCustear ? preco.fonte : PROCEDENCIA.SEM_CUSTO,
        natureza: preco.material ? naturezaDoMaterial(preco.material) : null,
        motivo: podeCustear ? null
          : (preco.valor == null ? preco.motivo
            : (!mesmaUnidade ? 'preço em ' + preco.unidade + ' e cadastro em ' + unidadeCadastro
              : 'BOM sem quantidade por peça'))
      };
      linhas.push(linha);
      if (linha.custoNaPeca != null) { custo += linha.custoNaPeca; custeadas++; }
      else if (preco.valor != null) incompativeis.push(linha);
      else semCusto.push(linha);
    });

    return {
      // Mesma regra do granel: null quando nenhuma linha foi custeada. Zero
      // aqui vira "embalagem de graça" somada a um total plausível.
      custoPorPeca: (itens.length && custeadas > 0) ? custo : null,
      completo: itens.length > 0 && semCusto.length === 0 && incompativeis.length === 0,
      linhasCusteadas: custeadas,
      linhas: linhas, semCusto: semCusto, incompativeis: incompativeis
    };
  }

  /* Ficha de custo de um produto.
   *
   * `taxaConversao` é OPCIONAL de propósito: o custo de conversão (folha +
   * custo fixo rateado por hora-padrão) entra como camada separada e plugável,
   * para que o rateio possa ser desenhado depois sem reescrever a ficha.
   * Sem ela, `custoUnitario` é null e `custoMaterialPorPeca` continua válido --
   * a ficha diz o que sabe e o que não sabe, em vez de fingir um total.
   *
   * taxaConversao esperada: { custoHoraPadrao, procedencia }
   * prodHoraRef vem do produto (peças/hora) -- medido em 321 de 377 produtos.
   */
  function fichaCustoProduto(args) {
    var a = args || {};
    var produto = a.produto || {};
    var idx = a.idxMateriais || {};
    var precos = a.precos || {};

    var granelKg = custoPorKgFormula(a.formula, idx, precos);
    var massa = massaGranelPorPeca(produto);
    var granelPorPeca = (granelKg.custoPorKg != null && massa.ok) ? granelKg.custoPorKg * massa.kg : null;
    var embalagem = custoEmbalagemPorPeca(a.bom, idx, precos);

    var avisos = [];
    if (!massa.ok) avisos.push('Granel por unidade indisponível: ' + massa.motivo + '. O custo por kg da fórmula continua válido.');
    if (granelKg.somaPercentual > 0 && (granelKg.somaPercentual < 99 || granelKg.somaPercentual > 101)) {
      avisos.push('Fórmula soma ' + (Math.round(granelKg.somaPercentual * 10) / 10) + '% em vez de 100%.');
    }
    if (!a.formula && !a.bom) avisos.push('Produto sem fórmula e sem BOM cadastrados.');

    // Conversão: horas-padrão da peça x custo da hora-padrão. A base é
    // prodHoraRef e NUNCA a duração da OP -- medido em produção, duração de OP
    // é tempo de calendário e dá 123% a 243% de ocupação (ver PLANO_CUSTOS.md).
    var conversao = null;
    var taxa = a.taxaConversao;
    var prodHora = num(produto.prodHoraRef);
    if (taxa && num(taxa.custoHoraPadrao) > 0) {
      if (prodHora > 0) {
        conversao = {
          horasPorPeca: 1 / prodHora,
          custoPorPeca: num(taxa.custoHoraPadrao) / prodHora,
          custoHoraPadrao: num(taxa.custoHoraPadrao),
          fonte: taxa.procedencia || PROCEDENCIA.ESTIMADO
        };
      } else {
        avisos.push('Conversão não calculada: produto sem prodHoraRef.');
      }
    }

    var materialCompleto = granelKg.completo && embalagem.completo && massa.ok;
    // TOTAL só existe quando NADA falta. Somar granel parcial com embalagem
    // parcial produz um número que parece total, é sempre menor que o
    // verdadeiro, e vira margem alta e falsa -- o erro mais caro que uma
    // ficha de custo pode cometer. As partes seguem disponíveis em
    // `granel.custoPorPeca` e `embalagem.custoPorPeca` para quem quiser
    // mostrar o parcial COM o aviso de incompleto ao lado.
    var custoMaterialPorPeca = materialCompleto
      ? granelPorPeca + embalagem.custoPorPeca : null;
    var custoUnitario = (custoMaterialPorPeca != null && conversao)
      ? custoMaterialPorPeca + conversao.custoPorPeca : null;

    var semCusto = granelKg.semCusto.concat(embalagem.semCusto).map(function(l) { return l.codigo; });

    return {
      sku: produto.sku || a.sku || null,
      competencia: a.competencia || null,
      granel: {
        custoPorKg: granelKg.custoPorKg, custoPorPeca: granelPorPeca,
        massaKgPorPeca: massa.ok ? massa.kg : null,
        completo: granelKg.completo, pctCobertoMM: granelKg.pctCobertoMM,
        linhas: granelKg.linhas, semCusto: granelKg.semCusto, incompativeis: granelKg.incompativeis
      },
      embalagem: embalagem,
      conversao: conversao,
      custoMaterialPorPeca: custoMaterialPorPeca,
      custoUnitario: custoUnitario,
      // `completo` exige material E conversão. Ficha sem conversão é ficha de
      // material, não custo do produto -- e a tela precisa dizer isso.
      completo: materialCompleto && !!conversao,
      materialCompleto: materialCompleto,
      semCusto: semCusto,
      avisos: avisos
    };
  }

  /* Fila de cadastro de preço ordenada por EXPOSIÇÃO.
   *
   * Exposição = quantas unidades produzidas no período dependem daquele
   * material. É o que transforma "preencher 911 materiais" em "preencher 83":
   * medido na base, 83 materiais cobrem 80% da exposição de 12 meses.
   *
   * Devolve a fila já com o ganho marginal de cada preço, para a tela poder
   * dizer "digite este e você cobre mais 6%".
   */
  function filaPrecosPorExposicao(args) {
    var a = args || {};
    var volPorSku = a.volumePorSku || {};
    var formulaPorSku = a.formulaPorSku || {};
    var bomPorSku = a.bomPorSku || {};
    var idx = a.idxMateriais || {};
    var precos = a.precos || {};

    var exposicao = {};
    function somar(codigo, qtd) {
      var cod = norm(codigo);
      if (!cod || !idx[cod]) return;
      exposicao[cod] = (exposicao[cod] || 0) + qtd;
    }
    Object.keys(volPorSku).forEach(function(sku) {
      var q = num(volPorSku[sku]);
      if (!(q > 0)) return;
      var f = formulaPorSku[norm(sku)];
      if (f) Object.keys(f.itens || {}).forEach(function(k) { somar(f.itens[k].mpCodigo, q); });
      var b = bomPorSku[norm(sku)];
      if (b) Object.keys(b.itens || {}).forEach(function(k) { somar(b.itens[k].materialCodigo, q); });
    });

    var total = Object.keys(exposicao).reduce(function(s, c) { return s + exposicao[c]; }, 0);
    var fila = Object.keys(exposicao).map(function(cod) {
      var achado = idx[cod];
      var p = precoDoMaterial(cod, idx, precos);
      return {
        codigo: cod,
        nome: achado.material.mpNome || null,
        tipo: achado.material.tipo || null,
        natureza: naturezaDoMaterial(achado.material),
        unidade: un(achado.material.unidade) || null,
        key: achado.key,
        exposicao: exposicao[cod],
        exposicaoPct: total > 0 ? (exposicao[cod] / total) * 100 : 0,
        temPreco: p.valor != null,
        fonte: p.valor != null ? p.fonte : PROCEDENCIA.SEM_CUSTO
      };
    }).sort(function(x, y) { return y.exposicao - x.exposicao; });

    // Acumulado sobre a fila INTEIRA (com e sem preço), porque o que interessa
    // é "quanto do universo eu cubro se descer até aqui", não a posição
    // relativa entre os que faltam.
    var acc = 0;
    fila.forEach(function(f) { acc += f.exposicaoPct; f.acumuladoPct = acc; });

    var cobertos = fila.filter(function(f) { return f.temPreco; });
    return {
      fila: fila,
      pendentes: fila.filter(function(f) { return !f.temPreco; }),
      totalMateriais: fila.length,
      comPreco: cobertos.length,
      coberturaPct: cobertos.reduce(function(s, f) { return s + f.exposicaoPct; }, 0)
    };
  }

  /* Quantos materiais faltam para cobrir X% da exposição. É o número que
     torna o cadastro um plano em vez de um mutirão. */
  function materiaisParaCobrir(fila, alvoPct) {
    var acc = 0, i = 0;
    while (i < fila.length && acc < alvoPct) { acc += fila[i].exposicaoPct; i++; }
    return i;
  }

  /* Plano de cadastro de preço orientado a FICHA FECHADA.
   *
   * Por que existe, e por que a fila por exposição não basta: uma ficha só
   * fecha quando TODOS os materiais daquele SKU têm preço. Medido na base
   * real: os 83 materiais que cobrem 80% da exposição fecham apenas 9 SKUs,
   * 29,5% do volume -- porque cada SKU tem uma cauda de material raro que
   * mora lá no fim da fila por exposição. Ordenar por exposição otimiza a
   * métrica errada.
   *
   * Aqui a ordenação é gulosa por VOLUME DESBLOQUEADO POR PREÇO DIGITADO:
   * a cada rodada escolhe o SKU com melhor razão volume/preços-faltantes,
   * e os preços que ele adiciona barateiam os SKUs seguintes (material
   * compartilhado já fica pago). É o mesmo raciocínio de set cover.
   */
  function planoCadastroPorSku(args) {
    var a = args || {};
    var volPorSku = a.volumePorSku || {};
    var formulaPorSku = a.formulaPorSku || {};
    var bomPorSku = a.bomPorSku || {};
    var idx = a.idxMateriais || {};
    var precos = a.precos || {};

    // Materiais exigidos por SKU, só os que existem no cadastro (nos órfãos
    // não dá para cadastrar preço -- são problema de cadastro, não de fila).
    var exigidos = {}, orfaosPorSku = {};
    Object.keys(volPorSku).forEach(function(skuBruto) {
      var sku = norm(skuBruto);
      var set = {}, orfaos = [];
      function juntar(codigo) {
        var cod = norm(codigo);
        if (!cod) return;
        if (idx[cod]) set[cod] = true; else orfaos.push(cod);
      }
      var f = formulaPorSku[sku];
      if (f) Object.keys(f.itens || {}).forEach(function(k) { juntar(f.itens[k].mpCodigo); });
      var b = bomPorSku[sku];
      if (b) Object.keys(b.itens || {}).forEach(function(k) { juntar(b.itens[k].materialCodigo); });
      if (f || b) { exigidos[sku] = Object.keys(set); orfaosPorSku[sku] = orfaos; }
    });

    var volumeTotal = Object.keys(volPorSku).reduce(function(s, k) { return s + num(volPorSku[k]); }, 0);

    // Já pagos: o que tem preço hoje.
    var pago = {};
    Object.keys(idx).forEach(function(cod) {
      if (precoDoMaterial(cod, idx, precos).valor != null) pago[cod] = true;
    });

    var restantes = Object.keys(exigidos).filter(function(sku) {
      // SKU com órfão nunca fecha por cadastro de preço -- sai do plano e é
      // reportado à parte, senão o plano prometeria um fechamento impossível.
      return orfaosPorSku[sku].length === 0 && exigidos[sku].length > 0;
    });
    var bloqueados = Object.keys(exigidos).filter(function(sku) { return orfaosPorSku[sku].length > 0; })
      .map(function(sku) {
        return { sku: sku, volume: num(volPorSku[sku]), orfaos: orfaosPorSku[sku] };
      }).sort(function(x, y) { return y.volume - x.volume; });

    var sequencia = [], marcos = [], skusFechados = [];
    var volumeCoberto = 0;
    var guarda = 0;

    while (restantes.length && guarda++ < 5000) {
      var melhor = null;
      restantes.forEach(function(sku) {
        var faltam = exigidos[sku].filter(function(c) { return !pago[c]; });
        var vol = num(volPorSku[sku]);
        // Custo 0 = já está fechado: ganho infinito, entra primeiro.
        var ganho = faltam.length === 0 ? Infinity : vol / faltam.length;
        if (!melhor || ganho > melhor.ganho || (ganho === melhor.ganho && vol > melhor.volume)) {
          melhor = { sku: sku, volume: vol, faltam: faltam, ganho: ganho };
        }
      });
      if (!melhor) break;

      melhor.faltam.forEach(function(cod) {
        pago[cod] = true;
        var m = idx[cod].material;
        sequencia.push({
          codigo: cod, key: idx[cod].key, nome: m.mpNome || null,
          tipo: m.tipo || null, unidade: un(m.unidade) || null,
          natureza: naturezaDoMaterial(m),
          desbloqueouSku: melhor.sku
        });
      });
      volumeCoberto += melhor.volume;
      skusFechados.push({ sku: melhor.sku, volume: melhor.volume, precosNovos: melhor.faltam.length });
      marcos.push({
        precos: sequencia.length,
        skusCompletos: skusFechados.length,
        volumeCobertoPct: volumeTotal > 0 ? (volumeCoberto / volumeTotal) * 100 : 0
      });
      restantes = restantes.filter(function(s) { return s !== melhor.sku; });
    }

    return {
      sequencia: sequencia,
      skusFechados: skusFechados,
      marcos: marcos,
      bloqueadosPorCadastro: bloqueados,
      volumeTotal: volumeTotal,
      precosNecessarios: sequencia.length
    };
  }

  /* Quantos preços para fechar X% do volume, segundo o plano por SKU. */
  function precosParaVolume(marcos, alvoPct) {
    for (var i = 0; i < marcos.length; i++) {
      if (marcos[i].volumeCobertoPct >= alvoPct) return marcos[i].precos;
    }
    return marcos.length ? marcos[marcos.length - 1].precos : 0;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * v2 (26/10/2026) — Custos e Resultado (PLANO_CUSTOS_RESULTADO.md).
   * Origem do preço com maturidade, densidade pela especificação, ficha
   * padrão com perdas e operação direta, LP nas leituras padrão e orçamento.
   * ══════════════════════════════════════════════════════════════════════ */

  var VERSAO_MOTOR = 'custos-v2-20261026';

  // Número em formato brasileiro ("0,9", "1.250,5") ou já numérico. Vazio -> null.
  function numBR(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v == null ? '' : v).trim();
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function nomeNormalizado(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  }

  function arred(v, casas) { var f = Math.pow(10, casas == null ? 4 : casas); return Math.round(v * f) / f; }

  /* Densidade pelo ensaio DENSIDADE da especificação. Medido em 26/10: 207 de 215
     especificações têm a faixa, contra 15 produtos com densidadeGranel. Usa o
     MÁXIMO da faixa: mais massa por peça, custo maior -- a hipótese conservadora.
     Fora de 0,5–2,0 g/mL não é densidade de cosmético (é digitação), e não vale. */
  function densidadeDaEspecificacao(espec) {
    var itens = Object.keys(((espec || {}).itens) || {}).map(function(k) { return espec.itens[k]; });
    var ensaio = itens.filter(function(i) { return i && /DENSIDADE/i.test(i.ensaio || ''); })[0];
    if (!ensaio) return { ok: false, valor: null, motivo: 'especificação sem ensaio de densidade' };
    var minimo = numBR(ensaio.minimo), maximo = numBR(ensaio.maximo);
    if (minimo == null && maximo == null) {
      var m = String(ensaio.especificacaoTexto || '').match(/(\d+[.,]?\d*)\s*(?:-|a|até)\s*(\d+[.,]?\d*)/i);
      if (m) { minimo = numBR(m[1]); maximo = numBR(m[2]); }
      else { var unico = numBR(String(ensaio.especificacaoTexto || '').replace(/[^\d.,]/g, '')); maximo = unico; }
    }
    var valor = maximo != null ? maximo : minimo;
    if (!(valor >= 0.5 && valor <= 2)) return { ok: false, valor: null, motivo: 'densidade da especificação fora de 0,5–2,0 (' + (valor == null ? 'vazia' : valor) + ')' };
    return { ok: true, valor: valor, minimo: minimo, maximo: maximo, origem: 'ESPECIFICACAO_MAX' };
  }

  function versaoNum(v) { return parseInt(String(v || 'v0').replace(/[^\d]/g, ''), 10) || 0; }
  function daVersao(no, codProduto, versao) {
    if (!no) return null;
    var k = codProduto + '__' + versao;
    if (no[k]) return no[k];
    var alvo = k.toLowerCase();
    var hit = Object.keys(no).filter(function(x) { return x.toLowerCase() === alvo; }).sort()[0];
    return hit ? no[hit] : null;
  }

  /* Versão que o custo usa: mesma regra de utils.js:melhorFormulaDoProduto (a
     APROVADA mais recente; sem nenhuma, a mais recente de qualquer status) --
     se as duas divergirem, utils.js é a referência. BOM e especificação vêm da
     MESMA versão da fórmula; SKU sem fórmula (só envase de granel do cliente)
     usa o BOM mais recente. A ficha diz o que estava aprovado. */
  function versaoParaCusto(codProduto, formulas, bom, especificacoes) {
    var versoes = Object.keys(formulas || {}).map(function(k) { return formulas[k]; })
      .filter(function(f) { return f && f.codProduto === codProduto; });
    var aprovadas = versoes.filter(function(f) { return f.status === 'APROVADA'; });
    var pool = (aprovadas.length ? aprovadas : versoes).slice()
      .sort(function(a, b) { return versaoNum(b.versao) - versaoNum(a.versao); });
    var formula = pool[0] || null;
    var versao = formula ? formula.versao : null;
    var b = formula ? daVersao(bom, codProduto, versao) : null;
    if (!formula) {
      var boms = Object.keys(bom || {}).map(function(k) { return bom[k]; })
        .filter(function(x) { return x && x.codProduto === codProduto; })
        .sort(function(x, y) { return versaoNum(y.versao) - versaoNum(x.versao); });
      b = boms[0] || null;
      versao = b ? b.versao : null;
    }
    var e = versao ? daVersao(especificacoes, codProduto, versao) : null;
    return {
      versao: versao, formula: formula, bom: b, especificacao: e,
      aprovada: {
        formula: !!(formula && formula.status === 'APROVADA'),
        bom: !!(b && b.status === 'APROVADA'),
        especificacao: !!(e && e.status === 'APROVADA')
      }
    };
  }

  /* Custo por UNIDADE DE ESTOQUE de um item de Pedido de Compra. O PC guarda o
     preço na unidade COTADA (ex.: R$ 60/kg de celofane) e a quantidade na unidade
     de estoque (3 rolos). Multiplicar um pelo outro é o erro de 11,67x do motor de
     cotação. A conta certa é o total da decisão ÷ a quantidade em unidade de
     estoque; sem o total, o preço unitário só vale se as duas unidades forem a
     mesma. Usado também pelo recebimento (custo gravado no lote). */
  function custoUnitarioItemPC(item) {
    var it = item || {};
    var qtdEstoque = num(it.qtdEmUnidadeEstoque) || num(it.qtd);
    var total = num(it.custoTotalNaDecisao);
    if (total > 0 && qtdEstoque > 0) return { valor: total / qtdEstoque, unidade: un(it.unidade) || null };
    var unit = num(it.precoUnit);
    var uCot = un(it.unidadeCotada), uEst = un(it.unidade);
    if (unit > 0 && (!uCot || uCot === uEst)) return { valor: unit, unidade: uEst || null };
    if (unit > 0 && num(it.qtdCotada) > 0 && qtdEstoque > 0) return { valor: unit * num(it.qtdCotada) / qtdEstoque, unidade: uEst || null };
    return { valor: null, motivo: unit > 0 ? 'preço em ' + (uCot || '?') + ' e estoque em ' + (uEst || '?') + ', sem total para converter' : 'item sem preço' };
  }

  // Mesma conta para a resposta de um fornecedor numa cotação de Compras.
  function custoUnitarioRespostaCotacao(resposta, item) {
    var r = resposta || {}, it = item || {};
    var unit = num(r.precoUnit), qtdCot = num(r.qtdCotada), qtd = num(it.qtd);
    if (!(unit > 0)) return { valor: null, motivo: 'resposta sem preço' };
    if (qtdCot > 0 && qtd > 0) return { valor: unit * qtdCot / qtd, unidade: un(it.unidade) || null };
    return { valor: unit, unidade: un(it.unidade) || null };
  }

  /* Candidatos de preço por material (key do cadastro), de todas as origens.
     Nada é apagado: o histórico de um material é a lista inteira, e a escolha
     do vigente acontece em resolverPrecos. */
  function fontesDePreco(base, idx, deparaPd) {
    var b = base || {}, fontes = {};
    function add(cod, cand) {
      var achado = idx[norm(cod)];
      if (!achado || cand.valor == null || !(cand.valor >= 0)) return;
      (fontes[achado.key] = fontes[achado.key] || []).push(cand);
    }
    Object.keys(b.pedidos_compra || {}).forEach(function(pk) {
      var pc = b.pedidos_compra[pk];
      if (!pc || pc.status === 'CANCELADO' || pc.status === 'RASCUNHO') return;
      Object.keys(pc.itens || {}).forEach(function(ik) {
        var it = pc.itens[ik], c = custoUnitarioItemPC(it);
        if (c.valor > 0) add(it.materialCodigo, { valor: c.valor, unidade: c.unidade, fonte: PROCEDENCIA.PAGO,
          ref: 'PC ' + (pc.numeroFormatado || pk), refKey: pk + '/' + ik, em: pc.dataEmissao || pc.criadoEm || pc.dataCriacao || null });
      });
    });
    Object.keys(b.processos_cotacao || {}).forEach(function(ck) {
      var cot = b.processos_cotacao[ck];
      if (!cot || cot.status === 'CANCELADO') return;
      var convidados = cot.fornecedoresConvidados || {};
      Object.keys(cot.itens || {}).forEach(function(ik) {
        var it = cot.itens[ik], melhor = null;
        Object.keys(convidados).forEach(function(fk) {
          var f = convidados[fk], resp = f && f.respostaItens && f.respostaItens[ik];
          if (!resp || f.status !== 'RESPONDIDO') return;
          var c = custoUnitarioRespostaCotacao(resp, it);
          if (!(c.valor > 0)) return;
          // Decidida: vale a vencedora. Aberta: a MAIS CARA das respostas (conservador).
          var vencedora = cot.fornecedorVencedorConvidadoKey === fk;
          if (!melhor || vencedora || (!melhor.vencedora && c.valor > melhor.valor)) melhor = { valor: c.valor, unidade: c.unidade, vencedora: vencedora, em: f.respondidoEm || cot.criadoEm };
        });
        if (melhor) add(it.materialCodigo, { valor: melhor.valor, unidade: melhor.unidade, fonte: PROCEDENCIA.COTADO,
          ref: 'Cotação ' + (cot.numeroFormatado || ck), refKey: ck + '/' + ik, em: melhor.em || null });
      });
    });
    Object.keys(b.custos_precos || {}).forEach(function(mk) {
      var p = b.custos_precos[mk];
      if (!p || !idx[norm((b.materiais || {})[mk] && b.materiais[mk].mpCodigo)]) return;
      var cod = b.materiais[mk].mpCodigo;
      if (num(p.valor) > 0) add(cod, { valor: num(p.valor), unidade: un(p.unidade) || null, fonte: PROCEDENCIA.MANUAL,
        ref: p.motivo || 'digitado', refKey: 'custos_precos/' + mk, em: p.em || p.definidoEm || null, por: p.por || null });
      Object.keys(p.historico || {}).forEach(function(hk) {
        var h = p.historico[hk];
        if (h && num(h.valor) > 0) add(cod, { valor: num(h.valor), unidade: un(h.unidade) || null, fonte: PROCEDENCIA.MANUAL,
          ref: h.motivo || 'digitado', refKey: 'custos_precos/' + mk + '/historico/' + hk, em: h.em || null, por: h.por || null, substituido: true });
      });
    });
    // Estimativa do P&D: R$/kg do ingrediente da fórmula de amostra, ligado ao
    // material pelo de-para CONFIRMADO (nome do P&D não é código do cadastro).
    var pdItens = b.pd_formula_items || {};
    Object.keys(pdItens).forEach(function(k) {
      var it = pdItens[k];
      if (!it || it.is_deleted || !(num(it.price_per_kg) > 0)) return;
      var cod = it.material_code || null;
      if (!cod) {
        var d = (deparaPd || {})[depKey(it.ingredient_name)];
        if (!d || d.ignorar || !d.materialCodigo) return;
        cod = d.materialCodigo;
      }
      add(cod, { valor: num(it.price_per_kg), unidade: 'KG', fonte: PROCEDENCIA.ESTIMADO_PD,
        ref: 'P&D: ' + (it.ingredient_name || ''), refKey: 'pd_formula_items/' + k, em: it.updated_at || it.created_at || null });
    });
    return fontes;
  }

  // Chave do de-para do P&D: nome normalizado, sem caractere proibido no RTDB.
  function depKey(nome) { return nomeNormalizado(nome).replace(/ /g, '_').slice(0, 120) || '_'; }

  function porMaturidade(a, b) {
    var d = (MATURIDADE[b.fonte] || 0) - (MATURIDADE[a.fonte] || 0);
    if (d) return d;
    if (!!a.substituido !== !!b.substituido) return a.substituido ? 1 : -1;
    return String(b.em || '').localeCompare(String(a.em || ''));
  }

  /* Preço vigente por material + histórico + erro da estimativa do P&D (o
     indicador de qualidade da estimativa: de quanto o P&D errou quando Compras
     trouxe o preço de verdade). Só compara quando a unidade é a mesma. */
  function resolverPrecos(fontes) {
    var out = {};
    Object.keys(fontes || {}).forEach(function(mk) {
      var lista = fontes[mk].slice().sort(porMaturidade);
      var vig = lista[0];
      var est = lista.filter(function(c) { return c.fonte === PROCEDENCIA.ESTIMADO_PD; })
        .sort(function(a, b) { return String(b.em || '').localeCompare(String(a.em || '')); })[0];
      var desvio = null;
      if (est && vig.fonte !== PROCEDENCIA.ESTIMADO_PD && un(est.unidade) === un(vig.unidade) && est.valor > 0) {
        desvio = { estimado: est.valor, vigente: vig.valor, pct: (vig.valor / est.valor - 1) * 100, fonteVigente: vig.fonte };
      }
      out[mk] = { valor: vig.valor, unidade: vig.unidade, fonte: vig.fonte, ref: vig.ref, refKey: vig.refKey, em: vig.em,
        historico: lista, desvioEstimativaPd: desvio };
    });
    return out;
  }

  /* Sugestões de de-para ingrediente do P&D -> material do cadastro, por
     sobreposição de palavras (nome e INCI). É SUGESTÃO: medido em 26/10, só 25
     de 170 ingredientes casam por nome exato -- o resto precisa de alguém
     confirmar, e é o que a tela faz. Só matéria-prima (MPGR/MPES). */
  function sugerirDeparaPd(ingrediente, inci, materiais, limite) {
    var alvo = nomeNormalizado(ingrediente).split(' ').filter(function(t) { return t.length > 2; });
    var alvoInci = nomeNormalizado(inci);
    var res = [];
    Object.keys(materiais || {}).forEach(function(k) {
      var m = materiais[k];
      if (!m || m.ativo === false || !/^MP/.test(norm(m.tipo))) return;
      var nome = nomeNormalizado(m.mpNome), toks = nome.split(' ');
      var comuns = alvo.filter(function(t) { return toks.indexOf(t) >= 0; }).length;
      var uniao = alvo.length + toks.filter(function(t) { return t.length > 2; }).length - comuns;
      var score = uniao > 0 ? comuns / uniao : 0;
      if (nome === nomeNormalizado(ingrediente)) score = 1;
      if (alvoInci && m.inci && nomeNormalizado(m.inci) === alvoInci) score = Math.max(score, 0.9);
      if (score > 0) res.push({ key: k, codigo: m.mpCodigo, nome: m.mpNome, score: arred(score, 3) });
    });
    return res.sort(function(a, b) { return b.score - a.score; }).slice(0, limite || 3);
  }

  function mediana(arr) {
    var v = arr.filter(function(x) { return x > 0; }).sort(function(a, b) { return a - b; });
    if (!v.length) return null;
    var m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  /* Ritmo (peças/hora) de cada SKU, sempre pelo valor CONSERVADOR (CLAUDE.md:
     "capacidade sempre pelo valor conservador"): o menor entre o prodHoraRef do
     cadastro e a mediana histórica das OPs (ops.mediaPorHora). Sem nenhum dos
     dois, a mediana do grupo parecido (categoria + subcategoria + volume) e, por
     último, a mediana da planta. A origem vai junto. `desdeISO` limita o
     histórico (12 meses é o padrão de quem chama). */
  function ritmosPorSku(produtos, ops, desdeISO) {
    var hist = {};
    Object.keys(ops || {}).forEach(function(k) {
      var o = ops[k];
      if (!o || !o.sku || !(num(o.mediaPorHora) > 0) || !(num(o.produzido) > 0)) return;
      if (desdeISO && String(o.dataFimReal || o.dataInicioReal || '') < desdeISO) return;
      (hist[norm(o.sku)] = hist[norm(o.sku)] || []).push(num(o.mediaPorHora));
    });
    // Grupo só existe com subcategoria e volume: "sem categoria" não é parecido com nada.
    function grupo(p) { return norm(p.subcategoria) && num(p.volume) > 0 ? [norm(p.categoria), norm(p.subcategoria), num(p.volume)].join('|') : null; }
    var porGrupo = {}, todos = [];
    Object.keys(produtos || {}).forEach(function(k) {
      var p = produtos[k];
      if (!p || !p.sku) return;
      var r = num(p.prodHoraRef);
      if (r > 0) { var g = grupo(p); if (g) (porGrupo[g] = porGrupo[g] || []).push(r); todos.push(r); }
    });
    var planta = mediana(todos);
    var out = {};
    Object.keys(produtos || {}).forEach(function(k) {
      var p = produtos[k];
      if (!p || !p.sku) return;
      var sku = norm(p.sku), ref = num(p.prodHoraRef), h = mediana(hist[sku] || []);
      var r;
      if (ref > 0 && h > 0) r = h < ref ? { valor: h, origem: 'HISTORICO', referencia: ref, historico: h } : { valor: ref, origem: 'CADASTRO', referencia: ref, historico: h };
      else if (ref > 0) r = { valor: ref, origem: 'CADASTRO', referencia: ref, historico: null };
      else if (h > 0) r = { valor: h, origem: 'HISTORICO', referencia: null, historico: h };
      else if (grupo(p) && mediana(porGrupo[grupo(p)] || [])) r = { valor: mediana(porGrupo[grupo(p)]), origem: 'GRUPO', referencia: null, historico: null };
      else if (planta) r = { valor: planta, origem: 'PLANTA', referencia: null, historico: null };
      else r = { valor: null, origem: null };
      out[sku] = r;
    });
    return out;
  }

  function hhmm(s) { var m = String(s || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) + Number(m[2]) / 60 : null; }

  /* Horas úteis de um dia e de um mês, do turno do config (início, fim, fim na
     sexta, pausa) e do calendário do planejamento (dias da semana, feriados).
     Medido em 14/09: 9 h por dia, 8 h na sexta. Sem turno configurado -> null. */
  function horasDoDia(config, dataISO) {
    var c = config || {}, turno = c.turnoFixoNome || Object.keys(c.turnoHorarios || {})[0];
    if (!turno) return null;
    var d = new Date(dataISO + 'T12:00:00Z'), dow = d.getUTCDay();
    var plan = c.planejamento || {};
    var dias = Array.isArray(plan.diasSemana) && plan.diasSemana.length ? plan.diasSemana : [1, 2, 3, 4, 5];
    if (dias.indexOf(dow) < 0) return 0;
    var feriados = plan.feriados || [];
    var listaFer = Array.isArray(feriados) ? feriados : Object.keys(feriados).map(function(k) { return feriados[k]; });
    if (listaFer.some(function(f) { return String((f && (f.data || f.date)) || f).slice(0, 10) === dataISO; })) return 0;
    var ini = hhmm((c.turnoHorarios || {})[turno]);
    var fim = hhmm(dow === 5 && (c.turnoHorariosFimSexta || {})[turno] ? c.turnoHorariosFimSexta[turno] : (c.turnoHorariosFim || {})[turno]);
    if (ini == null || fim == null || fim <= ini) return null;
    var pausa = (c.turnoPausas || {})[turno];
    var p = pausa ? Math.max(0, (hhmm(pausa.fim) || 0) - (hhmm(pausa.inicio) || 0)) : 0;
    return fim - ini - p;
  }

  function horasUteisDoMes(config, competencia) {
    var ano = Number(competencia.slice(0, 4)), mes = Number(competencia.slice(5, 7));
    var dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    var total = 0, uteis = 0;
    for (var d = 1; d <= dias; d++) {
      var iso = competencia + '-' + (d < 10 ? '0' : '') + d;
      var h = horasDoDia(config, iso);
      if (h == null) return { ok: false, horasUteis: null, diasUteis: null, motivo: 'turno sem horário no Ajustes' };
      if (h > 0) { total += h; uteis++; }
    }
    return { ok: true, horasUteis: total, diasUteis: uteis };
  }

  /* Taxas da competência. Duas taxas, de propósito, porque o plano separa:
   *  - OPERAÇÃO DIRETA (entra no LP): folha da produção ÷ hora-linha DISPONÍVEL.
   *    A ociosidade NÃO é diluída no LP (PLANO_CUSTOS_RESULTADO §1.5): o custo
   *    da hora parada vai para o custo fixo que a meta cobre.
   *  - PLENA / absorção (PROMPT_CUSTOS_ERP §5.4): (folha + fixos de produção) ÷
   *    horas-PADRÃO realizadas. É o custo cheio para precificar, e a diferença
   *    para a disponível é a linha "capacidade ociosa".
   * Custo-hora por linha digitado tem precedência sobre o rateio da folha.
   * Despesa ADMINISTRATIVA nunca absorve em produto (Regra 4): entra só no
   * custo fixo da meta. Dado faltando -> null com motivo, nunca zero. */
  function taxasDaCompetencia(a) {
    var x = a || {}, op = x.operacao || null;
    var horas = num(x.horasUteis), linhas = num(x.linhasAtivas), hp = num(x.horasPadraoRealizadas);
    var hld = horas > 0 && linhas > 0 ? horas * linhas : null;
    var faltam = [];
    if (!op) faltam.push('custo da operação da competência não informado');
    if (!hld) faltam.push('horas úteis ou linhas ativas indisponíveis');
    var folha = op && op.folhaProducao != null && op.folhaProducao !== '' ? num(op.folhaProducao) : null;
    if (op && folha == null) faltam.push('folha da produção não informada');
    var fixosProd = 0, fixosAdm = 0;
    var fixos = (op && op.fixos) || {};
    Object.keys(fixos).forEach(function(k) {
      var f = fixos[k]; if (!f) return;
      if (f.rateio === 'ADMINISTRATIVO') fixosAdm += num(f.valor); else fixosProd += num(f.valor);
    });
    var porLinha = {};
    Object.keys((op && op.custoHoraLinha) || {}).forEach(function(l) { if (num(op.custoHoraLinha[l]) > 0) porLinha[nomeLinha(l)] = num(op.custoHoraLinha[l]); });
    var custoHoraDireta = folha != null && hld ? folha / hld : null;
    var ocupacao = hld && hp > 0 ? hp / hld : null;
    var custoHoraPlena = folha != null && hp > 0 ? (folha + fixosProd) / hp : null;
    var custoHoraDisponivel = folha != null && hld ? (folha + fixosProd) / hld : null;
    var ociosidade = folha != null && ocupacao != null ? (folha + fixosProd) * Math.max(0, 1 - ocupacao) : null;
    return {
      ok: !faltam.length, faltam: faltam,
      horasUteis: horas || null, linhasAtivas: linhas || null, horaLinhaDisponivel: hld,
      horasPadraoRealizadas: hp || 0, ocupacaoPct: ocupacao != null ? ocupacao * 100 : null,
      folhaProducao: folha, fixosProducao: fixosProd, fixosAdministrativos: fixosAdm,
      custoHoraDireta: custoHoraDireta, custoHoraLinha: porLinha,
      custoHoraPlena: custoHoraPlena, custoHoraDisponivel: custoHoraDisponivel,
      custoOciosidadeMes: ociosidade,
      // O que a meta precisa cobrir no mês: fixos (produção + administrativo) + a
      // hora direta paga e parada. Sem folha, não existe.
      custoFixoMensal: folha != null && ocupacao != null ? fixosProd + fixosAdm + folha * Math.max(0, 1 - ocupacao) : null,
      versaoMotor: VERSAO_MOTOR
    };
  }

  // Chave de SKU no RTDB (custos/material_cliente, custos/fichas): sem . # $ / [ ].
  function chaveSku(s) { return norm(s).replace(/[.#$/[]]/g, '_'); }

  /* Ritmo do SKU numa competência: histórico dos 12 meses anteriores a ela. O
     MESMO recorte na tela, na tabela de pontos e no placar. */
  function ritmosDaCompetencia(produtos, ops, competencia) {
    var a = Number(String(competencia).slice(0, 4)), m = Number(String(competencia).slice(5, 7));
    var desde = (a - 1) + '-' + (m < 10 ? '0' : '') + m + '-01';
    return ritmosPorSku(produtos, ops, desde);
  }

  /* Horas-padrão realizadas por mês (Σ produzido ÷ ritmo do SKU), das OPs. */
  function horasPadraoPorMes(ops, ritmos) {
    var out = {};
    Object.keys(ops || {}).forEach(function(k) {
      var o = ops[k];
      if (!o || !(num(o.produzido) > 0) || !o.sku) return;
      var mes = String(o.dataFimReal || o.dataInicioReal || '').slice(0, 7);
      var r = (ritmos || {})[norm(o.sku)];
      if (!mes || !r || !(r.valor > 0)) return;
      out[mes] = (out[mes] || 0) + num(o.produzido) / r.valor;
    });
    return out;
  }

  /* Taxa para a ficha padrão de uma competência -- a MESMA na tela da diretoria
     e no servidor que congela a tabela de pontos. Base de horas-padrão: a média
     dos 3 últimos meses COM produção antes da competência (o mês corrente não
     fechou; e o erpkuryos ficou sem OP depois de 21/09). Custo da operação: o da
     competência; sem ele, o último informado antes -- declarado em
     competenciaOperacao. */
  function taxaParaCompetencia(base, competencia, ritmos) {
    var b = base || {}, custos = b.custos || {};
    var operacoes = custos.operacao || {};
    var compOp = operacoes[competencia] ? competencia
      : Object.keys(operacoes).filter(function(k) { return k < competencia; }).sort().pop() || null;
    var hpMes = horasPadraoPorMes(b.ops, ritmos);
    var meses = Object.keys(hpMes).filter(function(m) { return m < competencia; }).sort().slice(-3);
    var hp = meses.length ? meses.reduce(function(s, m) { return s + hpMes[m]; }, 0) / meses.length : 0;
    var horas = horasUteisDoMes(b.config || {}, competencia);
    var params = custos.parametros || {};
    var linhas = num(params.linhasAtivas) || ((b.config || {}).linhas || []).length || null;
    var taxa = taxasDaCompetencia({ operacao: compOp ? operacoes[compOp] : null, horasUteis: horas.horasUteis,
      linhasAtivas: linhas, horasPadraoRealizadas: hp });
    taxa.competencia = competencia;
    taxa.competenciaOperacao = compOp;
    taxa.mesesBaseHorasPadrao = meses;
    return taxa;
  }

  /* LPD padrão: LP × peças que a linha faz num dia no ritmo conservador. É o que
     mostra que LP alto com ritmo baixo pode render menos que LP baixo com ritmo alto. */
  function lpdPadrao(ficha, horasDia) {
    if (!ficha || ficha.lp == null || !ficha.ritmo || !(ficha.ritmo.valor > 0) || !(num(horasDia) > 0)) return null;
    return ficha.lp * ficha.ritmo.valor * num(horasDia);
  }

  // "Linha 01", "linha 1" e "Linha 1" são a mesma linha.
  function nomeLinha(l) {
    var m = String(l || '').match(/^\s*linha\s*0*(\d+)\s*$/i);
    return m ? 'Linha ' + Number(m[1]) : String(l || '').trim();
  }
  function ehLinhaEnvase(l) { return /^Linha \d+$/.test(nomeLinha(l)); }

  /* Preço de venda vigente numa data: a vigência mais recente que já começou.
     Fonte: precos_venda/{sku}/vigencias (Gestão Comercial). */
  function precoVendaVigente(registro, dataISO) {
    var vig = (registro && registro.vigencias) || {};
    var dia = String(dataISO || '9999-12-31').slice(0, 10);
    var lista = Object.keys(vig).map(function(k) { return vig[k]; })
      .filter(function(v) { return v && num(v.preco) > 0 && String(v.inicio || '') <= dia; })
      .sort(function(a, b) { return String(b.inicio).localeCompare(String(a.inicio)); });
    if (!lista.length) return { valor: null, motivo: 'sem preço de venda vigente' };
    return { valor: num(lista[0].preco), inicio: lista[0].inicio, origem: lista[0].origem || 'GESTAO_COMERCIAL' };
  }

  /* % de impostos sobre o preço: do cliente quando houver, senão o padrão.
     Não informado é null -- LP sem imposto descontado seria LP inflado. */
  function impostosPct(parametros, clienteKey) {
    var p = parametros || {};
    var porCliente = (p.impostosPorCliente || {})[clienteKey];
    if (porCliente != null && porCliente !== '') return num(porCliente);
    if (p.impostosPct != null && p.impostosPct !== '') return num(p.impostosPct);
    return null;
  }

  /* Ficha PADRÃO de um SKU e o LP padrão (PLANO_CUSTOS_RESULTADO §5):
   *   granel     = custo/kg da fórmula × massa sem perda
   *   embalagem  = BOM × preço
   *   perdas     = parte do granel da perda de processo + embalagem × perda de linha
   *   operação   = custo-hora DIRETA da linha ÷ ritmo conservador
   *   LP         = preço × (1 − impostos) − (granel + embalagem + perdas + operação)
   * Custo fixo NÃO entra no LP: entra na meta. O custo pleno (com fixos de
   * produção absorvidos por hora-padrão) sai ao lado, para precificar.
   * Qualquer componente faltando -> o total e o LP são null, as partes ficam, e
   * a lista do que falta vem separada em "sem preço" × "sem cadastro" (Regra 3). */
  function fichaPadraoSku(args) {
    var a = args || {};
    var produto = a.produto || {};
    var sku = norm(produto.sku || a.sku);
    var idx = a.idxMateriais || {};
    var vs = a.versao || versaoParaCusto(produto.sku, a.formulas, a.bom, a.especificacoes);
    var avisos = [];
    if (vs.versao && !(vs.aprovada.formula && vs.aprovada.bom)) avisos.push('Fórmula/BOM da versão ' + vs.versao + ' ainda não aprovadas: o custo pode mudar na aprovação.');

    // Densidade: a do cadastro do produto; sem ela, o máximo da especificação.
    var dens = num(produto.densidadeGranel) > 0 ? { valor: num(produto.densidadeGranel), origem: 'CADASTRO' } : null;
    if (!dens) {
      var de = densidadeDaEspecificacao(vs.especificacao);
      if (de.ok) { dens = { valor: de.valor, origem: de.origem, faixa: [de.minimo, de.maximo] }; avisos.push('Densidade ' + de.valor + ' (máximo da especificação): cadastre a medida no produto.'); }
    }
    var prodComDens = {};
    Object.keys(produto).forEach(function(k) { prodComDens[k] = produto[k]; });
    prodComDens.densidadeGranel = dens ? dens.valor : null;
    var perdaProc = num(produto.perdaProcessoPct);
    var semPerda = {}; Object.keys(prodComDens).forEach(function(k) { semPerda[k] = prodComDens[k]; });
    semPerda.perdaProcessoPct = 0;

    // Preços com o material do cliente zerado DE PROPÓSITO (carimbo CLIENTE).
    var precos = a.precos || {};
    var doCliente = a.materialCliente || {};
    if (Object.keys(doCliente).length) {
      var copia = {};
      Object.keys(precos).forEach(function(k) { copia[k] = precos[k]; });
      Object.keys(doCliente).forEach(function(k) { if (doCliente[k]) copia[k] = { valor: 0, fonte: PROCEDENCIA.CLIENTE, ref: 'fornecido pelo cliente' }; });
      precos = copia;
    }

    var temFormula = !!(vs.formula && Object.keys(vs.formula.itens || {}).length);
    var granelKg = temFormula ? custoPorKgFormula(vs.formula, idx, precos) : null;
    var massa = massaGranelPorPeca(prodComDens), massaBase = massaGranelPorPeca(semPerda);
    var embalagem = custoEmbalagemPorPeca(vs.bom, idx, precos);
    if (!vs.bom || !Object.keys(vs.bom.itens || {}).length) embalagem = { custoPorPeca: null, completo: false, linhas: [], semCusto: [], incompativeis: [], semBom: true };

    var granel = { custoPorKg: granelKg ? granelKg.custoPorKg : null, completo: granelKg ? granelKg.completo : !temFormula && !!a.semGranel,
      massaKgPorPeca: massa.ok ? massa.kg : null, densidade: dens, linhas: granelKg ? granelKg.linhas : [],
      semCusto: granelKg ? granelKg.semCusto : [], incompativeis: granelKg ? granelKg.incompativeis : [],
      pctCobertoMM: granelKg ? granelKg.pctCobertoMM : 0, somaPercentual: granelKg ? granelKg.somaPercentual : 0 };
    granel.custoPorPeca = granelKg && granelKg.custoPorKg != null && massaBase.ok ? granelKg.custoPorKg * massaBase.kg : null;
    if (!temFormula && !a.semGranel) avisos.push('SKU sem fórmula cadastrada.');
    if (temFormula && !massa.ok) avisos.push('Granel por peça indisponível: ' + massa.motivo + '.');
    if (granelKg && granelKg.somaPercentual > 0 && (granelKg.somaPercentual < 99 || granelKg.somaPercentual > 101)) avisos.push('Fórmula soma ' + arred(granelKg.somaPercentual, 1) + '% em vez de 100%.');

    var perdaGranel = granelKg && granelKg.custoPorKg != null && massa.ok && massaBase.ok ? granelKg.custoPorKg * (massa.kg - massaBase.kg) : (perdaProc > 0 ? null : 0);
    var perdaLinha = num(produto.perdaLinhaPct);
    var perdaEmb = embalagem.custoPorPeca != null ? embalagem.custoPorPeca * perdaLinha / 100 : (perdaLinha > 0 ? null : 0);
    var perdas = { custoPorPeca: perdaGranel != null && perdaEmb != null ? perdaGranel + perdaEmb : null,
      granel: perdaGranel, embalagem: perdaEmb, perdaProcessoPct: perdaProc, perdaLinhaPct: perdaLinha };

    // Operação direta: custo-hora da linha (digitado) ou da planta ÷ ritmo.
    var taxa = a.taxa || null, ritmo = a.ritmo || { valor: null };
    var linha = nomeLinha(a.linha || '');
    var custoHora = taxa ? ((taxa.custoHoraLinha || {})[linha] || taxa.custoHoraDireta) : null;
    var operacao = null;
    if (custoHora > 0 && ritmo.valor > 0) {
      operacao = { custoPorPeca: custoHora / ritmo.valor, custoHora: custoHora, ritmo: ritmo.valor, ritmoOrigem: ritmo.origem,
        linha: (taxa.custoHoraLinha || {})[linha] ? linha : null,
        custoPlenoPorPeca: taxa.custoHoraPlena > 0 ? taxa.custoHoraPlena / ritmo.valor : null };
    }

    var materialOk = (granel.completo || (!temFormula && a.semGranel)) && (temFormula ? granel.custoPorPeca != null : true)
      && embalagem.completo && perdas.custoPorPeca != null;
    var custoMaterial = materialOk ? (granel.custoPorPeca || 0) + embalagem.custoPorPeca : null;
    var custoVariavel = materialOk && operacao ? custoMaterial + perdas.custoPorPeca + operacao.custoPorPeca : null;

    // Composição por procedência, ponderada pelo custo de cada linha.
    var porFonte = {}, totalComp = 0;
    function somarFonte(f, v) { if (v > 0) { porFonte[f] = (porFonte[f] || 0) + v; totalComp += v; } }
    if (massaBase.ok) (granel.linhas || []).forEach(function(l) { if (l.custoNoKg != null) somarFonte(l.fonte, l.custoNoKg * massaBase.kg); });
    (embalagem.linhas || []).forEach(function(l) { if (l.custoNaPeca != null) somarFonte(l.fonte, l.custoNaPeca); });
    var composicao = {};
    Object.keys(porFonte).forEach(function(f) { composicao[f] = totalComp > 0 ? porFonte[f] / totalComp * 100 : 0; });

    // Preço e LP.
    var preco = a.precoVenda || { valor: null, motivo: 'sem preço de venda' };
    var imp = a.impostosPct;
    var precoLiquido = preco.valor > 0 && imp != null ? preco.valor * (1 - imp / 100) : null;
    var lp = precoLiquido != null && custoVariavel != null ? precoLiquido - custoVariavel : null;
    var pendencias = [];
    if (!(preco.valor > 0)) pendencias.push({ tipo: 'PRECO_VENDA', texto: preco.motivo || 'sem preço de venda' });
    if (imp == null) pendencias.push({ tipo: 'IMPOSTOS', texto: '% de impostos não informado' });
    if (!operacao) pendencias.push({ tipo: 'OPERACAO', texto: !(ritmo.valor > 0) ? 'SKU sem ritmo (prodHoraRef)' : 'custo-hora da operação não informado' });
    if (temFormula && !massa.ok) pendencias.push({ tipo: 'DENSIDADE', texto: massa.motivo });
    if (!temFormula && !a.semGranel) pendencias.push({ tipo: 'CADASTRO', texto: 'sem fórmula' });
    if (embalagem.semBom) pendencias.push({ tipo: 'CADASTRO', texto: 'sem BOM' });
    var linhasSem = (granel.semCusto || []).concat(embalagem.semCusto || []);
    linhasSem.forEach(function(l) {
      var semCadastro = /não existe no cadastro/.test(l.motivo || '');
      pendencias.push({ tipo: semCadastro ? 'CADASTRO' : 'PRECO_MATERIAL', codigo: l.codigo, nome: l.nome,
        texto: semCadastro && !l.codigo ? 'item sem código do cadastro (ligar o item ao material)' : l.motivo });
    });
    (granel.incompativeis || []).concat(embalagem.incompativeis || []).forEach(function(l) {
      pendencias.push({ tipo: 'UNIDADE', codigo: l.codigo, nome: l.nome, texto: l.motivo });
    });

    return {
      sku: sku, descricao: produto.descricao || null, cliente: produto.cliente || null, clienteKey: produto.clienteKey || null,
      versao: vs.versao, aprovada: vs.aprovada,
      granel: granel, embalagem: embalagem, perdas: perdas, operacao: operacao,
      custoMaterial: custoMaterial, custoVariavel: custoVariavel,
      custoPleno: custoVariavel != null && operacao && operacao.custoPlenoPorPeca != null ? custoVariavel - operacao.custoPorPeca + operacao.custoPlenoPorPeca : null,
      precoVenda: preco, impostosPct: imp, precoLiquido: precoLiquido,
      lp: lp, lpInformado: num(produto.lp) > 0 ? num(produto.lp) : null,
      margemPct: lp != null && precoLiquido > 0 ? lp / precoLiquido * 100 : null,
      completo: lp != null,
      composicaoProcedencia: composicao,
      pagoCotadoPct: (composicao.PAGO || 0) + (composicao.COTADO || 0) + (composicao.CLIENTE || 0),
      pendencias: pendencias, avisos: avisos,
      ritmo: ritmo, competencia: a.competencia || null, versaoMotor: VERSAO_MOTOR
    };
  }

  /* LP do ORÇAMENTO (só SKU nascido no CRM): o que o Comercial vendeu. Custo
     de insumo da composição do orçamento aprovado (moeda convertida pela taxa
     da própria cotação; "fornecido pelo cliente" fora), mais a operação PADRÃO
     -- o orçamento cobra serviço, mas não traz o custo da hora. */
  function lpOrcamento(proposta, ctx) {
    var p = proposta || {}, c = ctx || {};
    var item = (p.items_pedido || [])[0] || {};
    var preco = num(p.preco_unitario) || num(item.valor_unitario);
    var comp = p.composicao || {};
    var taxa = num((comp.resumo || {}).taxa) || num((p.cambio_congelado || {}).taxa) || num((p.cambio_congelado || {}).valor);
    var custo = 0, falta = [];
    (comp.insumos || []).forEach(function(i) {
      if (!i || String(i.fornecido_por || '').toLowerCase() === 'cliente') return;
      var v = num(i.preco) * num(i.qtd_por_unidade);
      if (!(num(i.preco) > 0)) { falta.push(i.descricao || i.codigo); return; }
      if (String(i.moeda || 'BRL').toUpperCase() === 'USD') { if (!(taxa > 0)) { falta.push((i.descricao || i.codigo) + ' (US$ sem câmbio)'); return; } v *= taxa; }
      custo += v;
    });
    if (!(comp.insumos || []).length) falta.push('orçamento sem composição de custo');
    var imp = c.impostosPct;
    var liquido = preco > 0 && imp != null ? preco * (1 - imp / 100) : null;
    var operacao = c.operacaoPorPeca != null ? c.operacaoPorPeca : null;
    var lp = liquido != null && !falta.length && operacao != null ? liquido - custo - operacao : null;
    return { propostaId: p.id || null, sku: norm(item.codigo_kuryos), preco: preco || null, precoLiquido: liquido,
      custoInsumos: falta.length ? null : custo, operacao: operacao, lp: lp,
      faltam: falta.concat(imp == null ? ['% de impostos'] : []).concat(operacao == null ? ['operação padrão'] : []),
      aprovado: p.negociacao_status === 'aprovado' };
  }

  /* Monta o contexto de custo a partir da base crua -- os MESMOS nós na tela da
     diretoria e no servidor do placar, para que os dois não divirjam. `base`:
     materiais, produtos, formulas, bom, especificacoes, pedidos_compra,
     processos_cotacao, custos_precos, pd_formula_items, precos_venda, ops,
     config, custos (parametros, operacao, depara_pd, material_cliente), propostas. */
  function montarContextoCustos(base, opcoes) {
    var b = base || {}, o = opcoes || {};
    var custos = b.custos || {};
    var idx = indexarMateriais(b.materiais);
    var precos = resolverPrecos(fontesDePreco(b, idx, custos.depara_pd));
    var competencia = o.competencia || String(o.hoje || new Date().toISOString()).slice(0, 7);
    var ritmos = o.ritmos || ritmosDaCompetencia(b.produtos, b.ops, competencia);
    var parametros = custos.parametros || {};
    var taxa = o.taxa || null;
    var produtoPorSku = {};
    Object.keys(b.produtos || {}).forEach(function(k) { var p = b.produtos[k]; if (p && p.sku) produtoPorSku[norm(p.sku)] = p; });
    var propostaPorSku = {};
    Object.keys(b.propostas || {}).forEach(function(k) {
      var p = b.propostas[k];
      if (!p || p.negociacao_status !== 'aprovado') return;
      (p.items_pedido || []).forEach(function(i) { if (i && i.codigo_kuryos) propostaPorSku[norm(i.codigo_kuryos)] = p; });
    });
    // Linha mais usada do SKU (para o custo-hora por linha).
    var linhaPorSku = {};
    Object.keys(b.ops || {}).forEach(function(k) {
      var op = b.ops[k]; if (!op || !op.sku || !ehLinhaEnvase(op.linha)) return;
      var s = norm(op.sku); linhaPorSku[s] = linhaPorSku[s] || {};
      linhaPorSku[s][nomeLinha(op.linha)] = (linhaPorSku[s][nomeLinha(op.linha)] || 0) + num(op.produzido);
    });
    function linhaPrincipal(s) {
      var m = linhaPorSku[s] || {}, best = null;
      Object.keys(m).forEach(function(l) { if (!best || m[l] > m[best]) best = l; });
      return best;
    }
    var hoje = String(o.hoje || new Date().toISOString()).slice(0, 10);
    function precoDe(s, p) {
      var pv = precoVendaVigente((b.precos_venda || {})[s] || findPreco(b.precos_venda, s), hoje);
      if (pv.valor > 0) return pv;
      var prop = propostaPorSku[s];
      if (prop && num(prop.preco_unitario) > 0) return { valor: num(prop.preco_unitario), origem: 'ORCAMENTO_APROVADO', inicio: prop.negociacao_decidida_em || null };
      return pv;
    }
    function ficha(skuBruto) {
      var s = norm(skuBruto), p = produtoPorSku[s];
      if (!p) return null;
      var f = fichaPadraoSku({
        produto: p, formulas: b.formulas, bom: b.bom, especificacoes: b.especificacoes,
        idxMateriais: idx, precos: precos, materialCliente: (custos.material_cliente || {})[chaveSku(s)] || materialClienteDoKickoff(p, b),
        taxa: taxa, ritmo: ritmos[s], linha: linhaPrincipal(s),
        precoVenda: precoDe(s, p), impostosPct: impostosPct(parametros, p.clienteKey), competencia: competencia
      });
      var prop = propostaPorSku[s];
      if (prop) f.orcamento = lpOrcamento(prop, { impostosPct: f.impostosPct, operacaoPorPeca: f.operacao ? f.operacao.custoPorPeca : null });
      return f;
    }
    return { idx: idx, precos: precos, ritmos: ritmos, parametros: parametros, taxa: taxa, competencia: competencia,
      produtoPorSku: produtoPorSku, ficha: ficha, linhaPrincipal: linhaPrincipal, versaoMotor: VERSAO_MOTOR };
  }

  // precos_venda é chaveado por uma key do SKU; procura pelo campo sku quando a key difere.
  function findPreco(precosVenda, s) {
    var ks = Object.keys(precosVenda || {});
    for (var i = 0; i < ks.length; i++) if (precosVenda[ks[i]] && norm(precosVenda[ks[i]].sku) === s) return precosVenda[ks[i]];
    return null;
  }

  /* Material do cliente do SKU do CRM: o Kickoff diz "fornecido por" em cada
     insumo e o produto guarda de qual Kickoff veio. Legado: marcação manual em
     custos/material_cliente/{sku}. Aqui só o automático, pela composição do
     orçamento aprovado que gerou o SKU. */
  function materialClienteDoKickoff(produto, base) {
    var orig = (produto && produto.origemCrm) || {};
    var prop = orig.orcamentoId && (base.propostas || {})[orig.orcamentoId];
    var out = {};
    if (!prop) return out;
    var idx = indexarMateriais(base.materiais);
    ((prop.composicao || {}).insumos || []).forEach(function(i) {
      if (i && String(i.fornecido_por || '').toLowerCase() === 'cliente' && idx[norm(i.codigo)]) out[idx[norm(i.codigo)].key] = true;
    });
    return out;
  }

  /* Cobertura em % do VOLUME: quanto do volume produzido tem custo completo e
     quanto do custo dele é PAGO/COTADO. É o número que a tela mostra ao lado
     de qualquer total, porque um LP médio sobre 20% do volume não é o da fábrica. */
  function coberturaPorVolume(fichas, volumePorSku) {
    var total = 0, comLp = 0, pagoCot = 0;
    Object.keys(volumePorSku || {}).forEach(function(s) {
      var q = num(volumePorSku[s]), f = fichas[norm(s)];
      total += q;
      if (f && f.completo) { comLp += q; pagoCot += q * (f.pagoCotadoPct || 0) / 100; }
    });
    return { volumeTotal: total, volumeComLp: comLp, coberturaPct: total > 0 ? comLp / total * 100 : 0,
      pagoCotadoPct: comLp > 0 ? pagoCot / comLp * 100 : 0 };
  }

  return {
    VERSAO_MOTOR: VERSAO_MOTOR,
    MATURIDADE: MATURIDADE,
    numBR: numBR,
    nomeNormalizado: nomeNormalizado,
    depKey: depKey,
    densidadeDaEspecificacao: densidadeDaEspecificacao,
    versaoParaCusto: versaoParaCusto,
    custoUnitarioItemPC: custoUnitarioItemPC,
    custoUnitarioRespostaCotacao: custoUnitarioRespostaCotacao,
    fontesDePreco: fontesDePreco,
    resolverPrecos: resolverPrecos,
    sugerirDeparaPd: sugerirDeparaPd,
    mediana: mediana,
    ritmosPorSku: ritmosPorSku,
    horasDoDia: horasDoDia,
    horasUteisDoMes: horasUteisDoMes,
    taxasDaCompetencia: taxasDaCompetencia,
    horasPadraoPorMes: horasPadraoPorMes,
    chaveSku: chaveSku,
    ritmosDaCompetencia: ritmosDaCompetencia,
    taxaParaCompetencia: taxaParaCompetencia,
    lpdPadrao: lpdPadrao,
    nomeLinha: nomeLinha,
    ehLinhaEnvase: ehLinhaEnvase,
    precoVendaVigente: precoVendaVigente,
    impostosPct: impostosPct,
    fichaPadraoSku: fichaPadraoSku,
    lpOrcamento: lpOrcamento,
    montarContextoCustos: montarContextoCustos,
    materialClienteDoKickoff: materialClienteDoKickoff,
    coberturaPorVolume: coberturaPorVolume,
    PROCEDENCIA: PROCEDENCIA,
    NATUREZA: NATUREZA,
    naturezaDoMaterial: naturezaDoMaterial,
    indexarMateriais: indexarMateriais,
    precoDoMaterial: precoDoMaterial,
    precoPorKg: precoPorKg,
    custoPorKgFormula: custoPorKgFormula,
    massaGranelPorPeca: massaGranelPorPeca,
    custoEmbalagemPorPeca: custoEmbalagemPorPeca,
    fichaCustoProduto: fichaCustoProduto,
    filaPrecosPorExposicao: filaPrecosPorExposicao,
    materiaisParaCobrir: materiaisParaCobrir,
    planoCadastroPorSku: planoCadastroPorSku,
    precosParaVolume: precosParaVolume
  };
});
