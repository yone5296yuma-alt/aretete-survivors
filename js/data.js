// ---------------------------------------------------------------------------
// Are Tete Survivors - game data definitions
// Original fan-made design: a princess who escaped her castle and is fleeing
// first through a forest, then toward the villages and roads beyond it,
// pursued by the castle's guards, knights, and hired bounty hunters.
// All visuals are drawn procedurally on canvas - no copyrighted artwork used.
// ---------------------------------------------------------------------------

// Butler rabbit first = the default/pre-selected costume (the princess's
// companion who escaped the castle with her). The princess herself and her
// other outfits remain fully playable, just no longer pre-selected.
export const COSTUMES = [
  {
    id: 'butlerRabbit',
    name: '執事うさぎ',
    icon: '🐰',
    color: '#e8e8ec',
    accent: '#8a1f2b',
    weaponId: 'moonlightDagger',
    desc: 'お姫様に付き従う執事うさぎ。身軽な身のこなしで敵をかく乱する俊敏型。',
    statMods: { speed: 0.3, maxHP: -10 },
  },
  {
    id: 'princess',
    name: '王冠の姫テテ',
    icon: '👑',
    color: '#b98af0',
    accent: '#ffd76a',
    weaponId: 'crownBoomerang',
    desc: '王冠ブーメランで幸運極振り。運が高くレアアイテムが出やすい。',
    statMods: { luck: 1.5, maxHP: -10 },
  },
  {
    id: 'escapee',
    name: '旅立ちのテテ',
    icon: '🍃',
    color: '#5fbf7a',
    accent: '#ffd76a',
    weaponId: 'moonlightDagger',
    desc: '基本バランス型。月光の短剣で近くの敵を自動でロックオン攻撃。',
    statMods: {},
  },
  {
    id: 'huntress',
    name: '森の狩人テテ',
    icon: '🌙',
    color: '#3d7a4a',
    accent: '#c7f0d0',
    weaponId: 'crescentBlade',
    desc: '三日月の斬撃で周囲を薙ぎ払う範囲特化型。HPが少し高め。',
    statMods: { maxHP: 20, speed: -0.2 },
  },
  {
    id: 'wanderer',
    name: '旅商人風テテ',
    icon: '🎒',
    color: '#c98a4a',
    accent: '#ffe6a8',
    weaponId: 'travelersSling',
    desc: '旅商人に変装。スリングで連射しつつ、集めた物の効果が高まる収集特化型。',
    statMods: { pickupRange: 25 },
  },
];

export const PLAYER_BASE = {
  maxHP: 100,
  speed: 3.2,
  power: 1.0,      // damage multiplier
  area: 1.0,        // aoe size multiplier
  cooldown: 1.0,     // multiplier, lower = faster
  luck: 1.0,
  regen: 0.05,       // hp per second
  pickupRange: 60,
  xpMult: 1.0,
  moveSpeedMult: 1.0,
  critChance: 0.05,  // 5% base chance for a critical hit
  critMult: 1.6,     // damage multiplier on crit
};

