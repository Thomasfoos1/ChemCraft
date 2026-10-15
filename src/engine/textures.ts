/**
 * Procedural 16×16 pixel-art textures. Every texture is original and generated at load time
 * from a seeded RNG, so the look is consistent and no external assets are needed.
 */
import * as THREE from 'three';
import { mulberry32, hashString } from './rng';
import { ATLAS_COLS, TILE_NAMES, TILE_PX, TileName } from './world/tiles';

type RGBA = [number, number, number, number];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clamp255(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** 16×16 RGBA pixel buffer with a few drawing helpers. */
export class Pixmap {
  data: Uint8ClampedArray;
  constructor(public w = TILE_PX, public h = TILE_PX) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, c: RGBA | string, alpha = 255) {
    x = ((x % this.w) + this.w) % this.w;
    y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 4;
    const rgba: RGBA = typeof c === 'string' ? [...hexToRgb(c), alpha] : c;
    this.data[i] = rgba[0];
    this.data[i + 1] = rgba[1];
    this.data[i + 2] = rgba[2];
    this.data[i + 3] = rgba[3];
  }
  get(x: number, y: number): RGBA {
    x = ((x % this.w) + this.w) % this.w;
    y = ((y % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  /** Multiply the brightness of an existing pixel. */
  shade(x: number, y: number, f: number) {
    const [r, g, b, a] = this.get(x, y);
    this.set(x, y, [clamp255(r * f), clamp255(g * f), clamp255(b * f), a]);
  }
  rect(x0: number, y0: number, w: number, h: number, c: string, alpha = 255) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, alpha);
  }
  fill(c: string, alpha = 255) {
    this.rect(0, 0, this.w, this.h, c, alpha);
  }
}

type Rng = () => number;

function jitterColor(hex: string, rng: Rng, amount: number): RGBA {
  const [r, g, b] = hexToRgb(hex);
  const f = 1 + (rng() - 0.5) * 2 * amount;
  return [clamp255(r * f), clamp255(g * f), clamp255(b * f), 255];
}

/** Streaky noise from a palette (Minecraft-like stone grain). */
function grain(p: Pixmap, rng: Rng, palette: string[], streak = 0.35) {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (x > 0 && rng() < streak) {
        p.set(x, y, p.get(x - 1, y));
      } else if (y > 0 && rng() < streak * 0.5) {
        p.set(x, y, p.get(x, y - 1));
      } else {
        p.set(x, y, palette[Math.floor(rng() * palette.length)]);
      }
    }
  }
}

function speckle(p: Pixmap, rng: Rng, color: string, count: number) {
  for (let i = 0; i < count; i++) p.set(Math.floor(rng() * 16), Math.floor(rng() * 16), color);
}

/** Brick pattern with mortar and bevel highlights. */
function bricks(
  p: Pixmap,
  rng: Rng,
  opts: { base: string[]; mortar: string; bh: number; bw: number; light?: number; dark?: number; offset?: number },
) {
  const { base, mortar, bh, bw } = opts;
  const light = opts.light ?? 1.15;
  const dark = opts.dark ?? 0.82;
  grain(p, rng, base, 0.3);
  for (let row = 0; row * bh < 16; row++) {
    const y0 = row * bh;
    const off = row % 2 === 0 ? 0 : (opts.offset ?? bw / 2);
    for (let x = 0; x < 16; x++) p.set(x, y0 + bh - 1, mortar);
    for (let bx = off; bx < 16 + bw; bx += bw) {
      const xj = Math.floor(bx) % 16;
      for (let y = y0; y < y0 + bh - 1; y++) p.set(xj, y, mortar);
      // bevel
      for (let x = 1; x < bw - 1; x++) p.shade(xj + x, y0, light);
      for (let y = y0; y < y0 + bh - 1; y++) p.shade(xj + 1, y, light * 0.98);
      for (let x = 1; x < bw; x++) p.shade(xj + x, y0 + bh - 2, dark);
    }
  }
}

function border(p: Pixmap, c: string, inset = 0) {
  for (let i = inset; i < 16 - inset; i++) {
    p.set(i, inset, c);
    p.set(i, 15 - inset, c);
    p.set(inset, i, c);
    p.set(15 - inset, i, c);
  }
}

function planks(p: Pixmap, rng: Rng, colors: string[], line: string) {
  for (let board = 0; board < 4; board++) {
    const c = colors[board % colors.length];
    const y0 = board * 4;
    for (let y = y0; y < y0 + 4; y++) {
      for (let x = 0; x < 16; x++) {
        const v = jitterColor(c, rng, 0.06);
        p.set(x, y, v);
      }
    }
    for (let x = 0; x < 16; x++) p.set(x, y0 + 3, line);
    // grain streaks
    for (let k = 0; k < 2; k++) {
      const gy = y0 + Math.floor(rng() * 3);
      const gx = Math.floor(rng() * 12);
      const len = 2 + Math.floor(rng() * 5);
      for (let x = gx; x < gx + len; x++) p.shade(x, gy, 0.86);
    }
    const joint = Math.floor(rng() * 16);
    for (let y = y0; y < y0 + 3; y++) p.set(joint, y, line);
    p.shade((joint + 2) % 16, y0 + 1, 0.7);
  }
}

