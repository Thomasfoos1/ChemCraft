import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { NPCS } from '../content';
import { npcPortraitUrl } from '../engine/entities/npcModel';
import { runtime } from '../engine/runtime';

/** NPC dialogue with an optional typewriter effect; Space / click reveals text immediately. */
export function DialogueBox() {
  const d = useGame((s) => s.dialogue);
  const typewriter = useGame((s) => s.settings.typewriter && !s.settings.reducedMotion);
  const next = useGame((s) => s.dialogueNext);
  const [shown, setShown] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const line = d ? d.lines[d.index] ?? '' : '';

  useEffect(() => {
    setShown(typewriter ? 0 : line.length);
  }, [line, typewriter]);
  useEffect(() => {
    if (shown >= line.length) return;
    const t = setTimeout(() => setShown((n) => Math.min(line.length, n + 2)), 18);
    return () => clearTimeout(t);
  }, [shown, line]);
  useEffect(() => {
    btn.current?.focus();
  }, [d?.index]);

  const advance = () => {
    if (shown < line.length) setShown(line.length);
    else {
      const last = !d || d.index >= d.lines.length - 1;
      next();
      if (last && !useGame.getState().overlay) runtime.resume();
    }
  };
  useEffect(() => {
    const f = () => advance();
    window.addEventListener('chemcraft:dialogue-advance', f);
    return () => window.removeEventListener('chemcraft:dialogue-advance', f);
  });

  if (!d) return null;
  const npc = NPCS[d.npcId];
  const last = d.index >= d.lines.length - 1;
  return (
    <div className="dialogue dark-panel" role="dialog" aria-label={`${npc?.name} says`} onClick={advance}>
      <div className="portrait">{npc && <img src={npcPortraitUrl(npc)} alt={npc.name} />}</div>
      <div className="d-body">
        <div>
          <span className="d-name">{npc?.name}</span>
          <span className="d-title">{npc?.title}</span>
        </div>
        <div className="d-text" aria-live="polite">
          {line.slice(0, shown)}
          <span style={{ opacity: 0 }}>{line.slice(shown)}</span>
        </div>
        <div className="d-foot">
          <span>
            {d.index + 1} / {d.lines.length} · <span className="kbd">Space</span> or click to continue
          </span>
          <button
            ref={btn}
            className="mc-btn small"
            onClick={(e) => {
              e.stopPropagation();
              advance();
            }}
          >
            {shown < line.length ? 'Show all' : last ? 'Done ▶' : 'Continue ▶'}
          </button>
        </div>
      </div>
    </div>
  );
}
