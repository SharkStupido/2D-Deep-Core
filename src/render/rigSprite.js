// The player's excavation rig, drawn as procedural pixel art on the same 2px
// texel grid as the terrain. The body is built as a texel grid (pure, testable),
// painted once per visual state and cached; the drill and thruster flames are
// drawn per frame because they animate continuously.
import { ITEMS } from '../config.js';

export const RIG_TEXELS = 16; // the body fills one tile: 16×16 texels
const TX = 2; // pixels per texel

export const RIG_PALETTE = {
  k: '#17121d', // outline
  Y: '#f2b632', // hull paint
  h: '#ffe08a', // hull highlight
  y: '#c98a1d', // hull shade
  b: '#2a2230', // hazard stripe
  g: '#123b4c', // cockpit glass
  c: '#6fe6ff', // glass glint, shield emitters
  w: '#ffffff',
  p: '#eeeaf6', // pilot helmet
  v: '#ffb347', // heat-tile glow
  V: '#253a52', // helmet visor
  u: '#e8662a', // pilot suit
  m: '#8a8494', // metal
  M: '#4a4552', // dark metal
  l: '#c9ccd6', // bright metal
  t: '#26212e', // tread belt
  T: '#6a6474', // tread link
  L: '#fff6c8', // headlamp
  e: '#2a2531', // empty hopper
  A: '#d6962a', // armour plate (a heavier gauge of the hull paint)
  R: '#a8381f', // heat tile
  r: '#e0643a', // heat tile edge
  O: '#d6f3ff', // oxygen tank
  Q: '#7cc7e8', // oxygen tank shade
  D: '#3a2a1a', // scorch
  H: '#ff5ad1', // the Heart
  X: '#d7b4ff', // pulse emitter, charged
  Z: '#9a6bd6', // pulse emitter, charged (dim beat)
  x: '#3d3150', // pulse emitter, recharging
};

// Drill head materials by drill level: [light, dark].
export const DRILL_COLORS = [
  ['#d7dbe3', '#6c707a'], // Mk I steel
  ['#efb070', '#8a5a2b'], // Mk II bronze
  ['#a9c4e8', '#3e5778'], // Mk III carbide
  ['#ffe066', '#a07810'], // Mk IV gold
  ['#a8f4ff', '#2f8aa0'], // Mk V crystal
  ['#e7c0ff', '#6a2fa0'], // Mk VI voidsteel
];

/** Colours of the ore chunks heaped in the hopper (cheap ore at the bottom). */
export function cargoChunks(cargo = {}, used = 0, cap = 1) {
  if (!used || !cap) return [];
  const n = Math.min(9, Math.max(1, Math.round((used / cap) * 9)));
  const list = [];
  const items = Object.entries(cargo).filter(([id, c]) => c > 0 && ITEMS[id]);
  items.sort((a, b) => ITEMS[a[0]].value - ITEMS[b[0]].value);
  for (const [id, c] of items) for (let i = 0; i < c; i++) list.push(ITEMS[id].color);
  if (!list.length) return [];
  return Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]);
}

/**
 * Build the body (facing right) as a 16×16 grid of palette keys / colours.
 * Layout: treads at the bottom, a yellow hull with a dark belt line, a glass
 * canopy up front with the pilot inside, and the ore hopper and pulse mast behind.
 * frame: tread animation step · bob: suspension dip (0/1) · look: -1 up, 0, 1 down
 * damage: 0 fine, 1 battered, 2 critical · pulse: 'ready' | 'beat' | 'charging'
 */