// -------------------- WEAPONS --------------------
// behavior: 'homing' | 'spread' | 'orbit' | 'aura' | 'boomerang' | 'nova' | 'sweep'
export const WEAPONS = {
  moonlightDagger: {
    id: 'moonlightDagger', name: '月光の短剣', icon: '🗡️', color: '#bcd6ff', maxLevel: 5, behavior: 'homing',
    desc: '最も近い敵にホーミングする短剣を放つ。',
    base: { cooldown: 1.0, damage: 9, count: 1, pierce: 1, speed: 6, area: 1 },
    perLevel: { damage: 4, count: 0, pierce: 0, cooldown: -0.07 },
    levelExtra: { 3: { count: 1 }, 5: { count: 1, pierce: 1 } },
    evolvesWith: 'forestBlessing', evolvesTo: 'moonlightFlurry',
  },
  crescentBlade: {
    id: 'crescentBlade', name: '三日月の斬撃', icon: '🌙', color: '#c7f0d0', maxLevel: 5, behavior: 'sweep',
    desc: 'プレイヤーの周囲を回転する三日月刃で薙ぎ払う。',
    base: { cooldown: 1.6, damage: 12, count: 2, pierce: 99, area: 1, spinSpeed: 3.2, orbitR: 70 },
    perLevel: { damage: 5, area: 0.12, cooldown: -0.08 },
    levelExtra: { 4: { count: 1 } },
    evolvesWith: 'knightsEmblem', evolvesTo: 'eternalCrescent',
  },
  crownBoomerang: {
    id: 'crownBoomerang', name: '王冠ブーメラン', icon: '👑', color: '#ffd76a', maxLevel: 5, behavior: 'boomerang',
    desc: '投げた王冠が敵を貫通しながら戻ってくる。',
    base: { cooldown: 1.4, damage: 12, count: 1, pierce: 10, speed: 7, range: 260, area: 1 },
    perLevel: { damage: 4.5, cooldown: -0.06 },
    levelExtra: { 3: { count: 1 }, 5: { count: 1 } },
    evolvesWith: 'fourLeafCharm', evolvesTo: 'royalFlush',
  },
  acornShot: {
    id: 'acornShot', name: 'ドングリ弾', icon: '🌰', color: '#c98a4a', maxLevel: 5, behavior: 'spread',
    desc: 'ランダムな方向にドングリを拡散発射。',
    base: { cooldown: 0.9, damage: 5, count: 3, pierce: 0, speed: 6.5, area: 1 },
    perLevel: { damage: 1.5, count: 0, cooldown: -0.04 },
    levelExtra: { 3: { count: 1 }, 5: { count: 1 } },
    evolvesWith: 'forestCloak', evolvesTo: 'goldenAcornBarrage',
  },
  thornVortex: {
    id: 'thornVortex', name: 'いばらの渦', icon: '🥀', color: '#c76bd6', maxLevel: 5, behavior: 'orbit',
    desc: 'プレイヤーの周りをいばらが回転し続けて接触ダメージ。',
    base: { cooldown: 0, damage: 5, count: 2, pierce: 99, orbitR: 90, spinSpeed: 2.4, area: 1, tickRate: 0.35 },
    perLevel: { damage: 2, area: 0.1 },
    levelExtra: { 3: { count: 1 }, 5: { count: 1 } },
    evolvesWith: 'travelersBoots', evolvesTo: 'endlessBriar',
  },
  branchTrap: {
    id: 'branchTrap', name: '巨木の落枝', icon: '🪵', color: '#8a6a4a', maxLevel: 5, behavior: 'nova',
    desc: 'マップ上のランダムな敵の頭上に太い枝を落とす。',
    base: { cooldown: 1.3, damage: 20, count: 1, area: 1, radius: 55 },
    perLevel: { damage: 8, count: 1, cooldown: -0.05 },
    evolvesWith: 'guidingBell', evolvesTo: 'ancientOakFall',
  },
  moonHowl: {
    id: 'moonHowl', name: '月夜の遠吠え', icon: '🐺', color: '#9fb8ff', maxLevel: 5, behavior: 'aura',
    desc: '一定間隔で遠吠えの衝撃波が広がり周囲の敵にダメージ。',
    base: { cooldown: 1.8, damage: 10, area: 1, radius: 90 },
    perLevel: { damage: 4, area: 0.15, cooldown: -0.08 },
    evolvesWith: 'wolfsBond', evolvesTo: 'eternalHowl',
  },
  silverArrow: {
    id: 'silverArrow', name: '銀の矢', icon: '🏹', color: '#d8d8e0', maxLevel: 5, behavior: 'homing',
    desc: '高速で連射される銀の矢。連射力が高い。',
    base: { cooldown: 0.5, damage: 5, count: 1, pierce: 1, speed: 9, area: 1 },
    perLevel: { damage: 2, cooldown: -0.03 },
    levelExtra: { 3: { count: 1 }, 5: { pierce: 1 } },
    evolvesWith: 'hawkEye', evolvesTo: 'moonsilverVolley',
  },
  travelersSling: {
    id: 'travelersSling', name: '旅商人のスリング', icon: '🪨', color: '#a8a8a8', maxLevel: 5, behavior: 'spread',
    desc: '石つぶてを連射する。旅商人風テテの得意武器。',
    base: { cooldown: 0.7, damage: 7, count: 2, pierce: 1, speed: 7, area: 1 },
    perLevel: { damage: 3, count: 1, cooldown: -0.04 },
    evolvesWith: 'merchantsEye', evolvesTo: 'merchantsBarrage',
  },
  frostCharm: {
    id: 'frostCharm', name: '氷結の呪符', icon: '❄️', color: '#a8e0ff', maxLevel: 5, behavior: 'homing',
    desc: '最も近い敵を凍える呪符が追尾する。',
    base: { cooldown: 1.1, damage: 8, count: 1, pierce: 1, speed: 5.5, area: 1 },
    perLevel: { damage: 3.5, cooldown: -0.06 },
    levelExtra: { 3: { count: 1 }, 5: { count: 1, pierce: 1 } },
    evolvesWith: 'winterCloak', evolvesTo: 'blizzardCharm',
  },
  undyingVine: {
    id: 'undyingVine', name: '朽ちない蔦', icon: '🌿', color: '#7fd88a', maxLevel: 5, behavior: 'sweep',
    desc: 'プレイヤーの周囲を蔦が薙ぎ払う。',
    base: { cooldown: 1.5, damage: 10, count: 2, pierce: 99, area: 1, spinSpeed: 2.8, orbitR: 65 },
    perLevel: { damage: 4, area: 0.1, cooldown: -0.06 },
    levelExtra: { 4: { count: 1 } },
    evolvesWith: 'rootedHeart', evolvesTo: 'worldTreeRoots',
  },
  chainWeight: {
    id: 'chainWeight', name: '鎖分銅', icon: '⛓️', color: '#9a9aa8', maxLevel: 5, behavior: 'boomerang',
    desc: '振り回した鎖分銅が敵を貫通して戻る。',
    base: { cooldown: 1.5, damage: 13, count: 1, pierce: 8, speed: 6.5, range: 240, area: 1 },
    perLevel: { damage: 5, cooldown: -0.06 },
    levelExtra: { 3: { count: 1 }, 5: { count: 1 } },
    evolvesWith: 'ironResolve', evolvesTo: 'greatChainFlail',
  },
  stardustShot: {
    id: 'stardustShot', name: '星屑の散弾', icon: '🌠', color: '#e0d0ff', maxLevel: 5, behavior: 'spread',
    desc: '流星のような星屑を全方位に拡散させる。',
    base: { cooldown: 1.0, damage: 6, count: 4, pierce: 0, speed: 6, area: 1 },
    perLevel: { damage: 2, cooldown: -0.04 },
    levelExtra: { 3: { count: 1 }, 5: { count: 2 } },
    evolvesWith: 'starMap', evolvesTo: 'meteorShower',
  },
  owlFamiliar: {
    id: 'owlFamiliar', name: '梟の眷属', icon: '🦉', color: '#c9a86a', maxLevel: 5, behavior: 'orbit',
    desc: '梟の使い魔が周囲を旋回し爪で攻撃し続ける。',
    base: { cooldown: 0, damage: 4, count: 2, pierce: 99, orbitR: 100, spinSpeed: 2.0, area: 1, tickRate: 0.35 },
    perLevel: { damage: 1.8, area: 0.1 },
    levelExtra: { 3: { count: 1 }, 5: { count: 1 } },
    evolvesWith: 'nightVision', evolvesTo: 'greatHornedGuardian',
  },
  quakingStrike: {
    id: 'quakingStrike', name: '地割れの一撃', icon: '💢', color: '#c98a4a', maxLevel: 5, behavior: 'nova',
    desc: '敵の足元の地面が割れ、衝撃で吹き飛ばす。',
    base: { cooldown: 1.5, damage: 22, count: 1, area: 1, radius: 60 },
    perLevel: { damage: 9, count: 1, cooldown: -0.05 },
    evolvesWith: 'stoneFist', evolvesTo: 'canyonRupture',
  },
  blessingChime: {
    id: 'blessingChime', name: '祝福の風鈴', icon: '🎐', color: '#ffe6f0', maxLevel: 5, behavior: 'aura',
    desc: '風鈴の音色が波紋のように広がり敵を浄化する。',
    base: { cooldown: 2.0, damage: 8, area: 1, radius: 85 },
    perLevel: { damage: 3.5, area: 0.15, cooldown: -0.07 },
    evolvesWith: 'travelersPrayer', evolvesTo: 'sanctuaryChime',
  },
};

