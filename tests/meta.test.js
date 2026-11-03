import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newSave, normalizeSave, buyUpgrade, buyConsumable, nextUpgradeCost, rigStats, appraise, settleDive, drawContracts,
} from '../src/meta.js';
import { UPGRADES, CONSUMABLES, ITEMS, HEART_VALUE, MODIFIERS } from '../src/config.js';

test('a new save starts at level 1 with a courtesy canister', () => {
  const s = newSave();
  assert.equal(s.credits, 0);
  for (const u of UPGRADES) assert.equal(s.upgrades[u.id], 1);
  assert.equal(s.inventory.o2can, 1);
  assert.equal(s.heart, false);
});

test('upgrades cost credits, level up and cap out', () => {
  const s = newSave();
  assert.deepEqual(buyUpgrade(s, 'drill'), { ok: false, reason: 'Not enough credits' });
  s.credits = 1e6;
  const drill = UPGRADES.find((u) => u.id === 'drill');
  let spent = 0;
  for (let lvl = 2; lvl <= drill.levels.length; lvl++) {
    const cost = nextUpgradeCost(s, 'drill');
    assert.equal(cost, drill.levels[lvl - 1].cost);
    assert.equal(buyUpgrade(s, 'drill').ok, true);
    spent += cost;
    assert.equal(s.upgrades.drill, lvl);
  }
  assert.equal(nextUpgradeCost(s, 'drill'), null);
  assert.deepEqual(buyUpgrade(s, 'drill'), { ok: false, reason: 'Fully upgraded' });
  assert.equal(s.credits, 1e6 - spent);
  assert.equal(buyUpgrade(s, 'nonsense').ok, false);
});

test('upgrade costs rise monotonically', () => {
  for (const u of UPGRADES) {
    for (let i = 1; i < u.levels.length; i++) assert.ok(u.levels[i].cost > u.levels[i - 1].cost, `${u.id} level ${i + 1}`);
  }
});

test('supplies respect rack limits', () => {
  const s = newSave();
  s.credits = 10000;
  const evac = CONSUMABLES.find((c) => c.id === 'evac');
  for (let i = 0; i < evac.max; i++) assert.equal(buyConsumable(s, 'evac').ok, true);
  assert.deepEqual(buyConsumable(s, 'evac'), { ok: false, reason: 'Rack is full' });
  assert.equal(s.credits, 10000 - evac.cost * evac.max);
});

test('rigStats merges one stat block per upgrade', () => {
  const base = rigStats(newSave().upgrades);
  for (const key of ['maxHard', 'drillSpeed', 'drillDmg', 'maxO2', 'maxHull', 'maxShield', 'shieldRegen', 'cargoCap', 'climbTime', 'moveTime', 'light', 'ping', 'heatRes', 'pulseDmg', 'pulseR', 'pulseCd']) {
    assert.equal(typeof base[key], 'number', key);
  }
  assert.equal(base.cost, undefined);
  const maxed = rigStats(Object.fromEntries(UPGRADES.map((u) => [u.id, 99])));
  assert.ok(maxed.maxO2 > base.maxO2 && maxed.maxHard === 6 && maxed.pulseCd < base.pulseCd);
});

test('normalizeSave repairs garbage and clamps values', () => {
  const s = normalizeSave({ credits: -50, upgrades: { drill: 42, tank: 'x' }, inventory: { evac: 99 }, stats: { dives: 3 } });
  assert.equal(s.credits, 0);
  assert.equal(s.upgrades.drill, UPGRADES.find((u) => u.id === 'drill').levels.length);
  assert.equal(s.upgrades.tank, 1);
  assert.equal(s.inventory.evac, 2);
  assert.equal(s.stats.dives, 3);
  assert.equal(s.stats.deaths, 0);
  assert.deepEqual(normalizeSave(null), newSave());
});

test('appraise applies contract multipliers and pays for the Heart', () => {
  const a = appraise({ gold: 2, copper: 3 }, false, {});
  assert.equal(a.total, ITEMS.gold.value * 2 + ITEMS.copper.value * 3);
  const b = appraise({ gold: 2 }, true, { value: 1.5 });
  assert.equal(b.total, Math.round(ITEMS.gold.value * 1.5) * 2 + HEART_VALUE);
});

test('settling: extraction banks cargo, a lost rig loses it and its supplies', () => {
  const s = newSave();
  s.inventory = { evac: 1, o2can: 2, repair: 0, charge: 3 };
  const record = { maxDepth: 40, kills: 2, ores: 5, drilled: 60, time: 90 };
  const ok = settleDive(s, { status: 'extracted', cargo: { iron: 5 }, heart: false, inventory: { evac: 1, o2can: 1, repair: 0, charge: 0 }, record }, {});
  assert.equal(ok.appraisal.total, ITEMS.iron.value * 5);
  assert.equal(s.credits, ITEMS.iron.value * 5);
  assert.deepEqual(s.inventory, { evac: 1, o2can: 1, repair: 0, charge: 0 });
  assert.equal(s.stats.deepest, 40);
  assert.equal(ok.newRecord, true);

  const lost = settleDive(s, { status: 'dead', cause: 'Lava', cargo: { ruby: 3 }, heart: true, inventory: { evac: 1 }, record: { ...record, maxDepth: 20 } }, {});
  assert.equal(lost.extracted, false);
  assert.equal(s.credits, ITEMS.iron.value * 5, 'nothing paid for a lost rig');
  assert.equal(s.heart, false);
  assert.deepEqual(Object.values(s.inventory), [0, 0, 0, 0]);
  assert.equal(s.stats.deaths, 1);
  assert.equal(s.stats.dives, 2);
});

test('bringing the Heart home is a victory exactly once', () => {
  const s = newSave();
  const record = { maxDepth: 409, kills: 0, ores: 0, drilled: 1, time: 10 };
  const r1 = settleDive(s, { status: 'extracted', cargo: {}, heart: true, inventory: {}, record }, {});
  assert.equal(r1.victory, true);
  assert.equal(s.heart, true);
  const r2 = settleDive(s, { status: 'extracted', cargo: {}, heart: true, inventory: {}, record }, {});
  assert.equal(r2.victory, false);
});

test('contracts always offer the standard survey plus two distinct others', () => {
  for (let seed = 0; seed < 30; seed++) {
    const c = drawContracts(seed);
    assert.equal(c.length, 3);
    assert.equal(c[0], MODIFIERS[0]);
    assert.notEqual(c[1].id, c[2].id);
    assert.ok(c[1].id !== 'standard' && c[2].id !== 'standard');
  }
});
