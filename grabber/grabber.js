/* Leeds prototyping CMS - page grabber
   Runs on any web page (injected by the Chrome extension or a bookmarklet). Opens a small pane that lets you send
   the whole page, the main content, a section you pick by clicking, or a whole set of pages (a site section) to
   the CMS importer. Delivery order: the extension (direct to the open CMS tab), the CMS over http, then the clipboard. */
(function () {
  'use strict';
  if (window.__uolGrabber) { window.__uolGrabber.open(); return; }

  var CMS_URL = (window.__UOL_CMS_URL || 'http://localhost:8765/').replace(/\/?$/, '/');
  var picking = false, pickedEl = null, hoverEl = null, mode = 'page';
  var hasExtension = !!(window.chrome && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage);

  var css = '' +
    '#uol-grab{all:initial;position:fixed;top:16px;right:16px;z-index:2147483646;width:340px;max-height:calc(100vh - 32px);overflow:auto;font:14px/1.4 "Segoe UI",system-ui,Arial,sans-serif;color:#212529;background:#fff;border:1px solid #d9d6d2;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.28)}' +
    '#uol-grab *{all:revert;box-sizing:border-box;font-family:inherit}' +
    '#uol-grab .h{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0e0c0c;color:#fff;font-weight:700;cursor:move;user-select:none;position:sticky;top:0}' +
    '#uol-grab .h i{display:inline-block;width:8px;height:20px;background:#c70000}' +
    '#uol-grab .h button{margin-left:auto;background:none;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1}' +
    '#uol-grab .b{padding:12px}' +
    '#uol-grab label.opt{display:flex;gap:8px;align-items:flex-start;padding:7px 8px;border:1px solid #e3e0dc;border-radius:6px;margin-bottom:6px;cursor:pointer}' +
    '#uol-grab label.opt input{margin-top:3px}' +
    '#uol-grab label.opt.on{border-color:#c70000;background:#fff6f6}' +
    '#uol-grab label.opt small{display:block;color:#636363;font-size:12px}' +
    '#uol-grab .pick{font-size:12px;color:#910000;font-weight:600;min-height:18px;margin:4px 0 8px}' +
    '#uol-grab .links{display:none;border:1px solid #e3e0dc;border-radius:6px;padding:6px;margin:0 0 8px;max-height:220px;overflow:auto;font-size:12px}' +
    '#uol-grab .links label{display:flex;gap:6px;align-items:flex-start;padding:2px 0;cursor:pointer}' +
    '#uol-grab .links .src{color:#636363;font-weight:700;margin:4px 0 2px;text-transform:uppercase;font-size:10px;letter-spacing:.05em}' +
    '#uol-grab .row{display:flex;gap:6px;flex-wrap:wrap}' +
    '#uol-grab .btn{flex:1;padding:8px 10px;font-weight:700;font-size:13px;border:1px solid #d9d6d2;border-radius:6px;background:#fff;cursor:pointer;color:#212529}' +
    '#uol-grab .btn.p{background:#c70000;border-color:#c70000;color:#fff}' +
    '#uol-grab .btn:disabled{opacity:.5;cursor:default}' +
    '#uol-grab .st{font-size:12px;color:#636363;margin-top:8px;min-height:16px}' +
    '#uol-grab .url{font-size:11px;color:#636363;margin-top:6px;word-break:break-all}' +
    '#uol-grab .url input{width:100%;font-size:11px;padding:4px 6px;border:1px solid #d9d6d2;border-radius:4px;margin-top:2px}' +
    '#uol-grab .mini{font-size:11px;color:#636363;background:none;border:0;text-decoration:underline;cursor:pointer;padding:0;margin-right:8px}' +
    '.uol-grab-hover{outline:3px dashed #c70000 !important;outline-offset:-3px;cursor:crosshair !important}' +
    '.uol-grab-picked{outline:4px solid #c70000 !important;outline-offset:-4px;box-shadow:0 0 0 6px rgba(199,0,0,.2) !important}';

  var style = document.createElement('style'); style.id = 'uol-grab-style'; style.textContent = css;
  document.documentElement.appendChild(style);

  var pane = document.createElement('div'); pane.id = 'uol-grab';
  pane.innerHTML =
    '<div class="h"><i></i>Send to Leeds CMS<button type="button" title="Close" aria-label="Close">✕</button></div>' +
    '<div class="b">' +
    '<label class="opt on"><input type="radio" name="uolgm" value="page" checked><span>Whole page<small>Header, navigation, banner, content and footer. Site settings are imported too.</small></span></label>' +
    '<label class="opt"><input type="radio" name="uolgm" value="main"><span>Main content only<small>Just the blocks inside the page’s main area.</small></span></label>' +
    '<label class="opt"><input type="radio" name="uolgm" value="pick"><span>Pick a section<small>Hover to highlight a component, click to choose it. Esc cancels.</small></span></label>' +
    '<label class="opt"><input type="radio" name="uolgm" value="section"><span>Site section (several pages)<small>Fetches this page and the pages linked from its section navigation, then imports them as one section.</small></span></label>' +
    '<div class="pick"></div>' +
    '<div class="links"></div>' +
    '<div class="row"><button type="button" class="btn p" data-act="send">Send to CMS</button><button type="button" class="btn" data-act="copy">Copy</button></div>' +
    '<div class="st"></div>' +
    '<div class="url">CMS address (only used when the CMS runs from a local server)<input type="text" value="' + CMS_URL + '"></div>' +
    '</div>';
  document.documentElement.appendChild(pane);

  var st = pane.querySelector('.st'), pickInfo = pane.querySelector('.pick'), urlInput = pane.querySelector('.url input'), linksBox = pane.querySelector('.links');
  urlInput.addEventListener('change', function () { CMS_URL = urlInput.value.replace(/\/?$/, '/'); });

  function describe(el) {
    if (!el) return '';
    var c = String(el.className || '').trim().split(/\s+/).filter(function (x) { return /^uol-|^event-card|^image-quote|^text-highlight|^in-text/.test(x); })[0];
    return el.tagName.toLowerCase() + (c ? '.' + c : '') + (el.id ? '#' + el.id : '');
  }

  /* ---------- picking a component ---------- */
  var COMPONENTS = ['.uol-widget-container', '.uol-widget', '.uol-banner-outer', '.uol-hero-banner', '.uol-task-banner', '.uol-accordion', '.uol-in-text-ctas-wrapper', '.uol-in-text-cta', '.uol-in-text-facts', '.text-highlight', '.uol-highlight-block', '.uol-typography-pull-quote', '.uol-typography-blockquote', '.uol-featured-image', '.uol-image-pair', '.uol-gallery-container', '.uol-linked-list', '.uol-link-button-container', '.uol-logo-group', '.in-text-icons', '.uol-info-list-container', '.uol-status-message', '.uol-chips', '.uol-people-profile-cards', '.uol-publications-list', '.uol-content-block', '.uol-article-highlight', '.uol-profile-supplement', '.image-quote', '.uol-key-facts', '.uol-index-table', '.uol-pagination', '.uol-facts-figures-container', '.uol-cards', '.uol-tiles', '.uol-news-tiles', '.events-cards', '.uol-navigation-cards', '.uol-description-list', '.uol-accreditations', '.uol-section-nav', '.uol-section-nav-related-content', '.uol-section-nav-ctas', '.uol-site-footer-outer', '.uol-header', '.uol-page__content', '.uol-article__content', '.uol-rich-text'];
  var GENERIC = ['blockquote', 'table', 'figure', 'main', 'section', 'article', 'aside', 'nav', 'ul', 'ol', 'p', 'h1', 'h2', 'h3', 'h4'];
  function matchUp(el, list) {
    for (var e = el; e && e !== document.body; e = e.parentElement) for (var i = 0; i < list.length; i++) if (e.matches && e.matches(list[i])) return e;
    return null;
  }
  function boundary(el) {
    var c = matchUp(el, COMPONENTS);
    if (c && (c.matches('.uol-rich-text') || c.matches('.uol-cards, .uol-tiles, .uol-news-tiles, .events-cards, .uol-navigation-cards, .uol-description-list, .uol-accreditations, .uol-facts-figures-container, .uol-gallery-container'))) { var w = c.closest('.uol-widget-container, .uol-widget'); if (w) c = w; }
    return c || matchUp(el, GENERIC) || el;
  }
  function onMove(e) {
    if (!picking) return;
    var t = boundary(e.target);
    if (t === hoverEl || pane.contains(e.target)) return;
    if (hoverEl) hoverEl.classList.remove('uol-grab-hover');
    hoverEl = t; hoverEl.classList.add('uol-grab-hover');
    pickInfo.textContent = 'Hovering: ' + describe(t);
  }
  function onClick(e) {
    if (!picking || pane.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    if (pickedEl) pickedEl.classList.remove('uol-grab-picked');
    pickedEl = boundary(e.target);
    pickedEl.classList.add('uol-grab-picked');
    if (hoverEl) { hoverEl.classList.remove('uol-grab-hover'); hoverEl = null; }
    stopPicking();
    pickInfo.textContent = 'Picked: ' + describe(pickedEl) + ' (' + Math.round(pickedEl.outerHTML.length / 1024) + ' KB). Click "Pick a section" again to change.';
  }
  function onKey(e) { if (e.key === 'Escape') { if (picking) { stopPicking(); pickInfo.textContent = 'Picking cancelled.'; } else close(); } }
  function startPicking() { picking = true; document.addEventListener('mousemove', onMove, true); document.addEventListener('click', onClick, true); pickInfo.textContent = 'Move over the page and click a component…'; }
  function stopPicking() { picking = false; document.removeEventListener('mousemove', onMove, true); document.removeEventListener('click', onClick, true); if (hoverEl) { hoverEl.classList.remove('uol-grab-hover'); hoverEl = null; } }

  /* ---------- site section: discover linked pages ---------- */
  function sameSite(href) { try { var u = new URL(href, location.href); return u.origin === location.origin && !/\.(pdf|docx?|xlsx?|pptx?|zip|jpe?g|png|gif|svg)(\?|$)/i.test(u.pathname) ? u.href.replace(/#.*$/, '') : null; } catch (e) { return null; }
  }
  function discoverLinks() {
    var groups = [
      { name: 'Section navigation', sel: '.uol-section-nav a[href]' },
      { name: 'Contents (in-page navigation)', sel: '.uol-in-page-navigation a[href]' },
      { name: 'Previous / next', sel: '.uol-page-nav a[href]' },
      { name: 'Related content', sel: '.uol-section-nav-related-content a[href]' },
      { name: 'Links in the main content', sel: 'main a[href], .uol-page__content a[href], .uol-homepage-content a[href]' }
    ];
    var seen = {}, out = [];
    var self = location.href.replace(/#.*$/, '');
    seen[self] = 1;
    groups.forEach(function (g, gi) {
      var items = [];
      Array.prototype.slice.call(document.querySelectorAll(g.sel)).forEach(function (a) {
        var u = sameSite(a.getAttribute('href'));
        if (!u || seen[u]) return;
        var label = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (!label) return;
        seen[u] = 1;
        items.push({ url: u, label: label, checked: gi < 3 });
      });
      if (items.length) out.push({ name: g.name, items: items });
    });
    return out;
  }
  function renderLinks() {
    var groups = discoverLinks();
    linksBox.innerHTML = '';
    linksBox.style.display = 'block';
    var head = document.createElement('div');
    head.innerHTML = '<label><input type="checkbox" checked> <strong>This page</strong> <span style="color:#636363">(' + (document.title || location.pathname) + ')</span></label>';
    head.querySelector('input').dataset.url = location.href.replace(/#.*$/, ''); head.querySelector('input').dataset.label = (document.querySelector('h1') || { textContent: document.title }).textContent.trim();
    linksBox.appendChild(head);
    if (!groups.length) { var p = document.createElement('div'); p.style.cssText = 'color:#636363;padding:4px 0'; p.textContent = 'No section navigation or contents links found on this page.'; linksBox.appendChild(p); }
    groups.forEach(function (g) {
      var s = document.createElement('div'); s.className = 'src'; s.textContent = g.name + ' (' + g.items.length + ')';
      linksBox.appendChild(s);
      g.items.forEach(function (i) {
        var l = document.createElement('label');
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = i.checked; cb.dataset.url = i.url; cb.dataset.label = i.label;
        l.appendChild(cb); l.appendChild(document.createTextNode(' ' + i.label));
        linksBox.appendChild(l);
      });
    });
    var tools = document.createElement('div'); tools.style.marginTop = '6px';
    tools.innerHTML = '<button type="button" class="mini" data-all="1">Select all</button><button type="button" class="mini" data-all="0">Select none</button>';
    tools.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var on = b.dataset.all === '1'; linksBox.querySelectorAll('input[type=checkbox]').forEach(function (c) { c.checked = on; }); });
    linksBox.appendChild(tools);
  }
  function selectedLinks() {
    return Array.prototype.slice.call(linksBox.querySelectorAll('input[type=checkbox]:checked')).map(function (c) { return { url: c.dataset.url, label: c.dataset.label }; }).filter(function (l) { return l.url; });
  }
  function fetchPages(links, progress) {
    var results = [];
    var i = 0;
    function next() {
      if (i >= links.length) return Promise.resolve(results);
      var l = links[i++];
      progress(i, links.length, l.label);
      var p = l.url === location.href.replace(/#.*$/, '') ? Promise.resolve('<!DOCTYPE html>' + cleanClone(document.documentElement).outerHTML)
        : fetch(l.url, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
      return p.then(function (html) { results.push({ url: l.url, title: l.label, html: html }); }, function (e) { results.push({ url: l.url, title: l.label, error: e.message }); }).then(next);
    }
    return next();
  }

  pane.querySelectorAll('input[name=uolgm]').forEach(function (r) {
    r.addEventListener('change', function () {
      mode = r.value;
      pane.querySelectorAll('label.opt').forEach(function (l) { l.classList.toggle('on', l.contains(r)); });
      linksBox.style.display = 'none';
      if (mode === 'pick') startPicking(); else { stopPicking(); pickInfo.textContent = ''; }
      if (mode === 'section') renderLinks();
      pane.querySelector('[data-act=send]').textContent = mode === 'section' ? 'Fetch and send to CMS' : 'Send to CMS';
    });
  });

  /* ---------- payloads ---------- */
  function cleanClone(root) {
    var c = root.cloneNode(true);
    if (c.classList) { c.classList.remove('uol-grab-hover', 'uol-grab-picked'); if (!c.className) c.removeAttribute('class'); }
    Array.prototype.slice.call(c.querySelectorAll('#uol-grab, #uol-grab-style, script, noscript, .uol-grab-hover, .uol-grab-picked')).forEach(function (n) {
      if (n.id === 'uol-grab' || n.id === 'uol-grab-style' || n.tagName === 'SCRIPT' || n.tagName === 'NOSCRIPT') n.remove(); else { n.classList.remove('uol-grab-hover', 'uol-grab-picked'); if (!n.className) n.removeAttribute('class'); }
    });
    return c;
  }
  function sectionTitle() {
    var t = document.querySelector('.uol-section-nav__title__text, .uol-header-local-masthead__link--title');
    return t ? t.textContent.replace(/home page/i, '').trim() : (document.title || 'Imported section').replace(/\s*[|–-]\s*University of Leeds.*$/i, '');
  }
  function payload() {
    if (mode === 'section') return null; // built asynchronously
    var html;
    if (mode === 'pick') {
      if (!pickedEl) { st.textContent = 'Pick a section first.'; return null; }
      html = cleanClone(pickedEl).outerHTML;
    } else if (mode === 'main') {
      var main = document.querySelector('.uol-page__content, .uol-article__content, main.uol-homepage-content, main') || document.body;
      html = cleanClone(main).innerHTML;
    } else {
      html = '<!DOCTYPE html>' + cleanClone(document.documentElement).outerHTML;
    }
    return { uolcms: 'import', kind: mode, html: html, url: location.href, title: document.title };
  }
  function buildSectionPayload() {
    var links = selectedLinks();
    if (!links.length) { st.textContent = 'Tick at least one page.'; return Promise.resolve(null); }
    var btn = pane.querySelector('[data-act=send]'); btn.disabled = true;
    return fetchPages(links, function (i, n, label) { st.textContent = 'Fetching ' + i + ' of ' + n + ': ' + label; }).then(function (pages) {
      btn.disabled = false;
      var ok = pages.filter(function (p) { return !p.error; });
      var failed = pages.filter(function (p) { return p.error; });
      if (!ok.length) { st.textContent = 'None of the pages could be fetched.'; return null; }
      st.textContent = 'Fetched ' + ok.length + ' page' + (ok.length === 1 ? '' : 's') + (failed.length ? ' (' + failed.length + ' failed)' : '') + '. Sending…';
      return { uolcms: 'import', kind: 'section', title: sectionTitle(), url: location.href, pages: ok, failed: failed.map(function (f) { return f.url + ' (' + f.error + ')'; }) };
    });
  }

  /* ---------- original images: fetched here (same site, so allowed) and sent along as data URLs ---------- */
  function absUrl(u) { try { return new URL(u, location.href).href; } catch (e) { return u; } }
  function imageUrlsIn(html) {
    var urls = {};
    String(html).replace(/<img[^>]+?(?:data-src-high-quality|data-src|src)="([^"]+)"/gi, function (m, u) { urls[absUrl(u)] = 1; return m; });
    String(html).replace(/url\(['"]?([^'")]+)['"]?\)/gi, function (m, u) { if (!/^data:/.test(u)) urls[absUrl(u)] = 1; return m; });
    return Object.keys(urls).filter(function (u) { return /^https?:/.test(u) && !/\.svg(\?|$)/i.test(u); });
  }
  function fetchAssets(urls, progress) {
    var map = {}, total = 0, i = 0, MAX_EACH = 4000000, MAX_TOTAL = 60000000;
    function next() {
      if (i >= urls.length || total > MAX_TOTAL) return Promise.resolve(map);
      var u = urls[i++];
      if (progress) progress(i, urls.length);
      return fetch(u, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
        if (!blob || !/^image\//.test(blob.type) || blob.size > MAX_EACH) return;
        return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { map[u] = fr.result; total += blob.size; res(); }; fr.onerror = function () { res(); }; fr.readAsDataURL(blob); });
      }).catch(function () {}).then(next);
    }
    return next();
  }
  function withAssets(p) {
    if (!p) return Promise.resolve(null);
    var htmls = p.kind === 'section' ? p.pages.map(function (x) { return x.html; }) : [p.html];
    var seen = {}, urls = [];
    htmls.forEach(function (h) { imageUrlsIn(h).forEach(function (u) { if (!seen[u]) { seen[u] = 1; urls.push(u); } }); });
    urls = urls.slice(0, 150);
    if (!urls.length) return Promise.resolve(p);
    return fetchAssets(urls, function (i, n) { st.textContent = 'Collecting images ' + i + ' of ' + n + '…'; }).then(function (map) { p.assets = map; return p; });
  }

  /* ---------- delivery ---------- */
  function sizeKb(p) { return Math.round(JSON.stringify(p).length / 1024); }
  function viaExtension(p) {
    return new Promise(function (resolve) {
      try { chrome.runtime.sendMessage({ type: 'deliver', payload: p }, function (resp) { if (chrome.runtime.lastError) resolve({ ok: false, reason: chrome.runtime.lastError.message }); else resolve(resp || { ok: false, reason: 'no response' }); }); }
      catch (e) { resolve({ ok: false, reason: e.message }); }
    });
  }
  function viaWindow(p) {
    return new Promise(function (resolve) {
      if (!/^https?:/.test(CMS_URL)) { resolve({ ok: false, reason: 'CMS is not on http' }); return; }
      var w = window.open(CMS_URL + '#import', 'leeds-cms');
      if (!w) { resolve({ ok: false, reason: 'pop-up blocked' }); return; }
      var tries = 0, acked = false, origin = CMS_URL.replace(/\/$/, '');
      function onMsg(e) { if (e.data && e.data.uolcms === 'import-ack') { acked = true; window.removeEventListener('message', onMsg); resolve({ ok: true }); } }
      window.addEventListener('message', onMsg);
      var timer = setInterval(function () {
        if (acked) { clearInterval(timer); return; }
        if (tries++ > 30) { clearInterval(timer); window.removeEventListener('message', onMsg); resolve({ ok: false, reason: 'the CMS at ' + CMS_URL + ' did not respond' }); return; }
        try { w.postMessage(p, origin); } catch (err) {}
      }, 500);
    });
  }
  function toClipboard(text) {
    function fallback() { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return Promise.resolve(ok); }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    return fallback();
  }
  function deliver(p) {
    var chain = Promise.resolve({ ok: false });
    if (hasExtension) chain = viaExtension(p);
    return chain.then(function (r) { return r.ok ? r : viaWindow(p); }).then(function (r) {
      if (r.ok) { st.textContent = 'Sent (' + sizeKb(p) + ' KB). Switch to the CMS tab to finish the import.'; return; }
      var text = p.kind === 'section' ? JSON.stringify(p) : p.html;
      return toClipboard(text).then(function (ok) {
        st.textContent = (ok ? 'Copied ' + sizeKb(p) + ' KB to the clipboard. ' : 'Could not copy automatically. ') + 'Open the CMS, go to Import and paste into "Page source or fragment". (Direct send: ' + (r.reason || 'unavailable') + ')';
      });
    });
  }
  function build() { return mode === 'section' ? buildSectionPayload() : Promise.resolve(payload()); }
  function send() { build().then(withAssets).then(function (p) { if (p) deliver(p); }); }
  function copy() {
    build().then(withAssets).then(function (p) {
      if (!p) return;
      // with images attached the clipboard gets JSON (the CMS recognises it); without, plain HTML is friendlier
      var text = (p.kind === 'section' || (p.assets && Object.keys(p.assets).length)) ? JSON.stringify(p) : p.html;
      toClipboard(text).then(function (ok) { st.textContent = ok ? 'Copied ' + sizeKb(p) + ' KB' + (p.assets ? ' including ' + Object.keys(p.assets).length + ' images' : '') + '. Paste it into the CMS Import page.' : 'Copy failed. Use Send instead.'; });
    });
  }
  function close() { stopPicking(); if (pickedEl) pickedEl.classList.remove('uol-grab-picked'); pane.style.display = 'none'; }
  function open() { pane.style.display = ''; }

  pane.querySelector('[data-act=send]').addEventListener('click', send);
  pane.querySelector('[data-act=copy]').addEventListener('click', copy);
  pane.querySelector('.h button').addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);

  var head = pane.querySelector('.h'), drag = null;
  head.addEventListener('mousedown', function (e) { if (e.target.tagName === 'BUTTON') return; drag = { x: e.clientX - pane.offsetLeft, y: e.clientY - pane.offsetTop }; e.preventDefault(); });
  document.addEventListener('mousemove', function (e) { if (!drag) return; pane.style.left = (e.clientX - drag.x) + 'px'; pane.style.top = (e.clientY - drag.y) + 'px'; pane.style.right = 'auto'; });
  document.addEventListener('mouseup', function () { drag = null; });

  if (hasExtension) st.textContent = 'Extension active: pages go straight to the open CMS tab.';
  window.__uolGrabber = { open: open, close: close, _payload: payload, _section: buildSectionPayload, _withAssets: withAssets };
})();