export const EVOLVED_WEAPONS = {
  moonlightFlurry: {
    id: 'moonlightFlurry', name: '月光乱舞', icon: '✨', color: '#eaf4ff', aura: true, maxLevel: 1, behavior: 'homing',
    desc: '進化武器。巨大な光の短剣が広範囲を貫通する。',
    base: { cooldown: 0.5, damage: 34, count: 3, pierce: 5, speed: 7, area: 1.8 },
    perLevel: {},
  },
  eternalCrescent: {
    id: 'eternalCrescent', name: '永遠の三日月', icon: '🌒', color: '#d6fff0', aura: true, maxLevel: 1, behavior: 'sweep',
    desc: '進化武器。全方位を巨大な三日月刃が薙ぎ払う。',
    base: { cooldown: 0.9, damage: 46, count: 4, pierce: 99, area: 2.2, spinSpeed: 4.2, orbitR: 100 },
    perLevel: {},
  },
  royalFlush: {
    id: 'royalFlush', name: 'ロイヤルフラッシュ', icon: '💎', color: '#ffe08a', aura: true, maxLevel: 1, behavior: 'boomerang',
    desc: '進化武器。5枚の王冠が連続して飛び交う。',
    base: { cooldown: 0.7, damage: 26, count: 5, pierce: 99, speed: 9, range: 320, area: 1.5 },
    perLevel: {},
  },
  goldenAcornBarrage: {
    id: 'goldenAcornBarrage', name: '黄金ドングリ乱舞', icon: '🌟', color: '#ffd76a', aura: true, maxLevel: 1, behavior: 'spread',
    desc: '進化武器。黄金のドングリが全方位に降り注ぐ。',
    base: { cooldown: 0.5, damage: 18, count: 10, pierce: 2, speed: 7, area: 1.6 },
    perLevel: {},
  },
  endlessBriar: {
    id: 'endlessBriar', name: '永劫のいばら', icon: '🌹', color: '#e05a9a', aura: true, maxLevel: 1, behavior: 'orbit',
    desc: '進化武器。いばらが巨大化し絶え間なく敵を切り裂く。',
    base: { cooldown: 0, damage: 16, count: 5, pierce: 99, orbitR: 130, spinSpeed: 3.2, area: 2, tickRate: 0.25 },
    perLevel: {},
  },
  ancientOakFall: {
    id: 'ancientOakFall', name: '大古樹の崩落', icon: '🌳', color: '#5a8a4a', aura: true, maxLevel: 1, behavior: 'nova',
    desc: '進化武器。大古樹そのものが崩れ落ちる大爆撃。',
    base: { cooldown: 0.6, damage: 60, count: 3, area: 1.8, radius: 100 },
    perLevel: {},
  },
  eternalHowl: {
    id: 'eternalHowl', name: '永遠の遠吠え', icon: '🌕', color: '#c9d8ff', aura: true, maxLevel: 1, behavior: 'aura',
    desc: '進化武器。満月の遠吠えが絶え間なく響き渡る。',
    base: { cooldown: 0.7, damage: 26, area: 2, radius: 150 },
    perLevel: {},
  },
  moonsilverVolley: {
    id: 'moonsilverVolley', name: '月銀の連矢', icon: '🌌', color: '#e8e8ff', aura: true, maxLevel: 1, behavior: 'homing',
    desc: '進化武器。月銀の矢が絶え間なく降り注ぐ。',
    base: { cooldown: 0.15, damage: 12, count: 2, pierce: 2, speed: 11, area: 1.3 },
    perLevel: {},
  },
  merchantsBarrage: {
    id: 'merchantsBarrage', name: '豪商の一斉射撃', icon: '💰', color: '#ffd76a', aura: true, maxLevel: 1, behavior: 'spread',
    desc: '進化武器。ありったけの石つぶてを一斉にばら撒く。',
    base: { cooldown: 0.4, damage: 14, count: 8, pierce: 2, speed: 8, area: 1.4 },
    perLevel: {},
  },
  blizzardCharm: {
    id: 'blizzardCharm', name: '吹雪の呪符', icon: '🌨️', color: '#c8f0ff', aura: true, maxLevel: 1, behavior: 'homing',
    desc: '進化武器。吹雪の呪符が敵を凍てつかせながら追尾する。',
    base: { cooldown: 0.45, damage: 30, count: 4, pierce: 4, speed: 6.5, area: 1.8 },
    perLevel: {},
  },
  worldTreeRoots: {
    id: 'worldTreeRoots', name: '世界樹の根', icon: '🌲', color: '#3d7a4a', aura: true, maxLevel: 1, behavior: 'sweep',
    desc: '進化武器。世界樹の根が地を這い薙ぎ払う。',
    base: { cooldown: 0.8, damage: 40, count: 5, pierce: 99, area: 2.4, spinSpeed: 3.6, orbitR: 110 },
    perLevel: {},
  },
  greatChainFlail: {
    id: 'greatChainFlail', name: '大鎖分銅', icon: '⚙️', color: '#7a7a8a', aura: true, maxLevel: 1, behavior: 'boomerang',
    desc: '進化武器。巨大な鎖分銅が敵を薙ぎ倒しながら往復する。',
    base: { cooldown: 0.6, damage: 34, count: 2, pierce: 99, speed: 7.5, range: 340, area: 1.8 },
    perLevel: {},
  },
  meteorShower: {
    id: 'meteorShower', name: '流星群', icon: '☄️', color: '#e0d0ff', aura: true, maxLevel: 1, behavior: 'spread',
    desc: '進化武器。夜空を割って流星群が降り注ぐ。',
    base: { cooldown: 0.5, damage: 16, count: 12, pierce: 1, speed: 7, area: 1.5 },
    perLevel: {},
  },
  greatHornedGuardian: {
    id: 'greatHornedGuardian', name: '大角梟の守護', icon: '🦉', color: '#c9a86a', aura: true, maxLevel: 1, behavior: 'orbit',
    desc: '進化武器。大角梟の眷属が力強く旋回し続ける。',
    base: { cooldown: 0, damage: 14, count: 5, pierce: 99, orbitR: 130, spinSpeed: 2.6, area: 1.6, tickRate: 0.25 },
    perLevel: {},
  },
  canyonRupture: {
    id: 'canyonRupture', name: '大峡谷の断裂', icon: '🏔️', color: '#c98a4a', aura: true, maxLevel: 1, behavior: 'nova',
    desc: '進化武器。大地そのものが割れ広範囲を飲み込む。',
    base: { cooldown: 0.8, damage: 64, count: 3, area: 1.8, radius: 110 },
    perLevel: {},
  },
  sanctuaryChime: {
    id: 'sanctuaryChime', name: '聖域の鐘', icon: '⛩️', color: '#ffe6f0', aura: true, maxLevel: 1, behavior: 'aura',
    desc: '進化武器。聖域の鐘の音色が絶え間なく敵を浄化する。',
    base: { cooldown: 0.9, damage: 22, area: 2, radius: 140 },
    perLevel: {},
  },
};

