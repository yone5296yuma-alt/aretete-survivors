import { dist, angleTo, clamp } from './utils.js';
import {
  WEAPONS, EVOLVED_WEAPONS, EVOLUTION_PAIRS, PASSIVES,
  SUPER_EVOLUTION_PAIRS, SUPER_EVOLVED_WEAPONS, BRANCH_DEFS, BRANCHABLE_WEAPONS,
} from './data.js';
import { getIconImg } from './icons.js';

export function getDef(id) {
  return WEAPONS[id] || EVOLVED_WEAPONS[id] || SUPER_EVOLVED_WEAPONS[id];
}

function computeStats(def, level, player, branch) {
  const s = { ...def.base };
  for (let l = 2; l <= level; l++) {
    for (const k in def.perLevel) {
      s[k] = (s[k] ?? 0) + def.perLevel[k];
    }
    const extra = def.levelExtra && def.levelExtra[l];
    if (extra) for (const k in extra) s[k] = (s[k] ?? 0) + extra[k];
  }
  s.damage = s.damage * player.power;
  if (branch && BRANCH_DEFS[branch]) s.damage *= BRANCH_DEFS[branch].dmgMult;
  s.area = (s.area ?? 1) * player.area;
  s.cooldown = Math.max(0.12, (s.cooldown ?? 1) * player.cooldownMult);
  return s;
}

