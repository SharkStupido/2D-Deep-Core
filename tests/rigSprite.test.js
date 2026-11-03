import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRigGrid, cargoChunks, RIG_PALETTE, RIG_TEXELS } from '../src/render/rigSprite.js';
import { ITEMS } from '../src/config.js';

const MAX = { drill: 6, tank: 6, hull: 6, shield: 6, cargo: 6, thrusters: 5, lamp: 5, plating: 4, pulse: 5 };
const cells = (g) => g.flat().filter(Boolean);
const count = (g, key) => cells(g).filter((c) => c === key).length;

test('the rig body is a 16×16 grid of known colours', () => {
  const g = buildRigGrid({ levels: MAX, cargo: cargoChunks({ gold: 3 }, 3, 10), heart: true, damage: 2 });
  assert.equal(g.length, RIG_TEXELS);
  for (const row of g) assert.equal(row.length, RIG_TEXELS);
  for (const c of cells(g)) assert.ok(RIG_PALETTE[c] || /^#[0-9a-f]{6}$/i.test(c), `unknown colour ${c}`);
});

test('the silhouette is fully outlined', () => {
  for (const opts of [{}, { bob: 1 }, { levels: MAX }, { look: -1 }, { look: 1 }]) {
    const g = buildRigGrid(opts);
    for (let y = 0; y < RIG_TEXELS; y++) {
      for (let x = 1; x < RIG_TEXELS; x++) {
        const c = g[y][x];
        if (!c || c === 'k') continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = g[y + dy]?.[x + dx];
          if (y + dy < 0 || y + dy >= RIG_TEXELS || x + dx >= RIG_TEXELS) continue;
          assert.ok(n, `texel ${x},${y} (${c}) touches open space`);
        }
      }
    }
  }
});

test('the suspension bobs the hull while the treads stay planted', () => {
  const a = buildRigGrid({ bob: 0 });
  const b = buildRigGrid({ bob: 1 });
  for (let y = 13; y < RIG_TEXELS; y++) assert.deepEqual(a[y], b[y], `tread row ${y}`);
  assert.notDeepEqual(a[3], b[3]);
});

test('treads roll from frame to frame', () => {
  assert.notDeepEqual(buildRigGrid({ frame: 0 })[12], buildRigGrid({ frame: 1 })[12]);
});

test('cargo heaps in the hopper, cheapest ore at the bottom', () => {
  assert.deepEqual(cargoChunks({}, 0, 10), []);
  assert.equal(cargoChunks({ copper: 10 }, 10, 10).length, 9);
  const chunks = cargoChunks({ gold: 2, copper: 2 }, 4, 10);
  assert.equal(chunks.length, 4);
  assert.equal(chunks[0], ITEMS.copper.color);
  assert.equal(chunks[chunks.length - 1], ITEMS.gold.color);
  const g = buildRigGrid({ cargo: chunks });
  assert.equal(count(g, ITEMS.gold.color), 2);
  assert.equal(count(buildRigGrid({ heart: true }), 'H'), 1);
});

test('upgrades show on the rig', () => {
  const base = buildRigGrid({});
  const maxed = buildRigGrid({ levels: MAX });
  assert.equal(count(base, 'R'), 0);
  assert.ok(count(maxed, 'R') > 10, 'heat tiles');
  assert.ok(count(maxed, 'A') >= 6, 'armour plates');
  assert.ok(count(maxed, 'O') >= 1, 'oxygen tank');
  assert.ok(count(maxed, 'c') > count(base, 'c'), 'shield emitters');
  assert.ok(count(base, 'b') > 0, 'hazard stripes on a stock rig');
});

test('state cues: pulse mast, damage, hit flash, pilot gaze', () => {
  assert.equal(count(buildRigGrid({ pulse: 'ready' }), 'X'), 1);
  assert.equal(count(buildRigGrid({ pulse: 'charging' }), 'x'), 1);
  assert.ok(count(buildRigGrid({ damage: 2 }), 'D') > count(buildRigGrid({ damage: 1 }), 'D'));
  const flash = buildRigGrid({ flash: true, levels: MAX });
  for (const c of cells(flash)) assert.ok(c === 'k' || c === 'w' || c === 'M', `flash leaves ${c}`);
  const visor = (look) => buildRigGrid({ look }).flatMap((row, y) => row.map((c, x) => (c === 'V' ? [x, y] : null))).filter(Boolean);
  assert.ok(visor(-1)[0][1] < visor(0)[0][1], 'looks up');
  assert.ok(visor(1).length > visor(0).length, 'looks down');
});
