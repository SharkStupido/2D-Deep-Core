import { T, TILES, LAYERS, SURFACE_Y, CONSUMABLES, MODIFIER_DEFAULTS } from './config.js';
import { RNG } from './rng.js';
import { generateWorld } from './worldgen.js';
import { Rig, NO_INPUT } from './rig.js';
import { Enemy, canEnemyEnter, updateEnemies, updateSpawns } from './enemies.js';
import { Physics, Tremors, updateClouds } from './hazards.js';
import { rigStats, upgradeLevels } from './meta.js';

/**
 * One descent: world, rig, hostiles and hazards. Pure game state: it never
 * touches the DOM. Things worth seeing or hearing are pushed to `events`.
 */
export class Dive {
  constructor({ seed, upgrades = {}, inventory = {}, modifier = null, heartRecovered = false }) {
    this.seed = seed >>> 0;
    this.modifier = modifier || { id: 'standard', name: 'Standard Survey', desc: '' };
    this.mod = { ...MODIFIER_DEFAULTS, ...this.modifier };
    const gen = generateWorld(this.seed, this.mod, { heart: !heartRecovered });
    this.world = gen.world;
    this.chamber = gen.chamber;
    this.rng = new RNG(this.seed ^ 0x5bd1e995);
    this.rig = new Rig(gen.spawn.x, gen.spawn.y, rigStats(upgrades), upgradeLevels(upgrades));
    this.enemies = [];
    this.occ = new Map();
    for (const e of gen.enemies) this.addEnemyAt(e.type, e.x, e.y);
    this.inventory = {};
    for (const c of CONSUMABLES) this.inventory[c.id] = Math.max(0, inventory[c.id] | 0);
    this.projectiles = [];
    this.clouds = [];
    this.charges = [];
    this.events = [];
    this.physics = new Physics(this);
    this.tremors = new Tremors(this);
    this.flyField = null;
    this.fieldTimer = 0;
    this.spawnTimer = 12;
    this.time = 0;
    this.status = 'active';
    this.cause = null;
    this.heartTaken = false;
    this.record = { maxDepth: 0, kills: 0, ores: 0, drilled: 0 };
    this.layerIdx = 0;
    this.o2Warned = 0;
  }

  emit(type, data = {}) { this.events.push({ type, ...data }); }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  layer() { return LAYERS[this.world.layerIndex(this.rig.y)]; }

  addEnemyAt(type, x, y) {
    const e = new Enemy(type, x, y, this.rng || new RNG(x * 31 + y));
    this.enemies.push(e);
    this.occ.set(this.world.idx(x, y), e);
    return e;
  }

  buildOccupancy() {
    this.occ.clear();
    for (const e of this.enemies) if (!e.dead) this.occ.set(this.world.idx(e.x, e.y), e);
  }

  enemyAt(x, y) {
    if (!this.world.inBounds(x, y)) return null;
    return this.occ.get(this.world.idx(x, y)) || null;
  }

  update(dt, input = NO_INPUT) {
    if (this.status !== 'active') return;
    this.time += dt;
    this.buildOccupancy();
    this.rig.update(dt, input, this);
    if (this.status !== 'active') return;
    updateEnemies(this, dt);
    this.updateProjectiles(dt);
    this.physics.update(dt);
    this.tremors.update(dt);
    updateClouds(this, dt);
    this.updateCharges(dt);
    updateSpawns(this, dt);
    if (this.enemies.some((e) => e.dead)) this.enemies = this.enemies.filter((e) => !e.dead);
    if (this.status !== 'active') return;

    const rig = this.rig;
    if (rig.depth > this.record.maxDepth) this.record.maxDepth = rig.depth;
    const li = this.world.layerIndex(rig.y);
    if (rig.depth > 0 && li !== this.layerIdx) {
      this.layerIdx = li;
      this.emit('layer', { index: li, name: LAYERS[li].name });
    }
    const f = rig.o2 / rig.stats.maxO2;
    if (f < 0.25 && this.o2Warned < 1) {
      this.o2Warned = 1;
      this.emit('lowO2', { level: 1 });
    }
    if (f < 0.1 && this.o2Warned < 2) {
      this.o2Warned = 2;
      this.emit('lowO2', { level: 2 });
    }
    if (f > 0.35) this.o2Warned = 0;
  }

  // ---------------------------------------------------------------- tiles

