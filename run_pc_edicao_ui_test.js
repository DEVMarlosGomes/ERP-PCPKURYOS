'use strict';
/* Edição de PC com justificativa (18/11/2026, shared/edicao-pc.js), na tela
   real: ADM edita PC em qualquer status (ENVIADO, RECEBIDO_PARCIAL,
   RECEBIDO_TOTAL, CANCELADO); sem justificativa não
   grava; a gravação é transaction no PC com revisão e saldo a receber; abaixo
   do recebido é recusado; documento sai com a faixa de revisão. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

function dados() {
  return {
    'usuarios/u1': {nome: 'Ana Compras', email: 'g@kuryos.com', role: 'admin'},
    config: {locaisKuryos: {FABRICA: {nome: 'Fábrica Kuryos', cnpj: '00.767.554/0001-19', cep: '08290-000', logradouro: 'Rua Lagoa Tai Grande', numero: '1130', bairro: 'Vila Carmosina', cidade: 'São Paulo', uf: 'SP'}}},
    fornecedores: {f1: {nomeFantasia: 'LOMAR PACK', cnpj: '33.321.531/0001-35', cep: '07041-030', logradouro: 'Avenida Carlos Ferreira Endres',
      numero: '952', bairro: 'Vila Endres', cidade: 'Guarulhos', uf: 'SP', contatoNome: 'Ana', contatoTelefone: '11 99999-0000'}},
    pedidos_compra: {
      pc1: {status: 'ENVIADO', numeroFormatado: 'PC-0031', fornecedorKey: 'f1', fornecedorNome: 'LOMAR PACK',
        dataCriacao: '2026-10-01T10:00:00Z', frete: {tipo: 'CIF'}, localEntrega: 'FABRICA', propriedade: {tipo: 'KURYOS'},
        itens: {i1: {materialCodigo: 'EP-00036', materialNome: 'Frasco', qtd: 100, qtdCotada: 100, unidade: 'un', precoUnit: 1, qtdRecebida: 0, vinculo: {geral: true}}}},
      pc2: {status: 'RECEBIDO_PARCIAL', numeroFormatado: 'PC-0032', fornecedorKey: 'f1', fornecedorNome: 'LOMAR PACK',
        dataCriacao: '2026-10-01T10:00:00Z', frete: {tipo: 'CIF'}, localEntrega: 'FABRICA', propriedade: {tipo: 'KURYOS'},
        itens: {j1: {materialCodigo: 'EP-00037', materialNome: 'Tampa', qtd: 100, qtdCotada: 100, unidade: 'un', precoUnit: 1, qtdRecebida: 60, vinculo: {geral: true}}}},
      pc3: {status: 'RECEBIDO_TOTAL', numeroFormatado: 'PC-0033', fornecedorKey: 'f1', fornecedorNome: 'LOMAR PACK',
        dataCriacao: '2026-10-01T10:00:00Z', frete: {tipo: 'CIF'}, localEntrega: 'FABRICA', propriedade: {tipo: 'KURYOS'},
        itens: {m1: {materialCodigo: 'EP-00038', materialNome: 'Válvula', qtd: 100, qtdCotada: 100, unidade: 'un', precoUnit: 1, qtdRecebida: 100, vinculo: {geral: true}}}},
      pc4: {status: 'CANCELADO', numeroFormatado: 'PC-0034', fornecedorKey: 'f1', fornecedorNome: 'LOMAR PACK',
        dataCriacao: '2026-10-01T10:00:00Z', frete: {tipo: 'CIF'}, localEntrega: 'FABRICA', propriedade: {tipo: 'KURYOS'},
        cancelamento: {canceladoPor: 'Ana', canceladoEm: '2026-10-05T10:00:00Z', motivo: 'Fornecedor sem estoque', statusAnterior: 'ENVIADO'},
        itens: {n1: {materialCodigo: 'EP-00039', materialNome: 'Rótulo', qtd: 100, qtdCotada: 100, unidade: 'un', precoUnit: 1, qtdRecebida: 0, vinculo: {geral: true}}}}
    }
  };
}

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    const page = await browser.newPage({viewport: {width: 1500, height: 1200}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.addInitScript(({data}) => {
      window.__writes = [];
      window.__iniciado = false;
      const exige = q => { if (!window.__iniciado) throw new Error("No Firebase App '[DEFAULT]' has been created (" + q + ')'); };
      window.fetch = () => Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({erro: true})});
      window.firebase = {
        initializeApp(cfg) { if (!cfg || !cfg.databaseURL) throw new Error('sem databaseURL'); window.__iniciado = true; },
        auth() {
          exige('auth');
          return {onAuthStateChanged(cb) { setTimeout(() => cb({uid: 'u1', email: 'g@kuryos.com', displayName: 'Gustavo'}), 0); },
            signOut() { return Promise.resolve(); }, currentUser: {email: 'g@kuryos.com'}};
        },
        functions() { return {httpsCallable: () => () => Promise.resolve({data: {}})}; },
        app() { return {functions: () => ({httpsCallable: () => () => Promise.resolve({data: {}})})}; },
        database() {
          exige('database');
          const ler = p => {
            if (p in data) return data[p];
            const ps = String(p).split('/');
            let o = data[ps[0]];
            for (let i = 1; i < ps.length && o != null; i++) o = o[ps[i]];
            return o === undefined ? null : o;
          };
          const ref = path => {
            const snap = {val: () => (ler(path) == null ? null : structuredClone(ler(path))), exists: () => ler(path) != null, key: String(path).split('/').pop()};
            return {path, key: 'k' + Math.random().toString(36).slice(2, 8),
              once(ev, cb) { if (cb) cb(snap); return Promise.resolve(snap); },
              on(ev, cb) { setTimeout(() => cb(snap), 0); return cb; }, off() {},
              child(p) { return ref(path + '/' + p); }, push() { return ref(path + '/k' + Math.random().toString(36).slice(2, 8)); },
              orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
              set(v) { window.__writes.push({op: 'set', path, v}); return Promise.resolve(); },
              update(v) { window.__writes.push({op: 'update', path, v}); return Promise.resolve(); },
              remove() { return Promise.resolve(); },
              // Como o SDK: 1ª passada com o cache (null aqui), depois o valor do servidor.
              transaction(fn) {
                let v = fn(null);
                if (v === null) v = fn(structuredClone(ler(path)));
                if (v === undefined) return Promise.resolve({committed: false, snapshot: {val: () => null, exists: () => false}});
                window.__writes.push({op: 'transaction', path, v});
                return Promise.resolve({committed: true, snapshot: {val: () => v, exists: () => true}});
              }};
          };
          return {ref, ServerValue: {TIMESTAMP: 0}};
        }
      };
    }, {data: dados()});
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'cmp.test') return route.fulfill({body: '', contentType: 'text/javascript'});
      const file = 'public/' + url.pathname.slice(1);
      if (!fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
      return route.fulfill({body: fs.readFileSync(file),
        contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.css') ? 'text/css' : 'text/javascript'});
    });
    await page.goto('https://cmp.test/compras.html');
    await page.waitForSelector('.kt-sidebar', {timeout: 8000});
    await page.waitForFunction(() => window.currentUser && window.currentUser.role === 'admin', null, {timeout: 8000});
    await page.click('.tab[data-tab="pedidos"]');
    await page.waitForSelector('.pc-editar[data-key="pc1"]');
    assert.ok(await page.locator('.pc-editar[data-key="pc2"]').count(), 'recebido em parte também edita');
    assert.ok(await page.locator('.pc-editar[data-key="pc3"]').count(), 'recebido total também edita');

    // ── PC ENVIADO: preço novo + quantidade nova ─────────────────────────
    await page.click('.pc-editar[data-key="pc1"]');
    await page.waitForSelector('#modalEditarPC.open');
    assert.match(await page.locator('#pcEditAviso').innerText(), /enviado ao fornecedor/);
    await page.fill('.pce-preco[data-item="i1"]', '1.25');
    await page.fill('.pce-qtd[data-item="i1"]', '120');
    await page.check('#pcEditRotaConfirmada');
    await page.click('#pcEditSalvar');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => window.__writes.length), 0, 'sem justificativa não grava');
    await page.fill('#pcEditJustificativa', 'Fornecedor reajustou o preço e o lote mínimo');
    await page.click('#pcEditSalvar');
    await page.waitForFunction(() => window.__writes.some((w) => w.op === 'transaction' && w.path === 'pedidos_compra/pc1'));
    const v = await page.evaluate(() => window.__writes.find((w) => w.op === 'transaction').v);
    assert.equal(v.status, 'ENVIADO', 'status não muda');
    assert.equal(v.revisao, 1);
    assert.equal(v.itens.i1.precoUnit, 1.25);
    assert.equal(v.itens.i1.qtd, 120, 'saldo a receber acompanha');
    const rev = Object.values(v.edicoes)[0];
    assert.equal(rev.justificativa, 'Fornecedor reajustou o preço e o lote mínimo');
    assert.equal(rev.por, 'Ana Compras');
    assert.equal(rev.statusNoMomento, 'ENVIADO');
    const campos = rev.alteracoes.map((a) => a.campo);
    ['itens/i1/precoUnit', 'itens/i1/qtdCotada', 'itens/i1/qtd'].forEach((c) => assert.ok(campos.includes(c), c + ' em ' + campos));
    assert.equal(await page.evaluate(() => document.getElementById('modalEditarPC').classList.contains('open')), false);

    // Documento e histórico com a revisão.
    await page.evaluate((nv) => { allPedidosCompra.pc1 = nv; renderPedidos(); }, v);
    const doc = await page.evaluate(() => montarDocumentoPedidoCompraComRota(allPedidosCompra.pc1, allFornecedores.f1));
    assert.match(doc, /REVISÃO 1 — SUBSTITUI A VERSÃO ANTERIOR/);
    assert.match(doc, /Fornecedor reajustou/);
    await page.click('.pc-revisoes[data-key="pc1"]');
    await page.waitForSelector('#modalRevisoesPC.open');
    assert.match(await page.locator('#pcRevCorpo').innerText(), /Preço unitário/);
    await page.click('#modalRevisoesPCClose');

    // ── PC recebido em parte: abaixo do recebido é recusado ──────────────
    await page.evaluate(() => { window.__writes.length = 0; });
    await page.click('.pc-editar[data-key="pc2"]');
    await page.waitForSelector('#modalEditarPC.open');
    await page.fill('.pce-qtd[data-item="j1"]', '50');
    await page.check('#pcEditRotaConfirmada');
    await page.fill('#pcEditJustificativa', 'Fornecedor não vai entregar o restante');
    await page.click('#pcEditSalvar');
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__writes.length), 0, 'abaixo do recebido não grava');
    await page.fill('.pce-qtd[data-item="j1"]', '60');
    await page.click('#pcEditSalvar');
    await page.waitForFunction(() => window.__writes.some((w) => w.op === 'transaction' && w.path === 'pedidos_compra/pc2'));
    const v2 = await page.evaluate(() => window.__writes.find((w) => w.op === 'transaction').v);
    assert.equal(v2.itens.j1.qtd, 60);
    assert.equal(v2.itens.j1.qtdRecebida, 60, 'recebido intacto');
    assert.equal(v2.status, 'RECEBIDO_TOTAL', 'baixou ao recebido: fecha');

    // ── PC recebido por inteiro: aumentar reabre o saldo ─────────────────
    await page.evaluate(() => { window.__writes.length = 0; });
    await page.click('.pc-editar[data-key="pc3"]');
    await page.waitForSelector('#modalEditarPC.open');
    assert.match(await page.locator('#pcEditAviso').innerText(), /recebido por inteiro/);
    await page.fill('.pce-qtd[data-item="m1"]', '130');
    await page.check('#pcEditRotaConfirmada');
    await page.fill('#pcEditJustificativa', 'Fornecedor vai complementar 30 un');
    await page.click('#pcEditSalvar');
    await page.waitForFunction(() => window.__writes.some((w) => w.op === 'transaction' && w.path === 'pedidos_compra/pc3'));
    const v3 = await page.evaluate(() => window.__writes.find((w) => w.op === 'transaction').v);
    assert.equal(v3.itens.m1.qtd, 130);
    assert.equal(v3.status, 'RECEBIDO_PARCIAL', 'saldo reaberto');
    assert.ok(Object.values(v3.edicoes)[0].alteracoes.some((a) => a.campo === 'status' && a.depois === 'RECEBIDO_PARCIAL'));

    // ── PC cancelado: corrige o registro, segue cancelado ────────────────
    await page.evaluate(() => { window.__writes.length = 0; });
    await page.selectOption('#pcFilterStatus', 'cancelados');
    await page.waitForSelector('.pc-editar[data-key="pc4"]');
    await page.click('.pc-editar[data-key="pc4"]');
    await page.waitForSelector('#modalEditarPC.open');
    assert.match(await page.locator('#pcEditAviso').innerText(), /cancelado/);
    await page.fill('.pce-preco[data-item="n1"]', '1.10');
    await page.check('#pcEditRotaConfirmada');
    await page.fill('#pcEditJustificativa', 'Corrige o preço do registro cancelado');
    await page.click('#pcEditSalvar');
    await page.waitForFunction(() => window.__writes.some((w) => w.op === 'transaction' && w.path === 'pedidos_compra/pc4'));
    const v4 = await page.evaluate(() => window.__writes.find((w) => w.op === 'transaction').v);
    assert.equal(v4.status, 'CANCELADO');
    assert.equal(v4.itens.n1.precoUnit, 1.1);
    assert.equal(v4.revisao, 1);

    // ── Quem pode: ADM e setor de Compras (18/11) ───────────────────────
    const pode = await page.evaluate(() => {
      const salvo = window.currentUser, r = {};
      const teste = (nome, u) => { window.currentUser = Object.assign({uid: 'x', nome: nome}, u); r[nome] = podeEditarPC(allPedidosCompra.pc1); };
      teste('pcp', {role: 'pcp'});
      teste('modCompras', {role: 'production', modulos: {compras: true}});
      teste('qualidade', {role: 'qualidade'});
      teste('producao', {role: 'production'});
      window.currentUser = salvo;
      return r;
    });
    assert.deepEqual(pode, {pcp: true, modCompras: true, qualidade: false, producao: false});

    assert.deepEqual(errors, [], 'erros de página: ' + errors.join(' | '));
    console.log('OK Edição de PC com justificativa: qualquer status (enviado, parcial, total, cancelado), status recalculado, revisão, saldo a receber, trava do recebido, documento.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