export function buildRigGrid({
  frame = 0, bob = 0, levels = {}, cargo = [], heart = false, pulse = 'ready',
  damage = 0, look = 0, flash = false,
} = {}) {
  const N = RIG_TEXELS;
  const g = Array.from({ length: N }, () => new Array(N).fill(null));
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = c;
  };
  const lv = (id) => levels[id] || 1;

  // Treads (rows 12–14) stay planted while everything above rides the suspension.
  for (let x = 2; x <= 13; x++) {
    set(x, 12, (x + frame) % 3 === 0 ? 'T' : 't'); // top run rolls forward
    set(x, 14, (x - frame + 30) % 3 === 0 ? 'T' : 't'); // bottom run rolls back
  }
  for (let x = 1; x <= 14; x++) set(x, 13, 't');
  for (const wx of [3, 7, 11]) {
    set(wx - 1, 13, 'm');
    set(wx, 13, 'm');
    set(wx + 1, 13, 'm');
    set(wx + (frame % 3) - 1, 13, 'l'); // a bright spoke turning with the wheel
  }
  const nozzle = lv('thrusters') >= 3 ? 'l' : 'M';
  for (const x of [3, 4, 11, 12]) set(x, 14, nozzle);

  // Hull (rows Y0..Y0+5).
  const Y0 = 6 + bob;
  for (let y = Y0; y <= Y0 + 5; y++) for (let x = 1; x <= 12; x++) set(x, y, 'Y');
  set(1, Y0, null);
  set(12, Y0 + 5, null); // bevelled nose
  for (let x = 2; x <= 7; x++) set(x, Y0, 'h');
  for (let x = 8; x <= 12; x++) set(x, Y0, 'M'); // canopy frame
  for (const y of [Y0 + 1, Y0 + 2]) {
    set(1, y, 'y');
    set(12, y, 'y');
  }
  for (let x = 1; x <= 12; x++) set(x, Y0 + 3, 'M'); // belt line
  for (let y = Y0 + 4; y <= Y0 + 5; y++) {
    for (let x = 1; x <= 12; x++) {
      if (x === 12 && y === Y0 + 5) continue;
      if (lv('plating') >= 2) set(x, y, (x + (y % 2) * 2) % 4 === 0 ? 'r' : 'R');
      else set(x, y, (x + y) % 4 < 2 ? 'b' : 'y'); // slanted hazard stripes
    }
  }
  if (lv('plating') >= 4) for (let x = 2; x <= 11; x += 3) set(x, Y0 + 4, 'v'); // glowing seams
  if (lv('tank') >= 3) {
    set(1, Y0 + 1, 'O');
    set(1, Y0 + 2, 'Q');
    if (lv('tank') >= 5) set(1, Y0, 'O');
  }
  const plate = (x0, x1) => {
    for (let y = Y0 + 1; y <= Y0 + 2; y++) for (let x = x0; x <= x1; x++) set(x, y, 'A');
    set(x0, Y0 + 1, 'l'); // rivets
    set(x1, Y0 + 2, 'l');
  };
  if (lv('hull') >= 3) plate(2, 4);
  if (lv('hull') >= 5) plate(9, 11);
  if (lv('shield') >= 2) set(6, Y0 + 3, 'c');
  if (lv('shield') >= 4) set(10, Y0 + 3, 'c');
  set(13, Y0 + 1, 'L'); // headlamp
  set(13, Y0 + 2, 'l');
  if (lv('lamp') >= 3) set(13, Y0, 'L');
  for (let y = Y0 + 3; y <= Y0 + 5; y++) set(13, y, 'M'); // drill collar

  // Canopy with the pilot.
  for (let x = 9; x <= 12; x++) set(x, Y0 - 5, 'g');
  for (let y = Y0 - 4; y <= Y0 - 1; y++) for (let x = 8; x <= 13; x++) set(x, y, 'g');
  for (let x = 10; x <= 12; x++) set(x, Y0 - 2, 'u');
  for (let x = 9; x <= 12; x++) set(x, Y0 - 1, 'u');
  for (let x = 9; x <= 11; x++) {
    set(x, Y0 - 4, 'p');
    set(x, Y0 - 3, 'p');
  }
  // The pilot's visor follows where you drill.
  if (look < 0) {
    set(11, Y0 - 4, 'V');
  } else {
    set(11, Y0 - 3, 'V');
    if (look > 0) set(10, Y0 - 3, 'V');
  }
  set(12, Y0 - 5, 'w');
  set(13, Y0 - 4, 'c');

  // Pulse emitter mast: lit when the pulse is ready.
  for (let y = Y0 - 4; y <= Y0 - 1; y++) set(7, y, 'm');
  set(7, Y0 - 5, pulse === 'ready' ? 'X' : pulse === 'beat' ? 'Z' : 'x');

  // Ore hopper behind the cab; it heaps up as the cargo bay fills.
  for (const y of [Y0 - 2, Y0 - 1]) {
    set(1, y, 'M');
    set(5, y, 'M');
    for (let x = 2; x <= 4; x++) set(x, y, 'e');
  }
  const slots = [[2, Y0 - 1], [3, Y0 - 1], [4, Y0 - 1], [2, Y0 - 2], [3, Y0 - 2], [4, Y0 - 2], [3, Y0 - 3], [2, Y0 - 3], [4, Y0 - 3]];
  cargo.slice(0, slots.length).forEach((col, i) => set(slots[i][0], slots[i][1], col));
  if (heart) set(3, Y0 - 3, 'H');

  // Wear and tear.
  if (damage >= 1) {
    set(3, Y0 + 1, 'D');
    set(10, Y0 + 2, 'D');
    set(7, Y0 + 4, 'D');
  }
  if (damage >= 2) {
    set(5, Y0 + 1, 'D');
    set(2, Y0 + 5, 'D');
    set(9, Y0 - 3, 'w'); // cracked canopy
    set(8, Y0 - 2, 'w');
  }

  // Outline every edge against open space, then add the exhaust pipe.
  const out = g.map((row) => row.slice());
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (g[y][x]) continue;
      const near = (y > 0 && g[y - 1][x]) || (y < N - 1 && g[y + 1][x]) || (x > 0 && g[y][x - 1]) || (x < N - 1 && g[y][x + 1]);
      if (near) out[y][x] = 'k';
    }
  }
  out[Y0 + 1][0] = 'M';
  if (flash) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (out[y][x] && out[y][x] !== 'k') out[y][x] = 'w';
  }
  return out;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function paintGrid(grid) {
  const c = makeCanvas(RIG_TEXELS * TX, RIG_TEXELS * TX);
  const g = c.getContext('2d');
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const v = grid[y][x];
      if (!v) continue;
      g.fillStyle = RIG_PALETTE[v] || v;
      g.fillRect(x * TX, y * TX, TX, TX);
    }
  }
  return c;
}

