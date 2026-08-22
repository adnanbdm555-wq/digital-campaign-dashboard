const crypto = require('crypto');
const config = require('./config');

function createSessionCookie(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })).toString('base64');
  const signature = crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('hex');
  return `session_token=${payload}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

function clearSessionCookie() {
  return `session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function getUserIdFromRequest(req) {
  if (req.session && req.session.userId) return req.session.userId;
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  const tokenCookie = cookies.find(c => c.startsWith('session_token='));
  if (!tokenCookie) return null;
  const token = tokenCookie.split('=')[1];
  if (!token) return null;
  try {
    const [payloadBase64, signature] = token.split('.');
    if (!payloadBase64 || !signature) return null;
    const expectedSig = crypto.createHmac('sha256', config.sessionSecret).update(payloadBase64).digest('hex');
    if (signature === expectedSig) {
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
      if (payload.userId && payload.exp > Date.now()) {
        if (!req.session) req.session = {};
        req.session.userId = payload.userId;
        return payload.userId;
      }
    }
  } catch (e) {}
  return null;
}

function createOAuthState(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64');
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
      const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
      if (data.userId && (Date.now() - data.ts < 30 * 60 * 1000)) {
        return data.userId;
      }
    }
  } catch (e) {}
  return null;
}

module.exports = { createSessionCookie, clearSessionCookie, getUserIdFromRequest, createOAuthState, verifyOAuthState };
