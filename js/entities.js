import { clamp, dist } from './utils.js';
import { PLAYER_BASE, PASSIVES, PERMANENT_UPGRADES, BRANCH_DEFS } from './data.js';
import { tryLoadImage, tryLoadAnim } from './assets.js';
import { getPermanentUpgrades } from './storage.js';

const TIER_COLORS = { 1: '#a8d8b0', 2: '#e8c15a', 3: '#e8703f' };

// Picks the current frame index (into the sheet) for a named clip at time t.
// Falls back to the manifest's first clip if the requested one doesn't exist,
// so e.g. requesting 'walk' on a sheet that only has 'idle' still works.
function animFrame(manifest, clipName, t) {
  const clip = manifest.clips[clipName] || manifest.clips[Object.keys(manifest.clips)[0]];
  if (!clip || !clip.frames || !clip.frames.length) return { sx: 0, sy: 0 };
  const idx = Math.floor(t * (clip.fps || 6)) % clip.frames.length;
  const frame = clip.frames[idx];
  return { sx: frame * manifest.frameW, sy: 0 };
}

// 'source-atop' tinting must happen on an offscreen canvas that contains
// ONLY the sprite frame - doing it directly on the main game canvas would
// tint everything already drawn behind the sprite (ground, trees) too,
// since those pixels are opaque there as well. One small cached canvas per
// (image, variant, frame) covers every future enrage/veteran repaint cheaply.
const tintCanvasCache = new Map();
function getTintedFrame(img, sx, sy, fw, fh, tint, tintStrength) {
  const key = `${img.src}|${sx}|${sy}|${tint}|${tintStrength}`;
  let c = tintCanvasCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = fw; c.height = fh;
  const cctx = c.getContext('2d');
  cctx.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);
  cctx.globalCompositeOperation = 'source-atop';
  cctx.globalAlpha = tintStrength ?? 0.3;
  cctx.fillStyle = tint;
  cctx.fillRect(0, 0, fw, fh);
  tintCanvasCache.set(key, c);
  return c;
}

// Draws one frame from a sprite-sheet+manifest (see tryLoadAnim / pixel-editor.html's
// exporter for the data shape), naturally sized like the static-image path, with
// an optional variant tint+scale (unused today - ready for the planned enrage/
// veteran variants so those won't need new code, just a `variant` flag + palette).
function drawAnimFrame(ctx, animEntry, clipName, t, w, h, variant) {
  const m = animEntry.manifest;
  const { sx, sy } = animFrame(m, clipName, t);
  const v = variant && m.variants && m.variants[variant];
  const scale = v && v.scale ? v.scale : 1;
  const dw = w * scale, dh = h * scale;
  if (v && v.tint) {
    const tinted = getTintedFrame(animEntry.img, sx, sy, m.frameW, m.frameH, v.tint, v.tintStrength);
    ctx.drawImage(tinted, -dw / 2, -dh / 2, dw, dh);
  } else {
    ctx.drawImage(animEntry.img, sx, sy, m.frameW, m.frameH, -dw / 2, -dh / 2, dw, dh);
  }
  return { dw, dh };
}

// A solid-color cutout of one sprite frame (same alpha shape, flat fill) -
// the base shape used to fake an outline-hugging aura/glow, since canvas has
// no native "glow along alpha edge" primitive. Cached per (image, frame,
// color) like getTintedFrame, since it's pure function of those inputs.
const silhouetteCache = new Map();
function getSilhouette(img, sx, sy, fw, fh, color) {
  const key = `${img.src}|${sx}|${sy}|${color}`;
  let c = silhouetteCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = fw; c.height = fh;
  const cctx = c.getContext('2d');
  cctx.drawImage(img, sx, sy, fw, fh, 0, 0, fw, fh);
  cctx.globalCompositeOperation = 'source-in';
  cctx.fillStyle = color;
  cctx.fillRect(0, 0, fw, fh);
  silhouetteCache.set(key, c);
  return c;
}

