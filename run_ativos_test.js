'use strict';
/* Manutenção › Cadastro de Ativos (19/10/2026) -- shared/ativos.js. */
const assert = require('node:assert/strict');
const A = require('./public/shared/ativos.js');
let n = 0; const ok = (nome, fn) => { fn(); n++; console.log('ok -', nome); };

const base = {
  a1: {codigo: 'RT-01', nome: 'Reator 500 kg', tipo: 'REATOR', area: 'MANIPULACAO', situacao: 'OPERACIONAL', exigeAssepsia: true},
  a2: {codigo: 'EV-01', nome: 'Envasadora pistão', tipo: 'ENVASADORA', area: 'ENVASE', linha: 'Linha 1', situacao: 'OPERACIONAL', exigeAssepsia: true},
  a3: {codigo: 'BL-01', nome: 'Balança 30 kg', tipo: 'BALANCA', area: 'LABORATORIO', situacao: 'EM_MANUTENCAO', exigeCalibracao: true, calibracaoPeriodicidadeMeses: 12},
  a4: {codigo: 'EV-02', nome: 'Envasadora velha', tipo: 'ENVASADORA', area: 'ENVASE', linha: 'linha  1', situacao: 'INATIVO', exigeAssepsia: true}
};

ok('normalizar: padrões do tipo, código em maiúsculas, números', () => {
  const a = A.normalizar({codigo: ' rt 02 ', nome: ' Reator 1000 ', tipo: 'REATOR', capacidade: '1.000'.replace('.', '')});
  assert.equal(a.codigo, 'RT-02');
  assert.equal(a.nome, 'Reator 1000');
  assert.equal(a.area, 'MANIPULACAO');
  assert.equal(a.exigeAssepsia, true);
  assert.equal(a.exigeCalibracao, false);
  assert.equal(a.capacidade, 1000);
  assert.equal(a.capacidadeUnidade, 'kg');
  assert.equal(a.situacao, 'OPERACIONAL');
  const b = A.normalizar({codigo: 'ph-1', nome: 'pHmetro', tipo: 'PHMETRO', capacidade: ''});
  assert.equal(b.exigeCalibracao, true);
  assert.equal(b.calibracaoPeriodicidadeMeses, 12, 'spec D-08: anual');
  assert.equal(b.capacidade, null);
  const c = A.normalizar({codigo: 'x', nome: 'y', tipo: 'ENVASADORA', exigeAssepsia: false, capacidade: '2,5'});
  assert.equal(c.exigeAssepsia, false, 'o ativo pode fugir do padrão do tipo');
  assert.equal(c.capacidade, 2.5);
  assert.equal(A.normalizar({tipo: 'INVENTADO'}).tipo, 'OUTRO');
});

ok('validar: obrigatórios, código único sem caixa/acento, capacidade e calibração', () => {
  assert.deepEqual(A.validar(A.normalizar({}), base).length, 2);
  const dup = A.validar(A.normalizar({codigo: 'rt-01', nome: 'Outro reator', tipo: 'REATOR'}), base);
  assert.match(dup.join(' '), /Já existe um equipamento com o código RT-01 \(Reator 500 kg\)/);
  assert.deepEqual(A.validar(A.normalizar({codigo: 'RT-01', nome: 'Reator 500 kg', tipo: 'REATOR'}), base, 'a1'), [], 'editar ele mesmo não é duplicado');
  assert.match(A.validar(A.normalizar({codigo: 'Z', nome: 'Z', tipo: 'OUTRO', capacidade: '-3'}), base).join(), /capacidade/);
  assert.match(A.validar(A.normalizar({codigo: 'Z', nome: 'Z', tipo: 'BALANCA', calibracaoPeriodicidadeMeses: '0'}), base).join(), /meses/);
});

ok('sugerirCodigo: próximo da sigla do tipo', () => {
  assert.equal(A.sugerirCodigo('ENVASADORA', base), 'EV-03');
  assert.equal(A.sugerirCodigo('REATOR', base), 'RT-02');
  assert.equal(A.sugerirCodigo('ESTUFA', base), 'EF-01');
  assert.equal(A.sugerirCodigo('REATOR', {}), 'RT-01');
});

