// Deep Core — static game data.
// Pure data and tiny helpers only: no DOM access, so game logic can be tested under Node.

export const TILE = 32;             // pixels per tile
export const WORLD_W = 30;          // columns, including the two bedrock walls
export const SURFACE_Y = 6;         // first row of ground (rows above are sky)
export const BEDROCK_DEPTH = 424;   // depth (rows below the surface) where the floor begins
export const WORLD_H = SURFACE_Y + BEDROCK_DEPTH + 4;

// The chamber that holds the Heart of the Deep, and the rows tremors never touch.
export const CORE_CHAMBER = { depth: 404, rx: 9.5, ry: 5.5 };
export const STABLE_ROWS = { minDepth: 4, chamberFrom: 394, chamberTo: 416 };

export const T = Object.freeze({
  AIR: 0, BEDROCK: 1,
  DIRT: 2, STONE: 3, SHALE: 4, MOSSROCK: 5, HOTROCK: 6, CRYSTALROCK: 7, VOIDSTONE: 8,
  RUBBLE: 9, BOULDER: 10, LAVA: 11, GAS: 12, SPOREPOD: 13, AIRPOCKET: 14, CRATE: 15,
  HEART: 16, PEDESTAL: 17,
  COPPER: 20, IRON: 21, SILVER: 22, GOLD: 23, LUMENITE: 24,
  RUBY: 25, SAPPHIRE: 26, DIAMOND: 27, VOIDGLASS: 28, CORESHARD: 29,
});

export const HARDNESS_NAMES = ['—', 'Soil', 'Stone', 'Shale', 'Hotrock', 'Crystal', 'Voidstone'];

const solid = (o) => ({
  solid: true, drillable: true, hardness: 1, ore: null, special: null,
  glow: null, overlay: false, object: false, ...o,
});

export const TILES = [];
TILES[T.AIR] = { name: 'Air', solid: false, drillable: false, hardness: 0, ore: null, special: null, glow: null };
TILES[T.BEDROCK] = solid({ name: 'Bedrock', drillable: false, hardness: 99 });
TILES[T.DIRT] = solid({ name: 'Soil', hardness: 1, color: '#6b4a2f' });
TILES[T.STONE] = solid({ name: 'Stone', hardness: 2, color: '#6c6864' });
TILES[T.SHALE] = solid({ name: 'Shale', hardness: 3, color: '#4a525e' });
TILES[T.MOSSROCK] = solid({ name: 'Mossrock', hardness: 3, color: '#3d4a3a' });
TILES[T.HOTROCK] = solid({ name: 'Hotrock', hardness: 4, color: '#4e2a20' });
TILES[T.CRYSTALROCK] = solid({ name: 'Crystal Rock', hardness: 5, color: '#33386a' });
TILES[T.VOIDSTONE] = solid({ name: 'Voidstone', hardness: 6, color: '#22182e' });
TILES[T.RUBBLE] = solid({ name: 'Rubble', hardness: 1, color: '#57493f' });
TILES[T.BOULDER] = solid({ name: 'Loose Boulder', hardness: 2, object: true, color: '#7a7066' });
TILES[T.LAVA] = { name: 'Lava', solid: false, drillable: false, hardness: 0, liquid: true, ore: null, special: null, glow: '#ff6a1a' };
TILES[T.GAS] = solid({ name: 'Gas Pocket', hardness: 2, special: 'gas', overlay: true });
TILES[T.SPOREPOD] = solid({ name: 'Spore Pod', hardness: 1, special: 'spore', overlay: true });
TILES[T.AIRPOCKET] = solid({ name: 'Air Pocket', hardness: 1, special: 'air', overlay: true, glow: '#7fd8ff' });
TILES[T.CRATE] = solid({ name: 'Salvage Crate', hardness: 1, special: 'crate', object: true });
TILES[T.HEART] = solid({ name: 'Heart of the Deep', hardness: 3, special: 'heart', glow: '#ff5ad1' });
TILES[T.PEDESTAL] = solid({ name: 'Ancient Pedestal', drillable: false, hardness: 99 });
TILES[T.COPPER] = solid({ name: 'Copper Ore', hardness: 1, ore: 'copper', overlay: true });
TILES[T.IRON] = solid({ name: 'Iron Ore', hardness: 2, ore: 'iron', overlay: true });
TILES[T.SILVER] = solid({ name: 'Silver Ore', hardness: 2, ore: 'silver', overlay: true });
TILES[T.GOLD] = solid({ name: 'Gold Ore', hardness: 3, ore: 'gold', overlay: true });
TILES[T.LUMENITE] = solid({ name: 'Lumenite', hardness: 3, ore: 'lumenite', overlay: true, glow: '#6bff9e' });
TILES[T.RUBY] = solid({ name: 'Ruby', hardness: 4, ore: 'ruby', overlay: true });
TILES[T.SAPPHIRE] = solid({ name: 'Sapphire', hardness: 5, ore: 'sapphire', overlay: true });
TILES[T.DIAMOND] = solid({ name: 'Diamond', hardness: 5, ore: 'diamond', overlay: true });
TILES[T.VOIDGLASS] = solid({ name: 'Voidglass', hardness: 6, ore: 'voidglass', overlay: true, glow: '#b46bff' });
TILES[T.CORESHARD] = solid({ name: 'Coreshard', hardness: 6, ore: 'coreshard', overlay: true, glow: '#ff9a1f' });
// Unused ids behave like bedrock so a stray value can never crash a lookup.
for (let i = 0; i < 32; i++) if (!TILES[i]) TILES[i] = TILES[T.BEDROCK];

