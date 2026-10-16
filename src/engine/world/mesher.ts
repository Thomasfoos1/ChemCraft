/**
 * Builds chunk geometry with hidden-face culling, per-vertex smooth lighting and ambient
 * occlusion (the classic voxel look). Output is plain typed arrays so it is easy to test
 * and could move to a worker later.
 */
import { BLOCKS, B, LIGHT_B, LIGHT_G, LIGHT_R, OPAQUE } from './blocks';
import { ATLAS_COLS } from './tiles';
import { CHUNK, VoxelWorld } from './world';
import { AMBIENT, lightCurve } from './lighting';

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

export interface ChunkMeshes {
  opaque: MeshData | null;
  translucent: MeshData | null;
  water: MeshData | null;
  lava: MeshData | null;
}

class Builder {
  p: number[] = [];
  uv: number[] = [];
  c: number[] = [];
  idx: number[] = [];
  vcount = 0;
  build(): MeshData | null {
    if (this.vcount === 0) return null;
    return {
      positions: new Float32Array(this.p),
      uvs: new Float32Array(this.uv),
      colors: new Float32Array(this.c),
      indices: new Uint32Array(this.idx),
    };
  }
}

// Faces: +X, -X, +Y, -Y, +Z, -Z. Corners listed bottom-left, bottom-right, top-right, top-left (CCW from outside).
const FACES = [
  { n: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.62 },
  { n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.62 },
  { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8 },
  { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8 },
] as const;

/** Facing meta -> face index that shows the "front" texture. 0:-Z 1:+X 2:+Z 3:-X */
const FRONT_FACE = [5, 0, 4, 1];

const AO_CURVE = [0.5, 0.68, 0.84, 1.0];

/** Lookup: averaged light level (in 1/12 steps) -> linear brightness. */
let LIGHT_TABLE = new Float32Array(15 * 12 + 1);
let tableKey = '';
function ensureTable() {
  const key = `${AMBIENT.value}:${AMBIENT.brightness}`;
  if (tableKey === key) return;
  tableKey = key;
  LIGHT_TABLE = new Float32Array(15 * 12 + 1);
  for (let i = 0; i <= 15 * 12; i++) LIGHT_TABLE[i] = lightCurve(i / 12);
}
const toLinear = (v: number) => Math.pow(Math.min(1, v), 2.2);

const ROWS = 16;
const EPS = 0.0008;
function tileUV(tile: number): [number, number, number, number] {
  const col = tile % ATLAS_COLS;
  const row = Math.floor(tile / ATLAS_COLS);
  const u0 = col / ATLAS_COLS + EPS;
  const u1 = (col + 1) / ATLAS_COLS - EPS;
  const v1 = 1 - row / ROWS - EPS;
  const v0 = 1 - (row + 1) / ROWS + EPS;
  return [u0, v0, u1, v1];
}

