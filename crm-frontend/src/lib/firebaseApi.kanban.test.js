import { memory } from '@/test/memoryFirebase';
import { liberarEtapaPd } from '@/lib/servidor';

vi.mock('firebase/database', () => import('@/test/memoryFirebase').then(m => m.databaseModule));
vi.mock('firebase/storage', () => import('@/test/memoryFirebase').then(m => m.storageModule));
vi.mock('@/lib/firebase', () => import('@/test/memoryFirebase').then(m => m.firebaseModule));
vi.mock('@/lib/justificationPrompt', async orig => ({...(await orig()),askJustification:vi.fn(async()=>null)}));

const T='erp/kuryos';
const seed=()=>({usuarios:{adm:{role:'admin',nome:'Admin fictício',tenant_id:'kuryos'}},erp:{kuryos:{
  pd_requests:{R:{id:'R',status:'IN_PROGRESS',title:'Projeto fictício'}},
  pd_cards:{C:{id:'C',pd_request_id:'R',status:'IN_PROGRESS',status_pd:'em_desenvolvimento'}},
  pd_developments:{D:{id:'D',request_id:'R'}},
  pd_formulas:{F:{id:'F',development_id:'D',version:1,name:'Fórmula fictícia'}},
  pd_formula_items:{I:{id:'I',formula_id:'F',ingredient_name:'Ingrediente fictício',percentage:100}}
}}});
let api;
beforeAll(async()=>{api=(await import('@/lib/firebaseApi')).default;});
beforeEach(()=>{
  memory.reset(seed());memory.setUser('adm');
  vi.mocked(liberarEtapaPd).mockReset().mockResolvedValue({ok:true});
});
afterAll(()=>memory.restore());

test('arrastar para Em Testes passa pela liberação e pelos mesmos efeitos da ficha',async()=>{
  await api.put('/crm/pd/cards/C/move',{status:'em_testes'});
  expect(liberarEtapaPd).toHaveBeenCalledWith('R','IN_TESTS',false);
  expect(memory.read(`${T}/pd_requests/R/status`)).toBe('IN_TESTS');
  expect(memory.read(`${T}/pd_cards/C/status_pd`)).toBe('em_testes');
  expect(memory.read(`${T}/pd_formulas/F/locked`)).toBe(true);
  expect(Object.values(memory.read(`${T}/pd_samples`) || {})).toHaveLength(1);
});

test('arrastar não contorna fórmula incompleta, mesmo como administrador',async()=>{
  memory.write(`${T}/pd_formula_items/I/percentage`,99.5);
  await expect(api.put('/crm/pd/cards/C/move',{status:'em_testes'})).rejects.toMatchObject({response:{status:422}});
  expect(memory.read(`${T}/pd_requests/R/status`)).toBe('IN_PROGRESS');
  expect(liberarEtapaPd).not.toHaveBeenCalled();
});

test('arrastar não pula etapas técnicas',async()=>{
  memory.write(`${T}/pd_requests/R/status`,'OPEN');
  await expect(api.put('/crm/pd/cards/C/move',{status:'em_testes'})).rejects.toMatchObject({response:{status:400}});
  expect(memory.read(`${T}/pd_requests/R/status`)).toBe('OPEN');
});

test('recusa do servidor não muda card nem trava fórmula',async()=>{
  vi.mocked(liberarEtapaPd).mockRejectedValueOnce(Object.assign(new Error('Servidor recusou'),{response:{status:422,data:{detail:'Servidor recusou'}}}));
  await expect(api.put('/crm/pd/cards/C/move',{status:'em_testes'})).rejects.toThrow('Servidor recusou');
  expect(memory.read(`${T}/pd_requests/R/status`)).toBe('IN_PROGRESS');
  expect(memory.read(`${T}/pd_formulas/F/locked`)).toBeUndefined();
});

test('Aguardando Aprovação exige D48h antes de pedir liberação',async()=>{
  memory.write(`${T}/pd_requests/R/status`,'IN_TESTS');
  await expect(api.put('/crm/pd/cards/C/move',{status:'aguardando_aprovacao'})).rejects.toThrow(/D48h/);
  expect(liberarEtapaPd).not.toHaveBeenCalled();
  expect(memory.read(`${T}/pd_requests/R/status`)).toBe('IN_TESTS');
});

test('edição genérica do card também não contorna fechamento',async()=>{
  memory.write(`${T}/pd_formula_items/I/percentage`,99);
  await expect(api.put('/crm/pd/cards/C',{status_pd:'em_testes'})).rejects.toMatchObject({response:{status:422}});
  expect(memory.read(`${T}/pd_cards/C/status_pd`)).toBe('em_desenvolvimento');
});

test('edição genérica da solicitação também valida a mudança de etapa',async()=>{
  memory.write(`${T}/pd_formula_items/I/percentage`,99);
  await expect(api.put('/pd/requests/R',{status:'IN_TESTS',title:'Não salvar parcialmente'})).rejects.toMatchObject({response:{status:422}});
  expect(memory.read(`${T}/pd_requests/R/title`)).toBe('Projeto fictício');
});