/** Draw stone and scatter ore "shapes" on it. */
function ore(p: Pixmap, rng: Rng, shape: (p: Pixmap, x: number, y: number, rng: Rng) => void, spots: [number, number][]) {
  grain(p, rng, ['#7a7a7a', '#808080', '#757575', '#8a8a8a', '#6e6e6e'], 0.35);
  for (const [x, y] of spots) shape(p, x, y, rng);
}

function voronoiStones(p: Pixmap, rng: Rng, n: number, shades: string[], outline: string) {
  const pts: [number, number, string][] = [];
  for (let i = 0; i < n; i++) pts.push([rng() * 16, rng() * 16, shades[Math.floor(rng() * shades.length)]]);
  const owner = new Int32Array(256);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let best = 1e9, bi = 0;
      for (let i = 0; i < pts.length; i++) {
        for (const ox of [-16, 0, 16])
          for (const oy of [-16, 0, 16]) {
            const dx = x + 0.5 - (pts[i][0] + ox), dy = y + 0.5 - (pts[i][1] + oy);
            const d = dx * dx + dy * dy;
            if (d < best) { best = d; bi = i; }
          }
      }
      owner[y * 16 + x] = bi;
      p.set(x, y, jitterColor(pts[bi][2], rng, 0.07));
    }
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const o = owner[y * 16 + x];
      if (owner[y * 16 + ((x + 1) % 16)] !== o || owner[((y + 1) % 16) * 16 + x] !== o) p.set(x, y, outline);
      else if (owner[((y + 15) % 16) * 16 + x] !== o || owner[y * 16 + ((x + 15) % 16)] !== o) p.shade(x, y, 1.18);
    }
}

function crystalFacets(p: Pixmap, rng: Rng, colors: string[]) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const band = Math.floor(((x + y * 0.6 + Math.sin(y * 0.9) * 1.5) / 3) % colors.length);
      p.set(x, y, jitterColor(colors[(band + colors.length) % colors.length], rng, 0.05));
    }
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    p.set(x, y, '#ffffff');
    p.set(x + 1, y, '#f0f0ff');
  }
}

