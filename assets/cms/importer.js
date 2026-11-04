/* Leeds prototyping CMS - importer
   Turns existing design-system HTML (a whole leeds.ac.uk page, or a pasted section) into editable site settings,
   page settings and blocks. Anything it does not recognise is kept as a Raw HTML block so nothing is lost. */
(function () {
  'use strict';

  function uid(p) { return (p || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function q(el, sel) { return el ? el.querySelector(sel) : null; }
  function qa(el, sel) { return el ? Array.prototype.slice.call(el.querySelectorAll(sel)) : []; }
  function inner(el) { return el ? el.innerHTML.trim() : ''; }
  function hasClass(el, c) { return !!(el && el.classList && el.classList.contains(c)); }
  function block(type, props) { return { id: uid('blk'), type: type, props: Object.assign(window.UOL_BLOCKS.defaultsFor(type), props || {}) }; }
  function bgUrl(el) {
    var s = el && el.getAttribute('style') || '';
    var m = s.match(/url\(['"]?([^'")]+)['"]?\)/);
    return m ? m[1] : '';
  }

  var state = { base: '', warnings: [] };

  function abs(url) {
    if (!url) return '';
    url = String(url).trim();
    if (/^(data:|https?:|mailto:|tel:|#|javascript:)/i.test(url)) return url;
    if (!state.base) return url;
    try { return new URL(url, state.base).href; } catch (e) { return url; }
  }
  function linkHref(a) {
    var h = a ? a.getAttribute('href') : '';
    if (!h) return '';
    if (/^(https?:)?\/\//i.test(h) || /^(mailto:|tel:|#)/i.test(h)) return h;
    // keep site-relative paths relative so they can map onto CMS pages, but make them absolute if base is a different site
    if (state.base) {
      try {
        var u = new URL(h, state.base);
        var b = new URL(state.base);
        return u.host === b.host ? u.pathname + u.search + u.hash : u.href;
      } catch (e) { return h; }
    }
    return h;
  }
  function imgSrc(img) {
    if (!img) return '';
    var s = img.getAttribute('data-src-high-quality') || img.getAttribute('src') || img.getAttribute('data-src') || '';
    if (!s && img.getAttribute('srcset')) s = img.getAttribute('srcset').split(',')[0].trim().split(/\s+/)[0];
    return abs(s);
  }
  function absolutiseHtml(html) {
    if (!state.base) return html;
    var d = document.createElement('div');
    d.innerHTML = html;
    qa(d, 'img[src]').forEach(function (i) { i.setAttribute('src', imgSrc(i)); i.removeAttribute('srcset'); });
    qa(d, 'a[href]').forEach(function (a) { a.setAttribute('href', linkHref(a)); });
    qa(d, 'script, style, noscript').forEach(function (n) { n.remove(); });
    return d.innerHTML;
  }
  function cleanRich(el) {
    var d = el.cloneNode(true);
    qa(d, 'script, style, noscript').forEach(function (n) { n.remove(); });
    return absolutiseHtml(d.innerHTML).trim();
  }

  /* ---------- site chrome ---------- */
  function parseNavigation(doc) {
    var nav = q(doc, '.uol-header-local-navigation');
    if (!nav) return null;
    var items = [];
    qa(nav, ':scope > .uol-header-local-navigation__item').forEach(function (li) {
      var label = li.getAttribute('data-label') || txt(q(li, ':scope > a')) || txt(li).split('\n')[0];
      var sub = q(li, '.uol-header-local-navigation__sub-nav');
      if (sub) {
        var children = qa(sub, '.uol-header-local-navigation__item').map(function (c) {
          var a = q(c, 'a');
          return { label: txt(a), href: linkHref(a), cta: hasClass(c, 'uol-header-local-navigation__item--cta') };
        });
        items.push({ label: label.replace(/\s+/g, ' ').trim(), href: '', children: children });
      } else {
        var a = q(li, 'a');
        items.push({ label: txt(a) || label, href: linkHref(a) });
      }
    });
    return { enabled: items.length > 0, items: items };
  }

  function parseQuicklinks(doc) {
    var ql = q(doc, '.uol-quicklinks');
    if (!ql) return null;
    return qa(ql, '.uol-quicklinks__group').map(function (g) {
      var label = '';
      for (var i = 0; i < g.childNodes.length; i++) if (g.childNodes[i].nodeType === 3) label += g.childNodes[i].textContent;
      if (!label.trim()) label = txt(q(g, 'button, .uol-quicklinks__button, span'));
      return { label: label.replace(/\s+/g, ' ').trim(), links: qa(g, '.uol-quicklinks__group__link').map(function (a) { return { label: txt(a), href: linkHref(a) }; }) };
    });
  }

  function parseLocalMasthead(doc) {
    var lm = q(doc, '.uol-header-local-masthead');
    if (!lm) return null;
    var parent = q(lm, '.uol-header-local-masthead__link--parent-site');
    var title = q(lm, '.uol-header-local-masthead__link--title');
    return { enabled: true, parentTitle: txt(parent).replace(/home page$/i, '').trim(), parentHref: linkHref(parent), title: txt(title).replace(/home page$/i, '').trim(), href: linkHref(title) };
  }

  function parseFooter(doc) {
    var f = q(doc, '.uol-site-footer');
    if (!f) return null;
    var out = {};
    out.navGroups = qa(f, '.nav-list-group').map(function (g) {
      return { title: txt(q(g, '.nav-list-group__title')), links: qa(g, '.nav-list-group__link').map(function (a) { return { label: txt(a), href: linkHref(a) }; }) };
    });
    var addr = q(f, '.uol-footer-contact');
    if (addr) {
      out.contact = {
        title: txt(q(f, '.uol-footer-contact__title')) || 'Contact information',
        name: txt(q(addr, '.uol-footer-contact__name')),
        street: txt(q(addr, '[property="streetAddress"]')),
        locality: txt(q(addr, '[property="addressLocality"]')),
        region: txt(q(addr, '[property="addressRegion"]')),
        postcode: txt(q(addr, '[property="postalCode"]')),
        country: txt(q(addr, '[property="addressCountry"]')),
        phone: txt(q(addr, '.uol-footer-contact__telephone, [property="telephone"]')),
        email: txt(q(addr, '.uol-footer-contact__email, [property="email"]'))
      };
    }
    out.social = qa(f, '.uol-footer-social-media__item').map(function (a) {
      var label = a.getAttribute('aria-label') || txt(a);
      return { network: label.toLowerCase().replace(/[^a-z]/g, ''), label: label, href: a.getAttribute('href') };
    });
    out.accreditations = qa(f, '.uol-site-footer__accreditations .uol-accreditation').map(function (a) {
      var img = q(a, 'img'), link = q(a, 'a');
      return { src: imgSrc(img), alt: img ? img.getAttribute('alt') || '' : '', href: linkHref(link) };
    });
    var info = q(f, '.footer-site-information');
    if (info) {
      var items = qa(info, '.footer-site-information__item');
      out.siteInfo = { copyright: '', links: [] };
      items.forEach(function (li) {
        var a = q(li, 'a');
        if (a) out.siteInfo.links.push({ label: txt(a), href: linkHref(a) });
        else if (!out.siteInfo.copyright) out.siteInfo.copyright = txt(li);
      });
    }
    var sup = q(doc, '.footer-supplement');
    if (sup) {
      var icon = (q(sup, '.footer-supplement__icon') || { className: '' }).className.match(/uol-icon--(mdi\w+)/);
      out.supplement = { enabled: true, label: txt(sup), href: linkHref(sup), icon: icon ? icon[1] : 'mdiPhoneOutline' };
    }
    return out;
  }

  function parseBanners(doc) {
    var out = {};
    var gb = q(doc, '.uol-global-banner');
    if (gb) {
      var btn = q(gb, 'a, button');
      out.globalBanner = { enabled: true, title: txt(q(gb, '.uol-global-banner__title')), description: txt(q(gb, '.uol-global-banner__description')), buttonLabel: txt(btn), buttonHref: btn && btn.tagName === 'A' ? linkHref(btn) : '#' };
    }
    var mb = q(doc, '.uol-global-marketing-banner');
    if (mb) {
      var a = q(mb, '.uol-global-marketing-banner__link');
      var desc = q(mb, '.uol-global-marketing-banner__description');
      var d = desc ? desc.cloneNode(true) : null;
      if (d && q(d, 'a')) q(d, 'a').remove();
      out.marketingBanner = { enabled: true, title: txt(q(mb, '.uol-global-marketing-banner__title')), description: txt(d), linkLabel: txt(a), linkHref: linkHref(a) };
    }
    return out;
  }

  /* ---------- page settings ---------- */
  function parseSectionNavItems(ul) {
    return qa(ul, ':scope > .uol-section-nav__item').map(function (li) {
      if (hasClass(li, 'uol-section-nav__item--parent')) {
        return { label: txt(q(li, ':scope > .uol-section-nav__item__label')), children: parseSectionNavItems(q(li, ':scope > .uol-section-nav__sublist')) };
      }
      var a = q(li, 'a');
      return { label: txt(a), href: linkHref(a), current: !!(a && a.getAttribute('aria-current')) };
    });
  }

  function parsePageSettings(doc, root) {
    var s = {};
    var sn = q(doc, 'nav.uol-section-nav');
    if (sn) s.sectionNav = { enabled: true, intro: txt(q(sn, '.uol-section-nav__title__intro')) || 'In this section', title: txt(q(sn, '.uol-section-nav__title__text')), items: parseSectionNavItems(q(sn, '.uol-section-nav__list')) };
    // Jadu can output several related-content asides (for example "Related content" and "Contacts"); merge their items
    var rcs = qa(doc, '.uol-section-nav-related-content');
    if (rcs.length) {
      var items = [];
      rcs.forEach(function (rc) {
        qa(rc, '.uol-section-nav-related__item').forEach(function (i) {
          var a = q(i, '.uol-section-nav-related-content__item__title__link');
          var item = { title: txt(a) || txt(q(i, '.uol-section-nav-related-content__item__title')), href: linkHref(a), text: txt(q(i, '.uol-section-nav-related-content__item__text')), phone: txt(q(i, '.uol-section-nav-related-content__contact--phone')), email: txt(q(i, '.uol-section-nav-related-content__contact--email')) };
          if (item.title || item.text || item.phone || item.email) items.push(item);
        });
      });
      s.relatedContent = { enabled: true, title: txt(q(rcs[0], '.uol-section-nav-related-content__title')) || 'Related content', items: items };
    }
    var sc = q(doc, '.uol-section-nav-ctas');
    if (sc) s.sectionCtas = { enabled: true, title: txt(q(sc, '.uol-section-nav-ctas__title')), links: qa(sc, '.uol-section-nav-ctas__link').map(function (a) { return { label: txt(a), href: linkHref(a) }; }) };
    var bc = q(doc, '.uol-breadcrumb');
    if (bc) s.breadcrumb = qa(bc, '.uol-breadcrumb__link').map(function (a) { return { label: txt(a), href: linkHref(a) }; });
    var ph = q(root || doc, '.page-heading');
    if (ph) {
      var cat = q(ph, '.page-heading__meta__data__link');
      var time = q(ph, 'time');
      s.heading = { title: txt(q(ph, '.page-heading__title__main')) || txt(q(ph, 'h1')), subtitle: txt(q(ph, '.page-heading__title--subtitle')), category: txt(cat) || (function () { var dd = qa(ph, '.page-heading__meta__group').filter(function (g) { return /category/i.test(txt(q(g, 'dt'))); })[0]; return dd ? txt(q(dd, 'dd')) : ''; })(), categoryHref: linkHref(cat), date: time ? (time.getAttribute('datetime') || txt(time)).slice(0, 10) : '' };
      var ipn = q(ph, '.uol-in-page-navigation');
      if (ipn) s.inPageNav = { enabled: true, style: hasClass(ipn, 'uol-in-page-navigation--with-accordion') ? 'accordion' : 'list', title: txt(q(ipn, '.uol-in-page-navigation__title, .uol-accordion__title')) || 'Contents', items: qa(ipn, 'li a').map(function (a) { return { label: txt(a), href: linkHref(a), current: !!a.getAttribute('aria-current') }; }) };
    }
    var pn = q(root || doc, '.uol-page-nav');
    if (pn) {
      var prev = q(pn, '.uol-page-nav__item--prev'), next = q(pn, '.uol-page-nav__item--next');
      s.pageNav = { enabled: true, prevLabel: txt(q(prev, '.uol-page-nav__item__title')), prevHref: linkHref(prev), nextLabel: txt(q(next, '.uol-page-nav__item__title')), nextHref: linkHref(next) };
    }
    var fi = q(root || doc, '.uol-article__content > .uol-featured-image');
    if (fi) s.featuredImage = { src: imgSrc(q(fi, 'img')), alt: (q(fi, 'img') || {}).alt || '', caption: txt(q(fi, 'figcaption')) };
    var active = q(doc, '.uol-header-local-navigation a[aria-current]');
    if (active) s.navActive = linkHref(active);
    return s;
  }

  function parseHero(doc) {
    var banner = q(doc, '.uol-banner-outer, .uol-banner');
    if (banner) {
      return { type: 'banner', items: qa(banner, '.uol-banner__item').map(function (li) {
        var a = q(li, '.uol-banner__item__link'), img = q(li, '.uol-banner__item__img');
        return { title: txt(q(li, '.uol-banner__item__title')), image: imgSrc(img), alt: img ? img.getAttribute('alt') || '' : '', lead: txt(q(li, '.uol-banner__item__lead')), linkLabel: txt(a), linkHref: linkHref(a) };
      }) };
    }
    var hero = q(doc, '.uol-hero-banner');
    if (hero) {
      var img = q(hero, '.uol-hero-banner__img');
      var t = q(hero, '.uol-hero-banner__title');
      return { type: 'hero', title: txt(t), lead: txt(q(hero, '.uol-hero-banner__lead')), image: imgSrc(img), alt: img ? img.getAttribute('alt') || '' : '', useH1: !!(t && t.tagName === 'H1') };
    }
    var ss = q(doc, '.bannerSlideshow');
    if (ss) return { type: 'slideshow', slides: qa(ss, '.image').map(function (i) { return { image: abs(bgUrl(i)) }; }) };
    return { type: 'none' };
  }

  /* ---------- widgets ---------- */
  function widgetHead(w) {
    var head = {};
    head.title = txt(q(w, '.uol-widget__title'));
    var lead = q(w, '.uol-widget__lead');
    head.lead = lead ? cleanRich(lead) : '';
    var link = q(w, '.uol-widget__link');
    if (link) { head.linkLabel = txt(link); head.linkHref = linkHref(link); }
    var arrows = qa(w, '.uol-widget__arrow-link');
    if (arrows.length) head.arrowLinks = arrows.map(function (a) { return { label: txt(a), href: linkHref(a) }; });
    return head;
  }
  function parseCards(w) {
    return qa(w, '.uol-cards__card').map(function (c) {
      var a = q(c, '.uol-cards__card__link'), img = q(c, '.uol-cards__card__image'), t = q(c, 'time');
      return { title: txt(a), href: linkHref(a), text: txt(q(c, '.uol-cards__card__text')), date: t ? (t.getAttribute('datetime') || txt(t)).slice(0, 10) : '', image: imgSrc(img), alt: img ? img.getAttribute('alt') || '' : '' };
    });
  }
  function parseFacts(w) {
    return qa(w, '.uol-facts-figures').map(function (f) {
      var a = q(f, '.uol-facts-figures__link');
      return { headline: txt(q(f, '.uol-facts-figures__headline__1')), text: txt(q(f, '.uol-facts-figures__headline__2')), source: txt(a) || txt(q(f, '.uol-facts-figures__cite')), sourceHref: linkHref(a) };
    });
  }
  function parseFactsV2(w) {
    return qa(w, '.uol-facts-figures-v2').map(function (f) {
      var h1 = q(f, '.uol-facts-figures-v2__headline__1');
      var icon = h1 && h1.className.match(/uol-icon--(mdi\w+)/);
      var a = q(f, '.uol-facts-figures-v2__link');
      return { highlight: icon ? '' : txt(h1), icon: icon ? icon[1] : '', text: txt(q(f, '.uol-facts-figures-v2__headline__2')), source: txt(q(f, '.uol-facts-figures-v2__optional-fact-source')), citation: txt(a) || txt(q(f, '.uol-facts-figures-v2__cite')), citationHref: linkHref(a) };
    });
  }
  function parseTiles(w) {
    return qa(w, '.uol-tile').map(function (t) {
      if (hasClass(t, 'uol-tile--facts')) { var f = parseFacts(t)[0] || {}; return { kind: 'fact', factHeadline: f.headline, factText: f.text, factSource: f.source, factSourceHref: f.sourceHref }; }
      if (hasClass(t, 'uol-tile--profile')) {
        var link = q(t, '.uol-tile__profile-link');
        return { kind: 'profile', profileName: txt(q(t, '.uol-tile__profile-name')), profileRole: txt(q(t, '.uol-tile__profile-role')), profilePosition: txt(q(t, '.uol-tile__profile-position')), profileQuote: txt(q(t, '.uol-tile__profile-quote')), image: abs(bgUrl(q(t, '.uol-tile__profile-image'))), alt: (q(t, '.uol-tile__profile-image') || {}).getAttribute ? q(t, '.uol-tile__profile-image').getAttribute('aria-label') || '' : '', href: linkHref(link) };
      }
      var a = q(t, '.uol-tile__link'), img = q(t, '.uol-tile__img');
      return { kind: img ? 'image' : 'text', title: txt(a), href: linkHref(a), subtitle: txt(q(t, '.uol-tile__subtitle')), image: abs(bgUrl(img)), alt: img ? img.getAttribute('aria-label') || '' : '', isVideo: hasClass(t, 'uol-tile--video') };
    });
  }
  function parseGalleryItems(w) {
    return qa(w, '.uol-gallery__item').map(function (g) {
      var img = q(g, 'img');
      var isVideo = hasClass(g, 'uol-gallery__item--video');
      var content = q(g, '.uol-gallery__item__content');
      return { type: isVideo ? 'video' : 'image', title: txt(q(g, '.uol-gallery__item__title')), image: isVideo && (!img || img.getAttribute('src') === '#') ? '' : imgSrc(img), alt: img ? img.getAttribute('alt') || '' : '', caption: txt(q(g, '.uol-gallery__image-caption')), videoUrl: g.getAttribute('data-video') || '', text: content ? cleanRich(content) : '' };
    });
  }
  function parseEvents(w) {
    return qa(w, '.event-card').map(function (e) {
      var a = q(e, '.event-card__link');
      var dates = q(e, '.event-card__dates > div');
      var startDay = txt(q(e, '.event-card__date__start-date__day'));
      var rest = '';
      if (dates) {
        var c = dates.cloneNode(true);
        qa(c, '.event-card__date__start-date__day, .event-card__date__end-date').forEach(function (n) { n.remove(); });
        rest = txt(c).replace(/[–-]\s*$/, '').trim();
      }
      return { title: txt(a), href: linkHref(a), startDay: startDay, startRest: rest, endDate: txt(q(e, '.event-card__date__end-date')), time: txt(q(e, '.event-card__time > span[aria-hidden]')) || txt(q(e, '.event-card__time')) };
    });
  }
  function parseForm(w) {
    var form = q(w, 'form');
    if (!form) return null;
    var fields = [];
    qa(form, '.uol-form__input-container').forEach(function (c) {
      if (c.parentElement && c.parentElement.closest('.uol-form__input-container') && c.parentElement.closest('.uol-form__input-container') !== c) return;
      var label = txt(q(c, '.uol-form__input-label__text, .uol-form__custom__legend, .uol-form__input--legend-title'));
      if (!label) return;
      var hint = txt(q(c, '.uol-form__input-label__hint'));
      var required = /\(required\)/i.test(label) || !!q(c, '[required]');
      label = label.replace(/\s*\(required\)\s*/i, '');
      var size = (c.className.match(/uol-form__input-container--(x-small|small|medium|large)/) || [])[1] || '';
      var type = 'text';
      var opts = '';
      if (q(c, 'select')) { type = 'select'; opts = qa(c, 'option').map(function (o) { return txt(o); }).filter(function (o) { return o && !/^select an option$/i.test(o); }).join('\n'); }
      else if (q(c, 'textarea')) type = 'textarea';
      else if (q(c, 'input[type=checkbox]')) { type = 'checkbox'; opts = qa(c, '.uol-form__input--checkbox-label').map(txt).join('\n'); }
      else if (q(c, 'input[type=radio]')) { type = 'radio'; opts = qa(c, '.uol-form__input--radio__label').map(txt).join('\n'); }
      else { var inp = q(c, 'input'); if (inp) type = inp.getAttribute('type') || 'text'; }
      fields.push({ type: type, label: label, hint: hint, required: required, size: size, options: opts });
    });
    var btn = q(form, 'button[type=submit], .uol-form__button-wrapper button');
    var before = q(w, '.uol-form__additional-content--before'), after = q(w, '.uol-form__additional-content--after');
    return { formTitle: txt(q(w, '.uol-form__title')), formLead: q(w, '.uol-form__lead') ? cleanRich(q(w, '.uol-form__lead')) : '', beforeText: before ? cleanRich(before) : '', afterText: after ? cleanRich(after) : '', fields: fields, buttonLabel: txt(btn) || 'Submit', centered: !!q(w, '.uol-form-container--centered') };
  }

  function parseWidget(w) {
    var cont = w.closest('.uol-widget-container') || w;
    var widgetEl = hasClass(w, 'uol-widget') ? w : q(w, '.uol-widget') || w;
    var type = (widgetEl.className.match(/uol-widget--([a-z0-9-]+)/) || [])[1] || '';
    var head = widgetHead(widgetEl);
    var content = q(widgetEl, '.uol-widget__content') || widgetEl;
    function raw() { state.warnings.push('Kept an unrecognised widget as raw HTML' + (head.title ? ': ' + head.title : '')); return block('raw-html', { html: absolutiseHtml(cont.outerHTML), inline: false }); }

    if (!type || type === '') {
      if (q(content, '.uol-navigation-cards')) type = 'navigation-cards';
      else if (q(content, '.uol-accreditations')) type = 'accreditation-logos';
      else if (q(content, 'form')) type = 'form';
      else if (q(content, '.uol-gallery')) type = 'gallery';
      else if (q(content, '.uol-tiles')) type = 'tiles';
      else if (q(content, '.uol-cards')) type = 'cards';
      else if (q(content, '.uol-rich-text')) type = 'content';
    }
    switch (type) {
      case 'ctas': return block('ctas', { arrow: !!q(content, '.uol-in-text-cta__link svg, .uol-arrow-link'), items: qa(content, '.uol-in-text-cta').map(function (c) { var a = q(c, '.uol-in-text-cta__link'); return { title: txt(a), href: linkHref(a), text: txt(q(c, '.uol-in-text-cta__text')) }; }) });
      case 'featured-content': {
        var p = Object.assign({}, head, { media: 'none', text: '' });
        var fig = q(content, '.uol-featured-image');
        var vid = q(content, '.uol-gallery__item--video');
        if (vid) { p.media = 'video'; p.videoUrl = vid.getAttribute('data-video') || ''; p.videoTitle = txt(q(vid, '.uol-gallery__item__title')); var vimg = q(vid, 'img'); if (vimg && vimg.getAttribute('src') !== '#') p.image = imgSrc(vimg); }
        else if (fig) { p.media = 'image'; p.image = imgSrc(q(fig, 'img')); p.alt = (q(fig, 'img') || {}).alt || ''; p.caption = txt(q(fig, 'figcaption')); }
        var t = q(content, '.uol-widget__content__text');
        if (t) p.text = cleanRich(t);
        return block('featured-content', p);
      }
      case 'content': { var rt = q(content, '.uol-rich-text'); return block('content', Object.assign({}, head, { body: rt ? cleanRich(rt) : cleanRich(content) })); }
      case 'facts-figures': if (q(content, '.uol-facts-figures-v2')) return block('facts-figures-v2', Object.assign({}, head, { items: parseFactsV2(content) })); return block('facts-figures', Object.assign({}, head, { items: parseFacts(content) }));
      case 'tiles': return block('tiles', Object.assign({}, head, { tiles: parseTiles(content) }));
      case 'cards': return block('cards', Object.assign({}, head, { featured: !!q(content, '.uol-cards--featured'), cards: parseCards(content) }));
      case 'news-events': return block('news-events', Object.assign({}, head, { cards: parseCards(content) }));
      case 'news-tiles': return block('news-tiles', Object.assign({}, head, { tiles: qa(content, '.uol-news-tile').map(function (t) { var a = q(t, '.uol-news-tile__link'), img = q(t, '.uol-news-tile__img'), tm = q(t, 'time'); return { title: txt(a), href: linkHref(a), date: tm ? (tm.getAttribute('datetime') || txt(tm)).slice(0, 10) : '', image: abs(bgUrl(img)), alt: img ? img.getAttribute('aria-label') || '' : '' }; }) }));
      case 'events': return block('events', Object.assign({}, head, { events: parseEvents(content) }));
      case 'description-list': return block('description-list', Object.assign({}, head, { items: qa(content, '.uol-description-list__item').map(function (i) { var a = q(i, 'a'); return { title: txt(a) || txt(q(i, '.uol-description-list__item__title')), href: linkHref(a), text: txt(q(i, '.uol-description-list__item__content')) }; }) }));
      case 'gallery': return block('gallery', Object.assign({}, head, { items: parseGalleryItems(content) }));
      case 'form': { var f = parseForm(content); return f ? block('form', f) : raw(); }
      case 'list-featured': return block('list-featured', Object.assign({}, head, { ordered: !!q(content, 'ol.uol-list-featured'), items: qa(content, '.uol-list-featured__item').map(txt).join('\n') }));
      case 'navigation-cards': return block('navigation-cards', Object.assign({}, head, { cards: qa(content, '.uol-navigation-card').map(function (c) { return { title: txt(q(c, '.uol-navigation-card__title')), href: linkHref(c), description: txt(q(c, '.uol-navigation-card__description')) }; }) }));
      case 'accreditation-logos': return block('accreditation-logos', Object.assign({}, head, { logos: qa(content, '.uol-accreditation').map(function (a) { var img = q(a, 'img'); return { src: imgSrc(img), alt: img ? img.alt : '', href: linkHref(q(a, 'a')) }; }) }));
      case 'linked-list': return block('linked-list-widget', Object.assign({}, head, { items: qa(content, '.uol-linked-list__link').map(function (a) { return { label: txt(a), href: linkHref(a) }; }) }));
      default: return raw();
    }
  }

  /* ---------- inline components in rich text ---------- */
  var RICH_TAGS = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, UL: 1, OL: 1, STRONG: 1, EM: 1, A: 1, BR: 1, SPAN: 1, DL: 1, PRE: 1, CODE: 1, SMALL: 1, SUP: 1, SUB: 1, B: 1, I: 1, '#text': 1 };

  function parseComponent(el) {
    if (el.nodeType !== 1) return null;
    if (hasClass(el, 'uol-widget-container') || hasClass(el, 'uol-widget')) return parseWidget(el);
    if (hasClass(el, 'uol-accordion') && !el.closest('.uol-in-page-navigation')) return null; // handled by run collector
    if (hasClass(el, 'uol-section-nav-ctas') || hasClass(el, 'uol-section-nav-related-content') || hasClass(el, 'uol-section-nav')) return { skip: true }; // side-column pieces are page settings
    if (hasClass(el, 'uol-in-text-ctas-wrapper') || hasClass(el, 'uol-in-text-ctas') || hasClass(el, 'uol-in-text-cta')) {
      var ctas = hasClass(el, 'uol-in-text-cta') ? [el] : qa(el, '.uol-in-text-cta');
      return block('in-text-cta', { arrow: !!q(el, 'svg, .uol-arrow-link'), items: ctas.map(function (c) { var a = q(c, '.uol-in-text-cta__link'); return { title: txt(a), href: linkHref(a), text: txt(q(c, '.uol-in-text-cta__text')) }; }) });
    }
    if (hasClass(el, 'uol-in-text-facts')) return block('in-text-facts', { title: txt(q(el, '.uol-in-text-facts__title')), items: qa(el, '.uol-in-text-fact__item').map(function (i) { return { title: txt(q(i, '.uol-in-text-fact__item__title')), description: txt(q(i, '.uol-in-text-fact__item__description')), href: i.tagName === 'A' ? linkHref(i) : '' }; }) });
    if (hasClass(el, 'text-highlight')) return block('text-highlight', { html: cleanRich(el) });
    if (hasClass(el, 'uol-highlight-block')) return block('highlight-block', { html: cleanRich(q(el, '.uol-rich-text') || el) });
    if (hasClass(el, 'uol-typography-pull-quote')) return block('pull-quote', { text: txt(el), align: hasClass(el, 'uol-typography-pull-quote--right') ? 'right' : 'left' });
    if (el.tagName === 'BLOCKQUOTE') { var cite = q(el, 'cite'), ca = cite ? q(cite, 'a') : null; var c = el.cloneNode(true); qa(c, 'footer').forEach(function (n) { n.remove(); }); return block('blockquote', { text: txt(c), cite: txt(cite), citeHref: linkHref(ca) }); }
    if (el.tagName === 'TABLE' || hasClass(el, 'uol-index-table')) {
      var headers = qa(el, 'thead th, thead td').map(txt).join(' | ');
      var rows = qa(el, 'tbody tr').map(function (r) { return qa(r, 'td, th').map(txt).join(' | '); }).join('\n');
      if (hasClass(el, 'uol-index-table')) { var cap = el.previousElementSibling; return block('index-table', { caption: cap && hasClass(cap, 'uol-index-table-caption') ? txt(cap) : '', headers: headers, rows: rows, sortable: !!q(el, '.uol-index-table__th-inner button') }); }
      return block('table', { caption: txt(q(el, 'caption')), headers: headers, rows: rows });
    }
    if (hasClass(el, 'uol-index-table-caption')) return null;
    if (hasClass(el, 'uol-image-pair')) return block('image-pair', { images: qa(el, 'figure').map(function (f) { var i = q(f, 'img'); return { src: imgSrc(i), alt: i ? i.alt : '', caption: txt(q(f, 'figcaption')) }; }) });
    if (el.tagName === 'FIGURE' || el.tagName === 'IMG') { var img = el.tagName === 'IMG' ? el : q(el, 'img'); if (!img) return null; return block('image', { src: imgSrc(img), alt: img.alt || '', caption: txt(q(el, 'figcaption')), featured: hasClass(el, 'uol-featured-image') }); }
    if (el.tagName === 'IFRAME') { var src = el.getAttribute('src') || ''; if (/youtube|youtu\.be|vimeo/.test(src)) return block('video', { url: src, title: el.getAttribute('title') || '' }); return block('iframe', { src: src, title: el.getAttribute('title') || '', height: parseInt(el.getAttribute('height'), 10) || 400 }); }
    if (hasClass(el, 'uol-linked-list')) return block('linked-list', { items: qa(el, 'a').map(function (a) { return { label: txt(a), href: linkHref(a) }; }) });
    if (hasClass(el, 'uol-link-button-container')) return block('link-buttons', { buttons: qa(el, 'a, button').map(function (b) { return { label: txt(b), href: linkHref(b), style: (b.className.match(/uol-button--(primary|secondary)/) || [])[1] || '' }; }) });
    if (hasClass(el, 'uol-button') && el.tagName === 'A') return block('button', { label: txt(el), href: linkHref(el), style: (el.className.match(/uol-button--(primary|secondary)/) || [])[1] || '' });
    if (hasClass(el, 'uol-logo-group')) return block('logo-group', { logos: qa(el, '.uol-logo-group-item').map(function (i) { var img = q(i, 'img'), a = q(i, 'a'); return { src: imgSrc(img), alt: img ? img.alt : '', label: txt(a), href: linkHref(a) }; }) });
    if (hasClass(el, 'in-text-icons')) return block('in-text-icons', { items: qa(el, '.in-text-icon').map(function (i) { return { icon: (i.className.match(/uol-icon--(mdi\w+)/) || [])[1] || 'mdiCheck', label: txt(i) }; }) });
    if (hasClass(el, 'uol-info-list-container') || hasClass(el, 'uol-info-list')) return block('info-list', { inline: !!q(el, '.uol-info-list--inline') || hasClass(el, 'uol-info-list--inline'), groups: qa(el, '.uol-info-list__group').map(function (g) { return { term: txt(q(g, 'dt')), data: qa(g, 'dd').map(txt).join('\n') }; }) });
    if (hasClass(el, 'uol-status-message')) { var k = (el.className.match(/uol-status-message--(\w+)/) || [])[1] || 'info'; var c2 = el.cloneNode(true); qa(c2, '.hide-accessible').forEach(function (n) { n.remove(); }); return block('status-message', { kind: k, text: absolutiseHtml(inner(q(c2, '.uol-icon') || c2)) }); }
    if (hasClass(el, 'uol-chips')) return block('chips', { items: qa(el, '.uol-chips__item').map(function (i) { var c3 = i.cloneNode(true); qa(c3, '.hide-accessible, svg').forEach(function (n) { n.remove(); }); return { label: txt(c3), href: linkHref(q(i, 'a')) }; }) });
    if (hasClass(el, 'uol-people-profile-cards')) return block('people-profiles', { people: qa(el, '.uol-people-profile__card').map(function (c) { var a = q(c, '.uol-people-profile__name a'), img = q(c, '.uol-people-profile__img'); var groups = qa(c, '.uol-info-list__group'); function g(term) { var m = groups.filter(function (x) { return new RegExp(term, 'i').test(txt(q(x, 'dt'))); })[0]; return m ? qa(m, 'dd').map(txt).join('\n') : ''; } return { name: txt(a) || txt(q(c, '.uol-people-profile__name')), href: linkHref(a), position: txt(q(c, '.uol-people-profile__position')), image: imgSrc(img), expertise: g('expertise'), email: g('email'), phone: g('phone') }; }) });
    if (hasClass(el, 'uol-publications-list')) return block('publications', { items: [{ title: txt(q(el, '.uol-publications-list__publication-title')), parentTitle: '', authors: '', date: '', href: linkHref(q(el, '.uol-publications-list__link')), linkLabel: txt(q(el, '.uol-publications-list__link span:last-child')) }] });
    if (hasClass(el, 'uol-content-block')) { var al = q(el, '.uol-content-block__arrow-link'), tl = q(el, '.uol-content-block__link'), bt = q(el, '.uol-button'); return block('content-block', { topic: txt(q(el, '.uol-content-block__topic')), heading: txt(q(el, '.uol-content-block__heading')), date: txt(q(el, '.uol-content-block__date')), copy: txt(q(el, '.uol-content-block__copy')), linkLabel: txt(tl), linkHref: linkHref(tl), arrowLinkLabel: txt(al), arrowLinkHref: linkHref(al), buttonLabel: txt(bt), buttonHref: bt ? linkHref(bt) : '' }); }
    if (hasClass(el, 'uol-article-highlight')) return block('article-highlight', { title: txt(q(el, '.uol-article-highlight__title')), subtitle: txt(q(el, '.uol-article-highlight__subtitle')), text: txt(q(el, '.uol-article-highlight__paragraph')) });
    if (hasClass(el, 'uol-profile-supplement')) { var pl = q(el, '.uol-profile-supplement__link'); return block('profile-supplement', { name: txt(q(el, '.uol-profile-supplement__title')).replace(/^Profile:\s*/i, ''), quote: txt(q(el, 'blockquote p')) || txt(q(el, 'blockquote')), cite: txt(q(el, 'cite')), image: abs(bgUrl(q(el, '.uol-profile-image__img'))), linkLabel: txt(pl), linkHref: linkHref(pl) }); }
    if (hasClass(el, 'image-quote')) { var bq = q(el, 'blockquote'), ci = q(el, 'cite'), cia = ci ? q(ci, 'a') : null, bc = bq ? bq.cloneNode(true) : null; if (bc) qa(bc, 'footer').forEach(function (n) { n.remove(); }); var iq = q(el, '.image-quote__img'); return block('image-quote', { quote: txt(bc), cite: txt(ci), citeHref: linkHref(cia), image: imgSrc(iq), alt: iq ? iq.alt : '', theme: hasClass(el, 'image-quote--cream') ? 'cream' : 'default' }); }
    if (hasClass(el, 'uol-task-banner')) { state.warnings.push('Task banner imported as raw HTML (edit the markup directly or replace with the Task banner block).'); return block('raw-html', { html: absolutiseHtml(el.outerHTML) }); }
    if (hasClass(el, 'uol-key-facts')) return block('key-facts', { items: qa(el, '.uol-key-facts__group').map(function (g) { return { term: txt(q(g, 'dt')), data: txt(q(g, 'dd')) }; }) });
    if (hasClass(el, 'uol-year-of-entry')) return block('year-of-entry', { label: txt(q(el, '.uol-year-of-entry__title')).replace(txt(q(el, '.uol-year-of-entry__date')), '').trim(), year: txt(q(el, '.uol-year-of-entry__date')) });
    if (hasClass(el, 'uol-pagination')) { var cur = q(el, '[aria-current]'); var nums = qa(el, '.uol-pagination__item--numeric'); return block('pagination', { current: cur ? parseInt(cur.getAttribute('data-number'), 10) || 1 : 1, total: nums.length || 1, baseHref: '?page=' }); }
    if (hasClass(el, 'uol-gallery-container') || hasClass(el, 'uol-gallery')) return block('gallery', { title: '', items: parseGalleryItems(el) });
    if (el.tagName === 'HR') return block('hr');
    if (el.tagName === 'NAV' && hasClass(el, 'uol-page-nav')) return null;
    if (hasClass(el, 'uol-form__container') || (el.tagName === 'FORM')) { var pf = parseForm(el.closest('.uol-form__container') || el); return pf ? block('form', pf) : null; }
    return null;
  }

  function parseContent(root) {
    var blocks = [];
    var run = [];
    var accordions = [];
    function flushRun() {
      if (run.length) { var html = run.map(function (n) { return n.nodeType === 1 ? absolutiseHtml(n.outerHTML) : n.textContent; }).join('').trim(); if (html) blocks.push(block('rich-text', { html: html })); run = []; }
    }
    function flushAcc() {
      if (accordions.length) {
        var level = (accordions[0].querySelector('.uol-accordion__title') || { tagName: 'H3' }).tagName.replace('H', '') || '3';
        blocks.push(block('accordion', { level: level, items: accordions.map(function (a) { var c = q(a, '.uol-accordion__content-inner .uol-rich-text') || q(a, '.uol-accordion__content-inner') || q(a, '.uol-accordion__content'); return { title: txt(q(a, '.uol-accordion__title')), content: c ? cleanRich(c) : '' }; }) }));
        accordions = [];
      }
    }
    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) { if (n.textContent.trim()) run.push(n); return; }
        if (n.nodeType !== 1) return;
        if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'NOSCRIPT') return;
        // transparent wrappers: descend
        if (hasClass(n, 'uol-rich-text') || hasClass(n, 'uol-page__content') || hasClass(n, 'uol-article__content') || hasClass(n, 'uol-cms-container') || (n.tagName === 'DIV' && !n.className && !n.getAttribute('style'))) {
          if (hasClass(n, 'uol-featured-image') && n.closest('.uol-article__content')) return;
          flushRun(); flushAcc(); walk(n); return;
        }
        if (hasClass(n, 'uol-accordion') && !n.closest('.uol-in-page-navigation')) { flushRun(); accordions.push(n); return; }
        if (hasClass(n, 'uol-featured-image') && n.parentElement && hasClass(n.parentElement, 'uol-article__content')) return; // captured as featured image setting
        var b = parseComponent(n);
        if (b && b.skip) return;
        if (b) { flushRun(); flushAcc(); blocks.push(b); return; }
        if (RICH_TAGS[n.tagName]) { flushAcc(); run.push(n); return; }
        flushRun(); flushAcc();
        if (n.textContent.trim() || n.querySelector('img, iframe')) {
          state.warnings.push('Kept an unrecognised <' + n.tagName.toLowerCase() + (n.className ? '.' + String(n.className).trim().split(/\s+/)[0] : '') + '> as raw HTML');
          blocks.push(block('raw-html', { html: absolutiseHtml(n.outerHTML), inline: false }));
        }
      });
    }
    walk(root);
    flushRun(); flushAcc();
    return blocks;
  }

  function parseHomepageContent(main) {
    var blocks = [];
    Array.prototype.slice.call(main.children).forEach(function (n) {
      if (n.tagName === 'H1' && hasClass(n, 'hide-accessible')) return;
      if (hasClass(n, 'uol-widget-container') || hasClass(n, 'uol-widget')) { blocks.push(parseWidget(n)); return; }
      var b = parseComponent(n);
      if (b && b.skip) return;
      if (b) { blocks.push(b); return; }
      if (hasClass(n, 'uol-rich-text')) { blocks.push(block('content', { title: '', body: cleanRich(n) })); return; }
      if (n.textContent.trim() || n.querySelector('img')) { state.warnings.push('Kept an unrecognised homepage section as raw HTML'); blocks.push(block('raw-html', { html: absolutiseHtml(n.outerHTML) })); }
    });
    return blocks;
  }

  /* ---------- entry points ---------- */
  function parsePage(html, opts) {
    opts = opts || {};
    state.base = opts.baseUrl || '';
    state.warnings = [];
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var result = { site: {}, page: null, warnings: state.warnings, isDesignSystem: !!q(doc, '.uol-header, .uol-page, .uol-homepage-content, .uol-article, .uol-widget, .uol-rich-text') };

    var nav = parseNavigation(doc); if (nav) result.site.navigation = nav;
    var ql = parseQuicklinks(doc); if (ql) result.site.masthead = { quicklinks: ql };
    var lm = parseLocalMasthead(doc); if (lm) result.site.localMasthead = lm;
    var foot = parseFooter(doc); if (foot) result.site.footer = foot;
    Object.assign(result.site, parseBanners(doc));

    var main = q(doc, 'main') || q(doc, '.uol-page, .uol-homepage-content, .uol-article') || doc.body;
    var template = q(doc, '.uol-homepage-content') ? 'homepage' : q(doc, '.uol-article') ? 'article' : 'document';
    var settings = parsePageSettings(doc, main);
    // side-column pieces are now page settings; remove them so they cannot be imported a second time as content
    // (the design system script moves them into the main column on narrow screens, where a grab can capture them)
    qa(doc, '.uol-section-nav-ctas, .uol-section-nav-related-content, nav.uol-section-nav, .uol-breadcrumb').forEach(function (n) { n.remove(); });
    var title = (settings.heading && settings.heading.title) || txt(q(doc, 'h1:not(.hide-accessible)')) || txt(q(doc, 'title')).replace(/\s*[|–-]\s*University of Leeds.*$/i, '') || 'Imported page';
    if (template === 'homepage') {
      var h1 = q(main, 'h1.hide-accessible');
      settings.hiddenTitle = txt(h1);
      title = (lm && lm.title) || txt(h1).replace(/\s*home page$/i, '') || title;
    }
    if (template === 'article') settings.articleKind = (q(doc, '.uol-article').className.match(/uol-article--(\w+)/) || [])[1] || 'news';

    var blocks;
    if (template === 'homepage') blocks = parseHomepageContent(q(doc, '.uol-homepage-content') || main);
    else {
      var contentRoot = q(main, '.uol-page__content') || q(main, '.uol-article__content') || main;
      blocks = parseContent(contentRoot);
    }
    if (!result.isDesignSystem && !blocks.length) {
      var body = (q(doc, 'main') || doc.body).cloneNode(true);
      qa(body, 'script, style, noscript, nav, header, footer, iframe').forEach(function (n) { n.remove(); });
      blocks = [block('rich-text', { html: absolutiseHtml(body.innerHTML) })];
      state.warnings.push('This page does not use the Leeds design system; its main content was imported as rich text.');
    }

    result.page = {
      title: title,
      template: template,
      settings: Object.assign(window.UOL_PAGE_TEMPLATES.blank().settings, settings),
      hero: parseHero(doc),
      blocks: blocks
    };
    return result;
  }

  function parseSection(html, opts) {
    opts = opts || {};
    state.base = opts.baseUrl || '';
    state.warnings = [];
    var doc = new DOMParser().parseFromString('<div id="uol-import-root">' + html + '</div>', 'text/html');
    var root = doc.getElementById('uol-import-root');
    var blocks;
    if (q(root, '.uol-widget-container, .uol-widget') && !q(root, '.uol-page__content')) {
      blocks = [];
      Array.prototype.slice.call(root.children).forEach(function (n) {
        if (hasClass(n, 'uol-widget-container') || hasClass(n, 'uol-widget')) blocks.push(parseWidget(n));
        else { var b = parseComponent(n); if (b && b.skip) return; if (b) blocks.push(b); else blocks = blocks.concat(parseContent(n)); }
      });
    } else {
      blocks = parseContent(root);
    }
    return { blocks: blocks, warnings: state.warnings };
  }

  /* Fetch a URL: through the local server's proxy when available, otherwise directly (works only if the site allows CORS). */
  function fetchUrl(url) {
    var viaProxy = /^https?:/.test(location.protocol);
    var target = viaProxy ? '/__proxy?url=' + encodeURIComponent(url) : url;
    return fetch(target, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' fetching ' + url);
      return r.text();
    }).catch(function (e) {
      if (!viaProxy) throw new Error('Direct fetch blocked by the browser (CORS). Run serve.ps1 and open the CMS at http://localhost:8765 to import by URL, or paste the page HTML instead. (' + e.message + ')');
      throw e;
    });
  }

  window.UOL_IMPORT = { parsePage: parsePage, parseSection: parseSection, fetchUrl: fetchUrl };
})();
