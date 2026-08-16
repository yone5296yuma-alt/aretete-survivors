import { InputManager } from './input.js';
import { Player, Enemy, Gem, Chest, Pickup, FloatText, Companion, spawnBurst } from './entities.js';
import { updateWeapons, tryEvolve, trySuperEvolve, findBranchCandidate, Pulse } from './weapons.js';
import { updateHUD, buildUpgradeChoices, showLevelUp, showEvolveNotice, showResult, fmtTime, renderLoadout, showBranchChoice } from './ui.js';
import { ENEMY_TYPES } from './data.js';
import { dist, clamp, randRange, pick, weightedPick } from './utils.js';
import { SFX } from './audio.js';
import { markStageCleared, addLeaderboardEntry, addCoins } from './storage.js';
import { tryLoadImage } from './assets.js';
import { submitOnlineLeaderboard, syncLocalToCloud } from './api.js';

const FLOOR_SECONDS = 20; // 1 "floor" per 20s of endless survival
const FLOOR_MILESTONE = 50; // growth rate steepens every 50 floors
const TRAIL_CELL = 20; // worn-path grid resolution (finer than the 48px ground tile)

// Real CC0 art (Kenney.nl) used for ground + flower patches + player/enemy
// portraits. Trees/bushes are drawn procedurally instead of from sprites:
// Kenney's tiny-town decoration tiles are designed assuming they sit *on top
// of* an existing matching-green grass tile (their fill color is literally
// identical to our grass tile), so compositing them over our own grass made
// them look like hollow outlines. Solid-color fallback if a sprite fails to
// load so nothing ever breaks.
const BG_THEMES = {
  forest: {
    top: '#16321f', bottom: '#070f09',
    fireflyRGB: '255,240,150',
    // weight = relative frequency; mixing 3 grass variants per-cell gives a
    // weedy, textured ground instead of one flat repeated tile
    groundTiles: [
      { path: 'assets/tiles/ground_grass.png', weight: 6 },
      { path: 'assets/tiles/ground_grass_dot.png', weight: 3 },
      { path: 'assets/tiles/ground_grass_flower.png', weight: 2 },
    ],
    wornTile: 'assets/tiles/ground_dirt.png',
    decoTiles: [], decoCount: 0,
    // trees pulled back some in count/size from the first pass - they were
    // dense and large enough to compete with enemies for attention
    treeCount: 60, treeMinR: 38, treeMaxR: 58,
    bushCount: 50, bushMinR: 12, bushMaxR: 20,
    flowerTiles: [
      { path: 'assets/tiles/flower_teal.png', weight: 1 },
      { path: 'assets/tiles/flower_red.png', weight: 1 },
      { path: 'assets/tiles/flower_purple.png', weight: 1 },
      { path: 'assets/tiles/icon_heal_flower.png', weight: 1 },
    ],
    flowerCount: 90, flowerMinR: 9, flowerMaxR: 14,
    // dense procedural tuft overlay so the ground itself feels overgrown,
    // not just the scattered bush/flower objects on top of it
    tuftCount: 240, tuftMinR: 5, tuftMaxR: 10,
    decoTileSize: 1400,
    obstacleCount: 24, obstacleMinR: 16, obstacleMaxR: 25,
  },
  village: {
    top: '#3a2818', bottom: '#0f0904',
    fireflyRGB: '255,205,120',
    groundTiles: [
      { path: 'assets/tiles/ground_dirt.png', weight: 1 },
    ],
    wornTile: 'assets/tiles/ground_dirt.png',
    decoTiles: [
      { path: 'assets/tiles/deco_fence.png', weight: 1, minR: 24, maxR: 34 },
    ],
    decoColor: 'rgba(20,12,6,0.6)',
    decoCount: 70,
    decoTileSize: 2600,
    treeCount: 0, bushCount: 0, flowerTiles: [], flowerCount: 0, tuftCount: 0,
    obstacleCount: 0,
  },
};

