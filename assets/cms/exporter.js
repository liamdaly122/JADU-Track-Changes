/* Leeds prototyping CMS - exports
   Standalone HTML, whole-site ZIP, PNG screenshots (page or single section), PDF via print, Markdown, Word, JSON,
   and copy-to-clipboard of design-system markup for pasting into Jadu. Every export inlines library images. */
(function () {
  'use strict';

  var R = window.UOL_RENDER;
  function M() { return window.UOL_MEDIA; }
  function inlineMedia(html) { return M() ? M().inline(html) : Promise.resolve(html); }
  /* render with media:<id> references kept, so they can be inlined as data URLs afterwards */
  function withRefs(fn) { var m = M(); if (!m) return fn(); m.keepRefs = true; try { return fn(); } finally { m.keepRefs = false; } }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
  }
  function safeName(s) { return String(s || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export'; }
  function stamp() { var d = new Date(); return d.toISOString().slice(0, 16).replace(/[:T]/g, '-'); }

  /* ---------- HTML ---------- */
  function pageHtml(ctx, page, opts) {
    var html = withRefs(function () { return R.renderDocument(ctx.site, page, Object.assign({ inline: true, pages: ctx.pages, sections: ctx.sections, linkMode: 'export' }, opts || {})); });
    return inlineMedia(html);
  }
  function exportHtml(ctx, page) {
    return pageHtml(ctx, page).then(function (html) { download(new Blob([html], { type: 'text/html' }), safeName(page.slug) + '.html'); });
  }
  function sectionHtml(ctx, blocks, template, bare) {
    return inlineMedia(withRefs(function () { return R.renderFragmentDocument(ctx.site, blocks, { inline: true, template: template, bare: bare }); }));
  }
  function exportSectionHtml(ctx, block, template) {
    return sectionHtml(ctx, [block], template, false).then(function (html) { download(new Blob([html], { type: 'text/html' }), safeName(block.type) + '-section.html'); });
  }

  /* ---------- minimal ZIP writer (store, no compression) ---------- */
  var crcTable = (function () { var t = [], c; for (var n = 0; n < 256; n++) { c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder();
    var parts = [], central = [], offset = 0;
    var now = new Date();
    var dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    var dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      var crc = crc32(data);
      var head = new DataView(new ArrayBuffer(30));
      head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
      head.setUint16(10, dosTime, true); head.setUint16(12, dosDate, true); head.setUint32(14, crc, true); head.setUint32(18, data.length, true); head.setUint32(22, data.length, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
      parts.push(new Uint8Array(head.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(4, 0, true); end.setUint16(6, 0, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true); end.setUint16(20, 0, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }
  function exportSiteZip(ctx) {
    var pages = ctx.pages;
    return Promise.all(pages.map(function (p) { return pageHtml(ctx, p).then(function (html) { return { name: (p.slug === 'home' || p.slug === '' ? 'index' : safeName(p.slug)) + '.html', data: html }; }); })).then(function (files) {
      var home = pages.filter(function (p) { return p.template === 'homepage'; })[0];
      if (!files.some(function (f) { return f.name === 'index.html'; }) && files.length) { var h = home ? files[pages.indexOf(home)] : files[0]; files.push({ name: 'index.html', data: h.data }); }
      files.push({ name: 'site.json', data: JSON.stringify({ site: ctx.site, pages: pages, sections: ctx.sections }, null, 2) });
      download(zip(files), 'leeds-prototype-site-' + stamp() + '.zip');
    });
  }

  /* ---------- PNG via html2canvas ---------- */
  function renderOffscreen(html, width) {
    return new Promise(function (resolve, reject) {
      var iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + width + 'px;height:800px;border:0;opacity:1;pointer-events:none;';
      document.body.appendChild(iframe);
      var done = false;
      iframe.addEventListener('load', function () {
        if (done) return; done = true;
        var doc = iframe.contentDocument;
        var finish = function () {
          setTimeout(function () {
            var h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
            iframe.style.height = h + 'px';
            setTimeout(function () { resolve({ iframe: iframe, doc: doc, height: h }); }, 250);
          }, 400);
        };
        if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(finish, finish); else finish();
      });
      iframe.srcdoc = html;
      setTimeout(function () { if (!done) { done = true; reject(new Error('Render timed out')); } }, 20000);
    });
  }
  /* ---------- Freight fonts embedded for screenshot renders ----------
     html2canvas draws text itself, so the fonts must be available inside its clone. Adobe Fonts serves the files
     with open CORS headers, so they can be fetched once and inlined as data URLs. Falls back to the normal link. */
  var FONT_FILES = [
    { family: 'freight-sans-pro', weight: 400, url: 'https://use.typekit.net/af/442215/000000000000000000010b5a/27/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n4&v=3' },
    { family: 'freight-sans-pro', weight: 500, url: 'https://use.typekit.net/af/8dd886/000000000000000000010b5c/27/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n5&v=3' },
    { family: 'freight-sans-pro', weight: 600, url: 'https://use.typekit.net/af/cef9f3/000000000000000000010b5e/27/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n6&v=3' },
    { family: 'freight-text-pro', weight: 500, url: 'https://use.typekit.net/af/4b422b/000000000000000077359fbd/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n5&v=3' },
    { family: 'freight-text-pro', weight: 900, url: 'https://use.typekit.net/af/80e9a7/000000000000000077359fce/30/l?primer=7cdcb44be4a7db8877ffa5c0007b8dd865b3bbc383831fe2ea177f62257a9191&fvd=n9&v=3' }
  ];
  var fontCssPromise = null;
  function embeddedFontCss() {
    if (fontCssPromise) return fontCssPromise;
    fontCssPromise = Promise.all(FONT_FILES.map(function (f) {
      return fetch(f.url, { mode: 'cors' }).then(function (r) { if (!r.ok) throw new Error('font'); return r.blob(); }).then(function (b) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res(null); }; fr.readAsDataURL(b); }); }).then(function (d) { return d ? '@font-face{font-family:"' + f.family + '";src:url(' + d + ') format("woff2");font-weight:' + f.weight + ';font-style:normal;font-display:block}' : ''; }).catch(function () { return ''; });
    })).then(function (rules) { var css = rules.join(''); if (!css) fontCssPromise = null; return css; });
    return fontCssPromise;
  }
  /* html2canvas measures text in its clone but draws it on a canvas that belongs to THIS document, so the same
     fonts must be loaded here too, or glyphs of a fallback font land on the measured positions and words collide */
  function ensureFontsHere(fontCss) {
    if (!fontCss) return Promise.resolve();
    if (!document.getElementById('uol-export-fonts')) { var s = document.createElement('style'); s.id = 'uol-export-fonts'; s.textContent = fontCss; document.head.appendChild(s); }
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(['400 16px "freight-sans-pro"', '500 16px "freight-sans-pro"', '600 16px "freight-sans-pro"', '500 16px "freight-text-pro"', '900 16px "freight-text-pro"'].map(function (f) { return document.fonts.load(f).catch(function () {}); })).then(function () {});
  }
  function prepareForRender(html) {
    return embeddedFontCss().then(function (fontCss) {
      if (fontCss) html = html.replace('<link rel="stylesheet" href="https://use.typekit.net/xpd0xwa.css">', '<style>' + fontCss + '</style>');
      return ensureFontsHere(fontCss).then(function () { return html; });
    });
  }

  function toPng(html, opts) {
    opts = opts || {};
    var width = opts.width || 1280;
    if (!window.html2canvas) return Promise.reject(new Error('html2canvas is not loaded'));
    return inlineMedia(html).then(inlineExternalImages).then(prepareForRender).then(function (h) { return renderOffscreen(h, width); }).then(function (r) {
      var target = r.doc.querySelector('.site-outer') || r.doc.body;
      return window.html2canvas(target, { useCORS: true, allowTaint: false, scale: opts.scale || 1, width: width, windowWidth: width, backgroundColor: '#ffffff', logging: false, imageTimeout: 8000 })
        .then(function (canvas) {
          document.body.removeChild(r.iframe);
          return new Promise(function (res) { canvas.toBlob(function (b) { res({ blob: b, canvas: canvas }); }, 'image/png'); });
        }, function (e) { document.body.removeChild(r.iframe); throw e; });
    });
  }
  function exportPagePng(ctx, page, opts) {
    opts = opts || {};
    var html = withRefs(function () { return R.renderDocument(ctx.site, page, { inline: true, noLinks: true, pages: ctx.pages, sections: ctx.sections, bodyClass: 'uol-cms-export' }); });
    html = html.replace('</head>', '<style>.site-outer{width:' + (opts.width || 1280) + 'px}</style></head>');
    return toPng(html, opts).then(function (r) { download(r.blob, safeName(page.slug) + '-' + (opts.width || 1280) + 'px.png'); return r; });
  }
  function exportSectionPng(ctx, block, template, opts) {
    opts = opts || {};
    var html = withRefs(function () { return R.renderFragmentDocument(ctx.site, [block], { inline: true, template: template, bare: true }); });
    return toPng(html, opts).then(function (r) { download(r.blob, safeName(block.type) + '-section-' + (opts.width || 1280) + 'px.png'); return r; });
  }

  /* ---------- external images: fetch what the browser is allowed to, so canvases are not blank ---------- */
  var imgCache = {};
  function fetchAsDataUrl(url) {
    if (imgCache[url]) return imgCache[url];
    var viaProxy = /^https?:/.test(location.protocol) && url.indexOf(location.origin) !== 0;
    var target = viaProxy ? '/__proxy?url=' + encodeURIComponent(url) : url;
    imgCache[url] = fetch(target, { mode: 'cors', credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(function (blob) { if (!/^image\//.test(blob.type) && !/\.svg/.test(url)) return null; return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { res(null); }; fr.readAsDataURL(blob); }); })
      .catch(function () { return null; });
    return imgCache[url];
  }
  function inlineExternalImages(html) {
    var urls = {};
    String(html).replace(/<img[^>]+src="(https?:\/\/[^"]+)"/gi, function (m, u) { urls[u] = 1; return m; });
    String(html).replace(/url\(['"]?(https?:\/\/[^'")]+)['"]?\)/gi, function (m, u) { urls[u] = 1; return m; });
    var list = Object.keys(urls).slice(0, 120);
    if (!list.length) return Promise.resolve(html);
    return Promise.all(list.map(function (u) { return fetchAsDataUrl(u.replace(/&amp;/g, '&')).then(function (d) { return [u, d]; }); })).then(function (pairs) {
      var map = {};
      pairs.forEach(function (p) { if (p[1]) map[p[0]] = p[1]; });
      if (!Object.keys(map).length) return html;
      return String(html).replace(/https?:\/\/[^"') ]+/g, function (m) { return map[m] || m; });
    });
  }

  /* ---------- PDF built from a rendered image (like a full-page screenshot tool) ---------- */
  function jpegBytes(canvas, quality) {
    var b64 = canvas.toDataURL('image/jpeg', quality || 0.88).split(',')[1];
    var bin = atob(b64), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }
  function buildPdf(pages) {
    var enc = new TextEncoder(), parts = [], offsets = [], pos = 0;
    function push(x) { var b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.length; }
    function obj(num, body) { offsets[num] = pos; push(num + ' 0 obj\n'); if (typeof body === 'string') push(body); else { push(body.head); push(body.stream); push('\nendstream'); } push('\nendobj\n'); }
    push('%PDF-1.4\n%âãÏÓ\n');
    var n = pages.length, kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
    pages.forEach(function (p, i) {
      var pageNum = 3 + i * 3;
      var content = 'q ' + p.pw.toFixed(2) + ' 0 0 ' + p.ph.toFixed(2) + ' 0 0 cm /Im0 Do Q';
      obj(pageNum, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + p.pw.toFixed(2) + ' ' + p.ph.toFixed(2) + '] /Contents ' + (pageNum + 1) + ' 0 R /Resources << /XObject << /Im0 ' + (pageNum + 2) + ' 0 R >> >> >>');
      obj(pageNum + 1, { head: '<< /Length ' + content.length + ' >>\nstream\n', stream: enc.encode(content) });
      obj(pageNum + 2, { head: '<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n', stream: p.jpeg });
    });
    var xrefPos = pos, total = 3 + n * 3;
    var xref = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (var k = 1; k < total; k++) xref += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
    push(xref);
    push('trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF');
    return new Blob(parts, { type: 'application/pdf' });
  }
  function canvasToPdf(canvas, mode) {
    var pages = [];
    if (mode === 'a4') {
      var A4W = 595.28, A4H = 841.89;
      var sliceH = Math.round(canvas.width * A4H / A4W);
      for (var y = 0; y < canvas.height; y += sliceH) {
        var h = Math.min(sliceH, canvas.height - y);
        var c = document.createElement('canvas'); c.width = canvas.width; c.height = sliceH;
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        pages.push({ jpeg: jpegBytes(c), w: c.width, h: c.height, pw: A4W, ph: A4H });
      }
    } else {
      var pw = canvas.width * 72 / 96;
      pages.push({ jpeg: jpegBytes(canvas), w: canvas.width, h: canvas.height, pw: pw, ph: canvas.height * 72 / 96 });
    }
    return buildPdf(pages);
  }
  /* opts.mode: 'single' (one tall page, like FireShot's default) or 'a4' (cut into A4 pages) */
  function exportPdf(ctx, page, opts) {
    opts = opts || {};
    var width = opts.width || 1280;
    var html = withRefs(function () { return R.renderDocument(ctx.site, page, { inline: true, noLinks: true, pages: ctx.pages, sections: ctx.sections, bodyClass: 'uol-cms-export' }); });
    html = html.replace('</head>', '<style>.site-outer{width:' + width + 'px}</style></head>');
    return toPng(html, { width: width, scale: 1 }).then(function (r) {
      var blob = canvasToPdf(r.canvas, opts.mode === 'a4' ? 'a4' : 'single');
      download(blob, safeName(page.slug) + (opts.mode === 'a4' ? '-a4' : '') + '.pdf');
      return blob;
    });
  }
  /* ---------- whole section (many pages) ---------- */
  function renderPageCanvas(ctx, page, width) {
    var html = withRefs(function () { return R.renderDocument(ctx.site, page, { inline: true, noLinks: true, pages: ctx.pages, sections: ctx.sections, bodyClass: 'uol-cms-export' }); });
    html = html.replace('</head>', '<style>.site-outer{width:' + width + 'px}</style></head>');
    return toPng(html, { width: width, scale: 1 });
  }
  /* opts: { format: 'pdf' | 'pdf-pages' | 'png', mode: 'single' | 'a4', width, onProgress(i, n, page) } */
  function exportPages(ctx, pages, name, opts) {
    opts = opts || {};
    var width = opts.width || 1280, format = opts.format || 'pdf', results = [], i = 0;
    function next() {
      if (i >= pages.length) return Promise.resolve();
      var page = pages[i++];
      if (opts.onProgress) opts.onProgress(i, pages.length, page);
      return renderPageCanvas(ctx, page, width).then(function (r) { results.push({ page: page, canvas: r.canvas, blob: r.blob }); }).then(next);
    }
    return next().then(function () {
      if (!results.length) throw new Error('Nothing to export');
      var base = safeName(name || 'section');
      if (format === 'pdf') {
        var pdfPages = [];
        results.forEach(function (r) {
          if (opts.mode === 'a4') { var A4W = 595.28, A4H = 841.89, sliceH = Math.round(r.canvas.width * A4H / A4W); for (var y = 0; y < r.canvas.height; y += sliceH) { var h = Math.min(sliceH, r.canvas.height - y); var c = document.createElement('canvas'); c.width = r.canvas.width; c.height = sliceH; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(r.canvas, 0, y, r.canvas.width, h, 0, 0, r.canvas.width, h); pdfPages.push({ jpeg: jpegBytes(c), w: c.width, h: c.height, pw: A4W, ph: A4H }); } }
          else pdfPages.push({ jpeg: jpegBytes(r.canvas), w: r.canvas.width, h: r.canvas.height, pw: r.canvas.width * 72 / 96, ph: r.canvas.height * 72 / 96 });
        });
        download(buildPdf(pdfPages), base + '.pdf');
        return results.length;
      }
      var files = results.map(function (r, idx) {
        var n = String(idx + 1).padStart(2, '0') + '-' + safeName(r.page.slug);
        if (format === 'png') return { name: n + '.png', data: r.blob };
        return { name: n + '.pdf', data: canvasToPdf(r.canvas, opts.mode === 'a4' ? 'a4' : 'single') };
      });
      return Promise.all(files.map(function (f) { return f.data.arrayBuffer().then(function (buf) { return { name: f.name, data: new Uint8Array(buf) }; }); })).then(function (entries) {
        download(zip(entries), base + '-' + (format === 'png' ? 'png' : 'pdf') + '.zip');
        return results.length;
      });
    });
  }
  function exportSectionPdf(ctx, block, template, opts) {
    opts = opts || {};
    var html = withRefs(function () { return R.renderFragmentDocument(ctx.site, [block], { inline: true, template: template, bare: true }); });
    return toPng(html, { width: opts.width || 1280 }).then(function (r) { download(canvasToPdf(r.canvas, 'single'), safeName(block.type) + '-section.pdf'); });
  }

  /* ---------- Markdown / Word ---------- */
  function htmlToMarkdown(html) {
    var d = document.createElement('div'); d.innerHTML = html;
    function walk(node) {
      var out = '';
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) { out += n.textContent.replace(/\s+/g, ' '); return; }
        if (n.nodeType !== 1) return;
        var t = n.tagName, inner = walk(n);
        switch (t) {
          case 'H1': out += '\n# ' + inner.trim() + '\n\n'; break;
          case 'H2': out += '\n## ' + inner.trim() + '\n\n'; break;
          case 'H3': out += '\n### ' + inner.trim() + '\n\n'; break;
          case 'H4': case 'H5': case 'H6': out += '\n#### ' + inner.trim() + '\n\n'; break;
          case 'P': case 'DIV': case 'FIGCAPTION': out += inner.trim() + '\n\n'; break;
          case 'BR': out += '\n'; break;
          case 'STRONG': case 'B': out += '**' + inner + '**'; break;
          case 'EM': case 'I': out += '*' + inner + '*'; break;
          case 'A': out += '[' + inner + '](' + (n.getAttribute('href') || '#') + ')'; break;
          case 'UL': out += '\n' + Array.prototype.map.call(n.children, function (li) { return '- ' + walk(li).trim(); }).join('\n') + '\n\n'; break;
          case 'OL': out += '\n' + Array.prototype.map.call(n.children, function (li, i) { return (i + 1) + '. ' + walk(li).trim(); }).join('\n') + '\n\n'; break;
          case 'BLOCKQUOTE': out += '\n> ' + inner.trim().replace(/\n+/g, '\n> ') + '\n\n'; break;
          case 'IMG': out += '![' + (n.getAttribute('alt') || '') + '](' + (n.getAttribute('src') || '') + ')'; break;
          case 'TABLE': {
            Array.prototype.slice.call(n.querySelectorAll('tr')).forEach(function (r, i) {
              var cellsArr = Array.prototype.map.call(r.children, function (c) { return walk(c).trim(); });
              out += '| ' + cellsArr.join(' | ') + ' |\n';
              if (i === 0) out += '| ' + cellsArr.map(function () { return '---'; }).join(' | ') + ' |\n';
            });
            out += '\n'; break;
          }
          case 'SCRIPT': case 'STYLE': case 'SVG': break;
          default: out += inner;
        }
      });
      return out;
    }
    return walk(d).replace(/\n{3,}/g, '\n\n').trim();
  }
  function mainOf(ctx, page) {
    var d = document.createElement('div'); d.innerHTML = withRefs(function () { return R.renderBody(ctx.site, page, { pages: ctx.pages, sections: ctx.sections }); });
    return d.querySelector('main') || d;
  }
  function pageMarkdown(ctx, page) {
    var h = page.settings.heading || {};
    var md = '# ' + (h.title || page.title) + '\n\n' + (h.subtitle ? '*' + h.subtitle + '*\n\n' : '');
    if (page.hero && page.hero.type !== 'none') {
      var items = page.hero.type === 'banner' ? page.hero.items || [] : [page.hero];
      items.forEach(function (i) { if (i.title) md += '**' + i.title + '**' + (i.lead ? ': ' + i.lead : '') + '\n\n'; });
    }
    var main = mainOf(ctx, page);
    Array.prototype.slice.call(main.querySelectorAll('.page-heading__title, h1.hide-accessible, .uol-in-page-navigation, .uol-page-nav')).forEach(function (n) { n.remove(); });
    return md + htmlToMarkdown(main.innerHTML);
  }
  function exportMarkdown(ctx, page) { download(new Blob([pageMarkdown(ctx, page)], { type: 'text/markdown' }), safeName(page.slug) + '.md'); }
  function exportWord(ctx, page) {
    var main = mainOf(ctx, page);
    Array.prototype.slice.call(main.querySelectorAll('script, svg, iframe, .hide-accessible')).forEach(function (n) { n.remove(); });
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>' + (page.title || '') + '</title><style>body{font-family:Arial,sans-serif;font-size:11pt}h1{font-size:22pt}h2{font-size:16pt}h3{font-size:13pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}img{max-width:600px}</style></head><body><h1>' + ((page.settings.heading && page.settings.heading.title) || page.title) + '</h1>' + main.innerHTML + '</body></html>';
    return inlineMedia(html).then(function (h) { download(new Blob(['﻿', h], { type: 'application/msword' }), safeName(page.slug) + '.doc'); });
  }

  /* ---------- JSON ---------- */
  function exportPageJson(page) {
    download(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), version: 2, page: page }, null, 2)], { type: 'application/json' }), safeName(page.slug) + '.page.json');
  }
  function exportProjectJson(store) {
    return store.exportProject().then(function (json) { download(new Blob([json], { type: 'application/json' }), 'leeds-cms-project-' + stamp() + '.json'); });
  }

  /* ---------- clipboard ---------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); res(); } catch (e) { rej(e); } document.body.removeChild(ta);
    });
  }
  function blockMarkup(block) { return R.blockMarkup(block); }
  function pageMarkup(ctx, page) { return R.renderBody(ctx.site, page, { pages: ctx.pages, sections: ctx.sections }); }

  window.UOL_EXPORT = {
    download: download, zip: zip,
    pageHtml: pageHtml, exportHtml: exportHtml, exportSectionHtml: exportSectionHtml, sectionHtml: sectionHtml,
    exportSiteZip: exportSiteZip,
    toPng: toPng, exportPagePng: exportPagePng, exportSectionPng: exportSectionPng,
    exportPdf: exportPdf, exportSectionPdf: exportSectionPdf, canvasToPdf: canvasToPdf, exportPages: exportPages, inlineExternalImages: inlineExternalImages, fetchAsDataUrl: fetchAsDataUrl,
    pageMarkdown: pageMarkdown, exportMarkdown: exportMarkdown, exportWord: exportWord,
    exportPageJson: exportPageJson, exportProjectJson: exportProjectJson,
    copyText: copyText, blockMarkup: blockMarkup, pageMarkup: pageMarkup
  };
})();
