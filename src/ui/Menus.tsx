import { useMemo, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { TOPICS } from '../content';
import { GRADE_PRESETS, TeacherConfig, defaultTeacherConfig, parseTeacherConfig, derivePlan } from '../game/config';
import { Settings } from '../game/settings';
import { runtime } from '../engine/runtime';
import { audio } from '../engine/audio';
import { RECIPES } from '../chem/recipes';
import { prettyFormula } from '../chem/formula';

const SPLASHES = [
  'H₂O = 3 atoms!',
  'Salt melts ice!',
  'Mind the lava!',
  'Now with 100% more atoms!',
  'CO₂ makes the fizz!',
  'Matter is conserved!',
  'Also try balancing!',
  'Elements, assemble!',
];

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={o.v} className={`mc-btn small ${value === o.v ? 'on' : ''}`} role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MainMenu() {
  const setPage = useGame((s) => s.setMenuPage);
  const hasSave = useGame((s) => s.hasSave)();
  const newGame = useGame((s) => s.newGame);
  const cont = useGame((s) => s.continueGame);
  const [confirm, setConfirm] = useState(false);
  const splash = useMemo(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)], []);
  const start = () => {
    audio.ensure();
    audio.startMusic();
    if (hasSave && !confirm) return setConfirm(true);
    newGame();
  };
  return (
    <div className="menu-root">
      <div className="logo">
        <div className="l1">CHEMCRAFT</div>
        <div className="l2">THE ELEMENTAL DUNGEON</div>
        <div className="splash">{splash}</div>
      </div>
      {confirm ? (
        <div className="dark-panel" style={{ textAlign: 'center', maxWidth: 460 }}>
          <div style={{ marginBottom: 10 }}>Start a new adventure? Your saved progress on this computer will be replaced.</div>
          <div className="menu-buttons" style={{ margin: '0 auto' }}>
            <button className="mc-btn" autoFocus onClick={() => newGame()}>Yes, start fresh</button>
            <button className="mc-btn" onClick={() => setConfirm(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="menu-buttons">
          <button className="mc-btn" autoFocus onClick={start}>Start Adventure</button>
          <button
            className="mc-btn"
            disabled={!hasSave}
            onClick={() => {
              audio.ensure();
              audio.startMusic();
              cont();
            }}
          >
            Continue Adventure
          </button>
          <button className="mc-btn" onClick={() => setPage('teacher')}>Teacher Settings</button>
          <div className="row">
            <button className="mc-btn" onClick={() => setPage('howto')}>How to Play</button>
            <button className="mc-btn" onClick={() => setPage('settings')}>Audio / Graphics</button>
          </div>
        </div>
      )}
      <div className="menu-foot">
        <span>ChemCraft v1.0 — an original educational game</span>
        <span>Not affiliated with Mojang or Microsoft</span>
      </div>
    </div>
  );
}

export function TeacherSettingsPage() {
  const teacher = useGame((s) => s.teacher);
  const update = useGame((s) => s.updateTeacher);
  const setPage = useGame((s) => s.setMenuPage);
  const [cfg, setCfg] = useState<TeacherConfig>(teacher);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const plan = derivePlan(cfg);
  const set = (p: Partial<TeacherConfig>) => setCfg({ ...cfg, ...p });
  const save = () => {
    update(cfg);
    setNote('Saved! New adventures on this computer will use these settings.');
  };
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chemcraft-teacher-config.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const importJson = (file: File) => {
    file.text().then((t) => {
      try {
        setCfg(parseTeacherConfig(JSON.parse(t)));
        setNote('Configuration loaded. Click Save to apply it.');
      } catch {
        setNote('That file is not a valid ChemCraft configuration.');
      }
    });
  };
  const story = RECIPES.filter((r) => r.story).map((r) => prettyFormula(r.formula)).join(', ');
  return (
    <div className="overlay-dim">
      <div className="mc-panel page-panel">
        <h2>Teacher Settings</h2>
        <div className="form-row">
          <div>
            <label>Session length</label>
            <div className="desc">
              {cfg.sessionLength === 'quick' && 'About 30–40 min: Zones 1–3, the bridge in Zone 4 is pre-built, shorter final lab, 1 question per zone.'}
              {cfg.sessionLength === 'standard' && 'About 45–60 min: all five zones, 3 questions per zone.'}
              {cfg.sessionLength === 'full' && 'About 70–90 min: all zones, 5 questions per zone, extra sorting items, review quiz.'}
            </div>
          </div>
          <Seg value={cfg.sessionLength} onChange={(v) => set({ sessionLength: v })} options={[{ v: 'quick', label: 'Quick Review' }, { v: 'standard', label: 'Standard' }, { v: 'full', label: 'Full Dungeon' }]} />
        </div>
        <div className="form-row">
          <div>
            <label>Grade level</label>
            <div className="desc">7th grade turns balancing equations off by default; 8th grade turns it on.</div>
          </div>
          <Seg
            value={cfg.gradeLevel}
            onChange={(v) => set({ gradeLevel: v, topics: v === 'custom' ? cfg.topics : { ...GRADE_PRESETS[v] } })}
            options={[{ v: '7', label: '7th Grade' }, { v: '8', label: '8th Grade' }, { v: 'custom', label: 'Custom' }]}
          />
        </div>
        <div className="form-row">
          <div>
            <label>Difficulty</label>
            <div className="desc">
              {cfg.difficulty === 'easy' && 'More hints, recipes visible in the recipe book, answers explained after 2 tries.'}
              {cfg.difficulty === 'normal' && 'Moderate hints; the current goal recipe is shown; answers explained after 3 tries.'}
              {cfg.difficulty === 'challenge' && 'Fewer hints, recipes only after discovery, an extra harder question per zone.'}
            </div>
          </div>
          <Seg value={cfg.difficulty} onChange={(v) => set({ difficulty: v })} options={[{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'challenge', label: 'Challenge' }]} />
        </div>
        <div className="form-row" style={{ display: 'block' }}>
          <label>Topics included in questions and challenges</label>
          <div className="checks" style={{ marginTop: 6 }}>
            {TOPICS.map((t) => (
              <label key={t.key}>
                <input
                  type="checkbox"
                  checked={cfg.topics[t.key]}
                  onChange={(e) => set({ gradeLevel: 'custom', topics: { ...cfg.topics, [t.key]: e.target.checked } })}
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>
        <div className="form-row">
          <label>
            <input type="checkbox" checked={cfg.bonusRecipes} onChange={(e) => set({ bonusRecipes: e.target.checked })} /> Show bonus recipes (O₂, CH₄, NH₃, rust, glucose, baking soda…)
          </label>
        </div>
        <div className="form-row">
          <label>
            <input type="checkbox" checked={cfg.advancedExplanations} onChange={(e) => set({ advancedExplanations: e.target.checked })} /> Offer advanced explanations (how real reactions differ from the modeler)
          </label>
        </div>
        <div className="form-row">
          <div>
            <label>Navigation hint after inactivity</label>
            <div className="desc">Seconds without progress before a hint and guide trail appear (0 = off).</div>
          </div>
          <input type="range" min={0} max={300} step={15} value={cfg.idleHintSeconds} onChange={(e) => set({ idleHintSeconds: Number(e.target.value) })} aria-label="Idle hint seconds" />
          <span>{cfg.idleHintSeconds}s</span>
        </div>
        <div className="desc" style={{ marginTop: 8, color: '#3a3a3a' }}>
          Summary: {plan.questionsPerZone} question(s) per zone · Formula Master asks for {plan.formulaMasterCount} compound(s) · {plan.reactorSockets.length} reactor sockets · balancing {plan.balancingRequired ? 'required' : 'optional bonus'} · story compounds: {story}.
          No accounts, no internet, and no student data leaves this computer.
        </div>
        {note && <div style={{ marginTop: 6, color: '#1a4a1a' }}>{note}</div>}
        <div className="page-actions">
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          <button className="mc-btn small" onClick={() => fileRef.current?.click()}>Import JSON</button>
          <button className="mc-btn small" onClick={exportJson}>Export JSON</button>
          <button className="mc-btn small" onClick={() => setCfg(defaultTeacherConfig())}>Reset Defaults</button>
          <button className="mc-btn small green" onClick={save}>Save</button>
          <button className="mc-btn small" onClick={() => setPage('main')}>Back</button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({ onBack }: { onBack: () => void }) {
  const s = useGame((st) => st.settings);
  const update = useGame((st) => st.updateSettings);
  const set = (p: Partial<Settings>) => {
    update(p);
    const n = { ...s, ...p };
    audio.setVolumes(n.masterVolume, n.musicVolume, n.sfxVolume, n.muted);
  };
  const slider = (label: string, key: keyof Settings, min: number, max: number, step: number, fmt: (v: number) => string) => (
    <div className="form-row">
      <label>{label}</label>
      <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input type="range" min={min} max={max} step={step} value={s[key] as number} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<Settings>)} aria-label={label} />
        <span style={{ minWidth: 60, color: '#2a2a2a' }}>{fmt(s[key] as number)}</span>
      </span>
    </div>
  );
  const check = (label: string, key: keyof Settings, desc?: string) => (
    <div className="form-row">
      <label>
        <input type="checkbox" checked={s[key] as boolean} onChange={(e) => set({ [key]: e.target.checked } as Partial<Settings>)} /> {label}
      </label>
      {desc && <span className="desc">{desc}</span>}
    </div>
  );
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="overlay-dim">
      <div className="mc-panel page-panel">
        <h2>Audio / Graphics / Accessibility</h2>
        <h3>Audio</h3>
        {check('Mute all sound', 'muted')}
        {slider('Master volume', 'masterVolume', 0, 1, 0.05, pct)}
        {slider('Music volume', 'musicVolume', 0, 1, 0.05, pct)}
        {slider('Sound effects volume', 'sfxVolume', 0, 1, 0.05, pct)}
        <h3>Graphics</h3>
        <div className="form-row">
          <div>
            <label>Graphics quality</label>
            <div className="desc">Low is best for older school laptops (30+ FPS).</div>
          </div>
          <Seg value={s.graphics} onChange={(v) => set({ graphics: v })} options={[{ v: 'low', label: 'Low' }, { v: 'medium', label: 'Medium' }, { v: 'high', label: 'High' }]} />
        </div>
        {slider('Brightness', 'brightness', 0, 1, 0.05, pct)}
        {slider('Field of view', 'fov', 55, 100, 1, (v) => `${v}°`)}
        {check('Show FPS counter', 'showFps')}
        <h3>Controls</h3>
        {slider('Mouse sensitivity', 'mouseSensitivity', 0.2, 3, 0.1, (v) => v.toFixed(1))}
        {check('Invert mouse Y', 'invertY')}
        {check('Auto-jump up single blocks', 'autoJump')}
        <h3>Accessibility</h3>
        {slider('Interface scale', 'uiScale', 0.75, 1.6, 0.05, pct)}
        {check('High-contrast text and panels', 'highContrast')}
        {check('Readable font (instead of pixel font)', 'readableFont')}
        {check('Reduced motion (no view bobbing, sprint zoom or bouncing)', 'reducedMotion')}
        {check('Typewriter dialogue text', 'typewriter', 'Off shows dialogue instantly')}
        {check('Sound captions', 'captions', 'Shows text for important sounds')}
        {check('Navigation assistance', 'navAssist', 'Shows a glowing trail to the current objective')}
        <div className="page-actions">
          <button className="mc-btn small green" onClick={onBack}>Done</button>
        </div>
      </div>
    </div>
  );
}

export function ControlsTable() {
  const rows: [string, string][] = [
    ['W A S D / Arrow keys', 'Move'],
    ['Mouse', 'Look around'],
    ['Space', 'Jump (and swim up)'],
    ['Shift', 'Sprint'],
    ['Hold Left Click', 'Mine element deposits'],
    ['Right Click', 'Talk to scientists, open crafting tables, use machines'],
    ['E', 'Open / close inventory'],
    ['1–9 or Mouse Wheel', 'Select hotbar slot'],
    ['B', 'Discoveries book'],
    ['H', 'Help'],
    ['Esc', 'Pause and release the mouse'],
    ['Shift + Click (inventory)', 'Move a whole stack'],
    ['Right Click (inventory)', 'Pick up half / place one item'],
  ];
  return (
    <table className="controls-table">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td><span className="kbd">{k}</span></td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HowToPlayPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="overlay-dim">
      <div className="mc-panel page-panel">
        <h2>How to Play</h2>
        <ol className="how-steps">
          <li>Talk to the scientist in each zone (right click) to learn about the problem.</li>
          <li>Find glowing element deposits and <b>hold left click</b> to mine atoms.</li>
          <li>Right click a <b>crafting table</b>. Drag atoms into the 3×3 grid. Only the number and kind of atoms matter!</li>
          <li>Click the output to craft the substance. Read what you made — it is in your Discoveries book (B).</li>
          <li>Use your substance on the zone's machine to change the world and open the way forward.</li>
          <li>Answer the scientist's questions. Wrong answers give hints — you can never get stuck!</li>
        </ol>
        <p style={{ color: '#3a3a3a' }}>
          <b>Science note:</b> the crafting table is a <i>molecule modeler</i>. It shows which atoms a substance contains. Real chemicals are made by reactions, not by snapping single atoms together.
        </p>
        <ControlsTable />
        <div className="page-actions">
          <button className="mc-btn small green" onClick={onBack}>Back</button>
        </div>
      </div>
    </div>
  );
}

export function HelpOverlay() {
  const close = useGame((s) => s.closeOverlay);
  return (
    <div className="overlay-dim">
      <div className="mc-panel page-panel">
        <h2>Help — Controls</h2>
        <ControlsTable />
        <p style={{ color: '#3a3a3a' }}>
          Stuck? Check the objective in the top-left corner and follow the yellow diamond. Talk to the zone's scientist for a reminder,
          or turn on <b>Navigation assistance</b> in Settings for a glowing trail.
        </p>
        <div className="page-actions">
          <button className="mc-btn small green" autoFocus onClick={() => { close(); runtime.resume(); }}>Back to Game</button>
        </div>
      </div>
    </div>
  );
}

export function PauseMenu() {
  const close = useGame((s) => s.closeOverlay);
  const openOverlay = useGame((s) => s.openOverlay);
  const quit = useGame((s) => s.quitToMenu);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const resume = () => {
    close();
    runtime.resume();
  };
  return (
    <div className="overlay-dim">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <div className="shadow-text" style={{ fontFamily: 'var(--title-font)', fontSize: 'calc(20px * var(--ui-scale))', marginBottom: 10 }}>Game Paused</div>
        <div className="menu-buttons">
          <button className="mc-btn" autoFocus onClick={resume}>Back to Game</button>
          <div className="row">
            <button className="mc-btn" onClick={() => openOverlay('help')}>Help / Controls</button>
            <button className="mc-btn" onClick={() => openOverlay('book')}>Discoveries</button>
          </div>
          <div className="row">
            <button className="mc-btn" onClick={() => openOverlay('settings')}>Settings</button>
            <button className="mc-btn" onClick={() => { runtime.unstick(); resume(); }}>Unstick Me</button>
          </div>
          {!confirmRestart ? (
            <button className="mc-btn" onClick={() => setConfirmRestart(true)}>New Game…</button>
          ) : (
            <div className="row">
              <button className="mc-btn" onClick={() => useGame.getState().newGame()}>Yes, restart</button>
              <button className="mc-btn" onClick={() => setConfirmRestart(false)}>Cancel</button>
            </div>
          )}
          <button className="mc-btn" onClick={quit}>Save & Quit to Title</button>
        </div>
        <div className="shadow-text" style={{ fontSize: 'var(--fs-small)', color: '#ccc' }}>Progress is saved automatically on this computer.</div>
      </div>
    </div>
  );
}
