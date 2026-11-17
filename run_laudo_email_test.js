'use strict';
/* Relatório de Análise de PA por e-mail ao cliente + logos no cabeçalho (17/11/2026).
     node run_laudo_email_test.js
   - shared/laudo-cq.js: cabeçalho com logo Kuryos à esquerda; logo do cliente só quando há URL;
     tamanho limitado a 50–200%; sem `logos`, o cabeçalho antigo (impressões antigas iguais);
   - shared/laudo-email.js: contatos do cadastro com e-mail, marcados por área; extras; limites;
   - shared/laudo-pdf.js: corte de folha nunca no meio de um bloco;
   - functions/laudo_email.js sobre banco falso: permissão (role/funções/módulos), laudo concluído,
     PA apenas, PDF válido, e-mails, idempotência por requestId, erro do provedor registrado,
     e só grava em laudos_envios/ e clientes/{k}/logoLaudoTamanho. */
const assert = require('assert/strict');
const LaudoCQ = require('./public/shared/laudo-cq.js');
const LaudoEmail = require('./public/shared/laudo-email.js');
const LaudoPdf = require('./public/shared/laudo-pdf.js');
const S = require('./functions/laudo_email.js');
let n = 0;
const ok = (m) => { n++; console.log('  ok  ' + m); };
const clonar = (v) => JSON.parse(JSON.stringify(v));

