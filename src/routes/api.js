const express = require('express');
const store = require('../store');
const scheduler = require('../scheduler');
const { createDataCookie, getUserIdFromRequest } = require('../sessionHelper');

const router = express.Router();
router.use(express.json());

router.get('/me', (req, res) => {
  const userId = getUserIdFromRequest(req);
  const user = store.findUserById(userId);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role || 'user' });
});

router.get('/campaign-data', (req, res) => {
  const userId = getUserIdFromRequest(req);
  res.json(store.getCampaignData(userId, req));
});

router.get('/status', (req, res) => {
  const userId = getUserIdFromRequest(req);
  const tokens = store.getTokens(userId, req);
  res.json({
    ...store.getStatus(userId),
    metaConnected: !!(tokens.meta?.accessToken || tokens.meta),
    googleConnected: !!tokens.google?.refresh_token,
    linkedinConnected: !!tokens.linkedin?.access_token,
    settings: store.getSettings(userId, req),
    apiData: store.getApiData(userId, req),
    manualOverrides: store.getManualOverrides(userId),
  });
});

router.post('/settings', (req, res) => {
  const userId = getUserIdFromRequest(req);
  const updated = { ...store.getSettings(userId, req), ...req.body };
  store.saveSettings(userId, updated);
  res.setHeader('Set-Cookie', createDataCookie('camp_settings', updated));
  res.json({ ok: true, settings: updated });
});

router.post('/manual', (req, res) => {
  const userId = getUserIdFromRequest(req);
  store.saveManualOverrides(userId, { ...store.getManualOverrides(userId), ...req.body });
  res.json({ ok: true });
});

router.post('/refresh', async (req, res) => {
  const userId = getUserIdFromRequest(req);
  try {
    const { results, errors } = await scheduler.runSyncForUser(userId, req);
    if (results && Object.keys(results).length > 0) {
      res.setHeader('Set-Cookie', createDataCookie('camp_data', results));
    }
    res.json({ ok: true, results, errors });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
