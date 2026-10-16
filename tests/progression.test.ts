import { describe, expect, it } from 'vitest';
import { zoneDef } from '../src/content';
import { defaultTeacherConfig, derivePlan, parseTeacherConfig, TeacherConfig } from '../src/game/config';
import { zoneSteps, isStepComplete, advanceSteps, activeZone, zoneUnlocked, flagKey, objectiveView, QuestContext } from '../src/game/quests';
import { selectQuestions, checkAnswer, submitAnswer, freshAttempt, requestHint, questionById } from '../src/game/questions';
import { createNewSave } from '../src/game/save';
import { emptySlots, addItem } from '../src/game/inventory';
import { levelFromXp, accuracy, reviewRecommendations, xpForLevel } from '../src/game/scoring';
import { newlyEarned } from '../src/game/achievements';

const cfg = (p: Partial<TeacherConfig> = {}) => ({ ...defaultTeacherConfig(), ...p });
const ctx = (p: Partial<QuestContext> = {}): QuestContext => ({ inventory: emptySlots(36), flags: {}, recipesDiscovered: [], playerZ: 0, ...p });

describe('teacher configuration', () => {
  it('validates imported JSON and fills defaults', () => {
    const c = parseTeacherConfig({ sessionLength: 'quick', difficulty: 'nonsense', topics: { balancing: true, mixtures: 'yes' } });
    expect(c.sessionLength).toBe('quick');
    expect(c.difficulty).toBe('normal');
    expect(c.topics.balancing).toBe(true);
    expect(c.topics.mixtures).toBe(true);
    expect(parseTeacherConfig(null)).toEqual(defaultTeacherConfig());
  });

  it('shorter sessions remove content instead of adding timers', () => {
    const quick = derivePlan(cfg({ sessionLength: 'quick' }));
    const full = derivePlan(cfg({ sessionLength: 'full' }));
    expect(quick.skipLimestonePuzzle).toBe(true);
    expect(quick.questionsPerZone).toBeLessThan(full.questionsPerZone);
    expect(quick.reactorSockets.length).toBeLessThan(full.reactorSockets.length);
    expect(quick.formulaMasterCount).toBeLessThan(full.formulaMasterCount);
  });

  it('makes balancing optional unless enabled and not in quick mode', () => {
    expect(derivePlan(cfg()).balancingRequired).toBe(false);
    expect(derivePlan(cfg({ topics: { ...cfg().topics, balancing: true } })).balancingRequired).toBe(true);
  });
});

describe('quest prerequisites and step logic', () => {
  const plan = derivePlan(cfg());

  it('builds the Waterworks steps in order', () => {
    expect(zoneSteps(zoneDef(1), plan).map((s) => s.type)).toEqual(['talk', 'collect', 'craft', 'use', 'quiz']);
  });

  it('turns the Limestone Ruins into a walk-through in quick mode', () => {
    const quick = derivePlan(cfg({ sessionLength: 'quick' }));
    expect(zoneSteps(zoneDef(4), quick).map((s) => s.type)).toEqual(['reach']);
  });

  it('only requires the balancing station when the plan says so', () => {
    const ids = zoneSteps(zoneDef(5), plan).map((s) => s.id);
    expect(ids).not.toContain('balancing');
    const p8 = derivePlan(cfg({ gradeLevel: '8', topics: { ...cfg().topics, balancing: true } }));
    expect(zoneSteps(zoneDef(5), p8).map((s) => s.id)).toContain('balancing');
  });

  it('skips quizzes when every topic for that zone is disabled', () => {
    const topics = Object.fromEntries(Object.keys(cfg().topics).map((k) => [k, false])) as TeacherConfig['topics'];
    const p = derivePlan(cfg({ topics }));
    expect(zoneSteps(zoneDef(1), p).some((s) => s.type === 'quiz')).toBe(false);
  });

  it('evaluates collect, craft and use steps', () => {
    const steps = zoneSteps(zoneDef(1), plan);
    const collect = steps[1];
    expect(isStepComplete(1, collect, ctx())).toBe(false);
    const inv = addItem(addItem(emptySlots(36), 'H', 2).slots, 'O', 1).slots;
    expect(isStepComplete(1, collect, ctx({ inventory: inv }))).toBe(true);
    // already holding water also satisfies "collect"
    expect(isStepComplete(1, collect, ctx({ inventory: addItem(emptySlots(36), 'water', 1).slots }))).toBe(true);
    expect(isStepComplete(1, steps[2], ctx({ recipesDiscovered: ['water'] }))).toBe(true);
    expect(isStepComplete(1, steps[3], ctx({ flags: { [flagKey.used('generator')]: true } }))).toBe(true);
  });

  it('cascades through every already-completed step', () => {
    const steps = zoneSteps(zoneDef(1), plan);
    const c = ctx({ flags: { [flagKey.talk(1)]: true, [flagKey.used('generator')]: true }, recipesDiscovered: ['water'] });
    expect(advanceSteps(1, steps, 0, c)).toBe(4); // stops at the quiz
    expect(advanceSteps(1, steps, 0, { ...c, flags: { ...c.flags, [flagKey.quiz(1, 'quiz')]: true } })).toBe(5);
  });

  it('does not let a skipped intro chat block the zone once its puzzle is solved', () => {
    const steps = zoneSteps(zoneDef(4), plan);
    const c = ctx({ flags: { [flagKey.used('fabricator')]: true }, recipesDiscovered: ['calcium_carbonate'] });
    expect(advanceSteps(4, steps, 0, c)).toBe(4); // stops at the learning check
  });

  it('never skips ahead past an incomplete step', () => {
    const steps = zoneSteps(zoneDef(1), plan);
    expect(advanceSteps(1, steps, 0, ctx({ recipesDiscovered: ['water'] }))).toBe(0);
  });

  it('unlocks zones strictly in order', () => {
    const s = createNewSave(cfg(), { pos: [0, 0, 0], yaw: 0 });
    expect(activeZone(s)).toBe(1);
    expect(zoneUnlocked(s, 2)).toBe(false);
    s.zones[1].completed = true;
    expect(activeZone(s)).toBe(2);
    expect(zoneUnlocked(s, 2)).toBe(true);
    expect(zoneUnlocked(s, 3)).toBe(false);
  });

  it('shows collection progress in the objective tracker', () => {
    const s = createNewSave(cfg(), { pos: [0, 0, 0], yaw: 0 });
    s.zones[1].step = 1;
    s.inventory = addItem(emptySlots(36), 'H', 1).slots;
    const v = objectiveView(s, plan);
    expect(v.text).toMatch(/Collect 2 Hydrogen/);
    expect(v.detail).toBe('H: 1/2   O: 0/1');
  });
});

