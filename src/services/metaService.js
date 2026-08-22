const axios = require('axios');
const config = require('../config');

const GRAPH = `https://graph.facebook.com/${config.meta.apiVersion}`;

function getLoginUrl(redirectUri, state) {
  const scopes = ['ads_read', 'read_insights', 'pages_read_engagement', 'business_management'].join(',');
  const params = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: redirectUri,
    scope: scopes,
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/${config.meta.apiVersion}/dialog/oauth?${params.toString()}`;
}

async function exchangeCodeForToken(code, redirectUri) {
  const res = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      redirect_uri: redirectUri,
      code,
    },
  });
  return res.data.access_token;
}

async function exchangeForLongLivedToken(shortLivedToken) {
  const res = await axios.get(`${GRAPH}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: config.meta.appId,
      client_secret: config.meta.appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });
  return res.data.access_token; // long-lived (~60 days) — reconnect via /auth/meta before it expires
}

/**
 * Automatically fetches the active/latest campaign name, ad copy, and creative media (video/image)
 * from Meta Ads API so the dashboard top hero section populates automatically.
 */
async function fetchCampaignAndCreative({ accessToken, adAccountId }) {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  let campaignName = '';
  let campaignDesc = '';
  let creativeMediaUrl = '';

  try {
    // 1. Fetch campaigns from the ad account
    const campRes = await axios.get(`${GRAPH}/${account}/campaigns`, {
      params: {
        access_token: accessToken,
        fields: 'id,name,objective,status,created_time,start_time,stop_time',
        limit: 10,
      },
    });

    const campaigns = campRes.data.data || [];
    if (campaigns.length > 0) {
      const activeCamp = campaigns.find((c) => c.status === 'ACTIVE') || campaigns[0];
      campaignName = activeCamp.name || '';
    }

    // 2. Fetch ads with creative details (body, title, video_id, image_url, object_story_spec)
    const adsRes = await axios.get(`${GRAPH}/${account}/ads`, {
      params: {
        access_token: accessToken,
        fields: 'id,name,status,creative{id,name,title,body,image_url,thumbnail_url,video_id,object_story_spec,effective_object_story_id}',
        limit: 10,
      },
    });

    const ads = adsRes.data.data || [];
    if (ads.length > 0) {
      const activeAd = ads.find((a) => a.status === 'ACTIVE') || ads[0];
      const creative = activeAd.creative || {};

      campaignDesc = creative.body || creative.title || '';

      const spec = creative.object_story_spec || {};
      if (spec.video_data) {
        if (!campaignDesc && spec.video_data.message) campaignDesc = spec.video_data.message;
        if (!campaignDesc && spec.video_data.title) campaignDesc = spec.video_data.title;
        if (spec.video_data.image_url) creativeMediaUrl = spec.video_data.image_url;
        if (spec.video_data.video_id) {
          try {
            const vidRes = await axios.get(`${GRAPH}/${spec.video_data.video_id}`, {
              params: {
                access_token: accessToken,
                fields: 'id,source,picture,title,description',
              },
            });
            if (vidRes.data.source) {
              creativeMediaUrl = vidRes.data.source;
            } else if (vidRes.data.picture && !creativeMediaUrl) {
              creativeMediaUrl = vidRes.data.picture;
            }
            if (!campaignDesc && vidRes.data.description) {
              campaignDesc = vidRes.data.description;
            }
          } catch (e) {
            console.warn('Video fetch warning:', e.message);
          }
        }
      } else if (spec.link_data) {
        if (!campaignDesc && spec.link_data.message) campaignDesc = spec.link_data.message;
        if (!campaignDesc && spec.link_data.name) campaignDesc = spec.link_data.name;
        if (!campaignDesc && spec.link_data.description) campaignDesc = spec.link_data.description;
        if (spec.link_data.picture) creativeMediaUrl = spec.link_data.picture;
      }

      if (!creativeMediaUrl) {
        creativeMediaUrl = creative.image_url || creative.thumbnail_url || '';
      }

      if (creative.video_id && (!creativeMediaUrl || !creativeMediaUrl.endsWith('.mp4'))) {
        try {
          const vidRes = await axios.get(`${GRAPH}/${creative.video_id}`, {
            params: {
              access_token: accessToken,
              fields: 'id,source,picture,title,description',
            },
          });
          if (vidRes.data.source) {
            creativeMediaUrl = vidRes.data.source;
          } else if (vidRes.data.picture && !creativeMediaUrl) {
            creativeMediaUrl = vidRes.data.picture;
          }
          if (!campaignDesc && vidRes.data.description) {
            campaignDesc = vidRes.data.description;
          }
        } catch (e) {
          console.warn('Video fetch warning:', e.message);
        }
      }

      // If description is still empty, use ad name or campaign name
      if (!campaignDesc) {
        campaignDesc = activeAd.name || campaignName || '';
      }
    }
  } catch (err) {
    console.warn('Could not auto-fetch campaign creative:', err.response?.data?.error?.message || err.message);
  }

  return { campaignName, campaignDesc, creativeMediaUrl };
}

