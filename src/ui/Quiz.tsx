import { useEffect, useRef } from 'react';
import { useGame } from '../game/store';
import { questionById, answerText } from '../game/questions';
import { NPCS } from '../content';
import { npcPortraitUrl } from '../engine/entities/npcModel';
import { runtime } from '../engine/runtime';

/** Learning-check questions with escalating hints and a guided answer so nobody gets stuck. */
export function QuizPanel() {
  const quiz = useGame((s) => s.quiz);
  const select = useGame((s) => s.quizSelect);
  const submit = useGame((s) => s.quizSubmit);
  const hint = useGame((s) => s.quizHint);
  const next = useGame((s) => s.quizNext);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const q = quiz ? questionById(quiz.ids[quiz.index]) : null;

  useEffect(() => {
    if (q?.type === 'numeric') inputRef.current?.focus();
  }, [q?.id]);
  useEffect(() => {
    if (quiz?.attempt.resolved) nextRef.current?.focus();
  }, [quiz?.attempt.resolved]);

  if (!quiz || !q) return null;
  const npc = NPCS[quiz.npcId];
  const resolved = quiz.attempt.resolved;
  const fb = quiz.feedback;
  const last = quiz.index >= quiz.ids.length - 1;
  const finish = () => {
    next();
    if (last) runtime.resume();
  };
  return (
    <div className="overlay-dim">
      <div className="mc-panel quiz" role="dialog" aria-label="Learning check">
        <div className="q-head">
          {npc && <img src={npcPortraitUrl(npc)} alt="" />}
          <div>
            <div style={{ color: '#6a2a1a' }}>Learning Check — {npc?.name}</div>
            <div style={{ fontSize: 'var(--fs-small)' }}>
              Question {quiz.index + 1} of {quiz.ids.length}
            </div>
          </div>
        </div>
        <div className="q-prompt">{q.prompt}</div>
        {q.display && <div className="q-display">{q.display}</div>}
        {q.type === 'mc' ? (
          <div className="choices">
            {q.choices!.map((c, i) => {
              let cls = '';
              if (resolved && i === q.answer) cls = 'correct';
              else if (fb && !resolved && quiz.selected === i && fb.kind !== 'correct') cls = 'wrong';
              else if (quiz.selected === i) cls = 'selected';
              return (
                <button
                  key={i}
                  className={`mc-btn wide choice ${cls}`}
                  disabled={resolved}
                  aria-pressed={quiz.selected === i}
                  onClick={() => select(i)}
                  onDoubleClick={() => { select(i); submit(); }}
                >
                  {String.fromCharCode(65 + i)}. {c}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ margin: '12px 0', display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              ref={inputRef}
              className="num-input"
              type="number"
              inputMode="numeric"
              aria-label="Your answer"
              disabled={resolved}
              value={quiz.selected === null ? '' : String(quiz.selected)}
              onChange={(e) => select(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            {resolved && <span style={{ color: '#1a4a1a' }}>Answer: {answerText(q)}</span>}
          </div>
        )}
        {fb && (
          <div className={`feedback ${fb.kind}`} role="status">
            {fb.kind === 'correct' ? <b>Correct! </b> : null}
            {fb.text}
          </div>
        )}
        {quiz.hint && !resolved && <div className="hint-box">{'💡'} {quiz.hint}</div>}
        <div className="q-foot">
          <button className="mc-btn small" disabled={resolved} onClick={hint}>
            {'💡'} Hint
          </button>
          {resolved ? (
            <button ref={nextRef} className="mc-btn green" onClick={finish}>
              {last ? 'Finish' : 'Next Question ▶'}
            </button>
          ) : (
            <button className="mc-btn green" disabled={quiz.selected === null || quiz.selected === ''} onClick={submit}>
              Check Answer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
