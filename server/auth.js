// Password hashing (scrypt, built into node:crypto - no bcrypt dependency)
// and session-token handling.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { getUserBySession } from './db.js';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHash) {
  const hash = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

export function generateToken() {
  return randomBytes(32).toString('hex');
}

// Express middleware: reads `Authorization: Bearer <token>`, attaches
// req.user on success, 401s otherwise. The same token scheme is meant to be
// reused by a future WebSocket layer (passed as a query param on the
// handshake instead of a header) so multiplayer auth doesn't need new
// plumbing -- see the note in index.js.
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'no token' });
  const user = await getUserBySession(token);
  if (!user) return res.status(401).json({ error: 'invalid or expired session' });
  req.user = user;
  req.token = token;
  next();
}
