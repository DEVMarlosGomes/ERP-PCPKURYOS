'use strict';
const {analisar, mesmoCliente, destinoDaCarga, mensagemOutroCliente, mensagemFrete} = require('./expedicao_regras');
function falhar(message, code = 'failed-precondition') { throw Object.assign(new Error(message), {code}); }
function chave(v) { return typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v); }
function texto(v, limite = 200) { return String(v || '').trim().slice(0, limite); }
function snapshotContato(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return {id: texto(v.id, 128) || null, nome: texto(v.nome), email: texto(v.email), telefone: texto(v.telefone, 60),
    areas: Array.isArray(v.areas) ? [...new Set(v.areas.filter(a => ['COMERCIAL','COMPRAS','TECNICO','LOGISTICA','FINANCEIRO','OUTRA'].includes(a)))] : [],
    outraArea: texto(v.outraArea), observacoes: texto(v.observacoes, 2000)};
}
function dataValida(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v; }
function referencias(paletes) { return (paletes || []).map(p => p.itemKey + '/' + p.loteKey).sort().join('|'); }
// Carga faturada que não coube no veículo (cubagem/peso) segue em outra viagem
// com a mesma NF: a agenda fica EXPEDIDO_PARCIAL e o saldo continua reservado.
const ATIVAS = ['AGENDADO', 'EXPEDIDO_PARCIAL'];
function ativa(agenda) { return !!agenda && ATIVAS.includes(agenda.status); }
function pendente(p) { return Math.max(Number(p.quantidade || 0) - Number(p.embarcado || 0), 0); }
function paletesPendentes(agenda) { return ((agenda && agenda.paletes) || []).filter(p => pendente(p) > 0); }
/* ── Editar os paletes de uma carga agendada (16/11/2026) ─────────────
   Pedido do Gustavo e do Vicenzo: "vamos ter que remontar para atender o
   frete do cliente" -- reordenar e remontar paletes e cargas como um CRUD.
   Até aqui a composição da carga era fixa: para mudar, só cancelando.
   Regras (as mesmas do agendamento, para cada palete NOVO):
   - só carga que ainda não saiu (AGENDADO, sem viagem) e sem NF emitida;
   - com faturamento SOLICITADO, a solicitação fica marcada como
     desatualizada: o Financeiro precisa de uma nova (o servidor recusa a NF);
   - mesmo cliente, destino e CIF/FOB; palete liberado e fora de outra carga;
   - nada se apaga: antes/depois e o motivo ficam no histórico da carga. */
