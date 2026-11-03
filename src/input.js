// Keyboard and touch input. Directions are a stack: the most recently pressed
// held direction wins, and holding "up" anywhere in the stack keeps thrusters lit.

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
};
const ITEM_KEYS = { Digit1: 'evac', Digit2: 'o2can', Digit3: 'repair', Digit4: 'charge', Numpad1: 'evac', Numpad2: 'o2can', Numpad3: 'repair', Numpad4: 'charge' };

export class Input {
  constructor() {
    this.stack = [];
    this.actions = [];
    this.listeners = new Set();
    this.capture = false; // swallow arrows/space only while a dive is running
    window.addEventListener('keydown', (e) => this.onDown(e));
    window.addEventListener('keyup', (e) => this.onUp(e));
    window.addEventListener('blur', () => this.clear());
  }

  onDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const d = KEYMAP[e.code];
    if (d) {
      if (this.capture) e.preventDefault();
      this.press(d);
    }
    if (e.code === 'Space' && this.capture) {
      e.preventDefault();
      if (!e.repeat) this.queue('pulse');
    }
    if (ITEM_KEYS[e.code] && !e.repeat) this.queue(ITEM_KEYS[e.code]);
    if (!e.repeat) for (const fn of this.listeners) fn(e);
  }

  onUp(e) {
    const d = KEYMAP[e.code];
    if (d) this.release(d);
  }

  press(d) {
    const i = this.stack.indexOf(d);
    if (i >= 0) this.stack.splice(i, 1);
    this.stack.push(d);
  }

  release(d) {
    const i = this.stack.indexOf(d);
    if (i >= 0) this.stack.splice(i, 1);
  }

  queue(action) {
    this.actions.push(action);
    if (this.actions.length > 8) this.actions.shift();
  }

  takeActions() {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  clear() {
    this.stack.length = 0;
    this.actions.length = 0;
  }

  snapshot(actions = []) {
    return {
      dir: this.stack[this.stack.length - 1] || null,
      up: this.stack.includes('up'),
      pulse: actions.includes('pulse'),
      use: actions.find((a) => a !== 'pulse') || null,
    };
  }

  /** Wire on-screen buttons carrying data-dir / data-act attributes. */
  bindTouch(root, onAct) {
    for (const el of root.querySelectorAll('[data-dir]')) {
      const d = el.dataset.dir;
      const down = (e) => {
        e.preventDefault();
        el.setPointerCapture?.(e.pointerId);
        el.classList.add('held');
        this.press(d);
      };
      const up = (e) => {
        e.preventDefault();
        el.classList.remove('held');
        this.release(d);
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    for (const el of root.querySelectorAll('[data-act]')) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onAct(el.dataset.act);
      });
    }
  }
}
