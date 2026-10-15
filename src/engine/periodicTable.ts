/** Canvas-drawn periodic table for the Grand Laboratory wall. The game's 8 elements glow. */
import * as THREE from 'three';
import { ELEMENTS } from '../chem/elements';

const SYMBOLS = (
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu ' +
  'Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr ' +
  'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'
).split(' ');

type Cat = 'alkali' | 'alkaline' | 'transition' | 'post' | 'metalloid' | 'nonmetal' | 'halogen' | 'noble' | 'lanthanide' | 'actinide';

const COLORS: Record<Cat, string> = {
  alkali: '#d8574a', alkaline: '#e09a3a', transition: '#c8a85a', post: '#7a9a8a', metalloid: '#5aa08a',
  nonmetal: '#4a9ad8', halogen: '#6ac85a', noble: '#9a6ad8', lanthanide: '#c86a9a', actinide: '#b8587a',
};

function category(z: number): Cat {
  if ([1, 6, 7, 8, 15, 16, 34].includes(z)) return 'nonmetal';
  if ([9, 17, 35, 53, 85, 117].includes(z)) return 'halogen';
  if ([2, 10, 18, 36, 54, 86, 118].includes(z)) return 'noble';
  if ([3, 11, 19, 37, 55, 87].includes(z)) return 'alkali';
  if ([4, 12, 20, 38, 56, 88].includes(z)) return 'alkaline';
  if ([5, 14, 32, 33, 51, 52].includes(z)) return 'metalloid';
  if (z >= 57 && z <= 71) return 'lanthanide';
  if (z >= 89 && z <= 103) return 'actinide';
  if ([13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116].includes(z)) return 'post';
  return 'transition';
}

/** [row, col] (0-based) on the standard 18-column layout; f-block on rows 8-9. */
function position(z: number): [number, number] {
  if (z === 1) return [0, 0];
  if (z === 2) return [0, 17];
  if (z <= 10) return [1, z <= 4 ? z - 3 : z + 7];
  if (z <= 18) return [2, z <= 12 ? z - 11 : z - 1];
  if (z <= 36) return [3, z - 19];
  if (z <= 54) return [4, z - 37];
  if (z >= 57 && z <= 71) return [8, z - 57 + 2];
  if (z >= 89 && z <= 103) return [9, z - 89 + 2];
  const row = z <= 86 ? 5 : 6;
  const start = z <= 86 ? 55 : 87;
  const off = z - start;
  return [row, off <= 1 ? off : off - 14];
}

export function periodicTableTexture(): THREE.CanvasTexture {
  const W = 1024, H = 600;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#10161e';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c8a040';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.fillStyle = '#ffd34f';
  ctx.font = 'bold 34px "Press Start 2P", "VT323", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PERIODIC TABLE OF THE ELEMENTS', W / 2, 52);
  const cw = 54, ch = 50, ox = (W - cw * 18) / 2, oy = 72;
  const highlight = new Set(Object.keys(ELEMENTS));
  SYMBOLS.forEach((sym, i) => {
    const z = i + 1;
    const [row, col] = position(z);
    const x = ox + col * cw;
    const y = oy + row * ch + (row >= 8 ? 14 : 0);
    const hl = highlight.has(sym);
    ctx.fillStyle = COLORS[category(z)];
    ctx.globalAlpha = hl ? 1 : 0.55;
    ctx.fillRect(x + 2, y + 2, cw - 4, ch - 4);
    ctx.globalAlpha = 1;
    if (hl) {
      ctx.strokeStyle = '#fff6b0';
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 2, y + 2, cw - 4, ch - 4);
    }
    ctx.fillStyle = hl ? '#ffffff' : '#e8e8e8';
    ctx.font = `bold ${hl ? 24 : 21}px "VT323", monospace`;
    ctx.fillText(sym, x + cw / 2, y + 36);
    ctx.font = '14px "VT323", monospace';
    ctx.fillText(String(z), x + cw / 2, y + 15);
  });
  ctx.textAlign = 'left';
  ctx.font = '18px "VT323", monospace';
  let lx = 40;
  for (const [k, col] of Object.entries(COLORS)) {
    ctx.fillStyle = col;
    ctx.fillRect(lx, H - 34, 14, 14);
    ctx.fillStyle = '#dddddd';
    ctx.fillText(k, lx + 18, H - 22);
    lx += 96;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
