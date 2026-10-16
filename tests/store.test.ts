/**
 * Integration test of the game store: plays the Waterworks quest through the same actions
 * the UI and runtime call, and checks the final-lab stations and gate unlocking.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGame } from '../src/game/store';
import { events, GameEvent } from '../src/game/events';
import { defaultTeacherConfig } from '../src/game/config';
import { countItem } from '../src/game/inventory';
import { flagKey } from '../src/game/quests';

// In-memory localStorage for the Node test environment.
if (!('localStorage' in globalThis) || !globalThis.localStorage) {
  const mem = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
}

const G = () => useGame.getState();
let emitted: GameEvent[] = [];
events.on((e) => emitted.push(e));

function newGame(p: Partial<ReturnType<typeof defaultTeacherConfig>> = {}) {
  G().updateTeacher({ ...defaultTeacherConfig(), ...p });
  G().newGame();
  emitted = [];
}

function putInGrid(el: string, n: number) {
  for (let k = 0; k < n; k++) {
    const s = G();
    const idx = s.save!.inventory.findIndex((x) => x?.id === el);
    const slot = s.save!.craftGrid.findIndex((x) => !x);
    G().slotClick('inv', idx, 0, false);
    G().slotClick('grid', slot, 2, false);
    if (G().cursor) G().slotClick('inv', idx, 0, false);
  }
}

describe('game store integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    newGame();
  });

  it('starts a new adventure at the Waterworks', () => {
    expect(G().screen).toBe('game');
    expect(G().save!.zones[1].step).toBe(0);
    expect(G().introPlaying).toBe(true);
  });

  it('plays the full water-to-gate quest', () => {
    // 1. talk
    G().talk('blockwell');
    expect(G().overlay).toBe('dialogue');
    G().dialogueClose();
    expect(G().save!.flags[flagKey.talk(1)]).toBe(true);
    expect(G().save!.zones[1].step).toBe(1);

    // 2. collect (+ element discovery XP)
    G().giveItem('H', 2);
    G().giveItem('O', 1);
    expect(G().save!.elementsDiscovered).toEqual(['H', 'O']);
    expect(G().save!.zones[1].step).toBe(2);

    // 3. craft at the molecule modeler
    G().openOverlay('crafting');
    putInGrid('H', 2);
    putInGrid('O', 1);
    G().craftTake();
    expect(countItem(G().save!.inventory, 'water')).toBe(1);
    expect(countItem(G().save!.inventory, 'H')).toBe(0);
    expect(G().save!.recipesDiscovered).toContain('water');
    expect(G().save!.achievements).toContain('first_reaction');
    expect(emitted.some((e) => e.type === 'craftSuccess')).toBe(true);
    expect(G().save!.zones[1].step).toBe(3);
    G().closeOverlay();

    // 4. machine used (runtime consumes the item, then marks the puzzle solved)
    G().takeItem('water', 1);
    G().setFlag('water_flowing');
    G().markUsed('generator');
    expect(G().save!.zones[1].step).toBe(4);
    expect(G().overlay).toBe('dialogue'); // the professor calls the learning check
    G().dialogueClose();
    expect(G().overlay).toBe('quiz');

    // 5. learning check: one wrong answer then right
    const firstId = G().quiz!.ids[0];
    expect(firstId).toBe('z1_atoms_h2o');
    G().quizSelect(2);
    G().quizSubmit();
    expect(G().quiz!.feedback!.kind).toBe('hint');
    G().quizSelect(3);
    G().quizSubmit();
    expect(G().quiz!.attempt.correct).toBe(true);
    while (G().quiz) {
      if (!G().quiz!.attempt.resolved) {
        // answer remaining questions by trying each option until resolved
        for (let v = 0; v < 6 && !G().quiz!.attempt.resolved; v++) {
          G().quizSelect(v);
          G().quizSubmit();
        }
      }
      G().quizNext();
    }
    const s = G().save!;
    expect(s.zones[1].completed).toBe(true);
    expect(s.flags.gate1_open).toBe(true);
    expect(s.stats.questionsAttempted).toBeGreaterThanOrEqual(2);
    expect(s.stats.incorrectAttempts).toBeGreaterThanOrEqual(1);
    expect(s.stats.hintsUsed).toBeGreaterThanOrEqual(1);
    expect(s.achievements).toContain('water_wizard');
    vi.advanceTimersByTime(1000);
    expect(emitted).toContainEqual({ type: 'openGate', gate: 'gate1' });
    // next zone is now active
    expect(G().save!.zones[2].step).toBe(0);
  });

  it('warns instead of crafting when the grid is not a known substance', () => {
    G().giveItem('H', 3);
    G().openOverlay('crafting');
    putInGrid('H', 3);
    G().craftTake();
    expect(G().save!.stats.craftMistakes).toBe(1);
    expect(countItem(G().save!.inventory, 'H') + G().save!.craftGrid.filter(Boolean).length).toBe(3);
  });

  it('returns crafting-grid items to the inventory when the table closes', () => {
    G().giveItem('C', 2);
    G().openOverlay('crafting');
    putInGrid('C', 2);
    G().closeOverlay();
    expect(G().save!.craftGrid.every((x) => x === null)).toBe(true);
    expect(countItem(G().save!.inventory, 'C')).toBe(2);
  });

  it('opens chests once and discovers secrets once', () => {
    expect(G().openChest('chest1', { N: 2 })).toBe(true);
    expect(G().openChest('chest1', { N: 2 })).toBe(false);
    expect(countItem(G().save!.inventory, 'N')).toBe(2);
    G().discoverSecret('secret1');
    G().discoverSecret('secret1');
    expect(G().save!.stats.secretsFound).toBe(1);
    expect(G().save!.achievements).toContain('explorer');
  });

  it('quick mode pre-builds the limestone bridge', () => {
    newGame({ sessionLength: 'quick' });
    expect(G().save!.flags.bridge_built).toBe(true);
    expect(G().plan!.reactorSockets).toEqual(['A', 'B', 'C']);
  });

  it('reactor sockets reject the wrong compound and accept the right one', () => {
    G().giveItem('sodium_chloride', 1);
    G().giveItem('water', 1);
    expect(G().insertSocket('A', 'sodium_chloride')).toBe('wrong');
    expect(countItem(G().save!.inventory, 'sodium_chloride')).toBe(1);
    expect(G().insertSocket('A', 'water')).toBe('ok');
    expect(G().save!.final.sockets.A).toBe(true);
    expect(G().save!.flags.socketA).toBe(true);
    expect(G().insertSocket('A', 'water')).toBe('missing');
  });

  it('formula master picks discovered compounds and accepts deliveries', () => {
    const s = G().save!;
    s.recipesDiscovered.push('water', 'sodium_chloride', 'carbon_dioxide');
    G().ensureFormulaTargets();
    const targets = G().save!.final.formulaTargets;
    expect(targets).toHaveLength(2);
    for (const t of targets) {
      expect(G().deliverFormula(t)).toBe('missing');
      G().giveItem(t, 1);
      expect(G().deliverFormula(t)).toBe('ok');
    }
    expect(G().save!.flags[flagKey.station('console')]).toBe(true);
  });

  it('records the balancing challenge and sorting as answered questions', () => {
    G().completeBalancing(2, 1);
    G().completeSorting([{ id: 'air', attempts: 1, category: 'mixture' }, { id: 'o2', attempts: 2, category: 'element' }]);
    const st = G().save!.stats;
    expect(st.questionsAttempted).toBe(3);
    expect(st.questionsCorrect).toBe(3);
    expect(st.incorrectAttempts).toBe(2);
    expect(st.hintsUsed).toBe(1);
    expect(G().save!.achievements).toContain('perfect_balance');
  });

  it('skipping a scientist intro still starts the learning check after the puzzle', () => {
    // Finish zones 1-3 instantly, then solve the Limestone puzzle without talking to Dr. Calcite.
    const s = G().save!;
    for (const z of [1, 2, 3]) s.zones[z] = { step: 5, completed: true };
    s.recipesDiscovered.push('calcium_carbonate'); // crafted, then used in the fabricator
    G().setFlag('bridge_built');
    G().markUsed('fabricator');
    expect(G().save!.zones[4].step).toBe(4); // talk, collect, craft and use are all satisfied
    expect(G().overlay).toBe('dialogue'); // Dr. Calcite calls the quiz anyway
    expect(G().dialogue!.npcId).toBe('calcite');
  });

  it('recovers a save where the Limestone intro was skipped and the final lab was finished', () => {
    // Mirrors a real stuck save: zone 4 at step 0, all Grand Laboratory stations done.
    const s = G().save!;
    for (const z of [1, 2, 3]) s.zones[z] = { step: 5, completed: true };
    s.recipesDiscovered.push('water', 'sodium_chloride', 'carbon_dioxide', 'calcium_carbonate');
    Object.assign(s.flags, {
      bridge_built: true, 'used:fabricator': true, 'talk:5': true,
      'station:console': true, 'station:sorter': true, 'station:reactor': true,
    });
    G().refreshQuests(190);
    expect(G().save!.zones[4].step).toBe(4); // now waiting only on Dr. Calcite's questions
    // Dr. Matter points the player back instead of silently doing nothing.
    G().talk('matter');
    expect(G().dialogue!.lines.join(' ')).toMatch(/Dr\. Calcite in The Limestone Ruins/);
    G().dialogueClose();
    // Finish Dr. Calcite's quiz; everything in the Grand Laboratory then completes and the reactor starts.
    G().talk('calcite');
    G().dialogueClose();
    expect(G().overlay).toBe('quiz');
    while (G().quiz) {
      for (let v = 0; v < 6 && !G().quiz!.attempt.resolved; v++) { G().quizSelect(v); G().quizSubmit(); }
      G().quizNext();
    }
    expect(G().save!.zones[4].completed).toBe(true);
    expect(emitted).toContainEqual({ type: 'reactorStart' });
    expect(G().save!.zones[5].step).toBe(4); // only "walk into the sunlight" remains
  });

  it('persists and resumes', () => {
    G().giveItem('Ca', 4);
    G().persist();
    G().quitToMenu();
    expect(G().screen).toBe('menu');
    expect(G().continueGame()).toBe(true);
    expect(countItem(G().save!.inventory, 'Ca')).toBe(4);
    expect(emitted.some((e) => e.type === 'loadGame')).toBe(true);
  });
});
