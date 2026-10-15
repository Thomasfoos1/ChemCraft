import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../game/store';
import { Slot, ItemIcon, useTooltip } from './Slot';
import { runtime } from '../engine/runtime';
import { RECIPES, Recipe, craftingHint, compositionFromGrid, matchRecipe, atomsLabel, kindLabel, getRecipe, recipeRequirement } from '../chem/recipes';
import { prettyFormula, totalAtoms } from '../chem/formula';
import { ELEMENTS } from '../chem/elements';
import { currentTargetRecipe } from '../game/quests';
import { countItem } from '../game/inventory';

function close() {
  useGame.getState().closeOverlay();
  runtime.resume();
}

/** Swap the hovered inventory slot with a hotbar slot when a number key is pressed (keyboard support). */
function useHotbarSwap() {
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!/^Digit[1-9]$/.test(e.code)) return;
      const hover = useTooltip.getState().hover;
      const s = useGame.getState();
      if (!hover || hover.area !== 'inv' || !s.save) return;
      const target = parseInt(e.code.slice(5), 10) - 1;
      if (target === hover.index) return;
      // pick up, drop on target, put remainder back
      s.slotClick('inv', hover.index, 0, false);
      s.slotClick('inv', target, 0, false);
      if (useGame.getState().cursor) s.slotClick('inv', hover.index, 0, false);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);
}

export function InventoryGrid() {
  const save = useGame((s) => s.save);
  const trash = useGame((s) => s.trashCursor);
  const cursor = useGame((s) => s.cursor);
  useHotbarSwap();
  if (!save) return null;
  return (
    <div>
      <div className="section-label">Inventory</div>
      <div className="grid grid-9">
        {save.inventory.slice(9).map((s, i) => (
          <Slot key={i + 9} stack={s} area="inv" index={i + 9} />
        ))}
      </div>
      <div style={{ height: 8 }} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div className="grid grid-9">
          {save.inventory.slice(0, 9).map((s, i) => (
            <Slot key={i} stack={s} area="inv" index={i} highlight={i === save.selected} />
          ))}
        </div>
        <div
          className="slot trash"
          title="Trash: drop an item here to destroy it"
          role="button"
          aria-label="Trash slot"
          onMouseDown={() => trash()}
          onMouseUp={() => cursor && trash()}
        />
      </div>
    </div>
  );
}