// -------------------- PASSIVE ITEMS --------------------
export const PASSIVES = {
  forestCloak: { id: 'forestCloak', name: '森のマント', icon: '🧥', maxLevel: 5, stat: 'maxHP', perLevel: 20, desc: '最大HP+20' },
  sharpenedBlade: { id: 'sharpenedBlade', name: '研がれた刃', icon: '⚔️', maxLevel: 5, stat: 'power', perLevel: 0.12, desc: '攻撃力+12%' },
  travelersBoots: { id: 'travelersBoots', name: '旅人のブーツ', icon: '👢', maxLevel: 5, stat: 'moveSpeedMult', perLevel: 0.08, desc: '移動速度+8%' },
  forestBlessing: { id: 'forestBlessing', name: '森の加護', icon: '🌳', maxLevel: 5, stat: 'area', perLevel: 0.1, desc: '効果範囲+10%（月光の短剣進化に必要）' },
  knightsEmblem: { id: 'knightsEmblem', name: '騎士の紋章', icon: '🛡️', maxLevel: 5, stat: 'power', perLevel: 0.1, desc: '攻撃力+10%（三日月の斬撃進化に必要）' },
  fourLeafCharm: { id: 'fourLeafCharm', name: '四つ葉のお守り', icon: '🍀', maxLevel: 5, stat: 'luck', perLevel: 0.2, desc: '運+0.2（王冠ブーメラン進化に必要）' },
  guidingBell: { id: 'guidingBell', name: '道しるべの鈴', icon: '🔔', maxLevel: 5, stat: 'pickupRange', perLevel: 25, desc: 'アイテム収集範囲+25' },
  ringOfSwiftness: { id: 'ringOfSwiftness', name: '俊敏の指輪', icon: '💍', maxLevel: 5, stat: 'cooldown', perLevel: -0.08, desc: '攻撃間隔-8%' },
  travelersJournal: { id: 'travelersJournal', name: '旅の記録帳', icon: '📖', maxLevel: 5, stat: 'xpMult', perLevel: 0.1, desc: '獲得経験値+10%' },
  wolfsBond: { id: 'wolfsBond', name: '狼の絆', icon: '🐾', maxLevel: 5, stat: 'power', perLevel: 0.1, desc: '攻撃力+10%（月夜の遠吠え進化に必要）' },
  hawkEye: { id: 'hawkEye', name: '鷹の目', icon: '🦅', maxLevel: 5, stat: 'cooldown', perLevel: -0.06, desc: '攻撃間隔-6%（銀の矢進化に必要）' },
  merchantsEye: { id: 'merchantsEye', name: '商人の目利き', icon: '🧮', maxLevel: 5, stat: 'luck', perLevel: 0.15, desc: '運+0.15（旅商人のスリング進化に必要）' },
  winterCloak: { id: 'winterCloak', name: '冬のマント', icon: '🧣', maxLevel: 5, stat: 'area', perLevel: 0.1, desc: '効果範囲+10%（氷結の呪符進化に必要）' },
  rootedHeart: { id: 'rootedHeart', name: '根付いた心', icon: '🌱', maxLevel: 5, stat: 'maxHP', perLevel: 15, desc: '最大HP+15（朽ちない蔦進化に必要）' },
  ironResolve: { id: 'ironResolve', name: '鉄の意志', icon: '⚒️', maxLevel: 5, stat: 'power', perLevel: 0.1, desc: '攻撃力+10%（鎖分銅進化に必要）' },
  starMap: { id: 'starMap', name: '星の地図', icon: '🗺️', maxLevel: 5, stat: 'xpMult', perLevel: 0.08, desc: '獲得経験値+8%（星屑の散弾進化に必要）' },
  nightVision: { id: 'nightVision', name: '夜目', icon: '👁️', maxLevel: 5, stat: 'pickupRange', perLevel: 20, desc: 'アイテム収集範囲+20（梟の眷属進化に必要）' },
  stoneFist: { id: 'stoneFist', name: '石の拳', icon: '👊', maxLevel: 5, stat: 'power', perLevel: 0.12, desc: '攻撃力+12%（地割れの一撃進化に必要）' },
  travelersPrayer: { id: 'travelersPrayer', name: '旅の祈り', icon: '🙏', maxLevel: 5, stat: 'regen', perLevel: 0.03, desc: 'HP自然回復+0.03/秒（祝福の風鈴進化に必要）' },
  moonPriestessBlessing: { id: 'moonPriestessBlessing', name: '満月の巫女の加護', icon: '🌕', maxLevel: 5, stat: 'critMult', perLevel: 0.05, desc: '会心ダメージ倍率+0.05（永遠の遠吠えの超進化に必要）' },
};

