// Vercel serverless function, run once a day by the cron job in vercel.json.
// Supabase's free plan pauses a project after a week with no activity. This makes one small database request so
// that never happens, even when nobody opens the CMS for a while (holidays, quiet weeks).
// It reads the project address and public key from assets/cms/cloud-config.js, so there is nothing else to set up.
// The request looks up a review link that cannot exist: it reads nothing and changes nothing, but it is real
// database activity. If CRON_SECRET is set in Vercel, only Vercel's own scheduler can call this.

const fs = require('fs');
const path = require('path');

function readConfig() {
  try {
    const src = fs.readFileSync(path.join(process.cwd(), 'assets', 'cms', 'cloud-config.js'), 'utf8');
    const url = (/url\s*:\s*['"]([^'"]*)['"]/.exec(src) || [])[1] || '';
    const key = (/anonKey\s*:\s*['"]([^'"]*)['"]/.exec(src) || [])[1] || '';
    return { url: url.trim().replace(/\/+$/, ''), key: key.trim() };
  } catch (e) {
    return { url: '', key: '' };
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.authorization || '') !== 'Bearer ' + secret) return send(res, 401, { ok: false, reason: 'Not allowed' });
  const cfg = readConfig();
  if (!cfg.url || !cfg.key) return send(res, 200, { ok: false, reason: 'Cloud saving is not set up in assets/cms/cloud-config.js' });
  if (/^sb_secret_/i.test(cfg.key)) return send(res, 500, { ok: false, reason: 'cloud-config.js holds a secret key; use the publishable key' });
  const headers = { 'Content-Type': 'application/json', apikey: cfg.key };
  if (/^eyJ/.test(cfg.key)) headers.Authorization = 'Bearer ' + cfg.key;
  const started = Date.now();
  try {
    const r = await fetch(cfg.url + '/rest/v1/rpc/get_shared_project', { method: 'POST', headers: headers, body: JSON.stringify({ p_token: '0'.repeat(64) }) });
    await r.text();
    // a paused project answers with an error status; Vercel's logs then show it
    return send(res, r.ok ? 200 : 502, { ok: r.ok, status: r.status, ms: Date.now() - started, at: new Date().toISOString() });
  } catch (e) {
    return send(res, 502, { ok: false, reason: 'Could not reach Supabase: ' + e.message });
  }
};
