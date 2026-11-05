'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('public/shared/utils.js','utf8');
const start=source.indexOf('function nextSequential('),end=source.indexOf('// Ordenação clicável',start);
const {nextSequential}=vm.runInNewContext(source.slice(start,end)+'\n;({nextSequential})');
function fake(counter,records,options={}) {
  let value=counter,queue=Promise.resolve();
  return {get value(){return value;},ref(path){return {
    once:async()=>{if(options.denied)throw Error('permission_denied');return{val:()=>records};},
    transaction:update=>{
      const task=queue.then(()=>{
        const n=update(value);
        if(options.aborted)return {committed:false,snapshot:{val:()=>null}};
        value=n;return{committed:true,snapshot:{val:()=>n}};
      });
      queue=task.catch(()=>{});return task;
    }
  };}};
}
(async()=>{
  for (const [key,prefix,old,max] of [['pedidoCompra','PC',19,81],['solicitacaoCompra','SC',10,39],['processoCotacao','COT',14,44]]) {
    const db=fake(old,{a:{numero:20},b:{numeroFormatado:prefix+'-'+String(max).padStart(4,'0')}});
    const result=await nextSequential(db,'config/contadores/'+key,prefix,4);
    assert.equal(result.numero,max+1);
    assert.equal(db.value,max+1);
  }
  const db=fake(19,{a:{numero:81}});
  const results=await Promise.all(Array.from({length:12},()=>nextSequential(db,'config/contadores/pedidoCompra','PC',4)));
  assert.equal(new Set(results.map(r=>r.numero)).size,12);
  assert.equal(Math.min(...results.map(r=>r.numero)),82);
  assert.equal(db.value,93);
  await assert.rejects(nextSequential(fake('19',{}),'config/contadores/pedidoCompra','PC'),/Contador inválido/);
  await assert.rejects(nextSequential(fake(19,{}, {denied:true}),'config/contadores/pedidoCompra','PC'),/permission_denied/);
  await assert.rejects(nextSequential(fake(19,{}, {aborted:true}),'config/contadores/pedidoCompra','PC'),/Não foi possível reservar/);
  const ahead=fake(100,{a:{numero:81}});
  assert.equal((await nextSequential(ahead,'config/contadores/pedidoCompra','PC')).numero,101);
  const other=fake(null,{});
  assert.equal((await nextSequential(other,'config/contadores/outro','X')).formatado,'X-0001');
  console.log('Contadores: piso histórico PC/SC/COT, 12 reservas concorrentes, erro fechado, contador adiantado e fluxo genérico OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