const P: Record<TileName, (p: Pixmap, rng: Rng) => void> = {
  stone: (p, r) => grain(p, r, ['#7a7a7a', '#808080', '#757575', '#8a8a8a', '#6e6e6e']),
  cobblestone: (p, r) => voronoiStones(p, r, 9, ['#8a8a8a', '#7a7a7a', '#9a9a9a', '#6c6c6c'], '#454545'),
  stone_bricks: (p, r) => bricks(p, r, { base: ['#7b7b7b', '#828282', '#747474'], mortar: '#4f4f4f', bh: 8, bw: 16, offset: 8 }),
  mossy_bricks: (p, r) => {
    bricks(p, r, { base: ['#7b7b7b', '#828282', '#747474'], mortar: '#4f4f4f', bh: 8, bw: 16, offset: 8 });
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
      if (r() < 0.6 || y > 8) p.set(x, y, ['#4f7a2a', '#5f8f34', '#3e6322'][Math.floor(r() * 3)]);
    }
  },
  cracked_bricks: (p, r) => {
    bricks(p, r, { base: ['#767676', '#7c7c7c', '#6e6e6e'], mortar: '#4a4a4a', bh: 8, bw: 16, offset: 8 });
    let x = 3, y = 0;
    while (y < 16) { p.set(x, y, '#2e2e2e'); p.set(x + 1, y, '#5a5a5a'); y++; x += r() < 0.5 ? 1 : -1; x = Math.max(1, Math.min(13, x)); }
    x = 11; y = 2;
    while (y < 13) { p.set(x, y, '#2e2e2e'); y++; x += r() < 0.4 ? 1 : r() < 0.5 ? -1 : 0; }
  },
  dirt: (p, r) => { grain(p, r, ['#79553a', '#866043', '#6b4a32', '#8f6a4a'], 0.2); speckle(p, r, '#5a3e2a', 12); },
  grass_top: (p, r) => grain(p, r, ['#5fa83a', '#6bb944', '#549a33', '#78c24f'], 0.2),
  grass_side: (p, r) => {
    grain(p, r, ['#79553a', '#866043', '#6b4a32', '#8f6a4a'], 0.2);
    for (let x = 0; x < 16; x++) {
      const d = 2 + Math.floor(r() * 3);
      for (let y = 0; y < d; y++) p.set(x, y, ['#5fa83a', '#6bb944', '#549a33'][Math.floor(r() * 3)]);
    }
  },
  planks: (p, r) => planks(p, r, ['#a8834f', '#b08b56', '#9e7a48', '#ab8650'], '#6f5130'),
  dark_planks: (p, r) => planks(p, r, ['#6a4b2c', '#73522f', '#634528', '#6e4e2d'], '#3d2a17'),
  log_side: (p, r) => {
    for (let x = 0; x < 16; x++) {
      const c = ['#6b5030', '#5a4227', '#76593a', '#4f3a22'][Math.floor(r() * 4)];
      for (let y = 0; y < 16; y++) p.set(x, y, jitterColor(c, r, 0.08));
    }
    for (let i = 0; i < 6; i++) { const x = Math.floor(r() * 16), y = Math.floor(r() * 14); p.set(x, y, '#3b2b18'); p.set(x, y + 1, '#3b2b18'); }
  },
  log_top: (p, r) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        if (d > 6.5) p.set(x, y, jitterColor('#5a4227', r, 0.1));
        else p.set(x, y, jitterColor(Math.floor(d) % 2 === 0 ? '#b8935e' : '#a07c4a', r, 0.05));
      }
  },
  crafting_top: (p, r) => {
    planks(p, r, ['#a8834f', '#b08b56', '#9e7a48', '#ab8650'], '#6f5130');
    border(p, '#5a3f22');
    for (let i = 1; i < 15; i++) { p.set(5, i, '#6f5130'); p.set(10, i, '#6f5130'); p.set(i, 5, '#6f5130'); p.set(i, 10, '#6f5130'); }
    // glowing atom in the middle cell
    p.rect(7, 7, 2, 2, '#8fe0ff');
    p.set(6, 7, '#4fa3d8'); p.set(9, 8, '#4fa3d8');
  },
  crafting_side: (p, r) => {
    planks(p, r, ['#9e7a48', '#a8834f'], '#6f5130');
    p.rect(0, 0, 16, 3, '#7a5a34');
    // flask
    const g = '#cfe8f0';
    p.rect(3, 6, 2, 3, g); p.rect(2, 9, 4, 4, g); p.rect(2, 11, 4, 2, '#4fe36a'); p.set(3, 10, '#ffffff');
    // beaker
    p.rect(9, 7, 5, 6, g); p.rect(9, 10, 5, 3, '#ff7a4f'); p.set(10, 8, '#ffffff'); p.set(14, 7, g);
  },
  crafting_front: (p, r) => {
    planks(p, r, ['#9e7a48', '#a8834f'], '#6f5130');
    p.rect(0, 0, 16, 3, '#7a5a34');
    // test tubes rack
    p.rect(2, 12, 12, 2, '#5a3f22');
    for (const [x, c] of [[3, '#5bd1ff'], [6, '#ff5b4f'], [9, '#c6f04a'], [12, '#ffd34f']] as [number, string][]) {
      p.rect(x, 6, 2, 6, '#dfeff4'); p.rect(x, 9, 2, 3, c);
    }
  },
  bookshelf: (p, r) => {
    planks(p, r, ['#a8834f', '#b08b56'], '#6f5130');
    const colors = ['#8b2f2f', '#2f4f8b', '#2f7a3a', '#8b6a2f', '#5a2f8b', '#2f7a7a'];
    for (const y0 of [1, 9]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + Math.floor(r() * 2);
        const c = colors[Math.floor(r() * colors.length)];
        const h = 5 + Math.floor(r() * 2);
        for (let xx = x; xx < Math.min(15, x + w); xx++) for (let y = y0 + (6 - h); y < y0 + 6; y++) p.set(xx, y, jitterColor(c, r, 0.1));
        x += w;
      }
    }
  },
  ore_H: (p, r) => ore(p, r, (p, x, y) => {
    // pale blue rhombus crystals
    p.set(x, y - 2, '#e8fbff'); p.set(x - 1, y - 1, '#8fd8ff'); p.set(x, y - 1, '#c8f0ff'); p.set(x + 1, y - 1, '#5fb8f0');
    p.set(x - 1, y, '#5fb8f0'); p.set(x, y, '#8fd8ff'); p.set(x + 1, y, '#3d8fd0'); p.set(x, y + 1, '#2b6d99');
  }, [[4, 4], [11, 3], [7, 9], [13, 11], [3, 13]]),
  ore_O: (p, r) => ore(p, r, (p, x, y) => {
    // red round bubbles
    p.set(x, y, '#ff5b4f'); p.set(x + 1, y, '#e0453a'); p.set(x, y + 1, '#c4372d'); p.set(x + 1, y + 1, '#8f1f17');
    p.set(x - 1, y, '#e0453a'); p.set(x, y - 1, '#ff9a8f'); p.set(x + 1, y - 1, '#ff5b4f'); p.set(x + 2, y, '#c4372d');
    p.set(x, y, '#ffb3aa');
  }, [[3, 3], [11, 5], [6, 10], [12, 12], [2, 13]]),
  ore_C: (p, r) => ore(p, r, (p, x, y, r) => {
    // black coal lumps
    for (let i = 0; i < 6; i++) p.set(x + Math.floor(r() * 3) - 1, y + Math.floor(r() * 3) - 1, r() < 0.5 ? '#1c1c1c' : '#2e2e2e');
    p.set(x, y, '#3d3d3d');
  }, [[3, 4], [10, 3], [7, 8], [12, 11], [4, 12], [9, 14]]),
  ore_N: (p, r) => ore(p, r, (p, x, y) => {
    // violet triangles
    p.set(x, y - 1, '#c9d0ff'); p.set(x - 1, y, '#7d8cff'); p.set(x, y, '#9aa6ff'); p.set(x + 1, y, '#5a68d8');
    p.set(x - 2, y + 1, '#5a68d8'); p.set(x - 1, y + 1, '#7d8cff'); p.set(x, y + 1, '#5a68d8'); p.set(x + 1, y + 1, '#2f3a9e'); p.set(x + 2, y + 1, '#2f3a9e');
  }, [[4, 3], [11, 5], [7, 10], [13, 12], [3, 13]]),
  ore_Na: (p, r) => ore(p, r, (p, x, y) => {
    // silvery-lavender cubes
    p.rect(x - 1, y - 1, 3, 3, '#b7adf0'); p.set(x - 1, y - 1, '#ffffff'); p.set(x, y - 1, '#e4dfff');
    p.set(x + 1, y + 1, '#6a5fb0'); p.set(x, y + 1, '#8a7fd0'); p.set(x + 1, y, '#8a7fd0');
  }, [[3, 3], [10, 4], [6, 9], [12, 11], [3, 13]]),
  ore_Cl: (p, r) => ore(p, r, (p, x, y) => {
    // yellow-green plus-shaped stars
    p.set(x, y, '#f0ff9a'); p.set(x - 1, y, '#c6f04a'); p.set(x + 1, y, '#c6f04a'); p.set(x, y - 1, '#c6f04a'); p.set(x, y + 1, '#8fb82a');
    p.set(x - 2, y, '#8fb82a'); p.set(x + 2, y, '#5b7a10'); p.set(x, y + 2, '#5b7a10'); p.set(x, y - 2, '#a8d838');
  }, [[4, 4], [11, 3], [8, 9], [13, 12], [3, 12]]),
  ore_Ca: (p, r) => ore(p, r, (p, x, y) => {
    // cream lumps with white dots
    p.rect(x - 1, y, 3, 2, '#e6dcc0'); p.set(x, y - 1, '#f6f0e0'); p.set(x - 1, y, '#ffffff'); p.set(x + 1, y + 1, '#9a8a68'); p.set(x + 2, y, '#c8b890');
  }, [[3, 3], [11, 4], [6, 9], [12, 12], [2, 13], [9, 14]]),
  ore_Fe: (p, r) => ore(p, r, (p, x, y) => {
    // tan-orange flecks in pairs
    p.set(x, y, '#e8b48a'); p.set(x + 1, y, '#d89a72'); p.set(x, y + 1, '#b8784e'); p.set(x + 1, y + 1, '#7a4428'); p.set(x + 2, y + 1, '#d89a72');
  }, [[3, 3], [10, 2], [6, 7], [12, 9], [3, 12], [9, 13]]),
  glow_lamp: (p, r) => {
    voronoiStones(p, r, 10, ['#ffd977', '#ffe9a8', '#f2c14e', '#ffcf5c'], '#a8742a');
    speckle(p, r, '#fffbe6', 10);
  },
  crystal_blue: (p, r) => crystalFacets(p, r, ['#4fa3ff', '#6fc3ff', '#3a7fe0', '#8fd8ff']),
  crystal_pink: (p, r) => crystalFacets(p, r, ['#d86fd8', '#f08ff0', '#b04fc0', '#ffb0ff']),
  crystal_white: (p, r) => crystalFacets(p, r, ['#e8f4ff', '#ffffff', '#cfe0f0', '#dfeaff']),
  ice: (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = jitterColor('#9cc8ff', r, 0.04); c[3] = 170; p.set(x, y, c); }
    for (let i = 0; i < 3; i++) { const o = Math.floor(r() * 16); for (let k = 0; k < 6; k++) p.set(o + k, 12 - k + i * 3, [235, 245, 255, 220]); }
  },
  packed_ice: (p, r) => {
    grain(p, r, ['#8ab4f0', '#94bef8', '#7fa8e8', '#a0c8ff'], 0.4);
    for (let i = 0; i < 4; i++) { let x = Math.floor(r() * 16), y = Math.floor(r() * 16); for (let k = 0; k < 5; k++) { p.set(x, y, '#e8f4ff'); x += 1; y += r() < 0.5 ? 1 : 0; } }
  },
  snow: (p, r) => { grain(p, r, ['#f4f8ff', '#ffffff', '#eaf0fa'], 0.3); speckle(p, r, '#dfe8f5', 8); },
  glass: (p) => {
    p.fill('#ffffff', 0);
    border(p, '#dbeef5');
    p.set(3, 3, '#ffffff'); p.set(4, 4, '#ffffff'); p.set(5, 5, '#ffffff');
    p.set(4, 3, '#ffffff'); p.set(10, 9, '#ffffff'); p.set(11, 10, '#ffffff');
    for (let i = 1; i < 15; i++) { p.set(i, 1, [200, 230, 240, 90]); p.set(1, i, [200, 230, 240, 90]); }
  },
  iron_block: (p, r) => {
    grain(p, r, ['#d8d8d8', '#e2e2e2', '#cfcfcf'], 0.6);
    border(p, '#a0a0a0');
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { p.set(x, y, '#ffffff'); p.set(x + 1, y + 1, '#8a8a8a'); }
    for (let i = 1; i < 15; i++) p.set(i, 7, '#b8b8b8');
  },
  gate_bars: (p) => {
    p.fill('#000000', 0);
    for (const bx of [1, 5, 9, 13]) for (let y = 0; y < 16; y++) { p.set(bx, y, '#5a5a5a'); p.set(bx + 1, y, '#9a9a9a'); }
    for (const by of [1, 14]) for (let x = 0; x < 16; x++) { p.set(x, by, '#6a6a6a'); p.set(x, by + 1, '#3a3a3a'); }
    for (let x = 0; x < 16; x++) p.set(x, 7, '#7a7a7a');
  },
  deepslate: (p, r) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      if (y > 0 && r() < 0.55) p.set(x, y, p.get(x, y - 1));
      else p.set(x, y, ['#4a4a50', '#525258', '#43434a', '#3a3a40'][Math.floor(r() * 4)]);
    }
  },
  deepslate_bricks: (p, r) => bricks(p, r, { base: ['#4a4a50', '#505056', '#46464c'], mortar: '#2a2a2e', bh: 4, bw: 8 }),
  cracked_deepslate: (p, r) => {
    bricks(p, r, { base: ['#48484e', '#4e4e54'], mortar: '#2a2a2e', bh: 4, bw: 8 });
    let x = 2;
    for (let y = 0; y < 16; y++) { p.set(x, y, '#18181a'); x += r() < 0.5 ? 1 : 0; }
    x = 12;
    for (let y = 3; y < 14; y++) { p.set(x, y, '#18181a'); x += r() < 0.5 ? -1 : 0; }
  },
  obsidian: (p, r) => { grain(p, r, ['#14101e', '#1c1428', '#100c18'], 0.3); speckle(p, r, '#3c2a5c', 10); speckle(p, r, '#5c3a8c', 4); },
  coal_block: (p, r) => grain(p, r, ['#1a1a1a', '#222222', '#151515', '#2a2a2a'], 0.4),
  bedrock: (p, r) => grain(p, r, ['#2a2a2a', '#4a4a4a', '#151515', '#5a5a5a'], 0.1),
  limestone: (p, r) => {
    grain(p, r, ['#e6dcc0', '#ece4cc', '#e0d4b4', '#f0e8d4'], 0.6);
    for (const y of [4, 11]) for (let x = 0; x < 16; x++) if (r() < 0.7) p.shade(x, y, 0.93);
  },
  limestone_bricks: (p, r) => bricks(p, r, { base: ['#e6dcc0', '#ece4cc', '#e0d4b4'], mortar: '#b8a888', bh: 8, bw: 8, light: 1.05, dark: 0.9 }),
  chiseled_limestone: (p, r) => {
    grain(p, r, ['#e6dcc0', '#ece4cc'], 0.6);
    border(p, '#b8a888'); border(p, '#f6f0e0', 1);
    for (let i = 4; i < 12; i++) { p.set(i, 4, '#b8a888'); p.set(i, 11, '#b8a888'); p.set(4, i, '#b8a888'); p.set(11, i, '#b8a888'); }
    p.rect(7, 7, 2, 2, '#b8a888');
  },
  pillar_side: (p, r) => {
    grain(p, r, ['#ece4cc', '#f0e8d4', '#e6dcc0'], 0.7);
    for (const x of [2, 6, 9, 13]) for (let y = 0; y < 16; y++) p.shade(x, y, 0.88);
    for (let x = 0; x < 16; x++) { p.set(x, 0, '#c8b890'); p.set(x, 15, '#c8b890'); }
  },
  pillar_top: (p, r) => {
    grain(p, r, ['#ece4cc', '#f0e8d4'], 0.7);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (Math.abs(d - 5.5) < 0.6) p.set(x, y, '#c8b890'); }
  },
  fossil: (p, r) => {
    grain(p, r, ['#e6dcc0', '#ece4cc', '#e0d4b4'], 0.6);
    const bone = '#fbfaf2', edge = '#9a8a68';
    for (let i = 2; i < 14; i++) { p.set(i, 8, bone); p.set(i, 9, edge); }
    for (const x of [4, 7, 10]) for (let k = 0; k < 4; k++) { p.set(x, 7 - k, bone); p.set(x + 1, 7 - k, edge); p.set(x, 10 + k, bone); p.set(x + 1, 10 + k, edge); }
    p.rect(12, 6, 3, 4, bone); p.set(13, 7, '#4a3a28');
  },
  cracked_limestone: (p, r) => {
    bricks(p, r, { base: ['#e0d4b4', '#e6dcc0'], mortar: '#b8a888', bh: 8, bw: 8, light: 1.05, dark: 0.9 });
    let x = 4;
    for (let y = 0; y < 16; y++) { p.set(x, y, '#7a6a48'); x += r() < 0.5 ? 1 : -1; x = Math.max(1, Math.min(14, x)); }
  },
  gravel: (p, r) => voronoiStones(p, r, 14, ['#8a8078', '#9a9088', '#6a625a', '#7a726a'], '#544c46'),
  lab_tile: (p, r) => {
    grain(p, r, ['#e4eaee', '#eaf0f4', '#dfe5ea'], 0.7);
    for (let i = 0; i < 16; i++) { p.set(i, 7, '#a8b4bc'); p.set(i, 15, '#a8b4bc'); p.set(7, i, '#a8b4bc'); p.set(15, i, '#a8b4bc'); }
  },
  lab_tile_dark: (p, r) => {
    grain(p, r, ['#3a4650', '#404c56', '#36424c'], 0.7);
    for (let i = 0; i < 16; i++) { p.set(i, 7, '#26303a'); p.set(i, 15, '#26303a'); p.set(7, i, '#26303a'); p.set(15, i, '#26303a'); }
  },
  machine_side: (p, r) => {
    grain(p, r, ['#5b6470', '#626b78', '#56606b'], 0.7);
    border(p, '#3a4048');
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { p.set(x, y, '#a8b0bc'); p.set(x + 1, y + 1, '#2a3038'); }
    for (const y of [6, 8, 10]) for (let x = 4; x < 12; x++) p.set(x, y, '#2a3038');
  },
  machine_top: (p, r) => {
    grain(p, r, ['#5b6470', '#626b78'], 0.7);
    border(p, '#3a4048');
    p.rect(5, 5, 6, 6, '#3a4048'); p.rect(6, 6, 4, 4, '#7a8490');
  },
  generator_front: (p, r) => {
    P.machine_side(p, r);
    p.rect(4, 3, 8, 8, '#2a3038');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 6.5); if (d < 3.6) p.set(x, y, d < 2.4 ? '#3d7cff' : '#bcd4ff'); }
    p.rect(6, 12, 4, 3, '#8a6a3a'); p.rect(7, 12, 2, 3, '#1a1a1a');
  },
  carbonator_front: (p, r) => {
    P.machine_side(p, r);
    p.rect(3, 3, 10, 10, '#c0d8e0'); p.rect(4, 4, 8, 8, '#8fb0c0');
    for (const [x, y] of [[5, 10], [8, 8], [10, 11], [6, 6], [9, 5]]) { p.set(x, y, '#ffffff'); p.set(x + 1, y, '#e0f0ff'); }
  },
  fabricator_front: (p, r) => {
    P.machine_side(p, r);
    p.rect(3, 3, 10, 9, '#2a3038');
    for (let y = 4; y < 11; y += 2) for (let x = 4; x < 12; x += 2) p.set(x, y, '#f4f0e6');
    p.rect(6, 12, 4, 3, '#f4f0e6');
  },
  socket_off: (p, r) => {
    P.machine_top(p, r);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (Math.abs(d - 4.5) < 0.8) p.set(x, y, '#30404a'); }
  },
  socket_on: (p, r) => {
    P.machine_top(p, r);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (Math.abs(d - 4.5) < 0.9) p.set(x, y, '#5ff0ff'); if (d < 2.5) p.set(x, y, '#c8ffff'); }
  },
  console: (p, r) => {
    P.machine_side(p, r);
    p.rect(2, 2, 12, 9, '#0a1a10');
    for (const [y, w] of [[3, 8], [5, 10], [7, 6], [9, 9]]) for (let x = 3; x < 3 + w; x++) if (r() < 0.85) p.set(x, y, '#4fff7a');
    for (const [x, c] of [[3, '#ff4f4f'], [6, '#ffd34f'], [9, '#4fff7a'], [12, '#4fa3ff']] as [number, string][]) p.rect(x, 12, 2, 2, c);
  },
  sorting_front: (p, r) => {
    P.machine_side(p, r);
    for (const [x, c] of [[2, '#4fa3ff'], [6, '#4fff7a'], [10, '#ffb14f']] as [number, string][]) { p.rect(x, 5, 4, 8, '#2a3038'); p.rect(x, 9, 4, 4, c); }
    p.rect(2, 2, 12, 2, '#dfe5ea');
  },
  balance_front: (p, r) => {
    P.machine_side(p, r);
    p.rect(7, 3, 2, 10, '#ffd34f'); p.rect(3, 4, 10, 1, '#ffd34f');
    p.rect(2, 5, 4, 2, '#ffd34f'); p.rect(10, 5, 4, 2, '#ffd34f'); p.rect(5, 13, 6, 1, '#ffd34f');
  },
  redstone_off: (p, r) => {
    grain(p, r, ['#5b6470', '#56606b'], 0.7);
    for (let i = 0; i < 16; i++) { p.set(i, 7, '#5a1a1a'); p.set(i, 8, '#3a1010'); p.set(7, i, '#5a1a1a'); p.set(8, i, '#3a1010'); }
  },
  redstone_on: (p, r) => {
    grain(p, r, ['#5b6470', '#56606b'], 0.7);
    for (let i = 0; i < 16; i++) { p.set(i, 7, '#ff3a2a'); p.set(i, 8, '#c81a10'); p.set(7, i, '#ff3a2a'); p.set(8, i, '#c81a10'); }
    p.rect(6, 6, 4, 4, '#ffb0a0');
  },
  tank_green: (p, r) => { grain(p, r, ['#3ad85a', '#4fe86f', '#2ac04a'], 0.5); speckle(p, r, '#c8ffd0', 8); },
  tank_purple: (p, r) => { grain(p, r, ['#a04fe8', '#b46ff0', '#8a3ad0'], 0.5); speckle(p, r, '#f0d0ff', 8); },
  tank_blue: (p, r) => { grain(p, r, ['#3a8ff0', '#4fa3ff', '#2a7ad8'], 0.5); speckle(p, r, '#d0ecff', 8); },
  chest_front: (p, r) => {
    planks(p, r, ['#9a6a2a', '#a8763a'], '#5a3a14');
    border(p, '#3a250e');
    for (let x = 1; x < 15; x++) p.set(x, 5, '#3a250e');
    p.rect(7, 4, 2, 4, '#c8c8c8'); p.set(7, 6, '#3a3a3a');
  },
  chest_side: (p, r) => {
    planks(p, r, ['#9a6a2a', '#a8763a'], '#5a3a14');
    border(p, '#3a250e');
    for (let x = 1; x < 15; x++) p.set(x, 5, '#3a250e');
  },
  chest_top: (p, r) => { planks(p, r, ['#9a6a2a', '#a8763a'], '#5a3a14'); border(p, '#3a250e'); },
  pipe_copper: (p, r) => {
    grain(p, r, ['#c87a4a', '#d48a5a', '#b86a3a'], 0.6);
    for (const y of [0, 1, 14, 15]) for (let x = 0; x < 16; x++) p.set(x, y, '#8a4a22');
    for (let y = 2; y < 14; y++) { p.shade(2, y, 1.25); p.shade(13, y, 0.7); }
    p.set(4, 0, '#ffd0a0'); p.set(11, 15, '#ffd0a0');
  },
  steam_vent: (p, r) => {
    grain(p, r, ['#3a3a3e', '#444448'], 0.6);
    border(p, '#222226');
    for (const y of [3, 6, 9, 12]) for (let x = 3; x < 13; x++) { p.set(x, y, '#111114'); p.set(x, y + 1, '#666670'); }
  },
  torch: (p) => {
    p.fill('#000000', 0);
    for (let y = 6; y < 16; y++) { p.set(7, y, '#8a6a3a'); p.set(8, y, '#6a4a22'); }
    p.set(7, 5, '#ffd34f'); p.set(8, 5, '#ffb02a'); p.set(7, 4, '#fff5c0'); p.set(8, 4, '#ffd34f'); p.set(7, 6, '#ff8a2a'); p.set(8, 6, '#c86a1a');
  },
  flower_red: (p) => {
    p.fill('#000000', 0);
    for (let y = 8; y < 16; y++) p.set(7, y, '#3e8a2a');
    p.set(6, 11, '#4fa33a'); p.set(8, 12, '#4fa33a');
    p.rect(6, 4, 3, 3, '#e83a3a'); p.set(7, 5, '#ffd34f'); p.set(5, 5, '#c82a2a'); p.set(9, 5, '#c82a2a'); p.set(7, 3, '#c82a2a'); p.set(7, 7, '#c82a2a');
  },
  flower_yellow: (p) => {
    p.fill('#000000', 0);
    for (let y = 8; y < 16; y++) p.set(8, y, '#3e8a2a');
    p.set(9, 11, '#4fa33a');
    p.rect(7, 5, 3, 3, '#ffd34f'); p.set(8, 6, '#ff8a2a'); p.set(6, 6, '#f0c030'); p.set(10, 6, '#f0c030'); p.set(8, 4, '#f0c030');
  },
  leaves: (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (r() < 0.18) p.set(x, y, '#000000', 0);
      else p.set(x, y, ['#3e8a2a', '#4fa33a', '#2e6a1e', '#57b040'][Math.floor(r() * 4)]);
    }
  },
  halite: (p, r) => {
    grain(p, r, ['#f4ecf0', '#fff6fa', '#ead8e0'], 0.5);
    for (const [x, y] of [[2, 2], [9, 3], [5, 9], [11, 10]]) { p.rect(x, y, 4, 4, '#ffffff'); p.set(x + 3, y + 3, '#c8a8b8'); p.set(x + 3, y + 2, '#e0c8d4'); p.set(x + 2, y + 3, '#e0c8d4'); }
  },
  reactor_core: (p, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      p.set(x, y, jitterColor(d > 6 ? '#3a4048' : d > 4 ? '#5ff0ff' : d > 2 ? '#c8ffff' : '#ffffff', r, 0.05));
    }
  },
  vault_door: (p, r) => {
    grain(p, r, ['#6a7480', '#727c88', '#646e7a'], 0.7);
    border(p, '#3a4048');
    for (let i = 0; i < 16; i += 4) for (let x = 0; x < 16; x++) p.shade(x, i, 0.75);
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13], [7, 7]]) { p.set(x, y, '#d0d8e0'); p.set(x + 1, y + 1, '#2a3038'); }
  },
  iron_trapdoor: (p, r) => {
    grain(p, r, ['#c8c8c8', '#d2d2d2'], 0.6);
    border(p, '#7a7a7a');
    for (const x of [4, 8, 12]) for (let y = 1; y < 15; y++) p.set(x, y, '#9a9a9a');
  },
  mushroom: (p) => {
    p.fill('#000000', 0);
    for (let y = 9; y < 16; y++) { p.set(7, y, '#e8dcc0'); p.set(8, y, '#c8bca0'); }
    p.rect(4, 6, 8, 3, '#d83a3a'); p.rect(5, 5, 6, 1, '#d83a3a'); p.set(6, 6, '#ffffff'); p.set(9, 7, '#ffffff');
  },
  quartz_tile: (p, r) => {
    grain(p, r, ['#f2f0ec', '#f8f6f2', '#ebe8e2'], 0.8);
    border(p, '#d8d4cc');
  },
};

