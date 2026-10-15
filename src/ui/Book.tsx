import { useState } from 'react';
import { useGame } from '../game/store';
import { RECIPES, atomsLabel, kindLabel, ratioLabel } from '../chem/recipes';
import { ELEMENTS, ELEMENT_SYMBOLS } from '../chem/elements';
import { prettyFormula, distinctElements } from '../chem/formula';
import { iconUrl } from './icons';
import { recipeVisible } from './Inventory';
import { currentTargetRecipe } from '../game/quests';
import { runtime } from '../engine/runtime';

/** Minecraft-style recipe/discovery book: substances and elements, locked entries show "???". */
export function DiscoveryBook() {
  const save = useGame((s) => s.save);
  const plan = useGame((s) => s.plan);
  const close = useGame((s) => s.closeOverlay);
  const [tab, setTab] = useState<'substances' | 'elements'>('substances');
  const [sel, setSel] = useState<string | null>(null);
  if (!save || !plan) return null;
  const target = currentTargetRecipe(save, plan);
  const list = RECIPES.filter((r) => recipeVisible(r, save.recipesDiscovered, plan, target) !== 'hidden');
  const selected = sel ?? (tab === 'substances' ? save.recipesDiscovered[0] ?? null : save.elementsDiscovered[0] ?? null);
  const r = list.find((x) => x.id === selected);
  const el = ELEMENTS[selected ?? ''];
  const known = r ? save.recipesDiscovered.includes(r.id) : false;
  const doClose = () => {
    close();
    runtime.resume();
  };
  return (
    <div className="overlay-dim" onMouseDown={(e) => e.target === e.currentTarget && doClose()}>
      <div className="book" role="dialog" aria-label="Discoveries book">
        <div className="page">
          <div className="tabs">
            <span className={`tab ${tab === 'substances' ? 'on' : ''}`} onClick={() => { setTab('substances'); setSel(null); }} role="tab" tabIndex={0}>
              Substances ({save.recipesDiscovered.length}/{list.length})
            </span>
            <span className={`tab ${tab === 'elements' ? 'on' : ''}`} onClick={() => { setTab('elements'); setSel(null); }} role="tab" tabIndex={0}>
              Elements ({save.elementsDiscovered.length}/{ELEMENT_SYMBOLS.length})
            </span>
          </div>
          {tab === 'substances' &&
            list.map((x) => {
              const k = save.recipesDiscovered.includes(x.id);
              return (
                <div key={x.id} className={`entry ${selected === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)} role="button" tabIndex={0}>
                  {k ? <img src={iconUrl(x.id)} alt="" /> : <span style={{ width: 28, textAlign: 'center' }}>?</span>}
                  <span>{k ? `${x.name} (${prettyFormula(x.formula)})` : '??? — not yet discovered'}</span>
                  {!x.story && <span title="Bonus" style={{ marginLeft: 'auto', color: '#b8860b' }}>★</span>}
                </div>
              );
            })}
          {tab === 'elements' &&
            ELEMENT_SYMBOLS.map((sym) => {
              const k = save.elementsDiscovered.includes(sym);
              return (
                <div key={sym} className={`entry ${selected === sym ? 'on' : ''}`} onClick={() => setSel(sym)} role="button" tabIndex={0}>
                  {k ? <img src={iconUrl(sym)} alt="" /> : <span style={{ width: 28, textAlign: 'center' }}>?</span>}
                  <span>{k ? `${ELEMENTS[sym].name} (${sym})` : '??? — not yet found'}</span>
                </div>
              );
            })}
        </div>
        <div className="page">
          {tab === 'substances' && r && (
            known || recipeVisible(r, save.recipesDiscovered, plan, target) === 'full' ? (
              <>
                <h3>{r.name}{known ? '' : ' (not crafted yet)'}</h3>
                <div className="big-formula">{prettyFormula(r.formula)}</div>
                <div className="kv"><b>Type:</b> {kindLabel(r)} — {r.classification === 'element' ? 'an element (one kind of atom)' : 'a compound (two or more elements chemically combined)'}</div>
                <div className="kv"><b>Elements involved:</b> {Object.keys(r.composition).map((e) => `${ELEMENTS[e].name} (${e})`).join(', ')} — {distinctElements(r.composition)} element{distinctElements(r.composition) > 1 ? 's' : ''}</div>
                <div className="kv"><b>Atomic ratio:</b> {ratioLabel(r)}</div>
                <div className="kv"><b>{atomsLabel(r)}</b></div>
                <div className="atoms">
                  {Object.entries(r.composition).flatMap(([e, n]) => Array.from({ length: Math.min(n, 12) }, (_, i) => <img key={`${e}${i}`} src={iconUrl(e)} alt={e} title={ELEMENTS[e].name} />))}
                </div>
                <div className="kv">{r.explanation}</div>
                <div className="kv"><b>Real world:</b> {r.everyday}</div>
                <div className="kv"><b>Fun fact:</b> {r.fact}</div>
                {plan.advancedExplanations && (
                  <div className="advanced">
                    <b>Advanced note:</b> The crafting table models <i>what a substance contains</i>. In real chemistry, substances
                    are made by chemical reactions between other substances, not by placing single atoms together.
                    {r.kind === 'ionic' && ' This is an ionic compound: it forms a crystal of ions, so its formula shows the ratio of ions in one formula unit rather than a separate molecule.'}
                  </div>
                )}
              </>
            ) : (
              <>
                <h3>??? — Undiscovered</h3>
                <div className="kv">Craft this substance to unlock its page.</div>
                {target === r.id && <div className="kv"><b>Your current goal:</b> {r.name}</div>}
              </>
            )
          )}
          {tab === 'substances' && !r && <div className="kv">Craft substances at a crafting table to fill this book!</div>}
          {tab === 'elements' && el && save.elementsDiscovered.includes(el.symbol) && (
            <>
              <h3>{el.name}</h3>
              <div className="big-formula">{el.symbol}</div>
              <div className="kv"><b>Atomic number:</b> {el.atomicNumber} (every {el.name.toLowerCase()} atom has {el.atomicNumber} proton{el.atomicNumber > 1 ? 's' : ''})</div>
              <div className="kv"><b>Type:</b> {el.category === 'metal' ? 'Metal' : 'Nonmetal'}</div>
              <div className="kv">{el.fact}</div>
              <div className="kv"><b>Found in:</b> {RECIPES.filter((x) => x.composition[el.symbol] && save.recipesDiscovered.includes(x.id)).map((x) => x.name).join(', ') || 'craft something with it to find out!'}</div>
            </>
          )}
          {tab === 'elements' && (!el || !save.elementsDiscovered.includes(el.symbol)) && <div className="kv">Mine element deposits to discover elements.</div>}
          <div style={{ marginTop: 16 }}>
            <button className="mc-btn small" onClick={doClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