export const BASE_ROCKS = new Set([T.DIRT, T.STONE, T.SHALE, T.MOSSROCK, T.HOTROCK, T.CRYSTALROCK, T.VOIDSTONE]);
export const ORE_TILES = [T.COPPER, T.IRON, T.SILVER, T.GOLD, T.LUMENITE, T.RUBY, T.SAPPHIRE, T.DIAMOND, T.VOIDGLASS, T.CORESHARD];

export const ITEMS = {
  copper: { name: 'Copper', value: 10, color: '#e08a4a', vein: [3, 7] },
  iron: { name: 'Iron', value: 18, color: '#d0a088', vein: [3, 6] },
  silver: { name: 'Silver', value: 35, color: '#e6edf5', vein: [2, 5] },
  gold: { name: 'Gold', value: 60, color: '#ffd23f', vein: [2, 4] },
  lumenite: { name: 'Lumenite', value: 95, color: '#6bff9e', vein: [2, 5] },
  ruby: { name: 'Ruby', value: 150, color: '#ff3b5c', vein: [2, 4] },
  sapphire: { name: 'Sapphire', value: 230, color: '#4d8bff', vein: [2, 4] },
  diamond: { name: 'Diamond', value: 340, color: '#d4ffff', vein: [1, 3] },
  voidglass: { name: 'Voidglass', value: 500, color: '#b46bff', vein: [2, 4] },
  coreshard: { name: 'Coreshard', value: 800, color: '#ff9a1f', vein: [1, 3] },
  scrap: { name: 'Salvage', value: 40, color: '#9aa7b4' },
};
export const HEART_VALUE = 5000;

