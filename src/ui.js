// DOM overlays: title, outpost (shop), dive report and pause menus.
import { UPGRADES, CONSUMABLES, LAYERS } from './config.js';
import { nextUpgradeCost } from './meta.js';

const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const CONTROLS = `
  <div class="controls">
    <div><span class="keys"><kbd>←</kbd><kbd>→</kbd><kbd>↓</kbd></span><span>Drive &amp; drill <em>(or A D S)</em></span></div>
    <div><span class="keys"><kbd>↑</kbd></span><span>Thrust — hold to hover, climb &amp; drill upward <em>(W)</em></span></div>
    <div><span class="keys"><kbd>Space</kbd></span><span>Pulse emitter — knocks hostiles back</span></div>
    <div><span class="keys"><kbd>1</kbd>–<kbd>4</kbd></span><span>Use supplies</span></div>
    <div><span class="keys"><kbd>Esc</kbd> <kbd>M</kbd></span><span>Pause · mute</span></div>
  </div>`;

export class UI {
  constructor(root, onAction) {
    this.root = root;
    this.onAction = onAction;
    this.mode = null;
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      this.onAction(el.dataset.action, el.dataset);
    });
  }

  show(mode, html) {
    this.mode = mode;
    this.root.className = `ui-${mode}`;
    this.root.innerHTML = html;
    this.root.hidden = false;
  }

  hide() {
    this.mode = null;
    this.root.innerHTML = '';
    this.root.className = '';
    this.root.hidden = true;
  }

  focusPrimary() {
    const el = this.root.querySelector('[data-primary]');
    if (el) el.focus({ preventScroll: true });
  }

  title(hasProgress, save) {
    const s = save.stats;
    this.show('title', `
      <div class="screen title-screen">
        <div class="title-card">
          <div class="eyebrow">A vertical extraction roguelike</div>
          <h1 class="logo">DEEP<span>CORE</span></h1>
          <p class="tagline">Drill through shifting strata, haul rare ore back to the surface, and get out before the air runs out.</p>
          <div class="menu">
            <button class="btn primary" data-action="start" data-primary>${hasProgress ? 'Continue expedition' : 'Begin expedition'}</button>
            ${hasProgress ? '<button class="btn ghost" data-action="reset">New expedition</button>' : ''}
          </div>
          ${hasProgress ? `<p class="mini-stats">${s.dives} dives · deepest ${s.deepest} m · ${money(save.credits)} banked${save.heart ? ' · <b class="pink">Heart recovered</b>' : ''}</p>` : ''}
          <ul class="brief">
            <li><b>Oxygen</b> drains constantly — faster while drilling, at depth and in the heat. Air pockets in the rock refill it.</li>
            <li><b>Extract</b> by flying back out of the shaft. If the rig is lost below, so is its cargo.</li>
            <li><b>Strata shift</b> sideways without much warning, sealing the tunnels behind you.</li>
            <li>At <b>404 m</b> rests the <b class="pink">Heart of the Deep</b>. Bring it home.</li>
          </ul>
          ${CONTROLS}
        </div>
      </div>`);
    this.focusPrimary();
  }

  confirmReset() {
    this.show('title', `
      <div class="screen title-screen">
        <div class="res-card">
          <div class="eyebrow">New expedition</div>
          <h2>Wipe all progress?</h2>
          <p class="sub">Credits, upgrades, supplies and records will be erased. This can't be undone.</p>
          <div class="menu">
            <button class="btn danger" data-action="reset-confirm">Wipe and start over</button>
            <button class="btn ghost" data-action="reset-cancel" data-primary>Keep my progress</button>
          </div>
        </div>
      </div>`);
    this.focusPrimary();
  }

  outpost(save, contracts, selected, flash = '') {
    const prevScroll = this.root.querySelector('.op-body')?.scrollTop || 0;
    const upgrades = UPGRADES.map((u) => {
      const lvl = save.upgrades[u.id];
      const max = u.levels.length;
      const cost = nextUpgradeCost(save, u.id);
      const cur = u.describe(u.levels[lvl - 1]);
      const next = cost === null ? null : u.describe(u.levels[lvl]);
      const pips = Array.from({ length: max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      return `
        <div class="card upg${cost === null ? ' maxed' : ''}">
          <div class="upg-top"><span class="name">${u.name}</span><span class="pips" aria-label="Level ${lvl} of ${max}">${pips}</span></div>
          <div class="cur">${cur}</div>
          <div class="next">${next ? `→ ${next}` : u.blurb}</div>
          ${cost === null
            ? '<span class="tag">MAX</span>'
            : `<button class="btn buy" data-action="upgrade" data-id="${u.id}" ${save.credits < cost ? 'disabled' : ''}>${money(cost)}</button>`}
        </div>`;
    }).join('');
    const supplies = CONSUMABLES.map((c) => {
      const have = save.inventory[c.id] || 0;
      const full = have >= c.max;
      return `
        <div class="supply">
          <span class="key">${c.key}</span>
          <div class="sup-info"><b>${c.name}</b><small>${c.desc}</small></div>
          <span class="stock">${have}/${c.max}</span>
          <button class="btn buy" data-action="supply" data-id="${c.id}" ${full || save.credits < c.cost ? 'disabled' : ''}>${full ? 'Full' : money(c.cost)}</button>
        </div>`;
    }).join('');
    const cards = contracts.map((m, i) => `
      <button class="contract${i === selected ? ' selected' : ''}" data-action="contract" data-index="${i}" aria-pressed="${i === selected}">
        <b>${m.name}</b><small>${m.desc}</small>
      </button>`).join('');
    const s = save.stats;
    this.show('outpost', `
      <div class="screen outpost">
        <header class="op-head">
          <div>
            <div class="eyebrow">Topside outpost</div>
            <h2>Rig Bay</h2>
          </div>
          <div class="op-head-right">
            <button class="btn ghost small" data-action="mute">${save.settings.muted ? 'Sound off' : 'Sound on'}</button>
            <div class="credits" title="Credits banked">${money(save.credits)}</div>
          </div>
        </header>
        <div class="op-body">
          <section class="op-col">
            <h3>Rig upgrades <small>permanent</small></h3>
            <div class="upgrades">${upgrades}</div>
          </section>
          <section class="op-col">
            <h3>Supplies <small>lost if the rig is lost</small></h3>
            <div class="supplies">${supplies}</div>
            <h3>Survey contract <small>pick one per dive</small></h3>
            <div class="contracts">${cards}</div>
            <div class="records">
              <div><span>Dives</span><b>${s.dives}</b></div>
              <div><span>Extracted</span><b>${s.extractions}</b></div>
              <div><span>Rigs lost</span><b>${s.deaths}</b></div>
              <div><span>Deepest</span><b>${s.deepest} m</b></div>
              <div><span>Earned</span><b>${money(s.earned)}</b></div>
              <div><span>Heart</span><b class="${save.heart ? 'pink' : ''}">${save.heart ? 'Recovered' : '404 m'}</b></div>
            </div>
            <p class="hint">${this.hint(save)}</p>
          </section>
        </div>
        <footer class="op-foot">
          <div class="flash" role="status">${flash}</div>
          <button class="btn primary big" data-action="dive" data-primary>Begin dive <kbd>Enter</kbd></button>
        </footer>
      </div>`);
    const body = this.root.querySelector('.op-body');
    if (body) body.scrollTop = prevScroll;
    this.focusPrimary();
  }

  hint(save) {
    const drill = save.upgrades.drill;
    const deep = save.stats.deepest;
    if (save.stats.dives === 0) return 'Tip: drill straight down, grab what glints, and turn back with oxygen to spare — climbing out takes time.';
    if (drill < 2 && deep >= 40) return 'Tip: Shale below 50 m needs a Mk II drill head.';
    if (drill < 3 && deep >= 110) return 'Tip: the Magma Shelf (200 m) needs a Mk III drill — and heat plating helps you breathe there.';
    if (save.upgrades.plating < 2 && deep >= 180) return 'Tip: heat plating cuts the oxygen cost of the Magma Shelf and the Core.';
    if (drill < 5 && deep >= 300) return 'Tip: Voidstone around the Core needs a Mk V drill head.';
    if (!save.heart && deep >= 350) return 'Tip: once you lift the Heart, the Core turns violent. Bring an evac beacon.';
    return 'Tip: survey contracts trade danger for profit. Thin air and infestations pay best.';
  }

  results(summary, save) {
    const { appraisal, record, extracted, victory } = summary;
    let title;
    let sub;
    let cls;
    if (victory) {
      title = 'The Heart is home';
      sub = 'You hauled the Heart of the Deep to the surface. The outpost will be telling this one for years — and the Core still pays.';
      cls = 'victory';
    } else if (extracted) {
      title = 'Extraction complete';
      sub = appraisal.total ? 'Cargo sold at the outpost exchange.' : 'Back topside — with empty bays.';
      cls = 'ok';
    } else {
      title = 'Rig lost';
      sub = summary.cause === 'Dive aborted' ? 'You scuttled the dive. The cargo stays below.' : `Cause: ${summary.cause}. Everything aboard is lost to the deep.`;
      cls = 'lost';
    }
    const rows = appraisal.lines.map((l) => `
      <tr><td><i class="dot" style="background:${l.color}"></i>${l.name}</td><td>×${l.count}</td><td>${money(l.unit)}</td><td>${money(l.total)}</td></tr>`).join('');
    const mod = summary.modifier && summary.modifier.value && summary.modifier.value !== 1
      ? `<p class="mod">${summary.modifier.name}: sale prices ×${summary.modifier.value}</p>` : '';
    this.show('results', `
      <div class="screen results">
        <div class="res-card ${cls}">
          <div class="eyebrow">Dive report · ${summary.modifier?.name || 'Standard Survey'}</div>
          <h2>${title}</h2>
          <p class="sub">${sub}</p>
          ${rows ? `<table class="haul${extracted ? '' : ' lost'}"><tbody>${rows}</tbody></table>` : '<p class="empty">No cargo recovered.</p>'}
          ${mod}
          <div class="payout">${extracted ? `<span>Payout</span><b>${money(appraisal.total)}</b>` : `<span>Cargo lost</span><b class="strike">${money(appraisal.total)}</b>`}</div>
          <div class="res-stats">
            <div><span>Max depth</span><b>${record.maxDepth} m${summary.newRecord ? ' ★' : ''}</b></div>
            <div><span>Time</span><b>${fmtTime(record.time)}</b></div>
            <div><span>Hostiles</span><b>${record.kills}</b></div>
            <div><span>Drilled</span><b>${record.drilled}</b></div>
          </div>
          <p class="balance">Balance ${money(save.credits)}</p>
          <button class="btn primary" data-action="continue" data-primary>Back to the outpost <kbd>Enter</kbd></button>
        </div>
      </div>`);
    this.focusPrimary();
  }

  pause(dive) {
    const L = LAYERS[dive.world.layerIndex(dive.rig.y)];
    this.show('pause', `
      <div class="screen pause">
        <div class="res-card">
          <div class="eyebrow">Paused · ${dive.modifier.name}</div>
          <h2>${Math.max(0, dive.rig.depth)} m — ${dive.rig.depth > 0 ? L.name : 'Topside'}</h2>
          <p class="sub">Cargo ${dive.rig.cargoUsed}/${dive.rig.stats.cargoCap} · O₂ ${Math.ceil(dive.rig.o2)} · Hull ${Math.ceil(dive.rig.hull)}</p>
          <div class="menu">
            <button class="btn primary" data-action="resume" data-primary>Resume <kbd>Esc</kbd></button>
            <button class="btn danger" data-action="abandon">Abandon dive (cargo lost)</button>
          </div>
          ${CONTROLS}
        </div>
      </div>`);
    this.focusPrimary();
  }
}
