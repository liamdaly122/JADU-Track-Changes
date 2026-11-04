// Vercel serverless function: the hosted version of serve.ps1's /__proxy.
// Lets "Import by URL" and image exports fetch pages and images from leeds.ac.uk, which the browser alone blocks (CORS).
// Deliberately narrow: only http(s) addresses on leeds.ac.uk or its subdomains, redirects are re-checked, size is capped.
// vercel.json routes /__proxy to this file, so the CMS code is the same locally and online.

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function allowed(u) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    return host === 'leeds.ac.uk' || host.endsWith('.leeds.ac.uk');
  } catch (e) {
    return false;
  }
}

function text(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(message);
}

module.exports = async (req, res) => {
  const target = req.query && req.query.url ? String(req.query.url) : '';
  if (!allowed(target)) return text(res, 400, 'Only leeds.ac.uk addresses can be fetched through this proxy.');
  try {
    let url = target;
    let response;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(url, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeedsPrototypingCMS/1.0)', Accept: '*/*' }
      });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        const next = new URL(location, url).href;
        if (!allowed(next)) return text(res, 400, 'That address redirects outside leeds.ac.uk.');
        url = next;
        continue;
      }
      break;
    }
    if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) return text(res, 413, 'Too large');
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_BYTES) return text(res, 413, 'Too large');
    res.statusCode = response.status;
    res.setHeader('Content-Type', response.headers.get('content-type') || 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=0');
    res.end(body);
  } catch (e) {
    return text(res, 502, 'Could not fetch ' + target + ': ' + e.message);
  }
};