// Strata, top to bottom. Depth is measured in rows (metres) below the surface.
export const LAYERS = [
  {
    id: 'crust', name: 'The Crust', from: 0, to: 50,
    rocks: [[T.DIRT, 0.72], [T.STONE, 0.28]],
    caveScale: 6, caveFraction: 0.07, lava: 0,
    ores: [[T.COPPER, 7], [T.IRON, 4], [T.SILVER, 0.6]],
    gas: 0, spore: 0, airpocket: 0.006, crate: 0.0025, boulder: 0.006,
    enemies: [['grub', 1]], enemyDensity: 0.0018, spawnInterval: 30,
    tremor: null, heat: 0,
    back: '#24180f', accent: '#c98b4f',
  },
  {
    id: 'shale', name: 'Shale Depths', from: 50, to: 120,
    rocks: [[T.STONE, 0.45], [T.SHALE, 0.55]],
    caveScale: 6.5, caveFraction: 0.13, lava: 0,
    ores: [[T.IRON, 3], [T.SILVER, 5], [T.GOLD, 2.6]],
    gas: 0.008, spore: 0, airpocket: 0.006, crate: 0.003, boulder: 0.008,
    enemies: [['gloomwing', 3], ['grub', 1]], enemyDensity: 0.0032, spawnInterval: 24,
    tremor: [55, 75], heat: 0,
    back: '#191c24', accent: '#8aa0b8',
  },
  {
    id: 'fungal', name: 'Fungal Hollows', from: 120, to: 200,
    rocks: [[T.MOSSROCK, 0.75], [T.SHALE, 0.25]],
    caveScale: 9, caveFraction: 0.26, lava: 0,
    ores: [[T.GOLD, 3], [T.LUMENITE, 5]],
    gas: 0.003, spore: 0.05, airpocket: 0.007, crate: 0.003, boulder: 0.007,
    enemies: [['sporeling', 3], ['gloomwing', 2]], enemyDensity: 0.0034, spawnInterval: 22,
    tremor: [45, 60], heat: 0,
    back: '#132017', accent: '#7dff9a',
  },
  {
    id: 'magma', name: 'Magma Shelf', from: 200, to: 280,
    rocks: [[T.HOTROCK, 0.82], [T.SHALE, 0.18]],
    caveScale: 7, caveFraction: 0.17, lava: 0.52,
    ores: [[T.LUMENITE, 1.5], [T.RUBY, 5]],
    gas: 0.006, spore: 0, airpocket: 0.008, crate: 0.003, boulder: 0.008,
    enemies: [['magmaslug', 3], ['gloomwing', 1]], enemyDensity: 0.0030, spawnInterval: 22,
    tremor: [38, 50], heat: 0.6,
    back: '#2a110b', accent: '#ff6a2a',
  },
  {
    id: 'crystal', name: 'Crystal Abyss', from: 280, to: 360,
    rocks: [[T.CRYSTALROCK, 0.85], [T.HOTROCK, 0.15]],
    caveScale: 6.5, caveFraction: 0.16, lava: 0.62,
    ores: [[T.SAPPHIRE, 5], [T.DIAMOND, 3]],
    gas: 0.004, spore: 0, airpocket: 0.009, crate: 0.004, boulder: 0.009,
    enemies: [['shardmite', 3], ['magmaslug', 1]], enemyDensity: 0.0026, spawnInterval: 20,
    tremor: [28, 38], heat: 0.25,
    back: '#121330', accent: '#7fb8ff',
  },
  {
    id: 'core', name: 'The Core', from: 360, to: 440,
    rocks: [[T.VOIDSTONE, 0.85], [T.CRYSTALROCK, 0.15]],
    caveScale: 7.5, caveFraction: 0.16, lava: 0.6,
    ores: [[T.DIAMOND, 1.5], [T.VOIDGLASS, 4], [T.CORESHARD, 2]],
    gas: 0.004, spore: 0, airpocket: 0.01, crate: 0.004, boulder: 0.008,
    enemies: [['warden', 1], ['shardmite', 2]], enemyDensity: 0.0018, spawnInterval: 20,
    tremor: [22, 30], heat: 0.8,
    back: '#110a1b', accent: '#c070ff',
  },
];

export const ENEMIES = {
  grub: {
    name: 'Burrow Grub', hp: 22, dmg: 7, moveTime: 0.8, mode: 'burrow', aggro: 7, atkCd: 1.2,
    color: '#d98c8c',
  },
  gloomwing: {
    name: 'Gloomwing', hp: 14, dmg: 8, moveTime: 0.3, mode: 'fly', aggro: 9, atkCd: 1.0,
    color: '#6a4c9c',
  },
  sporeling: {
    name: 'Sporeling', hp: 30, dmg: 10, moveTime: 0.65, mode: 'walk', aggro: 9, atkCd: 1.2,
    color: '#9ad35a', ranged: { range: 7, cd: 2.8, dmg: 7, speed: 6 },
  },
  magmaslug: {
    name: 'Magma Slug', hp: 75, dmg: 18, moveTime: 0.95, mode: 'walk', aggro: 7, atkCd: 1.4,
    lavaImmune: true, color: '#ff6a2a',
  },
  shardmite: {
    name: 'Shardmite', hp: 14, dmg: 7, moveTime: 0.2, mode: 'fly', aggro: 10, atkCd: 0.9,
    pack: [2, 4], color: '#7fe8ff',
  },
  warden: {
    name: 'Core Warden', hp: 180, dmg: 26, moveTime: 0.42, rockMoveTime: 0.85, mode: 'phase', aggro: 12,
    atkCd: 1.4, lavaImmune: true, color: '#c070ff',
  },
};

