const axios = require('axios');
const config = require('../config');

const LI_VERSION = '202401'; // LinkedIn requires a versioned header on REST calls — bump periodically

function getLoginUrl(redirectUri, state) {
  const scopes = process.env.LINKEDIN_SCOPES || 'openid profile email w_member_social';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.linkedin.clientId,
    redirect_uri: redirectUri,
    state,
    scope: scopes,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

async function exchangeCodeForToken(code, redirectUri) {
  const res = await axios.post(
    'https://www.linkedin.com/oauth/v2/accessToken',
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: config.linkedin.clientId,
      client_secret: config.linkedin.clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  // access_token is valid ~60 days. refresh_token is only present if your app has been
  // granted refresh-token support — otherwise you'll need to reconnect via /auth/linkedin
  // periodically, same as Meta's long-lived token pattern.
  return res.data; // { access_token, expires_in, refresh_token? }
}

/**
 * Pulls campaign-level ad analytics for one LinkedIn ad account over a date range.
 * LinkedIn's Ad Analytics API doesn't expose a "reach" metric the way Meta does for most
 * campaign types — impressions is used as the closest available proxy here, same spirit as
 * the CPM-style proxy used for Meta's Cost Per Result when no result action type is set.
 */
async function pullInsights({ accessToken, adAccountId, since, until }) {
  const toDateParts = (isoDate) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    return `(year:${y},month:${m},day:${d})`;
  };
  const dateRange = `(start:${toDateParts(since)},end:${toDateParts(until)})`;
  const account = adAccountId.startsWith('urn:li:sponsoredAccount:')
    ? adAccountId
    : `urn:li:sponsoredAccount:${adAccountId}`;

  const res = await axios.get('https://api.linkedin.com/rest/adAnalytics', {
    params: {
      q: 'analytics',
      pivot: 'ACCOUNT',
      dateRange,
      'accounts[0]': account,
      fields: 'impressions,clicks,costInLocalCurrency',
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': LI_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  const row = (res.data.elements || [])[0] || {};
  return {
    liReach: Math.round(Number(row.impressions || 0)), // proxy — see note above
  };
}

module.exports = { getLoginUrl, exchangeCodeForToken, pullInsights };
