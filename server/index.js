// Are Tete Survivors backend: accounts, online endless-mode leaderboard,
// cloud save, AND (see the static-file section below) the game itself -
// one process serves everything, which is what gets deployed to Render.
// tools/nocache_server.py still works as a lighter pure-static option for
// local dev if preferred, but isn't required - `node server/index.js`
// alone is a complete local run of the whole game+backend.
//
// Multiplayer groundwork: nothing realtime is built yet, but the session
// token issued by /api/login is designed to be reusable as-is for a future
// WebSocket layer (see server/ws.js) -- the client would open a socket to
// e.g. `ws://host:PORT/ws?token=...`, and the same requireAuth-style lookup
// (getUserBySession) would resolve it to a user, then attach that
// connection to a `rooms` row (schema already in db.js). No accounts/session
// rework needed when that gets built.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createUser, findUserByUsername, createSession, deleteSession,
  addLeaderboardEntry, topLeaderboard, getSave, putSave,
} from './db.js';
import { hashPassword, verifyPassword, generateToken, requireAuth } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const PORT = process.env.PORT || 8791;
const app = express();
app.use(express.json());

// Minimal CORS: harmless to leave on even once game+API share an origin
// (deployed / unified local run), and still needed for the split-port local
// dev setup (nocache_server.py on :8790 talking to the API on :8791).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'username must be 3-20 letters/numbers/underscore' });
  }
  if (typeof password !== 'string' || password.length < 4) {
    return res.status(400).json({ error: 'password must be at least 4 characters' });
  }
  if (await findUserByUsername(username)) {
    return res.status(409).json({ error: 'username already taken' });
  }
  const { hash, salt } = hashPassword(password);
  const userId = await createUser(username, hash, salt);
  const token = generateToken();
  await createSession(token, userId);
  res.json({ token, username });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const user = typeof username === 'string' ? await findUserByUsername(username) : null;
  if (!user || typeof password !== 'string' || !verifyPassword(password, user.salt, user.password_hash)) {
    return res.status(401).json({ error: 'wrong username or password' });
  }
  const token = generateToken();
  await createSession(token, user.id);
  res.json({ token, username: user.username });
});

app.post('/api/logout', requireAuth, async (req, res) => {
  await deleteSession(req.token);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

app.get('/api/leaderboard', async (req, res) => {
  const mode = typeof req.query.mode === 'string' ? req.query.mode : 'endless';
  const limit = Math.min(100, Number(req.query.limit) || 20);
  res.json(await topLeaderboard(mode, limit));
});

app.post('/api/leaderboard', requireAuth, async (req, res) => {
  const { mode, time, level, kills, costume } = req.body || {};
  if (typeof time !== 'number' || typeof level !== 'number' || typeof kills !== 'number') {
    return res.status(400).json({ error: 'time, level, kills must be numbers' });
  }
  await addLeaderboardEntry(req.user.id, req.user.username, {
    mode: typeof mode === 'string' ? mode : 'endless',
    time, level, kills,
    costume: typeof costume === 'string' ? costume : '',
  });
  const board = await topLeaderboard(mode || 'endless', 20);
  const rank = board.findIndex(e => e.username === req.user.username && e.time === time) + 1;
  res.json({ board, rank: rank || null });
});

app.get('/api/save', requireAuth, async (req, res) => {
  res.json(await getSave(req.user.id));
});

app.put('/api/save', requireAuth, async (req, res) => {
  await putSave(req.user.id, req.body || {});
  res.json({ ok: true });
});

// Serve the game itself from the same process/origin (index.html, js/,
// assets/, style.css, data/, the two standalone tools) so the deployed
// version is a single Render service with no CORS/second-host to manage.
// Same no-cache headers as tools/nocache_server.py, for the same reason
// (see task #43 in the project history - without this, Safari/mobile
// browsers cache index.html/js modules across deploys and players keep
// seeing a stale build).
app.use(express.static(REPO_ROOT, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

app.listen(PORT, () => {
  console.log(`Are Tete Survivors listening on :${PORT}`);
});
