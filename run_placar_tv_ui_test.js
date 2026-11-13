'use strict';
/* TV da fábrica (placar.html?tv=1), tela de verdade com Firebase simulado.
   Relato de 13/11/2026: "a tela da TV não funciona mesmo com apontamentos".
   Causa: nunca houve tabela de pontos congelada (pontos dependem do LP, que
   ainda não existe), e o servidor gravava o dia como "indisponível"; a TV
   mostrava "0 · sem meta" e as linhas "fora do placar" com a fábrica
   produzindo. Agora, sem tabela, a TV mostra a produção em unidades; com
   tabela, volta a pontos × meta. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const ontem = new Date(Date.now() - 27 * 3600e3).toISOString().slice(0, 10);
const IND = 'tabela de pontos não congelada';

function placarSemTabela(comHoje) {
  const dias = {[ontem]: {dia: ontem, indisponivel: IND, unidades: 12574, porLinha: {'Linha 1': {unidades: 6000}, 'Linha 2': {unidades: 6574}}}};
  if (comHoje) dias[hoje] = {dia: hoje, indisponivel: IND, unidades: 11724, porLinha: {'Linha 1': {unidades: 4896}, 'Linha 2': {unidades: 6828}}};
  return {dias, hoje: {dia: hoje, temProducao: comHoje, atualizadoEm: new Date().toISOString(), turno: {inicio: '07:00', fim: '16:00'}}};
}
function placarComTabela() {
  return {dias: {[hoje]: {dia: hoje, pontos: 900, meta: 1000, pct: 90, unidades: 3000, porLinha: {'Linha 1': {pontos: 900, meta: 1000}}}},
    semanas: {}, meses: {}, hoje: {dia: hoje, temProducao: true, atualizadoEm: new Date().toISOString()}};
}

async function abrir(browser, placar) {
  const page = await browser.newPage({viewport: {width: 1600, height: 900}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(({placar}) => {
    const data = {'usuarios/u1': {nome: 'TV', email: 'tv@kuryos.com', role: 'tv'}, 'resultado/placar': placar};
    window.__iniciado = false;
    const callable = () => () => Promise.resolve({data: {}});
    window.firebase = {
      initializeApp() { window.__iniciado = true; },
      auth() { return {onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'tv@kuryos.com'}), 0); }, signOut() { return Promise.resolve(); }, currentUser: {email: 'tv@kuryos.com'}}; },
      functions() { return {httpsCallable: callable}; }, app() { return {functions: () => ({httpsCallable: callable})}; },
      database() {
        const valor = (path) => { if (path in data) return data[path]; const ps = String(path || '').split('/'); for (let i = ps.length - 1; i > 0; i--) { const b = ps.slice(0, i).join('/'); if (b in data) return ps.slice(i).reduce((o, k) => (o == null ? undefined : o[k]), data[b]); } return undefined; };
        const ref = (path) => { const snap = {val: () => (valor(path) === undefined ? null : structuredClone(valor(path))), exists: () => valor(path) !== undefined, key: String(path).split('/').pop()};
          return {path, key: 'k', once(ev, cb) { if (cb) cb(snap); return Promise.resolve(snap); }, on(ev, cb) { setTimeout(() => cb(snap), 0); return cb; }, off() {},
            child(p) { return ref(path + '/' + p); }, orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set() { return Promise.resolve(); }, update() { return Promise.resolve(); }, remove() { return Promise.resolve(); }, push() { return ref(path + '/x'); }}; };
        return {ref, ServerValue: {TIMESTAMP: 0}};
      }
    };
  }, {placar});
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'tv.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = 'public/' + url.pathname.slice(1);
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://tv.test/placar.html?tv=1');
  await page.waitForFunction(() => !/Carregando/.test(document.getElementById('conteudo').textContent), null, {timeout: 8000});
  return {page, errors};
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (m) => { n++; console.log('ok -', m); };
  try {
    {
      const {page, errors} = await abrir(browser, placarSemTabela(true));
      const t = await page.locator('#conteudo').innerText();
      assert.match(t, /Produção de hoje\s+11\.724\s+unidades envasadas/i, 'número grande = unidades de hoje');
      assert.match(t, /Linha 1\s+4\.896 un\.[\s\S]*Linha 2\s+6\.828 un\./, 'cada linha com as suas unidades');
      assert.doesNotMatch(t, /fora do placar|sem meta/, 'nada de "fora do placar" ou "sem meta" com produção');
      assert.match(t, /Mês\s+24\.298\s+unidades/i, 'mês soma os dias');
      assert.match(t, /Pontos e meta aparecem quando a diretoria congelar/, 'diz o que falta para os pontos');
      assert.deepEqual(errors, []);
      ok('sem tabela de pontos: TV mostra a produção de hoje em unidades, por linha, semana e mês');
      await page.close();
    }
    {
      const {page, errors} = await abrir(browser, placarSemTabela(false));
      const t = await page.locator('#conteudo').innerText();
      assert.match(t, /Produção de hoje\s+0\s+sem apontamento hoje ainda/i);
      assert.match(t, /Mês\s+12\.574/i, 'antes do primeiro apontamento do dia, o mês segue visível');
      assert.deepEqual(errors, []);
      ok('início do turno, sem apontamento hoje: zero de hoje e o acumulado do mês');
      await page.close();
    }
    {
      const {page, errors} = await abrir(browser, placarComTabela());
      const t = await page.locator('#conteudo').innerText();
      assert.match(t, /Pontos de hoje\s+900\s+meta 1\.000/i, 'com tabela, volta a pontos × meta');
      assert.deepEqual(errors, []);
      ok('com tabela congelada: placar de pontos × meta continua igual');
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${n} testes ok`);
})().catch((e) => { console.error(e); process.exit(1); });