function nearestEnemy(x, y, enemies, maxRange = Infinity) {
  let best = null, bestD = maxRange;
  for (const e of enemies) {
    if (e.dead) continue;
    const d = dist(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// Canvas fillText renders emoji as flat monochrome silhouettes on some
// platforms (notably Safari) instead of full color glyphs, so every weapon
// visual gets its own colored backdrop disc drawn first - the projectile
// stays clearly visible and color-coded even where the emoji itself doesn't
// render in color. Evolved (aura:true) weapons get an extra glowing ring.
function drawIconBadge(ctx, radius, color, icon, aura, spinT, iconId) {
  if (aura) {
    const pulse = 0.5 + 0.5 * Math.sin(spinT * 6);
    ctx.save();
    ctx.globalAlpha = 0.35 + pulse * 0.3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.7 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(20,15,10,0.8)';
  ctx.stroke();
  const iconImg = iconId ? getIconImg(iconId) : null;
  if (iconImg && iconImg.loaded) {
    const d = radius * 1.6;
    ctx.drawImage(iconImg.img, -d / 2, -d / 2, d, d);
  } else {
    ctx.font = `${Math.round(radius * 1.5)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 0, 0);
  }
}

export class Projectile {
  constructor(x, y, angle, speed, damage, pierce, radius, icon, life = 3, kind = 'straight', range = 0, color = '#cccccc', aura = false, branch = null, iconId = null) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.speed = speed;
    this.damage = damage;
    this.pierce = pierce;
    this.hitSet = new Set();
    this.radius = radius;
    this.icon = icon;
    this.iconId = iconId;
    this.color = color;
    this.aura = aura;
    this.branch = branch;
    this.life = life;
    this.kind = kind; // 'straight' | 'boomerang'
    this.traveled = 0;
    this.range = range;
    this.returning = false;
    this.dead = false;
    this.spin = 0;
  }
  update(dt, ownerX, ownerY, enemies) {
    this.life -= dt;
    this.spin += dt * 12;
    if (this.life <= 0) { this.dead = true; return; }
    if (this.kind === 'boomerang') {
      if (!this.returning) {
        this.x += this.vx * dt * 60; this.y += this.vy * dt * 60;
        this.traveled += Math.hypot(this.vx, this.vy) * dt * 60;
        if (this.traveled >= this.range) { this.returning = true; this.hitSet.clear(); }
      } else {
        const a = angleTo(this.x, this.y, ownerX, ownerY);
        this.vx = Math.cos(a) * this.speed; this.vy = Math.sin(a) * this.speed;
        this.x += this.vx * dt * 60; this.y += this.vy * dt * 60;
        if (dist(this.x, this.y, ownerX, ownerY) < 20) this.dead = true;
      }
    } else {
      this.x += this.vx * dt * 60; this.y += this.vy * dt * 60;
    }
  }
  draw(ctx, cam) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(this.spin);
    drawIconBadge(ctx, this.radius, this.color, this.icon, this.aura, this.spin, this.iconId);
    ctx.restore();
  }
}

export class Pulse {
  // expanding ring (aura) or delayed explosion (nova)
  constructor(x, y, maxRadius, damage, kind, telegraph = 0, color = '#8a6a4a', icon = '🪵', branch = null, iconId = null) {
    this.x = x; this.y = y;
    this.color = color;
    this.icon = icon;
    this.iconId = iconId;
    this.branch = branch;
    this.maxRadius = maxRadius;
    this.radius = kind === 'nova' ? maxRadius : 0;
    this.damage = damage;
    this.kind = kind;
    this.t = 0;
    this.telegraph = telegraph;
    this.exploded = telegraph <= 0 ? false : null; // null = waiting
    this.done = false;
    this.hitSet = new Set();
    this.dur = kind === 'aura' ? 0.45 : 0.3;
  }
  update(dt) {
    this.t += dt;
    if (this.kind === 'nova') {
      if (this.telegraph > 0) {
        this.telegraph -= dt;
        if (this.telegraph <= 0) this.exploded = true;
        return;
      }
      if (this.t > this.dur) this.done = true;
    } else {
      this.radius = this.maxRadius * clamp(this.t / this.dur, 0, 1);
      if (this.t > this.dur) this.done = true;
    }
  }
  draw(ctx, cam) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save();
    ctx.translate(sx, sy);
    if (this.kind === 'nova' && this.telegraph > 0) {
      ctx.strokeStyle = 'rgba(255,80,100,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, this.maxRadius, 0, Math.PI * 2); ctx.stroke();
      return ctx.restore();
    }
    if (this.kind === 'nova') {
      drawIconBadge(ctx, 17, this.color, this.icon, false, 0, this.iconId);
      ctx.strokeStyle = `rgba(255,150,80,${0.5 * (1 - this.t / this.dur)})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, this.maxRadius, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(200,230,180,${0.6 * (1 - this.t / this.dur)})`;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
}

export class OrbitGroup {
  constructor(weaponId) {
    this.weaponId = weaponId;
    this.angle = 0;
    this.hitCd = new Map(); // enemy.uid -> cooldown remaining
  }
  update(dt, player, stats, enemies, onHit, branch) {
    this.angle += (stats.spinSpeed ?? 2.5) * dt;
    const count = Math.max(1, stats.count ?? 1);
    const r = (stats.orbitR ?? 70) * (stats.area ?? 1);
    const bladeRadius = 16 * Math.sqrt(stats.area ?? 1);
    for (const [uid, cd] of this.hitCd) {
      const nv = cd - dt;
      if (nv <= 0) this.hitCd.delete(uid); else this.hitCd.set(uid, nv);
    }
    this.blades = [];
    for (let i = 0; i < count; i++) {
      const a = this.angle + (Math.PI * 2 * i) / count;
      const bx = player.x + Math.cos(a) * r;
      const by = player.y + Math.sin(a) * r;
      this.blades.push({ x: bx, y: by, r: bladeRadius });
      for (const e of enemies) {
        if (e.dead) continue;
        if (this.hitCd.has(e.uid)) continue;
        if (dist(bx, by, e.x, e.y) < bladeRadius + e.radius) {
          onHit(e, stats.damage, branch);
          this.hitCd.set(e.uid, 0.4);
        }
      }
    }
  }
  draw(ctx, cam) {
    if (!this.blades) return;
    const def = getDef(this.weaponId) || {};
    for (const b of this.blades) {
      const sx = b.x - cam.x, sy = b.y - cam.y;
      ctx.save();
      ctx.translate(sx, sy);
      drawIconBadge(ctx, b.r, def.color || '#cccccc', def.icon || '🌙', !!def.aura, this.angle, this.weaponId);
      ctx.restore();
    }
  }
}

// HoloCure-style merge: both the weapon AND its required passive must be at
// max level. Merging consumes the passive entirely (freeing its inventory
// slot) and replaces the weapon with its evolved form in the same slot -
// net effect: 2 maxed items become 1 evolved item, opening up a free slot.
export function tryEvolve(player) {
  for (const pair of EVOLUTION_PAIRS) {
    const w = player.weapons.find(w => w.id === pair.weapon);
    const pIdx = player.passives.findIndex(p => p.id === pair.passive);
    const p = pIdx >= 0 ? player.passives[pIdx] : null;
    if (
      w && p && !w.evolved &&
      w.level >= WEAPONS[pair.weapon].maxLevel &&
      p.level >= PASSIVES[pair.passive].maxLevel
    ) {
      w.id = pair.evolvesTo;
      w.evolved = true;
      w.level = 1;
      player.passives.splice(pIdx, 1);
      player.recompute();
      return pair;
    }
  }
  return null;
}

// Second fusion tier: the already-evolved weapon + a second maxed passive +
// a high player level. Deliberately strict - see data.js's comment on
// SUPER_EVOLUTION_PAIRS for why (long-term completionist hook).
export function trySuperEvolve(player) {
  for (const pair of SUPER_EVOLUTION_PAIRS) {
    const w = player.weapons.find(w => w.id === pair.weapon && w.evolved && !w.superEvolved);
    const pIdx = player.passives.findIndex(p => p.id === pair.passive);
    const p = pIdx >= 0 ? player.passives[pIdx] : null;
    if (
      w && p &&
      player.level >= pair.minLevel &&
      p.level >= PASSIVES[pair.passive].maxLevel
    ) {
      w.id = pair.evolvesTo;
      w.superEvolved = true;
      w.level = 1;
      player.passives.splice(pIdx, 1);
      player.recompute();
      return pair;
    }
  }
  return null;
}

// Monster-Hunter-style element branch: pick one of BRANCH_DEFS for a maxed,
// still-unfused starting weapon. Only finds the candidate - the actual
// choice is made by the player via ui.js's showBranchChoice, which sets
// w.branch directly (kept off the weapon id so it survives evolution).
export function findBranchCandidate(player) {
  return player.weapons.find(w =>
    BRANCHABLE_WEAPONS.includes(w.id) && !w.branch && !w.evolved &&
    w.level >= WEAPONS[w.id].maxLevel
  ) || null;
}

export function updateWeapons(game, dt) {
  const player = game.player;
  for (const w of player.weapons) {
    const def = getDef(w.id);
    if (!def) continue;
    const stats = computeStats(def, w.level, player, w.branch);

    if (def.behavior === 'orbit' || def.behavior === 'sweep') {
      if (!w._orbit) w._orbit = new OrbitGroup(w.id);
      w._orbit.weaponId = w.id; // keep in sync - w.id changes on evolution/super-evolution
      w._orbit.update(dt, player, stats, game.enemies, (enemy, dmg, branch) => game.damageEnemy(enemy, dmg, w.id, branch), w.branch);
      continue;
    }

    w.cd = (w.cd ?? 0) - dt;
    if (w.cd > 0) continue;
    w.cd = stats.cooldown;

    if (def.behavior === 'homing') {
      const count = Math.max(1, stats.count ?? 1);
      for (let i = 0; i < count; i++) {
        const target = nearestEnemy(player.x, player.y, game.enemies, 900);
        let angle;
        if (target) angle = angleTo(player.x, player.y, target.x, target.y) + (i - (count - 1) / 2) * 0.18;
        else angle = Math.random() * Math.PI * 2;
        const radius = 9 * Math.sqrt(stats.area ?? 1);
        game.projectiles.push(new Projectile(player.x, player.y, angle, stats.speed, stats.damage, stats.pierce, radius, def.icon, 3.2, 'straight', 0, def.color, !!def.aura, w.branch, w.id));
      }
    } else if (def.behavior === 'spread') {
      const count = Math.max(1, stats.count ?? 1);
      const baseA = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const angle = baseA + (Math.PI * 2 * i) / count;
        const radius = 7 * Math.sqrt(stats.area ?? 1);
        game.projectiles.push(new Projectile(player.x, player.y, angle, stats.speed, stats.damage, stats.pierce, radius, def.icon, 2.4, 'straight', 0, def.color, !!def.aura, w.branch, w.id));
      }
    } else if (def.behavior === 'boomerang') {
      const count = Math.max(1, stats.count ?? 1);
      for (let i = 0; i < count; i++) {
        const target = nearestEnemy(player.x, player.y, game.enemies, 900);
        const angle = target ? angleTo(player.x, player.y, target.x, target.y) : Math.random() * Math.PI * 2;
        const spread = angle + (i - (count - 1) / 2) * 0.5;
        const radius = 12 * Math.sqrt(stats.area ?? 1);
        game.projectiles.push(new Projectile(player.x, player.y, spread, stats.speed, stats.damage, stats.pierce, radius, def.icon, 4, 'boomerang', stats.range, def.color, !!def.aura, w.branch, w.id));
      }
    } else if (def.behavior === 'nova') {
      const count = Math.max(1, stats.count ?? 1);
      for (let i = 0; i < count; i++) {
        const target = nearestEnemy(player.x + (Math.random() - 0.5) * 300, player.y + (Math.random() - 0.5) * 300, game.enemies, 700);
        const px = target ? target.x : player.x + (Math.random() - 0.5) * 300;
        const py = target ? target.y : player.y + (Math.random() - 0.5) * 300;
        game.pulses.push(new Pulse(px, py, stats.radius * (stats.area ?? 1), stats.damage, 'nova', 0.5, def.color, def.icon, w.branch, w.id));
      }
    } else if (def.behavior === 'aura') {
      game.pulses.push(new Pulse(player.x, player.y, stats.radius * (stats.area ?? 1), stats.damage, 'aura', 0, def.color, def.icon, w.branch, w.id));
    }
  }
}
