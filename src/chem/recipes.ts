import recipesJson from '../content/recipes.json';
import { ELEMENTS } from './elements';
import {
  Composition,
  cleanComposition,
  compositionsEqual,
  multipleOf,
  parseFormula,
  prettyFormula,
  totalAtoms,
} from './formula';

export type RecipeKind = 'molecule' | 'element-molecule' | 'ionic';

export interface Recipe {
  id: string;
  name: string;
  formula: string;
  kind: RecipeKind;
  classification: 'element' | 'compound';
  icon: string;
  iconColor: string;
  /** Required by the main story. Others are bonus discoveries. */
  story: boolean;
  difficulty: 1 | 2 | 3;
  everyday: string;
  explanation: string;
  fact: string;
  composition: Composition;
}

export const RECIPES: Recipe[] = (recipesJson as Omit<Recipe, 'composition'>[]).map((r) => ({
  ...r,
  composition: parseFormula(r.formula),
}));

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

export function getRecipe(id: string): Recipe | undefined {
  return RECIPE_BY_ID[id];
}

/** Grid slot content used by the crafting system. */
export interface GridStack {
  id: string;
  count: number;
}

/**
 * The crafting table is a *composition modeler*: only the number and kind of atoms matter,
 * not where they sit in the 3×3 grid. Stacks count as multiple atoms so large molecules
 * such as glucose (24 atoms) still fit in nine slots.
 */
export function compositionFromGrid(grid: (GridStack | null)[]): { composition: Composition; nonAtoms: string[] } {
  const composition: Composition = {};
  const nonAtoms: string[] = [];
  for (const s of grid) {
    if (!s || s.count <= 0) continue;
    if (ELEMENTS[s.id]) composition[s.id] = (composition[s.id] ?? 0) + s.count;
    else nonAtoms.push(s.id);
  }
  return { composition, nonAtoms };
}

/** Return the recipe exactly matching the atoms on the grid, or null. */
export function matchRecipe(grid: (GridStack | null)[], allowed?: (r: Recipe) => boolean): Recipe | null {
  const { composition, nonAtoms } = compositionFromGrid(grid);
  if (nonAtoms.length > 0 || totalAtoms(composition) === 0) return null;
  for (const r of RECIPES) {
    if (allowed && !allowed(r)) continue;
    if (compositionsEqual(r.composition, composition)) return r;
  }
  return null;
}

/** Human-readable recipe requirement list, e.g. "2 H, 1 O". */
export function recipeRequirement(r: Recipe): string {
  return Object.entries(r.composition)
    .map(([el, n]) => `${n} ${el}`)
    .join(' + ');
}

export function kindLabel(r: Recipe): string {
  if (r.kind === 'ionic') return 'Ionic compound';
  if (r.kind === 'element-molecule') return 'Molecule of an element';
  return 'Molecular compound';
}

export function atomsLabel(r: Recipe): string {
  const n = totalAtoms(r.composition);
  return r.kind === 'ionic' ? `Atoms in one formula unit: ${n}` : `Total atoms in one molecule: ${n}`;
}

export function ratioLabel(r: Recipe): string {
  const parts = Object.entries(r.composition);
  const names = parts.map(([el]) => el).join(' : ');
  const nums = parts.map(([, n]) => n).join(' : ');
  return `${names} = ${nums}`;
}

export interface CraftHint {
  /** 0 = nothing to say, 1 = gentle, 2 = specific */
  level: 0 | 1 | 2;
  text: string;
}

/**
 * Produce a helpful, non-spoiling hint for an invalid grid.
 * `target` is the recipe the player is currently trying to make (from the active objective), if any.
 */
export function craftingHint(
  grid: (GridStack | null)[],
  target: Recipe | null,
  candidates: Recipe[] = RECIPES,
): CraftHint {
  const { composition, nonAtoms } = compositionFromGrid(grid);
  const placed = totalAtoms(composition);
  if (nonAtoms.length > 0) {
    return { level: 1, text: 'Only atoms can go into the molecule modeler. Move other items back to your inventory.' };
  }
  if (placed === 0) return { level: 0, text: '' };
  if (matchRecipe(grid)) return { level: 0, text: '' };

  // Pick the closest recipe, preferring the active objective.
  let best: Recipe | null = target;
  if (!best) {
    let bestScore = Infinity;
    for (const r of candidates) {
      const keys = new Set([...Object.keys(r.composition), ...Object.keys(composition)]);
      let score = 0;
      for (const k of keys) score += Math.abs((r.composition[k] ?? 0) - (composition[k] ?? 0));
      if (score < bestScore) {
        bestScore = score;
        best = r;
      }
    }
  }
  if (!best) return { level: 1, text: 'That combination does not match a known substance. Keep experimenting!' };
  const goal = best;

  const k = multipleOf(composition, goal.composition);
  if (k >= 2 && (target || cleanKeysEqual(composition, goal.composition))) {
    return {
      level: 2,
      text: `That is the right ratio, but enough atoms for ${k} ${goal.kind === 'ionic' ? 'formula units' : 'molecules'}! The modeler builds just ONE — use fewer atoms.`,
    };
  }

  const extra = Object.keys(composition).filter((el) => !(el in goal.composition));
  if (extra.length > 0) {
    const el = ELEMENTS[extra[0]];
    return target
      ? { level: 2, text: `Not quite! ${target.name} does not contain ${el?.name ?? extra[0]} (${extra[0]}).` }
      : { level: 1, text: 'That combination does not match a known substance. Check which elements belong together.' };
  }
  const missing = Object.keys(goal.composition).filter((el) => !(el in composition));
  if (missing.length > 0) {
    if (!target) return { level: 1, text: 'Not a known substance yet. Maybe another element is needed?' };
    if (placed < totalAtoms(goal.composition)) {
      return {
        level: 1,
        text: `Not quite! ${target.name} is made of ${Object.keys(goal.composition).length} different elements. Something is missing.`,
      };
    }
    return { level: 2, text: `Not quite! ${target.name} also needs ${ELEMENTS[missing[0]]?.name ?? missing[0]}.` };
  }
  for (const el of Object.keys(goal.composition)) {
    const need = goal.composition[el];
    const have = composition[el] ?? 0;
    if (need !== have) {
      const name = ELEMENTS[el]?.name.toLowerCase() ?? el;
      if (!target) return { level: 1, text: `Not a known substance yet. Try a different number of ${name} atoms.` };
      return {
        level: 2,
        text: `Not quite! Check how many ${name} atoms are needed. Look at the number after ${el} in ${prettyFormula(target.formula)}.`,
      };
    }
  }
  return { level: 1, text: 'That combination does not match a known substance. Keep experimenting!' };
}

function cleanKeysEqual(a: Composition, b: Composition): boolean {
  const ka = Object.keys(cleanComposition(a)).sort().join();
  const kb = Object.keys(cleanComposition(b)).sort().join();
  return ka === kb;
}
