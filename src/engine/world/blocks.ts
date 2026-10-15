import { TileName, tileIndex } from './tiles';

export type RenderType = 'none' | 'cube' | 'cutout' | 'translucent' | 'water' | 'lava' | 'torch' | 'cross';

export interface BlockDef {
  id: number;
  key: string;
  name: string;
  render: RenderType;
  /** Blocks movement. */
  solid: boolean;
  /** Hides neighbouring faces and blocks light. */
  opaque: boolean;
  /** Can be hit by the crosshair. */
  targetable: boolean;
  tiles: { top: number; bottom: number; side: number; front: number };
  /** Light emitted, 0–15 per channel. */
  light?: [number, number, number];
  /** Element symbol for element deposits. */
  element?: string;
  /** Seconds of holding left click to break. Undefined = unbreakable. */
  breakTime?: number;
  /** Deposits respawn after being mined. */
  respawn?: boolean;
  /** Approximate colour used for break particles. */
  particle: string;
}

type TileSpec = TileName | { top?: TileName; bottom?: TileName; side: TileName; front?: TileName };

const defs: BlockDef[] = [];
const byKey: Record<string, BlockDef> = {};

function reg(
  key: string,
  name: string,
  tiles: TileSpec | null,
  opts: Partial<Omit<BlockDef, 'id' | 'key' | 'name' | 'tiles'>> = {},
): number {
  const id = defs.length;
  const t =
    tiles === null
      ? { top: 0, bottom: 0, side: 0, front: 0 }
      : typeof tiles === 'string'
        ? { top: tileIndex(tiles), bottom: tileIndex(tiles), side: tileIndex(tiles), front: tileIndex(tiles) }
        : {
            top: tileIndex(tiles.top ?? tiles.side),
            bottom: tileIndex(tiles.bottom ?? tiles.top ?? tiles.side),
            side: tileIndex(tiles.side),
            front: tileIndex(tiles.front ?? tiles.side),
          };
  const render = opts.render ?? 'cube';
  const def: BlockDef = {
    id,
    key,
    name,
    render,
    solid: opts.solid ?? (render !== 'none' && render !== 'water' && render !== 'lava' && render !== 'torch' && render !== 'cross'),
    opaque: opts.opaque ?? render === 'cube',
    targetable: opts.targetable ?? (render !== 'none' && render !== 'water' && render !== 'lava'),
    tiles: t,
    light: opts.light,
    element: opts.element,
    breakTime: opts.breakTime,
    respawn: opts.respawn,
    particle: opts.particle ?? '#7a7a7a',
  };
  defs.push(def);
  byKey[key] = def;
  return id;
}

