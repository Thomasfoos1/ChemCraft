/**
 * Breadth-first path finding over standable cells, used for the optional navigation
 * assistance trail. Handles 1-block steps and drops; bounded so it stays cheap.
 */
import { B, SOLID } from './world/blocks';
import { VoxelWorld } from './world/world';

const standable = (w: VoxelWorld, x: number, y: number, z: number) =>
  !SOLID[w.get(x, y, z)] && !SOLID[w.get(x, y + 1, z)] && SOLID[w.get(x, y - 1, z)] && w.get(x, y, z) !== B.LAVA;

export function findPath(
  w: VoxelWorld,
  from: [number, number, number],
  to: [number, number, number],
  maxNodes = 9000,
): [number, number, number][] | null {
  const key = (x: number, y: number, z: number) => (y * w.D + z) * w.W + x;
  const sx = Math.floor(from[0]), sz = Math.floor(from[2]);
  let sy = Math.floor(from[1] + 0.01);
  while (sy > 1 && !SOLID[w.get(sx, sy - 1, sz)]) sy--;
  const tx = Math.floor(to[0]), tz = Math.floor(to[2]);
  const prev = new Map<number, number>();
  const start = key(sx, sy, sz);
  prev.set(start, -1);
  const queue: number[] = [start];
  let head = 0;
  let found = -1;
  while (head < queue.length && prev.size < maxNodes) {
    const k = queue[head++];
    const x = k % w.W;
    const rest = (k - x) / w.W;
    const z = rest % w.D;
    const y = (rest - z) / w.D;
    if (Math.abs(x - tx) <= 1 && Math.abs(z - tz) <= 1 && Math.abs(y - to[1]) <= 3) {
      found = k;
      break;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      for (const dy of [0, 1, -1, -2, -3]) {
        const ny = y + dy;
        if (dy === 1 && SOLID[w.get(x, y + 2, z)]) continue;
        if (!standable(w, nx, ny, nz)) continue;
        if (dy < 0 && (SOLID[w.get(nx, y, nz)] || SOLID[w.get(nx, y + 1, nz)])) continue;
        const nk = key(nx, ny, nz);
        if (!prev.has(nk)) {
          prev.set(nk, k);
          queue.push(nk);
        }
        break;
      }
    }
  }
  if (found < 0) return null;
  const path: [number, number, number][] = [];
  for (let k = found; k !== -1; k = prev.get(k)!) {
    const x = k % w.W;
    const rest = (k - x) / w.W;
    const z = rest % w.D;
    const y = (rest - z) / w.D;
    path.push([x, y, z]);
  }
  return path.reverse();
}
