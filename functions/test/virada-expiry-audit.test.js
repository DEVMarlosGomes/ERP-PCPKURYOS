"use strict";
// Regressão: a prova original agora exige o bloqueio corrigido.
const {test}=require("node:test"),assert=require("node:assert/strict");
const browser=require("../../public/shared/expedicao"),server=require("../expedicao_regras");
function fixture(){return {
  estoque_lotes:{SKU:{L:{itemTipo:"produto",itemCodigo:"SKU",origemTipo:"legado_planilha",legado:true,identificadorPalete:"LEG-DEMO",saldoLote:10,dataValidade:"2026-01-01",enderecoKey:"E",opKey:"O",skuPedidoKeyOrigem:"1__SKU",skuPedidoKey:"1__SKU"}}},
  ops:{O:{status:"Concluído",sku:"SKU",skuPedidoKey:"1__SKU"}},pedidos:{"1__SKU":{id:"1",sku:"SKU",cliente:"CLIENTE DEMO",status:"Produção Parcial"}},
  pedidos_comerciais:{},conferencias_pa:{},enderecos_estoque:{E:{ativo:true}}
};}
test("campo dataValidade vencido bloqueia expedição no navegador e servidor",()=>{
  const base=fixture();
  assert.equal(browser.analisar(base,"SKU","L","2026-11-03").motivo,"Palete vencido");
  assert.equal(server.analisar(base,"SKU","L","2026-11-03").motivo,"Palete vencido");
});
for (const api of [browser,server]) {
  test('validade: aliases, fim do dia, datas inválidas e conflito conservador',()=>{
    assert.equal(api.validadeDoLote({validadeLote:'03/11/2026'}),'2026-11-03');
    assert.equal(api.validadeDoLote({dataValidade:'2026-02-30'}),null);
    assert.equal(api.validadeDoLote({dataValidade:'inválida'}),null);
    assert.equal(api.validadeDoLote({dataValidade:'2027-01-01',validade:'2026-01-01'}),'2026-01-01');
    const base=fixture();base.estoque_lotes.SKU.L.dataValidade='2026-11-03';
    assert.equal(api.analisar(base,'SKU','L','2026-11-03').disponivel,true);
    base.estoque_lotes.SKU.L.dataValidade='2026-02-30';
    assert.match(api.analisar(base,'SKU','L','2026-11-03').motivo,/inválida/);
  });
}
test("controle: o mesmo lote é bloqueado se usa o campo legado validade",()=>{
  const base=fixture();base.estoque_lotes.SKU.L.validade="2026-01-01";
  assert.equal(browser.analisar(base,"SKU","L","2026-11-03").motivo,"Palete vencido");
  assert.equal(server.analisar(base,"SKU","L","2026-11-03").motivo,"Palete vencido");
});
