/** Typed access to the JSON content files. Edit the JSON to change the game's educational content. */
import zonesJson from './zones.json';
import npcsJson from './npcs.json';
import questionsJson from './questions.json';
import achievementsJson from './achievements.json';
import finalLabJson from './finalLab.json';

export type TopicKey =
  | 'elements'
  | 'symbols'
  | 'compounds'
  | 'formulas'
  | 'mixtures'
  | 'changes'
  | 'states'
  | 'conservation'
  | 'balancing';

export const TOPICS: { key: TopicKey; label: string }[] = [
  { key: 'elements', label: 'Elements and atoms' },
  { key: 'symbols', label: 'Chemical symbols' },
  { key: 'compounds', label: 'Molecules and compounds' },
  { key: 'formulas', label: 'Chemical formulas' },
  { key: 'mixtures', label: 'Mixtures' },
  { key: 'changes', label: 'Physical and chemical changes' },
  { key: 'states', label: 'States of matter' },
  { key: 'conservation', label: 'Conservation of mass' },
  { key: 'balancing', label: 'Balancing equations' },
];

export type StepType = 'talk' | 'collect' | 'craft' | 'use' | 'quiz' | 'station' | 'reach';
export type SessionLength = 'quick' | 'standard' | 'full';

export interface StepDef {
  id: string;
  type: StepType;
  text: string;
  textNeedItem?: string;
  target?: string | string[];
  hint?: string;
  reminder?: string[];
  dialogue?: string[];
  items?: Record<string, number>;
  skipIfHas?: string;
  recipe?: string;
  machine?: string;
  item?: string;
  station?: string;
  zMin?: number;
  sessions?: SessionLength[];
  optionalUnless?: TopicKey;
}

export interface ZoneDef {
  id: number;
  key: string;
  name: string;
  npc: string;
  chemistry: string;
  discovery: string | null;
  gate: string | null;
  completeAchievement: string;
  fog: string;
  steps: StepDef[];
  quickSteps?: StepDef[];
  complete: string[];
  idle: string[];
}

export interface NpcDef {
  id: string;
  name: string;
  title: string;
  zone: number;
  personality: string;
  skin: string;
  hair: string;
  shirt: string;
  tie: string;
  eyes: string;
  eyewear: 'glasses' | 'goggles';
  beard: boolean;
  voicePitch: number;
}

export interface QuestionDef {
  id: string;
  zone: number;
  topic: TopicKey;
  type: 'mc' | 'numeric';
  core?: boolean;
  formula?: boolean;
  difficulty: number;
  prompt: string;
  display?: string;
  choices?: string[];
  answer: number;
  hints: string[];
  explanation: string;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface SortingItem {
  id: string;
  label: string;
  formula: string | null;
  category: 'element' | 'compound' | 'mixture';
  why: string;
  extra?: boolean;
}

export interface SocketDef {
  id: string;
  recipe: string;
  label: string;
  clue: string;
}

export interface FinalLabDef {
  formulaMasterPool: string[];
  sockets: SocketDef[];
  sorting: SortingItem[];
  balancing: { reactants: string[]; products: string[]; solution: number[]; maxCoefficient: number };
}

export const ZONES = zonesJson as unknown as ZoneDef[];
export const NPCS: Record<string, NpcDef> = Object.fromEntries(
  Object.entries(npcsJson as Record<string, Omit<NpcDef, 'id'>>).map(([id, n]) => [id, { id, ...n } as NpcDef]),
);
export const QUESTIONS = questionsJson as QuestionDef[];
export const ACHIEVEMENTS = achievementsJson as AchievementDef[];
export const FINAL_LAB = finalLabJson as FinalLabDef;

export function zoneDef(id: number): ZoneDef {
  return ZONES.find((z) => z.id === id)!;
}
