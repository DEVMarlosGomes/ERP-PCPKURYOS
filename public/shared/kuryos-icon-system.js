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
    circle: '<circle cx="12" cy="12" r="8"/>'
  };

  var aliases = {
    '⚠': 'warning', '⚠️': 'warning', '❗': 'warning', '🚨': 'warning',
    '✓': 'check', '✔': 'check', '✅': 'check', '☑': 'check',
    '✕': 'close', '✖': 'close', '❌': 'close', '🚫': 'close',
    '🔄': 'refresh', '↻': 'refresh',
    '🧪': 'flask', '🔬': 'flask', '⚗': 'flask', '⚗️': 'flask',
    '📦': 'package', '🏷': 'tag', '🏷️': 'tag', '📋': 'clipboard', '📝': 'clipboard',
    '⬇': 'download', '⭐': 'star', '★': 'star', '📊': 'chart', '📈': 'chart',
    '✨': 'sparkles', '🚀': 'sparkles', '💡': 'info', 'ℹ': 'info', 'ℹ️': 'info'
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

  function iconName(symbol) {
    return aliases[symbol] || aliases[symbol.replace(/[\uFE0E\uFE0F]/g, '')] || 'circle';
  }

  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.circle) + '</svg>';
  }

  function iconElement(symbol) {
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
      fragment.appendChild(iconElement(match[0]));
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
