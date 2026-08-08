// Data layer for the Are Tete Survivors backend. Uses @libsql/client
// (libSQL, a SQLite-compatible fork) rather than node:sqlite, so the exact
// same code works two ways with no branching:
//   - local dev: no env vars set -> connects to a local file (aretete.db in
//     this directory), zero external account needed.
//   - deployed (Render): TURSO_DATABASE_URL/TURSO_AUTH_TOKEN point at a
//     hosted Turso database, which survives the free-tier web service
//     sleeping/restarting (local disk on a free Render service is not
//     guaranteed to).
// A thin wrapper of plain async functions around SQL, deliberately not an
// ORM - if the hosting story changes again later, only this file needs to.
import { createClient } from '@libsql/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${path.join(__dirname, 'aretete.db')}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leaderboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    mode TEXT NOT NULL,
    time REAL NOT NULL,
    level INTEGER NOT NULL,
    kills INTEGER NOT NULL,
    costume TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_leaderboard_mode_time ON leaderboard(mode, time DESC);

  CREATE TABLE IF NOT EXISTS saves (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER NOT NULL DEFAULT 0,
    upgrades_json TEXT NOT NULL DEFAULT '{}',
    cleared_stages_json TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL
  );

  -- Multiplayer groundwork (not used yet -- see server/ws.js). A future
  -- realtime layer groups sessions into rooms; kept here now so the schema
  -- migration isn't a surprise later.
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS room_members (
    room_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id)
  );
`);

export async function createUser(username, passwordHash, salt) {
  const result = await client.execute({
    sql: 'INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)',
    args: [username, passwordHash, salt, Date.now()],
  });
  return Number(result.lastInsertRowid);
}

export async function findUserByUsername(username) {
  const result = await client.execute({ sql: 'SELECT * FROM users WHERE username = ?', args: [username] });
  return result.rows[0] || null;
}

export async function findUserById(id) {
  const result = await client.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
  return result.rows[0] || null;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function createSession(token, userId) {
  const now = Date.now();
  await client.execute({
    sql: 'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    args: [token, userId, now, now + SESSION_TTL_MS],
  });
}

export async function getUserBySession(token) {
  const result = await client.execute({ sql: 'SELECT * FROM sessions WHERE token = ?', args: [token] });
  const row = result.rows[0];
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    await client.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
    return null;
  }
  return findUserById(row.user_id);
}

export async function deleteSession(token) {
  await client.execute({ sql: 'DELETE FROM sessions WHERE token = ?', args: [token] });
}

export async function addLeaderboardEntry(userId, username, entry) {
  await client.execute({
    sql: `INSERT INTO leaderboard (user_id, username, mode, time, level, kills, costume, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [userId, username, entry.mode, entry.time, entry.level, entry.kills, entry.costume, Date.now()],
  });
}

export async function topLeaderboard(mode, limit = 20) {
  const result = await client.execute({
    sql: 'SELECT username, time, level, kills, costume, created_at FROM leaderboard WHERE mode = ? ORDER BY time DESC LIMIT ?',
    args: [mode, limit],
  });
  return result.rows;
}

export async function getSave(userId) {
  const result = await client.execute({ sql: 'SELECT * FROM saves WHERE user_id = ?', args: [userId] });
  const row = result.rows[0];
  if (!row) return { coins: 0, upgrades: {}, clearedStages: [] };
  return {
    coins: Number(row.coins),
    upgrades: JSON.parse(row.upgrades_json),
    clearedStages: JSON.parse(row.cleared_stages_json),
  };
}

export async function putSave(userId, data) {
  const coins = Math.max(0, Math.round(data.coins || 0));
  const upgradesJson = JSON.stringify(data.upgrades || {});
  const clearedJson = JSON.stringify(data.clearedStages || []);
  await client.execute({
    sql: `INSERT INTO saves (user_id, coins, upgrades_json, cleared_stages_json, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET coins=excluded.coins, upgrades_json=excluded.upgrades_json,
            cleared_stages_json=excluded.cleared_stages_json, updated_at=excluded.updated_at`,
    args: [userId, coins, upgradesJson, clearedJson, Date.now()],
  });
}
