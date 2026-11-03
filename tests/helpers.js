import { Dive } from '../src/dive.js';
import { T, SURFACE_Y } from '../src/config.js';

export const STEP = 1 / 60;

export const input = (dir = null, { up = false, pulse = false, use = null } = {}) => ({
  dir, up: up || dir === 'up', pulse, use,
});

/** Run a dive for `seconds` with a fixed input; returns every event emitted. */
export function run(dive, seconds, inp = input()) {
  const events = [];
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n && dive.status === 'active'; i++) {
    dive.update(STEP, inp);
    events.push(...dive.drainEvents());
  }
  return events;
}

/** A quiet dive: no hostiles, no tremors, so mechanics can be tested in isolation. */
export function quietDive(opts = {}) {
  const dive = new Dive({ seed: 4242, modifier: { id: 'test', name: 'Test', tremor: 0, enemies: 0 }, ...opts });
  dive.enemies = [];
  dive.occ.clear();
  dive.spawnTimer = 1e9;
  return dive;
}

/** Carve an open room around (x, y) with a floor, and park the rig in it. */
export function placeRig(dive, x, y, { floor = T.STONE } = {}) {
  const w = dive.world;
  for (let yy = y - 2; yy <= y; yy++) for (let xx = x - 2; xx <= x + 2; xx++) w.set(xx, yy, T.AIR);
  for (let xx = x - 2; xx <= x + 2; xx++) w.set(xx, y + 1, floor);
  const rig = dive.rig;
  rig.x = rig.fromX = x;
  rig.y = rig.fromY = y;
  rig.moveT = 1;
  rig.action = null;
  rig.maxDepth = Math.max(rig.maxDepth, y - SURFACE_Y);
  return rig;
}