(async () => {
  // ── Documento ──
  const base = {produto: 'BODY SPLASH ROSE 200ML', codInterno: 'PRF-BIOF-0006', lote: '26302/01', pesos: [180, 181], conclusao: 'APROVADO'};
  const semLogo = LaudoCQ.paginaProdutoAcabado(base);
  assert.ok(!/laudo-logo/.test(semLogo) && /laudo-topo-org/.test(semLogo));
  ok('sem logos: cabeçalho antigo, sem imagem');

  const soKuryos = LaudoCQ.paginaProdutoAcabado(Object.assign({}, base, {logos: {kuryos: 'kuryos-logo.svg', cliente: ''}}));
  assert.ok(/class="laudo-topo-lado laudo-topo-esq"><img class="laudo-logo-kuryos" src="kuryos-logo.svg"/.test(soKuryos));
  assert.ok(/laudo-topo-dir"><\/div>/.test(soKuryos), 'coluna direita vazia mantém o título centrado');
  assert.ok(!/laudo-logo-cliente/.test(soKuryos));
  ok('logo Kuryos no canto superior esquerdo; sem logo do cliente, a direita fica vazia');

  const comCli = LaudoCQ.paginaProdutoAcabado(Object.assign({}, base, {logos: {kuryos: 'kuryos-logo.svg', cliente: 'https://x/logo"a.png', clientePct: 150, clienteNome: 'BIOFLORA'}}));
  assert.ok(/laudo-logo-cliente" src="https:\/\/x\/logo&quot;a.png" alt="BIOFLORA" style="max-height:21.0mm;max-width:45.0mm"/.test(comCli), comCli.slice(0, 900));
  ok('logo do cliente à direita, escapado, no tamanho escolhido (150% = 21 mm)');

  assert.equal(LaudoCQ.logoClientePct(300), 200);
  assert.equal(LaudoCQ.logoClientePct(10), 50);
  assert.equal(LaudoCQ.logoClientePct(''), 100);
  assert.equal(LaudoCQ.logoClientePct('abc'), 100);
  ok('tamanho do logo do cliente limitado a 50–200%, vazio = 100%');

  // ── Destinatários ──
  const cliente = {nome: 'BIOFLORA', contatosVersao: 1, contatos: {
    a: {nome: 'Ana', email: 'Ana@Bioflora.com.br', areas: ['TECNICO'], principais: ['TECNICO']},
    b: {nome: 'Bruno', email: 'fin@bioflora.com.br', areas: ['FINANCEIRO'], principais: []},
    c: {nome: 'Carla', email: 'ana@bioflora.com.br', areas: ['COMERCIAL'], principais: []},
    d: {nome: 'Sem email', telefone: '11 9999', areas: ['COMPRAS'], principais: []}}};
  const cs = LaudoEmail.contatosDoCliente(cliente);
  assert.deepEqual(cs.map((c) => [c.email, c.marcado]), [['ana@bioflora.com.br', true], ['fin@bioflora.com.br', false]]);
  ok('contatos com e-mail, sem repetição; Técnico/Comercial/Compras marcados, Financeiro não');

  const soFin = LaudoEmail.contatosDoCliente({contatosVersao: 1, contatos: {b: {nome: 'B', email: 'fin@x.com', areas: ['FINANCEIRO'], principais: []}}});
  assert.equal(soFin[0].marcado, true);
  const legado = LaudoEmail.contatosDoCliente({contatoComNome: 'Leg', contatoComEmail: 'leg@x.com'});
  assert.deepEqual(legado.map((c) => c.email), ['leg@x.com']);
  ok('nenhum da área do laudo: todos marcados; cadastro antigo (contatoComEmail) também aparece');

  assert.deepEqual(LaudoEmail.destinatarios(['a@x.com'], 'B@y.com; a@x.com, c@z.com.br'), {para: ['a@x.com', 'b@y.com', 'c@z.com.br'], erro: null});
  assert.match(LaudoEmail.destinatarios(['a@x.com'], 'quebrado@').erro, /quebrado@/);
  assert.match(LaudoEmail.destinatarios([], '').erro, /ao menos um/);
  const muitos = Array.from({length: 16}, (_, i) => 'p' + i + '@x.com');
  assert.match(LaudoEmail.destinatarios(muitos, '').erro, /No máximo 15/);
  ok('extras separados por vírgula/;, minúsculas, sem repetição; inválido, vazio e > 15 recusados');

  assert.equal(LaudoEmail.conclusao('LIBERADO_EXPEDICAO'), 'APROVADO');
  assert.equal(LaudoEmail.conclusao('REPROVADO'), 'REPROVADO');
  assert.equal(LaudoEmail.conclusao('RETIDO'), null);
  assert.equal(LaudoEmail.conclusao(undefined), null);
  ok('"Encaminhar" só com laudo concluído (aprovado/reprovado), nunca retido ou sem decisão');

  // ── Corte de folha ──
  const linhas = Array.from({length: 40}, (_, i) => ({topo: i * 30, base: i * 30 + 30}));
  const cortes = LaudoPdf.pontosDeCorte(linhas, 1200, 1000);
  assert.deepEqual(cortes, [990, 1200]);
  ok('corte recua para o início da linha que cruzaria o fim da folha');
  const aninhado = [{topo: 950, base: 1050}, {topo: 900, base: 1000.4}, {topo: 960, base: 1040}];
  assert.deepEqual(LaudoPdf.pontosDeCorte(aninhado, 1500, 1000), [900, 1500]);
  ok('blocos sobrepostos: recua até não partir nenhum (950 partiria o de 900–1000)');
  assert.deepEqual(LaudoPdf.pontosDeCorte([{topo: 10, base: 2500}], 2500, 1000), [1000, 2000, 2500]);
  ok('bloco maior que a folha é cortado no limite (sem laço infinito)');
  assert.deepEqual(LaudoPdf.pontosDeCorte([], 800, 1000), [800]);
  ok('documento que cabe numa folha: uma folha só');

  // ── Serviço ──
  function bancoFalso(inicial) {
    const raiz = clonar(inicial || {});
    const gravados = [];
    const partes = (p) => String(p || '').split('/').filter(Boolean);
    const ler = (p) => partes(p).reduce((o, k) => (o == null ? undefined : o[k]), raiz);
    const gravar = (p, v) => {
      gravados.push(partes(p).join('/'));
      const ks = partes(p); let o = raiz;
      ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
      if (v == null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = clonar(v);
    };
    const snap = (p) => { const v = ler(p); return {val: () => (v === undefined ? null : clonar(v)), exists: () => v != null}; };
    const ref = (p) => ({
      once: async () => snap(p), set: async (v) => gravar(p, v),
      transaction: async (fn) => {
        let r = fn(null);
        const atual = snap(p).val();
        if (atual != null || r === undefined) r = fn(atual);
        if (r !== undefined) gravar(p, r);
        return {committed: r !== undefined, snapshot: snap(p)};
      },
    });
    return {ref, raiz, gravados};
  }
  const PDF = Buffer.concat([Buffer.from('%PDF-1.3\n'), Buffer.alloc(400, 32)]).toString('base64');
  const inicial = {
    usuarios: {
      q: {nome: 'Qualidade Q', role: 'qualidade'},
      multi: {nome: 'Yasmin', role: 'comercial', funcoes: {qualidade: true}},
      mod: {nome: 'Mod', role: 'pcp', modulos: {qualidade: true}},
      adm: {nome: 'ADM', role: 'admin'},
      pcp: {nome: 'PCP', role: 'pcp'},
      off: {nome: 'Off', role: 'qualidade', desativado: true},
    },
    produtos: {p1: {sku: 'PRF-BIOF-0006', clienteKey: 'BIOF'}},
    clientes: {BIOF: {nome: 'BIOFLORA', logoEtiquetaUrl: 'https://x/l.png'}},
    estoque_lotes: {
      'PRF-BIOF-0006': {
        L1: {itemTipo: 'produto', itemCodigo: 'PRF-BIOF-0006', itemNome: 'BODY SPLASH ROSE', loteOrigem: '26302/01', qualidade: {decisao: 'LIBERADO_EXPEDICAO'}},
        L2: {itemTipo: 'produto', itemCodigo: 'PRF-BIOF-0006', loteOrigem: '26302/02', qualidade: {decisao: 'RETIDO'}},
        L3: {itemTipo: 'produto', itemCodigo: 'PRF-BIOF-0006', loteOrigem: '26302/03'},
      },
      'MP-0001': {M1: {itemTipo: 'material', qualidade: {decisao: 'LIBERADO'}}},
    },
    ops: {o1: {lote: '26302/01', qtd: 1460}},
  };
  const enviados = [];
  const db = bancoFalso(inicial);
  const antes = clonar(db.raiz);
  let falhar = false;
  const servico = S.criarServico({db, agora: () => '2026-11-17T15:00:00.000Z',
    enviarEmail: async (para, assunto, corpo, opts) => {
      if (falhar) throw new Error('provedor fora');
      enviados.push({para, assunto, corpo, opts});
      return true;
    }});
  const pedido = (extra) => Object.assign({itemKey: 'PRF-BIOF-0006', loteKey: 'L1', requestId: 'le_req_000001', para: ['ana@bioflora.com.br', 'B@Y.com'],
    pdfBase64: PDF, nomeArquivo: 'Relatório de análise - BODY SPLASH ROSE - 26302.01', clienteNome: 'BIOFLORA', logoTamanho: 140}, extra || {});
  const recusa = async (uid, d, re) => { await assert.rejects(() => servico.executar(uid, d), re); };

  await recusa('pcp', pedido(), (e) => e.code === 'permission-denied');
  await recusa('off', pedido(), (e) => e.code === 'permission-denied');
  await recusa('ninguem', pedido(), (e) => e.code === 'permission-denied');
  ok('PCP sem Qualidade, perfil desativado e usuário inexistente recusados');

  await recusa('q', pedido({loteKey: 'L2'}), (e) => e.code === 'failed-precondition' && /Conclua/.test(e.message));
  await recusa('q', pedido({loteKey: 'L3'}), (e) => e.code === 'failed-precondition');
  await recusa('q', pedido({itemKey: 'MP-0001', loteKey: 'M1'}), (e) => /produto acabado/.test(e.message));
  await recusa('q', pedido({loteKey: 'NAO'}), (e) => e.code === 'not-found');
  ok('laudo retido, sem decisão, de matéria-prima ou lote inexistente: não sai');

  await recusa('q', pedido({pdfBase64: Buffer.from('<html>oi</html>'.repeat(20)).toString('base64')}), /não é um PDF/);
  await recusa('q', pedido({pdfBase64: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(6 * 1024 * 1024 + 10)]).toString('base64')}), /6 MB/);
  await recusa('q', pedido({para: ['ok@x.com', 'ruim']}), /E-mail inválido/);
  await recusa('q', pedido({para: []}), /ao menos um/);
  await recusa('q', pedido({itemKey: 'a/b'}), (e) => e.code === 'invalid-argument');
  await recusa('q', pedido({requestId: 'x'}), (e) => e.code === 'invalid-argument');
  ok('anexo que não é PDF, PDF > 6 MB, e-mail inválido, sem destinatário e chaves inválidas recusados');
  assert.equal(enviados.length, 0);
  assert.deepEqual(db.raiz, antes);
  ok('nenhuma recusa envia e-mail nem grava nada');

  const r = await servico.executar('multi', pedido());
  assert.equal(r.status, 'ENVIADO');
  assert.equal(enviados.length, 1);
  const e1 = enviados[0];
  assert.deepEqual(e1.para, ['ana@bioflora.com.br', 'b@y.com']);
  assert.match(e1.assunto, /Relatório de Análise – BODY SPLASH ROSE – Lote 26302\/01/);
  assert.match(e1.corpo, /Produto APROVADO/);
  assert.match(e1.corpo, /Prezados da BIOFLORA/);
  assert.equal(e1.opts.anexos[0].nome, 'Relatório de análise - BODY SPLASH ROSE - 26302.01.pdf');
  assert.equal(e1.opts.anexos[0].tipo, 'application/pdf');
  assert.ok(Buffer.isBuffer(e1.opts.anexos[0].conteudo) && e1.opts.anexos[0].conteudo.slice(0, 5).toString() === '%PDF-');
  ok('multi-função com Qualidade envia: destinatários, assunto, conclusão e PDF anexado');

  const reg = db.raiz.laudos_envios['PRF-BIOF-0006'].L1.le_req_000001;
  assert.equal(reg.status, 'ENVIADO');
  assert.equal(reg.por, 'Yasmin');
  assert.deepEqual(reg.para, ['ana@bioflora.com.br', 'b@y.com']);
  assert.equal(reg.decisao, 'LIBERADO_EXPEDICAO');
  assert.equal(db.raiz.clientes.BIOF.logoLaudoTamanho, 140);
  ok('envio registrado em laudos_envios (quem, para quem, decisão) e tamanho do logo guardado no cliente');

  const rep = await servico.executar('multi', pedido());
  assert.equal(rep.repetido, true);
  assert.equal(enviados.length, 1);
  ok('mesmo requestId (clique duplo / repetição) não envia de novo');

  await servico.executar('mod', pedido({requestId: 'le_req_000002', logoTamanho: 100}));
  assert.equal(db.raiz.clientes.BIOF.logoLaudoTamanho, undefined);
  await servico.executar('adm', pedido({requestId: 'le_req_000003', logoTamanho: null}));
  assert.equal(enviados.length, 3);
  ok('módulo Qualidade e ADM enviam; logo em 100% volta ao padrão (campo apagado)');

  falhar = true;
  await recusa('q', pedido({requestId: 'le_req_000004'}), (e) => e.code === 'internal' && /provedor fora/.test(e.message));
  const regErro = db.raiz.laudos_envios['PRF-BIOF-0006'].L1.le_req_000004;
  assert.equal(regErro.status, 'ERRO');
  assert.match(regErro.erro, /provedor fora/);
  ok('falha do provedor: erro devolvido à tela e registrado como ERRO');

  const permitidos = /^(laudos_envios\/PRF-BIOF-0006\/L1\/le_req_\d+|clientes\/BIOF\/logoLaudoTamanho)$/;
  const fora = db.gravados.filter((p) => !permitidos.test(p));
  assert.deepEqual(fora, []);
  const semEnvios = clonar(db.raiz); delete semEnvios.laudos_envios; delete semEnvios.clientes.BIOF.logoLaudoTamanho;
  const ref = clonar(antes); delete ref.clientes.BIOF.logoLaudoTamanho;
  assert.deepEqual(semEnvios, ref);
  ok('não interferência: laudo, lote, estoque, OP e usuários idênticos; só laudos_envios e o tamanho do logo mudam');

  const html = S.montarEmail({produto: '<b>x</b>', lote: '1', cliente: 'A&B', mensagem: 'linha <i>'}).corpo;
  assert.ok(!/<b>x<\/b>|<i>/.test(html) && /&lt;b&gt;x/.test(html) && /A&amp;B/.test(html));
  ok('texto do e-mail escapa produto, cliente e mensagem');

  console.log('\n' + n + ' verificações OK');
})().catch((e) => { console.error(e); process.exit(1); });
