/* Leeds prototyping CMS - data store
   Site, pages and sections live in localStorage under one key (autosaved on every change). Images live in
   IndexedDB (media.js). Project files carry everything, including images, as one JSON document. */
(function () {
  'use strict';

  var KEY = 'leeds-cms:v1';
  var PRESETS_KEY = 'leeds-cms:theme-presets';

  function uid(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function slugify(text) {
    return String(text || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
  }
  function now() { return new Date().toISOString(); }

  var Store = {
    data: null,

    load: function () {
      var raw = null;
      try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
      if (raw) { try { this.data = JSON.parse(raw); } catch (e) { this.data = null; } }
      if (!this.data || !this.data.site || !Array.isArray(this.data.pages)) {
        this.data = window.UOL_SEED ? deepClone(window.UOL_SEED()) : { site: {}, pages: [], sections: [] };
        this.save();
      }
      this.migrate();
      return this.data;
    },

    migrate: function () {
      var site = this.data.site;
      if (!site.theme) site.theme = { tokens: {}, customCss: '', loadTypekit: true };
      if (!site.theme.tokens) site.theme.tokens = {};
      if (!Array.isArray(this.data.sections)) this.data.sections = [];
      var ids = {};
      this.data.pages.forEach(function (p) {
        if (!p.settings) p.settings = {};
        if (!p.hero) p.hero = { type: 'none' };
        if (!p.blocks) p.blocks = [];
        if (!p.revisions) p.revisions = [];
        ids[p.id] = 1;
      });
      this.data.sections.forEach(function (s) { s.pages = (s.pages || []).filter(function (id) { return ids[id]; }); });
    },

    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); this.lastError = null; }
      catch (e) { this.lastError = e; return false; }
      if (this.onSave) { try { this.onSave(); } catch (e) { /* cloud sync must never break local saving */ } }
      return true;
    },
    onSave: null,

    reset: function () { this.data = deepClone(window.UOL_SEED()); this.save(); },

    /* ---------- project JSON ---------- */
    exportJson: function () {
      return JSON.stringify({ exportedAt: now(), version: 2, site: this.data.site, pages: this.data.pages, sections: this.data.sections }, null, 2);
    },
    /* full project including images (async) */
    exportProject: function () {
      var self = this;
      var media = window.UOL_MEDIA;
      if (!media) return Promise.resolve(this.exportJson());
      var used = media.refsIn({ site: this.data.site, pages: this.data.pages });
      return media.exportRecords(used).then(function (records) {
        return JSON.stringify({ exportedAt: now(), version: 2, site: self.data.site, pages: self.data.pages, sections: self.data.sections, media: records }, null, 2);
      });
    },
    importJson: function (text) {
      var obj = JSON.parse(text);
      if (!obj.site || !Array.isArray(obj.pages)) throw new Error('Not a Leeds CMS project file');
      this.data = { site: obj.site, pages: obj.pages, sections: Array.isArray(obj.sections) ? obj.sections : [] };
      this.migrate();
      this.save();
      if (window.UOL_MEDIA && Array.isArray(obj.media) && obj.media.length) return window.UOL_MEDIA.importRecords(obj.media);
      return Promise.resolve(0);
    },

    /* ---------- pages ---------- */
    getPage: function (id) { for (var i = 0; i < this.data.pages.length; i++) if (this.data.pages[i].id === id) return this.data.pages[i]; return null; },
    getPageBySlug: function (slug) {
      slug = String(slug || '').replace(/^\/+|\/+$/g, '');
      for (var i = 0; i < this.data.pages.length; i++) if (String(this.data.pages[i].slug).replace(/^\/+|\/+$/g, '') === slug) return this.data.pages[i];
      return null;
    },
    uniqueSlug: function (base, ignoreId) {
      var slug = slugify(base), candidate = slug, n = 2, self = this;
      function taken(s) { return self.data.pages.some(function (p) { return p.slug === s && p.id !== ignoreId; }); }
      while (taken(candidate)) candidate = slug + '-' + (n++);
      return candidate;
    },
    createPage: function (template, title, slugBase) {
      var page = window.UOL_PAGE_TEMPLATES && window.UOL_PAGE_TEMPLATES[template]
        ? deepClone(window.UOL_PAGE_TEMPLATES[template](title))
        : { template: template, title: title, settings: {}, hero: { type: 'none' }, blocks: [] };
      page.id = uid('page');
      page.title = title || page.title;
      page.slug = this.uniqueSlug(slugBase || page.title);
      page.status = 'draft';
      page.createdAt = now(); page.updatedAt = now();
      page.revisions = [];
      page.blocks.forEach(function (b) { if (!b.id) b.id = uid('blk'); });
      this.data.pages.push(page);
      this.save();
      return page;
    },
    duplicatePage: function (id) {
      var src = this.getPage(id); if (!src) return null;
      var copy = deepClone(src);
      copy.id = uid('page'); copy.title = src.title + ' (copy)'; copy.slug = this.uniqueSlug(copy.title); copy.status = 'draft';
      copy.createdAt = now(); copy.updatedAt = now(); copy.revisions = [];
      copy.blocks.forEach(function (b) { b.id = uid('blk'); });
      this.data.pages.push(copy);
      var sec = this.sectionOf(id);
      if (sec) sec.pages.splice(sec.pages.indexOf(id) + 1, 0, copy.id);
      this.save();
      return copy;
    },
    deletePage: function (id) {
      this.data.pages = this.data.pages.filter(function (p) { return p.id !== id; });
      this.data.sections.forEach(function (s) { s.pages = s.pages.filter(function (x) { return x !== id; }); });
      this.save();
    },
    touch: function (page) { page.updatedAt = now(); this.save(); },

    /* ---------- sections (groups of pages that share navigation) ---------- */
    getSection: function (id) { return this.data.sections.filter(function (s) { return s.id === id; })[0] || null; },
    sectionOf: function (pageId) { return this.data.sections.filter(function (s) { return (s.pages || []).indexOf(pageId) !== -1; })[0] || null; },
    createSection: function (title, opts) {
      var s = Object.assign({ id: uid('sec'), title: title || 'New section', intro: 'In this section', contentsTitle: 'Contents', navStyle: 'side', pageNav: true, breadcrumb: [], pages: [], createdAt: now() }, opts || {});
      this.data.sections.push(s);
      this.save();
      return s;
    },
    deleteSection: function (id) { this.data.sections = this.data.sections.filter(function (s) { return s.id !== id; }); this.save(); },
    addToSection: function (pageId, sectionId, index) {
      var self = this;
      this.data.sections.forEach(function (s) { s.pages = s.pages.filter(function (x) { return x !== pageId; }); });
      var sec = this.getSection(sectionId);
      if (!sec) return;
      if (index === undefined || index < 0 || index > sec.pages.length) sec.pages.push(pageId); else sec.pages.splice(index, 0, pageId);
      self.save();
    },
    removeFromSection: function (pageId) { this.data.sections.forEach(function (s) { s.pages = s.pages.filter(function (x) { return x !== pageId; }); }); this.save(); },
    sectionPages: function (sectionId) {
      var sec = this.getSection(sectionId); if (!sec) return [];
      var self = this;
      return sec.pages.map(function (id) { return self.getPage(id); }).filter(Boolean);
    },
    ungroupedPages: function () {
      var grouped = {};
      this.data.sections.forEach(function (s) { s.pages.forEach(function (id) { grouped[id] = 1; }); });
      return this.data.pages.filter(function (p) { return !grouped[p.id]; });
    },

    /* ---------- page versions ---------- */
    snapshot: function (page, label) {
      var snap = { id: uid('rev'), at: now(), label: label || '', data: deepClone({ title: page.title, settings: page.settings, hero: page.hero, blocks: page.blocks, template: page.template }) };
      page.revisions = page.revisions || [];
      page.revisions.unshift(snap);
      if (page.revisions.length > 15) page.revisions.length = 15;
      this.save();
      return snap;
    },
    restore: function (page, revId) {
      var rev = (page.revisions || []).filter(function (r) { return r.id === revId; })[0];
      if (!rev) return false;
      var d = deepClone(rev.data);
      page.title = d.title; page.settings = d.settings; page.hero = d.hero; page.blocks = d.blocks; page.template = d.template;
      this.touch(page);
      return true;
    },

    /* ---------- theme presets ---------- */
    getPresets: function () { try { return JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); } catch (e) { return []; } },
    savePreset: function (name, theme) {
      var list = this.getPresets().filter(function (p) { return p.name !== name; });
      list.unshift({ name: name, at: now(), theme: deepClone(theme) });
      localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
      return list;
    },
    deletePreset: function (name) {
      var list = this.getPresets().filter(function (p) { return p.name !== name; });
      localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
      return list;
    },

    /* ---------- helpers ---------- */
    uid: uid, clone: deepClone, slugify: slugify,
    storageUsage: function () {
      var total = 0;
      try { for (var k in localStorage) if (Object.prototype.hasOwnProperty.call(localStorage, k)) total += (localStorage.getItem(k) || '').length * 2; } catch (e) {}
      return total;
    }
  };

  window.UOL_STORE = Store;
})();