// The aura's blur+multi-stamp compositing (built by buildAuraSprite below) is
// expensive - fine to do ONCE per (frame, color), but was originally being
// redone from scratch every single rendered frame (10 blurred drawImage
// calls per aura, per entity, every tick), which is what made things heavy.
// Baking it into a cached canvas up front means the hot path per-frame is
// just one plain drawImage, same cost as drawing the sprite itself.
const auraSpriteCache = new Map();
const AURA_PAD = 14;
function buildAuraSprite(img, sx, sy, fw, fh, color) {
  const key = `${img.src}|${sx}|${sy}|${color}`;
  let c = auraSpriteCache.get(key);
  if (c) return c;
  const sil = getSilhouette(img, sx, sy, fw, fh, color);
  c = document.createElement('canvas');
  c.width = fw + AURA_PAD * 2;
  c.height = fh + AURA_PAD * 2;
  const cctx = c.getContext('2d');
  cctx.filter = 'blur(4px)';
  const steps = 8, thickness = 5;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const ox = Math.cos(a) * thickness, oy = Math.sin(a) * thickness;
    cctx.drawImage(sil, AURA_PAD + ox, AURA_PAD + oy, fw, fh);
  }
  auraSpriteCache.set(key, c);
  return c;
}

// Outline aura for 3D-rendered (sprite-sheet) characters: replaces the old
// flat "circle behind the portrait" look, which doesn't fit a full-body
// sprite. The glow actually hugs the character's own shape (baked from its
// alpha silhouette) instead of being a generic circle. Draw before the
// real sprite; `strength` only modulates alpha at draw time (cheap), the
// expensive part is precomputed once by buildAuraSprite.
function drawSpriteOutlineAura(ctx, animEntry, clipName, t, w, h, color, strength = 1) {
  if (strength <= 0) return;
  const m = animEntry.manifest;
  const { sx, sy } = animFrame(m, clipName, t);
  const aura = buildAuraSprite(animEntry.img, sx, sy, m.frameW, m.frameH, color);
  const scaleX = w / m.frameW, scaleY = h / m.frameH;
  const dw = aura.width * scaleX, dh = aura.height * scaleY;
  ctx.save();
  ctx.globalAlpha = Math.min(1, strength);
  ctx.drawImage(aura, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

function computeEnemyXP(hp, damage) {
  return Math.max(1, Math.round(hp * 0.18 + damage * 0.4));
}

export class Player {
  constructor(costume) {
    this.costume = costume;
    this.x = 0; this.y = 0;
    this.facing = 1;
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 10;
    this.kills = 0;
    this.weapons = []; // {id, level}
    this.passives = []; // {id, level}
    this.invuln = 0;
    this.hitFlash = 0;
    this.animT = 0;
    // animEntry (sheet+manifest) takes priority when present; portrait (a
    // single static image, clipped to a circle below) is the fallback.
    this.animEntry = tryLoadAnim(`assets/player/${costume.id}`);
    this.portrait = tryLoadImage(`assets/player/${costume.id}.png`);
    this.recompute();
    this.hp = this.maxHP;
  }

  recompute() {
    const base = { ...PLAYER_BASE };
    const mods = this.costume.statMods || {};
    for (const k in mods) {
      if (k === 'maxHP') base.maxHP += mods[k];
      else if (k === 'speed') base.speed += mods[k];
      else base[k] = (base[k] ?? 0) + mods[k];
    }
    const permanent = getPermanentUpgrades();
    for (const id in permanent) {
      const def = PERMANENT_UPGRADES[id];
      if (!def) continue;
      const total = def.perLevel * permanent[id];
      if (def.stat === 'maxHP') base.maxHP += total;
      else if (def.stat === 'moveSpeedMult') base.moveSpeedMult += total;
      else base[def.stat] = (base[def.stat] ?? (def.stat === 'power' || def.stat === 'area' || def.stat === 'cooldown' || def.stat === 'xpMult' ? 1 : 0)) + total;
    }
    for (const p of this.passives) {
      const def = PASSIVES[p.id];
      const total = def.perLevel * p.level;
      if (def.stat === 'maxHP') base.maxHP += total;
      else if (def.stat === 'moveSpeedMult') base.moveSpeedMult += total;
      else base[def.stat] = (base[def.stat] ?? (def.stat === 'power' || def.stat === 'area' || def.stat === 'cooldown' || def.stat === 'xpMult' ? 1 : 0)) + total;
    }
    // 'power' branch weapons (Monster-Hunter-style element choice, see
    // data.js BRANCH_DEFS) add to the player's overall crit chance while
    // equipped - stacks additively across multiple power-branched weapons.
    let critBonus = 0;
    for (const w of this.weapons) {
      const bdef = w.branch && BRANCH_DEFS[w.branch];
      if (bdef && bdef.critBonus) critBonus += bdef.critBonus;
    }

    const prevMax = this.maxHP;
    this.maxHP = Math.round(base.maxHP);
    this.speed = base.speed * (base.moveSpeedMult ?? 1);
    this.power = base.power;
    this.area = base.area;
    this.cooldownMult = Math.max(0.3, base.cooldown);
    this.luck = base.luck;
    this.regen = base.regen;
    this.pickupRange = base.pickupRange;
    this.xpMult = base.xpMult;
    this.critChance = clamp(base.critChance + critBonus, 0, 1);
    this.critMult = base.critMult;
    if (prevMax !== undefined && this.hp !== undefined) {
      this.hp = clamp(this.hp + (this.maxHP - prevMax), 1, this.maxHP);
    }
  }

  addWeapon(id) {
    const existing = this.weapons.find(w => w.id === id);
    if (existing) existing.level++;
    else this.weapons.push({ id, level: 1, cd: 0 });
  }
  addPassive(id) {
    const existing = this.passives.find(p => p.id === id);
    if (existing) existing.level++;
    else this.passives.push({ id, level: 1 });
    this.recompute();
  }

  gainXP(amount) {
    this.xp += amount * this.xpMult;
    let levels = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.xpToNext = Math.round(this.xpToNext * 1.18 + 4);
      levels++;
    }
    return levels;
  }

  takeDamage(amount) {
    if (this.invuln > 0) return false;
    this.hp -= amount;
    this.invuln = 0.7;
    this.hitFlash = 0.15;
    return true;
  }

  update(dt, input) {
    this.animT += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.hp = clamp(this.hp + this.regen * dt, 0, this.maxHP);
    const dx = input.dir.x, dy = input.dir.y;
    if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
    this.x += dx * this.speed * 60 * dt;
    this.y += dy * this.speed * 60 * dt;
    this.moving = (dx !== 0 || dy !== 0);
  }

  draw(ctx, cam) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save();
    ctx.translate(sx, sy);
    if (this.hitFlash > 0) ctx.globalAlpha = 0.5;
    const bob = this.moving ? Math.sin(this.animT * 10) * 3 : Math.sin(this.animT * 3) * 1.5;
    ctx.scale(this.facing, 1);

    // shadow
    ctx.globalAlpha *= 1;
    ctx.beginPath();
    ctx.ellipse(0, 22, 16, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    ctx.translate(0, bob);
    // body
    if (this.animEntry && this.animEntry.ready) {
      // real per-frame walk-cycle art (see pixel-editor.html) - drawn at
      // natural size like enemies rather than clipped into the old portrait
      // circle, since a walk cycle needs the whole body visible to read.
      // A 3D-rendered character reads better bigger than the old flat pixel
      // sprites did, hence 52 rather than the previous 36.
      const clip = this.moving ? 'walk' : 'idle';
      const auraColor = this.invuln > 0 ? '#ffffff' : this.costume.accent;
      const auraStrength = this.invuln > 0
        ? 0.6 + 0.4 * Math.sin(this.animT * 24)
        : 0.35 + 0.15 * Math.sin(this.animT * 2);
      drawSpriteOutlineAura(ctx, this.animEntry, clip, this.animT, 52, 52, auraColor, auraStrength);
      drawAnimFrame(ctx, this.animEntry, clip, this.animT, 52, 52, null);
    } else if (this.portrait.loaded) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = this.costume.color;
      ctx.fill();
      ctx.drawImage(this.portrait.img, -17, -17, 34, 34);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = this.costume.color;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffffcc';
      ctx.stroke();
      // accent (costume symbol) - only needed when there's no portrait art
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.costume.icon, 0, -2);
    }
    if (!(this.animEntry && this.animEntry.ready)) {
      // crown/accent ring - only for the flat portrait/icon fallbacks above,
      // which need it to read as "this costume's color/symbol". A 3D-rendered
      // sprite already reads on its own and gets the outline aura instead.
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.strokeStyle = this.costume.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    if (this.invuln > 0.3) {
      // subtle flicker handled by alpha already
    }
  }
}

