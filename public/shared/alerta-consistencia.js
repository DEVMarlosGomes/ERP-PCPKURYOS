/* Alerta vermelho de inconsistência de dados (13/11/2026).

   Carregado pelo auth_check.js, em qualquer tela, para ADM, PCP e
   Expedição/Logística (ConsistenciaProducao.veAlertas). Escuta
   nao_conformidades (nó pequeno: ~50 registros) e mostra as RNCs automáticas
   de consistência que ainda não foram concluídas:
   - modal vermelho quando surge RNC ABERTA que a pessoa ainda não viu nesta
     sessão ("Ciente" guarda só nesta aba -- na próxima entrada aparece de
     novo, até alguém tratar a RNC);
   - selo vermelho fixo no canto enquanto houver qualquer uma não concluída.
   Só lê. Quem abre a RNC é a confirmação da OP, a Conferência de PA e a
   varredura das telas de Pedidos/OPs (shared/consistencia-producao.js). */
(function() {
  'use strict';
  if (window.__alertaConsistenciaInstalado || window.__PCP_EMBEDDED__) return;
  window.__alertaConsistenciaInstalado = true;
  var CO = window.ConsistenciaProducao;
  var CHAVE_VISTOS = 'kuryos-consistencia-vistos';
  var ativos = [], user = null, modal = null, selo = null;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) {
      return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
    });
  }
  function lerVistos() { try { return JSON.parse(sessionStorage.getItem(CHAVE_VISTOS) || '[]') || []; } catch (e) { return []; } }
  function gravarVistos(lista) { try { sessionStorage.setItem(CHAVE_VISTOS, JSON.stringify(lista)); } catch (e) { /* aba privada */ } }
  function podeVerQualidade() {
    try { return typeof window.podeAbrirPagina === 'function' && window.podeAbrirPagina(user, 'qualidade.html'); } catch (e) { return false; }
  }
  function fmtData(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
  }

  function estilo() {
    if (document.getElementById('alerta-consistencia-css')) return;
    var s = document.createElement('style');
    s.id = 'alerta-consistencia-css';
    s.textContent =
      '.ac-fundo{position:fixed;inset:0;background:rgba(15,10,10,.55);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.ac-caixa{background:var(--surface,#fff);color:var(--text,#1f2937);max-width:640px;width:100%;max-height:86vh;overflow:auto;border-radius:12px;border:2px solid #dc2626;box-shadow:0 20px 50px rgba(0,0,0,.35)}' +
      '.ac-topo{background:#dc2626;color:#fff;padding:14px 18px;font-weight:700;font-size:16px;display:flex;gap:8px;align-items:center}' +
      '.ac-corpo{padding:14px 18px;font-size:13.5px;line-height:1.45}' +
      '.ac-item{border:1px solid rgba(220,38,38,.4);border-radius:8px;padding:10px 12px;margin:10px 0;background:rgba(220,38,38,.06)}' +
      '.ac-item b{color:#b91c1c}' +
      '.ac-meta{font-size:12px;opacity:.75;margin-top:4px}' +
      '.ac-rodape{display:flex;gap:8px;justify-content:flex-end;padding:0 18px 16px;flex-wrap:wrap}' +
      '.ac-btn{border:0;border-radius:8px;padding:9px 14px;font-weight:600;cursor:pointer;font-size:13px;text-decoration:none;display:inline-block}' +
      '.ac-btn-forte{background:#dc2626;color:#fff}' +
      '.ac-btn-leve{background:transparent;color:inherit;border:1px solid rgba(127,127,127,.4)}' +
      '.ac-selo{position:fixed;left:16px;bottom:16px;z-index:10040;background:#dc2626;color:#fff;border:0;border-radius:999px;padding:9px 14px;font-weight:700;font-size:13px;cursor:pointer;box-shadow:0 6px 18px rgba(220,38,38,.45)}' +
      '@media (max-width:600px){.ac-selo{left:12px;bottom:12px}}';
    document.head.appendChild(s);
  }

  function itemHtml(r) {
    var titulo = r.titulo || (CO && CO.TITULO[r.tipoInconsistencia]) || (r.conferenciaOpKey ? CO.TITULO.CONTAGEM : 'Inconsistência');
    var link = podeVerQualidade()
      ? ' · <a href="qualidade.html?tab=rnc&rnc=' + encodeURIComponent(r.numero) + '">abrir RNC</a>' : '';
    return '<div class="ac-item"><div><b>' + esc(r.numero) + '</b> — ' + esc(titulo) +
      (r.status === 'ABERTA' ? '' : ' <span style="font-size:11.5px;opacity:.8">(em análise)</span>') + '</div>' +
      '<div style="margin-top:4px">' + esc(r.descricao || '') + '</div>' +
      '<div class="ac-meta">' + esc([r.opLote ? 'OP ' + r.opLote : '', r.itemNome || r.itemCodigo || '',
        r.qtdEnvolvida != null ? r.qtdEnvolvida.toLocaleString('pt-BR') + ' un.' : '', fmtData(r.abertaEm)].filter(Boolean).join(' · ')) + link + '</div></div>';
  }

  function fecharModal() { if (modal) { modal.remove(); modal = null; } }
  function abrirModal() {
    fecharModal();
    if (!ativos.length) return;
    estilo();
    var abertas = ativos.filter(function(r) { return r.status === 'ABERTA'; }).length;
    modal = document.createElement('div');
    modal.className = 'ac-fundo';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'ac-titulo');
    modal.innerHTML = '<div class="ac-caixa">' +
      '<div class="ac-topo" id="ac-titulo">⚠ Inconsistência de dados — ' + ativos.length + ' RNC' + (ativos.length > 1 ? 's' : '') +
        ' sem solução' + (abertas ? ' (' + abertas + ' aberta' + (abertas > 1 ? 's' : '') + ')' : '') + '</div>' +
      '<div class="ac-corpo">O apontamento da produção, a contagem da Logística e o estoque/expedição não batem. ' +
        '<b>Não expeça o lote envolvido</b> antes da conferência física e do tratamento da RNC.' +
        ativos.map(itemHtml).join('') + '</div>' +
      '<div class="ac-rodape">' +
        (podeVerQualidade() ? '<a class="ac-btn ac-btn-leve" href="qualidade.html?tab=rnc">Ver todas na Qualidade</a>' : '') +
        '<button type="button" class="ac-btn ac-btn-forte" data-ac-ciente>Ciente</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('[data-ac-ciente]').addEventListener('click', function() {
      gravarVistos(ativos.filter(function(r) { return r.status === 'ABERTA'; }).map(function(r) { return r.numero; }));
      fecharModal();
    });
    modal.querySelector('[data-ac-ciente]').focus();
  }

  function atualizarSelo() {
    if (!ativos.length) { if (selo) { selo.remove(); selo = null; } return; }
    estilo();
    if (!selo) {
      selo = document.createElement('button');
      selo.type = 'button';
      selo.className = 'ac-selo';
      selo.addEventListener('click', abrirModal);
      document.body.appendChild(selo);
    }
    selo.textContent = '⚠ ' + ativos.length + ' inconsistência' + (ativos.length > 1 ? 's' : '') + ' de dados';
    selo.title = 'RNCs automáticas de consistência ainda não concluídas. Clique para ver.';
  }

  function aoMudar(snap) {
    ativos = CO.alertasAtivos(snap.val() || {});
    atualizarSelo();
    var vistos = lerVistos();
    var novas = ativos.some(function(r) { return r.status === 'ABERTA' && vistos.indexOf(r.numero) === -1; });
    if (novas) abrirModal();
    else if (modal && !ativos.length) fecharModal();
  }

  function iniciar(u) {
    user = u;
    if (!CO || !CO.veAlertas(user) || !window.firebase || typeof firebase.database !== 'function') return;
    firebase.database().ref('nao_conformidades').on('value', aoMudar, function(err) {
      console.warn('Alerta de consistência: sem leitura de nao_conformidades', err && err.message);
    });
  }

  if (window.currentUser) iniciar(window.currentUser);
  else window.addEventListener('kuryos-auth-pronto', function(ev) { iniciar(ev.detail || window.currentUser); }, {once: true});

  // Exposto para a confirmação da OP mostrar o alerta na hora, sem esperar o listener.
  window.AlertaConsistencia = {abrir: abrirModal};
})();
