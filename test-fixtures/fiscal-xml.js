'use strict';
/* XMLs de teste do Fiscal (NF-e 4.00, CT-e 4.00, eventos, inutilização).
   A base real ainda não tem nenhum XML (medido em 17/11/2026: fin/notas_entrada vazio e as
   25 NFs de saída só digitadas), então estes XMLs seguem o leiaute oficial com dados
   fictícios no formato das operações da Kuryos. Quando a F0 trouxer XMLs reais, eles entram
   ao lado destes (anonimizados) e os testes passam a rodar contra os dois. */

const KURYOS = { cnpj: '00767554000119', ie: '116208437114', nome: 'KURYOS BEAUTY PACKING INDUSTRIAL LTDA', uf: 'SP', cMun: '3550308', xMun: 'SAO PAULO', lgr: 'RUA LAGOA TAI GRANDE', nro: '1130', bairro: 'VILA CARMOZINA', cep: '08270000' };
const FORN_SP = { cnpj: '11222333000181', ie: '110042490114', nome: 'EMBALAGENS PAULISTA LTDA', uf: 'SP', cMun: '3550308', xMun: 'SAO PAULO', lgr: 'AV INDUSTRIAL', nro: '500', bairro: 'MOOCA', cep: '03100000', crt: '3' };
const FORN_PR = { cnpj: '22333444000172', ie: '9012345678', nome: 'QUIMICA DO SUL S.A.', uf: 'PR', cMun: '4106902', xMun: 'CURITIBA', lgr: 'RUA DAS INDUSTRIAS', nro: '10', bairro: 'CIC', cep: '81000000', crt: '3' };
const FORN_SN = { cnpj: '33444555000163', ie: '206123456113', nome: 'ROTULOS PEQUENOS ME', uf: 'SP', cMun: '3518800', xMun: 'GUARULHOS', lgr: 'RUA A', nro: '1', bairro: 'CENTRO', cep: '07000000', crt: '1' };
const CLIENTE = { cnpj: '44555666000154', ie: '123456789110', nome: 'MARCA COSMETICOS LTDA', uf: 'SP', cMun: '3509502', xMun: 'CAMPINAS', lgr: 'RUA B', nro: '2', bairro: 'CENTRO', cep: '13000000', crt: '3' };
const TRANSP = { cnpj: '55666777000145', ie: '111222333119', nome: 'TRANSPORTES RAPIDOS LTDA', uf: 'SP', cMun: '3550308', xMun: 'SAO PAULO', lgr: 'RUA C', nro: '3', bairro: 'BRAS', cep: '03000000', crt: '3' };

