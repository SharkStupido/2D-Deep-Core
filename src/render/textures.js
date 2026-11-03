// Procedural pixel-art textures, generated once at startup. No image assets needed.
import { TILE, T, LAYERS } from '../config.js';
import { RNG } from '../rng.js';

export const VARIANTS = 4;
const P = 2; // texel size in pixels
const N = TILE / P; // texels per side

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighten (amt > 0) or darken (amt < 0) a hex colour. */
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function grid(fill = 0) {
  return Array.from({ length: N }, () => new Array(N).fill(fill));
}

function paint(tone, over, base) {
  const c = makeCanvas(TILE, TILE);
  const g = c.getContext('2d');
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const o = over && over[j][i];
      if (o === null || o === undefined) {
        if (tone === null) continue;
        g.fillStyle = shade(base, Math.max(-0.9, Math.min(0.9, tone[j][i])));
      } else {
        g.fillStyle = o;
      }
      g.fillRect(i * P, j * P, P, P);
    }
  }
  return c;
}

const ROCK_STYLES = {
  [T.DIRT]: { base: '#6b4a2f', noise: 0.12, pebbles: [3, 5], pebbleTone: 0.16 },
  [T.STONE]: { base: '#6c6864', noise: 0.08, pebbles: [3, 4], pebbleTone: 0.14, cracks: 1 },
  [T.SHALE]: { base: '#4a525e', noise: 0.06, strata: true, pebbles: [1, 2], pebbleTone: 0.08 },
  [T.MOSSROCK]: { base: '#3d4a3a', noise: 0.09, pebbles: [2, 3], pebbleTone: 0.1, moss: '#6fbf5a' },
  [T.HOTROCK]: { base: '#4e2a20', noise: 0.08, pebbles: [2, 3], pebbleTone: 0.1, embers: '#c8501c' },
  [T.CRYSTALROCK]: { base: '#33386a', noise: 0.07, facets: '#8fc8ff' },
  [T.VOIDSTONE]: { base: '#22182e', noise: 0.06, stars: '#c08aff', cracks: 1 },
  [T.RUBBLE]: { base: '#57493f', noise: 0.2, pebbles: [5, 7], pebbleTone: 0.22 },
  [T.BEDROCK]: { base: '#17141c', noise: 0.06, hatch: true },
  [T.PEDESTAL]: { base: '#3a3226', noise: 0.05, runes: '#ffcc66' },
};

function rockTexture(rng, style) {
  const tone = grid(0);
  const over = grid(null);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      tone[j][i] = (rng.float() - 0.5) * style.noise;
    }
  }
  // Coarse blotches for large-scale variation.
  for (let bj = 0; bj < N; bj += 4) {
    for (let bi = 0; bi < N; bi += 4) {
      const v = (rng.float() - 0.5) * style.noise * 0.8;
      for (let j = bj; j < bj + 4; j++) for (let i = bi; i < bi + 4; i++) tone[j][i] += v;
    }
  }
  if (style.pebbles) {
    const count = rng.int(style.pebbles[0], style.pebbles[1]);
    for (let p = 0; p < count; p++) {
      const cx = rng.range(1, N - 1);
      const cy = rng.range(1, N - 1);
      const rx = rng.range(1.2, 2.8);
      const ry = rng.range(0.9, 2.0);
      const s = rng.chance(0.65) ? 1 : -1;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const dx = (i + 0.5 - cx) / rx;
          const dy = (j + 0.5 - cy) / ry;
          const d = dx * dx + dy * dy;
          if (d > 1) continue;
          tone[j][i] += style.pebbleTone * s;
          if (dy < -0.45) tone[j][i] += 0.1;
          if (dy > 0.5) tone[j][i] -= 0.14;
        }
      }
    }
  }
  if (style.strata) {
    const off = rng.int(0, 4);
    for (let j = 0; j < N; j++) {
      const k = (j + off) % 5;
      for (let i = 0; i < N; i++) {
        if (k === 0) tone[j][i] -= 0.16;
        else if (k === 1) tone[j][i] += 0.07;
      }
    }
  }
  const crack = (len, fn) => {
    let x = rng.int(0, N - 1);
    let y = rng.int(0, N - 1);
    for (let s = 0; s < len; s++) {
      fn(x, y);
      x = Math.max(0, Math.min(N - 1, x + rng.int(-1, 1)));
      y = Math.max(0, Math.min(N - 1, y + (rng.chance(0.7) ? 1 : 0)));
    }
  };
  for (let c = 0; c < (style.cracks || 0); c++) crack(rng.int(4, 8), (x, y) => { tone[y][x] -= 0.28; });
  if (style.embers) {
    crack(rng.int(3, 6), (x, y) => { over[y][x] = rng.chance(0.25) ? '#ff9a3a' : style.embers; });
  }
  if (style.moss) {
    for (let c = 0; c < rng.int(3, 6); c++) {
      const x = rng.int(0, N - 2);
      const y = rng.int(0, N - 2);
      over[y][x] = style.moss;
      if (rng.chance(0.6)) over[y][x + 1] = shade(style.moss, -0.25);
      if (rng.chance(0.4)) over[y + 1][x] = shade(style.moss, -0.35);
    }
  }
  if (style.facets) {
    for (let c = 0; c < rng.int(2, 4); c++) {
      const x = rng.int(1, N - 3);
      const y = rng.int(1, N - 4);
      over[y][x] = '#dff2ff';
      over[y + 1][x] = style.facets;
      over[y + 1][x + 1] = shade(style.facets, -0.3);
      over[y + 2][x] = shade(style.facets, -0.45);
    }
  }
  if (style.stars) {
    for (let c = 0; c < rng.int(3, 6); c++) over[rng.int(0, N - 1)][rng.int(0, N - 1)] = rng.chance(0.5) ? style.stars : '#5a3d78';
  }
  if (style.hatch) {
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if ((i + j) % 6 === 0) tone[j][i] -= 0.35;
  }
  if (style.runes) {
    for (let i = 1; i < N - 1; i++) over[2][i] = shade(style.runes, -0.3);
    for (let i = 1; i < N - 1; i++) over[N - 3][i] = shade(style.runes, -0.3);
    for (let k = 0; k < 3; k++) {
      const x = 3 + k * 4 + rng.int(0, 1);
      for (let j = 5; j < N - 5; j++) if (rng.chance(0.7)) over[j][x] = style.runes;
    }
  }
  return paint(tone, over, style.base);
}