  breakTile(x, y, { blast = false } = {}) {
    const t = this.world.get(x, y);
    const def = TILES[t];
    if (!def.drillable) return false;
    this.world.set(x, y, T.AIR);
    this.record.drilled++;
    this.emit('break', { x, y, tile: t, blast });
    if (def.ore) this.collect(def.ore, x, y);
    switch (def.special) {
      case 'gas': this.spawnCloud(x, y, 'gas'); break;
      case 'spore': this.spawnCloud(x, y, 'spore'); break;
      case 'air': this.refillO2(18 + this.rig.depth * 0.08, x, y); break;
      case 'crate': this.openCrate(x, y); break;
      case 'heart': this.takeHeart(x, y); break;
      default: break;
    }
    return true;
  }

  collect(item, x, y) {
    const rig = this.rig;
    if (rig.cargoUsed >= rig.stats.cargoCap) {
      this.emit('cargoFull', { x, y, item });
      return false;
    }
    rig.cargo[item] = (rig.cargo[item] || 0) + 1;
    rig.cargoUsed++;
    this.record.ores++;
    this.emit('pickup', { x, y, item });
    return true;
  }

  refillO2(amount, x, y) {
    const rig = this.rig;
    rig.o2 = Math.min(rig.stats.maxO2, rig.o2 + amount);
    this.emit('o2', { x, y, amount: Math.round(amount) });
  }

  openCrate(x, y) {
    const r = this.rng.float();
    if (r < 0.45) {
      const pool = CONSUMABLES.filter((c) => this.inventory[c.id] < c.max && (c.id !== 'evac' || this.rng.chance(0.35)));
      if (pool.length) {
        const c = this.rng.pick(pool);
        this.inventory[c.id]++;
        this.emit('crate', { x, y, text: `+1 ${c.name}` });
        return;
      }
    }
    if (r < 0.78) {
      this.collect('scrap', x, y);
      return;
    }
    this.refillO2(25, x, y);
  }

  takeHeart(x, y) {
    this.rig.heart = true;
    this.heartTaken = true;
    this.tremors.timer = Math.min(this.tremors.timer, 4);
    this.spawnTimer = Math.min(this.spawnTimer, 3);
    this.emit('heart', { x, y });
  }

  spawnCloud(x, y, kind) {
    this.clouds.push({ x: x + 0.5, y: y + 0.5, kind, t: 0, life: kind === 'gas' ? 9 : 7, rMax: kind === 'gas' ? 2.4 : 2.0 });
    this.emit(kind === 'gas' ? 'gas' : 'spores', { x, y });
  }

  // ---------------------------------------------------------------- combat

  hurtEnemy(e, dmg, kx = 0, ky = 0, silent = false) {
    if (e.dead) return;
    e.hp -= dmg;
    if (!silent) {
      e.flash = 0.15;
      this.emit('enemyHurt', { x: e.x, y: e.y, type: e.type });
    }
    if (e.hp <= 0) {
      e.dead = true;
      if (this.occ.get(this.world.idx(e.x, e.y)) === e) this.occ.delete(this.world.idx(e.x, e.y));
      this.record.kills++;
      this.emit('enemyKilled', { x: e.x, y: e.y, type: e.type });
      return;
    }
    e.aggro = true;
    if (kx || ky) {
      const nx = e.x + kx;
      const ny = e.y + ky;
      const intoRock = TILES[this.world.get(nx, ny)].solid;
      if (canEnemyEnter(e, nx, ny, this) && (e.def.mode === 'phase' || !intoRock)) e.moveTo(this, nx, ny, 0.12);
    }
  }

  enemyAttack(e) {
    this.rig.damage(e.def.dmg, this, { source: e.def.name });
    this.emit('enemyAttack', { x: e.x, y: e.y, type: e.type });
  }

  spawnProjectile(e) {
    const r = e.def.ranged;
    const dx = this.rig.x - e.x;
    const dy = this.rig.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    this.projectiles.push({
      x: e.x + 0.5, y: e.y + 0.5, vx: (dx / len) * r.speed, vy: (dy / len) * r.speed,
      life: 3, dmg: r.dmg, source: e.def.name,
    });
    this.emit('shoot', { x: e.x, y: e.y });
  }

