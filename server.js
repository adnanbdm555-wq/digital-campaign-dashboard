const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./src/config');
const store = require('./src/store');
const authRoutes = require('./src/routes/auth');
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');
const scheduler = require('./src/scheduler');
const requireAuth = require('./src/middleware/requireAuth');
const requireAdmin = require('./src/middleware/requireAdmin');

const app = express();

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: true,
}));

// Login/signup pages and their POST endpoints are the only unauthenticated routes.
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/signup.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'signup.html')));
app.use('/auth', authRoutes);

// Everything else requires a logged-in session.
app.use('/api/admin', requireAdmin, adminRoutes);
app.use('/api', requireAuth, apiRoutes);
app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/dashboard.html', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/admin.html', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

store.ensureAdminExists(); // one-time migration if accounts already exist from before roles were added

app.listen(config.port, () => {
  console.log(`Digital Campaign Dashboard`);
  console.log(`Control panel:  ${config.baseUrl}/  (redirects to /login.html if not signed in)`);
  console.log(`Dashboard:      ${config.baseUrl}/dashboard.html`);
  console.log(`Admin panel:    ${config.baseUrl}/admin.html  (admin accounts only)`);
  scheduler.start();
});

module.exports = app;

