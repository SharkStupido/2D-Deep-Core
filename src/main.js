// Entry point: state machine (title → outpost → dive → report), main loop, wiring.
import { TILE, SURFACE_Y, BEDROCK_DEPTH } from './config.js';
import { randomSeed } from './rng.js';
import { Dive } from './dive.js';
import { Renderer } from './render/renderer.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { UI } from './ui.js';
import { loadSave, storeSave, clearSave, hasSave } from './save.js';
import {
  newSave, buyUpgrade, buyConsumable, settleDive, drawContracts, upgradeDef, consumableDef,
} from './meta.js';

const STEP = 1 / 60;
const BACKDROP_SEED = 0xc0ffee;

const canvas = document.getElementById('game');
const touchRoot = document.getElementById('touch');
const renderer = new Renderer(canvas);
const input = new Input();
const sfx = new Sfx();
const ui = new UI(document.getElementById('ui'), onAction);
const isTouch = window.matchMedia('(pointer: coarse)').matches;

let save = loadSave();
sfx.setMuted(!!save.settings.muted);
let state = 'title';
let dive = null;
let paused = false;
let endTimer = 0;
let acc = 0;
let contracts = drawContracts(randomSeed());
let contractIdx = 0;
let currentModifier = contracts[0];
let backdrop = makeBackdrop();
let titleScroll = 0;

function makeBackdrop() {
  return new Dive({ seed: BACKDROP_SEED, upgrades: save.upgrades, heartRecovered: save.heart });
}

function persist() { storeSave(save); }

// ------------------------------------------------------------------ screens

function goTitle() {
  state = 'title';
  dive = null;
  titleScroll = 0;
  setTouch(false);
  ui.title(hasSave() && save.stats.dives > 0, save);
}

function goOutpost(flash = '') {
  state = 'outpost';
  dive = null;
  setTouch(false);
  renderOutpost(flash);
}

function renderOutpost(flash = '') {
  ui.outpost(save, contracts, contractIdx, flash);
}

function startDive() {
  currentModifier = contracts[contractIdx];
  dive = new Dive({
    seed: randomSeed(),
    upgrades: save.upgrades,
    inventory: save.inventory,
    modifier: currentModifier,
    heartRecovered: save.heart,
  });
  state = 'dive';
  paused = false;
  endTimer = 0;
  acc = 0;
  renderer.reset();
  ui.hide();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  input.clear();
  setTouch(isTouch);
  renderer.showBanner(currentModifier.name.toUpperCase(), currentModifier.desc, '#ffb340', 2.6);
  sfx.unlock();
  sfx.play('launch');
}

function finishDive() {
  const summary = settleDive(save, dive.result(), currentModifier);
  persist();
  state = 'results';
  setTouch(false);
  contracts = drawContracts(randomSeed());
  contractIdx = 0;
  backdrop = makeBackdrop();
  ui.results(summary, save);
}

function setPaused(p) {
  if (state !== 'dive' || !dive) return;
  paused = p && dive.status === 'active';
  input.clear();
  if (paused) ui.pause(dive);
  else ui.hide();
}

function setTouch(on) {
  touchRoot.hidden = !on;
}

function toggleMute() {
  save.settings.muted = !save.settings.muted;
  sfx.setMuted(save.settings.muted);
  persist();
  if (state === 'outpost') renderOutpost(save.settings.muted ? 'Sound off' : 'Sound on');
}

// ------------------------------------------------------------------ actions

