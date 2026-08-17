// Local persistence: cleared stages (to unlock the next one), the endless
// mode leaderboard, input handedness, and meta-progression (coins + permanent
// upgrades). Everything here lives in this browser's localStorage and keeps
// working with no server at all. js/api.js optionally layers an online
// account on top (leaderboard + cross-device save sync via server/) - when
// logged in, mergeCloudSave() below reconciles a fetched cloud save into
// these same local keys so the rest of the game never needs to know or care
// whether the player is online.
const CLEAR_KEY = 'aretete_cleared_stages';
const RANK_KEY = 'aretete_endless_ranking';
const HAND_KEY = 'aretete_handedness';
const COINS_KEY = 'aretete_coins';
const UPGRADES_KEY = 'aretete_permanent_upgrades';
const NICK_KEY = 'aretete_nickname';

export function getClearedStages() {
  try { return JSON.parse(localStorage.getItem(CLEAR_KEY)) || []; } catch (e) { return []; }
}

export function markStageCleared(stageId) {
  const cleared = getClearedStages();
  if (!cleared.includes(stageId)) {
    cleared.push(stageId);
    try { localStorage.setItem(CLEAR_KEY, JSON.stringify(cleared)); } catch (e) { /* ignore */ }
  }
}

export function isStageUnlocked(stage, stagesById) {
  if (stage.order <= 1) return true;
  const cleared = getClearedStages();
  const prevStage = Object.values(stagesById).find(s => s.order === stage.order - 1);
  return prevStage ? cleared.includes(prevStage.id) : true;
}

export function getLeaderboard() {
  try { return JSON.parse(localStorage.getItem(RANK_KEY)) || []; } catch (e) { return []; }
}

export function addLeaderboardEntry(entry) {
  const list = getLeaderboard();
  list.push(entry);
  list.sort((a, b) => b.time - a.time);
  const trimmed = list.slice(0, 20);
  try { localStorage.setItem(RANK_KEY, JSON.stringify(trimmed)); } catch (e) { /* ignore */ }
  return trimmed;
}

export function getNickname() {
  try { return localStorage.getItem(NICK_KEY) || ''; } catch (e) { return ''; }
}

export function setNickname(name) {
  const trimmed = (name || '').trim().slice(0, 12);
  if (!trimmed) return false;
  try { localStorage.setItem(NICK_KEY, trimmed); } catch (e) { /* ignore */ }
  return true;
}

export function getHandedness() {
  try { return localStorage.getItem(HAND_KEY) || 'left'; } catch (e) { return 'left'; }
}

export function setHandedness(side) {
  try { localStorage.setItem(HAND_KEY, side === 'right' ? 'right' : 'left'); } catch (e) { /* ignore */ }
}

export function getCoins() {
  try { return Number(localStorage.getItem(COINS_KEY)) || 0; } catch (e) { return 0; }
}

export function addCoins(amount) {
  const total = Math.max(0, getCoins() + Math.round(amount));
  try { localStorage.setItem(COINS_KEY, String(total)); } catch (e) { /* ignore */ }
  return total;
}

export function getPermanentUpgrades() {
  try { return JSON.parse(localStorage.getItem(UPGRADES_KEY)) || {}; } catch (e) { return {}; }
}

export function buyPermanentUpgrade(id, cost) {
  const coins = getCoins();
  if (coins < cost) return null;
  const upgrades = getPermanentUpgrades();
  upgrades[id] = (upgrades[id] || 0) + 1;
  try {
    localStorage.setItem(UPGRADES_KEY, JSON.stringify(upgrades));
    localStorage.setItem(COINS_KEY, String(coins - cost));
  } catch (e) { /* ignore */ }
  return { coins: coins - cost, upgrades };
}

// Reconciles a cloud save (see js/api.js's fetchCloudSave) into local
// storage after login. Takes the max/union on every field rather than just
// overwriting, so logging in on a second device never throws away progress
// made offline on this one (or vice versa) - whichever side is further
// along wins per-field.
export function mergeCloudSave(cloud) {
  if (!cloud) return;
  try {
    const mergedCoins = Math.max(getCoins(), Number(cloud.coins) || 0);
    localStorage.setItem(COINS_KEY, String(mergedCoins));

    const localUpgrades = getPermanentUpgrades();
    const cloudUpgrades = cloud.upgrades || {};
    const mergedUpgrades = { ...localUpgrades };
    for (const id in cloudUpgrades) {
      mergedUpgrades[id] = Math.max(mergedUpgrades[id] || 0, cloudUpgrades[id] || 0);
    }
    localStorage.setItem(UPGRADES_KEY, JSON.stringify(mergedUpgrades));

    const mergedCleared = Array.from(new Set([...getClearedStages(), ...(cloud.clearedStages || [])]));
    localStorage.setItem(CLEAR_KEY, JSON.stringify(mergedCleared));
  } catch (e) { /* ignore */ }
}
