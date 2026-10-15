/**
 * Deterministic question selection and answer checking. Wrong answers lead to a hint,
 * then a stronger hint, then a guided explanation — students can never get stuck.
 */
import { QUESTIONS, QuestionDef } from '../content';
import { SessionPlan } from './config';

export function questionById(id: string): QuestionDef | undefined {
  return QUESTIONS.find((q) => q.id === id);
}

/** Pick the questions asked at a zone's learning check: core questions first, filtered by enabled topics. */
export function selectQuestions(zone: number, plan: SessionPlan, count = plan.questionsPerZone): QuestionDef[] {
  const pool = QUESTIONS.filter((q) => q.zone === zone && plan.topics[q.topic]);
  const maxDifficulty = plan.difficulty === 'easy' ? 1 : 2;
  const eligible = pool.filter((q) => q.difficulty <= maxDifficulty || plan.difficulty === 'challenge');
  const ordered = [...eligible.filter((q) => q.core), ...eligible.filter((q) => !q.core)];
  return ordered.slice(0, count);
}

export function checkAnswer(q: QuestionDef, value: number | string): boolean {
  if (q.type === 'numeric') {
    const n = typeof value === 'number' ? value : parseFloat(String(value).trim());
    return Number.isFinite(n) && Math.abs(n - q.answer) < 1e-9;
  }
  return Number(value) === q.answer;
}

export interface AttemptState {
  wrong: number;
  hintsShown: number;
  resolved: boolean;
  correct: boolean;
  revealed: boolean;
}

export const freshAttempt = (): AttemptState => ({ wrong: 0, hintsShown: 0, resolved: false, correct: false, revealed: false });

export type FeedbackKind = 'correct' | 'retry' | 'hint' | 'reveal';

export interface Feedback {
  kind: FeedbackKind;
  text: string;
  hint?: string;
}

export function submitAnswer(
  state: AttemptState,
  q: QuestionDef,
  value: number | string,
  plan: Pick<SessionPlan, 'hintAfter' | 'revealAfter'>,
): { state: AttemptState; feedback: Feedback } {
  if (state.resolved) return { state, feedback: { kind: 'correct', text: q.explanation } };
  if (checkAnswer(q, value)) {
    return {
      state: { ...state, resolved: true, correct: true },
      feedback: { kind: 'correct', text: q.explanation },
    };
  }
  const wrong = state.wrong + 1;
  if (wrong >= plan.revealAfter) {
    return {
      state: { ...state, wrong, resolved: true, correct: false, revealed: true },
      feedback: { kind: 'reveal', text: `Let's work through it together. ${q.explanation}` },
    };
  }
  if (wrong >= plan.hintAfter) {
    const hintIndex = Math.min(q.hints.length - 1, wrong - plan.hintAfter);
    const hintsShown = Math.max(state.hintsShown, hintIndex + 1);
    return {
      state: { ...state, wrong, hintsShown },
      feedback: { kind: 'hint', text: 'Not quite — have another look.', hint: q.hints[hintIndex] },
    };
  }
  return { state: { ...state, wrong }, feedback: { kind: 'retry', text: 'Not quite! Read the question again and give it another try.' } };
}

/** Player asked for a hint explicitly. */
export function requestHint(state: AttemptState, q: QuestionDef): { state: AttemptState; hint: string } {
  const idx = Math.min(q.hints.length - 1, state.hintsShown);
  return { state: { ...state, hintsShown: Math.max(state.hintsShown, idx + 1) }, hint: q.hints[idx] };
}

/** Correct answer as display text, for the guided explanation. */
export function answerText(q: QuestionDef): string {
  return q.type === 'numeric' ? String(q.answer) : q.choices?.[q.answer] ?? '';
}
