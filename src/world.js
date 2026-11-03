import { T, TILES, SURFACE_Y } from './config.js';

/** The tile grid for one dive. Out-of-bounds reads return bedrock. */
export class World {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.tiles = new Uint8Array(w * h);
    this.rowLayer = new Uint8Array(h);
    this.seed = 0;
  }

  idx(x, y) { return y * this.w + x; }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return T.BEDROCK;
    return this.tiles[y * this.w + x];
  }

  set(x, y, t) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.tiles[y * this.w + x] = t;
  }

  def(x, y) { return TILES[this.get(x, y)]; }

  isSolid(x, y) { return TILES[this.get(x, y)].solid; }

  layerIndex(y) {
    if (y < SURFACE_Y) return 0;
    return this.rowLayer[Math.min(this.h - 1, y)];
  }

  /** Wrap a column into the drillable interior (bedrock walls excluded). */
  wrapX(x) {
    const n = this.w - 2;
    return 1 + ((((x - 1) % n) + n) % n);
  }

  /** Slide rows y0..y1 horizontally by dx, wrapping within the interior columns. */
  shiftBand(y0, y1, dx) {
    const n = this.w - 2;
    const row = new Uint8Array(n);
    for (let y = y0; y <= y1; y++) {
      const base = y * this.w + 1;
      row.set(this.tiles.subarray(base, base + n));
      for (let k = 0; k < n; k++) {
        const to = (((k + dx) % n) + n) % n;
        this.tiles[base + to] = row[k];
      }
    }
  }
}