function onAction(name, data = {}) {
  sfx.unlock();
  switch (name) {
    case 'start':
      sfx.play('click');
      goOutpost();
      break;
    case 'reset':
      ui.confirmReset();
      break;
    case 'reset-confirm':
      clearSave();
      save = newSave();
      sfx.setMuted(false);
      backdrop = makeBackdrop();
      goTitle();
      break;
    case 'reset-cancel':
      goTitle();
      break;
    case 'upgrade': {
      const r = buyUpgrade(save, data.id);
      if (r.ok) {
        persist();
        sfx.play('buy');
        renderOutpost(`${upgradeDef(data.id).name} upgraded to level ${save.upgrades[data.id]}`);
      } else {
        sfx.play('deny');
        renderOutpost(r.reason);
      }
      break;
    }
    case 'supply': {
      const r = buyConsumable(save, data.id);
      if (r.ok) {
        persist();
        sfx.play('buy');
        renderOutpost(`${consumableDef(data.id).name} loaded`);
      } else {
        sfx.play('deny');
        renderOutpost(r.reason);
      }
      break;
    }
    case 'contract':
      contractIdx = Number(data.index) || 0;
      sfx.play('click');
      renderOutpost(`Contract: ${contracts[contractIdx].name}`);
      break;
    case 'dive':
      startDive();
      break;
    case 'continue':
      goOutpost();
      break;
    case 'resume':
      setPaused(false);
      break;
    case 'abandon':
      if (dive) {
        dive.abandon();
        setPaused(false);
      }
      break;
    case 'mute':
      toggleMute();
      break;
    case 'pause':
      setPaused(!paused);
      break;
    default:
      break;
  }
}

input.listeners.add((e) => {
  const code = e.code;
  if (code === 'KeyM') {
    toggleMute();
    return;
  }
  if (code === 'Escape' || code === 'KeyP') {
    if (state === 'dive') setPaused(!paused);
    return;
  }
  if (code === 'Enter' || code === 'NumpadEnter') {
    // Let a focused button handle Enter itself (it fires a click).
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    if (state === 'title' && ui.mode === 'title') onAction('start');
    else if (state === 'outpost') onAction('dive');
    else if (state === 'results') onAction('continue');
    else if (state === 'dive' && paused) setPaused(false);
  }
});

input.bindTouch(touchRoot, (act) => onAction(act));

canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (state !== 'dive' || paused) return;
  const p = renderer.toView(e.clientX, e.clientY);
  for (const s of renderer.hudSlots) {
    if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) {
      input.queue(s.id);
      e.preventDefault();
      return;
    }
  }
});

window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'dive' && dive && dive.status === 'active' && !paused) setPaused(true);
});

// ------------------------------------------------------------------ loop

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  const v = renderer.view;
  input.capture = state === 'dive' && !paused;
  if (state === 'dive' && dive) {
    if (!paused) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 8) {
        const acts = steps === 0 ? input.takeActions() : [];
        dive.update(STEP, input.snapshot(acts));
        acc -= STEP;
        steps++;
      }
      if (steps >= 8) acc = 0;
      const events = dive.drainEvents();
      renderer.handleEvents(events, dive);
      sfx.handleEvents(events, dive);
      if (dive.status !== 'active') {
        endTimer += dt;
        if (endTimer > (dive.status === 'dead' ? 2.4 : 1.8)) finishDive();
      }
    }
    sfx.update(paused ? null : dive, dt);
    renderer.render(dive, paused ? 0 : dt, { touch: isTouch, muted: save.settings.muted });
  } else if (state === 'results' && dive) {
    input.takeActions();
    sfx.update(null, dt);
    renderer.render(dive, dt, { hud: false });
  } else {
    input.takeActions();
    sfx.update(null, dt);
    if (state === 'title') {
      titleScroll += dt * 34;
      const span = (BEDROCK_DEPTH + SURFACE_Y) * TILE;
      const camY = -v.h * 0.35 + (titleScroll % span);
      renderer.render(backdrop, dt, { hud: false, camY, ambient: 0.5, rigLight: false });
    } else {
      renderer.render(backdrop, dt, { hud: false, camY: SURFACE_Y * TILE - v.h * 0.62, ambient: 0.3 });
    }
  }
  requestAnimationFrame(frame);
}

goTitle();
requestAnimationFrame(frame);

// Handy for debugging from the console and for automated smoke tests.
window.deepcore = {
  get state() { return state; },
  get dive() { return dive; },
  get save() { return save; },
  action: onAction,
};
