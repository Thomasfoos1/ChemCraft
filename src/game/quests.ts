/**
 * Quest/objective logic: which steps a zone has for the current session plan, whether each
 * step is complete, and what the objective tracker should show. Pure functions only.
 */
import { StepDef, ZONES, ZoneDef, zoneDef } from '../content';
import { getRecipe } from '../chem/recipes';
import { prettyFormula } from '../chem/formula';
import { SessionPlan } from './config';
import { Slots, countItem, hasItems } from './inventory';
import { selectQuestions } from './questions';
import { SaveData } from './save';

export interface QuestContext {
  inventory: Slots;
  flags: Record<string, boolean>;
  recipesDiscovered: string[];
  playerZ: number;
}

export const flagKey = {
  talk: (zone: number) => `talk:${zone}`,
  used: (machine: string) => `used:${machine}`,
  quiz: (zone: number, step: string) => `quiz:${zone}:${step}`,
  station: (station: string) => `station:${station}`,
  reach: (zone: number, step: string) => `reach:${zone}:${step}`,
};

export function zoneSteps(zone: ZoneDef, plan: SessionPlan): StepDef[] {
  const source = zone.id === 4 && plan.skipLimestonePuzzle && zone.quickSteps ? zone.quickSteps : zone.steps;
  return source.filter((s) => {
    if (s.sessions && !s.sessions.includes(plan.sessionLength)) return false;
    if (s.optionalUnless === 'balancing' && !plan.balancingRequired) return false;
    if (s.type === 'quiz' && selectQuestions(zone.id, plan).length === 0) return false;
    return true;
  });
}

export function isStepComplete(zone: number, step: StepDef, ctx: QuestContext): boolean {
  switch (step.type) {
    case 'talk':
      return !!ctx.flags[flagKey.talk(zone)];
    case 'collect':
      return (
        hasItems(ctx.inventory, step.items ?? {}) ||
        (!!step.skipIfHas && (countItem(ctx.inventory, step.skipIfHas) > 0 || ctx.recipesDiscovered.includes(step.skipIfHas)))
      );
    case 'craft':
      return !!step.recipe && (ctx.recipesDiscovered.includes(step.recipe) || countItem(ctx.inventory, step.recipe) > 0);
    case 'use':
      return !!step.machine && !!ctx.flags[flagKey.used(step.machine)];
    case 'quiz':
      return !!ctx.flags[flagKey.quiz(zone, step.id)];
    case 'station':
      return !!step.station && !!ctx.flags[flagKey.station(step.station)];
    case 'reach':
      return !!ctx.flags[flagKey.reach(zone, step.id)] || (step.zMin !== undefined && ctx.playerZ >= step.zMin);
    default:
      return false;
  }
}

/** Advance past every completed step. Returns the new step index (== steps.length when the zone is done). */
export function advanceSteps(zone: number, steps: StepDef[], current: number, ctx: QuestContext): number {
  let i = current;
  while (i < steps.length && isStepComplete(zone, steps[i], ctx)) i++;
  return i;
}

/** The zone whose quest is currently active: the first one not yet completed. */
export function activeZone(save: Pick<SaveData, 'zones'>): number {
  for (const z of ZONES) if (!save.zones[z.id]?.completed) return z.id;
  return 5;
}

/** A zone can be entered once every previous zone is complete. */
export function zoneUnlocked(save: Pick<SaveData, 'zones'>, zone: number): boolean {
  for (let z = 1; z < zone; z++) if (!save.zones[z]?.completed) return false;
  return true;
}

export interface ObjectiveView {
  zoneId: number;
  zoneName: string;
  text: string;
  detail?: string;
  stepIndex: number;
  stepCount: number;
  step: StepDef | null;
}

export function objectiveView(save: SaveData, plan: SessionPlan): ObjectiveView {
  const zid = activeZone(save);
  const zone = zoneDef(zid);
  const steps = zoneSteps(zone, plan);
  const idx = Math.min(save.zones[zid]?.step ?? 0, steps.length);
  if (save.completed) {
    return { zoneId: 5, zoneName: zone.name, text: 'Dungeon complete!', stepIndex: steps.length, stepCount: steps.length, step: null };
  }
  const step = steps[idx] ?? null;
  if (!step) return { zoneId: zid, zoneName: zone.name, text: 'Head to the next zone', stepIndex: idx, stepCount: steps.length, step: null };
  let text = step.text;
  let detail: string | undefined;
  if (step.type === 'collect' && step.items) {
    detail = Object.entries(step.items)
      .map(([el, n]) => `${el}: ${Math.min(n, countItem(save.inventory, el))}/${n}`)
      .join('   ');
  }
  if (step.type === 'use' && step.item && countItem(save.inventory, step.item) === 0 && step.textNeedItem) {
    text = step.textNeedItem;
  }
  if (step.type === 'station' && step.station === 'console') {
    const f = save.final;
    if (f.formulaTargets.length > 0) {
      const names = f.formulaTargets
        .filter((t) => !f.formulaDelivered.includes(t))
        .map((t) => getRecipe(t)?.name ?? t);
      detail = `${f.formulaDelivered.length}/${f.formulaTargets.length} delivered${names.length ? ' — next: ' + names[0] : ''}`;
    }
  }
  if (step.type === 'station' && step.station === 'reactor') {
    const total = plan.reactorSockets.length;
    const done = plan.reactorSockets.filter((s) => save.final.sockets[s]).length;
    detail = `${done}/${total} sockets powered`;
  }
  if (step.type === 'craft' && step.recipe) {
    const r = getRecipe(step.recipe);
    if (r && plan.recipeBook !== 'known-only') detail = `Formula: ${prettyFormula(r.formula)}`;
  }
  return { zoneId: zid, zoneName: zone.name, text, detail, stepIndex: idx, stepCount: steps.length, step };
}

/** Recipe the player is currently expected to craft (used for crafting hints). */
export function currentTargetRecipe(save: SaveData, plan: SessionPlan): string | null {
  const view = objectiveView(save, plan);
  const s = view.step;
  if (!s) return null;
  if (s.type === 'craft' && s.recipe) return s.recipe;
  if (s.type === 'collect' && s.skipIfHas) return s.skipIfHas;
  if (s.type === 'use' && s.item) return s.item;
  if (s.type === 'station' && s.station === 'console') {
    return save.final.formulaTargets.find((t) => !save.final.formulaDelivered.includes(t)) ?? null;
  }
  return null;
}
