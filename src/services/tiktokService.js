/**
 * TikTok's Marketing API requires an approved developer app plus advertiser
 * access before any automated pull can run — there's no way around that
 * approval step, and it can take a while.
 *
 * This file is wired into the scheduler as a no-op placeholder so nothing
 * else in the app needs to change once you're approved — just fill in the
 * real call below.
 *
 * Real endpoint once approved:
 *   GET https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/
 *   Docs: https://business-api.tiktok.com/portal/docs
 *
 * Until then, use the "Manual Overrides" form on the control panel
 * (index.html) to keep TikTok numbers flowing into the dashboard —
 * they'll persist across syncs same as an API-pulled field would.
 */
async function pullTikTok() {
  return {};
}

module.exports = { pullTikTok };
