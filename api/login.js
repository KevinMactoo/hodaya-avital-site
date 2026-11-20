// CRM login. GET: session status. POST {password}: sign in. DELETE: sign out.
const store = require('../lib/store');
const auth = require('../lib/auth');
const { send, body, str, clientIp } = require('../lib/util');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return send(res, 200, { authed: auth.isAuthed(req), passwordSet: auth.passwordSet(), dbConnected: store.configured() });
  }
  if (req.method === 'DELETE') {
    auth.clear(res);
    return send(res, 200, { ok: true });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!auth.passwordSet()) return send(res, 503, { error: 'Set ADMIN_PASSWORD (8+ characters) in Vercel first.' });

  try {
    if (store.configured() && !(await store.rateLimit('login:' + clientIp(req), 10, 900))) {
      return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    }
  } catch (e) { /* if the database is down, still allow login */ }

  if (!auth.checkPassword(str(body(req).password, 200))) return send(res, 401, { error: 'Wrong password.' });
  auth.issue(res);
  return send(res, 200, { ok: true });
};
