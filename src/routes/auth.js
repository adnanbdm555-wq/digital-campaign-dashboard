const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config');
const store = require('../store');
const metaService = require('../services/metaService');
const googleService = require('../services/googleService');
const linkedinService = require('../services/linkedinService');

const router = express.Router();
router.use(express.json());

// ---- Account login / signup ----
// Every user gets their own account and their own connected social accounts —
// data further down is always scoped by req.session.userId, never shared.

// Tells the signup page whether it should show the form or a "closed" message.
router.get('/signup-status', (req, res) => {
  res.json({ open: store.getUsers().length === 0 });
});

const { createSessionCookie, clearSessionCookie, getUserIdFromRequest, createOAuthState, verifyOAuthState } = require('../sessionHelper');

router.post('/signup', async (req, res) => {
  const { username, password, displayName } = req.body || {};
  if (!username || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Username and a password (6+ characters) are required.' });
  }
  // Open signup only ever creates the very first account, which becomes the
  // admin. Every account after that is created by the admin from /admin.html.
  if (store.getUsers().length > 0) {
    return res.status(403).json({ error: 'Signups are closed — ask your admin to create an account for you.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = store.createUser({ username: username.trim(), passwordHash, displayName, role: 'admin' });
  if (req.session) req.session.userId = user.id;
  res.setHeader('Set-Cookie', createSessionCookie(user.id));
  res.json({ ok: true });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = store.findUserByUsername(username || '');
  const ok = user && (await bcrypt.compare(password || '', user.passwordHash));
  if (!ok) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  if (req.session) req.session.userId = user.id;
  res.setHeader('Set-Cookie', createSessionCookie(user.id));
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie());
  if (req.session) {
    req.session.destroy(() => res.json({ ok: true }));
  } else {
    res.json({ ok: true });
  }
});

function getRedirectUri(req, callbackPath) {
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || (req.secure || host.includes('vercel.app') ? 'https' : req.protocol || 'http');
  return `${proto}://${host}${callbackPath}`;
}

// ---- Meta (Facebook + Instagram) ----
router.get('/meta', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.redirect('/login.html');
  const state = createOAuthState(userId);
  const redirectUri = getRedirectUri(req, '/auth/meta/callback');
  res.redirect(metaService.getLoginUrl(redirectUri, state));
});

router.get('/meta/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = verifyOAuthState(state) || getUserIdFromRequest(req);
  if (!userId) {
    return res.status(400).send('Invalid or expired login attempt — please go back and click Connect again.');
  }
  try {
    const redirectUri = getRedirectUri(req, '/auth/meta/callback');
    const shortLived = await metaService.exchangeCodeForToken(code, redirectUri);
    const longLived = await metaService.exchangeForLongLivedToken(shortLived);
    const tokens = store.getTokens(userId, req);
    tokens.meta = { accessToken: longLived, connectedAt: new Date().toISOString() };
    store.saveTokens(userId, tokens);
    res.setHeader('Set-Cookie', [
      createSessionCookie(userId),
      createDataCookie('meta_token', tokens.meta)
    ]);
    res.redirect('/?connected=meta');
  } catch (e) {
    console.error('Meta auth error:', e.response?.data || e.message);
    res.status(500).send('Meta connection failed — ' + (e.response?.data?.error?.message || e.message));
  }
});

// ---- Google (YouTube + GA4) ----
router.get('/google', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.redirect('/login.html');
  const state = createOAuthState(userId);
  const redirectUri = getRedirectUri(req, '/auth/google/callback');
  res.redirect(googleService.getLoginUrl(redirectUri, state));
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = verifyOAuthState(state) || getUserIdFromRequest(req);
  if (!userId) {
    return res.status(400).send('Invalid or expired login attempt — please go back and click Connect again.');
  }
  try {
    const redirectUri = getRedirectUri(req, '/auth/google/callback');
    const newTokens = await googleService.exchangeCodeForTokens(code, redirectUri);
    const tokens = store.getTokens(userId);
    tokens.google = {
      ...(tokens.google || {}),
      ...newTokens,
      refresh_token: newTokens.refresh_token || tokens.google?.refresh_token,
      connectedAt: new Date().toISOString(),
    };
    store.saveTokens(userId, tokens);
    res.setHeader('Set-Cookie', createSessionCookie(userId));
    res.redirect('/?connected=google');
  } catch (e) {
    console.error('Google auth error:', e.message);
    res.status(500).send('Google connection failed — ' + e.message);
  }
});

// ---- LinkedIn (Ad Analytics) ----
router.get('/linkedin', (req, res) => {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.redirect('/login.html');
  const state = createOAuthState(userId);
  const redirectUri = getRedirectUri(req, '/auth/linkedin/callback');
  res.redirect(linkedinService.getLoginUrl(redirectUri, state));
});

router.get('/linkedin/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = verifyOAuthState(state) || getUserIdFromRequest(req);
  if (!userId) {
    return res.status(400).send('Invalid or expired login attempt — please go back and click Connect again.');
  }
  try {
    const redirectUri = getRedirectUri(req, '/auth/linkedin/callback');
    const newTokens = await linkedinService.exchangeCodeForToken(code, redirectUri);
    const tokens = store.getTokens(userId);
    tokens.linkedin = { ...newTokens, connectedAt: new Date().toISOString() };
    store.saveTokens(userId, tokens);
    res.setHeader('Set-Cookie', createSessionCookie(userId));
    res.redirect('/?connected=linkedin');
  } catch (e) {
    console.error('LinkedIn auth error:', e.response?.data || e.message);
    res.status(500).send('LinkedIn connection failed — ' + (e.response?.data?.message || e.message));
  }
});

module.exports = router;

