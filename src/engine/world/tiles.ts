/**
 * Texture tile names in atlas order. Pure data so the block registry (and tests) never
 * need a canvas; the painter functions live in engine/textures.ts.
 */
export const TILE_NAMES = [
  'stone', 'cobblestone', 'stone_bricks', 'mossy_bricks', 'cracked_bricks', 'dirt', 'grass_top', 'grass_side',
  'planks', 'dark_planks', 'log_side', 'log_top', 'crafting_top', 'crafting_side', 'crafting_front', 'bookshelf',
  'ore_H', 'ore_O', 'ore_C', 'ore_N', 'ore_Na', 'ore_Cl', 'ore_Ca', 'ore_Fe',
  'glow_lamp', 'crystal_blue', 'crystal_pink', 'crystal_white', 'ice', 'packed_ice', 'snow', 'glass',
  'iron_block', 'gate_bars', 'deepslate', 'deepslate_bricks', 'cracked_deepslate', 'obsidian', 'coal_block', 'bedrock',
  'limestone', 'limestone_bricks', 'chiseled_limestone', 'pillar_side', 'pillar_top', 'fossil', 'cracked_limestone', 'gravel',
  'lab_tile', 'lab_tile_dark', 'machine_side', 'machine_top', 'generator_front', 'carbonator_front', 'fabricator_front', 'socket_off',
  'socket_on', 'console', 'sorting_front', 'balance_front', 'redstone_off', 'redstone_on', 'tank_green', 'tank_purple',
  'tank_blue', 'chest_front', 'chest_side', 'chest_top', 'pipe_copper', 'steam_vent', 'torch', 'flower_red',
  'flower_yellow', 'leaves', 'halite', 'reactor_core', 'vault_door', 'iron_trapdoor', 'mushroom', 'quartz_tile',
] as const;

export type TileName = (typeof TILE_NAMES)[number];

export const ATLAS_COLS = 16;
export const TILE_PX = 16;

const INDEX: Record<string, number> = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i]));

export function tileIndex(name: TileName): number {
  return INDEX[name];
}
