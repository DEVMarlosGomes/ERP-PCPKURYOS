'use strict';
/* Financeiro F5, tela de verdade: aba "Notas de entrada" (XML da NF-e). Prévia com a
   situação do casamento, importação pelo servidor real (prepararNotasEntrada), título
   do recebimento passa a vencer pelas duplicatas, nota repetida não entra, nota sem
   pedido vira título manual preenchido pela nota. Firebase simulado em memória. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const FS = require('./functions/financeiro_servidor');

const CH1 = '35261112345678000190550010000012341123456789';
const CH2 = '35261199888777000166550010000000771000000771';
function xml(chave, nNF, cnpj, nome, vNF, dups) {
  const dup = dups.map(([v, val], i) => `<dup><nDup>00${i + 1}</nDup><dVenc>${v}</dVenc><vDup>${val}</vDup></dup>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${chave}" versao="4.00">` +
    `<ide><mod>55</mod><serie>1</serie><nNF>${nNF}</nNF><dhEmi>2026-11-08T10:00:00-03:00</dhEmi><tpNF>1</tpNF></ide>` +
    `<emit><CNPJ>${cnpj}</CNPJ><xNome>${nome}</xNome></emit><dest><CNPJ>99888777000166</CNPJ></dest>` +
    `<det nItem="1"><prod><cProd>X</cProd><xProd>ITEM</xProd><CFOP>5101</CFOP><uCom>UN</uCom><qCom>1</qCom><vProd>${vNF}</vProd></prod></det>` +
    `<total><ICMSTot><vProd>${vNF}</vProd><vNF>${vNF}</vNF></ICMSTot></total>` + (dup ? `<cobr>${dup}</cobr>` : '') + `</infNFe></NFe></nfeProc>`;
}
const XML_REC = xml(CH1, '1234', '12345678000190', 'EMBALAGENS CIA', '1500.50', [['2026-12-10', '750.25'], ['2027-01-09', '750.25']]);
const XML_SERV = xml(CH2, '77', '55444333000122', 'MANUTENCAO SA', '300.00', [['2026-11-25', '300.00']]);

function banco() {
  return {
    usuarios: {u1: {nome: 'Gustavo', email: 'adm@kuryos.com', role: 'admin'}},
    fornecedores: {f1: {razaoSocial: 'EMBALAGENS CIA', cnpj: '12.345.678/0001-90'}, f3: {razaoSocial: 'MANUTENCAO SA', cnpj: '55.444.333/0001-22'}},
    pedidos_compra: {pc1: {numeroFormatado: 'PC-0010', fornecedorKey: 'f1', recebimentos: {r1: {notaFiscal: '1234', data: '2026-11-09', status: 'ATIVO'}}}},
    fin: {
      contas_bancarias: {itau: {nome: 'Itaú', saldoInicialCentavos: 100000, dataSaldoInicial: '2026-10-01'}},
      titulos: {REC_pc1_r1: {tipo: 'PAGAR', valorCentavos: 150050, condicao: '28', baseVencimento: '2026-11-09', emissao: '2026-11-09', natureza: 'EMBALAGEM',
        documento: 'NF 1234', parceiro: {nome: 'EMBALAGENS CIA'}, origem: {tipo: 'RECEBIMENTO', pc: 'PC-0010'}}},
    },
    ctl: {fechamentos: {}},
  };
}

async function abrir(browser) {
  const page = await browser.newPage({viewport: {width: 1400, height: 950}});
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.addInitScript(({data}) => {
    const db = data;
    window.__db = db; window.__chamadas = [];
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => (String(p).replace(/^\//, '') === '.info/connected' ? true : partes(p).reduce((x, k) => (x == null ? undefined : x[k]), db));
    const gravar = (p, v) => {
      const ks = partes(p); let x = db;
      ks.slice(0, -1).forEach((k) => { if (x[k] == null || typeof x[k] !== 'object') x[k] = {}; x = x[k]; });
      if (v === null || v === undefined) delete x[ks[ks.length - 1]]; else x[ks[ks.length - 1]] = structuredClone(v);
    };
    const ouvintes = [];
    const avisar = () => ouvintes.forEach((o) => o());
    window.firebase = {
      initializeApp() {},
      auth() { return {currentUser: {uid: 'u1', email: 'adm@kuryos.com'}, onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'adm@kuryos.com'}), 0); }, signOut() { return Promise.resolve(); }}; },
      functions() {
        return {httpsCallable(nome) {
          return (payload) => {
            window.__chamadas.push({nome, payload});
            return window.__servidor(nome, structuredClone(payload), structuredClone(db)).then((r) => {
              if (r.erro) return Promise.reject(new Error(r.erro));
              Object.entries(r.updates || {}).forEach(([k, v]) => gravar(k, v));
              avisar();
              return {data: r.data};
            });
          };
        }};
      },
      database() {
        const ref = (p) => {
          const snap = () => { const v = ler(p); const c = v === undefined ? null : structuredClone(v); return {val: () => c, exists: () => c !== null, key: partes(p).pop()}; };
          return {path: p, key: partes(p).pop(), child(c) { return ref(p + '/' + c); },
            once(ev, cb) { const s = snap(); if (cb) cb(s); return Promise.resolve(s); },
            on(ev, cb) { const f = () => cb(snap()); ouvintes.push(f); setTimeout(f, 0); return cb; }, off() {},
            orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
            set(v) { gravar(p, v); avisar(); return Promise.resolve(); },
            update(o) { Object.entries(o).forEach(([k, v]) => gravar(p + '/' + k, v)); avisar(); return Promise.resolve(); },
            remove() { gravar(p, null); avisar(); return Promise.resolve(); },
            push() { const k = '-F' + Math.random().toString(36).slice(2, 8); return ref(p + '/' + k); }};
        };
        return {ref: (x) => ref(x || '')};
      },
    };
  }, {data: banco()});
  await page.exposeFunction('__servidor', async (nome, payload, base) => {
    try {
      const quem = {uid: 'u1', nome: 'Gustavo'}, agora = '2026-11-10T12:00:00.000Z';
      if (nome === 'finImportarNfEntrada') {
        const r = FS.prepararNotasEntrada(base, payload, quem, agora);
        return {updates: r.updates, data: {importadas: r.importadas, repetidas: r.repetidas, erros: r.erros, vinculadas: r.vinculadas}};
      }
      if (nome === 'finLancarTitulos') {
        const r = FS.prepararTitulos(base, payload, quem, agora);
        return {updates: r.updates, data: {criados: r.criados, repetidos: r.repetidos, erros: r.erros}};
      }
      return {erro: 'callable não simulado: ' + nome};
    } catch (e) { return {erro: e.message}; }
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'fin.test') return route.fulfill({body: '', contentType: 'text/javascript'});
    const file = path.join(__dirname, 'public', url.pathname.slice(1));
    if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({body: fs.readFileSync(file), contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/javascript'});
  });
  await page.goto('https://fin.test/financeiro.html');
  await page.waitForFunction(() => window.currentUser && document.querySelector('.kpis'));
  return {page, erros};
}
const arquivo = (name, texto) => ({name, mimeType: 'text/xml', buffer: Buffer.from(texto, 'utf8')});

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  let n = 0;
  const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ok  ' + m); };
  try {
    const {page, erros} = await abrir(browser);
    await page.click('.aba[data-aba="notas"]');
    await page.waitForSelector('#nfArquivos', {state: 'attached'});
    ok(/Nenhuma nota importada/.test(await page.locator('#conteudo').innerText()), 'aba vazia explica o que fazer');

    // Prévia: uma casa com o recebimento, outra sem pedido, um arquivo ruim.
    await page.setInputFiles('#nfArquivos', [arquivo('nf1234.xml', XML_REC), arquivo('servico.xml', XML_SERV), arquivo('foto.xml', '<html></html>')]);
    await page.waitForSelector('#nfImportar');
    const previa = await page.locator('#conteudo .card').first().innerText();
    ok(/1234[\s\S]*EMBALAGENS CIA[\s\S]*casa com o recebimento[\s\S]*PC-0010/.test(previa), 'prévia: NF 1234 casa com o recebimento do PC-0010');
    ok(/MANUTENCAO SA[\s\S]*sem pedido de compra/.test(previa), 'prévia: nota de serviço sem pedido');
    ok(/foto\.xml[\s\S]*não lido[\s\S]*Não é o XML/.test(previa), 'prévia: arquivo inválido explicado');
    ok(/10\/12\/2026[\s\S]*09\/01\/2027/.test(previa), 'prévia mostra as duplicatas em dd/mm/aaaa');
    ok((await page.locator('#nfImportar').innerText()).includes('Importar 2 nota(s)'), 'só as válidas contam');

    await page.click('#nfImportar');
    await page.waitForFunction(() => Object.keys((window.__db.fin || {}).notas_entrada || {}).length === 2);
    const db = await page.evaluate(() => window.__db);
    ok(db.fin.notas_entrada[CH1].titulo === 'REC_pc1_r1', 'servidor gravou a nota já vinculada ao título do recebimento');
    ok(!db.fin.notas_entrada[CH2].titulo, 'nota de serviço fica sem título');

    // Título do recebimento passa a vencer pelas duplicatas.
    await page.click('.aba[data-aba="pagar"]');
    await page.click('a[data-det="REC_pc1_r1"]');
    await page.waitForSelector('#dlg[open]');
    const det = await page.locator('#dlgB').innerText();
    ok(/Nota fiscal \(XML\)[\s\S]*NF 1234[\s\S]*vencimentos pelas duplicatas/.test(det), 'detalhe mostra a nota de origem');
    ok(/1\/2[\s\S]*10\/12\/2026[\s\S]*2\/2[\s\S]*09\/01\/2027/.test(det), 'parcelas 10/12 e 09/01, não mais "28 dias"');
    await page.click('#dlgX');

    // Mesma nota de novo: não entra.
    await page.click('.aba[data-aba="notas"]');
    await page.setInputFiles('#nfArquivos', [arquivo('nf1234-copia.xml', XML_REC)]);
    await page.waitForSelector('#nfImportar');
    ok(/já importada/.test(await page.locator('#conteudo .card').first().innerText()), 'nota repetida aparece como já importada');
    ok(await page.locator('#nfImportar').isDisabled(), 'nada a importar');
    await page.click('#nfLimpar');

    // Nota sem pedido: título manual preenchido pela nota, vencimento pelas duplicatas.
    await page.click(`button[data-manual-nf="${CH2}"]`);
    await page.waitForSelector('#mOk');
    ok(await page.inputValue('#mParc') === 'MANUTENCAO SA' && await page.inputValue('#mDoc') === 'NF 77/1' && await page.inputValue('#mValor') === '300,00', 'formulário preenchido pela nota');
    ok(/25\/11\/2026[\s\S]*R\$\s*300,00/.test(await page.locator('#mPrev').innerText()), 'prévia usa a duplicata da nota');
    await page.click('#mOk');
    await page.waitForFunction((ch) => Object.values(window.__db.fin.titulos).some((t) => t.notaChave === ch), CH2);
    await page.click('.aba[data-aba="notas"]');
    ok(!(await page.locator(`button[data-manual-nf="${CH2}"]`).count()), 'nota com título não oferece lançar de novo');
    ok(/NF 77/.test(await page.locator('#conteudo').innerText()), 'lista liga a nota ao título');
    await page.screenshot({path: path.join(__dirname, 'scripts', 'artifacts', 'fin-op', 'f5-notas-entrada.png'), fullPage: true});
    ok(!erros.length, 'sem erro de JS: ' + erros.join(' | '));
  } finally { await browser.close(); }
  console.log('OK financeiro F5 (tela): ' + n + ' verificações');
})().catch((e) => { console.error(e); process.exit(1); });
