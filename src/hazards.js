import { T, SURFACE_Y, BEDROCK_DEPTH, STABLE_ROWS, LAYERS } from './config.js';

const BOULDER_STEP = 0.09;
const LAVA_STEP = 0.3;
const WOBBLE_TIME = 0.65;

/**
 * One tick of lava flow between rows y0..y1. Lava falls into open space and
 * spills diagonally over ledges; it never duplicates, it only moves.
 */
export function stepLava(world, y0, y1, rng) {
  const W = world.w;
  const moved = new Set();
  for (let y = y1; y >= y0; y--) {
    const ltr = rng.chance(0.5);
    for (let k = 1; k < W - 1; k++) {
      const x = ltr ? k : W - 1 - k;
      const i = y * W + x;
      if (world.tiles[i] !== T.LAVA || moved.has(i)) continue;
      if (world.get(x, y + 1) === T.AIR) {
        world.tiles[i] = T.AIR;
        world.set(x, y + 1, T.LAVA);
        moved.add(i + W);
        continue;
      }
      const d = rng.sign();
      for (const dx of [d, -d]) {
        if (world.get(x + dx, y) === T.AIR && world.get(x + dx, y + 1) === T.AIR) {
          world.tiles[i] = T.AIR;
          world.set(x + dx, y, T.LAVA);
          moved.add(i + dx);
          break;
        }
      }
    }
  }
}

/** Falling boulders and flowing lava near the rig. */
export class Physics {
  constructor(dive) {
    this.dive = dive;
    this.wobble = new Map(); // tile index -> { t, falling }
    this.bAcc = 0;
    this.lAcc = 0;
  }

  window() {
    const { world, rig } = this.dive;
    return [Math.max(SURFACE_Y, rig.y - 26), Math.min(world.h - 2, rig.y + 26)];
  }

  update(dt) {
    this.bAcc += dt;
    this.lAcc += dt;
    while (this.bAcc >= BOULDER_STEP) {
      this.bAcc -= BOULDER_STEP;
      this.stepBoulders();
    }
    while (this.lAcc >= LAVA_STEP) {
      this.lAcc -= LAVA_STEP;
      const [y0, y1] = this.window();
      stepLava(this.dive.world, y0, y1, this.dive.rng);
    }
  }

  clearRows(y0, y1) {
    const W = this.dive.world.w;
    for (const k of [...this.wobble.keys()]) {
      const y = Math.floor(k / W);
      if (y >= y0 && y <= y1) this.wobble.delete(k);
    }
  }

  isWobbling(x, y) {
    const st = this.wobble.get(this.dive.world.idx(x, y));
    return !!st && !st.falling;
  }

  stepBoulders() {
    const d = this.dive;
    const { world, rig } = d;
    const [y0, y1] = this.window();
    for (let y = y1; y >= y0; y--) {
      for (let x = 1; x < world.w - 1; x++) {
        if (world.get(x, y) !== T.BOULDER) continue;
        const i = world.idx(x, y);
        const st = this.wobble.get(i);
        if (world.get(x, y + 1) !== T.AIR) {
          if (st) {
            this.wobble.delete(i);
            if (st.falling) d.emit('boulderLand', { x, y });
          }
          continue;
        }
        if (!st) {
          // Loose rock only lets go once the rig is close enough to disturb it.
          const near = Math.abs(rig.x - x) <= 3 && rig.y - y >= -1 && rig.y - y <= 8;
          if (near) {
            this.wobble.set(i, { t: 0, falling: false });
            d.emit('boulderWobble', { x, y });
          }
          continue;
        }
        st.t += BOULDER_STEP;
        if (!st.falling && st.t < WOBBLE_TIME) continue;
        if (rig.x === x && rig.y === y + 1) {
          rig.damage(24, d, { source: 'Falling boulder' });
          world.set(x, y, T.AIR);
          this.wobble.delete(i);
          d.emit('boulderSmash', { x, y: y + 1 });
          continue;
        }
        const e = d.enemyAt(x, y + 1);
        if (e) {
          d.hurtEnemy(e, 45, 0, 0);
          world.set(x, y, T.AIR);
          this.wobble.delete(i);
          d.emit('boulderSmash', { x, y: y + 1 });
          continue;
        }
        world.set(x, y, T.AIR);
        world.set(x, y + 1, T.BOULDER);
        this.wobble.delete(i);
        this.wobble.set(world.idx(x, y + 1), { t: WOBBLE_TIME, falling: true });
      }
    }
  }
}

