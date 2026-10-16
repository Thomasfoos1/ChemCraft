/**
 * Central game state (Zustand). Holds the save file, UI overlays, dialogue and quiz flow,
 * and every gameplay action that changes persistent progress. The 3D runtime calls these
 * actions and listens to `events` for things it must animate.
 */
import { create } from 'zustand';
import { ACHIEVEMENTS, FINAL_LAB, NPCS, ZONES, zoneDef, StepDef } from '../content';
import { ELEMENTS } from '../chem/elements';
import { RECIPE_BY_ID, Recipe, matchRecipe } from '../chem/recipes';
import { prettyFormula } from '../chem/formula';
import { TeacherConfig, SessionPlan, defaultTeacherConfig, derivePlan, parseTeacherConfig } from './config';
import { Settings, defaultSettings, parseSettings } from './settings';
import {
  SaveData, SAVE_KEY, SETTINGS_KEY, TEACHER_KEY, createNewSave, deserializeSave, serializeSave, storage,
} from './save';
import { ItemStack, itemDisplayName } from './items';
import {
  addItem, cloneSlots, countItem, leftClickSlot, quickMove, removeItem, rightClickSlot, transferAll, emptySlots,
} from './inventory';
import { activeZone, advanceSteps, flagKey, zoneSteps, QuestContext } from './quests';
import { AttemptState, Feedback, freshAttempt, questionById, requestHint, selectQuestions, submitAnswer } from './questions';
import { XP } from './scoring';
import { newlyEarned } from './achievements';
import { events } from './events';
import { SPAWN } from './constants';

export type Screen = 'menu' | 'game' | 'results';
export type MenuPage = 'main' | 'teacher' | 'howto' | 'settings';
export type Overlay =
  | null
  | 'inventory'
  | 'crafting'
  | 'dialogue'
  | 'quiz'
  | 'pause'
  | 'book'
  | 'console'
  | 'sorter'
  | 'balancer'
  | 'reactor'
  | 'help'
  | 'settings';

export type DialogueAfter =
  | { kind: 'none' }
  | { kind: 'talkDone'; zone: number }
  | { kind: 'startQuiz'; zone: number; stepId: string }
  | { kind: 'finale' };

export interface DialogueState {
  npcId: string;
  lines: string[];
  index: number;
  after: DialogueAfter;
}

export interface QuizState {
  zone: number;
  stepId: string;
  npcId: string;
  ids: string[];
  index: number;
  attempt: AttemptState;
  feedback: Feedback | null;
  hint: string | null;
  selected: number | string | null;
}

export interface Toast {
  id: number;
  title: string;
  text?: string;
  icon?: string;
  kind: 'item' | 'info' | 'achievement' | 'xp' | 'warn' | 'discovery';
}

export interface Banner {
  id: number;
  title: string;
  subtitle?: string;
  kind: 'zone' | 'complete';
}

export interface Caption {
  id: number;
  text: string;
  t: number;
}

export type ContainerArea = 'inv' | 'grid';

interface GameStore {
  screen: Screen;
  menuPage: MenuPage;
  overlay: Overlay;
  settings: Settings;
  teacher: TeacherConfig;
  save: SaveData | null;
  plan: SessionPlan | null;
  cursor: ItemStack | null;
  dialogue: DialogueState | null;
  quiz: QuizState | null;
  toasts: Toast[];
  banner: Banner | null;
  captions: Caption[];
  prompt: string | null;
  craftResult: { recipeId: string; first: boolean; t: number } | null;
  craftShake: number;
  pointerLocked: boolean;
  introPlaying: boolean;
  tutorial: 'move' | 'look' | 'mine' | null;
  idleHint: string | null;
  stationSocket: string | null;
  currentZone: number;
  loading: boolean;

  // --- meta ---
  setScreen(s: Screen): void;
  setMenuPage(p: MenuPage): void;
  updateSettings(p: Partial<Settings>): void;
  updateTeacher(c: TeacherConfig): void;
  hasSave(): boolean;
  newGame(): void;
  continueGame(): boolean;
  quitToMenu(): void;
  deleteSave(): void;
  persist(): void;
  addPlayTime(sec: number): void;
  setPlayerPose(pos: [number, number, number], yaw: number, pitch: number): void;

  // --- ui ---
  openOverlay(o: Overlay): void;
  closeOverlay(): void;
  setPrompt(p: string | null): void;
  toast(t: Omit<Toast, 'id'>): void;
  dismissToast(id: number): void;
  showBanner(b: Omit<Banner, 'id'>): void;
  caption(text: string): void;
  setPointerLocked(v: boolean): void;
  setIntro(v: boolean): void;
  setTutorial(t: GameStore['tutorial']): void;
  setIdleHint(h: string | null): void;
  setCurrentZone(z: number): void;

