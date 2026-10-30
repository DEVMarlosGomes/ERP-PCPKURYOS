'use strict';
/* Ensaio do PLAN-01 contra a BASE REAL, SOMENTE LEITURA (lição do MRP: rodar o
   motor contra o dado de verdade antes de ligar).

   Não acessa o Firebase: lê exportações JSON feitas pelo tech lead, por exemplo
     firebase database:get /ops    --project erpkuryos > ops.json
     firebase database:get /config --project erpkuryos > config.json
   (config.json já traz config/planejamento: dias da semana e feriados.)

   Uso:
     node scripts/ensaio-reprogramacao-linha.js ops.json config.json [--agora 2026-10-29T14:00:00-03:00] [--json saida.json]

   Imprime, por linha, o que o motor (public/shared/reprogramacao-linha.js)
   moveria AGORA: gatilhos (antecipou/atrasou), OPs puxadas/empurradas (de -> para),
   conflitos com a zona fixa e programações vencidas. Roda duas vezes: com a zona
   fixa da config (como a tela) e sem ela (para medir quanto a zona segura).
   Também lista as OPs que o motor ignora e por quê, e falha (exit 1) se achar
   resultado inválido: início no passado, fim antes do início, sobreposição na
   linha ou início fora do múltiplo de 15 min. */
const fs = require('node:fs');
const path = require('node:path');
const R = require(path.join(__dirname, '..', 'public', 'shared', 'reprogramacao-linha.js'));

const args = process.argv.slice(2);
const arq = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
function opcao(nome) { const i = args.indexOf('--' + nome); return i >= 0 ? args[i + 1] : null; }
if (arq.length < 2) {
  console.error('Uso: node scripts/ensaio-reprogramacao-linha.js ops.json config.json [--agora ISO] [--json saida.json]');
  process.exit(2);
}
const ops = JSON.parse(fs.readFileSync(arq[0], 'utf8')) || {};
const cfg = JSON.parse(fs.readFileSync(arq[1], 'utf8')) || {};
const agora = opcao('agora') || new Date().toISOString();
const fmt = (iso) => { if (!iso) return '—'; const d = new Date(new Date(iso).getTime() - 3 * 3600e3); return d.toISOString().slice(0, 16).replace('T', ' '); };

// O que fica de fora do motor, e por quê -- para não confundir "não moveu" com "não viu".
const fora = {semLinha: 0, linhaForaDaConfig: 0, semData: 0, cancelada: 0};
const linhas = Array.isArray(cfg.linhas) ? cfg.linhas : null;
Object.values(ops).forEach((op) => {
  if (!op) return;
  if (op.status === 'Cancelado') { fora.cancelada++; return; }
  const linha = op.abertaLinha || op.linha;
  if (!linha) { fora.semLinha++; return; }
  if (linhas && linhas.indexOf(linha) < 0) { fora.linhaForaDaConfig++; return; }
  if (!op.dataInicioPlanejada && !op.abertaDesde && !op.dataInicioReal) fora.semData++;
});

const erros = [];
function conferir(r, nome) {
  const agoraMs = new Date(agora).getTime();
  const porLinha = {};
  r.movimentos.forEach((m) => {
    const ini = new Date(m.para.inicio).getTime(), fim = new Date(m.para.fim).getTime();
    if (ini < agoraMs - 60000) erros.push(nome + ': ' + m.lote + ' movida para o passado (' + fmt(m.para.inicio) + ')');
    if (!(fim > ini)) erros.push(nome + ': ' + m.lote + ' com fim antes do início');
    if (new Date(m.para.inicio).getUTCMinutes() % 15) erros.push(nome + ': ' + m.lote + ' fora do múltiplo de 15 min');
    (porLinha[m.linha] = porLinha[m.linha] || []).push([ini, fim, m.lote]);
  });
  Object.keys(porLinha).forEach((l) => {
    const xs = porLinha[l].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < xs.length; i++) if (xs[i][0] < xs[i - 1][1]) erros.push(nome + ': ' + xs[i][2] + ' sobrepõe ' + xs[i - 1][2] + ' na ' + l);
  });
}

