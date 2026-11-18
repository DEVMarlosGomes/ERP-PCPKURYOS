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
  once() { return Promise.resolve(new Snap(ler(this.db.data, this.path))); }
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
class FakeDb { constructor(data) { this.data = clone(data); this.seq = 0; } ref(path) { return new Ref(this, path); } }

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
  assert.deepEqual(colunas.NOVO.map((x) => x.id), ['a','b']);
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
    off:{nome:'Desativado',email:'off@kuryos.com.br',role:'pcp',desativado:true},
  }});
  const emails = [];
  let minuto = 0;
  const servico = S.criarServico({
    db,
    agora: () => new Date(Date.UTC(2026,10,13,12,minuto++)).toISOString(),
    obterAnexo: async (path) => ({size:path.endsWith('b.webp')?2048:1024,contentType:path.endsWith('b.webp')?'image/webp':'image/png',originalName:path.endsWith('b.webp')?'segundo.webp':'primeiro.png'}),
    enviarEmail: async (para, assunto) => { emails.push({para,assunto}); return true; },
  });
  const requestId = 'req_123456789012345';
  const reserva = await servico.executar('u1',{acao:'RESERVAR',requestId});
  assert.ok(reserva.id);
  const criado = await servico.executar('u1',{acao:'CRIAR',requestId,tipo:'ERRO',impacto:'ALTO',titulo:'Não consigo confirmar a amostra',descricao:'Ao confirmar a amostra, o botão carrega e nada acontece.',contexto:{pagina:'cadastros.html',url:'https://kuryoserp.com.br/cadastros.html?tab=amostras'},anexos:[
    {caminho:`chamados/u1/${reserva.id}/a.png`},{caminho:`chamados/u1/${reserva.id}/b.webp`},
  ]});
  assert.equal(criado.codigo,'CH-00001');
  assert.equal(ler(db.data,`chamados/${reserva.id}/status`),'NOVO');
  assert.equal(Object.keys(ler(db.data,`chamados/${reserva.id}/anexos`)).length,2);
  assert.equal(ler(db.data,`chamados/${reserva.id}/contexto/pagina`),'cadastros.html');
  assert.equal(emails.length,1);
  const repetido = await servico.executar('u1',{acao:'CRIAR',requestId});
  assert.equal(repetido.repetida,true);
  assert.equal(ler(db.data,'config/contadores/chamados'),1,'retry não consome outro número');
  ok('usuário ativo reserva, envia prints validados e cria chamado idempotente numerado');

  const meus = await servico.executar('u1',{acao:'LISTAR',visao:'MEUS'});
  assert.equal(meus.itens.length,1); assert.equal(meus.admin,false);
  assert.equal((await servico.executar('u2',{acao:'LISTAR',visao:'MEUS'})).itens.length,0);
  await rejeita(servico.executar('u2',{acao:'DETALHE',id:reserva.id}),'permission-denied');
  await rejeita(servico.executar('u1',{acao:'LISTAR',visao:'QUADRO'}),'permission-denied');
  await rejeita(servico.executar('off',{acao:'LISTAR',visao:'MEUS'}),'permission-denied');
  const quadro = await servico.executar('adm',{acao:'LISTAR',visao:'QUADRO'});
  assert.equal(quadro.itens.length,1); assert.equal(quadro.admin,true);
  ok('autor só vê os seus, terceiro não abre, inativo é recusado e ADM vê o quadro');

  await servico.executar('adm',{acao:'TRIAR',id:reserva.id,prioridade:'P0',responsavel:'Equipe ERP'});
  await servico.executar('adm',{acao:'MOVER',id:reserva.id,status:'EM_ANDAMENTO'});
  await servico.executar('adm',{acao:'COMENTAR',id:reserva.id,texto:'Correção aplicada; falta validar.'});
  await servico.executar('adm',{acao:'MOVER',id:reserva.id,status:'VALIDAR'});
  assert.equal(ler(db.data,`chamados/${reserva.id}/aguardandoRespostaDe`),'AUTOR');
  await rejeita(servico.executar('u2',{acao:'CONFIRMAR',id:reserva.id}),'permission-denied');
  await servico.executar('u1',{acao:'CONFIRMAR',id:reserva.id,texto:'Agora funcionou.'});
  assert.equal(ler(db.data,`chamados/${reserva.id}/status`),'CONCLUIDO');
  assert.equal(ler(db.data,`chamados_caixa/u1/${reserva.id}/status`),'CONCLUIDO');
  assert.ok(Object.keys(ler(db.data,`chamados/${reserva.id}/historico`)).length >= 6);
  ok('ADM tria, move e comenta; somente o autor valida e toda mudança fica no histórico');

  console.log('OK run_chamados_test.js: '+n+' grupos.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