export const EVOLUTION_PAIRS = [
  { weapon: 'moonlightDagger', passive: 'forestBlessing', evolvesTo: 'moonlightFlurry' },
  { weapon: 'crescentBlade', passive: 'knightsEmblem', evolvesTo: 'eternalCrescent' },
  { weapon: 'crownBoomerang', passive: 'fourLeafCharm', evolvesTo: 'royalFlush' },
  { weapon: 'acornShot', passive: 'forestCloak', evolvesTo: 'goldenAcornBarrage' },
  { weapon: 'thornVortex', passive: 'travelersBoots', evolvesTo: 'endlessBriar' },
  { weapon: 'branchTrap', passive: 'guidingBell', evolvesTo: 'ancientOakFall' },
  { weapon: 'moonHowl', passive: 'wolfsBond', evolvesTo: 'eternalHowl' },
  { weapon: 'silverArrow', passive: 'hawkEye', evolvesTo: 'moonsilverVolley' },
  { weapon: 'travelersSling', passive: 'merchantsEye', evolvesTo: 'merchantsBarrage' },
  { weapon: 'frostCharm', passive: 'winterCloak', evolvesTo: 'blizzardCharm' },
  { weapon: 'undyingVine', passive: 'rootedHeart', evolvesTo: 'worldTreeRoots' },
  { weapon: 'chainWeight', passive: 'ironResolve', evolvesTo: 'greatChainFlail' },
  { weapon: 'stardustShot', passive: 'starMap', evolvesTo: 'meteorShower' },
  { weapon: 'owlFamiliar', passive: 'nightVision', evolvesTo: 'greatHornedGuardian' },
  { weapon: 'quakingStrike', passive: 'stoneFist', evolvesTo: 'canyonRupture' },
  { weapon: 'blessingChime', passive: 'travelersPrayer', evolvesTo: 'sanctuaryChime' },
];

// -------------------- SUPER EVOLUTION (deep endgame, strict conditions) --------------------
// A second fusion tier beyond EVOLUTION_PAIRS: requires the already-evolved
// weapon, a *second* maxed passive, and a high player level. Deliberately
// hard to reach - this is the long-term "keep playing for a year" hook.
export const SUPER_EVOLUTION_PAIRS = [
  { weapon: 'moonlightFlurry', passive: 'sharpenedBlade', minLevel: 20, evolvesTo: 'moonlightGoddess' },
  { weapon: 'eternalCrescent', passive: 'ringOfSwiftness', minLevel: 20, evolvesTo: 'crescentSovereign' },
  { weapon: 'royalFlush', passive: 'travelersJournal', minLevel: 20, evolvesTo: 'royalAscension' },
  { weapon: 'eternalHowl', passive: 'moonPriestessBlessing', minLevel: 25, evolvesTo: 'lunarSovereign' },
];

export const SUPER_EVOLVED_WEAPONS = {
  moonlightGoddess: {
    id: 'moonlightGoddess', name: '月光の女神', icon: '🌟', color: '#fff9e0', aura: true, superAura: true, maxLevel: 1, behavior: 'homing',
    desc: '超進化。女神の加護を受けた光刃が全てを貫く。',
    base: { cooldown: 0.3, damage: 70, count: 5, pierce: 12, speed: 8, area: 2.4 },
    perLevel: {},
  },
  crescentSovereign: {
    id: 'crescentSovereign', name: '三日月の覇者', icon: '🌘', color: '#e0fff0', aura: true, superAura: true, maxLevel: 1, behavior: 'sweep',
    desc: '超進化。覇者の刃が全方位を薙ぎ払い続ける。',
    base: { cooldown: 0.55, damage: 92, count: 6, pierce: 99, area: 3, spinSpeed: 5, orbitR: 120 },
    perLevel: {},
  },
  royalAscension: {
    id: 'royalAscension', name: '王家の極', icon: '👑', color: '#fff0a0', aura: true, superAura: true, maxLevel: 1, behavior: 'boomerang',
    desc: '超進化。王家の力の全てが解き放たれる。',
    base: { cooldown: 0.4, damage: 56, count: 8, pierce: 99, speed: 11, range: 380, area: 2.2 },
    perLevel: {},
  },
  lunarSovereign: {
    id: 'lunarSovereign', name: '月虹の女王', icon: '🌈', color: '#ffe0f5', aura: true, superAura: true, maxLevel: 1, behavior: 'aura',
    desc: '超進化。月虹の女王の加護が絶えず敵を包み込む。',
    base: { cooldown: 0.35, damage: 48, area: 2.6, radius: 180 },
    perLevel: {},
  },
};

