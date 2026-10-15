import { describe, expect, it } from 'vitest';
import { RECIPES, RECIPE_BY_ID, matchRecipe, craftingHint, compositionFromGrid, kindLabel, atomsLabel, GridStack } from '../src/chem/recipes';
import { ELEMENTS } from '../src/chem/elements';

const g = (...cells: (string | [string, number] | null)[]): (GridStack | null)[] => {
  const out: (GridStack | null)[] = Array(9).fill(null);
  cells.forEach((c, i) => {
    if (c === null) return;
    out[i] = Array.isArray(c) ? { id: c[0], count: c[1] } : { id: c, count: 1 };
  });
  return out;
};

describe('recipe data', () => {
  it('includes every required core recipe with chemically accurate atom counts', () => {
    const expected: Record<string, Record<string, number>> = {
      water: { H: 2, O: 1 },
      oxygen_gas: { O: 2 },
      carbon_dioxide: { C: 1, O: 2 },
      sodium_chloride: { Na: 1, Cl: 1 },
      calcium_carbonate: { Ca: 1, C: 1, O: 3 },
      iron_oxide: { Fe: 2, O: 3 },
      glucose: { C: 6, H: 12, O: 6 },
      sodium_bicarbonate: { Na: 1, H: 1, C: 1, O: 3 },
    };
    for (const [id, comp] of Object.entries(expected)) expect(RECIPE_BY_ID[id].composition).toEqual(comp);
  });

  it('only uses elements that exist in the game', () => {
    for (const r of RECIPES) for (const el of Object.keys(r.composition)) expect(ELEMENTS[el], `${r.id}:${el}`).toBeDefined();
  });

  it('has unique compositions so every grid maps to at most one substance', () => {
    const keys = RECIPES.map((r) => JSON.stringify(Object.entries(r.composition).sort()));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('labels ionic compounds as formula units, not molecules', () => {
    expect(kindLabel(RECIPE_BY_ID.sodium_chloride)).toMatch(/Ionic/);
    expect(atomsLabel(RECIPE_BY_ID.sodium_chloride)).toMatch(/formula unit/);
    expect(atomsLabel(RECIPE_BY_ID.water)).toMatch(/molecule: 3/);
    expect(kindLabel(RECIPE_BY_ID.oxygen_gas)).toMatch(/element/);
    expect(RECIPE_BY_ID.oxygen_gas.classification).toBe('element');
  });
});

describe('recipe validation (composition model)', () => {
  it('crafts water regardless of arrangement', () => {
    expect(matchRecipe(g('H', 'O', 'H'))?.id).toBe('water');
    expect(matchRecipe(g('H', 'H', 'O'))?.id).toBe('water');
    expect(matchRecipe(g(null, null, null, null, 'O', null, 'H', null, 'H'))?.id).toBe('water');
    expect(matchRecipe(g(['H', 2], 'O'))?.id).toBe('water');
  });

  it('distinguishes substances made of the same elements', () => {
    expect(matchRecipe(g('H', 'H', 'O', 'O'))?.id).toBe('hydrogen_peroxide');
    expect(matchRecipe(g('C', 'O'))?.id).toBe('carbon_monoxide');
    expect(matchRecipe(g('C', 'O', 'O'))?.id).toBe('carbon_dioxide');
    expect(matchRecipe(g('O', 'O', 'O'))?.id).toBe('ozone');
  });

  it('supports large molecules through stacked slots', () => {
    expect(matchRecipe(g(['C', 6], ['H', 12], ['O', 6]))?.id).toBe('glucose');
    expect(matchRecipe(g(['C', 3], ['C', 3], ['H', 6], ['H', 6], ['O', 6]))?.id).toBe('glucose');
  });

  it('rejects wrong counts, empty grids and non-atom items', () => {
    expect(matchRecipe(g('H', 'O'))).toBeNull();
    expect(matchRecipe(g('H', 'H', 'H', 'O'))).toBeNull();
    expect(matchRecipe(g())).toBeNull();
    expect(matchRecipe(g('water', 'H'))).toBeNull();
  });

  it('counts atoms on the grid', () => {
    const { composition, nonAtoms } = compositionFromGrid(g('Ca', 'C', ['O', 3], 'salt'));
    expect(composition).toEqual({ Ca: 1, C: 1, O: 3 });
    expect(nonAtoms).toEqual(['salt']);
  });
});

describe('crafting hints', () => {
  const water = RECIPE_BY_ID.water;
  it('points at the element whose count is wrong', () => {
    const h = craftingHint(g('H', 'O'), water);
    expect(h.level).toBe(2);
    expect(h.text).toMatch(/hydrogen/i);
  });

  it('notices elements that do not belong', () => {
    expect(craftingHint(g('H', 'H', 'O', 'C'), water).text).toMatch(/does not contain Carbon/);
  });

  it('explains when the grid holds several molecules worth of atoms', () => {
    expect(craftingHint(g(['H', 4], ['O', 2]), water).text).toMatch(/2 molecules/);
  });

  it('gives a gentle, non-spoiling hint without a target', () => {
    const h = craftingHint(g('Na', 'Na', 'Cl'), null);
    expect(h.level).toBe(1);
    expect(h.text).not.toMatch(/NaCl/);
  });

  it('says nothing for empty or valid grids', () => {
    expect(craftingHint(g(), water).level).toBe(0);
    expect(craftingHint(g('H', 'H', 'O'), water).level).toBe(0);
  });
});