function editarPaletesAgenda(base, dados, autor, agora, anterior) {
  if (!anterior) falhar('Agendamento não encontrado.', 'not-found');
  if (anterior.status !== 'AGENDADO' || Object.keys(anterior.viagens || {}).length)
    falhar('Parte desta carga já saiu: a composição não muda mais. O saldo segue na próxima viagem.');
  const fat = JSON.parse(JSON.stringify(anterior.faturamento || {}));
  if (fat.status === 'FATURADO')
    falhar('Carga já faturada: a NF foi emitida com estes paletes. Trate a NF com o Financeiro (cancelar ou complementar) antes de mudar a composição.');
  const motivo = texto(dados.motivo, 500);
  if (motivo.length < 5) falhar('Informe o motivo da mudança na carga (ex.: remontada para o frete do cliente).', 'invalid-argument');
  const paletes = dados.paletes;
  if (!Array.isArray(paletes) || paletes.length < 1 || paletes.length > 100) falhar('A carga precisa de 1 a 100 paletes.', 'invalid-argument');
  const hoje = new Date(agora).toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
  const antes = {};
  (anterior.paletes || []).forEach(p => { antes[p.itemKey + '/' + p.loteKey] = p; });
  const vistos = new Set(), analisadas = [], pedidos = {};
  let cliente = anterior.cliente, clienteKey = anterior.clienteKey;
  const lista = paletes.map(p => {
    if (!p || !chave(p.loteKey) || typeof p.itemKey !== 'string' || !p.itemKey || /[.#$[\]/]/.test(p.itemKey)) falhar('Referência do palete inválida.', 'invalid-argument');
    const ref = p.itemKey + '/' + p.loteKey;
    if (vistos.has(ref)) falhar('Palete duplicado na carga.', 'invalid-argument');
    vistos.add(ref);
    const l = analisar(base, p.itemKey, p.loteKey, hoje);
    const id = (l.lote && l.lote.identificadorPalete) || p.loteKey;
    if (!l.disponivel) falhar(id + ': ' + l.motivo);
    const ja = antes[ref];
    if (!ja) {
      if (Number(p.quantidade) !== Number(l.lote.saldoLote) || p.enderecoKey !== l.lote.enderecoKey || p.skuPedidoKey !== l.skuPedidoKey)
        falhar('O palete ' + id + ' mudou. Atualize a tela antes de salvar a carga.');
      if (!mesmoCliente({cliente, clienteKey}, l)) falhar(mensagemOutroCliente({cliente}, l));
      if (l.frete.tipo && (l.frete.tipo === 'FOB' ? 'COLETA' : 'ENTREGA') !== anterior.tipo) falhar(mensagemFrete(l, anterior.tipo));
    }
    analisadas.push(l);
    pedidos[l.pedidoId] = l.pedidoNumero;
    return {itemKey: p.itemKey, loteKey: p.loteKey, quantidade: Number(l.lote.saldoLote), enderecoKey: l.lote.enderecoKey,
      skuPedidoKey: l.skuPedidoKey, identificadorPalete: l.lote.identificadorPalete, sku: l.lote.itemCodigo,
      descricao: l.lote.itemNome || '', pedidoId: l.pedidoId, pedidoNumero: l.pedidoNumero};
  });
  const d = destinoDaCarga(analisadas);
  if (d.conflito) falhar(d.conflito);
  for (const [k, agenda] of Object.entries(base.agendamentos_expedicao || {})) {
    if (k === dados.agendaKey || !ativa(agenda)) continue;
    const preso = paletesPendentes(agenda).find(p => vistos.has(p.itemKey + '/' + p.loteKey));
    if (preso) falhar('O palete ' + (preso.identificadorPalete || preso.loteKey) + ' já está na carga de ' + (agenda.cliente || 'outro cliente') +
      (agenda.dataAgendada ? ' agendada para ' + String(agenda.dataAgendada).split('-').reverse().join('/') : '') + '. Tire-o daquela carga antes.');
  }
  const resumo = ps => ps.map(p => ({ref: p.itemKey + '/' + p.loteKey, palete: p.identificadorPalete || p.loteKey, sku: p.sku || '', quantidade: Number(p.quantidade) || 0}));
  const revisao = anterior.revisao + 1;
  const historico = {...(anterior.historico || {})};
  historico['r' + revisao] = {em: agora, por: autor, acao: 'EDITAR_PALETES', motivo, antes: resumo(anterior.paletes || []), depois: resumo(lista)};
  if (fat.status === 'SOLICITADO') fat.desatualizada = {em: agora, por: autor, motivo: 'Paletes da carga alterados depois da solicitação: ' + motivo};
  return {...anterior, paletes: lista, pedidos, enderecoEntrega: d.endereco || anterior.enderecoEntrega || '',
    pedidosSemEndereco: d.semEndereco.length ? d.semEndereco : null, revisao, historico,
    faturamento: Object.keys(fat).length ? fat : (anterior.faturamento || null),
    atualizadoEm: agora, atualizadoPor: autor};
}

function prepararAgenda(base, dados, autor, uid, agora) {
  if (!chave(dados.agendaKey)) falhar('Identificador do agendamento inválido.', 'invalid-argument');
  const anterior = (base.agendamentos_expedicao || {})[dados.agendaKey];
  if (anterior && !ativa(anterior)) falhar('Esta agenda já foi encerrada.');
  if (anterior && Number(dados.revisao) !== anterior.revisao) falhar('O agendamento mudou em outra tela. Reabra antes de salvar.', 'aborted');
  if (!anterior && Number(dados.revisao || 0) !== 0) falhar('Agendamento não encontrado.', 'not-found');
  if (dados.editarPaletes) return editarPaletesAgenda(base, dados, autor, agora, anterior);
  if (dados.cancelar) {
    if (!anterior) falhar('Agendamento não encontrado.', 'not-found');
    if (texto(dados.motivo).length < 5) falhar('Informe o motivo do cancelamento.');
    if (anterior.status === 'EXPEDIDO_PARCIAL') falhar('Parte desta carga já saiu. O saldo faturado segue na próxima viagem; não cancele a agenda.');
    if (anterior.faturamento && anterior.faturamento.status === 'FATURADO') falhar('Carga já faturada. Trate a NF com o Financeiro antes de cancelar a agenda.');
    return {...anterior, status: 'CANCELADO', revisao: anterior.revisao + 1, atualizadoEm: agora, atualizadoPor: autor,
      cancelamento: {motivo: texto(dados.motivo), em: agora, por: autor}};
  }
  if (!dataValida(dados.dataAgendada)) falhar('Informe uma data válida para o agendamento.', 'invalid-argument');
  if (!['ENTREGA', 'COLETA'].includes(dados.tipo)) falhar('Informe entrega CIF ou coleta FOB.', 'invalid-argument');
  if (anterior && dados.tipo !== anterior.tipo) falhar('O tipo de transporte deve respeitar o agendamento original. Cancele e reagende para mudar a modalidade.');
  const paletes = anterior ? anterior.paletes : dados.paletes;
  if (!Array.isArray(paletes) || paletes.length < 1 || paletes.length > 100) falhar('Selecione de 1 a 100 paletes para agendar.', 'invalid-argument');
  const hoje = new Date(agora).toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'});
  const vistos = new Set();
  // Alterar o transporte de uma agenda existente não exige nova liberação de CQ.
  // A saída física sempre revalida a disponibilidade e a seleção completa.
  let cliente = anterior && anterior.cliente, clienteKey = anterior && anterior.clienteKey;
  let destino = anterior && anterior.enderecoEntrega;
  let semEndereco = (anterior && anterior.pedidosSemEndereco) || null;
  const pedidos = anterior ? anterior.pedidos : {};
  const analisadas = [];
  const lista = paletes.map(p => {
    if (!chave(p.loteKey) || typeof p.itemKey !== 'string' || /[.#$[\]/]/.test(p.itemKey)) falhar('Referência do palete inválida.', 'invalid-argument');
    const ref = p.itemKey + '/' + p.loteKey;
    if (vistos.has(ref)) falhar('Palete duplicado na agenda.', 'invalid-argument');
    vistos.add(ref);
    if (anterior) return p;
    const l = analisar(base, p.itemKey, p.loteKey, hoje);
    if (!l.disponivel) falhar((l.lote.identificadorPalete || p.loteKey) + ': ' + l.motivo);
    if (Number(p.quantidade) !== Number(l.lote.saldoLote) || p.enderecoKey !== l.lote.enderecoKey || p.skuPedidoKey !== l.skuPedidoKey) falhar('O palete mudou. Atualize a seleção antes de agendar.');
    if (cliente && !mesmoCliente({cliente, clienteKey}, l)) falhar(mensagemOutroCliente(analisadas[0] || {cliente}, l));
    if (l.frete.tipo && (l.frete.tipo === 'FOB' ? 'COLETA' : 'ENTREGA') !== dados.tipo) falhar(mensagemFrete(l, dados.tipo));
    cliente = l.cliente; clienteKey = l.clienteKey;
    analisadas.push(l);
    pedidos[l.pedidoId] = l.pedidoNumero;
    return {itemKey: p.itemKey, loteKey: p.loteKey, quantidade: Number(p.quantidade), enderecoKey: p.enderecoKey,
      skuPedidoKey: p.skuPedidoKey, identificadorPalete: l.lote.identificadorPalete, sku: l.lote.itemCodigo,
      descricao: l.lote.itemNome || '', pedidoId: l.pedidoId, pedidoNumero: l.pedidoNumero};
  });
  if (!anterior) {
    const d = destinoDaCarga(analisadas);
    if (d.conflito) falhar(d.conflito);
    destino = d.endereco;
    semEndereco = d.semEndereco.length ? d.semEndereco : null;
  }
  for (const [k, agenda] of Object.entries(base.agendamentos_expedicao || {})) {
    if (k === dados.agendaKey || !ativa(agenda)) continue;
    const preso = paletesPendentes(agenda).find(p => vistos.has(p.itemKey + '/' + p.loteKey));
    if (preso) {
      const quando = String(agenda.dataAgendada || '').split('-').reverse().join('/');
      falhar('O palete ' + (preso.identificadorPalete || preso.loteKey) + ' já está na carga de ' + (agenda.cliente || 'outro cliente') +
        (quando ? ' agendada para ' + quando : '') + (agenda.faturamento && agenda.faturamento.status === 'FATURADO' ? ' (já faturada)' : '') +
        '. O que fazer: tire esse palete da seleção, ou abra essa carga no Acompanhamento e confirme a saída' +
        ' (se ela já saiu) ou cancele-a (se não vai sair).');
    }
  }
  const transporte = {transportadora: texto(dados.transportadora), motorista: texto(dados.motorista), contatoMotorista: texto(dados.contatoMotorista, 60), placa: texto(dados.placa, 20).toUpperCase()};
  const contatoCliente = snapshotContato(dados.contatoCliente === undefined ? anterior && anterior.contatoCliente : dados.contatoCliente);
  const revisao = anterior ? anterior.revisao + 1 : 1;
  const historico = {...(anterior && anterior.historico || {})};
  historico['r' + revisao] = {em: agora, por: autor, dataAgendada: dados.dataAgendada, janela: texto(dados.janela, 80), ...transporte, contatoCliente};
  // Editar o transporte não pode apagar o que a agenda acumulou: faturamento,
  // NFs, viagens e o embarcado de cada palete (que vêm de outras operações).
  const acumulado = {};
  if (anterior) ['faturamento', 'viagens', 'expedicoes', 'expedicaoId'].forEach(k => { if (anterior[k] !== undefined) acumulado[k] = anterior[k]; });
  return {...acumulado, agendaKey: dados.agendaKey, status: anterior ? anterior.status : 'AGENDADO', revisao, cliente, clienteKey: clienteKey || '',
    enderecoEntrega: destino || '', pedidosSemEndereco: semEndereco, pedidos, paletes: lista, tipo: dados.tipo, dataAgendada: dados.dataAgendada,
    janela: texto(dados.janela, 80), ...transporte, contatoCliente, observacoes: texto(dados.observacoes, 2000), historico,
    criadoEm: anterior ? anterior.criadoEm : agora, criadoPor: anterior ? anterior.criadoPor : autor,
    criadoPorUid: anterior ? anterior.criadoPorUid : uid, atualizadoEm: agora, atualizadoPor: autor};
}
function agendaDaSaida(base, dados) {
  if (!Array.isArray(dados.paletes)) falhar('Selecione os paletes da saída.', 'invalid-argument');
  const agendas = base.agendamentos_expedicao || {};
  const selecionados = new Set((dados.paletes || []).map(p => p.itemKey + '/' + p.loteKey));
  for (const [k, ag] of Object.entries(agendas)) {
    if (ativa(ag) && k !== dados.agendaKey && paletesPendentes(ag).some(p => selecionados.has(p.itemKey + '/' + p.loteKey))) falhar('Palete vinculado a uma carga agendada. Abra o agendamento para confirmar a saída.');
  }
  if (!dados.agendaKey) return null;
  const agenda = agendas[dados.agendaKey];
  if (!ativa(agenda)) falhar('Agendamento indisponível ou já encerrado.');
  if (agenda.revisao !== Number(dados.agendaRevisao)) falhar('Os dados de transporte mudaram em outra tela. Reabra o agendamento.', 'aborted');
  // Todos os paletes com saldo a embarcar entram na conferência, mesmo os que
  // não subirem (carregar 0): assim nada some da agenda sem registro.
  if (referencias(paletesPendentes(agenda)) !== referencias(dados.paletes)) falhar('Confira todos os paletes pendentes da agenda (marque "não carregado" no que ficar). Para mudar a composição, cancele a agenda e monte outra.');
  return agenda;
}
module.exports = {prepararAgenda, agendaDaSaida, snapshotContato, ATIVAS, ativa, pendente, paletesPendentes};
