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
 * Automatically fetches the active/specified campaign name, ad copy, and creative media (video/image)
 * from Meta Ads API so the dashboard top hero section populates automatically.
 */
async function fetchCampaignAndCreative({ accessToken, adAccountId, metaCampaignId }) {
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  let campaignName = '';
  let campaignDesc = '';
  let creativeMediaUrl = '';

  const get = async (url, params = {}) => {
    try {
      const res = await axios.get(url, { params: { access_token: accessToken, ...params } });
      return res.data;
    } catch (e) {
      return null;
    }
  };

  try {
    let targetCreativeIds = [];

    // 1. If metaCampaignId is provided
    if (metaCampaignId && metaCampaignId.trim()) {
      const id = metaCampaignId.trim();

      // Try reading as a Campaign / AdSet / Ad node
      const node = await get(`${GRAPH}/${id}`, { fields: 'id,name,objective,status' });
      if (node && node.name) campaignName = node.name;

      // Try fetching ads from this node (works for Campaign, AdSet)
      const nodeAds = await get(`${GRAPH}/${id}/ads`, { fields: 'id,name,status,creative', limit: 10 });
      if (nodeAds && nodeAds.data && nodeAds.data.length > 0) {
        for (const a of nodeAds.data) {
          if (!campaignDesc && a.name) campaignDesc = a.name;
          if (a.creative && a.creative.id) targetCreativeIds.push(a.creative.id);
        }
      }

      // If id was directly an Ad node
      const adDirect = await get(`${GRAPH}/${id}`, { fields: 'id,name,creative' });
      if (adDirect && adDirect.creative && adDirect.creative.id) {
        targetCreativeIds.push(adDirect.creative.id);
        if (!campaignDesc && adDirect.name) campaignDesc = adDirect.name;
      }
    }

    // 2. If no campaignName found yet, get active account campaign
    if (!campaignName) {
      const camps = await get(`${GRAPH}/${account}/campaigns`, { fields: 'id,name,status', limit: 10 });
      if (camps && camps.data && camps.data.length > 0) {
        const active = camps.data.find((c) => c.status === 'ACTIVE') || camps.data[0];
        campaignName = active.name || '';
      }
    }

    // 3. If targetCreativeIds is empty, get latest ads & adcreatives from account
    if (targetCreativeIds.length === 0) {
      const accountAds = await get(`${GRAPH}/${account}/ads`, { fields: 'id,name,status,creative', limit: 10 });
      if (accountAds && accountAds.data && accountAds.data.length > 0) {
        for (const a of accountAds.data) {
          if (a.creative && a.creative.id) targetCreativeIds.push(a.creative.id);
        }
      }
      const directCreatives = await get(`${GRAPH}/${account}/adcreatives`, { fields: 'id', limit: 10 });
      if (directCreatives && directCreatives.data && directCreatives.data.length > 0) {
        for (const c of directCreatives.data) {
          if (c.id && !targetCreativeIds.includes(c.id)) targetCreativeIds.push(c.id);
        }
      }
    }

    // 4. Inspect creative IDs to extract Video source, thumbnail, or image URL
    for (const crId of targetCreativeIds) {
      const cr = await get(`${GRAPH}/${crId}`, {
        fields: 'id,name,title,body,image_url,thumbnail_url,video_id,object_story_spec,effective_object_story_id,asset_feed_spec',
      });
      if (!cr) continue;

      if (!campaignDesc && (cr.body || cr.title)) campaignDesc = cr.body || cr.title;

      // Check asset_feed_spec (for Advantage+ and Dynamic Creative Ads)
      if (cr.asset_feed_spec) {
        const afs = cr.asset_feed_spec;
        if (afs.videos && Array.isArray(afs.videos) && afs.videos.length > 0) {
          const vidObj = afs.videos[0];
          if (vidObj.video_id) {
            const v = await get(`${GRAPH}/${vidObj.video_id}`, { fields: 'id,source,picture,title,description' });
            if (v) {
              if (v.source) { creativeMediaUrl = v.source; break; }
              if (v.picture && !creativeMediaUrl) creativeMediaUrl = v.picture;
            }
          }
          if (!creativeMediaUrl && vidObj.thumbnail_url) creativeMediaUrl = vidObj.thumbnail_url;
        }
        if (!creativeMediaUrl && afs.images && Array.isArray(afs.images) && afs.images.length > 0) {
          const imgObj = afs.images[0];
          if (imgObj.url) creativeMediaUrl = imgObj.url;
        }
        if (!campaignDesc && afs.bodies && afs.bodies[0]?.text) {
          campaignDesc = afs.bodies[0].text;
        }
      }

      // Check object_story_spec
      const spec = cr.object_story_spec || {};
      if (spec.video_data) {
        if (!campaignDesc && spec.video_data.message) campaignDesc = spec.video_data.message;
        if (!campaignDesc && spec.video_data.title) campaignDesc = spec.video_data.title;
        if (spec.video_data.image_url && !creativeMediaUrl) creativeMediaUrl = spec.video_data.image_url;
        if (spec.video_data.video_id) {
          const v = await get(`${GRAPH}/${spec.video_data.video_id}`, { fields: 'id,source,picture,title,description' });
          if (v) {
            if (v.source) { creativeMediaUrl = v.source; break; }
            if (v.picture && !creativeMediaUrl) creativeMediaUrl = v.picture;
          }
        }
      }
      if (spec.link_data) {
        if (!campaignDesc && spec.link_data.message) campaignDesc = spec.link_data.message;
        if (!campaignDesc && spec.link_data.name) campaignDesc = spec.link_data.name;
        if (!campaignDesc && spec.link_data.description) campaignDesc = spec.link_data.description;
        if (spec.link_data.picture && !creativeMediaUrl) creativeMediaUrl = spec.link_data.picture;
      }

      // Check direct video_id on creative
      if (cr.video_id) {
        const v = await get(`${GRAPH}/${cr.video_id}`, { fields: 'id,source,picture,title,description' });
        if (v) {
          if (v.source) { creativeMediaUrl = v.source; break; }
          if (v.picture && !creativeMediaUrl) creativeMediaUrl = v.picture;
        }
      }

      // Check effective_object_story_id (Facebook Page Post)
      if (cr.effective_object_story_id) {
        const post = await get(`${GRAPH}/${cr.effective_object_story_id}`, {
          fields: 'id,message,full_picture,source,attachments{media,media_type,unshimmed_url,url,subattachments}',
        });
        if (post) {
          if (post.source) { creativeMediaUrl = post.source; break; }
          if (post.full_picture && !creativeMediaUrl) creativeMediaUrl = post.full_picture;
          if (!campaignDesc && post.message) campaignDesc = post.message;
        }
      }

      if (!creativeMediaUrl && (cr.image_url || cr.thumbnail_url)) {
        creativeMediaUrl = cr.image_url || cr.thumbnail_url;
      }

      if (creativeMediaUrl) break;
    }

    // 5. Fallback: Query ad account's videos directly
    if (!creativeMediaUrl) {
      const vids = await get(`${GRAPH}/${account}/advideos`, { fields: 'id,source,picture,title,description,created_time', limit: 5 });
      if (vids && vids.data && vids.data.length > 0) {
        for (const v of vids.data) {
          if (v.source) { creativeMediaUrl = v.source; break; }
          if (v.picture && !creativeMediaUrl) creativeMediaUrl = v.picture;
          if (!campaignDesc && v.description) campaignDesc = v.description;
        }
      }
    }

    // 6. Fallback: Query ad account's images directly
    if (!creativeMediaUrl) {
      const imgs = await get(`${GRAPH}/${account}/adimages`, { fields: 'id,url,permalink_url', limit: 5 });
      if (imgs && imgs.data && imgs.data.length > 0) {
        for (const img of imgs.data) {
          if (img.url) { creativeMediaUrl = img.url; break; }
          if (img.permalink_url && !creativeMediaUrl) creativeMediaUrl = img.permalink_url;
        }
      }
    }
  } catch (err) {
    console.warn('Could not auto-fetch campaign creative:', err.message);
  }

  return { campaignName, campaignDesc, creativeMediaUrl };
}

