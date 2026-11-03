import {
  T, TILES, LAYERS, ITEMS, ENEMIES, WORLD_W, WORLD_H, SURFACE_Y, BEDROCK_DEPTH, CORE_CHAMBER,
  BASE_ROCKS, MODIFIER_DEFAULTS, layerIndexForDepth,
} from './config.js';
import { RNG, valueNoise2D, fbm } from './rng.js';
import { World } from './world.js';
import { stepLava } from './hazards.js';
import { validSpawn } from './enemies.js';

const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function pickByValue(entries, n) {
  let acc = 0;
  for (const [v, w] of entries) {
    acc += w;
    if (n < acc) return v;
  }
  return entries[entries.length - 1][0];
}

/** Rows (absolute y) a layer occupies, clipped to the playable interior. */
function layerRows(L, minDepth = 0) {
  const top = SURFACE_Y + Math.max(L.from, minDepth);
  const bottom = SURFACE_Y + Math.min(L.to, BEDROCK_DEPTH) - 1;
  return [top, bottom];
}

/**
 * Build a fresh dive site. The same seed and modifier always produce the same world.
 * Returns { world, enemies: [{type, x, y}], spawn: {x, y}, chamber }.
 */
export function generateWorld(seed, modifier = MODIFIER_DEFAULTS, { heart = true } = {}) {
  const m = { ...MODIFIER_DEFAULTS, ...modifier };
  const rng = new RNG(seed);
  const world = new World(WORLD_W, WORLD_H);
  world.seed = seed;
  const W = WORLD_W;
  const H = WORLD_H;
  const floorY = SURFACE_Y + BEDROCK_DEPTH;
  const rockNoise = valueNoise2D(seed ^ 0x51ed27);
  const caveNoise = valueNoise2D(seed ^ 0x1b873593);
  const jitterNoise = valueNoise2D(seed ^ 0x2545f491);
  const lavaNoise = valueNoise2D(seed ^ 0x68e31da4);

  for (let y = 0; y < H; y++) world.rowLayer[y] = y < SURFACE_Y ? 0 : layerIndexForDepth(y - SURFACE_Y);

  // 1. Base strata. Layer boundaries are jittered so the bands interleave.
  for (let y = SURFACE_Y; y < H; y++) {
    const depth = y - SURFACE_Y;
    for (let x = 0; x < W; x++) {
      if (x === 0 || x === W - 1 || y >= floorY) {
        world.set(x, y, T.BEDROCK);
        continue;
      }
      const j = (jitterNoise(x * 0.31, y * 0.31) - 0.5) * 10;
      const li = layerIndexForDepth(Math.max(0, depth + j));
      const L = LAYERS[li];
      const n = rockNoise(x / 4.2 + li * 13.7, y / 4.2);
      world.set(x, y, pickByValue(L.rocks, n));
    }
  }

  // 2. Caves: each layer carves its own fraction of open space (quantile threshold).
  LAYERS.forEach((L, li) => {
    const [top, bottom] = layerRows(L, 5);
    if (bottom < top) return;
    const vals = new Float32Array((bottom - top + 1) * (W - 2));
    let k = 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = 1; x < W - 1; x++) vals[k++] = fbm(caveNoise, x / L.caveScale + li * 50, y / (L.caveScale * 0.75), 3);
    }
    const sorted = Float32Array.from(vals).sort();
    const thr = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (1 - L.caveFraction)))];
    k = 0;
    for (let y = top; y <= bottom; y++) {
      for (let x = 1; x < W - 1; x++) if (vals[k++] > thr) world.set(x, y, T.AIR);
    }
  });

  // 3. Lava pools settle on cavern floors in the hot layers (at most two deep).
  LAYERS.forEach((L) => {
    if (!L.lava) return;
    const [top, bottom] = layerRows(L, 5);
    for (let y = bottom; y >= top; y--) {
      for (let x = 1; x < W - 1; x++) {
        if (world.get(x, y) !== T.AIR) continue;
        const below = world.get(x, y + 1);
        if (below === T.AIR) continue;
        if (below === T.LAVA && world.get(x, y + 2) === T.LAVA) continue;
        if (lavaNoise(x / 5, y / 5) > L.lava) world.set(x, y, T.LAVA);
      }
    }
  });

  // 4. Ore veins: short random walks through base rock.
  LAYERS.forEach((L) => {
    const [top, bottom] = layerRows(L, 2);
    if (bottom < top) return;
    const rows = bottom - top + 1;
    for (const [tile, weight] of L.ores) {
      const item = ITEMS[TILES[tile].ore];
      const veins = Math.round(weight * rows * 0.05 * m.ore);
      for (let v = 0; v < veins; v++) {
        let x = rng.int(1, W - 2);
        let y = rng.int(top, bottom);
        const size = rng.int(item.vein[0], item.vein[1]);
        let placed = 0;
        for (let s = 0; s < size * 3 && placed < size; s++) {
          if (BASE_ROCKS.has(world.get(x, y))) {
            world.set(x, y, tile);
            placed++;
          }
          const [dx, dy] = rng.pick(DIR4);
          x = Math.min(W - 2, Math.max(1, x + dx));
          y = Math.min(bottom, Math.max(top, y + dy));
        }
      }
    }
  });

  // 5. Special tiles: gas and spore pockets, air caches, salvage, loose boulders.
  for (let y = SURFACE_Y + 3; y < floorY; y++) {
    const L = LAYERS[world.rowLayer[y]];
    for (let x = 1; x < W - 1; x++) {
      const t = world.get(x, y);
      if (t === T.AIR) {
        if (BASE_ROCKS.has(world.get(x, y + 1)) && world.get(x, y - 1) === T.AIR && rng.chance(L.crate * 6 * m.crates)) {
          world.set(x, y, T.CRATE);
        }
        continue;
      }
      if (!BASE_ROCKS.has(t)) continue;
      const airBelow = world.get(x, y + 1) === T.AIR;
      const exposed = airBelow || world.get(x, y - 1) === T.AIR || world.get(x - 1, y) === T.AIR || world.get(x + 1, y) === T.AIR;
      if (L.spore && exposed && rng.chance(L.spore)) world.set(x, y, T.SPOREPOD);
      else if (rng.chance(L.gas * m.gas)) world.set(x, y, T.GAS);
      else if (rng.chance(L.airpocket * m.air)) world.set(x, y, T.AIRPOCKET);
      else if (rng.chance(L.crate * m.crates)) world.set(x, y, T.CRATE);
      else if (rng.chance(airBelow ? L.boulder * 6 : L.boulder)) world.set(x, y, T.BOULDER);
    }
  }

  // 6. The surface: a clean crust of soil to break ground on.
  for (let x = 1; x < W - 1; x++) {
    world.set(x, SURFACE_Y, T.DIRT);
    for (let d = 1; d <= 2; d++) {
      if (!BASE_ROCKS.has(world.get(x, SURFACE_Y + d)) && !TILES[world.get(x, SURFACE_Y + d)].ore) {
        world.set(x, SURFACE_Y + d, T.DIRT);
      }
    }
  }

  // 7. Let lava find its level before anyone arrives.
  for (let i = 0; i < 60; i++) stepLava(world, SURFACE_Y, floorY - 1, rng);

  // 8. The Core chamber, with the Heart of the Deep on its pedestal.
  const chamber = carveChamber(world, rng, heart);

  // 9. Hostiles.
  const enemies = [];
  const taken = new Set();
  const place = (type, x, y) => {
    enemies.push({ type, x, y });
    taken.add(world.idx(x, y));
  };
  LAYERS.forEach((L) => {
    const [top, bottom] = layerRows(L, 14);
    if (bottom <= top) return;
    const count = Math.round(L.enemyDensity * (bottom - top + 1) * (W - 2) * m.enemies);
    for (let i = 0; i < count; i++) {
      const type = rng.weighted(L.enemies);
      const def = ENEMIES[type];
      for (let tries = 0; tries < 40; tries++) {
        const x = rng.int(1, W - 2);
        const y = rng.int(top, bottom);
        if (taken.has(world.idx(x, y)) || !validSpawn(def.mode, world, x, y)) continue;
        place(type, x, y);
        if (def.pack) {
          const extra = rng.int(def.pack[0], def.pack[1]) - 1;
          for (let p = 0, t2 = 0; p < extra && t2 < 20; t2++) {
            const px = x + rng.int(-2, 2);
            const py = y + rng.int(-2, 2);
            if (px < 1 || px > W - 2 || taken.has(world.idx(px, py)) || !validSpawn(def.mode, world, px, py)) continue;
            place(type, px, py);
            p++;
          }
        }
        break;
      }
    }
  });
  if (heart) {
    for (const ox of [-6, 6]) {
      const x = chamber.cx + ox;
      const y = chamber.cy;
      if (world.get(x, y) === T.AIR && !taken.has(world.idx(x, y))) place('warden', x, y);
    }
  }

  return { world, enemies, spawn: { x: W >> 1, y: SURFACE_Y - 1 }, chamber };
}

