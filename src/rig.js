import { T, TILES, LAYERS, SURFACE_Y } from './config.js';
import { cloudRadius } from './hazards.js';

export const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
export const NO_INPUT = Object.freeze({ dir: null, up: false, pulse: false, use: null });

const SAFE_FALL = 5;
export const DRILL_TIME = 0.24; // seconds per hardness tier at drill speed ×1

/** The excavation rig: movement, drilling, life support. */
export class Rig {
  constructor(x, y, stats) {
    this.stats = stats;
    this.x = x;
    this.y = y;
    this.fromX = x;
    this.fromY = y;
    this.moveT = 1;
    this.moveDur = 0.1;
    this.action = null;
    this.facing = 'down';
    this.faceH = 1;
    this.hull = stats.maxHull;
    this.shield = stats.maxShield;
    this.o2 = stats.maxO2;
    this.cargo = {};
    this.cargoUsed = 0;
    this.heart = false;
    this.fallCount = 0;
    this.sinceHit = 99;
    this.invuln = 0;
    this.pulseCd = 0;
    this.bumpCd = 0;
    this.evac = 0;
    this.thrusting = false;
    this.drilling = false;
    this.inLava = false;
    this.inGas = false;
    this.blinded = false;
    this.maxDepth = 0;
    this.lastDamage = null;
  }

  get depth() { return this.y - SURFACE_Y; }

  renderPos() {
    const k = this.moveT;
    return { x: this.fromX + (this.x - this.fromX) * k, y: this.fromY + (this.y - this.fromY) * k };
  }

  moveTo(x, y, dur) {
    this.fromX = this.x;
    this.fromY = this.y;
    this.x = x;
    this.y = y;
    this.moveT = 0;
    this.moveDur = Math.max(0.02, dur);
  }

  canEnter(dive, x, y) {
    if (y < SURFACE_Y - 1) return false; // nothing to gain flying off into the sky
    if (x < 1 || x > dive.world.w - 2) return false; // the shaft walls extend up past the surface
    if (TILES[dive.world.get(x, y)].solid) return false;
    return !dive.enemyAt(x, y);
  }

  canFall(dive) { return this.canEnter(dive, this.x, this.y + 1); }

  damage(amount, dive, { bypassShield = false, iframes = true, source = 'Hostile' } = {}) {
    if (this.evac > 0 || dive.status !== 'active' || amount <= 0) return 0;
    if (iframes && this.invuln > 0) return 0;
    let a = amount;
    if (!bypassShield && this.shield > 0) {
      const absorbed = Math.min(this.shield, a);
      this.shield -= absorbed;
      a -= absorbed;
      if (iframes) dive.emit('shieldHit', { x: this.x, y: this.y, amount: absorbed });
    }
    this.hull -= a;
    this.sinceHit = 0;
    this.lastDamage = source;
    if (iframes) {
      this.invuln = 0.4;
      dive.emit('rigHit', { x: this.x, y: this.y, amount, hull: a, source });
    }
    if (this.hull <= 0) {
      this.hull = 0;
      dive.die(source);
    }
    return a;
  }

  update(dt, input, dive) {
    const s = this.stats;
    const world = dive.world;
    this.sinceHit += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.pulseCd = Math.max(0, this.pulseCd - dt);
    this.bumpCd = Math.max(0, this.bumpCd - dt);
    if (this.evac > 0) {
      this.evac -= dt;
      if (this.evac <= 0) dive.extract();
      return;
    }

    // Life support and environment.
    const depth = this.depth;
    const layer = LAYERS[world.layerIndex(this.y)];
    this.inLava = world.get(this.x, this.y) === T.LAVA;
    this.inGas = false;
    this.blinded = false;
    let drain = 0;
    if (depth > 0) {
      const heat = layer.heat * (1 - s.heatRes);
      const pressure = 1 + depth / 800;
      const exertion = this.drilling ? 1.5 : this.thrusting ? 1.3 : 1;
      drain = dive.mod.o2 * (1 + heat) * pressure * exertion;
    }
    for (const c of dive.clouds) {
      if (Math.hypot(c.x - (this.x + 0.5), c.y - (this.y + 0.5)) > cloudRadius(c)) continue;
      if (c.kind === 'gas') {
        this.inGas = true;
        drain += 5;
      } else {
        this.blinded = true;
        this.damage(4 * dt, dive, { iframes: false, source: 'Spore cloud' });
      }
    }
    this.o2 -= drain * dt;
    if (this.o2 <= 0) {
      this.o2 = 0;
      this.damage(14 * dt, dive, { bypassShield: true, iframes: false, source: 'Suffocation' });
    }
    if (this.inLava) this.damage(34 * (1 - s.heatRes * 0.85) * dt, dive, { iframes: false, source: 'Lava' });
    if (this.sinceHit > 2.5 && this.shield < s.maxShield) {
      this.shield = Math.min(s.maxShield, this.shield + s.shieldRegen * dt);
    }
    if (dive.status !== 'active') return;

    if (input.pulse) dive.firePulse();
    if (input.use) dive.useItem(input.use);
    if (this.evac > 0 || dive.status !== 'active') return;

    // Movement and drilling.
    if (this.moveT < 1) {
      this.moveT = Math.min(1, this.moveT + dt / this.moveDur);
      if (this.moveT >= 1) this.arrive(dive);
      if (dive.status !== 'active') return;
    }
    if (this.action) this.updateAction(dt, input, dive);
    if (this.moveT >= 1 && !this.action) this.decide(input, dive);
    this.drilling = !!this.action && this.action.type === 'drill';
  }