let enemyUid = 1;
export class Enemy {
  constructor(type, x, y, hpMult = 1, dmgMult = 1) {
    this.uid = enemyUid++;
    this.type = type;
    this.name = type.name;
    this.icon = type.icon;
    this.x = x; this.y = y;
    this.maxHp = Math.round(type.hp * hpMult);
    this.hp = this.maxHp;
    this.speed = type.speed;
    this.damage = Math.round(type.damage * dmgMult);
    this.radius = type.radius;
    this.color = type.color;
    this.tier = type.tier || 1;
    this.elite = !!type.elite;
    this.boss = !!type.boss;
    this.xp = computeEnemyXP(this.maxHp, this.damage);
    this.dead = false;
    this.hitFlash = 0;
    this.animT = Math.random() * 10;
    this.facing = 1;
    this.knockX = 0; this.knockY = 0;
    // animEntry (sheet+manifest) takes priority when present; imgEntry (a
    // single static image) is the fallback for older single-PNG art; if
    // neither loads, draw() falls back further to an emoji circle.
    this.animEntry = type.id ? tryLoadAnim(`assets/enemies/${type.id}`) : null;
    this.imgEntry = type.id ? tryLoadImage(`assets/enemies/${type.id}.png`) : null;
    this.variant = null; // future: 'enrage' | 'veteran' (see data.js BRANCH_DEFS-style variant tinting in drawAnimFrame)
    // weapon-branch status effects (see data.js BRANCH_DEFS)
    this.poisonDps = 0;
    this.poisonTime = 0;
    this.paralyzeTime = 0;
  }

