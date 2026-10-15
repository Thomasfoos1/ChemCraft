import { SOLID, B } from '../../src/engine/world/blocks';
import { VoxelWorld } from '../../src/engine/world/world';

const standable = (w: VoxelWorld, x: number, y: number, z: number) =>
  !SOLID[w.get(x, y, z)] && !SOLID[w.get(x, y + 1, z)] && SOLID[w.get(x, y - 1, z)] &&
  w.get(x, y, z) !== B.LAVA && w.get(x, y - 1, z) !== B.LAVA;

/** Drop from (x,y,z) to the first standable cell below (or null if into lava / void). */
function fall(w: VoxelWorld, x: number, y: number, z: number): number | null {
  for (let yy = y; yy > 0; yy--) {
    if (w.get(x, yy, z) === B.LAVA) return null;
    if (SOLID[w.get(x, yy, z)] || SOLID[w.get(x, yy + 1, z)]) return null;
    if (SOLID[w.get(x, yy - 1, z)]) return yy;
  }
  return null;
}

/**
 * Conservative reachability: walking, falling, 1-block jumps and running jumps across
 * gaps of up to 3 blocks. Returns the set of reachable standing cells as "x,y,z".
 */
export function reachable(w: VoxelWorld, start: [number, number, number]): Set<string> {
  const seen = new Set<string>();
  const sy = fall(w, start[0], start[1], start[2]) ?? start[1];
  const q: [number, number, number][] = [[start[0], sy, start[2]]];
  seen.add(`${start[0]},${sy},${start[2]}`);
  const push = (x: number, y: number, z: number) => {
    const k = `${x},${y},${z}`;
    if (!seen.has(k) && standable(w, x, y, z)) {
      seen.add(k);
      q.push([x, y, z]);
    }
  };
  while (q.length) {
    const [x, y, z] = q.pop()!;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      // walk / step down
      if (!SOLID[w.get(nx, y, nz)] && !SOLID[w.get(nx, y + 1, nz)]) {
        const fy = fall(w, nx, y, nz);
        if (fy !== null) push(nx, fy, nz);
        // running jump across a gap (same level), up to 3 cells
        if (fy === null || fy < y) {
          for (let g = 2; g <= 4; g++) {
            const gx = x + dx * g, gz = z + dz * g;
            let clear = true;
            for (let s = 1; s < g; s++) {
              const cx = x + dx * s, cz = z + dz * s;
              if (SOLID[w.get(cx, y, cz)] || SOLID[w.get(cx, y + 1, cz)] || SOLID[w.get(cx, y + 2, cz)]) clear = false;
            }
            if (clear && standable(w, gx, y, gz)) { push(gx, y, gz); break; }
          }
        }
      }
      // jump up one block
      if (SOLID[w.get(nx, y, nz)] && !SOLID[w.get(nx, y + 1, nz)] && !SOLID[w.get(nx, y + 2, nz)] && !SOLID[w.get(x, y + 2, z)]) {
        push(nx, y + 1, nz);
      }
    }
  }
  return seen;
}

export function maxZ(cells: Set<string>): number {
  let m = -Infinity;
  for (const c of cells) m = Math.max(m, Number(c.split(',')[2]));
  return m;
}

export function canReach(cells: Set<string>, x: number, z: number, radius = 1.5): boolean {
  for (const c of cells) {
    const [cx, , cz] = c.split(',').map(Number);
    if (Math.abs(cx - x) <= radius && Math.abs(cz - z) <= radius) return true;
  }
  return false;
}
