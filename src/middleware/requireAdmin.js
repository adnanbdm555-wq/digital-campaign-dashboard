const store = require('../store');

/**
 * Blocks anyone who isn't logged in as an admin. Run this after
 * requireAuth (or standalone — it checks the session itself either way).
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return req.originalUrl.startsWith('/api')
      ? res.status(401).json({ error: 'Not logged in' })
      : res.redirect('/login.html');
  }
  const user = store.findUserById(req.session.userId);
  if (!user || user.role !== 'admin') {
    return req.originalUrl.startsWith('/api')
      ? res.status(403).json({ error: 'Admin access required' })
      : res.redirect('/');
  }
  next();
}

module.exports = requireAdmin;
