import { COSTUMES, STAGES, ENDLESS_CONFIG, registerCustomEnemies } from './data.js';
import { renderStageList, renderCostumeList, renderLeaderboard, renderShop, renderCompendium, disposeCompendiumPreviews } from './ui.js';
import { Game } from './game.js';
import { unlockAudio } from './audio.js';
import { getLeaderboard, getHandedness, setHandedness, getCoins, getNickname, setNickname } from './storage.js';
import * as api from './api.js';

const $ = (id) => document.getElementById(id);
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

let selectedStageId = 'forest';
let selectedCostumeId = COSTUMES[0].id;
let currentGame = null;

// Load listener-submitted enemies (see enemy-creator.html). Missing file / bad
// JSON just means no custom enemies - never blocks the game from starting.
fetch('data/custom-enemies.json')
  .then(r => r.ok ? r.json() : [])
  .then(list => registerCustomEnemies(list))
  .catch(() => {});

function refreshStageUI() {
  renderStageList($('stage-list'), $('stage-detail'), selectedStageId, (id) => {
    selectedStageId = id;
    refreshStageUI();
  });
}

function refreshCostumeUI() {
  renderCostumeList($('costume-list'), $('costume-detail'), selectedCostumeId, (id) => {
    selectedCostumeId = id;
    refreshCostumeUI();
  });
}

function refreshTitleCoins() {
  $('title-coins').textContent = `🪙 ${getCoins()}`;
}

function applyHandedness() {
  const side = getHandedness();
  document.body.classList.toggle('stick-right', side === 'right');
  $('btn-hand-left').classList.toggle('active', side !== 'right');
  $('btn-hand-right').classList.toggle('active', side === 'right');
}

$('btn-hand-left').onclick = () => { setHandedness('left'); applyHandedness(); };
$('btn-hand-right').onclick = () => { setHandedness('right'); applyHandedness(); };
applyHandedness();
refreshTitleCoins();

$('btn-start').onclick = () => {
  unlockAudio();
  refreshStageUI();
  show('screen-stage');
};

$('btn-ranking').onclick = async () => {
  renderLeaderboard($('ranking-list'), getLeaderboard());
  $('ranking-note').textContent = 'このブラウザだけに記録されるローカルランキングです';
  show('screen-ranking');
  // Try the online board and swap it in if the server answers; local list
  // (already shown above) stays as-is otherwise, so this never blocks or
  // shows an empty screen while waiting.
  const online = await api.fetchOnlineLeaderboard('endless');
  if (online) {
    renderLeaderboard($('ranking-list'), online);
    $('ranking-note').textContent = 'オンラインランキング（全プレイヤー共通）';
  }
};

// ACCOUNT (login/register/logout)
let accountTab = 'login';
function refreshAccountUI() {
  const loggedIn = api.isLoggedIn();
  $('account-logged-out').classList.toggle('hidden', loggedIn);
  $('account-logged-in').classList.toggle('hidden', !loggedIn);
  if (loggedIn) $('account-current-username').textContent = api.getUsername() || '';
  $('account-error').classList.add('hidden');
  $('account-nickname-input').value = getNickname();
}
$('btn-nickname-save').onclick = () => {
  if (setNickname($('account-nickname-input').value)) {
    $('account-nickname-input').value = getNickname();
  }
};
function setAccountTab(tab) {
  accountTab = tab;
  $('tab-account-login').classList.toggle('active', tab === 'login');
  $('tab-account-register').classList.toggle('active', tab === 'register');
  $('btn-account-submit').textContent = tab === 'login' ? 'ログイン' : '新規登録';
  $('account-error').classList.add('hidden');
}
$('btn-account').onclick = () => { refreshAccountUI(); setAccountTab('login'); show('screen-account'); };
$('tab-account-login').onclick = () => setAccountTab('login');
$('tab-account-register').onclick = () => setAccountTab('register');

$('btn-account-submit').onclick = async () => {
  const username = $('account-username').value.trim();
  const password = $('account-password').value;
  const errorEl = $('account-error');
  errorEl.classList.add('hidden');
  const result = accountTab === 'login'
    ? await api.login(username, password)
    : await api.register(username, password);
  if (result.error) {
    errorEl.textContent = result.error;
    errorEl.classList.remove('hidden');
    return;
  }
  await api.pullAndMergeCloudSave();
  refreshTitleCoins();
  refreshAccountUI();
};

$('btn-account-logout').onclick = async () => {
  await api.logout();
  refreshAccountUI();
};

$('btn-shop').onclick = () => {
  renderShop($('shop-list'), $('shop-coins'));
  show('screen-shop');
};

$('btn-howto').onclick = () => show('screen-howto');
document.querySelectorAll('.btn-back').forEach(b => b.onclick = () => { refreshTitleCoins(); show('screen-title'); });
document.querySelector('#screen-compendium .btn-back').addEventListener('click', disposeCompendiumPreviews);

let compendiumTab = 'weapons';
function refreshCompendium() {
  document.querySelectorAll('.compendium-tabs .chip-btn').forEach(b => b.classList.remove('active'));
  const map = { weapons: 'tab-comp-weapons', passives: 'tab-comp-passives', evolution: 'tab-comp-evo', skills: 'tab-comp-skills' };
  $(map[compendiumTab]).classList.add('active');
  renderCompendium($('compendium-list'), compendiumTab);
}
$('btn-compendium').onclick = () => { compendiumTab = 'weapons'; refreshCompendium(); show('screen-compendium'); };
$('tab-comp-weapons').onclick = () => { compendiumTab = 'weapons'; refreshCompendium(); };
$('tab-comp-passives').onclick = () => { compendiumTab = 'passives'; refreshCompendium(); };
$('tab-comp-evo').onclick = () => { compendiumTab = 'evolution'; refreshCompendium(); };
$('tab-comp-skills').onclick = () => { compendiumTab = 'skills'; refreshCompendium(); };
$('btn-howto-evolution').onclick = () => { compendiumTab = 'evolution'; refreshCompendium(); show('screen-compendium'); };

$('btn-confirm-stage').onclick = () => {
  refreshCostumeUI();
  show('screen-select');
};

$('btn-back-to-stage').onclick = () => {
  refreshStageUI();
  show('screen-stage');
};

$('btn-confirm-costume').onclick = () => {
  const costume = COSTUMES.find(c => c.id === selectedCostumeId);
  const mode = selectedStageId === 'endless' ? 'endless' : 'stage';
  const stageConfig = mode === 'endless' ? ENDLESS_CONFIG : STAGES[selectedStageId];
  show('screen-game');
  currentGame = new Game(costume, stageConfig, mode);
  currentGame.start();
  window.__game = currentGame; // debug hook
};

$('btn-quit').onclick = () => {
  if (currentGame) { currentGame.quitToTitle(); currentGame = null; }
  $('pause-overlay').classList.add('hidden');
  $('loadout-overlay').classList.add('hidden');
  refreshTitleCoins();
  show('screen-title');
};

$('btn-result-back').onclick = () => {
  currentGame = null;
  refreshTitleCoins();
  show('screen-title');
};

$('btn-nickname-submit').onclick = () => {
  const errorEl = $('nickname-error');
  if (!setNickname($('nickname-input').value)) {
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');
  show('screen-title');
};

if (getNickname()) {
  show('screen-title');
} else {
  show('screen-nickname');
}
