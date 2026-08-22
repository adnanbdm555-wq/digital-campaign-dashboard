const express = require('express');
const store = require('../store');
const scheduler = require('../scheduler');

const router = express.Router();
router.use(express.json());

// Every route here is mounted behind requireAuth in server.js, so
// req.session.userId is always present by the time a handler runs.

router.get('/me', (req, res) => {
  const user = store.findUserById(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role || 'user' });
});

// What the dashboard's CONFIG.dataSourceUrl fetches — same-origin, so the
// session cookie travels with it automatically. Scoped to this user only.
router.get('/campaign-data', (req, res) => {
  res.json(store.getCampaignData(req.session.userId));
});

router.get('/status', (req, res) => {
  const tokens = store.getTokens(req.session.userId);
  res.json({
    ...store.getStatus(req.session.userId),
    metaConnected: !!tokens.meta,
    googleConnected: !!tokens.google?.refresh_token,
    linkedinConnected: !!tokens.linkedin?.access_token,
    settings: store.getSettings(req.session.userId),
    apiData: store.getApiData(req.session.userId),
    manualOverrides: store.getManualOverrides(req.session.userId),
  });
});

router.post('/settings', (req, res) => {
  store.saveSettings(req.session.userId, { ...store.getSettings(req.session.userId), ...req.body });
  res.json({ ok: true });
});

router.post('/manual', (req, res) => {
  store.saveManualOverrides(req.session.userId, { ...store.getManualOverrides(req.session.userId), ...req.body });
  res.json({ ok: true });
});

router.post('/refresh', async (req, res) => {
  try {
    const { results, errors } = await scheduler.runSyncForUser(req.session.userId);
    res.json({ ok: true, results, errors });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
