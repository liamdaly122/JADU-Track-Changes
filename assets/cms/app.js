/* Leeds prototyping CMS - admin application */
(function () {
  'use strict';

  var UI = window.UOL_UI, el = UI.el, esc = UI.esc, toast = UI.toast, debounce = UI.debounce;
  var Store = window.UOL_STORE, Blocks = window.UOL_BLOCKS, R = window.UOL_RENDER, X = window.UOL_EXPORT, IMP = window.UOL_IMPORT, M = window.UOL_MEDIA;
  var PH = 'https://designsystem.leeds.ac.uk/placeholders/';
  var isHttp = /^https?:/.test(location.protocol);
  var hasFS = !!(window.showSaveFilePicker && window.showDirectoryPicker);

  var App = {
    data: null, page: null, selectedBlock: null, view: 'pages',
    fileHandle: null, folderLinked: false, undo: {}, redo: {}, dirty: false, lastSaved: null,
    device: 'desktop', mobilePane: 'edit', sideTab: 'blocks', previewMode: 'preview', codeScope: 'body'
  };
  function ctx() { return { site: Store.data.site, pages: Store.data.pages, sections: Store.data.sections }; }

  /* ================= schemas ================= */
  var S = {
    text: function (k, l, x) { return Object.assign({ key: k, label: l, type: 'text' }, x || {}); },
    url: function (k, l, x) { return Object.assign({ key: k, label: l, type: 'url' }, x || {}); },
    textarea: function (k, l, x) { return Object.assign({ key: k, label: l, type: 'textarea' }, x || {}); },
    html: function (k, l) { return { key: k, label: l, type: 'html' }; },
    image: function (k, l) { return { key: k, label: l, type: 'image' }; },
    bool: function (k, l, x) { return Object.assign({ key: k, label: l, type: 'boolean' }, x || {}); },
    date: function (k, l) { return { key: k, label: l, type: 'date' }; },
    select: function (k, l, o) { return { key: k, label: l, type: 'select', options: o }; },
    list: function (k, l, f, x) { return Object.assign({ key: k, label: l, type: 'list', fields: f, itemLabel: 'label' }, x || {}); }
  };
  var linkFields = [S.text('label', 'Label'), S.url('href', 'URL')];
  var navItemFields = [S.text('label', 'Label'), S.url('href', 'URL (leave empty for a dropdown parent)'), S.list('children', 'Dropdown links', [S.text('label', 'Label'), S.url('href', 'URL'), S.bool('cta', 'Show as call to action')])];
  var sectionNavFields = [S.text('label', 'Label'), S.url('href', 'URL'), S.bool('current', 'Current page'), S.list('children', 'Child links', [S.text('label', 'Label'), S.url('href', 'URL'), S.bool('current', 'Current page'), S.list('children', 'Child links', [S.text('label', 'Label'), S.url('href', 'URL'), S.bool('current', 'Current page')])])];
  var pageSettingsSchema = {
    heading: [S.text('title', 'Heading (defaults to page title)'), S.text('subtitle', 'Subtitle'), S.text('category', 'Category'), S.url('categoryHref', 'Category URL'), S.date('date', 'Date'), S.bool('hide', 'Hide the page heading')],
    inPageNav: [S.bool('enabled', 'Show in-page navigation (contents)'), S.select('style', 'Style', [{ value: 'list', label: 'List' }, { value: 'accordion', label: 'Accordion' }]), S.text('title', 'Title'), S.list('items', 'Links', [S.text('label', 'Label'), S.url('href', 'URL'), S.bool('current', 'Current page')])],
    sectionNav: [S.bool('enabled', 'Show section navigation (side menu)'), S.text('intro', 'Intro text'), S.text('title', 'Section title'), S.list('items', 'Links', sectionNavFields)],
    relatedContent: [S.bool('enabled', 'Show related content'), S.text('title', 'Title'), S.list('items', 'Items', [S.text('title', 'Title'), S.url('href', 'URL'), S.textarea('text', 'Text'), S.text('phone', 'Phone'), S.text('email', 'Email')], { itemLabel: 'title' })],
    sectionCtas: [S.bool('enabled', 'Show call-to-action buttons'), S.text('title', 'Title'), S.list('links', 'Buttons', linkFields)],
    pageNav: [S.bool('enabled', 'Show previous / next links'), S.text('prevLabel', 'Previous page title'), S.url('prevHref', 'Previous page URL'), S.text('nextLabel', 'Next page title'), S.url('nextHref', 'Next page URL')],
    featuredImage: [S.image('src', 'Featured image'), S.text('alt', 'Alt text'), S.text('caption', 'Caption')]
  };
  var HERO_TYPES = [{ value: 'none', label: 'None' }, { value: 'banner', label: 'Banner carousel (homepage)' }, { value: 'hero', label: 'Hero banner (title over image)' }, { value: 'slideshow', label: 'Decorative slideshow' }];
  var heroSchemas = {
    banner: [S.list('items', 'Banner slides', [S.text('title', 'Title'), S.image('image', 'Image'), S.text('alt', 'Alt text'), S.textarea('lead', 'Lead text'), S.text('linkLabel', 'Link label'), S.url('linkHref', 'Link URL')], { itemLabel: 'title' })],
    hero: [S.text('title', 'Title'), S.textarea('lead', 'Lead'), S.image('image', 'Image'), S.text('alt', 'Alt text'), S.bool('useH1', 'Use as the page H1')],
    slideshow: [S.list('slides', 'Slides', [S.image('image', 'Image')], { itemLabel: 'image' })]
  };
  var siteSchema = [
    { title: 'Identity', key: null, fields: [S.text('name', 'Site name'), S.url('homeUrl', 'University home link')] },
    { title: 'Global masthead', key: 'masthead', fields: [S.bool('showQuicklinks', 'Show quicklinks'), S.bool('showSearch', 'Show search'), S.text('searchLabel', 'Search label'), S.url('searchAction', 'Search action URL'), S.list('quicklinks', 'Quicklink groups', [S.text('label', 'Group label'), S.list('links', 'Links', linkFields)])] },
    { title: 'Local masthead (site title under the global bar)', key: 'localMasthead', fields: [S.bool('enabled', 'Show local masthead'), S.text('parentTitle', 'Parent site title (optional)'), S.url('parentHref', 'Parent site URL'), S.text('title', 'Site title'), S.url('href', 'Site home URL')] },
    { title: 'Main navigation', key: 'navigation', fields: [S.bool('enabled', 'Show main navigation'), S.list('items', 'Menu items', navItemFields)] },
    { title: 'Global banner', key: 'globalBanner', fields: [S.bool('enabled', 'Show global banner'), S.text('title', 'Title'), S.textarea('description', 'Description'), S.text('buttonLabel', 'Button label'), S.url('buttonHref', 'Button URL')] },
    { title: 'Marketing banner', key: 'marketingBanner', fields: [S.bool('enabled', 'Show marketing banner'), S.text('title', 'Title'), S.textarea('description', 'Description'), S.text('linkLabel', 'Link label'), S.url('linkHref', 'Link URL')] },
    { title: 'Footer navigation', key: 'footer', fields: [S.list('navGroups', 'Link groups', [S.text('title', 'Group title'), S.list('links', 'Links', linkFields)], { itemLabel: 'title' })] },
    { title: 'Footer contact', key: 'footer.contact', fields: [S.text('title', 'Heading'), S.text('name', 'Organisation name'), S.text('street', 'Street'), S.text('locality', 'Town or city'), S.text('region', 'Region'), S.text('postcode', 'Postcode'), S.text('country', 'Country'), S.text('phone', 'Telephone'), S.text('email', 'Email')] },
    { title: 'Footer social media', key: 'footer', fields: [S.list('social', 'Social links', [S.select('network', 'Network', ['youtube', 'twitter', 'instagram', 'linkedin', 'facebook', 'tiktok', 'threads', 'medium', 'weibo'].map(function (n) { return { value: n, label: n.charAt(0).toUpperCase() + n.slice(1) }; })), S.text('label', 'Accessible label (optional)'), S.url('href', 'Profile URL')], { itemLabel: 'network' })] },
    { title: 'Footer accreditations', key: 'footer', fields: [S.list('accreditations', 'Accreditation logos', [S.image('src', 'Logo'), S.text('alt', 'Alt text'), S.url('href', 'URL')], { itemLabel: 'alt' })] },
    { title: 'Site information', key: 'footer.siteInfo', fields: [S.text('copyright', 'Copyright line'), S.list('links', 'Links', linkFields)] },
    { title: 'Footer supplement link', key: 'footer.supplement', fields: [S.bool('enabled', 'Show supplement link above the footer'), S.text('label', 'Label'), S.url('href', 'URL'), S.select('icon', 'Icon', Blocks.icons.map(function (i) { return { value: i, label: i.replace(/^mdi/, '') }; }))] }
  ];

  /* ================= shell: icon rail and top bar ================= */
  var ICONS = {
    settings: 'M12 8a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4m0 2a2 2 0 0 0-2 2 2 2 0 0 0 2 2 2 2 0 0 0 2-2 2 2 0 0 0-2-2m-2 12c-.25 0-.46-.18-.5-.42l-.37-2.65c-.63-.25-1.17-.59-1.69-.99l-2.49 1.01c-.22.08-.49 0-.61-.22l-2-3.46a.493.493 0 0 1 .12-.64l2.11-1.66L4.5 12l.07-1-2.11-1.63a.493.493 0 0 1-.12-.64l2-3.46c.12-.22.39-.31.61-.22l2.49 1c.52-.39 1.06-.73 1.69-.98l.37-2.65c.04-.24.25-.42.5-.42h4c.25 0 .46.18.5.42l.37 2.65c.63.25 1.17.59 1.69.98l2.49-1c.22-.09.49 0 .61.22l2 3.46c.13.22.07.49-.12.64L19.43 11l.07 1-.07 1 2.11 1.63c.19.15.25.42.12.64l-2 3.46c-.12.22-.39.31-.61.22l-2.49-1c-.52.39-1.06.73-1.69.98l-.37 2.65c-.04.24-.25.42-.5.42h-4m1.25-18l-.37 2.61c-1.2.25-2.26.89-3.03 1.78L5.44 7.35l-.75 1.3L6.8 10.2a5.55 5.55 0 0 0 0 3.6l-2.12 1.56.75 1.3 2.43-1.04c.77.88 1.82 1.52 3.01 1.76l.37 2.62h1.52l.37-2.61c1.19-.25 2.24-.89 3.01-1.77l2.43 1.04.75-1.3-2.12-1.55c.4-1.17.4-2.44 0-3.61l2.11-1.55-.75-1.3-2.41 1.04a5.42 5.42 0 0 0-3.03-1.77L12.75 4h-1.5z',
    pages: 'M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6m0 2h7v5h5v11H6V4m2 8v2h8v-2H8m0 4v2h5v-2H8z',
    site: 'M16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2m-5.15 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a8.03 8.03 0 0 1-4.33 3.56M14.34 14H9.66c-.1-.66-.16-1.32-.16-2 0-.68.06-1.35.16-2h4.68c.09.65.16 1.32.16 2 0 .68-.07 1.34-.16 2M12 19.96c-.83-1.2-1.5-2.53-1.91-3.96h3.82c-.41 1.43-1.08 2.76-1.91 3.96M8 8H5.08A7.92 7.92 0 0 1 9.4 4.44C8.8 5.55 8.35 6.75 8 8m-2.92 8H8c.35 1.25.8 2.45 1.4 3.56A8 8 0 0 1 5.08 16m-.82-2C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2M12 4.03c.83 1.2 1.5 2.54 1.91 3.97h-3.82c.41-1.43 1.08-2.77 1.91-3.97M18.92 8h-2.95a15.65 15.65 0 0 0-1.38-3.56c1.84.63 3.37 1.9 4.33 3.56M12 2C6.47 2 2 6.5 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2z',
    theme: 'M12 22A10 10 0 0 1 2 12A10 10 0 0 1 12 2c5.5 0 10 4 10 9a6 6 0 0 1-6 6h-1.8c-.3 0-.5.2-.5.5 0 .1.1.2.1.3.4.5.6 1.1.6 1.7 0 1.4-1.1 2.5-2.4 2.5m0-18a8 8 0 0 0-8 8 8 8 0 0 0 8 8c.3 0 .5-.2.5-.5 0-.2-.1-.3-.1-.4-.4-.5-.6-1.1-.6-1.7 0-1.4 1.1-2.5 2.5-2.5H16a4 4 0 0 0 4-4c0-3.9-3.6-7-8-7m-5.5 6c.8 0 1.5.7 1.5 1.5S7.3 13 6.5 13 5 12.3 5 11.5 5.7 10 6.5 10m3-4c.8 0 1.5.7 1.5 1.5S10.3 9 9.5 9 8 8.3 8 7.5 8.7 6 9.5 6m5 0c.8 0 1.5.7 1.5 1.5S15.3 9 14.5 9 13 8.3 13 7.5 13.7 6 14.5 6m3 4c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5.7-1.5 1.5-1.5z',
    library: 'M3 11h8V3H3m2 2h4v4H5M13 21h8v-8h-8m2 2h4v4h-4M3 21h8v-8H3m2 2h4v4H5M13 3v8h8V3m-2 6h-4V5h4z',
    media: 'M19 19H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-4.86 8.86l-3 3.87L9 13.14 6 17h12l-3.86-5.14z',
    import: 'M2 12h2v5h16v-5h2v5c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-5m10 3l5.5-5.5-1.4-1.4L13 11.2V2h-2v9.2L7.9 8.1 6.5 9.5 12 15z',
    export: 'M2 12h2v5h16v-5h2v5c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-5m10-10L6.5 7.5l1.4 1.4L11 5.8V15h2V5.8l3.1 3.1 1.4-1.4L12 2z',
    help: 'M11 18h2v-2h-2v2m1-16A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2m0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8m0-14a4 4 0 0 0-4 4h2a2 2 0 0 1 2-2 2 2 0 0 1 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5a4 4 0 0 0-4-4z',
    undo: 'M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z',
    redo: 'M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16a8.002 8.002 0 0 1 7.6-5.5c1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z',
    // device icons are outlines on one grid, so the four read as a set at the same weight
    desktop: '<rect x="2.5" y="4" width="19" height="12.5" rx="1.5"/><path d="M8 20.5h8M12 16.5v4"/>',
    laptop: '<rect x="4.5" y="5.5" width="15" height="10.5" rx="1.5"/><path d="M2 19h20"/>',
    tablet: '<rect x="4.5" y="2.5" width="15" height="19" rx="2"/><path d="M11 18.5h2"/>',
    mobile: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
    more: 'M16 12a2 2 0 0 1 2-2 2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2m-6 0a2 2 0 0 1 2-2 2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2m-6 0a2 2 0 0 1 2-2 2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2z',
    back: 'M20 11v2H8l5.5 5.5-1.42 1.42L4.16 12l7.92-7.92L13.5 5.5 8 11h12z',
    save: 'M15 9H5V5h10m-3 14a3 3 0 0 1-3-3 3 3 0 0 1 3-3 3 3 0 0 1 3 3 3 3 0 0 1-3 3m5-16H5c-1.11 0-2 .89-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4z',
    open: 'M19 20H4a2 2 0 0 1-2-2V6c0-1.11.89-2 2-2h6l2 2h7a2 2 0 0 1 2 2H4v10l2.14-8h17.07l-2.28 8.5c-.23.87-1.01 1.5-1.93 1.5z',
    refresh: 'M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 0 0-8 8 8 8 0 0 0 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18a6 6 0 0 1-6-6 6 6 0 0 1 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    external: 'M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5c-1.11 0-2 .89-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z',
    up: 'M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z',
    down: 'M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z',
    prev: 'M15.41 16.58L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.42z',
    next: 'M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.42z',
    copy: 'M19 21H8V7h11m0-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2m-3-4H4a2 2 0 0 0-2 2v14h2V3h12V1z',
    trash: 'M19 4h-3.5l-1-1h-5l-1 1H5v2h14M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12z',
    plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
    link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7a5 5 0 0 0-5 5 5 5 0 0 0 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1M8 13h8v-2H8v2m9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4a5 5 0 0 0 5-5 5 5 0 0 0-5-5z',
    download: 'M5 20h14v-2H5m14-9h-4V3H9v6H5l7 7 7-7z',
    cloud: 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96M19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95A5.469 5.469 0 0 1 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11A2.98 2.98 0 0 1 22 15c0 1.65-1.35 3-3 3z',
    projects: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.2-3.6 4.3-5.5 8-5.5s6.8 1.9 8 5.5"/>',
    share: 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81a3 3 0 0 0 3-3 3 3 0 0 0-3-3 3 3 0 0 0-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9a3 3 0 0 0-3 3 3 3 0 0 0 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.15c-.05.21-.08.43-.08.66 0 1.61 1.31 2.91 2.92 2.91s2.92-1.3 2.92-2.91A2.92 2.92 0 0 0 18 16.08z'
  };
  function icon(name, size) {
    var s = size || 20, t = document.createElement('template');
    var d = ICONS[name] || '';
    // most icons are one filled path; ones written as SVG elements are drawn as outlines
    var inner = d.charAt(0) === '<' ? '<g fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + d + '</g>' : '<path fill="currentColor" d="' + d + '"/>';
    t.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true" focusable="false">' + inner + '</svg>';
    return t.content.firstChild;
  }
  function iconBtn(name, title, onClick, extra) { return el('button', Object.assign({ type: 'button', class: 'ibtn', title: title, 'aria-label': title, onclick: onClick }, extra || {}), [icon(name)]); }
  // the last two items (Settings, Help) sit at the foot of the rail. With cloud saving, Projects comes first and
  // Sharing replaces Cloud; without it (opened from a folder, offline) the CMS works on one project in this browser.
  var RAIL_LOCAL = [['pages', 'Pages', 'pages'], ['media', 'Media', 'media'], ['import', 'Import', 'import'], ['export', 'Save and export', 'export'], ['cloud', 'Cloud', 'cloud'], ['settings', 'Settings', 'settings'], ['help', 'Help', 'help']];
  var RAIL_CLOUD = [['projects', 'Projects', 'projects'], ['pages', 'Pages', 'pages'], ['media', 'Media', 'media'], ['import', 'Import', 'import'], ['export', 'Save and export', 'export'], ['sharing', 'Sharing', 'share'], ['settings', 'Settings', 'settings'], ['help', 'Help', 'help']];
  // screens reached from Settings keep Settings highlighted in the rail
  var SETTINGS_VIEWS = { site: 1, theme: 1, library: 1 };
  // screens that need a project open
  var NO_PROJECT_VIEWS = { projects: 1, help: 1 };
  function cloudMode() { return App.mode === 'cloud'; }
  function buildRail() {
    var rail = document.getElementById('rail'), C = window.UOL_CLOUD;
    Array.prototype.slice.call(rail.querySelectorAll('.rail__item, .rail__spacer, .rail__account')).forEach(function (n) { n.remove(); });
    var logo = rail.querySelector('.rail__logo'); if (logo) logo.setAttribute('href', cloudMode() ? '#projects' : '#pages');
    var items = cloudMode() ? RAIL_CLOUD : RAIL_LOCAL;
    items.forEach(function (r, i) {
      if (i === items.length - 2) rail.appendChild(el('span', { class: 'rail__spacer' }));
      rail.appendChild(el('a', { class: 'rail__item', href: '#' + r[0], title: r[1], 'data-view': r[0], 'aria-label': r[1] }, [icon(r[2], 22), el('span', { class: 'rail__label', text: r[1] })]));
    });
    if (cloudMode() && C && C.user()) rail.appendChild(accountButton());
  }
  function setRailActive(view) {
    var noProject = cloudMode() && !Store.data;
    document.querySelectorAll('.rail__item').forEach(function (a) {
      var v = a.getAttribute('data-view');
      a.classList.toggle('is-active', v === (view === 'edit' ? 'pages' : SETTINGS_VIEWS[view] ? 'settings' : view));
      a.classList.toggle('is-off', noProject && !NO_PROJECT_VIEWS[v]);
      if (noProject && !NO_PROJECT_VIEWS[v]) a.title = a.getAttribute('aria-label') + ' (open a project first)'; else a.title = a.getAttribute('aria-label');
    });
  }
  /* the top bar is rebuilt by every screen: a title (or the editor's controls) on the left, the save state and project actions on the right */
  function setTopbar(leftNodes, rightNodes) {
    var tb = document.getElementById('topbar');
    tb.innerHTML = '';
    tb.appendChild(el('div', { class: 'topbar__left' }, leftNodes || []));
    tb.appendChild(el('div', { class: 'topbar__right' }, rightNodes || []));
    updateSaveStatus();
  }
  /* cloud sync state next to the save state; only shown once cloud saving is set up */
  var CLOUD_LABEL = { idle: 'Cloud', pending: 'Cloud: waiting', syncing: 'Cloud: saving', synced: 'Cloud', offline: 'Cloud: offline', error: 'Cloud: problem', signedout: 'Cloud: signed out', viewer: 'Cloud: view only' };
  function cloudChip() {
    var C = window.UOL_CLOUD;
    if (!C || !(C.configured() || C.link())) return null;
    if (cloudMode() && !C.link()) return null;
    var a = el('a', { id: 'cloud-status', class: 'cloud-chip', href: cloudMode() ? '#sharing' : '#cloud' });
    renderCloudChip(a);
    return a;
  }
  function renderCloudChip(a) {
    a = a || document.getElementById('cloud-status');
    var C = window.UOL_CLOUD; if (!a || !C) return;
    var s = C.state(), kind = s.link ? (s.user ? s.status.kind : 'signedout') : 'none';
    a.className = 'cloud-chip cloud-chip--' + kind;
    a.innerHTML = '';
    a.appendChild(icon('cloud', 16));
    a.appendChild(el('span', { text: s.link ? (CLOUD_LABEL[kind] || 'Cloud') : (s.user ? 'Not in the cloud' : 'Cloud: sign in') }));
    a.title = s.link ? ('"' + s.link.name + '"' + (s.status.message ? ': ' + s.status.message : '')) : 'This project is only in this browser. Open the Cloud screen to save it online and share it.';
  }
  function projectActions() {
    if (cloudMode() && !Store.data) return [];
    return [
      cloudMode() ? presenceStack() : null,
      cloudChip(),
      el('span', { id: 'save-status', class: 'save-status', 'aria-live': 'polite' }),
      iconBtn('open', cloudMode() ? 'New project from a project file' : 'Open a project file', openProjectFile),
      iconBtn('save', 'Save the project to a file (Ctrl+Shift+S)', function () { saveProjectToFile(false); })
    ];
  }
  function screenTopbar(title, extraLeft, extraRight) {
    var back = SETTINGS_VIEWS[App.view] ? [el('a', { class: 'ibtn', href: '#settings', title: 'Back to settings', 'aria-label': 'Back to settings' }, [icon('back')])] : [];
    setTopbar(back.concat([el('h1', { class: 'topbar__title', text: title })], extraLeft || []), (extraRight || []).concat(projectActions()));
  }

  /* ================= helpers ================= */
  function get(obj, path) { return path.split('.').reduce(function (o, k) { return o && o[k] !== undefined ? o[k] : undefined; }, obj); }
  function ensure(obj, path, def) { var parts = path.split('.'), o = obj; parts.forEach(function (k, i) { if (i === parts.length - 1) { if (o[k] === undefined || o[k] === null) o[k] = def; } else { if (!o[k]) o[k] = {}; o = o[k]; } }); return get(obj, path); }
  function setPath(obj, path, value) { var parts = path.split('.'), o = obj; for (var i = 0; i < parts.length - 1; i++) { if (o[parts[i]] === undefined || o[parts[i]] === null) o[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {}; o = o[parts[i]]; } o[parts[parts.length - 1]] = value; }
  function fmtTime(iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  function blockSpec(b) { return Blocks.registry[b.type] || { label: b.type, group: 'Unknown', fields: [] }; }
  function blockSummary(b) {
    var p = b.props || {};
    var v = p.title || p.heading || p.text || p.formTitle || p.label || p.quote || p.caption || p.html || (p.items && p.items[0] && (p.items[0].title || p.items[0].label)) || (p.cards && p.cards[0] && p.cards[0].title) || (p.tiles && p.tiles[0] && p.tiles[0].title) || '';
    v = String(v).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return v.length > 60 ? v.slice(0, 58) + '…' : v;
  }
  function pageUrl(page) { return 'view.html#/' + page.slug; }
  function findBlock(id) { return App.page ? App.page.blocks.filter(function (b) { return b.id === id; })[0] : null; }
  function blockIndex(id) { return App.page ? App.page.blocks.findIndex(function (b) { return b.id === id; }) : -1; }

  /* ================= persistence ================= */
  var saveNow = function () {
    if (App.page) App.page.updatedAt = new Date().toISOString();
    if (Store.save()) { App.dirty = false; App.lastSaved = new Date(); updateSaveStatus(); writeFolderSoon(); storageGuard(); }
    else {
      updateSaveStatus();
      showBanner('warn', ['The latest change could not be saved in this browser. Free up space, then keep editing.'], [{ label: 'Free up space', primary: true, onClick: freeSpaceDialog }]);
    }
  };
  var saveSoon = debounce(saveNow, 500);
  var editingTimer = null;
  function markDirty() {
    App.dirty = true; updateSaveStatus(); saveSoon();
    if (cloudMode() && App.page) { window.UOL_CLOUD.presence.set({ editing: true }); clearTimeout(editingTimer); editingTimer = setTimeout(function () { window.UOL_CLOUD.presence.set({ editing: false }); }, 8000); }
  }
  function updateSaveStatus() {
    var s = document.getElementById('save-status'); if (!s) return;
    var cl = window.UOL_CLOUD && window.UOL_CLOUD.link();
    var where = cl ? 'this browser, then the cloud' : App.folderLinked ? 'folder "' + M.folderName() + '"' : App.fileHandle ? 'file ' + App.fileHandle.name : 'this browser only';
    if (Store.lastError) { s.innerHTML = '<i></i>Not saved'; s.className = 'save-status save-status--error'; s.title = Store.lastError.message; return; }
    s.innerHTML = '<i></i>' + (App.dirty ? 'Saving…' : 'Saved');
    s.className = 'save-status' + (App.dirty ? ' save-status--dirty' : '');
    s.title = (App.lastSaved ? 'Last saved ' + App.lastSaved.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' to ' : 'Saving to ') + where;
  }

  /* ---------- project folder on disk ---------- */
  var writeFolderSoon = debounce(function () {
    if (!App.folderLinked) { if (App.fileHandle && App.autoFile) writeFileHandle(); return; }
    Store.exportProject().then(function (json) { return M.writeProjectFile(json); }).then(function (ok) { if (ok) { try { localStorage.setItem('leeds-cms:lastBackup', new Date().toISOString()); } catch (e) {} } else toast('Could not write project.json to the linked folder', 'warn', 4000); });
  }, 1500);
  function linkFolder() {
    if (!window.showDirectoryPicker) { toast('This browser cannot link folders. Use "Save project to file" instead.', 'warn', 5000); return Promise.resolve(false); }
    return window.showDirectoryPicker({ mode: 'readwrite', id: 'leeds-cms' }).then(function (h) { return useFolder(h, true); }).catch(function (e) { if (e.name !== 'AbortError') toast('Could not link folder: ' + e.message, 'error', 5000); return false; });
  }
  function useFolder(handle, announce) {
    return M.setFolder(handle).then(function () { App.folderLinked = true; return M.kvSet('projectFolder', handle); }).then(function () { return M.syncFromFolder(); }).then(function (n) {
      updateSaveStatus();
      if (announce) toast('Linked folder "' + handle.name + '". Images and project.json are written there automatically.' + (n ? ' ' + n + ' images loaded from the folder.' : ''), 'success', 6000);
      writeFolderSoon();
      return true;
    });
  }
  function reconnectFolder() {
    return M.kvGet('projectFolder').then(function (h) {
      if (!h) return false;
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') return useFolder(h, false).then(function () { return true; });
        showBanner('info', ['Project folder ', el('strong', { text: h.name }), ' was linked last time. Reconnect it so images and project.json keep saving to disk.'], [
          { label: 'Reconnect', primary: true, onClick: function () { h.requestPermission({ mode: 'readwrite' }).then(function (r) { if (r === 'granted') return useFolder(h, true).then(function () { offerLoadFromFolder(); }); toast('Permission not granted', 'warn'); }); } },
          { label: 'Forget folder', onClick: function () { M.kvSet('projectFolder', null); } }
        ]);
        return false;
      });
    }).catch(function () { return false; });
  }
  function offerLoadFromFolder() {
    M.readProjectFile().then(function (text) {
      if (!text) return;
      var obj; try { obj = JSON.parse(text); } catch (e) { return; }
      var fileAt = obj.exportedAt || '', localAt = latestChange();
      if (fileAt && fileAt > localAt) {
        showBanner('warn', ['The project.json in the folder is newer than what is in this browser (' + fmtTime(fileAt) + ' vs ' + fmtTime(localAt) + ').'], [
          { label: 'Load from folder', primary: true, onClick: function () { beforeReplaceAll('Load from folder').then(function (go_) { if (go_) return Store.importJson(text); throw 'cancel'; }).then(function () { App.undo = {}; App.redo = {}; toast('Project loaded from the folder', 'success'); go('#pages'); route(); }).catch(function () {}); } },
          { label: 'Keep this browser\'s copy' }
        ]);
      }
    });
  }
  function latestChange() { var t = ''; if (!Store.data) return t; Store.data.pages.forEach(function (p) { if ((p.updatedAt || '') > t) t = p.updatedAt; }); return t; }
  function unlinkFolder() { M.setFolder(null); App.folderLinked = false; M.kvSet('projectFolder', null); updateSaveStatus(); toast('Folder unlinked. Work stays in this browser only.', 'info', 4000); }

  /* ---------- single project file (File System Access API with download fallback) ---------- */
  function writeFileHandle() {
    if (!App.fileHandle) return Promise.resolve(false);
    return Store.exportProject().then(function (json) { return App.fileHandle.createWritable().then(function (w) { return w.write(json).then(function () { return w.close(); }); }); }).then(function () { try { localStorage.setItem('leeds-cms:lastBackup', new Date().toISOString()); } catch (e) {} return true; }).catch(function (e) { toast('Could not write ' + App.fileHandle.name + ': ' + e.message, 'error', 5000); return false; });
  }
  function saveProjectToFile(forceNew) {
    if (window.showSaveFilePicker) {
      var p = (App.fileHandle && !forceNew) ? Promise.resolve(App.fileHandle) : window.showSaveFilePicker({ suggestedName: 'leeds-cms-project.json', types: [{ description: 'Leeds CMS project', accept: { 'application/json': ['.json'] } }] });
      return p.then(function (h) { App.fileHandle = h; App.autoFile = true; return writeFileHandle(); }).then(function (ok) { if (ok) { toast('Project saved to ' + App.fileHandle.name + '. It will be kept up to date automatically while this tab is open.', 'success', 5000); updateSaveStatus(); } }).catch(function (e) { if (e.name !== 'AbortError') toast('Save failed: ' + e.message, 'error'); });
    }
    return X.exportProjectJson(Store).then(function () { try { localStorage.setItem('leeds-cms:lastBackup', new Date().toISOString()); } catch (e) {} toast('Project downloaded as JSON', 'success'); });
  }
  function openProjectFile() {
    if (cloudMode()) { newProjectFromFile(); return; }
    function load(text, name) {
      beforeReplaceAll('Open ' + name).then(function (ok) { if (ok) doLoad(text, name); });
    }
    function doLoad(text, name) {
      Store.importJson(text).then(function (n) { App.data = Store.data; App.undo = {}; App.redo = {}; toast('Opened ' + name + (n ? ' (' + n + ' images restored)' : ''), 'success', 4000); go('#pages'); route(); }).catch(function (e) { toast('Could not open: ' + e.message, 'error', 5000); });
    }
    if (window.showOpenFilePicker) {
      window.showOpenFilePicker({ types: [{ description: 'Leeds CMS project', accept: { 'application/json': ['.json'] } }] }).then(function (hs) { var h = hs[0]; return h.getFile().then(function (f) { return f.text().then(function (t) { App.fileHandle = h; App.autoFile = true; load(t, f.name); }); }); }).catch(function (e) { if (e.name !== 'AbortError') toast('Open failed: ' + e.message, 'error'); });
      return;
    }
    var input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', function () { var f = input.files[0]; if (!f) return; f.text().then(function (t) { load(t, f.name); }); });
    input.click();
  }

  /* ---------- replacing the whole project while it is linked to a shared cloud project ---------- */
  function beforeReplaceAll(what) {
    var C = window.UOL_CLOUD, l = C && C.link();
    if (!l || !C.canEdit()) return Promise.resolve(true);
    if (cloudMode()) return UI.confirm(what, 'This replaces "' + l.name + '" for everyone it is shared with. Each page keeps hourly copies, so this can be undone.', 'Replace', true);
    return new Promise(function (resolve) {
      var answered = false;
      UI.modal({
        title: what,
        body: el('div', {}, [
          el('p', {}, ['This browser is connected to the cloud project ', el('strong', { text: l.name }), '. Carrying on replaces that project in the cloud as well, for everyone it is shared with. (The cloud keeps hourly copies on the Cloud screen.)']),
          el('p', { class: 'small muted', text: 'Disconnect first to leave the cloud copy as it is; this browser then works on its own copy.' })
        ]),
        buttons: [
          { label: 'Cancel', onClick: function () { answered = true; resolve(false); } },
          { label: 'Disconnect, then continue', onClick: function () { answered = true; C.disconnect(); renderCloudChip(); resolve(true); } },
          { label: 'Replace in the cloud too', danger: true, onClick: function () { answered = true; resolve(true); } }
        ],
        onClose: function () { if (!answered) resolve(false); }
      });
    });
  }

  /* ---------- banners ---------- */
  function showBanner(kind, content, buttons) {
    var root = document.getElementById('banner-root'); if (!root) return;
    var b = el('div', { class: 'app-banner' + (kind === 'info' ? ' app-banner--info' : ''), role: 'status' }, [].concat(content));
    b.appendChild(el('span', { class: 'spacer' }));
    (buttons || []).forEach(function (bt) { b.appendChild(el('button', { type: 'button', class: 'btn btn--sm' + (bt.primary ? ' btn--primary' : ''), onclick: function () { if (bt.onClick) bt.onClick(); b.remove(); } }, [bt.label])); });
    b.appendChild(el('button', { type: 'button', class: 'btn btn--icon btn--sm', 'aria-label': 'Dismiss', onclick: function () { b.remove(); } }, ['✕']));
    root.innerHTML = '';
    root.appendChild(b);
  }
  function backupReminder() {
    if (App.folderLinked || App.fileHandle || (window.UOL_CLOUD && window.UOL_CLOUD.link())) return;
    var last = ''; try { last = localStorage.getItem('leeds-cms:lastBackup') || ''; } catch (e) {}
    var changed = latestChange();
    if (changed && (!last || (Date.now() - new Date(last).getTime()) > 2 * 86400000) && !sessionStorage.getItem('leeds-cms:remind-dismissed')) {
      showBanner('warn', ['Your work is only saved in this browser. Link a folder or save a project file so it survives a browser reset.'], [
        { label: 'Link a folder', primary: true, onClick: function () { linkFolder(); } },
        { label: 'Save to file', onClick: function () { saveProjectToFile(false); } },
        { label: 'Later', onClick: function () { try { sessionStorage.setItem('leeds-cms:remind-dismissed', '1'); } catch (e) {} } }
      ]);
    }
  }

  /* ---------- migrate images embedded as data URLs into the library ---------- */
  function migrateDataUrls() {
    var found = [];
    function walk(o) {
      if (Array.isArray(o)) { o.forEach(function (v, i) { if (typeof v === 'string' && v.indexOf('data:image') === 0) found.push({ obj: o, key: i, value: v }); else if (v && typeof v === 'object') walk(v); }); return; }
      if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { var v = o[k]; if (typeof v === 'string' && v.indexOf('data:image') === 0) found.push({ obj: o, key: k, value: v }); else if (v && typeof v === 'object' && k !== 'revisions') walk(v); });
    }
    walk(Store.data.site); walk(Store.data.pages);
    if (!found.length) return Promise.resolve(0);
    var seen = {};
    return found.reduce(function (chain, f) {
      return chain.then(function () {
        if (seen[f.value]) { f.obj[f.key] = seen[f.value]; return; }
        return M.addDataUrl(f.value, 'migrated-image').then(function (rec) { seen[f.value] = M.ref(rec.id); f.obj[f.key] = seen[f.value]; }).catch(function () {});
      });
    }, Promise.resolve()).then(function () { Store.save(); return found.length; });
  }

  /* ---------- one-off clean-up: side-column asides that older imports also stored as content blocks ---------- */
  var SIDE_RE = /uol-section-nav-ctas|uol-section-nav-related-content|class="uol-section-nav"|uol-section-nav__list/;
  function stripSideAsides(html) {
    var d = document.createElement('div'); d.innerHTML = html;
    Array.prototype.slice.call(d.querySelectorAll('.uol-section-nav-ctas, .uol-section-nav-related-content, nav.uol-section-nav')).forEach(function (n) { n.remove(); });
    return d.innerHTML.trim();
  }
  function migrateSideColumnDupes() {
    var removed = 0;
    Store.data.pages.forEach(function (p) {
      p.blocks = (p.blocks || []).filter(function (b) {
        if ((b.type === 'raw-html' || b.type === 'rich-text' || b.type === 'content') && SIDE_RE.test(JSON.stringify(b.props))) {
          var key = b.type === 'content' ? 'body' : 'html';
          var cleaned = stripSideAsides(b.props[key] || '');
          if (!cleaned.replace(/<[^>]+>/g, '').trim() && !/<img|<iframe/i.test(cleaned)) { removed++; return false; }
          b.props[key] = cleaned; removed++;
        }
        return true;
      });
    });
    if (removed) Store.save();
    return removed;
  }

  /* ---------- undo / redo ---------- */
  function pageState(page) { return JSON.stringify({ title: page.title, settings: page.settings, hero: page.hero, blocks: page.blocks, template: page.template, slug: page.slug }); }
  function applyState(page, json) { var d = JSON.parse(json); page.title = d.title; page.settings = d.settings; page.hero = d.hero; page.blocks = d.blocks; page.template = d.template; page.slug = d.slug; }
  var pushUndo = debounce(function () {
    if (!App.page) return;
    var st = pageState(App.page), stack = App.undo[App.page.id] = App.undo[App.page.id] || [];
    if (stack[stack.length - 1] === st) return;
    stack.push(st); if (stack.length > 60) stack.shift();
    App.redo[App.page.id] = [];
    updateUndoButtons();
  }, 600);
  function recordBaseline() { if (!App.page) return; var stack = App.undo[App.page.id] = App.undo[App.page.id] || []; if (!stack.length) stack.push(pageState(App.page)); }
  function doUndo() {
    var p = App.page; if (!p) return; var stack = App.undo[p.id] || []; if (stack.length < 2) { toast('Nothing to undo', 'info', 1200); return; }
    var cur = stack.pop(); (App.redo[p.id] = App.redo[p.id] || []).push(cur);
    applyState(p, stack[stack.length - 1]); markDirty(); renderEditorSide(); syncTopFields(); reloadPreview(true); updateUndoButtons(); toast('Undone', 'info', 900);
  }
  /* the title, path, template and status in the top bar mirror the page after an undo or redo */
  function syncTopFields() {
    var f = App.topFields, p = App.page; if (!f || !p || !f.title.isConnected) return;
    if (f.title.value !== p.title) f.title.value = p.title;
    if (f.slug.value !== p.slug) f.slug.value = p.slug;
    if (f.tpl.value !== p.template) f.tpl.value = p.template;
    if (f.status.value !== p.status) f.status.value = p.status;
    renderSwitcher();
  }
  function doRedo() {
    var p = App.page; if (!p) return; var r = App.redo[p.id] || []; if (!r.length) { toast('Nothing to redo', 'info', 1200); return; }
    var st = r.pop(); (App.undo[p.id] = App.undo[p.id] || []).push(st);
    applyState(p, st); markDirty(); renderEditorSide(); syncTopFields(); reloadPreview(true); updateUndoButtons(); toast('Redone', 'info', 900);
  }
  function updateUndoButtons() {
    var u = document.getElementById('btn-undo'), r = document.getElementById('btn-redo'); if (!u || !App.page) return;
    u.disabled = !((App.undo[App.page.id] || []).length > 1); r.disabled = !((App.redo[App.page.id] || []).length);
  }

  /* ---------- project snapshots ---------- */
  /* Snapshots are whole-project copies, so they live in the browser database (IndexedDB), which has far more room
     than the roughly 5 MB that holds the working copy. Earlier versions kept them in localStorage; they move once. */
  var SNAP_KEY = 'leeds-cms:snapshots', SNAP_DB_KEY = 'snapshots';
  function getSnapshots() { return M.kvGet(SNAP_DB_KEY).then(function (l) { return Array.isArray(l) ? l : []; }); }
  function putSnapshots(list) { return M.kvSet(SNAP_DB_KEY, list); }
  function saveSnapshot(name) {
    var entry = { id: Store.uid('snap'), name: name, at: new Date().toISOString(), pages: Store.data.pages.length, data: JSON.parse(Store.exportJson()) };
    return getSnapshots().then(function (list) { list.unshift(entry); if (list.length > 8) list.length = 8; return putSnapshots(list); }).then(function (ok) {
      if (ok) toast('Snapshot "' + name + '" saved', 'success'); else toast('Could not save the snapshot in this browser. Save the project to a file instead.', 'error', 5000);
      return ok;
    });
  }
  function migrateSnapshots() {
    var old; try { old = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null'); } catch (e) { old = null; }
    if (!Array.isArray(old)) return Promise.resolve(0);
    return getSnapshots().then(function (cur) {
      var ids = {}; cur.forEach(function (s) { ids[s.id] = 1; });
      return putSnapshots(cur.concat(old.filter(function (s) { return !ids[s.id]; })).sort(function (a, b) { return (b.at || '').localeCompare(a.at || ''); }).slice(0, 8));
    }).then(function (ok) { if (ok) { try { localStorage.removeItem(SNAP_KEY); } catch (e) {} } return ok ? old.length : 0; });
  }

  /* ---------- storage guard: what the open project takes in the browser's database ---------- */
  function fmtSize(chars) { return chars >= 995e6 ? (chars / 1e9).toFixed(1) + ' GB' : chars >= 995000 ? (chars / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(chars / 1000)) + ' KB'; }
  var METER_PARTS = [['content', 'Pages and site settings'], ['versions', 'Saved page versions'], ['originals', 'Originals kept for Changes'], ['other', 'Other settings']];
  function storageMeter(r) {
    r = r || Store.storageReport();
    var pct = Math.round(r.share * 100);
    var bar = el('div', { class: 'meter meter--' + r.level, role: 'img', 'aria-label': 'Browser storage ' + pct + '% full' });
    METER_PARTS.forEach(function (m) { if (r[m[0]] > 0) bar.appendChild(el('span', { class: 'meter__seg meter__seg--' + m[0], style: 'width:' + Math.min(100, r[m[0]] / r.limit * 100).toFixed(2) + '%', title: m[1] + ': ' + fmtSize(r[m[0]]) })); });
    return el('div', { class: 'meter-wrap' }, [
      el('div', { class: 'meter__head' }, [el('strong', { text: fmtSize(r.total) + ' used by this project, of ' + fmtSize(r.limit) + ' this browser allows (' + (pct < 1 ? 'under 1' : pct) + '%)' }), r.level !== 'ok' ? el('span', { class: 'count-pill count-pill--' + (r.level === 'danger' ? 'error' : 'warn'), text: r.level === 'danger' ? 'Nearly full' : 'Filling up' }) : null]),
      bar,
      el('div', { class: 'meter__legend' }, METER_PARTS.map(function (m) { return el('span', { class: 'meter__key' }, [el('i', { class: 'meter__dot meter__seg--' + m[0] }), m[1] + ': ' + fmtSize(r[m[0]])]); }))
    ]);
  }
  var lastGuard = 0, guardShown = {};
  /* after saves: a banner once per session when storage passes 70%, and again at 90% */
  function storageGuard(force) {
    if (!force && Date.now() - lastGuard < 15000) return;
    lastGuard = Date.now();
    var r = Store.storageReport();
    if (r.level === 'ok' || guardShown[r.level]) return;
    guardShown[r.level] = true;
    showBanner('warn', ['This browser\'s storage for the CMS is ' + Math.round(r.share * 100) + '% full. ' + (r.level === 'danger' ? 'When it is full, changes stop saving.' : 'Free up some space before it fills.')], [{ label: 'Free up space', primary: true, onClick: freeSpaceDialog }, { label: 'Later' }]);
  }
  /* pages that are finished: approved and unchanged since, or every change done in Jadu */
  function handedOver(p) {
    var s = App.reviewSummary && App.reviewSummary[p.id], j = jaduProgress(p);
    var approved = !!(s && s.status === 'approved' && s.content_hash === RV.contentHash(p));
    var done = !!(j && j.total && j.done >= j.total);
    return approved || done ? (done ? 'Done in Jadu' : 'Approved') : '';
  }
  function freeSpaceDialog() {
    var body = el('div', { class: 'freespace' });
    function render() {
      var r = Store.storageReport();
      body.innerHTML = '';
      body.appendChild(storageMeter(r));
      body.appendChild(el('p', { class: 'small', text: 'The working copy of the project (pages, site settings, page versions and the originals kept for Changes) is kept in this browser\'s database, which has plenty of room for most projects. Removing old versions and originals keeps a large project quick to load and sync.' }));
      // saved versions
      var count = r.pages.reduce(function (n, p) { return n + p.versionCount; }, 0);
      var keep = el('select', { class: 'input input--sm', 'aria-label': 'Versions to keep per page' }, [['5', 'the latest 5'], ['3', 'the latest 3'], ['1', 'the latest 1'], ['0', 'none']].map(function (o) { return option(o[0], o[1]); }));
      keep.value = '3';
      body.appendChild(el('h3', { text: 'Saved page versions' }));
      body.appendChild(el('p', { class: 'small muted', text: count ? count + ' saved version' + (count === 1 ? '' : 's') + ' across all pages, using ' + fmtSize(r.versions) + '.' : 'No saved versions.' }));
      if (count) body.appendChild(el('div', { class: 'row' }, [el('span', { class: 'small', text: 'Keep' }), keep, el('span', { class: 'small', text: 'of each page' }), el('button', { class: 'btn btn--sm', type: 'button', onclick: function () {
        var n = Store.trimVersions(+keep.value); toast(n ? n + ' older version' + (n === 1 ? '' : 's') + ' removed' : 'Nothing to remove', n ? 'success' : 'info'); render(); if (App.view === 'edit' && App.sideTab === 'page') renderEditorSide();
      } }, ['Remove older versions'])]));
      // originals
      var withOriginal = r.pages.filter(function (p) { return p.original; }).sort(function (a, b) { return b.original - a.original; });
      body.appendChild(el('h3', { text: 'Originals kept for Changes' }));
      if (!withOriginal.length) body.appendChild(el('p', { class: 'small muted', text: 'No page keeps an original.' }));
      else {
        body.appendChild(el('p', { class: 'small muted', text: 'Each imported page keeps a copy of the live page to list changes for Jadu. Remove it once the page is finished; you can fetch the live page again later. Finished pages are ticked.' }));
        var list = el('div', { class: 'freespace__list' });
        withOriginal.forEach(function (info) {
          var p = Store.getPage(info.id), state = p ? handedOver(p) : '';
          var cb = el('input', { type: 'checkbox', value: info.id, checked: !!state });
          list.appendChild(el('label', { class: 'freespace__row' }, [cb, el('span', { class: 'freespace__title', text: info.title }), state ? el('span', { class: 'signoff__pill signoff__pill--sm signoff__pill--approved', text: state }) : null, el('span', { class: 'small muted', text: fmtSize(info.original) })]));
        });
        body.appendChild(list);
        body.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn btn--sm', type: 'button', onclick: function () {
          var ids = Array.prototype.map.call(list.querySelectorAll('input:checked'), function (c) { return c.value; });
          if (!ids.length) { toast('Tick the pages first', 'info'); return; }
          UI.confirm('Remove originals', 'Remove the original copy from ' + ids.length + ' page' + (ids.length === 1 ? '' : 's') + '? Their change lists go too. The live page address is kept so you can fetch it again.', 'Remove', true).then(function (ok) {
            if (!ok) return;
            ids.forEach(function (id) { var p = Store.getPage(id); if (p && p.source) p.source = { url: p.source.url || '', removedAt: new Date().toISOString() }; });
            Store.save(); toast('Originals removed', 'success'); render();
            if (App.view === 'edit' && App.previewMode === 'changes') renderChanges();
          });
        } }, ['Remove ticked originals'])]));
      }
      var est = el('p', { class: 'small muted' });
      body.appendChild(est);
      if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) { if (e && e.quota) est.textContent = 'Images and snapshots: ' + fmtSize(e.usage || 0) + ' used of ' + fmtSize(e.quota) + ' available to this site.'; }).catch(function () {});
    }
    render();
    UI.modal({ title: 'Free up browser storage', wide: true, body: body, buttons: [{ label: 'Done', primary: true }] });
  }

  /* ================= preview ================= */
  var Preview = { iframe: null, ready: false, scrollY: 0, page: null, mode: 'page', codeEl: null, stageEl: null };
  function previewHtml() {
    var c = ctx();
    if (Preview.mode === 'library') return libraryHtml();
    var page = Preview.page || App.page || c.pages[0];
    if (!page) return '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">No pages yet.</body></html>';
    return R.renderDocument(c.site, page, { editor: true, pages: c.pages, sections: c.sections });
  }
  /* A full reload re-initialises the design-system scripts, but it is visually disruptive, so it is only done when
     needed and always off-screen: a second iframe loads behind the current one and is swapped in once it is ready
     and scrolled to the same place. */
  var NEEDS_JS = /uol-accordion|uol-gallery|js-uolTableStackable|uol-index-table|uol-form__input--select|uol-datepicker|bannerSlideshow|uol-banner|uol-in-page-navigation--with-accordion|uol-typeahead|uol-tabs|uol-filters-panel/;
  function reloadPreview(keepScroll) {
    if (App.previewMode === 'code') { renderCode(); return; }
    if (App.previewMode === 'changes' && Preview.changesEl) { renderChangesSoon(); return; }
    if (!Preview.iframe) return;
    Preview.restoreScroll = keepScroll !== false;
    if (!Preview.ready || !Preview.stageEl) { Preview.ready = false; Preview.iframe.srcdoc = previewHtml(); return; }
    if (Preview.pending) { Preview.pending.remove(); Preview.pending = null; }
    var next = el('iframe', { class: 'preview__frame preview__frame--pending', title: 'Page preview' });
    Preview.pending = next;
    Preview.stageEl.appendChild(next);
    next.srcdoc = previewHtml();
  }
  function finishSwap() {
    var next = Preview.pending; if (!next) return;
    Preview.pending = null;
    if (Preview.restoreScroll && Preview.scrollY) next.contentWindow.postMessage({ uolcms: 'scrollTo', y: Preview.scrollY }, '*');
    if (App.selectedBlock) next.contentWindow.postMessage({ uolcms: 'highlight', id: App.selectedBlock, scroll: false }, '*');
    setTimeout(function () {
      var old = Preview.iframe;
      Preview.iframe = next; Preview.ready = true;
      next.classList.remove('preview__frame--pending');
      if (old && old !== next) old.remove();
      if (cloudMode()) renderPresence();
    }, 60);
  }
  var reloadPreviewSoon = debounce(function () { reloadPreview(true); }, 700);
  function patchBlock(block) {
    if (App.previewMode === 'code') { renderCode(); return; }
    if (App.previewMode === 'changes' && Preview.changesEl) { renderChangesSoon(); return; }
    if (!Preview.iframe || !Preview.ready) { reloadPreviewSoon(); return; }
    var html = R.renderBlock(block);
    Preview.iframe.contentWindow.postMessage({ uolcms: 'patch', id: block.id, html: html }, '*');
    if (NEEDS_JS.test(html)) reloadPreviewSoon();
  }
  function pushTheme() { if (Preview.iframe && Preview.ready) Preview.iframe.contentWindow.postMessage({ uolcms: 'theme', css: R.themeCss(Store.data.site.theme) }, '*'); }
  function highlightBlock(id, scroll) { if (Preview.iframe && Preview.ready) Preview.iframe.contentWindow.postMessage({ uolcms: 'highlight', id: id, scroll: !!scroll }, '*'); }

  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (!d.uolcms) return;
    // grabbed pages may come from this window (extension), this site, or a leeds.ac.uk page (bookmarklet)
    var trustedSender = e.source === window || e.origin === location.origin || /^https?:\/\/([a-z0-9-]+\.)*leeds\.ac\.uk(:\d+)?$/i.test(e.origin || '');
    if (d.uolcms === 'import' && !trustedSender) return;
    if (d.uolcms === 'import' && (typeof d.html === 'string' || Array.isArray(d.pages))) {
      if (e.source && e.source.postMessage) { try { e.source.postMessage({ uolcms: 'import-ack' }, '*'); } catch (err) {} }
      var msg = { kind: String(d.kind || 'page'), html: typeof d.html === 'string' ? d.html : '', url: String(d.url || ''), title: String(d.title || ''), pages: Array.isArray(d.pages) ? d.pages : null, failed: Array.isArray(d.failed) ? d.failed : [], assets: d.assets && typeof d.assets === 'object' ? d.assets : null };
      if (App.view === 'import' && App.onGrabberImport) App.onGrabberImport(msg); else { App.pendingGrab = msg; go('#import'); }
      return;
    }
    var fromPending = Preview.pending && e.source === Preview.pending.contentWindow;
    var fromCurrent = Preview.iframe && e.source === Preview.iframe.contentWindow;
    if (d.uolcms === 'ready') {
      if (fromPending) { finishSwap(); return; }
      if (!fromCurrent) return;
      Preview.ready = true;
      if (Preview.restoreScroll && Preview.scrollY) Preview.iframe.contentWindow.postMessage({ uolcms: 'scrollTo', y: Preview.scrollY }, '*');
      if (App.selectedBlock) highlightBlock(App.selectedBlock, false);
    }
    if (fromPending) return; // the hidden copy never drives the editor
    if (d.uolcms === 'scroll') Preview.scrollY = d.y;
    if (App.view !== 'edit' || !App.page) { if (d.uolcms === 'navigate') navigateTo(d.slug); return; }
    if (d.uolcms === 'select') selectBlock(d.id, { fromPreview: true });
    if (d.uolcms === 'shortcut') {
      if (document.getElementById('modal-root').children.length) return;
      if (d.key === '/') addBlockDialog({});
      else if (d.key === 'z') { if (d.shift) doRedo(); else doUndo(); }
      else if (d.key === 'y') doRedo();
      else if (d.key === 'Escape' && App.selectedBlock) selectBlock(null);
      return;
    }
    if (d.uolcms === 'navigate') navigateTo(d.slug);
    if (d.uolcms === 'inline' || d.uolcms === 'inlineInput') {
      var b = findBlock(d.id); if (!b) return;
      var value = d.kind === 'html' ? UI.cleanHtml(String(d.value || '')) : String(d.value || '').replace(/\s+/g, ' ').trim();
      setPath(b.props, String(d.path || ''), value);
      markDirty();
      refreshBlockForm(b);
      if (d.uolcms === 'inline') { pushUndo(); patchBlock(b); }
    }
    if (d.uolcms === 'inlineCancel') { var bc = findBlock(d.id); if (bc) patchBlock(bc); }
    if (d.uolcms === 'blockAction') {
      if (d.action === 'addFirst') { addBlockDialog({ at: 0 }); return; }
      if (d.action === 'addBefore') { addBlockDialog({ beforeId: d.id }); return; }
      var i = blockIndex(d.id); if (i === -1) return;
      var pg = App.page, bl = pg.blocks[i];
      if (d.action === 'up') moveBlock(i, i - 1);
      else if (d.action === 'down') moveBlock(i, i + 1);
      else if (d.action === 'dup') { var cpy = JSON.parse(JSON.stringify(bl)); cpy.id = Store.uid('blk'); pg.blocks.splice(i + 1, 0, cpy); afterStructureChange(cpy.id); }
      else if (d.action === 'del') { pg.blocks.splice(i, 1); if (App.selectedBlock === d.id) App.selectedBlock = null; afterStructureChange(); }
      else if (d.action === 'add') addBlockDialog({ afterId: d.id });
    }
    if (d.uolcms === 'move') {
      var from = blockIndex(d.id), toIdx = blockIndex(d.targetId);
      if (from === -1 || toIdx === -1 || from === toIdx) return;
      var moved = App.page.blocks.splice(from, 1)[0];
      var target = App.page.blocks.findIndex(function (x) { return x.id === d.targetId; });
      App.page.blocks.splice(d.before ? target : target + 1, 0, moved);
      afterStructureChange(moved.id);
    }
  });
  function navigateTo(slug) {
    var target = Store.getPageBySlug(slug);
    if (target) { if (App.view === 'edit') go('#edit/' + target.id); else { Preview.page = target; reloadPreview(false); } }
    else toast('No page with the path /' + slug + ' in this project', 'warn');
  }

  /* ---------- HTML code view ---------- */
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
  var INLINE = { a: 1, span: 1, strong: 1, em: 1, b: 1, i: 1, time: 1, cite: 1, br: 1, img: 1, small: 1, sup: 1, sub: 1, code: 1, label: 1, input: 1, button: 1, abbr: 1 };
  function prettyHtml(html, collapseSvg) {
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    var out = [];
    function pad(n) { return new Array(n + 1).join('  '); }
    function openTag(n) { var s = '<' + n.tagName.toLowerCase(); Array.prototype.forEach.call(n.attributes, function (a) { s += ' ' + a.name + (a.value === '' && a.name !== 'alt' ? '' : '="' + a.value.replace(/"/g, '&quot;') + '"'); }); return s + '>'; }
    function walk(node, depth) {
      Array.prototype.forEach.call(node.childNodes, function (n) {
        if (n.nodeType === 3) { var t = n.textContent.replace(/\s+/g, ' ').trim(); if (t) out.push(pad(depth) + t); return; }
        if (n.nodeType === 8) { out.push(pad(depth) + '<!--' + n.textContent + '-->'); return; }
        if (n.nodeType !== 1) return;
        var tag = n.tagName.toLowerCase();
        if (tag === 'svg' && collapseSvg) { out.push(pad(depth) + openTag(n) + '…</svg>'); return; }
        var kids = Array.prototype.slice.call(n.childNodes);
        var simple = kids.every(function (k) { return k.nodeType === 3 || (k.nodeType === 1 && INLINE[k.tagName.toLowerCase()] && !k.children.length); }) && n.innerHTML.replace(/\s+/g, ' ').length < 110 && !(tag === 'svg');
        if (VOID[tag] || !kids.length) { out.push(pad(depth) + openTag(n) + (VOID[tag] ? '' : '</' + tag + '>')); return; }
        if (simple) { out.push(pad(depth) + openTag(n) + n.innerHTML.replace(/\s+/g, ' ').trim() + '</' + tag + '>'); return; }
        out.push(pad(depth) + openTag(n));
        walk(n, depth + 1);
        out.push(pad(depth) + '</' + tag + '>');
      });
    }
    walk(doc.body, 0);
    return out.join('\n');
  }
  function highlightHtml(src) {
    var s = esc(src);
    s = s.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="c">$1</span>');
    s = s.replace(/(&lt;\/?)([a-zA-Z][\w-]*)([\s\S]*?)(\/?&gt;)/g, function (m, a, tag, attrs, z) {
      attrs = attrs.replace(/([\w-]+)(=)(&quot;[\s\S]*?&quot;)/g, '<span class="a">$1</span>$2<span class="s">$3</span>');
      return a + '<span class="t">' + tag + '</span>' + attrs + z;
    });
    return s;
  }
  function codeSource() {
    var c = ctx(), page = Preview.page || App.page || c.pages[0];
    if (!page) return '';
    if (App.codeScope === 'block') { var b = findBlock(App.selectedBlock); return b ? R.blockMarkup(b) : '<!-- select a block in the Blocks list or the preview -->'; }
    if (App.codeScope === 'full') return R.renderDocument(c.site, page, { pages: c.pages, sections: c.sections, noLinks: true });
    return R.renderBody(c.site, page, { pages: c.pages, sections: c.sections });
  }
  function renderCode() {
    if (!Preview.codeEl) return;
    var pre = Preview.codeEl.querySelector('pre');
    var src = codeSource();
    var collapse = !Preview.codeEl.querySelector('.codeview__svg').checked;
    pre.innerHTML = highlightHtml(App.codeScope === 'full' ? src : prettyHtml(src, collapse));
  }

  function previewPane(opts) {
    opts = opts || {};
    var frame = el('iframe', { class: 'preview__frame', title: 'Page preview' });
    Preview.iframe = frame; Preview.ready = false; Preview.pending = null;
    var devices = [['desktop', 'Desktop width', '', 'desktop'], ['laptop', '1024px wide', '1024px', 'laptop'], ['tablet', '768px wide (tablet)', '768px', 'tablet'], ['mobile', '375px wide (phone)', '375px', 'mobile']];
    var stage = el('div', { class: 'preview__stage' }, [frame]);
    Preview.stageEl = stage;
    var devBar = el('div', { class: 'preview__devices', role: 'group', 'aria-label': 'Preview width' }, devices.map(function (d) {
      return iconBtn(d[3], d[1], function () { App.device = d[0]; devBar.querySelectorAll('.ibtn').forEach(function (b) { b.classList.remove('is-active'); }); this.classList.add('is-active'); stage.style.width = d[2] || '100%'; stage.classList.toggle('preview__stage--device', !!d[2]); }, { class: 'ibtn' + (App.device === d[0] ? ' is-active' : '') });
    }));
    var init = devices.filter(function (d) { return d[0] === App.device; })[0];
    if (init && init[2]) { stage.style.width = init[2]; stage.classList.add('preview__stage--device'); }
    var scroller = el('div', { class: 'preview__scroller' }, [stage]);
    /* code view */
    var scopeSel = el('select', { class: 'input input--sm', 'aria-label': 'What to show' }, [['body', 'Page markup (body)'], ['block', 'Selected block'], ['full', 'Full document']].map(function (o) { var opt = el('option', { value: o[0], text: o[1] }); if (App.codeScope === o[0]) opt.selected = true; return opt; }));
    scopeSel.addEventListener('change', function () { App.codeScope = scopeSel.value; renderCode(); });
    var svgChk = el('input', { type: 'checkbox', class: 'codeview__svg' });
    svgChk.addEventListener('change', renderCode);
    var code = el('div', { class: 'codeview', hidden: true }, [
      el('div', { class: 'codeview__bar' }, [scopeSel, el('label', { class: 'check codeview__note' }, [svgChk, el('span', { text: 'Show full SVG markup' })]), el('span', { class: 'spacer' }), el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { X.copyText(codeSource()).then(function () { toast('Markup copied', 'success'); }); } }, ['Copy']), el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { X.download(new Blob([codeSource()], { type: 'text/html' }), (App.codeScope === 'block' ? 'block' : 'page') + '-markup.html'); } }, ['Download'])]),
      el('pre', { tabindex: '0' })
    ]);
    Preview.codeEl = code;
    /* the editor adds a third view: what changed since the original, for Jadu */
    var changesEl = opts.changes ? el('div', { class: 'changes', hidden: true }) : null;
    Preview.changesEl = changesEl;
    if (App.previewMode === 'changes' && !changesEl) App.previewMode = 'preview';
    var modes = [['preview', 'Preview'], ['code', 'HTML']].concat(changesEl ? [['changes', 'Changes']] : []);
    var modeBar = el('div', { class: 'seg', role: 'group', 'aria-label': 'View' }, modes.map(function (m) {
      return el('button', { type: 'button', class: 'seg__btn', 'data-mode': m[0], title: m[0] === 'changes' ? 'What changed since the original page, as a change list for Jadu' : null, onclick: function () { setMode(m[0]); } }, [m[1]]);
    }));
    function applyMode() {
      var m = App.previewMode;
      modeBar.querySelectorAll('.seg__btn').forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-mode') === m); });
      code.hidden = m !== 'code'; scroller.hidden = m !== 'preview'; if (changesEl) changesEl.hidden = m !== 'changes';
      devBar.style.visibility = m === 'preview' ? '' : 'hidden';
    }
    function setMode(m) { App.previewMode = m; applyMode(); if (m === 'code') renderCode(); else if (m === 'changes') renderChanges(); else reloadPreview(true); }
    Preview.setMode = setMode;
    applyMode();
    var controls = el('div', { class: 'preview__controls' }, [devBar, modeBar]);
    var children = [scroller, code].concat(changesEl ? [changesEl] : []);
    if (opts.controlsHost) { opts.controlsHost.appendChild(controls); if (opts.extra && opts.extra.length) opts.extra.forEach(function (x) { opts.controlsHost.appendChild(x); }); }
    else children.unshift(el('div', { class: 'preview__bar' }, [controls, el('div', { class: 'preview__bar-right' }, opts.extra || [])]));
    var pane = el('section', { class: 'preview' }, children);
    setTimeout(function () { reloadPreview(false); if (App.previewMode === 'code') renderCode(); }, 0);
    return pane;
  }

  /* ================= routing ================= */
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  function route() {
    var C = window.UOL_CLOUD;
    if (!App.mode) return; // still starting up
    // a link from a sign-up or password email opened in a tab that already had the CMS: start again to read it
    if (cloudMode() && /(^|[#&])(access_token|error)=/.test(location.hash)) { location.reload(); return; }
    var h = location.hash.replace(/^#\/?/, '') || (cloudMode() && !Store.data ? 'projects' : 'pages');
    var parts = h.split('/');
    if (cloudMode()) {
      // nothing but the sign-in screens until someone is signed in
      var signedIn = !!C.user();
      document.body.classList.toggle('is-auth', !signedIn);
      if (!signedIn) { App.view = 'auth'; App.page = null; renderAuth(); return; }
      if (parts[0] === 'open') { openFromLink(parts[1], parts[2]); return; }
      if (parts[0] === 'cloud') parts[0] = 'sharing';
      if (!Store.data && !NO_PROJECT_VIEWS[parts[0]]) { go('#projects'); return; }
    }
    App.view = parts[0];
    var root = document.getElementById('app');
    root.innerHTML = '';
    root.className = 'app app--' + parts[0];
    Preview.iframe = null; Preview.pending = null; Preview.stageEl = null; Preview.ready = false; Preview.codeEl = null; Preview.changesEl = null; Preview.setMode = null; Preview.mode = 'page';
    switch (parts[0]) {
      case 'edit': { var page = Store.getPage(parts[1]); if (!page) { go('#pages'); return; } App.page = page; Preview.page = page; recordBaseline(); root.appendChild(editorView()); break; }
      case 'site': App.page = null; screenTopbar('Site'); root.appendChild(siteView()); break;
      case 'theme': App.page = null; screenTopbar('Theme'); root.appendChild(themeView()); break;
      case 'library': App.page = null; screenTopbar('Components'); root.appendChild(libraryView()); break;
      case 'settings': App.page = null; screenTopbar('Settings'); root.appendChild(settingsView()); break;
      case 'media': App.page = null; screenTopbar('Media library'); root.appendChild(mediaView()); break;
      case 'import': App.page = null; screenTopbar('Import'); root.appendChild(importView()); break;
      case 'export': App.page = null; screenTopbar('Save and export'); root.appendChild(exportView()); break;
      case 'help': App.page = null; screenTopbar('Help'); root.appendChild(helpView()); break;
      case 'cloud': App.page = null; screenTopbar('Cloud'); root.appendChild(cloudView()); break;
      case 'projects': App.page = null; screenTopbar('Projects'); root.appendChild(projectsView()); break;
      case 'sharing': App.page = null; screenTopbar('Sharing'); root.appendChild(sharingView()); break;
      default: App.view = 'pages'; App.page = null; screenTopbar(cloudMode() && C.link() ? C.link().name || 'Pages' : 'Pages'); root.appendChild(pagesView());
    }
    setRailActive(App.view);
    root.scrollTo(0, 0);
    if (cloudMode()) { C.presence.set({ page: App.view === 'edit' && App.page ? App.page.id : null, block: App.view === 'edit' ? App.selectedBlock || null : null, editing: false }); renderPresence(); }
  }

  /* ================= pages view (grouped by section) ================= */
  /* one row of the Pages table */
  function sectionSelect(p) {
    var sec = Store.sectionOf(p.id);
    var moveSel = el('select', { class: 'input input--sm', 'aria-label': 'Section for ' + p.title }, [el('option', { value: '', text: 'No section' })].concat(Store.data.sections.map(function (s) { var o = el('option', { value: s.id, text: s.title }); if (sec && sec.id === s.id) o.selected = true; return o; })).concat([el('option', { value: '__new', text: 'New section…' })]));
    moveSel.addEventListener('change', function () {
      if (moveSel.value === '__new') { UI.prompt('New section', 'Section title', p.title, 'Create').then(function (t) { if (!t) { route(); return; } var s = Store.createSection(t); Store.addToSection(p.id, s.id); route(); }); return; }
      if (moveSel.value) Store.addToSection(p.id, moveSel.value); else Store.removeFromSection(p.id);
      route();
    });
    return moveSel;
  }
  function pageRow(p, numbered) {
    var status = p.status || 'draft';
    return el('tr', {}, [
      el('td', { class: 'ptable__num' }, [numbered ? String(numbered) : '']),
      el('td', { class: 'ptable__title' }, [el('span', { class: 'ptable__titleline' }, [el('a', { href: '#edit/' + p.id, text: p.title }), el('span', { class: 'page-people', 'data-people': p.id })]), el('span', { class: 'ptable__sub', text: (p.blocks || []).length + ' block' + ((p.blocks || []).length === 1 ? '' : 's') })]),
      el('td', { class: 'ptable__path ptable__hide-sm', text: '/' + p.slug }),
      el('td', {}, [el('span', { class: 'tag tag--' + p.template, text: p.template })]),
      el('td', { class: 'ptable__status', 'data-signoff': p.id }, [el('span', { class: 'status status--' + status, text: status })]),
      el('td', { class: 'ptable__hide-sm ptable__when', text: fmtTime(p.updatedAt) }),
      el('td', { class: 'ptable__hide-sm' }, [sectionSelect(p)]),
      el('td', {}, [el('span', { class: 'ptable__actions' }, [
        el('a', { class: 'btn btn--xs btn--primary', href: '#edit/' + p.id, text: 'Edit' }),
        el('a', { class: 'btn btn--xs', href: pageUrl(p), target: '_blank', rel: 'noopener', title: 'Open the page in a new tab', text: 'Open' }),
        menuButton(null, [
          { label: 'Duplicate', onClick: function () { var c = Store.duplicatePage(p.id); toast('Duplicated as "' + c.title + '"', 'success'); go('#edit/' + c.id); } },
          { label: 'Page JSON', onClick: function () { X.exportPageJson(p); } },
          '-',
          { label: 'Delete', onClick: function () { UI.confirm('Delete page', 'Delete "' + p.title + '"? This cannot be undone (unless you have a snapshot or project file).', 'Delete', true).then(function (ok) { if (ok) { Store.deletePage(p.id); toast('Page deleted', 'info'); route(); } }); } }
        ], { icon: 'more', title: 'More actions for ' + p.title })
      ])])
    ]);
  }
  function pagesTable(pages, numbered) {
    return el('div', { class: 'ptable-wrap' }, [el('table', { class: 'ptable' }, [
      el('thead', {}, [el('tr', {}, [el('th', { class: 'ptable__num' }, ['#']), el('th', {}, ['Title']), el('th', { class: 'ptable__hide-sm' }, ['Path']), el('th', {}, ['Template']), el('th', {}, ['Status']), el('th', { class: 'ptable__hide-sm' }, ['Updated']), el('th', { class: 'ptable__hide-sm' }, ['Section']), el('th', { class: 'ptable__actions-h' }, [''])])]),
      el('tbody', {}, pages.map(function (p, i) { return pageRow(p, numbered ? i + 1 : 0); }))
    ])]);
  }
  /* export every page of a section as one PDF, a ZIP of PDFs or a ZIP of PNGs */
  function sectionExportItems(sectionTitle, getPages) {
    function run(format, mode) {
      var pages = getPages();
      if (!pages.length) { toast('No pages to export', 'warn'); return; }
      toast('Rendering ' + pages.length + ' page' + (pages.length === 1 ? '' : 's') + '… this takes a few seconds per page', 'info', 5000);
      X.exportPages(ctx(), pages, sectionTitle, { format: format, mode: mode, width: 1280, onProgress: function (i, n, p) { toast('Rendering ' + i + ' of ' + n + ': ' + p.title, 'info', 2500); } })
        .then(function (n) { toast(n + ' page' + (n === 1 ? '' : 's') + ' exported', 'success', 4000); })
        .catch(function (e) { toast('Export failed: ' + e.message, 'error', 7000); });
    }
    return [
      { label: 'Export: one PDF, all pages (tall pages)', onClick: function () { run('pdf', 'single'); } },
      { label: 'Export: one PDF, all pages (A4)', onClick: function () { run('pdf', 'a4'); } },
      { label: 'Export: ZIP of PDFs, one per page', onClick: function () { run('pdf-pages', 'single'); } },
      { label: 'Export: ZIP of PNGs, one per page', onClick: function () { run('png'); } }
    ];
  }
  function sectionExportMenu(sectionTitle, getPages) {
    return menuButton('Export section', sectionExportItems(sectionTitle, getPages).map(function (i) { return { label: i.label.replace(/^Export: /, ''), onClick: i.onClick }; }));
  }
  var PAGES_UI_KEY = 'leeds-cms:pages-ui';
  function pagesUi() { try { return JSON.parse(localStorage.getItem(PAGES_UI_KEY) || '{}'); } catch (e) { return {}; } }
  function savePagesUi(u) { try { localStorage.setItem(PAGES_UI_KEY, JSON.stringify(u)); } catch (e) {} }
  function pagesView() {
    var ui = pagesUi(); ui.collapsed = ui.collapsed || {};
    var search = el('input', { class: 'input', type: 'search', placeholder: 'Filter by title or path…', 'aria-label': 'Filter pages', value: ui.q || '' });
    var tplSel = el('select', { class: 'input input--sm', 'aria-label': 'Template filter' }, [['', 'All templates'], ['homepage', 'Homepages'], ['document', 'Document pages'], ['article', 'Articles']].map(function (o) { var opt = el('option', { value: o[0], text: o[1] }); if ((ui.tpl || '') === o[0]) opt.selected = true; return opt; }));
    var statusSel = el('select', { class: 'input input--sm', 'aria-label': 'Status filter' }, [['', 'Any status'], ['draft', 'Draft'], ['published', 'Published']].map(function (o) { var opt = el('option', { value: o[0], text: o[1] }); if ((ui.status || '') === o[0]) opt.selected = true; return opt; }));
    var sortSel = el('select', { class: 'input input--sm', 'aria-label': 'Sort' }, [['updated', 'Recently updated'], ['title', 'Title A to Z'], ['created', 'Newest first']].map(function (o) { var opt = el('option', { value: o[0], text: o[1] }); if ((ui.sort || 'updated') === o[0]) opt.selected = true; return opt; }));
    var list = el('div');
    function matches(p) {
      var q = search.value.toLowerCase();
      if (q && (p.title + ' ' + p.slug).toLowerCase().indexOf(q) === -1) return false;
      if (tplSel.value && p.template !== tplSel.value) return false;
      if (statusSel.value && (p.status || 'draft') !== statusSel.value) return false;
      return true;
    }
    function sortPages(arr) {
      var s = sortSel.value;
      return arr.slice().sort(function (a, b) { return s === 'title' ? a.title.localeCompare(b.title) : s === 'created' ? (b.createdAt || '').localeCompare(a.createdAt || '') : (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
    }
    function persist() { ui.q = search.value; ui.tpl = tplSel.value; ui.status = statusSel.value; ui.sort = sortSel.value; savePagesUi(ui); }
    function group(id, title, meta, actions, pages, numbered) {
      var collapsed = !!ui.collapsed[id];
      var body = pages.length ? pagesTable(pages, numbered) : el('p', { class: 'muted small', text: 'No pages here yet.' });
      body.hidden = collapsed;
      var toggle = el('button', { type: 'button', class: 'section-group__toggle', 'aria-expanded': collapsed ? 'false' : 'true', onclick: function () { ui.collapsed[id] = !ui.collapsed[id]; savePagesUi(ui); body.hidden = !!ui.collapsed[id]; toggle.setAttribute('aria-expanded', ui.collapsed[id] ? 'false' : 'true'); toggle.textContent = ui.collapsed[id] ? '▸' : '▾'; } }, [collapsed ? '▸' : '▾']);
      return el('div', { class: 'section-group' }, [el('div', { class: 'section-group__head' }, [toggle, el('h2', { text: title }), el('span', { class: 'section-group__meta', text: meta }), el('div', { class: 'section-group__actions' }, actions)]), body]);
    }
    function starterTiles() {
      function tile(ic, title, text, onClick) { return el('button', { type: 'button', class: 'starter', onclick: onClick }, [el('span', { class: 'starter__icon' }, [icon(ic, 28)]), el('strong', { text: title }), el('span', { text: text })]); }
      return el('div', {}, [
        el('p', { class: 'lead', text: 'Nothing here yet. Start with one of these:' }),
        el('div', { class: 'starters' }, [
          tile('site', 'Homepage', 'Banner carousel and widgets, like leeds.ac.uk or a faculty home.', function () { var p = Store.createPage('homepage', 'Homepage'); toast('Page created', 'success'); go('#edit/' + p.id); }),
          tile('pages', 'Document page', 'Content with side navigation, the standard page in Jadu.', function () { var p = Store.createPage('document', 'New page'); toast('Page created', 'success'); go('#edit/' + p.id); }),
          tile('import', 'Import a leeds.ac.uk page', 'Grab a live page, homepage or whole section and edit it here.', function () { go('#import'); })
        ])
      ]);
    }
    function render() {
      persist();
      list.innerHTML = '';
      setTimeout(function () { fillSignoffChips(list); }, 0);
      if (!Store.data.pages.length && !Store.data.sections.length) { list.appendChild(starterTiles()); return; }
      var filtering = !!(search.value || tplSel.value || statusSel.value);
      Store.data.sections.forEach(function (s) {
        var all = Store.sectionPages(s.id), pages = all.filter(matches);
        if (!pages.length && filtering) return;
        list.appendChild(group(s.id, s.title, pages.length + (filtering ? ' of ' + all.length : '') + ' page' + (all.length === 1 ? '' : 's') + ' · ' + ({ side: 'side navigation', contents: 'contents list', both: 'side navigation and contents' }[s.navStyle || 'side']) + (s.pageNav === false ? '' : ' · previous/next'), [
          el('button', { class: 'btn btn--sm btn--primary', type: 'button', onclick: function () { newPageDialog(s.id); } }, ['+ Page']),
          menuButton(null, [
            { label: 'Section settings', onClick: function () { sectionSettingsDialog(s, render); } },
            { label: 'Open the first page', onClick: function () { if (all[0]) window.open(pageUrl(all[0]), '_blank', 'noopener'); } },
            '-'
          ].concat(sectionExportItems(s.title, function () { return Store.sectionPages(s.id); })).concat(['-',
            { label: 'Remove section (keeps the pages)', onClick: function () { UI.confirm('Remove section', 'Remove the section "' + s.title + '"? Its pages are kept (they just stop sharing navigation).', 'Remove section', true).then(function (ok) { if (ok) { Store.deleteSection(s.id); render(); } }); } }
          ]), { icon: 'more', title: 'Section actions' })
        ], pages, true));
      });
      var looseAll = Store.ungroupedPages(), loose = sortPages(looseAll.filter(matches));
      if (loose.length || !filtering) list.appendChild(group('__loose', Store.data.sections.length ? 'Pages not in a section' : 'Pages', loose.length + (filtering ? ' of ' + looseAll.length : '') + ' page' + (looseAll.length === 1 ? '' : 's'), looseAll.length ? [menuButton(null, sectionExportItems('pages', function () { return sortPages(looseAll.filter(matches)); }), { icon: 'more', title: 'Actions' })] : [], loose, false));
      if (!list.children.length) list.appendChild(el('p', { class: 'empty', text: 'No pages match the filter.' }));
    }
    [search, tplSel, statusSel, sortSel].forEach(function (c) { c.addEventListener(c === search ? 'input' : 'change', render); });
    render();
    function setAll(collapsed) { Store.data.sections.forEach(function (s) { ui.collapsed[s.id] = collapsed; }); ui.collapsed.__loose = collapsed; savePagesUi(ui); render(); }
    return el('div', { class: 'page-wrap' }, [
      el('div', { class: 'page-head' }, [el('div', { class: 'page-head__actions' }, [el('button', { class: 'btn btn--primary', type: 'button', onclick: function () { newPageDialog(); } }, ['+ New page']), el('button', { class: 'btn', type: 'button', onclick: function () { UI.prompt('New section', 'Section title (for example "Undergraduate")', '', 'Create').then(function (t) { if (t) { Store.createSection(t); render(); } }); } }, ['+ New section']), el('a', { class: 'btn', href: '#import', text: 'Import' }), cloudMode() ? el('button', { class: 'btn', type: 'button', onclick: function () { UI.modal({ title: 'Recently deleted pages', wide: true, body: deletedPagesPanel(), buttons: [{ label: 'Done', primary: true, onClick: function () { route(); } }] }); } }, ['Recently deleted']) : null]), el('span', { class: 'spacer' }), el('span', { class: 'hint-icon', title: 'A section is a group of pages that share navigation: the side menu, the contents list and previous/next links are generated from the pages in it, in order. Use the dropdown on a page to move it between sections. Sort applies to pages outside sections; pages inside a section keep their navigation order.' }, ['?'])]),
      el('div', { class: 'filterbar' }, [search, tplSel, statusSel, sortSel, el('span', { class: 'spacer' }), el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { setAll(false); } }, ['Expand all']), el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { setAll(true); } }, ['Collapse all'])]),
      list
    ]);
  }
  function newPageDialog(sectionId) {
    var title = el('input', { class: 'input', type: 'text', placeholder: 'Page title', value: '' });
    var tpl = el('select', { class: 'input' }, [['document', 'Document page (content with side navigation)'], ['homepage', 'Homepage (banner and widgets)'], ['article', 'Article (news, event, profile)'], ['blank', 'Blank document page']].map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
    var form = el('form', { onsubmit: function (e) { e.preventDefault(); create(); } }, [el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Title' }), title]), el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Template' }), tpl])]);
    var m = UI.modal({ title: sectionId ? 'New page in "' + Store.getSection(sectionId).title + '"' : 'New page', body: form, buttons: [{ label: 'Cancel' }, { label: 'Create page', primary: true, onClick: function () { create(); return false; } }] });
    function create() { var t = title.value.trim() || 'Untitled page'; var p = Store.createPage(tpl.value, t); if (sectionId) Store.addToSection(p.id, sectionId); m.close(); toast('Page created', 'success'); go('#edit/' + p.id); }
  }
  function sectionSettingsDialog(s, onDone) {
    var body = el('div');
    UI.renderForm(body, sectionFields(), s, function () { Store.save(); });
    body.appendChild(el('div', { class: 'field' }, [el('span', { class: 'field__label', text: 'Pages in this section (drag to reorder)' }), sectionOrderList(s, {})]));
    UI.modal({ title: 'Section settings', wide: true, body: body, buttons: [{ label: 'Done', primary: true }], onClose: function () { Store.save(); if (onDone) onDone(); if (App.page) { renderSwitcher(); reloadPreview(true); } } });
  }

  /* ================= editor view ================= */
  var sideEl, blockListEl;
  function editorView() {
    var page = App.page;
    var titleInput = el('input', { class: 'input input--title', type: 'text', value: page.title, 'aria-label': 'Page title' });
    titleInput.addEventListener('input', debounce(function () { page.title = titleInput.value; markDirty(); pushUndo(); reloadPreviewSoon(); renderSwitcher(); }, 250));
    var slugInput = el('input', { class: 'input input--slug', type: 'text', value: page.slug, 'aria-label': 'Page path' });
    slugInput.addEventListener('change', function () { page.slug = Store.uniqueSlug(slugInput.value || page.title, page.id); slugInput.value = page.slug; markDirty(); });
    var tplSel = el('select', { class: 'input input--sm', 'aria-label': 'Template' }, [['homepage', 'Homepage'], ['document', 'Document page'], ['article', 'Article']].map(function (o) { var opt = el('option', { value: o[0], text: o[1] }); if (page.template === o[0]) opt.selected = true; return opt; }));
    tplSel.addEventListener('change', function () {
      page.template = tplSel.value; markDirty(); pushUndo(); renderEditorSide(); reloadPreview();
      var n = outsideLibrary(page).length;
      if (n) toast(n + ' block' + (n === 1 ? ' is' : 's are') + ' not in the ' + templateName(page.template) + ' library. Check page on the Review tab lists ' + (n === 1 ? 'it' : 'them') + '.', 'warn', 7000);
    });
    var statusSel = el('select', { class: 'input input--sm', 'aria-label': 'Status' }, [['draft', 'Draft'], ['published', 'Published']].map(function (o) { var opt = el('option', { value: o[0], text: o[1] }); if (page.status === o[0]) opt.selected = true; return opt; }));
    statusSel.addEventListener('change', function () { page.status = statusSel.value; markDirty(); });
    App.topFields = { title: titleInput, slug: slugInput, tpl: tplSel, status: statusSel };
    /* single top row: back, title, meta, undo/redo, preview controls, save state, primary action, overflow menu */
    var meta = el('div', { class: 'topbar__meta' }, [el('span', { class: 'slug-wrap' }, ['/', slugInput]), tplSel, statusSel]);
    var controlsHost = el('div', { class: 'topbar__controls' }, [
      el('button', { class: 'ibtn ibtn--accent', type: 'button', title: 'Add a block (below the selected block, or at the end)', 'aria-label': 'Add a block', onclick: function () { addBlockDialog({}); } }, [icon('plus')]),
      el('span', { class: 'topbar__gap' }),
      el('button', { id: 'btn-undo', class: 'ibtn', type: 'button', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: doUndo }, [icon('undo')]),
      el('button', { id: 'btn-redo', class: 'ibtn', type: 'button', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', onclick: doRedo }, [icon('redo')]),
      el('span', { class: 'topbar__gap' })
    ]);
    var more = menuButton(null, [
      { label: 'Save a version (Ctrl+S)', onClick: function () { saveVersion(); } },
      { label: 'Versions', onClick: function () { App.sideTab = 'page'; App.openGroup = 'versions'; renderEditorSide(); } },
      { label: 'Changes for Jadu', onClick: function () { if (Preview.setMode) Preview.setMode('changes'); } },
      { label: 'Share a review link…', onClick: function () { shareLinkDialog('page'); } },
      '-'
    ].concat(exportMenuItems(page)).concat(['-',
      { label: 'Duplicate page', onClick: function () { var c = Store.duplicatePage(page.id); toast('Duplicated as "' + c.title + '"', 'success'); go('#edit/' + c.id); } },
      { label: 'Delete page', onClick: function () { UI.confirm('Delete page', cloudMode() ? 'Delete "' + page.title + '"? Anyone who can edit can bring it back from Recently deleted on the Pages screen.' : 'Delete "' + page.title + '"? This cannot be undone (unless you have a snapshot or project file).', 'Delete', true).then(function (ok) { if (ok) { Store.deletePage(page.id); toast('Page deleted', 'info'); go('#pages'); } }); } },
      '-',
      { label: 'Save project to file (Ctrl+Shift+S)', onClick: function () { saveProjectToFile(false); } },
      { label: 'Open project file', onClick: openProjectFile }
    ]), { icon: 'more', title: 'More actions' });
    setTopbar([el('a', { class: 'ibtn', href: '#pages', title: 'Back to pages', 'aria-label': 'Back to pages' }, [icon('back')]), titleInput, meta], [controlsHost, cloudMode() ? presenceStack() : null, cloudChip(), el('span', { id: 'save-status', class: 'save-status' }), el('a', { class: 'btn btn--sm btn--primary', href: pageUrl(page), target: '_blank', rel: 'noopener', title: 'Open the page in a new tab' }, [el('span', { class: 'topbar__open-label', text: 'Open page' }), icon('external', 16)]), more]);
    sideEl = el('aside', { class: 'editor__side', 'aria-label': 'Inspector' });
    var preview = previewPane({ controlsHost: controlsHost, changes: true, extra: [iconBtn('refresh', 'Refresh the preview', function () { reloadPreview(true); })] });
    var mobileTabs = mobileTabBar();
    var C = window.UOL_CLOUD, viewer = cloudMode() && C.link() && C.link().role === 'viewer';
    var wrap = el('div', { class: 'editor', 'data-pane': App.mobilePane }, [mobileTabs,
      viewer ? el('div', { class: 'presence-note presence-note--viewer' }, ['You can view this project but not change it. Changes you make here are not saved.']) : null,
      el('div', { id: 'presence-note', class: 'presence-note', hidden: true }),
      el('div', { class: 'editor__body' }, [preview, sideEl])]);
    mobileTabs.bind(wrap);
    if (App.reviewPageId !== page.id) { App.reviewPageId = page.id; App.commentDraft = ''; App.commentTarget = ''; }
    renderEditorSide();
    setTimeout(updateUndoButtons, 0);
    if (cloudReady()) loadReview(false);
    return wrap;
  }
  /* the Section tab replaced the old switcher strip; callers that changed section membership re-render it */
  function renderSwitcher() { if (sideEl && App.page && App.sideTab === 'section') renderEditorSide(); }
  function addToSectionDialog(page) {
    var sel = el('select', { class: 'input' }, [el('option', { value: '__new', text: 'Create a new section' })].concat(Store.data.sections.map(function (s) { return el('option', { value: s.id, text: s.title }); })));
    var title = el('input', { class: 'input', type: 'text', placeholder: 'New section title', value: page.title });
    sel.addEventListener('change', function () { title.parentNode.hidden = sel.value !== '__new'; });
    var m = UI.modal({ title: 'Add "' + page.title + '" to a section', body: el('div', {}, [el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Section' }), sel]), el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Title' }), title])]), buttons: [{ label: 'Cancel' }, { label: 'Add', primary: true, onClick: function () { var id = sel.value; if (id === '__new') id = Store.createSection(title.value.trim() || page.title).id; Store.addToSection(page.id, id); renderSwitcher(); reloadPreview(true); toast('Added to section', 'success'); } }] });
  }

  function menuButton(label, items, opts) {
    opts = opts || {};
    var menu = el('div', { class: 'menu', hidden: true }, items.map(function (i) { return i === '-' ? el('hr') : el('button', { type: 'button', class: 'menu__item', onclick: function () { menu.hidden = true; i.onClick(); } }, [i.label]); }));
    var btn = opts.icon
      ? el('button', { class: 'ibtn', type: 'button', 'aria-haspopup': 'true', title: opts.title || label || 'Menu', 'aria-label': opts.title || label || 'Menu', onclick: function (e) { e.stopPropagation(); var open = menu.hidden; document.querySelectorAll('.menu').forEach(function (m) { m.hidden = true; }); menu.hidden = !open; } }, [icon(opts.icon)])
      : el('button', { class: 'btn btn--sm', type: 'button', 'aria-haspopup': 'true', onclick: function (e) { e.stopPropagation(); var open = menu.hidden; document.querySelectorAll('.menu').forEach(function (m) { m.hidden = true; }); menu.hidden = !open; } }, [label + ' ▾']);
    document.addEventListener('click', function () { menu.hidden = true; });
    return el('span', { class: 'menu-wrap' }, [btn, menu]);
  }
  function busy(label, p) { toast(label, 'info', 3000); return p.then(function () { toast('Done', 'success', 1200); }).catch(function (e) { toast('Failed: ' + e.message, 'error', 7000); }); }
  function exportMenuItems(page) {
    return [
      { label: 'Standalone HTML file', onClick: function () { busy('Exporting HTML…', X.exportHtml(ctx(), page)); } },
      { label: 'PNG image (desktop 1280px)', onClick: function () { busy('Rendering image… this takes a few seconds', X.exportPagePng(ctx(), page, { width: 1280 })); } },
      { label: 'PNG image (mobile 375px)', onClick: function () { busy('Rendering image…', X.exportPagePng(ctx(), page, { width: 375 })); } },
      { label: 'PNG image (2x retina 1280px)', onClick: function () { busy('Rendering image…', X.exportPagePng(ctx(), page, { width: 1280, scale: 2 })); } },
      { label: 'PDF (one tall page, like FireShot)', onClick: function () { busy('Rendering PDF… this takes a few seconds', X.exportPdf(ctx(), page, { mode: 'single', width: 1280 })); } },
      { label: 'PDF (cut into A4 pages)', onClick: function () { busy('Rendering PDF…', X.exportPdf(ctx(), page, { mode: 'a4', width: 1280 })); } },
      '-',
      { label: 'Markdown (.md)', onClick: function () { X.exportMarkdown(ctx(), page); } },
      { label: 'Word document (.doc)', onClick: function () { busy('Exporting Word…', X.exportWord(ctx(), page)); } },
      { label: 'Page JSON (re-importable)', onClick: function () { X.exportPageJson(page); } },
      { label: 'Copy page markup (for Jadu)', onClick: function () { X.copyText(X.pageMarkup(ctx(), page)).then(function () { toast('Page HTML copied to the clipboard', 'success'); }); } },
      '-',
      { label: 'Whole site as ZIP', onClick: function () { busy('Building ZIP…', X.exportSiteZip(ctx())); } }
    ];
  }
  function saveVersion() {
    if (!App.page) return;
    UI.prompt('Save version', 'Version name', 'Version ' + ((App.page.revisions || []).length + 1), 'Save').then(function (name) { if (name === null) return; Store.snapshot(App.page, name); toast('Version saved', 'success'); if (App.sideTab === 'page') { App.openGroup = 'versions'; renderEditorSide(); } });
  }

  /* ================= inspector: the right-hand panel with Block, Page and Section tabs ================= */
  var INSPECTOR_TABS = [['block', 'Block'], ['page', 'Page'], ['section', 'Section'], ['review', 'Review']];
  function normaliseTab(t) { return t === 'blocks' ? 'block' : (t === 'hero' || t === 'history') ? 'page' : (t || 'block'); }
  function renderEditorSide() {
    if (!sideEl || !App.page) return;
    App.sideTab = normaliseTab(App.sideTab);
    sideEl.innerHTML = '';
    blockListEl = null; blockFormEl = null; reviewEls = null;
    sideEl.appendChild(el('div', { class: 'tabs', role: 'tablist' }, INSPECTOR_TABS.map(function (t) { return el('button', { type: 'button', role: 'tab', 'data-tab': t[0], class: 'tabs__tab' + (App.sideTab === t[0] ? ' is-active' : ''), 'aria-selected': App.sideTab === t[0] ? 'true' : 'false', onclick: function () { App.sideTab = t[0]; renderEditorSide(); } }, [t[1]]); })));
    var body = el('div', { class: 'editor__side-body' });
    sideEl.appendChild(body);
    if (App.sideTab === 'block') renderBlockTab(body);
    else if (App.sideTab === 'page') renderPageTab(body);
    else if (App.sideTab === 'review') renderReviewTab(body);
    else renderSectionTab(body);
    updateReviewBadge();
  }

  /* ---------- Block tab: the outline when nothing is selected, otherwise the selected block's fields ---------- */
  var blockFormEl;
  function renderBlockTab(body) {
    var b = App.selectedBlock ? findBlock(App.selectedBlock) : null;
    if (!b) { App.selectedBlock = null; renderOutline(body); return; }
    renderBlockEditor(body, b);
  }
  function renderOutline(body) {
    var page = App.page;
    body.appendChild(el('div', { class: 'side-actions' }, [
      el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: function () { addBlockDialog({}); } }, ['+ Add block']),
      el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { importSectionDialog(); } }, ['Import section']),
      el('span', { class: 'muted small outline__count', text: page.blocks.length + ' block' + (page.blocks.length === 1 ? '' : 's') })
    ]));
    blockListEl = el('div', { class: 'outline', role: 'list' });
    body.appendChild(blockListEl);
    rebuildOutlineRows();
    body.appendChild(el('p', { class: 'small muted', text: page.blocks.length ? 'Click a block here or in the preview to edit it. Drag ☰ to reorder. Double-click text in the preview to edit it in place.' : 'This page has no blocks yet. Add a block or import a section from an existing page.' }));
  }
  function rebuildOutlineRows() {
    var page = App.page;
    if (!blockListEl) return;
    blockListEl.innerHTML = '';
    page.blocks.forEach(function (b, i) {
      var spec = blockSpec(b);
      var row = el('div', { class: 'outline__row', role: 'listitem', 'data-id': b.id });
      // only the grip starts a drag, so selecting text never drags the row
      row.appendChild(el('span', { class: 'outline__grip', 'aria-hidden': 'true', title: 'Drag to reorder', onmousedown: function () { row.draggable = true; }, onmouseup: function () { row.draggable = false; } }, ['☰']));
      row.appendChild(el('button', { type: 'button', class: 'outline__main', title: 'Edit this block', onclick: function () { selectBlock(b.id, { scroll: true }); } }, [
        el('span', { class: 'outline__num', text: i + 1 }),
        el('span', { class: 'outline__text' }, [el('span', { class: 'outline__type', text: spec.label }), el('span', { class: 'outline__summary', text: blockSummary(b) })]),
        openCommentsFor(b.id) ? el('span', { class: 'outline__comments', title: openCommentsFor(b.id) + ' open comment' + (openCommentsFor(b.id) === 1 ? '' : 's') + ' (Review tab)', text: String(openCommentsFor(b.id)) }) : null
      ]));
      row.appendChild(el('span', { class: 'outline__actions' }, [
        iconBtn('up', 'Move up', function (e) { e.stopPropagation(); moveBlock(i, i - 1); }, { disabled: i === 0 }),
        iconBtn('down', 'Move down', function (e) { e.stopPropagation(); moveBlock(i, i + 1); }, { disabled: i === page.blocks.length - 1 }),
        blockMenu(b)
      ]));
      row.addEventListener('dragstart', function (e) { if (!row.draggable) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', b.id); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
      row.addEventListener('dragend', function () { row.classList.remove('dragging'); row.draggable = false; });
      row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('dragover'); });
      row.addEventListener('dragleave', function () { row.classList.remove('dragover'); });
      row.addEventListener('drop', function (e) { e.preventDefault(); e.stopPropagation(); row.classList.remove('dragover'); var fromId = e.dataTransfer.getData('text/plain'); var from = blockIndex(fromId); if (from === -1 || from === i) return; moveBlock(from, i); });
      blockListEl.appendChild(row);
    });
  }
  /* the "⋯" menu for a block, shared by the outline rows and the block editor header */
  function blockMenu(b) {
    var page = App.page;
    return menuButton(null, [
      { label: 'Add a block below', onClick: function () { addBlockDialog({ afterId: b.id }); } },
      { label: 'Comment on this block', onClick: function () { commentOnBlock(b.id); } },
      { label: 'Duplicate', onClick: function () { var i = blockIndex(b.id); var c = JSON.parse(JSON.stringify(b)); c.id = Store.uid('blk'); page.blocks.splice(i + 1, 0, c); afterStructureChange(c.id); } },
      { label: 'Show HTML', onClick: function () { App.selectedBlock = b.id; App.codeScope = 'block'; var btn = document.querySelector('.seg__btn:nth-child(2)'); if (App.previewMode !== 'code' && btn) btn.click(); else renderCode(); } },
      { label: 'Copy markup (for Jadu)', onClick: function () { X.copyText(X.blockMarkup(b)).then(function () { toast('Block HTML copied', 'success'); }); } },
      '-',
      { label: 'Export block as PNG', onClick: function () { busy('Rendering image…', X.exportSectionPng(ctx(), b, page.template, { width: 1280 })); } },
      { label: 'Export block as PDF', onClick: function () { busy('Rendering PDF…', X.exportSectionPdf(ctx(), b, page.template, { width: 1280 })); } },
      { label: 'Export block as HTML', onClick: function () { busy('Exporting…', X.exportSectionHtml(ctx(), b, page.template)); } },
      { label: 'Convert to raw HTML', onClick: function () { b.props = { html: X.blockMarkup(b), inline: Blocks.isInline(b) }; b.type = 'raw-html'; afterStructureChange(b.id); } },
      '-',
      { label: 'Delete', onClick: function () { var i = blockIndex(b.id); if (i === -1) return; page.blocks.splice(i, 1); if (App.selectedBlock === b.id) App.selectedBlock = null; afterStructureChange(); } }
    ], { icon: 'more', title: 'Block actions' });
  }
  function renderBlockEditor(body, b) {
    var page = App.page, i = blockIndex(b.id), spec = blockSpec(b);
    body.appendChild(el('div', { class: 'insp-head' }, [
      iconBtn('back', 'Back to the outline', function () { selectBlock(null); }),
      el('div', { class: 'insp-head__text' }, [el('strong', { text: spec.label }), el('span', { class: 'small muted', text: 'Block ' + (i + 1) + ' of ' + page.blocks.length })]),
      el('span', { class: 'insp-head__actions' }, [
        iconBtn('up', 'Move up', function () { moveBlock(i, i - 1); }, { disabled: i === 0 }),
        iconBtn('down', 'Move down', function () { moveBlock(i, i + 1); }, { disabled: i === page.blocks.length - 1 }),
        iconBtn('copy', 'Duplicate', function () { var c = JSON.parse(JSON.stringify(b)); c.id = Store.uid('blk'); page.blocks.splice(i + 1, 0, c); afterStructureChange(c.id); }),
        iconBtn('trash', 'Delete', function () { page.blocks.splice(i, 1); App.selectedBlock = null; afterStructureChange(); }),
        blockMenu(b)
      ])
    ]));
    blockFormEl = el('div', { class: 'insp-form' });
    renderBlockFields(b);
    body.appendChild(blockFormEl);
    body.appendChild(el('div', { class: 'insp-foot' }, [el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { addBlockDialog({ afterId: b.id }); } }, [icon('plus', 16), ' Add a block below'])]));
  }
  function renderBlockFields(b) {
    if (!blockFormEl) return;
    var spec = blockSpec(b);
    blockFormEl.innerHTML = '';
    if (!spec.fields.length) { blockFormEl.appendChild(el('p', { class: 'muted small', text: 'This block has no options.' })); return; }
    UI.renderForm(blockFormEl, spec.fields, b.props, function () { markDirty(); pushUndo(); patchBlock(b); });
  }
  /* keep the panel in step with a change made elsewhere, e.g. editing in the preview */
  function refreshBlockForm(b) {
    if (App.sideTab !== 'block') return;
    if (blockFormEl && App.selectedBlock === b.id) renderBlockFields(b);
    else if (blockListEl) { var s = blockListEl.querySelector('.outline__row[data-id="' + b.id + '"] .outline__summary'); if (s) s.textContent = blockSummary(b); }
  }
  /* re-render the Block tab after blocks were added, moved or removed */
  function renderBlockList() {
    if (App.sideTab !== 'block' || !sideEl) return;
    if (blockListEl && !App.selectedBlock) { rebuildOutlineRows(); var c = sideEl.querySelector('.outline__count'); if (c) c.textContent = App.page.blocks.length + ' block' + (App.page.blocks.length === 1 ? '' : 's'); }
    else renderEditorSide();
  }
  function moveBlock(from, to) {
    var page = App.page; if (to < 0 || to >= page.blocks.length) return;
    var b = page.blocks.splice(from, 1)[0]; page.blocks.splice(to, 0, b);
    afterStructureChange(b.id);
  }
  function afterStructureChange(selectId) {
    if (selectId !== undefined) App.selectedBlock = selectId;
    markDirty(); pushUndo(); renderBlockList(); reloadPreview(true);
  }
  function selectBlock(id, opts) {
    opts = opts || {};
    if (id && !findBlock(id)) id = null;
    if (App.sideTab === 'review' && opts.fromPreview && sideEl) { App.selectedBlock = id; setCommentTarget(id); highlightBlock(id, false); return; }
    var changed = App.selectedBlock !== id;
    App.selectedBlock = id;
    if (cloudMode()) window.UOL_CLOUD.presence.set({ block: id || null });
    if (App.sideTab !== 'block' || changed || (id ? !blockFormEl : !blockListEl)) { App.sideTab = 'block'; renderEditorSide(); }
    highlightBlock(id, opts.scroll);
    if (App.previewMode === 'code' && App.codeScope === 'block') renderCode();
    if (opts.fromPreview && sideEl) { var sb = sideEl.querySelector('.editor__side-body'); if (sb) sb.scrollTop = 0; }
  }
  /* ---------- the inserter: search, category chips, recently used, one line per block ---------- */
  var BLOCK_DESC = {
    'ctas': 'Row of large call-to-action links with short supporting text',
    'featured-content': 'Headline, image or video and text to promote one thing',
    'content': 'Free rich text inside a widget container',
    'facts-figures': 'Headline figures with a short description and source',
    'facts-figures-v2': 'Numbers or icons with a description, in the newer style',
    'tiles': 'Image tiles linking to pages, two to four across',
    'cards': 'Cards with image, title, summary and optional date',
    'news-events': 'Latest news and events side by side',
    'news-tiles': 'News stories as image tiles',
    'events': 'Upcoming events with dates and venues',
    'description-list': 'Term and description pairs in a widget',
    'gallery': 'Image gallery with captions and a lightbox',
    'form': 'Enquiry form with text fields, selects and a submit button',
    'list-featured': 'A featured list of linked items with summaries',
    'navigation-cards': 'Cards that link to sections of the site',
    'accreditation-logos': 'Row of accreditation or partner logos',
    'linked-list-widget': 'List of links in a widget container',
    'image-quote': 'A quotation beside a photograph',
    'task-banner': 'Red banner with a course search box',
    'key-facts': 'Key facts in a highlighted panel',
    'people-profiles': 'Profile cards with photo, name and role',
    'rich-text': 'Paragraphs, headings, lists and links in one editor',
    'heading': 'A single heading (H2 to H4)',
    'paragraph': 'One paragraph of text',
    'list': 'A bullet or numbered list',
    'blockquote': 'Quotation with a citation',
    'pull-quote': 'A decorative repeated sentence, left or right',
    'text-highlight': 'A paragraph set apart from the body text',
    'highlight-block': 'Tinted box for related information',
    'in-text-cta': 'Calls to action inside the content column',
    'in-text-facts': 'Small facts panel inside the content',
    'accordion': 'Expandable sections with a title each',
    'table': 'A data table with a caption and header row',
    'image': 'A single image with alt text and caption',
    'image-pair': 'Two images side by side',
    'video': 'An embedded YouTube or Vimeo video',
    'iframe': 'Any embedded page or map in an iframe',
    'link-buttons': 'One or more button-styled links',
    'button': 'A single button link',
    'arrow-link': 'A text link with an arrow',
    'logo-group': 'A group of logos with links',
    'in-text-icons': 'Icons with labels inside the content',
    'linked-list': 'A simple list of links',
    'info-list': 'Contact details or key information as a list',
    'status-message': 'Information, warning, success or error message',
    'chips': 'Small tag-style links',
    'publications': 'List of publications with authors and links',
    'index-table': 'Sortable table that stacks on small screens',
    'pagination': 'Page number links with first, previous, next and last',
    'year-of-entry': 'Year of entry selector for course pages',
    'content-block': 'Heading, text and link in a plain block',
    'article-highlight': 'Author box for an article',
    'profile-supplement': 'Extra details for a profile page',
    'hr': 'A horizontal rule',
    'raw-html': 'Any design system markup pasted as-is',
    'spacer': 'Vertical space between blocks'
  };
  var RECENT_KEY = 'leeds-cms:recent-blocks';
  function recentBlocks() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; } }
  function rememberBlock(type) { var r = recentBlocks().filter(function (t) { return t !== type; }); r.unshift(type); try { localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 6))); } catch (e) {} }
  /* opts: afterId (insert below that block), beforeId (insert above), at (index); otherwise below the selected block or at the end */
  /* the components a kind of page can hold; set on Settings > Components */
  function libraryOf(template) { return Blocks.libraries.of(template, Store.data.site); }
  function templateName(t) { return String(Blocks.templates[t] || t).toLowerCase(); }
  function outsideLibrary(page) { var lib = libraryOf(page.template); return (page.blocks || []).filter(function (b) { return Blocks.registry[b.type] && lib.indexOf(b.type) === -1; }); }
  function addBlockDialog(opts) {
    opts = opts || {};
    var page = App.page, lib = libraryOf(page.template), libName = templateName(page.template) + ' library', showOthers = false;
    var search = el('input', { class: 'input', type: 'search', placeholder: 'Search blocks…', 'aria-label': 'Search blocks' });
    var cat = 'all';
    var chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Category' });
    var grid = el('div', { class: 'picker' });
    function inLib(s) { return lib.indexOf(s.type) !== -1; }
    var cats;
    function renderChips() {
      cats = [['all', 'All']].concat(Blocks.groups.filter(function (g) { return Blocks.list().some(function (s) { return s.group === g && (showOthers || inLib(s)); }); }).map(function (g) { return [g, g]; }));
      if (!cats.some(function (c) { return c[0] === cat; })) cat = 'all';
      chips.innerHTML = ''; cats.forEach(function (c) { chips.appendChild(el('button', { type: 'button', class: 'chip' + (cat === c[0] ? ' is-active' : ''), 'aria-pressed': cat === c[0] ? 'true' : 'false', onclick: function () { cat = c[0]; renderChips(); render(); } }, [c[1]])); }); }
    function card(s) {
      var fits = inLib(s);
      return el('button', { type: 'button', class: 'picker__item' + (fits ? '' : ' picker__item--dim'), title: fits ? '' : 'Not in the ' + libName + ': Jadu may not allow it on this kind of page', onclick: function () { insert(s.type); } }, [el('strong', { text: s.label }), el('span', { class: 'small muted', text: BLOCK_DESC[s.type] || s.group })]);
    }
    function matches(s, q) { return !q || (s.label + ' ' + s.type + ' ' + (BLOCK_DESC[s.type] || '')).toLowerCase().indexOf(q) !== -1; }
    function render() {
      var q = search.value.trim().toLowerCase();
      grid.innerHTML = '';
      var all = Blocks.list(), shown = 0;
      if (!q && cat === 'all') {
        var recent = recentBlocks().map(function (t) { return Blocks.registry[t]; }).filter(function (s) { return s && inLib(s); });
        if (recent.length) { grid.appendChild(el('h3', { class: 'picker__group', text: 'Recently used' })); recent.forEach(function (s) { grid.appendChild(card(s)); shown++; }); }
      }
      Blocks.groups.forEach(function (g) {
        if (cat !== 'all' && cat !== g) return;
        var specs = all.filter(function (s) { return s.group === g && inLib(s) && matches(s, q); });
        if (!specs.length) return;
        grid.appendChild(el('h3', { class: 'picker__group', text: g }));
        specs.forEach(function (s) { grid.appendChild(card(s)); shown++; });
      });
      // components outside the page type's library: listed when searching for them or when asked for
      var others = all.filter(function (s) { return !inLib(s) && (cat === 'all' || s.group === cat) && matches(s, q); });
      if (others.length && (showOthers || q)) {
        grid.appendChild(el('h3', { class: 'picker__group', text: 'Not in the ' + libName }));
        grid.appendChild(el('p', { class: 'picker__note small muted', text: 'Jadu may not allow these on this kind of page. Change what each kind of page can hold on Settings, Components.' }));
        others.forEach(function (s) { grid.appendChild(card(s)); shown++; });
      } else if (others.length) {
        var n = all.filter(function (s) { return !inLib(s); }).length;
        grid.appendChild(el('div', { class: 'picker__more small' }, [
          el('span', { class: 'muted', text: n + ' more component' + (n === 1 ? ' is' : 's are') + ' not in the ' + libName + '.' }),
          el('button', { class: 'btn btn--xs', type: 'button', onclick: function () { showOthers = true; renderChips(); render(); } }, ['Show them'])
        ]));
      }
      if (!shown && !(others.length && !showOthers && !q)) grid.appendChild(el('p', { class: 'muted', text: 'No blocks match "' + search.value.trim() + '".' }));
    }
    function insert(type) {
      var b = { id: Store.uid('blk'), type: type, props: Blocks.defaultsFor(type) };
      var at;
      if (typeof opts.at === 'number') at = Math.min(opts.at, page.blocks.length);
      else if (opts.beforeId) { at = blockIndex(opts.beforeId); if (at === -1) at = page.blocks.length; }
      else { var afterId = opts.afterId || App.selectedBlock; var idx = afterId ? blockIndex(afterId) : -1; at = idx === -1 ? page.blocks.length : idx + 1; }
      page.blocks.splice(at, 0, b);
      rememberBlock(type);
      m.close(); afterStructureChange(b.id);
      setTimeout(function () { highlightBlock(b.id, true); }, 900);
    }
    search.addEventListener('input', render);
    search.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var first = grid.querySelector('.picker__item'); if (first) { e.preventDefault(); first.click(); } } });
    renderChips(); render();
    var where = typeof opts.at === 'number' ? '' : opts.beforeId ? ' above' : opts.afterId ? ' below' : App.selectedBlock ? ' below the selected block' : ' at the end';
    var m = UI.modal({ title: 'Add a block' + where, wide: true, body: el('div', { class: 'inserter' }, [search, chips, grid]) });
    setTimeout(function () { search.focus(); }, 0);
  }

  /* ---------- Page tab: collapsed groups for heading, banner, side column and versions ---------- */
  function section(title, open) {
    var body = el('div', { class: 'section__body' });
    var det = el('details', { class: 'section', open: open ? true : null }, [el('summary', { class: 'section__title', text: title }), body]);
    return { el: det, body: body };
  }
  function renderPageTab(body) {
    var page = App.page, want = App.openGroup; App.openGroup = null;
    function change() { markDirty(); pushUndo(); reloadPreviewSoon(); }
    var sec = Store.sectionOf(page.id);
    var basic = section('Heading and breadcrumb', want ? want === 'heading' : true);
    UI.renderForm(basic.body, pageSettingsSchema.heading, ensure(page, 'settings.heading', {}), change);
    UI.renderForm(basic.body, [S.list('breadcrumb', 'Breadcrumb links', linkFields), S.text('navActive', 'Highlight main navigation item with this URL'), S.bool('leadParagraph', 'Style the first paragraph as a lead')], page.settings, change);
    body.appendChild(basic.el);
    var banner = section('Banner', want === 'banner');
    renderHeroFields(banner.body);
    body.appendChild(banner.el);
    if (page.template === 'article') { var art = section('Article', want === 'article'); UI.renderForm(art.body, [S.select('articleKind', 'Article type', [{ value: 'news', label: 'News' }, { value: 'event', label: 'Event' }, { value: 'profile', label: 'Profile' }, { value: 'blog', label: 'Blog' }])], page.settings, change); UI.renderForm(art.body, pageSettingsSchema.featuredImage, ensure(page, 'settings.featuredImage', {}), change); body.appendChild(art.el); }
    if (page.template === 'homepage') { var hp = section('Homepage', want === 'homepage'); UI.renderForm(hp.body, [S.text('hiddenTitle', 'Hidden H1 (for screen readers)')], page.settings, change); body.appendChild(hp.el); }
    if (sec && page.settings.autoNav !== false) body.appendChild(el('p', { class: 'small muted', style: 'margin:10px 0 6px' }, ['In the section ', el('strong', { text: sec.title }), ': the side menu, contents and previous/next links come from the section, so the groups below are ignored. Change that on the Section tab.']));
    [['inPageNav', 'In-page navigation (contents)'], ['sectionNav', 'Section navigation (side menu)'], ['relatedContent', 'Related content (side column)'], ['sectionCtas', 'Call-to-action buttons (side column)'], ['pageNav', 'Previous / next page links']].forEach(function (s) {
      var sec2 = section(s[1], want === s[0]);
      UI.renderForm(sec2.body, pageSettingsSchema[s[0]], ensure(page, 'settings.' + s[0], {}), change);
      body.appendChild(sec2.el);
    });
    var hist = section('Versions', want === 'versions');
    renderHistoryList(hist.body);
    body.appendChild(hist.el);
  }
  function renderHeroFields(body) {
    var page = App.page;
    function change() { markDirty(); pushUndo(); reloadPreviewSoon(); }
    var hero = ensure(page, 'hero', { type: 'none' });
    var holder = el('div');
    function renderHero() {
      holder.innerHTML = '';
      if (hero.type === 'banner') { if (!hero.items) hero.items = []; UI.renderForm(holder, heroSchemas.banner, hero, change); }
      else if (hero.type === 'hero') UI.renderForm(holder, heroSchemas.hero, hero, change);
      else if (hero.type === 'slideshow') { if (!hero.slides) hero.slides = []; UI.renderForm(holder, heroSchemas.slideshow, hero, change); }
      else holder.appendChild(el('p', { class: 'muted small', text: 'No banner. Choose a banner type above.' }));
    }
    UI.renderForm(body, [S.select('type', 'Banner type', HERO_TYPES)], hero, function () { if (hero.type === 'banner' && !(hero.items || []).length) hero.items = [{ title: page.title, image: PH + 'banner/banner-01.jpg', alt: '', lead: '', linkLabel: '', linkHref: '' }]; if (hero.type === 'hero' && !hero.title) { hero.title = page.title; hero.image = hero.image || PH + 'banner/banner-02.jpg'; } if (hero.type === 'slideshow' && !(hero.slides || []).length) hero.slides = [{ image: PH + 'banner/banner-01.jpg' }, { image: PH + 'banner/banner-03.jpg' }]; renderHero(); change(); });
    body.appendChild(holder);
    renderHero();
  }
  /* hourly copies the cloud keeps of this page while it changes (the last 48) */
  function cloudCopies(body, page) {
    var C = window.UOL_CLOUD, box = el('div', {}, [el('p', { class: 'small muted', text: 'Loading…' })]);
    body.appendChild(el('h3', { class: 'side-subhead', text: 'Hourly cloud copies' }));
    body.appendChild(box);
    C.pageHistory(page.id).then(function (rows) {
      box.innerHTML = '';
      if (!rows || !rows.length) { box.appendChild(el('p', { class: 'muted small', text: 'None yet. The cloud keeps a copy of the page each hour it is changed, so anyone\'s edit can be undone.' })); return; }
      rows.forEach(function (h) {
        box.appendChild(el('div', { class: 'rev' }, [
          el('div', {}, [el('strong', { text: fmtTime(h.saved_at) }), el('div', { class: 'small muted', text: (h.title || page.title) + (h.saved_by_name ? ' · by ' + h.saved_by_name : '') })]),
          C.canEdit() ? el('button', { class: 'btn btn--sm', type: 'button', onclick: function () {
            UI.confirm('Restore cloud copy', 'Put this page back as it was at ' + fmtTime(h.saved_at) + '? The current state is kept as a version first.', 'Restore').then(function (ok) {
              if (!ok) return;
              Store.snapshot(page, 'Before restoring the copy from ' + fmtTime(h.saved_at));
              C.restorePageCopy(h.id).then(function () { pushUndo(); App.openGroup = 'versions'; renderEditorSide(); syncTopFields(); reloadPreview(); toast('Copy restored', 'success'); }, cloudError);
            });
          } }, ['Restore']) : null
        ]));
      });
    }, function (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'small error', text: e.message })); });
  }
  function renderHistoryList(body) {
    var page = App.page;
    if (cloudMode() && Store.data) setTimeout(function () { if (App.page === page && body.isConnected) cloudCopies(body, page); }, 0);
    body.appendChild(el('div', { class: 'side-actions' }, [el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: saveVersion }, ['Save version now']), el('span', { class: 'muted small', text: 'Autosave is always on. Versions let you go back.' })]));
    var revs = page.revisions || [];
    if (!revs.length) body.appendChild(el('p', { class: 'muted small', text: 'No saved versions yet for this page.' }));
    revs.forEach(function (r) {
      body.appendChild(el('div', { class: 'rev' }, [
        el('div', {}, [el('strong', { text: r.label || 'Version' }), el('div', { class: 'small muted', text: fmtTime(r.at) + ' · ' + (r.data.blocks || []).length + ' blocks' })]),
        el('div', {}, [
          el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { UI.confirm('Restore version', 'Replace the current page content with "' + (r.label || 'this version') + '"? The current state is kept as a version first.', 'Restore').then(function (ok) { if (!ok) return; Store.snapshot(page, 'Before restore'); Store.restore(page, r.id); pushUndo(); App.openGroup = 'versions'; renderEditorSide(); syncTopFields(); reloadPreview(); toast('Version restored', 'success'); }); } }, ['Restore']),
          el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', 'aria-label': 'Delete this version', onclick: function () { page.revisions = page.revisions.filter(function (x) { return x.id !== r.id; }); Store.save(); App.openGroup = 'versions'; renderEditorSide(); } }, ['✕'])
        ])
      ]));
    });
  }

  /* ---------- Section tab: where the page sits, the order of pages, navigation settings ---------- */
  function sectionFields() {
    return [S.text('title', 'Section title'), S.select('navStyle', 'Navigation generated for every page', [{ value: 'side', label: 'Side menu (section navigation)' }, { value: 'contents', label: 'Contents list under the heading (multi-page document)' }, { value: 'both', label: 'Both' }]), S.bool('pageNav', 'Previous / next links at the bottom of each page'), S.text('intro', 'Side menu intro text'), S.text('contentsTitle', 'Contents list title'), S.list('breadcrumb', 'Breadcrumb for pages without their own', linkFields)];
  }
  /* an orderable list of the pages in a section; re-renders itself and calls opts.onChange after every change */
  function sectionOrderList(s, opts) {
    opts = opts || {};
    var order = el('div', { class: 'orderlist' });
    function changed() { Store.save(); renderOrder(); if (opts.onChange) opts.onChange(); }
    function renderOrder() {
      order.innerHTML = '';
      Store.sectionPages(s.id).forEach(function (p, i, arr) {
        var current = opts.current === p.id;
        var title = opts.navigable && !current
          ? el('button', { type: 'button', class: 'orderlist__title is-link', title: 'Open this page in the editor', onclick: function () { go('#edit/' + p.id); } }, [p.title])
          : el('span', { class: 'orderlist__title', text: p.title + (current ? ' (this page)' : '') });
        var row = el('div', { class: 'orderlist__row' + (current ? ' is-current' : ''), draggable: 'true' }, [el('span', { class: 'list__grip', 'aria-hidden': 'true', title: 'Drag to reorder' }, ['☰']), el('span', { class: 'card__num', text: i + 1 }), title,
          el('button', { type: 'button', class: 'btn btn--icon btn--xs', disabled: i === 0, 'aria-label': 'Move up', onclick: function () { s.pages.splice(i - 1, 0, s.pages.splice(i, 1)[0]); changed(); } }, ['↑']),
          el('button', { type: 'button', class: 'btn btn--icon btn--xs', disabled: i === arr.length - 1, 'aria-label': 'Move down', onclick: function () { s.pages.splice(i + 1, 0, s.pages.splice(i, 1)[0]); changed(); } }, ['↓']),
          el('button', { type: 'button', class: 'btn btn--icon btn--xs btn--danger-ghost', 'aria-label': 'Remove from section', title: 'Remove from section', onclick: function () { Store.removeFromSection(p.id); changed(); } }, ['✕'])]);
        row.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', String(i)); });
        row.addEventListener('dragover', function (e) { e.preventDefault(); row.classList.add('dragover'); });
        row.addEventListener('dragleave', function () { row.classList.remove('dragover'); });
        row.addEventListener('drop', function (e) { e.preventDefault(); row.classList.remove('dragover'); var from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (isNaN(from) || from === i) return; s.pages.splice(i, 0, s.pages.splice(from, 1)[0]); changed(); });
        order.appendChild(row);
      });
      var free = Store.ungroupedPages();
      if (free.length) {
        var sel = el('select', { class: 'input input--sm' }, [el('option', { value: '', text: 'Add an existing page…' })].concat(free.map(function (p) { return el('option', { value: p.id, text: p.title }); })));
        sel.addEventListener('change', function () { if (sel.value) { Store.addToSection(sel.value, s.id); changed(); } });
        order.appendChild(el('div', { class: 'orderlist__row' }, [sel]));
      }
    }
    renderOrder();
    return order;
  }
  function renderSectionTab(body) {
    var page = App.page, sec = Store.sectionOf(page.id);
    if (!sec) {
      body.appendChild(el('p', { class: 'muted small', text: 'This page is not in a section. A section gives a group of pages a shared side menu, contents list, previous/next links and breadcrumb, generated from the order of its pages.' }));
      body.appendChild(el('div', { class: 'side-actions' }, [el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: function () { addToSectionDialog(page); } }, ['Add to a section…'])]));
      return;
    }
    var pages = Store.sectionPages(sec.id), idx = pages.findIndex(function (p) { return p.id === page.id; });
    var navLabel = { side: 'side menu', contents: 'contents list', both: 'side menu and contents' }[sec.navStyle] || 'side menu';
    body.appendChild(el('div', { class: 'insp-head' }, [
      el('div', { class: 'insp-head__text' }, [el('strong', { text: sec.title }), el('span', { class: 'small muted', text: 'Page ' + (idx + 1) + ' of ' + pages.length + ' · ' + navLabel })]),
      el('span', { class: 'insp-head__actions' }, [
        iconBtn('prev', 'Previous page in the section', function () { go('#edit/' + pages[idx - 1].id); }, { disabled: idx <= 0 }),
        iconBtn('next', 'Next page in the section', function () { go('#edit/' + pages[idx + 1].id); }, { disabled: idx >= pages.length - 1 }),
        menuButton(null, sectionExportItems(sec.title, function () { return Store.sectionPages(sec.id); }), { icon: 'export', title: 'Export the whole section' })
      ])
    ]));
    var auto = el('input', { type: 'checkbox' }); auto.checked = page.settings.autoNav !== false;
    auto.addEventListener('change', function () { page.settings.autoNav = auto.checked; markDirty(); reloadPreview(true); });
    body.appendChild(el('label', { class: 'check small field--check', title: 'Untick to write this page\'s side menu, contents and previous/next links by hand on the Page tab' }, [auto, el('span', { text: 'Generate this page\'s navigation from the section' })]));
    var pg = section('Pages in this section', true);
    pg.body.appendChild(sectionOrderList(sec, { current: page.id, navigable: true, onChange: function () { renderEditorSide(); reloadPreview(true); } }));
    pg.body.appendChild(el('div', { class: 'row', style: 'margin:8px 0 6px' }, [
      el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { newPageDialog(sec.id); } }, ['+ New page here']),
      el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onclick: function () { Store.removeFromSection(page.id); Store.save(); renderEditorSide(); reloadPreview(true); toast('Removed from the section', 'info'); } }, ['Remove this page'])
    ]));
    body.appendChild(pg.el);
    var st = section('Navigation settings', false);
    UI.renderForm(st.body, sectionFields(), sec, function () { Store.save(); var t = sideEl && sideEl.querySelector('.insp-head__text strong'); if (t) t.textContent = sec.title; reloadPreviewSoon(); });
    body.appendChild(st.el);
  }

  /* ================= review: changes for Jadu, check page, comments and sign-off, review links ================= */
  var RV = window.UOL_REVIEW;
  function option(value, text) { return el('option', { value: value, text: text }); }
  function clipText(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function who(email) { return email ? email.replace(/@.*/, '') : 'someone'; }
  function signer(s) { return s.guest_name ? s.guest_name + (s.guest_role ? ', ' + s.guest_role : '') + ' (reviewer)' : who(s.by_email); }
  function signerTitle(s) { return s.guest_name ? 'Through the review link "' + (s.guest_via || 'review link') + '"' : (s.by_email || ''); }

  /* ---------- Changes for Jadu ---------- */
  /* keep an untouched copy of an imported page, to list changes against later */
  function keepOriginal(page, url) {
    page.source = { url: url || '', importedAt: new Date().toISOString(), original: Store.clone({ title: page.title, template: page.template, settings: page.settings, hero: page.hero, blocks: page.blocks }) };
  }
  /* the page-level parts compared in Changes; navigation generated from a section is left out */
  function pageDiffGroups(page) {
    var sec = Store.sectionOf(page.id), auto = sec && page.settings && page.settings.autoNav !== false;
    function st(key) { return function (p) { return (p.settings || {})[key]; }; }
    function fixed(f) { return function () { return f; }; }
    var groups = [
      { prefix: '', fields: fixed([S.text('title', 'Page title')]), get: function (p) { return p; } },
      { prefix: 'Heading', fields: fixed(pageSettingsSchema.heading), get: st('heading') },
      { prefix: 'Breadcrumb', fields: fixed([S.list('breadcrumb', 'Link', linkFields)]), get: function (p) { return p.settings; } },
      { prefix: 'Banner', fields: function (p) { return [S.select('type', 'Type', HERO_TYPES)].concat(heroSchemas[(p.hero || {}).type] || []); }, get: function (p) { return p.hero; } },
      { prefix: 'Featured image', fields: fixed(pageSettingsSchema.featuredImage), get: st('featuredImage') },
      { prefix: 'Related content', fields: fixed(pageSettingsSchema.relatedContent), get: st('relatedContent') },
      { prefix: 'Side column buttons', fields: fixed(pageSettingsSchema.sectionCtas), get: st('sectionCtas') }
    ];
    if (!auto) groups.push(
      { prefix: 'Contents', fields: fixed(pageSettingsSchema.inPageNav), get: st('inPageNav') },
      { prefix: 'Side menu', fields: fixed(pageSettingsSchema.sectionNav), get: st('sectionNav') },
      { prefix: 'Previous / next', fields: fixed(pageSettingsSchema.pageNav), get: st('pageNav') });
    return groups;
  }
  function pageDiff(page) { return page && page.source && page.source.original ? RV.diffPage(page.source.original, page, { pageGroups: pageDiffGroups(page) }) : null; }

  /* the Jadu checklist for the open page: {key: {item_hash, done_by_email, done_at}}, kept in the cloud */
  function pageJadu() { return App.page && App.jadu && App.jadu.pageId === App.page.id ? App.jadu : null; }
  function checksByPage(rows) { var m = {}; (rows || []).forEach(function (r) { (m[r.page_id] = m[r.page_id] || {})[r.item_key] = r; }); return m; }
  function loadJadu(force) {
    var page = App.page, C = window.UOL_CLOUD;
    if (!page || !cloudReady()) return Promise.resolve(null);
    var j = pageJadu() || (App.jadu = { pageId: page.id, checks: {}, loaded: false });
    if (j.loading && !force) return j.loading;
    j.loading = C.review.jaduChecks(page.id).then(function (rows) {
      j.loading = null; j.checks = checksByPage(rows)[page.id] || {}; j.loaded = true; j.error = '';
      noteJaduProgress(page);
      if (App.jadu === j && App.view === 'edit') { if (App.previewMode === 'changes') renderChanges(); if (App.sideTab === 'review' && reviewEls && reviewEls.changes) { reviewEls.changes.innerHTML = ''; renderChangesSummary(reviewEls.changes); } }
      return j;
    }, function (e) { j.loading = null; j.error = e.message; return j; });
    return j.loading;
  }
  function noteJaduProgress(page) {
    var j = pageJadu();
    App.jaduChecks = App.jaduChecks || {};
    if (j && j.loaded) App.jaduChecks[page.id] = j.checks;
  }
  /* {done, total} for a page from the ticks we know about, against its changes as they are now */
  function jaduProgress(p) {
    var checks = App.jaduChecks && App.jaduChecks[p.id], d = checks && pageDiff(p);
    return d && d.total ? RV.progress(d, checks) : null;
  }
  function tickJadu(box) {
    var page = App.page, j = pageJadu(), C = window.UOL_CLOUD, key = box.getAttribute('data-key'), hash = box.getAttribute('data-hash'), on = box.checked;
    if (!j) return;
    var before = j.checks[key];
    if (on) j.checks[key] = { item_key: key, item_hash: hash, done_by_email: (C.user() || {}).email, done_at: new Date().toISOString() }; else delete j.checks[key];
    noteJaduProgress(page); renderChanges();
    C.review.setJaduCheck(page.id, key, hash, on).catch(function (e) { if (before) j.checks[key] = before; else delete j.checks[key]; noteJaduProgress(page); renderChanges(); cloudError(e); });
  }
  var renderChangesSoon = debounce(function () { renderChanges(); }, 350);
  function renderChanges() {
    var host = Preview.changesEl, page = App.page;
    if (!host || !page) return;
    var scroll = host.scrollTop;
    host.innerHTML = '';
    var src = page.source;
    if (!src || !src.original) { host.appendChild(noOriginalPanel(page)); return; }
    var diff = pageDiff(page), showAll = !!App.changesShowAll;
    var allChk = el('input', { type: 'checkbox', checked: showAll });
    allChk.addEventListener('change', function () { App.changesShowAll = allChk.checked; renderChanges(); });
    var j = cloudReady() ? pageJadu() : null;
    if (cloudReady() && !(j && (j.loaded || j.loading))) loadJadu(false);
    var checks = j && j.loaded ? j.checks : null, prog = checks && diff.total ? RV.progress(diff, checks) : null;
    var doneChk = el('input', { type: 'checkbox', checked: !!App.changesHideDone });
    doneChk.addEventListener('change', function () { App.changesHideDone = doneChk.checked; renderChanges(); });
    var label = diff.total ? RV.countsLine(diff) : 'no changes yet';
    host.appendChild(el('div', { class: 'changes__bar' }, [
      el('div', { class: 'changes__summary' }, [
        el('strong', { text: label.charAt(0).toUpperCase() + label.slice(1) }),
        el('span', { class: 'small muted' }, ['Compared with ', src.url ? el('a', { href: src.url, target: '_blank', rel: 'noopener', text: 'the live page' }) : 'the original', ' as copied ' + fmtTime(src.importedAt)])
      ]),
      el('span', { class: 'spacer' }),
      prog ? el('span', { class: 'changes__progress' + (prog.done === prog.total ? ' is-complete' : ''), title: 'Ticked off by whoever makes the changes in Jadu' }, [prog.done === prog.total ? 'All ' + prog.total + ' done in Jadu' : prog.done + ' of ' + prog.total + ' done in Jadu']) : null,
      prog && prog.done ? el('label', { class: 'check small' }, [doneChk, el('span', { text: 'Hide done' })]) : null,
      el('label', { class: 'check small' }, [allChk, el('span', { text: 'Show unchanged blocks' })]),
      el('button', { class: 'btn btn--sm', type: 'button', title: 'Download the change list as a Word document', onclick: function () { exportChangeList([page], 'word'); } }, ['Word']),
      el('button', { class: 'btn btn--sm', type: 'button', title: 'Print the change list or save it as a PDF', onclick: function () { exportChangeList([page], 'pdf'); } }, ['PDF']),
      menuButton(null, originalMenuItems(page), { icon: 'more', title: 'Original page options' })
    ]));
    var doc = el('div', { class: 'cl-doc changes__list' });
    if (diff.total || showAll) doc.innerHTML = RV.itemsHtml(diff, 'app', { showUnchanged: showAll, checks: checks, checkable: !!checks, hideDone: !!App.changesHideDone && !!checks });
    else doc.appendChild(el('div', { class: 'empty' }, [el('p', { text: 'This page matches the original so far. Edits you make are listed here, ready to export as a change list for whoever updates the page in Jadu.' })]));
    if (diff.total && window.UOL_CLOUD && window.UOL_CLOUD.configured() && !cloudReady()) doc.insertBefore(el('p', { class: 'small muted', text: 'Sign in on the Cloud screen (with this project in the cloud) to tick off each change as it is made in Jadu.' }), doc.firstChild);
    doc.addEventListener('change', function (e) { var box = e.target.closest('.cl-check__box'); if (box) tickJadu(box); });
    doc.addEventListener('click', function (e) { var b = e.target.closest('.cl-show'); if (b) showBlockInPage(b.getAttribute('data-block')); });
    host.appendChild(doc);
    host.scrollTop = scroll;
  }
  function showBlockInPage(id) {
    if (Preview.setMode) Preview.setMode('preview');
    App.selectedBlock = id; App.sideTab = 'block'; renderEditorSide();
    setTimeout(function () { highlightBlock(id, true); }, 900);
  }
  function noOriginalPanel(page) {
    var url = el('input', { class: 'input', type: 'url', placeholder: 'https://www.leeds.ac.uk/…', value: (page.source && page.source.url) || '', 'aria-label': 'Live page address' });
    var msg = el('p', { class: 'small', role: 'status' });
    function report(text, isError) { msg.className = 'small' + (isError ? ' error' : ' muted'); msg.textContent = text; }
    return el('div', { class: 'changes__empty' }, [el('div', { class: 'panel' }, [
      el('h2', { text: 'Nothing to compare with yet' }),
      el('p', { text: 'Pages imported from leeds.ac.uk keep an untouched copy of the original. This view then lists every change against it, ready to hand to whoever edits the page in Jadu. This page has no original, either because it was imported before this feature or because it was made in the CMS.' }),
      el('div', { class: 'field' }, [el('span', { class: 'field__label', text: 'Fetch the live page and use it as the original' }), el('div', { class: 'row' }, [url, el('button', { class: 'btn btn--primary', type: 'button', disabled: !isHttp, onclick: function () { fetchOriginal(page, url.value.trim(), report); } }, ['Fetch'])])]),
      isHttp ? null : el('p', { class: 'small muted', text: 'Fetching needs the CMS to run from a web address, such as the Vercel site.' }),
      el('div', { class: 'row' }, [el('button', { class: 'btn', type: 'button', onclick: function () { keepOriginal(page, url.value.trim()); markDirty(); renderChanges(); toast('The page as it is now is the original. Later edits are listed.', 'success', 4000); } }, ['Use the page as it is now']), el('span', { class: 'small muted', text: 'Every later edit is then listed.' })]),
      msg
    ])]);
  }
  function fetchOriginal(page, u, report) {
    if (!/^https?:\/\//i.test(u)) { report('Enter the full address of the live page, starting https://', true); return; }
    report('Fetching ' + u + '…');
    IMP.fetchUrl(u).then(function (html) {
      var r = IMP.parsePage(html, { baseUrl: u });
      page.source = { url: u, importedAt: new Date().toISOString(), original: Store.clone({ title: r.page.title, template: r.page.template, settings: r.page.settings, hero: r.page.hero, blocks: r.page.blocks }) };
      markDirty(); renderChanges(); toast('The live page is now the original', 'success');
    }).catch(function (e) { report(e.message, true); });
  }
  function originalMenuItems(page) {
    var src = page.source || {};
    function report(text, isError) { toast(text, isError ? 'error' : 'info', isError ? 6000 : 2500); }
    return [
      src.url && isHttp ? { label: 'Fetch the live page again', onClick: function () { UI.confirm('Fetch the live page again', 'Replace the original with the live page as it is today? Changes are then listed against the new copy.', 'Fetch').then(function (ok) { if (ok) fetchOriginal(page, src.url, report); }); } } : null,
      { label: 'Use the page as it is now as the original', onClick: function () { UI.confirm('Reset the original', 'Treat the page as it is now as the original? The current change list is cleared and only later edits are listed.', 'Reset').then(function (ok) { if (ok) { keepOriginal(page, src.url); markDirty(); renderChanges(); } }); } },
      { label: 'Change the live page address', onClick: function () { UI.prompt('Live page address', 'Address of the page on leeds.ac.uk', src.url || '', 'Save').then(function (v) { if (v === null) return; page.source.url = v.trim(); markDirty(); renderChanges(); }); } },
      '-',
      { label: 'Forget the original', onClick: function () { UI.confirm('Forget the original', 'Remove the copy of the original page? The change list for this page goes with it.', 'Forget', true).then(function (ok) { if (ok) { delete page.source; markDirty(); renderChanges(); } }); } }
    ].filter(Boolean);
  }
  function signoffText(pageId) {
    var s = App.reviewSummary && App.reviewSummary[pageId];
    if (!s || !s.status || s.status === 'not_started') return '';
    return SIGNOFF[s.status].label + (s.by_email ? ' by ' + s.by_email : '') + (s.at ? ', ' + fmtTime(s.at) : '');
  }
  /* format: 'word' downloads a .doc; 'pdf' opens the print window, where "Save as PDF" keeps the text selectable */
  function exportChangeList(pages, format, title) {
    pages = pages.filter(function (p) { return p.source && p.source.original; });
    if (!pages.length) { toast('None of these pages has an original to compare with', 'warn'); return; }
    var C = window.UOL_CLOUD, user = C && C.user();
    var name = title || (pages.length === 1 ? 'Changes for Jadu: ' + pages[0].title : 'Changes for Jadu');
    var file = 'changes-for-jadu-' + (pages.length === 1 ? pages[0].slug : Store.slugify(title || 'all-pages'));
    (cloudReady() ? C.review.jaduChecks(pages.length === 1 ? pages[0].id : null).then(checksByPage, function () { return {}; }) : Promise.resolve(null)).then(function (checks) {
      var sections = pages.map(function (p) { return { page: p, diff: pageDiff(p), meta: { signoff: signoffText(p.id), checks: checks ? checks[p.id] || {} : null } }; });
      return M.inline(RV.changeListDocument(sections, { title: name, by: user && user.email }));
    }).then(function (h) {
      if (format === 'word') { X.download(new Blob(['﻿', h], { type: 'application/msword' }), file + '.doc'); toast('Change list downloaded', 'success'); return; }
      printHtml(h);
    });
  }
  function printHtml(html) {
    var f = el('iframe', { class: 'print-frame', title: 'Change list for printing', 'aria-hidden': 'true', tabindex: '-1' });
    f.addEventListener('load', function () {
      setTimeout(function () {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('Could not open the print window: ' + e.message, 'error', 6000); }
        setTimeout(function () { f.remove(); }, 60000);
      }, 250);
    });
    f.srcdoc = html;
    document.body.appendChild(f);
    toast('In the print window, choose "Save as PDF" as the printer', 'info', 6000);
  }

  /* ---------- Check page ---------- */
  function checkHtml(page) { var c = ctx(); return R.renderBody(c.site, page, { editor: true, pages: c.pages, sections: c.sections }); }
  function runCheck(page) {
    var res = RV.checkPage(checkHtml(page), { slugs: Store.data.pages.map(function (p) { return p.slug; }) });
    // blocks this kind of page cannot hold in Jadu, by the project's component libraries
    var extra = outsideLibrary(page).map(function (b) {
      return { level: 'warn', type: 'library', blockId: b.id, message: blockSpec(b).label + ' is not in the ' + templateName(page.template) + ' library, so Jadu may not allow it here. Use a homepage, or change the library on Settings, Components.' };
    });
    if (extra.length) { res.issues = extra.concat(res.issues); res.warnings += extra.length; }
    return res;
  }
  function liveUrl(path, page) {
    var origin = 'https://www.leeds.ac.uk';
    try { if (page.source && page.source.url) origin = new URL(page.source.url).origin; } catch (e) {}
    return origin + path;
  }
  function whereText(i) {
    var b = i.blockId ? findBlock(i.blockId) : null;
    return b ? 'Block ' + (blockIndex(i.blockId) + 1) + ': ' + blockSpec(b).label : i.area;
  }
  function issueRow(i) {
    var kids = [
      el('span', { class: 'issue__icon', 'aria-hidden': 'true', text: i.level === 'error' ? '!' : 'i' }),
      el('span', { class: 'issue__text' }, [el('span', { text: i.message }), el('span', { class: 'issue__where', text: whereText(i) })]),
      i.src ? el('img', { class: 'issue__thumb', src: i.src, alt: '' }) : null
    ];
    if (!i.blockId) return el('div', { class: 'issue issue--' + i.level }, kids);
    return el('button', { type: 'button', class: 'issue issue--' + i.level, title: 'Show this block in the preview', onclick: function () { App.selectedBlock = i.blockId; highlightBlock(i.blockId, true); } }, kids);
  }
  function linkList(title, items, hint, page, external) {
    if (!items.length) return null;
    var det = el('details', { class: 'linklist' }, [el('summary', { text: title + ' (' + items.length + ')' })]);
    if (hint) det.appendChild(el('p', { class: 'small muted', text: hint }));
    items.forEach(function (l) {
      var href = external ? l.href : liveUrl(l.href, page);
      det.appendChild(el('div', { class: 'linklist__row' }, [
        el('span', { class: 'linklist__text' }, [el('span', { text: l.text || l.href }), el('span', { class: 'issue__where', text: (external ? l.href : l.href) + ' · ' + whereText(l) })]),
        el('a', { class: 'btn btn--xs', href: href, target: '_blank', rel: 'noopener', title: 'Open in a new tab to check it', text: 'Open' })
      ]));
    });
    return det;
  }
  function renderCheck(box) {
    var page = App.page, res = runCheck(page);
    if (!res.issues.length) box.appendChild(el('p', { class: 'check-ok small', text: 'No problems found. Images have alt text, headings are in order and links have text.' }));
    res.issues.forEach(function (i) { box.appendChild(issueRow(i)); });
    [linkList('Links to pages not in this project', res.offProject, 'Fine if the page exists on leeds.ac.uk. Open each one to make sure.', page, false),
      linkList('Links to other websites', res.external, 'Open each one to check it still works and goes to the right place.', page, true)].forEach(function (n) { if (n) box.appendChild(n); });
    return res;
  }
  function countPill(n, kind, text) { return el('span', { class: 'count-pill count-pill--' + kind, text: text || String(n) }); }

  /* ---------- Sign-off and comments (cloud) ---------- */
  var SIGNOFF = {
    not_started: { label: 'Not started' },
    in_review: { label: 'In review' },
    changes_requested: { label: 'Changes requested' },
    approved: { label: 'Approved' }
  };
  function cloudReady() { var C = window.UOL_CLOUD; return !!(C && C.configured() && C.link() && C.user()); }
  function cloudNote() {
    var C = window.UOL_CLOUD;
    var text = !C || !C.configured() ? 'Sign-off and comments are saved in the cloud, so the whole team sees them. Cloud saving is not set up yet (see DEPLOY.md).'
      : !C.link() ? 'Sign-off and comments are saved with the cloud project. Upload this project on the Cloud screen to use them.'
      : 'Sign in on the Cloud screen to see sign-off and comments.';
    return el('div', {}, [el('p', { class: 'small muted', text: text }), C && C.configured() ? el('a', { class: 'btn btn--sm', href: '#cloud' }, ['Open the Cloud screen']) : null]);
  }
  /* comments and sign-off history for the open page, kept while the editor is open */
  function loadReview(force) {
    var page = App.page, C = window.UOL_CLOUD;
    if (!page || !cloudReady()) return Promise.resolve(null);
    var r = App.review && App.review.pageId === page.id ? App.review : (App.review = { pageId: page.id, comments: [], history: [], loaded: false });
    if (r.loading && !force) return r.loading;
    // owners and editors also get the review links that include this page; null means they could not be listed
    var links = C.canEdit() ? C.shares.list().catch(function () { return null; }) : null;
    r.loading = Promise.all([C.review.comments(page.id), C.review.signoffHistory(page.id), links]).then(function (res) {
      r.loading = null;
      r.comments = res[0] || []; r.history = res[1] || []; r.loaded = true; r.error = ''; r.at = Date.now();
      r.links = res[2] ? linksForPage(res[2], page) : null;
      var s = r.history[0];
      App.reviewSummary = App.reviewSummary || {};
      App.reviewSummary[page.id] = { page_id: page.id, status: s ? s.status : null, by_email: s && s.by_email, at: s && s.at, content_hash: s && s.content_hash, open_comments: r.comments.filter(function (c) { return !c.resolved_at; }).length };
      if (App.review === r) afterReviewLoad();
      return r;
    }, function (e) { r.loading = null; r.error = e.message; if (App.review === r) afterReviewLoad(); return r; });
    return r.loading;
  }
  function pageReview() { return App.page && App.review && App.review.pageId === App.page.id ? App.review : null; }
  function openCommentsFor(blockId) { var r = pageReview(); return r ? r.comments.filter(function (c) { return !c.resolved_at && (blockId === undefined || c.block_id === blockId); }).length : 0; }
  function afterReviewLoad() {
    if (App.view !== 'edit') return;
    updateReviewBadge();
    if (App.sideTab === 'review') { renderSignoff(); renderCommentList(); }
    else if (App.sideTab === 'block' && blockListEl && !App.selectedBlock) rebuildOutlineRows();
  }
  function updateReviewBadge() {
    var tab = sideEl && sideEl.querySelector('.tabs__tab[data-tab="review"]'); if (!tab) return;
    var n = openCommentsFor(), b = tab.querySelector('.tabs__badge');
    if (b) b.remove();
    if (n) tab.appendChild(el('span', { class: 'tabs__badge', title: n + ' open comment' + (n === 1 ? '' : 's'), text: String(n) }));
  }
  /* while the Review tab is open, colleagues' comments arrive every 45 seconds */
  setInterval(function () { if (App.view === 'edit' && App.sideTab === 'review' && document.visibilityState === 'visible' && cloudReady()) loadReview(true); }, 45000);

  var reviewEls = null;
  function renderReviewTab(body) {
    var page = App.page;
    reviewEls = {};
    var so = section('Sign-off', true); reviewEls.signoff = so.body; body.appendChild(so.el);
    var ch = section('Changes for Jadu', true); renderChangesSummary(ch.body); body.appendChild(ch.el);
    if (cloudReady() && !(pageJadu() && pageJadu().loaded)) loadJadu(false);
    var ck = section('Check page', true), res = renderCheck(ck.body);
    ck.el.querySelector('summary').appendChild(res.errors ? countPill(res.errors, 'error', res.errors + ' to fix') : res.warnings ? countPill(res.warnings, 'warn', res.warnings + ' to look at') : countPill(0, 'ok', 'OK'));
    body.appendChild(ck.el);
    var cm = section('Comments', true);
    reviewEls.comments = el('div', { class: 'comments' });
    cm.body.appendChild(reviewEls.comments);
    if (cloudReady()) cm.body.appendChild(commentComposer());
    body.appendChild(cm.el);
    renderSignoff(); renderCommentList();
    // always fetch on opening the tab: a reviewer may have acted through a link since the last check
    if (cloudReady()) loadReview(true);
    if (App.focusComment && reviewEls.commentInput) { App.focusComment = false; setTimeout(function () { reviewEls.commentInput.focus(); cm.el.scrollIntoView({ block: 'nearest' }); }, 0); }
  }
  function renderChangesSummary(box) {
    var d = pageDiff(App.page), j = pageJadu(), prog = d && d.total && j && j.loaded ? RV.progress(d, j.checks) : null;
    if (reviewEls) reviewEls.changes = box;
    box.appendChild(el('p', { class: 'small', text: !d ? 'No original to compare with yet.' : d.total ? 'Changed since the original: ' + RV.countsLine(d) + '.' + (prog ? ' Done in Jadu: ' + prog.done + ' of ' + prog.total + '.' : '') : 'No changes from the original yet.' }));
    box.appendChild(el('div', { class: 'row' }, [
      el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { if (Preview.setMode) Preview.setMode('changes'); } }, ['View changes']),
      d && d.total ? el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { exportChangeList([App.page], 'word'); } }, ['Word']) : null,
      d && d.total ? el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { exportChangeList([App.page], 'pdf'); } }, ['PDF']) : null
    ]));
  }
  function renderSignoff() {
    var box = reviewEls && reviewEls.signoff, page = App.page;
    if (!box || !page) return;
    box.innerHTML = '';
    if (!cloudReady()) { box.appendChild(cloudNote()); return; }
    var r = pageReview();
    if (!r || !r.loaded) { box.appendChild(el('p', { class: 'small muted', text: r && r.error ? 'Could not load sign-off: ' + r.error : 'Loading…' })); return; }
    var cur = r.history[0], status = cur ? cur.status : 'not_started';
    var edited = !!(cur && status === 'approved' && cur.content_hash && cur.content_hash !== RV.contentHash(page));
    box.appendChild(el('div', { class: 'signoff' }, [
      el('span', { class: 'signoff__pill signoff__pill--' + status, text: SIGNOFF[status].label }),
      el('span', { class: 'small muted', title: cur ? signerTitle(cur) : '', text: cur ? (status === 'approved' ? 'by ' : 'set by ') + signer(cur) + ', ' + fmtTime(cur.at) : 'Not sent for review yet' })
    ]));
    if (cur && cur.note) box.appendChild(el('p', { class: 'signoff__note', text: cur.note }));
    if (edited) box.appendChild(el('p', { class: 'notice notice--warn small', text: 'Edited since it was approved. Send it for review again so the approval covers the latest version.' }));
    var acts = [];
    if (status === 'in_review') { acts.push(signoffBtn('approved', 'Approve', true)); acts.push(signoffBtn('changes_requested', 'Request changes')); }
    else acts.push(signoffBtn('in_review', status === 'not_started' ? 'Send for review' : 'Send for review again', status !== 'approved' || edited));
    box.appendChild(el('div', { class: 'row signoff__actions' }, acts));
    if (window.UOL_CLOUD.canEdit()) box.appendChild(pageLinksBlock(page, r));
    if (r.history.length) {
      var det = el('details', { class: 'linklist' }, [el('summary', { text: 'History (' + r.history.length + ')' })]);
      r.history.forEach(function (h) {
        det.appendChild(el('div', { class: 'linklist__row' }, [el('span', { class: 'linklist__text' }, [
          el('span', { text: SIGNOFF[h.status].label + ' · ' + signer(h) }),
          el('span', { class: 'issue__where', title: signerTitle(h), text: fmtTime(h.at) + (h.guest_name ? ' · through "' + (h.guest_via || 'review link') + '"' : '') + (h.note ? ' · ' + h.note : '') })
        ])]));
      });
      box.appendChild(det);
    }
  }
  function signoffBtn(status, label, primary) { return el('button', { class: 'btn btn--sm' + (primary ? ' btn--primary' : ''), type: 'button', onclick: function () { signoffDialog(status); } }, [label]); }
  function signoffDialog(status) {
    var page = App.page, C = window.UOL_CLOUD;
    var titles = { in_review: 'Send for review', approved: 'Approve this page', changes_requested: 'Request changes' };
    var intro = {
      in_review: 'Marks "' + page.title + '" as in review. Everyone the project is shared with can then approve it or ask for changes.',
      approved: 'Records that you approved "' + page.title + '" as it is now, with your name and the time. If the page is edited afterwards, the Review tab says so.',
      changes_requested: 'Sends "' + page.title + '" back with your note. Comments on particular blocks help too.'
    }[status];
    var note = el('textarea', { class: 'input', rows: 3, placeholder: status === 'changes_requested' ? 'What needs to change?' : 'Optional note' });
    var errors = status === 'approved' ? runCheck(page).errors : 0;
    var count = status === 'approved' ? openCommentsFor() : 0;
    var links = status === 'in_review' && C.canEdit() ? sendLinkOptions(page) : null;
    UI.modal({ title: titles[status], body: el('div', {}, [
      el('p', { class: 'small', text: intro }),
      links ? links.el : null,
      errors ? el('p', { class: 'notice notice--warn small', text: 'Check page found ' + errors + ' problem' + (errors === 1 ? '' : 's') + ' to fix. You can still approve.' }) : null,
      count ? el('p', { class: 'notice notice--warn small', text: count + ' comment' + (count === 1 ? ' is' : 's are') + ' still open.' }) : null,
      el('label', { class: 'field' }, [el('span', { class: 'field__label', text: status === 'changes_requested' ? 'What needs to change' : 'Note (optional)' }), note])
    ]), buttons: [{ label: 'Cancel' }, { label: titles[status], primary: true, onClick: function () {
      if (status === 'changes_requested' && !note.value.trim()) { note.focus(); return false; }
      if (App.dirty) saveNow();
      C.review.setSignoff(page.id, status, note.value, RV.contentHash(page)).then(function () {
        toast({ in_review: 'Sent for review', approved: 'Approved', changes_requested: 'Changes requested' }[status], 'success');
        loadReview(true);
        if (!links) return;
        return links.run().then(function (res) {
          loadReview(true);
          if (res.made) linkReadyDialog(res.made.url, res.made.name);
          else if (res.updated) toast('Sent for review. ' + (res.updated === 1 ? 'The review link now shows' : res.updated + ' review links now show') + ' this version', 'success');
        }, function (e) { toast('Sent for review, but the review link failed: ' + e.message, 'error', 8000); loadReview(true); });
      }, cloudError);
    } }] });
  }
  function renderCommentList() {
    var box = reviewEls && reviewEls.comments, page = App.page;
    if (!box || !page) return;
    box.innerHTML = '';
    if (!cloudReady()) { box.appendChild(el('p', { class: 'small muted', text: 'Comments are saved in the cloud too (see Sign-off above).' })); return; }
    var r = pageReview();
    if (!r || !r.loaded) { box.appendChild(el('p', { class: 'small muted', text: r && r.error ? 'Could not load comments: ' + r.error : 'Loading…' })); return; }
    var open = r.comments.filter(function (c) { return !c.resolved_at; });
    var shown = App.commentsAll ? r.comments : open;
    if (r.comments.length) {
      box.appendChild(el('div', { class: 'chips comments__filter', role: 'group', 'aria-label': 'Which comments' }, [
        el('button', { type: 'button', class: 'chip' + (App.commentsAll ? '' : ' is-active'), 'aria-pressed': App.commentsAll ? 'false' : 'true', onclick: function () { App.commentsAll = false; renderCommentList(); } }, ['Open (' + open.length + ')']),
        el('button', { type: 'button', class: 'chip' + (App.commentsAll ? ' is-active' : ''), 'aria-pressed': App.commentsAll ? 'true' : 'false', onclick: function () { App.commentsAll = true; renderCommentList(); } }, ['All (' + r.comments.length + ')'])
      ]));
    }
    if (!shown.length) box.appendChild(el('p', { class: 'small muted', text: r.comments.length ? 'No open comments. Everything has been resolved.' : 'No comments yet. Comment on the page, or pick a block in the preview to comment on it.' }));
    shown.forEach(function (c) { box.appendChild(commentCard(c)); });
  }
  function commentCard(c) {
    var C = window.UOL_CLOUD, me = C.user(), l = C.link();
    var mine = !!(me && c.author_id === me.id), b = c.block_id ? findBlock(c.block_id) : null;
    var target = null;
    if (c.block_id) target = b
      ? el('button', { type: 'button', class: 'comment__target', title: 'Show this block in the preview', onclick: function () { App.selectedBlock = c.block_id; highlightBlock(c.block_id, true); } }, ['Block ' + (blockIndex(c.block_id) + 1) + ': ' + blockSpec(b).label])
      : el('span', { class: 'comment__target is-gone', text: 'On a block that was removed' + (c.block_label ? ': ' + clipText(c.block_label, 40) : '') });
    var acts = [];
    if (mine || (l && l.role !== 'viewer')) acts.push(el('button', { type: 'button', class: 'btn btn--xs', onclick: function () { C.review.resolveComment(c.id, !c.resolved_at).then(function () { loadReview(true); }, cloudError); } }, [c.resolved_at ? 'Reopen' : 'Resolve']));
    if (mine || (l && l.role === 'owner')) acts.push(el('button', { type: 'button', class: 'btn btn--xs btn--danger-ghost', onclick: function () { UI.confirm('Delete comment', 'Delete this comment for everyone?', 'Delete', true).then(function (ok) { if (ok) C.review.deleteComment(c.id).then(function () { loadReview(true); }, cloudError); }); } }, ['Delete']));
    var name = c.guest_name ? c.guest_name : mine ? 'You' : who(c.author_email);
    return el('div', { class: 'comment' + (c.resolved_at ? ' is-resolved' : '') + (c.guest_name ? ' comment--guest' : '') }, [
      el('div', { class: 'comment__head' }, [el('strong', { title: c.author_email || '', text: name }), el('span', { class: 'small muted', text: fmtTime(c.created_at) })]),
      c.guest_name ? el('div', { class: 'comment__via', text: 'Reviewer, through the link "' + (c.guest_via || 'review link') + '"' }) : null,
      target,
      el('div', { class: 'comment__body', text: c.body }),
      c.resolved_at ? el('div', { class: 'small muted', text: 'Resolved by ' + who(c.resolved_by_email) + ', ' + fmtTime(c.resolved_at) }) : null,
      acts.length ? el('div', { class: 'comment__actions' }, acts) : null
    ]);
  }
  function commentComposer() {
    var page = App.page, C = window.UOL_CLOUD;
    var ta = el('textarea', { class: 'input', rows: 3, placeholder: 'Add a comment… (Ctrl+Enter to post)', 'aria-label': 'New comment' });
    ta.value = App.commentDraft || '';
    ta.addEventListener('input', function () { App.commentDraft = ta.value; });
    var target = el('select', { class: 'input input--sm', 'aria-label': 'What the comment is about' }, [option('', 'The whole page')].concat(page.blocks.map(function (b, i) {
      var s = blockSummary(b); return option(b.id, 'Block ' + (i + 1) + ': ' + blockSpec(b).label + (s ? ' · ' + clipText(s, 30) : ''));
    })));
    target.value = App.commentTarget && findBlock(App.commentTarget) ? App.commentTarget : '';
    target.addEventListener('change', function () { App.commentTarget = target.value; if (target.value) highlightBlock(target.value, true); });
    var post = el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: send }, ['Comment']);
    function send() {
      var text = ta.value.trim(); if (!text) { ta.focus(); return; }
      var bid = target.value, b = bid ? findBlock(bid) : null;
      post.disabled = true;
      C.review.addComment(page.id, bid, b ? blockSpec(b).label + (blockSummary(b) ? ': ' + clipText(blockSummary(b), 120) : '') : '', text).then(function () {
        ta.value = ''; App.commentDraft = ''; post.disabled = false; loadReview(true);
      }, function (e) { post.disabled = false; cloudError(e); });
    }
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); send(); } });
    reviewEls.commentInput = ta; reviewEls.commentTarget = target;
    return el('div', { class: 'comment-new' }, [ta, el('div', { class: 'comment-new__row' }, [target, post])]);
  }
  /* picking a block while the Review tab is open makes it the subject of the next comment */
  function setCommentTarget(id) {
    App.commentTarget = id || '';
    if (reviewEls && reviewEls.commentTarget && reviewEls.commentTarget.isConnected) reviewEls.commentTarget.value = id && findBlock(id) ? id : '';
  }
  function commentOnBlock(id) { App.commentTarget = id; App.focusComment = true; App.sideTab = 'review'; App.selectedBlock = id; renderEditorSide(); highlightBlock(id, true); }

  /* sign-off and open comments in the Pages table */
  function fillSignoffChips(root) {
    if (!cloudReady()) return;
    var C = window.UOL_CLOUD;
    var fresh = App.reviewSummaryAt && Date.now() - App.reviewSummaryAt < 30000;
    (fresh ? Promise.resolve(null) : Promise.all([C.review.summary(), C.review.jaduChecks(null).catch(function () { return []; })]).then(function (res) {
      App.reviewSummary = {}; (res[0] || []).forEach(function (r) { App.reviewSummary[r.page_id] = r; });
      App.jaduChecks = checksByPage(res[1]);
      App.reviewSummaryAt = Date.now();
    })).then(function () {
      root.querySelectorAll('[data-signoff]').forEach(function (td) {
        td.querySelectorAll('.signoff__pill, .comment-count').forEach(function (n) { n.remove(); });
        var jpPage = Store.getPage(td.getAttribute('data-signoff')), jp = jpPage ? jaduProgress(jpPage) : null;
        if (jp && jp.done) td.appendChild(el('span', { class: 'signoff__pill signoff__pill--sm signoff__pill--' + (jp.done >= jp.total ? 'approved' : 'in_review'), title: jp.done + ' of ' + jp.total + ' changes done in Jadu', text: jp.done >= jp.total ? 'Done in Jadu' : 'Jadu ' + jp.done + '/' + jp.total }));
        var s = App.reviewSummary && App.reviewSummary[td.getAttribute('data-signoff')], p = Store.getPage(td.getAttribute('data-signoff'));
        if (!s || !p) return;
        if (s.status && s.status !== 'not_started') {
          var edited = s.status === 'approved' && s.content_hash && s.content_hash !== RV.contentHash(p);
          td.appendChild(el('span', { class: 'signoff__pill signoff__pill--sm signoff__pill--' + (edited ? 'changes_requested' : s.status), title: SIGNOFF[s.status].label + (s.by_email ? ' by ' + s.by_email : '') + (s.at ? ', ' + fmtTime(s.at) : '') + (edited ? '. Edited since.' : ''), text: edited ? 'Edited since approval' : SIGNOFF[s.status].label }));
        }
        if (s.open_comments) td.appendChild(el('span', { class: 'comment-count', title: s.open_comments + ' open comment' + (s.open_comments === 1 ? '' : 's'), text: s.open_comments + ' comment' + (s.open_comments === 1 ? '' : 's') }));
      });
    }).catch(function () {});
  }

  /* ---------- review links: a fixed copy for people without an account ---------- */
  function parseScope(scope) { var m = /^(page|section):(.+)$/.exec(scope || ''); return m ? { kind: m[1], id: m[2] } : { kind: 'project' }; }
  function shareData(scope) {
    var d = Store.data, s = parseScope(scope), pages, sections;
    if (s.kind === 'page') { var p = Store.getPage(s.id); if (!p) throw new Error('That page no longer exists'); pages = [p]; var ps = Store.sectionOf(p.id); sections = ps ? [ps] : []; }
    else if (s.kind === 'section') { var sec = Store.getSection(s.id); if (!sec) throw new Error('That section no longer exists'); pages = Store.sectionPages(sec.id); sections = [sec]; }
    else { pages = d.pages; sections = d.sections; }
    var ids = {}; pages.forEach(function (p) { ids[p.id] = 1; });
    var user = window.UOL_CLOUD.user();
    return {
      site: Store.clone(d.site),
      pages: pages.map(function (p) { var c = Store.clone(p); delete c.revisions; delete c.source; c.hash = RV.contentHash(p); return c; }),
      sections: Store.clone(sections).map(function (x) { x.pages = (x.pages || []).filter(function (id) { return ids[id]; }); return x; }),
      madeAt: new Date().toISOString(), madeBy: user ? user.email : ''
    };
  }
  function reviewUrl(token, scope, page) {
    var base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    var s = parseScope(scope), p = page || (s.kind === 'page' ? Store.getPage(s.id) : null);
    return base + 'review.html#' + token + (p ? '/' + p.slug : '');
  }
  function scopeText(r) {
    var s = parseScope(r.scope);
    if (s.kind === 'page') { var p = Store.getPage(s.id); return 'Page: ' + (p ? p.title : 'deleted page'); }
    if (s.kind === 'section') { var sec = Store.getSection(s.id); return 'Section: ' + (sec ? sec.title : 'deleted section') + ' (' + r.page_count + ' page' + (r.page_count === 1 ? '' : 's') + ')'; }
    return 'Whole project (' + r.page_count + ' page' + (r.page_count === 1 ? '' : 's') + ')';
  }
  function imageProgress(i, n) { toast('Copying images for reviewers: ' + i + ' of ' + n, 'info', 1500); }
  /* the review links whose copy includes a page, the page's own links first. Lists from before page_hashes existed
     fall back to each link's scope */
  function linksForPage(rows, page) {
    var sec = Store.sectionOf(page.id), order = { page: 0, section: 1, project: 2 };
    return (rows || []).filter(function (r) {
      if (r.page_hashes) return Object.prototype.hasOwnProperty.call(r.page_hashes, page.id);
      var s = parseScope(r.scope);
      return s.kind === 'project' || (s.kind === 'page' && s.id === page.id) || (s.kind === 'section' && !!sec && s.id === sec.id);
    }).sort(function (a, b) { return order[parseScope(a.scope).kind] - order[parseScope(b.scope).kind]; });
  }
  /* 'current' or 'older' for the page's version in a link's copy; '' when the copy has no fingerprint (made before they were kept) */
  function linkVersion(r, page) {
    var h = r.page_hashes && r.page_hashes[page.id];
    return !h ? '' : h === RV.contentHash(page) ? 'current' : 'older';
  }
  function linkFeatures(r) {
    return (r.allow_comments === false ? 'Comments off' : (r.guest_comments || 0) + ' comment' + (r.guest_comments === 1 ? '' : 's'))
      + ' · ' + (r.allow_approvals ? (r.guest_signoffs || 0) + ' sign-off' + (r.guest_signoffs === 1 ? '' : 's') + ' from reviewers' : 'approvals off');
  }
  function updateLink(r) {
    var data; try { data = shareData(r.scope); } catch (e) { return Promise.reject(e); }
    if (App.dirty) saveNow();
    return window.UOL_CLOUD.shares.update(r.token, data, imageProgress);
  }
  /* Copy link, Open, Update and the more menu, on the Cloud screen and the Review tab. With a page, the link opens on it */
  function linkActions(r, reload, page) {
    var C = window.UOL_CLOUD, url = reviewUrl(r.token, r.scope, page);
    return [
      el('button', { class: 'btn btn--xs', type: 'button', onclick: function () { X.copyText(url).then(function () { toast('Link copied', 'success'); }); } }, ['Copy link']),
      el('a', { class: 'btn btn--xs', href: url, target: '_blank', rel: 'noopener' }, ['Open']),
      el('button', { class: 'btn btn--xs', type: 'button', title: 'Replace the copy with the pages as they are now; the link stays the same', onclick: function () {
        updateLink(r).then(function () { toast('"' + r.name + '" now shows the latest version', 'success'); reload(); }, cloudError);
      } }, ['Update']),
      menuButton(null, [
        { label: r.allow_comments === false ? 'Let reviewers comment' : 'Turn off comments (existing ones stay)', onClick: function () { C.shares.setComments(r.token, r.allow_comments === false).then(function () { toast(r.allow_comments === false ? 'Reviewers can comment' : 'Comments turned off for this link', 'success'); reload(); }, cloudError); } },
        { label: r.allow_approvals ? 'Turn off approvals (past sign-offs stay)' : 'Let reviewers approve or ask for changes', onClick: function () { C.shares.setApprovals(r.token, !r.allow_approvals).then(function () { toast(r.allow_approvals ? 'Approvals turned off for this link' : 'Reviewers can now approve or ask for changes', 'success'); reload(); }, cloudError); } },
        '-',
        { label: 'Delete link', onClick: function () { UI.confirm('Delete review link', 'Delete "' + r.name + '"? The link stops working for everyone who has it. Comments and sign-offs made through it are kept.', 'Delete', true).then(function (ok) { if (ok) C.shares.remove(r.token).then(function () { toast('Review link deleted', 'info'); reload(); }, cloudError); }); } }
      ], { icon: 'more', title: 'More for this link' })
    ];
  }
  /* on the Review tab: the links reviewers without an account use for this page */
  function pageLinksBlock(page, r) {
    var wrap = el('div', { class: 'plinks' }, [el('div', { class: 'plinks__head' }, [el('strong', { text: 'Review links' }), el('span', { class: 'small muted', text: 'for reviewers without an account' })])]);
    if (!r.links) { wrap.appendChild(el('p', { class: 'small muted', text: 'Could not load the review links. They are listed on the Cloud screen.' })); return wrap; }
    if (!r.links.length) wrap.appendChild(el('p', { class: 'small muted', text: 'None for this page yet. Send for review makes one, or make one now.' }));
    r.links.forEach(function (l) {
      var v = linkVersion(l, page);
      wrap.appendChild(el('div', { class: 'plink' }, [
        el('div', { class: 'plink__text' }, [
          el('strong', { text: l.name }),
          el('span', { class: 'small muted', text: (parseScope(l.scope).kind === 'page' ? 'This page' : scopeText(l)) + ' · copy from ' + fmtTime(l.updated_at) }),
          el('span', { class: 'small muted', text: linkFeatures(l) }),
          v === 'older' ? el('span', { class: 'plink__old small', text: 'Shows an older version of this page. Update it so reviewers see your latest edits.' }) : null
        ]),
        el('div', { class: 'plink__acts' }, linkActions(l, function () { loadReview(true); }, page))
      ]));
    });
    wrap.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn btn--xs', type: 'button', onclick: function () { shareLinkDialog('page'); } }, [icon('share', 14), ' New review link'])]));
    return wrap;
  }
  /* the review link part of Send for review: update the page's links, or make one if none includes the page */
  function sendLinkOptions(page) {
    var r = pageReview(), links = r && r.links;
    if (!links) return null;
    var box = el('div', { class: 'sendlinks' }, [el('p', { class: 'field__label', text: 'Reviewers without an account' })]);
    var updates = [], make = null, comments = null, approve = null;
    links.forEach(function (l) {
      var v = linkVersion(l, page), s = parseScope(l.scope);
      if (v === 'current') { box.appendChild(el('p', { class: 'small muted', text: 'The review link "' + l.name + '" already shows this version.' })); return; }
      var cb = el('input', { type: 'checkbox', checked: s.kind === 'page' });
      updates.push({ link: l, box: cb });
      box.appendChild(el('label', { class: 'check small' }, [cb, el('span', { text: s.kind === 'page' ? 'Update the review link "' + l.name + '" so it shows this version'
        : 'Update the review link "' + l.name + '" (' + scopeText(l).replace(/^(\w)/, function (c) { return c.toLowerCase(); }) + ') so it shows this version. This also updates the other pages in it' })]));
    });
    if (!links.length) {
      make = el('input', { type: 'checkbox', checked: true });
      comments = el('input', { type: 'checkbox', checked: true });
      approve = el('input', { type: 'checkbox', checked: true });
      var opts = el('div', { class: 'sendlinks__opts' }, [
        el('label', { class: 'check small' }, [comments, el('span', { text: 'Reviewers can comment, with their name' })]),
        el('label', { class: 'check small' }, [approve, el('span', { text: 'Reviewers can approve or ask for changes, with their name and role' })])
      ]);
      make.addEventListener('change', function () { opts.hidden = !make.checked; });
      box.appendChild(el('label', { class: 'check small' }, [make, el('span', { text: 'Also make a review link: a read-only copy of this page anyone with the link can open' })]));
      box.appendChild(opts);
    }
    return {
      el: box,
      run: function () {
        var C = window.UOL_CLOUD, chosen = updates.filter(function (u) { return u.box.checked; }), made = null;
        var jobs = chosen.map(function (u) { return updateLink(u.link); });
        if (make && make.checked) {
          var sc = 'page:' + page.id, data;
          try { data = shareData(sc); } catch (e) { return Promise.reject(e); }
          jobs.push(C.shares.create(page.title, sc, data, imageProgress).then(function (token) {
            return Promise.all([comments.checked ? null : C.shares.setComments(token, false), approve.checked ? C.shares.setApprovals(token, true) : null])
              .then(function () { made = { url: reviewUrl(token, sc), name: page.title }; });
          }));
        }
        return Promise.all(jobs).then(function () { return { made: made, updated: chosen.length }; });
      }
    };
  }
  function shareLinkDialog(defaultKind) {
    var C = window.UOL_CLOUD, l = C && C.link(), page = App.view === 'edit' ? App.page : null;
    if (!cloudReady()) { toast('Review links need the cloud: upload this project and sign in on the Cloud screen first', 'warn', 6000); return; }
    if (!C.canEdit()) { toast('Only the owner or an editor can make review links', 'warn'); return; }
    var sec = page ? Store.sectionOf(page.id) : null;
    var scope = el('select', { class: 'input', 'aria-label': 'What to share' }, [
      page ? option('page:' + page.id, 'This page: ' + page.title) : null,
      sec ? option('section:' + sec.id, 'Its section: ' + sec.title + ' (' + sec.pages.length + ' pages)') : null,
      option('project', 'The whole project (' + Store.data.pages.length + ' pages)')
    ].filter(Boolean));
    scope.value = defaultKind === 'page' && page ? 'page:' + page.id : defaultKind === 'section' && sec ? 'section:' + sec.id : 'project';
    var name = el('input', { class: 'input', type: 'text', 'aria-label': 'Name' });
    function defName() { var s = parseScope(scope.value); return s.kind === 'page' ? page.title : s.kind === 'section' ? sec.title : l.name; }
    name.value = defName();
    scope.addEventListener('change', function () { name.value = defName(); });
    var msg = el('p', { class: 'small', role: 'alert' });
    var allow = el('input', { type: 'checkbox', checked: true }), approve = el('input', { type: 'checkbox' });
    UI.modal({ title: 'Share a review link', body: el('div', {}, [
      el('p', { class: 'small', text: 'Anyone with the link can view a copy of the pages as they are now, without an account. Later edits only show once you update the link, on the Review tab or the Cloud screen. Reviewers cannot edit, and see nothing else in the project.' }),
      el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'What to share' }), scope]),
      el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'Name shown to reviewers' }), name]),
      el('label', { class: 'check small' }, [allow, el('span', { text: 'Let reviewers comment, with their name. Their comments appear on the Review tab.' })]),
      el('label', { class: 'check small' }, [approve, el('span', { text: 'Let reviewers approve or ask for changes, with their name and role. Their sign-off is recorded on the Review tab like the team\'s.' })]),
      msg
    ]), buttons: [{ label: 'Cancel' }, { label: 'Create link', primary: true, onClick: function (api) {
      var data; try { data = shareData(scope.value); } catch (e) { msg.className = 'small error'; msg.textContent = e.message; return false; }
      if (App.dirty) saveNow();
      msg.className = 'small muted'; msg.textContent = 'Creating the link…';
      var sc = scope.value;
      C.shares.create(name.value.trim() || defName(), sc, data, imageProgress).then(function (token) {
        return Promise.all([allow.checked ? null : C.shares.setComments(token, false), approve.checked ? C.shares.setApprovals(token, true) : null])
          .then(function () { api.close(); if (App.view === 'edit') loadReview(true); linkReadyDialog(reviewUrl(token, sc), name.value.trim() || defName()); });
      }).catch(function (e) { msg.className = 'small error'; msg.textContent = e.message; });
      return false;
    } }] });
  }
  function linkReadyDialog(url, name) {
    var input = el('input', { class: 'input input--mono', type: 'text', readonly: true, value: url, 'aria-label': 'Review link' });
    UI.modal({ title: 'Review link ready', body: el('div', {}, [
      el('p', { class: 'small', text: 'Send this link to reviewers. It shows "' + name + '" as it is now. You can find it again on the Review tab of each page it includes, and on the Cloud screen.' }),
      el('div', { class: 'row' }, [input, el('button', { class: 'btn btn--primary', type: 'button', onclick: function () { X.copyText(url).then(function () { toast('Link copied', 'success'); }); } }, ['Copy']), el('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, ['Open'])]),
      isHttp ? null : el('p', { class: 'small muted', text: 'This CMS is open from a file, so the link only works on this computer. Make links from the CMS\'s web address (the Vercel site) to send them to others.' })
    ]), buttons: [{ label: 'Done', primary: true }] });
    setTimeout(function () { input.select(); }, 50);
  }
  function reviewLinksPanel() {
    var C = window.UOL_CLOUD, box = el('div', {}, [el('p', { class: 'small muted', text: 'Loading…' })]);
    function load() {
      C.shares.list().then(function (rows) {
        box.innerHTML = '';
        if (!rows || !rows.length) { box.appendChild(el('p', { class: 'small muted', text: 'No review links yet.' })); return; }
        rows.forEach(function (r) {
          box.appendChild(el('div', { class: 'rev' }, [
            el('div', {}, [el('strong', { text: r.name }), el('div', { class: 'small muted', text: scopeText(r) + ' · copy from ' + fmtTime(r.updated_at) + (r.created_by_email ? ' · made by ' + who(r.created_by_email) : '') }),
              el('div', { class: 'small muted', text: linkFeatures(r) })]),
            el('div', {}, linkActions(r, load))
          ]));
        });
      }, function (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'error small', text: 'Could not load review links: ' + e.message })); });
    }
    load();
    return el('div', { class: 'panel' }, [
      el('h2', { text: 'Review links' }),
      el('p', { class: 'small', text: 'Read-only copies for reviewers without an account. Each link shows the pages as they were when it was made or last updated. A page\'s links are also listed on its Review tab.' }),
      el('div', { class: 'row' }, [el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { shareLinkDialog('project'); } }, [icon('share', 16), ' New review link'])]),
      box
    ]);
  }
  /* change lists for every page that has an original, on Save and export */
  function changeListPanel() {
    var withOriginal = Store.data.pages.filter(function (p) { return p.source && p.source.original; });
    var rows = el('div', { class: 'table' });
    withOriginal.forEach(function (p) {
      var d = pageDiff(p);
      rows.appendChild(el('div', { class: 'table__row' }, [
        el('div', {}, [el('a', { href: '#edit/' + p.id, text: p.title }), el('div', { class: 'small muted', text: d.total ? RV.countsLine(d) : 'no changes' })]),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn btn--sm', type: 'button', disabled: !d.total, onclick: function () { exportChangeList([p], 'word'); } }, ['Word']),
          el('button', { class: 'btn btn--sm', type: 'button', disabled: !d.total, onclick: function () { exportChangeList([p], 'pdf'); } }, ['PDF'])
        ])
      ]));
    });
    var changed = withOriginal.filter(function (p) { return pageDiff(p).total; });
    return el('div', { class: 'panel' }, [
      el('h2', { text: 'Changes for Jadu' }),
      el('p', { class: 'small muted', text: 'Change lists against the original of each imported page: what to add, remove and edit in Jadu, with the text differences marked. PDF opens the print window; choose "Save as PDF".' }),
      withOriginal.length ? rows : el('p', { class: 'small muted', text: 'No page has an original yet. Pages imported from now on keep one; for older pages, open the page and choose Changes in the top bar.' }),
      changed.length > 1 ? el('div', { class: 'row' }, [
        el('button', { class: 'btn btn--primary', type: 'button', onclick: function () { exportChangeList(changed, 'word', 'Changes for Jadu: ' + (Store.data.site.name || 'all pages')); } }, ['All changed pages as Word']),
        el('button', { class: 'btn', type: 'button', onclick: function () { exportChangeList(changed, 'pdf', 'Changes for Jadu: ' + (Store.data.site.name || 'all pages')); } }, ['All changed pages as PDF'])
      ]) : null,
      Store.data.pages.length > withOriginal.length ? el('p', { class: 'small muted', text: (Store.data.pages.length - withOriginal.length) + ' page' + (Store.data.pages.length - withOriginal.length === 1 ? ' has' : 's have') + ' no original to compare with.' }) : null
    ]);
  }

  /* ---------- import a section into the current page ---------- */
  function importSectionDialog() {
    var page = App.page;
    var ta = el('textarea', { class: 'input input--mono input--tall', placeholder: 'Paste design-system HTML here (for example a widget copied with the grabber or from Jadu)…', rows: 10 });
    var url = el('input', { class: 'input', type: 'text', placeholder: 'https://www.leeds.ac.uk/… (needs the local server)' });
    var status = el('p', { class: 'small muted' });
    var m = UI.modal({ title: 'Import a section into this page', wide: true, body: el('div', {}, [
      el('div', { class: 'field' }, [el('span', { class: 'field__label', text: 'Paste HTML' }), ta]),
      isHttp ? el('div', { class: 'field' }, [el('span', { class: 'field__label', text: 'Or fetch the content of a page by URL' }), el('div', { class: 'row' }, [url, el('button', { class: 'btn', type: 'button', onclick: function () { status.textContent = 'Fetching…'; IMP.fetchUrl(url.value.trim()).then(function (html) { var r = IMP.parsePage(html, { baseUrl: url.value.trim() }); insert(r.page.blocks, r.warnings); }).catch(function (e) { status.textContent = e.message; }); } }, ['Fetch'])])]) : null,
      status
    ]), buttons: [{ label: 'Cancel' }, { label: 'Import blocks', primary: true, onClick: function () { if (!ta.value.trim()) { status.textContent = 'Paste some HTML first.'; return false; } var r = IMP.parseSection(ta.value); insert(r.blocks, r.warnings); return false; } }] });
    function insert(blocks, warnings) {
      if (!blocks.length) { status.textContent = 'Nothing recognisable was found.'; return; }
      var idx = App.selectedBlock ? blockIndex(App.selectedBlock) : -1;
      var at = idx === -1 ? page.blocks.length : idx + 1;
      blocks.forEach(function (b, i) { page.blocks.splice(at + i, 0, b); });
      m.close(); afterStructureChange(blocks[0].id);
      toast(blocks.length + ' block' + (blocks.length === 1 ? '' : 's') + ' imported' + (warnings.length ? ' (' + warnings.length + ' kept as raw HTML)' : ''), 'success', 4000);
    }
  }

  /* ================= site view ================= */
  /* ================= settings: a hub for the screens that are not needed day to day ================= */
  function settingsView() {
    function tile(ic, title, text, hash) { return el('a', { class: 'starter', href: hash }, [el('span', { class: 'starter__icon' }, [icon(ic, 28)]), el('strong', { text: title }), el('span', { text: text })]); }
    return el('div', { class: 'page-wrap' }, [
      el('div', { class: 'starters' }, [
        tile('site', 'Site', 'Masthead, navigation, banners and footer shared by every page.', '#site'),
        tile('theme', 'Theme', 'Colours, fonts, presets and custom CSS for the whole project.', '#theme'),
        tile('library', 'Components', 'Every block with the current theme, and the library of components each kind of page can hold.', '#library')
      ])
    ]);
  }
  function siteView() {
    var site = Store.data.site;
    var side = el('aside', { class: 'editor__side site-side' });
    var body = el('div', { class: 'editor__side-body' });
    side.appendChild(el('div', { class: 'side-title' }, [el('h2', { text: 'Site settings' }), el('span', { class: 'small muted', text: 'Masthead, navigation, banners and footer shared by every page' })]));
    side.appendChild(body);
    siteSchema.forEach(function (s, i) {
      var sec = section(s.title, i === 0);
      var target = s.key ? ensure(site, s.key, {}) : site;
      UI.renderForm(sec.body, s.fields, target, function () { markDirty(); reloadPreviewSoon(); });
      body.appendChild(sec.el);
    });
    var preview = previewPane({ extra: [pagePicker()] });
    var mobileTabs = mobileTabBar();
    screenTopbar('Site', [], [el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onclick: function () { UI.confirm('Reset site settings', 'Reset the masthead, navigation and footer to the University of Leeds defaults? Pages are not affected.', 'Reset', true).then(function (ok) { if (ok) { Store.data.site = Object.assign(window.UOL_SEED_SITE(), { theme: Store.data.site.theme }); Store.save(); route(); toast('Site settings reset', 'info'); } }); } }, ['Reset to Leeds defaults'])]);
    var wrap = el('div', { class: 'editor', 'data-pane': App.mobilePane }, [mobileTabs, el('div', { class: 'editor__body' }, [side, preview])]);
    mobileTabs.bind(wrap);
    return wrap;
  }
  function mobileTabBar() {
    var bar = el('div', { class: 'mobile-tabs' });
    bar.bind = function (wrap) { [['edit', 'Edit'], ['preview', 'Preview']].forEach(function (t) { bar.appendChild(el('button', { type: 'button', class: 'mobile-tabs__btn' + (App.mobilePane === t[0] ? ' is-active' : ''), onclick: function () { App.mobilePane = t[0]; wrap.setAttribute('data-pane', t[0]); bar.querySelectorAll('.mobile-tabs__btn').forEach(function (b) { b.classList.remove('is-active'); }); this.classList.add('is-active'); } }, [t[1]])); }); };
    return bar;
  }
  function pagePicker() {
    var sel = el('select', { class: 'input input--sm', 'aria-label': 'Page to preview' }, Store.data.pages.map(function (p) { var o = el('option', { value: p.id, text: p.title }); if (Preview.page && Preview.page.id === p.id) o.selected = true; return o; }).concat([el('option', { value: '__library', text: 'Component library' })]));
    if (!Preview.page) Preview.page = Store.data.pages[0];
    sel.addEventListener('change', function () { if (sel.value === '__library') { Preview.mode = 'library'; } else { Preview.mode = 'page'; Preview.page = Store.getPage(sel.value); } reloadPreview(false); });
    return sel;
  }

  /* ================= theme view ================= */
  function themeView() {
    var site = Store.data.site;
    var theme = ensure(site, 'theme', { tokens: {} });
    if (!theme.tokens) theme.tokens = {};
    var side = el('aside', { class: 'editor__side site-side' });
    var body = el('div', { class: 'editor__side-body' });
    side.appendChild(el('div', { class: 'side-title' }, [el('h2', { text: 'Theme' }), el('span', { class: 'small muted', text: 'Change design tokens and see every page update live. Empty values use the design system default.' })]));
    side.appendChild(body);
    function change() { markDirty(); pushTheme(); if (App.previewMode === 'code') renderCode(); }
    var presets = section('Presets', true);
    function renderPresets() {
      presets.body.innerHTML = '';
      presets.body.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: function () { UI.prompt('Save theme preset', 'Preset name', 'My theme', 'Save').then(function (n) { if (n) { Store.savePreset(n, theme); renderPresets(); toast('Preset saved', 'success'); } }); } }, ['Save current as preset']),
        el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { theme.tokens = {}; theme.fontSans = ''; theme.fontSerif = ''; theme.baseFontSize = '100%'; theme.customCss = ''; markDirty(); route(); toast('Theme reset to design system defaults', 'info'); } }, ['Reset to defaults'])
      ]));
      Store.getPresets().forEach(function (p) {
        presets.body.appendChild(el('div', { class: 'rev' }, [el('div', {}, [el('strong', { text: p.name }), el('div', { class: 'small muted', text: fmtTime(p.at) })]), el('div', {}, [el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { Object.assign(theme, JSON.parse(JSON.stringify(p.theme))); markDirty(); route(); toast('Preset applied', 'success'); } }, ['Apply']), el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onclick: function () { Store.deletePreset(p.name); renderPresets(); } }, ['✕'])])]));
      });
    }
    renderPresets();
    body.appendChild(presets.el);
    var fonts = section('Typography', true);
    UI.renderForm(fonts.body, [
      S.bool('loadTypekit', 'Load Freight fonts from Adobe Fonts (needs internet)', { hint: 'The design system uses Freight Sans Pro and Freight Text Pro.' }),
      S.text('fontSans', 'Sans-serif font stack', { placeholder: 'e.g. "Inter", Arial, sans-serif' }),
      S.text('fontSerif', 'Serif font stack', { placeholder: 'e.g. Georgia, serif' }),
      S.select('baseFontSize', 'Base font size', ['87.5%', '93.75%', '100%', '106.25%', '112.5%', '125%'].map(function (v) { return { value: v, label: v + (v === '100%' ? ' (default, 16px)' : '') }; }))
    ], theme, function () { markDirty(); reloadPreviewSoon(); });
    body.appendChild(fonts.el);
    var groups = [['Brand reds', /^color-brand(?!-2)/], ['Greens (brand 2)', /^color-brand-2/], ['Teal (new brand)', /^color-teal/], ['Text', /^color-font/], ['Links and focus', /^color-focus/], ['Blacks', /^color-black/], ['Cool greys', /^color-grey/], ['Warm greys', /^color-warmgrey/], ['Creams and whites', /^color-(cream|white)/], ['Blues', /^color-blue/], ['Alerts', /^color-alert/], ['Other', /^color-pink/]];
    groups.forEach(function (g) {
      var toks = window.UOL_COLOUR_TOKENS.filter(function (t) { return g[1].test(t.name); });
      if (!toks.length) return;
      var sec = section(g[0] + ' (' + toks.length + ')');
      toks.forEach(function (t) {
        var row = el('div', { class: 'tokrow' });
        var color = el('input', { type: 'color', value: theme.tokens[t.name] || t.value, 'aria-label': t.name });
        var hex = el('input', { class: 'input input--hex', type: 'text', value: theme.tokens[t.name] || '', placeholder: t.value, 'aria-label': t.name + ' hex' });
        var reset = el('button', { class: 'btn btn--icon btn--xs', type: 'button', title: 'Reset', onclick: function () { delete theme.tokens[t.name]; hex.value = ''; color.value = t.value; change(); } }, ['↺']);
        color.addEventListener('input', debounce(function () { theme.tokens[t.name] = color.value; hex.value = color.value; change(); }, 60));
        hex.addEventListener('input', debounce(function () { if (/^#[0-9a-f]{6}$/i.test(hex.value)) { theme.tokens[t.name] = hex.value; color.value = hex.value; change(); } else if (!hex.value) { delete theme.tokens[t.name]; color.value = t.value; change(); } }, 150));
        row.appendChild(color); row.appendChild(el('span', { class: 'tokrow__name', text: t.name.replace(/^color-/, '') })); row.appendChild(hex); row.appendChild(reset);
        sec.body.appendChild(row);
      });
      body.appendChild(sec.el);
    });
    var css = section('Custom CSS');
    var ta = el('textarea', { class: 'input input--mono input--tall', rows: 12, placeholder: '/* Anything here is appended after the design system stylesheet */\n.uol-button { border-radius: 4px; }' });
    ta.value = theme.customCss || '';
    ta.addEventListener('input', debounce(function () { theme.customCss = ta.value; change(); }, 250));
    css.body.appendChild(ta);
    css.body.appendChild(el('p', { class: 'small muted', text: 'Tip: switch the preview to HTML to find class names. All design system classes start with uol-.' }));
    body.appendChild(css.el);
    var preview = previewPane({ extra: [pagePicker()] });
    var mobileTabs = mobileTabBar();
    screenTopbar('Theme', [], [el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { X.copyText(R.themeCss(theme)).then(function () { toast('Theme CSS copied', 'success'); }); } }, ['Copy theme CSS']), el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { X.download(new Blob([R.themeCss(theme)], { type: 'text/css' }), 'leeds-theme.css'); } }, ['Download CSS'])]);
    var wrap = el('div', { class: 'editor', 'data-pane': App.mobilePane }, [mobileTabs, el('div', { class: 'editor__body' }, [side, preview])]);
    mobileTabs.bind(wrap);
    return wrap;
  }

  /* ================= component library ================= */
  function libraryHtml() {
    var site = Store.data.site, tpl = App.libTemplate || '', lib = tpl ? libraryOf(tpl) : null;
    var blocks = [];
    Blocks.groups.forEach(function (g) {
      var specs = Blocks.list().filter(function (s) { return s.group === g && (!lib || lib.indexOf(s.type) !== -1); });
      if (!specs.length) return;
      blocks.push({ id: 'lib-g-' + g, type: 'raw-html', props: { html: '<h2 style="width:100%;margin-top:3rem;padding-top:1rem;border-top:4px solid #c70000">' + esc(g) + '</h2>', inline: false } });
      specs.forEach(function (s) {
        blocks.push({ id: 'lib-h-' + s.type, type: 'raw-html', props: { html: '<p style="width:100%;margin:2rem 0 .5rem;font-family:sans-serif;font-size:.8rem;letter-spacing:.05em;text-transform:uppercase;color:#636363">' + esc(s.label) + ' <code>' + esc(s.type) + '</code></p>', inline: false } });
        blocks.push({ id: 'lib-' + s.type, type: s.type, props: Blocks.defaultsFor(s.type) });
      });
    });
    var typo = { id: 'lib-typo', type: 'raw-html', props: { html: '<h2 style="width:100%;margin-top:3rem;padding-top:1rem;border-top:4px solid #c70000">Typography</h2><div class="uol-rich-text" style="width:100%"><p class="text-size-epic">Epic</p><h1>Heading 1</h1><h2>Heading 2</h2><h3>Heading 3</h3><h4>Heading 4</h4><h5>Heading 5</h5><h6>Heading 6</h6><p class="uol-typography-paragraph-intro">Intro paragraph. Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p><p>Default paragraph with a <a href="#">text link</a>, <strong>bold</strong> and <em>emphasis</em>.</p><p class="uol-typography-paragraph-small">Small paragraph.</p><ul><li>Unordered item</li><li>Another item</li></ul><ol><li>Ordered item</li><li>Another item</li></ol></div>', inline: false } };
    // a page type's library is drawn in that page type's layout
    var asTpl = tpl === 'homepage' || !tpl ? 'homepage' : 'document';
    var title = tpl ? Blocks.templates[tpl] + ' library' : 'Component library';
    var intro = tpl ? 'The components that can be added to ' + templateName(tpl) + 's, rendered with the current theme.' : 'Every block in its default state, rendered with the current theme.';
    var doc = R.renderFragmentDocument(site, [typo].concat(blocks), { template: asTpl, title: title, editor: false, live: true, pages: [] });
    // on a homepage the content is a row of full-width items, so each heading and label takes a whole row
    var head = '<h1 style="width:100%;margin:2rem 0 0">' + esc(title) + '</h1><p class="uol-typography-paragraph-intro" style="width:100%">' + esc(intro) + '</p>';
    return asTpl === 'homepage' ? doc.replace('class="uol-homepage-content">', 'class="uol-homepage-content">' + head) : doc.replace('class="uol-page">', 'class="uol-page">' + head);
  }
  var LIB_INTRO = {
    homepage: 'Homepages hold widgets as well as everything in the rich text editor.',
    document: 'A Jadu document page holds what its rich text editor offers, so the document page library has those components only.',
    article: 'Articles hold rich text and the components designed for news, events and profiles.'
  };
  function libraryView() {
    Preview.mode = 'library';
    App.libTemplate = App.libTemplate || '';
    var site = Store.data.site;
    var pane = previewPane({ extra: [el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { X.download(new Blob([libraryHtml().replace(/<link rel="stylesheet" href="assets\/ds\/css\/style.css">/, '<style>' + window.UOL_INLINE_CSS + '</style>').replace(/<script src="assets\/ds\/scripts\/[^"]+"><\/script>/g, '')], { type: 'text/html' }), 'leeds-component-library.html'); } }, ['Download as HTML'])] });
    var side = el('aside', { class: 'editor__side lib-side' });
    var tabs = el('div', { class: 'seg', role: 'group', 'aria-label': 'Which components' });
    function count(t) { return libraryOf(t).length; }
    var openGroups = {}; // which groups are open, kept while items are switched on and off
    function renderTabs() {
      tabs.innerHTML = '';
      [['', 'All'], ['homepage', 'Homepage'], ['document', 'Document page'], ['article', 'Article']].forEach(function (o) {
        tabs.appendChild(el('button', { type: 'button', class: 'seg__btn' + (App.libTemplate === o[0] ? ' is-active' : ''), 'aria-pressed': App.libTemplate === o[0] ? 'true' : 'false', onclick: function () { App.libTemplate = o[0]; renderTabs(); renderSide(); reloadPreview(false); } }, [o[1] + (o[0] ? ' (' + count(o[0]) + ')' : '')]));
      });
    }
    function renderSide() {
      side.innerHTML = '';
      var t = App.libTemplate, body = el('div', { class: 'editor__side-body' });
      if (!t) {
        side.appendChild(el('div', { class: 'side-title' }, [el('h2', { text: 'Component libraries' }), el('span', { class: 'small muted', text: 'What each kind of page can hold' })]));
        body.appendChild(el('p', { class: 'small', text: 'Each kind of page has its own library. Add a block shows the page\'s library, and Check page flags blocks from outside it, so a prototype only uses what Jadu allows on that kind of page.' }));
        ['homepage', 'document', 'article'].forEach(function (k) {
          body.appendChild(el('div', { class: 'lib-sum' }, [
            el('div', {}, [el('strong', { text: Blocks.templates[k] }), el('div', { class: 'small muted', text: count(k) + ' of ' + Blocks.list().length + ' components' + (Blocks.libraries.customised(site, k) ? ', changed for this project' : '') }), el('div', { class: 'small muted', text: LIB_INTRO[k] })]),
            el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { App.libTemplate = k; renderTabs(); renderSide(); reloadPreview(false); } }, ['Edit'])
          ]));
        });
        side.appendChild(body);
        return;
      }
      var lib = libraryOf(t), defs = Blocks.libraries.defaults(t), custom = Blocks.libraries.customised(site, t);
      side.appendChild(el('div', { class: 'side-title' }, [el('h2', { text: Blocks.templates[t] + ' library' }), el('span', { class: 'small muted', text: lib.length + ' of ' + Blocks.list().length + ' components' + (custom ? ', changed for this project' : '') })]));
      body.appendChild(el('p', { class: 'small', text: LIB_INTRO[t] + ' Tick a component to let it be added to ' + templateName(t) + 's.' }));
      if (custom) body.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn btn--sm', type: 'button', onclick: function () {
        UI.confirm('Reset the library', 'Put the ' + templateName(t) + ' library back to the default? Blocks already on pages stay where they are.', 'Reset').then(function (ok) { if (!ok) return; Blocks.libraries.reset(site, t); markDirty(); renderTabs(); renderSide(); reloadPreview(true); });
      } }, ['Reset to the default'])]));
      Blocks.groups.forEach(function (g) {
        var specs = Blocks.list().filter(function (s) { return s.group === g; });
        if (!specs.length) return;
        var on = specs.filter(function (s) { return lib.indexOf(s.type) !== -1; }).length;
        var key = t + ':' + g, sec = section(g + ' (' + on + ' of ' + specs.length + ')', openGroups[key] !== undefined ? openGroups[key] : on > 0);
        sec.el.addEventListener('toggle', function () { openGroups[key] = sec.el.open; });
        specs.forEach(function (s) {
          var cb = el('input', { type: 'checkbox', checked: lib.indexOf(s.type) !== -1 });
          cb.addEventListener('change', function () { Blocks.libraries.set(site, t, s.type, cb.checked); markDirty(); renderTabs(); renderSide(); reloadPreviewSoon(); });
          var changed = (defs.indexOf(s.type) !== -1) !== cb.checked;
          sec.body.appendChild(el('label', { class: 'check lib-item' }, [cb, el('span', {}, [el('span', { text: s.label }), changed ? el('span', { class: 'lib-item__changed', text: cb.checked ? 'added' : 'removed' }) : null, el('span', { class: 'small muted lib-item__desc', text: BLOCK_DESC[s.type] || '' })])]));
        });
        body.appendChild(sec.el);
      });
      // keep the scroll position while switching items on and off
      var keep = side.__scroll || 0; side.appendChild(body); body.scrollTop = keep; body.addEventListener('scroll', function () { side.__scroll = body.scrollTop; });
    }
    renderTabs(); renderSide();
    screenTopbar('Components', [tabs]);
    var mobileTabs = mobileTabBar();
    var wrap = el('div', { class: 'editor', 'data-pane': App.mobilePane }, [mobileTabs, el('div', { class: 'editor__body' }, [side, pane])]);
    mobileTabs.bind(wrap);
    return wrap;
  }

  /* ================= media view ================= */
  function usageOf(id) { var ref = 'media:' + id, n = 0; Store.data.pages.forEach(function (p) { if (JSON.stringify({ s: p.settings, h: p.hero, b: p.blocks }).indexOf(ref) !== -1) n++; }); if (JSON.stringify(Store.data.site).indexOf(ref) !== -1) n++; return n; }
  function mediaView() {
    var grid = el('div', { class: 'media-grid' });
    var info = el('p', { class: 'small muted' });
    var file = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    var selected = {};
    var search = el('input', { class: 'input', type: 'search', placeholder: 'Filter by name…', 'aria-label': 'Filter images' });
    var usedSel = el('select', { class: 'input input--sm', 'aria-label': 'Usage filter' }, [['', 'All images'], ['used', 'In use'], ['unused', 'Not used']].map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
    var drop = el('div', { class: 'dropzone' }, [el('strong', { text: 'Drop images here' }), el('span', { class: 'small muted', text: ' or ' }), el('button', { type: 'button', class: 'btn btn--primary btn--sm', onclick: function () { file.click(); } }, ['Choose files']), el('div', { class: 'small muted', text: 'Large images are resized to 1600px on the long side. Stored in the browser\'s database' + (App.folderLinked ? ' and in "' + M.folderName() + '\\media"' : ', and in your project folder once one is linked') + '.' })]);
    var bulk = el('div', { class: 'bulkbar', hidden: true });
    function visibleItems() {
      var q = search.value.toLowerCase();
      return M.list().filter(function (r) { if (q && r.name.toLowerCase().indexOf(q) === -1) return false; if (usedSel.value) { var u = usageOf(r.id) > 0; if ((usedSel.value === 'used') !== u) return false; } return true; });
    }
    function selectedIds() { return Object.keys(selected).filter(function (k) { return selected[k] && M.get(k); }); }
    function renderBulk() {
      var ids = selectedIds();
      bulk.hidden = !ids.length;
      bulk.innerHTML = '';
      if (!ids.length) return;
      bulk.appendChild(el('strong', { text: ids.length + ' selected' }));
      bulk.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { X.copyText(ids.map(function (id) { return M.ref(id); }).join('\n')).then(function () { toast('References copied, one per line', 'success'); }); } }, ['Copy refs']));
      bulk.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { toast('Duplicating…', 'info', 1500); ids.reduce(function (c, id) { return c.then(function () { var r = M.get(id); return M.add(new File([r.blob], r.name.replace(/(\.[a-z0-9]+)?$/i, ' copy$1'), { type: r.type })); }); }, Promise.resolve()).then(function () { toast(ids.length + ' duplicated', 'success'); selected = {}; render(); }); } }, ['Duplicate']));
      bulk.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { ids.forEach(function (id) { var r = M.get(id); X.download(r.blob, r.name); }); } }, ['Download']));
      bulk.appendChild(el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onclick: function () { var used = ids.filter(function (id) { return usageOf(id) > 0; }).length; UI.confirm('Delete ' + ids.length + ' image' + (ids.length === 1 ? '' : 's'), (used ? used + ' of them are used on pages and will show as missing. ' : '') + 'Delete?', 'Delete', true).then(function (ok) { if (!ok) return; Promise.all(ids.map(function (id) { return M.remove(id); })).then(function () { toast(ids.length + ' deleted', 'info'); selected = {}; render(); }); }); } }, ['Delete']));
      bulk.appendChild(el('span', { class: 'spacer' }));
      bulk.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { selected = {}; render(); } }, ['Clear selection']));
    }
    function render() {
      grid.innerHTML = '';
      var all = M.list(), items = visibleItems();
      info.textContent = items.length + (items.length !== all.length ? ' of ' + all.length : '') + ' image' + (all.length === 1 ? '' : 's') + ', ' + UI.fmtBytes(M.totalBytes()) + ' in the library.';
      if (!items.length) grid.appendChild(el('p', { class: 'empty', style: 'grid-column:1/-1', text: all.length ? 'No images match the filter.' : 'No images yet. Drop files above, or import a leeds.ac.uk page and its images arrive here automatically.' }));
      items.forEach(function (r) {
        var used = usageOf(r.id);
        var cb = el('input', { type: 'checkbox', class: 'media-item__check', 'aria-label': 'Select ' + r.name });
        cb.checked = !!selected[r.id];
        cb.addEventListener('change', function () { selected[r.id] = cb.checked; card.classList.toggle('is-selected', cb.checked); renderBulk(); });
        var card = el('div', { class: 'media-item' + (selected[r.id] ? ' is-selected' : '') }, [
          el('span', { class: 'media-item__thumb', onclick: function () { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); } }, [
            el('img', { src: M.url(r.id), alt: '' }),
            el('label', { class: 'media-item__select', onclick: function (e) { e.stopPropagation(); } }, [cb]),
            el('span', { class: 'media-item__actions', onclick: function (e) { e.stopPropagation(); } }, [
              iconBtn('link', 'Copy the reference to paste into any image field', function () { X.copyText(M.ref(r.id)).then(function () { toast('Reference copied: paste it into an image field', 'success'); }); }),
              iconBtn('download', 'Download', function () { X.download(r.blob, r.name); }),
              iconBtn('trash', 'Delete', function () { UI.confirm('Delete image', used ? 'This image is used on ' + used + ' page(s); those images will show as missing. Delete anyway?' : 'Delete "' + r.name + '"?', 'Delete', true).then(function (ok) { if (ok) M.remove(r.id).then(render); }); })
            ])
          ]),
          el('span', { class: 'media-item__name', text: r.name, title: r.name }),
          el('span', { class: 'media-item__meta', text: (r.width ? r.width + '×' + r.height + ' · ' : '') + UI.fmtBytes(r.size || 0) + ' · ' + (used ? 'used on ' + used + ' page' + (used === 1 ? '' : 's') : 'not used') })
        ]);
        grid.appendChild(card);
      });
      renderBulk();
    }
    function addFiles(files) { if (!files.length) return; toast('Adding ' + files.length + ' image' + (files.length === 1 ? '' : 's') + '…', 'info', 2000); M.addMany(files).then(function (recs) { toast(recs.length + ' added', 'success'); render(); }).catch(function (e) { toast('Upload failed: ' + e.message, 'error', 5000); }); }
    file.addEventListener('change', function () { addFiles(file.files); file.value = ''; });
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
    drop.addEventListener('drop', function (e) { e.preventDefault(); drop.classList.remove('is-over'); addFiles(e.dataTransfer.files); });
    search.addEventListener('input', render); usedSel.addEventListener('change', render);
    M.open().then(render);
    return el('div', { class: 'page-wrap' }, [
      el('div', { class: 'page-head' }, [el('div', { class: 'page-head__actions' }, [el('button', { class: 'btn', type: 'button', onclick: function () { migrateDataUrls().then(function (n) { toast(n ? n + ' embedded image' + (n === 1 ? '' : 's') + ' moved to the library' : 'No embedded images found', n ? 'success' : 'info', 4000); render(); }); } }, ['Move embedded images to library'])])]),
      drop, file,
      el('div', { class: 'filterbar' }, [search, usedSel, info, el('span', { class: 'spacer' }), el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { visibleItems().forEach(function (r) { selected[r.id] = true; }); render(); } }, ['Select all shown']), el('span', { class: 'hint-icon', title: 'Upload once, use anywhere. Every image field has a Library button, and you can drop a file straight onto an image field. Images are referenced as media:… so the project stays small. Hover an image for copy, download and delete; tick images to act on several at once.' }, ['?'])]),
      grid, bulk
    ]);
  }

  /* ================= import view ================= */
  function slugFromUrl(url, fallback) { try { var p = new URL(url).pathname.replace(/\/+$/, '').split('/').pop(); return p && !/\.(html?|php)$/i.test(p) ? p : (p ? p.replace(/\.[a-z]+$/i, '') : fallback); } catch (e) { return fallback; } }
  /* replace every occurrence of a URL inside a page structure (props, html strings) */
  function replaceUrlsDeep(obj, map) {
    var keys = Object.keys(map);
    if (!keys.length) return obj;
    function fix(s) { keys.forEach(function (u) { if (s.indexOf(u) !== -1) s = s.split(u).join(map[u]); var amp = u.replace(/&/g, '&amp;'); if (amp !== u && s.indexOf(amp) !== -1) s = s.split(amp).join(map[u]); }); return s; }
    function walk(o) {
      if (Array.isArray(o)) { o.forEach(function (v, i) { if (typeof v === 'string') o[i] = fix(v); else if (v && typeof v === 'object') walk(v); }); return; }
      if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { var v = o[k]; if (typeof v === 'string') o[k] = fix(v); else if (v && typeof v === 'object') walk(v); });
    }
    walk(obj);
    return obj;
  }
  function nameFromUrl(u) { try { return decodeURIComponent(new URL(u).pathname.split('/').pop() || 'image'); } catch (e) { return 'image'; } }
  /* bring the original images into the media library: from data URLs the grabber attached, or by fetching through the local server */
  function localiseImages(parsed, assets) {
    assets = assets || {};
    var urls = {};
    JSON.stringify(parsed).replace(/https?:\/\/[^"'\\\s)]+?\.(?:jpe?g|png|gif|webp)(?:\?[^"'\\\s)]*)?/gi, function (m) { urls[m.replace(/\\u0026|&amp;/g, '&')] = 1; return m; });
    Object.keys(assets).forEach(function (u) { urls[u] = 1; });
    var list = Object.keys(urls);
    if (!list.length) return Promise.resolve(parsed);
    var map = {}, done = 0;
    return list.reduce(function (chain, u) {
      return chain.then(function () {
        if (assets[u]) return M.addDataUrl(assets[u], nameFromUrl(u)).then(function (rec) { map[u] = M.ref(rec.id); done++; }).catch(function () {});
        if (!isHttp) return; // without the server (or grabber assets) hot-linked images stay as links
        return X.fetchAsDataUrl(u).then(function (d) { if (!d) return; return M.addDataUrl(d, nameFromUrl(u)).then(function (rec) { map[u] = M.ref(rec.id); done++; }); }).catch(function () {});
      });
    }, Promise.resolve()).then(function () { if (done) toast(done + ' original image' + (done === 1 ? '' : 's') + ' saved to the media library', 'success', 4000); return replaceUrlsDeep(parsed, map); });
  }
  function createFromParsed(r, slugBase) {
    var page = Store.createPage('blank', r.page.title, slugBase);
    page.template = r.page.template; page.settings = r.page.settings; page.hero = r.page.hero; page.blocks = r.page.blocks;
    page.blocks.forEach(function (b) { if (!b.id) b.id = Store.uid('blk'); });
    return page;
  }
  function applyChrome(siteBits) {
    var site = Store.data.site; if (!siteBits) return;
    if (siteBits.navigation) site.navigation = siteBits.navigation;
    if (siteBits.masthead && siteBits.masthead.quicklinks) site.masthead.quicklinks = siteBits.masthead.quicklinks;
    if (siteBits.localMasthead) site.localMasthead = siteBits.localMasthead;
    if (siteBits.footer) site.footer = Object.assign({}, site.footer, siteBits.footer);
    if (siteBits.globalBanner) site.globalBanner = siteBits.globalBanner;
    if (siteBits.marketingBanner) site.marketingBanner = siteBits.marketingBanner;
  }
  /* several fetched pages -> one section */
  function importBatch(batch, opts) {
    opts = opts || {};
    var parsed = batch.pages.map(function (p) { try { return { url: p.url, label: p.title, r: IMP.parsePage(p.html, { baseUrl: p.url }) }; } catch (e) { return { url: p.url, label: p.title, error: e.message }; } }).filter(function (x) { return !x.error; });
    if (!parsed.length) return Promise.reject(new Error('None of the pages could be read'));
    return parsed.reduce(function (chain, x) { return chain.then(function () { return localiseImages(x.r.page, batch.assets).then(function (p) { x.r.page = p; }); }); }, Promise.resolve()).then(function () { return importBatchSync(parsed, batch, opts); });
  }
  function importBatchSync(parsed, batch, opts) {
    var first = parsed[0].r;
    var title = batch.title || (first.page.settings.sectionNav && first.page.settings.sectionNav.title) || 'Imported section';
    var hadSide = parsed.some(function (x) { return x.r.page.settings.sectionNav && x.r.page.settings.sectionNav.enabled; });
    var hadContents = parsed.some(function (x) { return x.r.page.settings.inPageNav && x.r.page.settings.inPageNav.enabled; });
    var sec = Store.createSection(title, { navStyle: hadSide && hadContents ? 'both' : hadContents ? 'contents' : 'side', intro: (first.page.settings.sectionNav && first.page.settings.sectionNav.intro) || 'In this section', breadcrumb: (first.page.settings.breadcrumb || []).slice(0, -0) });
    var pages = parsed.map(function (x) {
      var page = createFromParsed(x.r, slugFromUrl(x.url, x.r.page.title));
      if (x.label && x.r.page.template !== 'homepage' && !(x.r.page.settings.heading && x.r.page.settings.heading.title)) page.title = x.label;
      keepOriginal(page, x.url);
      Store.addToSection(page.id, sec.id);
      return page;
    });
    if (opts.applyChrome !== false) applyChrome(first.site);
    Store.save();
    return { section: sec, pages: pages, skipped: batch.pages.length - parsed.length };
  }
  /* on the hosted site, a bookmarklet whose "Send to CMS" goes straight to this address */
  function hostedBookmarklet() {
    if (!/^https:/.test(location.protocol)) return null;
    var box = el('p', { class: 'small' });
    fetch('grabber/grabber.js').then(function (r) { return r.ok ? r.text() : null; }).then(function (code) {
      if (!code) return;
      var here = location.origin + location.pathname.replace(/index\.html$/, '');
      var href = 'javascript:' + encodeURIComponent("window.__UOL_CMS_URL='" + here.replace(/'/g, '') + "';" + code);
      box.appendChild(el('a', { class: 'btn btn--primary btn--sm', href: href, title: 'Drag to your bookmarks bar', onclick: function (e) { e.preventDefault(); toast('Drag this button to your bookmarks bar instead of clicking it', 'info', 4000); } }, ['Send to Leeds CMS (this site)']));
      box.appendChild(document.createTextNode(' For this online copy: drag the button to your bookmarks bar. Its Send to CMS button opens this site and delivers the page here.'));
    }).catch(function () {});
    return box;
  }
  function importView() {
    var url = el('input', { class: 'input', type: 'text', placeholder: 'https://www.leeds.ac.uk/…' });
    var urls = el('textarea', { class: 'input input--mono', rows: 5, placeholder: 'https://www.leeds.ac.uk/section/page-1\nhttps://www.leeds.ac.uk/section/page-2\n…' });
    var ta = el('textarea', { class: 'input input--mono input--tall', rows: 10, placeholder: 'Paste the full page source (View page source → select all → copy), any fragment of design-system HTML, or what the grabber copied.' });
    var file = el('input', { type: 'file', accept: '.html,.htm,.json,text/html,application/json' });
    var baseUrl = el('input', { class: 'input', type: 'text', placeholder: 'https://www.leeds.ac.uk/the-page (used to resolve relative image links when pasting)' });
    var chromeChk = el('input', { type: 'checkbox', checked: true });
    var status = el('div', { class: 'import-status' });
    var result = null, pendingAssets = null;

    function showResult(r) {
      result = r;
      status.innerHTML = '';
      if (!r.page) { status.appendChild(el('p', { class: 'error', text: 'Nothing could be imported.' })); return; }
      var siteBits = Object.keys(r.site || {});
      status.appendChild(el('div', { class: 'notice notice--ok' }, [
        el('strong', { text: 'Found: ' + r.page.template + ' page "' + r.page.title + '" with ' + r.page.blocks.length + ' block' + (r.page.blocks.length === 1 ? '' : 's') + (r.page.hero && r.page.hero.type !== 'none' ? ' and a ' + r.page.hero.type : '') }),
        el('div', { class: 'small', text: 'Blocks: ' + r.page.blocks.map(function (b) { return blockSpec(b).label; }).join(', ') }),
        siteBits.length ? el('div', { class: 'small', text: 'Site chrome detected: ' + siteBits.join(', ') }) : null,
        r.warnings.length ? el('details', {}, [el('summary', { text: r.warnings.length + ' note' + (r.warnings.length === 1 ? '' : 's') }), el('ul', {}, r.warnings.map(function (w) { return el('li', { class: 'small', text: w }); }))]) : null
      ]));
      var secSel = el('select', { class: 'input input--sm' }, [el('option', { value: '', text: 'No section' })].concat(Store.data.sections.map(function (s) { return el('option', { value: s.id, text: 'Add to section: ' + s.title }); })));
      status.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'btn btn--primary', type: 'button', onclick: function (e) { e.target.disabled = true; localiseImages(r.page, pendingAssets).then(function (p) { r.page = p; var page = createFromParsed(r, r.slugBase); keepOriginal(page, r.sourceUrl); if (chromeChk.checked) applyChrome(r.site); if (secSel.value) Store.addToSection(page.id, secSel.value); Store.touch(page); toast('Page imported', 'success'); go('#edit/' + page.id); }); } }, ['Create page' + (chromeChk.checked && siteBits.length ? ' and apply site chrome' : '')]),
        secSel,
        App.lastEditedPage ? el('button', { class: 'btn', type: 'button', onclick: function () { var p = Store.getPage(App.lastEditedPage); if (!p) return; r.page.blocks.forEach(function (b) { p.blocks.push(b); }); Store.touch(p); toast('Blocks appended to "' + p.title + '"', 'success'); go('#edit/' + p.id); } }, ['Append blocks to last edited page']) : null
      ]));
    }
    function showBatchResult(batch) {
      status.innerHTML = '';
      var ok = batch.pages.filter(function (p) { return p.html; });
      status.appendChild(el('div', { class: 'notice notice--ok' }, [
        el('strong', { text: 'Section "' + (batch.title || 'Imported section') + '": ' + ok.length + ' page' + (ok.length === 1 ? '' : 's') + ' ready to import' }),
        el('ul', { class: 'small' }, ok.map(function (p) { return el('li', { text: (p.title || p.url) + ' (' + Math.round((p.html || '').length / 1024) + ' KB)' }); })),
        batch.failed && batch.failed.length ? el('div', { class: 'small error', text: 'Could not fetch: ' + batch.failed.join(', ') }) : null
      ]));
      if (batch.assets && Object.keys(batch.assets).length) status.appendChild(el('p', { class: 'small muted', text: Object.keys(batch.assets).length + ' original images came with the pages and will be saved to the media library.' }));
      status.appendChild(el('div', { class: 'row' }, [el('button', { class: 'btn btn--primary', type: 'button', onclick: function (e) {
        e.target.disabled = true; toast('Importing…', 'info', 3000);
        importBatch({ title: batch.title, pages: ok, assets: batch.assets }, { applyChrome: chromeChk.checked }).then(function (res) { toast(res.pages.length + ' pages imported into section "' + res.section.title + '"' + (res.skipped ? ' (' + res.skipped + ' skipped)' : ''), 'success', 5000); go('#edit/' + res.pages[0].id); })
          .catch(function (err) { e.target.disabled = false; status.appendChild(el('p', { class: 'error', text: err.message })); });
      } }, ['Import all as one section'])]));
    }
    function fromText(text, base) {
      try {
        pendingAssets = null;
        if (/^\s*\{/.test(text)) {
          var obj = JSON.parse(text);
          if (obj.uolcms === 'import' && Array.isArray(obj.pages)) { showBatchResult(obj); return; }
          if (obj.uolcms === 'import' && typeof obj.html === 'string') { App.onGrabberImport({ kind: obj.kind, html: obj.html, url: obj.url, title: obj.title, assets: obj.assets }); return; }
          if (obj.page) { var p = obj.page; showResult({ page: { title: p.title, template: p.template, settings: p.settings, hero: p.hero, blocks: p.blocks }, site: {}, warnings: [] }); return; }
          if (obj.site && obj.pages) { beforeReplaceAll('Import a whole project').then(function (ok) { if (!ok) return; Store.importJson(text).then(function () { toast('Project imported (' + obj.pages.length + ' pages)', 'success'); go('#pages'); }); }); return; }
        }
        var r = IMP.parsePage(text, { baseUrl: base }); r.slugBase = slugFromUrl(base, r.page.title); r.sourceUrl = base || ''; showResult(r);
      } catch (e) { status.innerHTML = ''; status.appendChild(el('p', { class: 'error', text: 'Import failed: ' + e.message })); }
    }
    function fetchMany(list) {
      var results = [], failed = [], i = 0;
      status.textContent = 'Fetching…';
      function next() {
        if (i >= list.length) { showBatchResult({ title: '', url: list[0], pages: results, failed: failed }); return; }
        var u = list[i++];
        status.textContent = 'Fetching ' + i + ' of ' + list.length + ': ' + u;
        IMP.fetchUrl(u).then(function (html) { results.push({ url: u, title: '', html: html }); }, function (e) { failed.push(u + ' (' + e.message + ')'); }).then(next);
      }
      next();
    }
    App.onGrabberImport = function (msg) {
      baseUrl.value = msg.url || '';
      if (msg.kind === 'section' && msg.pages) { showBatchResult(msg); }
      else if (msg.kind === 'page') { ta.value = ''; fromText(msg.html, msg.url); pendingAssets = msg.assets || null; }
      else { ta.value = msg.html; var r = IMP.parseSection(msg.html, { baseUrl: msg.url }); showResult({ page: { title: (msg.title || 'Imported section').replace(/\s*[|–-]\s*University of Leeds.*$/i, ''), template: 'document', settings: window.UOL_PAGE_TEMPLATES.blank().settings, hero: { type: 'none' }, blocks: r.blocks }, site: {}, warnings: r.warnings, slugBase: slugFromUrl(msg.url, ''), sourceUrl: msg.url || '' }); pendingAssets = msg.assets || null; }
      if (msg.assets && Object.keys(msg.assets).length) status.appendChild(el('p', { class: 'small muted', text: Object.keys(msg.assets).length + ' original images came with the page and will be saved to the media library.' }));
      status.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Received ' + (msg.kind === 'section' ? (msg.pages || []).length + ' pages' : msg.kind === 'pick' ? 'a section' : msg.kind === 'main' ? 'page content' : 'a page') + ' from the grabber', 'success', 4000);
    };
    if (App.pendingGrab) { var pg = App.pendingGrab; App.pendingGrab = null; setTimeout(function () { App.onGrabberImport(pg); }, 50); }
    file.addEventListener('change', function () { var f = file.files[0]; if (!f) return; f.text().then(function (t) { fromText(t, baseUrl.value.trim()); }); });

    var grabber = el('div', { class: 'panel' }, [
      el('h2', { text: 'Grab pages from the browser (recommended)' }),
      el('p', { class: 'small', text: 'The grabber adds a small pane to any leeds.ac.uk page. Choose the whole page, the main content, pick one component, or a whole site section (it fetches every page linked from the section navigation) and send it here. No server needed.' }),
      el('h3', { text: 'Chrome or Edge extension' }),
      el('ol', { class: 'small' }, [el('li', { html: 'Open <code>chrome://extensions</code> (Edge: <code>edge://extensions</code>) and turn on <strong>Developer mode</strong>.' }), el('li', { html: 'Click <strong>Load unpacked</strong> and choose the <code>chrome-extension</code> folder inside the CMS folder.' }), el('li', { html: 'Keep this CMS tab open. On any leeds.ac.uk page click the red <strong>L</strong> button; pages are delivered straight to this tab.' }), isHttp ? null : el('li', { html: 'Because the CMS is opened from a file, open the extension\'s <em>Details</em> and turn on <strong>Allow access to file URLs</strong> (one-off).' })]),
      el('h3', { text: 'Bookmarklet (no install)' }),
      el('p', { class: 'small', html: 'Open <a href="grabber/bookmarklet.html" target="_blank" rel="noopener">grabber/bookmarklet.html</a> and drag the button to your bookmarks bar. On a leeds.ac.uk page click it, use <strong>Copy</strong> in the pane, then paste into the box below and click Analyse.' }),
      hostedBookmarklet()
    ]);

    return el('div', { class: 'page-wrap page-wrap--narrow' }, [
      grabber,
      el('div', { class: 'panel' }, [
        el('h2', { text: 'Paste HTML or grabber output' }),
        el('div', { class: 'field' }, [el('span', { class: 'field__label', text: 'Page source, fragment, or what the grabber copied' }), ta]),
        el('div', { class: 'field' }, [el('span', { class: 'field__label', text: 'Original page URL (optional, for relative links)' }), baseUrl]),
        el('button', { class: 'btn btn--primary', type: 'button', onclick: function () { if (!ta.value.trim()) return; fromText(ta.value, baseUrl.value.trim()); } }, ['Analyse'])
      ]),
      el('div', { class: 'panel' }, [
        el('h2', { text: 'From a file' }),
        el('p', { class: 'small muted', text: 'An .html file saved from the browser (Ctrl+S → "Webpage, HTML only"), a page JSON export, or a whole project JSON.' }),
        file
      ]),
      el('div', { class: 'panel' }, [
        el('h2', { text: 'By URL' + (isHttp ? '' : ' (needs the local server)') }),
        isHttp ? null : el('div', { class: 'notice notice--warn small' }, ['Browsers block reading other websites from a page opened as a file, so URL import only works when the CMS runs from ', el('code', { text: 'serve.ps1' }), '. Use the grabber instead; it fetches pages from inside leeds.ac.uk.']),
        el('div', { class: 'row' }, [url, el('button', { class: 'btn btn--primary', type: 'button', disabled: !isHttp, onclick: function () { var u = url.value.trim(); if (!u) return; status.textContent = 'Fetching…'; IMP.fetchUrl(u).then(function (html) { baseUrl.value = u; fromText(html, u); }).catch(function (e) { status.innerHTML = ''; status.appendChild(el('p', { class: 'error', text: e.message })); }); } }, ['Fetch one page'])]),
        el('div', { class: 'field' }, [el('span', { class: 'field__label', text: 'Several URLs, one per line (imported as one section)' }), urls]),
        el('button', { class: 'btn', type: 'button', disabled: !isHttp, onclick: function () { var list = urls.value.split(/\s+/).filter(function (u) { return /^https?:/.test(u); }); if (list.length) fetchMany(list); } }, ['Fetch all as a section'])
      ]),
      el('label', { class: 'check' }, [chromeChk, el('span', { text: 'Also apply the imported navigation, masthead and footer to this project\'s site settings' })]),
      status
    ]);
  }

  /* ================= export / project view ================= */
  function exportView() {
    var c = ctx(), pages = c.pages;
    var snapList = el('div'), snapCount = 0;
    function renderSnaps() { getSnapshots().then(showSnaps); }
    function showSnaps(snaps) {
      snapList.innerHTML = ''; snapCount = snaps.length;
      if (!snaps.length) snapList.appendChild(el('p', { class: 'muted small', text: 'No snapshots yet.' }));
      snaps.forEach(function (s) {
        snapList.appendChild(el('div', { class: 'rev' }, [el('div', {}, [el('strong', { text: s.name }), el('div', { class: 'small muted', text: fmtTime(s.at) + ' · ' + s.pages + ' pages' })]), el('div', {}, [
          el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { UI.confirm('Restore snapshot', 'Replace everything in the project with snapshot "' + s.name + '"? A snapshot of the current state is taken first.', 'Restore').then(function (ok) { return ok && beforeReplaceAll('Restore snapshot'); }).then(function (ok) { if (!ok) return; saveSnapshot('Before restoring ' + s.name).then(function () { return Store.importJson(JSON.stringify(s.data)); }).then(function () { toast('Snapshot restored', 'success'); go('#pages'); }); }); } }, ['Restore']),
          el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', 'aria-label': 'Delete snapshot ' + s.name, onclick: function () { getSnapshots().then(function (l) { return putSnapshots(l.filter(function (x) { return x.id !== s.id; })); }).then(renderSnaps); } }, ['✕'])
        ])]));
      });
    }
    renderSnaps();
    var pageRows = el('div', { class: 'table' });
    pages.forEach(function (p) {
      pageRows.appendChild(el('div', { class: 'table__row' }, [
        el('div', {}, [el('strong', { text: p.title }), el('div', { class: 'small muted', text: '/' + p.slug + ' · ' + p.template })]),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { busy('Exporting…', X.exportHtml(c, p)); } }, ['HTML']),
          el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { busy('Rendering image…', X.exportPagePng(c, p, { width: 1280 })); } }, ['PNG']),
          el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { busy('Rendering PDF…', X.exportPdf(c, p, { mode: 'single', width: 1280 })); } }, ['PDF']),
          el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { busy('Rendering PDF…', X.exportPdf(c, p, { mode: 'a4', width: 1280 })); } }, ['PDF A4']),
          el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { X.exportMarkdown(c, p); } }, ['Markdown']),
          el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { busy('Exporting…', X.exportWord(c, p)); } }, ['Word']),
          el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { X.exportPageJson(p); } }, ['JSON'])
        ])
      ]));
    });
    var folderBox = el('div', { class: 'row' });
    function renderFolder() {
      folderBox.innerHTML = '';
      if (App.folderLinked) { folderBox.appendChild(el('span', { class: 'notice notice--ok small', text: 'Linked to "' + M.folderName() + '". project.json and the media folder are updated automatically.' })); folderBox.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { unlinkFolder(); renderFolder(); } }, ['Unlink'])); }
      else folderBox.appendChild(el('button', { class: 'btn btn--primary', type: 'button', disabled: !window.showDirectoryPicker, onclick: function () { linkFolder().then(function (ok) { if (ok) renderFolder(); }); } }, ['Link a project folder']));
    }
    renderFolder();
    return el('div', { class: 'page-wrap page-wrap--narrow' }, [
      el('div', { class: 'panel' }, [
        el('h2', { text: '1. Autosave in this browser' }),
        el('p', { text: 'Every change is saved straight away. This alone does not survive a browser reset or a new computer, so also do one of the next two (or use the cloud).' }),
        storageMeter(),
        el('div', { class: 'row' }, [el('button', { class: 'btn btn--sm', type: 'button', onclick: freeSpaceDialog }, ['Free up space'])])
      ]),
      el('div', { class: 'panel' }, [
        el('h2', { text: '2. Link a project folder (safest, Edge or Chrome)' }),
        el('p', { class: 'small', text: 'Choose a folder, for example inside OneDrive. The CMS writes project.json and a media folder there automatically after every change, so your work is on disk and backed up by OneDrive. Next time, one click reconnects it.' }),
        folderBox,
        window.showDirectoryPicker ? null : el('p', { class: 'small muted', text: 'Folder linking needs Edge or Chrome.' })
      ]),
      el('div', { class: 'panel' }, [
        el('h2', { text: '3. Project files' }),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn btn--primary', type: 'button', onclick: function () { saveProjectToFile(false); } }, [App.fileHandle ? 'Save to ' + App.fileHandle.name : 'Save project to file']),
          App.fileHandle ? el('button', { class: 'btn', type: 'button', onclick: function () { saveProjectToFile(true); } }, ['Save as…']) : null,
          el('button', { class: 'btn', type: 'button', onclick: openProjectFile }, ['Open project file']),
          el('button', { class: 'btn', type: 'button', onclick: function () { busy('Preparing download…', X.exportProjectJson(Store)); } }, ['Download project JSON'])
        ]),
        el('p', { class: 'small muted', text: 'A project file contains pages, site settings, sections and images. Ctrl+Shift+S saves to the open file from anywhere in the CMS.' })
      ]),
      el('div', { class: 'panel' }, [
        el('h2', { text: 'Snapshots (whole project, kept in this browser)' }),
        el('div', { class: 'row' }, [el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: function () { UI.prompt('Save snapshot', 'Snapshot name', 'Snapshot ' + (snapCount + 1), 'Save').then(function (n) { if (n) saveSnapshot(n).then(renderSnaps); }); } }, ['Take a snapshot'])]),
        snapList
      ]),
      el('div', { class: 'panel' }, [
        el('h2', { text: 'Export pages' }),
        el('p', { class: 'small muted', text: 'HTML exports are self-contained and link to each other, so a ZIP of the whole site is a clickable prototype. PNG uses 1280px; the ⋯ menu in the editor has mobile and retina sizes, and a block\'s ⋯ menu exports one section.' }),
        pageRows,
        el('div', { class: 'row' }, [el('button', { class: 'btn btn--primary', type: 'button', onclick: function () { busy('Building ZIP…', X.exportSiteZip(c)); } }, ['Export whole site as ZIP'])])
      ]),
      changeListPanel(),
      el('div', { class: 'panel panel--danger', style: cloudMode() ? 'display:none' : null }, [
        el('h2', { text: 'Start again' }),
        el('div', { class: 'row' }, [el('button', { class: 'btn btn--danger-ghost', type: 'button', onclick: function () { UI.confirm('Reset project', 'Replace everything with the sample site? Take a snapshot or save to a file first if you want to keep your work.', 'Reset everything', true).then(function (ok) { return ok && beforeReplaceAll('Reset project'); }).then(function (ok) { if (ok) { Store.reset(); App.undo = {}; App.redo = {}; toast('Project reset', 'info'); go('#pages'); } }); } }, ['Reset to sample site'])])
      ])
    ]);
  }

  /* ================= cloud: sign in, open, share and restore shared projects ================= */
  var ROLE_TEXT = { owner: 'Owner', editor: 'Can edit', viewer: 'Can view' };
  function cloudView() {
    var C = window.UOL_CLOUD;
    var wrap = el('div', { class: 'page-wrap page-wrap--narrow cloud' });
    if (!C) return wrap;
    if (C.keyProblem() === 'secret') {
      wrap.appendChild(el('div', { class: 'panel panel--danger' }, [el('h2', { text: 'Wrong key in cloud-config.js' }), el('p', { text: 'assets/cms/cloud-config.js contains a secret (service_role) key. That key bypasses every rule in the database, so it must never be in a web page. Remove it, create a new secret key in Supabase (Project Settings, API Keys) so the old one stops working, then paste the publishable key instead.' })]));
      return wrap;
    }
    wrap.appendChild(el('div', { class: 'panel' }, [
      el('h2', { text: 'Cloud saving is not set up yet' }),
      el('p', { text: 'With cloud saving on, everyone signs in with their own account, projects are stored online, and colleagues work on them together, with their changes arriving within seconds. Until then the CMS works on one project in this browser.' }),
      el('p', { html: 'Setting it up takes about 20 minutes in the browser, with no installs: see <a href="DEPLOY.md" target="_blank" rel="noopener">DEPLOY.md</a> in the project folder, part 3. In short: create a free Supabase project, run <code>supabase/setup.sql</code> in its SQL editor, and paste the Project URL and publishable key into <code>assets/cms/cloud-config.js</code>.' })
    ]));
    return wrap;
  }

  /* ================= accounts: sign in, sign up, password ================= */
  function authField(label, input, hint) { return el('label', { class: 'field' }, [el('span', { class: 'field__label', text: label }), input, hint ? el('span', { class: 'field__hint', text: hint }) : null]); }
  function renderAuth(screen, info) {
    var C = window.UOL_CLOUD;
    if (screen) App.authScreen = screen;
    screen = App.authScreen || 'signin'; info = info || App.authInfo || {};
    App.authInfo = info;
    document.getElementById('topbar').innerHTML = '';
    var br = document.getElementById('banner-root'); if (br) br.innerHTML = '';
    var root = document.getElementById('app');
    root.innerHTML = ''; root.className = 'app app--auth';
    var back = App.authReturn && App.authReturn.error ? App.authReturn.error : '';
    var msg = el('p', { class: 'auth__msg', role: 'alert' });
    function fail(e) { msg.className = 'auth__msg auth__msg--error'; msg.textContent = e && e.message ? e.message : String(e); }
    function busy(btn, on, label) { btn.disabled = on; btn.textContent = on ? 'Please wait…' : label; }
    var card;
    if (screen === 'signup') {
      var name = el('input', { class: 'input', type: 'text', autocomplete: 'name', required: true, maxlength: '80' });
      var email = el('input', { class: 'input', type: 'email', autocomplete: 'email', required: true, value: info.email || '' });
      var pw = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, minlength: '8' });
      var go1 = el('button', { class: 'btn btn--primary btn--block', type: 'submit' }, ['Create account']);
      card = el('form', { class: 'auth__card', onsubmit: function (e) {
        e.preventDefault(); msg.textContent = '';
        if (!C.emailAllowed(email.value)) { fail('Use your ' + C.domainsText() + ' email address.'); email.focus(); return; }
        if (pw.value.length < 8) { fail('Choose a password of at least 8 characters.'); pw.focus(); return; }
        busy(go1, true, 'Create account');
        C.signUp(email.value, pw.value, name.value).then(function (r) {
          if (r.signedIn) { App.authScreen = 'signin'; document.body.classList.remove('is-auth'); signedInStart(); }
          else renderAuth('sent', { email: email.value.trim() });
        }, function (e) { busy(go1, false, 'Create account'); fail(e); });
      } }, [
        el('h1', { text: 'Create your account' }),
        el('p', { class: 'auth__lead', text: 'Use your ' + C.domainsText() + ' email address. Colleagues who share a project with you will see your name.' }),
        authField('Your name', name), authField('Email', email), authField('Password', pw, 'At least 8 characters'),
        msg, go1,
        el('p', { class: 'auth__switch' }, ['Already have an account? ', el('a', { href: '#', onclick: function (e) { e.preventDefault(); renderAuth('signin', { email: email.value }); } }, ['Sign in'])])
      ]);
      setTimeout(function () { name.focus(); }, 0);
    } else if (screen === 'forgot') {
      var femail = el('input', { class: 'input', type: 'email', autocomplete: 'email', required: true, value: info.email || '' });
      var go2 = el('button', { class: 'btn btn--primary btn--block', type: 'submit' }, ['Send the link']);
      card = el('form', { class: 'auth__card', onsubmit: function (e) {
        e.preventDefault(); busy(go2, true, 'Send the link');
        C.requestReset(femail.value).then(function () { renderAuth('reset-sent', { email: femail.value.trim() }); }, function (er) { busy(go2, false, 'Send the link'); fail(er); });
      } }, [
        el('h1', { text: 'Reset your password' }),
        el('p', { class: 'auth__lead', text: 'We will email you a link. Open it on this device to choose a new password.' }),
        authField('Email', femail), msg, go2,
        el('p', { class: 'auth__switch' }, [el('a', { href: '#', onclick: function (e) { e.preventDefault(); renderAuth('signin', { email: femail.value }); } }, ['Back to sign in'])])
      ]);
      setTimeout(function () { femail.focus(); }, 0);
    } else if (screen === 'sent' || screen === 'reset-sent') {
      var resend = el('button', { class: 'btn', type: 'button', onclick: function () {
        resend.disabled = true;
        (screen === 'sent' ? C.resendConfirmation(info.email) : C.requestReset(info.email)).then(function () { toast('Sent again', 'success'); }, fail).then(function () { setTimeout(function () { resend.disabled = false; }, 20000); });
      } }, ['Send it again']);
      card = el('div', { class: 'auth__card auth__card--center' }, [
        el('div', { class: 'auth__mail', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>' }),
        el('h1', { text: 'Check your email' }),
        el('p', { class: 'auth__lead' }, [screen === 'sent' ? 'We sent a link to ' : 'We sent a password link to ', el('strong', { text: info.email || 'your address' }), screen === 'sent' ? '. Open it to confirm your address and finish creating your account.' : '. Open it on this device to choose a new password.']),
        el('p', { class: 'small muted', text: 'Nothing there after a few minutes? Look in junk mail, or send it again.' }),
        msg, el('div', { class: 'row row--center' }, [resend, el('button', { class: 'btn', type: 'button', onclick: function () { renderAuth('signin', { email: info.email }); } }, ['Back to sign in'])])
      ]);
    } else {
      var semail = el('input', { class: 'input', type: 'email', autocomplete: 'username', required: true, value: info.email || '' });
      var spw = el('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
      var go3 = el('button', { class: 'btn btn--primary btn--block', type: 'submit' }, ['Sign in']);
      var extra = el('div');
      card = el('form', { class: 'auth__card', onsubmit: function (e) {
        e.preventDefault(); msg.textContent = ''; extra.innerHTML = ''; busy(go3, true, 'Sign in');
        C.signIn(semail.value, spw.value).then(function () { App.authReturn = null; document.body.classList.remove('is-auth'); signedInStart(); }, function (er) {
          busy(go3, false, 'Sign in'); fail(er);
          if (er.unconfirmed) extra.appendChild(el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { C.resendConfirmation(semail.value).then(function () { renderAuth('sent', { email: semail.value.trim() }); }, fail); } }, ['Send the confirmation email again']));
        });
      } }, [
        el('h1', { text: 'Sign in' }),
        el('p', { class: 'auth__lead', text: 'Welcome back. Your projects are waiting.' }),
        back ? el('p', { class: 'auth__msg auth__msg--error', text: back }) : null,
        authField('Email', semail), authField('Password', spw),
        el('p', { class: 'auth__forgot' }, [el('a', { href: '#', onclick: function (e) { e.preventDefault(); renderAuth('forgot', { email: semail.value }); } }, ['Forgot your password?'])]),
        msg, extra, go3,
        el('p', { class: 'auth__switch' }, ['New here? ', el('a', { href: '#', onclick: function (e) { e.preventDefault(); renderAuth('signup', { email: semail.value }); } }, ['Create an account'])])
      ]);
      setTimeout(function () { (semail.value ? spw : semail).focus(); }, 0);
    }
    root.appendChild(el('div', { class: 'auth' }, [
      el('section', { class: 'auth__brand', 'aria-label': 'About the Leeds prototyping CMS' }, [
        el('div', { class: 'auth__logo', 'aria-hidden': 'true', text: 'L' }),
        el('h2', { text: 'Leeds prototyping CMS' }),
        el('p', { text: 'Prototype leeds.ac.uk pages with the real design system, review them with colleagues and stakeholders, and hand a clear change list to whoever updates Jadu.' }),
        authArt(),
        el('ul', { class: 'auth__points' }, [
          el('li', { text: 'Import live pages, or build new ones from the component library' }),
          el('li', { text: 'Work on a project together, and see who is on which page' }),
          el('li', { text: 'Comments, sign-off and review links for people without an account' })
        ])
      ]),
      el('section', { class: 'auth__panel' }, [card])
    ]));
  }
  /* a small moving picture of the editor for the sign-in screen (still when reduced motion is preferred) */
  function authArt() {
    return el('div', { class: 'auth-art', 'aria-hidden': 'true' }, [
      el('div', { class: 'auth-art__bar' }, [el('i'), el('i'), el('i')]),
      el('div', { class: 'auth-art__page' }, [
        el('div', { class: 'auth-art__hero' }),
        el('div', { class: 'auth-art__block auth-art__block--a' }, [el('span'), el('span'), el('span', { class: 'short' })]),
        el('div', { class: 'auth-art__block auth-art__block--b' }, [el('b'), el('b'), el('b')]),
        el('div', { class: 'auth-art__block auth-art__block--c' }, [el('span'), el('span', { class: 'short' })]),
        el('div', { class: 'auth-art__cursor' })
      ]),
      el('div', { class: 'auth-art__avatars' }, [el('i', { text: 'SB' }), el('i', { text: 'AK' })])
    ]);
  }
  function initials(name) { var w = String(name || '?').trim().split(/[\s.@_-]+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); }
  /* the account button at the foot of the rail, with its menu */
  function accountButton() {
    var C = window.UOL_CLOUD, prof = C.cachedProfile() || {}, u = C.user() || {};
    var name = prof.name || String(u.email || '').split('@')[0];
    var menu = el('div', { class: 'menu account-menu', hidden: true }, [
      el('div', { class: 'account-menu__who' }, [el('strong', { text: name }), el('span', { class: 'small muted', text: u.email || '' })]),
      el('hr'),
      el('button', { type: 'button', class: 'menu__item', onclick: function () { menu.hidden = true; nameDialog(); } }, ['Change your name']),
      el('button', { type: 'button', class: 'menu__item', onclick: function () { menu.hidden = true; changePasswordDialog(false); } }, ['Change password']),
      el('button', { type: 'button', class: 'menu__item', onclick: function () { menu.hidden = true; startTour(false); } }, ['Watch the tour']),
      el('hr'),
      el('button', { type: 'button', class: 'menu__item', onclick: function () { menu.hidden = true; signOutNow(); } }, ['Sign out'])
    ]);
    var btn = el('button', { type: 'button', class: 'rail__avatar', title: name + ' (' + (u.email || '') + ')', 'aria-label': 'Your account: ' + name, 'aria-haspopup': 'true', onclick: function (e) { e.stopPropagation(); var open = menu.hidden; document.querySelectorAll('.menu').forEach(function (m) { m.hidden = true; }); menu.hidden = !open; } }, [initials(name)]);
    document.addEventListener('click', function () { menu.hidden = true; });
    return el('div', { class: 'rail__account' }, [btn, menu]);
  }
  function signOutNow() {
    var C = window.UOL_CLOUD;
    if (App.dirty) saveNow();
    C.signOut().then(function () { return Store.close(); }).then(function () {
      App.page = null; App.undo = {}; App.redo = {}; App.people = []; App.authScreen = 'signin'; App.authInfo = {};
      buildRail(); toast('Signed out', 'info'); location.hash = ''; route();
    });
  }
  function nameDialog() {
    var C = window.UOL_CLOUD, prof = C.cachedProfile() || {};
    UI.prompt('Your name', 'Shown to colleagues working on the same projects', prof.name || '', 'Save').then(function (n) {
      if (n === null || !n.trim()) return;
      C.setName(n.trim()).then(function () { toast('Name saved', 'success'); buildRail(); setRailActive(App.view); }, cloudError);
    });
  }
  function startTour(auto) {
    var C = window.UOL_CLOUD, T = window.UOL_TOUR; if (!T) return;
    var prof = C && C.cachedProfile();
    T.start({ name: prof ? prof.name : '', onDone: function () { if (auto && C && C.user()) C.setOnboarded(true).catch(function () {}); } });
  }

  /* ================= presence: who else is in the project, and where ================= */
  function presenceStack() { return el('div', { id: 'presence-stack', class: 'presence', 'aria-live': 'polite' }); }
  function pageTitle(id) { var p = id && Store.data && Store.getPage(id); return p ? p.title : ''; }
  function avatar(p, small) { return el('span', { class: 'avatar' + (small ? ' avatar--sm' : ''), style: 'background:' + p.colour, title: p.name + (p.page ? ' is on "' + pageTitle(p.page) + '"' : ' is in this project'), text: initials(p.name) }); }
  function renderPresence() {
    var people = (App.people || []).filter(function (p) { return !Store.data || !p.page || Store.getPage(p.page); });
    var stack = document.getElementById('presence-stack');
    if (stack) {
      stack.innerHTML = '';
      people.slice(0, 4).forEach(function (p) { stack.appendChild(avatar(p)); });
      if (people.length > 4) stack.appendChild(el('span', { class: 'avatar avatar--more', text: '+' + (people.length - 4), title: people.slice(4).map(function (p) { return p.name; }).join(', ') }));
      stack.title = people.length ? people.map(function (p) { return p.name + (p.page ? ' (' + pageTitle(p.page) + ')' : ''); }).join(', ') : '';
    }
    // the Pages table: who is on each page
    document.querySelectorAll('[data-people]').forEach(function (slot) {
      var id = slot.getAttribute('data-people'); slot.innerHTML = '';
      people.filter(function (p) { return p.page === id; }).forEach(function (p) { slot.appendChild(avatar(p, true)); });
    });
    // the editor: a note when someone else has this page open, and their selected blocks in the preview
    var here = App.view === 'edit' && App.page ? people.filter(function (p) { return p.page === App.page.id; }) : [];
    var note = document.getElementById('presence-note');
    if (note) {
      note.innerHTML = ''; note.hidden = !here.length;
      if (here.length) { here.forEach(function (p) { note.appendChild(avatar(p, true)); }); note.appendChild(el('span', { text: here.map(function (p) { return p.name; }).join(' and ') + (here.length === 1 ? ' is' : ' are') + ' on this page too. Edits to different blocks are merged.' })); }
    }
    if (here.length && App.page && App.warnedPage !== App.page.id) { App.warnedPage = App.page.id; toast(here.map(function (p) { return p.name; }).join(' and ') + (here.length === 1 ? ' is' : ' are') + ' working on this page too. Changes to different blocks are merged; if you both change the same block, the later edit is kept.', 'info', 7000); }
    if (Preview.iframe && Preview.ready && App.view === 'edit') {
      try { Preview.iframe.contentWindow.postMessage({ uolcms: 'presence', marks: here.filter(function (p) { return p.block; }).map(function (p) { return { id: p.block, name: p.name, colour: p.colour }; }) }, '*'); } catch (e) {}
    }
  }

  /* ================= projects ================= */
  function projectsView() {
    var C = window.UOL_CLOUD;
    var wrap = el('div', { class: 'page-wrap projects' });
    var grid = el('div', { class: 'pgrid' }, [el('p', { class: 'small muted', text: 'Loading your projects…' })]);
    var legacyBox = el('div');
    wrap.appendChild(el('div', { class: 'projects__head' }, [
      el('div', {}, [el('h2', { class: 'projects__title', text: 'Your projects' }), el('p', { class: 'small muted', text: 'Projects you made and the ones colleagues share with you. Everything is saved in the cloud.' })]),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn', type: 'button', onclick: newProjectFromFile }, [icon('open', 16), ' From a project file']),
        el('button', { class: 'btn btn--primary', type: 'button', onclick: newProjectDialog }, [icon('plus', 16), ' New project'])
      ])
    ]));
    wrap.appendChild(legacyBox);
    wrap.appendChild(grid);
    C.listProjects().then(function (rows) {
      rows = rows || [];
      grid.innerHTML = '';
      legacyCard(legacyBox, rows);
      if (!rows.length) {
        grid.appendChild(el('div', { class: 'pempty' }, [
          el('div', { class: 'pempty__art', 'aria-hidden': 'true' }, [icon('projects', 40)]),
          el('h3', { text: 'No projects yet' }),
          el('p', { text: 'Start a new project, bring one in from a project file, or ask a colleague to share theirs with ' + ((C.user() || {}).email || 'you') + '.' }),
          el('button', { class: 'btn btn--primary', type: 'button', onclick: newProjectDialog }, [icon('plus', 16), ' New project'])
        ]));
        return;
      }
      var cur = C.link();
      rows.forEach(function (r) { grid.appendChild(projectCard(r, cur && cur.projectId === r.id)); });
    }, function (e) { grid.innerHTML = ''; grid.appendChild(el('p', { class: 'error small', text: 'Could not load your projects: ' + e.message })); });
    return wrap;
  }
  function projectCard(r, isOpen) {
    var C = window.UOL_CLOUD, owner = r.role === 'owner';
    var open = function () { if (isOpen) { go('#pages'); return; } openCloud(r.id, r.role, r.name).then(function () { go('#pages'); }, function () {}); };
    var items = [{ label: isOpen ? 'Go to its pages' : 'Open', onClick: open }];
    if (owner) {
      items.push({ label: 'Share…', onClick: function () { shareDialog(r.id, r.name); } });
      items.push({ label: 'Rename…', onClick: function () { UI.prompt('Rename project', 'Name', r.name, 'Rename').then(function (n) { if (!n || !n.trim()) return; (isOpen ? C.rename(n.trim()) : C.renameProject(r.id, r.version, n.trim())).then(function (row) { if (!row) throw new Error('Someone changed the project just now; try again'); toast('Renamed', 'success'); route(); }).catch(cloudError); }); } });
      items.push('-');
      items.push({ label: 'Delete…', onClick: function () { UI.confirm('Delete project', 'Delete "' + r.name + '" for everyone, with its pages, images, comments and review links? This cannot be undone.', 'Delete', true).then(function (ok) { if (ok) C.deleteProject(r.id).then(function () { toast('Deleted', 'info'); buildRail(); route(); }, cloudError); }); } });
    } else {
      items.push('-');
      items.push({ label: 'Leave this project…', onClick: function () { UI.confirm('Leave project', 'Stop working on "' + r.name + '"? ' + r.owner_name + ' can share it with you again.', 'Leave', true).then(function (ok) { if (ok) C.leave(r.id).then(function () { toast('You left "' + r.name + '"', 'info'); buildRail(); route(); }, cloudError); }); } });
    }
    var sub = [owner ? 'Yours' : 'Shared by ' + (r.owner_name || r.owner_email), (r.page_count || 0) + ' page' + (r.page_count === 1 ? '' : 's'), (r.member_count || 1) + (r.member_count === 1 ? ' person' : ' people')].join(' · ');
    return el('div', { class: 'pcard' + (isOpen ? ' is-open' : '') }, [
      el('button', { type: 'button', class: 'pcard__main', onclick: open }, [
        el('span', { class: 'pcard__icon', style: 'background:' + window.UOL_CLOUD.presence.colour(r.id), 'aria-hidden': 'true', text: initials(r.name) }),
        el('span', { class: 'pcard__text' }, [
          el('strong', { class: 'pcard__name', text: r.name }),
          el('span', { class: 'small muted', text: sub }),
          el('span', { class: 'small muted', text: 'Updated ' + fmtTime(r.updated_at) + (r.updated_by_name ? ' by ' + r.updated_by_name : '') })
        ])
      ]),
      el('div', { class: 'pcard__side' }, [
        isOpen ? el('span', { class: 'status status--published', text: 'Open' }) : el('span', { class: 'status status--' + (r.role === 'viewer' ? 'draft' : 'published'), text: ROLE_TEXT[r.role] || r.role }),
        menuButton(null, items, { icon: 'more', title: 'More for this project' })
      ])
    ]);
  }
  function newProjectDialog() {
    var C = window.UOL_CLOUD;
    var name = el('input', { class: 'input', type: 'text', value: 'New prototype', 'aria-label': 'Project name' });
    var blank = el('input', { type: 'radio', name: 'np-start', value: 'blank', checked: true }), ex = el('input', { type: 'radio', name: 'np-start', value: 'examples' });
    var msg = el('p', { class: 'small error', role: 'alert' });
    UI.modal({ title: 'New project', body: el('div', {}, [
      authField('Name', name),
      el('div', { class: 'field' }, [el('span', { class: 'field__label', text: 'Start with' }),
        el('label', { class: 'choice' }, [blank, el('span', {}, [el('strong', { text: 'An empty project' }), el('span', { class: 'small muted', text: 'The Leeds site settings and no pages. Import pages or add your own.' })])]),
        el('label', { class: 'choice' }, [ex, el('span', {}, [el('strong', { text: 'Example pages' }), el('span', { class: 'small muted', text: 'A homepage, document pages and an article to try things on.' })])])
      ]),
      el('p', { class: 'small muted', text: 'Only you can see it until you share it.' }), msg
    ]), buttons: [{ label: 'Cancel' }, { label: 'Create project', primary: true, onClick: function (api) {
      var n = name.value.trim(); if (!n) { name.focus(); return false; }
      msg.textContent = '';
      C.createProject(n, Store.seed(blank.checked)).then(function () { if (api && api.close) api.close(); App.data = Store.data; App.undo = {}; App.redo = {}; buildRail(); toast('"' + n + '" is ready', 'success'); go('#pages'); }, function (e) { msg.textContent = e.message; });
      return false;
    } }] });
    setTimeout(function () { name.select(); }, 30);
  }
  /* a project file (from Save to file, or from before accounts) becomes a new cloud project */
  function newProjectFromFile() {
    var C = window.UOL_CLOUD;
    var input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', function () {
      var f = input.files[0]; if (!f) return;
      f.text().then(function (t) {
        var obj = JSON.parse(t);
        if (!obj.site || !Array.isArray(obj.pages)) throw new Error('This is not a Leeds CMS project file');
        var name = (obj.site && obj.site.name ? obj.site.name : f.name.replace(/\.json$/i, '')) || 'Imported project';
        return UI.prompt('New project from a file', 'Name', name, 'Create project').then(function (n) {
          if (!n || !n.trim()) return;
          toast('Creating "' + n.trim() + '" and uploading ' + obj.pages.length + ' pages…', 'info', 4000);
          var imgs = Array.isArray(obj.media) && obj.media.length ? M.importRecords(obj.media) : Promise.resolve(0);
          return imgs.then(function () { return C.createProject(n.trim(), { site: obj.site, pages: obj.pages, sections: obj.sections || [] }); }).then(function () {
            App.data = Store.data; App.undo = {}; App.redo = {}; afterProjectOpen(); buildRail(); toast('"' + n.trim() + '" is ready', 'success'); go('#pages');
          });
        });
      }).catch(function (e) { toast('Could not use that file: ' + e.message, 'error', 6000); });
    });
    input.click();
  }
  /* work left in this browser by the CMS before accounts: offer to make it a project */
  function legacyCard(box, rows) {
    var C = window.UOL_CLOUD, d = Store.legacy(); box.innerHTML = '';
    if (!d || Store.isSeed(d)) return;
    var old = C.legacyLink();
    if (old && rows.some(function (r) { return r.id === old.projectId; })) {
      box.appendChild(el('div', { class: 'notice notice--info legacy' }, ['This browser has work from before accounts that belongs to ', el('strong', { text: old.name || 'one of your projects' }), '. It is brought in when you open that project.']));
      return;
    }
    var name = (d.site && d.site.name) || 'Leeds prototype';
    box.appendChild(el('div', { class: 'panel legacy' }, [
      el('h3', { text: 'Work from before accounts' }),
      el('p', { class: 'small' }, ['This browser has a project with ', el('strong', { text: d.pages.length + ' page' + (d.pages.length === 1 ? '' : 's') }), ' that is not in your account yet. Make it a project to keep working on it and share it.']),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', onclick: function () {
          this.disabled = true; toast('Uploading…', 'info', 3000);
          C.createProject(name, d).then(function () { Store.legacyDone(); C.forgetLegacyLink(); App.data = Store.data; afterProjectOpen(); buildRail(); toast('"' + name + '" is now a project in your account', 'success', 5000); go('#pages'); }, function (e) { cloudError(e); route(); });
        } }, ['Make it a project']),
        el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { X.download(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), version: 2, site: d.site, pages: d.pages, sections: d.sections || [] }, null, 2)], { type: 'application/json' }), 'leeds-cms-project.json'); } }, ['Download as a file']),
        el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onclick: function () { UI.confirm('Not now', 'Hide this? The work stays in this browser; you can still bring it in with "From a project file" after downloading it.', 'Hide').then(function (ok) { if (ok) { Store.legacyDone(); box.innerHTML = ''; } }); } }, ['Hide'])
      ])
    ]));
  }

  /* ================= sharing: people, review links, emails, earlier copies, deleted pages ================= */
  function cloudStatusText() {
    var C = window.UOL_CLOUD, s = C && C.state(); if (!s || !s.link) return '';
    var bits = [ROLE_TEXT[s.link.role] || s.link.role];
    if (s.status.message) bits.push(s.status.message);
    if (s.link.lastSync) bits.push('last checked ' + fmtTime(s.link.lastSync));
    if (s.live) bits.push('live updates on');
    return bits.join(' · ');
  }
  function cloudError(e) { toast(e && e.message ? e.message : String(e), 'error', 7000); }
  function sharingView() {
    var C = window.UOL_CLOUD, l = C.link();
    var wrap = el('div', { class: 'page-wrap page-wrap--narrow cloud' });
    if (!l) return wrap;
    var owner = l.role === 'owner';
    wrap.appendChild(el('div', { class: 'panel panel--cloud' }, [
      el('h2', {}, [el('span', { class: 'cloud-name', text: l.name })]),
      el('p', { id: 'cloud-current-status', class: 'small muted', text: cloudStatusText() }),
      el('p', { class: 'small', text: l.role === 'viewer' ? 'You can view this project. Changes you make are not saved to it.' : 'Every change is saved to the cloud a few seconds after you make it, and colleagues\' changes arrive within seconds. This browser keeps a copy, so the project opens straight away and you can keep working if the connection drops.' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { toast('Checking…', 'info', 1500); C.pull(true).then(function () { return C.canEdit() ? C.push() : null; }).then(function () { route(); }); } }, ['Check now']),
        owner ? el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { UI.prompt('Rename project', 'Name', l.name, 'Rename').then(function (n) { if (n && n.trim()) C.rename(n.trim()).then(function () { route(); }, cloudError); }); } }, ['Rename']) : null,
        el('button', { class: 'btn btn--sm', type: 'button', onclick: historyDialog }, ['Earlier copies of the settings'])
      ])
    ]));
    wrap.appendChild(el('div', { class: 'panel' }, [el('h2', { text: 'People' }), peoplePanel(l.projectId, owner)]));
    if (C.canEdit()) wrap.appendChild(reviewLinksPanel());
    wrap.appendChild(notifyPanel());
    wrap.appendChild(deletedPagesPanel());
    return wrap;
  }
  /* who is on a project, invitations waiting for an account, and (for the owner) adding people */
  function peoplePanel(projectId, owner) {
    var C = window.UOL_CLOUD, list = el('div', { class: 'cloud-members' }), msg = el('p', { class: 'small', role: 'alert' });
    function load() {
      C.members(projectId).then(function (rows) {
        list.innerHTML = '';
        (rows || []).forEach(function (m) {
          var meRow = m.user_id && C.user() && m.user_id === C.user().id;
          list.appendChild(el('div', { class: 'rev' }, [
            el('div', { class: 'member' }, [
              el('span', { class: 'avatar avatar--sm', style: 'background:' + (m.pending ? '#9a9590' : C.presence.colour(m.user_id)), text: initials(m.name || m.email) }),
              el('div', {}, [el('strong', { text: m.pending ? m.email : (m.name || m.email) + (meRow ? ' (you)' : '') }), el('div', { class: 'small muted', text: m.pending ? 'Invited · ' + (ROLE_TEXT[m.role] || m.role) + ' · joins when they create an account' : m.email + ' · ' + (ROLE_TEXT[m.role] || m.role) })])
            ]),
            owner && m.role !== 'owner' ? el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onclick: function () { (m.pending ? C.cancelInvite(projectId, m.email) : C.unshare(projectId, m.user_id)).then(load, function (e) { msg.className = 'small error'; msg.textContent = e.message; }); } }, [m.pending ? 'Cancel invitation' : 'Remove']) : null
          ]));
        });
      }, function (e) { msg.className = 'small error'; msg.textContent = e.message; });
    }
    load();
    var box = el('div', {}, [list]);
    if (owner) {
      var email = el('input', { class: 'input', type: 'email', placeholder: 'colleague@leeds.ac.uk', 'aria-label': 'Colleague\'s email' });
      var role = el('select', { class: 'input input--sm', 'aria-label': 'Access' }, [el('option', { value: 'editor', text: 'Can edit' }), el('option', { value: 'viewer', text: 'Can view' })]);
      var add = function () {
        msg.className = 'small'; msg.textContent = '';
        var addr = email.value.trim(); if (!addr) { email.focus(); return; }
        C.share(projectId, addr, role.value).then(function (r) { toast(r === 'invited' ? addr + ' is invited. They join when they create an account with that address.' : 'Shared with ' + addr, 'success', 6000); email.value = ''; load(); }, function (e) { msg.className = 'small error'; msg.textContent = e.message; });
      };
      email.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
      box.appendChild(el('div', { class: 'field', style: 'margin-top:14px' }, [el('span', { class: 'field__label', text: 'Add someone' }), el('div', { class: 'row' }, [email, role, el('button', { class: 'btn btn--primary', type: 'button', onclick: add }, ['Share'])])]));
      box.appendChild(el('p', { class: 'small muted', text: 'Colleagues without an account are invited: they join as soon as they create one with that address.' }));
    } else {
      box.appendChild(el('div', { class: 'row', style: 'margin-top:10px' }, [el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onclick: function () { var l = C.link(); UI.confirm('Leave project', 'Stop working on this project? The owner can share it with you again.', 'Leave', true).then(function (ok) { if (ok) C.leave(projectId).then(function () { toast('You left "' + (l ? l.name : 'the project') + '"', 'info'); buildRail(); go('#projects'); }, cloudError); }); } }, ['Leave this project'])]));
    }
    box.appendChild(msg);
    return box;
  }
  /* each person's email choices for this project; only shown once notifications are set up in Supabase */
  function notifyPanel() {
    var C = window.UOL_CLOUD, box = el('div', {}, [el('p', { class: 'small muted', text: 'Loading…' })]);
    C.notify.prefs().then(function (p) {
      box.innerHTML = '';
      if (!p.available) { box.appendChild(el('p', { class: 'small muted', text: 'Email notifications are not set up for this site yet. Whoever looks after the Supabase project can switch them on (DEPLOY.md, part 7).' })); return; }
      var so = el('input', { type: 'checkbox', checked: !!p.signoff }), cm = el('input', { type: 'checkbox', checked: !!p.comments });
      function save() { C.notify.set(so.checked, cm.checked).then(function () { toast('Email choices saved', 'success', 1500); }, cloudError); }
      so.addEventListener('change', save); cm.addEventListener('change', save);
      box.appendChild(el('label', { class: 'check' }, [so, el('span', { text: 'Email me when a page is sent for review, approved or sent back' })]));
      box.appendChild(el('label', { class: 'check' }, [cm, el('span', { text: 'Email me about new comments, including comments from review links' })]));
      box.appendChild(el('p', { class: 'small muted', text: 'For this project only. Nobody is emailed about their own actions.' }));
    }, function (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'small error', text: e.message })); });
    return el('div', { class: 'panel' }, [el('h2', { text: 'Email notifications' }), box]);
  }
  /* pages deleted by anyone on the project, to bring back */
  function deletedPagesPanel() {
    var C = window.UOL_CLOUD, l = C.link(), box = el('div', {}, [el('p', { class: 'small muted', text: 'Loading…' })]);
    function load() {
      C.deletedPages().then(function (rows) {
        box.innerHTML = '';
        if (!rows || !rows.length) { box.appendChild(el('p', { class: 'small muted', text: 'No deleted pages.' })); return; }
        rows.forEach(function (r) {
          box.appendChild(el('div', { class: 'rev' }, [
            el('div', {}, [el('strong', { text: r.title || 'Untitled page' }), el('div', { class: 'small muted', text: '/' + (r.slug || '') + ' · deleted ' + fmtTime(r.deleted_at) + (r.deleted_by_name ? ' by ' + r.deleted_by_name : '') })]),
            el('div', {}, [
              C.canEdit() ? el('button', { class: 'btn btn--sm', type: 'button', onclick: function () { C.restoreDeleted(r.id).then(function () { toast('"' + (r.title || 'Page') + '" is back', 'success'); load(); }, cloudError); } }, ['Restore']) : null,
              l.role === 'owner' ? el('button', { class: 'btn btn--sm btn--danger-ghost', type: 'button', onclick: function () { UI.confirm('Remove for good', 'Remove "' + (r.title || 'this page') + '" for good, with its comments, sign-off and earlier copies? This cannot be undone.', 'Remove', true).then(function (ok) { if (ok) C.purgePage(r.id).then(function () { toast('Removed', 'info'); load(); }, cloudError); }); } }, ['Remove for good']) : null
            ])
          ]));
        });
      }, function (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'small error', text: e.message })); });
    }
    load();
    return el('div', { class: 'panel', id: 'deleted-pages' }, [el('h2', { text: 'Recently deleted pages' }), el('p', { class: 'small muted', text: 'Deleting a page only hides it. Anyone who can edit can bring it back here.' }), box]);
  }
  function shareDialog(projectId, name) {
    UI.modal({ title: 'Share "' + name + '"', body: peoplePanel(projectId, true), buttons: [{ label: 'Done', primary: true }] });
  }
  function historyDialog() {
    var C = window.UOL_CLOUD, l = C.link(); if (!l) return;
    var box = el('div', {}, [el('p', { class: 'small muted', text: 'Loading…' })]);
    var m = UI.modal({ title: 'Earlier copies of "' + l.name + '"', body: el('div', {}, [el('p', { class: 'small', text: 'The cloud keeps a copy of the site settings and sections at most once an hour while they change (the last 48). Each page has its own hourly copies, on its Page tab under Versions. Copies marked "whole project" were made before pages were saved separately and put every page back too.' }), box]), buttons: [{ label: 'Close' }] });
    C.history(l.projectId).then(function (rows) {
      box.innerHTML = '';
      if (!rows || !rows.length) { box.appendChild(el('p', { class: 'small muted', text: 'No earlier copies yet. The first is made an hour after the settings first change.' })); return; }
      rows.forEach(function (h) {
        box.appendChild(el('div', { class: 'rev' }, [
          el('div', {}, [el('strong', { text: fmtTime(h.saved_at) }), el('div', { class: 'small muted', text: (h.whole_project ? 'Whole project · ' : 'Settings and sections · ') + 'version ' + h.version + (h.saved_by_name ? ' · by ' + h.saved_by_name : '') })]),
          C.canEdit() ? el('button', { class: 'btn btn--sm', type: 'button', onclick: function () {
            UI.confirm('Restore earlier copy', 'Put back the ' + (h.whole_project ? 'whole project' : 'site settings and sections') + ' from ' + fmtTime(h.saved_at) + ', for everyone? A snapshot of this browser\'s copy is taken first.', 'Restore').then(function (ok) {
              if (!ok) return;
              m.close();
              saveSnapshot('Before restoring the cloud copy from ' + fmtTime(h.saved_at)).then(function () { return C.restoreHistory(h.id); }).then(function () { App.undo = {}; App.redo = {}; App.page = null; toast('Restored the copy from ' + fmtTime(h.saved_at), 'success'); go('#pages'); }, cloudError);
            });
          } }, ['Restore']) : null
        ]));
      });
    }, function (e) { box.innerHTML = ''; box.appendChild(el('p', { class: 'error small', text: e.message })); });
  }
  function changePasswordDialog(recovery) {
    var C = window.UOL_CLOUD;
    var a = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: '8', 'aria-label': 'New password' });
    var b = el('input', { class: 'input', type: 'password', autocomplete: 'new-password', 'aria-label': 'New password again' });
    var msg = el('p', { class: 'small error', role: 'alert' });
    UI.modal({ title: recovery ? 'Choose a new password' : 'Change password', body: el('div', {}, [
      recovery ? el('p', { class: 'small', text: 'You are signed in from the link in your email. Choose a new password for next time.' }) : null,
      el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'New password (at least 8 characters)' }), a]),
      el('label', { class: 'field' }, [el('span', { class: 'field__label', text: 'New password again' }), b]),
      msg
    ]), buttons: [{ label: recovery ? 'Later' : 'Cancel' }, { label: 'Save password', primary: true, onClick: function (api) {
      if (a.value.length < 8) { msg.textContent = 'Use at least 8 characters.'; return false; }
      if (a.value !== b.value) { msg.textContent = 'The two passwords are different.'; return false; }
      C.changePassword(a.value).then(function () { toast('Password saved', 'success'); if (api && api.close) api.close(); }, function (e) { msg.textContent = e.message; });
      return false;
    } }] });
    setTimeout(function () { a.focus(); }, 30);
  }

  /* ================= help ================= */
  function helpView() {
    return el('div', { class: 'page-wrap page-wrap--narrow help' }, [
      window.UOL_TOUR ? el('div', { class: 'panel help-tour' }, [
        el('div', {}, [el('h2', { text: 'New here, or need a refresher?' }), el('p', { class: 'small muted', text: 'A two-minute tour of projects, importing, editing, review and working together.' })]),
        el('button', { class: 'btn btn--primary', type: 'button', onclick: function () { startTour(false); } }, ['Watch the tour'])
      ]) : null,
      el('div', { class: 'panel', html:
        '<h2>What this is</h2><p>A prototyping CMS that renders pages with the real University of Leeds design system (v1.0.22) stylesheet and scripts, so prototypes look and behave exactly like leeds.ac.uk. It runs in your browser with nothing to install. With cloud saving set up, projects are stored in the University\'s Supabase project and shared with colleagues; without it, everything stays in this browser.</p>' +
        '<h2>Opening it</h2><p>Double-click <code>index.html</code>. That is all. (A local server, <code>serve.ps1</code>, is optional and only adds "import by URL"; the grabber extension covers that without a server.)</p>' +
        '<h2>Finding your way around</h2><p>The icons down the left edge switch between Pages, Media, Import, Save &amp; export, Cloud, Settings and Help (hover for the name). <strong>Settings</strong> holds the screens you need less often: Site (masthead, navigation, banners and footer), Theme (colours, fonts and custom CSS) and Components (every block with the current theme, and the component library for each kind of page). The bar across the top shows the current screen with its actions; in the editor it holds the page title, path, template and status, undo and redo, the preview width icons, the Preview / HTML switch, the save state dot, <strong>Open page</strong> and a <strong>&#8943;</strong> menu with versions, every export format, duplicate and delete.</p>' +
        '<h2>Editing</h2><ul><li><strong>Click</strong> a block in the preview to select it; a toolbar appears on its top edge with the block\'s name, move up/down, duplicate, delete and <strong>Add below</strong>. Drag the dotted handle at its left to move the block.</li><li><strong>Component libraries</strong>: each kind of page has its own. Homepages take the widgets and everything else; document pages take what the Jadu rich text editor offers. The inserter shows the page\'s library (<strong>Show them</strong> lists the rest), and Check page flags blocks from outside it. Change a library on Settings, Components.</li><li><strong>Hover</strong> a block in the preview and a red <strong>+</strong> appears on a dashed line below it (above it when you hover its top edge): click it to insert a block there. The red <strong>+</strong> in the top bar inserts below the selected block, or at the end. The inserter has search, category chips and your recently used blocks; Enter inserts the first match.</li><li><strong>Double-click text</strong> in the preview to edit it in place. Enter or clicking away saves; Esc cancels.</li><li><strong>Ctrl+click</strong> a link in the preview to follow it.</li><li>The <strong>HTML</strong> switch in the top bar shows the design-system markup of the page or the selected block, with Copy for Jadu.</li><li>The panel on the right is the <strong>inspector</strong>. <strong>Block</strong> lists the page\'s blocks (the outline) until you select one, then shows that block\'s fields; <strong>Page</strong> holds the heading, breadcrumb, banner, side column and versions; <strong>Section</strong> shows where the page sits, lets you step between the pages of its section, reorder them and change the generated navigation.</li><li><strong>Sections</strong> group pages: the side menu, contents list and previous/next links are generated from the pages in a section.</li><li><kbd>Esc</kbd> returns from a block to the outline.</li></ul>' +
        '<h2>Images</h2><p>Every image field has <strong>Library</strong>, <strong>Upload</strong> and placeholder buttons, and accepts a dropped file. The rich text toolbar has an Image button too. Images live in the Media library (browser database, and your project folder when linked), not inside the page, so the project stays small.</p>' +
        '<h2>Saving</h2><p>Autosave is always on. Each project you open is kept in this browser\'s database, which has room for large projects, so pages open straight away and you can keep working through a dropped connection. With accounts, every change is also saved to the cloud a few seconds later. Save &amp; export shows what a project takes; <strong>Free up space</strong> removes older page versions or the originals of finished pages.</p><p>Autosave is always on. For safety, <strong>link a project folder</strong> (Save &amp; export): project.json and images are written there after every change. You can also save <strong>versions</strong> of a page (Ctrl+S), take whole-project <strong>snapshots</strong>, and <strong>save a project file</strong> (Ctrl+Shift+S).</p>' +
        '<h2>Accounts, projects and sharing</h2><p>With cloud saving set up (see <code>DEPLOY.md</code>), everyone signs in with their own account; create one with your University email address. <strong>Projects</strong> lists your projects and the ones shared with you: start a new one, bring one in from a project file, or open one to work on it. The account button at the foot of the left-hand bar changes your name or password, replays the tour and signs you out.</p><p><strong>Sharing</strong> lists who is on the project. The owner adds people as editors or viewers; colleagues without an account are invited and join when they sign up. Each page is saved on its own a few seconds after a change, and colleagues\' changes arrive within seconds. If two people edit the same page, changes to different blocks are merged; only when both change the same block is the later edit kept, and the other person is told. The cloud keeps hourly copies of every page (Page tab, Versions) and of the site settings (Sharing). Deleted pages can be brought back from <strong>Recently deleted</strong> on the Pages screen.</p><p><strong>Working together</strong>: the initials of colleagues in the project show in the top bar, next to the pages they have open, and on the block they picked in the preview. When someone else has your page open, the editor says so.</p>' +
        '<h2>Review and sign-off</h2><ul><li><strong>Changes</strong> in the editor\'s top bar lists everything changed since the original leeds.ac.uk page: blocks added, removed, edited and moved, with the text differences marked. Imported pages keep an untouched copy of the original for this; for other pages, fetch the live page or use the page as it is now. <strong>Word</strong> and <strong>PDF</strong> turn it into a change list for whoever edits the page in Jadu. Save &amp; export has change lists for every page.</li><li>The <strong>Review</strong> tab in the inspector checks the page (alt text, heading levels, link text, links to missing pages and other websites), shows the sign-off status and holds comments. Click a block in the preview while on the Review tab to comment on that block.</li><li><strong>Sign-off</strong>: <strong>Send for review</strong> marks the page as in review, so anyone the project is shared with can approve it or request changes. In the same step it makes a review link for reviewers without an account, or updates the page\'s existing links so they show the latest version. Each step records who and when, and the tab says if the page was edited after it was approved. Sign-off and comments are saved in the cloud.</li><li><strong>Review links</strong> give reviewers without an account a read-only copy of a page, a section or the whole project. Each page\'s Review tab lists the links that include it and says when one shows an older version; <strong>Update</strong> fixes that and keeps the link. Make one with Send for review, <strong>New review link</strong> on the Review tab, the editor &#8943; menu or the Cloud screen, which lists every link. Reviewers can comment with their name, on the page or on a part they pick; their comments appear on the Review tab. If you tick it when making the link, reviewers can also approve or ask for changes, with their name and role; that is recorded in the sign-off history like the team\'s. Switch comments and approvals for a link on or off in its &#8943; menu.</li><li><strong>Jadu checklist</strong>: in Changes, whoever updates Jadu ticks each change off as it is made. Progress shows in the bar and on the Pages screen; a change edited again after it was ticked is marked so. Change lists in Word and PDF have tick boxes.</li><li><strong>Live updates</strong>: with the cloud, comments, sign-off, ticks and colleagues\' saves arrive within seconds. <strong>Email notifications</strong> are optional (DEPLOY.md, part 7); choose yours on the Cloud screen.</li></ul>' +
        '<h2>Keyboard shortcuts</h2><ul><li><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd> undo / redo (outside text fields)</li><li><kbd>/</kbd> open the block inserter (outside text fields)</li><li><kbd>Ctrl</kbd>+<kbd>K</kbd> insert a link while editing rich text</li><li><kbd>Ctrl</kbd>+<kbd>S</kbd> save a version of the page</li><li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> save the project to file</li><li><kbd>Esc</kbd> close dialogs / cancel in-place editing</li></ul>' +
        '<h2>Linking pages</h2><p>Give links the path of another page in this project (for example <code>/about</code>) and they navigate between pages in the viewer and in HTML exports.</p>' +
        '<h2>Fonts</h2><p>Freight fonts load from Adobe Fonts when you are online; otherwise the design system fallback fonts are used.</p>'
      })
    ]);
  }

  /* ================= boot ================= */
  function boot() {
    App.lastSaved = new Date();
    document.head.appendChild(el('style', { text: RV.css }));
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (!Store.data) return;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveProjectToFile(false); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (App.page) saveVersion(); else saveProjectToFile(false); return; }
      if (typing) return;
      if (e.key === '/' && App.view === 'edit' && App.page && !document.getElementById('modal-root').children.length) { e.preventDefault(); addBlockDialog({}); return; }
      if (e.key === 'Escape') { var openMenus = document.querySelectorAll('.menu:not([hidden])'); if (openMenus.length) { openMenus.forEach(function (m) { m.hidden = true; }); return; } }
      if (e.key === 'Escape' && App.page && App.selectedBlock && !document.getElementById('modal-root').children.length) { selectBlock(null); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    });
    // clicking anywhere in the CMS finishes an in-place edit that is open in the preview
    document.addEventListener('mousedown', function () { if (Preview.iframe && Preview.ready) Preview.iframe.contentWindow.postMessage({ uolcms: 'commitInline' }, '*'); }, true);
    window.addEventListener('hashchange', function () { if (App.page) App.lastEditedPage = App.page.id; route(); });
    window.addEventListener('beforeunload', function () { if (App.dirty) saveNow(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') { if (App.dirty) saveNow(); Store.flush(); } });
    Store.onError = function () { updateSaveStatus(); showBanner('warn', ['The latest change could not be saved in this browser. Free up space, then keep editing.'], [{ label: 'Free up space', primary: true, onClick: freeSpaceDialog }]); };
    setupCloud();
    var C = window.UOL_CLOUD;
    M.open().then(function () {
      Store.quota();
      if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(function (p) { if (!p) navigator.storage.persist(); }).catch(function () {});
      return migrateSnapshots();
    }).then(function () {
      if (C && C.configured()) return startCloud();
      return startLocal();
    }).catch(function (e) { App.mode = App.mode || 'local'; toast('Could not start: ' + (e && e.message || e), 'error', 9000); route(); });
  }
  /* without cloud saving: one project, kept in this browser (and a linked folder or project file) */
  function startLocal() {
    App.mode = 'local';
    buildRail();
    return Store.openLocal().then(function () {
      App.data = Store.data;
      afterProjectOpen();
      return reconnectFolder();
    }).then(function (connected) {
      route(); updateSaveStatus();
      if (!connected) backupReminder();
    });
  }
  /* with cloud saving: sign in first, then the project worked on last time (or the Projects screen) */
  function startCloud() {
    var C = window.UOL_CLOUD;
    App.mode = 'cloud';
    return C.consumeRedirect().then(function (back) {
      App.authReturn = back;
      buildRail();
      C.loadDomains();
      if (!C.user()) { route(); return; }
      return signedInStart();
    });
  }
  function signedInStart() {
    var C = window.UOL_CLOUD, back = App.authReturn; App.authReturn = null;
    buildRail();
    return C.profile().catch(function () { return null; }).then(function (prof) {
      buildRail();
      if (back && back.type === 'recovery') setTimeout(function () { changePasswordDialog(true); }, 300);
      else if (back && back.type === 'signup') toast('Email confirmed. Welcome!', 'success', 4000);
      var deep = /^#open\//.test(location.hash), last = C.lastProject();
      var opened = !deep && last && last.projectId ? openCloud(last.projectId, last.role, last.name, true).catch(function () { return false; }) : Promise.resolve(false);
      return opened.then(function (ok) {
        if (!ok && !deep && location.hash !== '#projects') go('#projects'); else route();
        if (prof && !prof.onboarded) setTimeout(function () { startTour(true); }, 600);
      });
    });
  }
  /* things to tidy in a project when it opens */
  function afterProjectOpen() {
    var dupes = migrateSideColumnDupes();
    if (dupes) toast('Removed ' + dupes + ' duplicated side-column item' + (dupes === 1 ? '' : 's') + ' left by an earlier import', 'success', 6000);
    migrateDataUrls().then(function (n) { if (n) toast(n + ' embedded image' + (n === 1 ? '' : 's') + ' moved out of the page content into the Media library', 'success', 6000); });
  }
  /* open a cloud project in this browser. quiet: no toasts (used when carrying on from last time) */
  function openCloud(id, role, name, quiet) {
    var C = window.UOL_CLOUD;
    if (App.dirty) saveNow();
    App.undo = {}; App.redo = {}; App.page = null; App.review = null; App.reviewSummary = {}; App.jadu = null;
    if (!quiet) toast('Opening "' + (name || 'project') + '"…', 'info', 2000);
    return C.openProject(id, role, name).then(function (r) {
      App.data = Store.data;
      afterProjectOpen(); buildRail();
      if (r && r.tookOver) toast('The work this browser kept from before accounts is now part of "' + (name || 'the project') + '"', 'success', 6000);
      return true;
    }, function (e) { if (!quiet) cloudError(e); throw e; });
  }
  /* links in emails: #open/<project>/<page> */
  function openFromLink(projectId, pageId) {
    var C = window.UOL_CLOUD, l = C.link();
    var then = function () { go(pageId && Store.getPage(pageId) ? '#edit/' + pageId : '#pages'); };
    if (l && l.projectId === projectId && Store.data) { then(); return; }
    C.listProjects().then(function (rows) {
      var r = (rows || []).filter(function (x) { return x.id === projectId; })[0];
      if (!r) { toast('That project is not shared with you, or no longer exists', 'warn', 6000); go('#projects'); return; }
      return openCloud(r.id, r.role, r.name).then(then);
    }).catch(function (e) { cloudError(e); go('#projects'); });
  }
  /* how the editor reacts to the cloud: status in the top bar, colleagues' changes, images arriving, who is where */
  function setupCloud() {
    var C = window.UOL_CLOUD; if (!C) return;
    C.on(function () { var s = document.getElementById('cloud-current-status'); if (s) s.textContent = cloudStatusText(); });
    C.setHooks({
      onStatus: function () { renderCloudChip(); var s = document.getElementById('cloud-current-status'); if (s) s.textContent = cloudStatusText(); },
      onSignedOut: function () { if (cloudMode()) { Store.close(); buildRail(); toast('You have been signed out. Sign in again to carry on; your changes are kept in this browser.', 'warn', 8000); route(); } },
      onApplied: function (info) {
        if (info.lost) { toast(info.message, 'warn', 9000); Store.close(); buildRail(); go('#projects'); return; }
        if (info.conflicts && info.conflicts.length) toast('A colleague changed ' + info.conflicts.slice(0, 3).join(', ') + (info.conflicts.length > 3 ? ' and more' : '') + ' at the same time as you. The most recent edit was kept; hourly copies can bring the other back.', 'warn', 10000);
        var v = App.view;
        if (v === 'edit' && App.page) {
          var id = App.page.id;
          if ((info.removed || []).indexOf(id) !== -1) { toast('A colleague deleted this page. It can be restored from Recently deleted on the Pages screen.', 'warn', 8000); go('#pages'); return; }
          if ((info.pages || []).indexOf(id) !== -1) {
            // their changes go straight into the open page; what you are typing is kept (it was merged)
            App.page = Store.getPage(id); Preview.page = App.page;
            delete App.undo[id]; delete App.redo[id]; recordBaseline();
            if (App.selectedBlock && !findBlock(App.selectedBlock)) App.selectedBlock = null;
            renderEditorSide(); syncTopFields(); reloadPreview(true);
          } else if (info.site || info.sections || (info.added || []).length) reloadPreview(true);
          renderSwitcher();
        } else if (v === 'pages' || v === 'sharing' || ((v === 'site' || v === 'theme' || v === 'library') && info.site)) route();
      },
      /* a colleague commented, signed off or ticked a Jadu change: refresh just that */
      onLive: function (info) {
        if (info.mine) return;
        App.reviewSummaryAt = 0;
        if (App.view === 'edit' && App.page && (!info.pageId || info.pageId === App.page.id)) { if (info.kind === 'jadu') loadJadu(true); else loadReview(true); }
        else if (App.view === 'pages') fillSignoffChips(document.getElementById('app'));
      },
      onMedia: function () {
        if (App.view === 'edit' || App.view === 'site' || App.view === 'theme') reloadPreview(true);
        else if (App.view === 'media') route();
      },
      onPresence: function (people) { App.people = people; renderPresence(); }
    });
  }
  document.addEventListener('DOMContentLoaded', boot);
  window.UOL_APP = App;
})();