const cache = new Map();

/** The painted body for a visual state, cached (states repeat constantly). */
export function rigBodyCanvas(state) {
  const key = JSON.stringify(state);
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 160) cache.clear();
    c = paintGrid(buildRigGrid(state));
    cache.set(key, c);
  }
  return c;
}

/** Drill half-heights from base to tip. */
function drillProfile(len) {
  return Array.from({ length: len }, (_, i) => (len === 1 ? 0 : Math.round(3 * (1 - i / (len - 1)))));
}

/** Where the drill sits in sprite texels for each facing (before mirroring). */
function drillMap(facing, bob) {
  if (facing === 'up') return (u, v) => [10 + v, bob - u]; // on the canopy roof
  if (facing === 'down') return (u, v) => [8 + v, 15 + u]; // under the belly
  return (u, v) => [14 + u, 10 + bob + v]; // on the nose
}

/**
 * Draw the drill in sprite space (texel units, facing right before mirroring).
 * facing: 'side' | 'up' | 'down' · len: cone length in texels · spin: animation step
 */
export function drawDrill(ctx, facing, drillLevel, spin, len, bob) {
  const [light, dark] = DRILL_COLORS[Math.max(0, Math.min(DRILL_COLORS.length, drillLevel) - 1)];
  const map = drillMap(facing, bob);
  const px = (u, v, color) => {
    const [x, y] = map(u, v);
    ctx.fillStyle = color;
    ctx.fillRect(x * TX, y * TX, TX, TX);
  };
  const prof = drillProfile(len);
  for (let u = 1; u <= len; u++) {
    const h = prof[u - 1];
    px(u, -h - 1, RIG_PALETTE.k);
    px(u, h + 1, RIG_PALETTE.k);
  }
  px(len + 1, 0, RIG_PALETTE.k);
  for (let v = -3; v <= 3; v++) px(0, v, Math.abs(v) === 3 ? RIG_PALETTE.k : Math.abs(v) === 2 ? RIG_PALETTE.M : RIG_PALETTE.m);
  for (let u = 1; u <= len; u++) {
    const h = prof[u - 1];
    for (let v = -h; v <= h; v++) {
      const band = (((u + v + spin) % 3) + 3) % 3 === 0;
      let col = band ? dark : light;
      if (u === len) col = drillLevel >= 5 ? '#ffffff' : light;
      else if (v === -h && !band) col = '#ffffff'; // a hard highlight along the top edge
      px(u, v, col);
    }
  }
}