ok('resumo e filtros', () => {
  const r = A.resumo(base);
  assert.equal(r.total, 4);
  assert.deepEqual(r.porSituacao, {OPERACIONAL: 2, EM_MANUTENCAO: 1, INATIVO: 1});
  assert.equal(r.assepsia, 2, 'inativo não conta');
  assert.equal(r.calibracao, 1);
  const cod = (f) => A.filtrar(base, f).map((a) => a.codigo);
  assert.deepEqual(cod({}), ['BL-01', 'EV-01', 'EV-02', 'RT-01']);
  assert.deepEqual(cod({busca: 'envasadora pistao'}), ['EV-01']);
  assert.deepEqual(cod({area: 'ENVASE'}), ['EV-01', 'EV-02']);
  assert.deepEqual(cod({linha: 'LINHA 1'}), ['EV-01', 'EV-02'], 'linha sem caixa/espaço');
  assert.deepEqual(cod({marcador: 'assepsia'}), ['EV-01', 'RT-01']);
  assert.deepEqual(cod({situacao: 'EM_MANUTENCAO'}), ['BL-01']);
});

ok('mudarSituacao: motivo obrigatório ao parar/inativar, histórico junto', () => {
  assert.match(A.mudarSituacao('a1', base.a1, 'EM_MANUTENCAO', {}).erro, /motivo/);
  assert.match(A.mudarSituacao('a1', base.a1, 'OPERACIONAL', {}).erro, /já está/);
  const r = A.mudarSituacao('a1', base.a1, 'EM_MANUTENCAO', {motivo: 'Vedação do eixo', por: 'Gustavo', agora: '2026-10-19T12:00:00Z', chaveHistorico: 'h1'});
  assert.equal(r.updates['ativos/a1/situacao'], 'EM_MANUTENCAO');
  assert.equal(r.updates['ativos/a1/situacaoMotivo'], 'Vedação do eixo');
  assert.deepEqual(r.updates['ativos_historico/a1/h1'], {de: 'OPERACIONAL', para: 'EM_MANUTENCAO', motivo: 'Vedação do eixo', por: 'Gustavo', em: '2026-10-19T12:00:00Z'});
  const volta = A.mudarSituacao('a3', base.a3, 'OPERACIONAL', {agora: 'x', chaveHistorico: 'h2'});
  assert.equal(volta.updates['ativos/a3/situacaoMotivo'], null, 'voltar a operar não pede motivo');
});

ok('consumidores: equipamentos da linha e por tipo, sem inativos', () => {
  assert.deepEqual(A.daLinha(base, 'Linha 1').map((a) => a.codigo), ['EV-01']);
  assert.deepEqual(A.daLinha(base, 'Linha 1', {assepsia: true}).map((a) => a.codigo), ['EV-01']);
  assert.deepEqual(A.porTipo(base, ['REATOR', 'TACHO']).map((a) => a.codigo), ['RT-01']);
});

ok('KO-13: leitura simples para o seletor de equipamentos do Kickoff, sem inativos, em ordem de código', () => {
  const sel = A.paraSelecao(base);
  assert.ok(sel.length > 0 && sel.every((a) => a.situacao !== 'INATIVO'), 'nenhum inativo');
  assert.deepEqual(sel.map((a) => a.codigo), A.filtrar(base, {}).filter((a) => a.situacao !== 'INATIVO').map((a) => a.codigo), 'mesma ordem do cadastro');
  const ev = sel.find((a) => a.codigo === 'EV-01');
  assert.equal(ev.rotulo, 'EV-01 — ' + base[Object.keys(base).find((k) => base[k].codigo === 'EV-01')].nome);
  assert.ok(ev.tipoRotulo && ev.areaRotulo, 'rótulos prontos para exibir');
  assert.deepEqual(A.paraSelecao(base, {area: 'ENVASE'}).map((a) => a.codigo), A.filtrar(base, {area: 'ENVASE'}).filter((a) => a.situacao !== 'INATIVO').map((a) => a.codigo), 'filtro por área');
  assert.deepEqual(A.paraSelecao({}), [], 'cadastro vazio: lista vazia');
});