// Persistent rig upgrades. Each level lists the stats it grants; rigStats() merges them.
export const UPGRADES = [
  {
    id: 'drill', name: 'Drill Head', blurb: 'Cuts harder strata, drills faster and rams harder.',
    levels: [
      { cost: 0, maxHard: 2, drillSpeed: 1.0, drillDmg: 12 },
      { cost: 200, maxHard: 3, drillSpeed: 1.3, drillDmg: 18 },
      { cost: 700, maxHard: 4, drillSpeed: 1.65, drillDmg: 26 },
      { cost: 2000, maxHard: 5, drillSpeed: 2.05, drillDmg: 36 },
      { cost: 4800, maxHard: 6, drillSpeed: 2.5, drillDmg: 48 },
      { cost: 9500, maxHard: 6, drillSpeed: 3.1, drillDmg: 64 },
    ],
    describe: (l) => `Cuts ${HARDNESS_NAMES[l.maxHard]} · speed ×${l.drillSpeed.toFixed(2)} · ram ${l.drillDmg}`,
  },
  {
    id: 'tank', name: 'Oxygen Tank', blurb: 'More air means longer, deeper dives.',
    levels: [
      { cost: 0, maxO2: 100 }, { cost: 120, maxO2: 150 }, { cost: 380, maxO2: 215 },
      { cost: 950, maxO2: 300 }, { cost: 2200, maxO2: 410 }, { cost: 4800, maxO2: 560 },
    ],
    describe: (l) => `${l.maxO2} O₂ capacity`,
  },
  {
    id: 'hull', name: 'Hull Plating', blurb: 'Structural integrity before the rig cracks.',
    levels: [
      { cost: 0, maxHull: 100 }, { cost: 150, maxHull: 140 }, { cost: 450, maxHull: 190 },
      { cost: 1100, maxHull: 255 }, { cost: 2600, maxHull: 335 }, { cost: 5200, maxHull: 440 },
    ],
    describe: (l) => `${l.maxHull} hull integrity`,
  },
  {
    id: 'shield', name: 'Deflector Shield', blurb: 'Absorbs hits first and recharges out of combat.',
    levels: [
      { cost: 0, maxShield: 10, shieldRegen: 3 }, { cost: 180, maxShield: 25, shieldRegen: 5 },
      { cost: 550, maxShield: 45, shieldRegen: 7.5 }, { cost: 1300, maxShield: 70, shieldRegen: 10 },
      { cost: 2900, maxShield: 100, shieldRegen: 14 }, { cost: 5800, maxShield: 140, shieldRegen: 19 },
    ],
    describe: (l) => `${l.maxShield} shield · ${l.shieldRegen}/s recharge`,
  },
  {
    id: 'cargo', name: 'Cargo Bay', blurb: 'Room for more ore on the way up.',
    levels: [
      { cost: 0, cargoCap: 10 }, { cost: 110, cargoCap: 16 }, { cost: 340, cargoCap: 24 },
      { cost: 850, cargoCap: 34 }, { cost: 1900, cargoCap: 46 }, { cost: 4200, cargoCap: 62 },
    ],
    describe: (l) => `${l.cargoCap} cargo slots`,
  },
  {
    id: 'thrusters', name: 'Thrusters', blurb: 'Faster climbing and lateral movement.',
    levels: [
      { cost: 0, climbTime: 0.22, moveTime: 0.15 }, { cost: 130, climbTime: 0.175, moveTime: 0.135 },
      { cost: 420, climbTime: 0.14, moveTime: 0.12 }, { cost: 1000, climbTime: 0.115, moveTime: 0.105 },
      { cost: 2300, climbTime: 0.095, moveTime: 0.095 },
    ],
    describe: (l) => `Climb ${(1 / l.climbTime).toFixed(1)} m/s`,
  },
  {
    id: 'lamp', name: 'Lamp & Scanner', blurb: 'Pushes back the dark. Later levels ping nearby ore.',
    levels: [
      { cost: 0, light: 4.5, ping: 0 }, { cost: 140, light: 5.5, ping: 0 }, { cost: 480, light: 6.5, ping: 9 },
      { cost: 1150, light: 7.5, ping: 12 }, { cost: 2500, light: 8.5, ping: 15 },
    ],
    describe: (l) => `Light ${l.light} m${l.ping ? ` · ore ping ${l.ping} m` : ''}`,
  },
  {
    id: 'plating', name: 'Heat Plating', blurb: 'Resists magma heat and lava burns.',
    levels: [
      { cost: 0, heatRes: 0 }, { cost: 600, heatRes: 0.35 }, { cost: 1700, heatRes: 0.6 }, { cost: 3800, heatRes: 0.8 },
    ],
    describe: (l) => (l.heatRes ? `${Math.round(l.heatRes * 100)}% heat resistance` : 'No heat protection'),
  },
  {
    id: 'pulse', name: 'Pulse Emitter', blurb: 'Shockwave that repels hostiles and disperses gas.',
    levels: [
      { cost: 0, pulseDmg: 22, pulseR: 2.2, pulseCd: 8 }, { cost: 260, pulseDmg: 36, pulseR: 2.6, pulseCd: 7 },
      { cost: 800, pulseDmg: 54, pulseR: 3.0, pulseCd: 6 }, { cost: 1900, pulseDmg: 78, pulseR: 3.4, pulseCd: 5 },
      { cost: 4200, pulseDmg: 110, pulseR: 3.8, pulseCd: 4 },
    ],
    describe: (l) => `${l.pulseDmg} dmg · ${l.pulseR} m · ${l.pulseCd}s cooldown`,
  },
];

