// Synthesised sound effects (Web Audio). No audio files to load.
import { TILES } from './config.js';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.last = new Map();
    this.alarmT = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.45;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.setupLoops();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.45, this.ctx.currentTime, 0.02);
  }

  setupLoops() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    this.drillFilter = c.createBiquadFilter();
    this.drillFilter.type = 'bandpass';
    this.drillFilter.frequency.value = 600;
    this.drillFilter.Q.value = 1.2;
    this.drillGain = c.createGain();
    this.drillGain.gain.value = 0;
    src.connect(this.drillFilter).connect(this.drillGain).connect(this.master);
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 55;
    this.drillOsc = osc;
    const og = c.createGain();
    og.gain.value = 0.25;
    osc.connect(og).connect(this.drillGain);
    const src2 = c.createBufferSource();
    src2.buffer = this.noiseBuf;
    src2.loop = true;
    const tf = c.createBiquadFilter();
    tf.type = 'lowpass';
    tf.frequency.value = 900;
    this.thrustGain = c.createGain();
    this.thrustGain.gain.value = 0;
    src2.connect(tf).connect(this.thrustGain).connect(this.master);
    src.start();
    src2.start();
    osc.start();
  }

  tone(freq, dur, { type = 'square', vol = 0.15, slide = 0, delay = 0, attack = 0.005 } = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  noise(dur, { vol = 0.25, freq = 1000, type = 'lowpass', slide = 0, delay = 0, q = 0.8 } = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    const t0 = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.02);
  }

  play(name, gap = 0.04) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) || -1) < gap) return;
    this.last.set(name, now);
    const arp = (notes, step = 0.07, type = 'triangle', vol = 0.12) =>
      notes.forEach((n, i) => this.tone(n, 0.18, { type, vol, delay: i * step }));
    switch (name) {
      case 'break': this.noise(0.09, { vol: 0.2, freq: 900 }); this.tone(140, 0.07, { slide: -70, vol: 0.06 }); break;
      case 'pickup': this.tone(700, 0.08, { type: 'sine', vol: 0.14, slide: 400 }); this.tone(1400, 0.08, { type: 'sine', vol: 0.06, delay: 0.05 }); break;
      case 'pickupRare': arp([880, 1175, 1568], 0.05, 'sine', 0.12); break;
      case 'o2': this.tone(500, 0.18, { type: 'sine', vol: 0.12, slide: 300 }); this.noise(0.2, { vol: 0.08, freq: 3000, type: 'highpass' }); break;
      case 'crate': arp([523, 659, 784]); break;
      case 'cargoFull': this.tone(220, 0.12, { vol: 0.08 }); this.tone(196, 0.12, { vol: 0.08, delay: 0.13 }); break;
      case 'bump': this.tone(110, 0.06, { vol: 0.06 }); break;
      case 'land': this.noise(0.15, { vol: 0.35, freq: 300 }); break;
      case 'hit': this.noise(0.12, { vol: 0.3, freq: 1600 }); this.tone(190, 0.15, { slide: -110, vol: 0.12 }); break;
      case 'shield': this.tone(900, 0.12, { type: 'sine', slide: -350, vol: 0.1 }); break;
      case 'enemyHurt': this.tone(320, 0.06, { slide: -120, vol: 0.06 }); break;
      case 'enemyKilled': this.noise(0.22, { vol: 0.2, freq: 1200, slide: -900 }); this.tone(420, 0.25, { type: 'sawtooth', slide: -360, vol: 0.08 }); break;
      case 'ram': this.noise(0.07, { vol: 0.2, freq: 2400, type: 'highpass' }); break;
      case 'pulse': this.tone(180, 0.3, { type: 'sine', slide: 800, vol: 0.18 }); this.noise(0.25, { vol: 0.12, freq: 400, slide: 2000 }); break;
      case 'explosion': this.noise(0.7, { vol: 0.55, freq: 900, slide: -820 }); this.tone(90, 0.5, { type: 'sine', slide: -60, vol: 0.3 }); break;
      case 'armed': this.tone(880, 0.05, { vol: 0.06 }); this.tone(880, 0.05, { vol: 0.06, delay: 0.1 }); break;
      case 'rumble': this.noise(2.4, { vol: 0.35, freq: 140, q: 0.5 }); [0, 0.7, 1.4].forEach((d) => this.tone(440, 0.18, { delay: d, vol: 0.07 })); break;
      case 'tremor': this.noise(0.9, { vol: 0.6, freq: 220, slide: -150 }); break;
      case 'creak': this.noise(0.35, { vol: 0.12, freq: 260, q: 4, type: 'bandpass' }); break;
      case 'thud': this.noise(0.22, { vol: 0.35, freq: 260 }); break;
      case 'layer': this.tone(330, 0.5, { type: 'sine', vol: 0.08 }); this.tone(495, 0.6, { type: 'sine', vol: 0.06, delay: 0.15 }); break;
      case 'alarm': this.tone(880, 0.12, { vol: 0.07 }); this.tone(660, 0.12, { vol: 0.07, delay: 0.14 }); break;
      case 'heart': arp([392, 523, 659, 784, 1046], 0.09, 'sine', 0.14); this.noise(1.2, { vol: 0.2, freq: 200, slide: 1800 }); break;
      case 'evac': this.tone(260, 1.5, { type: 'sine', slide: 1000, vol: 0.14 }); break;
      case 'extracted': arp([523, 659, 784, 1046], 0.08, 'triangle', 0.14); break;
      case 'death': this.noise(1.0, { vol: 0.6, freq: 1200, slide: -1100 }); this.tone(300, 1.2, { type: 'sawtooth', slide: -260, vol: 0.12 }); break;
      case 'hiss': this.noise(0.6, { vol: 0.16, freq: 1800, type: 'bandpass', q: 0.6 }); break;
      case 'shoot': this.tone(500, 0.1, { type: 'sine', slide: -200, vol: 0.06 }); break;
      case 'splat': this.noise(0.1, { vol: 0.12, freq: 700 }); break;
      case 'deny': this.tone(160, 0.1, { vol: 0.07 }); break;
      case 'use': this.tone(600, 0.15, { type: 'sine', slide: 300, vol: 0.1 }); break;
      case 'buy': arp([660, 990], 0.06, 'triangle', 0.1); break;
      case 'click': this.tone(1200, 0.03, { type: 'sine', vol: 0.05 }); break;
      case 'launch': this.noise(0.6, { vol: 0.2, freq: 300, slide: 1200 }); break;
      default: break;
    }
  }

  handleEvents(events, dive) {
    for (const e of events) {
      switch (e.type) {
        case 'break': this.play('break', 0.03); break;
        case 'pickup': this.play(['diamond', 'voidglass', 'coreshard', 'sapphire', 'ruby'].includes(e.item) ? 'pickupRare' : 'pickup'); break;
        case 'o2': this.play('o2'); break;
        case 'crate': this.play('crate'); break;
        case 'cargoFull': this.play('cargoFull', 0.5); break;
        case 'tooHard': case 'bump': this.play('bump', 0.3); break;
        case 'land': if (e.hard) this.play('land'); break;
        case 'rigHit': this.play('hit'); break;
        case 'shieldHit': this.play('shield'); break;
        case 'enemyHurt': this.play('enemyHurt'); break;
        case 'enemyKilled': this.play('enemyKilled'); break;
        case 'ram': this.play('ram'); break;
        case 'pulse': this.play('pulse'); break;
        case 'explosion': this.play('explosion'); break;
        case 'chargePlaced': this.play('armed'); break;
        case 'tremorWarning': this.play('rumble'); break;
        case 'tremor': this.play('tremor'); break;
        case 'boulderWobble': this.play('creak', 0.3); break;
        case 'boulderLand': case 'boulderSmash': this.play('thud', 0.1); break;
        case 'layer': this.play('layer'); break;
        case 'lowO2': this.play('alarm'); break;
        case 'heart': this.play('heart'); break;
        case 'evac': this.play('evac'); break;
        case 'extracted': this.play('extracted'); break;
        case 'death': this.play('death'); break;
        case 'gas': case 'spores': this.play('hiss'); break;
        case 'shoot': this.play('shoot'); break;
        case 'projectileHit': case 'projectilePop': this.play('splat'); break;
        case 'noItem': case 'notice': this.play('deny', 0.3); break;
        case 'itemUsed': this.play('use'); break;
        default: break;
      }
    }
  }

  /** Continuous sounds: drill whine, thrusters and the low-oxygen alarm. */
  update(dive, dt) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const active = dive && dive.status === 'active';
    const rig = dive && dive.rig;
    const drilling = active && rig.action && rig.action.type === 'drill';
    const thrust = active && rig.thrusting && (rig.moveT < 1 || !rig.canFall(dive));
    if (drilling) {
      const h = TILES[rig.action.tile].hardness || 1;
      this.drillFilter.frequency.setTargetAtTime(350 + h * 160 + Math.random() * 200, t, 0.05);
      this.drillOsc.frequency.setTargetAtTime(50 + Math.random() * 12, t, 0.05);
    }
    this.drillGain.gain.setTargetAtTime(drilling && !this.muted ? 0.14 : 0, t, 0.04);
    this.thrustGain.gain.setTargetAtTime(thrust && !this.muted ? 0.08 : 0, t, 0.06);
    if (active) {
      const f = rig.o2 / rig.stats.maxO2;
      if (f < 0.25) {
        this.alarmT -= dt;
        if (this.alarmT <= 0) {
          this.play('alarm', 0.2);
          this.alarmT = f < 0.1 ? 0.6 : 1.4;
        }
      } else {
        this.alarmT = 0;
      }
    }
  }
}
