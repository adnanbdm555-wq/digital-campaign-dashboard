const cron = require('node-cron');
const config = require('./config');
const store = require('./store');
const metaService = require('./services/metaService');
const googleService = require('./services/googleService');
const linkedinService = require('./services/linkedinService');
const tiktokService = require('./services/tiktokService');

function dateRange(days) {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { since: fmt(since), until: fmt(until) };
}

async function runSyncForUser(userId) {
  const tokens = store.getTokens(userId);
  const settings = store.getSettings(userId);
  const { since, until } = dateRange(settings.dateRangeDays || 30);
  const results = {};
  const errors = [];

  if (tokens.meta && settings.metaAdAccountId) {
    try {
      Object.assign(results, await metaService.pullInsights({
        accessToken: tokens.meta.accessToken,
        adAccountId: settings.metaAdAccountId,
        resultActionType: settings.metaResultActionType,
        since,
        until,
      }));
    } catch (e) {
      errors.push('Meta: ' + (e.response?.data?.error?.message || e.message));
    }
  }

  if (tokens.google?.refresh_token && settings.ga4PropertyId) {
    try {
      Object.assign(results, await googleService.pullGA4({
        refreshToken: tokens.google.refresh_token,
        propertyId: settings.ga4PropertyId,
        since,
        until,
      }));
    } catch (e) {
      errors.push('GA4: ' + e.message);
    }
  }

  if (tokens.google?.refresh_token) {
    try {
      Object.assign(results, await googleService.pullYouTube({
        refreshToken: tokens.google.refresh_token,
        channelId: settings.youtubeChannelId || 'MINE',
        since,
        until,
      }));
    } catch (e) {
      errors.push('YouTube: ' + e.message);
    }
  }

  if (tokens.linkedin?.access_token && settings.linkedinAdAccountId) {
    try {
      Object.assign(results, await linkedinService.pullInsights({
        accessToken: tokens.linkedin.access_token,
        adAccountId: settings.linkedinAdAccountId,
        since,
        until,
      }));
    } catch (e) {
      errors.push('LinkedIn: ' + (e.response?.data?.message || e.message));
    }
  }

  Object.assign(results, await tiktokService.pullTikTok());

  store.saveApiData(userId, { ...store.getApiData(userId), ...results });
  store.saveStatus(userId, {
    lastSync: new Date().toISOString(),
    lastError: errors.length ? errors.join(' | ') : null,
  });

  return { results, errors };
}

async function runSyncAllUsers() {
  const users = store.getUsers();
  for (const user of users) {
    try {
      await runSyncForUser(user.id);
    } catch (e) {
      console.error(`Sync failed for user "${user.username}":`, e.message);
    }
  }
}

function start() {
  cron.schedule(config.cronSchedule, () => {
    runSyncAllUsers().catch((err) => console.error('Scheduled sync failed:', err));
  });
  console.log(`Scheduler active — auto-syncing every registered user on schedule "${config.cronSchedule}"`);
}

module.exports = { start, runSyncForUser, runSyncAllUsers };
