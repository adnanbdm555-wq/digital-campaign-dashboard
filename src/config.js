require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  sessionSecret: process.env.SESSION_SECRET || 'change-me-please',
  refreshSecret: process.env.REFRESH_SECRET || '',
  cronSchedule: process.env.CRON_SCHEDULE || '0 */6 * * *', // every 6 hours by default

  meta: {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    apiVersion: process.env.META_API_VERSION || 'v20.0',
    accessToken: process.env.META_ACCESS_TOKEN || 'EAAMQnHVbeZAsBSeuJOk7ptVp1t9NuPARWuuExbLPC89DQ5rbDDwflSFZAnpaoIwwn8uU0ZASwVZAPc2k1n8tZB11c6LIJwukfqwDiEWgVbAk50MZBA9zAjnyFvTKwXBZAz4ZAryFBAVkRQdkZCKynzgmMTGEcppUeUFgFaGPf3KQQWZClSgDxwvQABj5y3gSi3E3fD2R4CV8rEzvShO9N6nadJ9MYEkGjjShlNheTL',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  },
  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID || '',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || '',
  },
};
