// Password login for the CRM. The password lives in the ADMIN_PASSWORD
// environment variable on Vercel; the session is a signed, HTTP-only cookie.
const crypto = require('crypto');

const COOKIE = 'crm_session';
const DAYS = 14;

function secret() {
  const pw = process.env.ADMIN_PASSWORD || '';
  const extra = process.env.SESSION_SECRET || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  return crypto.createHash('sha256').update('crm:' + pw + ':' + extra).digest();
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function passwordSet() {
  return (process.env.ADMIN_PASSWORD || '').length >= 8;
}

function checkPassword(pw) {
  return passwordSet() && safeEqual(pw, process.env.ADMIN_PASSWORD);
}

function cookieHeader(value, maxAge) {
  const secure = process.env.VERCEL ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

function issue(res) {
  const exp = Date.now() + DAYS * 864e5;
  const value = exp + '.' + sign(String(exp));
  res.setHeader('Set-Cookie', cookieHeader(value, DAYS * 86400));
}

function clear(res) {
  res.setHeader('Set-Cookie', cookieHeader('', 0));
}

function readCookie(req) {
  const raw = req.headers.cookie || '';
  const m = raw.split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  return m ? m.slice(COOKIE.length + 1) : '';
}

function isAuthed(req) {
  if (!passwordSet()) return false;
  const v = readCookie(req);
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp));
}

module.exports = { passwordSet, checkPassword, issue, clear, isAuthed };
