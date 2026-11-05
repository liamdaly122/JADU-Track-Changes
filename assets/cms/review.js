/* Leeds prototyping CMS - review tools
   1. Changes for Jadu: compares a page with the copy kept when it was imported, block by block and field by field,
      with word-level differences, and builds a change list a Jadu editor can work from (in the CMS, Word or PDF).
   2. Check page: accessibility and link checks on the rendered page, each tied to the block it is in.
   Pure functions: nothing here changes the project. */
(function () {
  'use strict';

  function Blocks() { return window.UOL_BLOCKS; }
  function Media() { return window.UOL_MEDIA; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }

  /* ================= text from HTML ================= */
  var BLOCK_TAGS = /^(P|DIV|LI|H[1-6]|TR|DT|DD|BLOCKQUOTE|FIGCAPTION|CAPTION|TABLE|UL|OL|DL|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|FIGURE|PRE|HR)$/;
  function parse(html) { return new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html').body; }
  /* readable text with paragraph breaks, so a word-level diff lines up with what the reader sees */
  function htmlToText(html) {
    if (!/[<&]/.test(String(html || ''))) return String(html || '').trim();
    var out = '';
    (function walk(node) {
      Array.prototype.forEach.call(node.childNodes, function (n) {
        if (n.nodeType === 3) { out += n.textContent.replace(/\s+/g, ' '); return; }
        if (n.nodeType !== 1 || /^(SCRIPT|STYLE|SVG|TEMPLATE)$/.test(n.tagName)) return;
        if (n.tagName === 'BR') { out += '\n'; return; }
        if (n.tagName === 'IMG') { if (n.getAttribute('alt')) out += ' [image: ' + n.getAttribute('alt') + '] '; return; }
        var block = BLOCK_TAGS.test(n.tagName);
        if (block) out += '\n';
        if (n.tagName === 'LI') out += '• ';
        if (n.tagName === 'TD' || n.tagName === 'TH') out += ' | ';
        walk(n);
        if (block) out += '\n';
      });
    })(parse(html));
    return out.split('\n').map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function linksIn(html) {
    if (String(html || '').indexOf('<a') === -1) return [];
    return Array.prototype.map.call(parse(html).querySelectorAll('a[href]'), function (a) { return { text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') }; });
  }
  /* the formatting a reader notices: bold, italics, headings, lists, tables */
  function formatSignature(html) {
    if (!/<[a-z]/i.test(String(html || ''))) return '';
    return Array.prototype.map.call(parse(html).querySelectorAll('strong,b,em,i,h2,h3,h4,h5,h6,ul,ol,table,blockquote'), function (n) { return n.tagName === 'B' ? 'STRONG' : n.tagName === 'I' ? 'EM' : n.tagName; }).join(',');
  }

  /* ================= word-level diff ================= */
  function tokens(s) { return String(s || '').match(/\n+|[^\S\n]+|[0-9A-Za-zÀ-ɏ'’]+|[^\s0-9A-Za-zÀ-ɏ]/g) || []; }
  /* returns [{t: '=', '-' or '+', s: text}] */
  function wordDiff(before, after) {
    var a = tokens(before), b = tokens(after), ops = [];
    var start = 0; while (start < a.length && start < b.length && a[start] === b[start]) start++;
    var ea = a.length, eb = b.length; while (ea > start && eb > start && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
    var A = a.slice(start, ea), B = b.slice(start, eb);
    function push(t, s) { if (!s) return; var last = ops[ops.length - 1]; if (last && last.t === t) last.s += s; else ops.push({ t: t, s: s }); }
    push('=', a.slice(0, start).join(''));
    var n = A.length, m = B.length;
    if (n * m > 2500000) { push('-', A.join('')); push('+', B.join('')); }
    else if (n || m) {
      var w = m + 1, L = new Uint16Array((n + 1) * w);
      for (var i = n - 1; i >= 0; i--) for (var j = m - 1; j >= 0; j--) L[i * w + j] = A[i] === B[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
      var x = 0, y = 0, mid = [];
      while (x < n && y < m) {
        if (A[x] === B[y]) { mid.push(['=', A[x]]); x++; y++; }
        else if (L[(x + 1) * w + y] >= L[x * w + y + 1]) mid.push(['-', A[x++]]);
        else mid.push(['+', B[y++]]);
      }
      while (x < n) mid.push(['-', A[x++]]);
      while (y < m) mid.push(['+', B[y++]]);
      // a lone space or punctuation mark kept between two changes reads better as part of the change
      for (var k = 1; k < mid.length - 1; k++) {
        if (mid[k][0] === '=' && /^(\s+|[,.;:])$/.test(mid[k][1]) && mid[k - 1][0] !== '=' && mid[k + 1][0] !== '=') { mid.splice(k, 1, ['-', mid[k][1]], ['+', mid[k][1]]); k++; }
      }
      // group removals before additions within each changed run
      var run = { '-': '', '+': '' };
      function flushRun() { push('-', run['-']); push('+', run['+']); run = { '-': '', '+': '' }; }
      mid.forEach(function (o) { if (o[0] === '=') { flushRun(); push('=', o[1]); } else run[o[0]] += o[1]; });
      flushRun();
    }
    push('=', a.slice(ea).join(''));
    return ops;
  }
  /* diff ops as HTML; long unchanged stretches are shortened to the words around each change */
  function diffHtml(ops, opts) {
    opts = opts || {};
    var keep = opts.context || 90;
    function text(s) { return esc(s).replace(/\n+/g, '<br>'); }
    return ops.map(function (o, i) {
      if (o.t === '-') return '<del>' + text(o.s) + '</del>';
      if (o.t === '+') return '<ins>' + text(o.s) + '</ins>';
      var s = o.s, first = i === 0, last = i === ops.length - 1;
      if (opts.full || s.length <= keep * 2 + 40) return text(s);
      if (first) return '… ' + text(s.slice(-keep).replace(/^\S*\s/, ''));
      if (last) return text(s.slice(0, keep).replace(/\s\S*$/, '')) + ' …';
      return text(s.slice(0, keep).replace(/\s\S*$/, '')) + ' … ' + text(s.slice(-keep).replace(/^\S*\s/, ''));
    }).join('');
  }

  /* ================= fields of a block or a page part ================= */
  function humanise(k) { return String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); }
  function imageName(v) {
    if (!v) return '';
    var M = Media(), id = M && M.idOf(v);
    if (id) { var rec = M.get(id); return rec ? rec.name : 'image'; }
    try { return decodeURIComponent(new URL(v, 'https://www.leeds.ac.uk/').pathname.split('/').pop()) || v; } catch (e) { return String(v); }
  }
  function looksHtml(v) { return typeof v === 'string' && /<(p|div|h[1-6]|ul|ol|li|a|span|strong|em|br|table|section|img|blockquote)\b/i.test(v); }
  function kindOf(f) { return f.type === 'html' || ((f.type === 'text' || f.type === 'textarea') && looksHtml(f.value)) ? 'html' : f.type; }
  /* [{path, label, type, value, options}] in form order; list items are numbered */
  function flatten(fields, obj, path, label, out) {
    out = out || [];
    (fields || []).forEach(function (f) {
      var v = obj ? obj[f.key] : undefined, p = path + f.key, l = (label ? label + ' › ' : '') + f.label;
      if (f.type === 'list') {
        (Array.isArray(v) ? v : []).forEach(function (item, i) { flatten(f.fields, item, p + '.' + i + '.', (label ? label + ' › ' : '') + f.label + ' ' + (i + 1), out); });
        return;
      }
      out.push({ path: p, label: l, type: f.type, value: v, options: f.options });
    });
    return out;
  }
  /* props the form does not describe (rare), so nothing is missed */
  function genericFields(obj, path, label, out) {
    out = out || [];
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k], p = path + k, l = (label ? label + ' › ' : '') + humanise(k);
      if (Array.isArray(v)) v.forEach(function (item, i) { if (item && typeof item === 'object') genericFields(item, p + '.' + i + '.', l + ' ' + (i + 1), out); else out.push({ path: p + '.' + i, label: l + ' ' + (i + 1), type: 'text', value: item }); });
      else if (v && typeof v === 'object') genericFields(v, p + '.', l, out);
      else out.push({ path: p, label: l, type: typeof v === 'boolean' ? 'boolean' : /html|body|text/i.test(k) ? 'html' : 'text', value: v });
    });
    return out;
  }
  function specOf(b) { var B = Blocks(); return (B && B.registry[b.type]) || null; }
  function blockFields(b) {
    var spec = specOf(b);
    if (spec && spec.fields && spec.fields.length) return flatten(spec.fields, b.props || {}, '', '');
    return genericFields(b.props || {}, '', '');
  }
  function blockLabel(b) { var s = specOf(b); return s ? s.label : humanise(b.type); }
  function display(f) {
    var v = f.value;
    if (f.type === 'boolean') return v ? 'Yes' : 'No';
    if (f.type === 'image') return imageName(v);
    if (f.type === 'select') { var o = (f.options || []).filter(function (x) { return (x.value !== undefined ? x.value : x) === v; })[0]; return o ? String(o.label || o.value || o) : String(v == null ? '' : v); }
    if (kindOf(f) === 'html') return htmlToText(v);
    return String(v == null ? '' : v).trim();
  }
  /* one short line describing a block, for "after ..." hints */
  function blockSummary(b) {
    var fs = blockFields(b);
    for (var i = 0; i < fs.length; i++) { if (/^(text|textarea|html)$/.test(fs[i].type)) { var t = display(fs[i]); if (t) return clip(t, 70); } }
    return '';
  }
  function blockWords(b) { return blockFields(b).map(display).join(' ').toLowerCase().match(/[a-z0-9À-ɏ]+/g) || []; }
  function similarity(a, b) {
    var A = {}, n = 0, shared = 0; a.forEach(function (w) { if (!A[w]) { A[w] = 1; n++; } });
    var Bs = {}; b.forEach(function (w) { if (!Bs[w]) { Bs[w] = 1; if (A[w]) shared++; else n++; } });
    return n ? shared / n : 1;
  }

  /* compare two field lists; returns [{label, type, before, after, ops, links, note, image}] */
  function fieldChanges(before, after) {
    var A = {}, B = {}, order = [];
    before.forEach(function (f) { A[f.path] = f; });
    after.forEach(function (f) { B[f.path] = f; order.push(f.path); });
    before.forEach(function (f) { if (!B[f.path]) order.push(f.path); });
    var out = [];
    order.forEach(function (p) {
      var a = A[p], b = B[p], f = b || a;
      var va = a ? display(a) : '', vb = b ? display(b) : '';
      if ((a && kindOf(a) === 'html') || (b && kindOf(b) === 'html')) {
        var la = a ? linksIn(a.value) : [], lb = b ? linksIn(b.value) : [];
        var key = function (l) { return l.href + '\u0000' + l.text; };
        var ka = la.map(key), kb = lb.map(key);
        var links = { added: lb.filter(function (l) { return ka.indexOf(key(l)) === -1; }), removed: la.filter(function (l) { return kb.indexOf(key(l)) === -1; }) };
        var fmt = formatSignature(a && a.value) !== formatSignature(b && b.value);
        if (va === vb && !links.added.length && !links.removed.length && !fmt) return;
        out.push({ label: f.label, type: 'html', before: va, after: vb, ops: va !== vb ? wordDiff(va, vb) : null, links: links, note: va === vb && fmt ? 'Formatting changed (bold, italics, headings, lists or tables)' : '' });
        return;
      }
      if (va === vb) return;
      if (f.type === 'image') { out.push({ label: f.label, type: 'image', before: va, after: vb, image: { before: a && a.value, after: b && b.value } }); return; }
      if (f.type === 'boolean' || f.type === 'select' || f.type === 'url' || f.type === 'date') { out.push({ label: f.label, type: f.type, before: va, after: vb }); return; }
      out.push({ label: f.label, type: 'text', before: va, after: vb, ops: wordDiff(va, vb) });
    });
    return out;
  }
  /* every non-empty field of a block that was added or removed */
  function contentOf(b) {
    return blockFields(b).map(function (f) { var v = display(f); if (!v || (f.type === 'boolean' && v === 'No')) return null; return { label: f.label, type: f.type, value: v, raw: f.value }; }).filter(Boolean);
  }

  /* ================= compare a page with its original ================= */
  /* opts.pageGroups: [{label, fields(page) -> schema, get(page) -> object}] for the page-level settings */
  function diffPage(original, current, opts) {
    opts = opts || {};
    var ob = (original && original.blocks) || [], cb = current.blocks || [];
    var pairs = [], usedO = {}, usedC = {};
    var oIndex = {}; ob.forEach(function (b, i) { oIndex[b.id] = i; });
    // 1. same block id: the block came from the import and was kept
    cb.forEach(function (b, ci) { var oi = oIndex[b.id]; if (oi !== undefined && !usedO[oi]) { pairs.push({ o: oi, c: ci }); usedO[oi] = 1; usedC[ci] = 1; } });
    // 2. otherwise the most similar remaining block of the same type (a re-fetched original has new ids)
    var words = {};
    function w(list, i, side) { var k = side + i; if (!words[k]) words[k] = blockWords(list[i]); return words[k]; }
    cb.forEach(function (b, ci) {
      if (usedC[ci]) return;
      var best = -1, score = 0.45;
      ob.forEach(function (o, oi) { if (usedO[oi] || o.type !== b.type) return; var s = similarity(w(ob, oi, 'o'), w(cb, ci, 'c')); if (s > score) { score = s; best = oi; } });
      if (best !== -1) { pairs.push({ o: best, c: ci }); usedO[best] = 1; usedC[ci] = 1; }
    });
    // blocks out of their original order: those not on the longest run that kept its order
    pairs.sort(function (x, y) { return x.c - y.c; });
    var seq = pairs.map(function (p) { return p.o; }), tails = [], prev = new Array(seq.length), tailIdx = [];
    seq.forEach(function (v, i) {
      var lo = 0, hi = tails.length; while (lo < hi) { var mid = (lo + hi) >> 1; if (tails[mid] < v) lo = mid + 1; else hi = mid; }
      tails[lo] = v; tailIdx[lo] = i; prev[i] = lo ? tailIdx[lo - 1] : -1;
    });
    var inOrder = {}; for (var k = tailIdx[tails.length - 1]; k !== undefined && k !== -1; k = prev[k]) inOrder[k] = 1;
    var byC = {}; pairs.forEach(function (p, i) { byC[p.c] = { o: p.o, moved: !inOrder[i] }; });

    var items = [], counts = { added: 0, removed: 0, edited: 0, moved: 0, unchanged: 0 };
    var lastKept = null;
    cb.forEach(function (b, ci) {
      var m = byC[ci], item;
      if (m) {
        var changes = fieldChanges(blockFields(ob[m.o]), blockFields(b));
        if (ob[m.o].type !== b.type) changes.unshift({ label: 'Block type', type: 'text', before: blockLabel(ob[m.o]), after: blockLabel(b) });
        item = { kind: changes.length ? 'edited' : 'unchanged', moved: m.moved, block: b, index: ci, original: ob[m.o], origIndex: m.o, changes: changes };
        if (changes.length) counts.edited++; else if (!m.moved) counts.unchanged++;
        if (m.moved) { counts.moved++; item.after = lastKept; }
        lastKept = b;
      } else {
        item = { kind: 'added', block: b, index: ci, content: contentOf(b), after: lastKept };
        counts.added++;
      }
      item.label = blockLabel(b); item.summary = blockSummary(b);
      items.push(item);
    });
    // removed blocks go back where they were: before the next block that followed them in the original
    ob.forEach(function (o, oi) {
      if (usedO[oi]) return;
      counts.removed++;
      var nextC = Infinity; pairs.forEach(function (p) { if (p.o > oi && p.c < nextC) nextC = p.c; });
      var at = items.findIndex(function (it) { return it.index === nextC && it.kind !== 'removed'; });
      var removed = { kind: 'removed', block: o, origIndex: oi, original: o, content: contentOf(o), label: blockLabel(o), summary: blockSummary(o), wasAfter: oi > 0 ? ob[oi - 1] : null };
      if (at === -1) items.push(removed); else items.splice(at, 0, removed);
    });

    var pageChanges = [];
    (opts.pageGroups || []).forEach(function (g) {
      // field labels carry the group name ("Banner › Title") unless the group has a single field of the same name
      var a = original ? flatten(g.fields(original), g.get(original) || {}, '', g.prefix) : [];
      var b = flatten(g.fields(current), g.get(current) || {}, '', g.prefix);
      var ch = fieldChanges(a, b);
      if (ch.length) pageChanges.push({ label: g.label, changes: ch });
    });
    var total = counts.added + counts.removed + counts.edited + counts.moved + pageChanges.length;
    items.forEach(function (it) {
      if (it.kind === 'unchanged' && !it.moved) return;
      it.key = (it.kind === 'removed' ? 'removed:' : 'block:') + it.block.id;
      it.hash = fnv(JSON.stringify({ k: it.kind, m: !!it.moved, c: it.changes || it.content, a: it.after ? it.after.id : '', w: it.wasAfter ? it.wasAfter.id : '' }));
    });
    var pageItem = pageChanges.length ? { key: 'page', hash: fnv(JSON.stringify(pageChanges)) } : null;
    return { items: items, pageChanges: pageChanges, pageItem: pageItem, counts: counts, total: total };
  }

  /* ================= the change list (shared by the CMS view, Word and PDF) ================= */
  var KIND_TEXT = { added: 'Add', removed: 'Remove', edited: 'Edit', moved: 'Move', unchanged: 'No change' };
  function describe(b) { var s = blockSummary(b); return blockLabel(b) + (s ? ': “' + clip(s, 60) + '”' : ''); }
  function imageTag(v, mode) {
    if (!v) return '';
    var src = v;
    if (mode === 'app') { var M = Media(); src = M ? M.resolve(v) : v; }
    return src ? '<img class="cl-thumb" src="' + esc(src) + '" alt="">' : '';
  }
  function changeHtml(c, mode) {
    var v;
    if (c.type === 'image') v = (c.before ? '<del>' + esc(c.before) + '</del>' : '<span class="cl-none">none</span>') + ' → ' + (c.after ? '<ins>' + esc(c.after) + '</ins>' : '<span class="cl-none">none</span>') + (c.image && c.image.after ? '<br>' + imageTag(c.image.after, mode) : '');
    else if (c.ops) v = diffHtml(c.ops);
    else if (c.note) v = '<span class="cl-note">' + esc(c.note) + '</span>';
    else if (c.type === 'html') v = '';
    else v = (c.before ? '<del>' + esc(c.before) + '</del>' : '<span class="cl-none">empty</span>') + ' → ' + (c.after ? '<ins>' + esc(c.after) + '</ins>' : '<span class="cl-none">empty</span>');
    var links = '';
    if (c.links && (c.links.added.length || c.links.removed.length)) {
      links = '<ul class="cl-links">' + c.links.removed.map(function (l) { return '<li><span class="cl-tag cl-tag--removed">Link removed</span> ' + esc(l.text || '(no text)') + ' <span class="cl-url">' + esc(l.href) + '</span></li>'; }).join('') +
        c.links.added.map(function (l) { return '<li><span class="cl-tag cl-tag--added">Link added</span> ' + esc(l.text || '(no text)') + ' <span class="cl-url">' + esc(l.href) + '</span></li>'; }).join('') + '</ul>';
    }
    return '<div class="cl-field"><div class="cl-label">' + esc(c.label) + '</div><div class="cl-value">' + v + links + '</div></div>';
  }
  function contentHtml(list, tag, mode) {
    return list.map(function (f) {
      var v = f.type === 'image' ? '<' + tag + '>' + esc(f.value) + '</' + tag + '>' + (tag === 'ins' ? '<br>' + imageTag(f.raw, mode) : '') : '<' + tag + '>' + esc(f.value).replace(/\n+/g, '<br>') + '</' + tag + '>';
      return '<div class="cl-field"><div class="cl-label">' + esc(f.label) + '</div><div class="cl-value">' + v + '</div></div>';
    }).join('');
  }
  /* mode 'app' adds "Show in page" buttons and resolves images for the browser; 'export' keeps media refs for inlining */
  /* the changes to make in Jadu, each with its key and fingerprint */
  function checklist(diff) { return (diff.pageItem ? [diff.pageItem] : []).concat(diff.items.filter(function (it) { return it.key; })); }
  function checkState(item, checks) {
    var c = checks && checks[item.key];
    return { row: c || null, done: !!(c && c.item_hash === item.hash), stale: !!(c && c.item_hash !== item.hash) };
  }
  function progress(diff, checks) {
    var list = checklist(diff), done = list.filter(function (it) { return checkState(it, checks).done; }).length;
    return { done: done, total: list.length };
  }
  function shortDate(iso) { var d = new Date(iso); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  /* opts.checks: {key: {item_hash, done_by_email, done_at}}; in the CMS opts.checkable shows tick boxes */
  function checkHtml(item, mode, opts) {
    if (!opts.checks && !opts.checkable) return '';
    var st = checkState(item, opts.checks), r = st.row;
    var who = r ? (r.done_by_email ? r.done_by_email.replace(/@.*/, '') : 'someone') + ', ' + shortDate(r.done_at) : '';
    if (mode === 'app') {
      return '<label class="cl-check' + (st.done ? ' is-done' : st.stale ? ' is-stale' : '') + '"' + (st.stale ? ' title="Ticked by ' + esc(who) + ', then the change was edited again"' : '') + '><input type="checkbox" class="cl-check__box" data-key="' + esc(item.key) + '" data-hash="' + esc(item.hash) + '"' + (st.done ? ' checked' : '') + (opts.checkable ? '' : ' disabled') + '> ' +
        (st.done ? 'Done in Jadu · ' + esc(who) : st.stale ? 'Edited since ticked' : 'Done in Jadu') + '</label>';
    }
    return '<span class="cl-check">' + (st.done ? '&#9745; Done in Jadu (' + esc(who) + ')' : '&#9744; Done in Jadu') + '</span>';
  }
  function itemsHtml(diff, mode, opts) {
    opts = opts || {};
    var out = '', n = 0;
    if (diff.pageChanges.length) {
      var pst = checkState(diff.pageItem, opts.checks);
      n++;
      if (!(opts.hideDone && pst.done)) out += '<section class="cl-item cl-item--edited' + (pst.done ? ' cl-item--done' : '') + '"><div class="cl-head"><span class="cl-num">' + n + '</span><span class="cl-tag cl-tag--edited">Edit</span><strong>Page details</strong>' + checkHtml(diff.pageItem, mode, opts) + '</div>' +
        diff.pageChanges.map(function (g) { return g.changes.map(function (c) { return changeHtml(c, mode); }).join(''); }).join('') + '</section>';
    }
    var unchanged = 0, hidden = 0;
    diff.items.forEach(function (it) {
      if (it.kind === 'unchanged' && !it.moved) { unchanged++; if (!opts.showUnchanged) return; }
      var done = it.key && checkState(it, opts.checks).done;
      if (it.key) n++;
      if (opts.hideDone && done) { hidden++; return; }
      var kind = it.kind === 'unchanged' && it.moved ? 'moved' : it.kind;
      var where = it.kind === 'removed' ? 'Was block ' + (it.origIndex + 1) + ' of the original' : 'Block ' + (it.index + 1);
      var show = mode === 'app' && it.kind !== 'removed' ? '<button type="button" class="btn btn--xs cl-show" data-block="' + esc(it.block.id) + '">Show in page</button>' : '';
      var hint = '';
      if (it.kind === 'added') hint = it.after ? 'Add after ' + esc(describe(it.after)) : 'Add at the start of the page';
      else if (it.kind === 'removed') hint = 'Remove “' + esc(clip(it.summary || it.label, 80)) + '”' + (it.wasAfter ? ', which came after ' + esc(describe(it.wasAfter)) : ' at the start of the page');
      else if (it.moved) hint = it.after ? 'Move this block so it comes after ' + esc(describe(it.after)) : 'Move this block to the start of the page';
      var body = '';
      if (it.kind === 'added') body = contentHtml(it.content, 'ins', mode);
      else if (it.kind === 'removed') body = contentHtml(it.content.slice(0, 6), 'del', mode) + (it.content.length > 6 ? '<p class="cl-note">and ' + (it.content.length - 6) + ' more fields</p>' : '');
      else if (it.changes && it.changes.length) body = it.changes.map(function (c) { return changeHtml(c, mode); }).join('');
      out += '<section class="cl-item cl-item--' + kind + (done ? ' cl-item--done' : '') + '"' + (it.kind !== 'removed' ? ' data-block="' + esc(it.block.id) + '"' : '') + '>' +
        '<div class="cl-head"><span class="cl-num">' + (it.key ? n : '') + '</span><span class="cl-tag cl-tag--' + kind + '">' + (it.kind === 'edited' && it.moved ? 'Edit and move' : KIND_TEXT[kind]) + '</span><strong>' + esc(it.label) + '</strong><span class="cl-where">' + where + '</span>' + (it.key ? checkHtml(it, mode, opts) : '') + show + '</div>' +
        (hint ? '<p class="cl-hint">' + hint + '</p>' : '') + body + '</section>';
    });
    if (hidden) out += '<p class="cl-unchanged">' + hidden + ' change' + (hidden === 1 ? '' : 's') + ' done in Jadu, hidden.</p>';
    if (!opts.showUnchanged && unchanged) out += '<p class="cl-unchanged">' + unchanged + ' block' + (unchanged === 1 ? '' : 's') + ' unchanged.</p>';
    return out;
  }
  function countsLine(diff) {
    var c = diff.counts, bits = [];
    if (diff.pageChanges.length) bits.push('page details');
    if (c.edited) bits.push(c.edited + ' edited');
    if (c.added) bits.push(c.added + ' added');
    if (c.removed) bits.push(c.removed + ' removed');
    if (c.moved) bits.push(c.moved + ' moved');
    return bits.length ? bits.join(', ') : 'no changes';
  }
  function fmtDate(iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  /* one page's section of an exported change list */
  function pageSectionHtml(page, diff, meta) {
    meta = meta || {};
    var src = page.source || {};
    var rows = [
      src.url ? ['Live page', '<a href="' + esc(src.url) + '">' + esc(src.url) + '</a>'] : null,
      ['Prototype path', '/' + esc(page.slug)],
      src.importedAt ? ['Original copied', esc(fmtDate(src.importedAt))] : null,
      meta.signoff ? ['Sign-off', esc(meta.signoff)] : null,
      ['Changes', esc(countsLine(diff))],
      meta.checks && progress(diff, meta.checks).done ? ['Done in Jadu', progress(diff, meta.checks).done + ' of ' + progress(diff, meta.checks).total] : null
    ].filter(Boolean);
    return '<section class="cl-page"><h2>' + esc(page.title) + '</h2><table class="cl-meta">' + rows.map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>'; }).join('') + '</table>' +
      (diff.total ? itemsHtml(diff, 'export', { checks: meta.checks || {} }) : '<p class="cl-unchanged">No changes from the original.</p>') + '</section>';
  }
  var CL_CSS = '.cl-doc{font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#212529;line-height:1.45}' +
    '.cl-doc h1{font-size:20pt;margin:0 0 4pt}.cl-doc h2{font-size:15pt;margin:18pt 0 6pt;border-bottom:2px solid #c70000;padding-bottom:3pt}.cl-intro{color:#555;margin:0 0 10pt}' +
    '.cl-meta{border-collapse:collapse;margin:0 0 10pt}.cl-meta th{text-align:left;font-weight:bold;padding:2pt 12pt 2pt 0;vertical-align:top;color:#444}.cl-meta td{padding:2pt 0}' +
    '.cl-item{border:1px solid #d9d6d2;border-left:4px solid #999;border-radius:6px;padding:8px 12px;margin:0 0 10px;background:#fff;page-break-inside:avoid}' +
    '.cl-item--added{border-left-color:#1f7a3a}.cl-item--removed{border-left-color:#b00020}.cl-item--edited{border-left-color:#156265}.cl-item--moved{border-left-color:#8a5a00}.cl-item--unchanged{border-left-color:#ccc;opacity:.75}' +
    '.cl-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.cl-head strong{font-size:1.02em}.cl-num{min-width:1.4em;color:#636363;font-weight:bold}.cl-where{color:#636363;font-size:.85em}.cl-show{margin-left:auto}' +
    '.cl-check{margin-left:auto;font-size:.85em;color:#444;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.cl-check + .cl-show{margin-left:0}.cl-check.is-done{color:#1f6b3a;font-weight:600}.cl-check.is-stale{color:#8a5a00;font-weight:600}' +
    '.cl-item--done{background:#f6fbf7}.cl-item--done .cl-field,.cl-item--done .cl-hint{opacity:.6}' +
    '.cl-tag{display:inline-block;font-size:.72em;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;padding:1px 7px;border-radius:9px;background:#eee;color:#333}' +
    '.cl-tag--added{background:#e2f3e6;color:#1f6b3a}.cl-tag--removed{background:#fde8ea;color:#9b0018}.cl-tag--edited{background:#e3f0f1;color:#0f4f52}.cl-tag--moved{background:#fff1d6;color:#6b4600}' +
    '.cl-hint{margin:6px 0 2px;font-weight:600;color:#333}.cl-field{display:flex;gap:12px;padding:6px 0;border-top:1px solid #eee}.cl-field:first-of-type{border-top:0}.cl-head + .cl-field,.cl-hint + .cl-field{border-top:1px solid #eee;margin-top:6px}' +
    '.cl-label{flex:0 0 160px;color:#555;font-size:.9em}.cl-value{flex:1;min-width:0;overflow-wrap:anywhere}' +
    '.cl-doc ins,.cl-value ins{background:#d8f2de;color:#0d4a1f;text-decoration:underline;text-decoration-color:#1f7a3a}.cl-doc del,.cl-value del{background:#fbdde1;color:#7a0013;text-decoration:line-through}' +
    '.cl-none{color:#888;font-style:italic}.cl-note{color:#555;font-style:italic;margin:4px 0 0}.cl-links{margin:6px 0 0;padding-left:18px}.cl-url{color:#555;font-size:.85em;overflow-wrap:anywhere}' +
    '.cl-thumb{max-width:220px;max-height:140px;margin-top:6px;border:1px solid #ddd;border-radius:4px}.cl-unchanged{color:#636363;font-style:italic}' +
    '@media print{.cl-doc{font-size:10pt}.cl-item{break-inside:avoid}.cl-doc ins,.cl-doc del{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  /* a whole change list as a standalone HTML document; sections = [{page, diff, meta}] */
  function changeListDocument(sections, meta) {
    meta = meta || {};
    var title = meta.title || 'Changes for Jadu';
    var intro = 'What to change in Jadu. <ins>Green underlined</ins> text is new, <del>red struck-through</del> text is removed. Made ' + esc(fmtDate(new Date().toISOString())) + (meta.by ? ' by ' + esc(meta.by) : '') + '.';
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + CL_CSS + 'body{margin:24px}</style></head><body class="cl-doc">' +
      '<h1>' + esc(title) + '</h1><p class="cl-intro">' + intro + '</p>' + sections.map(function (s) { return pageSectionHtml(s.page, s.diff, s.meta); }).join('') + '</body></html>';
  }

  /* ================= check page ================= */
  /* visible text, with separate pieces kept apart ("Next page" + "Strategy" reads "Next page Strategy") */
  function textOf(n) {
    var parts = [], w = n.ownerDocument.createTreeWalker(n, 4);
    while (w.nextNode()) { if (w.currentNode.parentNode.closest('.hide-accessible, [aria-hidden="true"]') && !n.matches('.hide-accessible')) continue; var t = w.currentNode.textContent.replace(/\s+/g, ' ').trim(); if (t) parts.push(t); }
    return parts.join(' ');
  }
  var VAGUE = /^(click here|here|read more|more|find out more|learn more|this link|link|more info|more information|go|this page)$/i;
  /* html: the page body rendered with block wrappers (renderBody with editor: true); slugs: paths of pages in the project */
  function checkPage(html, opts) {
    opts = opts || {};
    var root = parse(html), issues = [];
    var outside = '.uol-header, .uol-site-footer, footer, .uol-cms-empty';
    function skip(n) { return !!n.closest(outside); }
    function where(n) {
      var b = n.closest('[data-block-id]');
      if (b) return { blockId: b.getAttribute('data-block-id'), area: '' };
      if (n.closest('.uol-banner-outer, .uol-hero, section[aria-label]')) return { blockId: null, area: 'Banner' };
      if (n.closest('.uol-section-nav, .uol-section-nav-related-content, .uol-section-nav-ctas, aside')) return { blockId: null, area: 'Side column' };
      if (n.closest('.page-heading, .uol-page-heading, .uol-breadcrumb, h1')) return { blockId: null, area: 'Page heading' };
      return { blockId: null, area: 'Page' };
    }
    function add(level, type, message, node, extra) { issues.push(Object.assign({ level: level, type: type, message: message }, where(node), extra || {})); }

    // images
    var imgCount = {};
    Array.prototype.forEach.call(root.querySelectorAll('img'), function (img) {
      if (skip(img) || img.closest('[aria-hidden="true"], #bannerSlideshow') || img.getAttribute('role') === 'presentation') return;
      var w = where(img), k = w.blockId || w.area; imgCount[k] = (imgCount[k] || 0) + 1;
      var src = img.getAttribute('src') || '';
      if (!img.hasAttribute('alt')) add('error', 'alt', 'Image ' + imgCount[k] + ' has no alt text', img, { src: src });
      else if (!img.getAttribute('alt').trim()) add('warn', 'alt', 'Image ' + imgCount[k] + ' has empty alt text. That is only right if the image is purely decorative.', img, { src: src });
    });

    // headings
    var heads = Array.prototype.filter.call(root.querySelectorAll('h1,h2,h3,h4,h5,h6'), function (h) { return !skip(h); });
    var h1s = heads.filter(function (h) { return h.tagName === 'H1'; });
    if (!h1s.length) issues.push({ level: 'error', type: 'headings', message: 'The page has no H1 heading', blockId: null, area: 'Page heading' });
    if (h1s.length > 1) h1s.slice(1).forEach(function (h) { add('warn', 'headings', 'Extra H1: “' + clip(h.textContent, 60) + '”. A page should have one H1.', h); });
    var last = 0;
    heads.forEach(function (h) {
      var lvl = +h.tagName.charAt(1), text = textOf(h) || h.textContent.replace(/\s+/g, ' ').trim();
      if (!text) add('error', 'headings', 'Empty ' + h.tagName + ' heading', h);
      else if (last && lvl > last + 1) add('error', 'headings', h.tagName + ' “' + clip(text, 60) + '” skips a level (it follows an H' + last + ')', h);
      last = lvl;
    });

    // links
    var slugs = {}; (opts.slugs || []).forEach(function (s) { slugs['/' + String(s).replace(/^\/+|\/+$/g, '')] = 1; });
    var external = {}, offProject = {};
    Array.prototype.forEach.call(root.querySelectorAll('a'), function (a) {
      if (skip(a)) return;
      var href = (a.getAttribute('href') || '').trim();
      var text = textOf(a) || a.textContent.replace(/\s+/g, ' ').trim() || (a.getAttribute('aria-label') || '').trim() || (a.getAttribute('title') || '').trim() ||
        Array.prototype.map.call(a.querySelectorAll('img[alt]'), function (i) { return i.getAttribute('alt'); }).join(' ').trim();
      if (!text) add('error', 'links', 'Link with no text' + (href ? ' (goes to ' + clip(href, 60) + ')' : ''), a);
      else if (VAGUE.test(text)) add('warn', 'links', 'Link text “' + text + '” does not say where it goes', a);
      if (a.getAttribute('role') === 'button') return;
      if (!href || href === '#') { add('error', 'links', 'Link “' + clip(text || '(no text)', 50) + '” has no address', a); return; }
      if (/^javascript:/i.test(href)) { add('error', 'links', 'Link “' + clip(text, 50) + '” runs a script instead of going somewhere', a); return; }
      if (/^(mailto:|tel:|#)/i.test(href)) return;
      if (/^https?:\/\//i.test(href)) {
        if (/^https?:\/\/(www\.)?(example\.(com|org)|localhost|127\.0\.0\.1)/i.test(href)) { add('error', 'links', 'Link “' + clip(text, 50) + '” points to a placeholder address (' + clip(href, 60) + ')', a); return; }
        var k = href.replace(/#.*$/, '');
        if (!external[k]) { external[k] = Object.assign({ href: href, text: text }, where(a)); }
        return;
      }
      var path = '/' + href.replace(/^\.?\/+/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
      if (!slugs[path]) { if (!offProject[path]) offProject[path] = Object.assign({ href: path, text: text }, where(a)); }
    });

    // embeds and tables
    Array.prototype.forEach.call(root.querySelectorAll('iframe'), function (f) { if (!skip(f) && !(f.getAttribute('title') || '').trim()) add('warn', 'embeds', 'Embedded video or page has no title for screen readers', f); });
    Array.prototype.forEach.call(root.querySelectorAll('table'), function (t) { if (!skip(t) && !t.querySelector('th')) add('warn', 'tables', 'Table has no header row', t); });

    var order = { error: 0, warn: 1, info: 2 };
    issues.sort(function (x, y) { return order[x.level] - order[y.level]; });
    return {
      issues: issues,
      external: Object.keys(external).map(function (k) { return external[k]; }),
      offProject: Object.keys(offProject).map(function (k) { return offProject[k]; }),
      errors: issues.filter(function (i) { return i.level === 'error'; }).length,
      warnings: issues.filter(function (i) { return i.level === 'warn'; }).length
    };
  }

  /* ================= a short fingerprint of a page's content (to spot edits after sign-off) ================= */
  function fnv(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8) + '-' + s.length.toString(36);
  }
  function contentHash(page) { return fnv(JSON.stringify({ t: page.title, s: page.settings, h: page.hero, b: page.blocks, p: page.template })); }

  window.UOL_REVIEW = {
    htmlToText: htmlToText, wordDiff: wordDiff, diffHtml: diffHtml,
    diffPage: diffPage, itemsHtml: itemsHtml, countsLine: countsLine, checklist: checklist, progress: progress, changeListDocument: changeListDocument, css: CL_CSS,
    blockLabel: blockLabel, blockSummary: blockSummary,
    checkPage: checkPage, contentHash: contentHash
  };
})();
