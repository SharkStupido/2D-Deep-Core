// Heads-up display, drawn in view space over the scene.
import { T, LAYERS, BEDROCK_DEPTH, CORE_CHAMBER, CONSUMABLES, ITEMS } from '../config.js';

export const FONT = '"Chakra Petch", "Segoe UI", system-ui, sans-serif';

const C = {
  panel: 'rgba(12,9,20,0.78)',
  edge: 'rgba(255,179,64,0.28)',
  text: '#ece6f5',
  dim: '#9a90ad',
  amber: '#ffb340',
  hull: '#ff5468',
  shield: '#5fe1ff',
  o2: '#7fd8ff',
};

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = C.panel;
  ctx.beginPath();
  ctx.moveTo(x + 6, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - 6);
  ctx.lineTo(x + w - 6, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = C.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bar(ctx, x, y, w, h, frac, color, warn = false, t = 0) {
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(x, y, w, h);
  const f = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = warn && Math.sin(t * 10) > 0 ? '#ffffff' : color;
  ctx.fillRect(x, y, Math.round(w * f), h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y, Math.round(w * f), Math.max(1, Math.floor(h / 4)));
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let k = 1; k < 10; k++) ctx.fillRect(x + Math.round((w * k) / 10), y, 1, h);
}

function label(ctx, text, x, y, color = C.dim, size = 11, align = 'left', weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function shadowLabel(ctx, text, x, y) {
  label(ctx, text, x + 1, y + 1, 'rgba(0,0,0,0.85)', 11, 'right', 700);
  label(ctx, text, x, y, C.text, 11, 'right', 700);
}

function drawIcon(ctx, id, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  switch (id) {
    case 'evac':
      ctx.strokeStyle = '#ffcf4a';
      ctx.beginPath();
      ctx.arc(0, 2, s * 0.42, Math.PI * 0.15, Math.PI * 0.85, true);
      ctx.stroke();
      ctx.fillStyle = '#ffcf4a';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(s * 0.28, -s * 0.12);
      ctx.lineTo(-s * 0.28, -s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(-2, -s * 0.15, 4, s * 0.45);
      break;
    case 'o2can':
      ctx.fillStyle = '#5fe1ff';
      ctx.fillRect(-s * 0.2, -s * 0.38, s * 0.4, s * 0.78);
      ctx.fillStyle = '#d8f8ff';
      ctx.fillRect(-s * 0.1, -s * 0.5, s * 0.2, s * 0.14);
      ctx.fillStyle = '#0d2a35';
      ctx.font = `700 ${Math.round(s * 0.26)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('O₂', 0, 0);
      break;
    case 'repair':
      ctx.fillStyle = '#7dff9a';
      ctx.fillRect(-s * 0.36, -s * 0.12, s * 0.72, s * 0.24);
      ctx.fillRect(-s * 0.12, -s * 0.36, s * 0.24, s * 0.72);
      break;
    case 'charge':
      ctx.fillStyle = '#ff5468';
      ctx.fillRect(-s * 0.18, -s * 0.22, s * 0.36, s * 0.6);
      ctx.strokeStyle = '#ffcf5a';
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.22);
      ctx.quadraticCurveTo(s * 0.1, -s * 0.48, s * 0.3, -s * 0.42);
      ctx.stroke();
      break;
    case 'pulse':
      ctx.strokeStyle = '#b48bff';
      for (const r of [0.18, 0.32, 0.46]) {
        ctx.beginPath();
        ctx.arc(0, 0, s * r, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    default:
      break;
  }
  ctx.restore();
}

export function drawHud(ctx, v, dive, r, opts = {}) {
  const rig = dive.rig;
  const s = rig.stats;
  const t = r.time;
  const narrow = v.w < 700;
  ctx.save();
  ctx.setTransform(v.k, 0, 0, v.k, 0, 0);

  // Damage and suffocation vignettes.
  const o2f = rig.o2 / s.maxO2;
  if (r.hitFlash > 0 || o2f < 0.2) {
    const a = Math.max(r.hitFlash, o2f < 0.2 ? (0.2 - o2f) * 2.2 * (0.6 + 0.4 * Math.sin(t * 6)) : 0);
    const g = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.3, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.7);
    g.addColorStop(0, 'rgba(255,40,60,0)');
    g.addColorStop(1, `rgba(255,40,60,${Math.min(0.55, a)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, v.w, v.h);
  }

  // Vitals.
  const pw = narrow ? 210 : 248;
  panel(ctx, 10, 10, pw, 76);
  const bx = 52;
  const bw = pw - bx - 10 + 10;
  label(ctx, 'HULL', 20, 25, C.dim, 11);
  bar(ctx, bx, 19, bw - 10, 12, rig.hull / s.maxHull, C.hull, rig.hull / s.maxHull < 0.25, t);
  shadowLabel(ctx, `${Math.ceil(rig.hull)}`, bx + bw - 14, 25);
  label(ctx, 'SHLD', 20, 41, C.dim, 11);
  bar(ctx, bx, 37, bw - 10, 7, s.maxShield ? rig.shield / s.maxShield : 0, C.shield);
  label(ctx, 'O₂', 20, 63, rig.inGas ? '#c49bff' : C.dim, 12, 'left', 700);
  bar(ctx, bx, 56, bw - 10, 14, o2f, rig.inGas ? '#b47cff' : C.o2, o2f < 0.25, t);
  shadowLabel(ctx, `${Math.ceil(rig.o2)}`, bx + bw - 14, 63);

  // Depth, layer and cargo.
  const dw = narrow ? 168 : 214;
  const dx = v.w - dw - 10;
  panel(ctx, dx, 10, dw, 76);
  const depth = Math.max(0, rig.depth);
  const L = LAYERS[dive.world.layerIndex(rig.y)];
  label(ctx, `${depth}`, dx + dw - 46, 30, C.text, narrow ? 24 : 28, 'right', 700);
  label(ctx, 'm', dx + dw - 42, 34, C.dim, 13);
  label(ctx, rig.depth <= 0 ? 'TOPSIDE' : L.name.toUpperCase(), dx + 12, 24, rig.depth <= 0 ? C.amber : L.accent, 10, 'left', 700);
  label(ctx, `best ${dive.record.maxDepth} m`, dx + 12, 38, C.dim, 10);
  const cap = s.cargoCap;
  const full = rig.cargoUsed >= cap;
  label(ctx, 'CARGO', dx + 12, 58, full ? C.hull : C.dim, 10, 'left', 700);
  label(ctx, `${rig.cargoUsed}/${cap}`, dx + dw - 12, 58, full ? C.hull : C.text, 11, 'right', 700);
  bar(ctx, dx + 12, 66, dw - 24, 6, rig.cargoUsed / cap, full ? C.hull : C.amber);
  let value = 0;
  for (const [id, n] of Object.entries(rig.cargo)) value += (ITEMS[id]?.value || 0) * n;
  value = Math.round(value * (dive.mod.value || 1));
  label(ctx, `$${value.toLocaleString()}`, dx + 60, 58, '#7dff9a', 11, 'left', 700);

  // Depth gauge.
  const gx = v.w - 16;
  const gy0 = 100;
  const gy1 = v.touch ? v.h * 0.48 : v.h - 96;
  const gh = gy1 - gy0;
  if (gh > 80) {
    for (const lay of LAYERS) {
      const a = gy0 + (Math.min(lay.from, BEDROCK_DEPTH) / BEDROCK_DEPTH) * gh;
      const b = gy0 + (Math.min(lay.to, BEDROCK_DEPTH) / BEDROCK_DEPTH) * gh;
      ctx.fillStyle = lay.accent;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(gx, a, 5, b - a - 1);
    }
    ctx.globalAlpha = 1;
    const best = gy0 + (dive.record.maxDepth / BEDROCK_DEPTH) * gh;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(gx - 3, best, 11, 1);
    if (!rig.heart && dive.chamber && dive.world.get(dive.chamber.cx, dive.chamber.floor) === T.HEART) {
      const hy = gy0 + (CORE_CHAMBER.depth / BEDROCK_DEPTH) * gh;
      ctx.fillStyle = `rgba(255,90,209,${0.6 + 0.4 * Math.sin(t * 3)})`;
      ctx.beginPath();
      ctx.moveTo(gx + 2.5, hy - 5);
      ctx.lineTo(gx + 7, hy);
      ctx.lineTo(gx + 2.5, hy + 5);
      ctx.lineTo(gx - 2, hy);
      ctx.closePath();
      ctx.fill();
    }
    const my = gy0 + (Math.max(0, Math.min(BEDROCK_DEPTH, depth)) / BEDROCK_DEPTH) * gh;
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.moveTo(gx - 2, my);
    ctx.lineTo(gx - 9, my - 5);
    ctx.lineTo(gx - 9, my + 5);
    ctx.closePath();
    ctx.fill();
  }

  // Supplies and pulse.
  const slots = [...CONSUMABLES.map((c) => ({ id: c.id, key: c.key, count: dive.inventory[c.id] || 0 })), { id: 'pulse', key: 'SPC' }];
  const size = 44;
  const gap = 8;
  r.hudSlots = [];
  slots.forEach((sl, i) => {
    let x;
    let y;
    if (v.touch) {
      x = v.w - size - 12;
      y = v.h - (slots.length - i) * (size + gap) - 12;
    } else {
      const total = slots.length * size + (slots.length - 1) * gap;
      x = v.w / 2 - total / 2 + i * (size + gap);
      y = v.h - size - 12;
    }
    r.hudSlots.push({ id: sl.id, x, y, w: size, h: size });
    const empty = sl.id !== 'pulse' && !sl.count;
    ctx.globalAlpha = empty ? 0.45 : 1;
    panel(ctx, x, y, size, size);
    drawIcon(ctx, sl.id, x + size / 2, y + size / 2 + 2, size * 0.62);
    if (sl.id === 'pulse' && rig.pulseCd > 0) {
      const f = rig.pulseCd / s.pulseCd;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x + 1, y + 1, size - 2, (size - 2) * f);
      label(ctx, rig.pulseCd.toFixed(1), x + size / 2, y + size / 2 + 2, C.text, 11, 'center', 700);
    }
    if (!v.touch) label(ctx, sl.key, x + 5, y + 8, C.dim, 9, 'left', 700);
    if (sl.id !== 'pulse') label(ctx, `${sl.count}`, x + size - 5, y + size - 8, sl.count ? C.text : C.dim, 11, 'right', 700);
    ctx.globalAlpha = 1;
  });

  // Status line.
  let sy = 104;
  const centerLine = (text, color, bg) => {
    ctx.font = `700 13px ${FONT}`;
    const w = ctx.measureText(text).width + 24;
    ctx.fillStyle = bg;
    ctx.fillRect(v.w / 2 - w / 2, sy - 11, w, 22);
    label(ctx, text, v.w / 2, sy, color, 13, 'center', 700);
    sy += 28;
  };
  const warn = dive.tremors.warning;
  if (warn) centerLine(`⚠ STRATA SHIFT ${Math.max(0, warn.t).toFixed(1)}s`, '#ffd0a0', 'rgba(140,40,10,0.75)');
  if (rig.heart && dive.status === 'active') centerLine('HEART SECURED — RETURN TOPSIDE', '#ffd0f4', 'rgba(90,20,70,0.7)');
  if (o2f < 0.25 && dive.status === 'active' && Math.sin(t * 8) > -0.3) {
    centerLine(o2f < 0.1 ? 'OXYGEN CRITICAL' : 'LOW OXYGEN', '#ffffff', 'rgba(160,20,40,0.75)');
  }
  if (rig.inLava && dive.status === 'active') centerLine('HULL MELTING', '#ffd0a0', 'rgba(160,50,10,0.75)');

  // Toasts.
  for (const toast of r.toasts) {
    const k = toast.t / toast.dur;
    ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, toast.t * 6);
    ctx.font = `600 12px ${FONT}`;
    const w = ctx.measureText(toast.text).width + 20;
    ctx.fillStyle = 'rgba(12,9,20,0.7)';
    ctx.fillRect(v.w / 2 - w / 2, sy - 10, w, 20);
    label(ctx, toast.text, v.w / 2, sy, toast.color, 12, 'center', 600);
    sy += 24;
  }
  ctx.globalAlpha = 1;

  // Banner.
  if (r.banner) {
    const b = r.banner;
    const k = b.t / b.dur;
    const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
    ctx.globalAlpha = Math.max(0, a);
    const by = v.h * 0.34;
    const g = ctx.createLinearGradient(0, 0, v.w, 0);
    g.addColorStop(0, 'rgba(8,6,14,0)');
    g.addColorStop(0.5, 'rgba(8,6,14,0.75)');
    g.addColorStop(1, 'rgba(8,6,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, by - 34, v.w, b.sub ? 74 : 56);
    label(ctx, b.title, v.w / 2, by - 4, b.color, narrow ? 22 : 30, 'center', 700);
    if (b.sub) label(ctx, b.sub, v.w / 2, by + 24, C.text, 13, 'center', 500);
    ctx.globalAlpha = 1;
  }

  if (opts.muted) label(ctx, 'MUTED', 14, v.h - 16, C.dim, 10, 'left', 700);
  ctx.restore();
}