export function InventoryScreen() {
  const openOverlay = useGame((s) => s.openOverlay);
  const save = useGame((s) => s.save);
  if (!save) return null;
  const atoms = Object.keys(ELEMENTS).filter((e) => save.elementsDiscovered.includes(e));
  return (
    <div className="overlay-dim light" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="mc-panel container-panel" onContextMenu={(e) => e.preventDefault()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h3>Scientist's Inventory</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="mc-btn small" onClick={() => openOverlay('book')}>
              {'📖'} Discoveries (B)
            </button>
            <button className="mc-btn small" onClick={close}>Close (E)</button>
          </div>
        </div>
        <div className="section-label" style={{ fontSize: 'var(--fs-small)' }}>
          Elements discovered: {atoms.length ? atoms.join(', ') : 'none yet'} &nbsp;·&nbsp; Hover an item to inspect it. Shift-click moves stacks. Drag to the red slot to trash.
        </div>
        <InventoryGrid />
      </div>
    </div>
  );
}

/** Whether the recipe book may show this recipe's ingredients. */
export function recipeVisible(r: Recipe, discovered: string[], plan: { recipeBook: string; bonusRecipes: boolean }, current: string | null): 'full' | 'name' | 'hidden' {
  if (discovered.includes(r.id)) return 'full';
  if (!r.story && !plan.bonusRecipes) return 'hidden';
  if (plan.recipeBook === 'all-story' && r.story) return 'full';
  if (plan.recipeBook !== 'known-only' && current === r.id) return 'full';
  if (current === r.id) return 'name';
  return r.story ? 'name' : 'name';
}

function RecipeBookPanel({ onPick }: { onPick: (id: string) => void }) {
  const save = useGame((s) => s.save)!;
  const plan = useGame((s) => s.plan)!;
  const target = currentTargetRecipe(save, plan);
  const finalChallenge = target && save.final.formulaTargets.includes(target);
  const list = RECIPES.filter((r) => recipeVisible(r, save.recipesDiscovered, plan, target) !== 'hidden');
  return (
    <div className="mc-panel recipe-book">
      <h3>{'📖'} Recipe Book</h3>
      <div style={{ fontSize: 'var(--fs-small)', color: '#4a4a4a', marginBottom: 6, lineHeight: 1 }}>
        Click a known recipe to fill the grid from your inventory.
      </div>
      {list.map((r) => {
        let vis = recipeVisible(r, save.recipesDiscovered, plan, target);
        if (finalChallenge && r.id === target && !save.recipesDiscovered.includes(r.id)) vis = 'name';
        const known = vis === 'full';
        return (
          <div key={r.id} className={`recipe-row ${known ? '' : 'locked'}`} onClick={() => known && onPick(r.id)} title={known ? recipeRequirement(r) : 'Not discovered yet'}>
            {save.recipesDiscovered.includes(r.id) ? <ItemIcon id={r.id} /> : <div style={{ width: 28, textAlign: 'center' }}>?</div>}
            <div>
              <div className="rn">{r.name}{r.story ? '' : ' ★'}</div>
              <div className="rf">{known ? `${prettyFormula(r.formula)} — ${recipeRequirement(r)}` : '???'}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CraftingScreen() {
  const save = useGame((s) => s.save);
  const plan = useGame((s) => s.plan);
  const craftTake = useGame((s) => s.craftTake);
  const craftResult = useGame((s) => s.craftResult);
  const shakeT = useGame((s) => s.craftShake);
  const fill = useGame((s) => s.fillGridWithRecipe);
  const [showBook, setShowBook] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (!shakeT) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 400);
    return () => clearTimeout(t);
  }, [shakeT]);
  const grid = save?.craftGrid ?? [];
  const recipe = useMemo(() => matchRecipe(grid), [grid]);
  if (!save || !plan) return null;
  const { composition } = compositionFromGrid(grid);
  const placed = totalAtoms(composition);
  const target = currentTargetRecipe(save, plan);
  const targetRecipe = target ? getRecipe(target) ?? null : null;
  const hint = recipe ? null : craftingHint(grid, targetRecipe && !save.final.formulaTargets.includes(targetRecipe.id) ? targetRecipe : null);
  const res = craftResult ? getRecipe(craftResult.recipeId) : null;
  const firstTime = !save.flags['seen:modeler'];
  return (
    <div className="overlay-dim light" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }} onContextMenu={(e) => e.preventDefault()}>
        {showBook && <RecipeBookPanel onPick={fill} />}
        <div className="mc-panel container-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h3>Crafting Table — Molecule Modeler</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="mc-btn small" onClick={() => setShowBook((b) => !b)}>{showBook ? 'Hide' : 'Show'} Recipes</button>
              <button className="mc-btn small" onClick={close}>Close (E)</button>
            </div>
          </div>
          {firstTime && (
            <div className="modeler-note">
              Our crafting table is a <b>molecule modeler</b>! Put the correct atoms together to learn what each substance contains.
              Only the <b>number and kind</b> of atoms matter — not where they go in the grid.
              <div style={{ marginTop: 4 }}>
                <button className="mc-btn small" onClick={() => useGame.getState().setFlag('seen:modeler')}>Got it!</button>
              </div>
            </div>
          )}
          <div className="craft-area">
            <div className={`grid grid-3 ${shaking ? 'shake' : ''}`}>
              {grid.map((s, i) => (
                <Slot key={i} stack={s} area="grid" index={i} />
              ))}
            </div>
            <div className={`craft-arrow ${recipe ? 'ready' : ''}`} />
            <div
              className={`slot big ${recipe ? '' : placed ? 'unknown output-empty' : 'output-empty'}`}
              role="button"
              aria-label={recipe ? `Craft ${recipe.name}` : 'Output'}
              onMouseDown={(e) => {
                e.preventDefault();
                craftTake();
              }}
              onMouseEnter={() => recipe && useTooltip.getState().set({ id: recipe.id, count: 1 })}
              onMouseLeave={() => useTooltip.getState().set(null)}
            >
              {recipe && <ItemIcon id={recipe.id} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 'calc(260px * var(--ui-scale))' }}>
              {recipe ? (
                <div className="craft-hint ok">
                  {recipe.name} — {prettyFormula(recipe.formula)}
                  <br />
                  Click the output to craft!
                </div>
              ) : (
                hint && hint.text && <div className="craft-hint">{hint.text}</div>
              )}
            </div>
          </div>
          <div className="composition">
            {placed > 0 ? (
              <>
                Atoms on grid:{' '}
                {Object.entries(composition).map(([el, n], i) => (
                  <span key={el}>
                    {i > 0 && ', '}
                    <b>{n} {el}</b>
                  </span>
                ))}{' '}
                ({placed} total)
              </>
            ) : (
              <>Drag atoms from your inventory into the 3×3 grid. Shift-click moves a whole stack.</>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <InventoryGrid />
            {res && craftResult && Date.now() - craftResult.t < 60000 && (
              <div className="craft-success">
                <div className="cs-title">
                  {craftResult.first ? 'Congratulations! You crafted' : 'You crafted'} {res.name.toUpperCase()}!
                </div>
                <div className="cs-line">
                  Chemical formula: <span className="cs-formula">{prettyFormula(res.formula)}</span> · {kindLabel(res)}
                </div>
                <div className="cs-line">{res.explanation}</div>
                <div className="cs-line">{atomsLabel(res)}</div>
                <div className="cs-line" style={{ color: '#a8e0ff' }}>{res.everyday}</div>
                {plan.advancedExplanations && (
                  <div className="cs-line">
                    <button className="mc-btn small" onClick={() => setShowAdvanced((v) => !v)}>
                      {showAdvanced ? 'Hide' : 'How is real chemistry different?'}
                    </button>
                    {showAdvanced && (
                      <div style={{ marginTop: 4 }}>
                        In a real lab, nobody snaps single atoms together. Substances form through <b>chemical reactions</b> between
                        other substances, often needing energy, the right conditions and safety equipment. The modeler only shows
                        <b> what a substance contains</b>.
                        {res.kind === 'ionic'
                          ? ' Ionic compounds like this one form crystals of ions, so the formula gives the ratio of ions, not a single molecule.'
                          : ' Real molecules also have a 3-D shape that the grid does not show.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          {targetRecipe && !save.final.formulaTargets.includes(targetRecipe.id) && plan.recipeBook !== 'known-only' && countItem(save.inventory, targetRecipe.id) === 0 && (
            <div style={{ fontSize: 'var(--fs-small)', color: '#3a3a3a' }}>
              Goal: {targetRecipe.name} ({prettyFormula(targetRecipe.formula)}) — you have{' '}
              {Object.keys(targetRecipe.composition).map((el, i) => (
                <span key={el}>{i > 0 && ', '}{countItem(save.inventory, el) + (composition[el] ?? 0)} {el}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
