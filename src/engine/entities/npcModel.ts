/**
 * Blocky scientist "villagers": large cubic heads, big noses, lab coats with coloured shirts
 * and ties, and glasses or goggles. All textures are painted procedurally.
 */
import * as THREE from 'three';
import { NpcDef } from '../../content';

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function canvasTex(w: number, h: number, paint: Painter): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const r = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, base: string, seed: number) {
  let s = seed;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      s = (s * 9301 + 49297) % 233280;
      const f = 0.94 + (s / 233280) * 0.1;
      r(ctx, x, y, 1, 1, shade(base, f));
    }
}

/** Front of the head at 16×20. Shared by the 3D model and the dialogue portrait. */
export function paintFace(n: NpcDef): Painter {
  return (ctx) => {
    speckle(ctx, 16, 20, n.skin, n.name.length);
    // hair
    r(ctx, 0, 0, 16, 4, n.hair);
    r(ctx, 0, 4, 2, 3, n.hair);
    r(ctx, 14, 4, 2, 3, n.hair);
    // eyebrows
    r(ctx, 3, 7, 4, 1, shade(n.hair, 0.7));
    r(ctx, 9, 7, 4, 1, shade(n.hair, 0.7));
    // eyes
    r(ctx, 3, 9, 4, 2, '#ffffff');
    r(ctx, 9, 9, 4, 2, '#ffffff');
    r(ctx, 5, 9, 2, 2, n.eyes);
    r(ctx, 9, 9, 2, 2, n.eyes);
    if (n.eyewear === 'glasses') {
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1;
      ctx.strokeRect(2.5, 8.5, 5, 3);
      ctx.strokeRect(8.5, 8.5, 5, 3);
      r(ctx, 7, 9, 2, 1, '#1a1a1a');
    } else {
      // goggles band
      r(ctx, 0, 8, 16, 4, '#3a3a3a');
      r(ctx, 2, 8, 5, 4, '#1a1a1a');
      r(ctx, 9, 8, 5, 4, '#1a1a1a');
      r(ctx, 3, 9, 3, 2, '#7ad8ff');
      r(ctx, 10, 9, 3, 2, '#7ad8ff');
      r(ctx, 3, 9, 1, 1, '#e8faff');
      r(ctx, 10, 9, 1, 1, '#e8faff');
    }
    // mouth & beard
    if (n.beard) {
      r(ctx, 2, 15, 12, 5, n.hair);
      r(ctx, 5, 16, 6, 1, '#5a2a1a');
    } else {
      r(ctx, 5, 16, 6, 1, '#7a3a2a');
    }
  };
}

function paintHeadSide(n: NpcDef): Painter {
  return (ctx) => {
    speckle(ctx, 16, 20, n.skin, 7);
    r(ctx, 0, 0, 16, 5, n.hair);
    r(ctx, 10, 5, 6, 6, n.hair);
    r(ctx, 5, 10, 3, 3, shade(n.skin, 0.85)); // ear
    if (n.eyewear === 'goggles') r(ctx, 0, 8, 16, 2, '#3a3a3a');
    else r(ctx, 0, 9, 7, 1, '#1a1a1a');
    if (n.beard) r(ctx, 0, 14, 6, 6, n.hair);
  };
}

function paintHeadBack(n: NpcDef): Painter {
  return (ctx) => {
    speckle(ctx, 16, 20, n.hair, 11);
    if (n.eyewear === 'goggles') r(ctx, 0, 8, 16, 2, '#3a3a3a');
    r(ctx, 0, 16, 16, 4, shade(n.skin, 0.95));
  };
}

