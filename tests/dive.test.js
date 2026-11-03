import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dive } from '../src/dive.js';
import { T, SURFACE_Y } from '../src/config.js';
import { rigStats } from '../src/meta.js';
import { STEP, input, run, quietDive, placeRig } from './helpers.js';

test('holding down drills into the ground and burns oxygen', () => {
  const dive = quietDive();
  const o2 = dive.rig.o2;
  const events = run(dive, 8, input('down'));
  assert.ok(dive.rig.depth >= 8, `reached ${dive.rig.depth} m`);
  assert.ok(dive.rig.o2 < o2);
  assert.ok(events.some((e) => e.type === 'break'));
  assert.equal(dive.status, 'active');
});

test('flying back out of the shaft extracts the rig', () => {
  const dive = quietDive();
  run(dive, 6, input('down'));
  assert.ok(dive.rig.depth > 3);
  const events = run(dive, 30, input('up'));
  assert.equal(dive.status, 'extracted');
  assert.ok(events.some((e) => e.type === 'extracted'));
  assert.equal(dive.result().status, 'extracted');
});

test('running out of oxygen suffocates the rig', () => {
  const dive = quietDive();
  run(dive, 2, input('down'));
  dive.rig.o2 = 0;
  run(dive, 30);
  assert.equal(dive.status, 'dead');
  assert.equal(dive.cause, 'Suffocation');
});

test('ore goes into the cargo bay until it is full', () => {
  const dive = quietDive();
  const rig = placeRig(dive, 10, SURFACE_Y + 30);
  rig.cargoUsed = rig.stats.cargoCap - 1;
  dive.world.set(11, rig.y, T.GOLD);
  assert.equal(dive.breakTile(11, rig.y), true);
  assert.equal(rig.cargo.gold, 1);
  dive.world.set(11, rig.y, T.SILVER);
  dive.breakTile(11, rig.y);
  assert.equal(rig.cargo.silver, undefined);
  assert.ok(dive.drainEvents().some((e) => e.type === 'cargoFull'));
});

test('the starting drill cannot cut shale; a better one can', () => {
  const dive = quietDive();
  const rig = placeRig(dive, 10, SURFACE_Y + 60);
  dive.world.set(11, rig.y, T.SHALE);
  const ev = run(dive, 1.5, input('right'));
  assert.equal(dive.world.get(11, rig.y), T.SHALE);
  assert.ok(ev.some((e) => e.type === 'tooHard'));

  const strong = quietDive({ upgrades: { drill: 2 } });
  const r2 = placeRig(strong, 10, SURFACE_Y + 60);
  strong.world.set(11, r2.y, T.SHALE);
  run(strong, 1.5, input('right'));
  assert.notEqual(strong.world.get(11, r2.y), T.SHALE);
});

test('air pockets refill oxygen', () => {
  const dive = quietDive();
  const rig = placeRig(dive, 10, SURFACE_Y + 30);
  rig.o2 = 10;
  dive.world.set(11, rig.y, T.AIRPOCKET);
  dive.breakTile(11, rig.y);
  assert.ok(rig.o2 > 25);
});

test('falling too far damages the hull, thrusters catch you', () => {
  const dive = quietDive();
  const w = dive.world;
  const x = 10;
  const top = SURFACE_Y + 40;
  for (let y = top; y < top + 12; y++) w.set(x, y, T.AIR);
  w.set(x, top + 12, T.STONE);
  const rig = placeRig(dive, x, top);
  w.set(x, top + 1, T.AIR);
  run(dive, 3);
  assert.equal(rig.y, top + 11);
  assert.ok(rig.hull + rig.shield < rig.stats.maxHull + rig.stats.maxShield, 'impact hurt');

  const d2 = quietDive();
  for (let y = top; y < top + 12; y++) d2.world.set(x, y, T.AIR);
  const r2 = placeRig(d2, x, top);
  d2.world.set(x, top + 1, T.AIR);
  run(d2, 0.4);
  run(d2, 1, input('up'));
  assert.equal(r2.hull, r2.stats.maxHull);
});

