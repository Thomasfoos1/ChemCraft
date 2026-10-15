import { B, OPAQUE, SOLID } from './blocks';

export const CHUNK = 16;

/**
 * Dense voxel grid. Stores block ids, a 2-bit facing per cell (for machine fronts),
 * and three 4-bit light channels (coloured block light, Minecraft style).
 */
export class VoxelWorld {
  readonly blocks: Uint8Array;
  readonly meta: Uint8Array;
  readonly lightR: Uint8Array;
  readonly lightG: Uint8Array;
  readonly lightB: Uint8Array;
  /** Highest opaque-or-solid y per column; cells above are open to the sky. */
  readonly skyHeight: Int16Array;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly dirty = new Set<number>();
  /** Set while generating so we don't mark thousands of chunks one by one. */
  bulk = false;

  constructor(
    readonly W: number,
    readonly H: number,
    readonly D: number,
  ) {
    const n = W * H * D;
    this.blocks = new Uint8Array(n);
    this.meta = new Uint8Array(n);
    this.lightR = new Uint8Array(n);
    this.lightG = new Uint8Array(n);
    this.lightB = new Uint8Array(n);
    this.skyHeight = new Int16Array(W * D).fill(H);
    this.cx = Math.ceil(W / CHUNK);
    this.cy = Math.ceil(H / CHUNK);
    this.cz = Math.ceil(D / CHUNK);
  }

  index(x: number, y: number, z: number): number {
    return x + this.W * (z + this.D * y);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.W && y < this.H && z < this.D;
  }

  /** Out of bounds reads as bedrock-like stone so the edges are sealed. */
  get(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return y >= this.H ? B.AIR : B.STONE;
    return this.blocks[this.index(x, y, z)];
  }

  getMeta(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 0;
    return this.meta[this.index(x, y, z)];
  }

  isSolid(x: number, y: number, z: number): boolean {
    return SOLID[this.get(x, y, z)] === 1;
  }

  isOpaque(x: number, y: number, z: number): boolean {
    return OPAQUE[this.get(x, y, z)] === 1;
  }

  set(x: number, y: number, z: number, id: number, meta = 0) {
    if (!this.inBounds(x, y, z)) return;
    const i = this.index(x, y, z);
    if (this.blocks[i] === id && this.meta[i] === meta) return;
    this.blocks[i] = id;
    this.meta[i] = meta;
    if (!this.bulk) this.markDirtyAround(x, y, z);
  }

  chunkKey(cx: number, cy: number, cz: number): number {
    return cx + this.cx * (cz + this.cz * cy);
  }

  chunkCoords(key: number): [number, number, number] {
    const cx = key % this.cx;
    const rest = Math.floor(key / this.cx);
    const cz = rest % this.cz;
    const cy = Math.floor(rest / this.cz);
    return [cx, cy, cz];
  }

  markDirtyAround(x: number, y: number, z: number) {
    // The cell and its neighbours can affect faces/AO in adjacent chunks.
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const nx = x + dx, ny = y + dy, nz = z + dz;
          if (!this.inBounds(nx, ny, nz)) continue;
          this.dirty.add(this.chunkKey(Math.floor(nx / CHUNK), Math.floor(ny / CHUNK), Math.floor(nz / CHUNK)));
        }
  }

  markRegionDirty(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const c0x = Math.max(0, Math.floor((x0 - 1) / CHUNK)), c1x = Math.min(this.cx - 1, Math.floor((x1 + 1) / CHUNK));
    const c0y = Math.max(0, Math.floor((y0 - 1) / CHUNK)), c1y = Math.min(this.cy - 1, Math.floor((y1 + 1) / CHUNK));
    const c0z = Math.max(0, Math.floor((z0 - 1) / CHUNK)), c1z = Math.min(this.cz - 1, Math.floor((z1 + 1) / CHUNK));
    for (let cy = c0y; cy <= c1y; cy++)
      for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) this.dirty.add(this.chunkKey(cx, cy, cz));
  }

  markAllDirty() {
    for (let cy = 0; cy < this.cy; cy++)
      for (let cz = 0; cz < this.cz; cz++) for (let cx = 0; cx < this.cx; cx++) this.dirty.add(this.chunkKey(cx, cy, cz));
  }

  computeSkyHeights() {
    for (let z = 0; z < this.D; z++)
      for (let x = 0; x < this.W; x++) {
        let h = -1;
        for (let y = this.H - 1; y >= 0; y--) {
          const id = this.blocks[this.index(x, y, z)];
          if (OPAQUE[id] || SOLID[id]) {
            h = y;
            break;
          }
        }
        this.skyHeight[x + this.W * z] = h;
      }
  }

  /** Fill an inclusive box. */
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number, meta = 0) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) this.set(x, y, z, id, meta);
  }
}
