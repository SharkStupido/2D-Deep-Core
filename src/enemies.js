import { T, TILES, ENEMIES, SURFACE_Y } from './config.js';

const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Can a creature of this movement mode start life on this tile? */
export function validSpawn(mode, world, x, y) {
  const t = world.get(x, y);
  switch (mode) {
    case 'fly': return t === T.AIR;
    case 'walk': return t === T.AIR && TILES[world.get(x, y + 1)].solid;
    case 'burrow':
    case 'phase': return t >= T.DIRT && t <= T.VOIDSTONE;
    default: return false;
  }
}

export class Enemy {
  constructor(type, x, y, rng) {
    this.type = type;
    this.def = ENEMIES[type];
    this.x = x;
    this.y = y;
    this.fx = x;
    this.fy = y;
    this.moveT = 1;
    this.moveDur = 0.2;
    this.hp = this.def.hp;
    this.cd = rng.range(0.2, 1.2);
    this.atkCd = 0.6;
    this.shootCd = rng.range(1, 3);
    this.flash = 0;
    this.lunge = 0;
    this.lungeDir = [0, 0];
    this.dead = false;
    this.aggro = false;
    this.phase = rng.float() * Math.PI * 2;
    this.faceX = rng.sign();
  }

  renderPos() {
    const k = this.moveT;
    return { x: this.fx + (this.x - this.fx) * k, y: this.fy + (this.y - this.fy) * k };
  }

  moveTo(dive, x, y, dur) {
    const W = dive.world.w;
    if (dive.occ.get(this.y * W + this.x) === this) dive.occ.delete(this.y * W + this.x);
    if (x !== this.x) this.faceX = Math.sign(x - this.x);
    this.fx = this.x;
    this.fy = this.y;
    this.x = x;
    this.y = y;
    this.moveT = 0;
    this.moveDur = Math.max(0.03, dur);
    dive.occ.set(y * W + x, this);
  }
}

export function canEnemyEnter(e, x, y, dive) {
  const { world, rig } = dive;
  if (x < 1 || x >= world.w - 1 || y < SURFACE_Y || y >= world.h) return false;
  if (rig.x === x && rig.y === y) return false;
  const o = dive.occ.get(y * world.w + x);
  if (o && o !== e) return false;
  const t = world.get(x, y);
  switch (e.def.mode) {
    case 'fly': return t === T.AIR;
    case 'walk': return t === T.AIR || (t === T.LAVA && !!e.def.lavaImmune);
    case 'burrow': {
      if (t === T.AIR) return true;
      const d = TILES[t];
      return d.drillable && !d.ore && !d.special && !d.object && d.hardness <= 4;
    }
    case 'phase': return t !== T.BEDROCK && t !== T.PEDESTAL && t !== T.HEART;
    default: return false;
  }
}

/** Breadth-first distance field through open air around the rig, used by flyers. */
export function computeFlyField(dive) {
  const { world, rig } = dive;
  const W = world.w;
  if (!dive.flyField) dive.flyField = { dist: new Int16Array(W * world.h).fill(-1), y0: 0, y1: -1 };
  const f = dive.flyField;
  if (f.y1 >= f.y0) f.dist.fill(-1, f.y0 * W, (f.y1 + 1) * W);
  const y0 = Math.max(0, rig.y - 18);
  const y1 = Math.min(world.h - 1, rig.y + 18);
  f.y0 = y0;
  f.y1 = y1;
  const q = new Int32Array(W * (y1 - y0 + 1));
  let qh = 0;
  let qt = 0;
  const start = rig.y * W + rig.x;
  f.dist[start] = 0;
  q[qt++] = start;
  while (qh < qt) {
    const i = q[qh++];
    const x = i % W;
    const y = (i - x) / W;
    const nd = f.dist[i] + 1;
    for (const [ox, oy] of DIR4) {
      const nx = x + ox;
      const ny = y + oy;
      if (ny < y0 || ny > y1 || nx < 1 || nx >= W - 1) continue;
      const j = ny * W + nx;
      if (f.dist[j] !== -1 || world.tiles[j] !== T.AIR) continue;
      f.dist[j] = nd;
      q[qt++] = j;
    }
  }
}

