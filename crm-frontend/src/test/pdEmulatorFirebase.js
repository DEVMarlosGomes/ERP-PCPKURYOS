// Ponte de teste: API real do CRM -> RTDB com regras -> callable real.
// Não pode inicializar fora do emulador/projeto de demonstração.
import {createRequire} from 'node:module';
if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== '127.0.0.1:9023' || process.env.GCLOUD_PROJECT !== 'demo-pd-kanban') throw Error('Exige demo-pd-kanban no emulador 9023');
const req=createRequire(new URL('../../../functions/package.json',import.meta.url));
const {initializeApp,getApp,getApps,deleteApp}=req('firebase-admin/app');
const {getDatabase}=req('firebase-admin/database');
const databaseURL='http://127.0.0.1:9023?ns=demo-pd-kanban-default-rtdb';
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-pd-kanban',databaseURL});
const fns=req('./index.js'); // O módulo real inicializa o app padrão pelo FIREBASE_CONFIG.
const rootApp=getApp();
const clientApp=initializeApp({projectId:'demo-pd-kanban',databaseURL,databaseAuthVariableOverride:{uid:'adm'}},'kanban-client');
export const root=getDatabase(rootApp),client=getDatabase(clientApp);
export const asUser=(uid,authTime=200)=>getDatabase(initializeApp({projectId:'demo-pd-kanban',databaseURL,
  databaseAuthVariableOverride:{uid,token:{auth_time:authTime}}},`test-${uid}-${authTime}`));
export const databaseModule={
  ref:(_db,path='')=>client.ref(path),get:r=>r.get(),set:(r,v)=>r.set(v),
  update:(r,v)=>r.update(v),remove:r=>r.remove(),push:r=>r.push(),
  runTransaction:(r,fn)=>r.transaction(fn),
};
export const firebaseModule={firebaseDb:{},firebaseStorage:{},firebaseAuth:{currentUser:{uid:'adm',email:'admin@example.test'}}};
export const storageModule={ref:()=>{throw Error('Storage não faz parte deste teste');},uploadBytes:()=>{throw Error('Não permitido');},getDownloadURL:()=>{throw Error('Não permitido');}};
export const serverModule={
  ORIGEM_FUNCOES:'emulator-only',
  liberarEtapaPd:(requestId,novoStatus,voltar=false)=>fns.liberarEtapaPd.run({auth:{uid:'adm'},data:{requestId,novoStatus,voltar}}),
  chamarServidor:(name,data)=>{
    if(!fns[name]?.run)throw Error('Callable inesperada: '+name);
    return fns[name].run({auth:{uid:'adm'},data});
  },
};
export const stop=()=>Promise.all(getApps().map(deleteApp));