let atlasCanvas: HTMLCanvasElement | null = null;

/** Paint all tiles into a single canvas atlas (16 tiles per row). */
export function buildAtlasCanvas(): HTMLCanvasElement {
  if (atlasCanvas) return atlasCanvas;
  const rows = Math.ceil(TILE_NAMES.length / ATLAS_COLS);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = Math.max(size, rows * TILE_PX);
  const ctx = canvas.getContext('2d')!;
  TILE_NAMES.forEach((name, i) => {
    const pm = new Pixmap();
    P[name](pm, mulberry32(hashString(name)));
    const img = new ImageData(pm.data, TILE_PX, TILE_PX);
    ctx.putImageData(img, (i % ATLAS_COLS) * TILE_PX, Math.floor(i / ATLAS_COLS) * TILE_PX);
  });
  atlasCanvas = canvas;
  return canvas;
}

export const ATLAS_SIZE = 256;

function pixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let atlasTexture: THREE.CanvasTexture | null = null;
export function getAtlasTexture(): THREE.CanvasTexture {
  if (!atlasTexture) atlasTexture = pixelTexture(buildAtlasCanvas());
  return atlasTexture;
}

/** Returns a data URL for a single tile, used for UI previews. */
export function tileDataUrl(name: TileName, scale = 4): string {
  const pm = new Pixmap();
  P[name](pm, mulberry32(hashString(name)));
  const c = document.createElement('canvas');
  c.width = TILE_PX * scale;
  c.height = TILE_PX * scale;
  const ctx = c.getContext('2d')!;
  const tmp = document.createElement('canvas');
  tmp.width = TILE_PX;
  tmp.height = TILE_PX;
  tmp.getContext('2d')!.putImageData(new ImageData(pm.data, TILE_PX, TILE_PX), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, c.width, c.height);
  return c.toDataURL();
}