function dv(ch43) {
  let t = 0, p = 2;
  for (let i = 42; i >= 0; i--) { t += (ch43.charCodeAt(i) - 48) * p; p = p === 9 ? 2 : p + 1; }
  const r = t % 11; return r < 2 ? 0 : 11 - r;
}
function chave(uf, aamm, cnpj, mod, serie, n, cod) {
  const c = String(uf) + aamm + cnpj + mod + String(serie).padStart(3, '0') + String(n).padStart(9, '0') + '1' + String(cod || 12345678).padStart(8, '0');
  return c + dv(c);
}
const f2 = (c) => (c / 100).toFixed(2);
function ender(p, tag) {
  return `<${tag}><xLgr>${p.lgr}</xLgr><nro>${p.nro}</nro><xBairro>${p.bairro}</xBairro><cMun>${p.cMun}</cMun><xMun>${p.xMun}</xMun><UF>${p.uf}</UF><CEP>${p.cep}</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></${tag}>`;
}
function icmsXml(i, vProd) {
  const ic = i.icms || { tipo: '00', aliq: 18 };
  const o = ic.orig || '0';
  if (ic.tipo === '00') { const v = Math.round(vProd * ic.aliq / 100); return { xml: `<ICMS><ICMS00><orig>${o}</orig><CST>00</CST><modBC>3</modBC><vBC>${f2(vProd)}</vBC><pICMS>${ic.aliq.toFixed(2)}</pICMS><vICMS>${f2(v)}</vICMS></ICMS00></ICMS>`, vBC: vProd, v }; }
  if (ic.tipo === '20') { const bc = Math.round(vProd * (100 - ic.red) / 100), v = Math.round(bc * ic.aliq / 100); return { xml: `<ICMS><ICMS20><orig>${o}</orig><CST>20</CST><modBC>3</modBC><pRedBC>${ic.red.toFixed(2)}</pRedBC><vBC>${f2(bc)}</vBC><pICMS>${ic.aliq.toFixed(2)}</pICMS><vICMS>${f2(v)}</vICMS></ICMS20></ICMS>`, vBC: bc, v }; }
  if (ic.tipo === '40' || ic.tipo === '41' || ic.tipo === '50') return { xml: `<ICMS><ICMS40><orig>${o}</orig><CST>${ic.tipo}</CST></ICMS40></ICMS>`, vBC: 0, v: 0 };
  if (ic.tipo === '51') return { xml: `<ICMS><ICMS51><orig>${o}</orig><CST>51</CST></ICMS51></ICMS>`, vBC: 0, v: 0 };
  if (ic.tipo === 'SN101') { const v = Math.round(vProd * ic.pCred / 100); return { xml: `<ICMS><ICMSSN101><orig>${o}</orig><CSOSN>101</CSOSN><pCredSN>${ic.pCred.toFixed(2)}</pCredSN><vCredICMSSN>${f2(v)}</vCredICMSSN></ICMSSN101></ICMS>`, vBC: 0, v: 0 }; }
  if (ic.tipo === 'SN102') return { xml: `<ICMS><ICMSSN102><orig>${o}</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>`, vBC: 0, v: 0 };
  throw new Error('icms ' + ic.tipo);
}
function ipiXml(i, vProd) {
  if (!i.ipi) return { xml: '', v: 0 };
  if (i.ipi.nt) return { xml: `<IPI><cEnq>999</cEnq><IPINT><CST>${i.ipi.nt}</CST></IPINT></IPI>`, v: 0 };
  const v = Math.round(vProd * i.ipi.aliq / 100);
  return { xml: `<IPI><cEnq>999</cEnq><IPITrib><CST>${i.ipi.cst || '50'}</CST><vBC>${f2(vProd)}</vBC><pIPI>${i.ipi.aliq.toFixed(2)}</pIPI><vIPI>${f2(v)}</vIPI></IPITrib></IPI>`, v };
}
/* o = {emit, dest, n, serie, data (AAAA-MM-DD), tpNF, itens:[{cProd,xProd,ncm,cfop,un,q,vUn,icms,ipi}], frete, dups:[[n,venc,valor]], cStat, natOp, fatura:true, finNFe} */
function nfe(o) {
  const x = Object.assign({ serie: 1, tpNF: '1', cStat: '100', natOp: 'VENDA', finNFe: '1', frete: 0 }, o);
  const aamm = x.data.slice(2, 4) + x.data.slice(5, 7);
  const ch = x.chave || chave(35, aamm, x.emit.cnpj, '55', x.serie, x.n, x.cod);
  let vProd = 0, vBC = 0, vICMS = 0, vIPI = 0, nItem = 0;
  const totFrete = x.frete || 0;
  const dets = x.itens.map((i) => {
    nItem++;
    const vp = Math.round(i.q * i.vUn * 100);
    const ic = icmsXml(i, vp), ip = ipiXml(i, vp);
    vProd += vp; vBC += ic.vBC; vICMS += ic.v; vIPI += ip.v;
    const frete = nItem === 1 && totFrete ? `<vFrete>${f2(totFrete)}</vFrete>` : '';
    return `<det nItem="${nItem}"><prod><cProd>${i.cProd}</cProd><cEAN>SEM GTIN</cEAN><xProd>${i.xProd}</xProd><NCM>${i.ncm}</NCM><CFOP>${i.cfop}</CFOP><uCom>${i.un}</uCom><qCom>${i.q.toFixed(4)}</qCom><vUnCom>${i.vUn.toFixed(10)}</vUnCom><vProd>${f2(vp)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${i.un}</uTrib><qTrib>${i.q.toFixed(4)}</qTrib><vUnTrib>${i.vUn.toFixed(10)}</vUnTrib>${frete}<indTot>1</indTot></prod>` +
      `<imposto>${ic.xml}${ip.xml}<PIS><PISAliq><CST>01</CST><vBC>${f2(vp)}</vBC><pPIS>1.65</pPIS><vPIS>${f2(Math.round(vp * 0.0165))}</vPIS></PISAliq></PIS><COFINS><COFINSAliq><CST>01</CST><vBC>${f2(vp)}</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>${f2(Math.round(vp * 0.076))}</vCOFINS></COFINSAliq></COFINS></imposto></det>`;
  }).join('');
  const vNF = vProd + vIPI + totFrete;
  const dups = (x.dups || []).map(([n, v, val]) => `<dup><nDup>${n}</nDup><dVenc>${v}</dVenc><vDup>${f2(val == null ? vNF : val)}</vDup></dup>`).join('');
  const cobr = x.dups ? `<cobr>${x.fatura === false ? '' : `<fat><nFat>${x.n}</nFat><vOrig>${f2(x.vFatura || vNF)}</vOrig><vDesc>0.00</vDesc><vLiq>${f2(x.vFatura || vNF)}</vLiq></fat>`}${dups}</cobr>` : '';
  const pessoa = (p, tag, end) => `<${tag}><CNPJ>${p.cnpj}</CNPJ><xNome>${p.nome}</xNome>${tag === 'emit' ? '<xFant>' + p.nome.split(' ')[0] + '</xFant>' : ''}${ender(p, end)}<IE>${p.ie}</IE>${tag === 'emit' ? '<CRT>' + (p.crt || '3') + '</CRT>' : '<indIEDest>1</indIEDest>'}</${tag}>`;
  const inf = `<infNFe Id="NFe${ch}" versao="4.00"><ide><cUF>35</cUF><cNF>12345678</cNF><natOp>${x.natOp}</natOp><mod>55</mod><serie>${x.serie}</serie><nNF>${x.n}</nNF><dhEmi>${x.data}T10:00:00-03:00</dhEmi><dhSaiEnt>${x.data}T11:00:00-03:00</dhSaiEnt><tpNF>${x.tpNF}</tpNF><idDest>${x.emit.uf === x.dest.uf ? 1 : 2}</idDest><cMunFG>${x.emit.cMun}</cMunFG><tpImp>1</tpImp><tpEmis>1</tpEmis><cDV>${ch.slice(-1)}</cDV><tpAmb>1</tpAmb><finNFe>${x.finNFe}</finNFe><indFinal>0</indFinal><indPres>9</indPres><procEmi>0</procEmi><verProc>1</verProc></ide>` +
    pessoa(x.emit, 'emit', 'enderEmit') + pessoa(x.dest, 'dest', 'enderDest') + dets +
    `<total><ICMSTot><vBC>${f2(vBC)}</vBC><vICMS>${f2(vICMS)}</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${f2(vProd)}</vProd><vFrete>${f2(totFrete)}</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>${f2(vIPI)}</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${f2(vNF)}</vNF></ICMSTot></total>` +
    `<transp><modFrete>${x.modFrete == null ? (totFrete ? '0' : '9') : x.modFrete}</modFrete></transp>${cobr}<pag><detPag><indPag>${x.dups ? 1 : 0}</indPag><tPag>${x.dups ? 15 : 90}</tPag><vPag>${f2(x.dups ? vNF : 0)}</vPag></detPag></pag><infAdic><infCpl>${x.infCpl || ''}</infCpl></infAdic></infNFe>`;
  const prot = x.cStat ? `<protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><verAplic>SP_NFE</verAplic><chNFe>${ch}</chNFe><dhRecbto>${x.data}T10:01:00-03:00</dhRecbto><nProt>135260000${String(x.n).padStart(6, '0')}</nProt><digVal>x</digVal><cStat>${x.cStat}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>` : '';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>` + (x.cStat ? `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><NFe xmlns="http://www.portalfiscal.inf.br/nfe">${inf}<Signature/></NFe>${prot}</nfeProc>` : `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${inf}</NFe>`);
  return { xml, chave: ch, vNF, vProd, vICMS, vIPI, vBC };
}
function cancelamento(ch, cnpj, data, seq) {
  return `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><evento versao="1.00"><infEvento Id="ID110111${ch}01"><cOrgao>35</cOrgao><tpAmb>1</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${ch}</chNFe><dhEvento>${data}T15:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>${seq || 1}</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>135260000000001</nProt><xJust>Erro na digitacao do pedido do cliente</xJust></detEvento></infEvento></evento><retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${ch}</chNFe><tpEvento>110111</tpEvento></infEvento></retEvento></procEventoNFe>`;
}
function cartaCorrecao(ch, cnpj, data) {
  return `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe versao="1.00" xmlns="http://www.portalfiscal.inf.br/nfe"><evento versao="1.00"><infEvento Id="ID110110${ch}01"><CNPJ>${cnpj}</CNPJ><chNFe>${ch}</chNFe><dhEvento>${data}T15:00:00-03:00</dhEvento><tpEvento>110110</tpEvento><nSeqEvento>1</nSeqEvento><detEvento versao="1.00"><descEvento>Carta de Correcao</descEvento><xCorrecao>Peso bruto correto 120 kg</xCorrecao></detEvento></infEvento></evento><retEvento versao="1.00"><infEvento><cStat>135</cStat></infEvento></retEvento></procEventoNFe>`;
}
function inutilizacao(cnpj, serie, ini, fim, data) {
  return `<?xml version="1.0" encoding="UTF-8"?><ProcInutNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><inutNFe versao="4.00"><infInut Id="ID35260${cnpj}55${String(serie).padStart(3, '0')}${String(ini).padStart(9, '0')}${String(fim).padStart(9, '0')}"><tpAmb>1</tpAmb><xServ>INUTILIZAR</xServ><cUF>35</cUF><ano>26</ano><CNPJ>${cnpj}</CNPJ><mod>55</mod><serie>${serie}</serie><nNFIni>${ini}</nNFIni><nNFFin>${fim}</nNFFin><xJust>Falha no sistema emissor pulou a numeracao</xJust></infInut></inutNFe><retInutNFe versao="4.00"><infInut><tpAmb>1</tpAmb><cStat>102</cStat><xMotivo>Inutilizacao homologada</xMotivo><dhRecbto>${data}T09:00:00-03:00</dhRecbto><nProt>135260000999999</nProt></infInut></retInutNFe></ProcInutNFe>`;
}
/* CT-e tomado pela Kuryos (destinatário paga: toma 3). */
function cte(o) {
  const x = Object.assign({ serie: 1, toma: '3', cfop: '5353', aliq: 12, cStat: '100' }, o);
  const aamm = x.data.slice(2, 4) + x.data.slice(5, 7);
  const ch = chave(35, aamm, x.emit.cnpj, '57', x.serie, x.n);
  const v = x.valor, icms = Math.round(v * x.aliq / 100);
  const p = (q, tag, end) => `<${tag}><CNPJ>${q.cnpj}</CNPJ><IE>${q.ie}</IE><xNome>${q.nome}</xNome>${ender(q, end)}</${tag}>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><cteProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/cte"><CTe><infCte Id="CTe${ch}" versao="4.00"><ide><cUF>35</cUF><CFOP>${x.cfop}</CFOP><natOp>PRESTACAO DE SERVICO</natOp><mod>57</mod><serie>${x.serie}</serie><nCT>${x.n}</nCT><dhEmi>${x.data}T08:00:00-03:00</dhEmi><tpCTe>0</tpCTe><cMunIni>${x.rem.cMun}</cMunIni><cMunFim>${x.dest.cMun}</cMunFim><toma3><toma>${x.toma}</toma></toma3></ide>` +
    p(x.emit, 'emit', 'enderEmit') + p(x.rem, 'rem', 'enderReme') + p(x.dest, 'dest', 'enderDest') +
    `<vPrest><vTPrest>${f2(v)}</vTPrest><vRec>${f2(v)}</vRec></vPrest><imp><ICMS><ICMS00><CST>00</CST><vBC>${f2(v)}</vBC><pICMS>${x.aliq.toFixed(2)}</pICMS><vICMS>${f2(icms)}</vICMS></ICMS00></ICMS></imp></infCte></CTe><protCTe versao="4.00"><infProt><chCTe>${ch}</chCTe><nProt>135260000777777</nProt><cStat>${x.cStat}</cStat></infProt></protCTe></cteProc>`;
  return { xml, chave: ch, valor: v, icms };
}

