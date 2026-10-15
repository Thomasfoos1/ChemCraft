/**
 * Pixel-art item icons drawn on 32×32 canvases. Atoms are glossy orbs with their symbol in a
 * crisp bitmap font (so elements are never identified by colour alone); substances get a
 * container sprite plus a formula label.
 */
import { ELEMENTS } from '../chem/elements';
import { RECIPE_BY_ID } from '../chem/recipes';

const FONT: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01101'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  l: ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
};

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, x: number, y: number, c: string, w = 1, h = 1) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}

/** Draw text with the bitmap font. Digits after letters become small subscripts when `subscripts`. */
export function drawPixelText(ctx: Ctx, text: string, x: number, y: number, scale: number, color: string, outline: string | null, subscripts = false) {
  const glyphs: { ch: string; sub: boolean }[] = [];
  for (let i = 0; i < text.length; i++) glyphs.push({ ch: text[i], sub: subscripts && /[0-9]/.test(text[i]) && i > 0 });
  const draw = (dx: number, dy: number, col: string) => {
    let cx = x;
    for (const g of glyphs) {
      const rows = FONT[g.ch];
      if (!rows) { cx += 4 * scale; continue; }
      const s = g.sub ? Math.max(1, Math.round(scale * 0.6)) : scale;
      const oy = g.sub ? y + 7 * scale - 7 * s + Math.round(scale * 1.2) : y;
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 5; c++) if (rows[r][c] === '1') px(ctx, cx + c * s + dx, oy + r * s + dy, col, s, s);
      cx += 6 * s;
    }
  };
  if (outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) draw(dx, dy, outline);
  draw(0, 0, color);
}

export function pixelTextWidth(text: string, scale: number, subscripts = false): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const sub = subscripts && /[0-9]/.test(text[i]) && i > 0;
    const s = sub ? Math.max(1, Math.round(scale * 0.6)) : scale;
    w += 6 * s;
  }
  return w - Math.max(1, scale);
}

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function drawAtom(ctx: Ctx, symbol: string) {
  const el = ELEMENTS[symbol];
  const base = el?.color ?? '#888888';
  // orb
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const dx = x - 15.5, dy = y - 15.5;
      const d = Math.hypot(dx, dy);
      if (d > 14) continue;
      if (d > 12.8) { px(ctx, x, y, '#1a1a1a'); continue; }
      const light = 1.25 - (dx + dy) / 40 - d / 60;
      px(ctx, x, y, shadeHex(base, Math.max(0.45, light)));
    }
  // glossy highlight
  px(ctx, 9, 7, 'rgba(255,255,255,0.85)', 4, 2);
  px(ctx, 7, 9, 'rgba(255,255,255,0.6)', 2, 3);
  // symbol
  const scale = symbol.length === 1 ? 2 : 2;
  const w = pixelTextWidth(symbol, scale);
  const dark = el && (el.color === '#f2ead8' || el.color === '#d9d2ff' || el.color === '#c6f04a' || el.color === '#8fd8ff');
  drawPixelText(ctx, symbol, Math.round(16 - w / 2), 9, scale, dark ? '#1a1a1a' : '#ffffff', dark ? '#ffffff' : '#1a1a1a');
}

function drawLabel(ctx: Ctx, formula: string) {
  const w = pixelTextWidth(formula, 1, true);
  if (w > 31) return; // long formulas (glucose) are shown in the tooltip instead
  const x = Math.round(16 - w / 2);
  px(ctx, x - 2, 23, 'rgba(10,10,10,0.82)', w + 4, 9);
  drawPixelText(ctx, formula, x, 24, 1, '#ffffff', null, true);
}

