const crypto = require('crypto');
const config = require('./config');

function createSessionCookie(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
  return `session_token=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

function clearSessionCookie() {
  return `session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function getUserIdFromRequest(req) {
  if (req.session && req.session.userId) return req.session.userId;
  const cookieHeader = req.headers?.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const tokenCookie = cookies.find(c => c.startsWith('session_token='));
  if (!tokenCookie) return null;
  const token = tokenCookie.slice(tokenCookie.indexOf('=') + 1);
  if (!token) return null;
  try {
    const [payloadStr, signature] = token.split('.');
    if (!payloadStr || !signature) return null;
    const expectedSig = crypto.createHmac('sha256', config.sessionSecret).update(payloadStr).digest('hex');
    if (signature === expectedSig) {
      let decoded = null;
      try {
        decoded = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
      } catch (e) {
        decoded = JSON.parse(Buffer.from(payloadStr, 'base64').toString('utf8'));
      }
      if (decoded && decoded.userId && decoded.exp > Date.now()) {
        if (!req.session) req.session = {};
        req.session.userId = decoded.userId;
        return decoded.userId;
      }
    }
  } catch (e) {}
  return null;
}

function createOAuthState(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyOAuthState(state) {
  if (!state) return null;
  try {
    const [payload, sig] = state.split('.');
    if (!payload || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
    if (sig === expectedSig) {
      let data = null;
      try {
        data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch (e) {
        data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
      }
      if (data && data.userId && (Date.now() - data.ts < 30 * 60 * 1000)) {
        return data.userId;
      }
    }
  } catch (e) {}
  return null;
}

function createDataCookie(name, data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
  return `${name}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=5184000`;
}

function getDataFromCookie(req, name) {
  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const match = cookies.find(c => c.startsWith(`${name}=`));
  if (!match) return null;
  const token = match.slice(match.indexOf('=') + 1);
  if (!token) return null;
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expectedSig = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
    if (sig === expectedSig) {
      try {
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch (e) {
        return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
      }
    }
  } catch (e) {}
  return null;
}

module.exports = { 
  createSessionCookie, 
  clearSessionCookie, 
  getUserIdFromRequest, 
  createOAuthState, 
  verifyOAuthState,
  createDataCookie,
  getDataFromCookie
};