/**
 * Pulls everything the dashboard's Meta-fed fields need for one ad account
 * over a date range. Runs the four breakdown queries Meta requires
 * separately (Insights only allows certain breakdown combinations per call)
 * and merges them into the same flat shape applyState() expects.
 */
async function pullInsights({ accessToken, adAccountId, resultActionType, since, until }) {
  const timeRange = JSON.stringify({ since, until });
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const base = { access_token: accessToken, time_range: timeRange };

  async function safeGet(params) {
    try {
      const res = await axios.get(`${GRAPH}/${account}/insights`, { params: { ...base, ...params } });
      return res.data;
    } catch (e) {
      console.warn('Meta insights subquery warning:', e.response?.data?.error?.message || e.message);
      return { data: [] };
    }
  }

  const overall = await axios.get(`${GRAPH}/${account}/insights`, { params: { ...base, fields: 'reach,spend,actions,impressions,clicks,cpm' } });
  const [byPlatform, byAgeGender, byRegion, metaCreative] = await Promise.all([
    safeGet({ fields: 'reach', breakdowns: 'publisher_platform' }),
    safeGet({ fields: 'reach,spend', breakdowns: 'age,gender' }),
    safeGet({ fields: 'spend', breakdowns: 'region' }),
    fetchCampaignAndCreative({ accessToken, adAccountId }),
  ]);

  const out = {};

  // ---- Campaign Name, Description & Creative Media (Auto-detected from Meta) ----
  if (metaCreative.campaignName) out.campaignName = metaCreative.campaignName;
  if (metaCreative.campaignDesc) out.campaignDesc = metaCreative.campaignDesc;
  if (metaCreative.creativeMediaUrl) out.creativeMediaUrl = metaCreative.creativeMediaUrl;

  // ---- Overall reach / spend / cost-per-result ----
  const overallRow = (overall.data.data || [])[0] || {};
  out.reach = Math.round(Number(overallRow.reach || 0));
  out.spend = +Number(overallRow.spend || 0).toFixed(2);

  if (resultActionType && overallRow.actions) {
    const match = overallRow.actions.find((a) => a.action_type === resultActionType);
    const results = match ? Number(match.value) : 0;
    out.cpr = results ? +(out.spend / results).toFixed(2) : 0;
  } else {
    // No result action type configured (campaign objective determines what "a result" is,
    // so this needs your input) — falls back to cost per 1000 reached as a rough proxy.
    out.cpr = out.reach ? +((out.spend / out.reach) * 1000).toFixed(2) : 0;
  }

  // ---- Platform breakdown — feeds the donut directly ----
  const platformMap = { facebook: 'fbReach', instagram: 'igReach', messenger: 'msReach' };
  (byPlatform.data.data || []).forEach((row) => {
    const key = platformMap[row.publisher_platform];
    if (key) out[key] = Math.round(Number(row.reach || 0));
  });

  // ---- Gender totals ----
  let menReach = 0, womenReach = 0, menSpend = 0, womenSpend = 0;
  (byAgeGender.data.data || []).forEach((row) => {
    const reach = Number(row.reach || 0), spend = Number(row.spend || 0);
    if (row.gender === 'male') { menReach += reach; menSpend += spend; }
    if (row.gender === 'female') { womenReach += reach; womenSpend += spend; }
  });
  out.menReach = Math.round(menReach);
  out.womenReach = Math.round(womenReach);
  out.menSpend = +menSpend.toFixed(2);
  out.womenSpend = +womenSpend.toFixed(2);
  out.menCpr = menReach ? +((menSpend / menReach) * 1000).toFixed(2) : 0;
  out.womenCpr = womenReach ? +((womenSpend / womenReach) * 1000).toFixed(2) : 0;

  // ---- Age spend buckets — matches the dashboard's 4 fixed bands ----
  const ageBuckets = {
    ageSpend0: ['25-34'],
    ageSpend1: ['35-44'],
    ageSpend2: ['45-54'],
    ageSpend3: ['55-64', '65+'],
  };
  Object.keys(ageBuckets).forEach((key) => (out[key] = 0));
  (byAgeGender.data.data || []).forEach((row) => {
    const bucket = Object.keys(ageBuckets).find((key) => ageBuckets[key].includes(row.age));
    if (bucket) out[bucket] += Number(row.spend || 0);
  });
  Object.keys(ageBuckets).forEach((key) => (out[key] = +out[key].toFixed(2)));

  // ---- Location breakdown ----
  const regionSpend = {};
  let totalRegionSpend = 0;
  (byRegion.data.data || []).forEach((row) => {
    const spend = Number(row.spend || 0);
    regionSpend[row.region] = (regionSpend[row.region] || 0) + spend;
    totalRegionSpend += spend;
  });
  out._regionBreakdown = Object.entries(regionSpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([region, spend]) => ({
      region,
      pct: totalRegionSpend ? +((spend / totalRegionSpend) * 100).toFixed(1) : 0,
    }));

  return out;
}

module.exports = { getLoginUrl, exchangeCodeForToken, exchangeForLongLivedToken, pullInsights, fetchCampaignAndCreative };
