'use strict';
/* PLAN-01 (reunião 28/10): "antecipou puxa, atrasou empurra" -- motor puro
   public/shared/reprogramacao-linha.js. Horário local = Brasília (−03:00). */
const assert = require('node:assert/strict');
const R = require('./public/shared/reprogramacao-linha.js');

let n = 0;
const eq = (a, b, m) => { n++; assert.equal(a, b, m); };
const deq = (a, b, m) => { n++; assert.deepEqual(a, b, m); };
const ok = (c, m) => { n++; assert.ok(c, m); };

// Hora local "2026-10-27 07:00" -> ISO; e de volta.
const L = (s) => new Date(s.replace(' ', 'T') + ':00-03:00').toISOString();
const H = (isoStr) => { const d = new Date(new Date(isoStr).getTime() - 3 * 3600e3); return d.toISOString().slice(0, 16).replace('T', ' '); };

// Turno 07–17 (sexta até 16), pausa 12–13; seg–sex; Finados (seg 02/11) é feriado.
const CFG = {
  turnos: ['1º'], turnoHorarios: {'1º': '07:00'}, turnoHorariosFim: {'1º': '17:00'}, turnoHorariosFimSexta: {'1º': '16:00'},
  turnoPausas: {'1º': {inicio: '12:00', fim: '13:00'}}, diasSemana: [1, 2, 3, 4, 5], feriados: {'2026-11-02': true},
  setupPadraoPorLinha: {'Linha 1': 30}, congelamento: {diasFixos: 0}
};
const cal = R.criarCalendario(CFG);

// ── Calendário ────────────────────────────────────────────────────────────
deq(cal.janelas('2026-10-27'), [[420, 720], [780, 1020]], 'terça: 07–12 e 13–17 (pausa fora)');
deq(cal.janelas('2026-10-30'), [[420, 720], [780, 960]], 'sexta termina às 16h');
deq(cal.janelas('2026-10-31'), [], 'sábado sem turno');
deq(cal.janelas('2026-11-02'), [], 'feriado sem turno');
eq(H(cal.somarUteis(new Date(L('2026-10-27 11:30')).getTime(), 60)), '2026-10-27 13:30', '60 min a partir de 11:30 pulam a pausa');
eq(H(cal.somarUteis(new Date(L('2026-10-30 15:30')).getTime(), 90)), '2026-11-03 08:00', 'sexta 15:30 + 90 min: 30 até as 16h, fim de semana e feriado pulados, termina terça 08:00');
eq(cal.minutosUteis(new Date(L('2026-10-27 11:00')).getTime(), new Date(L('2026-10-27 14:00')).getTime()), 120, '11–14 tem 120 min úteis');
const cal2 = R.criarCalendario(Object.assign({}, CFG, {turnosExtras: {s: {dataInicio: '2026-10-31', dataFim: '2026-10-31', horarioInicio: '08:00', horarioFim: '12:00'}}}));
deq(cal2.janelas('2026-10-31'), [[480, 720]], 'turno extra de sábado entra no calendário');

const op = (x) => Object.assign({linha: 'Linha 1', produto: 'BODY SPLASH'}, x);
const mov = (r) => r.movimentos.map((m) => [m.id, m.tipo, H(m.para.inicio), H(m.para.fim)]);

// ── 1. Antecipou: as encadeadas puxam ─────────────────────────────────────
let ops = {
  A: op({lote: 'A', status: 'Aguardando Confirmação', abertaDesde: null, dataInicioReal: L('2026-10-27 07:00'), dataInicioPlanejada: L('2026-10-27 07:00'),
    dataFimPlanejada: L('2026-10-27 11:00'), confirmacaoEtapas: {envase: {status: 'AGUARDANDO', fechadoEm: L('2026-10-27 09:00')}}}),
  B: op({lote: 'B', status: 'Não Iniciado', dataInicioPlanejada: L('2026-10-27 11:00'), dataFimPlanejada: L('2026-10-27 14:00')}),
  C: op({lote: 'C', status: 'Não Iniciado', dataInicioPlanejada: L('2026-10-27 14:00'), dataFimPlanejada: L('2026-10-27 16:00')}),
  // Programada para quinta, longe da C: não está encadeada, fica onde está.
  D: op({lote: 'D', status: 'Não Iniciado', dataInicioPlanejada: L('2026-10-29 07:00'), dataFimPlanejada: L('2026-10-29 09:00')})
};
let r = R.simular(ops, CFG, {agora: L('2026-10-27 09:10')});
deq(mov(r), [['B', 'PUXA', '2026-10-27 09:30', '2026-10-27 11:30'], ['C', 'PUXA', '2026-10-27 13:00', '2026-10-27 15:00']],
  'A terminou às 09:00 (previsto 11:00): B puxa para 09:30 (setup de 30 min) mantendo 120 min úteis; C puxa e respeita a pausa');