  updateAction(dt, input, dive) {
    const a = this.action;
    a.t += dt;
    if (a.type === 'ram') {
      if (a.t >= a.dur) this.action = null;
      return;
    }
    const supported = input.up || !this.canFall(dive);
    if (dive.world.get(a.tx, a.ty) !== a.tile || input.dir !== a.dir || !supported || dive.enemyAt(a.tx, a.ty)) {
      this.action = null;
      return;
    }
    if (a.t >= a.dur) {
      this.action = null;
      dive.breakTile(a.tx, a.ty, { byRig: true });
    }
  }

  decide(input, dive) {
    const world = dive.world;
    const s = this.stats;
    this.thrusting = false;
    if (!input.up && this.canFall(dive)) {
      const intoLava = this.inLava || world.get(this.x, this.y + 1) === T.LAVA;
      const dur = Math.max(0.055, 0.15 - this.fallCount * 0.018) * (intoLava ? 3 : 1);
      this.moveTo(this.x, this.y + 1, dur);
      this.fallCount++;
      return;
    }
    if (this.fallCount > 0) {
      if (!this.canFall(dive)) this.land(dive);
      this.fallCount = 0;
    }
    if (input.up) this.thrusting = true;
    const dir = input.dir;
    if (!dir) return;
    const [dx, dy] = DIRS[dir];
    this.facing = dir;
    if (dx) this.faceH = dx;
    const tx = this.x + dx;
    const ty = this.y + dy;

    const enemy = dive.enemyAt(tx, ty);
    if (enemy) {
      this.action = { type: 'ram', t: 0, dur: 0.28, dir };
      dive.hurtEnemy(enemy, s.drillDmg, dx, dy);
      dive.emit('ram', { x: tx, y: ty });
      return;
    }
    if (this.canEnter(dive, tx, ty)) {
      let dur = s.moveTime;
      if (dy < 0) dur = s.climbTime * (1 + (0.35 * this.cargoUsed) / s.cargoCap) * (this.heart ? 1.1 : 1);
      else if (dy > 0) dur = s.climbTime * 0.8;
      if (dy !== 0) this.thrusting = true;
      this.moveTo(tx, ty, dur * (this.inLava ? 2.2 : 1));
      return;
    }
    if (ty < SURFACE_Y - 1) return;
    const t = world.get(tx, ty);
    const def = TILES[t];
    if (def.drillable) {
      if (def.hardness > s.maxHard) {
        if (this.bumpCd <= 0) {
          this.bumpCd = 0.9;
          dive.emit('tooHard', { x: tx, y: ty, tile: t, need: def.hardness });
        }
        return;
      }
      const dur = ((DRILL_TIME * def.hardness) / s.drillSpeed) * (dy < 0 ? 1.4 : 1);
      this.action = { type: 'drill', tx, ty, t: 0, dur, dir, tile: t };
      dive.emit('drillStart', { x: tx, y: ty, tile: t });
      return;
    }
    if (this.bumpCd <= 0) {
      this.bumpCd = 0.9;
      dive.emit('bump', { x: tx, y: ty, tile: t });
    }
  }

  land(dive) {
    const n = this.fallCount;
    if (n > SAFE_FALL && !this.inLava) {
      this.damage((n - SAFE_FALL) * 7, dive, { source: 'Impact' });
      dive.emit('land', { x: this.x, y: this.y, hard: true });
    } else if (n > 1) {
      dive.emit('land', { x: this.x, y: this.y, hard: false });
    }
  }

  arrive(dive) {
    if (this.depth > this.maxDepth) this.maxDepth = this.depth;
    if (this.y < SURFACE_Y && this.maxDepth >= 3) dive.extract();
  }
}