// ── Integração com Cadastros, Compras e Logística (16/11/2026) ─────────────
const FORN = {
  f1: {nomeFantasia: 'VIDEOJET', razaoSocial: 'VIDEOJET DO BRASIL COMERCIO LTDA', tipos: {equipamentos: true}},
  f2: {nomeFantasia: '', razaoSocial: 'TECOS MAQ INDUSTRIA E COMERCIO LTDA'},
  f3: {nomeFantasia: 'Refrigeração Sul', razaoSocial: 'RS SERVICOS', tipos: {servicos: true}},
  f4: {nomeFantasia: 'VIDEO JET ANTIGO', ativo: false}
};

ok('fornecedores do ativo: escolhidos do cadastro gravam chave e nome', () => {
  const a = A.normalizar({codigo: 'CD-01', nome: 'Codificadora', tipo: 'CODIFICADORA', fornecedorFabricanteKey: 'f1', fornecedorAssistenciaKey: 'f3'}, FORN);
  assert.equal(a.fornecedorFabricanteKey, 'f1');
  assert.equal(a.fornecedorFabricanteNome, 'VIDEOJET');
  assert.equal(a.fabricante, 'VIDEOJET', 'fabricante vazio herda o nome do fornecedor');
  assert.equal(a.fornecedorAssistenciaNome, 'Refrigeração Sul');
  const b = A.normalizar({codigo: 'X', nome: 'Y', tipo: 'OUTRO', fabricante: 'Karr Italiana', fornecedorFabricanteKey: 'f2'}, FORN);
  assert.equal(b.fabricante, 'Karr Italiana', 'texto digitado continua valendo');
  assert.equal(b.fornecedorFabricanteNome, 'TECOS MAQ INDUSTRIA E COMERCIO LTDA', 'sem fantasia usa a razão social');
  const c = A.normalizar({codigo: 'X', nome: 'Y', tipo: 'OUTRO', fabricante: 'IBBL'});
  assert.equal(c.fornecedorFabricanteKey, null);
  assert.equal(c.fornecedorFabricanteNome, null);
  // Sem o nó de fornecedores (reabrir e salvar), o nome já gravado é mantido.
  assert.equal(A.normalizar({codigo: 'X', nome: 'Y', fornecedorAssistenciaKey: 'f3', fornecedorAssistenciaNome: 'Refrigeração Sul'}).fornecedorAssistenciaNome, 'Refrigeração Sul');
  assert.deepEqual(A.filtrar({z: Object.assign({}, a)}, {busca: 'refrigeracao sul'}).map((x) => x.codigo), ['CD-01'], 'busca acha pela assistência');
});

ok('sugerirFornecedores: casa o texto livre com o cadastro, sem palpite em N/I', () => {
  assert.deepEqual(A.sugerirFornecedores('VIDEO JET', FORN).map((x) => x.key), ['f1'], 'a base tem as duas grafias: VIDEO JET e VIDEOJET');
  assert.deepEqual(A.sugerirFornecedores('Videojet', FORN).map((x) => x.key), ['f1'], 'inativo fica de fora');
  assert.deepEqual(A.sugerirFornecedores('TECOS MAQ INDUSTRIA E COMERCIO LTDA', FORN).map((x) => x.key), ['f2']);
  assert.deepEqual(A.sugerirFornecedores('N/I', FORN), []);
  assert.deepEqual(A.sugerirFornecedores('MADE IN CHINA', FORN), []);
  // Ensaio com os 70 ativos reais: palavra genérica não pode sugerir sozinha.
  const F2 = {e1: {nomeFantasia: 'AZ EMBALAGENS DE PAPELAO LTDA'}, e2: {nomeFantasia: 'DEGRADE MAQUINAS E SISTEMAS LTDA'},
    e3: {nomeFantasia: 'UNIAO CONTRA INCENDIO'}, e4: {nomeFantasia: 'JETMACK CODIFICACAO'}};
  assert.deepEqual(A.sugerirFornecedores('CYCLOP SISTEMA DE EMBALAGENS', F2), [], 'a marca CYCLOP não está no cadastro');
  assert.deepEqual(A.sugerirFornecedores('ERLI MAQUINAS', F2), []);
  assert.deepEqual(A.sugerirFornecedores('UNIÃO EQUIPAMENTO CONTRA INCÊNDIO', F2).map((x) => x.key), ['e3']);
  assert.deepEqual(A.sugerirFornecedores('VIDEO JET', F2), [], 'JETMACK não é VIDEOJET');
  assert.deepEqual(A.sugerirFornecedores('', FORN), []);
});

