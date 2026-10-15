/**
 * First-person player physics: gravity, jumping, sprinting, swimming, auto-jump and
 * axis-separated AABB collision against solid voxels (and NPC boxes).
 */
import { B, SOLID } from '../world/blocks';
import { VoxelWorld } from '../world/world';

export const PLAYER = {
  halfWidth: 0.3,
  height: 1.8,
  eye: 1.62,
  walk: 4.3,
  sprint: 5.9,
  gravity: 30,
  jump: 8.7,
  terminal: 40,
} as const;

export interface PlayerState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number;
  pitch: number;
  onGround: boolean;
  inWater: boolean;
  inLava: boolean;
  /** Distance walked, for footstep sounds and view bobbing. */
  walked: number;
}

export interface MoveInput {
  forward: number; // -1..1
  strafe: number; // -1..1 (right positive)
  jump: boolean;
  sprint: boolean;
}

export interface Box {
  minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number;
}

export function createPlayer(x: number, y: number, z: number, yaw = 0): PlayerState {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw, pitch: 0, onGround: false, inWater: false, inLava: false, walked: 0 };
}

const EPS = 1e-4;

function overlapsSolid(w: VoxelWorld, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, extra: Box[]): boolean {
  const x0 = Math.floor(minX), x1 = Math.floor(maxX - EPS);
  const y0 = Math.floor(minY), y1 = Math.floor(maxY - EPS);
  const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - EPS);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) if (SOLID[w.get(x, y, z)]) return true;
  for (const b of extra) {
    if (minX < b.maxX && maxX > b.minX && minY < b.maxY && maxY > b.minY && minZ < b.maxZ && maxZ > b.minZ) return true;
  }
  return false;
}

export function playerBox(p: Pick<PlayerState, 'x' | 'y' | 'z'>): Box {
  return {
    minX: p.x - PLAYER.halfWidth, minY: p.y, minZ: p.z - PLAYER.halfWidth,
    maxX: p.x + PLAYER.halfWidth, maxY: p.y + PLAYER.height, maxZ: p.z + PLAYER.halfWidth,
  };
}

export function collides(w: VoxelWorld, x: number, y: number, z: number, extra: Box[] = []): boolean {
  const h = PLAYER.halfWidth;
  return overlapsSolid(w, x - h, y, z - h, x + h, y + PLAYER.height, z + h, extra);
}

function liquidAt(w: VoxelWorld, p: PlayerState, id: number): boolean {
  const h = PLAYER.halfWidth * 0.9;
  for (const yy of [p.y + 0.1, p.y + 0.9])
    for (const [dx, dz] of [[-h, -h], [h, -h], [-h, h], [h, h]])
      if (w.get(Math.floor(p.x + dx), Math.floor(yy), Math.floor(p.z + dz)) === id) return true;
  return false;
}

export interface StepResult {
  /** Hit a wall horizontally this step. */
  bumped: boolean;
  landed: boolean;
  fallSpeed: number;
}

/** Advance the player by dt seconds (call with dt <= 1/30). Mutates `p`. */
export function stepPlayer(
  w: VoxelWorld,
  p: PlayerState,
  input: MoveInput,
  dt: number,
  opts: { autoJump: boolean; extra?: Box[] } = { autoJump: true },
): StepResult {
  const extra = opts.extra ?? [];
  p.inWater = liquidAt(w, p, B.WATER);
  p.inLava = liquidAt(w, p, B.LAVA);

  // Desired horizontal velocity from input, relative to yaw (yaw 0 faces +Z).
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const rx = -Math.cos(p.yaw), rz = Math.sin(p.yaw);
  let wx = fx * input.forward + rx * input.strafe;
  let wz = fz * input.forward + rz * input.strafe;
  const len = Math.hypot(wx, wz);
  if (len > 1) { wx /= len; wz /= len; }
  let speed = input.sprint && input.forward > 0 ? PLAYER.sprint : PLAYER.walk;
  if (p.inWater) speed *= 0.55;
  const accel = p.onGround ? 14 : p.inWater ? 6 : 4;
  const k = Math.min(1, accel * dt);
  p.vx += (wx * speed - p.vx) * k;
  p.vz += (wz * speed - p.vz) * k;

  // Vertical.
  if (p.inWater) {
    p.vy -= 8 * dt;
    if (input.jump) p.vy = Math.min(p.vy + 22 * dt, 3.2);
    p.vy = Math.max(p.vy, -3);
  } else {
    if (input.jump && p.onGround) p.vy = PLAYER.jump;
    p.vy -= PLAYER.gravity * dt;
    p.vy = Math.max(p.vy, -PLAYER.terminal);
  }

  const result: StepResult = { bumped: false, landed: false, fallSpeed: 0 };
  const wasOnGround = p.onGround;

  // Y axis.
  let ny = p.y + p.vy * dt;
  if (collides(w, p.x, ny, p.z, extra)) {
    if (p.vy < 0) {
      // land on top of the block below
      ny = Math.floor(ny) + 1;
      if (collides(w, p.x, ny, p.z, extra)) ny = p.y;
      result.fallSpeed = -p.vy;
      p.onGround = true;
    } else {
      ny = Math.floor(ny + PLAYER.height) - PLAYER.height - EPS;
      if (collides(w, p.x, ny, p.z, extra)) ny = p.y;
    }
    p.vy = 0;
  } else {
    p.onGround = false;
  }
  p.y = ny;
  if (!wasOnGround && p.onGround) result.landed = true;
  // Ground check when standing still.
  if (!p.onGround && p.vy <= 0 && collides(w, p.x, p.y - 0.02, p.z, extra)) p.onGround = true;

  // X then Z axes.
  const moveAxis = (axis: 'x' | 'z') => {
    const v = axis === 'x' ? p.vx : p.vz;
    if (v === 0) return;
    const nx = axis === 'x' ? p.x + v * dt : p.x;
    const nz = axis === 'z' ? p.z + v * dt : p.z;
    if (!collides(w, nx, p.y, nz, extra)) {
      p.x = nx;
      p.z = nz;
      return;
    }
    result.bumped = true;
    // Auto-jump over single-block steps (like Minecraft's auto-jump option).
    if (opts.autoJump && p.onGround && !collides(w, nx, p.y + 1.05, nz, extra) && !collides(w, p.x, p.y + 1.05, p.z, extra)) {
      p.vy = PLAYER.jump;
      p.onGround = false;
    }
    // Slide flush against the wall.
    const h = PLAYER.halfWidth;
    if (axis === 'x') {
      p.x = v > 0 ? Math.floor(p.x + h + v * dt) - h - EPS * 2 : Math.floor(p.x - h + v * dt) + 1 + h + EPS * 2;
      p.vx = 0;
    } else {
      p.z = v > 0 ? Math.floor(p.z + h + v * dt) - h - EPS * 2 : Math.floor(p.z - h + v * dt) + 1 + h + EPS * 2;
      p.vz = 0;
    }
  };
  const ox = p.x, oz = p.z;
  moveAxis('x');
  if (collides(w, p.x, p.y, p.z, extra)) p.x = ox;
  moveAxis('z');
  if (collides(w, p.x, p.y, p.z, extra)) p.z = oz;

  if (p.onGround) p.walked += Math.hypot(p.x - ox, p.z - oz);
  return result;
}
