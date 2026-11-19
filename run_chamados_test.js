'use strict';
const assert = require('assert/strict');
const S = require('./functions/chamados.js');
const C = require('./public/shared/chamados.js');

function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function partes(path) { return String(path || '').split('/').filter(Boolean); }
function ler(root, path) { return partes(path).reduce((v, k) => v == null ? undefined : v[k], root); }
function gravar(root, path, value) {
  const ps = partes(path); if (!ps.length) throw new Error('raiz não pode receber set no fake');
  let no = root; ps.slice(0, -1).forEach((k) => { if (!no[k] || typeof no[k] !== 'object') no[k] = {}; no = no[k]; });
  if (value === null) delete no[ps[ps.length - 1]]; else no[ps[ps.length - 1]] = clone(value);
}
class Snap {
  constructor(v) { this.v = clone(v); }
  val() { return clone(this.v); }
  exists() { return this.v !== undefined && this.v !== null; }
}
class Ref {
  constructor(db, path) { this.db = db; this.path = path || ''; }
  child(path) { return new Ref(this.db, [this.path, path].filter(Boolean).join('/')); }
  push() { return new Ref(this.db, [this.path, 'k' + (++this.db.seq)].filter(Boolean).join('/')); }
  get key() { return partes(this.path).slice(-1)[0] || null; }
  once() { this.db.leituras.push(this.path); return Promise.resolve(new Snap(ler(this.db.data, this.path))); }
  get() { return this.once(); }
  set(value) { gravar(this.db.data, this.path, value); return Promise.resolve(); }
  update(updates) {
    Object.keys(updates || {}).forEach((p) => gravar(this.db.data, this.path ? this.path + '/' + p : p, updates[p]));
    return Promise.resolve();
  }
  transaction(fn) {
    const atual = clone(ler(this.db.data, this.path));
    const novo = fn(atual === undefined ? null : atual);
    if (novo === undefined) return Promise.resolve({committed: false, snapshot: new Snap(atual)});
    gravar(this.db.data, this.path, novo);
    return Promise.resolve({committed: true, snapshot: new Snap(novo)});
  }
}
class FakeDb { constructor(data) { this.data = clone(data); this.seq = 0; this.leituras = []; } ref(path) { return new Ref(this, path); } }

let n = 0;
function ok(label) { n++; console.log('  ok  ' + label); }
async function rejeita(p, code) { await assert.rejects(p, (e) => e && e.code === code); }

