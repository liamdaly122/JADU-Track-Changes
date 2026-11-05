/* Leeds prototyping CMS - optional cloud saving and sharing (Supabase)
   The browser copy stays the working copy, exactly as before. When a cloud project is open in this browser, every
   local save is also pushed to Supabase a moment later, and colleagues' saves are pulled in every minute.
   Two people editing at once: each page, section and the site settings are merged separately against the last
   synced copy, so changes to different pages never overwrite each other. If both changed the same page, the more
   recent edit wins and the other person sees a notice.
   Talks to Supabase's HTTP APIs with fetch, so no library or build step is needed and it works from file:// too. */
(function () {
  'use strict';

  var Store = window.UOL_STORE, M = window.UOL_MEDIA;
  var SESSION_KEY = 'leeds-cms:cloud-session', LINK_KEY = 'leeds-cms:cloud-link', BUCKET = 'cms-media';

  function cfg() { return window.UOL_CLOUD_CONFIG || {}; }
  function base() { return String(cfg().url || '').trim().replace(/\/+$/, ''); }
  function key() { return String(cfg().anonKey || '').trim(); }
  function readJson(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeJson(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* the publishable/anon key is meant to be public; a secret or service_role key must never be in a web page */
  function keyProblem() {
    var k = key();
    if (!k) return 'missing';
    if (/^sb_secret_/i.test(k)) return 'secret';
    if (/^eyJ/.test(k)) { try { var p = JSON.parse(atob(k.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); if (p.role === 'service_role') return 'secret'; } catch (e) {} }
    return '';
  }
  function configured() { return !!base() && !keyProblem(); }

  /* ---------------------------------------------------------------- HTTP */
  function keyHeaders() { var h = { apikey: key() }; if (/^eyJ/.test(key())) h.Authorization = 'Bearer ' + key(); return h; }
  function errorFrom(res) {
    return res.text().then(function (t) {
      var j = null; try { j = JSON.parse(t); } catch (e) {}
      var msg = (j && (j.error_description || j.msg || j.message || j.error)) || t || ('HTTP ' + res.status);
      // a function the CMS calls is missing: the database was set up with an older setup.sql
      if (j && j.code === 'PGRST202') msg = 'The cloud database needs an update for this feature: run supabase/setup.sql again in Supabase (SQL Editor). It keeps all existing projects.';
      var err = new Error(String(msg)); err.status = res.status; err.code = j && (j.code || j.error_code); throw err;
    });
  }
  function offlineError(e) { var err = new Error('Cannot reach Supabase (' + (e && e.message || 'network error') + ')'); err.offline = true; throw err; }

  /* ---------------------------------------------------------------- session */
  var session = readJson(SESSION_KEY), refreshing = null, listeners = [];
  function emit() { ensureLive(); listeners.forEach(function (fn) { try { fn(api.state()); } catch (e) {} }); }
  function setSession(j) {
    session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (j.expires_in || 3600) * 1000, user: { id: j.user && j.user.id, email: j.user && j.user.email } };
    writeJson(SESSION_KEY, session);
  }
  function clearSession() { session = null; writeJson(SESSION_KEY, null); }
  function notSignedIn() { var e = new Error('Not signed in to the cloud'); e.status = 401; e.signedOut = true; return e; }
  function authFetch(path, body) {
    return fetch(base() + path, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, keyHeaders()), body: JSON.stringify(body) })
      .catch(offlineError).then(function (r) { return r.ok ? r.json() : errorFrom(r); });
  }
  function signIn(email, password) {
    return authFetch('/auth/v1/token?grant_type=password', { email: String(email).trim(), password: password }).then(function (j) { setSession(j); emit(); return session.user; });
  }
  function token(force) {
    if (!session) return Promise.reject(notSignedIn());
    var stored = readJson(SESSION_KEY); // another tab may have refreshed already
    if (stored && stored.refresh_token && stored.expires_at > session.expires_at) session = stored;
    if (!force && session.expires_at - Date.now() > 60000) return Promise.resolve(session.access_token);
    if (refreshing) return refreshing;
    refreshing = authFetch('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(function (j) { setSession(j); refreshing = null; liveToken(session.access_token); return session.access_token; },
        function (e) { refreshing = null; if (e.status === 400 || e.status === 401) { clearSession(); emit(); throw notSignedIn(); } throw e; });
    return refreshing;
  }
  function signOut() {
    var t = session && session.access_token;
    // the link to the cloud project is kept: signing back in carries on where you left off
    var done = function () { clearSession(); clearTimeout(pushTimer); if (link) setStatus('signedout', 'Signed out: changes stay in this browser until you sign in'); else emit(); };
    if (!t) { done(); return Promise.resolve(); }
    return fetch(base() + '/auth/v1/logout', { method: 'POST', headers: Object.assign({}, keyHeaders(), { Authorization: 'Bearer ' + t }) }).catch(function () {}).then(done);
  }

  /* one request to the REST, RPC or storage API as the signed-in person; retries once with a fresh token on 401 */
  function request(method, path, body, extra, retried) {
    if (!configured()) { var ne = new Error('Cloud saving is not set up (assets/cms/cloud-config.js is empty)'); ne.offline = true; return Promise.reject(ne); }
    return token(retried).then(function (t) {
      var h = Object.assign({ apikey: key(), Authorization: 'Bearer ' + t }, extra || {});
      var isBlob = typeof Blob !== 'undefined' && body instanceof Blob;
      if (body !== undefined && !isBlob && !h['Content-Type']) h['Content-Type'] = 'application/json';
      return fetch(base() + path, { method: method, headers: h, body: body === undefined ? undefined : (isBlob ? body : JSON.stringify(body)) }).catch(offlineError);
    }).then(function (r) {
      if (r.status === 401 && !retried) return request(method, path, body, extra, true);
      if (!r.ok) return errorFrom(r);
      if (r.status === 204) return null;
      var ct = r.headers.get('content-type') || '';
      if (/json/.test(ct)) return r.text().then(function (t) { return t ? JSON.parse(t) : null; });
      return r.blob();
    });
  }
  function rpc(name, args) { return request('POST', '/rest/v1/rpc/' + name, args || {}); }

  /* ---------------------------------------------------------------- projects */
  var COLS = 'id,name,data,version,updated_at,owner';
  function listProjects() { return rpc('my_projects'); }
  function getProject(id) { return request('GET', '/rest/v1/projects?id=eq.' + encodeURIComponent(id) + '&select=' + COLS).then(function (r) { return (r && r[0]) || null; }); }
  function getVersion(id) { return request('GET', '/rest/v1/projects?id=eq.' + encodeURIComponent(id) + '&select=version,updated_at').then(function (r) { return (r && r[0]) || null; }); }
  function insertProject(name, data) { return request('POST', '/rest/v1/projects?select=' + COLS, { name: name, data: data }, { Prefer: 'return=representation' }).then(function (r) { return r[0]; }); }
  /* resolves to the updated row, or null when the version no longer matches (someone else saved first) */
  function updateProject(id, version, patch) {
    return request('PATCH', '/rest/v1/projects?id=eq.' + encodeURIComponent(id) + '&version=eq.' + version + '&select=id,name,version,updated_at', patch, { Prefer: 'return=representation' }).then(function (r) { return (r && r[0]) || null; });
  }
  function members(id) { return rpc('project_member_list', { p_project: id }); }
  function share(id, email, role) { return rpc('share_project', { p_project: id, p_email: email, p_role: role }); }
  function unshare(id, userId) { return rpc('unshare_project', { p_project: id, p_user: userId }); }
  function history(id) { return rpc('project_history_list', { p_project: id }); }
  function historyData(historyId) { return request('GET', '/rest/v1/project_history?id=eq.' + encodeURIComponent(historyId) + '&select=data,version,saved_at').then(function (r) { return (r && r[0]) || null; }); }
  function changePassword(pw) {
    return token().then(function (t) { return fetch(base() + '/auth/v1/user', { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, keyHeaders(), { Authorization: 'Bearer ' + t }), body: JSON.stringify({ password: pw }) }).catch(offlineError); })
      .then(function (r) { return r.ok ? r.json() : errorFrom(r); });
  }
  function deleteProject(id) {
    // remove its images first (best effort), then the project row; members, history, comments and review links go with it
    return rpc('share_link_list', { p_project: id }).catch(function () { return []; }).then(function (links) {
      return Promise.all((links || []).map(function (l) { return removeShareImages(l.token); }));
    }).then(function () {
      return request('POST', '/storage/v1/object/list/' + BUCKET, { prefix: id + '/', limit: 1000, offset: 0 });
    }).then(function (items) {
      var paths = (items || []).filter(function (i) { return i && i.name; }).map(function (i) { return id + '/' + i.name; });
      if (!paths.length) return null;
      return request('DELETE', '/storage/v1/object/' + BUCKET, { prefixes: paths });
    }).catch(function () { return null; }).then(function () {
      return request('DELETE', '/rest/v1/projects?id=eq.' + encodeURIComponent(id), undefined, { Prefer: 'return=minimal' });
    }).then(function () { if (link && link.projectId === id) unlink(); });
  }

  /* ---------------------------------------------------------------- images */
  function uploadMedia(projectId, rec) {
    return request('POST', '/storage/v1/object/' + BUCKET + '/' + projectId + '/' + rec.id, rec.blob, { 'Content-Type': rec.type || rec.blob.type || 'application/octet-stream', 'x-upsert': 'true' });
  }
  function downloadMedia(projectId, id) { return request('GET', '/storage/v1/object/authenticated/' + BUCKET + '/' + projectId + '/' + id); }
  function metaOf(rec) { return { id: rec.id, name: rec.name, type: rec.type, width: rec.width || 0, height: rec.height || 0, size: rec.size || 0 }; }
  /* upload images used by the project that the cloud does not have yet; returns the new image index */
  function uploadMissingMedia(projectId, data, index) {
    index = (index || []).slice();
    var have = {}; index.forEach(function (m) { have[m.id] = 1; });
    var missing = M.refsIn({ site: data.site, pages: data.pages }).filter(function (id) { return !have[id] && M.get(id); });
    return missing.reduce(function (chain, id) {
      return chain.then(function () { var rec = M.get(id); return uploadMedia(projectId, rec).then(function () { index.push(metaOf(rec)); }); });
    }, Promise.resolve()).then(function () { return index; });
  }
  /* fetch images listed in the cloud that this browser does not have */
  function downloadMissingMedia(projectId, index) {
    var missing = (index || []).filter(function (m) { return m && m.id && !M.get(m.id); });
    if (!missing.length) return Promise.resolve(0);
    var n = 0;
    return M.open().then(function () {
      return missing.reduce(function (chain, m) {
        return chain.then(function () { return downloadMedia(projectId, m.id).then(function (blob) { return M.putBlob(m, blob); }).then(function (r) { if (r) n++; }).catch(function () {}); });
      }, Promise.resolve());
    }).then(function () { if (n) hooks.onMedia(n); return n; });
  }

  /* ---------------------------------------------------------------- three-way merge
     base = the copy last synced, local = this browser, remote = the cloud. Items are matched by id. */
  function byId(list) { var m = {}; (list || []).forEach(function (x) { if (x && x.id) m[x.id] = x; }); return m; }
  function mergeItems(base, local, remote, newer, conflicts, label) {
    var B = byId(base), L = byId(local), R = byId(remote), out = [], seen = {};
    function pick(id) {
      var b = B[id], l = L[id], r = R[id];
      if (l && r) {
        if (same(l, r)) return l;
        if (b && same(l, b)) return r;          // only the cloud changed it
        if (b && same(r, b)) return l;          // only this browser changed it
        var w = newer(l, r);                    // both changed it
        conflicts.push(label(w));
        return w;
      }
      if (l) return b && same(l, b) ? null : l; // unchanged here and deleted in the cloud: delete; otherwise keep
      if (r) return b && same(r, b) ? null : r; // unchanged in the cloud and deleted here: delete; otherwise keep
      return null;
    }
    (remote || []).forEach(function (x) { if (!x || seen[x.id]) return; seen[x.id] = 1; var v = pick(x.id); if (v) out.push(v); });
    (local || []).forEach(function (x) { if (!x || seen[x.id]) return; seen[x.id] = 1; var v = pick(x.id); if (v) out.push(v); });
    return out;
  }
  function merge(base, local, remote) {
    base = base || null; remote = remote || {};
    var conflicts = [];
    var b = base || {};
    var pages = mergeItems(b.pages, local.pages, remote.pages, function (l, r) { return (r.updatedAt || '') > (l.updatedAt || '') ? r : l; }, conflicts, function (p) { return 'page "' + p.title + '"'; });
    var sections = mergeItems(b.sections, local.sections, remote.sections, function (l) { return l; }, conflicts, function (s) { return 'section "' + s.title + '"'; });
    var site;
    if (!remote.site || same(local.site, remote.site)) site = local.site;
    else if (base && same(local.site, b.site)) site = remote.site;
    else if (base && same(remote.site, b.site)) site = local.site;
    else { site = base ? local.site : remote.site; if (base) conflicts.push('site settings'); }
    // a page sits in at most one section, and only pages that still exist
    var ids = {}; pages.forEach(function (p) { ids[p.id] = 1; });
    var placed = {};
    sections = sections.map(function (s) { s = clone(s); s.pages = (s.pages || []).filter(function (id) { if (!ids[id] || placed[id]) return false; placed[id] = 1; return true; }); return s; });
    var media = mergeItems(b.media, local.media, remote.media, function (l) { return l; }, [], function () { return ''; });
    return { data: { site: site, pages: pages, sections: sections, media: media }, conflicts: conflicts };
  }
  function content(d) { return d ? { site: d.site, pages: d.pages, sections: d.sections } : null; }

  /* ---------------------------------------------------------------- the link between this browser and one cloud project */
  var link = readJson(LINK_KEY);  // { projectId, name, role, version, lastSync }
  var status = { kind: 'idle', message: '' };
  var applying = false, pushing = null, pushAgain = false, pushTimer = null, lastPull = 0;
  var hooks = { onApplied: function () {}, onMedia: function () {}, onStatus: function () {}, onLive: function () {} };

  function saveLink() { writeJson(LINK_KEY, link); }
  function unlink() { link = null; saveLink(); clearTimeout(pushTimer); setStatus('idle', ''); }
  function canEdit() { return !!(link && session && link.role !== 'viewer'); }
  function setStatus(kind, message) { status = { kind: kind, message: message || '' }; hooks.onStatus(api.state()); emit(); }
  function baseKey(id) { return 'cloudBase:' + id; }
  function loadBase() { return link ? M.kvGet(baseKey(link.projectId)).then(function (s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } }) : Promise.resolve(null); }
  function saveBase(data) { return link ? M.kvSet(baseKey(link.projectId), JSON.stringify(data)) : Promise.resolve(false); }
  function snapshot() { return clone({ site: Store.data.site, pages: Store.data.pages, sections: Store.data.sections }); }

  /* put merged data into the browser store. Where the merge kept this browser's version, the live object stays in
     place (including anything typed since the merge started), so open editors keep working; pages and sections
     created during the merge are kept too. Only items a colleague changed are swapped. */
  function applyLocal(data, conflicts, by, localSnap) {
    var live = Store.data, snapPages = byId(localSnap && localSnap.pages), snapSections = byId(localSnap && localSnap.sections);
    var livePages = byId(live.pages), liveSections = byId(live.sections), mergedPages = byId(data.pages), mergedSections = byId(data.sections);
    var changed = [], sectionsChanged = false;
    function ours(cur, snap, m) { return cur && (same(cur, m) || (snap && same(snap, m))); }
    var pages = data.pages.map(function (p) { var cur = livePages[p.id]; if (ours(cur, snapPages[p.id], p)) return cur; changed.push(p.id); return clone(p); });
    live.pages.forEach(function (p) { if (mergedPages[p.id]) return; if (!snapPages[p.id]) pages.push(p); else changed.push(p.id); });
    var sections = data.sections.map(function (s) { var cur = liveSections[s.id]; if (ours(cur, snapSections[s.id], s)) return cur; sectionsChanged = true; return clone(s); });
    live.sections.forEach(function (s) { if (mergedSections[s.id]) return; if (!snapSections[s.id]) sections.push(s); else sectionsChanged = true; });
    var siteChanged = !(same(live.site, data.site) || (localSnap && same(localSnap.site, data.site)));
    if (!changed.length && !sectionsChanged && !siteChanged) return null;
    applying = true;
    try {
      live.pages = pages; live.sections = sections;
      if (siteChanged) live.site = clone(data.site);
      Store.migrate(); Store.save();
    } finally { applying = false; }
    var info = { pages: changed, sections: sectionsChanged, site: siteChanged, conflicts: conflicts || [], by: by || '' };
    hooks.onApplied(info);
    return info;
  }

  function schedulePush(ms) {
    if (!canEdit()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { push(); }, ms == null ? 2500 : ms);
    if (status.kind !== 'syncing') setStatus('pending', 'Changes waiting to upload');
  }
  /* send this browser's copy; on a version clash, pull the newer copy, merge, and try again */
  function push() {
    if (!canEdit()) return Promise.resolve(false);
    if (pushing) { pushAgain = true; return pushing; }
    clearTimeout(pushTimer);
    setStatus('syncing', 'Saving to the cloud…');
    var projectId = link.projectId;
    pushing = loadBase().then(function (b) {
      return attempt(b, 0);
      function attempt(base, n) {
        var local = snapshot();
        return uploadMissingMedia(projectId, local, (base && base.media) || []).then(function (index) {
          local.media = index;
          if (base && same(content(local), content(base)) && same(local.media, base.media)) return true;
          return updateProject(projectId, link.version, { data: local }).then(function (row) {
            if (row) { link.version = row.version; link.lastSync = row.updated_at; saveLink(); return saveBase(local).then(function () { return true; }); }
            return getProject(projectId).then(function (remote) {
              if (!remote) throw lostAccess();
              if (remote.version === link.version) { var e = new Error('You can view this project but not change it, so your changes stay in this browser.'); e.viewOnly = true; throw e; }
              if (n >= 3) throw new Error('The project keeps changing; will try again shortly.');
              var merged = merge(base, local, remote.data);
              merged.data.media = mergeItems((base || {}).media, index, (remote.data || {}).media, function (l) { return l; }, [], function () { return ''; });
              applyLocal(merged.data, merged.conflicts, 'a colleague', local);
              link.version = remote.version; saveLink();
              return saveBase(remote.data).then(function () { return downloadMissingMedia(projectId, merged.data.media); }).then(function () { return attempt(remote.data, n + 1); });
            });
          });
        });
      }
    }).then(function () {
      setStatus('synced', 'Saved to the cloud');
    }, function (e) {
      if (e.viewOnly) { link.role = 'viewer'; saveLink(); setStatus('viewer', e.message); }
      else if (e.signedOut) setStatus('signedout', 'Signed out: changes stay in this browser until you sign in');
      else if (e.lost) { setStatus('error', e.message); }
      else { setStatus(e.offline ? 'offline' : 'error', e.message); if (link) schedulePush(30000); }
    }).then(function () {
      pushing = null;
      if (pushAgain) { pushAgain = false; schedulePush(300); }
    });
    return pushing;
  }
  function lostAccess() { var e = new Error('This cloud project was deleted or is no longer shared with you. Your copy stays in this browser.'); e.lost = true; return e; }

  /* bring in a colleague's newer save, if there is one */
  function pull(force) {
    if (!link || !session) return Promise.resolve(false);
    if (pushing) return pushing.then(function () { return pull(force); });
    lastPull = Date.now();
    var projectId = link.projectId;
    return getVersion(projectId).then(function (row) {
      if (!row) throw lostAccess();
      if (row.version === link.version && !force) {
        if (status.kind === 'idle' || status.kind === 'offline' || status.kind === 'signedout') setStatus(link.role === 'viewer' ? 'viewer' : 'synced', link.role === 'viewer' ? 'View only' : 'Up to date');
        return loadBase().then(function (b) {
          var local = snapshot();
          if (canEdit() && b && !same(content(local), content(b))) schedulePush(500); // edits made while offline or signed out
          return false;
        });
      }
      return Promise.all([getProject(projectId), loadBase()]).then(function (res) {
        var remote = res[0], b = res[1];
        if (!remote) throw lostAccess();
        var local = snapshot(); local.media = (b && b.media) || [];
        var merged = merge(b, local, remote.data);
        var info = applyLocal(merged.data, merged.conflicts, 'a colleague', local);
        link.version = remote.version; link.lastSync = remote.updated_at; link.name = remote.name; saveLink();
        return saveBase(remote.data).then(function () { return downloadMissingMedia(projectId, (remote.data || {}).media); }).then(function () {
          if (canEdit() && !same(content(merged.data), content(remote.data))) schedulePush(300);
          else setStatus(link.role === 'viewer' ? 'viewer' : 'synced', link.role === 'viewer' ? 'View only' : 'Up to date');
          return !!info;
        });
      });
    }).catch(function (e) {
      if (e.lost) { setStatus('error', e.message); unlink(); hooks.onApplied({ pages: [], lost: true, message: e.message }); }
      else if (e.signedOut) setStatus('signedout', 'Signed out: changes stay in this browser until you sign in');
      else setStatus(e.offline ? 'offline' : 'error', e.message);
      return false;
    });
  }

  /* make a cloud project this browser's working copy (the caller confirms and snapshots first) */
  function openProject(id, role) {
    return getProject(id).then(function (remote) {
      if (!remote) throw lostAccess();
      var d = remote.data || {};
      applying = true;
      try {
        Store.data = { site: d.site || Store.data.site, pages: d.pages || [], sections: d.sections || [] };
        Store.migrate(); Store.save();
      } finally { applying = false; }
      link = { projectId: remote.id, name: remote.name, role: role || 'editor', version: remote.version, lastSync: remote.updated_at };
      saveLink();
      return saveBase(remote.data).then(function () { return downloadMissingMedia(remote.id, d.media); }).then(function () {
        setStatus(link.role === 'viewer' ? 'viewer' : 'synced', link.role === 'viewer' ? 'View only' : 'Up to date');
        return remote;
      });
    });
  }
  /* create a cloud project from what is in this browser and link to it */
  function uploadAsNew(name) {
    var local = snapshot();
    return insertProject(name, local).then(function (row) {
      link = { projectId: row.id, name: row.name, role: 'owner', version: row.version, lastSync: row.updated_at };
      saveLink();
      return uploadMissingMedia(row.id, local, []).then(function (index) {
        if (!index.length) return saveBase(local).then(function () { return row; });
        local.media = index;
        return updateProject(row.id, row.version, { data: local }).then(function (r2) { link.version = r2 ? r2.version : link.version; saveLink(); return saveBase(local).then(function () { return row; }); });
      });
    }).then(function (row) { setStatus('synced', 'Saved to the cloud'); return row; });
  }
  function rename(name) {
    if (!link) return Promise.resolve(null);
    return updateProject(link.projectId, link.version, { name: name }).then(function (row) {
      if (!row) return pull(true).then(function () { return rename(name); });
      link.name = row.name; link.version = row.version; saveLink(); emit(); return row;
    });
  }
  /* replace the working copy with an hourly cloud copy, then save it as the newest version */
  function restoreHistory(historyId) {
    return historyData(historyId).then(function (h) {
      if (!h) throw new Error('That copy no longer exists');
      var d = h.data || {};
      applying = true;
      try { Store.data = { site: d.site || Store.data.site, pages: d.pages || [], sections: d.sections || [] }; Store.migrate(); Store.save(); } finally { applying = false; }
      return downloadMissingMedia(link.projectId, d.media).then(function () { return push(); });
    });
  }
  function disconnect() { unlink(); emit(); }
  /* the owner may have changed this person's access or renamed the project since last time */
  function refreshLink() {
    if (!link || !session) return Promise.resolve(null);
    return listProjects().then(function (rows) {
      var r = (rows || []).filter(function (x) { return x.id === link.projectId; })[0];
      if (r && link) { link.role = r.role; link.name = r.name; saveLink(); emit(); }
      return r || null;
    }).catch(function () { return null; });
  }

  /* ---------------------------------------------------------------- review: comments and sign-off
     Stored in their own tables, outside the project document, so they never clash with page edits. */
  function needLink() { if (!link) { var e = new Error('Comments and sign-off need a cloud project: upload this project on the Cloud screen first.'); e.noLink = true; throw e; } return link.projectId; }
  function reviewCall(name, args) { try { var pid = needLink(); } catch (e) { return Promise.reject(e); } return rpc(name, Object.assign({ p_project: pid }, args || {})); }
  var review = {
    summary: function () { return reviewCall('page_review_summary'); },
    comments: function (pageId) { return reviewCall('page_comment_list', { p_page: pageId || null }); },
    addComment: function (pageId, blockId, blockLabel, body) { return reviewCall('add_page_comment', { p_page: pageId, p_block: blockId || null, p_block_label: blockLabel || null, p_body: body }); },
    resolveComment: function (id, resolved) { return rpc('set_comment_resolved', { p_comment: id, p_resolved: !!resolved }); },
    deleteComment: function (id) { return rpc('delete_page_comment', { p_comment: id }); },
    setSignoff: function (pageId, status, note, hash) { return reviewCall('set_page_signoff', { p_page: pageId, p_status: status, p_note: note || null, p_hash: hash || null }); },
    signoffHistory: function (pageId) { return reviewCall('page_signoff_history', { p_page: pageId }); },
    jaduChecks: function (pageId) { return reviewCall('jadu_check_list', { p_page: pageId || null }); },
    setJaduCheck: function (pageId, key, hash, done) { return reviewCall('set_jadu_check', { p_page: pageId, p_key: key, p_hash: hash, p_done: !!done }); }
  };

  /* ---------------------------------------------------------------- review links (read-only copies for people without an account) */
  var SHARE_BUCKET = 'cms-shares';
  /* copy the images a review copy uses into its folder, skipping those already there */
  function uploadShareImages(token, data, onProgress) {
    var ids = M.refsIn({ site: data.site, pages: data.pages }).filter(function (id) { return M.get(id); });
    return request('POST', '/storage/v1/object/list/' + SHARE_BUCKET, { prefix: token + '/', limit: 1000, offset: 0 }).catch(function () { return []; }).then(function (items) {
      var have = {}; (items || []).forEach(function (i) { if (i && i.name) have[i.name] = 1; });
      var todo = ids.filter(function (id) { return !have[id]; }), done = 0;
      return todo.reduce(function (chain, id) {
        return chain.then(function () {
          var rec = M.get(id);
          return request('POST', '/storage/v1/object/' + SHARE_BUCKET + '/' + token + '/' + id, rec.blob, { 'Content-Type': rec.type || rec.blob.type || 'application/octet-stream', 'x-upsert': 'true' })
            .then(function () { done++; if (onProgress) onProgress(done, todo.length); });
        });
      }, Promise.resolve()).then(function () { return todo.length; });
    });
  }
  function removeShareImages(token) {
    return request('POST', '/storage/v1/object/list/' + SHARE_BUCKET, { prefix: token + '/', limit: 1000, offset: 0 }).then(function (items) {
      var paths = (items || []).filter(function (i) { return i && i.name; }).map(function (i) { return token + '/' + i.name; });
      return paths.length ? request('DELETE', '/storage/v1/object/' + SHARE_BUCKET, { prefixes: paths }) : null;
    }).catch(function () { return null; });
  }
  var shares = {
    list: function () { return reviewCall('share_link_list'); },
    create: function (name, scope, data, onProgress) {
      return reviewCall('create_share_link', { p_name: name, p_scope: scope, p_data: data }).then(function (token) {
        return uploadShareImages(token, data, onProgress).then(function () { return token; });
      });
    },
    update: function (token, data, onProgress) {
      return rpc('update_share_link', { p_token: token, p_data: data }).then(function () { return uploadShareImages(token, data, onProgress); });
    },
    remove: function (token) { return removeShareImages(token).then(function () { return rpc('delete_share_link', { p_token: token }); }); },
    setComments: function (token, allow) { return rpc('set_share_link_comments', { p_token: token, p_allow: !!allow }); }
  };

  /* ---------------------------------------------------------------- live updates (Supabase Realtime)
     Listens to the project's row in project_pings, which changes whenever the project, its comments, sign-off or Jadu
     ticks change, and reacts within seconds. Speaks the Realtime websocket protocol directly, so no library is needed.
     If the connection fails, it retries with growing gaps; the minute-by-minute checks carry on regardless. */
  var live = { ws: null, topic: '', ref: 0, beat: null, retry: 0, retryTimer: null, joined: false, projectId: null };
  function wsUrl() { return base().replace(/^http/i, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(key()) + '&vsn=1.0.0'; }
  function liveSend(msg) { if (live.ws && live.ws.readyState === 1) { msg.ref = String(++live.ref); live.ws.send(JSON.stringify(msg)); } }
  function liveToken(t) { if (live.joined) liveSend({ topic: live.topic, event: 'access_token', payload: { access_token: t } }); }
  function liveStop() {
    clearInterval(live.beat); clearTimeout(live.retryTimer);
    var was = live.joined;
    if (live.ws) { live.ws.onclose = null; try { live.ws.close(); } catch (e) {} }
    live.ws = null; live.joined = false; live.projectId = null;
    if (was) listeners.forEach(function (fn) { try { fn(api.state()); } catch (e) {} });
  }
  function ensureLive() {
    var want = !!(link && session && configured() && typeof WebSocket !== 'undefined');
    if (!want) { if (live.ws || live.retryTimer) liveStop(); return; }
    if (live.projectId === link.projectId && (live.ws || live.retryTimer)) return;
    liveStart();
  }
  function liveStart() {
    liveStop();
    var pid = link.projectId;
    live.projectId = pid;
    token().then(function (t) {
      if (!link || link.projectId !== pid || live.projectId !== pid) return;
      var ws; try { ws = new WebSocket(wsUrl()); } catch (e) { return; }
      live.ws = ws; live.topic = 'realtime:project-' + pid;
      ws.onopen = function () {
        liveSend({ topic: live.topic, event: 'phx_join', join_ref: '1', payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, postgres_changes: [{ event: '*', schema: 'public', table: 'project_pings', filter: 'project_id=eq.' + pid }], private: false }, access_token: t } });
        live.beat = setInterval(function () { liveSend({ topic: 'phoenix', event: 'heartbeat', payload: {} }); }, 25000);
      };
      ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } onLive(m); };
      ws.onclose = function () {
        clearInterval(live.beat); live.ws = null;
        var was = live.joined; live.joined = false;
        if (was) listeners.forEach(function (fn) { try { fn(api.state()); } catch (x) {} });
        if (link && session && live.projectId === pid) live.retryTimer = setTimeout(function () { live.retryTimer = null; if (live.projectId === pid) liveStart(); }, Math.min(60000, 2000 * Math.pow(2, live.retry++)));
      };
      ws.onerror = function () {};
    }).catch(function () { live.projectId = null; });
  }
  function onLive(m) {
    if (!m || m.topic !== live.topic) return;
    if (m.event === 'phx_reply' && m.payload && m.payload.status === 'ok' && !live.joined) { live.joined = true; live.retry = 0; listeners.forEach(function (fn) { try { fn(api.state()); } catch (e) {} }); return; }
    if (m.event === 'phx_reply' && m.payload && m.payload.status === 'error') { try { live.ws.close(); } catch (e) {} return; }
    if (m.event !== 'postgres_changes') return;
    var d = (m.payload && m.payload.data) || {}, rec = d.record || d.new || {};
    var mine = session && session.user && rec.by_user && rec.by_user === session.user.id;
    if (rec.kind === 'project') { if (!mine && !pushing && Date.now() - lastPull > 1500) pull(false); return; }
    hooks.onLive({ kind: rec.kind, pageId: rec.page_id || null, mine: !!mine });
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') ensureLive(); });

  /* ---------------------------------------------------------------- email notification choices (per person, per project) */
  var notify = {
    prefs: function () { return reviewCall('my_notify_prefs').then(function (rows) { return (rows && rows[0]) || { available: false, signoff: true, comments: false }; }); },
    set: function (signoff, comments) { return reviewCall('set_notify_prefs', { p_signoff: !!signoff, p_comments: !!comments }); }
  };

  /* every local save schedules an upload */
  Store.onSave = function () { if (!applying && canEdit()) schedulePush(); };

  /* colleagues' changes: check every minute while the tab is visible, and when coming back to it */
  setInterval(function () { if (link && session && document.visibilityState === 'visible' && Date.now() - lastPull > 55000) pull(false); }, 15000);
  window.addEventListener('focus', function () { if (link && session && Date.now() - lastPull > 20000) pull(false); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && pushTimer && canEdit()) push(); });
  window.addEventListener('online', function () { if (link && session) pull(false); });

  var api = {
    configured: configured, keyProblem: keyProblem, url: base,
    signIn: signIn, signOut: signOut, changePassword: changePassword,
    user: function () { return session ? session.user : null; },
    link: function () { return link ? clone(link) : null; },
    canEdit: canEdit,
    state: function () { return { configured: configured(), user: session ? session.user : null, link: link ? clone(link) : null, status: clone(status), live: live.joined }; },
    listProjects: listProjects, openProject: openProject, uploadAsNew: uploadAsNew, deleteProject: deleteProject, rename: rename,
    members: members, share: share, unshare: unshare, history: history, restoreHistory: restoreHistory,
    push: push, pull: pull, disconnect: disconnect, refreshLink: refreshLink, merge: merge,
    review: review, shares: shares, notify: notify, live: function () { return live.joined; },
    on: function (fn) { listeners.push(fn); },
    setHooks: function (h) { Object.keys(h || {}).forEach(function (k) { hooks[k] = h[k]; }); }
  };
  window.UOL_CLOUD = api;
  setTimeout(ensureLive, 0);
})();
