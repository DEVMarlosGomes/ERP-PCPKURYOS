'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const html=fs.readFileSync('public/usuarios.html','utf8');
const logic=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('const gerenciarUsuarioServidor'));
const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try {for(const width of [1200,390]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>{
      const u=new URL(route.request().url());
      if(u.hostname!=='app.test')return route.fulfill({body:''});
      if(u.pathname==='/usuarios')return route.fulfill({body:markup,contentType:'text/html'});
      const file='public'+u.pathname;
      return route.fulfill({body:fs.existsSync(file)?fs.readFileSync(file):'',contentType:file.endsWith('.css')?'text/css':'text/javascript'});
    });
    await page.goto('https://app.test/usuarios');
    await page.evaluate(()=>{
      const users={adm:{nome:'Admin fictício',email:'admin@example.test',role:'admin'},op:{nome:'Operador fictício',email:'operator@example.test',role:'production'},legacy:{nome:'Histórico fictício',email:'operator@example.test',role:'production'}};
      window.__calls=[];window.__fresh=false;window.__reauth=0;window.__refresh=0;window.__passwords=0;
      window.currentUser={uid:'adm',role:'admin'};
      window.escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      window.KURYOS_MODULOS={cadastros:{rotulo:'Cadastros',desc:'Dados mestres'},manipulacao:{rotulo:'Manipulação',desc:'Bulk'},rotulagem:{rotulo:'Rotulagem',desc:'Rótulos'}};
      window.funcoesDoUsuario=u=>Object.keys(u.funcoes||{[u.role]:true}).filter(k=>(u.funcoes||{[u.role]:true})[k]);
      window.modulosDoUsuario=()=>['cadastros'];window.modulosPadraoDasFuncoes=()=>['cadastros'];
      const user={uid:'adm',email:'admin@example.test',reauthenticateWithCredential:async c=>{if(c.password!=='FicticiaAdmin9!')throw Error('invalid-credential');__reauth++;},getIdToken:async()=>{__refresh++;__fresh=true;return 'synthetic';}};
      const auth={currentUser:user,onAuthStateChanged:cb=>queueMicrotask(()=>cb(user)),sendPasswordResetEmail:async()=>{}};
      const authFn=()=>auth;authFn.EmailAuthProvider={credential:(email,password)=>({email,password})};
      window.firebase={auth:authFn,database:()=>({ref:path=>({path})}),functions:()=>({httpsCallable:()=>async p=>{
        __calls.push({acao:p.acao,uid:p.uid,requestId:p.requestId});
        if(!__fresh)throw Object.assign(Error('Confirme identidade'),{code:'functions/failed-precondition',details:{requiresRecentLogin:true}});
        if(p.acao==='diagnosticar')return{data:p.uid==='legacy'?{vinculo:'CONFLITO_EMAIL',uidLogin:'op',perfilLoginExiste:true}:{vinculo:'OK'}};
        if(p.acao==='definir_senha'){if(!p.nova_senha)throw Error('senha ausente');__passwords++;}
        return{data:{ok:true}};
      }})};
      window.dbOnValue=(ref,cb)=>queueMicrotask(()=>cb({val:()=>ref.path==='usuarios'?users:users.adm}));
    });
    await page.addScriptTag({content:logic});
    await page.waitForFunction(()=>document.querySelectorAll('#users-tbody tr').length===3);
    await page.evaluate(()=>abrirEdicao('op'));
    await page.locator('#editNovaSenha').fill('FicticiaOperador9!');
    await page.locator('#editConfirmarSenha').fill('FicticiaOperador9!');
    page.once('dialog',d=>d.accept());
    await page.locator('#editDefinirSenha').click();
    await page.waitForFunction(()=>document.getElementById('modalReauthBg').classList.contains('open'));
    await page.screenshot({path:'scratch/usuarios-reauth-'+width+'.png',fullPage:true});
    await page.locator('#reauthSenha').fill('Errada');await page.locator('#reauthConfirmar').click();
    await page.waitForFunction(()=>document.getElementById('reauthErro').textContent.includes('Confira'));
    assert.equal(await page.evaluate(()=>__passwords),0);
    await page.locator('#reauthSenha').fill('FicticiaAdmin9!');await page.locator('#reauthConfirmar').click();
    await page.waitForFunction(()=>window.__passwords===1);
    assert.equal(await page.evaluate(()=>__refresh),1);
    assert.equal(await page.evaluate(()=>__calls[0].requestId===__calls[1].requestId),true);
    assert.equal(await page.locator('#editNovaSenha').inputValue(),'');assert.equal(await page.locator('#reauthSenha').inputValue(),'');
    await page.locator('#editPermissoes').click();
    await page.waitForFunction(()=>document.getElementById('modalFuncBg').classList.contains('open'));
    await page.evaluate(()=>{fecharFuncoes();abrirModulos('op');});await page.locator('#modSalvar').click();
    await page.waitForFunction(()=>window.__calls.some(c=>c.acao==='modulos'));
    await page.evaluate(()=>{abrirEdicao('legacy');});await page.locator('#editVerificarLogin').click();
    await page.waitForFunction(()=>!document.getElementById('editAbrirLogin').hidden);
    await page.locator('#editAbrirLogin').click();
    assert.equal(await page.locator('#editEmail').inputValue(),'operator@example.test');
    assert.equal(await page.evaluate(()=>editUidAtual),'op');
    await page.evaluate(()=>{__fresh=false;fecharEdicao();abrirModulos('op');});await page.locator('#modSalvar').click();
    await page.waitForFunction(()=>document.getElementById('modalReauthBg').classList.contains('open'));
    const count=await page.evaluate(()=>__calls.length);await page.locator('#reauthCancelar').click();
    await page.waitForFunction(()=>!document.getElementById('modSalvar').disabled);
    assert.equal(await page.evaluate(()=>__calls.length),count,'cancelar não reenvia ação');
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('Ficticia')),false);
    await page.close();
  }} finally {await browser.close();}
  console.log('UI usuários desktop/mobile: reautenticação, senha errada/cancelar, token novo, senha definida, módulos e conflito de cadastro OK');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