ok('pecaDoMaterial: só MN (peça de manutenção) e MU (uso e consumo)', () => {
  const p = A.pecaDoMaterial({mpCodigo: 'MN-00001', mpNome: 'ROLAMENTO 6204', tipo: 'MN', unidade: 'un'}, {qtd: '2', obs: 'eixo do agitador'});
  assert.deepEqual(p, {materialCodigo: 'MN-00001', materialNome: 'ROLAMENTO 6204', unidade: 'un', qtdReferencia: 2, obs: 'eixo do agitador'});
  assert.equal(A.pecaDoMaterial({mpCodigo: 'MU-00005', mpNome: 'DESINFETANTE', tipo: 'MU'}).qtdReferencia, null);
  assert.match(A.pecaDoMaterial({mpCodigo: 'EP-00183', tipo: 'EP'}).erro, /EP-00183 é EP\. Peça de equipamento é MN/);
  assert.match(A.pecaDoMaterial(null).erro, /Escolha o material/);
  assert.match(A.pecaDoMaterial({mpCodigo: 'MN-1', tipo: 'MN'}, {qtd: '-1'}).erro, /maior ou igual a zero/);
});

ok('montarSolicitacao: SC do fluxo normal, com origem no ativo e linha de serviço', () => {
  let i = 0; const novaChave = () => 'k' + (++i);
  const ativo = {codigo: 'EV-01', nome: 'Envasadora pistão', fornecedorAssistenciaKey: 'f3'};
  const r = A.montarSolicitacao('a2', ativo, [
    {tipo: 'PECA', materialCodigo: 'MN-00001', materialNome: 'ROLAMENTO 6204', unidade: 'un', qtd: '2'},
    {tipo: 'SERVICO', descricao: 'Revisão do pistão dosador', qtd: 1, obs: 'técnico da assistência'}
  ], {justificativa: 'Vazamento no bico 3 desde ontem', por: 'Carlos', agora: '2026-11-16T10:00:00Z', novaChave});
  const s = r.registro;
  assert.equal(s.status, 'PENDENTE', 'entra na fila de aprovação de Compras como qualquer SC');
  assert.equal(s.justificativa, 'Manutenção EV-01 — Envasadora pistão: Vazamento no bico 3 desde ontem');
  assert.equal(s.origemModulo, 'MANUTENCAO');
  assert.deepEqual(s.origem, {tipo: 'ATIVO', ativoId: 'a2', ativoCodigo: 'EV-01', ativoNome: 'Envasadora pistão',
    fornecedorAssistenciaKey: 'f3', fornecedorFabricanteKey: null});
  assert.deepEqual(s.itens.k1, {materialCodigo: 'MN-00001', materialNome: 'ROLAMENTO 6204', qtd: 2, unidade: 'un', obs: ''});
  assert.deepEqual(s.itens.k2, {tipoItem: 'SERVICO', descricao: 'Revisão do pistão dosador', materialCodigo: '', materialNome: 'Revisão do pistão dosador',
    qtd: 1, unidade: 'SV', obs: 'técnico da assistência'});
  assert.equal(s.numero, undefined, 'o número sai do contador na hora de gravar');
  const k = () => 'x';
  assert.match(A.montarSolicitacao('a2', ativo, [{tipo: 'SERVICO', descricao: 'Revisão', qtd: 1}], {justificativa: 'curta', novaChave: k}).erro, /mínimo 10/);
  assert.match(A.montarSolicitacao('a2', ativo, [], {justificativa: 'Motivo suficiente aqui', novaChave: k}).erro, /ao menos uma/);
  assert.match(A.montarSolicitacao('a2', ativo, [{tipo: 'PECA', qtd: 1}], {justificativa: 'Motivo suficiente aqui', novaChave: k}).erro, /Linha 1: escolha a peça/);
  assert.match(A.montarSolicitacao('a2', ativo, [{tipo: 'SERVICO', descricao: 'ab', qtd: 1}], {justificativa: 'Motivo suficiente aqui', novaChave: k}).erro, /descreva o serviço/);
  assert.match(A.montarSolicitacao('a2', ativo, [{tipo: 'PECA', materialCodigo: 'MN-1', qtd: 0}], {justificativa: 'Motivo suficiente aqui', novaChave: k}).erro, /quantidade/);
  assert.match(A.montarSolicitacao('a9', {}, [], {justificativa: 'x'}).erro, /não encontrado/);
});

