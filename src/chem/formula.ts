/** Chemical formula utilities: parsing, atom counting and pretty-printing. */

export type Composition = Record<string, number>;

const SUBSCRIPTS = '₀₁₂₃₄₅₆₇₈₉';

/**
 * Parse a simple chemical formula such as "H2O", "NaHCO3", "C6H12O6" or "Ca(OH)2"
 * into a map of element symbol -> atom count.
 */
export function parseFormula(formula: string): Composition {
  let i = 0;
  const readNumber = (): number => {
    let s = '';
    while (i < formula.length && /[0-9]/.test(formula[i])) s += formula[i++];
    return s ? parseInt(s, 10) : 1;
  };
  const parseGroup = (depth: number): Composition => {
    const out: Composition = {};
    while (i < formula.length) {
      const ch = formula[i];
      if (ch === '(') {
        i++;
        const inner = parseGroup(depth + 1);
        if (formula[i] !== ')') throw new Error(`Unbalanced parenthesis in ${formula}`);
        i++;
        const n = readNumber();
        for (const [el, c] of Object.entries(inner)) out[el] = (out[el] ?? 0) + c * n;
      } else if (ch === ')') {
        if (depth === 0) throw new Error(`Unbalanced parenthesis in ${formula}`);
        return out;
      } else if (/[A-Z]/.test(ch)) {
        let sym = ch;
        i++;
        while (i < formula.length && /[a-z]/.test(formula[i])) sym += formula[i++];
        const n = readNumber();
        out[sym] = (out[sym] ?? 0) + n;
      } else {
        throw new Error(`Unexpected character "${ch}" in formula ${formula}`);
      }
    }
    if (depth > 0) throw new Error(`Unbalanced parenthesis in ${formula}`);
    return out;
  };
  return parseGroup(0);
}

/** Total number of atoms represented by a composition. */
export function totalAtoms(comp: Composition): number {
  return Object.values(comp).reduce((a, b) => a + b, 0);
}

/** Number of distinct elements in a composition. */
export function distinctElements(comp: Composition): number {
  return Object.values(comp).filter((n) => n > 0).length;
}

/** Convert ASCII digits in a formula to Unicode subscripts: "H2O" -> "H₂O". */
export function prettyFormula(formula: string): string {
  return formula.replace(/[0-9]/g, (d) => SUBSCRIPTS[parseInt(d, 10)]);
}

/** Pretty-print a formula with an optional leading coefficient: (2, "H2O") -> "2H₂O". */
export function withCoefficient(coefficient: number, formula: string): string {
  return (coefficient === 1 ? '' : String(coefficient)) + prettyFormula(formula);
}

export function compositionsEqual(a: Composition, b: Composition): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if ((a[k] ?? 0) !== (b[k] ?? 0)) return false;
  return true;
}

/** Remove zero entries. */
export function cleanComposition(comp: Composition): Composition {
  const out: Composition = {};
  for (const [k, v] of Object.entries(comp)) if (v > 0) out[k] = v;
  return out;
}

/** If `comp` is an exact whole-number multiple (k >= 2) of `base`, return k; otherwise 0. */
export function multipleOf(comp: Composition, base: Composition): number {
  const a = cleanComposition(comp);
  const b = cleanComposition(base);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let k = 0;
  for (const key of keys) {
    const x = a[key] ?? 0;
    const y = b[key] ?? 0;
    if (y === 0 || x === 0 || x % y !== 0) return 0;
    const ratio = x / y;
    if (k === 0) k = ratio;
    else if (k !== ratio) return 0;
  }
  return k >= 2 ? k : 0;
}

/** Sum two compositions with a scale factor — used by the equation balancer. */
export function addScaled(target: Composition, comp: Composition, scale: number): Composition {
  const out: Composition = { ...target };
  for (const [k, v] of Object.entries(comp)) out[k] = (out[k] ?? 0) + v * scale;
  return out;
}
