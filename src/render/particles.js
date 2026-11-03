// Lightweight particle effects in world-pixel coordinates.

const MAX_PARTICLES = 700;

export class Particles {
  constructor() {
    this.list = [];
    this.texts = [];
    this.rings = [];
    this.flashes = []; // light sources that briefly punch through the darkness
  }

  clear() {
    this.list.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.flashes.length = 0;
  }

  burst(x, y, { n = 8, color = '#fff', speed = 90, life = 0.6, gravity = 320, size = 3, angle = 0, spread = Math.PI * 2, drag = 0.9 } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= MAX_PARTICLES) this.list.shift();
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed * (0.35 + Math.random() * 0.75);
      const l = life * (0.6 + Math.random() * 0.6);
      this.list.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l,
        color: Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color,
        size: size * (0.6 + Math.random() * 0.7), gravity, drag,
      });
    }
  }

  text(x, y, str, color = '#fff', size = 13) {
    // Nudge stacked texts apart so rapid pickups stay readable.
    const recent = this.texts.filter((t) => t.t < 0.25 && Math.abs(t.x - x) < 40 && Math.abs(t.y - y) < 30).length;
    this.texts.push({ x, y: y - recent * 14, str, color, size, t: 0, life: 1.2 });
  }

  ring(x, y, r, color, life = 0.45, width = 3) {
    this.rings.push({ x, y, r, color, t: 0, life, width });
  }

  flash(x, y, r, life = 0.35, a = 1) {
    this.flashes.push({ x, y, r, t: 0, life, a });
  }

  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      const d = Math.pow(p.drag, dt * 10);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
    for (const t of this.texts) t.t += dt;
    this.texts = this.texts.filter((t) => t.t < t.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.life);
  }

  draw(ctx, font) {
    for (const p of this.list) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.ceil(s), Math.ceil(s));
    }
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(1, r.r * (0.25 + 0.75 * Math.sqrt(k))), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.t / t.life;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = `700 ${t.size}px ${font}`;
      const y = t.y - 26 * Math.sqrt(k);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(t.str, t.x + 1, y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, y);
    }
    ctx.globalAlpha = 1;
  }
}