/** Animated liquid textures (32×32 so they scroll smoothly). */
function liquidCanvas(colors: string[], highlight: string, seed: number, blobs: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const pm = new Pixmap();
  const rng = mulberry32(seed);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const v = Math.sin((x + y * 0.5) * 0.8) + Math.sin(y * 1.3 + x * 0.2);
      const idx = Math.max(0, Math.min(colors.length - 1, Math.floor(((v + 2) / 4) * colors.length)));
      pm.set(x, y, jitterColor(colors[idx], rng, 0.03));
    }
  for (let i = 0; i < (blobs ? 6 : 10); i++) {
    const x = Math.floor(rng() * 16), y = Math.floor(rng() * 16);
    pm.set(x, y, highlight);
    if (blobs) { pm.set(x + 1, y, highlight); pm.set(x, y + 1, highlight); }
    else pm.set(x + 1, y, highlight);
  }
  ctx.putImageData(new ImageData(pm.data, 16, 16), 0, 0);
  return c;
}

let waterTex: THREE.CanvasTexture | null = null;
let lavaTex: THREE.CanvasTexture | null = null;
export function getWaterTexture(): THREE.CanvasTexture {
  if (!waterTex) {
    waterTex = pixelTexture(liquidCanvas(['#2a5fd8', '#3068e0', '#3a74ea', '#4a84f2'], '#8ab8ff', 11, false));
    waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  }
  return waterTex;
}
export function getLavaTexture(): THREE.CanvasTexture {
  if (!lavaTex) {
    lavaTex = pixelTexture(liquidCanvas(['#c83a0a', '#e05a10', '#f07a1a', '#ff9a2a'], '#ffe07a', 23, true));
    lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  }
  return lavaTex;
}

