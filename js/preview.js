// Live "what does this look like at max level" mini-canvas demo for the
// compendium. Drives the REAL weapons.js/entities.js classes against a tiny
// stub game object instead of re-implementing any visual logic, so the
// preview can never drift from actual in-run behavior (see weapons.js's
// updateWeapons(), which already only assumes {player, projectiles, pulses,
// enemies} - not a literal Game instance).
import { getDef, updateWeapons, Pulse } from './weapons.js';
import { Companion } from './entities.js';

const VIEW_RADIUS = 110; // world units shown across the canvas, each direction

function makeDummyEnemies(n = 3, r = 70) {
  const enemies = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    enemies.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, dead: false, uid: 'preview' + i, radius: 14, hp: 9e9, maxHp: 9e9 });
  }
  return enemies;
}

function drawScene(ctx, size, scale, enemies, drawFn) {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  for (const e of enemies) { ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
  drawFn();
  ctx.restore();
}

// Weapon preview: real Projectile/Pulse/OrbitGroup classes at max level,
// driven by the actual updateWeapons() loop - works for every behavior
// (homing/spread/boomerang/nova/aura/orbit/sweep) with no special-casing.
export function mountWeaponPreview(canvas, weaponId) {
  const def = getDef(weaponId);
  if (!def) return null;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const scale = size / (VIEW_RADIUS * 2);
  const stub = {
    player: { x: 0, y: 0, power: 1, area: 1, cooldownMult: 1, weapons: [{ id: weaponId, level: def.maxLevel, cd: 0 }] },
    projectiles: [], pulses: [], enemies: makeDummyEnemies(),
    damageEnemy: () => {},
  };
  let raf, last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateWeapons(stub, dt);
    for (const p of stub.projectiles) p.update(dt, stub.player.x, stub.player.y, stub.enemies);
    stub.projectiles = stub.projectiles.filter(p => !p.dead);
    for (const pu of stub.pulses) { pu.update(dt); if (pu.kind === 'nova' && pu.exploded) pu.exploded = false; }
    stub.pulses = stub.pulses.filter(pu => !pu.done);

    drawScene(ctx, size, scale, stub.enemies, () => {
      for (const p of stub.projectiles) p.draw(ctx, { x: 0, y: 0 });
      for (const pu of stub.pulses) pu.draw(ctx, { x: 0, y: 0 });
      const w = stub.player.weapons[0];
      if (w._orbit) w._orbit.draw(ctx, { x: 0, y: 0 });
    });
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return { dispose() { cancelAnimationFrame(raf); } };
}

// Skill preview: only 'aura' and 'summon' types have a meaningful animated
// form (a Pulse ring / a Companion) - 'statBoost' and 'onHit' are a flat
// number and a chance-based combat-log effect respectively, so callers
// should skip mounting a canvas at all when this returns null.
export function mountSkillPreview(canvas, def) {
  if (def.type !== 'aura' && def.type !== 'summon') return null;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const scale = size / (VIEW_RADIUS * 2);
  const stats = { ...def.base };
  for (let l = 2; l <= def.maxLevel; l++) for (const k in def.perLevel) stats[k] = (stats[k] ?? 0) + def.perLevel[k];

  const player = { x: 0, y: 0 };
  const enemies = makeDummyEnemies();
  let pulses = [], companions = [], cdAccum = 0;
  if (def.type === 'summon') companions.push(new Companion(def.id, def.variant, 0));

  let raf, last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (def.type === 'aura') {
      cdAccum -= dt;
      if (cdAccum <= 0) {
        cdAccum = stats.cooldown;
        pulses.push(new Pulse(0, 0, stats.radius, stats.damage, 'aura', 0, '#ffd76a', def.icon, null, def.id));
      }
      for (const pu of pulses) pu.update(dt);
      pulses = pulses.filter(pu => !pu.done);
    } else {
      for (const c of companions) c.update(dt, player);
    }
    drawScene(ctx, size, scale, enemies, () => {
      for (const pu of pulses) pu.draw(ctx, { x: 0, y: 0 });
      for (const c of companions) c.draw(ctx, { x: 0, y: 0 });
    });
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return { dispose() { cancelAnimationFrame(raf); } };
}