  updateProjectiles(dt) {
    if (!this.projectiles.length) return;
    const rig = this.rig;
    const rp = rig.renderPos();
    for (const p of this.projectiles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (Math.hypot(p.x - (rp.x + 0.5), p.y - (rp.y + 0.5)) < 0.55) {
        rig.damage(p.dmg, this, { source: p.source });
        rig.o2 = Math.max(0, rig.o2 - 3);
        p.life = 0;
        this.emit('projectileHit', { x: p.x, y: p.y });
      } else if (TILES[this.world.get(Math.floor(p.x), Math.floor(p.y))].solid) {
        p.life = 0;
        this.emit('projectilePop', { x: p.x, y: p.y });
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  firePulse() {
    const rig = this.rig;
    const s = rig.stats;
    if (rig.pulseCd > 0) return false;
    rig.pulseCd = s.pulseCd;
    rig.o2 = Math.max(0, rig.o2 - 2);
    const cx = rig.x;
    const cy = rig.y;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d > s.pulseR + 0.3) continue;
      const falloff = 1 - Math.min(1, d / (s.pulseR + 1)) * 0.4;
      this.hurtEnemy(e, s.pulseDmg * falloff, Math.sign(e.x - cx), Math.sign(e.y - cy));
    }
    for (const p of this.projectiles) {
      if (Math.hypot(p.x - (cx + 0.5), p.y - (cy + 0.5)) <= s.pulseR + 0.5) p.life = 0;
    }
    for (const c of this.clouds) {
      if (Math.hypot(c.x - (cx + 0.5), c.y - (cy + 0.5)) <= s.pulseR + 1.5) c.t = Math.max(c.t, c.life - 0.6);
    }
    this.emit('pulse', { x: cx, y: cy, r: s.pulseR });
    return true;
  }

  // ---------------------------------------------------------------- supplies

  useItem(id) {
    const rig = this.rig;
    const s = rig.stats;
    if (!(this.inventory[id] > 0)) {
      this.emit('noItem', { id });
      return false;
    }
    switch (id) {
      case 'evac':
        if (rig.evac > 0) return false;
        if (rig.depth < 1) {
          this.emit('notice', { text: 'Already topside' });
          return false;
        }
        rig.evac = 1.6;
        rig.action = null;
        this.emit('evac', { x: rig.x, y: rig.y });
        break;
      case 'o2can':
        if (rig.o2 >= s.maxO2 - 1) {
          this.emit('notice', { text: 'Oxygen already full' });
          return false;
        }
        rig.o2 = Math.min(s.maxO2, rig.o2 + s.maxO2 * 0.4);
        this.emit('itemUsed', { id, x: rig.x, y: rig.y });
        break;
      case 'repair':
        if (rig.hull >= s.maxHull - 0.5) {
          this.emit('notice', { text: 'Hull already intact' });
          return false;
        }
        rig.hull = Math.min(s.maxHull, rig.hull + s.maxHull * 0.45);
        this.emit('itemUsed', { id, x: rig.x, y: rig.y });
        break;
      case 'charge':
        this.charges.push({ x: rig.x, y: rig.y, fuse: 1.5 });
        this.emit('chargePlaced', { x: rig.x, y: rig.y });
        break;
      default:
        return false;
    }
    this.inventory[id]--;
    return true;
  }

  updateCharges(dt) {
    if (!this.charges.length) return;
    for (const c of this.charges) {
      c.fuse -= dt;
      if (c.fuse <= 0) this.explode(c.x, c.y);
    }
    this.charges = this.charges.filter((c) => c.fuse > 0);
  }

  explode(cx, cy) {
    const R = 2.3; // a rounded 5×5 blast
    const maxHard = this.rig.stats.maxHard + 2;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (y < SURFACE_Y) continue;
        const t = this.world.get(x, y);
        const d = TILES[t];
        if (d.drillable && t !== T.HEART && d.hardness <= maxHard) this.breakTile(x, y, { blast: true });
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - cx, e.y - cy);
      if (d <= 2.3) this.hurtEnemy(e, 70 * (1 - d / 3.5), Math.sign(e.x - cx), Math.sign(e.y - cy));
    }
    const rd = Math.hypot(this.rig.x - cx, this.rig.y - cy);
    if (rd <= 2) this.rig.damage(30 * (1 - rd / 3), this, { source: 'Blast charge' });
    this.emit('explosion', { x: cx, y: cy });
  }

  // ---------------------------------------------------------------- endings

  extract() {
    if (this.status !== 'active') return;
    this.status = 'extracted';
    this.emit('extracted', { x: this.rig.x, y: this.rig.y });
  }

  die(cause) {
    if (this.status !== 'active') return;
    this.status = 'dead';
    this.cause = cause || 'Unknown';
    this.emit('death', { x: this.rig.x, y: this.rig.y, cause: this.cause });
  }

  abandon() { this.die('Dive aborted'); }

  result() {
    return {
      status: this.status,
      cause: this.cause,
      cargo: { ...this.rig.cargo },
      heart: this.rig.heart,
      inventory: { ...this.inventory },
      record: { ...this.record, time: this.time },
      seed: this.seed,
      modifierId: this.modifier.id,
    };
  }
}