deq(r.gatilhos.map((g) => [g.lote, g.tipo, g.minutos]), [['A', 'ANTECIPOU', 120]], 'gatilho: A antecipou 120 min');
ok(!r.movimentos.some((m) => m.id === 'D'), 'D (quinta, não encadeada) não é puxada');
ok(r.movimentos.every((m) => new Date(m.para.inicio).getUTCMinutes() % 15 === 0), 'todo início movido cai em múltiplo de 15 min');

// Nunca no passado: agora 10:40 -> B começa 10:45, não 09:30.
r = R.simular(ops, CFG, {agora: L('2026-10-27 10:40')});
eq(H(r.movimentos[0].para.inicio), '2026-10-27 10:45', 'puxar nunca programa antes de agora (arredondado a 15 min)');

// ── 2. Atrasou: as programadas empurram, com virada de dia ────────────────
ops = {
  A: op({lote: 'A', status: 'Em Produção', abertaDesde: L('2026-10-27 07:00'), dataInicioReal: L('2026-10-27 07:02'), dataInicioPlanejada: L('2026-10-27 07:00'), dataFimPlanejada: L('2026-10-27 11:00')}),
  B: op({lote: 'B', status: 'Não Iniciado', dataInicioPlanejada: L('2026-10-27 11:00'), dataFimPlanejada: L('2026-10-27 14:00')}),
  C: op({lote: 'C', status: 'Não Iniciado', dataInicioPlanejada: L('2026-10-27 14:00'), dataFimPlanejada: L('2026-10-27 16:00')})
};
r = R.simular(ops, CFG, {agora: L('2026-10-27 11:40')});
deq(mov(r), [['B', 'EMPURRA', '2026-10-27 13:15', '2026-10-27 15:15'], ['C', 'EMPURRA', '2026-10-27 15:45', '2026-10-28 07:45']],
  'A atrasada (rodando às 11:40): B empurra para depois do setup e da pausa; C passa do expediente e termina no dia seguinte');
deq(r.gatilhos.map((g) => [g.lote, g.tipo, g.minutos]), [['A', 'ATRASOU', 40]], 'gatilho: A atrasou 40 min');
ok(!r.movimentos.some((m) => m.id === 'A'), 'a OP rodando não muda de plano (fica o previsto para o indicador de atraso)');

// Rodando no horário: plano encostado sem setup NÃO é empurrado à toa.
r = R.simular(ops, CFG, {agora: L('2026-10-27 10:00')});
deq(r.movimentos, [], 'nada aconteceu: nenhum bloco se move (o setup só entra quando a OP de fato se move)');

// ── 3. Bloco travado no meio ──────────────────────────────────────────────
const bl = (id, estado, ini, fim, extra) => Object.assign({id, lote: id, linha: 'Linha 1', estado, inicio: new Date(L(ini)).getTime(), fim: new Date(L(fim)).getTime(), setupMin: 30, movel: estado === 'PROGRAMADA'}, extra || {});
r = R.reprogramar({calendario: cal, agora: L('2026-10-27 11:40'), blocos: [
  bl('A', 'RODANDO', '2026-10-27 07:00', '2026-10-27 11:40', {fimPlanejado: new Date(L('2026-10-27 11:00')).getTime(), atrasada: true, movel: false}),
  bl('B', 'PROGRAMADA', '2026-10-27 11:00', '2026-10-27 13:00'),            // 60 min úteis (pausa no meio)
  bl('F', 'PROGRAMADA', '2026-10-27 13:00', '2026-10-27 14:00', {movel: false, motivoFixo: 'travada pelo PCP'}),
  bl('C', 'PROGRAMADA', '2026-10-27 14:00', '2026-10-27 15:00')
]});
deq(mov(r), [['B', 'EMPURRA', '2026-10-27 14:30', '2026-10-27 15:30'], ['C', 'EMPURRA', '2026-10-27 16:00', '2026-10-27 17:00']],
  'B não cabe antes da travada F: pula por cima dela (14:30); C vem depois de B');
ok(!r.movimentos.some((m) => m.id === 'F'), 'a travada no meio não se move');

// Zona fixa invadida pela atrasada: não move, devolve conflito.
r = R.reprogramar({calendario: cal, agora: L('2026-10-27 11:40'), blocos: [
  bl('A', 'RODANDO', '2026-10-27 07:00', '2026-10-27 11:40', {fimPlanejado: new Date(L('2026-10-27 11:00')).getTime(), atrasada: true, movel: false}),
  bl('Z', 'PROGRAMADA', '2026-10-27 11:00', '2026-10-27 14:00', {movel: false, motivoFixo: 'zona fixa'})
]});
deq(r.movimentos, [], 'OP da zona fixa não é empurrada');
deq(r.conflitos.map((c) => [c.lote, c.com, c.sobreposicaoMin]), [['Z', 'A', 40]], 'conflito: Z invadida 40 min pela A, para o PCP decidir');