// -------------------- WEAPON ELEMENT BRANCHES (Monster-Hunter-style tree) --------------------
// At max level, a starting weapon that hasn't fused yet can branch into one
// of these - a Monster Hunter style "what kind of weapon is this" choice.
// The choice is stored on the weapon slot itself (w.branch), not baked into
// its id, so it survives fusion/super-evolution automatically.
export const BRANCH_DEFS = {
  poison: { id: 'poison', name: '猛毒', icon: '☠️', dmgMult: 0.85, desc: 'ヒットした敵に継続ダメージの毒を付与する' },
  paralysis: { id: 'paralysis', name: '麻痺', icon: '⚡', dmgMult: 0.85, desc: 'ヒットした敵を一定時間麻痺させ動きを止める' },
  explosion: { id: 'explosion', name: '爆発', icon: '💥', dmgMult: 0.9, desc: 'ヒット時に周囲の敵も巻き込む爆発を起こす' },
  power: { id: 'power', name: '会心', icon: '🎯', dmgMult: 1.25, critBonus: 0.15, desc: '攻撃力アップに加え、会心率が上昇する' },
};
export const BRANCHABLE_WEAPONS = [
  'moonlightDagger', 'crescentBlade', 'crownBoomerang', 'travelersSling',
  'silverArrow', 'acornShot', 'frostCharm', 'owlFamiliar',
];

// -------------------- CHARACTER SKILLS --------------------
// Each costume has exactly 3 unique skills (HoloCure-style: distinct from
// the shared weapon/passive pools above, one per character, not
// interchangeable). Skills start unowned each run and are offered/leveled
// through the same level-up-card flow as weapons/passives (see
// buildUpgradeChoices in ui.js) rather than being auto-granted.
//
// type drives which generic execution path applies (see entities.js
// Player.recompute for statBoost, game.js damageEnemy for onHit, the
// player's per-frame skill-aura timer in game.js for aura, and the
// Companion class in entities.js for summon) - only 4 mechanics to
// implement, parametrized 15 ways rather than 15 bespoke systems.
export const CHARACTER_SKILLS = {
  butlerRabbit: [
    {
      id: 'nimbleFootwork', name: '俊敏な身のこなし', icon: '💨', maxLevel: 5, type: 'statBoost',
      stat: 'moveSpeedMult', perLevel: 0.06, desc: '移動速度+6%',
    },
    {
      id: 'opportunisticStrike', name: '隙をつく一撃', icon: '🎩', maxLevel: 5, type: 'onHit', effect: 'bonusDamage',
      base: { chance: 0.12, value: 6 }, perLevel: { chance: 0.02, value: 2.5 },
      desc: '攻撃命中時、確率で追加ダメージ',
    },
    {
      id: 'butlersLoyalty', name: '執事の忠義', icon: '🧺', maxLevel: 5, type: 'summon', variant: 'collector',
      base: { pullRadius: 110 }, perLevel: { pullRadius: 22 },
      desc: 'ジェムを自動で引き寄せる使い魔を呼ぶ',
    },
  ],
  princess: [
    {
      id: 'royalAuthority', name: '王家の威光', icon: '👑', maxLevel: 5, type: 'statBoost',
      stat: 'luck', perLevel: 0.15, desc: '運+0.15',
    },
    {
      id: 'queensStrike', name: '女王の一撃', icon: '⚜️', maxLevel: 5, type: 'onHit', effect: 'execute',
      base: { chance: 0.1, value: 0.12 }, perLevel: { chance: 0.015, value: 0.015 },
      desc: '攻撃命中時、確率でHPが低い敵を即座に討つ',
    },
    {
      id: 'guardianHalo', name: '守護の光輪', icon: '🕊️', maxLevel: 5, type: 'aura',
      base: { cooldown: 4.5, damage: 7, radius: 80 }, perLevel: { damage: 2.5, radius: 10, cooldown: -0.2 },
      desc: '一定間隔で光の輪が広がり周囲の敵にダメージ',
    },
  ],
  escapee: [
    {
      id: 'fugitivesInstinct', name: '逃走者の勘', icon: '👣', maxLevel: 5, type: 'statBoost',
      stat: 'critChance', perLevel: 0.02, desc: '会心率+2%',
    },
    {
      id: 'survivalInstinct', name: '生存本能', icon: '🌱', maxLevel: 5, type: 'onHit', effect: 'lifesteal',
      base: { chance: 0.15, value: 1.5 }, perLevel: { chance: 0.02, value: 0.6 },
      desc: '攻撃命中時、確率でわずかにHP回復',
    },
    {
      id: 'guidingSpirit', name: '道連れの精霊', icon: '🔥', maxLevel: 5, type: 'summon', variant: 'attacker',
      base: { damage: 4, interval: 1.4, range: 160 }, perLevel: { damage: 2 },
      desc: '近くの敵を自動で攻撃する精霊を呼ぶ',
    },
  ],
  huntress: [
    {
      id: 'huntersReflexes', name: '狩人の反射神経', icon: '🎯', maxLevel: 5, type: 'statBoost',
      stat: 'cooldown', perLevel: -0.05, desc: '攻撃間隔-5%',
    },
    {
      id: 'criticalSweep', name: '会心の一薙ぎ', icon: '💫', maxLevel: 5, type: 'onHit', effect: 'bonusDamage',
      base: { chance: 0.14, value: 8 }, perLevel: { chance: 0.02, value: 3 },
      desc: '攻撃命中時、確率で追加ダメージ',
    },
    {
      id: 'forestsWard', name: '森の守り', icon: '🍂', maxLevel: 5, type: 'aura',
      base: { cooldown: 4.0, damage: 8, radius: 75 }, perLevel: { damage: 3, radius: 9, cooldown: -0.18 },
      desc: '一定間隔で森の加護が広がり周囲の敵にダメージ',
    },
  ],
  wanderer: [
    {
      id: 'discerningMerchant', name: '目利きの旅商人', icon: '🔍', maxLevel: 5, type: 'statBoost',
      stat: 'pickupRange', perLevel: 8, desc: 'アイテム収集範囲+8',
    },
    {
      id: 'weightOfGoods', name: '荷物の重み', icon: '🎒', maxLevel: 5, type: 'onHit', effect: 'lifesteal',
      base: { chance: 0.1, value: 2 }, perLevel: { chance: 0.02, value: 0.8 },
      desc: '攻撃命中時、確率でわずかにHP回復',
    },
    {
      id: 'loyalPackmule', name: '忠実な荷運び', icon: '🐐', maxLevel: 5, type: 'summon', variant: 'collector',
      base: { pullRadius: 100 }, perLevel: { pullRadius: 20 },
      desc: 'ジェムを自動で引き寄せる荷運びを呼ぶ',
    },
  ],
};

