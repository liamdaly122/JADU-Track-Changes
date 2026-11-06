/* Layout check: do review links (and the editor preview) lay blocks out the way the published page does?

   Builds a document page and a homepage containing every block that template offers, with each block's default
   content plus a few awkward cases (a single fact, blocks without titles). Each page is drawn three ways, at four
   screen widths:
     published  the page as exported or seen on the live site
     review     what reviewers see through a review link
     editor     the editor's preview
   For every block it compares where the block sits (left edge, width, height, and the gap above it) with the
   published page. A review link must match exactly. The editor is reported separately, as a warning: it wraps each
   block in a box for its toolbar and outline, so some spacing differs there; blocks it places differently are listed.

   Run from the repository folder (needs Node.js and Playwright: npm install playwright):
     node tests/review-layout.js            check and print the results
     node tests/review-layout.js --shots    also save screenshots of any block that moved, in tests/output
   It exits with status 1 if a review link differs from the published page. */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const WIDTHS = [1024, 1280, 1440, 1920];
const TOLERANCE = 2; // px
const SHOTS = process.argv.includes('--shots');
const OUT = path.join(__dirname, 'output');
const generated = {}; // path -> html, served alongside the repository files

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json' };
function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (generated[url]) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(generated[url]); }
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* in the CMS page: one page per template with every block, drawn in the three ways */
function buildPages() {
  const R = window.UOL_RENDER, B = window.UOL_BLOCKS.registry, site = window.UOL_STORE.data.site;
  const copy = (o) => JSON.parse(JSON.stringify(o || {}));
  const extras = [
    ['facts-figures', 'one fact, no title', { title: '', items: [{ headline: 'Top 100', text: 'world ranking university', source: 'QS World University Rankings 2027', sourceHref: 'https://example.com' }] }],
    ['facts-figures-v2', 'one fact, no title', { title: '', items: [{ highlight: 'Top 100', text: 'world ranking university', citation: 'QS World University Rankings 2027', citationHref: 'https://example.com' }] }],
    ['content', 'no title', { title: '', lead: '', body: '<p>A content widget without a title.</p>' }]
  ];
  const out = {};
  ['document', 'homepage'].forEach((template) => {
    const blocks = [], labels = {};
    Object.keys(B).filter((t) => (B[t].scope || []).indexOf(template) >= 0).forEach((t) => {
      const id = 'b' + blocks.length; blocks.push({ id, type: t, props: copy(B[t].defaults) }); labels[id] = B[t].label || t;
    });
    extras.forEach(([t, note, props]) => {
      if (!B[t] || (B[t].scope || []).indexOf(template) < 0) return;
      const id = 'b' + blocks.length; blocks.push({ id, type: t, props }); labels[id] = (B[t].label || t) + ', ' + note;
    });
    const page = { id: 'p-' + template, slug: 'layout-' + template, title: 'Layout check', template, settings: { heading: { title: 'Layout check' } }, blocks };
    const other = { id: 'p-other', slug: 'other', title: 'Another page', template: 'document', settings: {}, blocks: [] };
    const ctx = { pages: [page, other], sections: [{ id: 's1', title: 'Layout check', pages: [page.id, other.id] }] };
    out[template] = {
      labels, ids: blocks.map((b) => b.id),
      published: R.renderDocument(site, page, Object.assign({}, ctx)),
      review: R.renderDocument(site, page, Object.assign({ markBlocks: true }, ctx)),
      editor: R.renderDocument(site, page, Object.assign({ editor: true }, ctx))
    };
  });
  return out;
}

/* in a rendered page: the box of every element in the content, in document order, leaving out the CMS's own
   wrappers and controls so the three versions line up element for element */
function measure() {
  const main = document.querySelector('main');
  const skip = (e) => e.classList.contains('uol-cms-block') || e.closest('.uol-cms-bar, .uol-cms-insert, .uol-cms-empty');
  const els = Array.prototype.filter.call(main.querySelectorAll('*'), (e) => !skip(e));
  return els.map((e) => {
    const r = e.getBoundingClientRect(), owner = e.closest('[data-block-id]');
    return { block: owner ? owner.getAttribute('data-block-id') : null, x: r.left, y: r.top + window.scrollY, w: r.width, h: r.height, tag: e.tagName, visible: r.width > 0 && r.height > 0 };
  });
}