test('pulse emitter damages nearby hostiles and goes on cooldown', () => {
  const dive = quietDive();
  const rig = placeRig(dive, 10, SURFACE_Y + 100);
  const e = dive.addEnemyAt('gloomwing', 11, rig.y);
  assert.equal(dive.firePulse(), true);
  assert.ok(e.dead, 'a gloomwing does not survive a point-blank pulse');
  assert.equal(dive.firePulse(), false, 'cooldown');
  assert.equal(dive.record.kills, 1);
});

test('hostiles attack when adjacent and the shield soaks damage first', () => {
  const dive = quietDive();
  const rig = placeRig(dive, 10, SURFACE_Y + 100);
  dive.addEnemyAt('magmaslug', 11, rig.y);
  dive.enemies[0].aggro = true;
  dive.enemies[0].atkCd = 0;
  run(dive, 0.2);
  assert.ok(rig.shield < rig.stats.maxShield);
  assert.ok(rig.hull < rig.stats.maxHull, '18 damage blows through a 10-point shield');
});

test('ramming a hostile with the drill hurts it', () => {
  const dive = quietDive();
  const rig = placeRig(dive, 10, SURFACE_Y + 100);
  const e = dive.addEnemyAt('magmaslug', 11, rig.y);
  e.cd = 99;
  run(dive, 0.1, input('right'));
  assert.ok(e.hp < e.def.hp);
});

test('blast charges shatter rock, collect ore, and hurt the careless', () => {
  const dive = quietDive();
  const rig = placeRig(dive, 10, SURFACE_Y + 30);
  const [x0, y0] = [rig.x, rig.y];
  dive.world.set(x0, y0 + 2, T.COPPER);
  dive.world.set(x0 + 1, y0 + 1, T.IRON);
  dive.inventory.charge = 1;
  assert.equal(dive.useItem('charge'), true);
  assert.equal(dive.inventory.charge, 0);
  run(dive, 1.6);
  for (const [dx, dy] of [[0, 1], [0, 2], [1, 1], [-1, 1], [2, 1]]) {
    assert.equal(dive.world.get(x0 + dx, y0 + dy), T.AIR, `blasted ${dx},${dy}`);
  }
  assert.equal(rig.cargo.copper, 1);
  assert.equal(rig.cargo.iron, 1);
  assert.ok(rig.hull < rig.stats.maxHull, 'standing on your own charge hurts');
});

test('supplies: canisters, patch kits and the evac beacon', () => {
  const dive = quietDive({ inventory: { o2can: 1, repair: 1, evac: 1 } });
  const rig = placeRig(dive, 10, SURFACE_Y + 50);
  rig.o2 = 5;
  rig.hull = 10;
  dive.useItem('o2can');
  dive.useItem('repair');
  assert.ok(rig.o2 > 40);
  assert.ok(rig.hull > 50);
  assert.equal(dive.useItem('o2can'), false, 'none left');
  dive.useItem('evac');
  run(dive, 2);
  assert.equal(dive.status, 'extracted');
});

test('lifting the Heart sets off the Core', () => {
  const dive = new Dive({ seed: 8, upgrades: { drill: 6 }, modifier: { id: 't', name: 'T', enemies: 0 } });
  dive.enemies = [];
  dive.occ.clear();
  const c = dive.chamber;
  const rig = dive.rig;
  rig.x = rig.fromX = c.cx - 1;
  rig.y = rig.fromY = c.floor;
  dive.world.set(c.cx - 1, c.floor, T.AIR);
  dive.world.set(c.cx - 1, c.floor + 1, T.PEDESTAL);
  run(dive, 2, input('right'));
  assert.equal(rig.heart, true);
  assert.equal(dive.heartTaken, true);
  assert.equal(dive.result().heart, true);
  assert.deepEqual(dive.tremors.interval(), [8, 12]);
});

