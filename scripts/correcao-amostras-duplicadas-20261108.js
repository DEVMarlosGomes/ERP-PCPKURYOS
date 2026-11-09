'use strict';
/* Correção das solicitações P&D duplicadas em 08/11/2026 17:10 pelo botão "Sincronizar amostras com o P&D"
   (versão antiga de /crm/samples/sync-missing-pd-cards; corrigida em crm-frontend/src/lib/vinculoAmostrasPd.js).

   NÃO grava no banco. Lê os nós baixados (firebase database:get) de <dir> e escreve:
     <dir>/correcao-update.json   -> caminhos PLANOS para `firebase database:update / ... --project erpkuryos`
     <dir>/correcao-relatorio.json e um resumo no console.

   Para cada solicitação OPEN criada pela sincronização (Gustavo Callegaro, 08/11 17:10-17:12, sem nenhum trabalho:
   sem fórmula, histórico de status, lote, resultado, estudo ou aprovação):
     A) a variação já tinha solicitação de verdade (crm_variacao_id): apaga a cópia (solicitação, desenvolvimento
        e card), religa a variação na original e põe o status comercial de volta ao da original;
     B) a variação só tinha card legado do Mongo (sem solicitação): mantém a solicitação nova no status do card
        legado, liga o card legado nela e apaga o card duplicado.
   Tudo deixa rastro: linha no historico_status da variação e em pd_request_status_history (caso B).

     node scripts/correcao-amostras-duplicadas-20261108.js scratch/amostras-20261109 */
const fs = require('fs');
const path = require('path');
const dir = path.resolve(process.argv[2] || '.');
const T = 'erp/kuryos';
const L = (n) => {
  const f = path.join(dir, n + '.json');
  if (!fs.existsSync(f)) throw new Error('Falta ' + f);
  return JSON.parse(fs.readFileSync(f, 'utf8')) || {};
};
const lista = (o) => Object.entries(o).map(([k, v]) => ({ ...v, id: v.id || k, _key: k }));

const STATUS_CARD = { OPEN: 'solicitado', IN_PROGRESS: 'em_desenvolvimento', IN_TESTS: 'em_testes', WAITING_APPROVAL: 'aguardando_aprovacao', APPROVED: 'aprovado', REJECTED: 'retrabalho_interno', COMPLETED: 'concluido' };
const CARD_STATUS = Object.fromEntries(Object.entries(STATUS_CARD).map(([k, v]) => [v, k]));
const LABEL = { OPEN: 'Aberto', IN_PROGRESS: 'Em Desenvolvimento', IN_TESTS: 'Em Testes', WAITING_APPROVAL: 'Aguardando Aprovação', APPROVED: 'Aprovado', REJECTED: 'Retrabalho', COMPLETED: 'Plano Futuro' };
// Mesma tabela de pdCards.js (statusComercialPeloPd): aprovação nunca vem do P&D, só do retorno do cliente.
const COMERCIAL = { OPEN: 'solicitada', IN_PROGRESS: 'em_elaboracao', IN_TESTS: 'em_elaboracao', WAITING_APPROVAL: 'enviada', REJECTED: 'retrabalho' };
const DECIDIDO = new Set(['aprovada', 'reprovada', 'cancelada', 'plano_futuro']);
function comercial(base, statusPd) {
  if (DECIDIDO.has(base)) return base;
  const novo = COMERCIAL[statusPd];
  if (!novo) return base;
  if (novo === 'enviada' && String(base || '').startsWith('aguardando_informa')) return base;
  return novo;
}

const R = lista(L('pd_requests')), C = lista(L('pd_cards')), D = lista(L('pd_developments'));
const amostras = lista(L('crm_samples'));
const CORTE_INI = '2026-11-08T17:10', CORTE_FIM = '2026-11-08T17:13';
const ehCopia = (r) => r.status === 'OPEN' && r.created_by_name === 'Gustavo Callegaro'
  && String(r.created_at) >= CORTE_INI && String(r.created_at) < CORTE_FIM;
