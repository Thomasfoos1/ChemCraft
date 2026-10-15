/**
 * Teacher configuration (stored as JSON, exportable/importable) and the session plan that
 * the game derives from it. Shorter sessions remove content instead of adding a timer.
 */
import { SessionLength, TOPICS, TopicKey } from '../content';

export type GradeLevel = '7' | '8' | 'custom';
export type Difficulty = 'easy' | 'normal' | 'challenge';

export interface TeacherConfig {
  version: 1;
  sessionLength: SessionLength;
  gradeLevel: GradeLevel;
  difficulty: Difficulty;
  topics: Record<TopicKey, boolean>;
  /** Show bonus recipes (glucose, rust, baking soda...) in the Discoveries book. */
  bonusRecipes: boolean;
  /** Offer "How is real chemistry different?" explanations after crafting. */
  advancedExplanations: boolean;
  /** Seconds without progress before a navigation hint appears (0 = off). */
  idleHintSeconds: number;
}

export const GRADE_PRESETS: Record<'7' | '8', Record<TopicKey, boolean>> = {
  '7': {
    elements: true, symbols: true, compounds: true, formulas: true, mixtures: true,
    changes: true, states: true, conservation: true, balancing: false,
  },
  '8': {
    elements: true, symbols: true, compounds: true, formulas: true, mixtures: true,
    changes: true, states: true, conservation: true, balancing: true,
  },
};

export function defaultTeacherConfig(): TeacherConfig {
  return {
    version: 1,
    sessionLength: 'standard',
    gradeLevel: '7',
    difficulty: 'normal',
    topics: { ...GRADE_PRESETS['7'] },
    bonusRecipes: true,
    advancedExplanations: true,
    idleHintSeconds: 90,
  };
}

/** Validate untrusted JSON (an imported file) into a TeacherConfig, filling gaps with defaults. */
export function parseTeacherConfig(raw: unknown): TeacherConfig {
  const d = defaultTeacherConfig();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
    typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
  const topics = { ...d.topics };
  if (r.topics && typeof r.topics === 'object') {
    for (const t of TOPICS) {
      const v = (r.topics as Record<string, unknown>)[t.key];
      if (typeof v === 'boolean') topics[t.key] = v;
    }
  }
  return {
    version: 1,
    sessionLength: pick(r.sessionLength, ['quick', 'standard', 'full'] as const, d.sessionLength),
    gradeLevel: pick(r.gradeLevel, ['7', '8', 'custom'] as const, d.gradeLevel),
    difficulty: pick(r.difficulty, ['easy', 'normal', 'challenge'] as const, d.difficulty),
    topics,
    bonusRecipes: typeof r.bonusRecipes === 'boolean' ? r.bonusRecipes : d.bonusRecipes,
    advancedExplanations: typeof r.advancedExplanations === 'boolean' ? r.advancedExplanations : d.advancedExplanations,
    idleHintSeconds:
      typeof r.idleHintSeconds === 'number' && r.idleHintSeconds >= 0 && r.idleHintSeconds <= 600
        ? Math.round(r.idleHintSeconds)
        : d.idleHintSeconds,
  };
}

export interface SessionPlan {
  sessionLength: SessionLength;
  difficulty: Difficulty;
  topics: Record<TopicKey, boolean>;
  questionsPerZone: number;
  /** Zone 4's bridge starts rebuilt and the zone becomes a walk-through. */
  skipLimestonePuzzle: boolean;
  formulaMasterCount: number;
  reactorSockets: string[];
  sortingIncludesMixtures: boolean;
  sortingItemCount: number;
  balancingRequired: boolean;
  /** Wrong answers before the first hint appears automatically. */
  hintAfter: number;
  /** Wrong answers before the answer is explained (so nobody gets stuck). */
  revealAfter: number;
  /** Recipe visibility in the recipe book. */
  recipeBook: 'all-story' | 'known-and-current' | 'known-only';
  bonusRecipes: boolean;
  advancedExplanations: boolean;
  idleHintSeconds: number;
}

export function derivePlan(c: TeacherConfig): SessionPlan {
  const q = { quick: 1, standard: 3, full: 5 }[c.sessionLength];
  const quick = c.sessionLength === 'quick';
  return {
    sessionLength: c.sessionLength,
    difficulty: c.difficulty,
    topics: c.topics,
    questionsPerZone: c.difficulty === 'challenge' ? q + 1 : q,
    skipLimestonePuzzle: quick,
    formulaMasterCount: { quick: 1, standard: 2, full: 3 }[c.sessionLength],
    reactorSockets: quick ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'],
    sortingIncludesMixtures: c.topics.mixtures,
    sortingItemCount: c.sessionLength === 'full' ? 9 : 6,
    balancingRequired: c.topics.balancing && c.sessionLength !== 'quick',
    hintAfter: c.difficulty === 'challenge' ? 2 : 1,
    revealAfter: c.difficulty === 'easy' ? 2 : c.difficulty === 'normal' ? 3 : 4,
    recipeBook: c.difficulty === 'easy' ? 'all-story' : c.difficulty === 'normal' ? 'known-and-current' : 'known-only',
    bonusRecipes: c.bonusRecipes,
    advancedExplanations: c.advancedExplanations,
    idleHintSeconds: c.idleHintSeconds,
  };
}
