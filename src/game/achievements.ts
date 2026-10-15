/** Achievement conditions evaluated from save data. */
import { ELEMENT_SYMBOLS } from '../chem/elements';
import { RECIPE_BY_ID } from '../chem/recipes';
import { SaveData } from './save';

const CONDITIONS: Record<string, (s: SaveData) => boolean> = {
  first_reaction: (s) => s.stats.craftsMade >= 1,
  water_wizard: (s) => !!s.zones[1]?.completed,
  salt_scientist: (s) => !!s.zones[2]?.completed,
  carbon_collector: (s) => !!s.zones[3]?.completed,
  bridge_builder: (s) => !!s.flags['bridge_built'] && !!s.zones[4]?.completed,
  formula_expert: (s) => s.stats.formulaCorrect >= 5,
  master_of_matter: (s) => s.completed,
  explorer: (s) => s.stats.secretsFound >= 1,
  secret_scientist: (s) => s.stats.secretsFound >= 3,
  element_collector: (s) => ELEMENT_SYMBOLS.every((e) => s.elementsDiscovered.includes(e)),
  bonus_brewer: (s) => s.recipesDiscovered.filter((r) => RECIPE_BY_ID[r] && !RECIPE_BY_ID[r].story).length >= 3,
  perfect_balance: (s) => s.final.balancingDone,
  sharp_mind: (s) => s.stats.firstTryCorrect >= 5,
};

/** Achievement ids that are satisfied but not yet awarded. */
export function newlyEarned(s: SaveData): string[] {
  return Object.entries(CONDITIONS)
    .filter(([id, cond]) => !s.achievements.includes(id) && cond(s))
    .map(([id]) => id);
}