ok('comprasDoAtivo: SC -> cotação -> PC, mais recente primeiro, com a etapa legível', () => {
  const scs = {
    s1: {numeroFormatado: 'SC-0050', status: 'CONSOLIDADA', criadoEm: '2026-11-10', origem: {tipo: 'ATIVO', ativoId: 'a2'}, itens: {i: {materialCodigo: 'MN-1', qtd: 2}}},
    s2: {numeroFormatado: 'SC-0051', status: 'PENDENTE', criadoEm: '2026-11-15', origem: {tipo: 'ATIVO', ativoId: 'a2'}, itens: {}},
    s3: {numeroFormatado: 'SC-0052', status: 'APROVADA', criadoEm: '2026-11-16', origem: {tipo: 'ATIVO', ativoId: 'OUTRO'}},
    s4: {numeroFormatado: 'SC-0040', status: 'APROVADA', criadoEm: '2026-11-01', pedidoOrigemKey: 'p'}
  };
  const procs = {c1: {numeroFormatado: 'COT-0045', status: 'CONCLUIDO', solicitacoesOrigem: {s1: {}}}};
  const pcs = {
    p1: {numeroFormatado: 'PC-0090', status: 'ENVIADO', fornecedorNome: 'Refrigeração Sul', dataPrevistaEntrega: '2026-11-20', itens: {x: {origemSolicitacaoKey: 's1'}}},
    p2: {numeroFormatado: 'PC-0091', status: 'ENVIADO', itens: {x: {origemSolicitacaoKey: 's4'}}}
  };
  const c = A.comprasDoAtivo('a2', scs, procs, pcs);
  assert.deepEqual(c.map((x) => x.numero), ['SC-0051', 'SC-0050']);
  assert.deepEqual(c[1].cotacoes.map((x) => x.numero), ['COT-0045']);
  assert.deepEqual(c[1].pcs, [{key: 'p1', numero: 'PC-0090', status: 'ENVIADO', fornecedor: 'Refrigeração Sul', dataPrevista: '2026-11-20'}]);
  assert.equal(A.etapaCompra(c[0]).rotulo, 'Aguardando aprovação de Compras');
  assert.equal(A.etapaCompra(c[1]).rotulo, 'Pedido de Compra emitido');
  assert.equal(A.etapaCompra({status: 'APROVADA', cotacoes: [{}], pcs: []}).rotulo, 'Em cotação (orçamento)');
  assert.equal(A.etapaCompra({pcs: [{status: 'RECEBIDO_TOTAL'}]}).rotulo, 'Recebido / serviço atestado');
  assert.equal(A.etapaCompra({pcs: [{status: 'RECEBIDO_PARCIAL'}, {status: 'ENVIADO'}]}).rotulo, 'Recebido em parte');
  assert.equal(A.etapaCompra({status: 'REJEITADA'}).cor, 'bad');
  assert.deepEqual(A.comprasDoAtivo('a2', null, null, null), []);
});

console.log(`\nrun_ativos_test: ${n} OK`);
