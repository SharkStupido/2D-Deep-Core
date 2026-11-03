import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG, hash2, valueNoise2D } from '../src/rng.js';
import { World } from '../src/world.js';
import { generateWorld } from '../src/worldgen.js';
import { T, TILES, LAYERS, SURFACE_Y, BEDROCK_DEPTH, WORLD_W, ORE_TILES, ENEMIES, CORE_CHAMBER } from '../src/config.js';
import { validSpawn } from '../src/enemies.js';

test('RNG is deterministic per seed and int() is inclusive', () => {
  const a = new RNG(99);
  const b = new RNG(99);
  const seqA = Array.from({ length: 20 }, () => a.float());
  const seqB = Array.from({ length: 20 }, () => b.float());
  assert.deepEqual(seqA, seqB);
  const r = new RNG(1);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = r.int(2, 5);
    assert.ok(v >= 2 && v <= 5);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
});

test('hash and value noise stay within [0, 1)', () => {
  const n = valueNoise2D(7);
  for (let i = 0; i < 500; i++) {
    const h = hash2(i * 13 - 400, i * 7 - 200, 3);
    assert.ok(h >= 0 && h < 1);
    const v = n(i * 0.37, i * 0.71);
    assert.ok(v >= 0 && v <= 1);
  }
});

test('shiftBand slides rows with wrap-around and leaves walls alone', () => {
  const w = new World(8, 4);
  for (let y = 0; y < 4; y++) {
    w.set(0, y, T.BEDROCK);
    w.set(7, y, T.BEDROCK);
    for (let x = 1; x < 7; x++) w.set(x, y, 20 + x);
  }
  w.shiftBand(1, 2, 2);
  const row = (y) => Array.from({ length: 8 }, (_, x) => w.get(x, y));
  assert.deepEqual(row(0), [T.BEDROCK, 21, 22, 23, 24, 25, 26, T.BEDROCK]);
  assert.deepEqual(row(1), [T.BEDROCK, 25, 26, 21, 22, 23, 24, T.BEDROCK]);
  assert.deepEqual(row(2), row(1));
  w.shiftBand(1, 1, -2);
  assert.deepEqual(row(1), row(0));
  assert.equal(w.wrapX(0), 6);
  assert.equal(w.wrapX(7), 1);
});

test('world generation is deterministic and seeds differ', () => {
  const a = generateWorld(123);
  const b = generateWorld(123);
  const c = generateWorld(124);
  assert.deepEqual(a.world.tiles, b.world.tiles);
  assert.deepEqual(a.enemies, b.enemies);
  assert.notDeepEqual(a.world.tiles, c.world.tiles);
});

for (const seed of [1, 77, 2026, 99999]) {
  test(`world ${seed}: shape, surface, walls and floor`, () => {
    const { world, spawn } = generateWorld(seed);
    assert.equal(world.w, WORLD_W);
    for (let y = 0; y < SURFACE_Y; y++) for (let x = 0; x < world.w; x++) assert.equal(world.get(x, y), T.AIR);
    for (let x = 1; x < world.w - 1; x++) assert.equal(world.get(x, SURFACE_Y), T.DIRT, 'surface is soil');
    for (let y = SURFACE_Y; y < world.h; y++) {
      assert.equal(world.get(0, y), T.BEDROCK);
      assert.equal(world.get(world.w - 1, y), T.BEDROCK);
    }
    for (let x = 0; x < world.w; x++) assert.equal(world.get(x, SURFACE_Y + BEDROCK_DEPTH), T.BEDROCK);
    assert.equal(world.get(spawn.x, spawn.y), T.AIR);
    assert.ok(TILES[world.get(spawn.x, spawn.y + 1)].solid, 'the rig starts on solid ground');
  });

  test(`world ${seed}: the Heart rests on its pedestal and no lava is near it`, () => {
    const { world, chamber } = generateWorld(seed);
    assert.equal(world.get(chamber.cx, chamber.floor), T.HEART);
    assert.equal(world.get(chamber.cx, chamber.floor + 1), T.PEDESTAL);
    assert.equal(world.get(chamber.cx, chamber.floor - 1), T.AIR, 'the Heart is reachable from the chamber');
    for (let y = chamber.cy - 20; y <= chamber.cy + 10; y++) {
      for (let x = 0; x < world.w; x++) assert.notEqual(world.get(x, y), T.LAVA);
    }
    assert.equal(chamber.cy, SURFACE_Y + CORE_CHAMBER.depth);
  });

  test(`world ${seed}: ores belong to their strata and every layer has some`, () => {
    const { world } = generateWorld(seed);
    const crustTop = SURFACE_Y;
    const crustBottom = SURFACE_Y + LAYERS[0].to - 8;
    for (let y = crustTop; y < crustBottom; y++) {
      for (let x = 1; x < world.w - 1; x++) {
        const t = world.get(x, y);
        assert.ok(![T.RUBY, T.SAPPHIRE, T.DIAMOND, T.VOIDGLASS, T.CORESHARD, T.LAVA].includes(t), `no deep material at ${x},${y}`);
      }
    }
    for (const L of LAYERS) {
      const counts = new Map();
      for (let y = SURFACE_Y + L.from; y < Math.min(SURFACE_Y + L.to, SURFACE_Y + BEDROCK_DEPTH); y++) {
        for (let x = 1; x < world.w - 1; x++) {
          const t = world.get(x, y);
          if (ORE_TILES.includes(t)) counts.set(t, (counts.get(t) || 0) + 1);
        }
      }
      for (const [ore] of L.ores) assert.ok((counts.get(ore) || 0) > 0, `${L.name} contains ${TILES[ore].name}`);
    }
  });

  test(`world ${seed}: hostiles start in valid spots away from the outpost`, () => {
    const { world, enemies } = generateWorld(seed);
    assert.ok(enemies.length > 10);
    const seen = new Set();
    for (const e of enemies) {
      assert.ok(validSpawn(ENEMIES[e.type].mode, world, e.x, e.y) || e.type === 'warden', `${e.type} at ${e.x},${e.y}`);
      assert.ok(e.y - SURFACE_Y >= 14, 'nothing lurks right under the outpost');
      const k = `${e.x},${e.y}`;
      assert.ok(!seen.has(k), 'no two hostiles share a tile');
      seen.add(k);
    }
  });
}

test('a recovered Heart is replaced by a coreshard cache', () => {
  const { world, chamber } = generateWorld(5, {}, { heart: false });
  assert.equal(world.get(chamber.cx, chamber.floor), T.CORESHARD);
  for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) assert.notEqual(world.get(x, y), T.HEART);
});

test('contract modifiers scale ore deposits', () => {
  const count = (g) => g.world.tiles.reduce((n, t) => n + (ORE_TILES.includes(t) ? 1 : 0), 0);
  const base = count(generateWorld(31));
  const rich = count(generateWorld(31, { ore: 1.6 }));
  assert.ok(rich > base * 1.3, `rich veins ${rich} vs ${base}`);
});