function carveChamber(world, rng, heart) {
  const W = world.w;
  const cx = W >> 1;
  const cy = SURFACE_Y + CORE_CHAMBER.depth;
  const { rx, ry } = CORE_CHAMBER;
  const span = Math.ceil(ry * 1.9);
  for (let y = cy - span; y <= cy + span; y++) {
    for (let x = 1; x < W - 1; x++) {
      const dx = (x + 0.5 - W / 2) / rx;
      const dy = (y - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      const t = world.get(x, y);
      if (d <= 1) world.set(x, y, T.AIR);
      else if (t === T.LAVA && d <= 1.8) world.set(x, y, T.VOIDSTONE); // a stable shell, no lava pouring in
      else if (d <= 1.35 && BASE_ROCKS.has(t)) {
        if (rng.chance(0.16)) world.set(x, y, T.CORESHARD);
        else if (rng.chance(0.1)) world.set(x, y, T.VOIDGLASS);
      }
    }
  }
  // Seal off any lava above or around the chamber so it can never pour onto the Heart.
  for (let y = cy - span - 16; y <= cy + span; y++) {
    for (let x = 1; x < W - 1; x++) if (world.get(x, y) === T.LAVA) world.set(x, y, T.VOIDSTONE);
  }
  // Pedestal sits on the chamber floor directly below the centre.
  let floor = cy;
  while (world.get(cx, floor + 1) === T.AIR && floor < cy + span) floor++;
  for (let x = cx - 1; x <= cx + 1; x++) world.set(x, floor + 1, T.PEDESTAL);
  if (heart) {
    world.set(cx, floor, T.HEART);
  } else {
    // Once the Heart is home, the chamber offers a coreshard cache instead.
    for (const [x, y] of [[cx, floor], [cx - 1, floor], [cx + 1, floor]]) world.set(x, y, T.CORESHARD);
  }
  return { cx, cy, floor };
}
