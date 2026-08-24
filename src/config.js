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
    clientId: process.env.LINKEDIN_CLIENT_ID || '7796fgme5lknej',
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || Buffer.from('V1BMX0FQMS5ZTWt0ZldLVjR4MW1PTDExLlRxVEN4QT09', 'base64').toString('utf8'),
    accessToken: process.env.LINKEDIN_ACCESS_TOKEN || 'AQVo9C_tqLG3wKnlDqALSYcrW4SdN_ImV_ebvavwtsNMdeUIeQt5EDb28ovvPztpAQcBRbwy4aCfK2qTgRsu3aGAGmd0YGTsmoS6rXQJ5ZX70gf82S32RN4XM5kFHA7YZz8Yao4BcpWNaxw8CDRqmJFFOCXfwRSZGkJzXm6A0ZkdcrNvWlN9EEhMwzbt_WdhYE_5Fax-6dI2s_TqWXFmC-cfHpQPJhU_-gqX7a7-HqL3rGdOo0AdekjNtK3A-KTwy2LKQXhmQ1qJc9V4-PtJlk8UtlrQ0SWhmqLg8lOMaGfZVXZgOkeuIXJ4h5JryS58F66fTMROiX5Lopdf0s-tdcxhwk3quQ',
  },
};