export function buildChunk(w: VoxelWorld, cx: number, cy: number, cz: number): ChunkMeshes {
  ensureTable();
  const opaque = new Builder();
  const translucent = new Builder();
  const water = new Builder();
  const lava = new Builder();
  const x0 = cx * CHUNK, y0 = cy * CHUNK, z0 = cz * CHUNK;
  const x1 = Math.min(w.W, x0 + CHUNK), y1 = Math.min(w.H, y0 + CHUNK), z1 = Math.min(w.D, z0 + CHUNK);
  const { blocks, lightR, lightG, lightB } = w;

  const lightAt = (x: number, y: number, z: number, out: number[]) => {
    if (!w.inBounds(x, y, z)) {
      out[0] = out[1] = out[2] = 0;
      return;
    }
    const i = w.index(x, y, z);
    out[0] = lightR[i];
    out[1] = lightG[i];
    out[2] = lightB[i];
  };
  const tmp = [0, 0, 0];

  for (let y = y0; y < y1; y++)
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++) {
        const id = blocks[w.index(x, y, z)];
        if (id === B.AIR) continue;
        const def = BLOCKS[id];
        const render = def.render;
        if (render === 'none') continue;
        if (render === 'torch') {
          emitTorch(opaque, x, y, z, def.tiles.side);
          continue;
        }
        if (render === 'cross') {
          lightAt(x, y, z, tmp);
          emitCross(opaque, x, y, z, def.tiles.side, tmp);
          continue;
        }
        const isLiquid = render === 'water' || render === 'lava';
        const target = render === 'water' ? water : render === 'lava' ? lava : render === 'translucent' ? translucent : opaque;
        const meta = w.meta[w.index(x, y, z)] & 3;
        const emissive = LIGHT_R[id] > 0 || LIGHT_G[id] > 0 || LIGHT_B[id] > 0;
        const above = w.get(x, y + 1, z);
        const liquidTop = isLiquid && above !== id ? 0.875 : 1;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = x + face.n[0], ny = y + face.n[1], nz = z + face.n[2];
          const nid = w.get(nx, ny, nz);
          if (OPAQUE[nid]) continue;
          if (render !== 'cube' && nid === id) continue;
          if (isLiquid && f === 3 && nid !== B.AIR && !OPAQUE[nid]) {
            // liquid bottom over non-air: skip
            continue;
          }
          let tile: number;
          if (f === 2) tile = def.tiles.top;
          else if (f === 3) tile = def.tiles.bottom;
          else tile = f === FRONT_FACE[meta] ? def.tiles.front : def.tiles.side;

          // Per-vertex AO + smooth light.
          const axis = face.n[0] !== 0 ? 0 : face.n[1] !== 0 ? 1 : 2;
          const t1 = axis === 0 ? 1 : 0;
          const t2 = axis === 2 ? 1 : 2;
          const aos = [0, 0, 0, 0];
          const cols: number[][] = [];
          for (let v = 0; v < 4; v++) {
            const corner = face.corners[v];
            const s1 = corner[t1] === 1 ? 1 : -1;
            const s2 = corner[t2] === 1 ? 1 : -1;
            const d1 = [0, 0, 0];
            const d2 = [0, 0, 0];
            d1[t1] = s1;
            d2[t2] = s2;
            const a = [nx + d1[0], ny + d1[1], nz + d1[2]];
            const b = [nx + d2[0], ny + d2[1], nz + d2[2]];
            const c = [nx + d1[0] + d2[0], ny + d1[1] + d2[1], nz + d1[2] + d2[2]];
            const sa = OPAQUE[w.get(a[0], a[1], a[2])];
            const sb = OPAQUE[w.get(b[0], b[1], b[2])];
            const sc = OPAQUE[w.get(c[0], c[1], c[2])];
            const ao = sa && sb ? 0 : 3 - (sa + sb + sc);
            aos[v] = ao;
            let lr = 0, lg = 0, lb = 0, cnt = 0;
            lightAt(nx, ny, nz, tmp);
            lr += tmp[0]; lg += tmp[1]; lb += tmp[2]; cnt++;
            if (!sa) { lightAt(a[0], a[1], a[2], tmp); lr += tmp[0]; lg += tmp[1]; lb += tmp[2]; cnt++; }
            if (!sb) { lightAt(b[0], b[1], b[2], tmp); lr += tmp[0]; lg += tmp[1]; lb += tmp[2]; cnt++; }
            if (!sc && !(sa && sb)) { lightAt(c[0], c[1], c[2], tmp); lr += tmp[0]; lg += tmp[1]; lb += tmp[2]; cnt++; }
            lr /= cnt; lg /= cnt; lb /= cnt;
            if (emissive) {
              lr = Math.max(lr, LIGHT_R[id] + 2);
              lg = Math.max(lg, LIGHT_G[id] + 2);
              lb = Math.max(lb, LIGHT_B[id] + 2);
            }
            const aoF = emissive ? 1 : AO_CURVE[ao];
            const shade = emissive ? Math.max(face.shade, 0.85) : face.shade;
            const L = (l: number) => LIGHT_TABLE[Math.min(180, Math.round(Math.min(15, l) * 12))];
            // Face shading and AO darken faces, but never below a floor tied to the ambient
            // level, so corners and undersides in unlit areas remain readable.
            const floor = AMBIENT.value * (0.7 + 0.3 * shade);
            const lit = (l: number) => toLinear(Math.max(L(l) * shade * aoF, floor));
            cols.push([lit(lr), lit(lg), lit(lb)]);
          }

          const base = target.vcount;
          for (let v = 0; v < 4; v++) {
            const corner = face.corners[v];
            const cyv = corner[1] === 1 ? liquidTop : 0;
            target.p.push(x + corner[0], y + cyv, z + corner[2]);
            target.c.push(cols[v][0], cols[v][1], cols[v][2]);
          }
          if (isLiquid) {
            // world-space UVs so the animated texture tiles seamlessly
            for (let v = 0; v < 4; v++) {
              const corner = face.corners[v];
              const wx = x + corner[0], wy = y + corner[1], wz = z + corner[2];
              if (axis === 1) target.uv.push(wx, wz);
              else if (axis === 0) target.uv.push(wz, wy);
              else target.uv.push(wx, wy);
            }
          } else {
            const [u0, v0, u1, v1] = tileUV(tile);
            target.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
          }
          // Flip the quad diagonal to avoid AO artefacts.
          if (aos[0] + aos[2] < aos[1] + aos[3]) target.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
          else target.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          target.vcount += 4;
        }
      }

  return { opaque: opaque.build(), translucent: translucent.build(), water: water.build(), lava: lava.build() };
}