/**
 * Pulls everything the dashboard's Meta-fed fields need for an ad account or specific campaign
 * over a date range.
 */
async function pullInsights({ accessToken, adAccountId, metaCampaignId, resultActionType, since, until }) {
  const timeRange = JSON.stringify({ since, until });
  const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const targetId = (metaCampaignId && metaCampaignId.trim()) ? metaCampaignId.trim() : account;
  const base = { access_token: accessToken, time_range: timeRange };

  async function safeGet(endpointId, params) {
    try {
      const res = await axios.get(`${GRAPH}/${endpointId}/insights`, { params: { ...base, ...params } });
      return res.data;
    } catch (e) {
      console.warn(`Meta insights subquery warning (${endpointId}):`, e.response?.data?.error?.message || e.message);
      return { data: [] };
    }
  }

  let overall = await safeGet(targetId, { fields: 'reach,spend,actions,impressions,clicks,cpm' });
  // Fallback to account if specific targetId insight was empty
  if ((!overall.data || overall.data.length === 0) && targetId !== account) {
    overall = await safeGet(account, { fields: 'reach,spend,actions,impressions,clicks,cpm' });
  }

  const [byPlatform, byAgeGender, byRegion, metaCreative] = await Promise.all([
    safeGet(targetId, { fields: 'reach,impressions,spend', breakdowns: 'publisher_platform' }),
    safeGet(targetId, { fields: 'reach,impressions,spend', breakdowns: 'age,gender' }),
    safeGet(targetId, { fields: 'reach,impressions,spend', breakdowns: 'region' }),
    fetchCampaignAndCreative({ accessToken, adAccountId, metaCampaignId }),
  ]);

  const out = {};

  // ---- Campaign Name, Description & Creative Media (Auto-detected from Meta) ----
  if (metaCreative.campaignName) out.campaignName = metaCreative.campaignName;
  if (metaCreative.campaignDesc) out.campaignDesc = metaCreative.campaignDesc;
  if (metaCreative.creativeMediaUrl) out.creativeMediaUrl = metaCreative.creativeMediaUrl;

  // ---- Overall reach / spend / cost-per-result ----
  const overallRow = (overall.data || [])[0] || {};
  out.reach = Math.round(Number(overallRow.reach || overallRow.impressions || 0));
  out.spend = +Number(overallRow.spend || 0).toFixed(2);

  if (resultActionType && overallRow.actions) {
    const match = overallRow.actions.find((a) => a.action_type === resultActionType);
    const results = match ? Number(match.value) : 0;
    out.cpr = results ? +(out.spend / results).toFixed(2) : 0;
  } else {
    out.cpr = out.reach ? +((out.spend / out.reach) * 1000).toFixed(2) : 0;
  }

  // ---- Platform breakdown — feeds the donut directly ----
  const platformMap = { facebook: 'fbReach', instagram: 'igReach', messenger: 'msReach', audience_network: 'msReach' };
  (byPlatform.data || []).forEach((row) => {
    const key = platformMap[row.publisher_platform];
    if (key) {
      const val = Math.round(Number(row.reach || row.impressions || 0));
      out[key] = (out[key] || 0) + val;
    }
  });

  // ---- Gender totals ----
  let menReach = 0, womenReach = 0, menSpend = 0, womenSpend = 0, menImp = 0, womenImp = 0;
  (byAgeGender.data || []).forEach((row) => {
    const reach = Number(row.reach || 0);
    const imp = Number(row.impressions || 0);
    const spend = Number(row.spend || 0);
    if (row.gender === 'male') { menReach += reach; menSpend += spend; menImp += imp; }
    if (row.gender === 'female') { womenReach += reach; womenSpend += spend; womenImp += imp; }
  });

  // If Meta omitted reach in demographic breakdown (Meta API v18+), apportion overall reach by gender spend/impressions
  const totalGenderSpend = menSpend + womenSpend;
  const totalGenderImp = menImp + womenImp;
  if (menReach === 0 && womenReach === 0 && out.reach > 0) {
    if (totalGenderImp > 0) {
      menReach = Math.round(out.reach * (menImp / totalGenderImp));
      womenReach = Math.round(out.reach * (womenImp / totalGenderImp));
    } else if (totalGenderSpend > 0) {
      menReach = Math.round(out.reach * (menSpend / totalGenderSpend));
      womenReach = Math.round(out.reach * (womenSpend / totalGenderSpend));
    }
  }

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
  (byAgeGender.data || []).forEach((row) => {
    const bucket = Object.keys(ageBuckets).find((key) => ageBuckets[key].includes(row.age));
    if (bucket) out[bucket] += Number(row.spend || 0);
  });
  Object.keys(ageBuckets).forEach((key) => (out[key] = +out[key].toFixed(2)));

  // ---- Post Engagement from Meta Actions ----
  if (overallRow.actions && Array.isArray(overallRow.actions)) {
    const pe = overallRow.actions.find((a) => a.action_type === 'post_engagement' || a.action_type === 'page_engagement');
    if (pe) {
      out.postEngagement = Math.round(Number(pe.value || 0));
    } else {
      const engagementTypes = ['post_reaction', 'comment', 'post', 'like', 'link_click', 'video_view'];
      const totalEng = overallRow.actions
        .filter((a) => engagementTypes.includes(a.action_type))
        .reduce((sum, a) => sum + Number(a.value || 0), 0);
      if (totalEng > 0) out.postEngagement = Math.round(totalEng);
    }
  }

  // ---- Location breakdown ----
  const regionSpend = {};
  let totalRegionSpend = 0;
  (byRegion.data || []).forEach((row) => {
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

  // Auto-map top regions to locName0..3 and locPct0..3 for direct dashboard display
  if (out._regionBreakdown && out._regionBreakdown.length > 0) {
    out._regionBreakdown.slice(0, 4).forEach((reg, i) => {
      out[`locName${i}`] = reg.region;
      out[`locPct${i}`] = reg.pct;
    });
  }

  return out;
}

module.exports = { getLoginUrl, exchangeCodeForToken, exchangeForLongLivedToken, pullInsights, fetchCampaignAndCreative };