/** Ten block-cracking stages in a single horizontal strip. */
let crackTex: THREE.CanvasTexture | null = null;
export function getCrackTexture(): THREE.CanvasTexture {
  if (crackTex) return crackTex;
  const c = document.createElement('canvas');
  c.width = 16 * 10;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  const rng = mulberry32(99);
  // pre-generate random crack paths, revealed progressively
  const segments: [number, number][] = [];
  for (let k = 0; k < 6; k++) {
    let x = 7 + Math.floor(rng() * 3) - 1, y = 7 + Math.floor(rng() * 3) - 1;
    const dx = rng() < 0.5 ? -1 : 1, dy = rng() < 0.5 ? -1 : 1;
    for (let s = 0; s < 10; s++) {
      segments.push([x, y]);
      if (rng() < 0.6) x += dx; else y += dy;
      if (rng() < 0.3) y += dy;
    }
  }
  for (let stage = 0; stage < 10; stage++) {
    const pm = new Pixmap();
    pm.fill('#000000', 0);
    const n = Math.floor(((stage + 1) / 10) * segments.length);
    for (let i = 0; i < n; i++) pm.set(segments[i][0], segments[i][1], [20, 20, 20, 210]);
    ctx.putImageData(new ImageData(pm.data, 16, 16), stage * 16, 0);
  }
  crackTex = pixelTexture(c);
  return crackTex;
}

