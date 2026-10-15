import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { objectiveView } from '../game/quests';
import { levelFromXp } from '../game/scoring';
import { itemDisplayName } from '../game/items';
import { iconUrl, ACHIEVEMENT_ICON } from './icons';
import { ACHIEVEMENTS } from '../content';
import { runtime } from '../engine/runtime';

function Hotbar() {
  const save = useGame((s) => s.save);
  const [nameT, setNameT] = useState(0);
  const sel = save?.selected ?? 0;
  const stack = save?.inventory[sel] ?? null;
  useEffect(() => setNameT(Date.now()), [sel, stack?.id]);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => force((x) => x + 1), 2100);
    return () => clearTimeout(t);
  }, [nameT]);
  if (!save) return null;
  const lv = levelFromXp(save.xp);
  const showName = stack && Date.now() - nameT < 2000;
  return (
    <div className="hotbar-wrap passive">
      <div className="held-name">{showName ? itemDisplayName(stack!.id) : ' '}</div>
      <div className="xp-bar" title={`Level ${lv.level}`}>
        <div className="fill" style={{ width: `${lv.progress * 100}%` }} />
        {lv.level > 0 && <div className="xp-level">{lv.level}</div>}
      </div>
      <div className="hotbar">
        {save.inventory.slice(0, 9).map((s, i) => (
          <div key={i} className={`hb-slot ${i === sel ? 'sel' : ''}`}>
            <span className="key">{i + 1}</span>
            {s && <img src={iconUrl(s.id)} alt={itemDisplayName(s.id)} />}
            {s && s.count > 1 && <span className="count">{s.count}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Objective() {
  const save = useGame((s) => s.save);
  const plan = useGame((s) => s.plan);
  const idleHint = useGame((s) => s.idleHint);
  if (!save || !plan) return null;
  const v = objectiveView(save, plan);
  return (
    <div className="objective dark-panel passive" aria-live="polite">
      <div className="zone-name">{v.zoneName}</div>
      <div className="obj-text">{v.text}</div>
      {v.detail && <div className="obj-detail">{v.detail}</div>}
      <div className="obj-steps">
        {Array.from({ length: v.stepCount }, (_, i) => (
          <span key={i} className={i < v.stepIndex ? 'done' : i === v.stepIndex ? 'cur' : ''} />
        ))}
      </div>
      {idleHint && <div className="idle-hint">{'💡'} Hint: {idleHint}</div>}
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="top-right">
      {toasts.map((t) => {
        let icon = t.icon;
        if (t.kind === 'achievement' && t.icon) icon = ACHIEVEMENT_ICON[ACHIEVEMENTS.find((a) => a.id === t.icon)?.icon ?? 'star'] ?? 'star';
        return (
          <div key={t.id} className={`toast ${t.kind}`} role="status">
            {icon && <img src={iconUrl(icon)} alt="" />}
            <div>
              <div className="tt">{t.title}</div>
              {t.text && <div className="ts">{t.text}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Banner() {
  const b = useGame((s) => s.banner);
  if (!b) return null;
  return (
    <div key={b.id} className={`banner ${b.kind}`} role="status">
      <div className="b-title">{b.title}</div>
      {b.subtitle && <div className="b-sub">{b.subtitle}</div>}
    </div>
  );
}

function Captions() {
  const captions = useGame((s) => s.captions);
  if (!captions.length) return null;
  return (
    <div className="captions">
      {captions.map((c) => (
        <div key={c.id}>{c.text}</div>
      ))}
    </div>
  );
}

function Tutorial() {
  const tutorial = useGame((s) => s.tutorial);
  const overlay = useGame((s) => s.overlay);
  const locked = useGame((s) => s.pointerLocked);
  if (!tutorial || overlay || !locked) return null;
  return (
    <div className="tutorial dark-panel">
      {tutorial === 'move' && (
        <div className="keys">
          <span><span className="kbd">W</span><span className="kbd">A</span><span className="kbd">S</span><span className="kbd">D</span> Move</span>
          <span><span className="kbd">Mouse</span> Look</span>
          <span><span className="kbd">Space</span> Jump</span>
          <span><span className="kbd">Right Click</span> Talk / Use</span>
        </div>
      )}
      {tutorial === 'mine' && (
        <div className="keys">
          <span><span className="kbd">Hold Left Click</span> on a glowing deposit to mine atoms</span>
          <span><span className="kbd">E</span> Inventory</span>
        </div>
      )}
    </div>
  );
}

function Fps() {
  const show = useGame((s) => s.settings.showFps);
  const [fps, setFps] = useState(0);
  useEffect(() => {
    if (!show) return;
    const t = setInterval(() => setFps(Math.round(runtime.fps)), 500);
    return () => clearInterval(t);
  }, [show]);
  return show ? <div className="fps">{fps} FPS</div> : null;
}

export function Hud() {
  const prompt = useGame((s) => s.prompt);
  const overlay = useGame((s) => s.overlay);
  const locked = useGame((s) => s.pointerLocked);
  const intro = useGame((s) => s.introPlaying);
  const openOverlay = useGame((s) => s.openOverlay);
  if (intro) {
    return (
      <>
        <div className="intro-bars passive" />
        <div className="skip-intro">Press <span className="kbd">Space</span> to skip</div>
        <Banner />
      </>
    );
  }
  return (
    <>
      {!overlay && <div className="crosshair" />}
      {!overlay && prompt && <div className="prompt">{prompt}</div>}
      <Objective />
      <Hotbar />
      <Toasts />
      <Banner />
      <Captions />
      <Tutorial />
      <Fps />
      {!overlay && !locked && (
        <div className="click-to-play" onClick={() => runtime.resume()}>
          <div className="dark-panel">
            <div style={{ fontSize: 'var(--fs-big)' }}>Click to play</div>
            <div style={{ color: '#aaa', fontSize: 'var(--fs-small)' }}>
              <span className="kbd">E</span> Inventory &nbsp; <span className="kbd">B</span> Discoveries &nbsp; <span className="kbd">H</span> Help &nbsp; <span className="kbd">Esc</span> Pause
            </div>
          </div>
        </div>
      )}
      {!overlay && !locked && (
        <button className="mc-btn small help-btn" onClick={() => openOverlay('help')}>
          ? Help
        </button>
      )}
    </>
  );
}