/* per block: the box around its visible elements, plus the gap to the block above it */
function blockBoxes(elems, ids, owners) {
  const boxes = {};
  elems.forEach((e, i) => {
    const id = owners[i]; if (!id || !e.visible) return;
    const b = boxes[id] || (boxes[id] = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
    b.x1 = Math.min(b.x1, e.x); b.y1 = Math.min(b.y1, e.y); b.x2 = Math.max(b.x2, e.x + e.w); b.y2 = Math.max(b.y2, e.y + e.h);
  });
  let prev = null;
  ids.forEach((id) => {
    const b = boxes[id]; if (!b) return;
    b.left = b.x1; b.width = b.x2 - b.x1; b.height = b.y2 - b.y1; b.gap = prev ? b.y1 - prev.y2 : 0;
    b.beside = !!(prev && b.y1 < prev.y2 - TOLERANCE); // starts before the block above ends: it sits beside it
    prev = b;
  });
  return boxes;
}

function compare(ref, other, ids, labels) {
  const problems = [];
  ids.forEach((id) => {
    const a = ref[id], b = other[id];
    if (!a && !b) return;
    if (!a || !b) { problems.push({ id, label: labels[id], what: b ? 'not drawn on the published page' : 'missing', placement: !b }); return; }
    const diffs = [];
    let placement = b.beside !== a.beside;
    if (placement) diffs.push(b.beside ? 'sits beside the block above' : 'no longer sits beside the block above');
    [['left', 'left edge'], ['width', 'width'], ['height', 'height'], ['gap', 'gap above']].forEach(([k, name]) => {
      const d = b[k] - a[k]; if (Math.abs(d) <= TOLERANCE) return;
      diffs.push(name + ' ' + (d > 0 ? '+' : '') + Math.round(d) + 'px');
      if (k === 'left' || k === 'width') placement = true;
    });
    if (diffs.length) problems.push({ id, label: labels[id], what: diffs.join(', '), placement });
  });
  return problems;
}

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let failed = false;
  try {
    const cms = await browser.newPage();
    // run the CMS on its own (no cloud): no sign-in, and nothing reaches a real Supabase project
    await cms.route('**/assets/cms/cloud-config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.UOL_CLOUD_CONFIG = { url: "", anonKey: "" };' }));
    await cms.route(/supabase\.co/, (r) => r.abort());
    await cms.goto(base + '/index.html#pages');
    await cms.waitForFunction(() => window.UOL_RENDER && window.UOL_BLOCKS && window.UOL_STORE && window.UOL_STORE.data);
    const pages = await cms.evaluate(buildPages);
    // the pages link the design system's stylesheet by a relative path, so they are served from the site root
    await cms.close();
    if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

    for (const template of Object.keys(pages)) {
      const P = pages[template];
      for (const mode of ['published', 'review', 'editor']) generated['/__layout-' + template + '-' + mode + '.html'] = P[mode];
      console.log('\n' + template + ' page: ' + P.ids.length + ' blocks');
      for (const width of WIDTHS) {
        const tab = await browser.newPage({ viewport: { width, height: 900 } });
        const shots = {};
        const elems = {};
        for (const mode of ['published', 'review', 'editor']) {
          await tab.goto(base + '/__layout-' + template + '-' + mode + '.html', { waitUntil: 'load' });
          await tab.waitForTimeout(400);
          if (!(await tab.evaluate(() => Array.prototype.some.call(document.styleSheets, (s) => /assets\/ds\/css\/style\.css/.test(s.href || '') && s.cssRules.length)))) throw new Error('The design system stylesheet did not load in the ' + mode + ' version');
          elems[mode] = await tab.evaluate(measure);
          if (SHOTS) shots[mode] = await tab.screenshot({ fullPage: true });
        }
        // which block each element belongs to comes from the review version, where blocks carry their ids
        const owners = elems.review.map((e) => e.block);
        const lengths = ['published', 'editor'].filter((m) => elems[m].length !== owners.length);
        if (lengths.length) {
          failed = true;
          console.log('  ' + width + 'px  the ' + lengths.join(' and ') + ' version has a different number of elements from the review version; cannot compare');
          await tab.close(); continue;
        }
        const boxes = {}; ['published', 'review', 'editor'].forEach((m) => { boxes[m] = blockBoxes(elems[m], P.ids, owners); });
        const review = compare(boxes.published, boxes.review, P.ids, P.labels);
        const editor = compare(boxes.published, boxes.editor, P.ids, P.labels);
        if (review.length) failed = true;
        console.log('  ' + width + 'px  review link: ' + (review.length ? review.length + ' block' + (review.length === 1 ? '' : 's') + ' differ' : 'matches the published page') +
          '  |  editor: ' + (editor.length ? editor.length + ' differ' : 'matches'));
        review.forEach((p) => console.log('      REVIEW  ' + p.label + ': ' + p.what));
        // the editor wraps each block in a box for its toolbar and outline, which changes some spacing; only blocks
        // in a different place or at a different width are listed
        const placed = editor.filter((p) => p.placement), spacing = editor.length - placed.length;
        placed.forEach((p) => console.log('      editor  ' + p.label + ': ' + p.what));
        if (spacing) console.log('      editor  ' + spacing + ' more block' + (spacing === 1 ? ' has' : 's have') + ' different spacing only');
        if (SHOTS && (review.length || editor.length)) {
          for (const mode of Object.keys(shots)) fs.writeFileSync(path.join(OUT, template + '-' + width + '-' + mode + '.png'), shots[mode]);
        }
        await tab.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(failed ? '\nFAILED: a review link lays out differently from the published page.' : '\nOK: review links lay out every block as the published page does.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