function fieldAt(f, x, y, W) {
  if (!f || y < f.y0 || y > f.y1) return -1;
  return f.dist[y * W + x];
}

export function lineOfSight(world, x0, y0, x1, y1) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len / 0.25);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor(x0 + (x1 - x0) * t);
    const y = Math.floor(y0 + (y1 - y0) * t);
    if (TILES[world.get(x, y)].solid) return false;
  }
  return true;
}

function greedy(e, dive, dx, dy) {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const opts = [];
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (sx) opts.push([e.x + sx, e.y]);
    if (sy) opts.push([e.x, e.y + sy]);
  } else {
    if (sy) opts.push([e.x, e.y + sy]);
    if (sx) opts.push([e.x + sx, e.y]);
  }
  for (const [nx, ny] of opts) if (canEnemyEnter(e, nx, ny, dive)) return [nx, ny];
  return null;
}

function wander(e, dive) {
  const dirs = dive.rng.shuffle(DIR4.slice());
  for (const [ox, oy] of dirs) {
    if (canEnemyEnter(e, e.x + ox, e.y + oy, dive)) return [e.x + ox, e.y + oy];
  }
  return null;
}

function chooseStep(e, dive, dx, dy, chase) {
  const { rng, world } = dive;
  const mode = e.def.mode;
  if (mode === 'fly') {
    if (!chase) return rng.chance(0.55) ? wander(e, dive) : null;
    const W = world.w;
    const cur = fieldAt(dive.flyField, e.x, e.y, W);
    let best = null;
    let bestV = cur >= 0 ? cur : 1e9;
    for (const [ox, oy] of rng.shuffle(DIR4.slice())) {
      const v = fieldAt(dive.flyField, e.x + ox, e.y + oy, W);
      if (v >= 0 && v < bestV && canEnemyEnter(e, e.x + ox, e.y + oy, dive)) {
        bestV = v;
        best = [e.x + ox, e.y + oy];
      }
    }
    return best || greedy(e, dive, dx, dy);
  }
  if (mode === 'walk') {
    if (chase && dx !== 0) {
      const sx = Math.sign(dx);
      if (canEnemyEnter(e, e.x + sx, e.y, dive)) return [e.x + sx, e.y];
      if (canEnemyEnter(e, e.x, e.y - 1, dive) && canEnemyEnter(e, e.x + sx, e.y - 1, dive)) return [e.x + sx, e.y - 1];
      return null;
    }
    if (rng.chance(0.5)) {
      const sx = rng.sign();
      if (canEnemyEnter(e, e.x + sx, e.y, dive) && TILES[world.get(e.x + sx, e.y + 1)].solid) return [e.x + sx, e.y];
    }
    return null;
  }
  if (chase) return greedy(e, dive, dx, dy);
  return rng.chance(0.35) ? wander(e, dive) : null;
}