/* eslint-disable @typescript-eslint/naming-convention */
export const B = {
  AIR: reg('air', 'Air', null, { render: 'none', solid: false, opaque: false, targetable: false }),
  BARRIER: reg('barrier', 'Barrier', null, { render: 'none', solid: true, opaque: false, targetable: false }),
  STONE: reg('stone', 'Stone', 'stone'),
  COBBLE: reg('cobblestone', 'Cobblestone', 'cobblestone'),
  BRICKS: reg('stone_bricks', 'Stone Bricks', 'stone_bricks'),
  MOSSY: reg('mossy_bricks', 'Mossy Stone Bricks', 'mossy_bricks'),
  CRACKED: reg('cracked_bricks', 'Cracked Bricks', 'cracked_bricks', { breakTime: 1.2, particle: '#6e6e6e' }),
  DIRT: reg('dirt', 'Dirt', 'dirt', { particle: '#79553a' }),
  GRASS: reg('grass', 'Grass Block', { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, { particle: '#5fa83a' }),
  PLANKS: reg('planks', 'Oak Planks', 'planks', { particle: '#a8834f' }),
  DARK_PLANKS: reg('dark_planks', 'Dark Planks', 'dark_planks', { particle: '#6a4b2c' }),
  LOG: reg('log', 'Oak Log', { top: 'log_top', side: 'log_side' }, { particle: '#6b5030' }),
  CRAFTING: reg('crafting_table', 'Crafting Table', { top: 'crafting_top', bottom: 'planks', side: 'crafting_side', front: 'crafting_front' }, { particle: '#a8834f' }),
  BOOKSHELF: reg('bookshelf', 'Bookshelf', { top: 'planks', side: 'bookshelf' }, { particle: '#8b2f2f' }),
  ORE_H: reg('ore_H', 'Hydrogen Crystal', 'ore_H', { element: 'H', breakTime: 0.75, respawn: true, light: [5, 7, 9], particle: '#8fd8ff' }),
  ORE_O: reg('ore_O', 'Oxygen Ore', 'ore_O', { element: 'O', breakTime: 0.75, respawn: true, light: [8, 5, 4], particle: '#ff5b4f' }),
  ORE_C: reg('ore_C', 'Carbon Deposit', 'ore_C', { element: 'C', breakTime: 0.75, respawn: true, light: [4, 4, 4], particle: '#2e2e2e' }),
  ORE_N: reg('ore_N', 'Nitrogen Crystal', 'ore_N', { element: 'N', breakTime: 0.75, respawn: true, light: [5, 5, 9], particle: '#7d8cff' }),
  ORE_NA: reg('ore_Na', 'Sodium Crystal', 'ore_Na', { element: 'Na', breakTime: 0.75, respawn: true, light: [7, 6, 9], particle: '#d9d2ff' }),
  ORE_CL: reg('ore_Cl', 'Chlorine Crystal', 'ore_Cl', { element: 'Cl', breakTime: 0.75, respawn: true, light: [7, 9, 4], particle: '#c6f04a' }),
  ORE_CA: reg('ore_Ca', 'Calcium Ore', 'ore_Ca', { element: 'Ca', breakTime: 0.75, respawn: true, light: [8, 8, 7], particle: '#f2ead8' }),
  ORE_FE: reg('ore_Fe', 'Iron Ore', 'ore_Fe', { element: 'Fe', breakTime: 0.75, respawn: true, light: [8, 6, 4], particle: '#d89a72' }),
  LAMP: reg('glow_lamp', 'Glow Lamp', 'glow_lamp', { light: [15, 13, 9], particle: '#ffd977' }),
  CRYSTAL_BLUE: reg('crystal_blue', 'Blue Crystal', 'crystal_blue', { light: [7, 10, 14], particle: '#6fc3ff' }),
  CRYSTAL_PINK: reg('crystal_pink', 'Pink Crystal', 'crystal_pink', { light: [12, 8, 13], particle: '#f08ff0' }),
  CRYSTAL_WHITE: reg('crystal_white', 'White Crystal', 'crystal_white', { light: [9, 10, 12], particle: '#ffffff' }),
  ICE: reg('ice', 'Ice', 'ice', { render: 'translucent', solid: true, opaque: false, particle: '#9cc8ff' }),
  PACKED_ICE: reg('packed_ice', 'Packed Ice', 'packed_ice', { particle: '#8ab4f0' }),
  SNOW: reg('snow', 'Snow', 'snow', { particle: '#ffffff' }),
  GLASS: reg('glass', 'Glass', 'glass', { render: 'cutout', solid: true, opaque: false, particle: '#dbeef5' }),
  IRON: reg('iron_block', 'Iron Block', 'iron_block', { particle: '#d8d8d8' }),
  GATE: reg('gate', 'Iron Gate', 'gate_bars', { render: 'cutout', solid: true, opaque: false, particle: '#7a7a7a' }),
  DEEPSLATE: reg('deepslate', 'Deepslate', 'deepslate', { particle: '#4a4a50' }),
  DEEP_BRICKS: reg('deepslate_bricks', 'Deepslate Bricks', 'deepslate_bricks', { particle: '#4a4a50' }),
  CRACKED_DEEP: reg('cracked_deepslate', 'Cracked Deepslate', 'cracked_deepslate', { breakTime: 1.2, particle: '#4a4a50' }),
  OBSIDIAN: reg('obsidian', 'Obsidian', 'obsidian', { particle: '#1c1428' }),
  COAL_BLOCK: reg('coal_block', 'Coal Block', 'coal_block', { particle: '#1a1a1a' }),
  BEDROCK: reg('bedrock', 'Bedrock', 'bedrock', { particle: '#2a2a2a' }),
  LIMESTONE: reg('limestone', 'Limestone', 'limestone', { particle: '#e6dcc0' }),
  LIME_BRICKS: reg('limestone_bricks', 'Limestone Bricks', 'limestone_bricks', { particle: '#e6dcc0' }),
  LIME_CHISELED: reg('chiseled_limestone', 'Chiseled Limestone', 'chiseled_limestone', { particle: '#e6dcc0' }),
  PILLAR: reg('pillar', 'Limestone Pillar', { top: 'pillar_top', side: 'pillar_side' }, { particle: '#ece4cc' }),
  FOSSIL: reg('fossil', 'Fossil Block', 'fossil', { particle: '#fbfaf2' }),
  CRACKED_LIME: reg('cracked_limestone', 'Cracked Limestone', 'cracked_limestone', { breakTime: 1.2, particle: '#e0d4b4' }),
  GRAVEL: reg('gravel', 'Gravel', 'gravel', { particle: '#8a8078' }),
  LAB_TILE: reg('lab_tile', 'Lab Tile', 'lab_tile', { particle: '#e4eaee' }),
  LAB_TILE_DARK: reg('lab_tile_dark', 'Dark Lab Tile', 'lab_tile_dark', { particle: '#3a4650' }),
  MACHINE: reg('machine', 'Machine Casing', { top: 'machine_top', side: 'machine_side' }, { particle: '#5b6470' }),
  GENERATOR: reg('generator', 'Water Generator', { top: 'machine_top', side: 'machine_side', front: 'generator_front' }, { particle: '#5b6470' }),
  CARBONATOR: reg('carbonator', 'Carbonation Machine', { top: 'machine_top', side: 'machine_side', front: 'carbonator_front' }, { particle: '#5b6470' }),
  FABRICATOR: reg('fabricator', 'Stone Fabricator', { top: 'machine_top', side: 'machine_side', front: 'fabricator_front' }, { particle: '#5b6470' }),
  SOCKET: reg('socket', 'Reactor Socket', { top: 'socket_off', side: 'machine_side' }, { particle: '#5b6470' }),
  SOCKET_ON: reg('socket_on', 'Reactor Socket (Active)', { top: 'socket_on', side: 'machine_side' }, { light: [3, 12, 14], particle: '#5ff0ff' }),
  CONSOLE: reg('console', 'Formula Console', { top: 'machine_top', side: 'machine_side', front: 'console' }, { light: [2, 7, 3], particle: '#4fff7a' }),
  SORTER: reg('sorter', 'Sorting Station', { top: 'machine_top', side: 'machine_side', front: 'sorting_front' }, { particle: '#5b6470' }),
  BALANCER: reg('balancer', 'Balancing Station', { top: 'machine_top', side: 'machine_side', front: 'balance_front' }, { particle: '#5b6470' }),
  WIRE_OFF: reg('wire_off', 'Energy Conduit', 'redstone_off', { particle: '#5a1a1a' }),
  WIRE_ON: reg('wire_on', 'Energy Conduit (Powered)', 'redstone_on', { light: [12, 2, 1], particle: '#ff3a2a' }),
  TANK_GREEN: reg('tank_green', 'Glowing Tank Fluid', 'tank_green', { light: [3, 13, 5], particle: '#3ad85a' }),
  TANK_PURPLE: reg('tank_purple', 'Glowing Tank Fluid', 'tank_purple', { light: [10, 4, 14], particle: '#a04fe8' }),
  TANK_BLUE: reg('tank_blue', 'Glowing Tank Fluid', 'tank_blue', { light: [3, 8, 15], particle: '#3a8ff0' }),
  CHEST: reg('chest', 'Chest', { top: 'chest_top', side: 'chest_side', front: 'chest_front' }, { particle: '#9a6a2a' }),
  PIPE: reg('pipe', 'Copper Pipe', 'pipe_copper', { particle: '#c87a4a' }),
  VENT: reg('vent', 'Steam Vent', { top: 'steam_vent', side: 'machine_side' }, { particle: '#3a3a3e' }),
  TORCH: reg('torch', 'Torch', 'torch', { render: 'torch', light: [14, 11, 6], particle: '#ffd34f' }),
  FLOWER_RED: reg('flower_red', 'Poppy', 'flower_red', { render: 'cross', particle: '#e83a3a' }),
  FLOWER_YELLOW: reg('flower_yellow', 'Dandelion', 'flower_yellow', { render: 'cross', particle: '#ffd34f' }),
  MUSHROOM: reg('mushroom', 'Mushroom', 'mushroom', { render: 'cross', light: [3, 1, 1], particle: '#d83a3a' }),
  LEAVES: reg('leaves', 'Leaves', 'leaves', { render: 'cutout', solid: true, opaque: false, particle: '#3e8a2a' }),
  HALITE: reg('halite', 'Salt Crystal', 'halite', { particle: '#ffffff' }),
  REACTOR: reg('reactor_core', 'Reactor Core', 'reactor_core', { particle: '#5ff0ff' }),
  REACTOR_ON: reg('reactor_core_on', 'Reactor Core (Active)', 'reactor_core', { light: [8, 15, 15], particle: '#5ff0ff' }),
  VAULT: reg('vault', 'Vault Door', 'vault_door', { particle: '#6a7480' }),
  TRAPDOOR: reg('iron_trapdoor', 'Iron Panel', 'iron_trapdoor', { particle: '#c8c8c8' }),
  QUARTZ: reg('quartz', 'Quartz Tile', 'quartz_tile', { particle: '#f2f0ec' }),
  WATER: reg('water', 'Water', null, { render: 'water', particle: '#3a74ea' }),
  LAVA: reg('lava', 'Lava', null, { render: 'lava', light: [15, 9, 3], particle: '#ff9a2a' }),
  COPPER_GLOW: reg('copper_glow', 'Glowing Gas Pipe', 'pipe_copper', { light: [11, 7, 3], particle: '#c87a4a' }),
} as const;

export const BLOCKS: readonly BlockDef[] = defs;
export const BLOCK_COUNT = defs.length;

export function blockDef(id: number): BlockDef {
  return defs[id] ?? defs[0];
}

export function blockByKey(key: string): BlockDef | undefined {
  return byKey[key];
}

/** Deposit block for a given element symbol. */
export const DEPOSIT_FOR: Record<string, number> = {
  H: B.ORE_H,
  O: B.ORE_O,
  C: B.ORE_C,
  N: B.ORE_N,
  Na: B.ORE_NA,
  Cl: B.ORE_CL,
  Ca: B.ORE_CA,
  Fe: B.ORE_FE,
};

// Precomputed lookup tables for hot loops.
export const SOLID = new Uint8Array(256);
export const OPAQUE = new Uint8Array(256);
export const LIGHT_R = new Uint8Array(256);
export const LIGHT_G = new Uint8Array(256);
export const LIGHT_B = new Uint8Array(256);
for (const d of defs) {
  SOLID[d.id] = d.solid ? 1 : 0;
  OPAQUE[d.id] = d.opaque ? 1 : 0;
  if (d.light) {
    // Desaturate toward the brightest channel so overlapping coloured lights never mix into
    // harsh purples; each source keeps a gentle tint.
    const [r, g, b] = d.light;
    const m = Math.max(r, g, b);
    const mix = (c: number) => Math.round(c + (m * 0.92 - c) * 0.55);
    LIGHT_R[d.id] = Math.max(0, mix(r));
    LIGHT_G[d.id] = Math.max(0, mix(g));
    LIGHT_B[d.id] = Math.max(0, mix(b));
  }
}