function emitTorch(b: Builder, x: number, y: number, z: number, tile: number) {
  const [u0t, v0t, u1t, v1t] = tileUV(tile);
  const pu = (px: number) => u0t + ((u1t - u0t) * px) / 16;
  const pv = (py: number) => v1t - ((v1t - v0t) * py) / 16;
  const lo = 7 / 16, hi = 9 / 16, top = 10 / 16;
  const bright = toLinear(1);
  // side UV: columns 7..9, rows 4..14 of the tile (flame at the top)
  const sideUV = [pu(7), pv(14), pu(9), pv(14), pu(9), pv(4), pu(7), pv(4)];
  const topUV = [pu(7), pv(6), pu(9), pv(6), pu(9), pv(4), pu(7), pv(4)];
  const quads: [number[][], number[]][] = [
    [[[hi, 0, hi], [hi, 0, lo], [hi, top, lo], [hi, top, hi]], sideUV],
    [[[lo, 0, lo], [lo, 0, hi], [lo, top, hi], [lo, top, lo]], sideUV],
    [[[lo, 0, hi], [hi, 0, hi], [hi, top, hi], [lo, top, hi]], sideUV],
    [[[hi, 0, lo], [lo, 0, lo], [lo, top, lo], [hi, top, lo]], sideUV],
    [[[lo, top, hi], [hi, top, hi], [hi, top, lo], [lo, top, lo]], topUV],
  ];
  for (const [corners, uv] of quads) {
    const base = b.vcount;
    for (const c of corners) {
      b.p.push(x + c[0], y + c[1], z + c[2]);
      b.c.push(bright, bright, bright);
    }
    b.uv.push(...uv);
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    b.vcount += 4;
  }
}

function emitCross(b: Builder, x: number, y: number, z: number, tile: number, light: number[]) {
  ensureTable();
  const [u0, v0, u1, v1] = tileUV(tile);
  const L = (l: number) => toLinear(LIGHT_TABLE[Math.round(l * 12)] * 0.9);
  const col = [L(light[0]), L(light[1]), L(light[2])];
  const quads = [
    [[0.15, 0, 0.15], [0.85, 0, 0.85], [0.85, 1, 0.85], [0.15, 1, 0.15]],
    [[0.85, 0, 0.15], [0.15, 0, 0.85], [0.15, 1, 0.85], [0.85, 1, 0.15]],
  ];
  for (const corners of quads) {
    for (const flip of [false, true]) {
      const base = b.vcount;
      for (const c of corners) {
        b.p.push(x + c[0], y + c[1], z + c[2]);
        b.c.push(col[0], col[1], col[2]);
      }
      b.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      if (flip) b.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      b.vcount += 4;
    }
  }
}

/** Build a stand-alone mesh of whole blocks (used for animated gates / doors). */
export function buildLooseBlocks(cells: [number, number, number][], blockId: number, origin: [number, number, number]): MeshData | null {
  const b = new Builder();
  const def = BLOCKS[blockId];
  const set = new Set(cells.map((c) => c.join(',')));
  for (const [x, y, z] of cells) {
    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      if (set.has(`${x + face.n[0]},${y + face.n[1]},${z + face.n[2]}`)) continue;
      const tile = f === 2 ? def.tiles.top : f === 3 ? def.tiles.bottom : def.tiles.side;
      const [u0, v0, u1, v1] = tileUV(tile);
      const base = b.vcount;
      const s = toLinear(face.shade * 0.8);
      for (const c of face.corners) {
        b.p.push(x - origin[0] + c[0], y - origin[1] + c[1], z - origin[2] + c[2]);
        b.c.push(s, s, s);
      }
      b.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      b.vcount += 4;
    }
  }
  return b.build();
}

export { tileUV, LIGHT_R, LIGHT_G, LIGHT_B };