test('a strata shift carries the rig and terrain sideways together', () => {
  const dive = quietDive();
  const rig = placeRig(dive, 10, SURFACE_Y + 80);
  const before = Array.from({ length: dive.world.w }, (_, x) => dive.world.get(x, rig.y));
  dive.tremors.execute({ y0: rig.y - 1, y1: rig.y + 1, dx: 3 });
  assert.equal(rig.x, 13);
  assert.equal(dive.world.get(rig.x, rig.y), T.AIR);
  const after = Array.from({ length: dive.world.w }, (_, x) => dive.world.get(x, rig.y));
  const strip = (row) => row.slice(1, -1).map((t) => (t === T.RUBBLE ? T.AIR : t)).sort();
  assert.deepEqual(strip(after), strip(before), 'same material, just moved (open tiles may collapse to rubble)');
});

test('tremors warn first, then shift', () => {
  const dive = new Dive({ seed: 3, modifier: { id: 't', name: 'T', enemies: 0, tremor: 3 } });
  dive.enemies = [];
  dive.occ.clear();
  placeRig(dive, 10, SURFACE_Y + 90);
  dive.tremors.timer = 0.05;
  const ev = run(dive, 4);
  const iWarn = ev.findIndex((e) => e.type === 'tremorWarning');
  const iShift = ev.findIndex((e) => e.type === 'tremor');
  assert.ok(iWarn >= 0 && iShift > iWarn);
});

test('a loose boulder drops onto a rig that digs under it', () => {
  const dive = quietDive();
  const rig = placeRig(dive, 10, SURFACE_Y + 40);
  dive.world.set(10, rig.y - 1, T.BOULDER);
  dive.world.set(10, rig.y - 2, T.STONE);
  const ev = run(dive, 1.5);
  assert.ok(ev.some((e) => e.type === 'boulderSmash'));
  assert.ok(rig.hull < rig.stats.maxHull);
});

test('lava burns, and heat plating helps', () => {
  const burn = (plating) => {
    const dive = quietDive({ upgrades: { plating } });
    const rig = placeRig(dive, 10, SURFACE_Y + 230);
    dive.world.set(10, rig.y, T.LAVA);
    rig.shield = 0;
    rig.stats.shieldRegen = 0;
    run(dive, 1);
    return rig.stats.maxHull - rig.hull;
  };
  const bare = burn(1);
  const plated = burn(4);
  assert.ok(bare > 20, `lava did ${bare}`);
  assert.ok(plated < bare / 2);
});

test('heat and depth make oxygen drain faster', () => {
  const drain = (depth, plating = 1) => {
    const dive = quietDive({ upgrades: { plating } });
    const rig = placeRig(dive, 10, SURFACE_Y + depth);
    const o2 = rig.o2;
    run(dive, 5);
    return o2 - rig.o2;
  };
  const shallow = drain(20);
  const magma = drain(230);
  const plated = drain(230, 4);
  assert.ok(magma > shallow * 1.5, `${magma} vs ${shallow}`);
  assert.ok(plated < magma);
});

test('the same seed and inputs replay identically', () => {
  const play = () => {
    const d = new Dive({ seed: 31337, upgrades: { drill: 3, tank: 4 } });
    const script = ['down', 'down', 'left', 'down', 'right', 'down', 'up'];
    for (const dir of script) for (let i = 0; i < 90; i++) d.update(STEP, input(dir));
    return [d.rig.x, d.rig.y, d.rig.o2.toFixed(4), d.rig.cargoUsed, d.enemies.length, d.status];
  };
  assert.deepEqual(play(), play());
});

test('rig stats come from upgrades', () => {
  const d = new Dive({ seed: 1, upgrades: { tank: 3 } });
  assert.equal(d.rig.stats.maxO2, rigStats({ tank: 3 }).maxO2);
  assert.equal(d.rig.o2, d.rig.stats.maxO2);
});

test('the rig cannot drive onto the shaft walls from the surface', () => {
  const dive = quietDive();
  run(dive, 6, input('left'));
  assert.equal(dive.rig.x, 1);
  run(dive, 8, input('right'));
  assert.equal(dive.rig.x, dive.world.w - 2);
  assert.equal(dive.rig.y, SURFACE_Y - 1);
});
