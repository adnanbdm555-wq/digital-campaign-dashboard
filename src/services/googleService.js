const { google } = require('googleapis');
const config = require('../config');

function getOAuthClient(redirectUri) {
  return new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, redirectUri);
}

function getLoginUrl(redirectUri, state) {
  const oauth2Client = getOAuthClient(redirectUri);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // required to receive a refresh_token for unattended background syncs
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/yt-analytics.readonly',
      'https://www.googleapis.com/auth/analytics.readonly',
    ],
    state,
  });
}

async function exchangeCodeForTokens(code, redirectUri) {
  const oauth2Client = getOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  return tokens; // includes refresh_token — Google only sends this on the FIRST consent
}

function clientFromRefreshToken(refreshToken) {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

async function pullYouTube({ refreshToken, channelId, since, until }) {
  const auth = clientFromRefreshToken(refreshToken);
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth });
  const res = await youtubeAnalytics.reports.query({
    ids: channelId === 'MINE' ? 'channel==MINE' : `channel==${channelId}`,
    startDate: since,
    endDate: until,
    metrics: 'views',
  });
  const row = (res.data.rows && res.data.rows[0]) || [0];
  return { ytReach: Math.round(Number(row[0] || 0)) };
}

async function pullGA4({ refreshToken, propertyId, since, until }) {
  const auth = clientFromRefreshToken(refreshToken);
  const analyticsData = google.analyticsdata({ version: 'v1beta', auth });
  const res = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate: since, endDate: until }],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'conversions' }],
    },
  });
  const values = (res.data.rows && res.data.rows[0] && res.data.rows[0].metricValues) || [];
  return {
    gaSessions: Math.round(Number(values[0]?.value || 0)),
    gaUsers: Math.round(Number(values[1]?.value || 0)),
    gaConversions: Math.round(Number(values[2]?.value || 0)),
  };
}

module.exports = { getLoginUrl, exchangeCodeForTokens, pullYouTube, pullGA4 };
