const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../store');

const router = express.Router();
router.use(express.json());

// Mounted behind requireAdmin in server.js — every handler here already
// knows the requester is an admin.

router.get('/users', (req, res) => {
  const detailed = store.getUsersSummary().map((u) => {
    const tokens = store.getTokens(u.id);
    const settings = store.getSettings(u.id);
    const status = store.getStatus(u.id);
    return {
      ...u,
      metaConnected: !!tokens.meta,
      googleConnected: !!tokens.google?.refresh_token,
      linkedinConnected: !!tokens.linkedin?.access_token,
      settings,
      lastSync: status.lastSync,
      lastError: status.lastError,
    };
  });
  res.json(detailed);
});

router.post('/users', async (req, res) => {
  const { username, password, displayName, role } = req.body || {};
  if (!username || !password || String(password).length < 6) {
    return res.status(400).json({ error: 'Username and a password (6+ characters) are required.' });
  }
  if (store.findUserByUsername(username)) {
    return res.status(400).json({ error: 'That username is already taken.' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = store.createUser({ username: username.trim(), passwordHash, displayName, role });
  res.json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
});

router.post('/users/:id/role', (req, res) => {
  const { role } = req.body || {};
  if (role !== 'admin' && role !== 'user') {
    return res.status(400).json({ error: 'Role must be "admin" or "user".' });
  }
  if (req.params.id === req.session.userId && role !== 'admin') {
    return res.status(400).json({ error: "You can't remove your own admin access." });
  }
  const updated = store.updateUserRole(req.params.id, role);
  if (!updated) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

// Read-only view into one user's data — what dashboard.html?as={id} fetches.
// Never exposes password hashes or raw OAuth tokens, same as /users above.
router.get('/users/:id/campaign-data', (req, res) => {
  const user = store.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(store.getCampaignData(req.params.id));
});

module.exports = router;