function updateEnemy(e, dive, dt) {
  const { world, rig, rng } = dive;
  const def = e.def;
  e.flash = Math.max(0, e.flash - dt);
  e.lunge = Math.max(0, e.lunge - dt);
  e.atkCd -= dt;
  e.cd -= dt;
  e.shootCd -= dt;
  e.phase += dt;
  if (e.moveT < 1) {
    e.moveT = Math.min(1, e.moveT + dt / e.moveDur);
    if (e.moveT < 1) return;
  }
  if (world.get(e.x, e.y) === T.LAVA && !def.lavaImmune) {
    dive.hurtEnemy(e, 30 * dt, 0, 0, true);
    if (e.dead) return;
  }
  const dx = rig.x - e.x;
  const dy = rig.y - e.y;
  const dist = Math.hypot(dx, dy);
  if (!e.aggro && dist <= def.aggro) e.aggro = true;
  else if (e.aggro && dist > def.aggro * 1.8) e.aggro = false;
  const passive = rig.evac > 0 || dive.status !== 'active';
  const chase = e.aggro && !passive;

  if (def.mode === 'walk' && canEnemyEnter(e, e.x, e.y + 1, dive)) {
    e.moveTo(dive, e.x, e.y + 1, 0.11);
    return;
  }

  const adjacent = def.mode === 'fly'
    ? Math.max(Math.abs(dx), Math.abs(dy)) === 1
    : Math.abs(dx) + Math.abs(dy) === 1;
  if (chase && adjacent) {
    if (e.atkCd <= 0) {
      e.atkCd = def.atkCd;
      e.lunge = 0.18;
      e.lungeDir = [Math.sign(dx), Math.sign(dy)];
      dive.enemyAttack(e);
    }
    return;
  }

  if (chase && def.ranged && dist <= def.ranged.range && e.shootCd <= 0
    && lineOfSight(world, e.x + 0.5, e.y + 0.5, rig.x + 0.5, rig.y + 0.5)) {
    e.shootCd = def.ranged.cd * rng.range(0.8, 1.2);
    dive.spawnProjectile(e);
  }

  if (e.cd > 0) return;
  const step = chooseStep(e, dive, dx, dy, chase);
  if (!step) {
    e.cd = 0.25 + rng.float() * 0.35;
    return;
  }
  const [nx, ny] = step;
  const intoRock = TILES[world.get(nx, ny)].solid;
  let dur = def.moveTime;
  if (intoRock) dur = def.rockMoveTime ?? def.moveTime * 1.5;
  if (def.mode === 'burrow' && intoRock) world.set(nx, ny, T.AIR);
  e.moveTo(dive, nx, ny, dur);
  e.cd = chase ? 0 : rng.range(0.3, 1.2);
}

export function updateEnemies(dive, dt) {
  dive.fieldTimer -= dt;
  if (dive.fieldTimer <= 0) {
    computeFlyField(dive);
    dive.fieldTimer = 0.25;
  }
  const ry = dive.rig.y;
  for (const e of dive.enemies) {
    if (!e.dead && Math.abs(e.y - ry) <= 32) updateEnemy(e, dive, dt);
  }
}

/** Try to bring a creature in from the dark, out of lamp range. */
export function spawnNear(dive, type) {
  const def = ENEMIES[type];
  const { rng, world, rig } = dive;
  const minDist = Math.max(7, rig.stats.light * dive.mod.light + 1.5);
  for (let i = 0; i < 30; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(minDist, minDist + 6);
    const x = Math.round(rig.x + Math.cos(a) * r);
    const y = Math.round(rig.y + Math.sin(a) * r);
    if (y < SURFACE_Y + 8 || x < 1 || x >= world.w - 1 || y >= world.h - 5) continue;
    if (dive.occ.has(world.idx(x, y)) || !validSpawn(def.mode, world, x, y)) continue;
    const e = dive.addEnemyAt(type, x, y);
    if (def.pack) {
      const extra = rng.int(def.pack[0], def.pack[1]) - 1;
      for (let p = 0, t = 0; p < extra && t < 16; t++) {
        const px = x + rng.int(-1, 1);
        const py = y + rng.int(-1, 1);
        if (px < 1 || px >= world.w - 1 || dive.occ.has(world.idx(px, py)) || !validSpawn(def.mode, world, px, py)) continue;
        if (px === rig.x && py === rig.y) continue;
        dive.addEnemyAt(type, px, py);
        p++;
      }
    }
    return e;
  }
  return null;
}

export function updateSpawns(dive, dt) {
  dive.spawnTimer -= dt;
  if (dive.spawnTimer > 0) return;
  const { rig, rng } = dive;
  const L = dive.layer();
  dive.spawnTimer = (L.spawnInterval * rng.range(0.7, 1.3)) / dive.mod.enemies / (dive.heartTaken ? 2.5 : 1);
  if (rig.depth < 12) return;
  const li = dive.world.layerIndex(rig.y);
  let near = 0;
  for (const e of dive.enemies) if (!e.dead && Math.abs(e.y - rig.y) < 24) near++;
  if (near >= 4 + li) return;
  const type = dive.heartTaken && rng.chance(0.5) ? 'warden' : rng.weighted(L.enemies);
  spawnNear(dive, type);
}
