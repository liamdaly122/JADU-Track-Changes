/* Leeds prototyping CMS - cloud: accounts, projects and saving (Supabase)
   With cloud saving set up, everything lives in the cloud and each browser keeps a copy of the projects it opens
   (store.js), so pages open straight away and work carries on through a dropped connection.
   - A project is a row in projects (its site settings and sections, "meta") plus one row per page in pages. A
     save sends only what changed: the pages that changed, and meta if it changed.
   - Every row has a version. A save names the version it started from; if someone saved in between, the CMS
     fetches their copy, merges the two block by block (base = the copy last synced, local = this browser,
     remote = the cloud) and saves again. Only when both changed the same block does the more recent edit win,
     and the other person is told.
   - Colleagues' saves arrive within seconds through Supabase Realtime, with a check every minute as a fallback.
     Realtime presence shows who is working on which page.
   Talks to Supabase's HTTP APIs with fetch, so no library or build step is needed. */
(function () {
  'use strict';

  var Store = window.UOL_STORE, M = window.UOL_MEDIA;
  var SESSION_KEY = 'leeds-cms:cloud-session', LEGACY_LINK_KEY = 'leeds-cms:cloud-link', BUCKET = 'cms-media';

  function cfg() { return window.UOL_CLOUD_CONFIG || {}; }
  function base() { return String(cfg().url || '').trim().replace(/\/+$/, ''); }
  function key() { return String(cfg().anonKey || '').trim(); }
  function readJson(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function writeJson(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function nowIso() { return new Date().toISOString(); }

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
      // a function or column the CMS uses is missing: the database was set up with an older setup.sql
      if (j && (j.code === 'PGRST202' || j.code === 'PGRST204' || j.code === '42P01' || j.code === '42703')) msg = 'The cloud database needs an update: run supabase/setup.sql again in Supabase (SQL Editor). It keeps all existing projects.';
      var err = new Error(String(msg)); err.status = res.status; err.code = j && (j.code || j.error_code); throw err;
    });
  }
  function offlineError(e) { var err = new Error('Cannot reach Supabase (' + (e && e.message || 'network error') + ')'); err.offline = true; throw err; }

  /* ---------------------------------------------------------------- accounts */
  var session = readJson(SESSION_KEY), refreshing = null, listeners = [], profile = null;
  function emit() { ensureLive(); listeners.forEach(function (fn) { try { fn(api.state()); } catch (e) {} }); }
  function setSession(j, user) {
    var u = user || j.user || {};
    session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at ? j.expires_at * 1000 : Date.now() + (+j.expires_in || 3600) * 1000, user: { id: u.id, email: u.email } };
    writeJson(SESSION_KEY, session);
  }
  function clearSession() { session = null; profile = null; writeJson(SESSION_KEY, null); }
  function notSignedIn() { var e = new Error('Not signed in'); e.status = 401; e.signedOut = true; return e; }
  function authFetch(path, body, method) {
    return fetch(base() + path, { method: method || 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, keyHeaders()), body: body === undefined ? undefined : JSON.stringify(body) })
      .catch(offlineError).then(function (r) { return r.ok ? r.text().then(function (t) { return t ? JSON.parse(t) : {}; }) : errorFrom(r); });
  }
  /* where links in sign-up and password emails come back to: this page */
  function returnUrl() { return location.origin + location.pathname; }
  function friendlyAuthError(e) {
    var m = String(e && e.message || '');
    if (/invalid login credentials|invalid_credentials/i.test(m)) return 'Email or password not recognised.';
    if (/email not confirmed/i.test(m)) { var x = new Error('Confirm your email address first: open the link in the email we sent you.'); x.unconfirmed = true; return x.message; }
    if (/already registered|already been registered|user_already_exists/i.test(m)) return 'There is already an account with this email address. Sign in instead, or reset the password.';
    if (/database error saving new user|limited to/i.test(m)) return 'Accounts are limited to ' + domainsText() + ' email addresses.';
    if (/signups? not allowed|signup is disabled/i.test(m)) return 'New accounts are switched off for this site. Ask whoever looks after it to switch sign-ups on in Supabase (DEPLOY.md, part 3).';
    if (/password should be|weak password|weak_password/i.test(m)) return 'Choose a longer password: at least 8 characters.';
    if (/rate limit|too many|over_email_send_rate_limit/i.test(m)) return 'Too many emails have been sent for now. Wait a few minutes and try again.';
    return m;
  }
  function signIn(email, password) {
    return authFetch('/auth/v1/token?grant_type=password', { email: String(email).trim(), password: password })
      .then(function (j) { setSession(j); emit(); return session.user; })
      .catch(function (e) { var x = new Error(friendlyAuthError(e)); x.unconfirmed = /confirm your email/i.test(x.message); throw x; });
  }
  /* resolves { signedIn: true } when the account is ready, or { confirm: true } when an email has to be confirmed */
  function signUp(email, password, name) {
    return authFetch('/auth/v1/signup?redirect_to=' + encodeURIComponent(returnUrl()), { email: String(email).trim(), password: password, data: { name: String(name || '').trim() } })
      .then(function (j) {
        if (j && j.access_token) { setSession(j); emit(); return { signedIn: true }; }
        // an existing confirmed address comes back as a user with no identities, and no email is sent
        if (j && j.identities && !j.identities.length) throw new Error('There is already an account with this email address. Sign in instead, or reset the password.');
        return { confirm: true };
      })
      .catch(function (e) { throw new Error(friendlyAuthError(e)); });
  }
  function resendConfirmation(email) { return authFetch('/auth/v1/resend', { type: 'signup', email: String(email).trim(), options: { email_redirect_to: returnUrl() } }).catch(function (e) { throw new Error(friendlyAuthError(e)); }); }
  function requestReset(email) { return authFetch('/auth/v1/recover?redirect_to=' + encodeURIComponent(returnUrl()), { email: String(email).trim() }).catch(function (e) { throw new Error(friendlyAuthError(e)); }); }
  /* links in sign-up and password emails come back with the session in the address (#access_token=...).
     Resolves { type } ('signup', 'recovery', 'magiclink', 'invite'), { error } or null when there is nothing to do. */
  function consumeRedirect() {
    var h = String(location.hash || '').replace(/^#/, ''), q = String(location.search || '').replace(/^\?/, '');
    if (!/(^|&)(access_token|error)=/.test(h) && !/(^|&)error=/.test(q)) return Promise.resolve(null);
    var p = {}; (h + '&' + q).split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent((kv.slice(i + 1) || '').replace(/\+/g, ' ')); });
    try { history.replaceState(null, '', location.pathname); } catch (e) { location.hash = ''; }
    if (p.error) return Promise.resolve({ error: /expired|invalid/i.test(p.error_description || '') ? 'That link has expired or was already used. Ask for a new one.' : (p.error_description || p.error) });
    return fetch(base() + '/auth/v1/user', { headers: Object.assign({}, keyHeaders(), { Authorization: 'Bearer ' + p.access_token }) }).catch(offlineError)
      .then(function (r) { return r.ok ? r.json() : errorFrom(r); })
      .then(function (u) { setSession({ access_token: p.access_token, refresh_token: p.refresh_token, expires_at: +p.expires_at || 0, expires_in: +p.expires_in || 3600 }, u); emit(); return { type: p.type || 'signup' }; })
      .catch(function (e) { return { error: e.message }; });
  }
  function token(force) {
    if (!session) return Promise.reject(notSignedIn());
    var stored = readJson(SESSION_KEY); // another tab may have refreshed already
    if (stored && stored.refresh_token && stored.expires_at > session.expires_at) session = stored;
    if (!force && session.expires_at - Date.now() > 60000) return Promise.resolve(session.access_token);
    if (refreshing) return refreshing;
    refreshing = authFetch('/auth/v1/token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(function (j) { setSession(j); refreshing = null; liveToken(session.access_token); return session.access_token; },
        function (e) { refreshing = null; if (e.status === 400 || e.status === 401) { clearSession(); emit(); hooks.onSignedOut(); throw notSignedIn(); } throw e; });
    return refreshing;
  }
  function signOut() {
    var t = session && session.access_token;
    var done = function () { stopSync(); clearSession(); link = null; liveStop(); emit(); };
    var flushFirst = canEdit() ? push().catch(function () {}) : Promise.resolve();
    return flushFirst.then(function () {
      if (!t) { done(); return; }
      return fetch(base() + '/auth/v1/logout', { method: 'POST', headers: Object.assign({}, keyHeaders(), { Authorization: 'Bearer ' + t }) }).catch(function () {}).then(done);
    });
  }
  function changePassword(pw) {
    return token().then(function (t) { return fetch(base() + '/auth/v1/user', { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, keyHeaders(), { Authorization: 'Bearer ' + t }), body: JSON.stringify({ password: pw }) }).catch(offlineError); })
      .then(function (r) { return r.ok ? r.json() : errorFrom(r); }).catch(function (e) { throw new Error(friendlyAuthError(e)); });
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
  function anonRpc(name, args) {
    return fetch(base() + '/rest/v1/rpc/' + name, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, keyHeaders()), body: JSON.stringify(args || {}) })
      .catch(offlineError).then(function (r) { return r.ok ? r.json() : errorFrom(r); });
  }

  /* profile: display name, and whether the tour has been seen */
  var domains = null;
  function domainsText() { return domains && domains.length ? domains.join(' or ') : 'University of Leeds'; }
  function loadDomains() { return anonRpc('signup_domains').then(function (d) { domains = Array.isArray(d) ? d : []; return domains; }).catch(function () { return domains || []; }); }
  function emailAllowed(email) {
    if (!domains || !domains.length) return true;
    var host = String(email || '').trim().toLowerCase().split('@')[1] || '';
    return domains.some(function (d) { d = String(d).toLowerCase(); return host === d || host.slice(-(d.length + 1)) === '.' + d; });
  }
  function getProfile(force) {
    if (profile && !force) return Promise.resolve(profile);
    return rpc('my_profile').then(function (rows) {
      var r = (rows && rows[0]) || {};
      profile = { id: r.id || (session && session.user.id), email: r.email || (session && session.user.email), name: r.display_name || String((session && session.user.email) || '').split('@')[0], onboarded: !!r.onboarded_at, created: r.created_at };
      return profile;
    });
  }
  function setName(name) { return rpc('set_display_name', { p_name: name }).then(function () { if (profile) profile.name = name.trim(); presenceSoon(); emit(); }); }
  function setOnboarded(done) { return rpc('set_onboarded', { p_done: done !== false }).then(function () { if (profile) profile.onboarded = done !== false; }); }

  /* ---------------------------------------------------------------- projects */
  function me() { return session && session.user ? session.user.id : null; }
  function storeKey(projectId) { return me() + ':' + projectId; }
  function listProjects() { return rpc('my_projects'); }
  function getMeta(id) { return request('GET', '/rest/v1/projects?id=eq.' + encodeURIComponent(id) + '&select=id,name,meta,version,updated_at,owner').then(function (r) { return (r && r[0]) || null; }); }
  function getMetaVersion(id) { return request('GET', '/rest/v1/projects?id=eq.' + encodeURIComponent(id) + '&select=version,name').then(function (r) { return (r && r[0]) || null; }); }
  /* resolves to the updated row, or null when the version no longer matches (someone else saved first) */
  function patchProject(id, version, patch) {
    return request('PATCH', '/rest/v1/projects?id=eq.' + encodeURIComponent(id) + '&version=eq.' + version + '&select=id,name,version,updated_at', patch, { Prefer: 'return=representation' }).then(function (r) { return (r && r[0]) || null; });
  }
  function members(id) { return rpc('project_member_list', { p_project: id }); }
  function share(id, email, role) { return rpc('share_project', { p_project: id, p_email: email, p_role: role }); }
  function cancelInvite(id, email) { return rpc('cancel_invite', { p_project: id, p_email: email }); }
  function unshare(id, userId) { return rpc('unshare_project', { p_project: id, p_user: userId }); }
  function leave(id) { return unshare(id, me()).then(function () { return Store.forget(storeKey(id)); }).then(function () { if (link && link.projectId === id) closeProject(); }); }
  function deleteProject(id) {
    // remove its images first (best effort), then the project row; pages, members, history, comments and review links go with it
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
    }).then(function () {
      if (link && link.projectId === id) closeProject();
      return Promise.all([Store.forget(storeKey(id)), M.kvSet(baseKey(id), null)]);
    });
  }

  /* ---------------------------------------------------------------- pages */
  var PAGE_COLS = 'id,version,data,source,revisions,deleted_at,updated_at';
  function inList(ids) { return 'in.(' + ids.map(function (i) { return '"' + String(i).replace(/"/g, '') + '"'; }).join(',') + ')'; }
  /* the version of every page (cheap), to see which changed */
  function pageVersions(projectId) { return pagedGet('/rest/v1/pages?project_id=eq.' + encodeURIComponent(projectId) + '&select=id,version,deleted_at&order=id'); }
  /* full rows: all pages of a project, or the ones listed */
  function getPages(projectId, ids) {
    var path = '/rest/v1/pages?project_id=eq.' + encodeURIComponent(projectId) + '&select=' + PAGE_COLS;
    if (!ids) return pagedGet(path + '&order=id');
    var chunks = []; for (var i = 0; i < ids.length; i += 40) chunks.push(ids.slice(i, i + 40));
    return chunks.reduce(function (chain, c) { return chain.then(function (all) { return request('GET', path + '&id=' + encodeURIComponent(inList(c))).then(function (r) { return all.concat(r || []); }); }); }, Promise.resolve([]));
  }
  /* Supabase answers at most 1000 rows per request; ask in pages of 500 */
  function pagedGet(path) {
    var out = [];
    function next(offset) {
      return request('GET', path + '&limit=500&offset=' + offset).then(function (rows) {
        out = out.concat(rows || []);
        return rows && rows.length === 500 ? next(offset + 500) : out;
      });
    }
    return next(0);
  }
  /* a page as stored: data (the page without its original and saved versions), source and revisions */
  function splitPage(p) {
    var c = clone(p) || {}, source = c.source === undefined ? null : c.source, revisions = c.revisions || [];
    delete c.source; delete c.revisions;
    return { data: c, source: source, revisions: revisions };
  }
  function joinPage(row) {
    var p = clone(row.data) || {};
    p.id = row.id;
    if (row.source) p.source = clone(row.source); else delete p.source;
    p.revisions = clone(row.revisions) || [];
    if (!p.settings) p.settings = {};
    if (!p.hero) p.hero = { type: 'none' };
    if (!p.blocks) p.blocks = [];
    return p;
  }
  function patchPage(projectId, pageId, version, cols) {
    return request('PATCH', '/rest/v1/pages?project_id=eq.' + encodeURIComponent(projectId) + '&id=eq.' + encodeURIComponent(pageId) + '&version=eq.' + version + '&select=version,deleted_at', cols, { Prefer: 'return=representation' }).then(function (r) { return (r && r[0]) || null; });
  }
  function insertPage(projectId, page) {
    var s = splitPage(page);
    return request('POST', '/rest/v1/pages?select=version', { project_id: projectId, id: page.id, data: s.data, source: s.source, revisions: s.revisions }, { Prefer: 'return=representation' })
      .then(function (r) { return (r && r[0]) || null; }, function (e) { if (e.status === 409 || e.code === '23505') return null; throw e; });
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

  /* ---------------------------------------------------------------- merging
     base = the copy last synced, local = this browser, remote = the cloud. Items are matched by id. */
  function byId(list) { var m = {}; (list || []).forEach(function (x) { if (x && x.id) m[x.id] = x; }); return m; }
  function mergeItems(baseL, local, remote, newer, conflicts, label) {
    var B = byId(baseL), L = byId(local), R = byId(remote), out = [], seen = {};
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
  /* site settings and sections */
  function mergeMeta(b, l, r) {
    b = b || null; r = r || {};
    var conflicts = [], bb = b || {};
    var sections = mergeItems(bb.sections, l.sections, r.sections, function (x) { return x; }, conflicts, function (s) { return 'section "' + s.title + '"'; });
    var site;
    if (!r.site || same(l.site, r.site)) site = l.site;
    else if (b && same(l.site, bb.site)) site = r.site;
    else if (b && same(r.site, bb.site)) site = l.site;
    else { site = b ? l.site : r.site; if (b) conflicts.push('the site settings'); }
    var media = mergeItems(bb.media, l.media, r.media, function (x) { return x; }, [], function () { return ''; });
    return { meta: { site: site, sections: sections, media: media }, conflicts: conflicts };
  }
  function blockName(blk) { var s = window.UOL_BLOCKS && window.UOL_BLOCKS.registry[blk.type]; return s ? s.label : blk.type; }
  /* one page: each top-level field on its own, blocks by id (content and order), saved versions joined */
  function mergePage(b, l, r) {
    var conflicts = [];
    if (!b) b = {};
    var newerIsRemote = (r.updatedAt || '') > (l.updatedAt || '');
    var out = {};
    var keys = {}; [b, l, r].forEach(function (x) { Object.keys(x || {}).forEach(function (k) { keys[k] = 1; }); });
    Object.keys(keys).forEach(function (k) {
      if (k === 'blocks' || k === 'revisions' || k === 'updatedAt') return;
      var bv = b[k], lv = l[k], rv = r[k], v;
      if (same(lv, rv)) v = lv;
      else if (same(lv, bv)) v = rv;
      else if (same(rv, bv)) v = lv;
      else { v = newerIsRemote ? rv : lv; conflicts.push(k === 'title' ? 'the page title' : k === 'settings' ? 'the page settings' : k === 'hero' ? 'the banner' : k); }
      if (v !== undefined) out[k] = clone(v);
    });
    // blocks: content by id; order from whichever side moved blocks (this browser, if both did)
    var B = byId(b.blocks), L = byId(l.blocks), R = byId(r.blocks);
    var ids = (b.blocks || []).map(function (x) { return x.id; }), lo = (l.blocks || []).map(function (x) { return x.id; }), ro = (r.blocks || []).map(function (x) { return x.id; });
    var keep = {};
    function decide(id) {
      var bb = B[id], ll = L[id], rr = R[id];
      if (ll && rr) {
        if (same(ll, rr) || (bb && same(rr, bb))) return ll;
        if (bb && same(ll, bb)) return rr;
        conflicts.push('block "' + blockName(newerIsRemote ? rr : ll) + '"');
        return newerIsRemote ? rr : ll;
      }
      if (ll) return bb && same(ll, bb) ? null : ll;
      if (rr) return bb && same(rr, bb) ? null : rr;
      return null;
    }
    lo.concat(ro).forEach(function (id) { if (keep[id] === undefined) keep[id] = decide(id); });
    var primary = same(lo, ids) ? ro : lo, secondary = primary === ro ? lo : ro;
    var order = primary.filter(function (id) { return keep[id]; });
    // blocks only the other side has: at the end if they were added at the end there, otherwise after the block
    // they follow there
    secondary.forEach(function (id, i) {
      if (!keep[id] || order.indexOf(id) !== -1) return;
      var last = secondary.slice(i + 1).every(function (x) { return !keep[x]; });
      if (last) { order.push(id); return; }
      var j = i - 1; while (j >= 0 && order.indexOf(secondary[j]) === -1) j--;
      order.splice(j >= 0 ? order.indexOf(secondary[j]) + 1 : 0, 0, id);
    });
    out.blocks = order.map(function (id) { return clone(keep[id]); });
    // saved versions: everyone's, newest first, 15 kept
    var revs = mergeItems(b.revisions, l.revisions, r.revisions, function (x) { return x; }, [], function () { return ''; });
    revs.sort(function (x, y) { return (y.at || '') > (x.at || '') ? 1 : -1; });
    out.revisions = clone(revs.slice(0, 15));
    out.updatedAt = (l.updatedAt || '') > (r.updatedAt || '') ? l.updatedAt : r.updatedAt;
    return { page: out, conflicts: conflicts };
  }

  /* ---------------------------------------------------------------- the open project
     link = which project this browser is working on; base = the copy last synced with the cloud:
     { meta, metaVersion, pages: { id: { v: version, d: page, del: deleted } } } */
  var link = null, baseCopy = null;
  var status = { kind: 'idle', message: '' };
  var applying = false, pushing = null, pushAgain = false, pushTimer = null, lastPull = 0, pulling = null;
  var hooks = { onApplied: function () {}, onMedia: function () {}, onStatus: function () {}, onLive: function () {}, onPresence: function () {}, onSignedOut: function () {} };

  function linkKey() { return 'leeds-cms:project:' + me(); }
  function saveLink() { if (me()) writeJson(linkKey(), link); }
  function lastProject() { return me() ? readJson(linkKey()) : null; }
  function canEdit() { return !!(link && session && link.role !== 'viewer'); }
  function setStatus(kind, message) { status = { kind: kind, message: message || '' }; hooks.onStatus(api.state()); emit(); }
  function baseKey(id) { return 'cloudBase:' + me() + ':' + id; }
  function loadBase() {
    if (baseCopy) return Promise.resolve(baseCopy);
    if (!link) return Promise.resolve(null);
    return M.kvGet(baseKey(link.projectId)).then(function (b) { baseCopy = b && b.pages ? b : null; return baseCopy; });
  }
  function saveBase() { return link && baseCopy ? M.kvSet(baseKey(link.projectId), baseCopy) : Promise.resolve(false); }
  function localMeta(index) { return { site: Store.data.site, sections: Store.data.sections, media: index || (baseCopy && baseCopy.meta && baseCopy.meta.media) || [] }; }
  function contentOfMeta(m) { return m ? { site: m.site, sections: m.sections } : null; }
  function stopSync() { clearTimeout(pushTimer); pushTimer = null; }

  /* put colleagues' changes into the open project. changes: { pages: { id: page | null (removed) }, meta } */
  function apply(changes, conflicts) {
    var info = { pages: [], added: [], removed: [], sections: false, site: false, conflicts: conflicts || [] };
    applying = true;
    try {
      var live = Store.data;
      Object.keys(changes.pages || {}).forEach(function (id) {
        // a copy of its own: the page that arrived is also kept as the synced base, and the two must never be the
        // same object, or edits here would change the base too and never be sent
        var p = clone(changes.pages[id]), i = live.pages.findIndex(function (x) { return x.id === id; });
        if (!p) { if (i !== -1) { live.pages.splice(i, 1); info.removed.push(id); } return; }
        if (i === -1) { live.pages.push(p); info.added.push(id); }
        else if (!same(live.pages[i], p)) { live.pages[i] = p; info.pages.push(id); }
      });
      if (changes.meta) {
        if (!same(live.site, changes.meta.site)) { live.site = clone(changes.meta.site); info.site = true; }
        if (!same(live.sections, changes.meta.sections)) { live.sections = clone(changes.meta.sections); info.sections = true; }
      }
      if (info.pages.length || info.added.length || info.removed.length || info.site || info.sections) { Store.migrate(); Store.save(); }
    } finally { applying = false; }
    if (info.pages.length || info.added.length || info.removed.length || info.site || info.sections || info.conflicts.length) hooks.onApplied(info);
    return info;
  }

  function schedulePush(ms) {
    if (!canEdit()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { push(); }, ms == null ? 2000 : ms);
    if (status.kind !== 'syncing') setStatus('pending', 'Changes waiting to upload');
  }
  /* run tasks a few at a time */
  function pool(items, size, fn) {
    var i = 0, out = [];
    function worker() { if (i >= items.length) return Promise.resolve(); var k = i++; return fn(items[k]).then(function (r) { out[k] = r; return worker(); }); }
    var ws = []; for (var n = 0; n < Math.min(size, items.length); n++) ws.push(worker());
    return Promise.all(ws).then(function () { return out; });
  }

  /* send what changed: meta if it changed, and each changed, new or deleted page. A clash on one page fetches the
     cloud copy of that page, merges it in and tries again. */
  function push() {
    if (!canEdit()) return Promise.resolve(false);
    if (pushing) { pushAgain = true; return pushing; }
    clearTimeout(pushTimer);
    var projectId = link.projectId, conflicts = [];
    setStatus('syncing', 'Saving to the cloud…');
    pushing = loadBase().then(function (b) {
      if (!b) return pull(true);
      return uploadMissingMedia(projectId, Store.data, (b.meta && b.meta.media) || []).then(function (index) {
        return pushMeta(index, 0, conflicts);
      }).then(function () {
        var bp = baseCopy.pages, liveIds = {};
        var changed = Store.data.pages.filter(function (p) { liveIds[p.id] = 1; var e = bp[p.id]; return !e || e.del || !same(p, e.d); });
        var deleted = Object.keys(bp).filter(function (id) { return !liveIds[id] && !bp[id].del; });
        return pool(changed.map(function (p) { return p.id; }), 4, function (id) { return pushPage(projectId, id, 0, conflicts); })
          .then(function () { return pool(deleted, 4, function (id) { return pushDelete(projectId, id, conflicts); }); });
      }).then(function () { return saveBase(); });
    }).then(function () {
      if (conflicts.length) hooks.onApplied({ pages: [], added: [], removed: [], conflicts: conflicts });
      if (link && link.projectId === projectId) { link.lastSync = nowIso(); saveLink(); setStatus('synced', 'Saved to the cloud'); }
    }, function (e) {
      if (e.lost) { setStatus('error', e.message); hooks.onApplied({ pages: [], lost: true, message: e.message }); }
      else if (e.signedOut) setStatus('signedout', 'Signed out: changes stay in this browser until you sign in');
      else if (e.status === 403 || /permission denied|row-level security/i.test(e.message)) { if (link) { link.role = 'viewer'; saveLink(); } setStatus('viewer', 'You can view this project but not change it'); }
      else { setStatus(e.offline ? 'offline' : 'error', e.message); if (link && link.projectId === projectId) schedulePush(30000); }
    }).then(function () {
      pushing = null;
      if (pushAgain) { pushAgain = false; schedulePush(300); }
    });
    return pushing;
  }
  function pushMeta(index, n, conflicts) {
    var b = baseCopy, mine = localMeta(index);
    if (b.meta && same(contentOfMeta(mine), contentOfMeta(b.meta)) && same(mine.media, b.meta.media)) return Promise.resolve();
    var sent = clone(mine);
    return patchProject(link.projectId, b.metaVersion, { meta: sent }).then(function (row) {
      if (row) { b.meta = sent; b.metaVersion = row.version; return; }
      return getMeta(link.projectId).then(function (remote) {
        if (!remote) throw lostAccess();
        if (n >= 3) throw new Error('The project keeps changing; will try again shortly.');
        var m = mergeMeta(b.meta, localMeta(index), remote.meta || {});
        m.meta.media = mergeItems((b.meta || {}).media, index, (remote.meta || {}).media, function (x) { return x; }, [], function () { return ''; });
        conflicts.push.apply(conflicts, m.conflicts);
        b.meta = remote.meta || {}; b.metaVersion = remote.version;
        apply({ meta: m.meta }, []);
        return downloadMissingMedia(link.projectId, m.meta.media).then(function () { return pushMeta(m.meta.media, n + 1, conflicts); });
      });
    });
  }
  function pushPage(projectId, id, n, conflicts) {
    var live = Store.getPage(id); if (!live || !link || link.projectId !== projectId) return Promise.resolve();
    var sent = clone(live), e = baseCopy.pages[id], req;
    if (!e) req = insertPage(projectId, sent);
    else {
      var s = splitPage(sent), bs = splitPage(e.d), cols = {};
      if (!same(s.data, bs.data)) cols.data = s.data;
      if (!same(s.source, bs.source)) cols.source = s.source;
      if (!same(s.revisions, bs.revisions)) cols.revisions = s.revisions;
      if (e.del) { cols.deleted_at = null; cols.data = s.data; }
      if (!Object.keys(cols).length) { e.d = sent; return Promise.resolve(); }
      req = patchPage(projectId, id, e.v, cols);
    }
    return req.then(function (row) {
      if (row) { baseCopy.pages[id] = { v: row.version, d: sent, del: false }; return; }
      // someone saved this page first: merge their copy in and try again
      if (n >= 3) throw new Error('This page keeps changing; will try again shortly.');
      return getPages(projectId, [id]).then(function (rows) {
        var r = rows && rows[0];
        if (!r) { delete baseCopy.pages[id]; return pushPage(projectId, id, n + 1, conflicts); }
        var remote = joinPage(r), cur = Store.getPage(id) || sent;
        var m = mergePage(e ? e.d : null, cur, remote);
        conflicts.push.apply(conflicts, m.conflicts.map(function (c) { return c + ' on "' + (cur.title || 'a page') + '"'; }));
        baseCopy.pages[id] = { v: r.version, d: remote, del: !!r.deleted_at };
        var ch = {}; ch[id] = m.page; apply({ pages: ch }, []);
        return pushPage(projectId, id, n + 1, conflicts);
      });
    });
  }
  function pushDelete(projectId, id, conflicts) {
    var e = baseCopy.pages[id];
    return patchPage(projectId, id, e.v, { deleted_at: nowIso() }).then(function (row) {
      if (row) { e.v = row.version; e.del = true; return; }
      return getPages(projectId, [id]).then(function (rows) {
        var r = rows && rows[0];
        if (!r) { delete baseCopy.pages[id]; return; }
        var remote = joinPage(r);
        baseCopy.pages[id] = { v: r.version, d: remote, del: !!r.deleted_at };
        if (r.deleted_at) return;
        if (same(remote, e.d)) return pushDelete(projectId, id, conflicts);
        // a colleague changed the page this browser deleted: keep their version
        conflicts.push('"' + (remote.title || 'a page') + '" (deleted here, changed by a colleague, so it was kept)');
        var ch = {}; ch[id] = remote; apply({ pages: ch }, []);
      });
    });
  }
  function lostAccess() { var e = new Error('This project was deleted or is no longer shared with you.'); e.lost = true; return e; }

  /* bring in colleagues' changes. Without a base (first open, or a copy from an older version) every page is
     fetched; otherwise only the pages whose version changed. */
  function pull(force) {
    if (!link || !session) return Promise.resolve(false);
    if (pulling) return pulling;
    if (pushing && !force) return pushing.then(function () { return pull(); });
    var projectId = link.projectId, conflicts = [];
    lastPull = Date.now();
    pulling = loadBase().then(function (b) {
      var first = !b;
      if (first) baseCopy = { meta: null, metaVersion: 0, pages: {} };
      return Promise.all([getMeta(projectId), pageVersions(projectId)]).then(function (res) {
        var remoteMeta = res[0], versions = res[1] || [];
        if (!remoteMeta) throw lostAccess();
        if (!link || link.projectId !== projectId) return false;
        link.name = remoteMeta.name; saveLink();
        var bp = baseCopy.pages, want = [], seen = {};
        versions.forEach(function (v) { seen[v.id] = 1; var e = bp[v.id]; if (!e || e.v !== v.version || e.del !== !!v.deleted_at) want.push(v.id); });
        var gone = Object.keys(bp).filter(function (id) { return !seen[id]; });
        return getPages(projectId, want.length ? want : []).then(function (rows) {
          var changes = { pages: {} }, viewer = link.role === 'viewer';
          (want.length ? rows : []).forEach(function (r) {
            var remote = joinPage(r), e = bp[r.id], cur = Store.getPage(r.id);
            var del = !!r.deleted_at;
            bp[r.id] = { v: r.version, d: remote, del: del };
            if (del) {
              // deleted in the cloud: remove here too, unless this browser changed it since
              if (cur && (viewer || !e || e.del || same(cur, e.d))) changes.pages[r.id] = null;
              else if (cur && e && !e.del) conflicts.push('"' + (cur.title || 'a page') + '" (deleted by a colleague, but changed here, so it was kept)');
              return;
            }
            if (!cur) {
              // new in the cloud, or deleted here: a page this browser deleted stays deleted unless a colleague changed it
              if (e && !e.del && same(remote, e.d) && !viewer && !first) return;
              changes.pages[r.id] = remote; return;
            }
            if (viewer || !e) { if (!e && !first) { var mm = mergePage(null, cur, remote); conflicts.push.apply(conflicts, mm.conflicts.map(function (c) { return c + ' on "' + (cur.title || 'a page') + '"'; })); changes.pages[r.id] = mm.page; } else changes.pages[r.id] = viewer ? remote : mergePage(null, cur, remote).page; return; }
            if (same(cur, e.d) || same(cur, remote)) { if (!same(cur, remote)) changes.pages[r.id] = remote; return; }
            var m = mergePage(e.d, cur, remote);
            conflicts.push.apply(conflicts, m.conflicts.map(function (c) { return c + ' on "' + (cur.title || 'a page') + '"'; }));
            changes.pages[r.id] = m.page;
          });
          // removed for good in the cloud
          gone.forEach(function (id) { var cur = Store.getPage(id), e = bp[id]; delete bp[id]; if (cur && (!e || same(cur, e.d))) changes.pages[id] = null; });
          // meta after pages, so sections point at pages that are here
          if (remoteMeta.version !== baseCopy.metaVersion || first) {
            var rm = remoteMeta.meta || {};
            var mm2 = viewer ? { meta: rm, conflicts: [] } : mergeMeta(first ? null : baseCopy.meta, localMeta(), rm);
            if (!rm.site && Store.data.site) mm2.meta.site = Store.data.site;
            conflicts.push.apply(conflicts, mm2.conflicts);
            baseCopy.meta = rm; baseCopy.metaVersion = remoteMeta.version;
            changes.meta = mm2.meta;
          }
          apply(changes, conflicts);
          return saveBase().then(function () { return downloadMissingMedia(projectId, (baseCopy.meta || {}).media); }).then(function () {
            if (!link || link.projectId !== projectId) return false;
            if (canEdit() && hasLocalChanges()) schedulePush(300);
            else setStatus(link.role === 'viewer' ? 'viewer' : 'synced', link.role === 'viewer' ? 'View only' : 'Up to date');
            link.lastSync = nowIso(); saveLink();
            return true;
          });
        });
      });
    }).catch(function (e) {
      if (e.lost) { setStatus('error', e.message); hooks.onApplied({ pages: [], lost: true, message: e.message }); }
      else if (e.signedOut) setStatus('signedout', 'Signed out: changes stay in this browser until you sign in');
      else setStatus(e.offline ? 'offline' : 'error', e.message);
      return false;
    }).then(function (r) { pulling = null; return r; });
    return pulling;
  }
  /* a colleague saved one page: fetch just that page */
  function pullPage(id) {
    if (!link || !session || pushing || pulling) return pull();
    var projectId = link.projectId;
    return Promise.all([loadBase(), getPages(projectId, [id])]).then(function (res) {
      var b = res[0], r = res[1] && res[1][0];
      if (!b || !r || !link || link.projectId !== projectId) return pull();
      var e = b.pages[id]; if (e && e.v === r.version) return false;
      var remote = joinPage(r), cur = Store.getPage(id), changes = { pages: {} }, conflicts = [];
      b.pages[id] = { v: r.version, d: remote, del: !!r.deleted_at };
      if (r.deleted_at) { if (cur && (!e || same(cur, e.d))) changes.pages[id] = null; }
      else if (!cur) { if (!(e && !e.del && same(remote, e.d))) changes.pages[id] = remote; }
      else if (link.role === 'viewer' || (e && same(cur, e.d))) changes.pages[id] = remote;
      else { var m = mergePage(e ? e.d : null, cur, remote); conflicts = m.conflicts.map(function (c) { return c + ' on "' + (cur.title || 'a page') + '"'; }); changes.pages[id] = m.page; }
      apply(changes, conflicts);
      return saveBase().then(function () { if (canEdit() && hasLocalChanges()) schedulePush(300); return true; });
    }).catch(function () { return pull(); });
  }
  function hasLocalChanges() {
    if (!baseCopy || !Store.data) return false;
    if (!baseCopy.meta || !same(contentOfMeta(localMeta()), contentOfMeta(baseCopy.meta))) return true;
    var live = {};
    var changed = Store.data.pages.some(function (p) { live[p.id] = 1; var e = baseCopy.pages[p.id]; return !e || e.del || !same(p, e.d); });
    return changed || Object.keys(baseCopy.pages).some(function (id) { return !live[id] && !baseCopy.pages[id].del; });
  }

  /* open a cloud project: straight from this browser's copy when there is one (then synced in the background),
     otherwise downloaded first. Resolves { cached } once the project is in Store. */
  function openProject(id, role, name) {
    if (link && link.projectId !== id && canEdit() && pushTimer) push();
    stopSync(); baseCopy = null;
    link = { projectId: id, role: role || 'editor', name: name || '', lastSync: null };
    saveLink(); emit();
    var skey = storeKey(id);
    return Store.open(skey).then(function (found) {
      if (found) {
        setStatus('syncing', 'Checking for changes…');
        pull().then(function () { presenceSoon(); });
        return { cached: true };
      }
      // the copy an older version of the CMS kept in localStorage, if it belongs to this project
      var old = readJson(LEGACY_LINK_KEY), legacy = Store.legacy();
      var takeOver = old && old.projectId === id && legacy;
      setStatus('syncing', 'Downloading the project…');
      if (takeOver) {
        Store.use(skey, legacy); Store.legacyDone();
        return M.kvGet('cloudBase:' + id).then(function (s) {
          var ob = null; try { ob = typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { ob = null; }
          // the old shared copy becomes the base, so edits made in this browser and not yet uploaded are kept
          baseCopy = { meta: null, metaVersion: 0, pages: {} };
          ((ob && ob.pages) || []).forEach(function (p) { baseCopy.pages[p.id] = { v: -1, d: p, del: false }; });
          if (ob) baseCopy.meta = { site: ob.site, sections: ob.sections, media: ob.media || [] };
          return pull();
        }).then(function () { presenceSoon(); return { cached: false, tookOver: true }; });
      }
      Store.use(skey, { site: {}, pages: [], sections: [] });
      return pull(true).then(function (ok) {
        if (!ok && status.kind === 'error') throw new Error(status.message);
        presenceSoon();
        return { cached: false };
      });
    });
  }
  function closeProject() {
    var flushed = canEdit() && (pushTimer || pushing) ? push().catch(function () {}) : Promise.resolve();
    return flushed.then(function () { stopSync(); link = null; baseCopy = null; saveLink(); presence.state = {}; liveStop(); emit(); return Store.close(); });
  }
  /* a new cloud project from data ({ site, pages, sections }), opened in this browser */
  function createProject(name, data) {
    return request('POST', '/rest/v1/projects?select=id,name,version,updated_at', { name: name, meta: { site: data.site || {}, sections: data.sections || [], media: [] } }, { Prefer: 'return=representation' }).then(function (rows) {
      var row = rows && rows[0]; if (!row) throw new Error('The project could not be created');
      stopSync();
      link = { projectId: row.id, role: 'owner', name: row.name, lastSync: null };
      saveLink();
      baseCopy = { meta: { site: data.site || {}, sections: data.sections || [], media: [] }, metaVersion: row.version, pages: {} };
      Store.use(storeKey(row.id), data);
      return push().then(function () { emit(); presenceSoon(); return row; });
    });
  }
  function rename(name) {
    if (!link) return Promise.resolve(null);
    var go = function (n) {
      return getMetaVersion(link.projectId).then(function (v) {
        if (!v) throw lostAccess();
        return patchProject(link.projectId, v.version, { name: name }).then(function (row) {
          if (!row) { if (n > 2) throw new Error('Could not rename; try again.'); return go(n + 1); }
          if (baseCopy && baseCopy.metaVersion === v.version) baseCopy.metaVersion = row.version;
          link.name = row.name; saveLink(); emit(); return row;
        });
      });
    };
    return go(0);
  }
  function renameProject(id, version, name) { return patchProject(id, version, { name: name }); }

  /* ---------------------------------------------------------------- history and deleted pages */
  function history(id) { return rpc('project_history_list', { p_project: id }); }
  function historyData(historyId) { return request('GET', '/rest/v1/project_history?id=eq.' + encodeURIComponent(historyId) + '&select=data,version,saved_at').then(function (r) { return (r && r[0]) || null; }); }
  /* put an hourly copy back: site settings and sections, and every page when the copy is of the whole project
     (made before pages had their own table). Saved as the newest version, so it can be undone. */
  function restoreHistory(historyId) {
    return historyData(historyId).then(function (h) {
      if (!h) throw new Error('That copy no longer exists');
      var d = h.data || {};
      applying = true;
      try {
        if (d.site) Store.data.site = clone(d.site);
        if (d.sections) Store.data.sections = clone(d.sections);
        if (Array.isArray(d.pages)) Store.data.pages = clone(d.pages);
        Store.migrate(); Store.save();
      } finally { applying = false; }
      return downloadMissingMedia(link.projectId, d.media).then(function () { return push(); });
    });
  }
  function pageHistory(pageId) { return rpc('page_history_list', { p_project: link.projectId, p_page: pageId }); }
  /* put an hourly copy of a page back into the open project (it is then saved as usual) */
  function restorePageCopy(historyId) {
    return request('GET', '/rest/v1/page_history?id=eq.' + encodeURIComponent(historyId) + '&select=page_id,data').then(function (r) {
      var h = r && r[0]; if (!h) throw new Error('That copy no longer exists');
      var cur = Store.getPage(h.page_id); if (!cur) throw new Error('That page is not in the project any more');
      var d = h.data || {};
      ['title', 'slug', 'template', 'status', 'settings', 'hero', 'blocks'].forEach(function (k) { if (d[k] !== undefined) cur[k] = clone(d[k]); });
      cur.updatedAt = nowIso();
      Store.save();
      return cur;
    });
  }
  function deletedPages() { return rpc('deleted_pages', { p_project: link.projectId }); }
  function restoreDeleted(pageId) {
    var projectId = link.projectId;
    return getPages(projectId, [pageId]).then(function (rows) {
      var r = rows && rows[0]; if (!r) throw new Error('That page was removed for good');
      return patchPage(projectId, pageId, r.version, { deleted_at: null }).then(function (row) {
        if (!row) throw new Error('Someone changed that page just now; try again.');
        var p = joinPage(r);
        return loadBase().then(function () {
          if (baseCopy) baseCopy.pages[pageId] = { v: row.version, d: p, del: false };
          var ch = {}; ch[pageId] = p; apply({ pages: ch }, []);
          return saveBase().then(function () { return p; });
        });
      });
    });
  }
  function purgePage(pageId) { return rpc('purge_page', { p_project: link.projectId, p_page: pageId }); }

  /* ---------------------------------------------------------------- review: comments and sign-off
     Stored in their own tables, outside the project document, so they never clash with page edits. */
  function needLink() { if (!link) { var e = new Error('Comments and sign-off need a cloud project: open one from Projects.'); e.noLink = true; throw e; } return link.projectId; }
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
    setComments: function (token, allow) { return rpc('set_share_link_comments', { p_token: token, p_allow: !!allow }); },
    setApprovals: function (token, allow) { return rpc('set_share_link_approvals', { p_token: token, p_allow: !!allow }); }
  };

  /* ---------------------------------------------------------------- live updates and presence (Supabase Realtime)
     One channel per project. It carries changes to the project's row in project_pings (a page, the site settings,
     comments, sign-off or Jadu ticks changed) and presence: who has the project open, on which page and block.
     Speaks the Realtime websocket protocol directly, so no library is needed. If the connection fails it retries
     with growing gaps; the minute-by-minute check carries on regardless. */
  var live = { ws: null, topic: '', ref: 0, beat: null, retry: 0, retryTimer: null, joined: false, projectId: null };
  var presence = { mine: { page: null, block: null, editing: false }, state: {}, timer: null };
  var COLOURS = ['#156265', '#7a3e9d', '#b35c00', '#1d4f91', '#9b0018', '#2f6b2f', '#8a5a00', '#5b4bb7'];
  function colourFor(id) { var h = 0; String(id || '').split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return COLOURS[h % COLOURS.length]; }
  function wsUrl() { return base().replace(/^http/i, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(key()) + '&vsn=1.0.0'; }
  function liveSend(msg) { if (live.ws && live.ws.readyState === 1) { msg.ref = String(++live.ref); live.ws.send(JSON.stringify(msg)); } }
  function liveToken(t) { if (live.joined) liveSend({ topic: live.topic, event: 'access_token', payload: { access_token: t } }); }
  function liveStop() {
    clearInterval(live.beat); clearTimeout(live.retryTimer); live.retryTimer = null;
    var was = live.joined;
    if (live.ws) { live.ws.onclose = null; try { live.ws.close(); } catch (e) {} }
    live.ws = null; live.joined = false; live.projectId = null; presence.state = {};
    if (was) { listeners.forEach(function (fn) { try { fn(api.state()); } catch (e) {} }); hooks.onPresence([]); }
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
        liveSend({ topic: live.topic, event: 'phx_join', join_ref: '1', payload: { config: { broadcast: { ack: false, self: false }, presence: { key: me() || '', enabled: true }, postgres_changes: [{ event: '*', schema: 'public', table: 'project_pings', filter: 'project_id=eq.' + pid }], private: false }, access_token: t } });
        live.beat = setInterval(function () { liveSend({ topic: 'phoenix', event: 'heartbeat', payload: {} }); }, 25000);
      };
      ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (x) { return; } onLive(m); };
      ws.onclose = function () {
        clearInterval(live.beat); live.ws = null;
        var was = live.joined; live.joined = false; presence.state = {};
        if (was) { listeners.forEach(function (fn) { try { fn(api.state()); } catch (x) {} }); hooks.onPresence([]); }
        if (link && session && live.projectId === pid) live.retryTimer = setTimeout(function () { live.retryTimer = null; if (live.projectId === pid) liveStart(); }, Math.min(60000, 2000 * Math.pow(2, live.retry++)));
      };
      ws.onerror = function () {};
    }).catch(function () { live.projectId = null; });
  }
  function onLive(m) {
    if (!m || m.topic !== live.topic) return;
    if (m.event === 'phx_reply' && m.payload && m.payload.status === 'ok' && !live.joined) { live.joined = true; live.retry = 0; listeners.forEach(function (fn) { try { fn(api.state()); } catch (e) {} }); track(); return; }
    if (m.event === 'phx_reply' && m.payload && m.payload.status === 'error') { try { live.ws.close(); } catch (e) {} return; }
    if (m.event === 'presence_state') { presence.state = {}; mergePresence(m.payload || {}, {}); return; }
    if (m.event === 'presence_diff') { mergePresence((m.payload || {}).joins || {}, (m.payload || {}).leaves || {}); return; }
    if (m.event !== 'postgres_changes') return;
    var d = (m.payload && m.payload.data) || {}, rec = d.record || d.new || {};
    var mine = session && session.user && rec.by_user && rec.by_user === session.user.id;
    if (rec.kind === 'project' || rec.kind === 'page') {
      if (mine) return;
      if (rec.kind === 'page' && rec.page_id) pullPage(rec.page_id); else if (!pushing && Date.now() - lastPull > 1500) pull();
      return;
    }
    hooks.onLive({ kind: rec.kind, pageId: rec.page_id || null, mine: !!mine });
  }
  /* presence: each key (a person) has one entry per open tab ("metas") */
  function mergePresence(joins, leaves) {
    Object.keys(joins).forEach(function (k) { var cur = presence.state[k] || []; var add = (joins[k] && joins[k].metas) || []; presence.state[k] = cur.filter(function (x) { return !add.some(function (a) { return a.phx_ref === x.phx_ref; }); }).concat(add); });
    Object.keys(leaves).forEach(function (k) { var gone = ((leaves[k] && leaves[k].metas) || []).map(function (x) { return x.phx_ref; }); presence.state[k] = (presence.state[k] || []).filter(function (x) { return gone.indexOf(x.phx_ref) === -1; }); if (!presence.state[k].length) delete presence.state[k]; });
    hooks.onPresence(people());
  }
  /* everyone else with the project open: their most recent tab */
  function people() {
    var self = me();
    return Object.keys(presence.state).filter(function (k) { return k && k !== self; }).map(function (k) {
      var metas = presence.state[k].slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); }), p = metas[0] || {};
      return { id: k, name: p.name || 'A colleague', page: p.page || null, block: p.block || null, editing: !!p.editing, colour: colourFor(k), tabs: metas.length };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }
  function track() {
    if (!live.joined) return;
    var name = (profile && profile.name) || String((session && session.user.email) || '').split('@')[0];
    liveSend({ topic: live.topic, event: 'presence', payload: { type: 'presence', event: 'track', payload: { name: name, page: presence.mine.page, block: presence.mine.block, editing: presence.mine.editing, at: Date.now() } } });
  }
  function presenceSoon() { clearTimeout(presence.timer); presence.timer = setTimeout(function () { ensureLive(); track(); }, 300); }
  function setPresence(fields) {
    var next = Object.assign({}, presence.mine, fields || {});
    if (same(next, presence.mine)) return;
    presence.mine = next; presenceSoon();
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') ensureLive(); });

  /* ---------------------------------------------------------------- email notification choices (per person, per project) */
  var notify = {
    prefs: function () { return reviewCall('my_notify_prefs').then(function (rows) { return (rows && rows[0]) || { available: false, signoff: true, comments: false }; }); },
    set: function (signoff, comments) { return reviewCall('set_notify_prefs', { p_signoff: !!signoff, p_comments: !!comments }); }
  };

  /* every local save schedules an upload */
  Store.onSave = function () { if (!applying && canEdit()) schedulePush(); };

  /* colleagues' changes: checked every minute while the tab is visible, and when coming back to it */
  setInterval(function () { if (link && session && document.visibilityState === 'visible' && Date.now() - lastPull > 55000) pull(); }, 15000);
  window.addEventListener('focus', function () { if (link && session && Date.now() - lastPull > 20000) pull(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && pushTimer && canEdit()) push(); });
  window.addEventListener('online', function () { if (link && session) pull(); });

  var api = {
    configured: configured, keyProblem: keyProblem, url: base,
    // accounts
    signIn: signIn, signUp: signUp, resendConfirmation: resendConfirmation, requestReset: requestReset, consumeRedirect: consumeRedirect,
    signOut: signOut, changePassword: changePassword,
    user: function () { return session ? session.user : null; },
    profile: getProfile, cachedProfile: function () { return profile; }, setName: setName, setOnboarded: setOnboarded,
    loadDomains: loadDomains, emailAllowed: emailAllowed, domainsText: domainsText,
    // projects
    lastProject: lastProject, legacyLink: function () { return readJson(LEGACY_LINK_KEY); }, forgetLegacyLink: function () { writeJson(LEGACY_LINK_KEY, null); },
    link: function () { return link ? clone(link) : null; },
    canEdit: canEdit,
    state: function () { return { configured: configured(), user: session ? session.user : null, link: link ? clone(link) : null, status: clone(status), live: live.joined }; },
    listProjects: listProjects, openProject: openProject, closeProject: closeProject, createProject: createProject, deleteProject: deleteProject,
    rename: rename, renameProject: renameProject, leave: leave,
    members: members, share: share, cancelInvite: cancelInvite, unshare: unshare,
    history: history, restoreHistory: restoreHistory, pageHistory: pageHistory, restorePageCopy: restorePageCopy,
    deletedPages: deletedPages, restoreDeleted: restoreDeleted, purgePage: purgePage,
    push: push, pull: pull, hasLocalChanges: hasLocalChanges, mergePage: mergePage, mergeMeta: mergeMeta,
    review: review, shares: shares, notify: notify, live: function () { return live.joined; },
    presence: { set: setPresence, people: people, colour: colourFor },
    on: function (fn) { listeners.push(fn); },
    setHooks: function (h) { Object.keys(h || {}).forEach(function (k) { hooks[k] = h[k]; }); }
  };
  window.UOL_CLOUD = api;
})();