  update(dt, player) {
    this.animT += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.paralyzeTime > 0) this.paralyzeTime -= dt;
    const d = dist(this.x, this.y, player.x, player.y) || 1;
    const nx = (player.x - this.x) / d, ny = (player.y - this.y) / d;
    // no true walk-cycle frames in the source art, so a horizontal flip +
    // the squash/stretch bob below fake a walking motion cheaply
    if (nx > 0.08) this.facing = 1; else if (nx < -0.08) this.facing = -1;
    const paralyzeMult = this.paralyzeTime > 0 ? 0.04 : 1;
    let vx = nx * this.speed * 60 * dt * paralyzeMult;
    let vy = ny * this.speed * 60 * dt * paralyzeMult;
    if (Math.abs(this.knockX) > 0.01 || Math.abs(this.knockY) > 0.01) {
      vx += this.knockX; vy += this.knockY;
      this.knockX *= 0.85; this.knockY *= 0.85;
    }
    this.x += vx; this.y += vy;
    if (!this.boss && d < this.radius + 18) {
      const hit = player.takeDamage(this.damage);
      if (hit) {
        this.knockX -= nx * 2; this.knockY -= ny * 2;
      }
    } else if (this.boss && d < this.radius + 20) {
      player.takeDamage(this.damage * dt * 3);
    }
  }

  takeDamage(amount) {
    this.hp -= amount;
    this.hitFlash = 0.1;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      return true;
    }
    return false;
  }

  draw(ctx, cam) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    const tierColor = this.boss ? '#ff2b4a' : this.elite ? '#ffd76a' : (TIER_COLORS[this.tier] || TIER_COLORS[1]);
    ctx.save();
    ctx.translate(sx, sy);
    const bob = Math.sin(this.animT * 6) * (this.boss ? 4 : 2);

    // ground shadow doubles as the toughness indicator (pale green -> amber
    // -> orange -> gold(elite) -> red(boss)) now that the sprite itself is a
    // natural character shape instead of a circular badge
    ctx.beginPath();
    ctx.ellipse(0, this.radius + 6, this.radius * 0.8, this.radius * 0.32, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.lineWidth = this.boss || this.elite ? 2.5 : 1.8;
    ctx.strokeStyle = tierColor;
    ctx.stroke();

    // status-effect indicator (poison/paralysis branch weapons) - a small
    // pulsing ring above the enemy so afflictions read at a glance
    if (this.poisonTime > 0 || this.paralyzeTime > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(this.animT * 10);
      ctx.beginPath();
      ctx.arc(0, -this.radius - 10, 5 + pulse, 0, Math.PI * 2);
      ctx.fillStyle = this.paralyzeTime > 0 ? '#ffe45a' : '#7fe66a';
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.translate(0, bob);
    const hasAnim = this.animEntry && this.animEntry.ready;
    const hasImage = !hasAnim && this.imgEntry && this.imgEntry.loaded;
    if (hasAnim || hasImage) {
      // HoloCure-scale natural character sprite (not clipped into a circle),
      // with a soft dark halo behind it so it reads clearly against busy
      // ground textures (trees/tufts/etc) regardless of the sprite's own colors.
      // Bumped from 2.3x to 2.8x radius -- sprites were reading too small on
      // desktop-size viewports.
      const h = this.radius * 2.8, w = this.radius * 2.8;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.46, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,10,10,0.4)';
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.scale(this.facing, 1);
      if (hasAnim) {
        // real per-frame walk-cycle art (see pixel-editor.html) instead of
        // the fake squash/stretch used for plain single-image sprites.
        // Elite/boss get an outline aura hugging the actual sprite shape
        // (same mechanism as the player's) instead of just the ground ring.
        if (this.elite || this.boss) {
          drawSpriteOutlineAura(ctx, this.animEntry, 'walk', this.animT, w, h, tierColor, 0.7);
        }
        drawAnimFrame(ctx, this.animEntry, 'walk', this.animT, w, h, this.variant);
      } else {
        const walk = Math.sin(this.animT * 10) * 0.06;
        const fh = h * (1 + walk), fw = w * (1 - walk);
        ctx.drawImage(this.imgEntry.img, -fw / 2, -fh / 2, fw, fh);
      }
      ctx.scale(this.facing, 1); // undo, so the flash/halo below stay unflipped
      if (this.hitFlash > 0) {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(0, 0, w * 0.5, h * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.hitFlash > 0 ? '#ffffff' : this.color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(10,10,10,0.6)';
      ctx.stroke();
      ctx.font = `${this.radius}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.icon, 0, 0);
    }
    ctx.restore();

    // hp bar for elites/boss
    if (this.elite || this.boss) {
      const w = this.radius * 2;
      ctx.save();
      ctx.translate(sx - w / 2, sy - this.radius - 14);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, w, 5);
      ctx.fillStyle = this.boss ? '#ff2b4a' : '#ffd76a';
      ctx.fillRect(0, 0, w * clamp(this.hp / this.maxHp, 0, 1), 5);
      ctx.restore();
    }
  }
}

export class Gem {
  constructor(x, y, value) {
    this.x = x; this.y = y; this.value = value;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.collected = false;
    this.magnet = false;
    this.superPull = false; // set true by the wisdom-fruit pickup for a fast, visible sweep-in
    this.t = 0;
  }
  update(dt, player) {
    this.t += dt;
    this.x += this.vx * 30 * dt; this.y += this.vy * 30 * dt;
    this.vx *= 0.9; this.vy *= 0.9;
    const d = dist(this.x, this.y, player.x, player.y);
    if (d < player.pickupRange || this.magnet) {
      this.magnet = true;
      const nx = (player.x - this.x) / (d || 1), ny = (player.y - this.y) / (d || 1);
      const spd = this.superPull ? clamp(1400 - d, 500, 1400) : clamp(400 - d, 120, 500);
      this.x += nx * spd * dt; this.y += ny * spd * dt;
    }
    if (d < 16) this.collected = true;
  }
  draw(ctx, cam) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    const bob = this.superPull ? 0 : Math.sin(this.t * 8) * 2;
    ctx.save();
    // dark halo behind every gem so it reads clearly against any ground color
    ctx.shadowColor = this.superPull ? '#ffe08a' : 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = this.superPull ? 14 : 5;
    ctx.translate(sx, sy + bob);
    ctx.rotate(Math.PI / 4);
    const size = this.value >= 20 ? 11 : this.value >= 8 ? 9 : 7;
    // low-tier color changed from green (blended into grass) to a bright blue
    ctx.fillStyle = this.value >= 20 ? '#ff8fc7' : this.value >= 8 ? '#ffd76a' : '#5ec8ff';
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.strokeStyle = '#ffffffcc';
    ctx.lineWidth = 1;
    ctx.strokeRect(-size / 2 + 1.5, -size / 2 + 1.5, size - 3, size - 3);
    ctx.restore();
  }
}

export class Chest {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.collected = false;
    this.t = 0;
  }
  update(dt, player) {
    this.t += dt;
    if (dist(this.x, this.y, player.x, player.y) < 30) this.collected = true;
  }
  draw(ctx, cam) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    const bob = Math.sin(this.t * 3) * 3;
    ctx.save();
    ctx.translate(sx, sy + bob);
    ctx.font = '28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📦', 0, 0);
    ctx.restore();
  }
}

const PICKUP_ICONS = { heal: '🌸', magnet: '🍎' };
const PICKUP_IMAGES = {
  heal: tryLoadImage('assets/tiles/icon_heal_flower.png'),
  magnet: tryLoadImage('assets/tiles/icon_magnet_gems.png'),
};

export class Pickup {
  constructor(x, y, kind) {
    this.x = x; this.y = y; this.kind = kind;
    this.collected = false;
    this.t = 0;
  }
  update(dt, player) {
    this.t += dt;
    if (dist(this.x, this.y, player.x, player.y) < 30) this.collected = true;
  }
  draw(ctx, cam) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    const bob = Math.sin(this.t * 4) * 4;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3.2);
    const mainColor = this.kind === 'heal' ? '#5cf29a' : '#ffd76a';
    ctx.save();
    ctx.translate(sx, sy + bob);

    // outer breathing glow ring so it reads from far away
    ctx.beginPath();
    ctx.arc(0, 0, 24 + pulse * 4, 0, Math.PI * 2);
    ctx.strokeStyle = mainColor;
    ctx.globalAlpha = 0.25 + pulse * 0.25;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // solid backing disc + bright border so the sprite doesn't blend into the ground
    ctx.beginPath();
    ctx.arc(0, 0, 19, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,20,14,0.75)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = mainColor;
    ctx.stroke();

    const img = PICKUP_IMAGES[this.kind];
    if (img && img.loaded) {
      ctx.drawImage(img.img, -16, -16, 32, 32);
    } else {
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PICKUP_ICONS[this.kind] || '❓', 0, 0);
    }
    ctx.restore();
  }
}

export class FloatText {
  constructor(x, y, text, color = '#fff') {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.life = 0.7; this.maxLife = 0.7;
  }
  update(dt) {
    this.life -= dt;
    this.y -= 25 * dt;
  }
  draw(ctx, cam) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save();
    ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1);
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, sx, sy);
    ctx.restore();
  }
}