function paintCoatFront(n: NpcDef): Painter {
  return (ctx) => {
    speckle(ctx, 16, 24, '#f2f4f6', 3);
    r(ctx, 6, 0, 4, 15, n.shirt);
    r(ctx, 7, 1, 2, 11, n.tie);
    r(ctx, 7, 0, 2, 1, shade(n.tie, 0.8));
    // lapels
    for (let i = 0; i < 6; i++) {
      r(ctx, 5 - Math.floor(i / 2), i, 1, 1, '#c8ccd0');
      r(ctx, 10 + Math.floor(i / 2), i, 1, 1, '#c8ccd0');
    }
    // pocket + pens
    r(ctx, 1, 6, 4, 4, '#dfe3e6');
    r(ctx, 2, 4, 1, 3, '#2a5ad8');
    r(ctx, 3, 4, 1, 3, '#d82a2a');
    // buttons and hem
    r(ctx, 11, 16, 1, 1, '#9aa0a6');
    r(ctx, 11, 20, 1, 1, '#9aa0a6');
    r(ctx, 0, 23, 16, 1, '#c8ccd0');
    r(ctx, 7, 15, 1, 9, '#c8ccd0');
  };
}

function paintCoatSide(): Painter {
  return (ctx, w, h) => {
    speckle(ctx, w, h, '#eef0f2', 5);
    r(ctx, 0, h - 1, w, 1, '#c8ccd0');
  };
}

function paintCoatBack(): Painter {
  return (ctx, w, h) => {
    speckle(ctx, w, h, '#eef0f2', 9);
    r(ctx, 7, 10, 2, h - 10, '#d8dce0');
    r(ctx, 3, 9, 10, 1, '#d8dce0');
  };
}

function paintLeg(): Painter {
  return (ctx, w, h) => {
    speckle(ctx, w, h, '#3a3a52', 13);
    r(ctx, 0, h - 3, w, 3, '#1e1e24');
  };
}

function paintArm(n: NpcDef): Painter {
  return (ctx, w, h) => {
    speckle(ctx, w, h, '#eef0f2', 17);
    r(ctx, 0, h - 4, w, 4, n.skin);
    r(ctx, 0, h - 5, w, 1, '#c8ccd0');
  };
}

/** Mirror a painter horizontally (BoxGeometry's -X face runs back-to-front). */
function mirrored(paint: Painter): Painter {
  return (ctx, w, h) => {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    paint(ctx, w, h);
  };
}

function solidTex(color: string): THREE.CanvasTexture {
  return canvasTex(4, 4, (ctx) => speckle(ctx, 4, 4, color, 1));
}

export interface NpcModel {
  group: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
  nameTag: THREE.Sprite;
  marker: THREE.Sprite;
}

function box(w: number, h: number, d: number, faces: THREE.Texture[], mats: THREE.MeshBasicMaterial[]): THREE.Mesh {
  // three.js BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  const materials = faces.map((t) => {
    const m = new THREE.MeshBasicMaterial({ map: t });
    mats.push(m);
    return m;
  });
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials);
}

export function makeLabelSprite(text: string, color = '#ffffff', bg = 'rgba(0,0,0,0.45)'): THREE.Sprite {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = 'bold 28px "VT323", monospace';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 20;
  c.width = w;
  c.height = 40;
  ctx.font = font;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, 40);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 10, 21);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set((w / 40) * 0.32, 0.32, 1);
  return s;
}

function makeMarker(): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  r(ctx, 5, 2, 6, 18, '#1a1a1a');
  r(ctx, 6, 3, 4, 16, '#ffd34f');
  r(ctx, 5, 23, 6, 7, '#1a1a1a');
  r(ctx, 6, 24, 4, 5, '#ffd34f');
  r(ctx, 6, 3, 1, 16, '#fff3b0');
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(0.25, 0.5, 1);
  return s;
}

const P = 1 / 16;

