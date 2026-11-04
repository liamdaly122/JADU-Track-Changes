/* Leeds prototyping CMS - media library
   Images are stored once in IndexedDB (much larger quota than localStorage) and referenced from content as
   "media:<id>". The renderer swaps those references for object URLs in previews and for data URLs in exports. */
(function () {
  'use strict';

  var DB_NAME = 'leeds-cms-media', STORE = 'media', KV = 'kv', VERSION = 2;
  var db = null, cache = {}, urls = {}, ready = null;

  function open() {
    if (ready) return ready;
    ready = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { resolve(null); return; }
      var req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function () { var d = req.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }); if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV); };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { resolve(null); };
    }).then(function () { return loadAll(); });
    return ready;
  }
  function tx(mode) { return db.transaction(STORE, mode).objectStore(STORE); }
  function loadAll() {
    if (!db) return Promise.resolve([]);
    return new Promise(function (resolve) {
      var req = tx('readonly').getAll();
      req.onsuccess = function () {
        (req.result || []).forEach(function (r) { cache[r.id] = r; if (!urls[r.id]) urls[r.id] = URL.createObjectURL(r.blob); });
        resolve(req.result || []);
      };
      req.onerror = function () { resolve([]); };
    });
  }
  function uid() { return 'm' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }

  /* resize large images on the way in; keeps PNG for png/gif/svg-less transparency, JPEG otherwise */
  function prepare(file, maxSide) {
    maxSide = maxSide || 1600;
    if (file.type === 'image/svg+xml' || file.type === 'image/gif') return Promise.resolve({ blob: file, width: 0, height: 0 });
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var src = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, maxSide / Math.max(w, h));
        if (scale === 1 && file.size < 900 * 1024) { URL.revokeObjectURL(src); resolve({ blob: file, width: w, height: h }); return; }
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var c = document.createElement('canvas'); c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(img, 0, 0, cw, ch);
        var type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        c.toBlob(function (b) { URL.revokeObjectURL(src); resolve({ blob: b || file, width: cw, height: ch }); }, type, 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(src); reject(new Error('Not an image file')); };
      img.src = src;
    });
  }

  /* ---------- optional project folder on disk (File System Access API) ----------
     When a folder is linked, every image is also written to <folder>/media/<id>__<name> and the project file to
     <folder>/project.json, so nothing depends on browser storage surviving. */
  var folder = null, folderMedia = null;
  function extOf(type, name) { var m = /\.[a-z0-9]+$/i.exec(name || ''); if (m) return m[0].toLowerCase(); return type === 'image/png' ? '.png' : type === 'image/gif' ? '.gif' : type === 'image/svg+xml' ? '.svg' : type === 'image/webp' ? '.webp' : '.jpg'; }
  function safeFile(name) { return String(name || 'image').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'image'; }
  function setFolder(handle) {
    folder = handle || null; folderMedia = null;
    if (!folder) return Promise.resolve(null);
    return folder.getDirectoryHandle('media', { create: true }).then(function (h) { folderMedia = h; return h; }).catch(function () { folderMedia = null; return null; });
  }
  function writeFile(dir, name, blob) {
    return dir.getFileHandle(name, { create: true }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(blob).then(function () { return w.close(); }); });
  }
  function writeToFolder(rec) {
    if (!folderMedia) return Promise.resolve(false);
    var name = rec.id + '__' + safeFile(rec.name.replace(/\.[a-z0-9]+$/i, '')) + extOf(rec.type, rec.name);
    return writeFile(folderMedia, name, rec.blob).then(function () { rec.file = name; return true; }).catch(function () { return false; });
  }
  /* bring in images that exist in the folder but not in this browser (for example on a new machine) */
  function syncFromFolder() {
    if (!folderMedia || !db) return Promise.resolve(0);
    var added = 0, jobs = [];
    return (async function () {
      for await (var entry of folderMedia.values()) {
        if (entry.kind !== 'file') continue;
        var m = /^(m[a-z0-9]+)__(.+)$/.exec(entry.name);
        if (!m || cache[m[1]]) continue;
        jobs.push(entry.getFile().then(function (f) {
          var rec = { id: m[1], name: f.name.replace(/^m[a-z0-9]+__/, ''), type: f.type, size: f.size, width: 0, height: 0, blob: f, addedAt: new Date(f.lastModified).toISOString(), file: f.name };
          return new Promise(function (resolve) { var req = tx('readwrite').put(rec); req.onsuccess = function () { cache[rec.id] = rec; urls[rec.id] = URL.createObjectURL(rec.blob); added++; resolve(); }; req.onerror = function () { resolve(); }; });
        }));
      }
      await Promise.all(jobs);
      return added;
    })().catch(function () { return added; });
  }
  function writeProjectFile(json) {
    if (!folder) return Promise.resolve(false);
    return writeFile(folder, 'project.json', new Blob([json], { type: 'application/json' })).then(function () { return true; }).catch(function () { return false; });
  }
  function readProjectFile() {
    if (!folder) return Promise.resolve(null);
    return folder.getFileHandle('project.json').then(function (fh) { return fh.getFile(); }).then(function (f) { return f.text(); }).catch(function () { return null; });
  }

  function add(file) {
    return open().then(function () {
      if (!db) throw new Error('IndexedDB is not available in this browser');
      return prepare(file).then(function (p) {
        var rec = { id: uid(), name: file.name || 'image', type: p.blob.type || file.type, size: p.blob.size, width: p.width, height: p.height, blob: p.blob, addedAt: new Date().toISOString() };
        return new Promise(function (resolve, reject) {
          var req = tx('readwrite').put(rec);
          req.onsuccess = function () { cache[rec.id] = rec; urls[rec.id] = URL.createObjectURL(rec.blob); resolve(rec); };
          req.onerror = function () { reject(req.error || new Error('Could not store image')); };
        }).then(function (r) { return writeToFolder(r).then(function () { return r; }); });
      });
    });
  }
  /* convert an image embedded as a data URL into a library record */
  function addDataUrl(dataUrl, name) {
    return fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
      var f = new File([blob], name || ('image' + extOf(blob.type, '')), { type: blob.type });
      return add(f);
    });
  }
  function addMany(files) { return Promise.all(Array.prototype.map.call(files, add)); }
  function remove(id) {
    return open().then(function () {
      var rec = cache[id];
      var disk = rec && rec.file && folderMedia ? folderMedia.removeEntry(rec.file).catch(function () {}) : Promise.resolve();
      return disk.then(function () {
        return new Promise(function (resolve) {
          if (!db) { resolve(); return; }
          var req = tx('readwrite').delete(id);
          req.onsuccess = req.onerror = function () { if (urls[id]) URL.revokeObjectURL(urls[id]); delete urls[id]; delete cache[id]; resolve(); };
        });
      });
    });
  }
  function list() { return Object.keys(cache).map(function (k) { return cache[k]; }).sort(function (a, b) { return (b.addedAt || '').localeCompare(a.addedAt || ''); }); }
  function get(id) { return cache[id] || null; }
  function url(id) { return urls[id] || ''; }
  function isRef(v) { return typeof v === 'string' && v.indexOf('media:') === 0; }
  function ref(id) { return 'media:' + id; }
  function idOf(v) { return isRef(v) ? v.slice(6) : null; }

  /* resolve a single src value for display */
  function resolve(v) { var id = idOf(v); return id ? (url(id) || '') : v; }

  var REF_RE = /media:(m[a-z0-9]+)/g;
  /* swap media refs in rendered HTML for object URLs (sync, for previews) */
  function replace(html) { return String(html).replace(REF_RE, function (m, id) { return url(id) || 'assets/ds/img/placeholder-uol-icon.svg'; }); }
  /* swap media refs for data URLs (async, for standalone exports) */
  function toDataUrl(id) {
    var rec = cache[id];
    if (!rec) return Promise.resolve('');
    if (rec._data) return Promise.resolve(rec._data);
    return new Promise(function (resolve) { var r = new FileReader(); r.onload = function () { rec._data = r.result; resolve(r.result); }; r.onerror = function () { resolve(''); }; r.readAsDataURL(rec.blob); });
  }
  function inline(html) {
    var ids = {}; String(html).replace(REF_RE, function (m, id) { ids[id] = 1; return m; });
    return Promise.all(Object.keys(ids).map(function (id) { return toDataUrl(id).then(function (d) { return [id, d]; }); })).then(function (pairs) {
      var map = {}; pairs.forEach(function (p) { map[p[0]] = p[1]; });
      return String(html).replace(REF_RE, function (m, id) { return map[id] || ''; });
    });
  }
  /* ids referenced anywhere in a JSON-able structure */
  function refsIn(obj) { var ids = {}; JSON.stringify(obj).replace(REF_RE, function (m, id) { ids[id] = 1; return m; }); return Object.keys(ids); }

  /* project file support: media as data URLs */
  function exportRecords(onlyIds) {
    var recs = list().filter(function (r) { return !onlyIds || onlyIds.indexOf(r.id) !== -1; });
    return Promise.all(recs.map(function (r) { return toDataUrl(r.id).then(function (d) { return { id: r.id, name: r.name, type: r.type, width: r.width, height: r.height, data: d }; }); }));
  }
  function importRecords(records) {
    return open().then(function () {
      if (!db || !records || !records.length) return 0;
      return Promise.all(records.map(function (r) {
        if (cache[r.id] || !r.data) return null;
        return fetch(r.data).then(function (res) { return res.blob(); }).then(function (blob) {
          var rec = { id: r.id, name: r.name, type: r.type || blob.type, size: blob.size, width: r.width || 0, height: r.height || 0, blob: blob, addedAt: new Date().toISOString() };
          return new Promise(function (resolve) { var req = tx('readwrite').put(rec); req.onsuccess = function () { cache[rec.id] = rec; urls[rec.id] = URL.createObjectURL(rec.blob); resolve(1); }; req.onerror = function () { resolve(0); }; });
        }).catch(function () { return 0; });
      })).then(function (r) { return r.filter(Boolean).length; });
    });
  }
  /* store a blob under a known id (used when images arrive from the cloud) */
  function putBlob(meta, blob) {
    return open().then(function () {
      if (!db || !blob) return null;
      if (cache[meta.id]) return cache[meta.id];
      var rec = { id: meta.id, name: meta.name || 'image', type: meta.type || blob.type, size: blob.size, width: meta.width || 0, height: meta.height || 0, blob: blob, addedAt: meta.addedAt || new Date().toISOString() };
      return new Promise(function (resolve) {
        var req = tx('readwrite').put(rec);
        req.onsuccess = function () { cache[rec.id] = rec; urls[rec.id] = URL.createObjectURL(rec.blob); writeToFolder(rec).then(function () { resolve(rec); }); };
        req.onerror = function () { resolve(null); };
      });
    });
  }
  function totalBytes() { return list().reduce(function (s, r) { return s + (r.size || 0); }, 0); }

  /* small key/value store (used to remember the linked project file handle between sessions) */
  function kvGet(key) {
    return open().then(function () {
      if (!db) return null;
      return new Promise(function (resolve) { var req = db.transaction(KV, 'readonly').objectStore(KV).get(key); req.onsuccess = function () { resolve(req.result === undefined ? null : req.result); }; req.onerror = function () { resolve(null); }; });
    });
  }
  function kvSet(key, value) {
    return open().then(function () {
      if (!db) return false;
      return new Promise(function (resolve) { var req = value === null ? db.transaction(KV, 'readwrite').objectStore(KV).delete(key) : db.transaction(KV, 'readwrite').objectStore(KV).put(value, key); req.onsuccess = function () { resolve(true); }; req.onerror = function () { resolve(false); }; });
    });
  }

  window.UOL_MEDIA = {
    kvGet: kvGet, kvSet: kvSet,
    setFolder: setFolder, hasFolder: function () { return !!folder; }, folderName: function () { return folder ? folder.name : ''; }, syncFromFolder: syncFromFolder, writeProjectFile: writeProjectFile, readProjectFile: readProjectFile,
    addDataUrl: addDataUrl, open: open, add: add, addMany: addMany, remove: remove, list: list, get: get, url: url, ref: ref, isRef: isRef, idOf: idOf, resolve: resolve, replace: replace, inline: inline, refsIn: refsIn, exportRecords: exportRecords, importRecords: importRecords, putBlob: putBlob, totalBytes: totalBytes };
})();
