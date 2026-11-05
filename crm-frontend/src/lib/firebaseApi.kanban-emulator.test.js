import {describe,test,expect,beforeAll,afterAll} from 'vitest';
vi.mock('firebase/database',()=>import('@/test/pdEmulatorFirebase').then(m=>m.databaseModule));
vi.mock('firebase/storage',()=>import('@/test/pdEmulatorFirebase').then(m=>m.storageModule));
vi.mock('@/lib/firebase',()=>import('@/test/pdEmulatorFirebase').then(m=>m.firebaseModule));
vi.mock('@/lib/servidor',()=>import('@/test/pdEmulatorFirebase').then(m=>m.serverModule));
describe.skipIf(process.env.FIREBASE_DATABASE_EMULATOR_HOST!=='127.0.0.1:9023' || process.env.GCLOUD_PROJECT!=='demo-pd-kanban')('Kanban P&D integrado ao servidor e regras reais',()=>{
  let api,bridge;
  beforeAll(async()=>{
    bridge=await import('@/test/pdEmulatorFirebase');
    // O setup global usa um servidor em memória. Esta suíte precisa do handler real.
    vi.doMock('@/lib/servidor',()=>bridge.serverModule);
    await bridge.root.ref().set({usuarios:{adm:{role:'admin',nome:'Admin fictício',tenant_id:'kuryos'}},erp:{kuryos:{
      pd_requests:{R:{id:'R',status:'IN_PROGRESS',title:'Projeto fictício'}},
      pd_cards:{C:{id:'C',pd_request_id:'R',status:'IN_PROGRESS',status_pd:'em_desenvolvimento'}},
      pd_developments:{D:{id:'D',request_id:'R'}},pd_formulas:{F:{id:'F',development_id:'D',version:1}},
      pd_formula_items:{I:{id:'I',formula_id:'F',ingredient_name:'Ingrediente fictício',percentage:100}}
    }}});
    api=(await import('@/lib/firebaseApi')).default;
  },60000);
  afterAll(async()=>{if(bridge)await bridge.stop();});
  test('gravação direta é negada até para ADM; o arrastar integrado passa com liberação real',async()=>{
    await expect(bridge.client.ref('erp/kuryos/pd_requests/R').update({status:'IN_TESTS'})).rejects.toThrow(/permission_denied/i);
    let result;
    try { result=await api.put('/crm/pd/cards/C/move',{status:'em_testes'}); }
    catch(error) {
      const ticket=(await bridge.root.ref('erp/kuryos/pd_liberacoes_status/R').get()).val();
      throw new Error(`Falha integrada; ticket=${JSON.stringify(ticket)}; ${error.message}`,{cause:error});
    }
    expect(result.data.to_status).toBe('em_testes');
    expect((await bridge.root.ref('erp/kuryos/pd_requests/R/status').get()).val()).toBe('IN_TESTS');
    expect((await bridge.root.ref('erp/kuryos/pd_liberacoes_status/R/status').get()).val()).toBe('IN_TESTS');
    expect((await bridge.root.ref('erp/kuryos/pd_formulas/F/locked').get()).val()).toBe(true);
    expect((await bridge.root.ref('erp/kuryos/pd_cards/C/status_pd').get()).val()).toBe('em_testes');
  },60000);
  test('servidor aceita os dois retrocessos adjacentes protegidos e recusa salto',async()=>{
    const path='erp/kuryos/pd_requests/RET';
    await bridge.root.ref(path).set({id:'RET',status:'APPROVED'});
    await expect(bridge.serverModule.liberarEtapaPd('RET','WAITING_APPROVAL',true)).resolves.toEqual({ok:true});
    await expect(bridge.serverModule.liberarEtapaPd('RET','IN_TESTS',true)).rejects.toMatchObject({code:'failed-precondition'});
    await bridge.root.ref(path+'/status').set('WAITING_APPROVAL');
    await expect(bridge.serverModule.liberarEtapaPd('RET','IN_TESTS',true)).resolves.toEqual({ok:true});
  },60000);
  test('D0 real: pedido fica pendente, só ADM aprova e o envio usa ticket sem concluir estabilidade',async()=>{
    const b='erp/kuryos/';
    await bridge.root.ref().update({
      ['usuarios/d0pd']:{role:'pd',tenant_id:'kuryos'},
      [b+'pd_requests/DZERO']:{id:'DZERO',status:'IN_TESTS'},
      [b+'pd_developments/DD0']:{id:'DD0',request_id:'DZERO'},
      [b+'pd_formulas/FD0']:{id:'FD0',development_id:'DD0',version:1,locked:true},
      [b+'pd_formula_items/ID0']:{id:'ID0',formula_id:'FD0',ingredient_name:'Fictício',percentage:100},
      [b+'pd_stability_studies/SD0']:{id:'SD0',request_id:'DZERO',status:'IN_PROGRESS'},
      [b+'pd_stability_readings/LD0']:{id:'LD0',study_id:'SD0',day_offset:0},
    });
    await api.post('/pd/requests/DZERO/liberacao-antecipada',{motivo:'Cliente precisa da amostra com D0 para apresentação'});
    expect((await bridge.root.ref(b+'pd_requests/DZERO/liberacao_antecipada').get()).val()).toMatchObject({status:'aguardando_diretoria',leituras_no_pedido:['D0']});
    await expect(api.put('/pd/requests/DZERO/status',{new_status:'WAITING_APPROVAL'})).rejects.toThrow(/D48h/);
    await expect(bridge.asUser('d0pd').ref(b+'pd_requests/DZERO/liberacao_antecipada/status').set('aprovada')).rejects.toThrow(/permission_denied/i);
    await api.post('/pd/requests/DZERO/liberacao-antecipada/decisao',{decisao:'aprovada',justificativa:'Autorizo envio com D0 e estabilidade em andamento',data_hora:new Date().toISOString()});
    expect((await bridge.root.ref(b+'pd_requests/DZERO').get()).val()).toMatchObject({status:'WAITING_APPROVAL',liberacao_antecipada:{status:'aprovada',decisao:{decidida_por:'adm'}}});
    expect((await bridge.root.ref(b+'pd_liberacoes_status/DZERO/status').get()).val()).toBe('WAITING_APPROVAL');
    expect((await bridge.root.ref(b+'pd_stability_studies/SD0/status').get()).val()).toBe('IN_PROGRESS');
  },60000);
  test('coleções explícitas permitem CRUD autorizado e mantêm validações e isolamento',async()=>{
    await bridge.root.ref('usuarios').update({sales:{role:'comercial',tenant_id:'kuryos'},
      pd:{role:'pd',tenant_id:'kuryos'},operator:{role:'production',tenant_id:'kuryos'},
      pending:{role:'pending',tenant_id:'kuryos'},other:{role:'pd',tenant_id:'outra'}});
    const users=[bridge.client,bridge.asUser('sales'),bridge.asUser('pd')];
    for(let n=0;n<users.length;n++) {
      const db=users[n],key=`CRUD${n}`,base='erp/kuryos/';
      for(const col of ['pd_requests','crm_samples','crm_propostas']) {
        const r=db.ref(base+col+'/'+key);
        await r.set({id:key,title:'Fictício',...(col==='pd_requests'?{status:'OPEN'}:{})});
        await r.update({title:'Atualizado'});
        expect((await r.get()).val().title).toBe('Atualizado');
        await r.remove();
        expect((await r.get()).exists()).toBe(false);
      }
      await db.ref(base+'sku_por_orcamento/'+key).set('SKU-FICTICIO');
      await expect(db.ref(base+'sku_por_orcamento/'+key).set('OUTRO')).rejects.toThrow(/permission_denied/i);
      await expect(db.ref(base+'audit_log/X').set({action:'forjada'})).rejects.toThrow(/permission_denied/i);
      await expect(db.ref(base+'pd_liberacoes_status/X').set({status:'IN_TESTS',ate:Date.now()+60000})).rejects.toThrow(/permission_denied/i);
      await expect(db.ref(base).remove()).rejects.toThrow(/permission_denied/i);
    }
    for(const uid of ['operator','pending','other']) {
      const db=bridge.asUser(uid);
      for(const col of ['pd_requests','crm_samples','crm_propostas','sku_por_orcamento']) {
        await expect(db.ref('erp/kuryos/'+col+'/NEGADO').set(col==='sku_por_orcamento'?'SKU':{title:'Negado'})).rejects.toThrow(/permission_denied/i);
      }
    }
    const sales=users[1];
    await expect(sales.ref('erp/kuryos/crm_samples/FUTURO/variacoes/0/aprovacao_cliente/aprovado_em_ms').set(Date.now()+3600000)).rejects.toThrow(/permission_denied/i);
    await expect(sales.ref('erp/kuryos/crm_propostas/DESC/composicao/servicos/0').set({desconto_pct:100,servico_id:'inexistente'})).rejects.toThrow(/permission_denied/i);
    await bridge.root.ref('security_sessions/sales').set({revokedAfter:300});
    await expect(sales.ref('erp/kuryos/pd_requests/REVOGADO').set({status:'OPEN'})).rejects.toThrow(/permission_denied/i);
  },60000);
});