  // --- inventory ---
  giveItem(id: string, count: number, opts?: { silent?: boolean }): number;
  takeItem(id: string, count: number): number;
  selectSlot(i: number): void;
  slotClick(area: ContainerArea, index: number, button: 0 | 2, shift: boolean): void;
  trashCursor(): void;
  returnCraftingItems(): void;
  craftTake(): void;
  craftFailClick(): void;
  fillGridWithRecipe(id: string): void;

  // --- story ---
  talk(npcId: string): void;
  dialogueNext(): void;
  dialogueClose(): void;
  showDialogue(npcId: string, lines: string[], after?: DialogueAfter): void;
  startQuiz(zone: number, stepId: string): void;
  quizSelect(v: number | string): void;
  quizSubmit(): void;
  quizHint(): void;
  quizNext(): void;
  setFlag(key: string, value?: boolean): void;
  markUsed(machine: string): void;
  reachStep(zone: number, stepId: string): void;
  refreshQuests(playerZ?: number): void;
  completeZone(zone: number): void;
  grantXp(n: number): void;
  checkAchievements(): void;
  discoverSecret(id: string): void;
  openChest(id: string, contents: Record<string, number>): boolean;

  // --- final lab ---
  ensureFormulaTargets(): void;
  deliverFormula(recipeId: string): 'ok' | 'missing' | 'done';
  formulaHint(recipeId: string): string;
  completeSorting(records: { id: string; attempts: number; category: string }[]): void;
  completeBalancing(attempts: number, hints: number): void;
  insertSocket(socket: string, itemId: string): 'ok' | 'wrong' | 'missing';
  reactorFinished(): void;
  finishGame(): void;
  openStation(o: Overlay, socket?: string): void;
}

let toastId = 1;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastPlayerZ = SPAWN.pos[2];