function gem(over, cx, cy, s, color) {
  const hi = shade(color, 0.45);
  const lo = shade(color, -0.35);
  for (let j = -s - 1; j <= s + 1; j++) {
    for (let i = -s - 1; i <= s + 1; i++) {
      const x = cx + i;
      const y = cy + j;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const d = Math.abs(i) + Math.abs(j);
      if (d === s + 1) {
        if (over[y][x] === null) over[y][x] = 'rgba(0,0,0,0.45)';
      } else if (d <= s) {
        over[y][x] = i + j < 0 ? hi : i + j > 0 ? lo : color;
      }
    }
  }
  if (s >= 2) over[cy - 1][cx - 1] = '#ffffff';
}

function oreOverlay(rng, color, count = [3, 5], size = [1, 2]) {
  const over = grid(null);
  const n = rng.int(count[0], count[1]);
  for (let k = 0; k < n; k++) {
    const s = rng.int(size[0], size[1]);
    gem(over, rng.int(s + 1, N - s - 2), rng.int(s + 1, N - s - 2), s, color);
  }
  return paint(null, over, '#000');
}

function bubbleOverlay(rng, fill, rim, count) {
  const c = makeCanvas(TILE, TILE);
  const g = c.getContext('2d');
  for (let k = 0; k < count; k++) {
    const r = rng.range(3, 6);
    const x = rng.range(r + 2, TILE - r - 2);
    const y = rng.range(r + 2, TILE - r - 2);
    g.fillStyle = fill;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = rim;
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillRect(Math.round(x - r * 0.45), Math.round(y - r * 0.55), 2, 2);
  }
  return c;
}

function gasOverlay(rng) {
  const over = grid(null);
  for (let c = 0; c < 3; c++) {
    let x = rng.int(2, N - 3);
    let y = rng.int(2, N - 3);
    for (let s = 0; s < 6; s++) {
      over[y][x] = rng.chance(0.5) ? 'rgba(190,120,255,0.7)' : 'rgba(120,70,190,0.7)';
      x = Math.max(0, Math.min(N - 1, x + rng.int(-1, 1)));
      y = Math.max(0, Math.min(N - 1, y + rng.int(-1, 1)));
    }
  }
  return paint(null, over, '#000');
}

