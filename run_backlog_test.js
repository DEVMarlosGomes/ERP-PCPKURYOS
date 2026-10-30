'use strict';
/* Roadmap do sistema: o gerador (scripts/gerar-backlog.js) e o JSON publicado. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const G = require('./scripts/gerar-backlog.js');

// ── Tabelas do painel viram itens ──
const md = [
  '# Melhorias', '', '## Outra seção', '| x | y |', '',
  '## ▶ Em aberto para execução — painel consolidado (atualizado em 27/10/2026)', '',
  '### A. Código: próximos a executar (nós)', '',
  '| Frente | Item | Bloqueio | Detalhe |', '|---|---|---|---|',
  '| Custos | **Fase 0** no `erpkuryos`: custo no lote | nenhum | `PLANO.md` |',
  '| Cadastro | Saneamento:<br>- barrar nome genérico;<br>- relatório Excel | — | `AGENT_STATUS.md` |',
  '| Testes | ~~Consertar teste de tela~~ feito em abc1234 | — | — |',
  '| Qualidade | Regra com \\| barra escapada | sirene (K5) | — |',
  '', '### B. Depende da Kuryos', '', '| Quem | Item | Destrava |', '|---|---|---|',
  '| Qualidade | **K1**: cadastrar os ativos | A4 |', '',
  '### C. Decisões pendentes do usuário', '', '| Tema | Pergunta | Detalhe |', '|---|---|---|',
  '| Apontamento | 207 registros: marcar ou gravar? | `AGENT_STATUS.md` |', '',
  '---', '', '## Depois', '| a | b |', '|---|---|', '| z | w |'
].join('\n');
const r = G.parse(md);
assert.equal(r.atualizadoEm, '27/10/2026');
assert.deepEqual(r.secoes.map((s) => [s.letra, s.itens.length]), [['A', 4], ['B', 1], ['C', 1]], 'só o painel; a seção seguinte não entra');
const [i1, i2, i3, i4] = r.secoes[0].itens;
assert.equal(i1.grupo, 'Custos'); assert.equal(i1.texto, '**Fase 0** no `erpkuryos`: custo no lote');
assert.deepEqual(i1.extras, {Bloqueio: 'nenhum', Detalhe: '`PLANO.md`'});
assert.deepEqual(i2.subitens, ['barrar nome genérico;', 'relatório Excel']); assert.equal(i2.texto, 'Saneamento:');
assert.deepEqual(i2.extras, {Detalhe: '`AGENT_STATUS.md`'}, '"—" não vira bloqueio');
assert.equal(i3.feito, true); assert.equal(i3.hash, 'abc1234'); assert.equal(i3.texto, 'Consertar teste de tela', 'sem o risco e sem o "feito em"');
assert.equal(i1.feito, false);
assert.match(i4.texto, /Regra com \| barra escapada/);
// id estável: marcar como feito não muda a identidade do item
const antes = G.parse(md.replace('~~Consertar teste de tela~~ feito em abc1234', 'Consertar teste de tela')).secoes[0].itens[2];
assert.equal(antes.id, i3.id, 'o id sobrevive à mudança de aberto para feito');
assert.equal(new Set(r.secoes.flatMap((s) => s.itens.map((i) => i.id))).size, 6, 'ids distintos');
assert.deepEqual(r.resumo, {A: {titulo: 'Código: próximos a executar (nós)', total: 4, feitos: 1}, B: {titulo: 'Depende da Kuryos', total: 1, feitos: 0}, C: {titulo: 'Decisões pendentes do usuário', total: 1, feitos: 0}});
assert.throws(() => G.parse('# sem painel'), /não encontrado/);
assert.deepEqual(G.celulas('| a | b \\| c | d |'), ['a', 'b | c', 'd']);

// ── O arquivo real parseia e o JSON publicado está em dia ──
// Nosso MELHORIAS_FUTURAS.md ainda não tem o painel do Gustavo: vale a leitura por seções e tópicos (PORT-09).
const lido = G.lerOrigem(fs.readFileSync(G.ORIGEM, 'utf8'));
const real = lido.dados;
assert.ok(real.secoes.length === 3, 'as três listas (A, B, C)');
assert.ok(real.secoes[0].itens.length > 0, 'seção A vazia: o formato do MELHORIAS_FUTURAS.md mudou?');
real.secoes.forEach((s) => s.itens.forEach((i) => assert.ok(i.texto && i.grupo, 'item sem texto/grupo em ' + s.letra)));
assert.equal(new Set(real.secoes.flatMap((s) => s.itens.map((i) => i.id))).size, real.secoes.reduce((n, s) => n + s.itens.length, 0), 'ids distintos no arquivo real');

// ── Leitura por seções e tópicos (formato atual do nosso arquivo) ──
const livre = G.parseLivre([
  '# Melhorias', 'intro', '- tópico antes de qualquer seção não entra', '',
  '## Compras (2026-09-10)', '', '- **Cotação parcial.** Hoje só cota tudo; ver `compras.html`.', '  - subitem um', '  continua o subitem', '',
  '- ~~**Já resolvido.**~~ feito em `abc1234`.', '',
  '## MRP: data de demanda (decisão de negócio pendente)', '', '- **Usar a promessa de entrega.** Precisa de resposta.', '',
  '## Estoque', '', '- **Saldo de abertura.** Depende da operação (Dia D).', '### Sub', '- **Fora do tópico**'
].join('\n'));
const porTexto = Object.fromEntries(livre.secoes.flatMap((s) => s.itens.map((i) => [i.texto, Object.assign({letra: s.letra}, i)])));
assert.deepEqual(Object.keys(porTexto).sort(), ['Cotação parcial', 'Fora do tópico', 'Já resolvido', 'Saldo de abertura', 'Usar a promessa de entrega'].sort());
assert.equal(porTexto['Cotação parcial'].grupo, 'Compras', 'data entre parênteses sai do grupo');
assert.deepEqual(porTexto['Cotação parcial'].subitens, ['subitem um continua o subitem']);
assert.equal(porTexto['Cotação parcial'].extras.Detalhe, 'Hoje só cota tudo; ver `compras.html`.');
assert.equal(porTexto['Já resolvido'].feito, true); assert.equal(porTexto['Já resolvido'].hash, 'abc1234');
assert.equal(porTexto['Usar a promessa de entrega'].letra, 'C', 'decisão pendente vai para C');
assert.equal(porTexto['Saldo de abertura'].letra, 'B', 'depende da operação vai para B');
assert.equal(porTexto['Cotação parcial'].letra, 'A');
assert.equal(G.lerOrigem('## Só seções\n- **X.** y').fonte, 'MELHORIAS_FUTURAS.md (seções e tópicos)');
const publicado = JSON.parse(fs.readFileSync(G.DESTINO, 'utf8'));
const semVolateis = (j) => JSON.stringify({a: j.atualizadoEm, s: j.secoes, r: j.resumo, f: j.fonte});
assert.equal(semVolateis(publicado), semVolateis(Object.assign({fonte: publicado.fonte}, real)),
  'public/backlog.json está desatualizado em relação a MELHORIAS_FUTURAS.md: rode `node scripts/gerar-backlog.js` antes de publicar');

// ── Ligações ──
const nav = fs.readFileSync('public/shared/navegacao.js', 'utf8');
assert.match(nav, /\{p: 'backlog\.html'[^}]*b: 'ADM'/);
const auth = fs.readFileSync('public/auth_check.js', 'utf8');
assert.match(auth, /backlog:\s*\{ rotulo: 'Roadmap do sistema'/);
const porPapel = auth.slice(auth.indexOf('MODULOS_POR_PAPEL = {'), auth.indexOf('MODULOS_POR_PAPEL = {') + 900);
assert.ok(!/'backlog'/.test(porPapel), 'o módulo não entra no padrão de nenhum papel: só admin e quem o ADM marcar');

console.log('run_backlog_test: OK');
