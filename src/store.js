/**
 * Storage layer. Every piece of campaign data (tokens, settings, pulled
 * data, manual overrides) is namespaced by userId, so each logged-in
 * person only ever reads or writes their own folder under
 * /data/user-data/{userId}/. Accounts live in /data/users.json.
 *
 * Plain JSON files — good enough for a small team running this
 * themselves. If this ever needs to scale past a handful of users
 * editing concurrently, swap this file for a real database (e.g.
 * SQLite via better-sqlite3, or Postgres) — nothing else in the app
 * needs to change, since every other file only talks to these functions.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDataFromCookie } = require('./sessionHelper');

const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const USER_DATA_DIR = path.join(DATA_DIR, 'user-data');

function ensureDirs() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  } catch (e) {
    console.error('Error ensuring dirs:', e);
  }
}
ensureDirs();


function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function userDir(userId) {
  const dir = path.join(USER_DATA_DIR, userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fileFor(userId, name) {
  return path.join(userDir(userId), name + '.json');
}

const DEFAULT_ADMIN = {
  id: 'admin_adpulsemedia',
  username: 'adpulsemedia',
  passwordHash: bcrypt.hashSync('admin12345', 10),
  displayName: 'Adnan Karim',
  role: 'admin',
  createdAt: '2025-01-01T00:00:00.000Z',
};

// ---- Accounts ----
function getUsers() {
  const list = readJson(USERS_FILE, []);
  if (!list.some((u) => u.username?.toLowerCase() === 'adpulsemedia' || u.id === 'admin_adpulsemedia')) {
    list.unshift(DEFAULT_ADMIN);
  }
  return list;
}
function saveUsers(users) {
  writeJson(USERS_FILE, users);
}
function findUserByUsername(username) {
  if (!username) return null;
  return getUsers().find((u) => u.username.toLowerCase() === String(username).toLowerCase());
}
function findUserById(id) {
  if (!id) return null;
  if (id === 'admin_adpulsemedia') return DEFAULT_ADMIN;
  return getUsers().find((u) => u.id === id);
}
function createUser({ username, passwordHash, displayName, role }) {
  const users = getUsers();
  const id = crypto.randomBytes(8).toString('hex');
  const user = {
    id,
    username,
    passwordHash,
    displayName: displayName || username,
    role: role === 'admin' ? 'admin' : 'user',
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}

function updateUserRole(id, role) {
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  users[idx].role = role === 'admin' ? 'admin' : 'user';
  saveUsers(users);
  return users[idx];
}

// Admin-facing listing — deliberately omits passwordHash and any raw
// OAuth tokens, even from the admin UI. Only connection status (booleans)
// and non-secret settings are ever surfaced.
function getUsersSummary() {
  return getUsers().map((u) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role || 'user',
    createdAt: u.createdAt,
  }));
}

function ensureAdminExists() {
  const users = getUsers();
  if (users.length === 0) {
    saveUsers([DEFAULT_ADMIN]);
    console.log('Default admin initialized: adpulsemedia');
    return;
  }
  if (!users.some((u) => u.role === 'admin')) {
    updateUserRole(users[0].id, 'admin');
  }
}

const store = {
  getUsers,
  findUserByUsername,
  findUserById,
  createUser,
  updateUserRole,
  getUsersSummary,
  ensureAdminExists,

  getTokens: (userId, req) => {
    const fileTokens = readJson(fileFor(userId, 'tokens'), {});
    const cookieMeta = getDataFromCookie(req, 'meta_token');
    const cookieGoogle = getDataFromCookie(req, 'google_token');
    const cookieLinkedin = getDataFromCookie(req, 'linkedin_token');
    return {
      ...fileTokens,
      meta: cookieMeta || fileTokens.meta,
      google: cookieGoogle || fileTokens.google,
      linkedin: cookieLinkedin || fileTokens.linkedin,
    };
  },
  saveTokens: (userId, tokens) => writeJson(fileFor(userId, 'tokens'), tokens),

  getSettings: (userId, req) => {
    const defaults = {
      metaAdAccountId: '',
      metaCampaignId: '',
      metaResultActionType: '', // e.g. 'lead', 'purchase', 'link_click' — blank uses a CPM-style proxy instead
      youtubeChannelId: 'MINE', // 'MINE' works once the channel owner has connected via /auth/google
      ga4PropertyId: '',
      linkedinAdAccountId: '',
      dateRangeDays: 30,
      startDate: '',
      endDate: '',
      campaignName: '',
      campaignDesc: '',
      creativeMediaUrl: '',
    };
    const fileSettings = readJson(fileFor(userId, 'settings'), defaults);
    const cookieSettings = getDataFromCookie(req, 'camp_settings') || {};
    return { ...fileSettings, ...cookieSettings };
  },
  saveSettings: (userId, settings) => writeJson(fileFor(userId, 'settings'), settings),

  getApiData: (userId, req) => {
    const fileData = readJson(fileFor(userId, 'api-data'), {});
    const cookieData = getDataFromCookie(req, 'camp_data') || {};
    return { ...fileData, ...cookieData };
  },
  saveApiData: (userId, data) => writeJson(fileFor(userId, 'api-data'), data),

  getManualOverrides: (userId) => readJson(fileFor(userId, 'manual-overrides'), {}),
  saveManualOverrides: (userId, data) => writeJson(fileFor(userId, 'manual-overrides'), data),

  getStatus: (userId) => readJson(fileFor(userId, 'status'), { lastSync: null, lastError: null }),
  saveStatus: (userId, status) => writeJson(fileFor(userId, 'status'), status),

  // What each user's dashboard actually fetches — their own automated
  // pulls, with their own manually-entered fields layered on top.
  getCampaignData: (userId, req) => {
    const settings = store.getSettings(userId, req);
    const apiData = store.getApiData(userId, req);
    const overrides = store.getManualOverrides(userId);

    return {
      campaignName: overrides.campaignName || settings.campaignName || apiData.campaignName || '',
      campaignDesc: overrides.campaignDesc || settings.campaignDesc || apiData.campaignDesc || '',
      creativeMediaUrl: overrides.creativeMediaUrl || settings.creativeMediaUrl || apiData.creativeMediaUrl || '',
      startDate: settings.startDate || apiData.startDate || '',
      endDate: settings.endDate || apiData.endDate || '',
      ...apiData,
      ...overrides,
    };
  },
};

module.exports = store;
