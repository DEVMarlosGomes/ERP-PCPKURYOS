(function () {
  'use strict';

  var paths = {
    warning: '<path d="M10.3 3.7 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m18 6-12 12"/><path d="m6 6 12 12"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"/><path d="M20 3v5h-5"/>',
    flask: '<path d="M9 3h6"/><path d="M10 3v6l-5 8.5A2.3 2.3 0 0 0 7 21h10a2.3 2.3 0 0 0 2-3.5L14 9V3"/><path d="M7.5 15h9"/>',
    package: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5v8"/><path d="m21 8-9 5"/><path d="m7.5 5.5 9 5"/>',
    clipboard: '<rect width="14" height="18" x="5" y="3" rx="2"/><path d="M9 3V2h6v1"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    tag: '<path d="M20.6 13.6 11 4H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8Z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    sparkles: '<path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2L12 3Z"/><path d="m19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7L19 14Z"/><path d="m5 14-.7 1.3L3 16l1.3.7L5 18l.7-1.3L7 16l-1.3-.7L5 14Z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    play: '<path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L8.7 4.5a.8.8 0 0 0-1.2.7Z"/>',
    back: '<path d="M16.5 5.2v13.6a.8.8 0 0 1-1.2.7L4.7 12.7a.8.8 0 0 1 0-1.4l10.6-6.8a.8.8 0 0 1 1.2.7Z"/>',
    forward: '<path d="M4 6v12l8-6Z"/><path d="M12 6v12l8-6Z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
    blocked: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12.5" r="8"/><path d="M12 8.5v4l2.5 2.5M10 2.5h4"/>',
    flag: '<path d="M5 21V4M5 4.5h11.5l-2 4 2 4H5"/>',
    pencil: '<path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    building: '<path d="M3 21h18M5 21V10l5 3v-3l5 3V5h4v16"/>',
    bolt: '<path d="M13 2.5 4.5 14H11l-1 7.5L18.5 10H12Z"/>',
    truck: '<path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3.5v3h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    printer: '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.2"/>',
    cart: '<path d="M3 4h2l2.4 11h11L21 7.5H6"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6 6 0 0 1 3.5 5.8"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7"/>',
    camera: '<path d="M4 8.5h3.2L9 5.5h6l1.8 3H20V19H4z"/><circle cx="12" cy="13.5" r="3.4"/>',
    trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    scale: '<path d="M12 3.5V21M7.5 21h9M5 7h14M5 7l-2.8 6.5a2.9 2.9 0 0 0 5.6 0ZM19 7l-2.8 6.5a2.9 2.9 0 0 0 5.6 0Z"/>',
    map: '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5Z"/><path d="M9 4.5v13M15 6.5v13"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6Z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16.5 6.5l3 3"/>',
    document: '<path d="M6 3h8.5L19 7.5V21H6z"/><path d="M14 3v5h5M9 13h6.5M9 17h4.5"/>',
    folder: '<path d="M3 7a1.5 1.5 0 0 1 1.5-1.5h4.3l2 2h8.7A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18Z"/>',
    wrench: '<path d="M14.6 6.4a4.2 4.2 0 0 0 5.2 5.2L11 20.4a2.2 2.2 0 0 1-3.1-3.1Z"/><path d="M14.6 6.4 17.5 3.5l3 3-2.9 2.9"/>',
    updown: '<path d="M12 3.5v17M8 7.5l4-4 4 4M8 16.5l4 4 4-4"/>',
    leftright: '<path d="M3.5 12h17M7.5 8l-4 4 4 4M16.5 8l4 4-4 4"/>',
    external: '<path d="M7 17 17 7M9 7h8v8"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H12"/>',
    shuffle: '<path d="M16 3.5h4.5V8M3.5 20 20.5 3.5M20.5 16v4.5H16M15 15l5.5 5.5M3.5 4 9 9.5"/>',
    save: '<path d="M5 3.5h11l3 3V20.5H5z"/><path d="M8.5 3.5V8h6M8.5 20.5V14h7v6.5"/>',
    cylinder: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
    eraser: '<path d="M7 20.5h13M4.6 15.4 14 6l5 5-7.5 7.5H8Z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    calculator: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
    question: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.4M12 16.8h.01"/>',
    message: '<path d="M4 5h16v11H9l-5 4Z"/>',
    monitor: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
    hash: '<path d="M5 9h14M5 15h14M10.5 4 8.5 20M15.5 4l-2 16"/>',
    ruler: '<path d="m3.5 15.5 12-12 5 5-12 12Z"/><path d="m7.5 11.5 2 2M10.5 8.5l2 2M13.5 5.5l2 2"/>',
    dotGreen: '<circle cx="12" cy="12" r="5" style="fill:var(--k-success,#1d8a45);stroke:none"/>',
    dotRed: '<circle cx="12" cy="12" r="5" style="fill:var(--k-danger,#d70015);stroke:none"/>',
    dotOrange: '<circle cx="12" cy="12" r="5" style="fill:var(--k-warning,#b25d00);stroke:none"/>',
    dotNeutral: '<circle cx="12" cy="12" r="4.5"/>',
    square: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>'
  };

  var aliases = {
    '⚠': 'warning', '⚠️': 'warning', '❗': 'warning', '🚨': 'warning',
    '✓': 'check', '✔': 'check', '✅': 'check', '☑': 'check',
    '✕': 'close', '✖': 'close', '❌': 'close', '🚫': 'close',
    '🔄': 'refresh', '↻': 'refresh', '♻': 'refresh',
    '🧪': 'flask', '🔬': 'flask', '⚗': 'flask', '⚗️': 'flask', '🧫': 'flask', '🩺': 'flask',
    '📦': 'package', '🧊': 'package', '🧱': 'package', '🧩': 'package',
    '🏷': 'tag', '🏷️': 'tag', '💰': 'tag', '📋': 'clipboard', '📝': 'clipboard',
    '⬇': 'download', '⭐': 'star', '★': 'star', '🏆': 'star', '📊': 'chart', '📈': 'chart', '📉': 'chart',
    '✨': 'sparkles', '🚀': 'sparkles', '🎉': 'sparkles', '💡': 'info', 'ℹ': 'info', 'ℹ️': 'info',
    '🔍': 'search', '🔎': 'search', '⚙': 'sliders', '▶': 'play', '◀': 'back', '⏩': 'forward',
    '⏸': 'pause', '⏹': 'stop', '🛑': 'blocked', '⛔': 'blocked',
    '📅': 'calendar', '🗓': 'calendar', '⏱': 'clock', '⏳': 'clock', '⏰': 'clock', '🕐': 'clock',
    '🏁': 'flag', '✏': 'pencil', '🔗': 'link', '🏭': 'building', '🏬': 'building', '🏢': 'building',
    '⚡': 'bolt', '🚚': 'truck', '🖨': 'printer', '📍': 'pin', '📌': 'pin', '🛒': 'cart',
    '🤝': 'people', '👤': 'person', '🔓': 'unlock', '🔒': 'lock', '🔑': 'key', '📷': 'camera',
    '🗑': 'trash', '⚖': 'scale', '🗺': 'map', '🧭': 'map', '🛣': 'map', '📥': 'inbox',
    '🧾': 'document', '📄': 'document', '📒': 'document', '📖': 'document',
    '📂': 'folder', '🗂': 'folder', '🗄': 'folder', '🔧': 'wrench', '↕': 'updown', '↔': 'leftright',
    '↗': 'external', '↩': 'undo', '🔀': 'shuffle', '💾': 'save', '🛢': 'cylinder', '🧹': 'eraser',
    '🎯': 'target', '🌅': 'sun', '🌇': 'sun', '🌙': 'moon', '💤': 'moon', '🧮': 'calculator',
    '❓': 'question', '📨': 'message', '💬': 'message', '📺': 'monitor', '🔢': 'hash', '📐': 'ruler',
    '🟢': 'dotGreen', '🔴': 'dotRed', '🟠': 'dotOrange', '⚪': 'dotNeutral', '⬛': 'square'
  };
  var emojiPattern = /(\p{Extended_Pictographic}(?:\uFE0F|\uFE0E|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E|\p{Emoji_Modifier})?)*|[✓✔✕✖★⬇↻])/gu;
  var skipSelector = 'script,style,noscript,textarea,input,select,option,code,pre,svg,[contenteditable="true"],[data-allow-emoji]';

  // Páginas públicas (login e manuais) não carregam o shell de autenticação.
  // Mantém o mesmo tema nelas sem duplicar controles ou regras de aparência.
  function syncStandaloneTheme() {
    if (typeof window.applyKuryosTheme === 'function') return;
    var saved = null;
    try { saved = localStorage.getItem('kuryos-theme'); } catch (error) {}
    var followsSystem = saved !== 'light' && saved !== 'dark';
    var effective = followsSystem
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : saved;
    if (followsSystem) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', saved);
    document.documentElement.classList.toggle('dark', effective === 'dark');
    document.documentElement.dataset.effectiveTheme = effective;
  }

  // Sem correspond\u00EAncia, o s\u00EDmbolo some: um c\u00EDrculo gen\u00E9rico n\u00E3o diz nada.
  function iconName(symbol) {
    return aliases[symbol] || aliases[symbol.replace(/[\uFE0E\uFE0F]/g, '')] || null;
  }

  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || '') + '</svg>';
  }

  function iconElement(symbol) {
    if (!iconName(symbol)) return null;
    var span = document.createElement('span');
    span.className = 'kuryos-inline-icon';
    span.setAttribute('aria-hidden', 'true');
    span.setAttribute('data-icon', iconName(symbol));
    span.innerHTML = svg(iconName(symbol));
    return span;
  }

  function replaceTextNode(node) {
    if (!node || !node.nodeValue || !emojiPattern.test(node.nodeValue)) return;
    emojiPattern.lastIndex = 0;
    var parent = node.parentElement;
    if (!parent || parent.closest(skipSelector)) return;
    var text = node.nodeValue;
    var fragment = document.createDocumentFragment();
    var lastIndex = 0;
    var match;
    while ((match = emojiPattern.exec(text))) {
      if (match.index > lastIndex) fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      var icon = iconElement(match[0]);
      if (icon) fragment.appendChild(icon);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    node.replaceWith(fragment);
  }

  function process(root) {
    if (!root || root.nodeType === Node.TEXT_NODE) return replaceTextNode(root);
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE && root.matches(skipSelector)) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(replaceTextNode);
    if (root.querySelectorAll) {
      root.querySelectorAll('[title],[aria-label],[placeholder]').forEach(function (element) {
        ['title', 'aria-label', 'placeholder'].forEach(function (attribute) {
          var value = element.getAttribute(attribute);
          if (value && emojiPattern.test(value)) element.setAttribute(attribute, value.replace(emojiPattern, '').replace(/\s{2,}/g, ' ').trim());
          emojiPattern.lastIndex = 0;
        });
      });
    }
  }

  function start() {
    process(document.body);
    var queued = new Set();
    var scheduled = false;
    var flush = function () {
      scheduled = false;
      queued.forEach(process);
      queued.clear();
    };
    new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) { queued.add(node); });
      });
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(flush);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.KuryosIcons = { svg: svg, process: process };
  syncStandaloneTheme();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncStandaloneTheme);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