// -------------------- META PROGRESSION (permanent shop upgrades) --------------------
// Bought with coins earned per run (see game.js coinsForRun). Persist forever
// across runs via storage.js, unlike the in-run passives above. Cost grows
// ~35% per level already purchased (see upgradeCost below).
export const PERMANENT_UPGRADES = {
  permMaxHP: { id: 'permMaxHP', name: '体力の記憶', icon: '❤️', stat: 'maxHP', perLevel: 5, baseCost: 20, maxLevel: 20, desc: '最大HP+5(永続)' },
  permPower: { id: 'permPower', name: '力の記憶', icon: '💪', stat: 'power', perLevel: 0.02, baseCost: 25, maxLevel: 15, desc: '攻撃力+2%(永続)' },
  permSpeed: { id: 'permSpeed', name: '俊足の記憶', icon: '🏃', stat: 'moveSpeedMult', perLevel: 0.015, baseCost: 20, maxLevel: 10, desc: '移動速度+1.5%(永続)' },
  permLuck: { id: 'permLuck', name: '幸運の記憶', icon: '🍀', stat: 'luck', perLevel: 0.05, baseCost: 22, maxLevel: 10, desc: '運+0.05(永続)' },
  permRegen: { id: 'permRegen', name: '回復の記憶', icon: '💚', stat: 'regen', perLevel: 0.02, baseCost: 24, maxLevel: 10, desc: 'HP自然回復+0.02/秒(永続)' },
  permPickup: { id: 'permPickup', name: '収集の記憶', icon: '🧲', stat: 'pickupRange', perLevel: 6, baseCost: 18, maxLevel: 10, desc: 'アイテム収集範囲+6(永続)' },
};

export function upgradeCost(def, currentLevel) {
  return Math.round(def.baseCost * Math.pow(1.35, currentLevel));
}

// -------------------- ENEMIES --------------------
// `id` doubles as the key used to look up an optional custom portrait at
// assets/enemies/<id>.png (falls back to `icon` automatically if not found).
// `tier` (1-3) drives the toughness-color ring for enemies that aren't
// elite/boss (which get their own gold/red ring). `xp` is never set
// manually - it's derived from hp/damage so it stays proportional to how
// tough the enemy actually was, including any new enemies added later
// (see registerCustomEnemies below).
export const ENEMY_TYPES = {
  // ---- Stage 1: forest (castle pursuers) ----
  guardSoldier: { id: 'guardSoldier', name: '衛兵', icon: '💂', hp: 14, speed: 1.4, damage: 5, radius: 14, color: '#8fa3b8', tier: 1 },
  houndScout: { id: 'houndScout', name: '追跡犬', icon: '🐕', hp: 10, speed: 2.4, damage: 4, radius: 12, color: '#8a6a4a', tier: 1 },
  cursedArmor: { id: 'cursedArmor', name: '呪われた鎧', icon: '🛡️', hp: 26, speed: 1.0, damage: 7, radius: 16, color: '#9a7a3f', tier: 3 },
  wanderingMaid: { id: 'wanderingMaid', name: '彷徨う侍女の霊', icon: '👻', hp: 18, speed: 1.9, damage: 6, radius: 13, color: '#cfe8d0', tier: 2 },
  eliteKnight: { id: 'eliteKnight', name: 'エリート騎士', icon: '🐴', hp: 220, speed: 1.3, damage: 13, radius: 26, color: '#d4af5a', elite: true },
  bossKnightCaptain: { id: 'bossKnightCaptain', name: '騎士団長ヴァルガ', icon: '⚔️', hp: 2200, speed: 1.0, damage: 20, radius: 46, color: '#8a1f2b', boss: true },

  // ---- Stage 2: village outskirts / road (bounty hunters) ----
  bountyHunter: { id: 'bountyHunter', name: '賞金稼ぎ', icon: '🤠', hp: 16, speed: 1.6, damage: 6, radius: 14, color: '#c9a24a', tier: 1 },
  lanternWatcher: { id: 'lanternWatcher', name: '見回りの番人', icon: '🏮', hp: 20, speed: 1.2, damage: 6, radius: 14, color: '#e8a33f', tier: 2 },
  masterMercenary: { id: 'masterMercenary', name: '凄腕の傭兵', icon: '🗡️', hp: 32, speed: 1.3, damage: 9, radius: 16, color: '#7a4a3a', tier: 3 },
  eliteBountyHunter: { id: 'eliteBountyHunter', name: 'エリート賞金稼ぎ', icon: '🐎', hp: 260, speed: 1.4, damage: 15, radius: 26, color: '#d4844a', elite: true },
  bossGuildMaster: { id: 'bossGuildMaster', name: '賞金稼ぎギルド長', icon: '🎯', hp: 2600, speed: 1.1, damage: 24, radius: 46, color: '#5a2f1f', boss: true },
};

