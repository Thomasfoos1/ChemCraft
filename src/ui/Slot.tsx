import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { ItemStack, getItemDef } from '../game/items';
import { ELEMENTS } from '../chem/elements';
import { RECIPE_BY_ID, kindLabel, atomsLabel } from '../chem/recipes';
import { prettyFormula } from '../chem/formula';
import { iconUrl } from './icons';
import { ContainerArea, useGame } from '../game/store';

interface TooltipState {
  item: ItemStack | null;
  hover: { area: ContainerArea; index: number } | null;
  set(item: ItemStack | null, hover?: { area: ContainerArea; index: number } | null): void;
}
export const useTooltip = create<TooltipState>((set) => ({
  item: null,
  hover: null,
  set: (item, hover = null) => set({ item, hover }),
}));

let dragFrom: { area: ContainerArea; index: number } | null = null;

export function ItemIcon({ id, size }: { id: string; size?: number }) {
  return <img src={iconUrl(id)} alt={getItemDef(id).name} width={size} height={size} draggable={false} />;
}

export function Slot({
  stack, area, index, highlight, className,
}: { stack: ItemStack | null; area: ContainerArea; index: number; highlight?: boolean; className?: string }) {
  const slotClick = useGame((s) => s.slotClick);
  const setTip = useTooltip((s) => s.set);
  return (
    <div
      className={`slot ${highlight ? 'highlight' : ''} ${className ?? ''}`}
      role="button"
      aria-label={stack ? `${getItemDef(stack.id).name}, ${stack.count}` : 'Empty slot'}
      onMouseDown={(e) => {
        e.preventDefault();
        const hadCursor = !!useGame.getState().cursor;
        slotClick(area, index, e.button === 2 ? 2 : 0, e.shiftKey);
        dragFrom = !hadCursor && useGame.getState().cursor && e.button === 0 ? { area, index } : null;
      }}
      onMouseUp={(e) => {
        if (e.button !== 0) return;
        if (dragFrom && (dragFrom.area !== area || dragFrom.index !== index) && useGame.getState().cursor) {
          slotClick(area, index, 0, false);
        }
        dragFrom = null;
      }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseEnter={() => setTip(stack, { area, index })}
      onMouseLeave={() => setTip(null, null)}
    >
      {stack && <ItemIcon id={stack.id} />}
      {stack && stack.count > 1 && <span className="count">{stack.count}</span>}
    </div>
  );
}

function useMouse() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  useEffect(() => {
    const f = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', f);
    return () => window.removeEventListener('mousemove', f);
  }, []);
  return pos;
}

export function TooltipLayer() {
  const tipItem = useTooltip((s) => s.item);
  const hover = useTooltip((s) => s.hover);
  const cursor = useGame((s) => s.cursor);
  const save = useGame((s) => s.save);
  // Read the hovered slot live so the tooltip follows clicks and moves.
  const item = hover && save ? (hover.area === 'inv' ? save.inventory[hover.index] : save.craftGrid[hover.index]) : tipItem;
  const pos = useMouse();
  return (
    <>
      {cursor && (
        <div className="cursor-stack" style={{ left: pos.x, top: pos.y }}>
          <ItemIcon id={cursor.id} />
          {cursor.count > 1 && <span className="count">{cursor.count}</span>}
        </div>
      )}
      {item && !cursor && <ItemTooltip item={item} x={pos.x} y={pos.y} />}
    </>
  );
}

export function ItemTooltip({ item, x, y }: { item: ItemStack; x: number; y: number }) {
  const el = ELEMENTS[item.id];
  const r = RECIPE_BY_ID[item.id];
  const left = Math.min(x + 16, window.innerWidth - 340);
  const top = Math.min(y + 12, window.innerHeight - 180);
  return (
    <div className="tooltip" style={{ left, top }}>
      {el && (
        <>
          <div className="t-name">
            {el.name} <span className="t-formula">({el.symbol})</span>
          </div>
          <div className="t-line t-blue">Atomic Number: {el.atomicNumber}</div>
          <div className="t-line">{el.category === 'metal' ? 'Metal' : 'Nonmetal'} element</div>
          <div className="t-line">{el.fact}</div>
        </>
      )}
      {r && (
        <>
          <div className="t-name">
            {r.name} <span className="t-formula">{prettyFormula(r.formula)}</span>
          </div>
          <div className="t-line t-blue">{kindLabel(r)}</div>
          <div className="t-line">{atomsLabel(r)}</div>
          <div className="t-line">{r.everyday}</div>
        </>
      )}
    </div>
  );
}
