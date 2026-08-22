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

// ---- Accounts ----
function getUsers() {
  return readJson(USERS_FILE, []);
}
function saveUsers(users) {
  writeJson(USERS_FILE, users);
}
function findUserByUsername(username) {
  return getUsers().find((u) => u.username.toLowerCase() === String(username).toLowerCase());
}
function findUserById(id) {
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

// Called once at server startup. If accounts already exist (e.g. from
// testing before the admin role existed) but none is marked admin yet,
// promotes whichever account was created first so the app always has
// exactly one admin to start from.
function ensureAdminExists() {
  const users = getUsers();
  if (users.length === 0) {
    const bcrypt = require('bcryptjs');
    const defaultAdmin = store.createUser({
      username: 'adpulsemedia',
      passwordHash: bcrypt.hashSync('admin12345', 10),
      displayName: 'Adnan Karim',
      role: 'admin',
    });
    console.log('Default admin created: adpulsemedia');
    return;
  }
  if (users.some((u) => u.role === 'admin')) return;
  const oldest = [...users].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
  updateUserRole(oldest.id, 'admin');
  console.log(`No admin found — promoted "${oldest.username}" to admin automatically.`);
}

const store = {
  getUsers,
  findUserByUsername,
  findUserById,
  createUser,
  updateUserRole,
  getUsersSummary,
  ensureAdminExists,

  getTokens: (userId) => readJson(fileFor(userId, 'tokens'), {}),
  saveTokens: (userId, tokens) => writeJson(fileFor(userId, 'tokens'), tokens),

  getSettings: (userId) => readJson(fileFor(userId, 'settings'), {
    metaAdAccountId: '',
    metaResultActionType: '', // e.g. 'lead', 'purchase', 'link_click' — blank uses a CPM-style proxy instead
    youtubeChannelId: 'MINE', // 'MINE' works once the channel owner has connected via /auth/google
    ga4PropertyId: '',
    linkedinAdAccountId: '',
    dateRangeDays: 30,
    startDate: '',
    endDate: '',
  }),
  saveSettings: (userId, settings) => writeJson(fileFor(userId, 'settings'), settings),

  getApiData: (userId) => readJson(fileFor(userId, 'api-data'), {}),
  saveApiData: (userId, data) => writeJson(fileFor(userId, 'api-data'), data),

  getManualOverrides: (userId) => readJson(fileFor(userId, 'manual-overrides'), {}),
  saveManualOverrides: (userId, data) => writeJson(fileFor(userId, 'manual-overrides'), data),

  getStatus: (userId) => readJson(fileFor(userId, 'status'), { lastSync: null, lastError: null }),
  saveStatus: (userId, status) => writeJson(fileFor(userId, 'status'), status),

  // What each user's dashboard actually fetches — their own automated
  // pulls, with their own manually-entered fields layered on top.
  getCampaignData: (userId) => ({
    ...store.getApiData(userId),
    ...store.getManualOverrides(userId),
  }),
};

module.exports = store;
