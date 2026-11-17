'use strict';
/* UI: agenda de carga compartilhada entre telas (Montar carga, agenda da
   Logística e Acompanhamento de cargas -- expedição em três telas, 29/09).
   Callables executam as funções puras do servidor sobre um estado em memória. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'), assert=require('node:assert/strict');
const {fixture}=require('./run_expedicao_test');
const {prepararAgenda}=require('./functions/agenda_expedicao');
const {prepararSaida}=require('./functions/expedicao');
const {prepararFaturamento}=require('./functions/faturamento_carga');
const agora='2026-09-11T18:00:00Z';
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    let state=fixture();const pages=[],errors=[];
    state.clientes.c1={...state.clientes.c1,contatosVersao:1,contatos:{recebe:{nome:'Ana Recebimento',email:'ana@example.com',telefone:'11900000000',areas:['LOGISTICA'],principais:['LOGISTICA']}}};
    state.estoque_lotes.PA001.parcial={...structuredClone(state.estoque_lotes.PA001.pa_op1_p1),identificadorPalete:'PA-SO-PARCIAL',caixasFechadas:0,unidadesCaixaParcial:7,saldoLote:7,qtdOriginal:7};
    function aplicar(updates){for(const [path,value]of Object.entries(updates)){const ps=path.split('/');let n=state;for(const p of ps.slice(0,-1))n=n[p]||(n[p]={});n[ps.at(-1)]=structuredClone(value);}}
    async function notificar(){for(const p of pages)if(!p.isClosed())await p.evaluate(state=>{for(const [no,cbs]of Object.entries(window.listenersPA||{}))for(const cb of cbs)cb({val:()=>structuredClone(state[no]||{})});},state).catch(()=>null);}
    await context.exposeFunction('serverPA',async(name,dados)=>{
      let result;
      if(name==='salvarAgendamentoExpedicaoPA'){
        const a=prepararAgenda(state,dados,'Logística','u1',agora);state.agendamentos_expedicao=state.agendamentos_expedicao||{};state.agendamentos_expedicao[dados.agendaKey]=a;result={agendaKey:dados.agendaKey,revisao:a.revisao};
      }else if(name==='confirmarExpedicaoPA'){
        const p=prepararSaida(state,dados,'Logística','u1',agora);aplicar(p.updates);result={numero:p.carga.numero,cargaKey:p.cargaKey};
      }else throw new Error('Callable inesperada: '+name);
      await notificar();
      return {data:result};
    });
    await context.exposeFunction('estadoPA',async no=>structuredClone(state[no]||{}));
    await context.addInitScript(()=>{
      window.listenersPA={};window.firebase={initializeApp(){},database(){return{ref(path){return{path};}};},functions(){return{httpsCallable(name){return data=>window.serverPA(name,data).catch(e=>{throw Object.assign(new Error(String(e.message||e).replace(/^.*Error: /,'')),{code:'functions/failed-precondition'});});}};}};
      window.kuryosDatabaseURL=x=>x;window.kuryosConnectEmulatorsIfLocal=()=>{};
      window.escapeHtml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      window.dbOnValue=(ref,cb)=>{(window.listenersPA[ref.path]||= []).push(cb);window.estadoPA(ref.path).then(v=>cb({val:()=>structuredClone(v||{})}));};
    });
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url()),name=url.pathname.slice(1);
      if(url.hostname!=='expedicao.test'||name==='auth_check.js'||name==='shared/utils.js')return route.fulfill({body:'',contentType:'text/javascript'});
      if(name==='agenda-logistica-test.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="shared/agenda-pa.css"><script src="shared/contatos-cliente.js"></script><script src="shared/contatos-cliente-ui.js"></script><div id="agenda"></div><script src="shared/agenda-pa-tela.js"></script><script>AgendaPAUI.iniciar({container:document.getElementById("agenda"),db:firebase.database(),fn:firebase.functions(),onErro:msg=>{throw Error(msg)}});</script>'});
      if(!fs.existsSync('public/'+name))return route.fulfill({status:404,body:''});
      return route.fulfill({body:fs.readFileSync('public/'+name),contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'});
    });
    const page=await context.newPage(), logistics=await context.newPage();pages.push(page,logistics);
    pages.forEach(p=>p.on('pageerror',err=>errors.push(err.message)));
    page.on('dialog',d=>d.accept());
    await page.goto('https://expedicao.test/expedicao.html');await logistics.goto('https://expedicao.test/agenda-logistica-test.html');
    await page.bringToFront();
    await page.waitForFunction(()=>document.querySelectorAll('#paletes tr [data-palete]').length===2);
    assert.match(await page.locator('#paletes').innerText(),/12 cx × 24/);
    assert.equal(await page.locator('#paletes .partial').count(),2,'Caixa parcial fica na linha do próprio palete');
    // ── Remontar palete (16/11/2026): modal com validação ao vivo, sem gravar ──
    await page.locator('[data-remontar="PA001/pa_op1_p1"]').click();
    await page.waitForSelector('.rm-fundo');
    assert.match(await page.locator('.rm-fundo').innerText(),/12 cx × 24 \+ 1 parcial de 7 un = 295 un/);
    await page.fill('#rmCaixas','13');
    assert.match(await page.locator('#rmMsg').innerText(),/só 12 caixa/,'não tira mais caixas do que o palete tem');
    await page.fill('#rmCaixas','5');
    assert.match(await page.locator('#rmMsg').innerText(),/Move 120 un \(5 cx\) para PA-26254-01-P\d+ \(palete novo\)\. Fica no original: 7 cx \+ parcial = 175 un/);
    await page.locator('[name="rmDest"][value="REGISTRO"]').check();
    assert.match(await page.locator('#rmMsg').innerText(),/para PA-SO-PARCIAL/,'palete existente como destino');
    await page.click('#rmFechar');
    assert.equal(await page.locator('.rm-fundo').count(),0);
    // ── Plano por rota: caixas por produto e rota, sobra e paletes ──
    await page.selectOption('#filtroCliente',{label:'Cliente A'});
    await page.click('#planoRotasAbrir');
    await page.waitForSelector('[data-rota="0"][data-sku="PA001"]');
    assert.match(await page.locator('#planoRotasCorpo').innerText(),/PA001[\s\S]*12/,'caixas livres do cliente');
    await page.fill('[data-rota="0"][data-sku="PA001"]','5');
    await page.fill('[data-rota="1"][data-sku="PA001"]','4');
    assert.match(await page.locator('#planoRotasCorpo tbody tr').first().innerText(),/\b3$/,'sobra 12 − 9 = 3');
    await page.click('#rotaCalcular');
    const res=await page.locator('#rotaResultado').innerText();
    assert.match(res,/Rota PF · 5 cx/); assert.match(res,/Tirar caixas: 5 cx de PA-26254-01-P1 → R-PF-PA001/);
    assert.match(res,/Rota GVT · 4 cx/); assert.match(res,/Executar as 2 transferência/);
    await page.click('#planoRotasAbrir');
    await page.selectOption('#filtroCliente','');
    await page.locator('[data-palete="PA001/pa_op1_p1"]').check();await page.locator('[data-palete="PA001/parcial"]').check();
    assert.match(await page.locator('#selecaoResumo').innerText(),/302 un.*12 cx \+ 2 cx parciais \(14 un\) = 14 volumes/);
    assert.equal(await page.locator('#contatoClienteCarga [data-valor=nome]').inputValue(),'Ana Recebimento');
    await page.locator('#dataAgendada').fill('2026-09-20');await page.locator('#transportadora').fill('Transporte A');await page.locator('#motorista').fill('João');await page.locator('#placa').fill('ABC1D23');
    if(process.env.EXPEDICAO_SCREENSHOT)await page.screenshot({path:process.env.EXPEDICAO_SCREENSHOT,fullPage:true});
    await page.locator('#agendar').click();await page.waitForFunction(()=>document.getElementById('resultado').textContent.includes('Carga agendada'));
    assert.equal(state.estoque_lotes.PA001.pa_op1_p1.saldoLote,295);assert.equal(state.expedicoes_comerciais,undefined);
    const agendaKey=Object.keys(state.agendamentos_expedicao)[0];
    assert.equal(state.agendamentos_expedicao[agendaKey].contatoCliente.nome,'Ana Recebimento');
    assert.equal(await page.locator('[data-palete]:checked').count(),0,'depois de agendar, a seleção é limpa para a próxima carga');
    state.clientes.c1.contatos.recebe.nome='Cadastro alterado';
    await notificar();

    // ── Logística edita o transporte na agenda compartilhada ────────────
    await logistics.bringToFront();
    assert.match(await logistics.locator('.agenda-pa-lista').innerText(),/Transporte A.*João.*ABC1D23/);
    assert.equal(await logistics.locator('.agenda-pa-lista a[href^="faturamento.html"]').count(),1,'agenda aponta para o Faturamento');
    assert.equal(await logistics.locator('[data-nf],[data-solicitar]').count(),0,'NF e solicitação saíram da agenda: têm tela própria');
    await logistics.locator('[data-editar]').click();assert.equal(await logistics.locator('[data-valor=nome]').inputValue(),'Ana Recebimento');await logistics.locator('[data-valor=telefone]').fill('11888888888');
    await logistics.evaluate(clientes=>{for(const cb of window.listenersPA.clientes)cb({val:()=>clientes});},state.clientes);
    assert.equal(await logistics.locator('[data-valor=telefone]').inputValue(),'11888888888','Atualização cadastral com modal aberto preserva ajuste manual');
    await logistics.locator('[name="motorista"]').fill('Maria');await logistics.locator('[name="placa"]').fill('DEF4G56');await logistics.locator('[type="submit"]').click();
    await logistics.waitForFunction(()=>!document.querySelector('dialog').open);

    // ── Acompanhamento: sem NF não carrega ──────────────────────────────
    const cargasPage=await context.newPage();pages.push(cargasPage);cargasPage.on('pageerror',err=>errors.push(err.message));cargasPage.on('dialog',d=>d.accept());
    await cargasPage.goto('https://expedicao.test/cargas.html?carga='+agendaKey);
    const card=cargasPage.locator('[data-carga="'+agendaKey+'"]');
    await card.waitFor();
    assert.match(await card.innerText(),/Maria.*DEF4G56/,'transporte editado na Logística aparece no acompanhamento');
    assert.equal(await card.locator('[data-acao="CARREGAR"]').count(),0,'sem NF não há carregamento');
    assert.match(await card.innerText(),/A saída física só é liberada com a NF/);
    // 16/11/2026: volumes da NF (caixa parcial como CAIXA) e peso pela regra de três.
    assert.match(await card.innerText(),/Volumes: 12 cx \+ 2 cx parciais \(14 un\) = 14 volumes/,'caixas fechadas + caixas parciais, não "+ 14 un"');
    assert.match(await card.innerText(),/Peso: sem peso \(cadastre o kg por caixa\)/,'sem kg/cx no cadastro: peso desconhecido, nunca zero');
    state.produtos=Object.assign(state.produtos||{}, {PA001:{sku:'PA001',kgCaixa:10,unCx:24}});await notificar();
    await cargasPage.waitForFunction(()=>/Peso: 125,83 kg/.test(document.getElementById('listaCargas').innerText),null,{timeout:5000});
    // RNC de consistência aberta na OP do palete: a expedição AVISA (não bloqueia).
    state.nao_conformidades={'RNC-CS-26254-01':{numero:'RNC-CS-26254-01',automatica:true,categoria:'CONSISTENCIA',status:'ABERTA',opKey:'op1',opLote:'26254/01'}};await notificar();
    await cargasPage.waitForFunction(()=>/RNC de consistência aberta \(RNC-CS-26254-01\)/.test(document.getElementById('listaCargas').innerText),null,{timeout:5000});
    state.nao_conformidades={};await notificar();
    // ── Editar os paletes da carga (16/11/2026): tira o palete parcial, com motivo ──
    await card.locator('[data-acao="PALETES"]').click();
    await cargasPage.waitForSelector('[data-painel="PALETES"]');
    assert.equal(await cargasPage.locator('[data-palete-carga]:checked').count(),2,'os dois paletes da carga vêm marcados');
    await cargasPage.locator('[data-palete-carga="PA001/parcial"]').uncheck();
    assert.match(await cargasPage.locator('[data-painel="PALETES"]').innerText(),/Ficará: 1 palete\(s\) · 12 cx \+ 1 cx parcial \(7 un\)/);
    await cargasPage.click('#salvarPaletes');
    assert.match(await cargasPage.locator('[data-painel="PALETES"] .carga-erro').innerText(),/motivo/);
    await cargasPage.fill('#p_motivo','Remontada para o frete do cliente');
    await cargasPage.click('#salvarPaletes');
    await cargasPage.waitForFunction(()=>/Paletes da carga atualizados/.test(document.getElementById('resultado').innerText));
    assert.deepEqual(state.agendamentos_expedicao[agendaKey].paletes.map(p=>p.loteKey),['pa_op1_p1'],'servidor real gravou a nova composição');
    const hist=Object.values(state.agendamentos_expedicao[agendaKey].historico).find(h=>h.acao==='EDITAR_PALETES');
    assert.equal(hist.motivo,'Remontada para o frete do cliente'); assert.equal(hist.antes.length,2); assert.equal(hist.depois.length,1);
    // Inclui de volta: o palete livre do mesmo cliente aparece para marcar.
    await card.locator('[data-acao="PALETES"]').click();
    await cargasPage.locator('[data-palete-carga="PA001/parcial"]').check();
    await cargasPage.fill('#p_motivo','Volta o palete parcial');
    await cargasPage.click('#salvarPaletes');
    await cargasPage.waitForFunction(()=>/Paletes da carga atualizados/.test(document.getElementById('resultado').innerText)&&!document.querySelector('[data-painel="PALETES"]'));
    assert.equal(state.agendamentos_expedicao[agendaKey].paletes.length,2,'palete incluído de volta');

    // NF registrada no Faturamento (outra tela) -> a carga libera.
    const f=prepararFaturamento(state,{agendaKey,revisao:state.agendamentos_expedicao[agendaKey].revisao,acao:'REGISTRAR_NF',nf:{numero:'2200',serie:'1',valor:3000,emitidaEm:'2026-09-11'}},'Financeiro','u2',agora);
    state.agendamentos_expedicao[agendaKey]=f.agenda;await notificar();
    await cargasPage.waitForFunction(()=>/2200\/1/.test(document.getElementById('listaCargas').innerText));
    await card.locator('[data-acao="CARREGAR"]').click();
    assert.equal(await cargasPage.locator('#c_motorista').inputValue(),'Maria');assert.equal(await cargasPage.locator('#c_placa').inputValue(),'DEF4G56');

    // Conflito: a Logística muda o transporte com o carregamento aberto.
    await logistics.bringToFront();
    await logistics.locator('[data-editar]').click();await logistics.locator('[name="janela"]').fill('14h');await logistics.locator('[type="submit"]').click();
    await logistics.waitForFunction(()=>!document.querySelector('dialog').open);
    await cargasPage.bringToFront();
    await cargasPage.waitForFunction(()=>/A carga mudou em outra tela/.test(document.querySelector('[data-painel]').innerText));
    assert.equal(await cargasPage.locator('#confirmarSaida').isDisabled(),true,'Uma revisão antiga não pode confirmar a saída');
    await cargasPage.locator('[data-fechar-painel]').click();
    await card.locator('[data-acao="CARREGAR"]').click();
    await cargasPage.locator('#c_motorista').fill('Maria Silva');await cargasPage.locator('#c_data').fill('2026-09-11');
    await cargasPage.locator('#confirmarSaida').click();await cargasPage.waitForFunction(()=>document.getElementById('resultado').textContent.includes('Saída confirmada'));
    assert.equal(state.estoque_lotes.PA001.pa_op1_p1.saldoLote,0);assert.equal(state.estoque_lotes.PA001.parcial.saldoLote,0);
    assert.equal(state.agendamentos_expedicao[agendaKey].status,'EXPEDIDO');assert.equal(state.agendamentos_expedicao[agendaKey].motorista,'Maria Silva');
    const carga=Object.values(state.expedicoes_comerciais)[0];assert.equal(carga.contatoCliente.nome,'Ana Recebimento');assert.equal(carga.contatoCliente.telefone,'11888888888');assert.equal(carga.agendamento.contatoCliente.nome,'Ana Recebimento');assert.equal(carga.totalUnidades,302);assert.equal(carga.motorista,'Maria Silva');assert.equal(carga.nf,'2200');assert.equal(carga.itens[1].paleteOrigem.unidadesCaixaParcial,7);
    await cargasPage.waitForFunction(()=>/Maria Silva/.test(document.getElementById('lista').innerText));assert.equal(await cargasPage.locator('#lista .partial').count(),2);
    await logistics.waitForFunction(()=>!document.querySelector('[data-editar]'));
    await cargasPage.setViewportSize({width:390,height:844});assert.equal(await cargasPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Acompanhamento cabe no celular');
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Montar carga cabe no celular');
    assert.deepEqual(errors,[]);
    console.log('OK UI agenda compartilhada: caixas parciais, agendar na Montagem, transporte editado na Logística e visto no Acompanhamento, saída travada sem NF, conflito de revisão, saída atômica, histórico e celular.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
