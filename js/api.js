// Client for the backend (server/index.js). Every function here fails
// soft: if the server isn't running/unreachable, callers get null/false/an
// empty list back instead of a thrown error, so the game keeps working
// fully offline on js/storage.js's localStorage.
import { getCoins, getPermanentUpgrades, getClearedStages, mergeCloudSave } from './storage.js';

const TOKEN_KEY = 'aretete_auth_token';
const USERNAME_KEY = 'aretete_auth_username';

// server/index.js now serves the game itself too, so in every real
// deployment (Render, or running `node server/index.js` locally on its
// own) the game and the API share one origin - same-origin relative paths
// just work. The one exception is the split local-dev setup where
// tools/nocache_server.py serves the game on :8790 while the API runs
// separately on :8791; detect that one case and point across ports.
const API_BASE = location.port === '8790' ? `${location.protocol}//${location.hostname}:8791` : '';

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
}

function setSession(token, username) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USERNAME_KEY, username);
  } catch (e) { /* ignore */ }
}

function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERNAME_KEY);
  } catch (e) { /* ignore */ }
}

export function isLoggedIn() {
  return !!getToken();
}

export function getUsername() {
  try { return localStorage.getItem(USERNAME_KEY); } catch (e) { return null; }
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (!token) return { ok: false, status: 401, data: null };
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    // network error / server not running / mixed-content block
    return { ok: false, status: 0, data: null };
  }
}

export async function register(username, password) {
  const { ok, data } = await request('/api/register', { method: 'POST', body: { username, password } });
  if (ok && data) setSession(data.token, data.username);
  return ok ? data : { error: (data && data.error) || 'サーバーに接続できません' };
}

export async function login(username, password) {
  const { ok, data } = await request('/api/login', { method: 'POST', body: { username, password } });
  if (ok && data) setSession(data.token, data.username);
  return ok ? data : { error: (data && data.error) || 'サーバーに接続できません' };
}

export async function logout() {
  await request('/api/logout', { method: 'POST', auth: true });
  clearSession();
}

export async function fetchOnlineLeaderboard(mode = 'endless', limit = 20) {
  const { ok, data } = await request(`/api/leaderboard?mode=${encodeURIComponent(mode)}&limit=${limit}`);
  return ok && Array.isArray(data) ? data : null; // null = couldn't reach server, caller should fall back to local
}

export async function submitOnlineLeaderboard(entry) {
  if (!isLoggedIn()) return null;
  const { ok, data } = await request('/api/leaderboard', { method: 'POST', body: entry, auth: true });
  return ok ? data : null;
}

export async function fetchCloudSave() {
  if (!isLoggedIn()) return null;
  const { ok, data } = await request('/api/save', { auth: true });
  return ok ? data : null;
}

export async function pushCloudSave(data) {
  if (!isLoggedIn()) return false;
  const { ok } = await request('/api/save', { method: 'PUT', body: data, auth: true });
  return ok;
}

// Call after any local progress mutation (coins earned, upgrade bought,
// stage cleared) - no-ops instantly if not logged in or server unreachable.
export async function syncLocalToCloud() {
  if (!isLoggedIn()) return;
  await pushCloudSave({
    coins: getCoins(),
    upgrades: getPermanentUpgrades(),
    clearedStages: getClearedStages(),
  });
}

// Call once right after a successful login - reconciles this account's
// cloud save into local storage (see storage.js's mergeCloudSave for the
// merge policy), then immediately pushes the merged result back up so both
// sides agree.
export async function pullAndMergeCloudSave() {
  const cloud = await fetchCloudSave();
  if (cloud) mergeCloudSave(cloud);
  await syncLocalToCloud();
}
