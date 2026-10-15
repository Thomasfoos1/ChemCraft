/**
 * Coloured block-light flood fill (Minecraft-style). Light sources emit 0–15 per channel,
 * decreasing by one per block through transparent cells. Opaque blocks stop light, which
 * naturally produces shadows in corridors and behind pillars.
 */
import { LIGHT_B, LIGHT_G, LIGHT_R, OPAQUE } from './blocks';
import { VoxelWorld } from './world';

const QUEUE_SIZE = 1 << 21;
const QUEUE_MASK = QUEUE_SIZE - 1;
let queue: Int32Array | null = null;

const SKY: [number, number, number] = [15, 15, 14];

export interface LightBox {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
}

function emission(w: VoxelWorld, x: number, y: number, z: number, i: number): [number, number, number] {
  const id = w.blocks[i];
  let r = LIGHT_R[id], g = LIGHT_G[id], b = LIGHT_B[id];
  if (!OPAQUE[id] && y > w.skyHeight[x + w.W * z]) {
    r = Math.max(r, SKY[0]);
    g = Math.max(g, SKY[1]);
    b = Math.max(b, SKY[2]);
  }
  return [r, g, b];
}

/**
 * Recompute light inside the box (inclusive), seeding from the box's emitters and from the
 * existing light just outside it. Returns the bounding box of cells whose light changed, or null.
 */
export function relightRegion(w: VoxelWorld, box: LightBox): LightBox | null {
  if (!queue) queue = new Int32Array(QUEUE_SIZE);
  const q = queue;
  const x0 = Math.max(0, box.x0), y0 = Math.max(0, box.y0), z0 = Math.max(0, box.z0);
  const x1 = Math.min(w.W - 1, box.x1), y1 = Math.min(w.H - 1, box.y1), z1 = Math.min(w.D - 1, box.z1);
  const sx = x1 - x0 + 1, sy = y1 - y0 + 1, sz = z1 - z0 + 1;
  const old = new Uint16Array(sx * sy * sz);
  const { lightR: LR, lightG: LG, lightB: LB, W, D } = w;
  const strideY = W * D;

  let head = 0, tail = 0;
  const push = (i: number) => {
    q[tail & QUEUE_MASK] = i;
    tail++;
  };

  // Clear and seed emitters.
  let k = 0;
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++, k++) {
        const i = x + W * (z + D * y);
        old[k] = (LR[i] << 8) | (LG[i] << 4) | LB[i];
        const [r, g, b] = emission(w, x, y, z, i);
        LR[i] = r; LG[i] = g; LB[i] = b;
        if (r > 1 || g > 1 || b > 1) push(i);
      }
  // Seed from the shell just outside the box.
  const seedShell = (x: number, y: number, z: number) => {
    if (!w.inBounds(x, y, z)) return;
    const i = x + W * (z + D * y);
    if (LR[i] > 1 || LG[i] > 1 || LB[i] > 1) push(i);
  };
  for (let y = y0 - 1; y <= y1 + 1; y++)
    for (let z = z0 - 1; z <= z1 + 1; z++)
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1;
        if (!inside) seedShell(x, y, z);
      }

  // Breadth-first propagation, confined to the box.
  while (head < tail) {
    const i = q[head & QUEUE_MASK];
    head++;
    const r = LR[i] - 1, g = LG[i] - 1, b = LB[i] - 1;
    if (r <= 0 && g <= 0 && b <= 0) continue;
    const x = i % W;
    const rest = (i - x) / W;
    const z = rest % D;
    const y = (rest - z) / D;
    for (let n = 0; n < 6; n++) {
      let nx = x, ny = y, nz = z;
      if (n === 0) nx++; else if (n === 1) nx--; else if (n === 2) ny++; else if (n === 3) ny--; else if (n === 4) nz++; else nz--;
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || nz < z0 || nz > z1) continue;
      const j = nx + W * nz + strideY * ny;
      if (OPAQUE[w.blocks[j]]) continue;
      let changed = false;
      if (r > LR[j]) { LR[j] = r; changed = true; }
      if (g > LG[j]) { LG[j] = g; changed = true; }
      if (b > LB[j]) { LB[j] = b; changed = true; }
      if (changed) push(j);
    }
  }

  // Find the changed bounds.
  let cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
  k = 0;
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++, k++) {
        const i = x + W * (z + D * y);
        const now = (LR[i] << 8) | (LG[i] << 4) | LB[i];
        if (now !== old[k]) {
          if (x < cx0) cx0 = x; if (y < cy0) cy0 = y; if (z < cz0) cz0 = z;
          if (x > cx1) cx1 = x; if (y > cy1) cy1 = y; if (z > cz1) cz1 = z;
        }
      }
  if (cx0 === Infinity) return null;
  return { x0: cx0, y0: cy0, z0: cz0, x1: cx1, y1: cy1, z1: cz1 };
}

export function computeAllLight(w: VoxelWorld) {
  w.lightR.fill(0);
  w.lightG.fill(0);
  w.lightB.fill(0);
  relightRegion(w, { x0: 0, y0: 0, z0: 0, x1: w.W - 1, y1: w.H - 1, z1: w.D - 1 });
}

/** Relight after a block change at (x,y,z) and mark affected chunks dirty. */
export function relightAround(w: VoxelWorld, x: number, y: number, z: number, radius = 15) {
  const changed = relightRegion(w, { x0: x - radius, y0: y - radius, z0: z - radius, x1: x + radius, y1: y + radius, z1: z + radius });
  if (changed) w.markRegionDirty(changed.x0, changed.y0, changed.z0, changed.x1, changed.y1, changed.z1);
}

/** Relight an arbitrary box (e.g. after a bridge or several blocks change). */
export function relightBox(w: VoxelWorld, box: LightBox, pad = 15) {
  const changed = relightRegion(w, {
    x0: box.x0 - pad, y0: box.y0 - pad, z0: box.z0 - pad, x1: box.x1 + pad, y1: box.y1 + pad, z1: box.z1 + pad,
  });
  if (changed) w.markRegionDirty(changed.x0, changed.y0, changed.z0, changed.x1, changed.y1, changed.z1);
}

/** Sample light at a world position as linear 0..1 RGB (for entities). */
export function sampleLight(w: VoxelWorld, x: number, y: number, z: number): [number, number, number] {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  if (!w.inBounds(ix, iy, iz)) return [0.3, 0.3, 0.3];
  const i = w.index(ix, iy, iz);
  return [lightCurve(w.lightR[i]), lightCurve(w.lightG[i]), lightCurve(w.lightB[i])];
}

/**
 * Perceptual brightness for a (possibly fractional) light level, modelled on the classic
 * voxel-game light map: a "moody" curve blended toward a brightened gamma curve by the
 * player's brightness setting, with an ambient floor so nothing is pitch black.
 */
export function lightCurve(level: number, minimum = AMBIENT.value): number {
  const r = Math.max(0, Math.min(15, level)) / 15;
  const moody = r / ((1 - r) * 3 + 1);
  const bright = 1 - Math.pow(1 - moody, 4);
  const v = moody + (bright - moody) * AMBIENT.brightness;
  return Math.max(minimum, v);
}

/** Ambient floor and brightness blend, adjustable from the brightness setting. */
export const AMBIENT = { value: 0.11, brightness: 0.625 };