function relatorio(nome, r) {
  console.log('\n══ ' + nome + ' ══' + (r.congeladoAte ? '  (zona fixa até ' + fmt(r.congeladoAte) + ')' : '  (sem zona fixa)'));
  const linhasR = Array.from(new Set([].concat(r.gatilhos, r.movimentos, r.conflitos, r.vencidas).map((x) => x.linha))).sort();
  if (!linhasR.length) console.log('  nada a fazer: nenhum gatilho, nenhuma OP a mover.');
  linhasR.forEach((l) => {
    console.log('  ' + l);
    r.gatilhos.filter((g) => g.linha === l).forEach((g) => console.log('    gatilho: OP ' + g.lote + (g.tipo === 'ANTECIPOU' ? ' terminou ' + g.minutos + ' min antes' : ' atrasou ' + g.minutos + ' min')));
    r.movimentos.filter((m) => m.linha === l).forEach((m) => console.log('    ' + (m.tipo === 'PUXA' ? 'puxa   ' : 'empurra') + ' OP ' + m.lote + ' ' + (m.produto || '') + ': ' + fmt(m.de.inicio) + '–' + fmt(m.de.fim) + '  ->  ' + fmt(m.para.inicio) + '–' + fmt(m.para.fim) + ' (' + (m.deltaMin > 0 ? '+' : '') + m.deltaMin + ' min)'));
    r.conflitos.filter((c) => c.linha === l).forEach((c) => console.log('    CONFLITO OP ' + c.lote + ': ' + c.motivo + ' (' + c.sobreposicaoMin + ' min)'));
    const v = r.vencidas.filter((x) => x.linha === l);
    if (v.length) console.log('    vencidas (programadas, não abertas, fim já passou): ' + v.map((x) => x.lote + ' ' + fmt(x.inicio)).join(', '));
  });
  console.log('  total: ' + r.movimentos.length + ' OP(s) moveriam (' + r.movimentos.filter((m) => m.tipo === 'PUXA').length + ' puxadas, ' +
    r.movimentos.filter((m) => m.tipo === 'EMPURRA').length + ' empurradas), ' + r.conflitos.length + ' conflito(s), ' + r.vencidas.length + ' vencida(s), ' + (r.zonaFixa || []).length + ' presa(s) na zona fixa.');
  conferir(r, nome);
}

console.log('Ensaio PLAN-01 — agora = ' + fmt(agora) + ' (Brasília) · ' + Object.keys(ops).length + ' OPs lidas');
console.log('Fora do motor: ' + fora.cancelada + ' canceladas, ' + fora.semLinha + ' sem linha, ' + fora.linhaForaDaConfig + ' com linha fora de config/linhas, ' + fora.semData + ' sem nenhuma data (fila "OPs aguardando programação").');
const comZona = R.simular(ops, cfg, {agora, linhas});
const semZona = R.simular(ops, cfg, {agora, linhas, ignorarZonaFixa: true});
relatorio('Como a tela faria (zona fixa da config: ' + ((cfg.congelamento && cfg.congelamento.diasFixos) != null ? cfg.congelamento.diasFixos : 7) + ' dias)', comZona);
relatorio('Sem zona fixa (para medir o que ela segura)', semZona);
const saida = opcao('json');
if (saida) { fs.writeFileSync(saida, JSON.stringify({agora, comZona, semZona, fora}, null, 2)); console.log('\nResultado completo em ' + saida); }
if (erros.length) { console.error('\nRESULTADO INVÁLIDO:\n  ' + erros.join('\n  ')); process.exit(1); }
console.log('\nOK: nenhum início no passado, nenhum fim antes do início, nenhuma sobreposição, todos os inícios em múltiplos de 15 min. Nada foi gravado.');