(async function() {
  assert.equal(C.validarArquivo({name:'tela.png',size:800,type:'image/png'}), '');
  assert.match(C.validarArquivo({name:'tela.svg',size:800,type:'image/svg+xml'}), /PNG/);
  assert.match(C.validarArquivo({name:'tela.jpg',size:11*1024*1024,type:'image/jpeg'}), /10 MB/);
  assert.equal(C.caminhoAnexo('u_1','abc-2',{name:'Tela login #1.png'},0,100), 'chamados/u_1/abc-2/100_0_Tela_login__1.png');
  assert.equal(C.validarFormulario({tipo:'ERRO',impacto:'ALTO',titulo:'Não salva',descricao:'Ao confirmar, a tela volta vazia.'}, []).ok, true);
  assert.equal(C.validarFormulario({tipo:'',impacto:'',titulo:'x',descricao:'x'}, []).ok, false);
  const colunas = C.porStatus([{id:'b',status:'NOVO',prioridade:'P2'},{id:'a',status:'NOVO',prioridade:'P0'},{id:'c',status:'VALIDAR',prioridade:'P3'}]);
  assert.deepEqual(colunas.NOVO.map((x) => x.id), ['a','b'], 'P0 (urgente) antes de P2 — o motor antigo tratava P0 como 9');
  // Ordem dada no quadro vem antes da prioridade; o resto segue a prioridade.
  const fila = C.porStatus([{id:'x',status:'NA_FILA',prioridade:'P0'},{id:'y',status:'NA_FILA',prioridade:'P3',ordem:2000},{id:'z',status:'NA_FILA',prioridade:'P2',ordem:1000}]).NA_FILA;
  assert.deepEqual(fila.map((x) => x.id), ['z','y','x'], 'posicionados primeiro, na ordem do quadro');
  assert.equal(C.ordemParaSoltar(fila.filter((x) => x.id !== 'x'), 'y'), 1500, 'soltar sobre y entra entre z e y');
  assert.equal(C.ordemParaSoltar(fila.filter((x) => x.id !== 'x'), 'z'), 0, 'soltar sobre o primeiro vai para o topo');
  assert.equal(C.ordemParaSoltar(fila.filter((x) => x.id !== 'x'), null), 3000, 'soltar no vazio vai para o fim');
  assert.equal(C.ordemParaSoltar([], null), 1000, 'coluna vazia');
  assert.equal(C.ROTULO_PRIORIDADE.P0, 'Urgente');
  assert.equal(C.duracao(90 * 60000), '1,5 h');
  const roadmapMotor = C.itensRoadmap({geradoEm:'2026-11-19T10:00:00Z',secoes:[{letra:'A',titulo:'Código',itens:[{id:'abcdef1234',texto:'Integrar a fila',grupo:'Help Desk',feito:false,subitens:[],extras:{}}]}]}, {abcdef1234:{status:'EM_ANDAMENTO',ordem:42,chamados:{c1:{codigo:'CH-1'}}}});
  assert.equal(roadmapMotor[0].status,'EM_ANDAMENTO'); assert.equal(roadmapMotor[0].ordem,42); assert.equal(roadmapMotor[0].fonte,'ROADMAP');
  ok('motor da tela valida arquivos/formulário, cria caminho seguro e ordena o quadro');

  assert.equal(S.prioridadeDoImpacto('CRITICO'), 'P0');
  assert.equal(S.caminhoPermitido('u','id','chamados/u/id/1_print.png'), true);
  assert.equal(S.caminhoPermitido('u','id','chamados/outro/id/1_print.png'), false);
  assert.throws(() => S.validarCriacao({tipo:'ERRO',impacto:'ALTO',titulo:'curto',descricao:'muito curta'}), (e) => e.code === 'invalid-argument');
  await rejeita(S.validarAnexos('u','id',[{caminho:'chamados/u/id/x.png'},{caminho:'chamados/u/id/x.png'}], async () => ({size:1,contentType:'image/png'})), 'invalid-argument');
  ok('servidor rejeita criação curta, caminho de outro usuário e print duplicado');

  const db = new FakeDb({usuarios:{
    u1:{nome:'Yasmin',email:'yasmin@kuryos.com.br',role:'pd'},
    u2:{nome:'Outro',email:'outro@kuryos.com.br',role:'pcp'},
    adm:{nome:'Administrador',email:'adm@kuryos.com.br',role:'admin'},
    adm2:{nome:'Beatriz Suporte',email:'beatriz@kuryos.com.br',role:'admin'},
    admOff:{nome:'Admin Inativo',email:'inativo@kuryos.com.br',role:'admin',desativado:true},
    gest:{nome:'Líder',email:'lider@kuryos.com.br',role:'gestor'},
    off:{nome:'Desativado',email:'off@kuryos.com.br',role:'pcp',desativado:true},
  }});
  const emails = [];
  let minuto = 0;
  const servico = S.criarServico({
    db,
    agora: () => new Date(Date.UTC(2026,10,13,12,minuto++)).toISOString(),
    obterAnexo: async (path) => ({size:path.endsWith('b.webp')?2048:1024,contentType:path.endsWith('b.webp')?'image/webp':'image/png',originalName:path.endsWith('b.webp')?'segundo.webp':'primeiro.png'}),
    enviarEmail: async (para, assunto) => { emails.push({para,assunto}); return true; },
    versao: '65038e6abc',
  });
  const requestId = 'req_123456789012345';
  const reserva = await servico.executar('u1',{acao:'RESERVAR',requestId});
  assert.ok(reserva.id);
  const criado = await servico.executar('u1',{acao:'CRIAR',requestId,tipo:'ERRO',impacto:'ALTO',titulo:'Não consigo confirmar a amostra',descricao:'Ao confirmar a amostra, o botão carrega e nada acontece.',contexto:{pagina:'cadastros.html',url:'https://kuryoserp.com.br/cadastros.html?tab=amostras',erroJavaScript:{mensagem:'Cannot read properties of undefined',arquivo:'cadastros.js',linha:77,pilha:'TypeError: teste'}},anexos:[
    {caminho:`chamados/u1/${reserva.id}/a.png`},{caminho:`chamados/u1/${reserva.id}/b.webp`},
  ]});
  assert.equal(criado.codigo,'CH-00001');
  assert.equal(ler(db.data,`chamados/${reserva.id}/status`),'NOVO');
  assert.equal(Object.keys(ler(db.data,`chamados/${reserva.id}/anexos`)).length,2);
  assert.equal(ler(db.data,`chamados/${reserva.id}/contexto/pagina`),'cadastros.html');
  assert.equal(ler(db.data,`chamados/${reserva.id}/contexto/erroJavaScript/linha`),77,'erro JavaScript recente anexado ao contexto');
  assert.equal(ler(db.data,`chamados/${reserva.id}/setor`),'PD','setor capturado do perfil na abertura');
  assert.equal(typeof ler(db.data,`chamados/${reserva.id}/ordem`),'number','chamado novo já nasce posicionado no quadro');
  assert.equal(emails.length,1);
  assert.equal(ler(db.data,`chamados/${reserva.id}/contexto/versao`),'65038e6abc','versão publicada gravada no chamado');
  assert.equal(ler(db.data,`chamados_fila_adm/${reserva.id}/aguardaAdm`),true,'novo chamado conta no menu do ADM');
  assert.equal(ler(db.data,`chamados_caixa/u1/${reserva.id}/aguardaVoce`),false,'e não conta no menu do autor');
  const repetido = await servico.executar('u1',{acao:'CRIAR',requestId});
  assert.equal(repetido.repetida,true);
  assert.equal(ler(db.data,'config/contadores/chamados'),1,'retry não consome outro número');
  ok('usuário ativo reserva, envia prints validados e cria chamado idempotente numerado');

  // Simula a fila produzida antes de ela carregar o resumo completo. A primeira
  // listagem do quadro deve hidratá-la lendo apenas este chamado específico.
  db.data.chamados_fila_adm[reserva.id] = {codigo:'CH-00001',titulo:'Não consigo confirmar a amostra',status:'NOVO',prioridade:'P1',aguardaAdm:true,atualizadaEm:ler(db.data,`chamados/${reserva.id}/atualizadaEm`)};
  db.leituras = [];
  const meus = await servico.executar('u1',{acao:'LISTAR',visao:'MEUS'});
  assert.equal(meus.itens.length,1); assert.equal(meus.admin,false);
  assert.equal((await servico.executar('u2',{acao:'LISTAR',visao:'MEUS'})).itens.length,0);
  await rejeita(servico.executar('u2',{acao:'DETALHE',id:reserva.id}),'permission-denied');
  await rejeita(servico.executar('u1',{acao:'LISTAR',visao:'QUADRO'}),'permission-denied');
  await rejeita(servico.executar('u2',{acao:'LISTAR',visao:'GESTAO'}),'permission-denied');
  await rejeita(servico.executar('off',{acao:'LISTAR',visao:'MEUS'}),'permission-denied');
  const quadro = await servico.executar('adm',{acao:'LISTAR',visao:'QUADRO'});
  assert.equal(quadro.itens.length,1); assert.equal(quadro.admin,true);
  assert.equal(ler(db.data,`chamados_fila_adm/${reserva.id}/tipo`),'ERRO','fila legada hidratada com resumo completo');
  assert.deepEqual(quadro.responsaveis.map((p) => p.uid),['adm','adm2'],'somente administradores ativos podem ser responsáveis');
  const gestaoAberta = await servico.executar('gest',{acao:'LISTAR',visao:'GESTAO'});
  assert.equal(gestaoAberta.itens.length,1); assert.equal(gestaoAberta.gestor,true); assert.equal(gestaoAberta.admin,false);
  assert.equal((await servico.executar('gest',{acao:'DETALHE',id:reserva.id})).gestor,true);
  await rejeita(servico.executar('gest',{acao:'TRIAR',id:reserva.id,prioridade:'P1'}),'permission-denied');
  assert.ok(db.leituras.includes('chamados_caixa/u1') && db.leituras.includes('chamados_fila_adm'),'LISTAR usa os índices por caixa e fila');
  assert.ok(!db.leituras.includes('chamados'),'LISTAR não lê o nó inteiro de chamados');
  ok('autor só vê os seus, terceiro não abre, inativo é recusado e ADM vê o quadro');

  await rejeita(servico.executar('u1',{acao:'ROADMAP_SINCRONIZAR',itens:[{id:'abcdef1234',feito:false}]}),'permission-denied');
  const sinc = await servico.executar('adm',{acao:'ROADMAP_SINCRONIZAR',itens:[{id:'abcdef1234',feito:false},{id:'1234567890',feito:true}]});
  assert.equal(sinc.roadmapEstado.abcdef1234.status,'NA_FILA');
  assert.equal(sinc.roadmapEstado['1234567890'].status,'CONCLUIDO');
  await servico.executar('adm',{acao:'ROADMAP_MOVER',id:'abcdef1234',status:'EM_ANDAMENTO',ordem:250});
  assert.equal(ler(db.data,'chamados_roadmap/abcdef1234/ordem'),250);
  await servico.executar('adm',{acao:'ROADMAP_VINCULAR',id:reserva.id,roadmapId:'abcdef1234'});
  assert.equal(ler(db.data,`chamados/${reserva.id}/roadmapId`),'abcdef1234');
  assert.equal(ler(db.data,`chamados_roadmap/abcdef1234/chamados/${reserva.id}/codigo`),'CH-00001');
  assert.ok(Object.values(ler(db.data,`chamados/${reserva.id}/historico`)).some((e)=>e.tipo==='ROADMAP'));
  ok('Fase 2: ADM sincroniza e ordena o Roadmap e liga o chamado com trilha nos dois lados');

  await rejeita(servico.executar('adm',{acao:'TRIAR',id:reserva.id,prioridade:'P0',responsavelUid:'u2'}),'invalid-argument');
  await rejeita(servico.executar('adm',{acao:'TRIAR',id:reserva.id,prioridade:'P0',responsavelUid:'admOff'}),'invalid-argument');
  await servico.executar('adm',{acao:'TRIAR',id:reserva.id,prioridade:'P0',responsavelUid:'adm2'});
  assert.equal(ler(db.data,`chamados/${reserva.id}/responsavelUid`),'adm2');
  assert.equal(ler(db.data,`chamados/${reserva.id}/responsavel`),'Beatriz Suporte');
  assert.equal(emails.length,1,'triagem não envia e-mail sem mudança de etapa');
  assert.equal(ler(db.data,`chamados/${reserva.id}/metricas/primeiraRespostaEm`),undefined,'triagem interna ainda não conta como resposta');
  await servico.executar('adm',{acao:'MOVER',id:reserva.id,status:'NA_FILA',ordem:1000});
  assert.equal(ler(db.data,`chamados/${reserva.id}/ordem`),1000,'posição na fila gravada');
  assert.ok(ler(db.data,`chamados/${reserva.id}/metricas/tempoPrimeiraRespostaMs`) >= 0,'primeira resposta marcada automaticamente pelo servidor');
  await servico.executar('adm',{acao:'MOVER',id:reserva.id,status:'NA_FILA',ordem:500});
  assert.equal(ler(db.data,`chamados_caixa/u1/${reserva.id}/ordem`),500,'reordenar na mesma coluna');
  assert.equal(emails.length,2,'reordenar na mesma coluna não envia e-mail');
  await rejeita(servico.executar('adm',{acao:'MOVER',id:reserva.id,status:'NA_FILA'}),'invalid-argument');
  await rejeita(servico.executar('adm',{acao:'MOVER',id:reserva.id,status:'NA_FILA',ordem:'abc'}),'invalid-argument');
  await rejeita(servico.executar('u1',{acao:'MOVER',id:reserva.id,status:'CONCLUIDO'}),'permission-denied');
  await servico.executar('adm',{acao:'MOVER',id:reserva.id,status:'EM_ANDAMENTO'});
  assert.equal(ler(db.data,`chamados_roadmap/abcdef1234/chamados/${reserva.id}/status`),'EM_ANDAMENTO','status do chamado reflete no vínculo do Roadmap');
  await rejeita(servico.executar('adm',{acao:'DUPLICADO',id:reserva.id,duplicadoDe:'CH-99999'}),'failed-precondition');
  await rejeita(servico.executar('adm',{acao:'DUPLICADO',id:reserva.id,duplicadoDe:'CH-00001'}),'failed-precondition');
  await servico.executar('adm',{acao:'COMENTAR',id:reserva.id,texto:'Correção aplicada; falta validar.'});
  await servico.executar('adm',{acao:'MOVER',id:reserva.id,status:'VALIDAR'});
  assert.equal(ler(db.data,`chamados/${reserva.id}/aguardandoRespostaDe`),'AUTOR');
  assert.equal(ler(db.data,`chamados_caixa/u1/${reserva.id}/aguardaVoce`),true,'em Validar, conta no menu do autor');
  assert.equal(ler(db.data,`chamados_fila_adm/${reserva.id}/aguardaAdm`),false,'e sai do menu do ADM');
  await rejeita(servico.executar('u2',{acao:'CONFIRMAR',id:reserva.id}),'permission-denied');
  await servico.executar('u1',{acao:'CONFIRMAR',id:reserva.id,texto:'Agora funcionou.'});
  assert.equal(ler(db.data,`chamados/${reserva.id}/status`),'CONCLUIDO');
  assert.ok(ler(db.data,`chamados/${reserva.id}/metricas/tempoConclusaoMs`) >= 0,'conclusão marcada automaticamente pelo servidor');
  assert.equal(ler(db.data,`chamados_caixa/u1/${reserva.id}/status`),'CONCLUIDO');
  assert.ok(Object.keys(ler(db.data,`chamados/${reserva.id}/historico`)).length >= 6);
  assert.equal(ler(db.data,`chamados_caixa/u1/${reserva.id}/aguardaVoce`),false,'concluído não conta mais');
  await rejeita(servico.executar('adm',{acao:'TRIAR',id:reserva.id,prioridade:'P1'}),'failed-precondition');
  ok('ADM tria, move e comenta; somente o autor valida e toda mudança fica no histórico');

  const gestao = await servico.executar('gest',{acao:'LISTAR',visao:'GESTAO'});
  assert.equal(gestao.metricas.geral.total,1);
  assert.equal(gestao.metricas.geral.concluidos,1);
  assert.equal(gestao.metricas.grupos[0].setor,'PD');
  assert.equal(gestao.metricas.grupos[0].tipo,'ERRO');
  assert.ok(gestao.metricas.geral.mediaPrimeiraRespostaMs >= 0 && gestao.metricas.geral.mediaConclusaoMs >= 0);
  ok('Fase 3: Gestor consulta quadro somente leitura e métricas por setor/tipo com marcos automáticos');

  // Ligação: a callable passa a versão publicada e o menu tem Chamados com contador.
  const fs = require('fs'), idx = fs.readFileSync('functions/index.js','utf8'), ac = fs.readFileSync('public/auth_check.js','utf8');
  assert.match(idx, /versao: process\.env\.APP_VERSION \|\| null/);
  assert.match(idx, /exports\.chamadoSistema = onCall/);
  assert.match(ac, /ktLink\('chamados\.html'.*kt-cham-n/);
  assert.match(ac, /chamados\.html\?nova=1/);
  assert.match(ac, /ref\('chamados_caixa\/' \+ user\.uid\)/);
  assert.match(ac, /kuryos-ultimo-erro-js/);
  ok('ligação: versão publicada na callable e Chamados com contador no menu');

  console.log('OK run_chamados_test.js: '+n+' grupos.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