// Via config: zona fixa de 7 dias trava tudo desta semana.
r = R.simular(ops, Object.assign({}, CFG, {congelamento: {diasFixos: 7}}), {agora: L('2026-10-27 11:40')});
ok(!r.movimentos.length && r.zonaFixa.length === 2 && r.conflitos.length === 1, 'zona fixa (7 dias): nada se move; B invadida vira conflito');

// ── 4. Feriado e sexta ────────────────────────────────────────────────────
ops = {
  A: op({lote: 'A', status: 'Em Produção', abertaDesde: L('2026-10-30 07:00'), dataInicioPlanejada: L('2026-10-30 07:00'), dataFimPlanejada: L('2026-10-30 14:00')}),
  B: op({lote: 'B', status: 'Não Iniciado', dataInicioPlanejada: L('2026-10-30 14:00'), dataFimPlanejada: L('2026-10-30 16:00')})
};
r = R.simular(ops, CFG, {agora: L('2026-10-30 15:00')});
deq(mov(r), [['B', 'EMPURRA', '2026-10-30 15:30', '2026-11-03 08:30']], 'sexta acaba às 16h, segunda é Finados: B termina terça 08:30');

// ── 5. Programação vencida, OP de outra linha, cancelada ──────────────────
ops = {
  V: op({lote: 'V', status: 'Não Iniciado', dataInicioPlanejada: L('2026-10-26 07:00'), dataFimPlanejada: L('2026-10-26 09:00')}),
  X: op({lote: 'X', status: 'Cancelado', abertaDesde: L('2026-10-27 07:00'), dataFimPlanejada: L('2026-10-27 08:00')}),
  A: op({lote: 'A', linha: 'Linha 2', status: 'Em Produção', abertaDesde: L('2026-10-27 07:00'), dataFimPlanejada: L('2026-10-27 08:00')}),
  B: op({lote: 'B', status: 'Não Iniciado', dataInicioPlanejada: L('2026-10-27 10:00'), dataFimPlanejada: L('2026-10-27 11:00')})
};
r = R.simular(ops, CFG, {agora: L('2026-10-27 09:30')});
deq(r.vencidas.map((v) => v.lote), ['V'], 'programada que nem abriu e já passou do fim: fica fora, para o PCP');
ok(!r.movimentos.length, 'atraso na Linha 2 não mexe na Linha 1; cancelada não conta; B sem nada antes não se move');

// ── 6. Update em caminhos planos ──────────────────────────────────────────
ops = {
  A: op({lote: '26302/01', status: 'Concluído', dataInicioReal: L('2026-10-27 07:00'), dataFimReal: L('2026-10-27 09:00'), dataInicioPlanejada: L('2026-10-27 07:00'), dataFimPlanejada: L('2026-10-27 11:00')}),
  B: op({lote: '26302/02', status: 'Não Iniciado', dataInicioPlanejada: L('2026-10-27 11:00'), dataFimPlanejada: L('2026-10-27 12:00')})
};
r = R.simular(ops, CFG, {agora: L('2026-10-27 09:05')});
const u = R.montarUpdates(r, {hoje: '2026-10-27', chave: 'k1', agoraISO: L('2026-10-27 09:05'), por: 'PCP'});
deq(Object.keys(u).sort(), ['ajustes_planejamento/2026-10-27/reprog_k1_0', 'ops/B/dataFimPlanejada', 'ops/B/dataInicioPlanejada'], 'só caminhos planos: as duas datas da OP movida + o registro do dia');
eq(H(u['ops/B/dataInicioPlanejada']), '2026-10-27 09:30', 'Concluído com dataFimReal também é gatilho');
ok(/26302\/01 terminou 120 min antes/.test(u['ajustes_planejamento/2026-10-27/reprog_k1_0'].motivo), 'o registro diz o porquê: ' + u['ajustes_planejamento/2026-10-27/reprog_k1_0'].motivo);
ok(!Object.keys(u).some((k) => /alocacoes_planejamento|programacao\//.test(k)), 'não toca alocacoes_planejamento nem a grade de quantidades');

console.log(`OK reprogramação da linha: ${n} asserções — calendário (pausa, sexta, sábado extra, feriado), antecipa puxa só as encadeadas, atrasa empurra com virada de dia, bloco travado no meio, zona fixa vira conflito, nunca no passado, vencida fora, 15 min, caminhos planos.`);