const copias = R.filter(ehCopia);
const idsCopia = new Set(copias.map((r) => r.id));

// Trabalho feito numa cópia depois de 08/11 = não mexe nela (relata).
const nosTrabalho = ['pd_formulas', 'pd_request_status_history', 'pd_manipulacao_lotes', 'pd_samples', 'pd_lab_results',
  'pd_stability_studies', 'pd_approvals', 'pd_sample_batches', 'pd_liberacoes_status', 'pd_updates', 'pd_document_versions', 'pd_ficha_tecnica'];
const textoTrabalho = nosTrabalho.filter((n) => fs.existsSync(path.join(dir, n + '.json')))
  .map((n) => [n, fs.readFileSync(path.join(dir, n + '.json'), 'utf8')]);

const agora = new Date().toISOString();
const update = {};
const relatorio = { geradoEm: agora, copias: copias.length, A: [], B: [], ignoradas: [] };
const histStatusIdx = new Map(); // amostra:variação -> próximo índice do historico_status

for (const n of copias) {
  const devs = D.filter((d) => d.request_id === n.id || d.pd_request_id === n.id);
  const devIds = new Set(devs.map((d) => d.id));
  const trabalho = textoTrabalho.filter(([, t]) => t.includes(n.id) || [...devIds].some((d) => t.includes(d))).map(([k]) => k);
  const cardNovo = C.filter((c) => c.pd_request_id === n.id);
  const amostra = amostras.find((s) => s.id === n.crm_sample_id || s._key === n.crm_sample_id);
  const idx = amostra ? (amostra.variacoes || []).findIndex((v) => v && v.id === n.crm_variacao_id) : -1;
  if (trabalho.length || !amostra || idx < 0 || cardNovo.length !== 1 || devs.length !== 1) {
    relatorio.ignoradas.push({ id: n.id, motivo: trabalho.length ? 'tem trabalho em ' + trabalho.join(',') : 'vínculo inesperado', cards: cardNovo.length, devs: devs.length });
    continue;
  }
  const v = amostra.variacoes[idx];
  const vBase = `${T}/crm_samples/${amostra._key}/variacoes/${idx}`;
  const statusAntes = ((v.historico_status || []).filter((h) => String(h.data) < CORTE_INI).slice(-1)[0] || {}).para || v.status;
  const chaveHist = amostra._key + ':' + idx;
  const proxHist = () => { const i = histStatusIdx.has(chaveHist) ? histStatusIdx.get(chaveHist) : (v.historico_status || []).length; histStatusIdx.set(chaveHist, i + 1); return i; };

  const originais = R.filter((r) => !idsCopia.has(r.id) && r.status !== 'CANCELLED' && (r.crm_variacao_id || r.linked_variacao_id) === v.id);
  if (originais.length === 1) {
    const o = originais[0];
    const cardO = C.find((c) => c.pd_request_id === o.id);
    const final = comercial(statusAntes, o.status);
    update[`${T}/pd_requests/${n._key}`] = null;
    update[`${T}/pd_developments/${devs[0]._key}`] = null;
    update[`${T}/pd_cards/${cardNovo[0]._key}`] = null;
    update[`${vBase}/pd_request_id`] = o.id;
    if (cardO) update[`${vBase}/pd_card_id`] = cardO.id;
    update[`${vBase}/status`] = final;
    update[`${vBase}/status_pd_raw`] = STATUS_CARD[o.status] || 'solicitado';
    update[`${vBase}/status_pd_label`] = LABEL[o.status] || o.status;
    update[`${vBase}/updated_at`] = agora;
    update[`${vBase}/historico_status/${proxHist()}`] = {
      data: agora, de: v.status || '', para: final, status_pd: STATUS_CARD[o.status] || '', label_pd: LABEL[o.status] || o.status,
      sincronizado_pd: true, usuario: 'Correção P&D (09/11)', usuario_id: 'sistema',
      observacao: `Solicitação duplicada em 08/11 pela sincronização removida (${n.id}); a variação volta a seguir a original ${o.id} (${LABEL[o.status] || o.status}).`,
    };
    relatorio.A.push({ codigo: v.codigo, cliente: n.client_name, produto: n.title, copia: n.id, original: o.id, statusPd: o.status, variacao: `${v.status} -> ${final}`, semCardOriginal: !cardO });
    continue;
  }
  if (originais.length > 1) { relatorio.ignoradas.push({ id: n.id, motivo: originais.length + ' originais para a mesma variação' }); continue; }

  const legados = C.filter((c) => !idsCopia.has(c.pd_request_id) && (c.amostra_variacao_id || c.crm_variacao_id) === v.id
    && (!c.pd_request_id || !R.some((r) => r.id === c.pd_request_id)));
  if (legados.length !== 1) { relatorio.ignoradas.push({ id: n.id, motivo: legados.length + ' cards legados' }); continue; }
  const cl = legados[0];
  const st = CARD_STATUS[cl.status_pd] || 'OPEN';
  const final = comercial(statusAntes, st);
  update[`${T}/pd_requests/${n._key}/status`] = st;
  update[`${T}/pd_requests/${n._key}/updated_at`] = agora;
  update[`${T}/pd_developments/${devs[0]._key}/status`] = st;
  update[`${T}/pd_cards/${cardNovo[0]._key}`] = null;
  update[`${T}/pd_cards/${cl._key}/pd_request_id`] = n.id;
  update[`${T}/pd_cards/${cl._key}/development_id`] = devs[0].id;
  update[`${T}/pd_cards/${cl._key}/status`] = st;
  update[`${T}/pd_cards/${cl._key}/updated_at`] = agora;
  const hid = 'corr20261109-' + n.id.slice(0, 8);
  update[`${T}/pd_request_status_history/${hid}`] = {
    id: hid, request_id: n.id, pd_request_id: n.id, from_status: 'OPEN', to_status: st, created_at: agora, updated_at: agora,
    changed_by: 'sistema', changed_by_name: 'Correção P&D (09/11)', user_id: 'sistema',
    comment: `Status do card do sistema antigo (${cl.status_pd}); a sincronização de 08/11 tinha criado esta solicitação como Aberta.`,
  };
  update[`${vBase}/pd_card_id`] = cl.id;
  update[`${vBase}/status`] = final;
  update[`${vBase}/status_pd_raw`] = STATUS_CARD[st];
  update[`${vBase}/status_pd_label`] = LABEL[st];
  update[`${vBase}/updated_at`] = agora;
  update[`${vBase}/historico_status/${proxHist()}`] = {
    data: agora, de: v.status || '', para: final, status_pd: STATUS_CARD[st], label_pd: LABEL[st], sincronizado_pd: true,
    usuario: 'Correção P&D (09/11)', usuario_id: 'sistema',
    observacao: `Volta ao status do card do sistema antigo (${LABEL[st]}); card duplicado de 08/11 removido.`,
  };
  relatorio.B.push({ codigo: v.codigo, cliente: n.client_name, produto: n.title, solicitacao: n.id, cardLegado: cl.id, statusPd: st, variacao: `${v.status} -> ${final}` });
}

fs.writeFileSync(path.join(dir, 'correcao-update.json'), JSON.stringify(update, null, 1));
fs.writeFileSync(path.join(dir, 'correcao-relatorio.json'), JSON.stringify(relatorio, null, 1));
const conta = (arr, f) => arr.reduce((a, x) => ((a[f(x)] = (a[f(x)] || 0) + 1), a), {});
console.log(JSON.stringify({
  copias: relatorio.copias, A_religadas: relatorio.A.length, B_card_legado: relatorio.B.length, ignoradas: relatorio.ignoradas,
  A_por_status: conta(relatorio.A, (x) => x.statusPd + ' | ' + x.variacao), B_por_status: conta(relatorio.B, (x) => x.statusPd + ' | ' + x.variacao),
  caminhos: Object.keys(update).length,
}, null, 1));