/* O mês de teste (nov/2026): uma de cada operação da §15 do PROMPT_FISCAL.md. */
function mesDeTeste() {
  const D = '2026-11-';
  const r = {};
  r.compraMp = nfe({ emit: FORN_SP, dest: KURYOS, n: 376202, data: D + '03', itens: [{ cProd: 'FR-200', xProd: 'FRASCO PET 200ML', ncm: '39233000', cfop: '5101', un: 'UN', q: 10000, vUn: 0.85, icms: { tipo: '00', aliq: 18 }, ipi: { aliq: 5 } }, { cProd: 'TP-24', xProd: 'TAMPA 24/410', ncm: '39235000', cfop: '5101', un: 'UN', q: 10000, vUn: 0.2, icms: { tipo: '00', aliq: 18 }, ipi: { aliq: 5 } }], dups: [['001', '2026-12-03'], ], frete: 15000 });
  r.compraPr = nfe({ emit: FORN_PR, dest: KURYOS, n: 4614, data: D + '04', itens: [{ cProd: 'GLI-99', xProd: 'GLICERINA BIDESTILADA', ncm: '15200010', cfop: '6101', un: 'KG', q: 500, vUn: 9.5, icms: { tipo: '00', aliq: 12 }, ipi: { nt: '53' } }], dups: [['1', '2026-12-04']] });
  r.usoConsumo = nfe({ emit: FORN_SP, dest: KURYOS, n: 366615, data: D + '05', itens: [{ cProd: 'LUVA-M', xProd: 'LUVA NITRILICA M', ncm: '40151900', cfop: '5102', un: 'CX', q: 20, vUn: 35, icms: { tipo: '00', aliq: 18 } }] });
  r.simples = nfe({ emit: FORN_SN, dest: KURYOS, n: 1199, data: D + '06', itens: [{ cProd: 'ROT-01', xProd: 'ROTULO ADESIVO 5X5', ncm: '48211000', cfop: '5101', un: 'MIL', q: 50, vUn: 40, icms: { tipo: 'SN101', pCred: 2.5 } }] });
  r.remessaCliente = nfe({ emit: CLIENTE, dest: KURYOS, n: 35200, data: D + '07', natOp: 'REMESSA PARA INDUSTRIALIZACAO', itens: [{ cProd: 'MC-ESS-01', xProd: 'ESSENCIA EXCLUSIVA MARCA', ncm: '33029019', cfop: '5901', un: 'KG', q: 50, vUn: 120, icms: { tipo: '50' } }, { cProd: 'MC-FR-01', xProd: 'FRASCO PERSONALIZADO MARCA', ncm: '70109000', cfop: '5901', un: 'UN', q: 5000, vUn: 1.5, icms: { tipo: '50' } }] });
  r.saidaEncomenda = nfe({ emit: KURYOS, dest: CLIENTE, n: 470, serie: 2, data: D + '20', natOp: 'INDUSTRIALIZACAO PARA TERCEIROS', itens: [
    { cProd: 'SKU-MC-100', xProd: 'COLONIA MARCA 100ML (INDUSTRIALIZACAO)', ncm: '33030020', cfop: '5124', un: 'UN', q: 5000, vUn: 3.2, icms: { tipo: '00', aliq: 18 }, ipi: { aliq: 10 } },
    { cProd: 'MC-ESS-01', xProd: 'RETORNO ESSENCIA APLICADA', ncm: '33029019', cfop: '5902', un: 'KG', q: 50, vUn: 120, icms: { tipo: '50' }, ipi: { nt: '55' } },
    { cProd: 'MC-FR-01', xProd: 'RETORNO FRASCO APLICADO', ncm: '70109000', cfop: '5902', un: 'UN', q: 5000, vUn: 1.5, icms: { tipo: '50' }, ipi: { nt: '55' } }], dups: [['1', '2026-12-20', 1760000]], vFatura: 1760000 });
  r.venda = nfe({ emit: KURYOS, dest: CLIENTE, n: 471, serie: 2, data: D + '21', itens: [{ cProd: 'SKU-K-50', xProd: 'SABONETE LIQUIDO 500ML', ncm: '34013000', cfop: '5101', un: 'UN', q: 1000, vUn: 6.5, icms: { tipo: '00', aliq: 18 }, ipi: { aliq: 5 } }], dups: [['1', '2026-12-21']] });
  r.vendaCancelada = nfe({ emit: KURYOS, dest: CLIENTE, n: 472, serie: 2, data: D + '22', itens: [{ cProd: 'SKU-K-50', xProd: 'SABONETE LIQUIDO 500ML', ncm: '34013000', cfop: '5101', un: 'UN', q: 10, vUn: 6.5, icms: { tipo: '00', aliq: 18 } }] });
  r.cancelamento = cancelamento(r.vendaCancelada.chave, KURYOS.cnpj, D + '22');
  r.cce = cartaCorrecao(r.venda.chave, KURYOS.cnpj, D + '22');
  r.inut = inutilizacao(KURYOS.cnpj, 2, 473, 474, D + '25');
  r.frete = cte({ emit: TRANSP, rem: FORN_SP, dest: KURYOS, n: 9001, data: D + '03', valor: 15000 });
  return r;
}

module.exports = { KURYOS, FORN_SP, FORN_PR, FORN_SN, CLIENTE, TRANSP, nfe, cte, cancelamento, cartaCorrecao, inutilizacao, chave, mesDeTeste };
