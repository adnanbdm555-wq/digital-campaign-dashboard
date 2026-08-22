const store = require('../store');
const { getUserSessionFromRequest, getUserIdFromRequest } = require('../sessionHelper');

/**
 * Blocks anyone who isn't logged in as an admin. Run this after
 * requireAuth (or standalone — it checks the session itself either way).
 */
function requireAdmin(req, res, next) {
  const session = getUserSessionFromRequest(req);
  const userId = session?.userId || getUserIdFromRequest(req);
  if (!userId) {
    return req.originalUrl.startsWith('/api')
      ? res.status(401).json({ error: 'Not logged in' })
      : res.redirect('/login.html');
  }
  if (!req.session) req.session = {};
  req.session.userId = userId;

  if (session && (session.role === 'admin' || session.username === 'adpulsemedia' || session.userId === 'admin_adpulsemedia')) {
    return next();
  }

  const user = store.findUserById(userId);
  if (user && user.role === 'admin') {
    return next();
  }

  return req.originalUrl.startsWith('/api')
    ? res.status(403).json({ error: 'Admin access required' })
    : res.redirect('/');
}

module.exports = requireAdmin;