/** Pixel thruster flames under the nozzles, flickering a little every frame. */
export function drawFlames(ctx, thrusterLevel, rand = Math.random) {
  const hot = thrusterLevel >= 3;
  const cols = hot
    ? ['#ffffff', '#d4f3ff', '#7fc8ff', '#ffb347', '#ff6a2a']
    : ['#ffffff', '#fff1a0', '#ffb347', '#ff6a2a', '#c43a1a'];
  for (const nx of [3, 11]) {
    const len = 3 + Math.floor(rand() * 3) + (hot ? 1 : 0);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = cols[3];
    ctx.fillRect((nx - 1) * TX, 15 * TX, 4 * TX, Math.ceil(len * 0.6) * TX); // soft outer glow
    ctx.globalAlpha = 1;
    for (let i = 0; i < len; i++) {
      const col = cols[Math.min(cols.length - 1, Math.floor((i * cols.length) / len))];
      const wide = i < Math.ceil(len / 2);
      ctx.fillStyle = col;
      ctx.fillRect((nx + (wide ? 0 : rand() < 0.5 ? 0 : 1)) * TX, (15 + i) * TX, (wide ? 2 : 1) * TX, TX);
    }
  }
}

/** A ring of pixels around the rig for the deflector shield. */
export function drawShieldRing(ctx, t, strength, hit) {
  const n = 28;
  const r = 21;
  ctx.fillStyle = RIG_PALETTE.c;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 0.6;
    const wave = 0.5 + 0.5 * Math.sin(a * 3 - t * 4);
    ctx.globalAlpha = Math.min(1, (hit ? 0.75 : 0.08 + 0.14 * wave) * strength);
    const x = Math.round(Math.cos(a) * r / TX) * TX;
    const y = Math.round(Math.sin(a) * r / TX) * TX;
    ctx.fillRect(x - 1, y - 1, TX, TX);
  }
  ctx.globalAlpha = 1;
}

/** The rig on the outpost's preview pad: idle, drill out, showing its upgrades. */
export function drawRigPreview(canvas, levels, t) {
  const W = 23;
  const H = 18;
  if (canvas.width !== W * TX || canvas.height !== H * TX) {
    canvas.width = W * TX;
    canvas.height = H * TX;
  }
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.save();
  g.translate(TX, TX);
  const bob = t % 1.4 < 0.18 ? 1 : 0;
  const frame = Math.floor(t * 3) % 12;
  const pulse = Math.floor(t * 2) % 2 ? 'beat' : 'ready';
  g.drawImage(rigBodyCanvas({ frame, bob, levels, cargo: [], heart: false, pulse, damage: 0, look: 0, flash: false }), 0, 0);
  drawDrill(g, 'side', levels.drill || 1, Math.floor(t * 6) % 3, (levels.drill || 1) >= 4 ? 5 : 4, bob);
  g.restore();
}
