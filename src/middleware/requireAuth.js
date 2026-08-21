/**
 * Guards a route behind login. Page requests bounce to /login.html;
 * API requests (anything under /api) get a 401 JSON response instead,
 * since the dashboard's fetch() calls need to detect "not logged in"
 * without following a redirect into an HTML page.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  if (req.originalUrl.startsWith('/api')) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  return res.redirect('/login.html');
}

module.exports = requireAuth;