export const CONSUMABLES = [
  { id: 'evac', key: '1', name: 'Evac Beacon', cost: 300, max: 2, desc: 'Hauls the rig and its cargo topside.' },
  { id: 'o2can', key: '2', name: 'O₂ Canister', cost: 45, max: 4, desc: 'Restores 40% of your oxygen.' },
  { id: 'repair', key: '3', name: 'Patch Kit', cost: 70, max: 3, desc: 'Repairs 45% of hull integrity.' },
  { id: 'charge', key: '4', name: 'Blast Charge', cost: 40, max: 5, desc: 'Shatters rock and hostiles 1.5s after dropping.' },
];

// Survey contracts: one is chosen before each dive and reshapes it.
export const MODIFIERS = [
  { id: 'standard', name: 'Standard Survey', desc: 'No special conditions.' },
  { id: 'richveins', name: 'Rich Veins', desc: '+60% ore deposits, +40% hostiles.', ore: 1.6, enemies: 1.4 },
  { id: 'thinair', name: 'Thin Atmosphere', desc: 'Oxygen drains 25% faster. Ore sells for +35%.', o2: 1.25, value: 1.35 },
  { id: 'seismic', name: 'Seismic Season', desc: 'Strata shift twice as often. Triple salvage crates.', tremor: 2, crates: 3 },
  { id: 'infested', name: 'Infestation', desc: 'Double hostiles. Ore sells for +50%.', enemies: 2, value: 1.5 },
  { id: 'calm', name: 'Calm Strata', desc: 'No strata shifts. Ore sells for −15%.', tremor: 0, value: 0.85 },
  { id: 'pockets', name: 'Breathing Rock', desc: 'Air pockets ×2.5, but gas pockets ×2.', air: 2.5, gas: 2 },
  { id: 'blackout', name: 'Blackout', desc: 'Lamp range −30%. +30% ore, sells for +20%.', light: 0.7, ore: 1.3, value: 1.2 },
];

export const MODIFIER_DEFAULTS = {
  ore: 1, enemies: 1, o2: 1, value: 1, tremor: 1, crates: 1, air: 1, gas: 1, light: 1,
};

export function layerIndexForDepth(depth) {
  for (let i = LAYERS.length - 1; i >= 0; i--) if (depth >= LAYERS[i].from) return i;
  return 0;
}