function drawSubstance(ctx: Ctx, id: string) {
  const r = RECIPE_BY_ID[id];
  if (!r) return;
  const c = r.iconColor;
  const outline = '#1a1a1a';
  switch (r.icon) {
    case 'bucket': {
      // grey pail with water
      for (let y = 6; y < 24; y++) {
        const inset = Math.floor((y - 6) / 6);
        px(ctx, 6 + inset, y, outline, 20 - inset * 2, 1);
        px(ctx, 7 + inset, y, y < 9 ? c : '#b8b8b8', 18 - inset * 2, 1);
        px(ctx, 7 + inset, y, '#e0e0e0', 2, 1);
      }
      px(ctx, 7, 7, '#7ab0ff', 18, 2);
      px(ctx, 6, 3, outline, 2, 4); px(ctx, 24, 3, outline, 2, 4); px(ctx, 7, 2, outline, 18, 1);
      break;
    }
    case 'tank':
    case 'canister': {
      const body = r.icon === 'tank' ? c : '#c8c8c8';
      px(ctx, 9, 6, outline, 14, 19);
      px(ctx, 10, 7, body, 12, 17);
      px(ctx, 11, 7, 'rgba(255,255,255,0.5)', 2, 17);
      px(ctx, 19, 7, 'rgba(0,0,0,0.25)', 3, 17);
      px(ctx, 13, 2, outline, 6, 5); px(ctx, 14, 3, '#888', 4, 3);
      px(ctx, 11, 1, outline, 10, 2); px(ctx, 12, 1, '#c8a040', 8, 1);
      if (r.icon === 'canister') px(ctx, 10, 12, c === '#c9c9c9' ? '#5a8f5a' : c, 12, 4);
      break;
    }
    case 'jar': {
      px(ctx, 7, 7, outline, 18, 18);
      px(ctx, 8, 8, 'rgba(220,240,250,0.9)', 16, 16);
      for (const [x, y] of [[9, 14], [13, 16], [17, 13], [11, 19], [16, 19], [19, 17], [10, 11], [15, 10]]) {
        px(ctx, x, y, '#ffffff', 3, 3); px(ctx, x + 2, y + 2, '#b8c0c8', 1, 1);
      }
      px(ctx, 8, 3, outline, 16, 5); px(ctx, 9, 4, '#d84a4a', 14, 3);
      break;
    }
    case 'chalk': {
      px(ctx, 5, 10, outline, 22, 14);
      px(ctx, 6, 11, '#f4f0e6', 20, 12);
      px(ctx, 6, 11, '#ffffff', 20, 2);
      px(ctx, 6, 20, '#d8d0c0', 20, 3);
      px(ctx, 10, 4, outline, 6, 8); px(ctx, 11, 5, '#ffffff', 4, 6);
      break;
    }
    case 'bottle': {
      px(ctx, 9, 9, outline, 14, 16);
      px(ctx, 10, 10, 'rgba(220,240,250,0.9)', 12, 14);
      px(ctx, 10, 14, c, 12, 10);
      px(ctx, 13, 3, outline, 6, 7); px(ctx, 14, 4, '#cfe8f0', 4, 5);
      px(ctx, 13, 2, '#5a3a22', 6, 2);
      break;
    }
    case 'rust': {
      for (let y = 10; y < 24; y++) {
        const half = Math.floor((y - 8) * 0.9);
        px(ctx, 16 - half, y, outline, half * 2, 1);
        for (let x = 17 - half; x < 15 + half; x++) {
          const v = ((x * 7 + y * 13) % 5) / 10;
          px(ctx, x, y, shadeHex(c, 0.8 + v));
        }
      }
      break;
    }
    case 'sugar': {
      for (const [x, y] of [[6, 13], [16, 13], [11, 5]]) {
        px(ctx, x, y, outline, 10, 10);
        px(ctx, x + 1, y + 1, '#ffffff', 8, 8);
        px(ctx, x + 1, y + 7, '#e0dccc', 8, 2);
        px(ctx, x + 3, y + 3, '#f0ecdc', 2, 2);
      }
      break;
    }
    case 'box': {
      px(ctx, 6, 5, outline, 20, 20);
      px(ctx, 7, 6, c, 18, 18);
      px(ctx, 7, 6, '#ffd08a', 18, 3);
      px(ctx, 9, 11, '#ffffff', 14, 7);
      break;
    }
    default:
      px(ctx, 8, 8, c, 16, 16);
  }
  drawLabel(ctx, r.formula);
}

function drawGeneric(ctx: Ctx, key: string) {
  const star = () => {
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++) {
        const a = Math.atan2(y - 16, x - 16);
        const d = Math.hypot(x - 16, y - 16);
        const rr = 9 + 5 * Math.cos(a * 5);
        if (d < rr) px(ctx, x, y, d < rr - 2 ? '#ffd34f' : '#a86a10');
      }
  };
  switch (key) {
    case 'star': star(); break;
    case 'book':
      px(ctx, 6, 5, '#1a1a1a', 20, 22); px(ctx, 7, 6, '#8b2f2f', 18, 20); px(ctx, 9, 8, '#f0e6d0', 13, 16); px(ctx, 11, 11, '#8b6a3a', 9, 1); px(ctx, 11, 14, '#8b6a3a', 9, 1);
      break;
    case 'atom':
      drawAtom(ctx, 'C');
      break;
    default:
      star();
  }
}

const cache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

export function iconCanvas(id: string): HTMLCanvasElement {
  let c = cache.get(id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  if (ELEMENTS[id]) drawAtom(ctx, id);
  else if (RECIPE_BY_ID[id]) drawSubstance(ctx, id);
  else drawGeneric(ctx, id);
  cache.set(id, c);
  return c;
}

export function iconUrl(id: string): string {
  let u = urlCache.get(id);
  if (!u) {
    u = iconCanvas(id).toDataURL();
    urlCache.set(id, u);
  }
  return u;
}

/** Map achievement icon keys to an item icon. */
export const ACHIEVEMENT_ICON: Record<string, string> = {
  flask: 'hydrogen_peroxide', bucket: 'water', jar: 'sodium_chloride', canister: 'carbon_dioxide', chalk: 'calcium_carbonate',
  book: 'book', star: 'star', map: 'iron_oxide', key: 'star', atom: 'C', bottle: 'ammonia', scale: 'star', bulb: 'glucose',
};
