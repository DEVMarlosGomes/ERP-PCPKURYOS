"use strict";
// Prova de falha existente; não é um teste de proteção corrigida.
const {test}=require("node:test"),assert=require("node:assert/strict");
const browser=require("../../public/shared/expedicao"),server=require("../expedicao_regras");
function fixture(){return {
  estoque_lotes:{SKU:{L:{itemTipo:"produto",itemCodigo:"SKU",origemTipo:"legado_planilha",legado:true,identificadorPalete:"LEG-DEMO",saldoLote:10,dataValidade:"2026-01-01",enderecoKey:"E",opKey:"O",skuPedidoKeyOrigem:"1__SKU",skuPedidoKey:"1__SKU"}}},
  ops:{O:{status:"Concluído",sku:"SKU",skuPedidoKey:"1__SKU"}},pedidos:{"1__SKU":{id:"1",sku:"SKU",cliente:"CLIENTE DEMO",status:"Produção Parcial"}},
  pedidos_comerciais:{},conferencias_pa:{},enderecos_estoque:{E:{ativo:true}}
};}
test("P0 demonstrado: campo dataValidade vencido não bloqueia expedição atual",()=>{
  const base=fixture();
  assert.equal(browser.analisar(base,"SKU","L","2026-11-03").disponivel,true);
  assert.equal(server.analisar(base,"SKU","L","2026-11-03").disponivel,true);
});
test("controle: o mesmo lote é bloqueado se usa o campo legado validade",()=>{
  const base=fixture();base.estoque_lotes.SKU.L.validade="2026-01-01";
  assert.equal(browser.analisar(base,"SKU","L","2026-11-03").motivo,"Palete vencido");
  assert.equal(server.analisar(base,"SKU","L","2026-11-03").motivo,"Palete vencido");
});
