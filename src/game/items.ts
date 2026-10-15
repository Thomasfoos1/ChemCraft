import { ELEMENTS } from '../chem/elements';
import { RECIPE_BY_ID } from '../chem/recipes';
import { prettyFormula } from '../chem/formula';

export interface ItemStack {
  id: string;
  count: number;
}

export type ItemKind = 'atom' | 'substance';

export interface ItemDef {
  id: string;
  kind: ItemKind;
  name: string;
  /** Element symbol or pretty formula shown on the icon / tooltip. */
  label: string;
  maxStack: number;
}

export const MAX_STACK = 64;

export function getItemDef(id: string): ItemDef {
  const el = ELEMENTS[id];
  if (el) return { id, kind: 'atom', name: el.name, label: el.symbol, maxStack: MAX_STACK };
  const r = RECIPE_BY_ID[id];
  if (r) return { id, kind: 'substance', name: r.name, label: prettyFormula(r.formula), maxStack: MAX_STACK };
  return { id, kind: 'substance', name: id, label: id, maxStack: MAX_STACK };
}

export function itemDisplayName(id: string): string {
  const d = getItemDef(id);
  return d.kind === 'atom' ? `${d.name} (${d.label})` : `${d.name} — ${d.label}`;
}