describe('questions, hints and guided answers', () => {
  const plan = derivePlan(cfg());

  it('asks the required learning check first', () => {
    expect(selectQuestions(1, plan)[0].id).toBe('z1_atoms_h2o');
    expect(selectQuestions(2, plan).map((q) => q.id)).toEqual(['z2_elements_nacl', 'z2_salt_compound', 'z2_saltwater_mixture']);
  });

  it('filters by enabled topics', () => {
    const p = derivePlan(cfg({ topics: { ...cfg().topics, mixtures: false } }));
    expect(selectQuestions(2, p).some((q) => q.topic === 'mixtures')).toBe(false);
  });

  it('checks numeric and multiple-choice answers', () => {
    const h2o = questionById('z1_atoms_h2o')!;
    expect(checkAnswer(h2o, 3)).toBe(true);
    expect(checkAnswer(h2o, ' 3 ')).toBe(true);
    expect(checkAnswer(h2o, '2')).toBe(false);
    const salt = questionById('z2_salt_compound')!;
    expect(checkAnswer(salt, 1)).toBe(true);
    expect(checkAnswer(salt, 0)).toBe(false);
  });

  it('escalates hints, then explains the answer so students never get stuck', () => {
    const q = questionById('z1_atoms_h2o')!;
    let st = freshAttempt();
    const r1 = submitAnswer(st, q, 2, plan);
    expect(r1.feedback.kind).toBe('hint');
    expect(r1.feedback.hint).toBe(q.hints[0]);
    st = r1.state;
    const r2 = submitAnswer(st, q, 4, plan);
    expect(r2.feedback.hint).toBe(q.hints[1]);
    const r3 = submitAnswer(r2.state, q, 5, plan);
    expect(r3.feedback.kind).toBe('reveal');
    expect(r3.state.resolved).toBe(true);
    expect(r3.state.correct).toBe(false);
  });

  it('challenge mode waits longer before hinting', () => {
    const p = derivePlan(cfg({ difficulty: 'challenge' }));
    const r = submitAnswer(freshAttempt(), questionById('z1_atoms_h2o')!, 2, p);
    expect(r.feedback.kind).toBe('retry');
  });

  it('tracks explicitly requested hints', () => {
    const q = questionById('z3_oxygen_co2')!;
    const r = requestHint(freshAttempt(), q);
    expect(r.hint).toBe(q.hints[0]);
    expect(r.state.hintsShown).toBe(1);
    expect(requestHint(r.state, q).state.hintsShown).toBe(2);
  });
});

describe('scoring and achievements', () => {
  it('converts XP into levels', () => {
    expect(levelFromXp(0).level).toBe(0);
    expect(levelFromXp(xpForLevel(0)).level).toBe(1);
    expect(levelFromXp(xpForLevel(0) + xpForLevel(1) + 5).into).toBe(5);
  });

  it('computes accuracy and review recommendations', () => {
    const s = createNewSave(cfg(), { pos: [0, 0, 0], yaw: 0 });
    expect(accuracy(s)).toBe(0);
    s.stats.questionsAttempted = 4;
    s.stats.questionsCorrect = 3;
    expect(accuracy(s)).toBe(75);
    s.questionLog.push({ id: 'z3_oxygen_co2', topic: 'formulas', zone: 3, attempts: 3, correct: false, firstTry: false, hints: 2 });
    s.questionLog.push({ id: 'z1_symbol_o', topic: 'symbols', zone: 1, attempts: 1, correct: true, firstTry: true, hints: 0 });
    const rec = reviewRecommendations(s);
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatch(/subscript/);
  });

  it('awards achievements from progress', () => {
    const s = createNewSave(cfg(), { pos: [0, 0, 0], yaw: 0 });
    expect(newlyEarned(s)).toEqual([]);
    s.stats.craftsMade = 1;
    s.zones[1].completed = true;
    expect(newlyEarned(s).sort()).toEqual(['first_reaction', 'water_wizard']);
    s.achievements.push('first_reaction');
    expect(newlyEarned(s)).toEqual(['water_wizard']);
  });
});
