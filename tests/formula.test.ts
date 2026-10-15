import { describe, expect, it } from 'vitest';
import {
  parseFormula, totalAtoms, distinctElements, prettyFormula, withCoefficient, multipleOf, compositionsEqual, addScaled,
} from '../src/chem/formula';

describe('formula interpretation', () => {
  it('parses simple molecular formulas', () => {
    expect(parseFormula('H2O')).toEqual({ H: 2, O: 1 });
    expect(parseFormula('CO2')).toEqual({ C: 1, O: 2 });
    expect(parseFormula('O2')).toEqual({ O: 2 });
  });

  it('parses two-letter symbols and formula units', () => {
    expect(parseFormula('NaCl')).toEqual({ Na: 1, Cl: 1 });
    expect(parseFormula('CaCO3')).toEqual({ Ca: 1, C: 1, O: 3 });
    expect(parseFormula('NaHCO3')).toEqual({ Na: 1, H: 1, C: 1, O: 3 });
    expect(parseFormula('Fe2O3')).toEqual({ Fe: 2, O: 3 });
  });

  it('parses multi-digit subscripts and parentheses', () => {
    expect(parseFormula('C6H12O6')).toEqual({ C: 6, H: 12, O: 6 });
    expect(parseFormula('Ca(OH)2')).toEqual({ Ca: 1, O: 2, H: 2 });
  });

  it('rejects malformed formulas', () => {
    expect(() => parseFormula('h2o')).toThrow();
    expect(() => parseFormula('Ca(OH')).toThrow();
    expect(() => parseFormula('H2)O')).toThrow();
  });

  it('counts atoms and elements', () => {
    expect(totalAtoms(parseFormula('H2O'))).toBe(3);
    expect(totalAtoms(parseFormula('CO2'))).toBe(3);
    expect(totalAtoms(parseFormula('CaCO3'))).toBe(5);
    expect(totalAtoms(parseFormula('C6H12O6'))).toBe(24);
    expect(distinctElements(parseFormula('NaCl'))).toBe(2);
    expect(distinctElements(parseFormula('CaCO3'))).toBe(3);
    expect(distinctElements(parseFormula('O2'))).toBe(1);
  });

  it('pretty prints subscripts and coefficients', () => {
    expect(prettyFormula('H2O')).toBe('H₂O');
    expect(prettyFormula('C6H12O6')).toBe('C₆H₁₂O₆');
    expect(withCoefficient(2, 'H2O')).toBe('2H₂O');
    expect(withCoefficient(1, 'O2')).toBe('O₂');
  });

  it('detects whole-number multiples of a composition', () => {
    expect(multipleOf({ H: 4, O: 2 }, { H: 2, O: 1 })).toBe(2);
    expect(multipleOf({ H: 2, O: 2 }, { H: 2, O: 1 })).toBe(0);
    expect(multipleOf({ H: 2, O: 1 }, { H: 2, O: 1 })).toBe(0);
  });

  it('checks conservation of atoms in 2H2 + O2 -> 2H2O', () => {
    const left = addScaled(addScaled({}, parseFormula('H2'), 2), parseFormula('O2'), 1);
    const right = addScaled({}, parseFormula('H2O'), 2);
    expect(compositionsEqual(left, right)).toBe(true);
    const unbalanced = addScaled(addScaled({}, parseFormula('H2'), 1), parseFormula('O2'), 1);
    expect(compositionsEqual(unbalanced, addScaled({}, parseFormula('H2O'), 1))).toBe(false);
  });
});
