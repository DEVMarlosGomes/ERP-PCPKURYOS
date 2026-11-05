'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html=fs.readFileSync('public/usuarios.html','utf8');
const logic=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('const gerenciarUsuarioServidor'));
const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {
    for(const viewport of [{width:1200,height:900},{width:390,height:844}]) {
      const page=await browser.newPage({viewport});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.hostname!=='app.test')return route.fulfill({body:'',contentType:'text/javascript'});
        if(url.pathname==='/usuarios')return route.fulfill({body:markup,contentType:'text/html'});
        const file='public'+url.pathname;
        return route.fulfill({body:fs.existsSync(file)?fs.readFileSync(file):'',contentType:file.endsWith('.css')?'text/css':'text/javascript'});
      });
      await page.goto('https://app.test/usuarios');
      await page.evaluate(()=>{
        const users={adm:{nome:'Admin sintético',email:'admin@example.test',role:'admin'},op:{nome:'Operador sintético',email:'operator@example.test',role:'production'}};
        window.__calls=[];window.__toasts=[];window.__links=[];window.__linked=false;
        window.currentUser={uid:'adm',role:'admin'};
        window.escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        window.showToast=s=>__toasts.push(s);
        window.KURYOS_MODULOS={cadastros:{rotulo:'Cadastros',desc:'Dados mestres'},manipulacao:{rotulo:'Manipulação',desc:'Bulk'},rotulagem:{rotulo:'Rotulagem',desc:'Rótulos'}};
        window.funcoesDoUsuario=u=>Object.keys(u.funcoes || {[u.role]:true}).filter(k=>(u.funcoes || {[u.role]:true})[k]);
        window.modulosDoUsuario=()=>['cadastros'];window.modulosPadraoDasFuncoes=()=>['cadastros'];
        const auth={currentUser:{uid:'adm'},onAuthStateChanged:cb=>queueMicrotask(()=>cb({uid:'adm'})),sendPasswordResetEmail:async email=>{__links.push(email);}};
        window.firebase={auth:()=>auth,database:()=>({ref:path=>({path})}),functions:()=>({httpsCallable:()=>async payload=>{
          __calls.push(payload);
          if(payload.acao==='diagnosticar')return{data:{ok:true,vinculo:__linked?'OK':'SEM_LOGIN'}};
          if(payload.acao==='regularizar_login'){
            __linked=true;return{data:{ok:true,uid:'op',email:users.op.email}};
          }
          return {data:{ok:true}};
        }})};
        window.dbOnValue=(ref,cb)=>queueMicrotask(()=>cb({val:()=>ref.path==='usuarios'?users:users.adm}));
      });
      await page.addScriptTag({content:logic});
      await page.waitForFunction(()=>document.querySelectorAll('#users-tbody tr').length===2);
      await page.evaluate(()=>abrirEdicao('op'));
      assert.equal(await page.locator('#editRegularizarLogin').isVisible(),false);
      await page.locator('#editVerificarLogin').click();
      await page.waitForFunction(()=>!document.getElementById('editRegularizarLogin').hidden);
      assert.match(await page.locator('#editVinculoStatus').innerText(),/não tem login/);
      page.once('dialog',d=>d.accept('operator@example.test'));
      await page.locator('#editRegularizarLogin').click();
      await page.waitForFunction(()=>window.__links.length===1);
      assert.equal(await page.evaluate(()=>__calls.filter(c=>c.acao==='regularizar_login').length),1);
      assert.equal(await page.evaluate(()=>__calls.find(c=>c.acao==='regularizar_login').uid),'op');
      await page.screenshot({path:'scratch/usuarios-recovery-'+viewport.width+'.png',fullPage:true});
      const box=await page.locator('#modalEditBg .modal').boundingBox();
      assert.ok(box.width<=viewport.width,'modal cabe na largura disponível');
      await page.evaluate(()=>{fecharEdicao();abrirModulos('op');document.querySelectorAll('#modLista input').forEach(c=>c.checked=false);});
      await page.locator('#modSalvar').click();
      await page.waitForFunction(()=>/sem nenhum módulo/.test(document.getElementById('toast').textContent));
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log('Usuários UI: verificar/regularizar preserva UID, envio simulado, contagem zero, desktop/mobile e nenhum erro JS OK');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
