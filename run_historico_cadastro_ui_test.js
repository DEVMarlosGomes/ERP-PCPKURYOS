'use strict';
/* Histórico do cadastro vivo na tela real de Cadastros (10/11/2026), Firebase simulado
   (mesmo harness de run_trava_aprovados_ui_test.js, lido de lá para não divergir):
   Material, Produto e Fornecedor — editar exige justificativa curta quando algo muda; cada
   salvamento grava, no mesmo update, uma entrada por campo em historico_{materiais|produtos|fornecedores};
   criar registra "Cadastro criado"; o modal mostra o histórico agrupado. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const fonte = fs.readFileSync(path.join(__dirname, 'run_trava_aprovados_ui_test.js'), 'utf8');
const abrir = eval('(' + fonte.slice(fonte.indexOf('async function abrir'), fonte.indexOf('\nfunction dados(')) + ')');

const PCP = {nome: 'Planejador', email: 'p@kuryos.com', role: 'pcp', modulos: {cadastros: true}};
function dados() {
  return {
    usuarios: {u1: PCP},
    clientes: {}, solicitacoes_cadastro_material: {}, categorias: {}, config: {}, estoque: {}, ops: {}, formulas: {}, bom: {}, especificacoes: {},
    materiais: {'MPGR-00127': {mpCodigo: 'MPGR-00127', mpNome: 'ÁLCOOL 96°GL', tipo: 'MPGR', unidade: 'kg', ativo: true, controlaEstoque: true}},
    materiais_chave: {},
    historico_materiais: {'MPGR-00127': {old1: {campo: 'unidade', valorAnterior: 'g', valorNovo: 'kg', alteradoPor: 'Ana', alteradoEm: '2026-10-01T10:00:00.000Z'}}},
    produtos: {FBBS0004: {sku: 'FBBS0004', descricao: 'BODY SPLASH OUD NIGHT 200ML', ativo: true, volume: 200, cliente: 'FEBELLA', lotePadrao: 1000}},
    fornecedores: {F1: {razaoSocial: 'ESSENCIAS LTDA', nomeFantasia: 'ESSENCIAS', cnpj: '11.111.111/0001-11', tipos: ['mp'], ativo: true, revisado: true, prazoEntregaDias: 15}}
  };
}
const historico = (page, no, key) => page.evaluate(([n, k]) => Object.values((window.__db[n] || {})[k] || {}), [no, key]);

(async () => {
  const browser = await chromium.launch({headless: true, channel: 'chrome'});
  try {
    // ── Material ──
    let {page, errors} = await abrir(browser, dados(), 'cadastros.html?tab=materiais');
    await page.click('.btn-edit-mat[data-key="MPGR-00127"]');
    await page.waitForSelector('#modalBg-mat.open');
    assert.equal(await page.isVisible('#hcBloco-mat'), true, 'bloco de justificativa ao editar');
    await page.click('#hcHist-mat summary');
    await page.waitForFunction(() => /Ana/.test(document.getElementById('hcLista-mat').innerText));
    assert.match(await page.locator('#hcLista-mat').innerText(), /kg/, 'histórico antigo (sem grupo) continua aparecendo');
    await page.fill('#fNome-mat', 'Álcool etílico 96°GL'); // a tela normaliza: maiúsculas, sem acento
    await page.click('#modalSaveBtn-mat');
    await page.waitForFunction(() => /justificativa da alteração/.test(document.getElementById('alertBox').innerText));
    assert.equal(await page.evaluate(() => window.__db.materiais['MPGR-00127'].mpNome), 'ÁLCOOL 96°GL', 'sem justificativa não salva');
    assert.equal(await page.getAttribute('#hcJust-mat', 'aria-invalid'), 'true');
    await page.fill('#hcJust-mat', 'Nome conforme o laudo do fornecedor');
    await page.click('#modalSaveBtn-mat');
    await page.waitForFunction(() => window.__db.materiais['MPGR-00127'].mpNome === 'ALCOOL ETILICO 96°GL');
    let h = (await historico(page, 'historico_materiais', 'MPGR-00127')).filter((x) => x.grupo);
    assert.equal(h.length, 1, 'um campo mudou: ' + JSON.stringify(h));
    assert.deepEqual([h[0].campo, h[0].rotulo, h[0].valorAnterior, h[0].valorNovo, h[0].alteradoPor, h[0].justificativa],
      ['mpNome', 'Nome', 'ÁLCOOL 96°GL', 'ALCOOL ETILICO 96°GL', 'Planejador', 'Nome conforme o laudo do fornecedor']);
    assert.deepEqual(h[0].em_ms, {'.sv': 'timestamp'});
    // Reabrir e salvar sem mudar nada: não pede justificativa nem grava histórico.
    await page.click('.btn-edit-mat[data-key="MPGR-00127"]');
    await page.waitForSelector('#modalBg-mat.open');
    await page.click('#modalSaveBtn-mat');
    await page.waitForFunction(() => !document.getElementById('modalBg-mat').classList.contains('open'));
    assert.equal((await historico(page, 'historico_materiais', 'MPGR-00127')).filter((x) => x.grupo).length, 1, 'nada mudou, nada registrado');
    assert.deepEqual(errors, [], 'erros (material): ' + errors.join(' | '));
    await page.close();

    // ── Produto ──
    ({page, errors} = await abrir(browser, dados(), 'cadastros.html?tab=produtos'));
    await page.click('.btn-edit-prod[data-key="FBBS0004"]');
    await page.waitForSelector('#modalBg-prod.open');
    await page.fill('#fDescricao-prod', 'BODY SPLASH OUD NIGHT 200ML NOVA ARTE');
    await page.fill('#hcJust-prod', 'Nova descrição pedida pelo cliente');
    await page.click('#modalSaveBtn-prod');
    await page.waitForFunction(() => window.__db.produtos.FBBS0004.descricao === 'BODY SPLASH OUD NIGHT 200ML NOVA ARTE');
    const prod = await page.evaluate(() => window.__db.produtos.FBBS0004);
    assert.equal(prod.lotePadrao !== undefined, true, 'mescla: campos do produto continuam');
    h = await historico(page, 'historico_produtos', 'FBBS0004');
    const desc = h.find((x) => x.campo === 'descricao');
    assert.ok(desc, 'descrição no histórico: ' + JSON.stringify(h));
    assert.equal(desc.rotulo, 'Descrição');
    assert.equal(desc.justificativa, 'Nova descrição pedida pelo cliente');
    assert.ok(h.every((x) => x.grupo === desc.grupo), 'um salvamento = um grupo');
    await page.click('.btn-edit-prod[data-key="FBBS0004"]');
    await page.waitForSelector('#modalBg-prod.open');
    await page.click('#hcHist-prod summary');
    await page.waitForFunction(() => /Nova descrição pedida pelo cliente/.test(document.getElementById('hcLista-prod').innerText));
    assert.deepEqual(errors, [], 'erros (produto): ' + errors.join(' | '));
    await page.close();

    // ── Fornecedor ──
    ({page, errors} = await abrir(browser, dados(), 'cadastros.html?tab=fornecedores'));
    await page.click('.fn-edit-forn[data-key="F1"]');
    await page.waitForSelector('#modalFornecedor-forn.open');
    await page.fill('#fnPrazoEntrega-forn', '20').catch(() => page.fill('[id^="fnPrazo"]', '20'));
    await page.fill('#fnContatoNome-forn', 'Marcia');
    await page.fill('#hcJust-forn', 'Novo contato comercial e prazo');
    await page.click('#modalFornecedorSave-forn');
    await page.waitForFunction(() => String(window.__db.fornecedores.F1.contatoNome).toUpperCase() === 'MARCIA');
    h = await historico(page, 'historico_fornecedores', 'F1');
    assert.deepEqual(h.map((x) => x.campo).sort(), ['contatoNome', 'prazoEntregaDias']);
    assert.equal(h[0].justificativa, 'Novo contato comercial e prazo');
    assert.equal(await page.evaluate(() => window.__db.fornecedores.F1.cnpj), '11.111.111/0001-11', 'mescla preserva o resto');
    // Novo fornecedor: "Cadastro criado", sem pedir justificativa.
    await page.click('#btnNovoFornecedor-forn');
    await page.waitForSelector('#modalFornecedor-forn.open');
    assert.equal(await page.isVisible('#hcBloco-forn'), false, 'criação não pede justificativa');
    await page.fill('#fnRazaoSocial-forn', 'EMBALAGENS SUL LTDA');
    await page.click('#modalFornecedorSave-forn');
    await page.waitForFunction(() => Object.values(window.__db.fornecedores).some((f) => f.razaoSocial === 'EMBALAGENS SUL LTDA'));
    const novo = await page.evaluate(() => Object.keys(window.__db.fornecedores).find((k) => window.__db.fornecedores[k].razaoSocial === 'EMBALAGENS SUL LTDA'));
    h = await historico(page, 'historico_fornecedores', novo);
    assert.deepEqual(h.map((x) => x.acao), ['CRIADO']);
    assert.deepEqual(errors, [], 'erros (fornecedor): ' + errors.join(' | '));
    await page.close();
  } finally { await browser.close(); }
  console.log('OK histórico do cadastro na tela: Material, Produto e Fornecedor exigem justificativa só quando algo muda, gravam o que mudou no mesmo update (campo, antes, depois, quem, quando, justificativa), criação registrada e histórico agrupado no modal.');
})().catch((e) => { console.error(e); process.exit(1); });
