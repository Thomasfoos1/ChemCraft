/** Types describing everything placed in the dungeon besides plain voxels. */
import type { VoxelWorld } from './world';

export type Vec3 = [number, number, number];

export interface NpcPlacement {
  id: string;
  pos: Vec3;
  /** Radians, 0 faces +Z. */
  yaw: number;
}

export type MachineKind =
  | 'generator'
  | 'frozen_gate'
  | 'carbonator'
  | 'fabricator'
  | 'console'
  | 'sorter'
  | 'balancer'
  | 'socket'
  | 'reactor'
  | 'vault';

export interface MachinePlacement {
  id: string;
  kind: MachineKind;
  zone: number;
  cells: Vec3[];
  /** Point used for particles, markers and sounds. */
  center: Vec3;
}

export interface ChestPlacement {
  id: string;
  pos: Vec3;
  zone: number;
  contents: Record<string, number>;
}

export interface SecretPlacement {
  id: string;
  zone: number;
  cracked: Vec3[];
  room: Vec3;
}

export interface GatePlacement {
  id: string;
  cells: Vec3[];
  blockId: number;
  /** World units the gate slides up when opening. */
  lift: number;
}

export interface ZoneBounds {
  zone: number;
  zMin: number;
  zMax: number;
}

export interface WheelPlacement {
  center: Vec3;
  radius: number;
}

export interface Layout {
  world: VoxelWorld;
  spawn: { pos: Vec3; yaw: number };
  npcs: NpcPlacement[];
  tables: { pos: Vec3; zone: number }[];
  machines: MachinePlacement[];
  chests: ChestPlacement[];
  secrets: SecretPlacement[];
  gates: Record<string, GatePlacement>;
  zoneBounds: ZoneBounds[];
  /** Respawn points (lava, falling out). Index = zone number. */
  checkpoints: Record<number, Vec3>;
  markers: Record<string, Vec3>;
  /** Ordered cells that fill with water in the Waterworks. */
  waterPath: Vec3[];
  /** Ice cells covering the frozen gate. */
  iceCells: Vec3[];
  /** Ordered cells for the limestone bridge with the block id for each. */
  bridgeCells: { pos: Vec3; id: number }[];
  /** Glass pipe path for the carbonation bubbles. */
  bubblePath: Vec3[];
  /** Energy conduits from each reactor socket to the core. */
  wires: Record<string, Vec3[]>;
  reactorCore: Vec3[];
  wheel: WheelPlacement;
  gears: { pos: Vec3; radius: number; dir: number }[];
  steamVents: Vec3[];
  torches: Vec3[];
  sparkles: { pos: Vec3; color: string }[];
  periodicTable: { pos: Vec3; width: number; height: number };
  exitZ: number;
  skyCenter: Vec3;
  /** Deposit cells and their element, for respawning. */
  deposits: { pos: Vec3; element: string; zone: number }[];
}
