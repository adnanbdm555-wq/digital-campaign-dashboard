const store = require('../store');
const { getUserIdFromRequest } = require('../sessionHelper');

/**
 * Blocks anyone who isn't logged in as an admin. Run this after
 * requireAuth (or standalone — it checks the session itself either way).
 */
function requireAdmin(req, res, next) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return req.originalUrl.startsWith('/api')
      ? res.status(401).json({ error: 'Not logged in' })
      : res.redirect('/login.html');
  }
  req.session.userId = userId;
  const user = store.findUserById(userId);
  if (!user || user.role !== 'admin') {
    return req.originalUrl.startsWith('/api')
      ? res.status(403).json({ error: 'Admin access required' })
      : res.redirect('/');
  }
  next();
}

module.exports = requireAdmin;