export function buildNpcModel(n: NpcDef): NpcModel {
  const mats: THREE.MeshBasicMaterial[] = [];
  const group = new THREE.Group();

  // Legs
  const legTex = canvasTex(4, 8, paintLeg());
  for (const side of [-1, 1]) {
    const leg = box(4 * P, 8 * P, 4 * P, [legTex, legTex, solidTex('#3a3a52'), solidTex('#1e1e24'), legTex, legTex], mats);
    leg.position.set(side * 2 * P, 4 * P, 0);
    group.add(leg);
  }
  // Body (lab coat)
  const front = canvasTex(16, 24, paintCoatFront(n));
  const side = canvasTex(6, 12, paintCoatSide());
  const back = canvasTex(16, 24, paintCoatBack());
  const body = box(8 * P, 12 * P, 6 * P, [side, side, solidTex('#eef0f2'), solidTex('#eef0f2'), front, back], mats);
  body.position.set(0, 14 * P, 0);
  group.add(body);
  // Coat tail over the upper legs
  const tail = box(8.6 * P, 4 * P, 6.6 * P, [side, side, solidTex('#eef0f2'), solidTex('#d8dce0'), back, back], mats);
  tail.position.set(0, 6.2 * P, 0);
  group.add(tail);

  // Arms (pivot at the shoulder)
  const armTex = canvasTex(3, 11, paintArm(n));
  const mkArm = (s: number) => {
    const g = new THREE.Group();
    const a = box(3 * P, 11 * P, 3 * P, [armTex, armTex, solidTex('#eef0f2'), solidTex(n.skin), armTex, armTex], mats);
    a.position.set(0, -5 * P, 0);
    g.add(a);
    g.position.set(s * 5.5 * P, 19.5 * P, 0);
    group.add(g);
    return g;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);

  // Head (pivot at the neck)
  const head = new THREE.Group();
  const faceTex = canvasTex(16, 20, paintFace(n));
  const sideTex = canvasTex(16, 20, paintHeadSide(n));
  const sideTexM = canvasTex(16, 20, mirrored(paintHeadSide(n)));
  const backTex = canvasTex(16, 20, paintHeadBack(n));
  const hairTex = solidTex(n.hair);
  const headMesh = box(8 * P, 10 * P, 8 * P, [sideTex, sideTexM, hairTex, solidTex(n.skin), faceTex, backTex], mats);
  headMesh.position.set(0, 5 * P, 0);
  head.add(headMesh);
  const noseTex = canvasTex(2, 4, (ctx) => { r(ctx, 0, 0, 2, 4, shade(n.skin, 0.92)); r(ctx, 0, 3, 2, 1, shade(n.skin, 0.75)); });
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2 * P, 4 * P, 2 * P), new THREE.MeshBasicMaterial({ map: noseTex }));
  mats.push(nose.material as THREE.MeshBasicMaterial);
  nose.position.set(0, 3.2 * P, 5 * P);
  head.add(nose);
  head.position.set(0, 20 * P, 0);
  group.add(head);

  const nameTag = makeLabelSprite(n.name);
  nameTag.position.set(0, 2.25, 0);
  group.add(nameTag);
  const marker = makeMarker();
  marker.position.set(0, 2.75, 0);
  group.add(marker);

  return { group, head, armL, armR, materials: mats, nameTag, marker };
}

const portraitCache = new Map<string, string>();

/** Dialogue portrait: the face plus a hint of the coat, scaled up crisply. */
export function npcPortraitUrl(n: NpcDef): string {
  const hit = portraitCache.get(n.id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 24;
  c.height = 28;
  const ctx = c.getContext('2d')!;
  r(ctx, 0, 0, 24, 28, '#2a2a2a');
  const face = document.createElement('canvas');
  face.width = 16;
  face.height = 20;
  paintFace(n)(face.getContext('2d')!, 16, 20);
  ctx.drawImage(face, 4, 1);
  r(ctx, 11, 12, 2, 4, shade(n.skin, 0.85));
  r(ctx, 0, 21, 24, 7, '#eef0f2');
  r(ctx, 9, 21, 6, 7, n.shirt);
  r(ctx, 11, 21, 2, 7, n.tie);
  const big = document.createElement('canvas');
  big.width = 24 * 5;
  big.height = 28 * 5;
  const b = big.getContext('2d')!;
  b.imageSmoothingEnabled = false;
  b.drawImage(c, 0, 0, big.width, big.height);
  const url = big.toDataURL();
  portraitCache.set(n.id, url);
  return url;
}