test('mover com D48h gera a liberação e sincroniza card e solicitação',async()=>{
  memory.write(`${T}/pd_requests/R/status`,'IN_TESTS');
  memory.write(`${T}/pd_stability_studies/S`,{id:'S',request_id:'R'});
  memory.write(`${T}/pd_stability_readings/READ`,{id:'READ',study_id:'S',day_offset:2});
  await api.put('/crm/pd/cards/C/move',{status:'aguardando_aprovacao'});
  expect(liberarEtapaPd).toHaveBeenCalledWith('R','WAITING_APPROVAL',false);
  expect(memory.read(`${T}/pd_cards/C/status_pd`)).toBe('aguardando_aprovacao');
  expect(memory.read(`${T}/pd_requests/R/aguardando_cliente_desde`)).toBeTruthy();
});

test('voltar exige justificativa e registra o motivo, sem efeitos duplicados no retry',async()=>{
  await api.put('/crm/pd/cards/C/move',{status:'solicitado',justificativa:'Retorno solicitado para rever briefing'});
  expect(memory.read(`${T}/pd_requests/R/status`)).toBe('OPEN');
  const history=Object.values(memory.read(`${T}/pd_request_status_history`) || {});
  expect(history).toHaveLength(1);
  expect(history[0].comment).toContain('rever briefing');
  await api.put('/crm/pd/cards/C/move',{status:'solicitado',justificativa:'Retorno solicitado para rever briefing'});
  expect(Object.values(memory.read(`${T}/pd_request_status_history`) || {})).toHaveLength(1);
});

test('cancelar justificativa não muda o card',async()=>{
  await expect(api.put('/crm/pd/cards/C/move',{status:'solicitado'})).rejects.toBeTruthy();
  expect(memory.read(`${T}/pd_requests/R/status`)).toBe('IN_PROGRESS');
  expect(memory.read(`${T}/pd_request_status_history`)).toBeUndefined();
});

test('retorno de Aguardando para Em Testes pede o retrocesso protegido ao servidor',async()=>{
  memory.write(`${T}/pd_requests/R/status`,'WAITING_APPROVAL');
  await api.put('/crm/pd/cards/C/move',{status:'em_testes',justificativa:'Repetir ensaio técnico solicitado'});
  expect(liberarEtapaPd).toHaveBeenCalledWith('R','IN_TESTS',true);
  expect(memory.read(`${T}/pd_requests/R/status`)).toBe('IN_TESTS');
});

test('D0: P&D solicita, envio aguarda ADM, aprovação registra motivo e mantém o estudo',async()=>{
  memory.write('usuarios/pd',{role:'pd',nome:'P&D fictício',tenant_id:'kuryos'});
  memory.write(`${T}/pd_requests/R/status`,'IN_TESTS');
  memory.write(`${T}/pd_stability_studies/S`,{id:'S',request_id:'R',status:'IN_PROGRESS'});
  memory.write(`${T}/pd_stability_readings/D0`,{id:'D0',study_id:'S',day_offset:0});
  memory.setUser('pd');
  await expect(api.post('/pd/requests/R/liberacao-antecipada',{motivo:'curto'})).rejects.toMatchObject({response:{status:422}});
  await api.post('/pd/requests/R/liberacao-antecipada',{motivo:'Cliente precisa apresentar esta amostra com D0'});
  expect(memory.read(`${T}/pd_requests/R/liberacao_antecipada`)).toMatchObject({status:'aguardando_diretoria',leituras_no_pedido:['D0']});
  await expect(api.put('/crm/pd/cards/C/move',{status:'aguardando_aprovacao'})).rejects.toThrow(/aprovação de um administrador.*D0/);
  const decisao={decisao:'aprovada',justificativa:'Autorizo envio com D0 e estabilidade em andamento',data_hora:new Date().toISOString()};
  await expect(api.post('/pd/requests/R/liberacao-antecipada/decisao',decisao)).rejects.toMatchObject({response:{status:403}});
  expect(memory.read(`${T}/pd_requests/R/status`)).toBe('IN_TESTS');
  memory.setUser('adm');
  await api.post('/pd/requests/R/liberacao-antecipada/decisao',decisao);
  expect(memory.read(`${T}/pd_requests/R`)).toMatchObject({status:'WAITING_APPROVAL',liberacao_antecipada:{status:'aprovada',decisao:{decidida_por:'adm',justificativa:decisao.justificativa}}});
  expect(liberarEtapaPd).toHaveBeenCalledWith('R','WAITING_APPROVAL',false);
  expect(memory.read(`${T}/pd_stability_studies/S/status`)).toBe('IN_PROGRESS');
  expect(memory.read(`${T}/pd_stability_readings/D0/day_offset`)).toBe(0);
});
