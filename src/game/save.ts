/** Save-game format, creation and (de)serialisation with validation. */
import { ItemStack } from './items';
import { Slots, emptySlots, INVENTORY_SIZE } from './inventory';
import { TeacherConfig, parseTeacherConfig } from './config';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'chemcraft.save.v1';
export const SETTINGS_KEY = 'chemcraft.settings.v1';
export const TEACHER_KEY = 'chemcraft.teacher.v1';

export interface QuestionRecord {
  id: string;
  topic: string;
  zone: number;
  attempts: number;
  correct: boolean;
  firstTry: boolean;
  hints: number;
}

export interface Stats {
  questionsAttempted: number;
  questionsCorrect: number;
  firstTryCorrect: number;
  incorrectAttempts: number;
  hintsUsed: number;
  craftsMade: number;
  craftMistakes: number;
  formulaCorrect: number;
  secretsFound: number;
  playTimeSec: number;
  startedAt: number;
  completedAt: number | null;
}

export interface ZoneProgress {
  step: number;
  completed: boolean;
}

export interface FinalProgress {
  formulaTargets: string[];
  formulaDelivered: string[];
  sockets: Record<string, boolean>;
  sortingDone: boolean;
  balancingDone: boolean;
}

export interface SaveData {
  version: number;
  createdAt: number;
  updatedAt: number;
  config: TeacherConfig;
  player: { pos: [number, number, number]; yaw: number; pitch: number };
  inventory: Slots;
  selected: number;
  craftGrid: Slots;
  xp: number;
  elementsDiscovered: string[];
  recipesDiscovered: string[];
  craftedCounts: Record<string, number>;
  zones: Record<number, ZoneProgress>;
  flags: Record<string, boolean>;
  final: FinalProgress;
  questionLog: QuestionRecord[];
  stats: Stats;
  achievements: string[];
  nickname: string;
  completed: boolean;
}

export function createNewSave(config: TeacherConfig, spawn: { pos: [number, number, number]; yaw: number }, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    config,
    player: { pos: [...spawn.pos] as [number, number, number], yaw: spawn.yaw, pitch: 0 },
    inventory: emptySlots(INVENTORY_SIZE),
    selected: 0,
    craftGrid: emptySlots(9),
    xp: 0,
    elementsDiscovered: [],
    recipesDiscovered: [],
    craftedCounts: {},
    zones: { 1: { step: 0, completed: false }, 2: { step: 0, completed: false }, 3: { step: 0, completed: false }, 4: { step: 0, completed: false }, 5: { step: 0, completed: false } },
    flags: {},
    final: { formulaTargets: [], formulaDelivered: [], sockets: {}, sortingDone: false, balancingDone: false },
    questionLog: [],
    stats: {
      questionsAttempted: 0,
      questionsCorrect: 0,
      firstTryCorrect: 0,
      incorrectAttempts: 0,
      hintsUsed: 0,
      craftsMade: 0,
      craftMistakes: 0,
      formulaCorrect: 0,
      secretsFound: 0,
      playTimeSec: 0,
      startedAt: now,
      completedAt: null,
    },
    achievements: [],
    nickname: '',
    completed: false,
  };
}

export function serializeSave(s: SaveData): string {
  return JSON.stringify(s);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseSlots(raw: unknown, size: number): Slots {
  const out = emptySlots(size);
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < Math.min(size, raw.length); i++) {
    const s = raw[i] as ItemStack | null;
    if (s && typeof s.id === 'string' && isNum(s.count) && s.count > 0) out[i] = { id: s.id, count: Math.floor(s.count) };
  }
  return out;
}

/** Parse and validate saved JSON. Returns null when the data is unusable. */
export function deserializeSave(json: string | null): SaveData | null {
  if (!json) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || raw.version !== SAVE_VERSION) return null;
  const base = createNewSave(parseTeacherConfig(raw.config), { pos: [24.5, 6, 8.5], yaw: 0 }, isNum(raw.createdAt) ? raw.createdAt : Date.now());
  const p = raw.player as SaveData['player'] | undefined;
  if (p && Array.isArray(p.pos) && p.pos.length === 3 && p.pos.every(isNum)) {
    base.player = { pos: p.pos as [number, number, number], yaw: isNum(p.yaw) ? p.yaw : 0, pitch: isNum(p.pitch) ? p.pitch : 0 };
  }
  base.inventory = parseSlots(raw.inventory, INVENTORY_SIZE);
  base.craftGrid = parseSlots(raw.craftGrid, 9);
  base.selected = isNum(raw.selected) ? Math.max(0, Math.min(8, Math.floor(raw.selected))) : 0;
  base.xp = isNum(raw.xp) ? raw.xp : 0;
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  base.elementsDiscovered = strArr(raw.elementsDiscovered);
  base.recipesDiscovered = strArr(raw.recipesDiscovered);
  base.achievements = strArr(raw.achievements);
  if (raw.craftedCounts && typeof raw.craftedCounts === 'object') base.craftedCounts = raw.craftedCounts as Record<string, number>;
  if (raw.zones && typeof raw.zones === 'object') {
    for (const k of [1, 2, 3, 4, 5]) {
      const z = (raw.zones as Record<string, ZoneProgress>)[k];
      if (z && isNum(z.step)) base.zones[k] = { step: Math.max(0, Math.floor(z.step)), completed: !!z.completed };
    }
  }
  if (raw.flags && typeof raw.flags === 'object') {
    for (const [k, v] of Object.entries(raw.flags as Record<string, unknown>)) if (typeof v === 'boolean') base.flags[k] = v;
  }
  const f = raw.final as FinalProgress | undefined;
  if (f && typeof f === 'object') {
    base.final = {
      formulaTargets: strArr(f.formulaTargets),
      formulaDelivered: strArr(f.formulaDelivered),
      sockets: f.sockets && typeof f.sockets === 'object' ? { ...f.sockets } : {},
      sortingDone: !!f.sortingDone,
      balancingDone: !!f.balancingDone,
    };
  }
  if (Array.isArray(raw.questionLog)) base.questionLog = (raw.questionLog as QuestionRecord[]).filter((q) => q && typeof q.id === 'string');
  if (raw.stats && typeof raw.stats === 'object') {
    const s = raw.stats as Record<string, unknown>;
    for (const key of Object.keys(base.stats) as (keyof Stats)[]) {
      const v = s[key];
      if (key === 'completedAt') base.stats.completedAt = isNum(v) ? v : null;
      else if (isNum(v)) (base.stats[key] as number) = v;
    }
  }
  base.nickname = typeof raw.nickname === 'string' ? raw.nickname.slice(0, 24) : '';
  base.completed = !!raw.completed;
  base.updatedAt = isNum(raw.updatedAt) ? raw.updatedAt : base.createdAt;
  return base;
}

/** Local storage helpers that never throw (private browsing, blocked storage...). */
export const storage = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  },
  remove(key: string) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* storage unavailable */
    }
  },
};