const tileTexCache = new Map<string, THREE.CanvasTexture>();
/** A single tile as its own repeating texture (used by models like the water wheel). */
export function tileTexture(name: TileName): THREE.CanvasTexture {
  let t = tileTexCache.get(name);
  if (t) return t;
  const pm = new Pixmap();
  P[name](pm, mulberry32(hashString(name)));
  const c = document.createElement('canvas');
  c.width = TILE_PX;
  c.height = TILE_PX;
  c.getContext('2d')!.putImageData(new ImageData(pm.data, TILE_PX, TILE_PX), 0, 0);
  t = pixelTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  tileTexCache.set(name, t);
  return t;
}

/** Pixel-art sky with soft gradient and blocky clouds for the exit courtyard. */
export function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 128; y++) {
    const k = y / 127;
    const r = Math.round(120 + (190 - 120) * k), g = Math.round(170 + (220 - 170) * k), b = Math.round(255 - 10 * k);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, 256, 1);
  }
  const rng = mulberry32(5);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(rng() * 256), y = 10 + Math.floor(rng() * 60);
    const w = 10 + Math.floor(rng() * 26), h = 3 + Math.floor(rng() * 4);
    ctx.fillRect(x, y, w, h);
    ctx.fillRect(x + 4, y - 2, w - 8, 2);
  }
  ctx.fillStyle = '#fff7c0';
  ctx.fillRect(200, 18, 12, 12);
  const t = pixelTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
