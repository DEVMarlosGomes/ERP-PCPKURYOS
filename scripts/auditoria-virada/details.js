"use strict";
const fs=require("node:fs"),path=require("node:path");
const Exp=require("../../public/shared/expedicao");
const out=path.resolve(__dirname,"../../scratch/virada-20261103");
const read=n=>JSON.parse(fs.readFileSync(path.join(out,n),"utf8"));
const a=read("reference-live.json"),b=read("target-live.json"), access=read("access-private.json");
const summary={};
for(const [name,base]of [["reference",a],["target",b]]){
  const lots=Object.entries(base.estoque_lotes||{}).flatMap(([itemKey,group])=>Object.entries(group||{}).map(([loteKey,row])=>({itemKey,loteKey,row})));
  const stock=Object.values(base.estoque||{}), expired=lots.filter(x=>x.row.dataValidade&&String(x.row.dataValidade).slice(0,10)<"2026-11-03"&&Number(x.row.saldoLote)>0);
  const eligibleExpired=expired.filter(x=>x.row.itemTipo==="produto"&&Exp.analisar(base,x.itemKey,x.loteKey,"2026-11-03").disponivel);
  summary[name]={materials:Object.keys(base.materiais||{}).length,stockRows:stock.length,positiveStockRows:stock.filter(x=>+x.saldoAtual>0).length,negativeStockRows:stock.filter(x=>+x.saldoAtual<0).length,lotItemGroups:Object.keys(base.estoque_lotes||{}).length,individualLots:lots.length,lotsWithDataValidade:lots.filter(x=>!!x.row.dataValidade).length,lotsWithLegacyValidade:lots.filter(x=>!!x.row.validade).length,positiveExpiredLots:expired.length,expiredPaAvailableUnderCurrentCode:eligibleExpired.length,stockLock:base.config?.emitirOp?.bloquearSemSaldo===true};
}
const business=["materiais","produtos","clientes","fornecedores","formulas","bom","especificacoes","ops","pedidos","pedidos_comerciais","pedidos_compra","registros","estoque","estoque_lotes","conferencias_pa","liberacao_linha"];
const rows=read("comparison-summary.json").rows;
summary.coverage=rows.reduce((r,x)=>(r[x.status]=(r[x.status]||0)+1,r),{});
summary.business=rows.filter(x=>business.includes(x.root));
summary.access=access.summary;
summary.access.sourceProfilesWithNoTargetAuth=access.details.filter(x=>!x.targetAuth.length).length;
summary.access.targetAuthWithoutProfile=access.users.filter(u=>!b.usuarios?.[u.uid]).length;
const counters=[];
function compareCounters(a,b,p=""){
  for(const k of Object.keys(a||{})){
    if(a[k]&&typeof a[k]==="object")compareCounters(a[k],b?.[k],p+"/"+k);
    else if(typeof a[k]==="number"&&a[k]!==b?.[k])counters.push({path:p+"/"+k,reference:a[k],target:b?.[k]??null});
  }
}
compareCounters(a.config?.contadores,b.config?.contadores);
summary.counterDifferences=counters;
fs.writeFileSync(path.join(out,"readiness-summary.json"),JSON.stringify(summary,null,2),{mode:0o600});
const cell=value=>'"'+String(value??"").replaceAll('"','""')+'"';
const accessRows=[["Email oficial","Estado","Perfis no destino","Identidades Auth","Perfis/UIDs destino"],...access.details.map(d=>[
  d.email,d.ready?"CONFERIDO_CONTA_E_PERFIL":"REGULARIZAR_OU_CONFIRMAR_OPERADOR",d.targetProfiles.length,d.targetAuth.length,d.targetProfiles.map(p=>p.role+":"+p.uid).join(" | ")
])];
fs.writeFileSync(path.join(out,"acessos-para-conferencia.csv"),"\ufeff"+accessRows.map(r=>r.map(cell).join(";")).join("\r\n"),{mode:0o600});
console.log(JSON.stringify({coverage:summary.coverage,access:summary.access,stock:summary.target,counters:summary.counterDifferences.length}));