function sporeOverlay(rng) {
  const c = makeCanvas(TILE, TILE);
  const g = c.getContext('2d');
  for (let k = 0; k < 3; k++) {
    const r = rng.range(4, 7);
    const x = rng.range(r + 1, TILE - r - 1);
    const y = rng.range(r + 1, TILE - r - 1);
    g.fillStyle = '#b4489a';
    g.beginPath();
    g.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e07cc8';
    g.beginPath();
    g.ellipse(x - r * 0.25, y - r * 0.3, r * 0.5, r * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffd3f3';
    g.fillRect(Math.round(x - r * 0.4), Math.round(y - r * 0.5), 2, 2);
    g.fillRect(Math.round(x + r * 0.2), Math.round(y + r * 0.1), 2, 2);
  }
  return c;
}

function boulderTexture(rng) {
  const tone = grid(0);
  const over = grid(null);
  const cx = N / 2 + rng.range(-0.5, 0.5);
  const cy = N / 2 + 0.5;
  const r = 6.6 + rng.range(-0.4, 0.4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dx = i + 0.5 - cx;
      const dy = j + 0.5 - cy;
      const wob = 1 + 0.08 * Math.sin(Math.atan2(dy, dx) * 5 + rng.float());
      const d = Math.hypot(dx, dy) / (r * wob);
      if (d > 1.08) over[j][i] = 'rgba(0,0,0,0)';
      else if (d > 0.94) over[j][i] = '#2a2420';
      else tone[j][i] = (rng.float() - 0.5) * 0.12 - dy / r * 0.22 - dx / r * 0.06;
    }
  }
  const c = paint(tone, over, '#7a7066');
  return c;
}

function crateTexture(rng) {
  const c = makeCanvas(TILE, TILE);
  const g = c.getContext('2d');
  const wood = rng.chance(0.5);
  const body = wood ? '#8a5a2b' : '#5d6a76';
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(4, 26, 26, 4);
  g.fillStyle = body;
  g.fillRect(3, 7, 26, 21);
  g.fillStyle = shade(body, 0.2);
  g.fillRect(3, 7, 26, 3);
  g.fillStyle = shade(body, -0.35);
  g.fillRect(3, 25, 26, 3);
  g.fillStyle = wood ? '#5a3a1a' : '#39434d';
  g.fillRect(3, 15, 26, 3);
  g.fillRect(14, 7, 4, 21);
  g.fillStyle = '#ffc94a';
  for (let k = 0; k < 4; k++) g.fillRect(5 + k * 6, 11, 3, 2);
  g.fillStyle = '#d8dde2';
  for (const [x, y] of [[5, 9], [25, 9], [5, 24], [25, 24]]) g.fillRect(x, y, 2, 2);
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 1;
  g.strokeRect(3.5, 7.5, 25, 20);
  return c;
}

function backwallTexture(rng, base) {
  const tone = grid(0);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) tone[j][i] = (rng.float() - 0.5) * 0.12 + ((i * 7 + j * 3) % 11 === 0 ? -0.15 : 0);
  }
  for (let c = 0; c < 2; c++) {
    const x = rng.int(0, N - 1);
    for (let j = rng.int(0, 6); j < N; j += 1) if (rng.chance(0.8)) tone[j][x] -= 0.12;
  }
  return paint(tone, null, base);
}

const ORE_COLORS = {
  [T.COPPER]: ['#e08a4a', [3, 4], [1, 2]],
  [T.IRON]: ['#d0a088', [3, 4], [1, 2]],
  [T.SILVER]: ['#e6edf5', [3, 4], [1, 2]],
  [T.GOLD]: ['#ffd23f', [2, 4], [1, 2]],
  [T.LUMENITE]: ['#6bff9e', [2, 3], [1, 2]],
  [T.RUBY]: ['#ff3b5c', [2, 3], [1, 2]],
  [T.SAPPHIRE]: ['#4d8bff', [2, 3], [1, 2]],
  [T.DIAMOND]: ['#d4ffff', [2, 3], [1, 2]],
  [T.VOIDGLASS]: ['#b46bff', [2, 3], [2, 2]],
  [T.CORESHARD]: ['#ff9a1f', [2, 2], [2, 2]],
};

export function buildTextures() {
  const rng = new RNG(0xdeec0de);
  const tiles = {};
  for (const [id, style] of Object.entries(ROCK_STYLES)) {
    tiles[id] = Array.from({ length: VARIANTS }, () => rockTexture(rng, style));
  }
  const overlays = {};
  for (const [id, [color, count, size]] of Object.entries(ORE_COLORS)) {
    overlays[id] = Array.from({ length: VARIANTS }, () => oreOverlay(rng, color, count, size));
  }
  overlays[T.GAS] = Array.from({ length: VARIANTS }, () => gasOverlay(rng));
  overlays[T.SPOREPOD] = Array.from({ length: VARIANTS }, () => sporeOverlay(rng));
  overlays[T.AIRPOCKET] = Array.from({ length: VARIANTS }, () => bubbleOverlay(rng, 'rgba(120,210,255,0.55)', '#bdf0ff', 3));
  const objects = {
    [T.BOULDER]: Array.from({ length: VARIANTS }, () => boulderTexture(rng)),
    [T.CRATE]: Array.from({ length: VARIANTS }, () => crateTexture(rng)),
  };
  const backwalls = LAYERS.map((L) => Array.from({ length: VARIANTS }, () => backwallTexture(rng, L.back)));
  const hosts = LAYERS.map((L) => L.rocks[0][0]);
  return { tiles, overlays, objects, backwalls, hosts };
}
