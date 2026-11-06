/* Leeds prototyping CMS - data store
   The open project (site, pages and sections) is held in memory and written to the browser's database (IndexedDB)
   after every change, one entry per project: "local" when cloud saving is not set up, otherwise one per cloud
   project and person. The database has far more room than the 5 MB of localStorage the CMS used before; work
   left there by older versions is picked up once (legacy()). Images live in the same database (media.js).
   Project files carry everything, including images, as one JSON document. */
(function () {
  'use strict';

  var KEY = 'leeds-cms:v1';                 // where older versions kept the project (localStorage)
  var MOVED_KEY = 'leeds-cms:v1-moved';      // set once that copy has been taken over
  var PRESETS_KEY = 'leeds-cms:theme-presets';
  var OPEN_KEY = 'leeds-cms:open-project';   // which project the CMS has open, for view.html
  function M() { return window.UOL_MEDIA; }
  // tells other tabs (the page viewer) that the open project was saved
  var channel = null; try { channel = window.BroadcastChannel ? new BroadcastChannel('leeds-cms') : null; } catch (e) { channel = null; }

  function uid(prefix) { return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function slugify(text) {
    return String(text || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
  }
  function now() { return new Date().toISOString(); }

  function valid(d) { return !!(d && d.site && Array.isArray(d.pages)); }

  var Store = {
    data: null,
    key: null,          // which project is open: 'local', or '<user id>:<cloud project id>'
    writing: null, dirty: false, lastError: null,

    /* open a project from the browser's database; resolves true if this browser had a copy */
    open: function (key) {
      var self = this;
      return M().open().then(function () { return M().kvGet('project:' + key); }).then(function (d) {
        if (!valid(d)) return false;
        self.key = key; self.data = d; self.migrate(); self.remember();
        return true;
      });
    },
    /* make data the open project, under key, and write it */
    remember: function () { try { if (this.key) localStorage.setItem(OPEN_KEY, this.key); } catch (e) {} },
    openKey: function () { try { return localStorage.getItem(OPEN_KEY); } catch (e) { return null; } },
    use: function (key, data) {
      this.key = key; this.remember();
      this.data = valid(data) ? data : { site: (data && data.site) || {}, pages: (data && data.pages) || [], sections: (data && data.sections) || [] };
      this.migrate();
      this.save();
      return this.data;
    },
    close: function () { var f = this.flush(); this.key = null; this.data = null; return f; },
    /* the starting content: the example site and pages, or (blank) just the site settings */
    seed: function (blank) {
      var d = window.UOL_SEED ? deepClone(window.UOL_SEED()) : { site: {}, pages: [], sections: [] };
      if (blank) { d.pages = []; d.sections = []; }
      return d;
    },
    /* the project older versions kept in localStorage, if there is one and it has not been taken over yet */
    legacy: function () {
      try {
        if (localStorage.getItem(MOVED_KEY)) return null;
        var raw = localStorage.getItem(KEY); if (!raw) return null;
        var d = JSON.parse(raw); return valid(d) ? d : null;
      } catch (e) { return null; }
    },
    /* mark the old copy as taken over; it stays in localStorage for now, as a fallback */
    legacyDone: function () { try { localStorage.setItem(MOVED_KEY, now()); } catch (e) {} },
    /* true when data is just the untouched example content */
    isSeed: function (d) {
      if (!window.UOL_SEED || !d) return false;
      var s = window.UOL_SEED();
      var titles = function (x) { return (x.pages || []).map(function (p) { return p.title + '|' + (p.blocks || []).length; }).join(','); };
      return titles(s) === titles(d) && (d.pages || []).every(function (p) { return !(p.revisions && p.revisions.length) && !p.source; });
    },
    /* local mode (no cloud): the browser's own project, taking over the old localStorage copy the first time */
    openLocal: function () {
      var self = this;
      return this.open('local').then(function (found) {
        if (found) return self.data;
        var old = self.legacy();
        self.use('local', old || self.seed(false));
        if (old) self.legacyDone();
        return self.flush().then(function () { return self.data; });
      });
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

    /* write the open project. The write starts straight away; saves made while one is running are combined into
       one more write when it finishes, so the database always ends up with the latest state. */
    save: function () {
      if (!this.key || !this.data) return false;
      this.dirty = true;
      if (!this.writing) this.write();
      if (this.onSave) { try { this.onSave(); } catch (e) { /* cloud sync must never break local saving */ } }
      return true;
    },
    write: function () {
      var self = this, key = 'project:' + this.key;
      this.dirty = false;
      // IndexedDB copies the value when put() is called, so later edits do not leak into this write
      this.writing = M().open().then(function () { return M().kvSet(key, self.data); }).then(function (ok) {
        self.lastError = ok ? null : new Error('Could not save in this browser\'s database');
        if (!ok && self.onError) { try { self.onError(self.lastError); } catch (e) {} }
        if (ok && channel) { try { channel.postMessage({ saved: key.slice(8) }); } catch (e) {} }
      }).then(function () {
        self.writing = null;
        if (self.dirty && self.key) return self.write();
      });
      return this.writing;
    },
    /* resolves once everything saved so far is in the database */
    flush: function () { return this.writing ? this.writing.then(function () {}) : Promise.resolve(); },
    /* a project kept in this browser that is not open (for example a cloud project's copy) */
    cached: function (key) { return M().open().then(function () { return M().kvGet('project:' + key); }).then(function (d) { return valid(d) ? d : null; }); },
    forget: function (key) { return M().open().then(function () { return M().kvSet('project:' + key, null); }); },
    onSave: null, onError: null,

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

    /* ---------- storage guard ----------
       The project lives in the browser's database, which can use a large share of the disk (the browser decides;
       quota() asks it). This reports what takes the room in the open project. */
    LIMIT: 500 * 1024 * 1024,
    quota: function () {
      var self = this;
      if (!(navigator.storage && navigator.storage.estimate)) return Promise.resolve(null);
      return navigator.storage.estimate().then(function (e) { if (e && e.quota) self.LIMIT = e.quota; return e; }).catch(function () { return null; });
    },
    storageReport: function () {
      var r = { versions: 0, originals: 0, content: 0, other: 0, total: 0, limit: this.LIMIT, pages: [] };
      try { r.total = JSON.stringify(this.data).length; } catch (e) {}
      (this.data.pages || []).forEach(function (p) {
        var v = p.revisions && p.revisions.length ? JSON.stringify(p.revisions).length : 0;
        var o = p.source && p.source.original ? JSON.stringify(p.source.original).length : 0;
        r.versions += v; r.originals += o;
        r.pages.push({ id: p.id, title: p.title, versions: v, versionCount: (p.revisions || []).length, original: o });
      });
      r.content = Math.max(0, r.total - r.versions - r.originals);
      r.share = r.total / r.limit;
      r.level = r.share >= 0.9 ? 'danger' : r.share >= 0.7 ? 'warn' : 'ok';
      return r;
    },
    /* keep only the newest n saved versions of every page; returns how many were removed */
    trimVersions: function (n) {
      var removed = 0;
      this.data.pages.forEach(function (p) { if (p.revisions && p.revisions.length > n) { removed += p.revisions.length - n; p.revisions.length = n; } });
      if (removed) this.save();
      return removed;
    },

    /* ---------- helpers ---------- */
    uid: uid, clone: deepClone, slugify: slugify, valid: valid,
    storageUsage: function () { try { return JSON.stringify(this.data || {}).length; } catch (e) { return 0; } }
  };

  window.UOL_STORE = Store;
})();