const loadSettings = () => {
  try {
    return parseSettings(JSON.parse(storage.get(SETTINGS_KEY) ?? 'null'));
  } catch {
    return defaultSettings();
  }
};
const loadTeacher = () => {
  try {
    return parseTeacherConfig(JSON.parse(storage.get(TEACHER_KEY) ?? 'null'));
  } catch {
    return defaultTeacherConfig();
  }
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export const useGame = create<GameStore>((set, get) => {
  /** Apply a mutation to a copy of the save, then schedule persistence. */
  const mutate = (fn: (s: SaveData) => void) => {
    const cur = get().save;
    if (!cur) return;
    const next = clone(cur);
    fn(next);
    next.updatedAt = Date.now();
    set({ save: next });
    schedulePersist();
  };
  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => get().persist(), 400);
  };
  const ctx = (s: SaveData): QuestContext => ({
    inventory: s.inventory,
    flags: s.flags,
    recipesDiscovered: s.recipesDiscovered,
    playerZ: lastPlayerZ,
  });
  const sfx = (name: string, volume?: number) => events.emit({ type: 'sfx', name, volume });

  return {
    screen: 'menu',
    menuPage: 'main',
    overlay: null,
    settings: loadSettings(),
    teacher: loadTeacher(),
    save: null,
    plan: null,
    cursor: null,
    dialogue: null,
    quiz: null,
    toasts: [],
    banner: null,
    captions: [],
    prompt: null,
    craftResult: null,
    craftShake: 0,
    pointerLocked: false,
    introPlaying: false,
    tutorial: null,
    idleHint: null,
    stationSocket: null,
    currentZone: 1,
    loading: false,

    // ------------------------------------------------------------------ meta
    setScreen: (screen) => set({ screen }),
    setMenuPage: (menuPage) => set({ menuPage }),
    updateSettings: (p) => {
      const settings = { ...get().settings, ...p };
      set({ settings });
      storage.set(SETTINGS_KEY, JSON.stringify(settings));
    },
    updateTeacher: (c) => {
      set({ teacher: c });
      storage.set(TEACHER_KEY, JSON.stringify(c));
    },
    hasSave: () => !!deserializeSave(storage.get(SAVE_KEY)),
    newGame: () => {
      const config = clone(get().teacher);
      const save = createNewSave(config, SPAWN);
      const plan = derivePlan(config);
      if (plan.skipLimestonePuzzle) save.flags['bridge_built'] = true;
      lastPlayerZ = SPAWN.pos[2];
      set({
        save, plan, screen: 'game', overlay: null, cursor: null, dialogue: null, quiz: null, toasts: [],
        banner: null, craftResult: null, introPlaying: true, tutorial: 'move', idleHint: null, currentZone: 1,
      });
      get().persist();
      events.emit({ type: 'newGame' });
    },
    continueGame: () => {
      const save = deserializeSave(storage.get(SAVE_KEY));
      if (!save) return false;
      // Repair: a machine animation that was interrupted by closing the page.
      const repairs: [string, string][] = [['water_flowing', 'generator'], ['ice_melted', 'frozen_gate'], ['carbonator_on', 'carbonator']];
      for (const [world, machine] of repairs) if (save.flags[world]) save.flags[flagKey.used(machine)] = true;
      if (save.flags['bridge_built'] && save.zones[4].step > 0) save.flags[flagKey.used('fabricator')] = true;
      lastPlayerZ = save.player.pos[2];
      set({
        save, plan: derivePlan(save.config), screen: save.completed ? 'results' : 'game', overlay: null, cursor: null,
        dialogue: null, quiz: null, toasts: [], banner: null, craftResult: null, introPlaying: false, tutorial: null,
      });
      events.emit({ type: 'loadGame' });
      get().refreshQuests();
      return true;
    },
    quitToMenu: () => {
      get().returnCraftingItems();
      get().persist();
      set({ screen: 'menu', menuPage: 'main', overlay: null, dialogue: null, quiz: null, introPlaying: false });
    },
    deleteSave: () => {
      storage.remove(SAVE_KEY);
      set({ save: null, plan: null });
    },
    persist: () => {
      const s = get().save;
      if (s) storage.set(SAVE_KEY, serializeSave(s));
    },
    addPlayTime: (sec) => {
      const s = get().save;
      if (!s || s.completed) return;
      s.stats.playTimeSec += sec; // hot path: mutate in place, persisted with the next write
    },
    setPlayerPose: (pos, yaw, pitch) => {
      const s = get().save;
      if (!s) return;
      s.player = { pos, yaw, pitch };
      lastPlayerZ = pos[2];
    },

    // ------------------------------------------------------------------ ui
    openOverlay: (overlay) => {
      set({ overlay });
      if (overlay === 'inventory' || overlay === 'crafting') sfx('open');
    },
    closeOverlay: () => {
      const o = get().overlay;
      if (o === 'crafting' || o === 'inventory') get().returnCraftingItems();
      if (o === 'dialogue') return get().dialogueClose();
      set({ overlay: null, craftResult: null, stationSocket: null });
    },
    setPrompt: (prompt) => {
      if (get().prompt !== prompt) set({ prompt });
    },
    toast: (t) => {
      const id = toastId++;
      set({ toasts: [...get().toasts.slice(-4), { ...t, id }] });
      setTimeout(() => get().dismissToast(id), t.kind === 'achievement' ? 5000 : 3200);
    },
    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
    showBanner: (b) => {
      const id = toastId++;
      set({ banner: { ...b, id } });
      setTimeout(() => {
        if (get().banner?.id === id) set({ banner: null });
      }, b.kind === 'complete' ? 5000 : 3800);
    },
    caption: (text) => {
      if (!get().settings.captions) return;
      const id = toastId++;
      set({ captions: [...get().captions.slice(-3), { id, text, t: Date.now() }] });
      setTimeout(() => set({ captions: get().captions.filter((c) => c.id !== id) }), 2500);
    },
    setPointerLocked: (pointerLocked) => set({ pointerLocked }),
    setIntro: (introPlaying) => set({ introPlaying }),
    setTutorial: (tutorial) => set({ tutorial }),
    setIdleHint: (idleHint) => set({ idleHint }),
    setCurrentZone: (currentZone) => {
      if (get().currentZone === currentZone) return;
      set({ currentZone });
      const z = zoneDef(currentZone);
      get().showBanner({ title: z.name, subtitle: `Zone ${z.id} — ${z.chemistry}`, kind: 'zone' });
    },

    // ------------------------------------------------------------------ inventory
    giveItem: (id, count, opts) => {
      const s = get().save;
      if (!s) return count;
      const res = addItem(s.inventory, id, count);
      const added = count - res.leftover;
      if (added <= 0) {
        if (!opts?.silent) get().toast({ title: 'Inventory full!', text: 'Drop items in the trash slot (press E).', kind: 'warn' });
        return count;
      }
      const isNewElement = !!ELEMENTS[id] && !s.elementsDiscovered.includes(id);
      mutate((d) => {
        d.inventory = res.slots;
        if (isNewElement) {
          d.elementsDiscovered.push(id);
          d.xp += XP.newElement;
        }
      });
      if (!opts?.silent) {
        get().toast({ title: `+${added} ${itemDisplayName(id)}`, icon: id, kind: 'item' });
        if (isNewElement) {
          const el = ELEMENTS[id];
          get().toast({ title: `New element: ${el.name} (${el.symbol})`, text: `Atomic number ${el.atomicNumber}`, icon: id, kind: 'discovery' });
        }
      }
      if (res.leftover > 0) get().toast({ title: 'Inventory full!', text: `${res.leftover} ${itemDisplayName(id)} could not fit.`, kind: 'warn' });
      if (get().tutorial === 'mine') set({ tutorial: null });
      get().refreshQuests();
      get().checkAchievements();
      return res.leftover;
    },
    takeItem: (id, count) => {
      const s = get().save;
      if (!s) return 0;
      const res = removeItem(s.inventory, id, count);
      mutate((d) => {
        d.inventory = res.slots;
      });
      return res.removed;
    },
    selectSlot: (i) => {
      const s = get().save;
      if (!s || s.selected === i) return;
      s.selected = i; // selection is cosmetic; avoid cloning the save every scroll tick
      set({ save: { ...s } });
    },
    slotClick: (area, index, button, shift) => {
      const s = get().save;
      if (!s) return;
      const slots = area === 'inv' ? s.inventory : s.craftGrid;
      if (shift && area === 'inv') {
        if (get().overlay === 'crafting') {
          // shift-click moves a stack from inventory into the grid
          const stack = slots[index];
          if (!stack) return;
          const grid = cloneSlots(s.craftGrid);
          const inv = cloneSlots(s.inventory);
          const res = addItem(grid, stack.id, stack.count);
          inv[index] = res.leftover > 0 ? { id: stack.id, count: res.leftover } : null;
          mutate((d) => { d.inventory = inv; d.craftGrid = res.slots; });
        } else {
          mutate((d) => { d.inventory = quickMove(d.inventory, index); });
        }
        sfx('click');
        return;
      }
      if (shift && area === 'grid') {
        const stack = slots[index];
        if (!stack) return;
        const res = addItem(s.inventory, stack.id, stack.count);
        const grid = cloneSlots(s.craftGrid);
        grid[index] = res.leftover > 0 ? { id: stack.id, count: res.leftover } : null;
        mutate((d) => { d.inventory = res.slots; d.craftGrid = grid; });
        sfx('click');
        return;
      }
      const r = button === 2 ? rightClickSlot(slots, get().cursor, index) : leftClickSlot(slots, get().cursor, index);
      mutate((d) => {
        if (area === 'inv') d.inventory = r.slots;
        else d.craftGrid = r.slots;
      });
      set({ cursor: r.cursor, craftResult: area === 'grid' ? null : get().craftResult });
      sfx('click');
    },
    trashCursor: () => {
      if (!get().cursor) return;
      set({ cursor: null });
      sfx('trash');
      get().refreshQuests();
    },
    returnCraftingItems: () => {
      const s = get().save;
      if (!s) return;
      let inv = s.inventory;
      let grid = s.craftGrid;
      const cursor = get().cursor;
      if (cursor) {
        const r = addItem(inv, cursor.id, cursor.count);
        inv = r.slots;
        if (r.leftover > 0) {
          const g = addItem(grid, cursor.id, r.leftover);
          grid = g.slots;
        }
      }
      const t = transferAll(grid, inv);
      mutate((d) => { d.inventory = t.target; d.craftGrid = t.source; });
      set({ cursor: null });
    },
    craftTake: () => {
      const s = get().save;
      const plan = get().plan;
      if (!s || !plan) return;
      const recipe = matchRecipe(s.craftGrid);
      if (!recipe) return get().craftFailClick();
      // Crafted items go straight into the inventory (or onto the cursor if the inventory is full).
      let newCursor = get().cursor;
      let inv = s.inventory;
      const r = addItem(inv, recipe.id, 1);
      if (r.leftover === 0) inv = r.slots;
      else if (!newCursor) newCursor = { id: recipe.id, count: 1 };
      else if (newCursor.id === recipe.id && newCursor.count < 64) newCursor = { id: recipe.id, count: newCursor.count + 1 };
      else {
        get().toast({ title: 'Inventory full!', text: 'Make room before crafting.', kind: 'warn' });
        return;
      }
      const first = !s.recipesDiscovered.includes(recipe.id);
      mutate((d) => {
        d.craftGrid = emptySlots(9);
        d.inventory = inv;
        d.stats.craftsMade += 1;
        d.craftedCounts[recipe.id] = (d.craftedCounts[recipe.id] ?? 0) + 1;
        if (first) {
          d.recipesDiscovered.push(recipe.id);
          d.xp += XP.newRecipe;
        } else d.xp += XP.repeatCraft;
      });
      set({ cursor: newCursor, craftResult: { recipeId: recipe.id, first, t: Date.now() } });
      events.emit({ type: 'craftSuccess', recipe: recipe.id });
      if (first) {
        get().toast({ title: `Discovered ${recipe.name}!`, text: prettyFormula(recipe.formula), icon: recipe.id, kind: 'discovery' });
      }
      get().refreshQuests();
      get().checkAchievements();
    },
    craftFailClick: () => {
      const s = get().save;
      if (!s) return;
      const any = s.craftGrid.some((x) => x);
      if (!any) return;
      mutate((d) => { d.stats.craftMistakes += 1; });
      set({ craftShake: Date.now() });
      events.emit({ type: 'craftFail' });
    },
    fillGridWithRecipe: (id) => {
      const r: Recipe | undefined = RECIPE_BY_ID[id];
      if (!r) return;
      get().returnCraftingItems();
      const s = get().save!;
      const missing = Object.entries(r.composition).filter(([el, n]) => countItem(s.inventory, el) < n);
      if (missing.length) {
        get().toast({
          title: 'Not enough atoms',
          text: missing.map(([el, n]) => `${el}: have ${countItem(s.inventory, el)}, need ${n}`).join(' · '),
          kind: 'warn',
        });
        return;
      }
      let inv = s.inventory;
      const grid = emptySlots(9);
      const total = Object.values(r.composition).reduce((a, b) => a + b, 0);
      let slot = 0;
      for (const [el, n] of Object.entries(r.composition)) {
        inv = removeItem(inv, el, n).slots;
        if (total <= 9) for (let k = 0; k < n; k++) grid[slot++] = { id: el, count: 1 };
        else grid[slot++] = { id: el, count: n };
      }
      mutate((d) => { d.inventory = inv; d.craftGrid = grid; });
      sfx('click');
    },

    // ------------------------------------------------------------------ story
    showDialogue: (npcId, lines, after = { kind: 'none' }) => {
      set({ dialogue: { npcId, lines, index: 0, after }, overlay: 'dialogue' });
      sfx(`talk:${npcId}`);
    },
    talk: (npcId) => {
      const s = get().save;
      const plan = get().plan;
      const npc = NPCS[npcId];
      if (!s || !plan || !npc) return;
      const zone = zoneDef(npc.zone);
      const active = activeZone(s);
      const steps = zoneSteps(zone, plan);
      const step: StepDef | undefined = steps[s.zones[zone.id]?.step ?? 0];
      if (s.zones[zone.id]?.completed || zone.id < active || !step) {
        const lines = zone.id === 5 && s.flags['vault_open'] ? zone.complete.slice(-2) : [zone.idle[Math.floor(Math.random() * zone.idle.length)]];
        return get().showDialogue(npcId, lines);
      }
      if (zone.id > active) {
        // The player walked ahead of an unfinished zone: point them back to it.
        const pending = zoneDef(active);
        const pendingNpc = NPCS[pending.npc];
        const pendingStep = zoneSteps(pending, plan)[s.zones[active]?.step ?? 0];
        const redirect = `Before I can help you here, ${pendingNpc?.name ?? 'a scientist'} in ${pending.name} is still waiting for you${pendingStep ? `: ${pendingStep.text.charAt(0).toLowerCase()}${pendingStep.text.slice(1)}` : ''}. Head back and finish that first!`;
        if (step.type === 'talk') return get().showDialogue(npcId, [...(step.dialogue ?? []), redirect], { kind: 'talkDone', zone: zone.id });
        return get().showDialogue(npcId, [redirect]);
      }
      if (step.type === 'talk') return get().showDialogue(npcId, step.dialogue ?? [], { kind: 'talkDone', zone: zone.id });
      if (step.type === 'quiz') return get().showDialogue(npcId, step.dialogue ?? [], { kind: 'startQuiz', zone: zone.id, stepId: step.id });
      const lines = step.reminder?.length ? step.reminder : step.hint ? [step.hint] : zone.idle;
      get().showDialogue(npcId, lines);
    },
    dialogueNext: () => {
      const d = get().dialogue;
      if (!d) return;
      if (d.index < d.lines.length - 1) {
        set({ dialogue: { ...d, index: d.index + 1 } });
        sfx('click');
      } else get().dialogueClose();
    },
    dialogueClose: () => {
      const d = get().dialogue;
      set({ dialogue: null, overlay: null });
      if (!d) return;
      const after = d.after;
      if (after.kind === 'talkDone') {
        get().setFlag(flagKey.talk(after.zone));
        if (after.zone === 1) set({ tutorial: 'mine' });
      } else if (after.kind === 'startQuiz') {
        get().startQuiz(after.zone, after.stepId);
      }
    },
    startQuiz: (zone, stepId) => {
      const plan = get().plan!;
      const ids = selectQuestions(zone, plan).map((q) => q.id);
      if (ids.length === 0) {
        get().setFlag(flagKey.quiz(zone, stepId));
        return;
      }
      set({
        quiz: { zone, stepId, npcId: zoneDef(zone).npc, ids, index: 0, attempt: freshAttempt(), feedback: null, hint: null, selected: null },
        overlay: 'quiz',
      });
    },
    quizSelect: (selected) => {
      const q = get().quiz;
      if (!q || q.attempt.resolved) return;
      set({ quiz: { ...q, selected } });
    },
    quizSubmit: () => {
      const q = get().quiz;
      const plan = get().plan;
      if (!q || !plan || q.selected === null || q.selected === '' || q.attempt.resolved) return;
      const def = questionById(q.ids[q.index]);
      if (!def) return;
      const firstSubmission = q.attempt.wrong === 0;
      const prevHints = q.attempt.hintsShown;
      const res = submitAnswer(q.attempt, def, q.selected, plan);
      const newHints = res.state.hintsShown - prevHints;
      mutate((d) => {
        if (firstSubmission) d.stats.questionsAttempted += 1;
        d.stats.hintsUsed += Math.max(0, newHints);
        if (!res.state.correct) d.stats.incorrectAttempts += 1;
        if (res.state.resolved) {
          const firstTry = res.state.correct && res.state.wrong === 0;
          d.questionLog.push({
            id: def.id, topic: def.topic, zone: q.zone, attempts: res.state.wrong + (res.state.correct ? 1 : 0),
            correct: res.state.correct, firstTry, hints: res.state.hintsShown,
          });
          if (res.state.correct) {
            d.stats.questionsCorrect += 1;
            if (firstTry) d.stats.firstTryCorrect += 1;
            if (def.formula) d.stats.formulaCorrect += 1;
            d.xp += firstTry ? XP.firstTry : XP.laterCorrect;
          } else d.xp += XP.guided;
        }
      });
      set({ quiz: { ...q, attempt: res.state, feedback: res.feedback, hint: res.feedback.hint ?? q.hint } });
      sfx(res.state.correct ? 'correct' : 'wrong');
      get().checkAchievements();
    },
    quizHint: () => {
      const q = get().quiz;
      if (!q || q.attempt.resolved) return;
      const def = questionById(q.ids[q.index]);
      if (!def) return;
      const prev = q.attempt.hintsShown;
      const r = requestHint(q.attempt, def);
      if (r.state.hintsShown > prev) mutate((d) => { d.stats.hintsUsed += 1; });
      set({ quiz: { ...q, attempt: r.state, hint: r.hint } });
    },
    quizNext: () => {
      const q = get().quiz;
      if (!q || !q.attempt.resolved) return;
      if (q.index < q.ids.length - 1) {
        set({ quiz: { ...q, index: q.index + 1, attempt: freshAttempt(), feedback: null, hint: null, selected: null } });
        return;
      }
      set({ quiz: null, overlay: null });
      get().setFlag(flagKey.quiz(q.zone, q.stepId));
    },
    setFlag: (key, value = true) => {
      const s = get().save;
      if (!s || s.flags[key] === value) return;
      mutate((d) => { d.flags[key] = value; });
      get().refreshQuests();
    },
    markUsed: (machine) => {
      const s = get().save;
      if (!s) return;
      mutate((d) => {
        d.flags[flagKey.used(machine)] = true;
        d.xp += XP.puzzle;
      });
      get().refreshQuests();
      // Auto-start the learning check right after the puzzle animation.
      const after = get().save!;
      const plan = get().plan!;
      const zid = activeZone(after);
      const steps = zoneSteps(zoneDef(zid), plan);
      const step = steps[after.zones[zid].step];
      if (step?.type === 'quiz' && get().overlay === null) {
        get().showDialogue(zoneDef(zid).npc, step.dialogue ?? [], { kind: 'startQuiz', zone: zid, stepId: step.id });
      }
    },
    reachStep: (zone, stepId) => get().setFlag(flagKey.reach(zone, stepId)),
    refreshQuests: (playerZ) => {
      if (playerZ !== undefined) lastPlayerZ = playerZ;
      const s = get().save;
      const plan = get().plan;
      if (!s || !plan || s.completed) return;
      const zid = activeZone(s);
      const zone = zoneDef(zid);
      const steps = zoneSteps(zone, plan);
      const cur = s.zones[zid].step;
      const next = advanceSteps(zid, steps, cur, ctx(s));
      if (next !== cur) {
        mutate((d) => { d.zones[zid].step = next; });
        sfx('objective');
        events.emit({ type: 'objective' });
        // Zone 5: the reactor station completing starts the finale sequence.
        const finished = steps.slice(cur, next);
        if (finished.some((st) => st.type === 'station' && st.station === 'reactor')) events.emit({ type: 'reactorStart' });
        if (finished.some((st) => st.type === 'station' && st.station === 'console')) get().toast({ title: 'Formula Master complete!', kind: 'info' });
      }
      if (next >= steps.length && !s.zones[zid].completed) get().completeZone(zid);
    },
    completeZone: (zone) => {
      const z = zoneDef(zone);
      mutate((d) => {
        d.zones[zone].completed = true;
        d.zones[zone].step = zoneSteps(z, get().plan!).length;
        d.xp += XP.zone;
        if (z.gate && zone !== 5) d.flags[`${z.gate}_open`] = true;
      });
      if (zone === 5) {
        get().finishGame();
        return;
      }
      const disc = z.discovery ? RECIPE_BY_ID[z.discovery] : null;
      get().showBanner({
        title: `${z.name} — Complete!`,
        subtitle: disc ? `New Discovery: ${prettyFormula(disc.formula)} (${disc.name})` : undefined,
        kind: 'complete',
      });
      sfx('zoneComplete');
      if (z.gate) setTimeout(() => events.emit({ type: 'openGate', gate: z.gate! }), 600);
      events.emit({ type: 'zoneComplete', zone });
      // The scientist congratulates you (only if you have actually met them).
      if (get().save?.flags[flagKey.talk(zone)]) {
        setTimeout(() => {
          if (get().overlay === null && get().screen === 'game') get().showDialogue(z.npc, z.complete);
        }, 1800);
      }
      get().checkAchievements();
      // The next zone may already be satisfied (e.g. quick mode's walk-through).
      get().refreshQuests();
    },
    grantXp: (n) => mutate((d) => { d.xp += n; }),
    checkAchievements: () => {
      const s = get().save;
      if (!s) return;
      const earned = newlyEarned(s);
      if (!earned.length) return;
      mutate((d) => { d.achievements.push(...earned); });
      for (const id of earned) {
        events.emit({ type: 'achievement', id });
        get().toast({ title: 'Achievement Get!', text: ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id, icon: id, kind: 'achievement' });
      }
    },
    discoverSecret: (id) => {
      const s = get().save;
      if (!s || s.flags[id]) return;
      mutate((d) => {
        d.flags[id] = true;
        d.stats.secretsFound += 1;
        d.xp += XP.secret;
      });
      get().toast({ title: 'Hidden chamber found!', text: '+40 XP', kind: 'discovery' });
      sfx('secret');
      get().checkAchievements();
    },
    openChest: (id, contents) => {
      const s = get().save;
      if (!s) return false;
      const key = `chest:${id}`;
      if (s.flags[key]) {
        get().toast({ title: 'The chest is empty.', kind: 'info' });
        return false;
      }
      mutate((d) => { d.flags[key] = true; });
      for (const [item, n] of Object.entries(contents)) get().giveItem(item, n);
      sfx('chest');
      return true;
    },

    // ------------------------------------------------------------------ final lab
    openStation: (o, socket) => {
      if (o === 'console') get().ensureFormulaTargets();
      set({ overlay: o, stationSocket: socket ?? null });
    },
    ensureFormulaTargets: () => {
      const s = get().save;
      const plan = get().plan;
      if (!s || !plan || s.final.formulaTargets.length) return;
      const pool = FINAL_LAB.formulaMasterPool.filter((r) => s.recipesDiscovered.includes(r));
      const usable = pool.length ? pool : FINAL_LAB.formulaMasterPool.slice(0, 2);
      const offset = s.createdAt % usable.length;
      const rotated = [...usable.slice(offset), ...usable.slice(0, offset)];
      mutate((d) => { d.final.formulaTargets = rotated.slice(0, Math.min(plan.formulaMasterCount, rotated.length)); });
    },
    deliverFormula: (recipeId) => {
      const s = get().save;
      if (!s) return 'missing';
      if (s.final.formulaDelivered.includes(recipeId)) return 'done';
      if (countItem(s.inventory, recipeId) < 1) return 'missing';
      const inv = removeItem(s.inventory, recipeId, 1).slots;
      mutate((d) => {
        d.inventory = inv;
        d.final.formulaDelivered.push(recipeId);
        d.stats.formulaCorrect += 1;
        d.xp += XP.puzzle;
        if (d.final.formulaTargets.every((t) => d.final.formulaDelivered.includes(t))) d.flags[flagKey.station('console')] = true;
      });
      sfx('machine');
      get().refreshQuests();
      get().checkAchievements();
      return 'ok';
    },
    formulaHint: (recipeId) => {
      const r = RECIPE_BY_ID[recipeId];
      mutate((d) => { d.stats.hintsUsed += 1; });
      return r ? `${r.name} is ${prettyFormula(r.formula)}.` : '';
    },
    completeSorting: (records) => {
      mutate((d) => {
        for (const r of records) {
          const correct = r.attempts <= 1;
          d.stats.questionsAttempted += 1;
          d.stats.questionsCorrect += 1;
          if (correct) d.stats.firstTryCorrect += 1;
          d.stats.incorrectAttempts += Math.max(0, r.attempts - 1);
          d.questionLog.push({
            id: `sort_${r.id}`, topic: r.category === 'mixture' ? 'mixtures' : r.category === 'element' ? 'elements' : 'compounds',
            zone: 5, attempts: r.attempts, correct: true, firstTry: correct, hints: 0,
          });
        }
        if (records.some((r) => r.attempts > 1)) d.flags['sorting_mistakes'] = true;
        d.final.sortingDone = true;
        d.flags[flagKey.station('sorter')] = true;
        d.xp += XP.station;
      });
      sfx('correct');
      get().refreshQuests();
      get().checkAchievements();
    },
    completeBalancing: (attempts, hints) => {
      mutate((d) => {
        d.stats.questionsAttempted += 1;
        d.stats.questionsCorrect += 1;
        if (attempts <= 1) d.stats.firstTryCorrect += 1;
        d.stats.incorrectAttempts += Math.max(0, attempts - 1);
        d.stats.hintsUsed += hints;
        d.questionLog.push({ id: 'balance_water', topic: 'balancing', zone: 5, attempts, correct: true, firstTry: attempts <= 1, hints });
        if (attempts > 1) d.flags['balancing_mistakes'] = true;
        d.final.balancingDone = true;
        d.flags[flagKey.station('balancer')] = true;
        d.xp += XP.station;
      });
      sfx('correct');
      get().refreshQuests();
      get().checkAchievements();
    },
    insertSocket: (socket, itemId) => {
      const s = get().save;
      const plan = get().plan;
      if (!s || !plan) return 'missing';
      const def = FINAL_LAB.sockets.find((x) => x.id === socket);
      if (!def || s.final.sockets[socket]) return 'missing';
      if (countItem(s.inventory, itemId) < 1) return 'missing';
      if (def.recipe !== itemId) {
        mutate((d) => { d.stats.incorrectAttempts += 1; });
        sfx('wrong');
        return 'wrong';
      }
      const inv = removeItem(s.inventory, itemId, 1).slots;
      mutate((d) => {
        d.inventory = inv;
        d.final.sockets[socket] = true;
        d.flags[`socket${socket}`] = true;
        d.xp += XP.puzzle / 2;
        if (plan.reactorSockets.every((k) => d.final.sockets[k])) d.flags[flagKey.station('reactor')] = true;
      });
      events.emit({ type: 'socketPowered', socket });
      get().refreshQuests();
      return 'ok';
    },
    reactorFinished: () => {
      mutate((d) => {
        d.flags['reactor_on'] = true;
        d.flags['vault_open'] = true;
      });
      events.emit({ type: 'openGate', gate: 'vault' });
      setTimeout(() => get().showDialogue('matter', zoneDef(5).complete, { kind: 'none' }), 2500);
    },
    finishGame: () => {
      mutate((d) => {
        d.completed = true;
        d.stats.completedAt = Date.now();
      });
      get().checkAchievements();
      get().persist();
      sfx('celebrate');
      set({ screen: 'results', overlay: null, dialogue: null, quiz: null });
    },
  };
});

/** Convenience selector for components outside React (the runtime). */
export const game = () => useGame.getState();

export function zoneCount(): number {
  return ZONES.length;
}
