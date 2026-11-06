/* Leeds prototyping CMS - UI kit: form rendering from schemas, rich text editor, media picker, modals, toasts */
(function () {
  'use strict';

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }

  /* ---------- toasts ---------- */
  function toast(msg, kind, ms) {
    var root = document.getElementById('toast-root');
    if (!root) return;
    var t = el('div', { class: 'toast toast--' + (kind || 'info'), role: 'status' }, [msg]);
    root.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('toast--in'); });
    setTimeout(function () { t.classList.remove('toast--in'); setTimeout(function () { t.remove(); }, 300); }, ms || 2600);
  }

  /* ---------- modals ---------- */
  function modal(opts) {
    var root = document.getElementById('modal-root');
    var box = el('div', { class: 'modal ' + (opts.wide ? 'modal--wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Dialog' });
    var overlay = el('div', { class: 'modal-overlay' }, [box]);
    var head = el('div', { class: 'modal__head' }, [el('h2', { class: 'modal__title', text: opts.title || '' }), el('button', { class: 'btn btn--icon', type: 'button', 'aria-label': 'Close', onclick: close }, ['✕'])]);
    var body = el('div', { class: 'modal__body' });
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
    var foot = el('div', { class: 'modal__foot' });
    (opts.buttons || []).forEach(function (b) {
      foot.appendChild(el('button', { class: 'btn ' + (b.primary ? 'btn--primary' : b.danger ? 'btn--danger' : ''), type: 'button', onclick: function () { var r = b.onClick ? b.onClick(api) : true; if (r !== false) close(); } }, [b.label]));
    });
    box.appendChild(head); box.appendChild(body); if ((opts.buttons || []).length) box.appendChild(foot);
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay && !opts.sticky) close(); });
    document.addEventListener('keydown', onKey);
    root.appendChild(overlay);
    var api = { close: close, body: body, box: box };
    setTimeout(function () { var f = box.querySelector('input, textarea, select, button.btn--primary'); if (f) f.focus(); }, 30);
    return api;
  }
  function confirm(title, message, okLabel, danger) {
    return new Promise(function (res) {
      modal({ title: title, body: '<p>' + esc(message) + '</p>', buttons: [{ label: 'Cancel', onClick: function () { res(false); } }, { label: okLabel || 'OK', primary: !danger, danger: danger, onClick: function () { res(true); } }], onClose: function () { res(false); } });
    });
  }
  function prompt(title, label, value, okLabel) {
    return new Promise(function (res) {
      var input = el('input', { class: 'input', type: 'text', value: value || '' });
      var form = el('form', { onsubmit: function (e) { e.preventDefault(); res(input.value); m.close(); } }, [el('label', { class: 'field' }, [el('span', { class: 'field__label', text: label }), input])]);
      var m = modal({ title: title, body: form, buttons: [{ label: 'Cancel', onClick: function () { res(null); } }, { label: okLabel || 'OK', primary: true, onClick: function () { res(input.value); } }], onClose: function () { res(null); } });
    });
  }

  /* ---------- HTML cleaning ---------- */
  var KEEP_ATTRS = { href: 1, src: 1, alt: 1, title: 1, 'class': 1, cite: 1, datetime: 1, colspan: 1, rowspan: 1, id: 1, name: 1, target: 1, rel: 1, 'aria-hidden': 1, 'aria-label': 1, role: 1, scope: 1, lang: 1 };
  function cleanHtml(html, fromPaste) {
    var d = document.createElement('div');
    d.innerHTML = html;
    Array.prototype.slice.call(d.querySelectorAll('script, style, meta, link, o\\:p, xml')).forEach(function (n) { n.remove(); });
    Array.prototype.slice.call(d.querySelectorAll('*')).forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var keep = !!KEEP_ATTRS[a.name];
        if (fromPaste && a.name === 'class') keep = /^(uol-|text-highlight|in-text|image-quote|event-card)/.test(a.value);
        if (fromPaste && (a.name === 'id' || a.name === 'name')) keep = false;
        if (!keep) n.removeAttribute(a.name);
      });
      if (fromPaste && (n.tagName === 'SPAN' || n.tagName === 'FONT') && !n.className) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); return; }
      if (n.tagName === 'B') { var s = document.createElement('strong'); s.innerHTML = n.innerHTML; n.replaceWith(s); }
      else if (n.tagName === 'I') { var em = document.createElement('em'); em.innerHTML = n.innerHTML; n.replaceWith(em); }
      else if (n.tagName === 'DIV' && !n.className && !n.querySelector('div, table, ul, ol, figure, blockquote, h1, h2, h3, h4, h5, h6, p')) { var p = document.createElement('p'); p.innerHTML = n.innerHTML; n.replaceWith(p); }
    });
    return d.innerHTML.replace(/<p>(\s|<br>|&nbsp;)*<\/p>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  /* ---------- rich text editor ---------- */
  var SPECIAL_CHARS = ['–', '—', '‘', '’', '“', '”', '…', '£', '€', '$', '©', '®', '™', '°', '±', '×', '÷', '½', '¼', '¾', '²', '³', 'µ', '¶', '§', '•', '→', '←', '↑', '↓', '✓', '✗', 'é', 'è', 'ê', 'à', 'â', 'ç', 'ñ', 'ö', 'ü', 'ä', 'ø', 'å', 'α', 'β', 'γ', 'δ', 'π', 'Ω', '∞', '≠', '≤', '≥', ' '];
  var COMPONENTS = [
    { label: 'Lead paragraph', html: '<p class="uol-typography-paragraph-intro">Lead paragraph that introduces the page.</p>' },
    { label: 'In-text call to action', html: '<div class="uol-in-text-cta"><h2 class="uol-in-text-cta__heading"><a class="uol-in-text-cta__link" href="#">Call to action</a></h2><p class="uol-in-text-cta__text">Short supporting text.</p></div>' },
    { label: 'Text highlight', html: '<div class="text-highlight"><p>Highlighted paragraph that stands out from the body text.</p></div>' },
    { label: 'Highlight block', html: '<div class="uol-highlight-block"><div class="uol-rich-text"><p>Related information in a tinted block.</p></div></div>' },
    { label: 'Status message: info', html: '<div class="uol-status-message uol-status-message--info"><span class="uol-icon uol-icon--status-info"><span class="hide-accessible">Info:</span> Information message.</span></div>' },
    { label: 'Status message: warning', html: '<div class="uol-status-message uol-status-message--warning"><span class="uol-icon uol-icon--status-warning"><span class="hide-accessible">Warning:</span> Warning message.</span></div>' },
    { label: 'Accordion', html: '<div class="uol-accordion"><h3 class="uol-accordion__title">Accordion title</h3><div class="uol-accordion__content"><div class="uol-accordion__content-inner"><div class="uol-rich-text"><p>Accordion content.</p></div></div></div></div>' },
    { label: 'Pull quote', html: '<div aria-hidden="true" class="uol-typography-pull-quote uol-typography-pull-quote--left"><p>A key sentence repeated as a pull quote.</p></div>' },
    { label: 'Blockquote with citation', html: '<blockquote class="uol-typography-blockquote"><p>Quoted text.</p><footer><cite>Name, role</cite></footer></blockquote>' },
    { label: 'In-text facts', html: '<div class="uol-in-text-facts"><h3 class="uol-in-text-facts__title">Key facts</h3><div class="uol-in-text-facts__container"><div class="uol-in-text-fact__item"><h4 class="uol-in-text-fact__item__title">3 years</h4><p class="uol-in-text-fact__item__description">Full time</p></div><div class="uol-in-text-fact__item"><h4 class="uol-in-text-fact__item__title">September</h4><p class="uol-in-text-fact__item__description">Start date</p></div></div></div>' },
    { label: 'Linked list', html: '<ul class="uol-linked-list"><li class="uol-linked-list__item"><a class="uol-linked-list__link" href="#">First link</a></li><li class="uol-linked-list__item"><a class="uol-linked-list__link" href="#">Second link</a></li></ul>' },
    { label: 'Button link', html: '<div class="uol-link-button-container"><a class="uol-button uol-link-button uol-button--primary" href="#">Button label</a></div>' },
    { label: 'Arrow link', html: '<p><a class="uol-arrow-link" href="#">Text link with arrow</a></p>' },
    { label: 'Featured image with caption', html: '<figure class="uol-featured-image"><img class="uol-featured-image__img" src="https://designsystem.leeds.ac.uk/placeholders/banner/banner-02.jpg" alt="Describe the image"><figcaption class="uol-featured-image__caption">Image caption</figcaption></figure>' },
    { label: 'Horizontal rule', html: '<hr>' }
  ];

  function richEditor(value, onChange, opts) {
    opts = opts || {};
    var wrap = el('div', { class: 'rte' + (opts.tall ? ' rte--tall' : '') });
    var bar = el('div', { class: 'rte__bar', role: 'toolbar', 'aria-label': 'Formatting' });
    var area = el('div', { class: 'rte__area', contenteditable: 'true', spellcheck: 'true' });
    area.innerHTML = value || '';
    var raw = el('textarea', { class: 'rte__raw input input--mono', hidden: true });
    raw.value = value || '';
    var foot = el('div', { class: 'rte__foot' });
    var showingRaw = false, pasteAsText = false, savedRange = null;

    function emit() { var html = cleanHtml(area.innerHTML); raw.value = html; onChange(html); updateFoot(); }
    function focusArea() { area.focus(); if (savedRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); } }
    function cmd(name, arg) { focusArea(); document.execCommand(name, false, arg || null); emit(); }
    function saveRange() { var s = window.getSelection(); if (s.rangeCount && area.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); }
    function insertHtml(html) { focusArea(); document.execCommand('insertHTML', false, html); emit(); }
    function blockOf(node) { while (node && node !== area) { if (node.nodeType === 1 && /^(P|H[1-6]|DIV|LI|BLOCKQUOTE|PRE|TD|TH|FIGCAPTION)$/.test(node.tagName)) return node; node = node.parentNode; } return null; }
    function selectionNode() { var s = window.getSelection(); return s.rangeCount ? s.getRangeAt(0).startContainer : null; }
    function updateFoot() {
      var text = area.textContent || '';
      var words = text.trim() ? text.trim().split(/\s+/).length : 0;
      foot.textContent = words + ' words, ' + text.length + ' characters' + (pasteAsText ? ' · pasting as plain text' : '');
    }

    /* --- groups --- */
    function btn(label, title, fn, extraClass) {
      return el('button', { type: 'button', class: 'rte__btn' + (extraClass ? ' ' + extraClass : ''), title: title, 'aria-label': title, onmousedown: function (e) { e.preventDefault(); saveRange(); }, onclick: function (e) { e.preventDefault(); fn(); } }, [label]);
    }
    function sep() { return el('span', { class: 'rte__sep', 'aria-hidden': 'true' }); }
    function menu(label, title, items) {
      var list = el('div', { class: 'menu rte__menu', hidden: true }, items.map(function (i) { return i === '-' ? el('hr') : el('button', { type: 'button', class: 'menu__item', onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.preventDefault(); list.hidden = true; i.onClick(); } }, [i.label]); }));
      var b = el('button', { type: 'button', class: 'rte__btn', title: title, 'aria-haspopup': 'true', onmousedown: function (e) { e.preventDefault(); saveRange(); }, onclick: function (e) { e.preventDefault(); e.stopPropagation(); var open = list.hidden; document.querySelectorAll('.menu').forEach(function (m) { m.hidden = true; }); if (open) floatMenu(list, b, { align: 'left' }); } }, [label + ' ▾']);
      document.addEventListener('click', function () { list.hidden = true; });
      return el('span', { class: 'menu-wrap' }, [b, list]);
    }

    /* format dropdown */
    var fmt = el('select', { class: 'rte__select', 'aria-label': 'Paragraph format', onmousedown: saveRange }, [['p', 'Paragraph'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['h5', 'Heading 5'], ['h6', 'Heading 6'], ['lead', 'Lead paragraph'], ['small', 'Small paragraph'], ['pre', 'Preformatted']].map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
    fmt.addEventListener('change', function () {
      var v = fmt.value;
      focusArea();
      if (v === 'lead' || v === 'small') { document.execCommand('formatBlock', false, 'p'); var b = blockOf(selectionNode()); if (b) b.className = v === 'lead' ? 'uol-typography-paragraph-intro' : 'uol-typography-paragraph-small'; }
      else { document.execCommand('formatBlock', false, v); var b2 = blockOf(selectionNode()); if (b2 && /uol-typography-paragraph/.test(b2.className)) b2.removeAttribute('class'); }
      emit();
    });
    function syncFormat() {
      var b = blockOf(selectionNode());
      if (!b) return;
      var tag = b.tagName.toLowerCase();
      if (tag === 'p' && /paragraph-intro/.test(b.className)) fmt.value = 'lead';
      else if (tag === 'p' && /paragraph-small/.test(b.className)) fmt.value = 'small';
      else if (['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre'].indexOf(tag) !== -1) fmt.value = tag;
      else fmt.value = 'p';
      wrap.querySelectorAll('[data-state]').forEach(function (x) { var st = x.getAttribute('data-state'); var on = false; try { on = document.queryCommandState(st); } catch (e) {} x.classList.toggle('is-on', !!on); });
    }

    /* link dialog */
    function linkDialog() {
      saveRange();
      var existing = null, n = selectionNode();
      while (n && n !== area) { if (n.nodeType === 1 && n.tagName === 'A') { existing = n; break; } n = n.parentNode; }
      var sel = window.getSelection();
      var selText = existing ? existing.textContent : (sel.rangeCount ? sel.toString() : '');
      var url = el('input', { class: 'input', type: 'text', value: existing ? existing.getAttribute('href') || '' : '', placeholder: '/page, https://… , mailto:… or #anchor' });
      var text = el('input', { class: 'input', type: 'text', value: selText });
      var title = el('input', { class: 'input', type: 'text', value: existing ? existing.getAttribute('title') || '' : '' });
      var newTab = el('input', { type: 'checkbox' }); newTab.checked = !!(existing && existing.target === '_blank');
      var pagesSel = window.UOL_STORE ? el('select', { class: 'input input--sm' }, [el('option', { value: '', text: 'Link to a page in this project…' })].concat(window.UOL_STORE.data.pages.map(function (p) { return el('option', { value: '/' + p.slug, text: p.title }); }))) : null;
      if (pagesSel) pagesSel.addEventListener('change', function () { if (pagesSel.value) { url.value = pagesSel.value; if (!text.value) text.value = pagesSel.options[pagesSel.selectedIndex].text; } });
      var form = el('form', { onsubmit: function (e) { e.preventDefault(); apply(); m.close(); } }, [
        el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'URL' }), url]), pagesSel,
        el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Link text' }), text]),
        el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Title (tooltip, optional)' }), title]),
        el('label', { class: 'check' }, [newTab, el('span', { text: 'Open in a new tab' })])
      ]);
      function apply() {
        var href = url.value.trim(); if (!href) return;
        focusArea();
        if (existing) { existing.setAttribute('href', href); if (text.value.trim()) existing.textContent = text.value.trim(); }
        else {
          var label = text.value.trim() || href;
          var a = el('a', { href: href }, [label]);
          var r = savedRange || (window.getSelection().rangeCount ? window.getSelection().getRangeAt(0) : null);
          if (r) { r.deleteContents(); r.insertNode(a); r.setStartAfter(a); r.collapse(true); window.getSelection().removeAllRanges(); window.getSelection().addRange(r); } else area.appendChild(a);
          existing = a;
        }
        if (title.value.trim()) existing.setAttribute('title', title.value.trim()); else existing.removeAttribute('title');
        if (newTab.checked) { existing.setAttribute('target', '_blank'); existing.setAttribute('rel', 'noopener'); } else { existing.removeAttribute('target'); existing.removeAttribute('rel'); }
        emit();
      }
      var m = modal({ title: existing ? 'Edit link' : 'Insert link', body: form, buttons: [{ label: 'Cancel' }].concat(existing ? [{ label: 'Remove link', danger: true, onClick: function () { focusArea(); var t = document.createTextNode(existing.textContent); existing.replaceWith(t); emit(); } }] : []).concat([{ label: existing ? 'Update' : 'Insert', primary: true, onClick: function () { apply(); } }]) });
    }
    function anchorDialog() {
      saveRange();
      prompt('Insert anchor', 'Anchor id (letters, numbers and hyphens; link to it with #id)', '', 'Insert').then(function (id) {
        if (!id) return;
        id = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
        if (id) insertHtml('<a id="' + esc(id) + '" class="uol-anchor"></a>');
      });
    }
    /* tables */
    function tableDialog() {
      saveRange();
      var rows = el('input', { class: 'input', type: 'number', min: 1, max: 50, value: 3 });
      var cols = el('input', { class: 'input', type: 'number', min: 1, max: 12, value: 3 });
      var caption = el('input', { class: 'input', type: 'text', placeholder: 'Caption (recommended for accessibility)' });
      var header = el('input', { type: 'checkbox' }); header.checked = true;
      var form = el('form', { onsubmit: function (e) { e.preventDefault(); insert(); m.close(); } }, [el('div', { class: 'row' }, [el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Rows' }), rows]), el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Columns' }), cols])]), el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Caption' }), caption]), el('label', { class: 'check' }, [header, el('span', { text: 'First row is a header row' })])]);
      function insert() {
        var r = Math.max(1, parseInt(rows.value, 10) || 1), c = Math.max(1, parseInt(cols.value, 10) || 1), html = '<table>';
        if (caption.value.trim()) html += '<caption>' + esc(caption.value.trim()) + '</caption>';
        var i, j;
        if (header.checked) { html += '<thead><tr>'; for (j = 0; j < c; j++) html += '<th scope="col">Heading ' + (j + 1) + '</th>'; html += '</tr></thead>'; r--; }
        html += '<tbody>';
        for (i = 0; i < r; i++) { html += '<tr>'; for (j = 0; j < c; j++) html += '<td>Cell</td>'; html += '</tr>'; }
        html += '</tbody></table><p></p>';
        insertHtml(html);
      }
      var m = modal({ title: 'Insert table', body: form, buttons: [{ label: 'Cancel' }, { label: 'Insert', primary: true, onClick: function () { insert(); } }] });
    }
    function cellOf() { var n = selectionNode(); while (n && n !== area) { if (n.nodeType === 1 && (n.tagName === 'TD' || n.tagName === 'TH')) return n; n = n.parentNode; } return null; }
    function tableTool(action) {
      focusArea();
      var cell = cellOf(); if (!cell) { toast('Put the cursor inside a table first', 'warn'); return; }
      var row = cell.parentNode, table = cell.closest('table'), idx = Array.prototype.indexOf.call(row.children, cell);
      if (action === 'rowAbove' || action === 'rowBelow') { var nr = row.cloneNode(true); Array.prototype.forEach.call(nr.children, function (c) { var td = document.createElement(row.parentNode.tagName === 'THEAD' ? 'th' : 'td'); td.textContent = ''; c.replaceWith(td); }); row.parentNode.insertBefore(nr, action === 'rowAbove' ? row : row.nextSibling); }
      if (action === 'rowDelete') { if (table.querySelectorAll('tr').length > 1) row.remove(); }
      if (action === 'colLeft' || action === 'colRight') Array.prototype.forEach.call(table.querySelectorAll('tr'), function (tr) { var ref = tr.children[idx]; var c = document.createElement(tr.parentNode.tagName === 'THEAD' ? 'th' : 'td'); c.textContent = ''; if (!ref) tr.appendChild(c); else tr.insertBefore(c, action === 'colLeft' ? ref : ref.nextSibling); });
      if (action === 'colDelete') Array.prototype.forEach.call(table.querySelectorAll('tr'), function (tr) { if (tr.children.length > 1 && tr.children[idx]) tr.children[idx].remove(); });
      if (action === 'headerToggle') { var first = table.querySelector('tr'); if (!first) return; var isHead = first.parentNode.tagName === 'THEAD'; if (isHead) { var tb = table.querySelector('tbody') || table; Array.prototype.forEach.call(first.children, function (c) { var td = document.createElement('td'); td.innerHTML = c.innerHTML; c.replaceWith(td); }); tb.insertBefore(first, tb.firstChild); first.parentNode.tagName === 'THEAD' && first.parentNode.remove(); } else { var th = document.createElement('thead'); Array.prototype.forEach.call(first.children, function (c) { var h = document.createElement('th'); h.setAttribute('scope', 'col'); h.innerHTML = c.innerHTML; c.replaceWith(h); }); th.appendChild(first); table.insertBefore(th, table.firstChild); } }
      if (action === 'caption') { var cap = table.querySelector('caption'); prompt('Table caption', 'Caption', cap ? cap.textContent : '', 'Save').then(function (v) { if (v === null) return; if (!cap) { cap = document.createElement('caption'); table.insertBefore(cap, table.firstChild); } if (v.trim()) cap.textContent = v.trim(); else cap.remove(); emit(); }); return; }
      if (action === 'tableDelete') table.remove();
      emit();
    }
    /* special characters */
    function charPicker() {
      saveRange();
      var grid = el('div', { class: 'chargrid' }, SPECIAL_CHARS.map(function (ch) { return el('button', { type: 'button', class: 'chargrid__btn', title: 'U+' + ch.charCodeAt(0).toString(16).toUpperCase(), onclick: function () { insertHtml(ch === ' ' ? '&nbsp;' : esc(ch)); m.close(); } }, [ch === ' ' ? 'nbsp' : ch]); }));
      var m = modal({ title: 'Special characters', body: grid });
    }
    function toggleRaw() {
      showingRaw = !showingRaw;
      if (showingRaw) { raw.value = cleanHtml(area.innerHTML); area.hidden = true; raw.hidden = false; raw.focus(); }
      else { area.innerHTML = raw.value; area.hidden = false; raw.hidden = true; emit(); }
      wrap.classList.toggle('rte--raw', showingRaw);
    }
    function toggleMax() { wrap.classList.toggle('rte--max'); maxBtn.textContent = wrap.classList.contains('rte--max') ? '✖ Exit' : '⛶'; maxBtn.title = wrap.classList.contains('rte--max') ? 'Exit full screen (Esc)' : 'Maximise the editor'; area.focus(); }
    function findReplace() {
      var find = el('input', { class: 'input', type: 'text', placeholder: 'Find' }), rep = el('input', { class: 'input', type: 'text', placeholder: 'Replace with' });
      var form = el('form', { onsubmit: function (e) { e.preventDefault(); } }, [el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Find' }), find]), el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Replace with' }), rep])]);
      modal({ title: 'Find and replace', body: form, buttons: [{ label: 'Cancel' }, { label: 'Replace all', primary: true, onClick: function () { if (!find.value) return false; var count = 0; var walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT); var nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode); nodes.forEach(function (t) { if (t.nodeValue.indexOf(find.value) !== -1) { count += t.nodeValue.split(find.value).length - 1; t.nodeValue = t.nodeValue.split(find.value).join(rep.value); } }); emit(); toast(count + ' replaced', count ? 'success' : 'info'); } }] });
    }
    var maxBtn = btn('⛶', 'Maximise the editor', toggleMax);
    var spellBtn = btn('ABC✓', 'Spellcheck on/off', function () { area.spellcheck = !area.spellcheck; spellBtn.classList.toggle('is-on', area.spellcheck); area.blur(); area.focus(); });
    spellBtn.classList.add('is-on');
    var pasteBtn = btn('Paste as text', 'Toggle pasting as plain text (strips formatting from pasted content)', function () { pasteAsText = !pasteAsText; pasteBtn.classList.toggle('is-on', pasteAsText); updateFoot(); });

    [
      btn('B', 'Bold (Ctrl+B)', function () { cmd('bold'); }, 'rte__btn--b'), btn('I', 'Italic (Ctrl+I)', function () { cmd('italic'); }, 'rte__btn--i'), btn('S', 'Strikethrough', function () { cmd('strikeThrough'); }, 'rte__btn--s'), btn('x²', 'Superscript', function () { cmd('superscript'); }), btn('x₂', 'Subscript', function () { cmd('subscript'); }),
      sep(), fmt, sep(),
      btn('↶', 'Undo (Ctrl+Z)', function () { cmd('undo'); }), btn('↷', 'Redo (Ctrl+Y)', function () { cmd('redo'); }), sep(),
      btn('✂', 'Cut', function () { cmd('cut'); }), btn('⎘', 'Copy', function () { cmd('copy'); }), pasteBtn, sep(),
      btn('• List', 'Bullet list', function () { cmd('insertUnorderedList'); }), btn('1. List', 'Numbered list', function () { cmd('insertOrderedList'); }), btn('⇥', 'Indent', function () { cmd('indent'); }), btn('⇤', 'Outdent', function () { cmd('outdent'); }), sep(),
      btn('❝', 'Blockquote', function () { cmd('formatBlock', 'blockquote'); }), btn('Link', 'Insert or edit link (Ctrl+K)', linkDialog), btn('Unlink', 'Remove link', function () { cmd('unlink'); }), btn('⚑', 'Insert anchor', anchorDialog), sep(),
      btn('Image', 'Insert an image from the library', function () { saveRange(); mediaPicker(function (ref, rec) { var alt = (rec && rec.name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '); insertHtml('<figure><img src="' + ref + '" alt="' + esc(alt) + '"><figcaption>' + esc(alt) + '</figcaption></figure><p></p>'); }); }),
      menu('Table', 'Tables', [{ label: 'Insert table…', onClick: tableDialog }, '-', { label: 'Row above', onClick: function () { tableTool('rowAbove'); } }, { label: 'Row below', onClick: function () { tableTool('rowBelow'); } }, { label: 'Delete row', onClick: function () { tableTool('rowDelete'); } }, '-', { label: 'Column left', onClick: function () { tableTool('colLeft'); } }, { label: 'Column right', onClick: function () { tableTool('colRight'); } }, { label: 'Delete column', onClick: function () { tableTool('colDelete'); } }, '-', { label: 'Toggle header row', onClick: function () { tableTool('headerToggle'); } }, { label: 'Caption…', onClick: function () { tableTool('caption'); } }, { label: 'Delete table', onClick: function () { tableTool('tableDelete'); } }]),
      menu('Insert', 'Insert a design system component', COMPONENTS.map(function (c) { return { label: c.label, onClick: function () { insertHtml(c.html + '<p></p>'); } }; })),
      btn('Ω', 'Special characters', charPicker), sep(),
      btn('Clear', 'Clear formatting', function () { cmd('removeFormat'); var b = blockOf(selectionNode()); if (b && b.tagName !== 'P') { cmd('formatBlock', 'p'); } }),
      btn('Find', 'Find and replace', findReplace), spellBtn, btn('</>', 'Edit HTML source', toggleRaw), maxBtn
    ].forEach(function (b) { bar.appendChild(b); });
    bar.querySelector('.rte__btn--b').setAttribute('data-state', 'bold');
    bar.querySelector('.rte__btn--i').setAttribute('data-state', 'italic');
    bar.querySelector('.rte__btn--s').setAttribute('data-state', 'strikeThrough');

    area.addEventListener('input', debounce(emit, 120));
    area.addEventListener('blur', function () { saveRange(); emit(); });
    area.addEventListener('keyup', syncFormat);
    area.addEventListener('mouseup', syncFormat);
    area.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); linkDialog(); }
      if (e.key === 'Escape' && wrap.classList.contains('rte--max')) { e.preventDefault(); toggleMax(); }
      if (e.key === 'Tab' && cellOf()) { e.preventDefault(); var cell = cellOf(); var next = e.shiftKey ? (cell.previousElementSibling || (cell.parentNode.previousElementSibling && cell.parentNode.previousElementSibling.lastElementChild)) : (cell.nextElementSibling || (cell.parentNode.nextElementSibling && cell.parentNode.nextElementSibling.firstElementChild)); if (next) { var r = document.createRange(); r.selectNodeContents(next); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } }
    });
    area.addEventListener('paste', function (e) {
      var html = e.clipboardData && e.clipboardData.getData('text/html');
      var text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (html && !pasteAsText) { e.preventDefault(); document.execCommand('insertHTML', false, cleanHtml(html, true)); emit(); }
      else if (text) { e.preventDefault(); document.execCommand('insertText', false, text); }
    });
    area.addEventListener('dblclick', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a) { e.preventDefault(); linkDialog(); } });
    raw.addEventListener('input', debounce(function () { onChange(raw.value); }, 150));
    wrap.appendChild(bar); wrap.appendChild(area); wrap.appendChild(raw); wrap.appendChild(foot);
    updateFoot();
    return wrap;
  }

  /* ---------- media library picker ---------- */
  function fmtBytes(n) { return n > 1024 * 1024 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }
  function mediaPicker(onPick) {
    var M = window.UOL_MEDIA;
    var grid = el('div', { class: 'media-grid media-grid--picker' });
    var drop = el('div', { class: 'dropzone' }, [el('strong', { text: 'Drop images here' }), el('span', { class: 'small muted', text: ' or ' }), el('button', { type: 'button', class: 'btn btn--sm', onclick: function () { file.click(); } }, ['Choose files'])]);
    var file = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    var m;
    function render() {
      grid.innerHTML = '';
      var items = M.list();
      if (!items.length) grid.appendChild(el('p', { class: 'muted small', text: 'No images in the library yet. Upload some above.' }));
      items.forEach(function (r) {
        grid.appendChild(el('button', { type: 'button', class: 'media-item', title: r.name, onclick: function () { onPick(M.ref(r.id), r); m.close(); } }, [
          el('span', { class: 'media-item__thumb' }, [el('img', { src: M.url(r.id), alt: '' })]),
          el('span', { class: 'media-item__name', text: r.name }),
          el('span', { class: 'media-item__meta', text: (r.width ? r.width + '×' + r.height + ' · ' : '') + fmtBytes(r.size || 0) })
        ]));
      });
    }
    function addFiles(files) {
      if (!files || !files.length) return;
      toast('Adding ' + files.length + ' image' + (files.length === 1 ? '' : 's') + '…', 'info', 1500);
      M.addMany(files).then(function (recs) { render(); if (recs.length === 1) { onPick(M.ref(recs[0].id), recs[0]); m.close(); } else toast(recs.length + ' images added', 'success'); }).catch(function (e) { toast('Upload failed: ' + e.message, 'error', 5000); });
    }
    file.addEventListener('change', function () { addFiles(file.files); file.value = ''; });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); addFiles(e.dataTransfer.files); });
    m = modal({ title: 'Choose an image', wide: true, body: el('div', {}, [drop, file, grid]) });
    M.open().then(render);
    return m;
  }

  /* ---------- image field ---------- */
  function imageField(value, onChange) {
    var M = window.UOL_MEDIA;
    var wrap = el('div', { class: 'imgfield' });
    var input = el('input', { class: 'input', type: 'text', placeholder: 'https://… or use Library / Upload / Placeholder', value: value || '' });
    var thumb = el('div', { class: 'imgfield__thumb' });
    function setThumb(v) {
      var src = M ? M.resolve(v) : v;
      var rec = M && M.isRef(v) ? M.get(M.idOf(v)) : null;
      thumb.innerHTML = src ? '<img src="' + esc(src) + '" alt="">' : '<span>No image</span>';
      thumb.title = rec ? rec.name : (v || '');
    }
    setThumb(value);
    function set(v) { input.value = v; setThumb(v); onChange(v); }
    var ph = el('select', { class: 'input input--sm', 'aria-label': 'Placeholder image' }, [el('option', { value: '', text: 'Placeholder…' })].concat(window.UOL_BLOCKS.placeholders.map(function (p) { return el('option', { value: p.url, text: p.label }); })));
    ph.addEventListener('change', function () { if (ph.value) { set(ph.value); ph.value = ''; } });
    var file = el('input', { type: 'file', accept: 'image/*', hidden: true });
    function addFile(f) {
      if (!f) return;
      if (!M) { var r = new FileReader(); r.onload = function () { set(r.result); }; r.readAsDataURL(f); return; }
      toast('Adding image…', 'info', 1200);
      M.add(f).then(function (rec) { set(M.ref(rec.id)); toast('Image added to the library', 'success', 1500); }).catch(function (e) { toast('Upload failed: ' + e.message, 'error', 5000); });
    }
    file.addEventListener('change', function () { addFile(file.files[0]); file.value = ''; });
    var upload = el('button', { type: 'button', class: 'btn btn--sm', onclick: function () { file.click(); } }, ['Upload']);
    var lib = el('button', { type: 'button', class: 'btn btn--sm', onclick: function () { mediaPicker(function (ref) { set(ref); }); } }, ['Library']);
    var clear = el('button', { type: 'button', class: 'btn btn--sm btn--icon', title: 'Clear', 'aria-label': 'Clear image', onclick: function () { set(''); } }, ['✕']);
    input.addEventListener('input', debounce(function () { setThumb(input.value); onChange(input.value); }, 200));
    wrap.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.some.call(e.dataTransfer.types, function (t) { return t === 'Files'; })) { e.preventDefault(); wrap.classList.add('is-over'); } });
    wrap.addEventListener('dragleave', function () { wrap.classList.remove('is-over'); });
    wrap.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); wrap.classList.remove('is-over'); addFile(e.dataTransfer.files[0]); } });
    wrap.appendChild(thumb);
    wrap.appendChild(el('div', { class: 'imgfield__controls' }, [input, el('div', { class: 'imgfield__row' }, [lib, upload, ph, clear, file])]));
    return wrap;
  }

  /* ---------- schema-driven form ---------- */
  function itemTitle(field, item, index) {
    var key = field.itemLabel || 'title';
    var v = item[key] || item.title || item.label || item.name || item.heading || item.text || item.term || '';
    v = String(v).replace(/<[^>]+>/g, '').trim();
    return v ? (v.length > 48 ? v.slice(0, 46) + '…' : v) : (field.label.replace(/s$/, '') + ' ' + (index + 1));
  }

  function renderForm(container, schema, obj, onChange, path) {
    path = path || [];
    schema.forEach(function (f) {
      if (f.showIf && !f.showIf(obj)) return;
      var value = obj[f.key];
      var fieldEl;
      var change = function (v) { obj[f.key] = v; onChange(path.concat(f.key), v, f); };
      switch (f.type) {
        case 'text': case 'url': case 'number': case 'date': case 'color': {
          var input = el('input', { class: 'input', type: f.type === 'url' ? 'text' : f.type, value: value == null ? '' : value, placeholder: f.placeholder || (f.type === 'url' ? '/page or https://…' : '') });
          input.addEventListener('input', debounce(function () { change(f.type === 'number' ? (input.value === '' ? '' : Number(input.value)) : input.value); }, f.type === 'color' ? 80 : 180));
          if (f.type === 'color') {
            var hex = el('input', { class: 'input input--hex', type: 'text', value: value || '', placeholder: '#000000', 'aria-label': f.label + ' hex' });
            hex.addEventListener('input', debounce(function () { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { input.value = hex.value; change(hex.value); } else if (hex.value === '') change(''); }, 150));
            input.addEventListener('input', function () { hex.value = input.value; });
            fieldEl = el('div', { class: 'colorfield' }, [input, hex]);
          } else fieldEl = input;
          break;
        }
        case 'textarea': {
          var ta = el('textarea', { class: 'input' + (f.tall ? ' input--tall' : '') + (f.mono ? ' input--mono' : ''), rows: f.tall ? 10 : 3 });
          ta.value = value == null ? '' : value;
          ta.addEventListener('input', debounce(function () { change(ta.value); }, 180));
          fieldEl = ta; break;
        }
        case 'html': fieldEl = richEditor(value || '', change, { tall: f.tall }); break;
        case 'image': fieldEl = imageField(value || '', change); break;
        case 'boolean': {
          var cb = el('input', { type: 'checkbox' });
          cb.checked = !!value;
          cb.addEventListener('change', function () { change(cb.checked); });
          fieldEl = el('label', { class: 'check' }, [cb, el('span', { text: f.label })]);
          container.appendChild(el('div', { class: 'field field--check' }, [fieldEl, f.hint ? hintIcon(f.hint) : null]));
          return;
        }
        case 'select': {
          var sel = el('select', { class: 'input' }, (f.options || []).map(function (o) { var opt = el('option', { value: o.value, text: o.label }); if (String(o.value) === String(value == null ? '' : value)) opt.selected = true; return opt; }));
          sel.addEventListener('change', function () { change(sel.value); });
          fieldEl = sel; break;
        }
        case 'list': fieldEl = listField(f, obj, onChange, path); break;
        default: fieldEl = el('div', { text: 'Unsupported field type ' + f.type });
      }
      var label = el('div', { class: 'field__label' }, [el('span', { text: f.label }), f.hint ? hintIcon(f.hint) : null]);
      container.appendChild(el('div', { class: 'field field--' + f.type }, [label, fieldEl]));
    });
  }
  /* a small "?" that shows the hint on hover or focus instead of a line of text under every field */
  function hintIcon(text) { return el('span', { class: 'hint-icon hint-icon--sm', title: text, tabindex: '0', role: 'img', 'aria-label': text }, ['?']); }

  function listField(f, obj, onChange, path) {
    if (!Array.isArray(obj[f.key])) obj[f.key] = [];
    var items = obj[f.key];
    var wrap = el('div', { class: 'list' });
    var listEl = el('div', { class: 'list__items' });
    var openIndex = -1;
    function emit() { onChange(path.concat(f.key), items, f); }
    function render() {
      listEl.innerHTML = '';
      items.forEach(function (item, i) {
        var row = el('div', { class: 'list__item' + (openIndex === i ? ' list__item--open' : ''), 'data-index': i });
        // only the grip starts a drag, so selecting text inside the fields never drags the row
        var grip = el('span', { class: 'list__grip', title: 'Drag to reorder', 'aria-hidden': 'true', onmousedown: function () { row.draggable = true; }, onmouseup: function () { row.draggable = false; } }, ['☰']);
        var head = el('div', { class: 'list__head' }, [
          grip,
          el('button', { type: 'button', class: 'list__title', 'aria-expanded': openIndex === i ? 'true' : 'false', onclick: function () { openIndex = openIndex === i ? -1 : i; render(); } }, [itemTitle(f, item, i)]),
          el('span', { class: 'list__actions' }, [
            el('button', { type: 'button', class: 'btn btn--icon btn--xs', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: function () { items.splice(i - 1, 0, items.splice(i, 1)[0]); openIndex = i - 1; render(); emit(); } }, ['↑']),
            el('button', { type: 'button', class: 'btn btn--icon btn--xs', title: 'Move down', 'aria-label': 'Move down', disabled: i === items.length - 1, onclick: function () { items.splice(i + 1, 0, items.splice(i, 1)[0]); openIndex = i + 1; render(); emit(); } }, ['↓']),
            el('button', { type: 'button', class: 'btn btn--icon btn--xs', title: 'Duplicate', 'aria-label': 'Duplicate', onclick: function () { items.splice(i + 1, 0, JSON.parse(JSON.stringify(item))); openIndex = i + 1; render(); emit(); } }, ['⧉']),
            el('button', { type: 'button', class: 'btn btn--icon btn--xs btn--danger-ghost', title: 'Remove', 'aria-label': 'Remove', onclick: function () { items.splice(i, 1); openIndex = -1; render(); emit(); } }, ['✕'])
          ])
        ]);
        row.appendChild(head);
        if (openIndex === i) {
          var body = el('div', { class: 'list__body' });
          renderForm(body, f.fields, item, function () { head.querySelector('.list__title').textContent = itemTitle(f, item, i); emit(); }, path.concat(f.key, i));
          row.appendChild(body);
        }
        row.addEventListener('dragstart', function (e) { if (!row.draggable) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
        row.addEventListener('dragend', function () { row.classList.remove('dragging'); row.draggable = false; });
        row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('dragover'); });
        row.addEventListener('dragleave', function () { row.classList.remove('dragover'); });
        row.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); row.classList.remove('dragover'); var from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (isNaN(from) || from === i) return; items.splice(i, 0, items.splice(from, 1)[0]); openIndex = i; render(); emit(); });
        listEl.appendChild(row);
      });
    }
    render();
    var add = el('button', { type: 'button', class: 'btn btn--sm', onclick: function () {
      if (f.max && items.length >= f.max) { toast('Maximum of ' + f.max + ' items', 'warn'); return; }
      var item = {};
      f.fields.forEach(function (sf) { item[sf.key] = sf.type === 'list' ? [] : sf.type === 'boolean' ? false : (sf.options ? sf.options[0].value : ''); });
      items.push(item); openIndex = items.length - 1; render(); emit();
    } }, ['+ Add ' + f.label.replace(/\s*\(.*\)$/, '').replace(/s$/, '').toLowerCase()]);
    wrap.appendChild(listEl); wrap.appendChild(add);
    return wrap;
  }


  /* Menus open on top of the whole app, not inside the box that holds their button, so a list with one row (or a
     panel that scrolls) never cuts a menu off. The menu moves to <body> while it is open and is placed next to its
     button: below it, or above it when there is more room there; opts.side 'right' opens it to the right (the rail),
     opts.align 'left' lines it up with the button's left edge. Scrolling elsewhere or resizing closes it. */
  function floatMenu(menu, anchor, opts) {
    opts = opts || {};
    Array.prototype.forEach.call(document.querySelectorAll('body > .menu--float'), function (m) { if (m !== menu && !(m._home && m._home.isConnected)) m.remove(); });
    if (!menu._home || menu.parentNode !== document.body) menu._home = menu.parentNode;
    document.body.appendChild(menu);
    menu.classList.add('menu--float');
    menu.style.maxHeight = ''; menu.style.visibility = 'hidden'; menu.hidden = false;
    var r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, gap = 4, pad = 8;
    var w = menu.offsetWidth, h = menu.offsetHeight, top, left;
    if (opts.side === 'right') {
      left = r.right + 10;
      top = Math.max(pad, Math.min(r.bottom - h, vh - h - pad));
      if (h > vh - pad * 2) { menu.style.maxHeight = (vh - pad * 2) + 'px'; top = pad; }
    } else {
      var below = vh - r.bottom - gap - pad, above = r.top - gap - pad, up = h > below && above > below, room = up ? above : below;
      if (h > room) { menu.style.maxHeight = Math.max(room, 80) + 'px'; h = Math.max(room, 80); }
      top = up ? r.top - gap - h : r.bottom + gap;
      left = opts.align === 'left' ? r.left : r.right - w;
    }
    left = Math.max(pad, Math.min(left, vw - w - pad));
    menu.style.top = Math.round(top) + 'px'; menu.style.left = Math.round(left) + 'px';
    menu.style.visibility = '';
  }
  function closeFloatingMenus(e) {
    Array.prototype.forEach.call(document.querySelectorAll('.menu--float:not([hidden])'), function (m) { if (!(e && e.target && e.target.nodeType === 1 && m.contains(e.target))) m.hidden = true; });
  }
  document.addEventListener('scroll', closeFloatingMenus, true);
  window.addEventListener('resize', function () { closeFloatingMenus(); });

  window.UOL_UI = { el: el, esc: esc, debounce: debounce, toast: toast, modal: modal, confirm: confirm, prompt: prompt, renderForm: renderForm, richEditor: richEditor, imageField: imageField, mediaPicker: mediaPicker, fmtBytes: fmtBytes, cleanHtml: cleanHtml, floatMenu: floatMenu };
})();
