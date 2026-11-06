/* Leeds prototyping CMS - page renderer
   Composes site chrome (masthead, navigation, footer) and page templates from the block registry,
   producing the same markup as designsystem.leeds.ac.uk. In editor mode it also annotates editable text,
   so the preview can be edited in place, and injects the block toolbar / drag-and-drop script. */
(function () {
  'use strict';

  var U = window.UOL_BLOCKS.util;
  var esc = U.esc, attr = U.attr, rich = U.rich, href = U.href, svg = U.svg, cls = U.cls;
  var C = window.UOL_BLOCKS.components;

  /* media:<id> references become object URLs for previews; exporters set keepRefs so they can inline data URLs instead */
  function media(html) { return window.UOL_MEDIA && !window.UOL_MEDIA.keepRefs ? window.UOL_MEDIA.replace(html) : html; }

  /* ---------- theme ---------- */
  function themeCss(theme) {
    theme = theme || {};
    var tokens = theme.tokens || {};
    var vars = [];
    Object.keys(tokens).forEach(function (k) { if (tokens[k]) vars.push('--uol-' + k + ':' + tokens[k]); });
    if (theme.fontSans) vars.push('--uol-font-sans:' + theme.fontSans);
    if (theme.fontSerif) vars.push('--uol-font-serif:' + theme.fontSerif);
    var css = vars.length ? ':root{' + vars.join(';') + '}' : '';
    if (theme.baseFontSize && theme.baseFontSize !== '100%') css += 'html{font-size:' + theme.baseFontSize + '}';
    css += '.uol-cms-unknown{padding:1rem;border:2px dashed #c70000;color:#910000;font-family:sans-serif;margin:1rem 0}';
    if (theme.customCss) css += '\n' + theme.customCss;
    return css;
  }

  /* ---------- header ---------- */
  function quicklinks(groups) {
    if (!groups || !groups.length) return '';
    return '<nav class="uol-quicklinks" aria-label="University links"><ul class="uol-quicklinks__list">' + groups.map(function (g) {
      return '<li class="uol-quicklinks__group"> ' + esc(g.label) + ' <ul class="uol-quicklinks__group__list">' + (g.links || []).map(function (l) {
        return '<li class="uol-quicklinks__group__item"><a class="uol-quicklinks__group__link" href="' + href(l.href) + '">' + esc(l.label) + '</a></li>';
      }).join('') + '</ul></li>';
    }).join('') + '</ul></nav>';
  }

  function globalMasthead(site, hasLocalNav) {
    var m = site.masthead || {};
    var search = m.showSearch === false ? '' : '<form id="uol-global-masthead__search-form" class="uol-global-masthead__search-form" action="' + attr(m.searchAction || 'https://www.leeds.ac.uk/search') + '"><label class="uol-global-masthead__search-label" for="global-masthead__search-field">' + esc(m.searchLabel || 'Search leeds.ac.uk') + '</label><input class="uol-global-masthead__search-input" id="global-masthead__search-field" name="search-query" type="search" placeholder="' + attr(m.searchLabel || 'Search leeds.ac.uk') + '"><button class="uol-global-masthead__search-submit" type="submit">' + svg('search') + '<span class="hide-accessible">Search all leeds.ac.uk</span></button></form>';
    var local = '';
    var lm = site.localMasthead || {};
    if (lm.enabled) {
      local = '<div class="uol-header-local-masthead"><div class="uol-header-local-masthead__inner">' +
        (lm.parentTitle ? '<a class="uol-header-local-masthead__link uol-header-local-masthead__link--parent-site" href="' + href(lm.parentHref) + '"> ' + esc(lm.parentTitle) + ' <span class="hide-accessible"> home page</span></a>' : '') +
        '<a class="uol-header-local-masthead__link uol-header-local-masthead__link--title" href="' + href(lm.href || '/') + '"> ' + esc(lm.title || site.name) + ' <span class="hide-accessible"> home page</span></a></div></div>';
    }
    return '<header class="' + cls('uol-global-masthead-outer', hasLocalNav && 'uol-global-masthead-outer--with-local-navigation') + '"><div class="uol-global-masthead uol-content-container"><div class="uol-global-masthead__inner"><a class="uol-skip-link" href="#main">Skip to main content</a><a class="uol-global-masthead__home" href="' + attr(site.homeUrl || 'https://leeds.ac.uk') + '">' + svg('logoInline') + '<span class="hide-accessible">University of Leeds homepage</span></a></div>' +
      (m.showQuicklinks === false ? '' : quicklinks(m.quicklinks)) + search + '</div>' + local + '</header>';
  }

  function localNavigation(site, page) {
    var nav = site.navigation || {};
    if (nav.enabled === false || !(nav.items || []).length) return '';
    var active = (page && page.settings && page.settings.navActive) || '';
    return '<nav class="uol-header-local-navigation-wrapper uol-content-container" aria-label="Site navigation"><ul class="uol-header-local-navigation">' + nav.items.map(function (item) {
      var kids = (item.children || []).filter(function (c) { return c.label; });
      if (kids.length) {
        return '<li class="uol-header-local-navigation__item uol-header-local-navigation__item--parent" data-label="' + attr(item.label) + '"> ' + esc(item.label) + ' <ul class="uol-header-local-navigation__sub-nav" data-title="' + attr(item.label) + '">' + kids.map(function (c) {
          return '<li class="' + cls('uol-header-local-navigation__item', c.cta && 'uol-header-local-navigation__item--cta') + '"><a class="uol-header-local-navigation__link uol-header-local-navigation__link--sub-nav" href="' + href(c.href) + '"' + (active && active === c.href ? ' aria-current="page"' : '') + '> ' + esc(c.label) + ' </a></li>';
        }).join('') + '</ul></li>';
      }
      return '<li class="uol-header-local-navigation__item " data-label="' + attr(item.label) + '"><a class="uol-header-local-navigation__link" href="' + href(item.href) + '"' + (active && active === item.href ? ' aria-current="page"' : '') + '> ' + esc(item.label) + ' </a></li>';
    }).join('') + '</ul></nav>';
  }

  function header(site, page) {
    var nav = localNavigation(site, page);
    return '<div class="uol-header">' + globalMasthead(site, !!nav) + nav + '</div>';
  }

  function globalBanner(site) {
    var b = site.globalBanner || {};
    if (!b.enabled) return '';
    return '<div class="uol-global-banner">' + (b.title ? '<h3 class="uol-global-banner__title">' + esc(b.title) + '</h3>' : '') + (b.description ? '<p class="uol-global-banner__description">' + esc(b.description) + '</p>' : '') + (b.buttonLabel ? '<a class="uol-button uol-button-- " href="' + href(b.buttonHref) + '">' + esc(b.buttonLabel) + '</a>' : '') + '</div>';
  }

  function marketingBanner(site) {
    var b = site.marketingBanner || {};
    if (!b.enabled) return '';
    return '<div class="uol-global-marketing-banner">' + (b.title ? '<h3 class="uol-global-marketing-banner__title">' + esc(b.title) + '</h3>' : '') + '<p class="uol-global-marketing-banner__description">' + esc(b.description || '') + (b.linkLabel ? ' <a class="uol-global-marketing-banner__link" href="' + href(b.linkHref) + '">' + esc(b.linkLabel) + '</a>' : '') + '</p></div>';
  }

  /* ---------- section navigation (side) ---------- */
  function sectionNavItems(items, level) {
    return '<ul class="' + (level === 0 ? 'uol-section-nav__list' : 'uol-section-nav__sublist') + '">' + (items || []).filter(function (i) { return i.label; }).map(function (i) {
      var kids = (i.children || []).filter(function (c) { return c.label; });
      if (kids.length) {
        var h = 'h' + Math.min(6, 3 + level);
        return '<li class="uol-section-nav__item uol-section-nav__item--parent"><' + h + ' class="uol-section-nav__item__label">' + esc(i.label) + '</' + h + '>' + sectionNavItems(kids, level + 1) + '</li>';
      }
      return '<li class="uol-section-nav__item "><a class="uol-section-nav__link" href="' + href(i.href) + '"' + (i.current ? ' aria-current="page"' : '') + '><span class="uol-section-nav__item__label">' + esc(i.label) + '</span></a></li>';
    }).join('') + '</ul>';
  }

  function sectionNav(page) {
    var s = page.settings.sectionNav || {};
    if (!s.enabled) return '';
    return '<nav class="uol-section-nav" aria-label="Section navigation"><h2 class="uol-section-nav__title"><span class="uol-section-nav__title__intro">' + esc(s.intro || 'In this section') + '</span><span class="uol-section-nav__title__text">' + esc(s.title || '') + '</span></h2>' + sectionNavItems(s.items, 0) + '</nav>';
  }

  function relatedContent(page) {
    var r = page.settings.relatedContent || {};
    if (!r.enabled || !(r.items || []).length) return '';
    return '<aside class="uol-content-switch-from-side-to-main uol-section-nav-related-content " aria-label="Related content"><h2 class="uol-section-nav-related-content__title">' + esc(r.title || 'Related content') + '</h2><div class="uol-section-nav-related-content__list">' + r.items.map(function (i) {
      var html = '<div class="uol-section-nav-related__item"><h3 class="uol-section-nav-related-content__item__title">' + (i.href ? '<a class="uol-section-nav-related-content__item__title__link" href="' + href(i.href) + '">' + esc(i.title) + '</a>' : ' ' + esc(i.title) + ' ') + '</h3>';
      if (i.text) html += '<p class="uol-section-nav-related-content__item__text">' + esc(i.text) + '</p>';
      if (i.phone) html += '<div class="uol-section-nav-related-content__item__contact-wrapper"><a class="uol-section-nav-related-content__contact uol-section-nav-related-content__contact--phone" href="tel:' + attr(i.phone.replace(/[^\d+]/g, '')) + '"> ' + esc(i.phone) + ' </a></div>';
      if (i.email) html += '<div class="uol-section-nav-related-content__item__contact-wrapper"><a class="uol-section-nav-related-content__contact uol-section-nav-related-content__contact--email" href="mailto:' + attr(i.email) + '"> ' + esc(i.email) + ' </a></div>';
      return html + '</div>';
    }).join('') + '</div></aside>';
  }

  function sectionCtas(page) {
    var s = page.settings.sectionCtas || {};
    if (!s.enabled || !(s.links || []).length) return '';
    return '<aside class="uol-section-nav-ctas" aria-label="Related links">' + (s.title ? '<h3 class="uol-section-nav-ctas__title">' + esc(s.title) + '</h3>' : '') + '<div class="uol-section-nav-ctas__links">' + s.links.map(function (l) { return '<a class="uol-button uol-section-nav-ctas__link" href="' + href(l.href) + '">' + esc(l.label) + '</a>'; }).join('') + '</div></aside>';
  }

  function breadcrumb(page) {
    var items = (page.settings.breadcrumb || []).filter(function (b) { return b.label; });
    if (!items.length) return '';
    return '<nav aria-label="Breadcrumb" class="uol-breadcrumb"><ol class="uol-breadcrumb__list">' + items.map(function (b) { return '<li class="uol-breadcrumb__item"><a class="uol-breadcrumb__link" href="' + href(b.href) + '"> ' + esc(b.label) + ' </a></li>'; }).join('') + '</ol></nav>';
  }

  /* ---------- hero area ---------- */
  function hero(page) {
    var h = page.hero || {};
    if (!h.type || h.type === 'none') return '';
    if (h.type === 'banner') {
      var items = (h.items || []).filter(function (i) { return i.title; });
      if (!items.length) return '';
      var multiple = items.length > 1;
      return '<section aria-label="Featured" class="uol-banner-outer"><div class="' + cls('uol-banner-container', multiple && 'uol-banner-container--multiple') + '"><ol tabindex="0" class="' + cls('uol-banner', multiple && 'uol-banner--multiple') + '">' + items.map(function (i) {
        return '<li class="uol-banner__item"><h3 class="uol-banner__item__title">' + esc(i.title) + '</h3>' + (i.image ? '<img class="uol-banner__item__img" src="' + attr(i.image) + '" alt="' + attr(i.alt || '') + '" loading="lazy">' : '') + (i.lead ? '<p class="uol-banner__item__lead">' + esc(i.lead) + '</p>' : '') + (i.linkLabel ? '<a class="uol-banner__item__link" href="' + href(i.linkHref) + '">' + esc(i.linkLabel) + '</a>' : '') + '</li>';
      }).join('') + '</ol></div></section>';
    }
    if (h.type === 'hero') {
      var tag = page.template === 'homepage' && !h.useH1 ? 'h2' : 'h1';
      return '<section class="uol-hero-banner" aria-label="Hero banner"><div class="uol-hero-banner--inner"><div class="uol-hero-banner__text-container"><' + tag + ' class="uol-hero-banner__title"> ' + esc(h.title || page.title) + ' </' + tag + '>' + (h.lead ? '<p class="uol-hero-banner__lead">' + esc(h.lead) + '</p>' : '') + '</div>' + (h.image ? '<img class="uol-hero-banner__img" src="' + attr(h.image) + '" alt="' + attr(h.alt || '') + '" loading="lazy">' : '') + '</div></section>';
    }
    if (h.type === 'slideshow') {
      var imgs = (h.slides || []).filter(function (s) { return s.image; });
      if (!imgs.length) return '';
      var dur = imgs.length * 8;
      return '<section aria-label="Slideshow of decorative images"><div id="bannerSlideshow" class="bannerSlideshow"><div class="slideshowImages">' + imgs.map(function (s, i) {
        return '<img class="image" alt="" style="background-image: url(' + attr(s.image) + '); animation-delay: ' + (i * 8) + 's; animation-duration: ' + dur + 's">';
      }).join('') + '</div></div><div class="bannerSlideshowControls"><div class="slideshowControlsInner"><button id="playButton" class="slideshowControl uol-button uol-icon uol-icon--mdiPlay uol-icon--icon-only uol-icon--icon-only--large" type="button">Play slideshow</button><button id="pauseButton" class="slideshowControl uol-button uol-icon uol-icon--mdiPause uol-icon--icon-only uol-icon--icon-only--large" type="button">Pause slideshow</button></div></div></section>';
    }
    return '';
  }

  /* ---------- page heading ---------- */
  function inPageNav(page) {
    var n = page.settings.inPageNav || {};
    var items = (n.items || []).filter(function (i) { return i.label; });
    if (!n.enabled || !items.length) return '';
    var list = '<ul>' + items.map(function (i) { return '<li><a href="' + href(i.href) + '"' + (i.current ? ' aria-current="page"' : '') + '>' + esc(i.label) + '</a></li>'; }).join('') + '</ul>';
    if (n.style === 'accordion') {
      return '<nav class="uol-in-page-navigation uol-in-page-navigation--with-accordion" aria-label="Contents"><div class="uol-accordion uol-rich-text"><h2 class="uol-accordion__title"> ' + esc(n.title || 'Contents') + ' </h2><div class="uol-accordion__content"><div class="uol-accordion__content-inner">' + list + '</div></div></div></nav>';
    }
    return '<nav class="uol-in-page-navigation " aria-label="Contents"><h2 class="uol-in-page-navigation__title">' + esc(n.title || 'Contents') + '</h2>' + list + '</nav>';
  }

  function pageHeading(page) {
    var h = page.settings.heading || {};
    var meta = '';
    var groups = [];
    if (h.category) groups.push('<div class="page-heading__meta__group"><dt class="page-heading__meta__term">Category</dt><dd class="page-heading__meta__data">' + (h.categoryHref ? '<a class="page-heading__meta__data__link" href="' + href(h.categoryHref) + '"> ' + esc(h.category) + ' </a>' : ' ' + esc(h.category) + ' ') + '</dd></div>');
    if (h.date) groups.push('<div class="page-heading__meta__group"><dt class="page-heading__meta__term">Date</dt><dd class="page-heading__meta__data"><time datetime="' + U.isoDate(h.date) + '"> ' + U.fmtDate(h.date) + ' </time></dd></div>');
    if (groups.length) meta = '<dl class="page-heading__meta">' + groups.join('') + '</dl>';
    return '<header class="page-heading"><h1 class="page-heading__title"><span class="page-heading__title__main">' + esc(h.title || page.title) + '</span>' + (h.subtitle ? '<span class="page-heading__title page-heading__title--subtitle">' + esc(h.subtitle) + '</span>' : '') + '</h1>' + meta + inPageNav(page) + '</header>';
  }

  function pageNav(page) {
    var n = page.settings.pageNav || {};
    if (!n.enabled || (!n.prevLabel && !n.nextLabel)) return '';
    return '<nav class="uol-page-nav" aria-label="Pagination">' + (n.prevLabel ? '<a href="' + href(n.prevHref) + '" class="uol-page-nav__item uol-page-nav__item--prev"><span class="uol-page-nav__item__identifier">Previous page</span><span class="uol-page-nav__item__title">' + esc(n.prevLabel) + '</span></a>' : '') + (n.nextLabel ? '<a href="' + href(n.nextHref) + '" class="uol-page-nav__item uol-page-nav__item--next"><span class="uol-page-nav__item__identifier">Next page</span><span class="uol-page-nav__item__title">' + esc(n.nextLabel) + '</span></a>' : '') + '</nav>';
  }

  /* ---------- editable text annotation (editor mode) ---------- */
  var SKIP_KEYS = /^(href|src|image|url|alt|icon|kind|type|style|level|align|size|theme|tag|media|videoUrl|citeHref|linkHref|buttonHref|sourceHref|citationHref|arrowLinkHref|baseHref|group|network|action|startDay|date|options)$/;
  function collectEditable(fields, obj, prefix, out) {
    (fields || []).forEach(function (f) {
      var v = obj ? obj[f.key] : undefined;
      if (f.type === 'list' && Array.isArray(v)) { v.forEach(function (item, i) { collectEditable(f.fields, item, prefix + f.key + '.' + i + '.', out); }); return; }
      if ((f.type === 'text' || f.type === 'textarea' || f.type === 'html') && typeof v === 'string' && v.trim() && !SKIP_KEYS.test(f.key)) {
        out.push({ path: prefix + f.key, value: v, kind: f.type === 'html' ? 'html' : 'text', multiline: f.type === 'textarea' });
      }
    });
  }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  /* Marks the element that displays each editable prop with data-uol-edit="<prop path>". Returns {html, whole} where
     whole is set when the entire block output is one editable html value (the wrapper then carries the attributes). */
  function annotate(block, html) {
    var spec = window.UOL_BLOCKS.registry[block.type];
    if (!spec || !html || html.length > 300000) return { html: html };
    var entries = [];
    collectEditable(spec.fields, Object.assign({}, spec.defaults || {}, block.props || {}), '', entries);
    if (!entries.length) return { html: html };
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    var all = Array.prototype.slice.call(tpl.content.querySelectorAll('*')).filter(function (el) {
      var t = el.tagName.toLowerCase();
      return t !== 'svg' && t !== 'path' && t !== 'script' && t !== 'style' && t !== 'img' && t !== 'input' && t !== 'select' && t !== 'option' && t !== 'textarea' && t !== 'iframe' && !el.closest('svg') && !el.classList.contains('hide-accessible');
    });
    var whole = null;
    entries.forEach(function (e) {
      var el = null;
      if (e.kind === 'html') {
        var targets = [norm(e.value), norm(rich(e.value))];
        el = all.filter(function (x) { return !x.hasAttribute('data-uol-edit') && targets.indexOf(norm(x.innerHTML)) !== -1; })[0] || null;
        if (!el && !whole && targets.indexOf(norm(tpl.innerHTML)) !== -1) { whole = e; return; }
      } else {
        var t = norm(e.value);
        var cands = all.filter(function (x) { return !x.hasAttribute('data-uol-edit') && norm(x.textContent) === t; });
        // deepest candidate: one that has no candidate descendants
        el = cands.filter(function (x) { return !cands.some(function (y) { return y !== x && x.contains(y); }); })[0] || null;
        if (!el && !whole && cands.length === 0 && norm(tpl.content.textContent) === t && tpl.content.children.length === 1) { whole = e; return; }
      }
      if (el) { el.setAttribute('data-uol-edit', e.path); el.setAttribute('data-uol-kind', e.kind); if (e.multiline) el.setAttribute('data-uol-ml', '1'); }
    });
    return { html: tpl.innerHTML, whole: whole };
  }

  /* ---------- blocks ---------- */
  /* Review copies only need to know which block is which. The block's own top-level elements carry its id, with no
     wrapper, so the page has the same structure as the live site: the design system lays out homepage blocks as
     flex items and spaces them with sibling rules (+, :first-of-type), which a wrapper element would break.
     A block whose HTML starts with bare text falls back to a wrapper. */
  function markBlock(block, html) {
    var tpl = document.createElement('template');
    tpl.innerHTML = html;
    var nodes = Array.prototype.slice.call(tpl.content.childNodes);
    var bare = nodes.some(function (n) { return n.nodeType === 3 && /\S/.test(n.textContent); });
    var els = nodes.filter(function (n) { return n.nodeType === 1; });
    if (bare || !els.length) return '<div class="uol-cms-block" data-block-id="' + attr(block.id) + '" data-block-type="' + attr(block.type) + '">' + html + '</div>';
    els.forEach(function (e) { e.setAttribute('data-block-id', block.id); e.setAttribute('data-block-type', block.type); });
    return tpl.innerHTML;
  }
  function blockWrap(block, html, ctx) {
    if (ctx && ctx.markBlocks && !ctx.editor) return markBlock(block, html);
    if (!(ctx && ctx.editor)) return html;
    var a = annotate(block, html);
    var extra = a.whole ? ' data-uol-edit="' + attr(a.whole.path) + '" data-uol-kind="' + a.whole.kind + '"' + (a.whole.multiline ? ' data-uol-ml="1"' : '') : '';
    var spec = window.UOL_BLOCKS.registry[block.type], label = spec ? String(spec.label).replace(/\s*\(widget\)$/i, '') : block.type;
    return '<div class="uol-cms-block" data-block-id="' + attr(block.id) + '" data-block-type="' + attr(block.type) + '" data-block-label="' + attr(label) + '"' + extra + '>' + a.html + '</div>';
  }

  function renderBlocks(blocks, page, ctx) {
    var out = '', group = [];
    if (ctx && ctx.editor && !(blocks || []).length) return EMPTY_STATE;
    var leadFirst = page.settings.leadParagraph !== false;
    var firstGroup = true;
    function flush() {
      if (!group.length) return;
      out += '<div class="' + cls('uol-rich-text', firstGroup && leadFirst && 'uol-rich-text--with-lead', 'uol-spacing') + '">' + group.join('') + '</div>';
      group = [];
      firstGroup = false;
    }
    (blocks || []).forEach(function (b) {
      var html = blockWrap(b, window.UOL_BLOCKS.render(b, ctx), ctx);
      if (window.UOL_BLOCKS.isInline(b)) { group.push(html); }
      else { flush(); out += html; }
    });
    flush();
    return out;
  }

  function renderHomepageBlocks(blocks, ctx) {
    var out = '', group = [];
    if (ctx && ctx.editor && !(blocks || []).length) return '<div class="uol-widget-container">' + EMPTY_STATE + '</div>';
    function flush() {
      if (!group.length) return;
      out += '<div class="uol-widget-container uol-widget-container__content"><div class="uol-widget uol-widget--content "><div class="uol-widget__content "><div class="uol-rich-text uol-spacing">' + group.join('') + '</div></div></div></div>';
      group = [];
    }
    (blocks || []).forEach(function (b) {
      var html = blockWrap(b, window.UOL_BLOCKS.render(b, ctx), ctx);
      if (window.UOL_BLOCKS.isInline(b)) { group.push(html); }
      else { flush(); out += html; }
    });
    flush();
    return out;
  }

  /* ---------- templates ---------- */
  function sideColumn(page) {
    return '<div class="uol-side-nav-container">' + relatedContent(page) + sectionCtas(page) + '</div>';
  }

  function templateHomepage(site, page, ctx) {
    var h1 = page.settings.hiddenTitle || (page.title + ' home page');
    var showH1 = !(page.hero && page.hero.type === 'hero' && page.hero.useH1);
    return hero(page) + '<div class="uol-content-container uol-main-container uol-main--">' + breadcrumb(page) + '<div class="uol-homepage-content-container">' + sideColumn(page) + '<main id="main" tabindex="-1" class="uol-homepage-content uol-homepage-content__">' + (showH1 ? '<h1 class="hide-accessible">' + esc(h1) + '</h1>' : '') + renderHomepageBlocks(page.blocks, ctx) + '</main></div></div>';
  }

  function templateDocument(site, page, ctx) {
    return hero(page) + '<div class="uol-content-container uol-main-container">' + breadcrumb(page) + '<div class="uol-col-container uol-page-container">' + sideColumn(page) + '<main id="main" tabindex="-1" class="uol-page ">' + (page.settings.heading && page.settings.heading.hide ? '' : '<div class="uol-page__head">' + pageHeading(page) + '</div>') + '<div class="uol-page__content">' + renderBlocks(page.blocks, page, ctx) + '</div>' + pageNav(page) + '</main></div></div>';
  }

  function templateArticle(site, page, ctx) {
    var kind = (page.settings.articleKind || 'news');
    var fi = page.settings.featuredImage || {};
    var figure = fi.src ? '<figure class="uol-featured-image"><img class="uol-featured-image__img" src="' + attr(fi.src) + '" alt="' + attr(fi.alt || '') + '">' + (fi.caption ? '<figcaption class="uol-featured-image__caption"> ' + esc(fi.caption) + ' </figcaption>' : '') + '</figure>' : '';
    return hero(page) + '<div class="uol-content-container uol-main-container">' + breadcrumb(page) + '<div class="uol-article-container uol-col-container">' + sideColumn(page) + '<main id="main" tabindex="-1" class="uol-article uol-article--' + attr(kind) + '"><div class="uol-article__head"><div class="uol-article__no-profile-image">' + pageHeading(page) + '</div></div><div class="uol-article__content">' + figure + renderBlocks(page.blocks, page, ctx) + '</div>' + pageNav(page) + '</main></div></div>';
  }

  /* ---------- footer ---------- */
  function footer(site) {
    var f = site.footer || {};
    var groups = (f.navGroups || []).filter(function (g) { return g.title; });
    var navHtml = groups.length ? '<div class="uol-site-footer__nav-container"><nav class="uol-site-footer__nav-outer" aria-labelledby="footer-nav-title"><h2 class="uol-site-footer__title" id="footer-nav-title">Footer navigation</h2>' + groups.map(function (g) {
      return '<div class="uol-site-footer__nav"><nav class="nav-list-group" aria-label="' + attr(g.title) + '"><h3 class="nav-list-group__title">' + esc(g.title) + '</h3><ul class="nav-list-group__list">' + (g.links || []).map(function (l) { return '<li class="nav-list-group__item"><a href="' + href(l.href) + '" class="nav-list-group__link" >' + esc(l.label) + '</a></li>'; }).join('') + '</ul></nav></div>';
    }).join('') + '</nav></div>' : '';

    var c = f.contact || {};
    var addr = '';
    if (c.name || c.street) {
      var tel = [];
      if (c.phone) tel.push('<dt class="uol-footer-contact__telephone-email-label">Telephone</dt><dd class="uol-footer-contact__telephone-email-data"><a class="uol-footer-contact__telephone" href="tel:' + attr(String(c.phone).replace(/[^\d+]/g, '')) + '" property="telephone">' + esc(c.phone) + '</a></dd>');
      if (c.email) tel.push('<dt class="uol-footer-contact__telephone-email-label">Email</dt><dd class="uol-footer-contact__telephone-email-data"><a class="uol-footer-contact__email" href="mailto:' + attr(c.email) + '" property="email">' + esc(c.email) + '</a></dd>');
      addr = '<h2 class="uol-footer-contact__title">' + esc(c.title || 'Contact information') + '</h2><address class="uol-footer-contact" vocab="https://schema.org/" typeof="Organization"><strong class="uol-footer-contact__name" property="name">' + esc(c.name) + '</strong><div class="uol-footer-contact__address" property="address" typeof="PostalAddress">' + (c.street ? '<div property="streetAddress"><span class="uol-footer-contact__address__item" >' + esc(c.street) + '</span></div>' : '') + (c.locality ? '<span class="uol-footer-contact__address__item" property="addressLocality">' + esc(c.locality) + '</span>' : '') + (c.region ? '<span class="uol-footer-contact__address__item" property="addressRegion">' + esc(c.region) + '</span>' : '') + (c.postcode ? '<span class="uol-footer-contact__address__item" property="postalCode">' + esc(c.postcode) + '</span>' : '') + (c.country ? '<span class="uol-footer-contact__address__item" property="addressCountry">' + esc(c.country) + '</span>' : '') + '</div>' + (tel.length ? '<dl class="uol-footer-contact__telephone-email-container">' + tel.join('') + '</dl>' : '') + '</address>';
    }
    var social = (f.social || []).filter(function (s) { return s.href; });
    var socialHtml = social.length ? '<div class="uol-footer-social-media">' + social.map(function (s) {
      var key = String(s.network || '').toLowerCase().replace(/[^a-z]/g, '');
      var label = s.label || (key.charAt(0).toUpperCase() + key.slice(1));
      return '<a class="uol-footer-social-media__item" href="' + attr(s.href) + '" aria-label="' + attr(label) + '">' + (svg(key) || '<span>' + esc(label) + '</span>') + '</a>';
    }).join('') + '</div>' : '';

    var accr = (f.accreditations || []).filter(function (a) { return a.src; });
    var accrHtml = accr.length ? '<div class="uol-site-footer__accreditations">' + C.accreditations(accr) + '</div>' : '';

    var info = f.siteInfo || {};
    var infoHtml = '<div class="uol-site-footer__site-information-container"><nav class="footer-site-information" aria-label="Site information"><h2 class="hide-accessible">Site information</h2><ul class="footer-site-information__list"><li class="footer-site-information__item">' + esc(info.copyright || ('© ' + new Date().getFullYear() + ' University of Leeds')) + '</li>' + (info.links || []).map(function (l) { return '<li class="footer-site-information__item"><a class="footer-site-information__link" href="' + href(l.href) + '">' + esc(l.label) + '</a></li>'; }).join('') + '</ul></nav></div>';

    var sup = f.supplement || {};
    var supHtml = sup.enabled && sup.label ? '<a href="' + href(sup.href) + '" class="footer-supplement"><span class="footer-supplement__icon uol-icon uol-icon--icon-only uol-icon--' + attr(sup.icon || 'mdiPhoneOutline') + '"></span> ' + esc(sup.label) + '</a>' : '';

    return supHtml + '<footer class="uol-site-footer-outer"><div class="uol-site-footer uol-content-container">' + navHtml + '<div class="uol-site-footer__address-container ">' + addr + socialHtml + '</div>' + accrHtml + infoHtml + '<div class="uol-site-footer__logo-outer"><a href="' + attr(site.homeUrl || 'https://leeds.ac.uk') + '" class="uol-site-footer__logo" aria-label="University of Leeds">' + svg('logoPrimary') + '</a></div></div></footer>';
  }

  /* ---------- sections: navigation generated from the pages in a section ---------- */
  function sectionOf(page, sections) {
    return (sections || []).filter(function (s) { return (s.pages || []).indexOf(page.id) !== -1; })[0] || null;
  }
  function effectivePage(page, ctx) {
    var sec = sectionOf(page, ctx.sections);
    if (!sec || page.settings.autoNav === false) return page;
    var byId = {};
    (ctx.pages || []).forEach(function (p) { byId[p.id] = p; });
    var list = (sec.pages || []).map(function (id) { return byId[id]; }).filter(Boolean);
    var idx = -1;
    list.forEach(function (p, i) { if (p.id === page.id) idx = i; });
    var items = list.map(function (p) { return { label: p.title, href: '/' + p.slug, current: p.id === page.id }; });
    var s = JSON.parse(JSON.stringify(page.settings || {}));
    var style = sec.navStyle || 'side';
    if (style === 'side' || style === 'both') s.sectionNav = { enabled: true, intro: sec.intro || 'In this section', title: sec.title || '', items: items };
    if (style === 'contents' || style === 'both') s.inPageNav = { enabled: true, style: list.length > 6 ? 'accordion' : 'list', title: sec.contentsTitle || 'Contents', items: items };
    if (sec.pageNav !== false && page.template !== 'homepage') {
      var prev = idx > 0 ? list[idx - 1] : null, next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
      s.pageNav = { enabled: !!(prev || next), prevLabel: prev ? prev.title : '', prevHref: prev ? '/' + prev.slug : '', nextLabel: next ? next.title : '', nextHref: next ? '/' + next.slug : '' };
    }
    if (!(s.breadcrumb || []).length && sec.breadcrumb && sec.breadcrumb.length) s.breadcrumb = sec.breadcrumb;
    return Object.assign({}, page, { settings: s });
  }

  /* ---------- whole page ---------- */
  function renderBody(site, page, ctx) {
    ctx = ctx || {};
    page = effectivePage(page, ctx);
    var tpl = page.template === 'homepage' ? templateHomepage : page.template === 'article' ? templateArticle : templateDocument;
    var sectionNavHtml = page.template === 'homepage' && page.hero && page.hero.type === 'banner' ? '' : sectionNav(page);
    var body = '<div class="site-outer">' + header(site, page) + globalBanner(site) + marketingBanner(site) + sectionNavHtml;
    if (page.template === 'homepage' && page.hero && page.hero.type === 'banner') body += sectionNav(page);
    body += tpl(site, page, ctx) + footer(site) + '</div>';
    return media(body);
  }

  function linkScript(pages, mode) {
    var slugs = {};
    (pages || []).forEach(function (p) { slugs['/' + String(p.slug).replace(/^\/+|\/+$/g, '')] = p.slug; });
    var home = (pages || []).filter(function (p) { return p.template === 'homepage'; })[0] || (pages || []).filter(function (p) { return /^(home|index)$/.test(p.slug); })[0] || (pages || [])[0];
    if (home) slugs['/'] = home.slug;
    return '<script>(function(){var S=' + JSON.stringify(slugs) + ';var mode=' + JSON.stringify(mode || 'view') + ';' +
      'function norm(h){if(!h)return null;h=h.replace(/[?#].*$/,"");if(!h||/^(https?:|mailto:|tel:|javascript:)/i.test(h)||/^\\/\\//.test(h))return null;if(h.charAt(0)!=="/")h="/"+h;h=h.replace(/\\/+$/,"")||"/";if(S.hasOwnProperty(h))return S[h];var k=Object.keys(S).filter(function(x){return x!=="/"&&h.toLowerCase()===x.toLowerCase()})[0];return k?S[k]:"!"+h;}' +
      'document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;' +
      // in the editor, links only navigate with Ctrl/Cmd+click so that clicking selects and double-clicking edits
      'if(mode==="editor"&&!(e.ctrlKey||e.metaKey)){e.preventDefault();return;}' +
      'var slug=norm(a.getAttribute("href"));if(slug===null)return;' +
      'if(slug.charAt(0)==="!"){if(mode==="export")return;e.preventDefault();if(window.parent&&window.parent!==window)window.parent.postMessage({uolcms:"navigate",slug:slug.slice(2)},"*");return;}' +
      'e.preventDefault();' +
      'if(mode==="export"){location.href=slug+".html";return;}' +
      'if(window.parent&&window.parent!==window){window.parent.postMessage({uolcms:"navigate",slug:slug},"*");}else{location.hash="#/"+slug;}},true);' +
      '})();</script>';
  }

  function editorScript() {
    return '<script>(function(){var cur=null,editing=null,dragging=null,dropTarget=null;' +
      'function send(m){if(window.parent&&window.parent!==window)window.parent.postMessage(m,"*");}' +
      'function q(sel){return document.querySelector(sel);}' +
      'function blk(id){return q(\'.uol-cms-block[data-block-id="\'+id+\'"]\');}' +
      /* toolbar */
      'var bar=document.createElement("div");bar.className="uol-cms-bar";bar.setAttribute("contenteditable","false");' +
      'bar.innerHTML=' + JSON.stringify(BAR_HTML) + ';' +
      'bar.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;e.preventDefault();e.stopPropagation();if(cur)send({uolcms:"blockAction",id:cur.getAttribute("data-block-id"),action:b.getAttribute("data-a")});},true);' +
      'bar.addEventListener("mousedown",function(e){if(!e.target.closest(".uol-cms-bar__grip"))e.preventDefault();});' +
      'function attachBar(el){bar.querySelector(".uol-cms-bar__type").textContent=el.getAttribute("data-block-label")||el.getAttribute("data-block-type");el.appendChild(bar);}' +
      'function select(el,scroll){if(cur&&cur!==el){cur.classList.remove("uol-cms-block--selected");}cur=el;if(cur){cur.classList.add("uol-cms-block--selected");attachBar(cur);if(scroll)cur.scrollIntoView({behavior:"smooth",block:"nearest"});}else if(bar.parentNode)bar.parentNode.removeChild(bar);}' +
      /* selection */
      'document.addEventListener("click",function(e){if(editing&&editing.contains(e.target)){e.preventDefault();e.stopPropagation();return;}if(e.target.closest(".uol-cms-bar"))return;var b=e.target.closest&&e.target.closest(".uol-cms-block");if(b){send({uolcms:"select",id:b.getAttribute("data-block-id")});}},true);' +
      /* inline editing */
      'function startEdit(t){if(editing===t)return;if(editing)commit();editing=t;t.setAttribute("contenteditable","true");t.classList.add("uol-cms-editing");t.focus();if(t.getAttribute("data-uol-kind")==="text"){var r=document.createRange();r.selectNodeContents(t);var s=getSelection();s.removeAllRanges();s.addRange(r);}}' +
      'function valueOf(t){var kind=t.getAttribute("data-uol-kind");if(kind==="html"){var c=t.cloneNode(true);var bb=c.querySelector(".uol-cms-bar");if(bb)bb.remove();return c.innerHTML;}return t.textContent;}' +
      'var liveTimer=null;function live(){if(!editing)return;var t=editing;var block=t.closest(".uol-cms-block");if(!block)return;send({uolcms:"inlineInput",id:block.getAttribute("data-block-id"),path:t.getAttribute("data-uol-edit"),kind:t.getAttribute("data-uol-kind"),value:valueOf(t)});}' +
      'document.addEventListener("input",function(e){if(editing&&editing.contains(e.target)){clearTimeout(liveTimer);liveTimer=setTimeout(live,250);}},true);' +
      'function commit(cancel){if(!editing)return;clearTimeout(liveTimer);var t=editing;editing=null;t.removeAttribute("contenteditable");t.classList.remove("uol-cms-editing");var block=t.closest(".uol-cms-block");var id=block?block.getAttribute("data-block-id"):null;if(cancel){if(id)send({uolcms:"inlineCancel",id:id});return;}var kind=t.getAttribute("data-uol-kind");if(id)send({uolcms:"inline",id:id,path:t.getAttribute("data-uol-edit"),kind:kind,value:valueOf(t)});}' +
      'document.addEventListener("mousedown",function(e){if(editing&&!editing.contains(e.target)&&!e.target.closest(".uol-cms-bar"))commit();},true);' +
      'window.addEventListener("blur",function(){if(editing)commit();});' +
      'document.addEventListener("dblclick",function(e){var t=e.target.closest&&e.target.closest("[data-uol-edit]");if(!t||e.target.closest(".uol-cms-bar"))return;e.preventDefault();e.stopPropagation();var b=t.closest(".uol-cms-block");if(b&&b!==cur)send({uolcms:"select",id:b.getAttribute("data-block-id")});startEdit(t);},true);' +
      /* shortcuts pressed while the preview has focus go to the editor */
      'document.addEventListener("keydown",function(e){if(editing)return;if(e.key==="/"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();send({uolcms:"shortcut",key:"/"});}else if((e.ctrlKey||e.metaKey)&&(e.key==="z"||e.key==="y"||e.key==="Z"||e.key==="Y")){e.preventDefault();send({uolcms:"shortcut",key:e.key.toLowerCase(),shift:e.shiftKey});}else if(e.key==="Escape"&&cur){send({uolcms:"shortcut",key:"Escape"});}},true);' +
      'document.addEventListener("keydown",function(e){if(!editing)return;if(e.key==="Escape"){e.preventDefault();e.stopPropagation();commit(true);}else if(e.key==="Enter"&&editing.getAttribute("data-uol-kind")==="text"&&!editing.hasAttribute("data-uol-ml")){e.preventDefault();commit();}},true);' +
      'document.addEventListener("focusout",function(e){if(editing&&e.target===editing){var t=editing;setTimeout(function(){if(editing===t)commit();},0);}},true);' +
      /* drag and drop */
      'bar.addEventListener("dragstart",function(e){if(!cur)return;dragging=cur.getAttribute("data-block-id");e.dataTransfer.setData("text/plain",dragging);e.dataTransfer.effectAllowed="move";document.body.classList.add("uol-cms-dragging");});' +
      'function clearDrop(){var d=document.querySelectorAll(".uol-cms-drop-before,.uol-cms-drop-after");for(var i=0;i<d.length;i++)d[i].classList.remove("uol-cms-drop-before","uol-cms-drop-after");}' +
      'document.addEventListener("dragover",function(e){if(!dragging)return;var b=e.target.closest&&e.target.closest(".uol-cms-block");if(!b)return;e.preventDefault();e.dataTransfer.dropEffect="move";var r=b.getBoundingClientRect();var before=(e.clientY-r.top)<r.height/2;clearDrop();b.classList.add(before?"uol-cms-drop-before":"uol-cms-drop-after");dropTarget={id:b.getAttribute("data-block-id"),before:before};},true);' +
      'function endDrag(){if(dragging&&dropTarget&&dropTarget.id!==dragging)send({uolcms:"move",id:dragging,targetId:dropTarget.id,before:dropTarget.before});dragging=null;dropTarget=null;clearDrop();document.body.classList.remove("uol-cms-dragging");}' +
      'document.addEventListener("drop",function(e){if(!dragging)return;e.preventDefault();endDrag();},true);' +
      'document.addEventListener("dragend",function(){dragging=null;dropTarget=null;clearDrop();document.body.classList.remove("uol-cms-dragging");},true);' +
      /* the "+" line between blocks: hover the top of a block to insert above it, anywhere else to insert below */
      'var ins=document.createElement("div");ins.className="uol-cms-insert";ins.setAttribute("contenteditable","false");ins.innerHTML=\'<button type="button" class="uol-cms-insert__btn" title="Add a block here">+</button>\';var insTarget=null,insHide=null;' +
      'function placeInsert(b,before){var r=b.getBoundingClientRect();ins.style.top=((before?r.top:r.bottom)+window.scrollY-1)+"px";ins.style.left=(r.left+window.scrollX)+"px";ins.style.width=r.width+"px";insTarget={id:b.getAttribute("data-block-id"),before:before};if(!ins.parentNode)document.body.appendChild(ins);ins.classList.add("is-on");ins.querySelector("button").title=before?"Add a block above":"Add a block below";clearTimeout(insHide);}' +
      'function hideInsert(){ins.classList.remove("is-on");insTarget=null;}' +
      'document.addEventListener("mousemove",function(e){if(dragging||editing)return;if(e.target.closest&&e.target.closest(".uol-cms-insert,.uol-cms-bar"))return;var b=e.target.closest&&e.target.closest(".uol-cms-block");if(!b){clearTimeout(insHide);insHide=setTimeout(hideInsert,500);return;}var r=b.getBoundingClientRect();var before=(e.clientY-r.top)<Math.min(28,r.height/3);placeInsert(b,before);},{passive:true});' +
      'document.addEventListener("mouseleave",function(){hideInsert();});' +
      'ins.addEventListener("mousedown",function(e){e.preventDefault();e.stopPropagation();});' +
      'ins.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();if(insTarget)send({uolcms:"blockAction",id:insTarget.id,action:insTarget.before?"addBefore":"add"});hideInsert();},true);' +
      'document.addEventListener("click",function(e){var eb=e.target.closest&&e.target.closest(".uol-cms-empty__btn");if(eb){e.preventDefault();e.stopPropagation();send({uolcms:"blockAction",id:null,action:"addFirst"});}},true);' +
      /* messages from the editor */
      'window.addEventListener("message",function(e){var d=e.data||{};' +
      'if(d.uolcms==="highlight"){select(d.id?blk(d.id):null,d.scroll);}' +
      'if(d.uolcms==="patch"){var el=blk(d.id);if(el){if(editing&&el.contains(editing))editing=null;var t=document.createElement("div");t.innerHTML=d.html;var n=t.firstElementChild;if(n){el.replaceWith(n);if(cur&&d.id===cur.getAttribute("data-block-id")){cur=n;n.classList.add("uol-cms-block--selected");attachBar(n);}}}}' +
      'if(d.uolcms==="theme"){var s=document.getElementById("uol-theme");if(s)s.textContent=d.css;}' +
      'if(d.uolcms==="scrollTo"){window.scrollTo(0,d.y||0);}' +
      'if(d.uolcms==="commitInline"){if(editing)commit();}' +
      '});' +
      'window.addEventListener("scroll",function(){send({uolcms:"scroll",y:window.scrollY});},{passive:true});' +
      /* the design-system script moves side-column items on resize; if an identical copy ever appears twice, keep one */
      'function dedupe(){[".uol-section-nav-ctas",".uol-section-nav-related-content",".uol-section-nav"].forEach(function(s){var seen={};document.querySelectorAll(s).forEach(function(n){var k=n.innerHTML.replace(/\\s+/g," ");if(seen[k])n.remove();else seen[k]=1;});});}' +
      'dedupe();window.addEventListener("resize",function(){setTimeout(dedupe,0);});' +
      'send({uolcms:"ready"});})();</script>';
  }

  // on homepages the blocks are flex items that each take a full row; the editor's wrapper has to do the same
  var EDITOR_CSS = '.uol-homepage-content>.uol-cms-block{flex:0 0 100%;max-width:100%;min-width:0}' +
    '.uol-cms-block{position:relative;outline:2px solid transparent;outline-offset:-2px;transition:outline-color .15s}.uol-cms-block:hover{outline:1px dashed rgba(199,0,0,.45);outline-offset:-1px}.uol-cms-block--selected,.uol-cms-block--selected:hover{outline:2px solid #c70000!important;outline-offset:-2px}' +
    /* the block toolbar: a white bar on the top edge of the selected block, styled like the CMS around the preview */
    '.uol-cms-bar{position:absolute;top:0;right:10px;transform:translateY(-50%);z-index:30;display:flex;align-items:center;gap:2px;padding:3px;background:#fff;color:#212529;border:1px solid #d9d6d2;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.16);font:600 12.5px/1 "Segoe UI",system-ui,-apple-system,Arial,sans-serif;max-width:calc(100% - 20px);user-select:none;white-space:nowrap}' +
    '.uol-cms-bar button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;min-width:28px;border-radius:6px;color:#444;cursor:pointer}.uol-cms-bar button:hover{background:#f3f2f1;color:#111}.uol-cms-bar button:focus-visible{outline:2px solid #197ebe;outline-offset:1px}' +
    '.uol-cms-bar svg{width:16px;height:16px;flex:none}.uol-cms-bar__grip{display:inline-flex;align-items:center;justify-content:center;width:22px;height:28px;color:#8a8580;cursor:grab;border-radius:6px}.uol-cms-bar__grip:hover{background:#f3f2f1;color:#212529}.uol-cms-bar__grip:active{cursor:grabbing}' +
    '.uol-cms-bar__type{padding:0 10px 0 2px;margin-right:2px;border-right:1px solid #ebe8e5;line-height:28px;font-weight:700;overflow:hidden;text-overflow:ellipsis;max-width:200px;cursor:default}' +
    '.uol-cms-bar button.uol-cms-bar__del:hover{background:#fde8ea;color:#c70000}.uol-cms-bar button.uol-cms-bar__add{margin-left:4px;padding:0 10px 0 8px;background:#c70000;color:#fff}.uol-cms-bar button.uol-cms-bar__add:hover{background:#910000;color:#fff}' +
    '[data-uol-edit]{cursor:text}.uol-cms-block--selected [data-uol-edit]:hover{box-shadow:inset 0 0 0 1px rgba(25,126,190,.6);border-radius:2px}' +
    '.uol-cms-editing{outline:2px solid #197ebe!important;outline-offset:2px;background:rgba(25,126,190,.06)!important;cursor:text}' +
    '.uol-cms-drop-before{box-shadow:inset 0 6px 0 #c70000!important}.uol-cms-drop-after{box-shadow:inset 0 -6px 0 #c70000!important}body.uol-cms-dragging .uol-cms-block{outline-color:rgba(199,0,0,.25)}' +
    '.uol-cms-insert{position:absolute;z-index:35;height:0;display:none;pointer-events:none}.uol-cms-insert.is-on{display:block}.uol-cms-insert::before{content:"";position:absolute;left:0;right:0;top:0;border-top:2px dashed rgba(199,0,0,.55)}' +
    '.uol-cms-insert__btn{all:unset;pointer-events:auto;position:absolute;left:50%;top:0;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;background:#c70000;color:#fff;font:700 18px/26px Arial,sans-serif;text-align:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}.uol-cms-insert__btn:hover{background:#910000}' +
    '.uol-cms-empty{margin:2rem 0;padding:2.5rem 1rem;border:2px dashed #c9c5c0;border-radius:8px;text-align:center;font-family:"Segoe UI",system-ui,Arial,sans-serif;color:#636363}.uol-cms-empty p{margin:0 0 .5rem}.uol-cms-empty__btn{all:unset;cursor:pointer;display:inline-block;margin-top:.25rem;padding:10px 18px;border-radius:6px;background:#c70000;color:#fff;font-weight:700}.uol-cms-empty__btn:hover{background:#910000}' +
    '@media (max-width:600px){.uol-cms-bar__type{display:none}.uol-cms-bar button.uol-cms-bar__add span{display:none}}';
  /* the toolbar's buttons: outline icons on one grid, like the CMS's own */
  function barIcon(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
  var BAR_HTML = '<span class="uol-cms-bar__grip" draggable="true" title="Drag to move this block">' + barIcon('<circle cx="9" cy="6" r=".6"/><circle cx="15" cy="6" r=".6"/><circle cx="9" cy="12" r=".6"/><circle cx="15" cy="12" r=".6"/><circle cx="9" cy="18" r=".6"/><circle cx="15" cy="18" r=".6"/>') + '</span>' +
    '<span class="uol-cms-bar__type" title="Double-click text to edit it here. Ctrl+click follows a link."></span>' +
    '<button type="button" data-a="up" title="Move up" aria-label="Move up">' + barIcon('<path d="M12 19V5M6 11l6-6 6 6"/>') + '</button>' +
    '<button type="button" data-a="down" title="Move down" aria-label="Move down">' + barIcon('<path d="M12 5v14M6 13l6 6 6-6"/>') + '</button>' +
    '<button type="button" data-a="dup" title="Duplicate" aria-label="Duplicate">' + barIcon('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>') + '</button>' +
    '<button type="button" data-a="del" class="uol-cms-bar__del" title="Delete" aria-label="Delete">' + barIcon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>') + '</button>' +
    '<button type="button" data-a="add" class="uol-cms-bar__add" title="Add a block below this one">' + barIcon('<path d="M12 5v14M5 12h14"/>') + '<span>Add below</span></button>';
  var EMPTY_STATE = '<div class="uol-cms-empty"><p>This page has no blocks yet.</p><button type="button" class="uol-cms-empty__btn">+ Add your first block</button></div>';

  function renderDocument(site, page, opts) {
    opts = opts || {};
    var base = opts.assetBase || '';
    var theme = site.theme || {};
    var fontLink = theme.loadTypekit === false ? '' : '<link rel="stylesheet" href="https://use.typekit.net/xpd0xwa.css">';
    var css, js;
    if (opts.inline) {
      css = '<style>' + (window.UOL_INLINE_CSS || '') + '</style>';
      js = '<script>' + (window.UOL_INLINE_JS || '') + '</script>';
    } else {
      css = '<link rel="stylesheet" href="' + base + 'assets/ds/css/style.css">';
      js = '<script src="' + base + 'assets/ds/scripts/modernizr-custom.js"></script><script src="' + base + 'assets/ds/scripts/bundle.js"></script>';
    }
    var editorBits = opts.editor ? '<style>' + EDITOR_CSS + '</style>' : '';
    var ctx = { editor: !!opts.editor, markBlocks: !!opts.markBlocks, pages: opts.pages || [], sections: opts.sections || [] };
    var body = opts.bodyOverride || renderBody(site, page, ctx);
    var title = (page.settings && page.settings.heading && page.settings.heading.title) || page.title || 'Page';
    var linkMode = opts.linkMode || (opts.editor ? 'editor' : 'view');
    return '<!DOCTYPE html><html lang="en" class="no-js"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title) + ' | ' + esc(site.name || 'University of Leeds') + '</title>' + fontLink + css + '<style id="uol-theme">' + themeCss(theme) + '</style>' + editorBits + '</head><body class="' + attr(opts.bodyClass || '') + '">' + body + js + (opts.noLinks ? '' : linkScript(opts.pages || [], linkMode)) + (opts.editor || opts.live ? editorScript() : '') + '</body></html>';
  }

  /* Render a single block (or a selection of blocks) as a standalone document, for section export and the component library. */
  function renderFragmentDocument(site, blocks, opts) {
    opts = opts || {};
    var fake = { id: 'frag', title: opts.title || 'Section', template: opts.template || 'document', settings: { leadParagraph: false }, hero: { type: 'none' }, blocks: blocks };
    var ctx = { editor: !!opts.editor };
    var inner = fake.template === 'homepage' ? renderHomepageBlocks(blocks, ctx) : renderBlocks(blocks, fake, ctx);
    var body;
    if (opts.bare) {
      body = '<div class="site-outer"><div class="uol-content-container uol-main-container" style="padding-top:1rem;padding-bottom:1rem"><main id="main" class="' + (fake.template === 'homepage' ? 'uol-homepage-content' : 'uol-page') + '">' + inner + '</main></div></div>';
    } else {
      body = '<div class="site-outer">' + header(site, fake) + '<div class="uol-content-container uol-main-container"><div class="' + (fake.template === 'homepage' ? 'uol-homepage-content-container' : 'uol-col-container uol-page-container') + '"><div class="uol-side-nav-container"></div><main id="main" class="' + (fake.template === 'homepage' ? 'uol-homepage-content' : 'uol-page') + '">' + (fake.template === 'homepage' ? inner : '<div class="uol-page__content">' + inner + '</div>') + '</main></div></div>' + footer(site) + '</div>';
    }
    return renderDocument(site, fake, Object.assign({}, opts, { bodyOverride: media(body), noLinks: true }));
  }

  window.UOL_RENDER = {
    themeCss: themeCss,
    renderBody: renderBody,
    renderDocument: renderDocument,
    renderFragmentDocument: renderFragmentDocument,
    /* one block, wrapped and annotated for the editor preview */
    renderBlock: function (block) {
      return media(blockWrap(block, window.UOL_BLOCKS.render(block, { editor: true }), { editor: true }));
    },
    /* one block's plain design-system markup */
    blockMarkup: function (block) { return media(window.UOL_BLOCKS.render(block, {})); },
    effectivePage: effectivePage,
    sectionOf: sectionOf,
    parts: { header: header, footer: footer, hero: hero, sectionNav: sectionNav, pageHeading: pageHeading, breadcrumb: breadcrumb }
  };
})();
