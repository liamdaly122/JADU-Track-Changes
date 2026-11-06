/* Leeds prototyping CMS - block registry
   Every block has: type, label, group, scope, inline (lives inside a .uol-rich-text wrapper on document pages),
   fields (edit form schema), defaults, and render(props, ctx) which returns design-system markup. */
(function () {
  'use strict';

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function attr(s) { return esc(s); }
  function rich(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return '';
    return /<[a-z][\s\S]*>/i.test(s) ? s : '<p>' + esc(s) + '</p>';
  }
  function lines(s) {
    return String(s || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  }
  function cells(line) { return String(line || '').split('|').map(function (c) { return c.trim(); }); }
  function cls() { return Array.prototype.filter.call(arguments, Boolean).join(' '); }
  function svg(name) { return (window.UOL_SVG && window.UOL_SVG[name]) || ''; }
  function href(h) { return h ? attr(h) : '#'; }
  function bgimg(src) { return src ? ' style="background-image: url(\'' + attr(src) + '\');"' : ''; }
  function ytEmbed(url) {
    url = String(url || '').trim();
    var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    var v = url.match(/vimeo\.com\/(\d+)/);
    if (v) return 'https://player.vimeo.com/video/' + v[1];
    return url;
  }
  function fmtDate(d) {
    if (!d) return '';
    var dt = new Date(d);
    if (isNaN(dt.getTime())) return esc(d);
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function isoDate(d) {
    if (!d) return '';
    var dt = new Date(d);
    return isNaN(dt.getTime()) ? esc(d) : dt.toISOString().slice(0, 10);
  }

  var PH = 'https://designsystem.leeds.ac.uk/placeholders/';
  var PLACEHOLDERS = [
    { label: 'Campus banner 1', url: PH + 'banner/banner-01.jpg' },
    { label: 'Campus banner 2', url: PH + 'banner/banner-02.jpg' },
    { label: 'Campus banner 3', url: PH + 'banner/banner-03.jpg' },
    { label: 'Campus banner 4', url: PH + 'banner/banner-04.jpg' },
    { label: 'Campus banner 5', url: PH + 'banner/banner-05.jpg' },
    { label: 'Tile 1', url: PH + 'ph-tiles-1.jpg' },
    { label: 'Tile 2', url: PH + 'ph-tiles-2.jpg' },
    { label: 'Tile 3', url: PH + 'ph-tiles-3.jpg' },
    { label: 'Tile 4', url: PH + 'ph-tiles-4.jpg' },
    { label: 'Tile 5', url: PH + 'ph-tiles-5.jpg' },
    { label: 'Parkinson building', url: PH + 'tiles/parkinson.jpg' },
    { label: 'Cloth workers court', url: PH + 'tiles/cloth-workers-court.jpg' },
    { label: 'Space', url: PH + 'tiles/space.jpg' },
    { label: 'Aerial river', url: PH + 'tiles/background.jpg' },
    { label: 'Runners', url: PH + 'ph-news-02.jpg' },
    { label: 'Polar bears', url: PH + 'ph-news-14.jpg' },
    { label: 'Space station', url: PH + 'ph-news-15.jpg' },
    { label: 'Event: actors', url: PH + 'ph-event-01.jpg' },
    { label: 'Campus: Dual Form', url: PH + 'campus/medium/29940.jpeg' },
    { label: 'Campus: Edward Boyle', url: PH + 'campus/medium/28573.jpeg' },
    { label: 'Campus: Victoria Quarter', url: PH + 'campus/medium/29936.jpeg' },
    { label: 'Campus 23300', url: PH + 'campus/medium/23300.jpeg' },
    { label: 'Campus 23305', url: PH + 'campus/medium/23305.jpeg' },
    { label: 'Student portrait', url: PH + 'new-homepage/student-portrait-2.png' },
    { label: 'Student profile 11', url: PH + 'ph-profile-student-11.jpg' },
    { label: 'Staff profile 1', url: PH + 'ph-profile-staff-01.jpg' },
    { label: 'Staff profile 2', url: PH + 'ph-profile-staff-02.jpg' },
    { label: 'Staff profile 3', url: PH + 'ph-profile-staff-03.jpg' },
    { label: 'Accreditation logo 4', url: PH + 'ph-accreditation-04.svg' },
    { label: 'Accreditation logo 5', url: PH + 'ph-accreditation-05.svg' },
    { label: 'Accreditation logo 6', url: PH + 'ph-accreditation-06.svg' },
    { label: 'Accreditation logo 7', url: PH + 'ph-accreditation-07.svg' },
    { label: 'Clarence Dock banner', url: PH + 'banner/Liberty_Dock_Banner.jpg' }
  ];

  var ICONS = ['mdiArrowRight', 'mdiArrowLeft', 'mdiCheck', 'mdiCheckDecagramOutline', 'mdiChevronDown', 'mdiChevronRight', 'mdiClose', 'mdiCoffeeOutline', 'mdiDumbbell', 'mdiEarth', 'mdiGlassMugVariant', 'mdiGrillOutline', 'mdiInformationVariant', 'mdiLeaf', 'mdiMicrosoftXboxController', 'mdiMusicNote', 'mdiPaletteOutline', 'mdiParking', 'mdiPhoneOutline', 'mdiPlay', 'mdiPlus', 'mdiSoccer', 'mdiSofaSingleOutline', 'mdiStore', 'mdiTennis', 'mdiTrophyVariantOutline', 'mdiWashingMachine', 'mdiWifi', 'mdiAlertCircleOutline'];

  /* ---------- shared field fragments ---------- */
  var F = {
    text: function (key, label, extra) { return Object.assign({ key: key, label: label, type: 'text' }, extra || {}); },
    textarea: function (key, label, extra) { return Object.assign({ key: key, label: label, type: 'textarea' }, extra || {}); },
    html: function (key, label, extra) { return Object.assign({ key: key, label: label, type: 'html' }, extra || {}); },
    url: function (key, label, extra) { return Object.assign({ key: key, label: label, type: 'url' }, extra || {}); },
    image: function (key, label, extra) { return Object.assign({ key: key, label: label, type: 'image' }, extra || {}); },
    bool: function (key, label, extra) { return Object.assign({ key: key, label: label, type: 'boolean' }, extra || {}); },
    number: function (key, label, extra) { return Object.assign({ key: key, label: label, type: 'number' }, extra || {}); },
    date: function (key, label, extra) { return Object.assign({ key: key, label: label, type: 'date' }, extra || {}); },
    select: function (key, label, options, extra) { return Object.assign({ key: key, label: label, type: 'select', options: options }, extra || {}); },
    icon: function (key, label) { return { key: key, label: label, type: 'select', options: ICONS.map(function (i) { return { value: i, label: i.replace(/^mdi/, '') }; }) }; },
    list: function (key, label, fields, extra) { return Object.assign({ key: key, label: label, type: 'list', fields: fields, itemLabel: 'title' }, extra || {}); }
  };
  var widgetHeadFields = [
    F.text('title', 'Widget title'),
    F.html('lead', 'Lead text', { hint: 'Optional introduction shown under the title' }),
    F.text('linkLabel', 'Head link label', { hint: 'Optional "View all" style link in the widget head' }),
    F.url('linkHref', 'Head link URL')
  ];

  /* ---------- widget wrapper ---------- */
  function widgetHead(p) {
    var arrows = (p.arrowLinks || []).filter(function (l) { return l.label; });
    if (!p.title && !p.lead && !p.linkLabel && !arrows.length) return '';
    var head = '';
    if (p.title) head += '<h2 class="uol-widget__title ">' + esc(p.title) + '</h2>';
    if (p.lead) head += '<div class="uol-widget__lead ">' + rich(p.lead) + '</div>';
    if (p.linkLabel) head += '<a class="uol-widget__link " href="' + href(p.linkHref) + '">' + esc(p.linkLabel) + '</a>';
    var arrowHtml = arrows.length ? '<ul class="uol-widget__arrow-links">' + arrows.map(function (l) {
      return '<li class="uol-widget__arrow-links-item"><a href="' + href(l.href) + '" class="uol-widget__arrow-link uol-arrow-link">' + esc(l.label) + '</a></li>';
    }).join('') + '</ul>' : '';
    return '<div class="uol-widget__left-col "><div class="uol-widget__head ">' + head + '</div>' + arrowHtml + '</div>';
  }
  function widget(type, p, content) {
    return '<div class="uol-widget-container uol-widget-container__' + type + '"><div class="uol-widget uol-widget--' + type + ' ">' + widgetHead(p) + '<div class="uol-widget__content ">' + content + '</div></div></div>';
  }

  /* ---------- reusable component renderers (also used by render.js) ---------- */
  var C = {};

  C.inTextCta = function (item, arrow) {
    var arrowSvg = arrow ? svg('arrowRight') : '';
    return '<div class="uol-in-text-cta"><h2 class="uol-in-text-cta__heading"><a class="uol-in-text-cta__link" href="' + href(item.href) + '">' + esc(item.title) + arrowSvg + '</a></h2>' + (item.text ? '<p class="uol-in-text-cta__text">' + esc(item.text) + '</p>' : '') + '</div>';
  };

  C.factsFigures = function (items) {
    return '<div class="uol-facts-figures-container">' + (items || []).map(function (f) {
      var foot = '';
      if (f.source) {
        foot = '<footer class="uol-facts-figures__footer"><cite class="uol-facts-figures__cite">' + (f.sourceHref ? '<a href="' + href(f.sourceHref) + '" class="uol-facts-figures__link"> ' + esc(f.source) + ' </a>' : ' ' + esc(f.source) + ' ') + '</cite></footer>';
      }
      return '<blockquote class="uol-facts-figures"><p class="uol-facts-figures__headline"><strong class="uol-facts-figures__headline__1">' + esc(f.headline) + '</strong><span class="uol-facts-figures__headline__2"> ' + esc(f.text) + ' </span></p>' + foot + '</blockquote>';
    }).join('') + '</div>';
  };

  C.cards = function (cards, opts) {
    opts = opts || {};
    var n = (cards || []).length;
    var hasImages = (cards || []).some(function (c) { return c.image; });
    var ul = '<ul class="' + cls('uol-cards', opts.featured && 'uol-cards--featured', 'uol-cards--count-' + n, hasImages && 'uol-cards--image-layout') + ' ">';
    ul += (cards || []).map(function (c) {
      return '<li class="' + cls('uol-cards__card', hasImages && 'uol-cards__card--with-image') + '"><div class="uol-cards__card__text-wrapper"><h3 class="uol-cards__card__title"><a class="uol-cards__card__link " href="' + href(c.href) + '"> ' + esc(c.title) + ' </a></h3>' +
        (c.date ? '<time class="uol-cards__card__date" datetime="' + isoDate(c.date) + '">' + fmtDate(c.date) + '</time>' : '') +
        (c.text ? '<p class="uol-cards__card__text">' + esc(c.text) + '</p>' : '') +
        '</div>' + (hasImages ? '<div class="uol-cards__card__image-wrapper">' + (c.image ? '<img class="uol-cards__card__image" src="' + attr(c.image) + '" alt="' + attr(c.alt || '') + '">' : '') + '</div>' : '') + '</li>';
    }).join('');
    return ul + '</ul>';
  };

  C.tiles = function (tiles) {
    return '<div class="uol-tiles">' + (tiles || []).map(function (t) {
      var kind = t.kind || (t.image ? 'image' : 'text');
      if (kind === 'fact') {
        return '<div class="uol-tile uol-tile--no-img uol-tile--facts "><div class="uol-tile__inner">' + C.factsFigures([{ headline: t.factHeadline, text: t.factText, source: t.factSource, sourceHref: t.factSourceHref }]).replace(/^<div class="uol-facts-figures-container">|<\/div>$/g, '') + '</div></div>';
      }
      if (kind === 'profile') {
        return '<div class="uol-tile uol-tile--no-img uol-tile--profile "><div class="uol-tile__inner"><h3 class="uol-tile__title">Profile: ' + esc(t.profileName) + '</h3><blockquote class="uol-tile__profile-blockquote"><div class="uol-tile__profile-quote"><p>' + esc(t.profileQuote) + '</p></div></blockquote><p class="uol-tile__profile-detail"><strong class="uol-tile__profile-name">' + esc(t.profileName) + '</strong>' + (t.profileRole ? '<span class="uol-tile__profile-role">' + esc(t.profileRole) + '</span>' : '') + (t.profilePosition ? '<span class="uol-tile__profile-position">' + esc(t.profilePosition) + '</span>' : '') + '</p>' + (t.image ? '<div class="uol-tile__profile-image" role="img" aria-label="' + attr(t.alt || ('Portrait of ' + t.profileName)) + '"' + bgimg(t.image) + '></div>' : '') + (t.href ? '<a class="uol-tile__profile-link" href="' + href(t.href) + '"><span class="hide-accessible">View profile for ' + esc(t.profileName) + '</span></a>' : '') + '</div></div>';
      }
      var hasImg = kind === 'image' && t.image;
      return '<div class="' + cls('uol-tile', hasImg ? 'uol-tile--img' : 'uol-tile--no-img', !hasImg && 'uol-tile--small', t.isVideo && 'uol-tile--video') + ' "><div class="uol-tile__inner">' +
        (t.isVideo ? '<span role="presentation" class="uol-tile__icon uol-tile__icon--video"></span>' : '') +
        '<div class="uol-tile__text-container"><h3 class="uol-tile__title"><a class="uol-tile__link" href="' + href(t.href) + '">' + esc(t.title) + '</a></h3>' + (t.subtitle ? '<p class="uol-tile__subtitle">' + esc(t.subtitle) + '</p>' : '') + '</div>' +
        (hasImg ? '<div class="uol-tile__img" role="img" aria-label="' + attr(t.alt || '') + '"' + bgimg(t.image) + '></div>' : '') + '</div></div>';
    }).join('') + '</div>';
  };

  C.newsTiles = function (tiles) {
    return '<div class="uol-news-tiles ">' + (tiles || []).map(function (t) {
      return '<div class="uol-news-tile "><div class="uol-news-tile__inner"><div class="uol-news-tile__content"><h3 class="uol-news-tile__title"><a href="' + href(t.href) + '" class="uol-news-tile__link"> ' + esc(t.title) + ' </a></h3>' + (t.date ? '<dl class="uol-news-tile__meta"><dt class="uol-news-tile__meta__term">Date</dt><dd class="uol-news-tile__meta__data uol-news-tile__meta__data--date"><time datetime="' + isoDate(t.date) + '"> ' + fmtDate(t.date) + ' </time></dd></dl>' : '') + '</div></div>' + (t.image ? '<div class="uol-news-tile__img" role="img" aria-label="' + attr(t.alt || '') + '"' + bgimg(t.image) + '></div>' : '') + '</div>';
    }).join('') + '</div>';
  };

  C.events = function (events) {
    return '<div class="events-cards">' + (events || []).map(function (e) {
      var start = e.startDay ? '<span class="event-card__date__start-date__day">' + esc(e.startDay) + '</span> ' + esc(e.startRest || '') : esc(e.startRest || '');
      var dates = '<div aria-hidden="true">' + start + (e.endDate ? ' &ndash; <span class="event-card__date__end-date">' + esc(e.endDate) + '</span>' : '') + '</div><span class="hide-accessible"> ' + esc((e.startDay ? e.startDay + ' ' : '') + (e.startRest || '')) + (e.endDate ? ' to ' + esc(e.endDate) : '') + ' </span>';
      return '<div class="event-card-outer"><div class="event-card"><h3 class="event-card__title"><a class="event-card__link" href="' + href(e.href) + '">' + esc(e.title) + '</a></h3><div class="event-card__dates">' + dates + '</div>' + (e.time ? '<div class="event-card__time"><span aria-hidden="true"> ' + esc(e.time) + ' </span><span class="hide-accessible"> ' + esc(e.time.replace(/\s*[–-]\s*/g, ' to ')) + ' </span></div>' : '') + '</div></div>';
    }).join('') + '</div>';
  };

  C.descriptionList = function (items) {
    return '<ul class="uol-description-list">' + (items || []).map(function (i) {
      return '<li class="uol-description-list__item"><div class="uol-description-list__item__inner"><h3 class="uol-description-list__item__title">' + (i.href ? '<a class="uol-description-list__item__link" href="' + href(i.href) + '">' + esc(i.title) + '</a>' : esc(i.title)) + '</h3>' + (i.text ? '<p class="uol-description-list__item__content">' + esc(i.text) + '</p>' : '') + '</div></li>';
    }).join('') + '</ul>';
  };

  C.gallery = function (items, titleLevel) {
    var tl = titleLevel || 'h3';
    var n = (items || []).length;
    return '<section class="uol-gallery-container" aria-label="Gallery of ' + n + ' items"><div class="uol-gallery uol-gallery--count-' + n + '">' + (items || []).map(function (g) {
      var isVideo = g.type === 'video' && g.videoUrl;
      return '<div class="' + cls('uol-gallery__item', isVideo ? 'uol-gallery__item--video uol-gallery__item--video-play-icon' : 'uol-gallery__item--image') + ' "' + (isVideo ? ' data-video="' + attr(g.videoUrl) + '"' : '') + '>' +
        (g.title ? '<' + tl + ' class="uol-gallery__item__title">' + esc(g.title) + '</' + tl + '>' : '') +
        '<figure class="uol-gallery__figure"><div class="uol-gallery__image-container"><img src="' + (isVideo ? (g.image ? attr(g.image) : '#') : attr(g.image || '')) + '" alt="' + attr(g.alt || '') + '"></div>' + (g.caption ? '<figcaption class="uol-gallery__image-caption">' + esc(g.caption) + '</figcaption>' : '') + '</figure>' +
        (isVideo ? '<noscript><a href="' + attr(g.videoUrl) + '">' + esc(g.videoUrl) + '</a></noscript>' : '') +
        (g.text ? '<div class="uol-gallery__item__content">' + rich(g.text) + '</div>' : '') + '</div>';
    }).join('') + '</div></section>';
  };

  C.navigationCards = function (cards) {
    return '<div class="uol-navigation-cards">' + (cards || []).map(function (c) {
      return '<a href="' + href(c.href) + '" class="uol-navigation-card"><h2 class="uol-navigation-card__title">' + esc(c.title) + '</h2>' + (c.description ? '<p class="uol-navigation-card__description">' + esc(c.description) + '</p>' : '') + '</a>';
    }).join('') + '</div>';
  };

  C.accreditations = function (logos) {
    return '<div class="uol-accreditations">' + (logos || []).map(function (l) {
      var img = '<img class="uol-accreditation__logo" src="' + attr(l.src) + '" alt="' + attr(l.alt || '') + '">';
      return '<div class="uol-accreditation">' + (l.href ? '<a class="uol-accreditation__link" href="' + href(l.href) + '">' + img + '</a>' : img) + '</div>';
    }).join('') + '</div>';
  };

  C.linkedList = function (items) {
    return '<ul class="uol-linked-list">' + (items || []).map(function (i) {
      return '<li class="uol-linked-list__item"><a class="uol-linked-list__link" href="' + href(i.href) + '">' + esc(i.label) + '</a></li>';
    }).join('') + '</ul>';
  };

  C.infoList = function (groups, inline) {
    return '<div class="uol-info-list-container"><dl class="' + cls('uol-info-list', inline && 'uol-info-list--inline') + ' ">' + (groups || []).map(function (g) {
      var data = lines(g.data).map(function (d) {
        var mod = '', inner = esc(d);
        if (/^[^@\s]+@[^@\s]+$/.test(d)) { mod = ' uol-info-list__data--email'; inner = '<a href="mailto:' + attr(d) + '">' + esc(d) + '</a>'; }
        else if (/^\+?[\d\s()]{7,}$/.test(d)) { mod = ' uol-info-list__data--phone'; inner = '<a href="tel:' + attr(d.replace(/[^\d+]/g, '')) + '">' + esc(d) + '</a>'; }
        else if (/^https?:\/\//.test(d)) { mod = ' uol-info-list__data--url'; inner = '<a href="' + attr(d) + '">' + esc(d) + '</a>'; }
        return '<dd class="uol-info-list__data' + mod + '"> ' + inner + ' </dd>';
      }).join('');
      return '<div class="uol-info-list__group"><dt class="uol-info-list__term ">' + esc(g.term) + '</dt>' + data + '</div>';
    }).join('') + '</dl></div>';
  };

  C.form = function (p, idPrefix) {
    idPrefix = idPrefix || 'f';
    var fields = (p.fields || []).map(function (f, i) {
      var id = idPrefix + '-' + i;
      var req = f.required ? ' required' : '';
      var labelText = esc(f.label) + (f.required ? ' (required)' : '');
      var hint = f.hint ? '<span class="uol-form__input-label__hint" id="' + id + '-hint">' + esc(f.hint) + ' </span>' : '';
      var size = f.size ? ' uol-form__input-container--' + f.size : '';
      var opts = lines(f.options);
      if (f.type === 'select') {
        return '<div class="uol-form__input-container' + size + '"><label class="uol-form__input-label " for="' + id + '"><span class="uol-form__input-label__text">' + labelText + '</span>' + hint + '</label><div class="uol-form__input-wrapper " data-field-invalid=false><select class="uol-form__input uol-form__input--select " name="' + id + '" id="' + id + '" data-native-select' + req + '><option value="">Select an option</option>' + opts.map(function (o) { return '<option value="' + attr(o) + '">' + esc(o) + '</option>'; }).join('') + '</select>' + svg('chevron').replace('<svg ', '<svg class="uol-form__input__chevron" ') + '</div></div>';
      }
      if (f.type === 'textarea') {
        return '<div class="uol-form__input-container "><label class="uol-form__input-label uol-form__input--teaxtarea-label" for="' + id + '" id="' + id + '-label"><span class="uol-form__input-label__text">' + labelText + '</span>' + hint + '</label><div class="uol-form__input--textarea-wrapper" data-field-invalid=false><textarea class="uol-form__input uol-form__input--textarea" id="' + id + '" name="' + id + '" data-textarea-height="medium"' + req + '></textarea></div></div>';
      }
      if (f.type === 'checkbox') {
        return '<div class="uol-form__input-container "><div role="group" aria-labelledby="' + id + '-legend" class="uol-form__custom-fieldset"><span id="' + id + '-legend" class="uol-form__custom__legend">' + labelText + '</span>' + hint + opts.map(function (o, j) {
          var oid = id + '-' + j;
          return '<div class="uol-form__input--checkbox-wrapper"><input class="uol-form__input--checkbox" type="checkbox" id="' + oid + '" name="' + id + '" value="' + attr(o) + '"><label class="uol-form__input--checkbox-label" for="' + oid + '" id="' + oid + '-label">' + esc(o) + '</label><span class="uol-form__input--checkbox-custom">' + svg('tick') + '</span></div>';
        }).join('') + '</div></div>';
      }
      if (f.type === 'radio') {
        return '<div class="uol-form__input-container "><div role="radiogroup" aria-labelledby="' + id + '-legend" class="uol-form__custom-fieldset"' + (f.required ? ' aria-required="true"' : '') + '><span id="' + id + '-legend" class="uol-form__custom__legend">' + labelText + '</span>' + hint + '<div class="uol-form__inputs-wrapper ">' + opts.map(function (o, j) {
          var oid = id + '-' + j;
          return '<div class="uol-form__input--radio-wrapper"><input class="uol-form__input--radio" type="radio" id="' + oid + '" name="' + id + '" value="' + attr(o) + '"' + (j === 0 ? ' checked' : '') + '><label class="uol-form__input--radio__label" for="' + oid + '">' + esc(o) + '</label><span class="uol-form__input--custom-radio" hidden>' + svg('radio') + '</span></div>';
        }).join('') + '</div></div></div>';
      }
      var type = f.type || 'text';
      var extra = type === 'email' ? ' inputmode="email" autocomplete="email"' : type === 'tel' ? ' autocomplete="tel"' : type === 'url' ? ' inputmode="url"' : ' autocomplete="off"';
      var wrapMod = type === 'search' ? ' uol-form__input-wrapper--search uol-form__input-wrapper--with-icon' : ' uol-form__input-wrapper--' + type;
      return '<div class="uol-form__input-container' + size + '"><label class="uol-form__input-label" for="' + id + '"><span class="uol-form__input-label__text">' + labelText + '</span>' + hint + '</label><div class="uol-form__input-wrapper' + wrapMod + ' " data-field-invalid=false><input class="uol-form__input uol-form__input--' + type + '" type="' + type + '" id="' + id + '" name="' + id + '" value=""' + extra + req + '></div></div>';
    }).join('');
    return '<div class="uol-form__container ' + (p.centered ? 'uol-form-container--centered ' : '') + '"><div class="uol-form__inner-wrapper">' +
      (p.formTitle ? '<h2 class="uol-form__title">' + esc(p.formTitle) + '</h2>' : '') +
      (p.formLead ? '<div class="uol-form__lead">' + rich(p.formLead) + '</div>' : '') +
      (p.beforeText ? '<div class="uol-rich-text"><div class="uol-form__additional-content uol-form__additional-content--before">' + rich(p.beforeText) + '</div></div>' : '') +
      '<form class="uol-form" action="' + attr(p.action || '#') + '" onsubmit="return false"><div class="uol-form__input-group uol-form__input-group--block"></div><div class="uol-form--button-block"><div class="uol-form__inputs-wrapper">' + fields + '</div><div class="uol-form__button-wrapper"><button class="uol-button uol-button--primary " type="submit">' + esc(p.buttonLabel || 'Submit') + '</button></div></div></form>' +
      (p.afterText ? '<div class="uol-rich-text"><div class="uol-form__additional-content uol-form__additional-content--after">' + rich(p.afterText) + '</div></div>' : '') +
      '</div></div>';
  };

  C.contentBlock = function (p, headingTag) {
    var h = headingTag || 'h2';
    return '<div class="uol-content-block">' + (p.topic ? '<p class="uol-content-block__topic">' + esc(p.topic) + '</p>' : '') + '<' + h + ' class="uol-content-block__heading"> ' + esc(p.heading) + ' </' + h + '>' + (p.date ? '<p class="uol-content-block__date">' + esc(p.date) + '</p>' : '') + (p.copy ? '<p class="uol-content-block__copy">' + esc(p.copy) + '</p>' : '') + (p.linkLabel ? '<p><a href="' + href(p.linkHref) + '" class="uol-content-block__link">' + esc(p.linkLabel) + '</a></p>' : '') + (p.arrowLinkLabel ? '<p><a href="' + href(p.arrowLinkHref) + '" class="uol-content-block__arrow-link uol-arrow-link">' + esc(p.arrowLinkLabel) + '</a></p>' : '') + (p.buttonLabel ? '<a class="uol-button uol-button--default " href="' + href(p.buttonHref) + '">' + esc(p.buttonLabel) + '</a>' : '') + '</div>';
  };

  C.peopleProfiles = function (people) {
    return '<ul class="uol-people-profile-cards">' + (people || []).map(function (p) {
      var contact = [];
      if (p.email) contact.push({ term: 'Email', data: p.email });
      if (p.phone) contact.push({ term: 'Phone', data: p.phone });
      return '<li class="' + cls('uol-people-profile__card', p.image && 'uol-people-profile__card--image-layout') + '"><h3 class="uol-people-profile__name">' + (p.href ? '<a href="' + href(p.href) + '">' + esc(p.name) + '</a>' : esc(p.name)) + '</h3>' + (p.image ? '<img class="uol-people-profile__img" src="' + attr(p.image) + '" alt="' + attr(p.alt || ('Profile picture of ' + p.name)) + '">' : '') + (p.position ? '<strong class="uol-people-profile__position">' + esc(p.position) + '</strong>' : '') + (p.expertise ? C.infoList([{ term: 'Areas of expertise', data: p.expertise }]) : '') + (contact.length ? C.infoList(contact, true) : '') + '</li>';
    }).join('') + '</ul>';
  };

  C.table = function (p, indexTable) {
    var headers = cells(p.headers);
    var rows = lines(p.rows).map(cells);
    if (indexTable) {
      var caption = p.caption ? '<h2 class="uol-index-table-caption uol-index-table-caption__border">' + esc(p.caption) + '</h2>' : '';
      return caption + '<table class="' + cls('uol-index-table', 'js-uolTableStackable', p.sortable && 'uol-index-table--sortable') + ' "><thead><tr>' + headers.map(function (h) { return '<th class="uol-index-table__th "> ' + esc(h) + ' </th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td class="' + cls('uol-index-table__td', /^[\d.,%£$ -]+$/.test(c) && 'uol-index-table__td--type-numeric') + '" data-value="' + attr(c) + '"> ' + esc(c) + ' </td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    }
    return '<table>' + (p.caption ? '<caption>' + esc(p.caption) + '</caption>' : '') + '<thead><tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
  };

  C.imageQuote = function (p) {
    return '<section class="' + cls('image-quote', p.theme === 'cream' && 'image-quote--cream') + '"><div class="image-quote__edge"></div><div class="image-quote__img-and-video">' + (p.image ? '<img class="image-quote__img" src="' + attr(p.image) + '" alt="' + attr(p.alt || '') + '">' : '') + '</div><div class="image-quote__text-container"><div class="image-quote__text-container--inner"><blockquote class="uol-typography-blockquote"' + (p.citeHref ? ' cite="' + attr(p.citeHref) + '"' : '') + '> ' + esc(p.quote) + ' ' + (p.cite ? '<footer><cite>' + (p.citeHref ? '<a href="' + href(p.citeHref) + '"> ' + esc(p.cite) + ' </a>' : ' ' + esc(p.cite) + ' ') + '</cite></footer>' : '') + '</blockquote></div></div><div class="image-quote__edge"></div></section>';
  };

  C.taskBanner = function (p) {
    var radios = lines(p.courseTypes);
    var radioHtml = radios.length ? '<div class="uol-form__input-group uol-form__input-group--inline"><div class="uol-form__input-container "><div role="radiogroup" aria-labelledby="tb-radio-group" class="uol-form__custom-fieldset"><span id="tb-radio-group" class="uol-form__custom__legend">' + esc(p.radioLegend || 'Course type') + '</span><div class="uol-form__inputs-wrapper ">' + radios.map(function (r, i) {
      var id = 'tb-radio-' + i;
      return '<div class="uol-form__input--radio-wrapper"><input class="uol-form__input--radio" type="radio" id="' + id + '" name="course-type" value="' + attr(r.toLowerCase()) + '"' + (i === 0 ? ' checked' : '') + '><label class="uol-form__input--radio__label" for="' + id + '">' + esc(r) + '</label><span class="uol-form__input--custom-radio" hidden>' + svg('radio') + '</span></div>';
    }).join('') + '</div></div></div></div>' : '';
    var after = (p.afterLinks || []).filter(function (l) { return l.label; });
    var cards = (p.cards || []).map(function (c, i) {
      return '<div id="' + attr(c.group || ('card' + i)) + '" class="uol-content-block"><h3 class="uol-content-block__heading"> ' + esc(c.title) + ' </h3>' + (c.copy ? '<p class="uol-content-block__copy">' + esc(c.copy) + '</p>' : '') + (c.linkLabel ? '<p><a href="' + href(c.linkHref) + '" class="uol-content-block__arrow-link uol-arrow-link">' + esc(c.linkLabel) + '</a></p>' : '') + '</div>';
    }).join('');
    return '<section class="uol-task-banner" aria-label="task banner"><div class="uol-task-banner__outer"><div class="uol-task-banner__inner"><div class="uol-task-banner__key-task"><div class="uol-content-block"><h2 class="uol-content-block__heading"> ' + esc(p.heading) + ' </h2>' + (p.copy ? '<p class="uol-content-block__copy">' + esc(p.copy) + '</p>' : '') + (p.buttonLabel ? '<a class="uol-button uol-button--default " href="' + href(p.buttonHref) + '">' + esc(p.buttonLabel) + '</a>' : '') + '</div></div><div class="uol-task-banner__course-section"><div class="uol-task-banner__course-search"><div class="uol-form__container "><div class="uol-form__inner-wrapper"><h2 class="uol-form__title">' + esc(p.formTitle || 'Find your course') + '</h2><form class="uol-form" action="' + attr(p.searchAction || '#') + '" role="search" onsubmit="return false">' + radioHtml + '<div class="uol-form--button-inline"><div class="uol-form__inputs-wrapper"><div class="uol-form__input-container "><label class="uol-form__input-label" for="tb-search"><span class="uol-form__input-label__text">' + esc(p.searchLabel || 'Search courses') + '</span></label><div class="uol-form__input-wrapper uol-form__input-wrapper--search uol-form__input-wrapper--with-icon " data-field-invalid=false><input class="uol-form__input uol-form__input--search" type="search" id="tb-search" name="searchCourses" value="" autocomplete="off"></div></div></div><div class="uol-form__button-wrapper"><button class="uol-button uol-button--default " type="submit">' + esc(p.searchButton || 'Search') + '</button></div></div></form>' + (after.length ? '<div class="uol-rich-text"><div class="uol-form__additional-content uol-form__additional-content--after"><p>' + after.map(function (l) { return '<a href="' + href(l.href) + '">' + esc(l.label) + '</a>'; }).join('') + '</p></div></div>' : '') + '</div></div></div><div class="uol-task-banner__course-cards">' + cards + '</div></div></div></div></section>';
  };

  /* ---------- the registry ---------- */
  var B = {};
  function def(type, spec) { spec.type = type; B[type] = spec; }

  var linkFields = [F.text('label', 'Label'), F.url('href', 'URL')];
  var cardFields = [F.text('title', 'Title'), F.url('href', 'URL'), F.textarea('text', 'Summary'), F.date('date', 'Date (optional)'), F.image('image', 'Image'), F.text('alt', 'Image alt text')];

  /* === WIDGETS (homepage) === */
  def('ctas', {
    label: 'Calls to action (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: [F.bool('arrow', 'Show arrow icon'), F.list('items', 'Calls to action', [F.text('title', 'Title'), F.url('href', 'URL'), F.textarea('text', 'Short text')])],
    defaults: { arrow: false, items: [{ title: 'Open days and visits', href: '/open-days', text: 'Book your place at our next open day.' }, { title: 'How to apply', href: '/apply', text: 'Everything you need to know about applying to Leeds.' }] },
    render: function (p) { return widget('ctas', {}, '<div class="uol-in-text-ctas-wrapper">' + (p.items || []).map(function (i) { return C.inTextCta(i, p.arrow); }).join('') + '</div>'); }
  });

  def('featured-content', {
    label: 'Featured content (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([
      F.list('arrowLinks', 'Arrow links (in the head)', linkFields, { itemLabel: 'label' }),
      F.select('media', 'Media', [{ value: 'none', label: 'None' }, { value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }]),
      F.image('image', 'Image'), F.text('alt', 'Image alt text'), F.text('caption', 'Image caption'),
      F.url('videoUrl', 'Video URL (YouTube)'), F.text('videoTitle', 'Video title'),
      F.html('text', 'Body text')
    ]),
    defaults: { title: 'A featured content widget', lead: 'Short introduction to this featured item.', media: 'image', image: PH + 'banner/banner-02.jpg', alt: 'Students on campus', caption: 'Image caption. May be used for © notices', text: '<p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.</p>' },
    render: function (p) {
      var media = '';
      if (p.media === 'image' && p.image) media = '<figure class="uol-featured-image"><img class="uol-featured-image__img" src="' + attr(p.image) + '" alt="' + attr(p.alt || '') + '">' + (p.caption ? '<figcaption class="uol-featured-image__caption"> ' + esc(p.caption) + ' </figcaption>' : '') + '</figure>';
      if (p.media === 'video' && p.videoUrl) media = C.gallery([{ type: 'video', videoUrl: p.videoUrl, title: p.videoTitle, caption: p.videoTitle, image: p.image }], 'h2');
      return widget('featured-content', p, media + (p.text ? '<div class="uol-widget__content__text uol-rich-text">' + rich(p.text) + '</div>' : ''));
    }
  });

  def('content', {
    label: 'Content (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.html('body', 'Body content')]),
    defaults: { title: 'Content widget', lead: 'A lead sentence for this section.', body: '<p>Our widgets allow a block of rich text, including <strong>bold</strong>, links, lists and blockquotes.</p><blockquote><p>A short quote inside the content widget.</p></blockquote>' },
    render: function (p) { return widget('content', p, '<div class="uol-rich-text uol-spacing">' + rich(p.body) + '</div>'); }
  });

  def('facts-figures', {
    label: 'Facts and figures (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('items', 'Facts', [F.text('headline', 'Headline figure'), F.text('text', 'Description'), F.text('source', 'Source'), F.url('sourceHref', 'Source URL')], { itemLabel: 'headline' })]),
    defaults: { title: 'Facts and figures', items: [{ headline: 'Top 100', text: 'world ranking university', source: 'QS World University Rankings 2025', sourceHref: 'https://example.com' }, { headline: 'Over 9,000', text: 'international students from more than 170 countries' }, { headline: 'Top 10', text: 'UK university for research power', source: 'REF 2021' }] },
    render: function (p) { return widget('facts-figures', p, C.factsFigures(p.items)); }
  });

  def('facts-figures-v2', {
    label: 'Facts and figures v2 (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('items', 'Facts', [F.text('highlight', 'Highlight (number or word)'), F.icon('icon', 'Or icon'), F.text('text', 'Description'), F.text('source', 'Optional source line'), F.text('citation', 'Citation'), F.url('citationHref', 'Citation URL')], { itemLabel: 'text' })]),
    defaults: { title: 'Facts and figures (new style)', items: [{ highlight: '22,800', text: 'undergraduate students', citation: 'HESA 2024' }, { icon: 'mdiEarth', text: 'Students from more than 170 countries', citation: 'University data' }, { icon: 'mdiTrophyVariantOutline', text: 'Gold rated for teaching excellence', citation: 'TEF 2023', citationHref: 'https://example.com' }] },
    render: function (p) {
      return widget('facts-figures', p, '<div class="uol-facts-figures-v2-container">' + (p.items || []).map(function (f) {
        var head = f.highlight ? '<strong class="uol-facts-figures-v2__headline__1">' + esc(f.highlight) + '</strong>' : (f.icon ? '<div class="uol-facts-figures-v2__headline__1 in-text-icon uol-icon uol-icon--' + attr(f.icon) + '"></div>' : '');
        return '<div class="uol-facts-figures-v2"><div class="uol-facts-figures-v2__headline">' + head + '<p class="uol-facts-figures-v2__headline__2"> ' + esc(f.text) + ' </p></div>' + (f.source ? '<p class="uol-facts-figures-v2__optional-fact-source">' + esc(f.source) + '</p>' : '') + (f.citation ? '<div class="uol-facts-figures-v2__footer"><cite class="uol-facts-figures-v2__cite">' + (f.citationHref ? '<a href="' + href(f.citationHref) + '" class="uol-facts-figures-v2__link"> ' + esc(f.citation) + ' </a>' : ' ' + esc(f.citation) + ' ') + '</cite></div>' : '') + '</div>';
      }).join('') + '</div>');
    }
  });

  def('tiles', {
    label: 'Tiles (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('tiles', 'Tiles', [
      F.select('kind', 'Tile type', [{ value: 'image', label: 'Image tile' }, { value: 'text', label: 'Text only tile' }, { value: 'fact', label: 'Fact tile' }, { value: 'profile', label: 'Profile tile' }]),
      F.text('title', 'Title'), F.url('href', 'URL'), F.text('subtitle', 'Subtitle (max 140 chars)'), F.image('image', 'Image'), F.text('alt', 'Image alt text'), F.bool('isVideo', 'Show video icon'),
      F.text('factHeadline', 'Fact: headline'), F.text('factText', 'Fact: text'), F.text('factSource', 'Fact: source'), F.url('factSourceHref', 'Fact: source URL'),
      F.text('profileName', 'Profile: name'), F.text('profileRole', 'Profile: role'), F.text('profilePosition', 'Profile: course or position'), F.textarea('profileQuote', 'Profile: quote')
    ], { itemLabel: 'title' })]),
    defaults: { title: 'Explore Leeds', tiles: [{ kind: 'image', title: 'Libraries', subtitle: 'Four libraries on the main campus provide a variety of study environments', href: '/libraries', image: PH + 'ph-tiles-2.jpg', alt: 'Library interior' }, { kind: 'image', title: 'Student life at Leeds', href: '/student-life', image: PH + 'ph-tiles-3.jpg', alt: 'Students playing lacrosse', isVideo: true }, { kind: 'text', title: 'Accommodation', href: '/accommodation' }, { kind: 'fact', factHeadline: 'Top 100', factText: 'world ranking university', factSource: 'QS World University Rankings 2025' }, { kind: 'profile', profileName: 'Jessica Osgerby', profileRole: 'Student', profilePosition: 'BA Design', profileQuote: 'Leeds gave me the confidence to try things I never thought I would.', image: PH + 'ph-profile-student-11.jpg', href: '/profiles/jessica' }] },
    render: function (p) { return widget('tiles', p, C.tiles(p.tiles)); }
  });

  def('cards', {
    label: 'Cards (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.bool('featured', 'Featured layout (first card large)'), F.list('cards', 'Cards', cardFields)]),
    defaults: { title: 'A collection of cards', featured: false, cards: [{ title: 'First card', href: '#', text: 'Short summary for the first card.', image: PH + 'banner/banner-05.jpg', alt: 'Campus' }, { title: 'Second card', href: '#', text: 'Short summary for the second card.', image: PH + 'banner/banner-03.jpg', alt: 'Campus' }, { title: 'Third card', href: '#', text: 'Short summary for the third card.', image: PH + 'banner/banner-01.jpg', alt: 'Campus' }] },
    render: function (p) { return widget('cards', p, C.cards(p.cards, { featured: p.featured })); }
  });

  def('news-events', {
    label: 'News and events (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('cards', 'News items', cardFields)]),
    defaults: { title: 'Latest news', lead: 'Four stories. On some screen sizes only the first three are shown.', linkLabel: 'View all news', linkHref: '/news', cards: [{ title: 'Northern universities launch new investment company', href: '#', date: '2026-05-07', text: 'A new partnership will support spin-outs across the north of England.', image: PH + 'banner/banner-01.jpg', alt: '' }, { title: 'Welcome funding for medical humanities', href: '#', date: '2026-05-06', text: 'The award supports a five-year programme of interdisciplinary research.', image: PH + 'banner/banner-02.jpg', alt: '' }, { title: 'Leeds signs up to tackle waste in fashion', href: '#', date: '2026-05-01', text: 'Researchers join an industry-wide initiative on circular design.', image: PH + 'banner/banner-04.jpg', alt: '' }] },
    render: function (p) { return widget('news-events', p, C.cards(p.cards)); }
  });

  def('news-tiles', {
    label: 'News tiles (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('tiles', 'News tiles', [F.text('title', 'Headline'), F.url('href', 'URL'), F.date('date', 'Date'), F.image('image', 'Image'), F.text('alt', 'Image alt text')])]),
    defaults: { title: 'News', tiles: [{ title: 'University joins £3.4m health data initiative', href: '#', date: '2026-09-24', image: PH + 'tiles/parkinson.jpg', alt: 'Parkinson building' }, { title: 'Universities unite over global climate challenges', href: '#', date: '2026-09-22', image: PH + 'tiles/background.jpg', alt: 'Aerial photograph of a river' }, { title: 'Space research aims to boost Yorkshire economy', href: '#', date: '2026-09-20', image: PH + 'tiles/space.jpg', alt: 'Space' }, { title: 'Cancers detected early thanks to pioneering trial', href: '#', date: '2026-09-18', image: PH + 'ph-news-02.jpg', alt: 'Runners' }] },
    render: function (p) { return widget('news-tiles', p, C.newsTiles(p.tiles)); }
  });

  def('events', {
    label: 'Events (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('events', 'Events', [F.text('title', 'Title'), F.url('href', 'URL'), F.text('startDay', 'Start day (e.g. 19)'), F.text('startRest', 'Start month and year (e.g. July 2026)'), F.text('endDate', 'End date (optional, e.g. 25 August 2026)'), F.text('time', 'Time (optional, e.g. 11:00am – 4:30pm)')])]),
    defaults: { title: 'Events', linkLabel: 'View all events', linkHref: '/events', events: [{ title: 'Undergraduate open day', href: '#', startDay: '19', startRest: 'June 2026', time: '9:00am – 4:00pm' }, { title: 'Creating climate-resilient food systems', href: '#', startDay: '25', startRest: 'July', endDate: '25 August 2026', time: '11:00am – 4:30pm' }, { title: 'Postgraduate discovery day', href: '#', startDay: '10', startRest: 'October 2026' }] },
    render: function (p) { return widget('events', p, C.events(p.events)); }
  });

  def('description-list', {
    label: 'Description list (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('items', 'Items', [F.text('title', 'Title'), F.url('href', 'URL'), F.textarea('text', 'Description')])]),
    defaults: { title: 'Working with us', items: [{ title: 'Working with business', href: '#', text: 'Our expert team supports academics to exchange knowledge with industry.' }, { title: 'Short courses', href: '#', text: 'A range of short courses linked to our research and designed for people in industry.' }, { title: 'Outreach and public engagement', href: '#', text: 'Events and activities that showcase our subjects to schools and colleges.' }] },
    render: function (p) { return widget('description-list', p, C.descriptionList(p.items)); }
  });

  def('gallery', {
    label: 'Gallery (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('items', 'Gallery items', [F.select('type', 'Type', [{ value: 'image', label: 'Image' }, { value: 'video', label: 'Video' }]), F.text('title', 'Title'), F.image('image', 'Image'), F.text('alt', 'Alt text'), F.text('caption', 'Caption'), F.url('videoUrl', 'Video URL (YouTube)'), F.html('text', 'Description')])]),
    defaults: { title: 'Gallery', items: [{ type: 'image', title: '“Dual Form” by Barbara Hepworth', image: PH + 'campus/medium/29940.jpeg', alt: 'Dual Form sculpture with people relaxing on the grass', caption: '“Dual Form” by Barbara Hepworth', text: '<p>One of several public artworks on campus.</p>' }, { type: 'image', title: 'Edward Boyle Library', image: PH + 'campus/medium/28573.jpeg', alt: 'Steps outside Edward Boyle Library', text: '<p>Recently refurbished, with 24 hour study space.</p>' }, { type: 'image', title: 'Victoria Quarter', image: PH + 'campus/medium/29936.jpeg', alt: 'Interior of Victoria Quarter arcade', caption: 'Victoria Quarter', text: '<p>Leeds city centre is a ten minute walk from campus.</p>' }] },
    render: function (p) { return widget('gallery', p, C.gallery(p.items)); }
  });

  def('form', {
    label: 'Form (widget)', group: 'Forms', scope: ['homepage', 'document'],
    fields: [F.text('formTitle', 'Form title'), F.html('formLead', 'Lead text'), F.html('beforeText', 'Content before the form'), F.list('fields', 'Fields', [F.select('type', 'Field type', [{ value: 'text', label: 'Text' }, { value: 'email', label: 'Email' }, { value: 'tel', label: 'Telephone' }, { value: 'url', label: 'URL' }, { value: 'date', label: 'Date' }, { value: 'search', label: 'Search' }, { value: 'select', label: 'Select' }, { value: 'textarea', label: 'Textarea' }, { value: 'checkbox', label: 'Checkboxes' }, { value: 'radio', label: 'Radio buttons' }]), F.text('label', 'Label'), F.text('hint', 'Hint'), F.bool('required', 'Required'), F.select('size', 'Width', [{ value: '', label: 'Default' }, { value: 'x-small', label: 'Extra small' }, { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]), F.textarea('options', 'Options (one per line, for select/checkbox/radio)')], { itemLabel: 'label' }), F.text('buttonLabel', 'Button label'), F.html('afterText', 'Content after the form'), F.bool('centered', 'Centre the form')],
    defaults: { formTitle: 'Register your interest', formLead: 'We will send you details of upcoming events.', fields: [{ type: 'text', label: 'Full name', required: true, size: 'medium' }, { type: 'email', label: 'Email address', required: true, size: 'medium', hint: 'We will only use this to contact you about events' }, { type: 'select', label: 'Level of study', required: true, size: 'small', options: 'Undergraduate\nMasters\nResearch degree' }, { type: 'checkbox', label: 'Interests', options: 'Open days\nScholarships\nAccommodation' }], buttonLabel: 'Submit', centered: true },
    render: function (p, ctx) { return widget('', {}, C.form(p, 'form-' + ((ctx && ctx.blockId) || 'x').slice(-4))); }
  });

  def('list-featured', {
    label: 'Featured list (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.bool('ordered', 'Numbered list'), F.textarea('items', 'Items (one per line)')]),
    defaults: { title: 'Our strategic priorities', lead: 'The five commitments that shape our work to 2030.', ordered: true, items: 'Deliver outstanding student education.\nProduce world-leading research with real impact.\nBuild a diverse, inclusive and supportive community.\nWork with partners locally and globally.\nBecome a net zero university.' },
    render: function (p) {
      var tag = p.ordered ? 'ol' : 'ul';
      return widget('list-featured', p, '<' + tag + ' class="uol-list-featured">' + lines(p.items).map(function (i) { return '<li class="' + cls('uol-list-featured__item', p.ordered && 'uol-list-featured__item--ordered') + '">' + esc(i) + '</li>'; }).join('') + '</' + tag + '>');
    }
  });

  def('navigation-cards', {
    label: 'Navigation cards (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('cards', 'Cards', [F.text('title', 'Title (max 44 chars)'), F.url('href', 'URL'), F.textarea('description', 'Description (max 245 chars)')])]),
    defaults: { title: '', cards: [{ title: 'Undergraduate', href: '/undergraduate', description: 'Explore our undergraduate courses and find out how to apply.' }, { title: 'Masters', href: '/masters', description: 'Taught masters courses across every faculty.' }, { title: 'Research degrees', href: '/research', description: 'PhDs and research opportunities in a world top 100 university.' }, { title: 'International students', href: '/international', description: 'Information for students joining us from outside the UK.' }] },
    render: function (p) { return widget('navigation-cards', p, C.navigationCards(p.cards)); }
  });

  def('accreditation-logos', {
    label: 'Accreditation logos (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('logos', 'Logos', [F.image('src', 'Logo image'), F.text('alt', 'Alt text'), F.url('href', 'URL')], { itemLabel: 'alt' })]),
    defaults: { title: 'Our accreditations', logos: [{ src: PH + 'ph-accreditation-04.svg', alt: 'Association of MBAs', href: '#' }, { src: PH + 'ph-accreditation-05.svg', alt: 'EFMD', href: '#' }, { src: PH + 'ph-accreditation-06.svg', alt: 'AACSB', href: '#' }] },
    render: function (p) { return widget('accreditation-logos', p, C.accreditations(p.logos)); }
  });

  def('linked-list-widget', {
    label: 'Linked list (widget)', group: 'Widgets', scope: ['homepage', 'document'],
    fields: widgetHeadFields.concat([F.list('items', 'Links', linkFields, { itemLabel: 'label' })]),
    defaults: { title: 'Schools and institutes', items: [{ label: 'School of Design', href: '#' }, { label: 'School of Media and Communication', href: '#' }, { label: 'School of Fine Art, History of Art and Cultural Studies', href: '#' }, { label: 'Institute for Data Analytics', href: '#' }] },
    render: function (p) { return widget('linked-list', p, C.linkedList(p.items)); }
  });

  def('image-quote', {
    label: 'Image quote', group: 'Widgets', scope: ['homepage', 'document'],
    fields: [F.textarea('quote', 'Quote'), F.text('cite', 'Attribution'), F.url('citeHref', 'Attribution URL'), F.image('image', 'Portrait image'), F.text('alt', 'Alt text'), F.select('theme', 'Theme', [{ value: 'default', label: 'Default' }, { value: 'cream', label: 'Cream' }])],
    defaults: { quote: 'This whole experience has taught me to put myself out there. If I had been too afraid to come to Leeds, I would not be where I am now.', cite: 'Katie, Law LLB', citeHref: '#', image: PH + 'new-homepage/student-portrait-2.png', alt: 'Portrait of Katie', theme: 'cream' },
    render: function (p) { return C.imageQuote(p); }
  });

  def('task-banner', {
    label: 'Task banner (course search)', group: 'Widgets', scope: ['homepage'],
    fields: [F.text('heading', 'Heading'), F.textarea('copy', 'Copy'), F.text('buttonLabel', 'Button label'), F.url('buttonHref', 'Button URL'), F.text('formTitle', 'Search form title'), F.text('radioLegend', 'Radio legend'), F.textarea('courseTypes', 'Course types (one per line)'), F.text('searchLabel', 'Search field label'), F.text('searchButton', 'Search button label'), F.list('afterLinks', 'Links under the search', linkFields, { itemLabel: 'label' }), F.list('cards', 'Content cards', [F.text('title', 'Title'), F.textarea('copy', 'Copy'), F.text('linkLabel', 'Arrow link label'), F.url('linkHref', 'Arrow link URL'), F.text('group', 'Group id (e.g. undergraduate1, masters1)')])],
    defaults: { heading: 'Shape the world you want', copy: 'Starting with your experiences at the University of Leeds and going far beyond, to the industry, career and society you are equipped to thrive in.', buttonLabel: 'Hear from our students', buttonHref: '#', formTitle: 'Find your course', radioLegend: 'Course type', courseTypes: 'Undergraduate\nMasters', searchLabel: 'Search courses', searchButton: 'Search', afterLinks: [{ label: 'Course A-Z', href: '#' }, { label: 'Browse by subject', href: '#' }], cards: [{ title: 'Open days and campus visits', copy: 'Get a feel for our campus and university life at Leeds', linkLabel: 'Upcoming open days', linkHref: '#', group: 'undergraduate1' }, { title: 'Help with your application', copy: 'All you need to know in our step-by-step guide to applying', linkLabel: 'Application information', linkHref: '#', group: 'undergraduate2' }, { title: 'Postgraduate discovery days', copy: 'Ask our experts anything about masters study.', linkLabel: 'Upcoming fairs', linkHref: '#', group: 'masters1' }, { title: 'Funding and scholarships', copy: 'Learn about the different ways we can help you fund your studies', linkLabel: 'Funding options', linkHref: '#', group: 'masters2' }] },
    render: function (p) { return C.taskBanner(p); }
  });

  def('key-facts', {
    label: 'Key facts', group: 'Widgets', scope: ['homepage', 'document', 'article'],
    fields: [F.list('items', 'Facts', [F.text('term', 'Label'), F.textarea('data', 'Value')], { itemLabel: 'term' })],
    defaults: { items: [{ term: 'Start date', data: 'September 2026' }, { term: 'Duration', data: '3 years full time' }, { term: 'UCAS code', data: 'W240' }] },
    render: function (p) { return '<div class="uol-key-facts"><div class="uol-content-container"><div class="uol-col-container uol-col-container--key-facts"><dl class="uol-key-facts__list">' + (p.items || []).map(function (i) { return '<div class="uol-key-facts__group"><dt class="uol-key-facts__term">' + esc(i.term) + '</dt><dd class="uol-key-facts__data">' + esc(i.data).replace(/\n/g, '<br>') + '</dd></div>'; }).join('') + '</dl></div></div></div>'; }
  });

  def('people-profiles', {
    label: 'People profile cards', group: 'Widgets', scope: ['homepage', 'document', 'article'],
    fields: [F.list('people', 'People', [F.text('name', 'Name'), F.url('href', 'Profile URL'), F.text('position', 'Position'), F.image('image', 'Photo'), F.textarea('expertise', 'Areas of expertise (one per line)'), F.text('email', 'Email'), F.text('phone', 'Phone')], { itemLabel: 'name' })],
    defaults: { people: [{ name: 'Isla Ellis', href: '#', position: 'Lecturer in Algebra', expertise: 'Representation theory\nAlgebraic combinatorics', email: 'I.Ellis@leeds.ac.uk', phone: '+44(0)113 343 4433' }, { name: 'Tony Bailey', href: '#', position: 'Associate Professor in Inclusive Education', image: PH + 'ph-profile-staff-01.jpg', expertise: 'Deaf education\nInclusive education', email: 't.bailey@leeds.ac.uk' }] },
    render: function (p) { return C.peopleProfiles(p.people); }
  });

  /* === CONTENT (inline on document pages) === */
  def('rich-text', {
    label: 'Rich text', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.html('html', 'Content', { tall: true })],
    defaults: { html: '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p><h2>A heading</h2><p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p><ul><li>First point</li><li>Second point</li></ul>' },
    render: function (p) { return rich(p.html); }
  });

  def('heading', {
    label: 'Heading', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.text('text', 'Heading text'), F.select('level', 'Level', [{ value: '2', label: 'H2' }, { value: '3', label: 'H3' }, { value: '4', label: 'H4' }, { value: '5', label: 'H5' }, { value: '6', label: 'H6' }]), F.bool('sans', 'Sans serif style')],
    defaults: { text: 'Section heading', level: '2', sans: false },
    render: function (p) { var l = p.level || '2'; return '<h' + l + (p.sans ? ' class="uol-typography-heading-' + l + '--sans-serif"' : '') + '>' + esc(p.text) + '</h' + l + '>'; }
  });

  def('paragraph', {
    label: 'Paragraph', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.textarea('text', 'Text'), F.select('style', 'Style', [{ value: '', label: 'Default' }, { value: 'intro', label: 'Intro (lead)' }, { value: 'small', label: 'Small' }, { value: 'serif', label: 'Serif' }])],
    defaults: { text: 'A single paragraph of text.', style: '' },
    render: function (p) { var c = p.style === 'intro' ? ' class="uol-typography-paragraph-intro"' : p.style === 'small' ? ' class="uol-typography-paragraph-small"' : p.style === 'serif' ? ' class="uol-typography-paragraph--serif"' : ''; return '<p' + c + '>' + esc(p.text) + '</p>'; }
  });

  def('list', {
    label: 'Bullet or numbered list', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.bool('ordered', 'Numbered'), F.textarea('items', 'Items (one per line)')],
    defaults: { ordered: false, items: 'First item\nSecond item\nThird item' },
    render: function (p) { var t = p.ordered ? 'ol' : 'ul'; return '<' + t + '>' + lines(p.items).map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</' + t + '>'; }
  });

  def('blockquote', {
    label: 'Blockquote', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.textarea('text', 'Quote'), F.text('cite', 'Attribution'), F.url('citeHref', 'Attribution URL')],
    defaults: { text: 'A successful design system liberates the team from reinventing the wheel. It allows you to focus on what really matters.', cite: 'Andrew Couldwell, Laying the Foundations' },
    render: function (p) { return '<blockquote class="uol-typography-blockquote"' + (p.citeHref ? ' cite="' + attr(p.citeHref) + '"' : '') + '><p>' + esc(p.text) + '</p>' + (p.cite ? '<footer><cite>' + (p.citeHref ? '<a href="' + href(p.citeHref) + '"> ' + esc(p.cite) + ' </a>' : ' ' + esc(p.cite) + ' ') + '</cite></footer>' : '') + '</blockquote>'; }
  });

  def('pull-quote', {
    label: 'Pull quote', group: 'Content', scope: ['document', 'article'], inline: true,
    fields: [F.textarea('text', 'Quote'), F.select('align', 'Alignment', [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }])],
    defaults: { text: 'A pull quote repeats a key sentence from the body text.', align: 'left' },
    render: function (p) { return '<div aria-hidden="true" class="uol-typography-pull-quote uol-typography-pull-quote--' + (p.align === 'right' ? 'right' : 'left') + '"><p>' + esc(p.text) + '</p></div>'; }
  });

  def('text-highlight', {
    label: 'Text highlight', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.html('html', 'Content')],
    defaults: { html: '<p>Highlighted paragraph that stands out from the body text, for example an important notice.</p>' },
    render: function (p) { return '<div class="text-highlight">' + rich(p.html) + '</div>'; }
  });

  def('highlight-block', {
    label: 'Highlight block', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.html('html', 'Content')],
    defaults: { html: '<p>A highlight block with a tinted background for related information.</p>' },
    render: function (p) { return '<div class="uol-highlight-block"><div class="uol-rich-text">' + rich(p.html) + '</div></div>'; }
  });

  def('in-text-cta', {
    label: 'In-text calls to action', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.bool('arrow', 'Show arrow icon'), F.list('items', 'Calls to action', [F.text('title', 'Title'), F.url('href', 'URL'), F.textarea('text', 'Short text')])],
    defaults: { arrow: true, items: [{ title: 'Book an open day', href: '#', text: 'See the campus and meet our staff and students.' }, { title: 'Order a prospectus', href: '#', text: 'Everything about our courses in one place.' }] },
    render: function (p) { return '<div class="uol-in-text-ctas-wrapper">' + (p.items || []).map(function (i) { return C.inTextCta(i, p.arrow); }).join('') + '</div>'; }
  });

  def('in-text-facts', {
    label: 'In-text facts', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.text('title', 'Title'), F.list('items', 'Facts', [F.text('title', 'Fact title'), F.text('description', 'Description'), F.url('href', 'URL (optional)')])],
    defaults: { title: 'Key facts', items: [{ title: '3 years', description: 'Full time duration' }, { title: 'September', description: 'Start date', href: '#' }] },
    render: function (p) { return '<div class="uol-in-text-facts">' + (p.title ? '<h3 class="uol-in-text-facts__title"> ' + esc(p.title) + ' </h3>' : '') + '<div class="uol-in-text-facts__container ">' + (p.items || []).map(function (i) { var inner = '<h4 class="uol-in-text-fact__item__title"> ' + esc(i.title) + ' </h4><p class="uol-in-text-fact__item__description"> ' + esc(i.description) + ' </p>'; return i.href ? '<a href="' + href(i.href) + '" class="uol-in-text-fact__item uol-in-text-fact__link">' + inner + '</a>' : '<div class="uol-in-text-fact__item">' + inner + '</div>'; }).join('') + '</div></div>'; }
  });

  def('accordion', {
    label: 'Accordion', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.select('level', 'Heading level', [{ value: '2', label: 'H2' }, { value: '3', label: 'H3' }, { value: '4', label: 'H4' }]), F.list('items', 'Sections', [F.text('title', 'Title'), F.html('content', 'Content')])],
    defaults: { level: '3', items: [{ title: 'Faculty of Arts, Humanities and Cultures', content: '<p>Content for the first accordion section.</p><ul><li>One</li><li>Two</li></ul>' }, { title: 'Faculty of Biological Sciences', content: '<p>Content for the second accordion section.</p>' }] },
    render: function (p) { var l = p.level || '3'; return (p.items || []).map(function (i) { return '<div class="uol-accordion"><h' + l + ' class="uol-accordion__title"> ' + esc(i.title) + ' </h' + l + '><div class="uol-accordion__content"><div class="uol-accordion__content-inner"><div class="uol-rich-text">' + rich(i.content) + '</div></div></div></div>'; }).join(''); }
  });

  def('table', {
    label: 'Table', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.text('caption', 'Caption'), F.text('headers', 'Column headers (separate with |)'), F.textarea('rows', 'Rows (one per line, cells separated with |)', { tall: true })],
    defaults: { caption: 'Term dates 2026/27', headers: 'Term | Starts | Ends', rows: 'Semester 1 | 21 September 2026 | 22 January 2027\nSemester 2 | 25 January 2027 | 18 June 2027' },
    render: function (p) { return C.table(p, false); }
  });

  def('image', {
    label: 'Image', group: 'Media', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.image('src', 'Image'), F.text('alt', 'Alt text'), F.text('caption', 'Caption'), F.bool('featured', 'Featured image style')],
    defaults: { src: PH + 'ph-event-01.jpg', alt: 'Actors on stage', caption: 'Picture credit: University of Leeds', featured: false },
    render: function (p) { if (p.featured) return '<figure class="uol-featured-image"><img class="uol-featured-image__img" src="' + attr(p.src) + '" alt="' + attr(p.alt || '') + '">' + (p.caption ? '<figcaption class="uol-featured-image__caption"> ' + esc(p.caption) + ' </figcaption>' : '') + '</figure>'; return p.caption ? '<figure><img src="' + attr(p.src) + '" alt="' + attr(p.alt || '') + '"><figcaption>' + esc(p.caption) + '</figcaption></figure>' : '<img src="' + attr(p.src) + '" alt="' + attr(p.alt || '') + '">'; }
  });

  def('image-pair', {
    label: 'Image pair', group: 'Media', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.list('images', 'Images (up to 2)', [F.image('src', 'Image'), F.text('alt', 'Alt text'), F.text('caption', 'Caption')], { itemLabel: 'caption', max: 2 })],
    defaults: { images: [{ src: PH + 'campus/medium/23300.jpeg', alt: 'Campus', caption: 'Caption one' }, { src: PH + 'campus/medium/23305.jpeg', alt: 'Campus', caption: 'Caption two' }] },
    render: function (p) { return '<div class="uol-image-pair">' + (p.images || []).slice(0, 2).map(function (i) { return '<figure class="uol-image-pair__container"><img class="uol-image-pair__image " src="' + attr(i.src) + '" alt="' + attr(i.alt || '') + '">' + (i.caption ? '<figcaption class="uol-image-pair__caption">' + esc(i.caption) + '</figcaption>' : '') + '</figure>'; }).join('') + '</div>'; }
  });

  def('video', {
    label: 'Video embed', group: 'Media', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.url('url', 'YouTube or Vimeo URL'), F.text('title', 'Accessible title')],
    defaults: { url: 'https://www.youtube.com/watch?v=AjvkAkHZAzc', title: 'Studying abroad' },
    render: function (p) { return '<iframe width="560" height="315" src="' + attr(ytEmbed(p.url)) + '" title="' + attr(p.title || 'Video') + '" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>'; }
  });

  def('iframe', {
    label: 'Embedded content (iframe)', group: 'Media', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.url('src', 'URL'), F.text('title', 'Accessible title'), F.number('height', 'Height (px)')],
    defaults: { src: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d945.9441538079813!2d-1.5536401236388144!3d53.80749174258921!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x48795ea98c000001%3A0xa460454678f77e00!2sThe%20Parkinson%20Building!5e0!3m2!1sen!2suk!4v1685529471450!5m2!1sen!2suk', title: 'The Parkinson building on a map', height: 400 },
    render: function (p) { return '<iframe class="uol-iframe" src="' + attr(p.src) + '" title="' + attr(p.title || '') + '"' + (p.height ? ' style="height:' + parseInt(p.height, 10) + 'px"' : '') + '></iframe>'; }
  });

  def('link-buttons', {
    label: 'Link buttons', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.list('buttons', 'Buttons', [F.text('label', 'Label'), F.url('href', 'URL'), F.select('style', 'Style', [{ value: 'primary', label: 'Primary' }, { value: '', label: 'Default' }, { value: 'secondary', label: 'Secondary' }]), F.select('icon', 'Icon', [{ value: '', label: 'None' }].concat(ICONS.map(function (i) { return { value: i, label: i.replace(/^mdi/, '') }; })))], { itemLabel: 'label' })],
    defaults: { buttons: [{ label: 'Apply now', href: '#', style: 'primary' }, { label: 'Contact us', href: '#', style: '' }] },
    render: function (p) { return '<div class="uol-link-button-container">' + (p.buttons || []).map(function (b) { return '<a class="' + cls('uol-button uol-link-button', 'uol-button--' + (b.style || ''), b.icon && 'uol-icon uol-icon--' + b.icon + ' uol-icon--position-after') + ' " href="' + href(b.href) + '">' + esc(b.label) + '</a>'; }).join('') + '</div>'; }
  });

  def('button', {
    label: 'Button', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.text('label', 'Label'), F.url('href', 'URL'), F.select('style', 'Style', [{ value: 'primary', label: 'Primary' }, { value: '', label: 'Default' }, { value: 'secondary', label: 'Secondary' }]), F.select('icon', 'Icon', [{ value: '', label: 'None' }].concat(ICONS.map(function (i) { return { value: i, label: i.replace(/^mdi/, '') }; }))), F.bool('iconAfter', 'Icon after label')],
    defaults: { label: 'Contact', href: '#', style: '', icon: '', iconAfter: false },
    render: function (p) { return '<a class="' + cls('uol-button', 'uol-button--' + (p.style || ''), p.icon && 'uol-icon uol-icon--' + p.icon, p.icon && p.iconAfter && 'uol-icon--position-after') + ' " href="' + href(p.href) + '">' + esc(p.label) + '</a>'; }
  });

  def('arrow-link', {
    label: 'Arrow link', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.text('label', 'Label'), F.url('href', 'URL'), F.select('tag', 'Wrap in', [{ value: 'p', label: 'Paragraph' }, { value: 'h2', label: 'H2' }, { value: 'h3', label: 'H3' }, { value: 'h4', label: 'H4' }])],
    defaults: { label: 'Text link with arrow effect', href: '#', tag: 'p' },
    render: function (p) { var t = p.tag || 'p'; return '<' + t + '><a href="' + href(p.href) + '" class="uol-arrow-link">' + esc(p.label) + '</a></' + t + '>'; }
  });

  def('logo-group', {
    label: 'Logo group', group: 'Media', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.list('logos', 'Logos', [F.image('src', 'Logo image'), F.text('alt', 'Alt text'), F.text('label', 'Link label'), F.url('href', 'URL')], { itemLabel: 'label' })],
    defaults: { logos: [{ src: PH + 'ph-accreditation-05.svg', alt: 'EFMD', label: 'EFMD', href: '#' }, { src: PH + 'ph-accreditation-06.svg', alt: 'AACSB', label: 'AACSB', href: '#' }, { src: PH + 'ph-accreditation-07.svg', alt: 'University of Leeds', label: 'University of Leeds', href: '#' }] },
    render: function (p) { return '<div class="uol-logo-group">' + (p.logos || []).map(function (l) { return '<div class="uol-logo-group-item"><div class="uol-logo-group-item__container"><img class="uol-logo-group-item__logo" src="' + attr(l.src) + '" alt="' + attr(l.alt || '') + '"></div>' + (l.label ? '<a class="uol-logo-group-item__link" href="' + href(l.href) + '">' + esc(l.label) + '</a>' : '') + '</div>'; }).join('') + '</div>'; }
  });

  def('in-text-icons', {
    label: 'In-text icons', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.list('items', 'Icons', [F.icon('icon', 'Icon'), F.text('label', 'Label')], { itemLabel: 'label' })],
    defaults: { items: [{ icon: 'mdiWifi', label: 'Fast Wi-Fi' }, { icon: 'mdiDumbbell', label: 'On-site gym' }, { icon: 'mdiCoffeeOutline', label: 'Cafes nearby' }, { icon: 'mdiParking', label: 'Parking' }] },
    render: function (p) { return '<ul class="in-text-icons">' + (p.items || []).map(function (i) { return '<li class="in-text-icon uol-icon uol-icon--' + attr(i.icon) + '">' + esc(i.label) + '</li>'; }).join('') + '</ul>'; }
  });

  def('linked-list', {
    label: 'Linked list', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.list('items', 'Links', linkFields, { itemLabel: 'label' })],
    defaults: { items: [{ label: 'School of Typography', href: '#' }, { label: 'School of Web Design', href: '#' }, { label: 'Institute of Content Design', href: '#' }] },
    render: function (p) { return C.linkedList(p.items); }
  });

  def('info-list', {
    label: 'Info list', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.bool('inline', 'Inline layout'), F.list('groups', 'Groups', [F.text('term', 'Term'), F.textarea('data', 'Values (one per line)')], { itemLabel: 'term' })],
    defaults: { inline: false, groups: [{ term: 'Email', data: 'study@leeds.ac.uk' }, { term: 'Phone', data: '+44 (0)113 343 2336' }, { term: 'Opening hours', data: 'Monday to Friday\n9am to 5pm' }] },
    render: function (p) { return C.infoList(p.groups, p.inline); }
  });

  def('status-message', {
    label: 'Status message', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.select('kind', 'Type', [{ value: 'info', label: 'Info' }, { value: 'success', label: 'Success' }, { value: 'warning', label: 'Warning' }, { value: 'error', label: 'Error' }]), F.html('text', 'Message')],
    defaults: { kind: 'info', text: '<strong>Applications</strong> for September 2026 are now open.' },
    render: function (p) { var k = p.kind || 'info'; var label = k.charAt(0).toUpperCase() + k.slice(1); return '<div class="uol-status-message uol-status-message--' + k + ' "><span class="uol-icon uol-icon--status-' + k + ' "><span class="hide-accessible">' + label + ':</span>' + String(p.text || '').replace(/^<p>|<\/p>$/g, '') + ' </span></div>'; }
  });

  def('chips', {
    label: 'Chips', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.list('items', 'Chips', linkFields, { itemLabel: 'label' })],
    defaults: { items: [{ label: 'Undergraduate', href: '#' }, { label: 'Engineering', href: '#' }, { label: 'September 2026', href: '#' }] },
    render: function (p) { return '<ul class="uol-chips">' + (p.items || []).map(function (i) { return '<li class="uol-chips__item"><a class="uol-chips__button"' + (i.href ? ' href="' + href(i.href) + '"' : '') + '><span class="uol-chips__text" role="text"><span class="hide-accessible">Cancel</span> ' + esc(i.label) + ' </span><span class="uol-chips__delete-icon">' + svg('close') + '</span></a></li>'; }).join('') + '</ul>'; }
  });

  def('publications', {
    label: 'Publications list', group: 'Data', scope: ['document', 'article'], inline: true,
    fields: [F.list('items', 'Publications', [F.text('title', 'Title'), F.text('parentTitle', 'Journal or parent title'), F.text('authors', 'Authors'), F.text('date', 'Publication date'), F.text('volume', 'Volume'), F.text('issue', 'Issue'), F.text('pages', 'Pages'), F.url('href', 'Link URL'), F.text('linkLabel', 'Link site name')])],
    defaults: { items: [{ title: 'Research and Education in Computational Science and Engineering', parentTitle: 'SIAM Review', authors: 'Rüde U, Willcox K, McInnes LC', date: '2018-11-18', volume: '60', issue: '3', pages: '707-754', href: '#', linkLabel: 'White Rose Research Online' }] },
    render: function (p) { return (p.items || []).map(function (i) { var meta = [['Online publication date', i.date], ['Volume', i.volume], ['Issue', i.issue], ['Pages', i.pages]].filter(function (m) { return m[1]; }); return '<div class="uol-publications-list"><div class="uol-publications-list__publication-title">' + esc(i.title) + '</div>' + (i.parentTitle ? '<div class="uol-publications-list__content-group"><span class="uol-publications-list__title">Parent title: </span><span>' + esc(i.parentTitle) + '</span></div>' : '') + (i.authors ? C.infoList([{ term: 'Authors', data: i.authors }]) : '') + (meta.length ? '<div class="uol-publications-list__content-group">' + meta.map(function (m) { return '<span class="uol-publications-list__title">' + m[0] + ': </span><span class="uol-publications-list__value">' + esc(m[1]) + '</span>'; }).join('') + '</div>' : '') + (i.href ? '<div class="uol-publications-list__link-container"><div class="uol-publications-list__link-outer"><a class="uol-publications-list__content-group uol-publications-list__link" href="' + href(i.href) + '"><span>Open publication on </span><span>' + esc(i.linkLabel || 'external website') + '</span></a></div></div>' : '') + '</div>'; }).join(''); }
  });

  def('index-table', {
    label: 'Index table (stackable, sortable)', group: 'Data', scope: ['document', 'article', 'homepage'],
    fields: [F.text('caption', 'Caption'), F.text('headers', 'Column headers (separate with |)'), F.textarea('rows', 'Rows (one per line, cells separated with |)', { tall: true }), F.bool('sortable', 'Sortable columns')],
    defaults: { caption: 'Cheeses', headers: 'Name | Country of origin | Fat percentage', rows: 'Cheddar | UK | 16%\nBrie | France | 28%\nEdam | Netherlands | 11%', sortable: false },
    render: function (p) { return C.table(p, true); }
  });

  def('pagination', {
    label: 'Pagination', group: 'Navigation', scope: ['document', 'article', 'homepage'],
    fields: [F.number('current', 'Current page'), F.number('total', 'Total pages'), F.text('baseHref', 'Base URL (page number is appended)')],
    defaults: { current: 2, total: 4, baseHref: '?page=' },
    render: function (p) {
      var cur = parseInt(p.current, 10) || 1, tot = parseInt(p.total, 10) || 1, b = p.baseHref || '?page=';
      var items = [];
      items.push('<li class="uol-pagination__item"><a href="' + attr(b + 1) + '" class="uol-button uol-button--primary uol-icon uol-icon--icon-only uol-icon--mdiPageFirst">First page</a></li>');
      items.push('<li class="uol-pagination__item"><a href="' + attr(b + Math.max(1, cur - 1)) + '" class="uol-button uol-button--primary uol-icon uol-icon--icon-only uol-icon--mdiArrowLeft">Previous page</a></li>');
      for (var i = 1; i <= tot; i++) items.push('<li class="' + cls('uol-pagination__item uol-pagination__item--numeric', i === cur && 'uol-pagination__item--current') + '"><a class="uol-button uol-button--secondary uol-icon uol-icon--icon-only uol-pagination__link" href="' + attr(b + i) + '" data-number="' + i + '"' + (i === cur ? ' aria-current="page"' : '') + '><span class="uol-icon__label"><span class="hide-accessible">Page </span>' + i + ' </span></a></li>');
      items.push('<li class="uol-pagination__item"><a href="' + attr(b + Math.min(tot, cur + 1)) + '" class="uol-button uol-button--primary uol-icon uol-icon--icon-only uol-icon--mdiArrowRight">Next page</a></li>');
      items.push('<li class="uol-pagination__item"><a href="' + attr(b + tot) + '" class="uol-button uol-button--primary uol-icon uol-icon--icon-only uol-icon--mdiPageLast">Last page</a></li>');
      return '<nav class="uol-pagination" aria-label="pagination"><ol class="uol-pagination__list">' + items.join('') + '</ol><span class="uol-pagination__status"> Page ' + cur + ' of ' + tot + ' </span></nav>';
    }
  });

  def('year-of-entry', {
    label: 'Year of entry', group: 'Content', scope: ['document', 'article', 'homepage'],
    fields: [F.text('label', 'Label'), F.text('year', 'Year')],
    defaults: { label: 'Year of entry', year: '2026' },
    render: function (p) { return '<div class="uol-year-of-entry"><h2 class="uol-year-of-entry__title"> ' + esc(p.label) + ' <span class="uol-year-of-entry__date">' + esc(p.year) + '</span></h2></div>'; }
  });

  def('content-block', {
    label: 'Content block', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [F.text('topic', 'Topic (optional)'), F.text('heading', 'Heading'), F.text('date', 'Date (optional)'), F.textarea('copy', 'Body copy'), F.text('linkLabel', 'Text link label'), F.url('linkHref', 'Text link URL'), F.text('arrowLinkLabel', 'Arrow link label'), F.url('arrowLinkHref', 'Arrow link URL'), F.text('buttonLabel', 'Button label'), F.url('buttonHref', 'Button URL')],
    defaults: { topic: 'Research', heading: 'Mandatory title', copy: 'Optional body copy for the content block.', arrowLinkLabel: 'Find out more', arrowLinkHref: '#' },
    render: function (p) { return C.contentBlock(p); }
  });

  def('article-highlight', {
    label: 'Article highlight (author box)', group: 'Content', scope: ['document', 'article'],
    fields: [F.text('title', 'Title'), F.text('subtitle', 'Subtitle'), F.textarea('text', 'Text')],
    defaults: { title: 'The author', subtitle: 'Dr Anna Hogg, School of Earth and Environment', text: 'Anna is an Earth observation expert whose research uses satellite data to monitor glaciers and ice sheets.' },
    render: function (p) { return '<aside class="uol-article-highlight uol-content-switch-from-side-to-main"><h2 class="uol-article-highlight__title">' + esc(p.title) + '</h2>' + (p.subtitle ? '<p class="uol-article-highlight__subtitle">' + esc(p.subtitle) + '</p>' : '') + (p.text ? '<p class="uol-article-highlight__paragraph">' + esc(p.text) + '</p>' : '') + '</aside>'; }
  });

  def('profile-supplement', {
    label: 'Profile supplement', group: 'Content', scope: ['document', 'article', 'homepage'],
    fields: [F.text('name', 'Name'), F.textarea('quote', 'Quote'), F.text('cite', 'Attribution'), F.image('image', 'Portrait'), F.text('linkLabel', 'Link label'), F.url('linkHref', 'Link URL')],
    defaults: { name: 'Jefferson Sanchez', quote: 'I love thinking outside the box, so if you are enthusiastic and want to learn something new with cutting-edge technology, then Leeds is the place to be.', cite: 'Jefferson Sanchez, Research-based learning', image: PH + 'ph-profile-staff-02.jpg', linkLabel: 'Find out more about Jefferson\'s time at Leeds', linkHref: '#' },
    render: function (p) { return '<aside class="uol-profile-supplement"><h2 class="uol-profile-supplement__title">Profile: ' + esc(p.name) + '</h2><div class="uol-profile-supplement__body">' + (p.image ? '<div class="uol-profile-supplement__image-container"><div class="uol-profile-image"><div class="uol-profile-image__img" role="img"' + bgimg(p.image) + ' aria-label="Portrait of ' + attr(p.name) + '"></div></div></div>' : '') + '<div class="uol-profile-supplement__text-container"><blockquote class="uol-typography-blockquote"><p>' + esc(p.quote) + '</p>' + (p.cite ? '<footer><cite> ' + esc(p.cite) + ' </cite></footer>' : '') + '</blockquote>' + (p.linkLabel ? '<a class="uol-profile-supplement__link" href="' + href(p.linkHref) + '">' + esc(p.linkLabel) + '</a>' : '') + '</div></div></aside>'; }
  });

  def('hr', {
    label: 'Horizontal rule', group: 'Content', scope: ['document', 'article', 'homepage'], inline: true,
    fields: [], defaults: {},
    render: function () { return '<hr>'; }
  });

  def('raw-html', {
    label: 'Raw HTML', group: 'Advanced', scope: ['document', 'article', 'homepage'],
    fields: [F.textarea('html', 'HTML (rendered as-is)', { tall: true, mono: true }), F.bool('inline', 'Treat as rich text (wrap in rich-text container on document pages)')],
    defaults: { html: '<div class="uol-rich-text"><p>Any design system markup can be pasted here.</p></div>', inline: false },
    render: function (p) { return String(p.html || ''); }
  });

  def('spacer', {
    label: 'Spacer', group: 'Advanced', scope: ['document', 'article', 'homepage'],
    fields: [F.select('size', 'Size', [{ value: '1rem', label: 'Small (16px)' }, { value: '2rem', label: 'Medium (32px)' }, { value: '3rem', label: 'Large (48px)' }, { value: '5rem', label: 'Extra large (80px)' }])],
    defaults: { size: '2rem' },
    render: function (p) { return '<div class="uol-cms-spacer" style="height:' + attr(p.size || '2rem') + '" aria-hidden="true"></div>'; }
  });

  /* ---------- public API ---------- */
  var GROUP_ORDER = ['Widgets', 'Content', 'Media', 'Forms', 'Data', 'Navigation', 'Advanced'];

  function defaultsFor(type) {
    var spec = B[type];
    return spec ? JSON.parse(JSON.stringify(spec.defaults || {})) : {};
  }

  function render(block, ctx) {
    var spec = B[block.type];
    if (!spec) return '<div class="uol-cms-unknown">Unknown block type: ' + esc(block.type) + '</div>';
    try {
      return spec.render(Object.assign({}, spec.defaults || {}, block.props || {}), Object.assign({ blockId: block.id }, ctx || {}));
    } catch (e) {
      return '<div class="uol-cms-unknown">Block "' + esc(block.type) + '" failed to render: ' + esc(e.message) + '</div>';
    }
  }

  function isInline(block) {
    var spec = B[block.type];
    if (!spec) return false;
    if (block.type === 'raw-html') return !!(block.props && block.props.inline);
    return !!spec.inline;
  }

  /* ---------- component libraries: what each kind of page can hold ----------
     Homepages take the widgets as well as everything else. Document pages take what the Jadu rich text editor
     offers, since that is all a Jadu document page holds. Articles keep the blocks designed for them.
     A project can add or remove components from a library (site.libraries[template] = { on: [], off: [] });
     storing only the changes means new components still arrive in the libraries they belong to. */
  var TEMPLATES = { homepage: 'Homepage', document: 'Document page', article: 'Article' };
  var LIBRARY_DEFAULTS = {
    document: ['rich-text', 'heading', 'paragraph', 'list', 'blockquote', 'pull-quote', 'text-highlight', 'highlight-block', 'in-text-cta', 'in-text-facts',
      'accordion', 'table', 'image', 'button', 'arrow-link', 'linked-list', 'status-message', 'raw-html']
  };
  function defaultLibrary(template) {
    if (LIBRARY_DEFAULTS[template]) return Object.keys(B).filter(function (k) { return LIBRARY_DEFAULTS[template].indexOf(k) !== -1; });
    return Object.keys(B).filter(function (k) { return (B[k].scope || []).indexOf(template) !== -1; });
  }
  function library(template, site) {
    var d = defaultLibrary(template), c = site && site.libraries && site.libraries[template];
    if (!c) return d;
    var on = c.on || [], off = c.off || [];
    return Object.keys(B).filter(function (k) { return (d.indexOf(k) !== -1 && off.indexOf(k) === -1) || on.indexOf(k) !== -1; });
  }
  /* switch one component in or out of a library, keeping only the differences from the default */
  function setInLibrary(site, template, type, include) {
    var libs = site.libraries || (site.libraries = {}), c = libs[template] || (libs[template] = { on: [], off: [] });
    c.on = (c.on || []).filter(function (k) { return k !== type; }); c.off = (c.off || []).filter(function (k) { return k !== type; });
    var byDefault = defaultLibrary(template).indexOf(type) !== -1;
    if (include && !byDefault) c.on.push(type);
    if (!include && byDefault) c.off.push(type);
    if (!c.on.length && !c.off.length) delete libs[template];
    if (!Object.keys(libs).length) delete site.libraries;
  }

  window.UOL_BLOCKS = {
    registry: B,
    templates: TEMPLATES,
    libraries: {
      defaults: defaultLibrary,
      of: library,
      set: setInLibrary,
      customised: function (site, template) { return !!(site && site.libraries && site.libraries[template]); },
      reset: function (site, template) { if (site.libraries) { delete site.libraries[template]; if (!Object.keys(site.libraries).length) delete site.libraries; } }
    },
    groups: GROUP_ORDER,
    components: C,
    placeholders: PLACEHOLDERS,
    icons: ICONS,
    defaultsFor: defaultsFor,
    render: render,
    isInline: isInline,
    util: { esc: esc, attr: attr, rich: rich, lines: lines, svg: svg, href: href, fmtDate: fmtDate, isoDate: isoDate, ytEmbed: ytEmbed, cls: cls, bgimg: bgimg },
    list: function (scope) {
      return Object.keys(B).map(function (k) { return B[k]; }).filter(function (s) { return !scope || s.scope.indexOf(scope) !== -1; });
    }
  };
})();
