import {
  WEAPONS, EVOLVED_WEAPONS, PASSIVES, COSTUMES, STAGES, ENDLESS_CONFIG, PERMANENT_UPGRADES, upgradeCost, EVOLUTION_PAIRS,
  SUPER_EVOLUTION_PAIRS, SUPER_EVOLVED_WEAPONS, BRANCH_DEFS, BRANCHABLE_WEAPONS, CHARACTER_SKILLS,
} from './data.js';
import { clamp } from './utils.js';
import { isStageUnlocked, getCoins, getPermanentUpgrades, buyPermanentUpgrade } from './storage.js';
import { syncLocalToCloud } from './api.js';
import { iconTag } from './icons.js';
import { mountWeaponPreview, mountSkillPreview } from './preview.js';

const $ = (id) => document.getElementById(id);

// Nicknames are free-form user text rendered via innerHTML (renderLeaderboard) -
// escape before interpolating so a crafted nickname can't inject markup.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function weaponDef(id) {
  return WEAPONS[id] || EVOLVED_WEAPONS[id] || SUPER_EVOLVED_WEAPONS[id];
}

export function fmtTime(t) {
  const m = Math.floor(t / 60).toString().padStart(2, '0');
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function updateHUD(player, elapsed, killCount, floor = null) {
  $('hp-fill').style.width = `${clamp((player.hp / player.maxHP) * 100, 0, 100)}%`;
  $('hp-text').textContent = `${Math.max(0, Math.round(player.hp))}/${player.maxHP}`;
  $('timer').textContent = fmtTime(elapsed);
  $('kill-count').textContent = `💀 ${killCount}`;
  $('xp-fill').style.width = `${clamp((player.xp / player.xpToNext) * 100, 0, 100)}%`;
  $('level-badge').textContent = `Lv.${player.level}`;
  const floorEl = $('floor-badge');
  if (floor !== null) {
    floorEl.textContent = `階層 ${floor}`;
    floorEl.classList.remove('hidden');
  } else {
    floorEl.classList.add('hidden');
  }

  const tray = $('weapon-tray');
  tray.innerHTML = '';
  for (const w of player.weapons) {
    const def = weaponDef(w.id);
    const div = document.createElement('div');
    div.className = 'wicon';
    // border escalates in color as the weapon levels up, so progress reads at a glance
    const tierColor = w.superEvolved ? '#ffe45a' : w.evolved ? '#ff8fc7' : w.level >= 5 ? '#ffd76a' : w.level >= 3 ? '#7fe6a8' : 'rgba(255,255,255,0.3)';
    div.style.borderColor = tierColor;
    if (w.evolved || w.level >= 5) div.style.boxShadow = `0 0 6px ${tierColor}`;
    div.innerHTML = iconTag(w.id, def.icon);
    if (w.branch) {
      const b = document.createElement('span');
      b.className = 'branch-badge';
      b.innerHTML = iconTag(w.branch, BRANCH_DEFS[w.branch].icon);
      div.appendChild(b);
    }
    const lvl = document.createElement('span');
    lvl.className = 'lvl';
    lvl.textContent = w.superEvolved ? '超進化' : w.evolved ? 'MAX' : w.level;
    div.appendChild(lvl);
    tray.appendChild(div);
  }
}

export function buildUpgradeChoices(player) {
  const choices = [];
  const ownedW = new Set(player.weapons.map(w => w.id));
  for (const w of player.weapons) {
    if (w.evolved) continue;
    const def = WEAPONS[w.id];
    if (w.level < def.maxLevel) {
      choices.push({ kind: 'weapon-up', id: w.id, def, level: w.level + 1 });
    }
  }
  if (player.weapons.length < 6) {
    for (const id in WEAPONS) {
      if (!ownedW.has(id)) choices.push({ kind: 'weapon-new', id, def: WEAPONS[id], level: 1 });
    }
  }
  const ownedP = new Set(player.passives.map(p => p.id));
  for (const p of player.passives) {
    const def = PASSIVES[p.id];
    if (p.level < def.maxLevel) choices.push({ kind: 'passive-up', id: p.id, def, level: p.level + 1 });
  }
  if (player.passives.length < 6) {
    for (const id in PASSIVES) {
      if (!ownedP.has(id)) choices.push({ kind: 'passive-new', id, def: PASSIVES[id], level: 1 });
    }
  }
  // Character-specific skills (see data.js CHARACTER_SKILLS) - this
  // costume's own 3 skills only, offered/leveled exactly like passives.
  const ownedS = new Set(player.skills.map(s => s.id));
  const mySkills = CHARACTER_SKILLS[player.costume.id] || [];
  for (const s of player.skills) {
    const def = mySkills.find(d => d.id === s.id);
    if (def && s.level < def.maxLevel) choices.push({ kind: 'skill-up', id: s.id, def, level: s.level + 1 });
  }
  for (const def of mySkills) {
    if (!ownedS.has(def.id)) choices.push({ kind: 'skill-new', id: def.id, def, level: 1 });
  }
  // shuffle & take up to 3
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices.slice(0, 3);
}

// what specifically improves by taking this weapon-up choice, in plain text
function weaponGainText(c) {
  if (!c.kind.startsWith('weapon') || c.kind.endsWith('new')) return '';
  const def = c.def;
  const parts = [];
  if (def.perLevel.damage) parts.push(`威力+${def.perLevel.damage}`);
  if (def.perLevel.count) parts.push(`個数+${def.perLevel.count}`);
  if (def.perLevel.area) parts.push(`範囲+${Math.round(def.perLevel.area * 100)}%`);
  if (def.perLevel.cooldown) parts.push(`速度+${Math.round(-def.perLevel.cooldown * 100)}%`);
  const extra = def.levelExtra && def.levelExtra[c.level];
  if (extra) {
    if (extra.count) parts.push(`個数+${extra.count}`);
    if (extra.pierce) parts.push(`貫通+${extra.pierce}`);
  }
  return parts.join(' / ');
}

// what specifically improves by taking this skill-up choice, in plain text
// (mirrors weaponGainText above, but skill defs use {base, perLevel} keyed
// by mechanic-specific fields rather than the weapon shape)
function skillGainText(c) {
  if (!c.kind.startsWith('skill') || c.kind.endsWith('new')) return '';
  const def = c.def;
  if (def.type === 'statBoost') return '';
  const parts = [];
  const pl = def.perLevel || {};
  if (pl.value) parts.push(`効果量+${pl.value}`);
  if (pl.chance) parts.push(`発動率+${Math.round(pl.chance * 100)}%`);
  if (pl.damage) parts.push(`威力+${pl.damage}`);
  if (pl.radius) parts.push(`範囲+${pl.radius}`);
  if (pl.cooldown) parts.push(`間隔-${Math.round(-pl.cooldown * 100) / 100}秒`);
  if (pl.pullRadius) parts.push(`引き寄せ範囲+${pl.pullRadius}`);
  return parts.join(' / ');
}

export function showLevelUp(choices, onPick) {
  const overlay = $('levelup-overlay');
  const row = $('levelup-cards');
  row.innerHTML = '';
  for (const c of choices) {
    const card = document.createElement('div');
    const isWeapon = c.kind.startsWith('weapon');
    const isSkill = c.kind.startsWith('skill');
    card.className = `upgrade-card ${isWeapon ? 'kind-weapon' : isSkill ? 'kind-skill' : 'kind-stat'}`;
    const isNew = c.kind.endsWith('new');
    const gain = isSkill ? skillGainText(c) : weaponGainText(c);
    card.innerHTML = `
      <div class="ukind">${isWeapon ? '⚔️ 武器' : isSkill ? '✨ 固有スキル' : '📊 強化'}</div>
      <div class="uicon">${iconTag(c.id, c.def.icon)}</div>
      <div class="uname">${c.def.name}</div>
      <div class="ulvl">${isNew ? 'NEW' : 'Lv.' + c.level}</div>
      <div class="udesc">${c.def.desc}</div>
      ${gain ? `<div class="ugain">${gain}</div>` : ''}
    `;
    card.onclick = () => { overlay.classList.add('hidden'); onPick(c); };
    row.appendChild(card);
  }
  overlay.classList.remove('hidden');
}

export function showEvolveNotice(pair, onContinue, isSuper = false) {
  const overlay = $('levelup-overlay');
  const row = $('levelup-cards');
  const def = isSuper ? SUPER_EVOLVED_WEAPONS[pair.evolvesTo] : EVOLVED_WEAPONS[pair.evolvesTo];
  row.innerHTML = `
    <div class="upgrade-card ${isSuper ? 'super-evolve' : 'evolve'}" style="width:220px;">
      <div class="uicon">${iconTag(pair.evolvesTo, def.icon)}</div>
      <div class="uname">${def.name}</div>
      <div class="ulvl">${isSuper ? '超進化！！' : '進化！'}</div>
      <div class="udesc">${def.desc}</div>
    </div>
  `;
  row.firstElementChild.onclick = () => { overlay.classList.add('hidden'); onContinue(); };
  overlay.classList.remove('hidden');
}

// Monster-Hunter-style weapon element branch choice, shown when a starting
// weapon hits max level (and hasn't fused yet). Picking one sets w.branch -
// kept off the weapon's id so it survives evolution/super-evolution intact.
export function showBranchChoice(weaponSlot, onPick) {
  const overlay = $('levelup-overlay');
  const row = $('levelup-cards');
  const wdef = weaponDef(weaponSlot.id);
  row.innerHTML = '';
  const header = document.createElement('div');
  header.style.cssText = 'width:100%;text-align:center;margin-bottom:6px;font-size:0.85rem;color:#e7b8ff;';
  header.innerHTML = `${iconTag(weaponSlot.id, wdef.icon, 'icon-img icon-inline')} ${wdef.name} が特化の分岐点に到達！`;
  row.appendChild(header);
  for (const id in BRANCH_DEFS) {
    const b = BRANCH_DEFS[id];
    const card = document.createElement('div');
    card.className = 'upgrade-card kind-branch';
    card.innerHTML = `
      <div class="ukind">🔱 武器特化</div>
      <div class="uicon">${iconTag(id, b.icon)}</div>
      <div class="uname">${b.name}</div>
      <div class="udesc">${b.desc}</div>
      <div class="ugain">威力${Math.round((b.dmgMult - 1) * 100)}%${b.critBonus ? ` / 会心率+${Math.round(b.critBonus * 100)}%` : ''}</div>
    `;
    card.onclick = () => { overlay.classList.add('hidden'); onPick(id); };
    row.appendChild(card);
  }
  overlay.classList.remove('hidden');
}

function weaponGrowthSummary(def) {
  const parts = [];
  if (def.perLevel.damage) parts.push(`Lvごとに威力+${def.perLevel.damage}`);
  if (def.perLevel.count) parts.push(`個数+${def.perLevel.count}`);
  if (def.perLevel.area) parts.push(`範囲+${Math.round(def.perLevel.area * 100)}%`);
  if (def.perLevel.cooldown) parts.push(`速度+${Math.round(-def.perLevel.cooldown * 100)}%`);
  if (def.levelExtra) {
    for (const lvl in def.levelExtra) {
      const e = def.levelExtra[lvl];
      const bits = [];
      if (e.count) bits.push(`個数+${e.count}`);
      if (e.pierce) bits.push(`貫通+${e.pierce}`);
      if (bits.length) parts.push(`Lv${lvl}到達で${bits.join('・')}`);
    }
  }
  return parts.join(' / ') || '進化専用武器';
}

// Live preview canvases mounted by the current renderCompendium() call - a
// RAF loop per canvas, so they must be disposed whenever the compendium
// re-renders (tab switch or leaving/reopening the screen) or they'd leak.
let activePreviews = [];
export function disposeCompendiumPreviews() { disposePreviews(); }
function disposePreviews() {
  for (const p of activePreviews) p.dispose();
  activePreviews = [];
}
function appendPreviewCanvas(container, mountFn) {
  const canvas = document.createElement('canvas');
  canvas.className = 'preview-canvas';
  canvas.width = 64;
  canvas.height = 64;
  container.appendChild(canvas);
  const handle = mountFn(canvas);
  if (handle) activePreviews.push(handle);
  else canvas.remove();
}

// Browsable reference (title screen, not tied to a run) for weapon/passive
// per-level growth and which pairs merge into which evolved weapon.
export function renderCompendium(container, category) {
  disposePreviews();
  container.innerHTML = '';
  if (category === 'weapons') {
    for (const id in WEAPONS) {
      const def = WEAPONS[id];
      const evo = EVOLUTION_PAIRS.find(p => p.weapon === id);
      const div = document.createElement('div');
      div.className = 'comp-item';
      div.innerHTML = `
        <div class="cicon">${iconTag(id, def.icon)}</div>
        <div class="cinfo">
          <div class="cname">${def.name}<span class="clevel">最大Lv.${def.maxLevel}</span></div>
          <div class="cdesc">${def.desc}</div>
          <div class="cgrowth">${weaponGrowthSummary(def)}</div>
          ${evo ? `<div class="crecipe">🔗 最大Lv + ${iconTag(evo.passive, PASSIVES[evo.passive].icon, 'icon-img icon-inline')}${PASSIVES[evo.passive].name}(最大Lv)を両方揃えて宝箱を開けると → ${iconTag(evo.evolvesTo, EVOLVED_WEAPONS[evo.evolvesTo].icon, 'icon-img icon-inline')}${EVOLVED_WEAPONS[evo.evolvesTo].name}に進化</div>` : ''}
        </div>`;
      container.appendChild(div);
      appendPreviewCanvas(div, (canvas) => mountWeaponPreview(canvas, id));
    }
  } else if (category === 'passives') {
    for (const id in PASSIVES) {
      const def = PASSIVES[id];
      const usedIn = EVOLUTION_PAIRS.find(p => p.passive === id);
      const div = document.createElement('div');
      div.className = 'comp-item';
      div.innerHTML = `
        <div class="cicon">${iconTag(id, def.icon)}</div>
        <div class="cinfo">
          <div class="cname">${def.name}<span class="clevel">最大Lv.${def.maxLevel}</span></div>
          <div class="cdesc">${def.desc}</div>
          ${usedIn ? `<div class="crecipe">🔗 ${iconTag(usedIn.weapon, WEAPONS[usedIn.weapon].icon, 'icon-img icon-inline')}${WEAPONS[usedIn.weapon].name}の進化素材</div>` : ''}
        </div>`;
      container.appendChild(div);
    }
  } else if (category === 'evolution') {
    for (const pair of EVOLUTION_PAIRS) {
      const w = WEAPONS[pair.weapon], p = PASSIVES[pair.passive], e = EVOLVED_WEAPONS[pair.evolvesTo];
      const div = document.createElement('div');
      div.className = 'comp-item evolved';
      div.innerHTML = `
        <div class="cicon">${iconTag(pair.evolvesTo, e.icon)}</div>
        <div class="cinfo">
          <div class="cname">${e.name}</div>
          <div class="cdesc">${e.desc}</div>
          <div class="crecipe">${iconTag(pair.weapon, w.icon, 'icon-img icon-inline')}${w.name}(最大Lv.${w.maxLevel}) ＋ ${iconTag(pair.passive, p.icon, 'icon-img icon-inline')}${p.name}(最大Lv.${p.maxLevel}) を両方揃えて宝箱を開けると進化</div>
        </div>`;
      container.appendChild(div);
    }
  } else if (category === 'skills') {
    for (const costume of COSTUMES) {
      const header = document.createElement('div');
      header.className = 'compendium-costume-header';
      header.innerHTML = `${iconTag(costume.id, costume.icon, 'icon-img icon-inline')} ${costume.name}`;
      container.appendChild(header);
      for (const def of CHARACTER_SKILLS[costume.id] || []) {
        const div = document.createElement('div');
        div.className = 'comp-item kind-skill';
        div.innerHTML = `
          <div class="cicon">${iconTag(def.id, def.icon)}</div>
          <div class="cinfo">
            <div class="cname">${def.name}<span class="clevel">最大Lv.${def.maxLevel}</span></div>
            <div class="cdesc">${def.desc}</div>
          </div>`;
        container.appendChild(div);
        appendPreviewCanvas(div, (canvas) => mountSkillPreview(canvas, def));
      }
    }
  }
}

// The player's currently-equipped weapons/passives mid-run, with live levels
// plus recipe hints for whatever this weapon can still become (branch /
// evolution / super-evolution) - satisfies "見たい時に融合先を確認したい".
export function renderLoadout(container, player) {
  container.innerHTML = '';
  if (player.weapons.length === 0 && player.passives.length === 0 && player.skills.length === 0) {
    container.innerHTML = '<p class="loadout-empty">まだ何も装備していません</p>';
    return;
  }
  for (const w of player.weapons) {
    const def = weaponDef(w.id);
    const div = document.createElement('div');
    div.className = 'comp-item' + (w.superEvolved ? ' evolved' : w.evolved ? ' evolved' : '');
    const levelLabel = w.superEvolved ? '超進化済' : w.evolved ? 'MAX(進化済)' : `Lv.${w.level}/${def.maxLevel}`;
    const branchDef = w.branch ? BRANCH_DEFS[w.branch] : null;
    let recipeHtml = '';
    if (branchDef) {
      recipeHtml += `<div class="crecipe">${iconTag(w.branch, branchDef.icon, 'icon-img icon-inline')} 特化: ${branchDef.name} - ${branchDef.desc}</div>`;
    } else if (!w.evolved && BRANCHABLE_WEAPONS.includes(w.id)) {
      recipeHtml += `<div class="crecipe">🔱 最大Lvで宝箱を開けると武器特化(麻痺/毒/爆発/会心)を選択可能</div>`;
    }
    if (!w.evolved) {
      const evo = EVOLUTION_PAIRS.find(p => p.weapon === w.id);
      if (evo) recipeHtml += `<div class="crecipe">🔗 最大Lv + ${iconTag(evo.passive, PASSIVES[evo.passive].icon, 'icon-img icon-inline')}${PASSIVES[evo.passive].name}(最大Lv)で進化 → ${iconTag(evo.evolvesTo, EVOLVED_WEAPONS[evo.evolvesTo].icon, 'icon-img icon-inline')}${EVOLVED_WEAPONS[evo.evolvesTo].name}</div>`;
    } else if (!w.superEvolved) {
      const superEvo = SUPER_EVOLUTION_PAIRS.find(p => p.weapon === w.id);
      if (superEvo) recipeHtml += `<div class="crecipe">🌟 ${iconTag(superEvo.passive, PASSIVES[superEvo.passive].icon, 'icon-img icon-inline')}${PASSIVES[superEvo.passive].name}(最大Lv) + Lv.${superEvo.minLevel}到達で超進化 → ${iconTag(superEvo.evolvesTo, SUPER_EVOLVED_WEAPONS[superEvo.evolvesTo].icon, 'icon-img icon-inline')}${SUPER_EVOLVED_WEAPONS[superEvo.evolvesTo].name}</div>`;
    }
    div.innerHTML = `
      <div class="cicon">${iconTag(w.id, def.icon)}</div>
      <div class="cinfo">
        <div class="cname">${def.name}<span class="clevel">${levelLabel}</span></div>
        <div class="cdesc">${def.desc}</div>
        ${recipeHtml}
      </div>`;
    container.appendChild(div);
  }
  for (const p of player.passives) {
    const def = PASSIVES[p.id];
    const div = document.createElement('div');
    div.className = 'comp-item';
    div.innerHTML = `
      <div class="cicon">${iconTag(p.id, def.icon)}</div>
      <div class="cinfo">
        <div class="cname">${def.name}<span class="clevel">Lv.${p.level}/${def.maxLevel}</span></div>
        <div class="cdesc">${def.desc}</div>
      </div>`;
    container.appendChild(div);
  }
  if (player.skills.length) {
    const header = document.createElement('div');
    header.className = 'loadout-section-header';
    header.textContent = '✨ 固有スキル';
    container.appendChild(header);
    for (const s of player.skills) {
      const def = player.getSkillDef(s.id);
      if (!def) continue;
      const div = document.createElement('div');
      div.className = 'comp-item kind-skill';
      div.innerHTML = `
        <div class="cicon">${iconTag(s.id, def.icon)}</div>
        <div class="cinfo">
          <div class="cname">${def.name}<span class="clevel">Lv.${s.level}/${def.maxLevel}</span></div>
          <div class="cdesc">${def.desc}</div>
        </div>`;
      container.appendChild(div);
    }
  }
}

export function renderStageList(container, detail, selectedId, onSelect) {
  container.innerHTML = '';
  const stageList = Object.values(STAGES).sort((a, b) => a.order - b.order);
  const items = [...stageList, ENDLESS_CONFIG];
  for (const s of items) {
    const unlocked = s.id === 'endless' ? true : isStageUnlocked(s, STAGES);
    const card = document.createElement('div');
    card.className = 'costume-card' + (s.id === selectedId ? ' selected' : '') + (unlocked ? '' : ' locked');
    card.innerHTML = `
      <div class="costume-swatch" style="background:#ffffff11;border:2px solid ${unlocked ? 'var(--gold)' : '#666'};">${unlocked ? (s.id === 'endless' ? '♾️' : '🗺️') : '🔒'}</div>
      <div class="cname">${s.name}</div>
      ${!unlocked ? '<div class="clock-note">前のステージをクリアで解放</div>' : ''}
    `;
    if (unlocked) card.onclick = () => onSelect(s.id);
    container.appendChild(card);
  }
  const s = items.find(s => s.id === selectedId);
  detail.textContent = s ? s.desc : '';
}

export function renderCostumeList(container, detail, selectedId, onSelect) {
  container.innerHTML = '';
  for (const c of COSTUMES) {
    const card = document.createElement('div');
    card.className = 'costume-card' + (c.id === selectedId ? ' selected' : '');
    card.innerHTML = `
      <div class="costume-swatch" style="background:${c.color}22;border:2px solid ${c.color};">${iconTag(c.id, c.icon)}</div>
      <div class="cname">${c.name}</div>
      <div class="cweapon">${iconTag(c.weaponId, WEAPONS[c.weaponId].icon, 'icon-img icon-inline')} ${WEAPONS[c.weaponId].name}</div>
    `;
    card.onclick = () => onSelect(c.id);
    container.appendChild(card);
  }
  const c = COSTUMES.find(c => c.id === selectedId);
  detail.textContent = c ? c.desc : '';
}

export function renderShop(listEl, coinsEl) {
  const coins = getCoins();
  coinsEl.textContent = `🪙 ${coins}`;
  const upgrades = getPermanentUpgrades();
  listEl.innerHTML = '';
  for (const id in PERMANENT_UPGRADES) {
    const def = PERMANENT_UPGRADES[id];
    const level = upgrades[id] || 0;
    const maxed = level >= def.maxLevel;
    const cost = maxed ? 0 : upgradeCost(def, level);
    const row = document.createElement('div');
    row.className = 'shop-item' + (maxed ? ' maxed' : '');
    row.innerHTML = `
      <div class="sicon">${iconTag(id, def.icon)}</div>
      <div class="sinfo">
        <div class="sname">${def.name}</div>
        <div class="sdesc">${def.desc}</div>
        <div class="slevel">Lv.${level}/${def.maxLevel}</div>
      </div>
      <button class="buy-btn" ${maxed || coins < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `🪙${cost}`}</button>
    `;
    if (!maxed) {
      row.querySelector('.buy-btn').onclick = () => {
        const result = buyPermanentUpgrade(id, cost);
        if (result) {
          renderShop(listEl, coinsEl);
          syncLocalToCloud();
        }
      };
    }
    listEl.appendChild(row);
  }
}

export function showResult(stats) {
  if (stats.mode === 'endless') {
    $('result-title').textContent = '⏱️ 記録終了！';
  } else {
    $('result-title').textContent = stats.win ? '🎉 ステージクリア！' : '💀 やられた…';
  }
  const el = $('result-stats');
  el.innerHTML = `
    <div><span>生存時間</span><span>${fmtTime(stats.time)}</span></div>
    <div><span>到達レベル</span><span>Lv.${stats.level}</span></div>
    <div><span>撃破数</span><span>${stats.kills}</span></div>
    <div><span>使用衣装</span><span>${stats.costumeName}</span></div>
    ${stats.rank ? `<div><span>ランキング順位</span><span>${stats.rank}位</span></div>` : ''}
    <div><span>獲得コイン</span><span>🪙+${stats.coinsEarned}</span></div>
    <div><span>所持コイン</span><span>🪙${stats.totalCoins}</span></div>
  `;
}

export function renderLeaderboard(container, entries) {
  if (!entries.length) {
    container.innerHTML = '<p class="rank-empty">まだ記録がありません。エンドレスモードに挑戦してみよう！</p>';
    return;
  }
  container.innerHTML = entries.map((e, i) => `
    <div class="rank-row">
      <span class="rank-pos">${i + 1}</span>
      <span class="rank-name">${escapeHtml(e.name || e.username || '名無し')}</span>
      <span class="rank-time">${fmtTime(e.time)}</span>
      <span class="rank-meta">Lv.${e.level} / ${e.kills}体撃破 / ${e.costume}</span>
    </div>
  `).join('');
}
