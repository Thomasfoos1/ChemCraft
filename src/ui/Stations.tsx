import { useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { FINAL_LAB, SortingItem } from '../content';
import { RECIPE_BY_ID } from '../chem/recipes';
import { ELEMENTS } from '../chem/elements';
import { Composition, addScaled, parseFormula, prettyFormula, withCoefficient } from '../chem/formula';
import { countItem } from '../game/inventory';
import { iconUrl } from './icons';
import { runtime } from '../engine/runtime';
import { objectiveView } from '../game/quests';

function closeStation() {
  useGame.getState().closeOverlay();
  runtime.resume();
}

function StationShell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="overlay-dim" onMouseDown={(e) => e.target === e.currentTarget && closeStation()}>
      <div className="mc-panel station" role="dialog" aria-label={title}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h3>{title}</h3>
          <button className="mc-btn small" onClick={closeStation}>Close</button>
        </div>
        {sub && <div className="s-sub">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Formula Master console
export function FormulaConsole() {
  const save = useGame((s) => s.save);
  const deliver = useGame((s) => s.deliverFormula);
  const formulaHint = useGame((s) => s.formulaHint);
  const [msg, setMsg] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, string>>({});
  if (!save) return null;
  const f = save.final;
  return (
    <StationShell
      title="Formula Console — Formula Master"
      sub="Dr. Matter's first challenge: craft each compound FROM MEMORY at the advanced crafting tables, then insert it here. Only the names are shown!"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {f.formulaTargets.map((id) => {
          const r = RECIPE_BY_ID[id];
          const done = f.formulaDelivered.includes(id);
          const have = countItem(save.inventory, id) > 0;
          return (
            <div key={id} className="socket-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {done ? <img src={iconUrl(id)} alt="" style={{ width: 32, height: 32, imageRendering: 'pixelated' }} /> : <span style={{ width: 32, textAlign: 'center' }}>?</span>}
              <div style={{ flex: 1 }}>
                <div className="sc-title">{r.name}</div>
                <div style={{ fontSize: 'var(--fs-small)', color: '#c8c8c8' }}>
                  {done ? `Delivered! ${r.name} = ${prettyFormula(r.formula)}` : hints[id] ?? r.everyday}
                </div>
              </div>
              {!done && (
                <>
                  {!hints[id] && (
                    <button className="mc-btn small" onClick={() => setHints({ ...hints, [id]: formulaHint(id) })}>
                      {'💡'} Hint
                    </button>
                  )}
                  <button
                    className="mc-btn small green"
                    disabled={!have}
                    title={have ? 'Insert from your inventory' : 'Craft it first'}
                    onClick={() => {
                      const res = deliver(id);
                      setMsg(res === 'ok' ? `Correct! ${r.name} is ${prettyFormula(r.formula)}. ${r.explanation}` : 'You need to craft it first.');
                    }}
                  >
                    {have ? 'Insert' : 'Not crafted'}
                  </button>
                </>
              )}
              {done && <span style={{ color: '#6ce36a' }}>✔</span>}
            </div>
          );
        })}
      </div>
      {msg && <div className="feedback correct" style={{ marginTop: 8, padding: 8, border: '2px solid #000', background: '#d6f5d0', color: '#1a4a1a' }}>{msg}</div>}
      {f.formulaTargets.length > 0 && f.formulaTargets.every((t) => f.formulaDelivered.includes(t)) && (
        <div style={{ marginTop: 8, color: '#1a5a1a' }}>Challenge complete! The console glows green.</div>
      )}
    </StationShell>
  );
}

// ---------------------------------------------------------------- Sorting station
type Category = 'element' | 'compound' | 'mixture';
const BIN_INFO: Record<Category, { title: string; desc: string }> = {
  element: { title: 'Element', desc: 'Only one kind of atom' },
  compound: { title: 'Compound', desc: 'Two or more elements chemically combined' },
  mixture: { title: 'Mixture', desc: 'Substances mixed, not chemically combined' },
};

export function SortingStation() {
  const plan = useGame((s) => s.plan);
  const save = useGame((s) => s.save);
  const complete = useGame((s) => s.completeSorting);
  const items = useMemo<SortingItem[]>(() => {
    if (!plan) return [];
    const pool = FINAL_LAB.sorting.filter((i) => plan.sortingIncludesMixtures || i.category !== 'mixture');
    const core = pool.filter((i) => !i.extra);
    const extra = pool.filter((i) => i.extra);
    return [...core, ...extra].slice(0, plan.sortingItemCount);
  }, [plan]);
  const bins: Category[] = plan?.sortingIncludesMixtures ? ['element', 'compound', 'mixture'] : ['element', 'compound'];
  const [placed, setPlaced] = useState<Record<string, Category | undefined>>({});
  const [locked, setLocked] = useState<Record<string, boolean>>({});
  const [bad, setBad] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Category | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (!save || !plan) return null;
  const done = save.final.sortingDone;

  const place = (id: string, cat: Category | undefined) => {
    if (locked[id]) return;
    setPlaced({ ...placed, [id]: cat });
    setBad((b) => {
      const n = { ...b };
      delete n[id];
      return n;
    });
    setSelected(null);
  };
  const check = () => {
    const nextAttempts = { ...attempts };
    const nextLocked = { ...locked };
    const nextBad: Record<string, string> = {};
    const nextPlaced = { ...placed };
    for (const it of items) {
      if (locked[it.id] || !placed[it.id]) continue;
      nextAttempts[it.id] = (nextAttempts[it.id] ?? 0) + 1;
      if (placed[it.id] === it.category) nextLocked[it.id] = true;
      else {
        nextBad[it.id] = it.why;
        nextPlaced[it.id] = undefined;
      }
    }
    setAttempts(nextAttempts);
    setLocked(nextLocked);
    setBad(nextBad);
    setPlaced(nextPlaced);
    const allDone = items.every((it) => nextLocked[it.id]);
    if (allDone) {
      setMessage('Perfect sorting! Elements have one kind of atom, compounds have chemically combined elements, and mixtures are just mixed.');
      complete(items.map((it) => ({ id: it.id, attempts: nextAttempts[it.id] ?? 1, category: it.category })));
    } else if (Object.keys(nextBad).length) {
      setMessage('Some substances bounced back. Read the clue under each one and try again!');
    } else setMessage('Keep going — sort the rest!');
  };

  const card = (it: SortingItem) => (
    <div
      key={it.id}
      className={`sort-card ${selected === it.id ? 'sel' : ''} ${locked[it.id] ? 'good' : bad[it.id] ? 'bad' : ''}`}
      draggable={!locked[it.id] && !done}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', it.id)}
      onClick={() => !locked[it.id] && setSelected(selected === it.id ? null : it.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setSelected(it.id)}
      title={bad[it.id] ?? ''}
    >
      {it.label}
      {it.formula && <span style={{ color: '#1a3a8a' }}> ({prettyFormula(it.formula)})</span>}
      {locked[it.id] && ' ✔'}
      {bad[it.id] && <div style={{ fontSize: 'var(--fs-small)', color: '#8a2a1a', maxWidth: 260, lineHeight: 1 }}>{bad[it.id]}</div>}
    </div>
  );

  return (
    <StationShell
      title="Sorting Station"
      sub={`Sort each substance into the right bin. Drag a card onto a bin, or click a card and then click a bin. ${plan.sortingIncludesMixtures ? '' : '(Mixtures are turned off for this class.)'}`}
    >
      {done ? (
        <div style={{ color: '#1a5a1a' }}>The Sorting Station is complete! {'✔'}</div>
      ) : (
        <>
          <div className="section-label">Substances</div>
          <div className="sort-pool">{items.filter((it) => !placed[it.id] && !locked[it.id]).map(card)}</div>
          <div className="sort-bins">
            {bins.map((b) => (
              <div
                key={b}
                className={`sort-bin ${dragOver === b ? 'drop' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(b);
                }}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  place(e.dataTransfer.getData('text/plain'), b);
                }}
                onClick={() => selected && place(selected, b)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && selected && place(selected, b)}
                aria-label={`${BIN_INFO[b].title} bin`}
              >
                <div className="bin-title">{BIN_INFO[b].title}</div>
                <div className="bin-desc">{BIN_INFO[b].desc}</div>
                {items.filter((it) => placed[it.id] === b || (locked[it.id] && it.category === b)).map((it) => (
                  <div key={it.id} onClick={(e) => { e.stopPropagation(); place(it.id, undefined); }}>{card(it)}</div>
                ))}
              </div>
            ))}
          </div>
          <div className="page-actions">
            <button className="mc-btn green" disabled={!items.some((it) => placed[it.id] && !locked[it.id])} onClick={check}>
              Check Sorting
            </button>
          </div>
        </>
      )}
      {message && <div style={{ marginTop: 6, color: '#2a2a2a' }}>{message}</div>}
    </StationShell>
  );
}

// ---------------------------------------------------------------- Balancing station
export function BalancingStation() {
  const plan = useGame((s) => s.plan);
  const save = useGame((s) => s.save);
  const complete = useGame((s) => s.completeBalancing);
  const eq = FINAL_LAB.balancing;
  const species = [...eq.reactants, ...eq.products];
  const [coef, setCoef] = useState<number[]>(species.map(() => 1));
  const [attempts, setAttempts] = useState(0);
  const [hints, setHints] = useState(0);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'no' | 'hint'; text: string } | null>(null);
  if (!plan || !save) return null;
  const done = save.final.balancingDone;
  const side = (from: number, to: number): Composition => {
    let c: Composition = {};
    for (let i = from; i < to; i++) c = addScaled(c, parseFormula(species[i]), coef[i]);
    return c;
  };
  const left = side(0, eq.reactants.length);
  const right = side(eq.reactants.length, species.length);
  const elements = [...new Set([...Object.keys(left), ...Object.keys(right)])];
  const balanced = elements.every((e) => (left[e] ?? 0) === (right[e] ?? 0));
  const set = (i: number, d: number) => {
    if (done) return;
    const n = [...coef];
    n[i] = Math.max(1, Math.min(eq.maxCoefficient, n[i] + d));
    setCoef(n);
    setMsg(null);
  };
  const check = () => {
    const a = attempts + 1;
    setAttempts(a);
    if (balanced && coef.every((c, i) => c === eq.solution[i])) {
      setMsg({ kind: 'ok', text: `Balanced! ${eq.reactants.map((r, i) => withCoefficient(coef[i], r)).join(' + ')} → ${eq.products.map((p, i) => withCoefficient(coef[eq.reactants.length + i], p)).join(' + ')}. There are ${left.H} hydrogen atoms and ${left.O} oxygen atoms on EACH side: matter is conserved — atoms are rearranged, never created or destroyed.` });
      complete(a, hints);
    } else if (balanced) {
      setMsg({ kind: 'hint', text: 'Both sides match — nice! But chemists use the SMALLEST whole numbers. Can you make every coefficient smaller?' });
    } else {
      const off = elements.find((e) => (left[e] ?? 0) !== (right[e] ?? 0))!;
      setMsg({ kind: 'no', text: `Not balanced yet: there are ${left[off] ?? 0} ${ELEMENTS[off].name.toLowerCase()} atoms on the left but ${right[off] ?? 0} on the right.` });
    }
  };
  const hint = () => {
    setHints(hints + 1);
    const tips = [
      'Start with oxygen. O₂ has 2 oxygen atoms, but one H₂O has only 1. How many H₂O molecules would you need?',
      'With 2 H₂O on the right there are 4 hydrogen atoms. How many H₂ molecules give 4 hydrogen atoms?',
    ];
    setMsg({ kind: 'hint', text: tips[Math.min(hints, tips.length - 1)] });
  };
  const atomRow = (comp: Composition, e: string, other: Composition) => {
    const n = comp[e] ?? 0;
    const ok = n === (other[e] ?? 0);
    return (
      <div className="row" key={e}>
        <span className={ok ? 'ok' : 'no'} style={{ minWidth: 70 }}>{e}: {n} {ok ? '✔' : '✖'}</span>
        {Array.from({ length: Math.min(n, 12) }, (_, i) => <img key={i} src={iconUrl(e)} alt="" />)}
      </div>
    );
  };
  return (
    <StationShell
      title={`Balancing Station${plan.balancingRequired ? '' : ' (Bonus Challenge)'}`}
      sub="The reactor's equation is unbalanced! Use + and − to change the coefficients (the big numbers in front). You may NOT change the small subscripts — that would change the substances."
    >
      <div className="equation">
        {species.map((sp, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {i === eq.reactants.length && <span>→</span>}
            {i > 0 && i !== eq.reactants.length && <span>+</span>}
            <span className="coef">
              <button className="mc-btn small" disabled={done} onClick={() => set(i, 1)} aria-label={`Increase ${sp}`}>+</button>
              <span className="cv">{coef[i]}</span>
              <button className="mc-btn small" disabled={done} onClick={() => set(i, -1)} aria-label={`Decrease ${sp}`}>−</button>
            </span>
            <span>{prettyFormula(sp)}</span>
          </span>
        ))}
      </div>
      <div className="atom-count">
        <div className="atom-side">
          <div>Reactants (left side)</div>
          {elements.map((e) => atomRow(left, e, right))}
        </div>
        <div className="atom-side">
          <div>Products (right side)</div>
          {elements.map((e) => atomRow(right, e, left))}
        </div>
      </div>
      {msg && (
        <div className="feedback" style={{ marginTop: 8, padding: 8, border: '2px solid #000', background: msg.kind === 'ok' ? '#d6f5d0' : msg.kind === 'no' ? '#fbe8c8' : '#fff7d0', color: '#2a2a2a' }}>
          {msg.text}
        </div>
      )}
      <div className="page-actions">
        {!done && <button className="mc-btn small" onClick={hint}>{'💡'} Hint</button>}
        {!done && <button className="mc-btn green" onClick={check}>Check Balance</button>}
        {done && <span style={{ color: '#1a5a1a' }}>Equation balanced! {'✔'}</span>}
      </div>
    </StationShell>
  );
}

// ---------------------------------------------------------------- Reactor sockets
export function ReactorPanel() {
  const save = useGame((s) => s.save);
  const plan = useGame((s) => s.plan);
  const focus = useGame((s) => s.stationSocket);
  const insert = useGame((s) => s.insertSocket);
  const [msg, setMsg] = useState<Record<string, string>>({});
  if (!save || !plan) return null;
  const substances = save.inventory
    .filter((s): s is NonNullable<typeof s> => !!s && !!RECIPE_BY_ID[s.id])
    .reduce<string[]>((acc, s) => (acc.includes(s.id) ? acc : [...acc, s.id]), []);
  const allPowered = plan.reactorSockets.every((k) => save.final.sockets[k]);
  const view = objectiveView(save, plan);
  return (
    <StationShell
      title="Central Reactor"
      sub="Each socket needs one compound. Read the clue, then insert the matching substance from your inventory. Craft more at the advanced crafting tables if you need them."
    >
      <div className="socket-grid">
        {FINAL_LAB.sockets.map((sk) => {
          const active = plan.reactorSockets.includes(sk.id);
          const on = !!save.final.sockets[sk.id];
          return (
            <div key={sk.id} className={`socket-card ${on ? 'on' : ''} ${focus === sk.id ? 'focus' : ''}`}>
              <div className="sc-title">Socket {sk.id} — {sk.label}</div>
              {!active ? (
                <div className="sc-clue" style={{ color: '#888' }}>Offline — not needed today.</div>
              ) : on ? (
                <div className="sc-clue">Powered by {RECIPE_BY_ID[sk.recipe].name} ({prettyFormula(RECIPE_BY_ID[sk.recipe].formula)}) {'✔'}</div>
              ) : (
                <>
                  <div className="sc-clue">Clue: {sk.clue}</div>
                  <div className="socket-items">
                    {substances.length === 0 && <span style={{ color: '#aaa', fontSize: 'var(--fs-small)' }}>You have no compounds. Craft one first!</span>}
                    {substances.map((id) => (
                      <button
                        key={id}
                        className="mc-btn small"
                        title={RECIPE_BY_ID[id].name}
                        onClick={() => {
                          const r = insert(sk.id, id);
                          setMsg({ ...msg, [sk.id]: r === 'wrong' ? `The socket rejects ${RECIPE_BY_ID[id].name}. Re-read the clue!` : r === 'ok' ? 'Powered!' : '' });
                        }}
                      >
                        <img src={iconUrl(id)} alt="" /> {RECIPE_BY_ID[id].name} ×{countItem(save.inventory, id)}
                      </button>
                    ))}
                  </div>
                  {msg[sk.id] && <div style={{ color: '#ffb0a0', marginTop: 4 }}>{msg[sk.id]}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
      {allPowered && !save.flags['reactor_on'] && (
        <div style={{ marginTop: 8, color: '#1a4a5a' }}>
          All sockets are powered!{' '}
          {view.zoneId !== 5
            ? `The reactor can't start until you finish ${view.zoneName}: ${view.text}.`
            : view.step && view.step.station !== 'reactor'
              ? `Finish the remaining challenge to start the reactor: ${view.text}.`
              : 'Stand back...'}
        </div>
      )}
      {save.flags['reactor_on'] && <div style={{ marginTop: 8, color: '#1a5a1a' }}>The reactor is running and the vault is open!</div>}
    </StationShell>
  );
}