/** Seismic shifts: a band of strata slides sideways, rearranging tunnels and ore. */
export class Tremors {
  constructor(dive) {
    this.dive = dive;
    this.timer = 20;
    this.warning = null;
  }

  interval() {
    const d = this.dive;
    if (d.mod.tremor === 0) return null;
    if (d.heartTaken) return [8, 12];
    if (d.rig.depth < 6) return null;
    const L = LAYERS[d.world.layerIndex(d.rig.y)];
    if (!L.tremor) return null;
    return [L.tremor[0] / d.mod.tremor, L.tremor[1] / d.mod.tremor];
  }

  update(dt) {
    if (this.warning) {
      this.warning.t -= dt;
      if (this.warning.t <= 0) {
        const w = this.warning;
        this.warning = null;
        this.execute(w);
      }
      return;
    }
    const iv = this.interval();
    if (!iv) return;
    if (this.timer > iv[1]) this.timer = this.dive.rng.range(iv[0], iv[1]);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.dive.rng.range(iv[0], iv[1]);
      this.plan();
    }
  }

  /** Pick a band, biased above the rig so the route home is what moves. */
  plan() {
    const d = this.dive;
    const { rng, rig } = d;
    const h = rng.int(3, 6);
    const minY = SURFACE_Y + STABLE_ROWS.minDepth;
    const maxY = SURFACE_Y + BEDROCK_DEPTH - 1;
    let y0 = rig.y + rng.int(-13, 3);
    y0 = Math.max(minY, Math.min(maxY - h + 1, y0));
    let y1 = y0 + h - 1;
    const cTop = SURFACE_Y + STABLE_ROWS.chamberFrom;
    const cBot = SURFACE_Y + STABLE_ROWS.chamberTo;
    if (y1 >= cTop && y0 <= cBot) {
      y1 = cTop - 1;
      y0 = y1 - h + 1;
    }
    const dx = rng.sign() * rng.int(2, 6);
    this.warning = { y0, y1, dx, t: 2.6, total: 2.6 };
    d.emit('tremorWarning', { y0, y1, dx });
  }

  execute(w) {
    const d = this.dive;
    const { world, rig, rng } = d;
    const inBand = (y) => y >= w.y0 && y <= w.y1;
    const wrapF = (x) => {
      const n = world.w - 2;
      return 1 + ((((x - 1) % n) + n) % n);
    };
    world.shiftBand(w.y0, w.y1, w.dx);
    if (inBand(rig.y) || inBand(rig.fromY)) {
      if (inBand(rig.y)) rig.x = world.wrapX(rig.x + w.dx);
      rig.fromX = rig.x;
      rig.fromY = rig.y;
      rig.moveT = 1;
      rig.action = null;
    } else if (rig.action && rig.action.type === 'drill' && inBand(rig.action.ty)) {
      rig.action = null;
    }
    for (const e of d.enemies) {
      if (!inBand(e.y)) continue;
      e.x = world.wrapX(e.x + w.dx);
      e.fx = e.x;
      e.fy = e.y;
      e.moveT = 1;
    }
    for (const p of d.projectiles) if (inBand(Math.floor(p.y))) p.x = wrapF(p.x + w.dx);
    for (const c of d.clouds) if (inBand(Math.floor(c.y))) c.x = wrapF(c.x + w.dx);
    for (const c of d.charges) if (inBand(c.y)) c.x = world.wrapX(c.x + w.dx);
    d.physics.clearRows(w.y0, w.y1 + 1);
    d.buildOccupancy();
    // The slide crushes some open space into rubble.
    for (let y = w.y0; y <= w.y1; y++) {
      for (let x = 1; x < world.w - 1; x++) {
        if (world.get(x, y) !== T.AIR || (rig.x === x && rig.y === y) || d.enemyAt(x, y)) continue;
        if (rng.chance(0.07)) world.set(x, y, T.RUBBLE);
      }
    }
    d.emit('tremor', { y0: w.y0, y1: w.y1, dx: w.dx });
  }
}

export function cloudRadius(c) {
  const grow = Math.min(1, c.t / 1.2);
  const fade = c.t > c.life - 2 ? Math.max(0.25, (c.life - c.t) / 2) : 1;
  return c.rMax * grow * fade;
}

export function updateClouds(dive, dt) {
  if (!dive.clouds.length) return;
  for (const c of dive.clouds) c.t += dt;
  dive.clouds = dive.clouds.filter((c) => c.t < c.life);
}