// -------------------- STAGES --------------------
// Each stage is a self-contained wave schedule + elite/boss + background theme.
// Clearing a stage (defeating its boss) unlocks the next one (see game.js /
// localStorage). `bgTheme` picks the color palette + decoration shape drawn
// procedurally in game.js (no image assets needed).
export const STAGES = {
  forest: {
    id: 'forest', name: '森からの逃走', order: 1, bgTheme: 'forest',
    desc: '城を抜け出したばかり。追っ手の衛兵や騎士から森の中を逃げ延びろ。',
    waves: [
      { t: 0, types: ['guardSoldier'], rate: 1.0, count: 1 },
      { t: 20, types: ['guardSoldier', 'houndScout'], rate: 0.8, count: 1 },
      { t: 45, types: ['guardSoldier', 'houndScout', 'wanderingMaid'], rate: 0.6, count: 2 },
      { t: 75, types: ['houndScout', 'wanderingMaid', 'cursedArmor'], rate: 0.5, count: 2 },
      { t: 110, types: ['cursedArmor', 'wanderingMaid', 'guardSoldier'], rate: 0.4, count: 3 },
      { t: 150, types: ['cursedArmor', 'houndScout', 'wanderingMaid'], rate: 0.35, count: 3 },
      { t: 200, types: ['cursedArmor', 'wanderingMaid', 'houndScout'], rate: 0.3, count: 4 },
    ],
    eliteId: 'eliteKnight', eliteTimes: [60, 120, 180, 240],
    bossId: 'bossKnightCaptain', length: 300,
  },
  village: {
    id: 'village', name: '村はずれの街道', order: 2, bgTheme: 'village',
    desc: '森を抜けた先は賞金稼ぎたちが待ち構える街道。日暮れの中を駆け抜けろ。',
    waves: [
      { t: 0, types: ['bountyHunter'], rate: 1.0, count: 1 },
      { t: 20, types: ['bountyHunter', 'lanternWatcher'], rate: 0.8, count: 1 },
      { t: 45, types: ['bountyHunter', 'lanternWatcher', 'masterMercenary'], rate: 0.6, count: 2 },
      { t: 75, types: ['lanternWatcher', 'masterMercenary', 'bountyHunter'], rate: 0.5, count: 2 },
      { t: 110, types: ['masterMercenary', 'lanternWatcher', 'bountyHunter'], rate: 0.4, count: 3 },
      { t: 150, types: ['masterMercenary', 'bountyHunter', 'lanternWatcher'], rate: 0.35, count: 3 },
      { t: 200, types: ['masterMercenary', 'lanternWatcher', 'bountyHunter'], rate: 0.3, count: 4 },
    ],
    eliteId: 'eliteBountyHunter', eliteTimes: [60, 120, 180, 240],
    bossId: 'bossGuildMaster', length: 300,
  },
};

// Endless / challenge mode: no clear condition, no boss - runs forever with
// difficulty scaling until the player dies. Draws from both stages' regular
// enemies for variety, and rotates through both elites.
export const ENDLESS_CONFIG = {
  id: 'endless', name: 'エンドレスモード', bgTheme: 'forest',
  desc: 'クリアなし、ひたすら生き延びる挑戦モード。記録はランキングに残る。',
  waves: [
    { t: 0, types: ['guardSoldier', 'houndScout'], rate: 1.0, count: 1 },
    { t: 30, types: ['guardSoldier', 'houndScout', 'wanderingMaid', 'bountyHunter'], rate: 0.7, count: 2 },
    { t: 70, types: ['wanderingMaid', 'cursedArmor', 'bountyHunter', 'lanternWatcher'], rate: 0.5, count: 3 },
    { t: 120, types: ['cursedArmor', 'lanternWatcher', 'masterMercenary', 'wanderingMaid'], rate: 0.4, count: 3 },
    { t: 180, types: ['cursedArmor', 'masterMercenary', 'bountyHunter', 'lanternWatcher'], rate: 0.32, count: 4 },
    { t: 260, types: ['masterMercenary', 'cursedArmor', 'lanternWatcher'], rate: 0.26, count: 5 },
  ],
  eliteIds: ['eliteKnight', 'eliteBountyHunter'], eliteInterval: 60,
};

// -------------------- CUSTOM ENEMIES (listener submissions) --------------------
// Loaded at boot from data/custom-enemies.json (see enemy-creator.html for the
// tool that generates entries in this shape). Safe to call with an empty or
// missing list - unknown/duplicate ids are skipped rather than throwing.
//
// Custom enemies are only inserted into waves from a tier-appropriate point
// onward (not every wave from t=0) so a tough tier-3 submission doesn't show
// up while the player is still level 1 - it appears around the same point in
// the schedule where the stage's own tier-3 enemies start appearing.
const TIER_START_FRACTION = { 1: 0, 2: 0.3, 3: 0.55 };

function insertIntoWaves(waves, id, tier) {
  const startIdx = Math.floor(waves.length * (TIER_START_FRACTION[tier] ?? 0));
  waves.forEach((w, i) => {
    if (i >= startIdx && !w.types.includes(id)) w.types.push(id);
  });
}

export function registerCustomEnemies(list) {
  if (!Array.isArray(list)) return;
  for (const c of list) {
    if (!c || !c.id || ENEMY_TYPES[c.id]) continue;
    const tier = Math.min(3, Math.max(1, Number(c.tier) || 1));
    ENEMY_TYPES[c.id] = {
      id: c.id,
      name: c.name || c.id,
      icon: c.icon || '❓',
      hp: Number(c.hp) || 12,
      speed: Number(c.speed) || 1.4,
      damage: Number(c.damage) || 5,
      radius: Number(c.radius) || 14,
      color: c.color || '#cccccc',
      tier,
    };
    const stageKey = STAGES[c.stage] ? c.stage : 'forest';
    insertIntoWaves(STAGES[stageKey].waves, c.id, tier);
    insertIntoWaves(ENDLESS_CONFIG.waves, c.id, tier);
  }
}
