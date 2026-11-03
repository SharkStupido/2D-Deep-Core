// Meta-progression between dives: credits, upgrades, supplies, contracts and records.
import { UPGRADES, CONSUMABLES, MODIFIERS, ITEMS, HEART_VALUE } from './config.js';
import { RNG } from './rng.js';

export const SAVE_VERSION = 1;

export function newSave() {
  const upgrades = {};
  for (const u of UPGRADES) upgrades[u.id] = 1;
  const inventory = {};
  for (const c of CONSUMABLES) inventory[c.id] = 0;
  inventory.o2can = 1; // a courtesy canister for the first dive
  return {
    version: SAVE_VERSION,
    credits: 0,
    upgrades,
    inventory,
    heart: false,
    stats: { dives: 0, extractions: 0, deaths: 0, deepest: 0, earned: 0, kills: 0, ores: 0, victories: 0 },
    settings: { muted: false },
  };
}

/** Merge a loaded (possibly older or hand-edited) save onto fresh defaults. */
export function normalizeSave(raw) {
  const base = newSave();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  out.version = SAVE_VERSION;
  out.credits = Math.max(0, Math.floor(Number(raw.credits) || 0));
  out.upgrades = { ...base.upgrades };
  for (const u of UPGRADES) {
    const lvl = Math.floor(Number(raw.upgrades?.[u.id]) || 1);
    out.upgrades[u.id] = Math.min(u.levels.length, Math.max(1, lvl));
  }
  out.inventory = { ...base.inventory };
  for (const c of CONSUMABLES) {
    const n = raw.inventory?.[c.id];
    out.inventory[c.id] = n === undefined ? base.inventory[c.id] : Math.min(c.max, Math.max(0, Math.floor(Number(n) || 0)));
  }
  out.stats = { ...base.stats, ...(raw.stats || {}) };
  out.settings = { ...base.settings, ...(raw.settings || {}) };
  out.heart = !!raw.heart;
  return out;
}

export const upgradeDef = (id) => UPGRADES.find((u) => u.id === id);
export const consumableDef = (id) => CONSUMABLES.find((c) => c.id === id);

/** Cost of the next level, or null when maxed out. */
export function nextUpgradeCost(save, id) {
  const u = upgradeDef(id);
  const lvl = save.upgrades[id] || 1;
  return lvl >= u.levels.length ? null : u.levels[lvl].cost;
}

export function buyUpgrade(save, id) {
  const u = upgradeDef(id);
  if (!u) return { ok: false, reason: 'Unknown upgrade' };
  const cost = nextUpgradeCost(save, id);
  if (cost === null) return { ok: false, reason: 'Fully upgraded' };
  if (save.credits < cost) return { ok: false, reason: 'Not enough credits' };
  save.credits -= cost;
  save.upgrades[id] = (save.upgrades[id] || 1) + 1;
  return { ok: true };
}

export function buyConsumable(save, id) {
  const c = consumableDef(id);
  if (!c) return { ok: false, reason: 'Unknown supply' };
  if ((save.inventory[id] || 0) >= c.max) return { ok: false, reason: 'Rack is full' };
  if (save.credits < c.cost) return { ok: false, reason: 'Not enough credits' };
  save.credits -= c.cost;
  save.inventory[id] = (save.inventory[id] || 0) + 1;
  return { ok: true };
}

/** Upgrade levels clamped to what exists, with every upgrade present. */
export function upgradeLevels(upgrades = {}) {
  const out = {};
  for (const u of UPGRADES) out[u.id] = Math.min(u.levels.length, Math.max(1, upgrades[u.id] || 1));
  return out;
}

/** Flatten upgrade levels into the rig's working stats. */
export function rigStats(upgrades = {}) {
  const stats = {};
  for (const u of UPGRADES) {
    const lvl = Math.min(u.levels.length, Math.max(1, upgrades[u.id] || 1));
    const { cost, ...rest } = u.levels[lvl - 1];
    Object.assign(stats, rest);
  }
  return stats;
}

/** Three survey contracts to choose from; the first is always the standard one. */
export function drawContracts(seed) {
  const rng = new RNG(seed);
  const pool = rng.shuffle(MODIFIERS.slice(1));
  return [MODIFIERS[0], pool[0], pool[1]];
}

export function appraise(cargo, heart, modifier = {}) {
  const mult = modifier.value ?? 1;
  const lines = [];
  for (const [id, item] of Object.entries(ITEMS)) {
    const count = cargo[id] || 0;
    if (!count) continue;
    const unit = Math.round(item.value * mult);
    lines.push({ id, name: item.name, color: item.color, count, unit, total: unit * count });
  }
  if (heart) lines.push({ id: 'heart', name: 'Heart of the Deep', color: '#ff5ad1', count: 1, unit: HEART_VALUE, total: HEART_VALUE });
  const total = lines.reduce((sum, l) => sum + l.total, 0);
  return { lines, total };
}

/** Apply a finished dive to the save. Returns a summary for the results screen. */
export function settleDive(save, result, modifier = {}) {
  const appraisal = appraise(result.cargo, result.heart, modifier);
  const s = save.stats;
  s.dives++;
  s.kills += result.record.kills;
  const newRecord = result.record.maxDepth > s.deepest;
  s.deepest = Math.max(s.deepest, result.record.maxDepth);
  const extracted = result.status === 'extracted';
  let victory = false;
  if (extracted) {
    save.credits += appraisal.total;
    s.earned += appraisal.total;
    s.extractions++;
    s.ores += Object.values(result.cargo).reduce((a, b) => a + b, 0);
    for (const c of CONSUMABLES) save.inventory[c.id] = Math.min(c.max, result.inventory[c.id] || 0);
    if (result.heart) {
      victory = !save.heart;
      save.heart = true;
      s.victories++;
    }
  } else {
    s.deaths++;
    for (const c of CONSUMABLES) save.inventory[c.id] = 0; // everything aboard went down with the rig
  }
  return {
    status: result.status,
    cause: result.cause,
    extracted,
    victory,
    newRecord,
    appraisal,
    record: result.record,
    modifier,
  };
}
