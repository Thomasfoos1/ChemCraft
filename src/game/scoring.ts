/** Experience points, levels, accuracy and review recommendations. */
import { ACHIEVEMENTS, TOPICS, TopicKey } from '../content';
import { RECIPES } from '../chem/recipes';
import { SaveData } from './save';

export const XP = {
  newElement: 10,
  newRecipe: 25,
  repeatCraft: 3,
  firstTry: 15,
  laterCorrect: 8,
  guided: 3,
  puzzle: 50,
  zone: 100,
  secret: 40,
  station: 60,
} as const;

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  return 40 + level * 20;
}

export function levelFromXp(xp: number): { level: number; into: number; needed: number; progress: number } {
  let level = 0;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  const needed = xpForLevel(level);
  return { level, into: remaining, needed, progress: remaining / needed };
}

export function accuracy(save: Pick<SaveData, 'stats'>): number {
  const { questionsAttempted, questionsCorrect } = save.stats;
  return questionsAttempted === 0 ? 0 : Math.round((questionsCorrect / questionsAttempted) * 100);
}

const REVIEW_TIPS: Record<TopicKey, string> = {
  elements: 'Elements and atoms: an element is made of only one kind of atom.',
  symbols: 'Chemical symbols: practise matching symbols such as Na, Cl and Fe to element names.',
  compounds: 'Compounds: two or more different elements chemically combined in a fixed ratio.',
  formulas: 'Chemical formulas: a subscript tells how many atoms of the element just before it.',
  mixtures: 'Mixtures: substances mixed together but not chemically combined (they can be separated).',
  changes: 'Physical vs. chemical changes: a chemical change makes a new substance.',
  states: 'States of matter: how particles are arranged and move in solids, liquids and gases.',
  conservation: 'Conservation of mass: atoms are rearranged in reactions, never created or destroyed.',
  balancing: 'Balancing equations: count each kind of atom on both sides and adjust coefficients.',
};

/** Topics where the student needed hints, multiple attempts or a guided answer. */
export function reviewRecommendations(save: Pick<SaveData, 'questionLog' | 'stats' | 'final' | 'flags'>): string[] {
  const weak = new Map<string, number>();
  for (const q of save.questionLog) {
    const score = (q.correct ? 0 : 2) + Math.max(0, q.attempts - 1) + q.hints;
    if (score > 0) weak.set(q.topic, (weak.get(q.topic) ?? 0) + score);
  }
  if ((save.flags['balancing_mistakes'] ? 1 : 0) > 0) weak.set('balancing', (weak.get('balancing') ?? 0) + 1);
  if ((save.flags['sorting_mistakes'] ? 1 : 0) > 0) weak.set('compounds', (weak.get('compounds') ?? 0) + 1);
  const sorted = [...weak.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t as TopicKey);
  return sorted.filter((t) => TOPICS.some((x) => x.key === t)).map((t) => REVIEW_TIPS[t]);
}

export function storyRecipeIds(): string[] {
  return RECIPES.filter((r) => r.story).map((r) => r.id);
}

export function achievementName(id: string): string {
  return ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id;
}