// deterministic pseudo-random in [0,1) for a grid cell, so ground texture
// variants stay stable frame-to-frame instead of flickering
function cellRandom(cx, cy) {
  let h = (cx * 374761393 + cy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}
function weightedPickAt(variants, r) {
  const total = variants.reduce((s, v) => s + v.weight, 0);
  let acc = 0;
  for (const v of variants) {
    acc += v.weight / total;
    if (r <= acc) return v;
  }
  return variants[variants.length - 1];
}

// HoloCure-style tree rendering: solid brown trunk (always opaque - the
// player physically can't stand on it, see _resolveTreeCollisions) topped by
// a big dark-green multi-lobe canopy in a color deliberately far from the
// grass tile's green, so it never blends into invisibility.
function drawTreeTrunk(ctx, sx, sy, r) {
  const w = r * 0.42, h = r * 0.85;
  ctx.fillStyle = '#4a3420';
  ctx.fillRect(sx - w / 2, sy - h * 0.25, w, h);
  ctx.strokeStyle = 'rgba(20,12,6,0.7)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(sx - w / 2, sy - h * 0.25, w, h);
  ctx.beginPath();
  ctx.ellipse(sx, sy + h * 0.62, w * 0.9, w * 0.35, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
}
function drawTreeCanopy(ctx, sx, sy, r, lobes, alpha) {
  const cy = sy - r * 1.3;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#15381f';
  for (const lobe of lobes) {
    ctx.beginPath();
    ctx.arc(sx + lobe.dx * r, cy + lobe.dy * r, r * lobe.s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2f6b3e';
  for (const lobe of lobes) {
    ctx.beginPath();
    ctx.arc(sx + lobe.dx * r - r * 0.08, cy + lobe.dy * r - r * 0.1, r * lobe.s * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

const $ = (id) => document.getElementById(id);

export class Game {
  constructor(costume, stageConfig, mode = 'stage') {
    this.canvas = $('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.input = new InputManager();
    this.player = new Player(costume);
    this.player.addWeapon(costume.weaponId);

    this.mode = mode; // 'stage' | 'endless'
    this.stageConfig = stageConfig;
    this.waves = stageConfig.waves;
    this.bgTheme = BG_THEMES[stageConfig.bgTheme] || BG_THEMES.forest;
    this.groundImgs = this.bgTheme.groundTiles.map(d => ({ ...d, entry: tryLoadImage(d.path) }));
    this.decoImgs = (this.bgTheme.decoTiles || []).map(d => ({ ...d, entry: tryLoadImage(d.path) }));
    this.flowerImgs = (this.bgTheme.flowerTiles || []).map(d => ({ ...d, entry: tryLoadImage(d.path) }));
    this.wornImg = tryLoadImage(this.bgTheme.wornTile);

    this.enemies = [];
    this.projectiles = [];
    this.pulses = [];
    this.gems = [];
    this.chests = [];
    this.pickups = [];
    this.floatTexts = [];
    this.companions = []; // spawned by 'summon'-type character skills, see applyChoice()
    this.particles = [];
    this.shakeT = 0; this.shakeDur = 0.15; this.shakeMag = 0;

    this.elapsed = 0;
    this.kills = 0;
    this.running = false;
    this.paused = false;
    this.gameOver = false;
    this.spawnAccum = 0;
    this.chestTimer = 25;
    this.healTimer = randRange(35, 50);
    this.magnetTimer = randRange(55, 75);
    this.eliteIdx = 0;
    this.nextEliteTime = mode === 'endless' ? stageConfig.eliteInterval : null;
    this.bossSpawned = false;
    this.boss = null;
    this.pendingLevelUps = 0;
    this.showingCard = false;

    this.cam = { x: 0, y: 0 };
    this._resize = () => this.resizeCanvas();
    window.addEventListener('resize', this._resize);
    window.addEventListener('orientationchange', this._resize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._resize);
    this.resizeCanvas();

    this._bgDots = this._makeBgDots();
    this._trees = this._makeTrees(); // generic sprite-tiled decorations (village fences)
    this._proceduralTrees = this._makeProceduralTrees();
    this._bushes = this._makeBushes();
    this._flowerPatches = this._makeFlowerPatches();
    this._grassTufts = this._makeGrassTufts();
    this._rocks = this._makeRocks();
    this._trailWear = new Map(); // "cx,cy" -> 0..1, Death-Stranding-style worn path

    $('btn-pause').onclick = () => this.togglePause();
    $('btn-resume').onclick = () => this.togglePause();

    this.showingLoadout = false;
    this._pausedBeforeLoadout = false;
    $('btn-loadout').onclick = () => this.toggleLoadout();
    $('btn-open-loadout').onclick = () => this.toggleLoadout();
    $('btn-close-loadout').onclick = () => this.toggleLoadout();
    this._keydown = (e) => {
      if (e.key === 'Tab' && !this.gameOver) {
        e.preventDefault();
        this.toggleLoadout();
      }
    };
    window.addEventListener('keydown', this._keydown);

    this._last = performance.now();
    this._loop = this._loop.bind(this);
  }

  // Shows/hides the current-loadout panel (weapons+passives with live levels).
  // Pauses the game while open (unless it was already paused via the pause
  // menu, in which case closing returns to the pause menu instead of resuming).
  toggleLoadout() {
    if (this.gameOver || this.showingCard) return;
    if (this.showingLoadout) {
      this.showingLoadout = false;
      $('loadout-overlay').classList.add('hidden');
      if (this._pausedBeforeLoadout) {
        $('pause-overlay').classList.remove('hidden');
      } else {
        this.paused = false;
      }
    } else {
      this._pausedBeforeLoadout = this.paused;
      this.paused = true;
      $('pause-overlay').classList.add('hidden');
      renderLoadout($('loadout-list'), this.player);
      $('loadout-overlay').classList.remove('hidden');
      this.showingLoadout = true;
    }
  }

  _makeBgDots() {
    const dots = [];
    for (let i = 0; i < 90; i++) {
      dots.push({
        x: randRange(-2000, 2000), y: randRange(-2000, 2000),
        r: randRange(1.5, 4), speed: randRange(0.2, 0.6), tw: randRange(0, 10),
      });
    }
    return dots;
  }

  _makeTrees() {
    const trees = [];
    const tile = this.bgTheme.decoTileSize || 2600;
    const count = this.bgTheme.decoCount ?? 70;
    const variants = this.decoImgs.map(d => ({ item: d, weight: d.weight }));
    if (!variants.length) return trees;
    for (let i = 0; i < count; i++) {
      const variant = weightedPick(variants);
      trees.push({
        x: randRange(-tile / 2, tile / 2), y: randRange(-tile / 2, tile / 2),
        r: randRange(variant.minR, variant.maxR), tile, variant,
      });
    }
    return trees;
  }

  // Solid obstacles - unlike the decorative trees (which tile infinitely and
  // are purely visual), rocks are a fixed, finite set of world-space objects
  // that actually block player movement (see _resolveObstacleCollisions).
  _makeRocks() {
    const rocks = [];
    const count = this.bgTheme.obstacleCount || 0;
    const area = 2000;
    for (let i = 0; i < count; i++) {
      let x, y;
      do {
        x = randRange(-area, area);
        y = randRange(-area, area);
      } while (Math.hypot(x, y) < 220); // keep the immediate spawn area clear
      rocks.push({ x, y, r: randRange(this.bgTheme.obstacleMinR, this.bgTheme.obstacleMaxR) });
    }
    return rocks;
  }

  // HoloCure-style trees: drawn procedurally (trunk + canopy) rather than
  // from a sprite, tiled infinitely like the old decoImgs system. Only the
  // trunk ("root") blocks movement - the canopy above it is just visual and
  // fades out near the player (see draw()) so she never disappears under it.
  _makeProceduralTrees() {
    const trees = [];
    const tile = this.bgTheme.decoTileSize || 1400;
    const count = this.bgTheme.treeCount || 0;
    for (let i = 0; i < count; i++) {
      trees.push({
        x: randRange(-tile / 2, tile / 2), y: randRange(-tile / 2, tile / 2),
        r: randRange(this.bgTheme.treeMinR, this.bgTheme.treeMaxR), tile,
        lobes: [
          { dx: 0, dy: 0, s: 1 },
          { dx: randRange(-0.4, -0.15), dy: randRange(-0.1, 0.15), s: randRange(0.55, 0.7) },
          { dx: randRange(0.15, 0.4), dy: randRange(-0.15, 0.1), s: randRange(0.55, 0.7) },
        ],
      });
    }
    return trees;
  }

  // Small decorative bushes - no collision, always drawn in the background pass.
  _makeBushes() {
    const bushes = [];
    const tile = this.bgTheme.decoTileSize || 1400;
    const count = this.bgTheme.bushCount || 0;
    for (let i = 0; i < count; i++) {
      bushes.push({
        x: randRange(-tile / 2, tile / 2), y: randRange(-tile / 2, tile / 2),
        r: randRange(this.bgTheme.bushMinR, this.bgTheme.bushMaxR), tile,
      });
    }
    return bushes;
  }

  // Dense procedural grass-tuft overlay drawn right on top of the ground
  // tiles - many small blade clusters give an overgrown, lived-in feel that
  // flat repeated ground tiles alone can't. No collision, always background.
  _makeGrassTufts() {
    const tufts = [];
    const tile = this.bgTheme.decoTileSize || 1400;
    const count = this.bgTheme.tuftCount || 0;
    for (let i = 0; i < count; i++) {
      tufts.push({
        x: randRange(-tile / 2, tile / 2), y: randRange(-tile / 2, tile / 2),
        r: randRange(this.bgTheme.tuftMinR, this.bgTheme.tuftMaxR), tile,
        rot: randRange(0, Math.PI * 2),
        dark: Math.random() < 0.5,
      });
    }
    return tufts;
  }

  // Flower patches - real CC0 sprites (self-contained icons, not the tiling
  // decorations, so they don't have the grass-color-blend problem).
  _makeFlowerPatches() {
    const flowers = [];
    const tile = this.bgTheme.decoTileSize || 1400;
    const count = this.bgTheme.flowerCount || 0;
    const variants = this.flowerImgs.map(d => ({ item: d, weight: d.weight }));
    if (!variants.length) return flowers;
    for (let i = 0; i < count; i++) {
      const variant = weightedPick(variants);
      flowers.push({
        x: randRange(-tile / 2, tile / 2), y: randRange(-tile / 2, tile / 2),
        r: randRange(this.bgTheme.flowerMinR, this.bgTheme.flowerMaxR), tile, variant,
      });
    }
    return flowers;
  }

  // Simple circle-vs-circle push-out so the player can't walk through rocks.
  _resolveObstacleCollisions() {
    const p = this.player;
    for (const rock of this._rocks) {
      const dx = p.x - rock.x, dy = p.y - rock.y;
      const minDist = rock.r + 16; // ~player collision radius
      const d = Math.hypot(dx, dy);
      if (d < minDist) {
        // if the player lands exactly on the rock's center (d===0) there's no
        // direction to push along - pick an arbitrary one instead of dividing by zero
        const angle = d > 0.0001 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
        const push = minDist - d;
        p.x += Math.cos(angle) * push;
        p.y += Math.sin(angle) * push;
      }
    }
  }

  // Trees repeat via infinite tiling (see _makeTrees/draw), so unlike rocks
  // there's no single fixed world position - find whichever repeated copy of
  // this tree is nearest the player and collide against just its trunk
  // (a fraction of the visual canopy radius, so you can still walk near the
  // edge of the foliage, just not through the trunk itself).
  _resolveTreeCollisions() {
    const p = this.player;
    for (const t of this._proceduralTrees) {
      const tile = t.tile;
      const nx = t.x + Math.round((p.x - t.x) / tile) * tile;
      const ny = t.y + Math.round((p.y - t.y) / tile) * tile;
      const dx = p.x - nx, dy = p.y - ny;
      const trunkR = t.r * 0.22;
      const minDist = trunkR + 16;
      const d = Math.hypot(dx, dy);
      if (d < minDist) {
        const angle = d > 0.0001 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
        const push = minDist - d;
        p.x += Math.cos(angle) * push;
        p.y += Math.sin(angle) * push;
      }
    }
  }

  // Death-Stranding-style worn path: ground the player actually walks over
  // (not just stands on) gradually shifts from grass toward bare dirt (see
  // draw()'s ground pass). Uses a finer grid than the 48px ground tiles so
  // the trail reads as a thin footpath rather than a blocky patch, and only
  // accumulates while actually moving.
  _markTrailWear(dt) {
    if (!this.player.moving) return;
    const cell = TRAIL_CELL;
    const cx = Math.floor(this.player.x / cell), cy = Math.floor(this.player.y / cell);
    const key = `${cx},${cy}`;
    const cur = this._trailWear.get(key) || 0;
    this._trailWear.set(key, Math.min(1, cur + dt * 0.4));
  }

  resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false; // keep 16x16 pixel-art crisp when scaled up
    this.viewW = w; this.viewH = h;
  }

  start() {
    this.running = true;
    this._last = performance.now();
    requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    window.removeEventListener('resize', this._resize);
    window.removeEventListener('orientationchange', this._resize);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', this._resize);
    window.removeEventListener('keydown', this._keydown);
  }

  togglePause() {
    if (this.gameOver || this.showingCard || this.showingLoadout) return;
    this.paused = !this.paused;
    $('pause-overlay').classList.toggle('hidden', !this.paused);
  }

  quitToTitle() {
    this.stop();
  }

  currentFloor() {
    return Math.floor(this.elapsed / FLOOR_SECONDS);
  }

  difficultyMult() {
    if (this.mode === 'endless') {
      const milestoneTier = Math.floor(this.currentFloor() / FLOOR_MILESTONE);
      const accel = 1 + milestoneTier * 0.5; // +50% growth rate per 50-floor milestone
      return 1 + (this.elapsed / 140) * accel;
    }
    return 1 + this.elapsed / 140;
  }

  currentWave() {
    let w = this.waves[0];
    for (const wv of this.waves) if (this.elapsed >= wv.t) w = wv; else break;
    return w;
  }

  damageMult() {
    if (this.mode === 'endless') {
      const milestoneTier = Math.floor(this.currentFloor() / FLOOR_MILESTONE);
      const accel = 1 + milestoneTier * 0.5;
      return 1 + (this.elapsed / 400) * accel;
    }
    return 1 + this.elapsed / 400;
  }

  spawnEnemyAround(typeKey, distMin = 520, distMax = 700) {
    const a = Math.random() * Math.PI * 2;
    const d = randRange(distMin, distMax);
    const x = this.player.x + Math.cos(a) * d;
    const y = this.player.y + Math.sin(a) * d;
    const mult = this.difficultyMult();
    const type = ENEMY_TYPES[typeKey];
    this.enemies.push(new Enemy(type, x, y, mult, this.damageMult()));
  }

  update(dt) {
    if (this.paused || this.gameOver || this.showingCard) return;
    this.elapsed += dt;
    if (this.shakeT > 0) this.shakeT -= dt;

    this.player.update(dt, this.input);
    this._resolveObstacleCollisions();
    this._resolveTreeCollisions();
    this._markTrailWear(dt);
    if (this.player.hp <= 0) return this.endGame(false);
    const hpBeforeContact = this.player.hp;

    // spawner
    if (!this.bossSpawned) {
      const wave = this.currentWave();
      this.spawnAccum += dt;
      const interval = wave.rate;
      while (this.spawnAccum >= interval) {
        this.spawnAccum -= interval;
        for (let i = 0; i < wave.count; i++) {
          this.spawnEnemyAround(wave.types[Math.floor(Math.random() * wave.types.length)]);
        }
      }
    }

    // elites
    if (this.mode === 'endless') {
      if (this.nextEliteTime !== null && this.elapsed >= this.nextEliteTime) {
        this.spawnEnemyAround(pick(this.stageConfig.eliteIds), 500, 600);
        this.flashWarning('⚠️ エリート出現！');
        this.nextEliteTime += this.stageConfig.eliteInterval;
      }
    } else if (this.eliteIdx < this.stageConfig.eliteTimes.length && this.elapsed >= this.stageConfig.eliteTimes[this.eliteIdx]) {
      this.spawnEnemyAround(this.stageConfig.eliteId, 500, 600);
      this.flashWarning('⚠️ エリート出現！');
      this.eliteIdx++;
    }

    // boss (stage mode only - endless mode has no clear condition)
    if (this.mode === 'stage' && !this.bossSpawned && this.elapsed >= this.stageConfig.length - 20) {
      this.bossSpawned = true;
      const a = Math.random() * Math.PI * 2;
      const x = this.player.x + Math.cos(a) * 560, y = this.player.y + Math.sin(a) * 560;
      this.boss = new Enemy(ENEMY_TYPES[this.stageConfig.bossId], x, y, this.difficultyMult(), 1 + this.elapsed / 200);
      this.enemies.push(this.boss);
      this.flashWarning('☠️ ボス出現！ ☠️');
      SFX.bossWarn();
      this.shake(10, 0.4);
    }

    // chest timer
    this.chestTimer -= dt;
    if (this.chestTimer <= 0) {
      this.chestTimer = randRange(45, 60);
      const a = Math.random() * Math.PI * 2;
      const d = randRange(150, 300);
      this.chests.push(new Chest(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d));
    }

    // healing flower
    this.healTimer -= dt;
    if (this.healTimer <= 0) {
      this.healTimer = randRange(45, 65);
      const a = Math.random() * Math.PI * 2;
      const d = randRange(150, 300);
      this.pickups.push(new Pickup(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 'heal'));
    }
    // wisdom fruit (collects all XP gems on the field at once)
    this.magnetTimer -= dt;
    if (this.magnetTimer <= 0) {
      this.magnetTimer = randRange(65, 90);
      const a = Math.random() * Math.PI * 2;
      const d = randRange(150, 300);
      this.pickups.push(new Pickup(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, 'magnet'));
    }

    for (const e of this.enemies) e.update(dt, this.player);
    if (this.player.hp < hpBeforeContact) { SFX.hurt(); this.shake(4, 0.15); }
    // status-effect DoT ticks (poison branch) - runs on every living enemy
    // each frame, independent of which weapon/hit originally applied it
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.poisonTime > 0) {
        e.poisonTime -= dt;
        this.damageEnemy(e, e.poisonDps * dt, 'poison', null);
      }
    }
    this.enemies = this.enemies.filter(e => !e.dead || e._justDied);

    updateWeapons(this, dt);

    for (const p of this.projectiles) {
      p.update(dt, this.player.x, this.player.y, this.enemies);
      for (const e of this.enemies) {
        if (e.dead || p.hitSet.has(e.uid)) continue;
        if (dist(p.x, p.y, e.x, e.y) < p.radius + e.radius) {
          this.damageEnemy(e, p.damage, 'proj', p.branch);
          p.hitSet.add(e.uid);
          if (p.hitSet.size > (p.pierce ?? 1)) p.dead = true;
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.dead);

    for (const pu of this.pulses) {
      pu.update(dt);
      if (pu.kind === 'nova' && pu.exploded) {
        this.shake(6, 0.2);
        for (const e of this.enemies) {
          if (e.dead || pu.hitSet.has(e.uid)) continue;
          if (dist(pu.x, pu.y, e.x, e.y) < pu.maxRadius + e.radius) {
            this.damageEnemy(e, pu.damage, 'nova', pu.branch);
            pu.hitSet.add(e.uid);
          }
        }
        pu.exploded = false; // damage applied once
      } else if (pu.kind === 'aura') {
        for (const e of this.enemies) {
          if (e.dead || pu.hitSet.has(e.uid)) continue;
          if (dist(pu.x, pu.y, e.x, e.y) < pu.radius + e.radius) {
            this.damageEnemy(e, pu.damage * dt * 6, 'aura', pu.branch);
          }
        }
      }
    }
    this.pulses = this.pulses.filter(pu => !pu.done);

    for (const g of this.gems) g.update(dt, this.player);
    for (const g of this.gems) {
      if (g.collected) {
        const levels = this.player.gainXP(g.value);
        if (levels > 0) this.pendingLevelUps += levels;
      }
    }
    this.gems = this.gems.filter(g => !g.collected);

    // Character skills: 'aura' ticks its own cooldown and spawns the same
    // Pulse weapon auras use (centered on the player); 'onHit' is rolled
    // inside damageEnemy() alongside the crit roll; 'summon' companions are
    // updated + resolved here since this is where enemies[]/gems[] live.
    for (const s of this.player.skills) {
      const def = this.player.getSkillDef(s.id);
      if (!def || def.type !== 'aura') continue;
      const stats = { ...def.base };
      for (let l = 2; l <= s.level; l++) for (const k in def.perLevel) stats[k] = (stats[k] ?? 0) + def.perLevel[k];
      this.player.skillCds[s.id] = (this.player.skillCds[s.id] ?? 0) - dt;
      if (this.player.skillCds[s.id] <= 0) {
        this.player.skillCds[s.id] = stats.cooldown;
        this.pulses.push(new Pulse(this.player.x, this.player.y, stats.radius, stats.damage, 'aura', 0, '#ffd76a', def.icon, null));
      }
    }
    for (const comp of this.companions) {
      comp.update(dt, this.player);
      const skillEntry = this.player.skills.find(s => s.id === comp.skillId);
      const def = this.player.getSkillDef(comp.skillId);
      if (!skillEntry || !def) continue;
      const stats = { ...def.base };
      for (let l = 2; l <= skillEntry.level; l++) for (const k in def.perLevel) stats[k] = (stats[k] ?? 0) + def.perLevel[k];
      if (comp.variant === 'attacker') {
        if (comp.cd <= 0) {
          let nearest = null, nd = stats.range;
          for (const e of this.enemies) {
            if (e.dead) continue;
            const d = dist(comp.x, comp.y, e.x, e.y);
            if (d < nd) { nd = d; nearest = e; }
          }
          if (nearest) {
            comp.cd = stats.interval;
            this.damageEnemy(nearest, stats.damage, 'companion', null);
          }
        }
      } else if (comp.variant === 'collector') {
        for (const g of this.gems) {
          if (g.collected) continue;
          if (dist(comp.x, comp.y, g.x, g.y) < stats.pullRadius) g.magnet = true;
        }
      }
    }

    for (const c of this.chests) c.update(dt, this.player);
    for (const c of this.chests) {
      if (c.collected) this.openChest();
    }
    this.chests = this.chests.filter(c => !c.collected);

    for (const p of this.pickups) p.update(dt, this.player);
    for (const p of this.pickups) {
      if (!p.collected) continue;
      if (p.kind === 'heal') {
        const healed = Math.round(this.player.maxHP * 0.3);
        this.player.hp = clamp(this.player.hp + healed, 0, this.player.maxHP);
        this.floatTexts.push(new FloatText(this.player.x, this.player.y - 30, `+${healed}`, '#5cf29a'));
        SFX.heal();
      } else if (p.kind === 'magnet') {
        // don't grant XP directly - flag every gem to streak toward the player
        // at high speed so the mass-collection is visible, then let the normal
        // per-gem pickup logic above grant XP (and level-up cards) as usual.
        let totalXP = 0;
        for (const g of this.gems) { g.magnet = true; g.superPull = true; totalXP += g.value; }
        if (totalXP > 0) {
          this.floatTexts.push(new FloatText(this.player.x, this.player.y - 34, `経験値を吸引！ (+${Math.round(totalXP)})`, '#ffe08a'));
        }
        SFX.chest();
      }
    }
    this.pickups = this.pickups.filter(p => !p.collected);

    for (const ft of this.floatTexts) ft.update(dt);
    this.floatTexts = this.floatTexts.filter(f => f.life > 0);

    for (const pt of this.particles) pt.update(dt);
    this.particles = this.particles.filter(pt => pt.life > 0);

    // win condition: boss defeated
    if (this.boss && this.boss.dead) return this.endGame(true);

    if (this.pendingLevelUps > 0 && !this.showingCard) {
      this.pendingLevelUps--;
      this.presentLevelUp();
    }

    this.cam.x = this.player.x - this.viewW / 2;
    this.cam.y = this.player.y - this.viewH / 2;
  }

  damageEnemy(enemy, dmg, source, branch) {
    // DoT ticks and explosion splash shouldn't crit or re-trigger their own
    // status effects (crit would double-count, explosion would recurse forever)
    const canCrit = source !== 'poison' && source !== 'explosion';
    let finalDmg = dmg;
    let crit = false;
    if (canCrit && Math.random() < this.player.critChance) {
      finalDmg *= this.player.critMult;
      crit = true;
    }
    // Character 'onHit' skills - gated the same as crit so DoT ticks/
    // explosion splash (which call this repeatedly) can't re-roll them.
    if (canCrit) {
      for (const s of this.player.skills) {
        const def = this.player.getSkillDef(s.id);
        if (!def || def.type !== 'onHit') continue;
        const stats = { ...def.base };
        for (let l = 2; l <= s.level; l++) for (const k in def.perLevel) stats[k] = (stats[k] ?? 0) + def.perLevel[k];
        if (Math.random() >= stats.chance) continue;
        if (def.effect === 'bonusDamage') {
          finalDmg += stats.value;
        } else if (def.effect === 'execute') {
          if (enemy.hp / enemy.maxHp <= stats.value) finalDmg = enemy.hp;
        } else if (def.effect === 'lifesteal') {
          this.player.hp = clamp(this.player.hp + stats.value, 0, this.player.maxHP);
        }
      }
    }
    const killed = enemy.takeDamage(finalDmg);
    this.floatTexts.push(new FloatText(enemy.x, enemy.y - enemy.radius, Math.round(finalDmg).toString(),
      crit ? '#ff5a5a' : (enemy.elite || enemy.boss ? '#ffd76a' : '#ffffff')));
    spawnBurst(this.particles, enemy.x, enemy.y, crit ? '#ff5a5a' : '#ffe08a', 5,
      { minSpeed: 40, maxSpeed: 120, minSize: 2, maxSize: 4, minLife: 0.2, maxLife: 0.35 });

    if (branch === 'poison' && !enemy.dead) {
      enemy.poisonDps = Math.max(enemy.poisonDps || 0, finalDmg * 0.18);
      enemy.poisonTime = 3;
    }
    if (branch === 'paralysis' && !enemy.boss && !enemy.dead) {
      enemy.paralyzeTime = Math.max(enemy.paralyzeTime || 0, 1.1);
    }
    if (branch === 'explosion' && source !== 'explosion') {
      for (const e2 of this.enemies) {
        if (e2 === enemy || e2.dead) continue;
        if (dist(enemy.x, enemy.y, e2.x, e2.y) < 70) this.damageEnemy(e2, finalDmg * 0.5, 'explosion', null);
      }
    }

    if (killed) {
      enemy._justDied = false;
      this.kills++;
      this.gems.push(new Gem(enemy.x, enemy.y, enemy.xp));
      spawnBurst(this.particles, enemy.x, enemy.y, enemy.boss ? '#ff2b4a' : enemy.elite ? '#ffd76a' : '#ffffff', 14,
        { minSpeed: 80, maxSpeed: 220, minSize: 3, maxSize: 6, minLife: 0.3, maxLife: 0.5 });
      SFX.kill();
    }
  }

  openChest() {
    // Chests are the trigger for all upgrade-tier decisions: check the
    // (rare, strict) super-evolution first, then the normal weapon+passive
    // fusion, then an element-branch choice for a maxed starting weapon,
    // and only fall back to a normal 3-choice reward if none apply.
    this.showingCard = true;
    const superEvolved = trySuperEvolve(this.player);
    if (superEvolved) {
      SFX.evolve();
      showEvolveNotice(superEvolved, () => { this.showingCard = false; }, true);
      return;
    }
    const evolved = tryEvolve(this.player);
    if (evolved) {
      SFX.evolve();
      showEvolveNotice(evolved, () => { this.showingCard = false; }, false);
      return;
    }
    const branchTarget = findBranchCandidate(this.player);
    if (branchTarget) {
      SFX.chest();
      showBranchChoice(branchTarget, (branchId) => {
        branchTarget.branch = branchId;
        this.player.recompute();
        this.showingCard = false;
      });
      return;
    }
    const choices = buildUpgradeChoices(this.player);
    if (choices.length === 0) { this.showingCard = false; return; }
    SFX.chest();
    showLevelUp(choices.slice(0, 3), (choice) => this.applyChoice(choice));
  }

  presentLevelUp() {
    this.showingCard = true;
    const choices = buildUpgradeChoices(this.player);
    if (choices.length === 0) { this.showingCard = false; return; }
    SFX.levelUp();
    spawnBurst(this.particles, this.player.x, this.player.y, '#ffe08a', 20,
      { minSpeed: 60, maxSpeed: 200, minSize: 3, maxSize: 6, minLife: 0.35, maxLife: 0.6 });
    showLevelUp(choices, (choice) => this.applyChoice(choice));
  }

  applyChoice(choice) {
    if (choice.kind === 'weapon-up' || choice.kind === 'weapon-new') {
      this.player.addWeapon(choice.id);
    } else if (choice.kind === 'skill-up' || choice.kind === 'skill-new') {
      this.player.addSkill(choice.id);
      // A brand-new 'summon' skill needs its Companion spawned once here -
      // leveling an existing one just scales the stats read fresh each tick
      // in the update loop, no new companion needed.
      if (choice.kind === 'skill-new' && choice.def.type === 'summon') {
        this.companions.push(new Companion(choice.id, choice.def.variant, this.companions.length));
      }
    } else {
      this.player.addPassive(choice.id);
    }
    this.player.recompute();
    this.showingCard = false;
    if (this.pendingLevelUps > 0) { this.pendingLevelUps--; this.presentLevelUp(); }
  }

  shake(mag, dur = 0.15) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeDur = dur;
    this.shakeT = dur;
  }

  flashWarning(text) {
    const el = $('boss-warning');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._warnTO);
    this._warnTO = setTimeout(() => el.classList.add('hidden'), 3000);
  }

  endGame(win) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.running = false;
    win ? SFX.win() : SFX.lose();

    let rank = null;
    if (this.mode === 'stage' && win) {
      markStageCleared(this.stageConfig.id);
    } else if (this.mode === 'endless') {
      const myDate = Date.now();
      const board = addLeaderboardEntry({
        time: this.elapsed, level: this.player.level, kills: this.kills,
        costume: this.player.costume.name, date: myDate,
      });
      const idx = board.findIndex(e => e.date === myDate);
      rank = idx >= 0 ? idx + 1 : null;
      // Fire-and-forget: doesn't block the result screen on network latency,
      // and no-ops instantly if not logged in or the server isn't running.
      submitOnlineLeaderboard({
        mode: 'endless', time: this.elapsed, level: this.player.level,
        kills: this.kills, costume: this.player.costume.name,
      });
    }

    const coinsEarned = Math.round(this.kills * 0.5 + this.player.level * 3 + this.elapsed / 10 + (win ? 50 : 0));
    const totalCoins = addCoins(coinsEarned);
    syncLocalToCloud();

    showResult({
      win, mode: this.mode, time: this.elapsed, level: this.player.level, kills: this.kills,
      costumeName: this.player.costume.name, rank, coinsEarned, totalCoins,
    });
    setTimeout(() => {
      $('screen-game').classList.add('hidden');
      $('screen-result').classList.remove('hidden');
    }, 900);
  }

  draw() {
    const ctx = this.ctx;
    const theme = this.bgTheme;
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    ctx.save();
    if (this.shakeT > 0) {
      const amt = this.shakeMag * (this.shakeT / this.shakeDur);
      ctx.translate((Math.random() - 0.5) * amt * 2, (Math.random() - 0.5) * amt * 2);
    }
    const g = ctx.createLinearGradient(0, 0, 0, this.viewH);
    g.addColorStop(0, theme.top);
    g.addColorStop(1, theme.bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // tiled ground texture (real 16x16 art, mixing variants per-cell for a
    // weedy, non-repetitive look)
    {
      const tsize = 48;
      const offX = -((this.cam.x % tsize) + tsize) % tsize;
      const offY = -((this.cam.y % tsize) + tsize) % tsize;
      const baseCx = Math.floor((this.cam.x + offX) / tsize);
      const baseCy = Math.floor((this.cam.y + offY) / tsize);
      let cx = baseCx;
      for (let x = offX - tsize; x < this.viewW + tsize; x += tsize, cx++) {
        let cy = baseCy;
        for (let y = offY - tsize; y < this.viewH + tsize; y += tsize, cy++) {
          const variant = weightedPickAt(this.groundImgs, cellRandom(cx, cy));
          if (variant.entry.loaded) ctx.drawImage(variant.entry.img, x, y, tsize, tsize);
        }
      }
    }

    // worn-path overlay - soft dirt-colored blobs on a finer grid than the
    // ground tiles, so repeatedly-walked ground reads as a thin organic trail
    // rather than a blocky patch (see _markTrailWear)
    if (this._trailWear.size) {
      ctx.save();
      for (const [key, wear] of this._trailWear) {
        const [cx, cy] = key.split(',').map(Number);
        const wx = cx * TRAIL_CELL + TRAIL_CELL / 2, wy = cy * TRAIL_CELL + TRAIL_CELL / 2;
        const sx = wx - this.cam.x, sy = wy - this.cam.y;
        if (sx < -20 || sx > this.viewW + 20 || sy < -20 || sy > this.viewH + 20) continue;
        ctx.globalAlpha = wear * 0.55;
        ctx.fillStyle = '#8a6a42';
        ctx.beginPath();
        ctx.arc(sx, sy, TRAIL_CELL * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // dense procedural grass tufts - drawn directly on the ground tiles for
    // an overgrown, lived-in feel (the flat tile art alone reads too sparse)
    ctx.save();
    for (const t of this._grassTufts) {
      const tile = t.tile;
      const baseX = (((t.x - this.cam.x) % tile) + tile) % tile - tile;
      const baseY = (((t.y - this.cam.y) % tile) + tile) % tile - tile;
      for (let ox = 0; ox <= this.viewW + tile; ox += tile) {
        for (let oy = 0; oy <= this.viewH + tile; oy += tile) {
          const sx = baseX + ox, sy = baseY + oy;
          if (sx < -20 || sx > this.viewW + 20 || sy < -20 || sy > this.viewH + 20) continue;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(t.rot);
          ctx.fillStyle = t.dark ? '#3f7a48' : '#5a9a5f';
          for (const ang of [-0.35, 0, 0.35]) {
            const bx = Math.sin(ang) * t.r;
            ctx.beginPath();
            ctx.moveTo(-t.r * 0.12, 2);
            ctx.quadraticCurveTo(bx * 0.5, -t.r * 0.6, bx, -t.r * 1.6);
            ctx.quadraticCurveTo(bx * 0.5 + 2, -t.r * 0.6, t.r * 0.12, 2);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }
    ctx.restore();

    // small flat ground decorations (flower patches) - always background,
    // real sprites (self-contained icons, no grass-blend issue)
    ctx.save();
    for (const f of this._flowerPatches) {
      const tile = f.tile;
      const baseX = (((f.x - this.cam.x) % tile) + tile) % tile - tile;
      const baseY = (((f.y - this.cam.y) % tile) + tile) % tile - tile;
      for (let ox = 0; ox <= this.viewW + tile; ox += tile) {
        for (let oy = 0; oy <= this.viewH + tile; oy += tile) {
          const sx = baseX + ox, sy = baseY + oy;
          if (sx < -40 || sx > this.viewW + 40 || sy < -40 || sy > this.viewH + 40) continue;
          if (f.variant.entry.loaded) {
            const size = f.r * 2;
            ctx.drawImage(f.variant.entry.img, sx - size / 2, sy - size / 2, size, size);
          }
        }
      }
    }
    ctx.restore();

    // small bushes - procedural (clearly darker than grass so they always
    // read as solid foliage), always background, no collision
    ctx.save();
    for (const b of this._bushes) {
      const tile = b.tile;
      const baseX = (((b.x - this.cam.x) % tile) + tile) % tile - tile;
      const baseY = (((b.y - this.cam.y) % tile) + tile) % tile - tile;
      for (let ox = 0; ox <= this.viewW + tile; ox += tile) {
        for (let oy = 0; oy <= this.viewH + tile; oy += tile) {
          const sx = baseX + ox, sy = baseY + oy;
          if (sx < -50 || sx > this.viewW + 50 || sy < -50 || sy > this.viewH + 50) continue;
          ctx.fillStyle = '#173a20';
          ctx.beginPath(); ctx.ellipse(sx, sy + b.r * 0.3, b.r * 0.95, b.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#2d5a3d';
          ctx.beginPath(); ctx.ellipse(sx, sy, b.r * 0.8, b.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#3f7a52';
          ctx.beginPath(); ctx.ellipse(sx - b.r * 0.2, sy - b.r * 0.15, b.r * 0.4, b.r * 0.25, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();

    // generic sprite-tiled decorations (currently just village fence posts)
    ctx.save();
    ctx.fillStyle = theme.decoColor;
    for (const t of this._trees) {
      const tile = t.tile;
      const decoLoaded = t.variant.entry.loaded;
      const baseX = (((t.x - this.cam.x) % tile) + tile) % tile - tile;
      const baseY = (((t.y - this.cam.y) % tile) + tile) % tile - tile;
      for (let ox = 0; ox <= this.viewW + tile; ox += tile) {
        for (let oy = 0; oy <= this.viewH + tile; oy += tile) {
          const sx = baseX + ox, sy = baseY + oy;
          if (sx < -80 || sx > this.viewW + 80 || sy < -80 || sy > this.viewH + 80) continue;
          if (decoLoaded) {
            const size = t.r * 1.6;
            ctx.drawImage(t.variant.entry.img, sx - size / 2, sy - size, size, size);
          } else {
            ctx.fillRect(sx - t.r * 0.12, sy, t.r * 0.24, t.r * 0.9);
            ctx.beginPath();
            ctx.arc(sx, sy - t.r * 0.3, t.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();

    // HoloCure-style trees: trunk + canopy both drawn here in the background
    // pass, strictly before any enemy/player - so trees can never visually
    // cover a gameplay-relevant sprite. The "walk behind the tree" illusion
    // is done with alpha instead of draw order: canopies whose position
    // would visually overlap the player (always screen-center, since the
    // camera follows her) fade out, without ever touching enemy visibility.
    for (const t of this._proceduralTrees) {
      const tile = t.tile;
      const baseX = (((t.x - this.cam.x) % tile) + tile) % tile - tile;
      const baseY = (((t.y - this.cam.y) % tile) + tile) % tile - tile;
      for (let ox = 0; ox <= this.viewW + tile; ox += tile) {
        for (let oy = 0; oy <= this.viewH + tile; oy += tile) {
          const sx = baseX + ox, sy = baseY + oy;
          if (sx < -100 || sx > this.viewW + 100 || sy < -140 || sy > this.viewH + 100) continue;
          drawTreeTrunk(ctx, sx, sy, t.r);
          const canopyR = t.r * 1.15;
          const canopyCy = sy - t.r * 1.3;
          const overlapsPlayer = sy > this.viewH / 2 &&
            Math.abs(sx - this.viewW / 2) < canopyR + 16 && Math.abs(canopyCy - this.viewH / 2) < canopyR + 16;
          drawTreeCanopy(ctx, sx, sy, t.r, t.lobes, overlapsPlayer ? 0.32 : 1);
        }
      }
    }

    // solid rock obstacles - drawn procedurally (a cluster of shaded circles
    // reads clearly as "a boulder" at this scale) with a dark contact shadow
    // so their collision footprint is visually obvious
    ctx.save();
    for (const rock of this._rocks) {
      const sx = rock.x - this.cam.x, sy = rock.y - this.cam.y;
      if (sx < -60 || sx > this.viewW + 60 || sy < -60 || sy > this.viewH + 60) continue;
      ctx.beginPath();
      ctx.ellipse(sx, sy + rock.r * 0.6, rock.r * 0.9, rock.r * 0.35, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      ctx.fillStyle = '#6b6f76';
      ctx.beginPath(); ctx.arc(sx, sy, rock.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a8f99';
      ctx.beginPath(); ctx.arc(sx - rock.r * 0.25, sy - rock.r * 0.3, rock.r * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, rock.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // ambient glowing particles (fireflies / lantern sparks depending on theme)
    ctx.save();
    for (const d of this._bgDots) {
      const px = d.x - this.cam.x * d.speed - Math.floor((d.x - this.cam.x * d.speed) / 4000) * 4000;
      const py = d.y - this.cam.y * d.speed - Math.floor((d.y - this.cam.y * d.speed) / 4000) * 4000;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.elapsed * 1.5 + d.tw));
      ctx.beginPath();
      ctx.arc(((px % this.viewW) + this.viewW) % this.viewW, ((py % this.viewH) + this.viewH) % this.viewH, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${theme.fireflyRGB},${0.15 + 0.35 * tw})`;
      ctx.fill();
    }
    ctx.restore();

    for (const c of this.chests) c.draw(ctx, this.cam);
    for (const p of this.pickups) p.draw(ctx, this.cam);
    for (const g of this.gems) g.draw(ctx, this.cam);
    for (const e of this.enemies) e.draw(ctx, this.cam);
    for (const comp of this.companions) comp.draw(ctx, this.cam);
    this.player.draw(ctx, this.cam);

    for (const p of this.projectiles) p.draw(ctx, this.cam);
    for (const pu of this.pulses) pu.draw(ctx, this.cam);
    for (const w of this.player.weapons) if (w._orbit) w._orbit.draw(ctx, this.cam);
    for (const pt of this.particles) pt.draw(ctx, this.cam);
    for (const ft of this.floatTexts) ft.draw(ctx, this.cam);

    ctx.restore();
    updateHUD(this.player, this.elapsed, this.kills, this.mode === 'endless' ? this.currentFloor() : null);
  }

  _loop(now) {
    if (!this.running) return;
    let dt = (now - this._last) / 1000;
    this._last = now;
    dt = clamp(dt, 0, 0.05);
    this.update(dt);
    this.draw();
    requestAnimationFrame(this._loop);
  }
}
