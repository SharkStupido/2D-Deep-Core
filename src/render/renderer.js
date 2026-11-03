import { TILE, T, TILES, LAYERS, SURFACE_Y, ITEMS, ENEMIES, HARDNESS_NAMES, CONSUMABLES } from '../config.js';
import { hash2, RNG } from '../rng.js';
import { cloudRadius } from '../hazards.js';
import { DIRS } from '../rig.js';
import { buildTextures, shade, rgba } from './textures.js';
import { Particles } from './particles.js';
import { drawHud, FONT } from './hud.js';
import { rigBodyCanvas, cargoChunks, drawDrill, drawFlames, drawShieldRing } from './rigSprite.js';

const LIGHT_SCALE = 0.25;
const ENEMY_GLOW = { magmaslug: [1.3, 0.55], warden: [1.5, 0.5], gloomwing: [0.6, 0.3], shardmite: [0.8, 0.4], sporeling: [0.8, 0.35], grub: [0.5, 0.2] };
const TILE_GLOW = {
  [T.LAVA]: [1.7, 0.75], [T.LUMENITE]: [1.2, 0.6], [T.VOIDGLASS]: [1.0, 0.5], [T.CORESHARD]: [1.3, 0.65],
  [T.AIRPOCKET]: [0.8, 0.35], [T.HEART]: [4.5, 0.95],
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tex = buildTextures();
    this.particles = new Particles();
    this.cam = { x: 0, y: 0 };
    this.camFor = null;
    this.shake = 0;
    this.time = 0;
    this.hitFlash = 0;
    this.toasts = [];
    this.banner = null;
    this.hudSlots = [];
    this.view = { w: 960, h: 640, k: 1, touch: false };
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d');
    this.glow = makeGlowSprite();
    this.throttle = new Map();
    this.frameDt = 0;
    this.rigAnim = { roll: 0, squash: 0, smoke: 0, dust: 0, dmg: 0 };
    this.crack = { key: '', path: [] };
    this.stars = Array.from({ length: 90 }, (_, i) => ({
      x: hash2(i, 1, 99), y: hash2(i, 2, 99), s: hash2(i, 3, 99) < 0.15 ? 2 : 1, p: hash2(i, 4, 99) * 6.28,
    }));
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.max(1, window.innerWidth);
    const ch = Math.max(1, window.innerHeight);
    const aspect = cw / ch;
    let vw;
    let vh;
    if (aspect < 1) {
      vw = 576;
      vh = vw / aspect;
    } else {
      vh = Math.max(500, 960 / aspect);
      vw = vh * aspect;
    }
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
    this.canvas.style.width = `${cw}px`;
    this.canvas.style.height = `${ch}px`;
    this.view.w = vw;
    this.view.h = vh;
    this.view.k = (cw * dpr) / vw;
    this.view.cssScale = cw / vw;
    this.light.width = Math.ceil(vw * LIGHT_SCALE);
    this.light.height = Math.ceil(vh * LIGHT_SCALE);
  }

  /** Convert a client (CSS pixel) point to view coordinates. */
  toView(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * this.view.w, y: ((clientY - r.top) / r.height) * this.view.h };
  }

  reset() {
    this.particles.clear();
    this.toasts = [];
    this.banner = null;
    this.shake = 0;
    this.hitFlash = 0;
    this.camFor = null;
    this.throttle.clear();
    this.rigAnim = { roll: 0, squash: 0, smoke: 0, dust: 0, dmg: 0 };
  }

  addShake(a) { this.shake = Math.min(18, Math.max(this.shake, a)); }

  toast(text, color = '#e8e2f0', dur = 2.2, key = null, gap = 1.2) {
    if (key) {
      const last = this.throttle.get(key) || -99;
      if (this.time - last < gap) return;
      this.throttle.set(key, this.time);
    }
    this.toasts.push({ text, color, t: 0, dur });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  showBanner(title, sub = '', color = '#ffb340', dur = 2.6) {
    this.banner = { title, sub, color, t: 0, dur };
  }

  tileAt(world, x, y) {
    if (y < SURFACE_Y) return T.AIR;
    return world.get(x, y);
  }

  // ------------------------------------------------------------ events → visuals

  handleEvents(events, dive) {
    const P = this.particles;
    const c = (v) => (v + 0.5) * TILE;
    for (const e of events) {
      switch (e.type) {
        case 'break': {
          const def = TILES[e.tile];
          const host = TILES[this.tex.hosts[dive.world.layerIndex(e.y)]];
          const col = def.color || host.color || '#777';
          P.burst(c(e.x), c(e.y), { n: e.blast ? 6 : 10, color: [col, shade(col, 0.25), shade(col, -0.3)], speed: 110, size: 4 });
          break;
        }
        case 'pickup': {
          const it = ITEMS[e.item];
          P.text(c(e.x), c(e.y) - 6, `+${it.name}`, it.color);
          P.burst(c(e.x), c(e.y), { n: 8, color: [it.color, '#ffffff'], speed: 70, gravity: -40, size: 2, life: 0.5 });
          break;
        }
        case 'cargoFull':
          P.text(c(e.x), c(e.y), 'CARGO FULL', '#ff7a6a', 12);
          this.toast('Cargo bay full — ore is being lost', '#ff7a6a', 2.2, 'cargo', 3);
          break;
        case 'o2':
          P.text(c(e.x), c(e.y) - 6, `+${e.amount} O₂`, '#7fd8ff');
          P.burst(c(e.x), c(e.y), { n: 12, color: ['#bdf0ff', '#7fd8ff'], speed: 60, gravity: -120, size: 3, life: 0.8 });
          break;
        case 'crate':
          P.text(c(e.x), c(e.y) - 6, e.text, '#ffd27a');
          P.burst(c(e.x), c(e.y), { n: 10, color: ['#ffd27a', '#8a5a2b'], speed: 90, size: 3 });
          break;
        case 'gas':
          P.burst(c(e.x), c(e.y), { n: 16, color: ['#b47cff', '#7a4cc0'], speed: 60, gravity: -30, size: 5, life: 1 });
          this.toast('Toxic gas vented — oxygen drain spikes inside the cloud', '#c49bff', 2.6, 'gas', 20);
          break;
        case 'spores':
          P.burst(c(e.x), c(e.y), { n: 16, color: ['#e07cc8', '#b4e05a'], speed: 60, gravity: -30, size: 4, life: 1 });
          this.toast('Spores! They sting the hull and cloud your lamp', '#e07cc8', 2.6, 'spore', 20);
          break;
        case 'tooHard': {
          const need = e.need;
          const tier = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][need - 1] || '';
          this.toast(`${HARDNESS_NAMES[need]} is too hard for this drill (needs Mk ${tier})`, '#ffb340', 2.2, 'hard', 2.5);
          P.burst(c(e.x), c(e.y), { n: 4, color: '#ffe9a6', speed: 80, size: 2, life: 0.3 });
          break;
        }
        case 'bump':
          P.burst(c(e.x), c(e.y), { n: 3, color: '#ffe9a6', speed: 60, size: 2, life: 0.25 });
          break;
        case 'land':
          P.burst(c(e.x), (e.y + 1) * TILE, { n: e.hard ? 14 : 6, color: '#8a7a6a', speed: 80, angle: -Math.PI / 2, spread: Math.PI, size: 3, life: 0.5 });
          this.rigAnim.squash = e.hard ? 0.24 : 0.12;
          if (e.hard) this.addShake(7);
          break;
        case 'rigHit':
          this.hitFlash = Math.min(0.6, 0.25 + e.amount / 60);
          this.addShake(4 + Math.min(8, e.amount / 4));
          P.burst(c(e.x), c(e.y), { n: 10, color: ['#ffcf5a', '#ff7a2a', '#ffffff'], speed: 140, size: 2, life: 0.4 });
          break;
        case 'shieldHit':
          P.ring(c(e.x), c(e.y), 22, '#5fe1ff', 0.35, 3);
          break;
        case 'enemyHurt':
          P.burst(c(e.x), c(e.y), { n: 6, color: ['#ffffff', ENEMIES[e.type].color], speed: 100, size: 2, life: 0.3 });
          break;
        case 'enemyKilled': {
          const col = ENEMIES[e.type].color;
          P.burst(c(e.x), c(e.y), { n: 22, color: [col, shade(col, 0.4), shade(col, -0.4)], speed: 150, size: 4, life: 0.7 });
          P.flash(c(e.x), c(e.y), TILE * 2, 0.3, 0.6);
          break;
        }
        case 'ram':
          P.burst(c(e.x), c(e.y), { n: 8, color: ['#ffe9a6', '#ffffff'], speed: 130, size: 2, life: 0.25 });
          break;
        case 'pulse':
          P.ring(c(e.x), c(e.y), (e.r + 0.5) * TILE, '#b48bff', 0.45, 5);
          P.ring(c(e.x), c(e.y), (e.r + 0.2) * TILE * 0.7, '#e0d0ff', 0.3, 2);
          P.flash(c(e.x), c(e.y), (e.r + 1) * TILE, 0.4, 0.7);
          this.addShake(3);
          break;
        case 'explosion':
          P.burst(c(e.x), c(e.y), { n: 40, color: ['#ffcf5a', '#ff7a2a', '#ff3b1f', '#5a4a3a'], speed: 240, size: 5, life: 0.8 });
          P.ring(c(e.x), c(e.y), TILE * 2.4, '#ffcf5a', 0.4, 6);
          P.flash(c(e.x), c(e.y), TILE * 4, 0.5, 1);
          this.addShake(12);
          break;
        case 'chargePlaced':
          this.toast('Charge armed — clear the blast!', '#ff7a6a', 1.5);
          break;
        case 'tremorWarning':
          this.toast('Seismic shift imminent', '#ff9a4a', 2.4);
          break;
        case 'tremor': {
          this.addShake(16);
          for (let y = e.y0; y <= e.y1; y++) {
            for (let k = 0; k < 6; k++) {
              P.burst((1 + Math.random() * (dive.world.w - 2)) * TILE, (y + Math.random()) * TILE,
                { n: 2, color: ['#8a7a6a', '#5a4e44'], speed: 60, size: 4, life: 0.8 });
            }
          }
          break;
        }
        case 'boulderWobble':
          P.burst(c(e.x), (e.y + 1) * TILE, { n: 4, color: '#8a7a6a', speed: 30, size: 2, life: 0.5 });
          break;
        case 'boulderLand':
          P.burst(c(e.x), (e.y + 1) * TILE, { n: 8, color: '#8a7a6a', speed: 70, angle: -Math.PI / 2, spread: Math.PI, size: 3 });
          this.addShake(3);
          break;
        case 'boulderSmash':
          P.burst(c(e.x), c(e.y), { n: 18, color: ['#7a7066', '#4a4038'], speed: 150, size: 4 });
          this.addShake(6);
          break;
        case 'layer': {
          const L = LAYERS[e.index];
          this.showBanner(L.name.toUpperCase(), `${L.from} m${L.heat ? ' · extreme heat' : ''}${L.tremor ? ' · unstable strata' : ''}`, L.accent, 2.8);
          break;
        }
        case 'lowO2':
          this.toast(e.level === 2 ? 'OXYGEN CRITICAL — surface or crack a canister [2]' : 'Oxygen below 25%', '#ff5468', 3);
          break;
        case 'heart':
          this.showBanner('HEART OF THE DEEP SECURED', 'The Core is destabilising — get topside!', '#ff5ad1', 4);
          P.flash(c(e.x), c(e.y), TILE * 8, 1.2, 1);
          P.burst(c(e.x), c(e.y), { n: 40, color: ['#ff5ad1', '#ffa6ea', '#ffffff'], speed: 200, size: 4, life: 1, gravity: 0 });
          this.addShake(14);
          break;
        case 'evac':
          this.toast('Evac beacon lit — hold tight', '#ffcf4a', 2);
          break;
        case 'extracted':
          this.showBanner('EXTRACTED', 'Cargo secured topside', '#7dff9a', 3);
          break;
        case 'death':
          P.burst(c(e.x), c(e.y), { n: 60, color: ['#ffcf5a', '#ff7a2a', '#f2b632', '#3a3540'], speed: 260, size: 5, life: 1.1 });
          P.flash(c(e.x), c(e.y), TILE * 5, 0.8, 1);
          this.addShake(18);
          this.showBanner('RIG LOST', e.cause ? `Cause: ${e.cause}` : '', '#ff5468', 3);
          break;
        case 'noItem': {
          const def = CONSUMABLES.find((x) => x.id === e.id);
          this.toast(`No ${def ? def.name : 'supply'} aboard`, '#a89cb8', 1.4, `no-${e.id}`, 1);
          break;
        }
        case 'notice':
          this.toast(e.text, '#a89cb8', 1.4, e.text, 1);
          break;
        case 'itemUsed':
          if (e.id === 'o2can') P.burst(c(e.x), c(e.y), { n: 14, color: ['#bdf0ff', '#7fd8ff'], speed: 70, gravity: -120, size: 3, life: 0.8 });
          if (e.id === 'repair') P.burst(c(e.x), c(e.y), { n: 14, color: ['#7dff9a', '#ffffff'], speed: 70, gravity: -60, size: 3, life: 0.8 });
          break;
        case 'shoot':
          P.burst(c(e.x), c(e.y), { n: 4, color: '#b4e05a', speed: 50, size: 2, life: 0.3 });
          break;
        case 'projectileHit':
        case 'projectilePop':
          P.burst(e.x * TILE, e.y * TILE, { n: 8, color: ['#b4e05a', '#e07cc8'], speed: 70, size: 3, life: 0.4 });
          break;
        default:
          break;
      }
    }
  }

  // ------------------------------------------------------------ frame

  updateCamera(dive, dt, opts) {
    const v = this.view;
    const worldPx = dive.world.w * TILE;
    let tx;
    let ty;
    if (opts.camY !== undefined) {
      ty = opts.camY;
      tx = worldPx / 2 - v.w / 2;
    } else {
      const p = dive.rig.renderPos();
      tx = (p.x + 0.5) * TILE - v.w / 2;
      ty = (p.y + 0.5) * TILE - v.h * 0.45;
    }
    tx = v.w >= worldPx ? (worldPx - v.w) / 2 : Math.max(0, Math.min(worldPx - v.w, tx));
    ty = Math.max(-v.h * 0.4, ty);
    if (this.camFor !== dive || opts.snap) {
      this.cam.x = tx;
      this.cam.y = ty;
      this.camFor = dive;
    } else {
      const k = 1 - Math.exp(-dt * 9);
      this.cam.x += (tx - this.cam.x) * k;
      this.cam.y += (ty - this.cam.y) * k;
    }
  }

  render(dive, dt, opts = {}) {
    this.time += dt;
    this.frameDt = dt;
    const ctx = this.ctx;
    const v = this.view;
    v.touch = !!opts.touch;
    this.particles.update(dt);
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < t.dur);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt * 1.6);
    const warn = dive.tremors.warning;
    if (warn && opts.hud !== false) this.shake = Math.max(this.shake, 2 + 4 * (1 - warn.t / warn.total));
    this.shake = Math.max(0, this.shake - dt * 30);

    this.updateCamera(dive, dt, opts);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const camX = Math.round(this.cam.x + sx);
    const camY = Math.round(this.cam.y + sy);

    ctx.setTransform(v.k, 0, 0, v.k, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#07060b';
    ctx.fillRect(0, 0, v.w, v.h);
    this.drawSky(ctx, camX, camY);

    ctx.save();
    ctx.translate(-camX, -camY);
    this.drawTiles(ctx, dive, camX, camY);
    this.drawOutpost(ctx, dive);
    this.drawDrillCracks(ctx, dive);
    this.drawCharges(ctx, dive);
    this.drawEnemies(ctx, dive);
    if (opts.showRig !== false) this.drawRig(ctx, dive);
    this.drawProjectiles(ctx, dive);
    this.drawClouds(ctx, dive);
    this.particles.draw(ctx, FONT);
    ctx.restore();

    this.drawLighting(ctx, dive, camX, camY, opts);
    // The shift warning sits above the darkness so it reads even outside lamp range.
    ctx.save();
    ctx.translate(-camX, -camY);
    if (opts.showRig !== false && opts.rigLight !== false) this.drawLampBeam(ctx, dive);
    this.drawBandWarning(ctx, dive);
    ctx.restore();
    if (opts.hud !== false) {
      this.drawPings(ctx, dive, camX, camY);
      drawHud(ctx, v, dive, this, opts);
    }
  }

  // ------------------------------------------------------------ backdrop

  drawSky(ctx, camX, camY) {
    const v = this.view;
    const gy = SURFACE_Y * TILE - camY;
    if (gy <= 0) return;
    const top = gy - 520;
    const g = ctx.createLinearGradient(0, top, 0, gy);
    g.addColorStop(0, '#0b0a1d');
    g.addColorStop(0.5, '#2c1d47');
    g.addColorStop(0.82, '#7a3b52');
    g.addColorStop(1, '#d9763f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, v.w, gy);
    for (const s of this.stars) {
      const y = top + s.y * 330;
      if (y < 0 || y > gy - 120) continue;
      ctx.globalAlpha = 0.45 + 0.4 * Math.sin(this.time * 1.7 + s.p);
      ctx.fillStyle = '#e8e2ff';
      ctx.fillRect(Math.round(s.x * v.w), Math.round(y), s.s, s.s);
    }
    ctx.globalAlpha = 1;
    // A ringed gas giant hangs over the outpost.
    const px = v.w * 0.76;
    const py = gy - 285;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-0.35);
    ctx.strokeStyle = 'rgba(240,200,160,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 78, 16, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#e3a878';
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,80,70,0.45)';
    ctx.fillRect(-40, -10, 80, 6);
    ctx.fillRect(-38, 6, 76, 4);
    ctx.fillStyle = 'rgba(20,10,30,0.45)';
    ctx.beginPath();
    ctx.arc(14, 6, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,200,160,0.6)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 78, 16, 0, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
    // Mountain ridges.
    const ridge = (seed, base, amp, step, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = -step; x <= v.w + step; x += step) {
        const n = hash2(Math.floor((x + camX * 0.2) / step), seed, 5);
        ctx.lineTo(x, gy - base - n * amp);
      }
      ctx.lineTo(v.w, gy);
      ctx.closePath();
      ctx.fill();
    };
    ridge(1, 40, 90, 48, '#3a2246');
    ridge(2, 10, 50, 30, '#1f1428');
  }

  drawOutpost(ctx, dive) {
    const gy = SURFACE_Y * TILE;
    const t = this.time;
    const blink = (Math.sin(t * 4) > 0);
    // Derrick on the left.
    const dx = 2.5 * TILE;
    ctx.strokeStyle = '#4a3d58';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(dx, gy);
    ctx.lineTo(dx + 40, gy - 170);
    ctx.lineTo(dx + 80, gy);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let k = 1; k < 6; k++) {
      const y = gy - k * 28;
      const inset = (k * 28 * 40) / 170;
      ctx.beginPath();
      ctx.moveTo(dx + inset, y);
      ctx.lineTo(dx + 80 - inset, y);
      ctx.moveTo(dx + inset, y);
      ctx.lineTo(dx + 80 - inset - 6, y + 28);
      ctx.stroke();
    }
    ctx.fillStyle = blink ? '#ff4d5e' : '#5a1d24';
    ctx.fillRect(dx + 37, gy - 178, 6, 6);
    // Fuel tanks.
    for (const [x, h] of [[6.2, 30], [7.3, 22]]) {
      ctx.fillStyle = '#5d6a76';
      ctx.fillRect(x * TILE, gy - h, 26, h);
      ctx.fillStyle = '#ffb340';
      ctx.fillRect(x * TILE, gy - h + 6, 26, 3);
    }
    // Habitat domes on the right.
    const dome = (cx, r, lit) => {
      ctx.fillStyle = '#2e2a3c';
      ctx.beginPath();
      ctx.arc(cx, gy, r, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = '#5a5070';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = lit;
      for (let k = -1; k <= 1; k++) ctx.fillRect(cx + k * r * 0.45 - 4, gy - r * 0.45, 8, 6);
    };
    dome(22.5 * TILE, 52, '#ffd27a');
    dome(26.3 * TILE, 34, '#8fe8ff');
    ctx.strokeStyle = '#5a5070';
    ctx.beginPath();
    ctx.moveTo(22.5 * TILE, gy - 52);
    ctx.lineTo(22.5 * TILE, gy - 92);
    ctx.stroke();
    ctx.fillStyle = blink ? '#7dff9a' : '#24462c';
    ctx.fillRect(22.5 * TILE - 3, gy - 96, 6, 6);
    // Landing beacons either side of the drop zone.
    for (const x of [12.5, 17.5]) {
      ctx.fillStyle = '#3a3448';
      ctx.fillRect(x * TILE - 2, gy - 22, 4, 22);
      const on = Math.sin(t * 3 + x) > 0;
      ctx.fillStyle = on ? '#ffb340' : '#5a3a10';
      ctx.fillRect(x * TILE - 4, gy - 28, 8, 6);
    }
    // Sign.
    ctx.fillStyle = '#2a2236';
    ctx.fillRect(9.2 * TILE, gy - 34, 74, 18);
    ctx.fillRect(9.2 * TILE + 35, gy - 16, 4, 16);
    ctx.fillStyle = '#ffb340';
    ctx.font = `700 9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DEEP CORE', 9.2 * TILE + 37, gy - 25);
    if (dive.rig.depth < 0 && dive.status === 'active' && !dive.rig.maxDepth) {
      ctx.fillStyle = 'rgba(255,179,64,0.85)';
      ctx.font = `700 11px ${FONT}`;
      const bob = Math.sin(t * 4) * 3;
      ctx.fillText('▼ DRILL DOWN ▼', (dive.rig.x + 0.5) * TILE, gy + 2.2 * TILE + bob);
    }
  }

  // ------------------------------------------------------------ terrain

  drawTiles(ctx, dive, camX, camY) {
    const { world } = dive;
    const tex = this.tex;
    const v = this.view;
    const x0 = Math.floor(camX / TILE) - 1;
    const x1 = Math.ceil((camX + v.w) / TILE) + 1;
    const y0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const y1 = Math.min(world.h + 2, Math.ceil((camY + v.h) / TILE) + 1);
    const phys = dive.physics;
    for (let y = y0; y <= y1; y++) {
      const li = world.layerIndex(Math.min(world.h - 1, y));
      const host = tex.hosts[li];
      const back = tex.backwalls[li];
      for (let x = x0; x <= x1; x++) {
        const t = this.tileAt(world, x, y);
        const px = x * TILE;
        const py = y * TILE;
        const vi = (hash2(x, y, 7) * 4) | 0;
        if (t === T.AIR) {
          if (y >= SURFACE_Y) {
            ctx.drawImage(back[vi], px, py);
            this.drawAirShade(ctx, world, x, y, px, py);
          }
          continue;
        }
        if (t === T.LAVA) {
          ctx.drawImage(back[vi], px, py);
          this.drawLava(ctx, world, x, y, px, py);
          continue;
        }
        const def = TILES[t];
        if (def.object) {
          ctx.drawImage(back[vi], px, py);
          this.drawAirShade(ctx, world, x, y, px, py);
          let ox = 0;
          if (t === T.BOULDER && phys.isWobbling(x, y)) ox = Math.sin(this.time * 50) * 1.5;
          ctx.drawImage(tex.objects[t][vi], px + ox, py);
          continue;
        }
        if (t === T.HEART) {
          ctx.drawImage(back[vi], px, py);
          this.drawHeart(ctx, px, py);
          continue;
        }
        if (def.overlay) {
          ctx.drawImage(tex.tiles[host][vi], px, py);
          ctx.drawImage(tex.overlays[t][vi], px, py);
          if (def.ore && hash2(x, y, Math.floor(this.time * 1.5)) < 0.06) {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.fillRect(px + 6 + ((x * 7) % 18), py + 6 + ((y * 11) % 18), 2, 2);
          }
        } else {
          ctx.drawImage((tex.tiles[t] || tex.tiles[T.BEDROCK])[vi], px, py);
        }
        this.drawEdges(ctx, world, x, y, px, py);
        if (y === SURFACE_Y && t !== T.BEDROCK && x > 0 && x < world.w - 1) this.drawGrass(ctx, x, px, py);
      }
    }
  }

  isOpen(world, x, y) { return !TILES[this.tileAt(world, x, y)].solid; }

  drawEdges(ctx, world, x, y, px, py) {
    if (this.isOpen(world, x, y - 1)) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(px, py, TILE, 2);
    }
    if (this.isOpen(world, x, y + 1)) {
      ctx.fillStyle = 'rgba(0,0,0,0.38)';
      ctx.fillRect(px, py + TILE - 3, TILE, 3);
    }
    if (this.isOpen(world, x - 1, y)) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(px, py, 2, TILE);
    }
    if (this.isOpen(world, x + 1, y)) {
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.fillRect(px + TILE - 2, py, 2, TILE);
    }
  }

  drawAirShade(ctx, world, x, y, px, py) {
    if (!this.isOpen(world, x, y - 1)) {
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(px, py, TILE, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
      ctx.fillRect(px, py + 4, TILE, 5);
    }
    if (!this.isOpen(world, x - 1, y)) {
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(px, py, 4, TILE);
    }
    if (!this.isOpen(world, x + 1, y)) {
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      ctx.fillRect(px + TILE - 4, py, 4, TILE);
    }
  }

  drawGrass(ctx, x, px, py) {
    ctx.fillStyle = '#4f7a3a';
    ctx.fillRect(px, py, TILE, 4);
    ctx.fillStyle = '#7fae55';
    for (let k = 0; k < 5; k++) {
      const gx = px + ((x * 13 + k * 7) % 30);
      ctx.fillRect(gx, py - 3 + ((k + x) % 2), 2, 3 + ((k * x) % 2));
    }
  }

  drawLava(ctx, world, x, y, px, py) {
    const t = this.time;
    const surface = this.tileAt(world, x, y - 1) !== T.LAVA;
    const top = surface ? 5 : 0;
    ctx.fillStyle = '#b52c0c';
    ctx.fillRect(px, py + top, TILE, TILE - top);
    for (let k = 0; k < 3; k++) {
      const dir = k % 2 ? 1 : -1;
      const ox = (((x * 37 + k * 11 + t * 10 * dir) % TILE) + TILE) % TILE;
      ctx.fillStyle = k === 0 ? '#ff8a1f' : '#ff5a14';
      ctx.fillRect(px + ox - 3, py + top + 5 + k * 8 + Math.sin(t * 2 + k + x) * 2, 8, 3);
    }
    if (surface) {
      ctx.fillStyle = '#ffcf5a';
      ctx.fillRect(px, py + top - 1 + Math.round(Math.sin(t * 3 + x) * 1.2), TILE, 3);
    }
  }

  drawHeart(ctx, px, py) {
    const t = this.time;
    const pulse = 1 + Math.sin(t * 3) * 0.08;
    ctx.save();
    ctx.translate(px + 16, py + 17);
    ctx.fillStyle = 'rgba(255,90,209,0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, 15 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.scale(pulse, pulse);
    ctx.rotate(Math.sin(t * 0.8) * 0.15);
    const pts = [[0, -13], [9, -3], [5, 11], [-5, 11], [-9, -3]];
    ctx.fillStyle = '#c0309f';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff5ad1';
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(9, -3);
    ctx.lineTo(0, 2);
    ctx.lineTo(-9, -3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd0f4';
    ctx.fillRect(-2, -9, 3, 3);
    ctx.restore();
  }

  drawDrillCracks(ctx, dive) {
    const a = dive.rig.action;
    if (!a || a.type !== 'drill') return;
    const p = Math.min(1, a.t / a.dur);
    const key = `${a.tx},${a.ty},${a.dir}`;
    if (this.crack.key !== key) this.crack = { key, path: crackPath(a.dir, a.tx * 7919 + a.ty * 104729) };
    const path = this.crack.path;
    const n = Math.ceil(p * path.length);
    const px = a.tx * TILE;
    const py = a.ty * TILE;
    for (let i = 0; i < n; i++) {
      const [x, y] = path[i];
      ctx.fillStyle = i % 5 === 4 ? 'rgba(255,240,200,0.28)' : 'rgba(10,6,14,0.72)';
      ctx.fillRect(px + x * 2, py + y * 2, 2, 2);
    }
    if (Math.random() < 0.6) {
      const [dx, dy] = DIRS[a.dir];
      const hx = (dive.rig.x + 0.5 + dx * 0.5) * TILE;
      const hy = (dive.rig.y + 0.5 + dy * 0.5) * TILE;
      const def = TILES[a.tile];
      const col = def.color || TILES[this.tex.hosts[dive.world.layerIndex(a.ty)]].color || '#888';
      this.particles.burst(hx, hy, { n: 1, color: [col, '#ffe9a6'], speed: 90, size: 2, life: 0.35, angle: Math.atan2(-dy, -dx), spread: 2 });
    }
  }

  drawBandWarning(ctx, dive) {
    const w = dive.tremors.warning;
    if (!w) return;
    const k = 1 - w.t / w.total;
    const a = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(this.time * (8 + k * 14)));
    const x0 = TILE;
    const x1 = (dive.world.w - 1) * TILE;
    const y0 = w.y0 * TILE;
    const h = (w.y1 - w.y0 + 1) * TILE;
    ctx.fillStyle = `rgba(255,90,40,${a})`;
    ctx.fillRect(x0, y0, x1 - x0, h);
    ctx.fillStyle = `rgba(255,150,60,${0.5 + a})`;
    ctx.fillRect(x0, y0, x1 - x0, 2);
    ctx.fillRect(x0, y0 + h - 2, x1 - x0, 2);
    ctx.font = `700 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const arrow = w.dx > 0 ? '›››' : '‹‹‹';
    const drift = ((this.time * 60 * Math.sign(w.dx)) % 96 + 96) % 96;
    ctx.fillStyle = `rgba(255,200,120,${0.4 + a})`;
    for (let x = x0 + drift - 96; x < x1; x += 96) {
      if (x < x0 + 10) continue;
      ctx.fillText(arrow, x, y0 + h / 2);
    }
  }

  // ------------------------------------------------------------ entities

  drawCharges(ctx, dive) {
    for (const c of dive.charges) {
      const px = c.x * TILE + 16;
      const py = c.y * TILE + 22;
      ctx.fillStyle = '#7a1d24';
      ctx.fillRect(px - 5, py - 8, 10, 14);
      ctx.fillStyle = '#ff4d5e';
      ctx.fillRect(px - 5, py - 6, 10, 3);
      const on = Math.sin(this.time * (12 + (1.5 - c.fuse) * 20)) > 0;
      ctx.fillStyle = on ? '#ffffff' : '#ff4d5e';
      ctx.fillRect(px - 2, py - 12, 4, 4);
      ctx.strokeStyle = 'rgba(255,90,90,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py - 2, 14, -Math.PI / 2, -Math.PI / 2 + (c.fuse / 1.5) * Math.PI * 2);
      ctx.stroke();
    }
  }

  drawProjectiles(ctx, dive) {
    for (const p of dive.projectiles) {
      const x = p.x * TILE;
      const y = p.y * TILE;
      ctx.fillStyle = 'rgba(180,224,90,0.35)';
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d6ff7a';
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawClouds(ctx, dive) {
    for (const c of dive.clouds) {
      const r = cloudRadius(c) * TILE;
      if (r < 2) continue;
      const x = c.x * TILE;
      const y = c.y * TILE;
      const fade = Math.min(1, (c.life - c.t) / 2);
      const col = c.kind === 'gas' ? [150, 80, 220] : [190, 210, 90];
      for (let k = 0; k < 4; k++) {
        const a = this.time * (0.6 + k * 0.2) + k * 1.7;
        const ox = Math.cos(a) * r * 0.3;
        const oy = Math.sin(a * 1.3) * r * 0.25;
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r * (0.7 + k * 0.1));
        g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.28 * fade})`);
        g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8);
      }
    }
  }

  drawEnemies(ctx, dive) {
    const v = this.view;
    const top = this.cam.y - TILE * 2;
    const bot = this.cam.y + v.h + TILE * 2;
    for (const e of dive.enemies) {
      if (e.dead) continue;
      const p = e.renderPos();
      let px = (p.x + 0.5) * TILE;
      let py = (p.y + 0.5) * TILE;
      if (py < top || py > bot) continue;
      if (e.lunge > 0) {
        const k = (e.lunge / 0.18) * 7;
        px += e.lungeDir[0] * k;
        py += e.lungeDir[1] * k;
      }
      ctx.save();
      ctx.translate(px, py);
      const inRock = TILES[dive.world.get(e.x, e.y)].solid;
      if (inRock) ctx.globalAlpha = 0.55;
      drawEnemySprite(ctx, e, this.time, e.flash > 0);
      ctx.globalAlpha = 1;
      if (e.hp < e.def.hp) {
        const w = e.type === 'warden' ? 30 : 22;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(-w / 2 - 1, -21, w + 2, 5);
        ctx.fillStyle = '#ff5468';
        ctx.fillRect(-w / 2, -20, Math.max(0, w * (e.hp / e.def.hp)), 3);
      }
      ctx.restore();
    }
  }

  drawRig(ctx, dive) {
    const rig = dive.rig;
    if (dive.status === 'dead') return;
    const t = this.time;
    const dt = this.frameDt;
    const anim = this.rigAnim;
    const p = rig.renderPos();
    let px = p.x * TILE;
    let py = p.y * TILE;
    const a = rig.action;
    const drilling = !!a && a.type === 'drill';
    const ramming = !!a && a.type === 'ram';
    if (ramming) {
      const k = Math.sin(Math.min(1, a.t / a.dur) * Math.PI) * 6;
      const [dx, dy] = DIRS[a.dir];
      px += dx * k;
      py += dy * k;
    } else if (drilling && Math.random() < 0.5) {
      px += Math.random() < 0.5 ? -1 : 1; // the whole rig shudders against the rock
    }
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;

    // Evac beam.
    let lift = 0;
    if (rig.evac > 0 || dive.status === 'extracted') {
      const k = dive.status === 'extracted' && rig.evac <= 0 && rig.y >= SURFACE_Y ? 1 : 1 - Math.max(0, rig.evac) / 1.6;
      if (rig.evac > 0 || rig.y >= SURFACE_Y) {
        const beamA = 0.25 + 0.2 * Math.sin(t * 20);
        const g = ctx.createLinearGradient(cx - 20, 0, cx + 20, 0);
        g.addColorStop(0, 'rgba(255,207,74,0)');
        g.addColorStop(0.5, `rgba(255,230,150,${beamA + 0.2})`);
        g.addColorStop(1, 'rgba(255,207,74,0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 20, cy - 2000, 40, 2000 + 18);
        lift = k * k * 40;
        if (Math.random() < 0.5) this.particles.burst(cx, cy + 10, { n: 1, color: '#ffe9a6', speed: 40, gravity: -200, size: 2, life: 0.6 });
      }
    }

    // Animation state: rolling treads, suspension bob, what the pilot is doing.
    const moving = rig.moveT < 1;
    const horiz = moving && rig.fromY === rig.y && rig.fromX !== rig.x;
    const canFall = rig.canFall(dive);
    if (horiz) anim.roll += dt * 14;
    else if (drilling) anim.roll += dt * 3;
    anim.squash = Math.max(0, anim.squash - dt);
    let bob = 0;
    if (anim.squash > 0) bob = 1;
    else if (drilling) bob = Math.floor(t * 18) % 2;
    else if (horiz) bob = Math.floor(t * 7) % 2;
    else if (!moving && !canFall) bob = t % 1.3 < 0.16 ? 1 : 0; // the engine's idle chug
    const s = rig.stats;
    const hullF = rig.hull / s.maxHull;
    const state = {
      frame: Math.floor(anim.roll) % 12,
      bob,
      levels: rig.levels,
      cargo: cargoChunks(rig.cargo, rig.cargoUsed, s.cargoCap),
      heart: rig.heart,
      pulse: rig.pulseCd > 0 ? 'charging' : Math.floor(t * 2.5) % 2 ? 'beat' : 'ready',
      damage: hullF < 0.25 ? 2 : hullF < 0.5 ? 1 : 0,
      look: rig.facing === 'up' ? -1 : rig.facing === 'down' ? 1 : 0,
      flash: rig.invuln > 0.3,
    };
    const climbing = moving && rig.y < rig.fromY;
    const thrust = rig.thrusting && rig.evac <= 0 && (climbing || canFall);
    const dLevel = rig.levels.drill || 1;
    let len = dLevel >= 4 ? 5 : 4;
    if (drilling) len += Math.round(2 * Math.min(1, a.t / a.dur));
    else if (ramming) len += 2;
    const spin = drilling || ramming ? Math.floor(t * 30) : 0;
    const drillFacing = rig.facing === 'up' ? 'up' : rig.facing === 'down' ? 'down' : 'side';

    ctx.save();
    ctx.translate(Math.round(px), Math.round(py - lift));
    if (rig.faceH < 0) {
      ctx.translate(TILE, 0);
      ctx.scale(-1, 1);
    }
    if (rig.invuln > 0 && rig.invuln <= 0.3 && Math.floor(t * 24) % 2) ctx.globalAlpha = 0.5;
    if (thrust) drawFlames(ctx, rig.levels.thrusters || 1);
    ctx.drawImage(rigBodyCanvas(state), 0, 0);
    drawDrill(ctx, drillFacing, dLevel, spin, len, bob);
    ctx.restore();

    if (rig.shield > 0.5) {
      ctx.save();
      ctx.translate(Math.round(cx), Math.round(cy - lift));
      drawShieldRing(ctx, t, Math.min(1, 0.4 + rig.shield / s.maxShield), rig.sinceHit < 0.35);
      ctx.restore();
    }
    if (dive.status === 'active' && rig.evac <= 0) this.rigFx(rig, px, py, { drilling, horiz, canFall, thrust, damage: state.damage, bob });
  }

  /** Exhaust smoke, tread dust, sparks from a failing hull, embers from the thrusters. */
  rigFx(rig, px, py, f) {
    const anim = this.rigAnim;
    const dt = this.frameDt;
    const P = this.particles;
    const back = -rig.faceH;
    const cx = px + TILE / 2;
    anim.smoke -= dt;
    anim.dust -= dt;
    anim.dmg -= dt;
    if (f.drilling && anim.smoke <= 0) {
      anim.smoke = 0.11;
      const ex = rig.faceH > 0 ? px - 1 : px + TILE + 1;
      P.burst(ex, py + 15 + f.bob * 2, { n: 1, color: ['#5a5464', '#7a7484', '#3a3540'], speed: 26, angle: -Math.PI / 2 + back * 0.8, spread: 0.6, gravity: -50, size: 3, life: 0.8, drag: 0.8 });
    }
    if (f.horiz && !f.canFall && anim.dust <= 0) {
      anim.dust = 0.06;
      P.burst(cx + back * 11, py + TILE - 2, { n: 1, color: ['#8a7a6a', '#6a5a4a'], speed: 45, angle: -Math.PI / 2 + back * 0.9, spread: 0.6, gravity: 220, size: 2, life: 0.35 });
    }
    if (f.damage >= 2 && anim.dmg <= 0) {
      anim.dmg = 0.16;
      P.burst(cx - rig.faceH * 3, py + 9, { n: 1, color: ['#2a2430', '#3a3540', '#4a4552'], speed: 22, angle: -Math.PI / 2, spread: 0.5, gravity: -70, size: 4, life: 1.0, drag: 0.85 });
      if (Math.random() < 0.3) P.burst(cx, py + 16, { n: 3, color: ['#ffe9a6', '#ffb347'], speed: 120, size: 2, life: 0.25 });
    }
    if (f.thrust && Math.random() < 0.45) {
      const nx = rig.faceH > 0 ? (Math.random() < 0.5 ? 8 : 24) : (Math.random() < 0.5 ? 24 : 8);
      P.burst(px + nx, py + TILE + 8, { n: 1, color: ['#ffb347', '#ff6a2a'], speed: 50, angle: Math.PI / 2, spread: 0.7, gravity: 60, size: 2, life: 0.3 });
    }
  }

  /** A faint shaft of light from the headlamp, drawn over the darkness. */
  drawLampBeam(ctx, dive) {
    const rig = dive.rig;
    const dark = this.darkness || 0;
    if (dive.status !== 'active' || rig.evac > 0 || dark < 0.15) return;
    if (rig.facing !== 'left' && rig.facing !== 'right') return;
    const p = rig.renderPos();
    const dir = rig.faceH;
    const lx = p.x * TILE + (dir > 0 ? 28 : 4);
    const ly = p.y * TILE + 15;
    const len = rig.stats.light * dive.mod.light * TILE * (rig.blinded ? 0.5 : 0.95);
    const spread = 0.3;
    const alpha = (0.06 + 0.02 * ((rig.levels.lamp || 1) - 1)) * dark;
    const g = ctx.createLinearGradient(lx, ly, lx + dir * len, ly);
    g.addColorStop(0, `rgba(255,240,190,${alpha})`);
    g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 1);
    ctx.lineTo(lx + dir * len, ly - len * spread);
    ctx.lineTo(lx + dir * len, ly + len * spread);
    ctx.lineTo(lx, ly + 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ------------------------------------------------------------ light

  drawLighting(ctx, dive, camX, camY, opts) {
    const v = this.view;
    const centerDepth = (camY + v.h * 0.45) / TILE - SURFACE_Y;
    let dark = Math.max(0, Math.min(1, (centerDepth - 1) / 22)) * 0.96;
    if (opts.ambient !== undefined) dark = Math.min(dark, opts.ambient);
    if (dark < 0.01) return;
    const L = this.lctx;
    const s = LIGHT_SCALE;
    const lw = this.light.width;
    const lh = this.light.height;
    L.globalCompositeOperation = 'source-over';
    L.clearRect(0, 0, lw, lh);
    L.fillStyle = `rgba(4,3,9,${dark})`;
    L.fillRect(0, 0, lw, lh);
    L.globalCompositeOperation = 'destination-out';
    // Daylight spills a few metres down from the surface.
    const gy = (SURFACE_Y * TILE - camY) * s;
    if (gy > 0) {
      L.fillStyle = '#000';
      L.fillRect(0, 0, lw, gy);
    }
    if (gy > -TILE * 8 * s) {
      const g = L.createLinearGradient(0, gy, 0, gy + TILE * 7 * s);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      L.fillStyle = g;
      L.fillRect(0, Math.max(0, gy), lw, TILE * 7 * s);
    }
    const glow = this.glow;
    const punch = (wx, wy, r, a = 1) => {
      const x = (wx - camX) * s;
      const y = (wy - camY) * s;
      const rr = r * s;
      if (x < -rr || y < -rr || x > lw + rr || y > lh + rr || rr <= 0 || a <= 0) return;
      L.globalAlpha = Math.min(1, a);
      L.drawImage(glow, x - rr, y - rr, rr * 2, rr * 2);
    };
    const rig = dive.rig;
    if (opts.rigLight !== false && dive.status !== 'dead') {
      const p = rig.renderPos();
      const cx = (p.x + 0.5) * TILE;
      const cy = (p.y + 0.5) * TILE;
      const r = rig.stats.light * dive.mod.light * (rig.blinded ? 0.55 : 1) * TILE;
      punch(cx, cy, r, 1);
      const [fx, fy] = DIRS[rig.facing] || [0, 1];
      punch(cx + fx * TILE * 1.8, cy + fy * TILE * 1.8, r * 0.75, 0.85);
    }
    // Glowing tiles in view.
    const x0 = Math.floor(camX / TILE) - 2;
    const x1 = Math.ceil((camX + v.w) / TILE) + 2;
    const y0 = Math.max(SURFACE_Y, Math.floor(camY / TILE) - 2);
    const y1 = Math.min(dive.world.h - 1, Math.ceil((camY + v.h) / TILE) + 2);
    for (let y = y0; y <= y1; y++) {
      for (let x = Math.max(0, x0); x <= Math.min(dive.world.w - 1, x1); x++) {
        const gl = TILE_GLOW[dive.world.get(x, y)];
        if (gl) punch((x + 0.5) * TILE, (y + 0.5) * TILE, gl[0] * TILE, gl[1]);
      }
    }
    for (const e of dive.enemies) {
      const gl = ENEMY_GLOW[e.type];
      if (!gl) continue;
      const p = e.renderPos();
      punch((p.x + 0.5) * TILE, (p.y + 0.5) * TILE, gl[0] * TILE, gl[1]);
    }
    for (const p of dive.projectiles) punch(p.x * TILE, p.y * TILE, TILE * 0.8, 0.6);
    for (const c of dive.charges) punch((c.x + 0.5) * TILE, (c.y + 0.5) * TILE, TILE * 0.9, 0.5);
    for (const f of this.particles.flashes) punch(f.x, f.y, f.r, f.a * (1 - f.t / f.life));
    L.globalAlpha = 1;
    ctx.save();
    ctx.setTransform(v.k, 0, 0, v.k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.light, 0, 0, lw / s, lh / s);
    ctx.restore();
    this.darkness = dark;
  }

  drawPings(ctx, dive, camX, camY) {
    const rig = dive.rig;
    const range = rig.stats.ping;
    if (!range || (this.darkness || 0) < 0.3 || dive.status !== 'active') return;
    const light = rig.stats.light * dive.mod.light * 0.85;
    const v = this.view;
    ctx.save();
    ctx.setTransform(v.k, 0, 0, v.k, 0, 0);
    const p = rig.renderPos();
    for (let y = Math.floor(p.y - range); y <= Math.ceil(p.y + range); y++) {
      for (let x = 1; x < dive.world.w - 1; x++) {
        const d = Math.hypot(x - p.x, y - p.y);
        if (d > range || d < light) continue;
        const ore = TILES[dive.world.get(x, y)].ore;
        if (!ore) continue;
        const a = (0.35 + 0.3 * Math.sin(this.time * 4 + x * 0.7 + y)) * (1 - d / (range + 1));
        ctx.globalAlpha = Math.max(0.08, a);
        ctx.fillStyle = ITEMS[ore].color;
        ctx.fillRect(Math.round((x + 0.5) * TILE - camX - 2), Math.round((y + 0.5) * TILE - camY - 2), 4, 4);
      }
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------ sprites

/** A soft radial falloff, stamped (scaled) wherever light cuts through the dark. */
function makeGlowSprite() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(0.5, 'rgba(0,0,0,0.8)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** Crack texels for a tile being drilled, growing from the side the drill bites. */
function crackPath(dir, seed) {
  const rng = new RNG(seed);
  const [dx, dy] = DIRS[dir];
  const ex = dx > 0 ? 0 : dx < 0 ? 15 : 7;
  const ey = dy > 0 ? 0 : dy < 0 ? 15 : 7;
  const branches = [-1, 0, 1].map((sway) => ({ x: ex, y: ey, sway }));
  const out = [];
  const seen = new Set();
  for (let step = 0; step < 13; step++) {
    for (const b of branches) {
      if (rng.chance(0.8)) {
        b.x += dx;
        b.y += dy;
      }
      const lat = rng.chance(0.55) ? b.sway : rng.sign();
      b.x += lat * Math.abs(dy);
      b.y += lat * Math.abs(dx);
      b.x = Math.max(0, Math.min(15, b.x));
      b.y = Math.max(0, Math.min(15, b.y));
      const k = b.y * 16 + b.x;
      if (!seen.has(k)) {
        seen.add(k);
        out.push([b.x, b.y]);
      }
    }
  }
  return out;
}

function drawEnemySprite(ctx, e, t, flash) {
  const W = flash ? '#ffffff' : null;
  const ph = e.phase + t;
  ctx.scale(e.faceX || 1, 1);
  switch (e.type) {
    case 'grub': {
      for (let k = 2; k >= 0; k--) {
        const x = -k * 7 + 3;
        const y = Math.sin(ph * 6 - k) * 2 + 3;
        ctx.fillStyle = W || (k % 2 ? '#b86c6c' : '#d98c8c');
        ctx.beginPath();
        ctx.arc(x, y, 7 - k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = W || '#3a2020';
      ctx.fillRect(9, 0, 4, 2);
      ctx.fillRect(9, 5, 4, 2);
      ctx.fillStyle = '#1a0a0a';
      ctx.fillRect(5, 0, 2, 2);
      break;
    }
    case 'gloomwing': {
      const flap = Math.sin(ph * 18);
      ctx.fillStyle = W || '#6a4c9c';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -1);
        ctx.lineTo(s * 14, -6 - flap * 6);
        ctx.lineTo(s * 10, 2 + flap * 2);
        ctx.lineTo(s * 4, 3);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = W || '#3a2a55';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4060';
      ctx.fillRect(1, -3, 2, 2);
      ctx.fillRect(-3, -3, 2, 2);
      break;
    }
    case 'sporeling': {
      const bob = Math.abs(Math.sin(ph * 5)) * 2;
      ctx.strokeStyle = W || '#6a5a40';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(s * 3, 6 - bob);
        ctx.lineTo(s * 7, 14);
      }
      ctx.stroke();
      ctx.fillStyle = W || '#d8d0b0';
      ctx.fillRect(-4, -1 - bob, 8, 9);
      ctx.fillStyle = W || '#9ad35a';
      ctx.beginPath();
      ctx.ellipse(0, -3 - bob, 12, 8, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-12, -4 - bob, 24, 3);
      ctx.fillStyle = W || '#e8ffd0';
      ctx.fillRect(-6, -8 - bob, 3, 3);
      ctx.fillRect(3, -6 - bob, 2, 2);
      ctx.fillStyle = '#1a2a10';
      ctx.fillRect(1, 1 - bob, 2, 2);
      break;
    }
    case 'magmaslug': {
      const squish = Math.sin(ph * 3) * 1.5;
      ctx.fillStyle = W || '#5a1a0a';
      ctx.beginPath();
      ctx.ellipse(0, 5, 14 + squish, 9 - squish, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-14 - squish, 4, 28 + squish * 2, 9);
      const glow = 0.6 + 0.4 * Math.sin(ph * 4);
      ctx.fillStyle = W || `rgba(255,${120 + glow * 60},40,${0.7 + glow * 0.3})`;
      ctx.fillRect(-8, 2, 10, 2);
      ctx.fillRect(-3, 7, 9, 2);
      ctx.fillRect(4, 3, 2, 5);
      ctx.strokeStyle = W || '#5a1a0a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, -2);
      ctx.lineTo(11, -9);
      ctx.stroke();
      ctx.fillStyle = '#ffcf5a';
      ctx.fillRect(10, -11, 3, 3);
      break;
    }
    case 'shardmite': {
      const step = Math.sin(ph * 20) * 2;
      ctx.strokeStyle = W || '#3a8aa0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(0, 2);
        ctx.lineTo(s * 9, 6 + step * s);
        ctx.moveTo(0, 2);
        ctx.lineTo(s * 8, -2 - step * s);
      }
      ctx.stroke();
      ctx.fillStyle = W || '#7fe8ff';
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(6, 1);
      ctx.lineTo(0, 7);
      ctx.lineTo(-6, 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = W || '#dffaff';
      ctx.fillRect(-1, -5, 2, 4);
      break;
    }
    case 'warden': {
      ctx.scale(e.faceX || 1, 1); // the eye does not mirror
      ctx.save();
      ctx.rotate(t * 1.2);
      ctx.strokeStyle = W || '#c070ff';
      ctx.lineWidth = 2.5;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, 16, k * (Math.PI / 3), k * (Math.PI / 3) + 0.7);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = W || '#1a0a2a';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = W || '#ff5ad1';
      const look = Math.sin(t * 0.7) * 2;
      ctx.beginPath();
      ctx.arc(look, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(look - 1, -3, 2, 2);
      break;
    }
    default:
      ctx.fillStyle = W || '#f0f';
      ctx.fillRect(-8, -8, 16, 16);
  }
}
