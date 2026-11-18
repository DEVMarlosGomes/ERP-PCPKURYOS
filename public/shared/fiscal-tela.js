'use strict';
/* Fiscal — tela (PROMPT_FISCAL.md). Lê fis/ (documentos, regras, itens, apuração, arquivos,
   fechamentos, inventários); nunca lê fis_xml nem fis_arquivos (só o servidor). Tudo o que
   grava passa por callable: importação, cadastros, apuração, SPED, SINTEGRA, inventário,
   fechamento e transmissão. As contas moram no motor puro shared/fiscal.js. */
(function() {
  var db = firebase.database();
  var Fis = Fiscal;
  var fis = null, avisos = [];
  var S = { aba: 'docs', mes: null, filtroTipo: '', busca: '', previa: null, speds: {}, invData: null };

  function el(id) { return document.getElementById(id); }
  function e(v) { return escapeHtml(String(v == null ? '' : v)); }
  function brl(c) {
    if (c == null || !isFinite(c)) return '<span class="mut">—</span>';
    if (c === 0) c = 0;
    var t = 'R$ ' + (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return c < 0 ? '<span class="neg">' + t + '</span>' : t;
  }
  function dataBR(v) { var s = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : '—'; }
  function mesBR(m) { var n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return m ? n[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4) : '—'; }
  function hojeISO() { return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); }
  function mesMenos(m, k) { var a = Number(m.slice(0, 4)), x = Number(m.slice(5, 7)) - k; while (x < 1) { x += 12; a--; } while (x > 12) { x -= 12; a++; } return a + '-' + (x < 10 ? '0' : '') + x; }
  function ehAdm() { return (window.currentUser || {}).role === 'admin'; }
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(function() { t.remove(); }, 4800); }
  function erroMsg(err) { return (err && (err.message || err.code)) || String(err); }
  function chamar(nome, dados) { return firebase.functions().httpsCallable(nome)(dados).then(function(r) { return r.data; }); }
  function kpi(cls, r, v, d) { return '<div class="kpi ' + cls + '"><div class="r">' + r + '</div><div class="v">' + v + '</div><div class="d">' + (d || '') + '</div></div>'; }
  function abrir(t, h) { el('dlgT').innerHTML = '<h2>' + t + '</h2>'; el('dlgB').innerHTML = h; var d = el('dlg'); if (!d.open) d.showModal(); }
  el('dlgX').addEventListener('click', function() { el('dlg').close(); });
  function travar(b, p) { b.disabled = true; return p.then(function(r) { b.disabled = false; return r; }, function(err) { b.disabled = false; toast(erroMsg(err)); throw err; }); }
  function baixarBlob(nome, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  // O SPED e o SINTEGRA são ISO-8859-1: cada caractere vira um byte (o motor já trocou o que não cabe por "?").
  function latin1Bytes(t) { var s = String(t), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); b[i] = c < 256 ? c : 63; } return b; }
  function baixarLatin1(nome, texto) { baixarBlob(nome, new Blob([latin1Bytes(texto)], { type: 'text/plain;charset=iso-8859-1' })); }
  function baixarCsv(nome, texto) { baixarBlob(nome, new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' })); }
  var jszip = null;
  function carregarJsZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (jszip) return jszip;
    jszip = new Promise(function(ok, falha) { var s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'; s.onload = function() { ok(window.JSZip); }; s.onerror = function() { jszip = null; falha(new Error('Não foi possível carregar o leitor de ZIP.')); }; document.head.appendChild(s); });
    return jszip;
  }

  /* ── Carga ─────────────────────────────────────────────────────────────── */
  function escutar() {
    dbOnValue(db.ref('fis'), function(s) { fis = s.val() || {}; montarMeses(); render(); },
      { onError: function(err) { fis = {}; avisos.push('fis: ' + erroMsg(err)); montarMeses(); render(); } });
  }
  function docs() { return fis.documentos || {}; }
  function estab() { return Object.assign({ cnpj: Fis.CNPJ_KURYOS }, fis.estabelecimento || {}); }
  function ctx() { return { estab: estab(), regras: fis.regras_entrada || {}, itens: fis.itens || {}, dePara: fis.de_para_itens || {} }; }
  function montarMeses() {
    var atual = hojeISO().slice(0, 7), ms = {};
    ms[atual] = 1; ms[mesMenos(atual, 1)] = 1;
    Object.keys(docs()).forEach(function(k) { var m = Fis.mesDoDocumento(docs()[k]); if (m) ms[m] = 1; });
    var lista = Object.keys(ms).sort().reverse();
    if (!S.mes) S.mes = mesMenos(atual, 1);
    el('selMes').innerHTML = lista.map(function(m) { var f = (fis.fechamentos || {})[m]; return '<option value="' + m + '"' + (m === S.mes ? ' selected' : '') + '>' + mesBR(m) + (f && f.status === 'FECHADO' ? ' · fechado' : '') + '</option>'; }).join('');
    el('sDot').classList.add('on'); el('sTxt').textContent = 'Ao vivo · ' + Object.keys(docs()).length + ' documentos';
  }
  function fechado() { var f = (fis.fechamentos || {})[S.mes]; return !!(f && f.status === 'FECHADO'); }
  function livroDoMes() { return Fis.livro(docs(), S.mes, ctx()); }

  function render() {
    if (!fis) return;
    Array.prototype.forEach.call(document.querySelectorAll('.aba'), function(b) { b.setAttribute('aria-selected', b.dataset.aba === S.aba ? 'true' : 'false'); });
    var h = avisos.length ? '<div class="alerta warn"><div>' + avisos.map(e).join('<br>') + '</div></div>' : '';
    if (fechado()) { var f = fis.fechamentos[S.mes]; h += '<div class="alerta info"><div><b>' + mesBR(S.mes) + ' está fechado</b> (' + dataBR(f.fechadoEm) + ', ' + e(f.fechadoPor) + '). Documentos, apuração e arquivo do mês não mudam; para retificar, o ADM reabre.</div></div>'; }
    if (!estab().regime) h += '<div class="alerta warn"><div><b>Regime tributário ainda não definido.</b> O SPED não sai enquanto o regime (Normal ou Simples) não for informado em Estabelecimento: é decisão do Marlos com o contador.</div></div>';
    h += ({ docs: abaDocs, regras: abaRegras, itens: abaItens, livros: abaLivros, apuracao: abaApuracao, sped: abaSped, sintegra: abaSintegra, inventario: abaInventario, dominio: abaDominio, estab: abaEstab }[S.aba] || abaDocs)();
    el('conteudo').innerHTML = h;
  }

  /* ── Documentos ────────────────────────────────────────────────────────── */
  var ROT_SIT = { '00': ['ok', 'autorizada'], '02': ['mute', 'cancelada'], '04': ['mute', 'denegada'], '05': ['mute', 'inutilizada'], SEM_PROTOCOLO: ['warn', 'sem protocolo'] };
  function tipoDoc(d) { return d.tipo === 'INUT' ? 'Inutilização' : d.tipo === 'CTE' ? 'CT-e' : d.indOper === '1' ? 'Saída' : d.indEmit === '0' ? 'Entrada própria' : 'Entrada'; }
  function abaDocs() {
    var lista = Object.keys(docs()).map(function(k) { return Object.assign({ k: k }, docs()[k]); }).filter(function(d) { return Fis.mesDoDocumento(d) === S.mes; });
    var q = S.busca.toUpperCase();
    var vis = lista.filter(function(d) {
      if (S.filtroTipo && tipoDoc(d) !== S.filtroTipo) return false;
      if (!q) return true;
      var p = d.participante || {};
      return (String(d.numero || d.ini || '') + ' ' + (p.nome || '') + ' ' + (p.cnpj || '') + ' ' + d.k).toUpperCase().indexOf(q) >= 0;
    }).sort(function(a, b) { return String(Fis.dataEscrituracao(a)).localeCompare(String(Fis.dataEscrituracao(b))) || String(a.numero).localeCompare(String(b.numero)); });
    var soma = function(f) { return lista.filter(f).reduce(function(s, d) { return s + ((d.totais || {}).vNF || (d.totais || {}).vTPrest || 0); }, 0); };
    var h = '<div class="card"><h3>Importar XML</h3><div class="sub" style="margin-bottom:8px">NF-e (entrada e saída exportada do emissor), CT-e, eventos (cancelamento, carta de correção) e inutilizações. Vários arquivos ou um <b>ZIP</b>. O mesmo XML de novo não duplica; outro conteúdo com a mesma chave é recusado (XML é imutável). A NF-e de entrada também vira a nota do Financeiro (um upload só).</div>' +
      '<input type="file" id="xmlArquivos" multiple accept=".xml,.zip,text/xml,application/zip"' + (fechado() ? '' : '') + '>' +
      (S.previa ? previaHtml() : '') + '</div>';
    h += '<div class="kpis">' + kpi('', 'Entradas', lista.filter(function(d) { return d.indOper === '0' && d.tipo === 'NFE'; }).length, brl(soma(function(d) { return d.indOper === '0' && d.tipo === 'NFE' && d.situacao === '00'; }))) +
      kpi('', 'Saídas', lista.filter(function(d) { return d.indOper === '1' && d.tipo === 'NFE'; }).length, brl(soma(function(d) { return d.indOper === '1' && d.tipo === 'NFE' && d.situacao === '00'; }))) +
      kpi('', 'CT-e', lista.filter(function(d) { return d.tipo === 'CTE'; }).length, brl(soma(function(d) { return d.tipo === 'CTE'; }))) +
      kpi(lista.some(function(d) { return d.situacao !== '00' && d.tipo !== 'INUT'; }) ? 'warn' : '', 'Canceladas / inutilizadas', lista.filter(function(d) { return d.situacao === '02' || d.tipo === 'INUT'; }).length, '') + '</div>';
    h += '<div class="card"><div class="barra"><h3 style="margin:0">Documentos de ' + mesBR(S.mes) + '</h3><div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<select class="sel" id="fTipo"><option value="">Todos</option>' + ['Entrada', 'Saída', 'Entrada própria', 'CT-e', 'Inutilização'].map(function(t) { return '<option' + (S.filtroTipo === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
      '<input class="inp" id="fBusca" placeholder="Número, participante ou CNPJ" value="' + e(S.busca) + '"></div></div>';
    if (!vis.length) h += '<div class="vazio"><b>Nenhum documento neste mês.</b>Importe os XMLs do mês (entradas do fornecedor, saídas exportadas do emissor, CT-e e eventos).</div>';
    else h += '<div class="tw"><table><thead><tr><th>Data</th><th>Tipo</th><th>Número</th><th>Participante</th><th>CFOP</th><th class="n">Valor</th><th>Situação</th></tr></thead><tbody>' +
      vis.map(function(d) {
        var p = d.participante || {}, sit = ROT_SIT[d.tipo === 'INUT' ? '05' : d.situacao] || ['warn', d.situacao || '?'];
        var cfops = d.tipo === 'CTE' ? d.cfop : d.tipo === 'INUT' ? '' : Object.keys((d.itens || []).reduce(function(o, i) { o[i.cfop] = 1; return o; }, {})).join(', ');
        return '<tr data-doc="' + e(d.k) + '" style="cursor:pointer"><td>' + dataBR(Fis.dataEscrituracao(d)) + '</td><td>' + tipoDoc(d) + '</td><td>' + e(d.tipo === 'INUT' ? d.ini + '–' + d.fim : d.numero) + (d.serie && d.serie !== '0' ? '/' + e(d.serie) : '') + '</td>' +
          '<td>' + e(p.nome || (d.tipo === 'INUT' ? 'Faixa inutilizada' : '')) + '</td><td>' + e(cfops) + '</td><td class="n">' + (d.totais ? brl(d.totais.vNF != null ? d.totais.vNF : d.totais.vTPrest) : '—') + '</td>' +
          '<td><span class="tg ' + sit[0] + '">' + sit[1] + '</span>' + ((d.avisos || []).length ? ' <span class="tg warn" title="' + e(d.avisos.join(' | ')) + '">aviso</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    return h + '</div>';
  }
  function previaHtml() {
    var p = S.previa, novos = p.filter(function(x) { return x.r.ok && !x.repetido; }).length;
    return '<div class="tw" style="margin-top:10px"><table><thead><tr><th>Arquivo</th><th>Tipo</th><th>Documento</th><th>Situação</th></tr></thead><tbody>' +
      p.map(function(x) {
        var r = x.r, d = r.doc, t = !r.ok ? '<span class="tg warn">' + e(r.motivo) + '</span>' : x.repetido ? '<span class="tg mute">já importado</span>' : x.foraEmpresa ? '<span class="tg warn">' + e(x.foraEmpresa) + '</span>' : '<span class="tg ok">novo</span>';
        var desc = !r.ok ? '' : r.tipo === 'EVENTO' ? 'Evento ' + r.evento.tpEvento + ' · ' + r.evento.chave.slice(25, 34).replace(/^0+/, '') : r.tipo === 'INUT' ? 'Inutilização ' + r.inut.ini + '–' + r.inut.fim : (r.tipo === 'CTE' ? 'CT-e ' : 'NF ') + d.numero + ' · ' + ((d.emitente || {}).nome || '') + ' · ' + brl((d.totais || {}).vNF != null ? d.totais.vNF : (d.totais || {}).vTPrest);
        return '<tr><td>' + e(x.nome) + '</td><td>' + e(r.tipo || '') + '</td><td>' + desc + '</td><td>' + t + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="barra" style="margin-top:8px"><button class="btn pri" id="xmlImportar"' + (novos ? '' : ' disabled') + '>Importar ' + novos + ' arquivo(s)</button><button class="btn" id="xmlCancelar">Cancelar</button></div>';
  }
  function lerArquivos(files) {
    var lidos = [];
    return Promise.all(Array.prototype.slice.call(files, 0, 500).map(function(f) {
      if (/\.zip$/i.test(f.name)) {
        return carregarJsZip().then(function(Z) { return Z.loadAsync(f); }).then(function(z) {
          var ps = [];
          z.forEach(function(caminho, ent) { if (!ent.dir && /\.xml$/i.test(caminho)) ps.push(ent.async('string').then(function(t) { lidos.push({ nome: caminho.split('/').pop(), texto: t }); })); });
          return Promise.all(ps);
        });
      }
      return new Promise(function(ok) { var r = new FileReader(); r.onload = function() { lidos.push({ nome: f.name, texto: String(r.result || '') }); ok(); }; r.onerror = function() { ok(); }; r.readAsText(f, 'utf-8'); });
    })).then(function() { return lidos; });
  }
  function montarPrevia(lidos) {
    var vistos = {}, est = estab();
    S.previa = lidos.map(function(x) {
      var r = Fis.lerXml(x.texto), out = { nome: x.nome, texto: x.texto, r: r };
      if (!r.ok) return out;
      var k = r.tipo === 'EVENTO' ? r.evento.chave + '|' + r.evento.tpEvento + '|' + r.evento.nSeq : r.tipo === 'INUT' ? r.inut.chave : r.doc.chave;
      var ja = r.tipo === 'EVENTO' ? !!(((docs()[r.evento.chave] || {}).eventos || {})[r.evento.tpEvento + '_' + r.evento.nSeq]) : !!docs()[k];
      out.repetido = ja || !!vistos[k]; vistos[k] = 1;
      if (r.tipo === 'NFE' || r.tipo === 'CTE') { var rel = Fis.relativo(r.doc, est.cnpj); if (!rel.ok) out.foraEmpresa = rel.motivo; }
      return out;
    });
    render();
  }
  function importar(btn) {
    var envio = S.previa.filter(function(x) { return x.r.ok && !x.repetido && !x.foraEmpresa; }).map(function(x) { return { nome: x.nome, texto: x.texto }; });
    var lotes = [], atual = [], tam = 0;
    envio.forEach(function(a) { if (atual.length >= 40 || tam + a.texto.length > 7e6) { lotes.push(atual); atual = []; tam = 0; } atual.push(a); tam += a.texto.length; });
    if (atual.length) lotes.push(atual);
    var resultados = [];
    btn.disabled = true;
    lotes.reduce(function(p, l) { return p.then(function() { return chamar('fisImportarXml', { arquivos: l }).then(function(r) { resultados = resultados.concat(r.resultados || []); }); }); }, Promise.resolve()).then(function() {
      S.previa = null;
      var okN = resultados.filter(function(x) { return x.ok && !x.repetido; }).length, err = resultados.filter(function(x) { return !x.ok; });
      if (err.length) abrir('Importação de XML', '<p>' + okN + ' importado(s). ' + err.length + ' recusado(s):</p><div class="tw"><table><thead><tr><th>Arquivo</th><th>Motivo</th></tr></thead><tbody>' + err.map(function(x) { return '<tr><td>' + e(x.arquivo) + '</td><td>' + e(x.motivo) + '</td></tr>'; }).join('') + '</tbody></table></div>');
      else toast(okN + ' documento(s) importado(s).');
      render();
    }, function(err) { btn.disabled = false; toast(erroMsg(err)); });
  }
  function detalheDoc(k) {
    var d = docs()[k]; if (!d) return;
    var p = d.participante || {}, h = '<div class="sub" style="margin-bottom:8px">Chave ' + e(d.chave || k) + ' · emissão ' + dataBR(d.emissao) + (d.saidaEntrada ? ' · saída/entrada ' + dataBR(d.saidaEntrada) : '') + '</div>';
    h += '<div class="form"><div><label>Participante</label><div>' + e(p.nome || '') + '<br><span class="mut">' + e(p.cnpj || p.cpf || '') + ' · IE ' + e(p.ie || '—') + ' · ' + e(p.mun || '') + '/' + e(p.uf || '') + ' (IBGE ' + e(p.codMun || '—') + ')</span></div></div>' +
      '<div><label>Natureza</label><div>' + e(d.natOp || '') + '</div></div></div>';
    if (d.tipo === 'NFE') {
      h += '<div class="tw" style="margin-top:8px"><table><thead><tr><th>#</th><th>Produto</th><th>NCM</th><th>CFOP</th><th>CST</th><th class="n">Qtd</th><th class="n">Valor</th><th class="n">Base ICMS</th><th class="n">ICMS</th><th class="n">IPI</th></tr></thead><tbody>' +
        (d.itens || []).map(function(i) { var ic = i.icms || {}, ip = i.ipi || {}; return '<tr><td>' + i.n + '</td><td>' + e(i.cProd + ' · ' + i.xProd) + '</td><td>' + e(i.ncm || '—') + '</td><td>' + e(i.cfop) + '</td><td>' + e(Fis.cstIcms(ic) || (ic.csosn ? 'SN ' + ic.csosn : '—')) + '</td><td class="n">' + e(i.qCom) + ' ' + e(i.uCom || '') + '</td><td class="n">' + brl(i.vProd) + '</td><td class="n">' + brl(ic.vBC) + '</td><td class="n">' + brl(ic.vICMS) + '</td><td class="n">' + brl(ip.vIPI) + '</td></tr>'; }).join('') +
        '</tbody></table></div><div class="sub" style="margin-top:6px">Total da nota ' + brl(d.totais.vNF) + ' · ICMS ' + brl(d.totais.vICMS) + ' · IPI ' + brl(d.totais.vIPI) + ' · frete ' + brl(d.totais.vFrete) + (d.totais.vIBS || d.totais.vCBS ? ' · IBS ' + brl(d.totais.vIBS) + ' · CBS ' + brl(d.totais.vCBS) + ' (guardados, fora do ICMS)' : '') + '</div>';
      if (d.valorCobrado) h += '<div class="alerta info" style="margin-top:8px"><div><b>Valor cobrado ' + brl(d.valorCobrado.valorCentavos) + '</b> (' + e({ FATURA: 'fatura do XML', DUPLICATAS: 'duplicatas', ITENS_RECEITA: 'itens que são receita', VNF: 'total da nota' }[d.valorCobrado.fonte] || d.valorCobrado.fonte) + ')' +
        (d.receita ? ' · receita: venda ' + brl(d.receita.vendaCentavos) + ', industrialização ' + brl(d.receita.industrializacaoCentavos) + ', retorno simbólico ' + brl(d.receita.simbolicoCentavos) + ' (não é receita nem recebível)' : '') + '</div></div>';
      if (d.indEmit === '1' && d.indOper === '0' && !fechado()) h += '<div class="barra" style="margin-top:10px"><label>Data de entrada <input class="inp" type="date" id="dtEnt" value="' + e(d.dataEntradaInformada || d.saidaEntrada || d.emissao) + '"></label><button class="btn sm" id="dtEntOk" data-chave="' + e(k) + '">Salvar data de entrada</button><span class="mut">A entrada vai para o livro do mês desta data.</span></div>';
    } else if (d.tipo === 'CTE') {
      h += '<p>CFOP ' + e(d.cfop) + ' · valor da prestação ' + brl(d.totais.vTPrest) + ' · ICMS ' + brl(d.totais.vICMS) + ' (' + e(d.totais.pICMS) + '%) · tomador ' + e({ '0': 'remetente', '1': 'expedidor', '2': 'recebedor', '3': 'destinatário', '4': 'outros' }[d.toma] || d.toma) + '</p>';
    }
    var evs = d.eventos || {};
    if (Object.keys(evs).length) h += '<h3 style="margin-top:12px">Eventos</h3>' + Object.keys(evs).map(function(x) { var v = evs[x]; return '<div class="chk"><span>' + e(v.tpEvento) + ' · ' + e(v.descricao) + '</span><span>' + dataBR(v.dhEvento) + ' ' + e(v.justificativa || v.correcao || '') + '</span></div>'; }).join('');
    if ((d.avisos || []).length) h += '<div class="alerta warn" style="margin-top:8px"><div>' + d.avisos.map(e).join('<br>') + '</div></div>';
    abrir(tipoDoc(d) + ' ' + e(d.numero || ''), h);
  }

  /* ── Regras de entrada ─────────────────────────────────────────────────── */
  function cfopsSemRegra() {
    var regras = fis.regras_entrada || {}, out = {};
    Object.keys(docs()).forEach(function(k) {
      var d = docs()[k]; if (!d || d.indEmit !== '1' || d.indOper !== '0' || Fis.mesDoDocumento(d) !== S.mes) return;
      var cs = d.tipo === 'CTE' ? [d.cfop] : (d.itens || []).map(function(i) { return i.cfop; });
      cs.forEach(function(c) { if (c && !Fis.regraDoItem(regras, c, {})) out[c] = (out[c] || 0) + 1; });
    });
    return out;
  }
  function abaRegras() {
    var regras = fis.regras_entrada || {}, ks = Object.keys(regras).sort(), sem = cfopsSemRegra(), cs = Object.keys(sem).sort();
    var h = '';
    if (cs.length) h += '<div class="card"><h3>CFOPs do mês sem regra</h3><div class="sub" style="margin-bottom:8px">Sem regra, a nota não entra no livro: é a inconsistência do WebMais "Todas as CFOPs dos itens devem estar definidas para gerar livro". Escolha o uso do item e aplique a sugestão (você revisa depois).</div><div class="tw"><table><thead><tr><th>CFOP do fornecedor</th><th class="n">Itens</th><th>Uso do item na Kuryos</th><th>Sugestão</th></tr></thead><tbody>' +
      cs.map(function(c) { var s = Fis.sugerirRegra(c, '01', estab().regime) || {}; return '<tr><td>' + e(c) + '</td><td class="n">' + sem[c] + '</td><td><select class="sel" data-sug-tipo="' + e(c) + '">' + Object.keys(Fis.TIPOS_ITEM).map(function(t) { return '<option value="' + t + '"' + (t === (/^[56]35/.test(c) ? '09' : '01') ? ' selected' : '') + '>' + t + ' ' + e(Fis.TIPOS_ITEM[t]) + '</option>'; }).join('') + '</select></td><td>' + e(s.cfopEntrada || '—') + (s.creditaICMS ? ' · credita ICMS' : ' · sem crédito') + '</td></tr>'; }).join('') +
      '</tbody></table></div><button class="btn pri" id="regSugerir" style="margin-top:8px">Aplicar a sugestão às ' + cs.length + ' CFOP(s)</button></div>';
    h += '<div class="card"><h3>Regras de entrada</h3><div class="sub" style="margin-bottom:8px">CFOP do fornecedor (+ CST, NCM ou fornecedor, quando precisar) → CFOP de entrada, se gera livro, se credita ICMS/IPI, o tipo do item e de quem é o material. A mais específica vence. Mudar uma regra muda o livro dos meses abertos; mês fechado não muda.</div>';
    h += ks.length ? '<div class="tw"><table><thead><tr><th>Regra</th><th>CFOP entrada</th><th>Gera livro</th><th>Crédito</th><th>Tipo do item</th><th>Material</th><th>Restrição</th><th></th></tr></thead><tbody>' +
      ks.map(function(k) { var r = regras[k]; return '<tr' + (r.ativo === false ? ' style="opacity:.55"' : '') + '><td><b>' + e(k) + '</b>' + (r.sugerida ? ' <span class="tg info">sugerida</span>' : '') + '</td><td>' + e(r.cfopEntrada) + '</td><td>' + (r.geraLivro ? 'sim' : '<b>não</b>') + '</td><td>' + (r.creditaICMS ? 'ICMS' : '') + (r.creditaICMS && r.creditaIPI ? ' + ' : '') + (r.creditaIPI ? 'IPI' : '') + (!r.creditaICMS && !r.creditaIPI ? '<span class="mut">sem crédito</span>' : '') + '</td><td>' + e(r.tipoItem + ' ' + (Fis.TIPOS_ITEM[r.tipoItem] || '')) + '</td><td>' + (r.propriedade === 'CLIENTE' ? '<span class="tg warn">do cliente</span>' : 'próprio') + '</td><td>' + e([r.fornecedor ? 'forn. ' + r.fornecedor : '', r.ncm ? 'NCM ' + r.ncm : '', r.cst ? 'CST ' + r.cst : ''].filter(Boolean).join(' · ')) + '</td><td><button class="btn sm" data-reg-edit="' + e(k) + '">Editar</button> <button class="btn sm" data-reg-ativo="' + e(k) + '" data-v="' + (r.ativo === false ? '1' : '0') + '">' + (r.ativo === false ? 'Ativar' : 'Inativar') + '</button></td></tr>'; }).join('') + '</tbody></table></div>'
      : '<div class="vazio"><b>Nenhuma regra ainda.</b>Importe os XMLs do mês e use a sugestão acima.</div>';
    h += '<h3 style="margin-top:14px">Nova regra / editar</h3><div class="form">' +
      '<div><label for="rgOrig">CFOP do fornecedor</label><input class="inp" id="rgOrig" placeholder="5101"></div><div><label for="rgVar">Variante</label><input class="inp" id="rgVar" placeholder="A"></div>' +
      '<div><label for="rgEnt">CFOP de entrada</label><input class="inp" id="rgEnt" placeholder="1101"></div>' +
      '<div><label for="rgTipo">Tipo do item</label><select class="sel" id="rgTipo">' + Object.keys(Fis.TIPOS_ITEM).map(function(t) { return '<option value="' + t + '">' + t + ' ' + e(Fis.TIPOS_ITEM[t]) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="rgProp">Material</label><select class="sel" id="rgProp"><option value="PROPRIA">próprio</option><option value="CLIENTE">do cliente (encomenda)</option></select></div>' +
      '<div><label for="rgForn">Só deste fornecedor (CNPJ)</label><input class="inp" id="rgForn"></div><div><label for="rgNcm">Só este NCM</label><input class="inp" id="rgNcm"></div><div><label for="rgCst">Só este CST</label><input class="inp" id="rgCst"></div>' +
      '<div><label><input type="checkbox" id="rgLivro" checked> gera livro</label><label><input type="checkbox" id="rgIcms" checked> credita ICMS</label><label><input type="checkbox" id="rgIpi"> credita IPI</label></div></div>' +
      '<button class="btn pri" id="rgSalvar" style="margin-top:8px">Salvar regra</button></div>';
    return h;
  }

  /* ── Itens fiscais e de-para ───────────────────────────────────────────── */
  function abaItens() {
    var itens = fis.itens || {}, ks = Object.keys(itens).sort(), dp = fis.de_para_itens || {};
    var lv = livroDoMes(), semDp = {};
    lv.linhas.forEach(function(l) { (l.itens || []).forEach(function(i) { if (i.autoItem) semDp[i.codItem] = { forn: ((l.participante || {}).cnpj) || '', cProd: String(i.codItem).split('-').slice(1).join('-'), descr: i.descr, ncm: i.ncm, un: i.un, tipo: i.tipoItem }; }); });
    var h = '<div class="card"><h3>Itens fiscais (0200)</h3><div class="sub" style="margin-bottom:8px">O item da Kuryos no SPED: código, unidade de inventário, tipo, NCM e as conversões de unidade (0220). Ligue cada item ao material do cadastro para o inventário (Bloco H) sair com o NCM certo.</div>';
    h += ks.length ? '<div class="tw"><table><thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Tipo</th><th>NCM</th><th>Material</th><th>Conversões</th><th></th></tr></thead><tbody>' +
      ks.map(function(k) { var i = itens[k]; return '<tr><td>' + e(i.codigo) + '</td><td>' + e(i.descr) + '</td><td>' + e(i.un) + '</td><td>' + e(i.tipoItem) + '</td><td>' + e(i.ncm || '—') + '</td><td>' + e(i.material || '—') + '</td><td>' + e(Object.keys(i.conversoes || {}).map(function(u) { return u + '=' + i.conversoes[u]; }).join('; ')) + '</td><td><button class="btn sm" data-item-edit="' + e(k) + '">Editar</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="vazio"><b>Nenhum item fiscal.</b>Sem cadastro, a entrada usa o código do fornecedor (aviso) e o inventário não sai.</div>';
    h += '<div class="form" style="margin-top:10px"><div><label for="itCod">Código</label><input class="inp" id="itCod"></div><div><label for="itDescr">Descrição</label><input class="inp" id="itDescr"></div><div><label for="itUn">Unidade de inventário</label><input class="inp" id="itUn" placeholder="UN"></div>' +
      '<div><label for="itTipo">Tipo</label><select class="sel" id="itTipo">' + Object.keys(Fis.TIPOS_ITEM).map(function(t) { return '<option value="' + t + '">' + t + ' ' + e(Fis.TIPOS_ITEM[t]) + '</option>'; }).join('') + '</select></div>' +
      '<div><label for="itNcm">NCM</label><input class="inp" id="itNcm" placeholder="8 dígitos"></div><div><label for="itCest">CEST</label><input class="inp" id="itCest"></div><div><label for="itMat">Material (key do cadastro)</label><input class="inp" id="itMat" placeholder="EP-0001"></div>' +
      '<div><label for="itConv">Conversões (0220)</label><input class="inp" id="itConv" placeholder="CX=12; MIL=1000"></div></div><button class="btn pri" id="itSalvar" style="margin-top:8px">Salvar item</button></div>';
    var semKs = Object.keys(semDp);
    if (semKs.length) h += '<div class="card"><h3>Itens do mês sem de-para</h3><div class="sub" style="margin-bottom:8px">Entraram com o código do fornecedor. Ligue cada um ao item da Kuryos (e o fator, quando a unidade for diferente).</div><div class="tw"><table><thead><tr><th>Código usado</th><th>Descrição</th><th>Un.</th><th>NCM</th><th></th></tr></thead><tbody>' +
      semKs.map(function(k) { var x = semDp[k]; return '<tr><td>' + e(k) + '</td><td>' + e(x.descr) + '</td><td>' + e(x.un) + '</td><td>' + e(x.ncm || '') + '</td><td><button class="btn sm" data-dp-novo="' + e(k) + '">Ligar a um item</button></td></tr>'; }).join('') + '</tbody></table></div></div>';
    var linhas = [];
    Object.keys(dp).forEach(function(c) { Object.keys(dp[c] || {}).forEach(function(p) { linhas.push({ c: c, p: p, v: dp[c][p] }); }); });
    h += '<div class="card"><h3>De-para do fornecedor</h3>' + (linhas.length ? '<div class="tw"><table><thead><tr><th>Fornecedor</th><th>Código dele</th><th>Item Kuryos</th><th class="n">Fator</th></tr></thead><tbody>' + linhas.map(function(l) { return '<tr><td>' + e(l.c) + '</td><td>' + e(l.p) + '</td><td>' + e(l.v.item) + '</td><td class="n">' + e(l.v.fator) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="mut">Nenhum de-para.</div>') +
      '<div class="form" style="margin-top:10px"><div><label for="dpForn">CNPJ do fornecedor</label><input class="inp" id="dpForn"></div><div><label for="dpProd">Código do fornecedor</label><input class="inp" id="dpProd"></div><div><label for="dpItem">Item Kuryos</label><input class="inp" id="dpItem" list="dlItens"><datalist id="dlItens">' + ks.map(function(k) { return '<option value="' + e(itens[k].codigo) + '">' + e(itens[k].descr) + '</option>'; }).join('') + '</datalist></div><div><label for="dpFator">Fator (1 do fornecedor = ? da Kuryos)</label><input class="inp" id="dpFator" value="1"></div></div><button class="btn pri" id="dpSalvar" style="margin-top:8px">Salvar de-para</button></div>';
    return h;
  }

  /* ── Livros ────────────────────────────────────────────────────────────── */
  function abaLivros() {
    var lv = livroDoMes(), r = lv.receita;
    var h = '<div class="kpis">' + kpi('', 'Receita (venda + industrialização)', brl(r.receitaCentavos), 'venda ' + brl(r.vendaCentavos)) + kpi('', 'Industrialização 5124/5125', brl(r.industrializacaoCentavos), 'encomenda') +
      kpi(r.simbolicoCentavos ? 'warn' : '', 'Retorno simbólico 5902/5903', brl(r.simbolicoCentavos), 'não é receita nem recebível') + kpi('', 'Fora do livro', lv.fora.length, 'documentos') + '</div>';
    function tabela(rot, linhas) {
      if (!linhas.length) return '<div class="card"><h3>' + rot + '</h3><div class="mut">Nenhum documento.</div></div>';
      var t = { vOpr: 0, vBC: 0, vICMS: 0, vST: 0, vIPI: 0 };
      var corpo = linhas.map(function(l) {
        var gs = l.cancelado ? [null] : (l.c190 || l.d190 || []);
        return gs.map(function(a) {
          if (a) { t.vOpr += a.vOpr; t.vBC += a.vBC; t.vICMS += a.vICMS; t.vST += a.vST || 0; t.vIPI += a.vIPI || 0; }
          return '<tr><td>' + dataBR(l.data) + '</td><td>' + e(l.numero) + (l.serie && l.serie !== '0' ? '/' + e(l.serie) : '') + '</td><td>' + e((l.participante || {}).nome || '') + '</td><td>' + (a ? e(a.cfop) : '<span class="tg mute">' + (l.situacao === '05' ? 'inutilizada' : 'cancelada') + '</span>') + '</td><td>' + (a ? e(a.cst) : '') + '</td><td class="n">' + (a ? brl(a.vOpr) : '') + '</td><td class="n">' + (a ? brl(a.vBC) : '') + '</td><td class="n">' + (a ? (a.aliq || 0).toLocaleString('pt-BR') + '%' : '') + '</td><td class="n">' + (a ? brl(a.vICMS) : '') + '</td><td class="n">' + (a ? brl(a.vIPI || 0) : '') + '</td></tr>';
        }).join('');
      }).join('');
      return '<div class="card"><h3>' + rot + '</h3><div class="tw"><table class="dre"><thead><tr><th>Data</th><th>Número</th><th>Participante</th><th>CFOP</th><th>CST</th><th class="n">Valor contábil</th><th class="n">Base ICMS</th><th class="n">Alíq.</th><th class="n">ICMS</th><th class="n">IPI</th></tr></thead><tbody>' + corpo +
        '<tr class="tot"><td colspan="5">Total</td><td class="n">' + brl(t.vOpr) + '</td><td class="n">' + brl(t.vBC) + '</td><td></td><td class="n">' + brl(t.vICMS) + '</td><td class="n">' + brl(t.vIPI) + '</td></tr></tbody></table></div></div>';
    }
    h += '<div class="card"><div class="barra"><h3 style="margin:0">Livros de ' + mesBR(S.mes) + '</h3><button class="btn sm" id="lvCsv">Exportar livro (CSV)</button></div><div class="dica">Derivados dos XMLs e das regras de entrada. Entrada pela data de entrada; saída pela emissão.</div></div>';
    h += tabela('Registro de entradas', lv.entradas) + tabela('Registro de saídas', lv.saidas);
    var porC = Object.keys(lv.porCfop).sort();
    if (porC.length) h += '<div class="card"><h3>Resumo por CFOP</h3><div class="tw"><table><thead><tr><th>CFOP</th><th class="n">Docs</th><th class="n">Valor contábil</th><th class="n">Base</th><th class="n">ICMS</th><th class="n">IPI</th></tr></thead><tbody>' + porC.map(function(c) { var p = lv.porCfop[c]; return '<tr><td>' + e(c) + '</td><td class="n">' + p.documentos + '</td><td class="n">' + brl(p.vOpr) + '</td><td class="n">' + brl(p.vBC) + '</td><td class="n">' + brl(p.vICMS) + '</td><td class="n">' + brl(p.vIPI) + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    if (lv.fora.length) h += '<div class="card"><h3>Fora do livro</h3>' + lv.fora.map(function(f) { return '<div class="chk"><span>NF ' + e(f.numero) + ' · ' + e(f.participante || '') + '</span><span>' + e(f.motivo) + '</span></div>'; }).join('') + '</div>';
    return h;
  }

  /* ── Apuração ──────────────────────────────────────────────────────────── */
  var ajustesTela = null;
  function abaApuracao() {
    var ap = (fis.apuracao || {})[S.mes] || {}, ant = (fis.apuracao || {})[mesMenos(S.mes, 1)];
    if (!ajustesTela || ajustesTela.mes !== S.mes) ajustesTela = { mes: S.mes, linhas: (ap.ajustes || []).slice() };
    var lv = livroDoMes();
    var sldAnt = ant && ant.e110 ? ant.e110.VL_SLD_CREDOR_TRANSPORTAR || 0 : Math.round(Number(ap.saldoCredorAnteriorInformado) || 0);
    var r = Fis.apurarIcms(lv, { ajustes: ajustesTela.linhas, saldoCredorAnterior: sldAnt }), q = r.e110;
    var ri = Fis.apurarIpi(lv, { saldoCredorAnterior: ant && ant.e520 ? ant.e520.VL_SC_IPI || 0 : Math.round(Number(ap.saldoCredorIpiInformado) || 0) }).e520;
    var L = function(rot, v, forte) { return '<tr' + (forte ? ' class="tot"' : '') + '><td>' + rot + '</td><td class="n">' + brl(v) + '</td></tr>'; };
    var h = '<div class="card"><h3>Apuração do ICMS (E110) — ' + mesBR(S.mes) + '</h3><div class="tw"><table class="dre"><tbody>' +
      L('Débitos por saídas', q.VL_TOT_DEBITOS) + L('Outros débitos (E111)', q.VL_TOT_AJ_DEBITOS) + L('Estornos de créditos', q.VL_ESTORNOS_CRED) +
      L('Créditos por entradas', q.VL_TOT_CREDITOS) + L('Outros créditos (E111)', q.VL_TOT_AJ_CREDITOS) + L('Estornos de débitos', q.VL_ESTORNOS_DEB) + L('Saldo credor do mês anterior', q.VL_SLD_CREDOR_ANT) +
      L('Saldo devedor apurado', q.VL_SLD_APURADO, true) + L('Deduções', q.VL_TOT_DED) + L('ICMS a recolher', q.VL_ICMS_RECOLHER, true) + L('Saldo credor a transportar', q.VL_SLD_CREDOR_TRANSPORTAR, true) + L('Débitos especiais', q.DEB_ESP) +
      '</tbody></table></div>' + (r.inconsistencias.length ? '<div class="alerta warn"><div>' + r.inconsistencias.map(function(i) { return e(i.descricao); }).join('<br>') + '</div></div>' : '') +
      (ant && ant.e110 ? '<div class="dica">Saldo credor anterior: o transportado na apuração de ' + mesBR(mesMenos(S.mes, 1)) + '.</div>' : '<div class="form"><div><label for="apSld">Saldo credor anterior (primeiro mês no KuryosERP)</label><input class="inp num" id="apSld" value="' + ((ap.saldoCredorAnteriorInformado || 0) / 100).toFixed(2).replace('.', ',') + '"></div><div><label for="apSldIpi">Saldo credor anterior de IPI</label><input class="inp num" id="apSldIpi" value="' + ((ap.saldoCredorIpiInformado || 0) / 100).toFixed(2).replace('.', ',') + '"></div></div>') + '</div>';
    h += '<div class="card"><h3>Ajustes da apuração (E111)</h3><div class="sub" style="margin-bottom:8px">Código da tabela 5.1.1 de SP (8 posições, ex.: SP020799). A 4ª posição diz o efeito: 0 outros débitos, 1 estorno de créditos, 2 outros créditos, 3 estorno de débitos, 4 deduções, 5 débitos especiais.</div>' +
      '<div class="tw"><table><thead><tr><th>Código</th><th>Descrição</th><th class="n">Valor</th><th></th></tr></thead><tbody>' +
      ajustesTela.linhas.map(function(a, i) { return '<tr><td>' + e(a.codigo) + '</td><td>' + e(a.descricao) + '</td><td class="n">' + brl(a.valorCentavos) + '</td><td>' + (fechado() ? '' : '<button class="btn sm" data-aj-del="' + i + '">Remover</button>') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      (fechado() ? '' : '<div class="form" style="margin-top:8px"><div><label for="ajCod">Código</label><input class="inp" id="ajCod" placeholder="SP020799"></div><div><label for="ajDesc">Descrição</label><input class="inp" id="ajDesc"></div><div><label for="ajVal">Valor</label><input class="inp num" id="ajVal"></div></div><div class="barra" style="margin-top:8px"><button class="btn" id="ajAdd">Adicionar ajuste</button><button class="btn pri" id="apSalvar">Salvar apuração</button>' + (ap.calculadoEm ? '<span class="mut">Salva em ' + dataBR(ap.calculadoEm) + ' por ' + e(ap.calculadoPor) + '</span>' : '<span class="mut">Ainda não salva.</span>') + '</div>') + '</div>';
    h += '<div class="card"><h3>Apuração do IPI (E520)</h3><div class="tw"><table class="dre"><tbody>' + L('Saldo credor anterior', ri.VL_SD_ANT_IPI) + L('Débitos', ri.VL_DEB_IPI) + L('Créditos', ri.VL_CRED_IPI) + L('Saldo credor', ri.VL_SC_IPI, true) + L('Saldo devedor (a recolher)', ri.VL_SD_IPI, true) + '</tbody></table></div></div>';
    var f = (fis.fechamentos || {})[S.mes];
    h += '<div class="card"><h3>Fechamento do mês fiscal</h3><div class="sub" style="margin-bottom:8px">Fechar guarda o SPED gerado e a apuração. Depois disso o mês não muda: documento, apuração e arquivo ficam como estão. Retificar = o ADM reabre e gera o arquivo substituto.</div><div class="barra">' +
      (f && f.status === 'FECHADO' ? (ehAdm() ? '<button class="btn perigo" id="fmReabrir">Reabrir ' + mesBR(S.mes) + ' (ADM)</button>' : '<span class="mut">Fechado. Só o ADM reabre.</span>') : '<button class="btn pri" id="fmFechar">Fechar ' + mesBR(S.mes) + '</button>') + '</div></div>';
    return h;
  }

  /* ── SPED Fiscal (mesmos campos do WebMais, na mesma ordem) ────────────── */
  function arquivosDoMes(tipo) { var a = (fis.arquivos || {})[S.mes] || {}; return Object.keys(a).filter(function(k) { return a[k] && a[k].tipo === tipo; }).sort().reverse().map(function(k) { return Object.assign({ id: k }, a[k]); }); }
  function abaSped() {
    var est = estab(), o = S.speds;
    var h = '<div class="card"><h3>SPED FISCAL</h3><div class="form">' +
      '<div><label>Empresa</label><div>1 - ' + e(est.nome || 'KURYOS BEAUTY PACKING INDUSTRIAL LTDA') + '</div></div>' +
      '<div><label for="spTipo">Tipo de arquivo</label><select class="sel" id="spTipo"><option value="PVA">Importação no PVA (EFD ICMS/IPI)</option></select></div>' +
      '<div><label for="spFin">Finalidade</label><select class="sel" id="spFin"><option value="0"' + (o.codFin === 1 ? '' : ' selected') + '>0 - Remessa do arquivo original</option><option value="1"' + (o.codFin === 1 ? ' selected' : '') + '>1 - Remessa do arquivo substituto</option></select></div>' +
      '<div><label>Tipo de atividade</label><div>Industrial ou equiparado a industrial</div></div>' +
      '<div><label>Período</label><div>' + dataBR(S.mes + '-01') + ' a ' + dataBR(S.mes + '-' + new Date(Date.UTC(+S.mes.slice(0, 4), +S.mes.slice(5, 7), 0)).getUTCDate()) + '</div></div>' +
      '<div><label><input type="checkbox" id="spInv"' + (o.gerarInventario || S.mes.slice(5, 7) === '02' ? ' checked' : '') + '> Gerar informação de inventário</label><label><input type="checkbox" id="spC170"' + (o.c170Propria ? ' checked' : '') + '> Gerar registro C170 de notas fiscais com emissão própria</label></div></div>' +
      '<div class="barra" style="margin-top:10px"><button class="btn pri" id="spExportar">Exportar</button><button class="btn" id="spNovo">Novo</button></div>' +
      '<div class="dica">Leiaute ' + e(Fis.LEIAUTE_EFD[+S.mes.slice(0, 4)] || '?') + ' para ' + S.mes.slice(0, 4) + '. Com qualquer inconsistência impeditiva o arquivo não sai: abre o relatório de inconsistências. Fevereiro leva o inventário de 31/12.</div></div>';
    var arqs = arquivosDoMes('EFD');
    if (arqs.length) h += '<div class="card"><h3>Arquivos gerados</h3><div class="tw"><table><thead><tr><th>Gerado</th><th>Finalidade</th><th class="n">Linhas</th><th class="n">ICMS a recolher</th><th>Transmissão</th><th></th></tr></thead><tbody>' +
      arqs.map(function(a) { return '<tr><td>' + dataBR(a.geradoEm) + ' ' + String(a.geradoEm || '').slice(11, 16) + ' · ' + e(a.geradoPor) + '</td><td>' + (a.codFin === 1 ? 'substituto' : 'original') + '</td><td class="n">' + e(a.qtdLinhas) + '</td><td class="n">' + brl((a.e110 || {}).VL_ICMS_RECOLHER) + '</td><td>' + (a.transmitidoEm ? '<span class="tg ok">' + dataBR(a.transmitidoEm) + ' · recibo ' + e(a.recibo) + '</span>' : '<button class="btn sm" data-transm="' + e(a.id) + '">Registrar transmissão</button>') + '</td><td><button class="btn sm" data-baixar="' + e(a.id) + '">Baixar</button></td></tr>'; }).join('') + '</tbody></table></div></div>';
    return h;
  }
  function relatorioInconsistencias(titulo, inc) {
    abrir(titulo, '<div class="tw"><table><thead><tr><th>Grupo</th><th>Identificador</th><th>Seq</th><th>Descrição do erro</th><th></th></tr></thead><tbody>' +
      inc.map(function(i) { return '<tr><td>' + e(i.grupo) + '</td><td>' + e(i.identificador) + '</td><td>' + e(i.seq) + '</td><td>' + e(i.descricao) + '</td><td>' + (i.impeditivo ? '<span class="tg warn">impede</span>' : '<span class="tg mute">aviso</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>');
  }
  function nomeArquivo(tipo) { var c = Fis.normCnpj(estab().cnpj); return (tipo === 'EFD' ? 'SPED_EFD_' : 'SINTEGRA_') + c + '_' + S.mes.replace('-', '') + '.txt'; }

  /* ── SINTEGRA ──────────────────────────────────────────────────────────── */
  function abaSintegra() {
    var invs = Object.keys(fis.inventarios || {}).sort().reverse();
    var h = '<div class="card"><h3>SINTEGRA</h3><div class="form">' +
      '<div><label>Período</label><div>' + mesBR(S.mes) + '</div></div>' +
      '<div><label for="snFin">Finalidade</label><select class="sel" id="snFin"><option value="1">Normal</option><option value="2">Retificação total</option><option value="3">Retificação aditiva</option><option value="5">Desfazimento</option></select></div>' +
      '<div><label><input type="checkbox" id="snInv"> Gerar informação inventário</label></div>' +
      '<div><label for="snData">Data saldo</label><select class="sel" id="snData">' + (invs.length ? invs.map(function(d) { return '<option value="' + d + '">' + dataBR(d) + '</option>'; }).join('') : '<option value="">(gere o inventário antes)</option>') + '</select></div></div>' +
      '<div class="barra" style="margin-top:10px"><button class="btn pri" id="snGerar">Gerar</button></div>' +
      '<div class="dica">Convênio ICMS 57/95, 126 posições. Sai do mesmo livro do SPED. Em SP quem entrega a EFD está dispensado do SINTEGRA: gere quando o fisco pedir ou no Simples.</div></div>';
    var arqs = arquivosDoMes('SINTEGRA');
    if (arqs.length) h += '<div class="card"><h3>Arquivos gerados</h3>' + arqs.map(function(a) { return '<div class="chk"><span>' + dataBR(a.geradoEm) + ' · ' + e(a.geradoPor) + ' · ' + e(a.qtdLinhas) + ' linhas</span><span><button class="btn sm" data-baixar="' + e(a.id) + '">Baixar</button></span></div>'; }).join('') + '</div>';
    return h;
  }

  /* ── Inventário ────────────────────────────────────────────────────────── */
  function abaInventario() {
    var invs = fis.inventarios || {}, ks = Object.keys(invs).sort().reverse();
    if (!S.invData) S.invData = ks[0] || (Number(hojeISO().slice(0, 4)) - (hojeISO().slice(5, 7) < '03' ? 1 : 0)) + '-12-31';
    var h = '<div class="card"><h3>Inventário (Bloco H / registro 74)</h3><div class="sub" style="margin-bottom:8px">Retrato do estoque na data: material próprio a custo (Custos), material do cliente (industrialização por encomenda) com IND_PROP 2 pelo valor da NF de remessa. Saldo ausente, negativo ou sem preço aparece como inconsistência — nunca vira zero. <b>Enquanto o Dia D não acontecer, o estoque não serve para o inventário.</b></div>' +
      '<div class="barra"><label>Data <input class="inp" type="date" id="invData" value="' + e(S.invData) + '"></label><button class="btn pri" id="invGerar">Gerar retrato</button></div></div>';
    var inv = invs[S.invData];
    if (inv) {
      var incs = inv.inconsistencias || [];
      h += '<div class="kpis">' + kpi('', 'Itens', (inv.itens || []).length, '') + kpi('', 'Valor total', brl(inv.totalCentavos), dataBR(inv.data)) + kpi(incs.some(function(i) { return i.impeditivo; }) ? 'warn' : '', 'Inconsistências', incs.length, 'gerado ' + dataBR(inv.geradoEm)) + '</div>';
      if (incs.length) h += '<div class="card"><h3>Inconsistências</h3>' + incs.map(function(i) { return '<div class="chk"><span>' + (i.impeditivo ? '<span class="tg warn">impede</span> ' : '<span class="tg mute">aviso</span> ') + e(i.identificador) + '</span><span>' + e(i.descricao) + '</span></div>'; }).join('') + '</div>';
      if ((inv.itens || []).length) h += '<div class="card"><div class="tw"><table><thead><tr><th>Item</th><th>Un.</th><th class="n">Qtd</th><th class="n">Unitário</th><th class="n">Valor</th><th>Posse</th></tr></thead><tbody>' + inv.itens.map(function(i) { return '<tr><td>' + e(i.codItem + ' · ' + (i.descr || '')) + '</td><td>' + e(i.un) + '</td><td class="n">' + e(i.qtd) + '</td><td class="n">' + e(i.vUnit) + '</td><td class="n">' + brl(i.vItem) + '</td><td>' + (i.indProp === '2' ? '<span class="tg warn">do cliente ' + e((i.participante || {}).nome || i.codPart) + '</span>' : 'próprio') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    }
    return h;
  }

  /* ── Exportação fiscal Domínio ─────────────────────────────────────────── */
  function abaDominio() {
    var efd = arquivosDoMes('EFD')[0];
    return '<div class="card"><h3>Exportação Fiscal - Domínio Sistemas</h3><div class="form"><div><label>Período</label><div>' + mesBR(S.mes) + '</div></div>' +
      '<div><label>Conteúdo</label><label><input type="checkbox" id="dmXml" checked> XMLs do período (entradas, saídas, CT-e, eventos, inutilizações)</label><label><input type="checkbox" id="dmEfd"' + (efd ? ' checked' : ' disabled') + '> TXT da EFD ' + (efd ? '(gerado em ' + dataBR(efd.geradoEm) + ')' : '(gere o SPED antes)') + '</label><label><input type="checkbox" id="dmCsv" checked> Livro de entradas e saídas (CSV)</label></div></div>' +
      '<div class="barra" style="margin-top:10px"><button class="btn pri" id="dmExportar">Exportar ZIP</button></div><div class="dica">O Domínio importa os XMLs de NF-e/CT-e e o próprio TXT da EFD. Confirme com o escritório se ele prefere este pacote ou o leiaute de importação de notas dele (pergunta Q3); o conteúdo do ZIP é o mesmo que ele precisa nas duas formas.</div></div>';
  }

  /* ── Estabelecimento e contabilista ────────────────────────────────────── */
  function abaEstab() {
    var x = estab(), c = x.contabilista || {};
    var campo = function(id, rot, v, ph) { return '<div><label for="' + id + '">' + rot + '</label><input class="inp" id="' + id + '" value="' + e(v || '') + '"' + (ph ? ' placeholder="' + e(ph) + '"' : '') + '></div>'; };
    var incs = Fis.inconsistenciasCadastro(x);
    return (incs.length ? '<div class="alerta warn"><div><b>Falta para o SPED sair:</b><br>' + incs.map(function(i) { return e(i.descricao); }).join('<br>') + '</div></div>' : '') +
      '<div class="card"><h3>Estabelecimento (0000/0005)</h3><div class="form">' + campo('esCnpj', 'CNPJ', x.cnpj) + campo('esIe', 'Inscrição estadual', x.ie) + campo('esIm', 'Inscrição municipal', x.im) + campo('esNome', 'Razão social', x.nome, 'KURYOS BEAUTY PACKING INDUSTRIAL LTDA') + campo('esFant', 'Nome fantasia', x.fantasia) +
      campo('esEnd', 'Endereço', x.endereco, 'RUA LAGOA TAI GRANDE') + campo('esNum', 'Número', x.numero) + campo('esCompl', 'Complemento', x.complemento) + campo('esBairro', 'Bairro', x.bairro) + campo('esCep', 'CEP', x.cep) +
      campo('esMun', 'Município', x.municipio, 'SAO PAULO') + campo('esCodMun', 'Código IBGE do município', x.codMun, '3550308') + campo('esUf', 'UF', x.uf, 'SP') + campo('esFone', 'Telefone', x.fone) + campo('esEmail', 'E-mail', x.email) + campo('esCnae', 'CNAE', x.cnae) + campo('esContato', 'Contato (SINTEGRA)', x.contato) +
      '<div><label for="esRegime">Regime tributário</label><select class="sel" id="esRegime"' + (ehAdm() ? '' : ' disabled') + '><option value="">— a decidir —</option><option value="NORMAL"' + (x.regime === 'NORMAL' ? ' selected' : '') + '>Normal (Lucro Real/Presumido)</option><option value="SIMPLES"' + (x.regime === 'SIMPLES' ? ' selected' : '') + '>Simples Nacional</option></select></div>' +
      '<div><label for="esPerfil">Perfil da EFD</label><select class="sel" id="esPerfil">' + ['A', 'B', 'C'].map(function(p) { return '<option' + ((x.perfil || 'A') === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
      '<div><label><input type="checkbox" id="esIpi"' + (x.contribuinteIpi === false ? '' : ' checked') + '> Contribuinte do IPI (E500)</label></div>' +
      campo('esCodRec', 'Código de receita do ICMS (E116)', x.codReceitaIcms, '046-2') + campo('esDiaVenc', 'Dia de vencimento do ICMS', x.diaVencimentoIcms) + campo('esConta', 'Conta contábil do estoque (H010)', x.contaContabilEstoque) + '</div></div>' +
      '<div class="card"><h3>Contabilista (0100)</h3><div class="form">' + campo('ctNome', 'Nome', c.nome) + campo('ctCpf', 'CPF', c.cpf) + campo('ctCrc', 'CRC', c.crc) + campo('ctCnpj', 'CNPJ do escritório', c.cnpj) + campo('ctCep', 'CEP', c.cep) + campo('ctEnd', 'Endereço', c.endereco) + campo('ctNum', 'Número', c.numero) +
      campo('ctBairro', 'Bairro', c.bairro) + campo('ctFone', 'Telefone', c.fone) + campo('ctEmail', 'E-mail', c.email) + campo('ctCodMun', 'Código IBGE do município', c.codMun) + '</div><button class="btn pri" id="esSalvar" style="margin-top:10px">Salvar</button>' +
      (x.alteradoEm ? '<span class="mut"> Última alteração ' + dataBR(x.alteradoEm) + ' por ' + e(x.alteradoPor) + '</span>' : '') + '</div>';
  }

  /* ── Eventos ───────────────────────────────────────────────────────────── */
  function centavos(v) { var s = String(v == null ? '' : v).trim().replace(/\s/g, ''); if (!s) return null; if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); var n = Number(s); return isFinite(n) ? Math.round(n * 100) : null; }
  function val(id) { var x = el(id); return x ? x.value.trim() : ''; }
  document.addEventListener('click', function(ev) {
    var t = ev.target.closest('button, tr[data-doc]'); if (!t) return;
    var d = t.dataset;
    if (t.classList.contains('aba')) { S.aba = d.aba; render(); return; }
    if (d.doc) { detalheDoc(d.doc); return; }
    if (t.id === 'xmlCancelar') { S.previa = null; render(); return; }
    if (t.id === 'xmlImportar') { importar(t); return; }
    if (t.id === 'dtEntOk') { travar(t, chamar('fisSalvarCadastro', { tipo: 'DATA_ENTRADA', chave: d.chave, data: val('dtEnt') })).then(function() { el('dlg').close(); toast('Data de entrada salva.'); }); return; }
    if (t.id === 'regSugerir') {
      var tipos = {}; Array.prototype.forEach.call(document.querySelectorAll('[data-sug-tipo]'), function(s) { tipos[s.dataset.sugTipo] = s.value; });
      travar(t, chamar('fisSalvarCadastro', { tipo: 'REGRAS_SUGERIDAS', mes: S.mes, tipoItemPorCfop: tipos })).then(function(r) { toast((r.criadas || []).length + ' regra(s) criada(s). Revise antes do SPED.'); });
      return;
    }
    if (d.regEdit) {
      var r = (fis.regras_entrada || {})[d.regEdit]; if (!r) return;
      el('rgOrig').value = r.cfopOrigem; el('rgVar').value = r.variante || ''; el('rgEnt').value = r.cfopEntrada; el('rgTipo').value = r.tipoItem; el('rgProp').value = r.propriedade || 'PROPRIA';
      el('rgForn').value = r.fornecedor || ''; el('rgNcm').value = r.ncm || ''; el('rgCst').value = r.cst || ''; el('rgLivro').checked = r.geraLivro !== false; el('rgIcms').checked = !!r.creditaICMS; el('rgIpi').checked = !!r.creditaIPI;
      el('rgOrig').focus(); return;
    }
    if (d.regAtivo) { travar(t, chamar('fisSalvarCadastro', { tipo: 'REGRA_ATIVO', id: d.regAtivo, ativo: d.v === '1' })).then(function() { toast('Regra atualizada.'); }); return; }
    if (t.id === 'rgSalvar') {
      var dr = { cfopOrigem: val('rgOrig'), variante: val('rgVar'), cfopEntrada: val('rgEnt'), tipoItem: val('rgTipo'), propriedade: val('rgProp'), fornecedor: val('rgForn'), ncm: val('rgNcm'), cst: val('rgCst'), geraLivro: el('rgLivro').checked, creditaICMS: el('rgIcms').checked, creditaIPI: el('rgIpi').checked };
      var vr = Fis.validarRegra(dr); if (!vr.ok) { toast(vr.motivo); return; }
      travar(t, chamar('fisSalvarCadastro', { tipo: 'REGRA', dados: dr })).then(function() { toast('Regra ' + vr.id + ' salva.'); });
      return;
    }
    if (d.itemEdit) {
      var it = (fis.itens || {})[d.itemEdit]; if (!it) return;
      el('itCod').value = it.codigo; el('itDescr').value = it.descr; el('itUn').value = it.un; el('itTipo').value = it.tipoItem; el('itNcm').value = it.ncm || ''; el('itCest').value = it.cest || ''; el('itMat').value = it.material || '';
      el('itConv').value = Object.keys(it.conversoes || {}).map(function(u) { return u + '=' + String(it.conversoes[u]).replace('.', ','); }).join('; '); el('itCod').focus(); return;
    }
    if (t.id === 'itSalvar') {
      var conv = {}; val('itConv').split(/[;\n]/).forEach(function(p) { var m = /^\s*([A-Za-z0-9]{1,6})\s*=\s*([\d.,]+)\s*$/.exec(p); if (m) conv[m[1].toUpperCase()] = m[2].replace(',', '.'); });
      var di = { codigo: val('itCod'), descr: val('itDescr'), un: val('itUn').toUpperCase(), tipoItem: val('itTipo'), ncm: val('itNcm').replace(/\D/g, ''), cest: val('itCest'), material: val('itMat'), conversoes: conv };
      var vi = Fis.validarItem(di); if (!vi.ok) { toast(vi.motivo); return; }
      travar(t, chamar('fisSalvarCadastro', { tipo: 'ITEM', dados: di })).then(function() { toast('Item salvo.'); });
      return;
    }
    if (d.dpNovo) {
      var lv = livroDoMes(), achado = null;
      lv.linhas.forEach(function(l) { (l.itens || []).forEach(function(i) { if (i.codItem === d.dpNovo && !achado) achado = { forn: (l.participante || {}).cnpj, i: i, doc: l.doc }; }); });
      if (achado) { var orig = ((achado.doc || {}).itens || [])[achado.i.n - 1] || {}; el('dpForn').value = achado.forn || ''; el('dpProd').value = orig.cProd || ''; el('dpItem').focus(); el('dpItem').scrollIntoView({ block: 'center' }); }
      return;
    }
    if (t.id === 'dpSalvar') { travar(t, chamar('fisSalvarCadastro', { tipo: 'DEPARA', dados: { fornecedor: val('dpForn'), cProd: val('dpProd'), item: val('dpItem'), fator: val('dpFator') } })).then(function() { toast('De-para salvo.'); }); return; }
    if (t.id === 'lvCsv') { baixarCsv('livro_fiscal_' + S.mes + '.csv', Fis.livroCsv(livroDoMes())); return; }
    if (t.id === 'ajAdd') {
      var aj = { codigo: val('ajCod').toUpperCase(), descricao: val('ajDesc'), valorCentavos: centavos(val('ajVal')) };
      if (!/^[A-Z]{2}\d{6}$/.test(aj.codigo) || !(aj.valorCentavos > 0)) { toast('Código de 8 posições (ex.: SP020799) e valor maior que zero.'); return; }
      ajustesTela.linhas.push(aj); render(); return;
    }
    if (d.ajDel != null && t.dataset.ajDel !== undefined) { ajustesTela.linhas.splice(+d.ajDel, 1); render(); return; }
    if (t.id === 'apSalvar') {
      var pa = { mes: S.mes, ajustes: ajustesTela.linhas };
      if (el('apSld')) pa.saldoCredorAnteriorInformado = centavos(val('apSld')) || 0;
      if (el('apSldIpi')) pa.saldoCredorIpiInformado = centavos(val('apSldIpi')) || 0;
      travar(t, chamar('fisSalvarApuracao', pa)).then(function() { toast('Apuração de ' + mesBR(S.mes) + ' salva.'); });
      return;
    }
    if (t.id === 'fmFechar') { if (!confirm('Fechar ' + mesBR(S.mes) + '? O mês fiscal deixa de mudar.')) return; travar(t, chamar('fisFecharMes', { mes: S.mes })).then(function() { toast(mesBR(S.mes) + ' fechado.'); }); return; }
    if (t.id === 'fmReabrir') { var j = prompt('Justificativa da reabertura (fica no histórico):'); if (!j) return; travar(t, chamar('fisReabrirMes', { mes: S.mes, justificativa: j })).then(function() { toast(mesBR(S.mes) + ' reaberto.'); }); return; }
    if (t.id === 'spNovo') { S.speds = {}; render(); return; }
    if (t.id === 'spExportar') {
      S.speds = { codFin: val('spFin') === '1' ? 1 : 0, gerarInventario: el('spInv').checked, c170Propria: el('spC170').checked };
      travar(t, chamar('fisGerarEfd', Object.assign({ mes: S.mes }, S.speds))).then(function(r) {
        if (!r.ok) { relatorioInconsistencias('RELATÓRIO DE INCONSISTÊNCIAS SPED FISCAL', r.inconsistencias || []); return; }
        baixarLatin1(nomeArquivo('EFD'), r.texto);
        var av = (r.inconsistencias || []).length;
        toast(r.jaFechado ? 'Mês fechado: baixado o arquivo guardado no fechamento.' : 'SPED Fiscal gerado' + (av ? ' com ' + av + ' aviso(s).' : '.'));
        if (av && !r.jaFechado) relatorioInconsistencias('Avisos do SPED Fiscal (o arquivo saiu)', r.inconsistencias);
      });
      return;
    }
    if (d.baixar) { travar(t, chamar('fisBaixarArquivo', { id: d.baixar })).then(function(r) { baixarLatin1(nomeArquivo(r.tipo === 'SINTEGRA' ? 'SINTEGRA' : 'EFD'), r.texto); }); return; }
    if (d.transm) {
      var rec = prompt('Número do recibo de entrega do PVA:'); if (!rec) return;
      var dt = prompt('Data da transmissão (aaaa-mm-dd):', hojeISO()); if (!dt) return;
      travar(t, chamar('fisRegistrarTransmissao', { mes: S.mes, arquivo: d.transm, recibo: rec, data: dt })).then(function() { toast('Transmissão registrada: o próximo arquivo do mês é o substituto.'); });
      return;
    }
    if (t.id === 'snGerar') {
      travar(t, chamar('fisGerarSintegra', { mes: S.mes, finalidade: val('snFin'), gerarInventario: el('snInv').checked, dataSaldo: val('snData') })).then(function(r) {
        if (!r.ok) { relatorioInconsistencias('RELATÓRIO DE INCONSISTÊNCIAS SINTEGRA', r.inconsistencias || []); return; }
        baixarLatin1(nomeArquivo('SINTEGRA'), r.texto); toast('SINTEGRA gerado.');
      });
      return;
    }
    if (t.id === 'invGerar') { S.invData = val('invData'); travar(t, chamar('fisGerarInventario', { data: S.invData })).then(function(r) { toast('Inventário de ' + dataBR(S.invData) + ': ' + r.itens + ' itens' + (r.ok ? '.' : ', com inconsistências.')); }); return; }
    if (t.id === 'dmExportar') {
      var querXml = el('dmXml').checked, querEfd = el('dmEfd').checked, querCsv = el('dmCsv').checked, efd = arquivosDoMes('EFD')[0];
      t.disabled = true;
      Promise.all([carregarJsZip(), querXml ? chamar('fisXmlsDoPeriodo', { mes: S.mes }) : null, querEfd && efd ? chamar('fisBaixarArquivo', { id: efd.id }) : null]).then(function(rs) {
        var z = new rs[0]();
        if (rs[1]) rs[1].arquivos.forEach(function(a) { z.file('xml/' + a.pasta + '/' + a.nome, a.texto); });
        if (rs[2]) z.file(nomeArquivo('EFD'), latin1Bytes(rs[2].texto));
        if (querCsv) z.file('livro_fiscal_' + S.mes + '.csv', '﻿' + Fis.livroCsv(livroDoMes()));
        return z.generateAsync({ type: 'blob' });
      }).then(function(b) { t.disabled = false; baixarBlob('dominio_fiscal_' + S.mes.replace('-', '') + '.zip', b); toast('Pacote do Domínio gerado.'); }, function(err) { t.disabled = false; toast(erroMsg(err)); });
      return;
    }
    if (t.id === 'esSalvar') {
      var de = { cnpj: val('esCnpj'), ie: val('esIe'), im: val('esIm'), nome: val('esNome'), fantasia: val('esFant'), endereco: val('esEnd'), numero: val('esNum'), complemento: val('esCompl'), bairro: val('esBairro'), cep: val('esCep'),
        municipio: val('esMun'), codMun: val('esCodMun'), uf: val('esUf').toUpperCase(), fone: val('esFone'), email: val('esEmail'), cnae: val('esCnae'), contato: val('esContato'), regime: val('esRegime') || null, perfil: val('esPerfil'),
        contribuinteIpi: el('esIpi').checked, codReceitaIcms: val('esCodRec'), diaVencimentoIcms: val('esDiaVenc'), contaContabilEstoque: val('esConta'),
        contabilista: { nome: val('ctNome'), cpf: val('ctCpf'), crc: val('ctCrc'), cnpj: val('ctCnpj'), cep: val('ctCep'), endereco: val('ctEnd'), numero: val('ctNum'), bairro: val('ctBairro'), fone: val('ctFone'), email: val('ctEmail'), codMun: val('ctCodMun') } };
      var ve = Fis.validarEstabelecimento(de); if (!ve.ok) { toast(ve.motivo); return; }
      travar(t, chamar('fisSalvarCadastro', { tipo: 'ESTABELECIMENTO', dados: de })).then(function() { toast('Estabelecimento salvo.'); });
      return;
    }
  });
  document.addEventListener('change', function(ev) {
    var t = ev.target;
    if (t.id === 'selMes') { S.mes = t.value; S.previa = null; render(); }
    if (t.id === 'fTipo') { S.filtroTipo = t.value; render(); }
    if (t.id === 'fBusca') { S.busca = t.value; render(); }
    if (t.id === 'invData' && t.value) { S.invData = t.value; render(); }
    if (t.id === 'xmlArquivos' && t.files && t.files.length) { lerArquivos(t.files).then(montarPrevia, function(err) { toast(erroMsg(err)); }); }
  });

  var iniciado = false;
  function iniciar() { if (iniciado) return; iniciado = true; escutar(); }
  if (window.currentUser) iniciar(); else window.addEventListener('kuryos-auth-pronto', iniciar);
})();
