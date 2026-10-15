import { describe, expect, it } from 'vitest';
import {
  addItem, removeItem, countItem, emptySlots, leftClickSlot, rightClickSlot, moveStack, quickMove, transferAll, spaceFor, hasItems, Slots,
} from '../src/game/inventory';

const inv = (...stacks: [number, string, number][]): Slots => {
  const s = emptySlots(36);
  for (const [i, id, n] of stacks) s[i] = { id, count: n };
  return s;
};

describe('inventory addition and removal', () => {
  it('adds to the hotbar first and stacks matching items', () => {
    let s = emptySlots(36);
    s = addItem(s, 'H', 2).slots;
    expect(s[0]).toEqual({ id: 'H', count: 2 });
    s = addItem(s, 'O', 1).slots;
    expect(s[1]).toEqual({ id: 'O', count: 1 });
    s = addItem(s, 'H', 3).slots;
    expect(s[0]).toEqual({ id: 'H', count: 5 });
    expect(countItem(s, 'H')).toBe(5);
  });

  it('splits into new stacks above 64 and reports overflow', () => {
    const r = addItem(emptySlots(2), 'C', 150);
    expect(r.slots[0]?.count).toBe(64);
    expect(r.slots[1]?.count).toBe(64);
    expect(r.leftover).toBe(22);
  });

  it('does not mutate its input', () => {
    const s = inv([0, 'H', 1]);
    addItem(s, 'H', 5);
    expect(s[0]?.count).toBe(1);
  });

  it('removes from the main inventory before the hotbar', () => {
    const s = inv([0, 'O', 3], [20, 'O', 2]);
    const r = removeItem(s, 'O', 3);
    expect(r.removed).toBe(3);
    expect(r.slots[20]).toBeNull();
    expect(r.slots[0]?.count).toBe(2);
  });

  it('reports partial removal when there is not enough', () => {
    const r = removeItem(inv([0, 'Na', 1]), 'Na', 4);
    expect(r.removed).toBe(1);
    expect(countItem(r.slots, 'Na')).toBe(0);
  });

  it('checks requirements and free space', () => {
    const s = inv([0, 'H', 2], [1, 'O', 1]);
    expect(hasItems(s, { H: 2, O: 1 })).toBe(true);
    expect(hasItems(s, { H: 3 })).toBe(false);
    expect(spaceFor(emptySlots(2), 'H')).toBe(128);
    expect(spaceFor(inv([0, 'H', 60]).slice(0, 1), 'H')).toBe(4);
  });
});

describe('stack manipulation (cursor clicks, drag, shift-click)', () => {
  it('left click picks up and places whole stacks', () => {
    const s = inv([0, 'H', 5]);
    const a = leftClickSlot(s, null, 0);
    expect(a.cursor).toEqual({ id: 'H', count: 5 });
    expect(a.slots[0]).toBeNull();
    const b = leftClickSlot(a.slots, a.cursor, 3);
    expect(b.slots[3]).toEqual({ id: 'H', count: 5 });
    expect(b.cursor).toBeNull();
  });

  it('left click merges matching stacks and swaps different ones', () => {
    const merged = leftClickSlot(inv([0, 'H', 62]), { id: 'H', count: 5 }, 0);
    expect(merged.slots[0]?.count).toBe(64);
    expect(merged.cursor).toEqual({ id: 'H', count: 3 });
    const swapped = leftClickSlot(inv([0, 'O', 1]), { id: 'H', count: 2 }, 0);
    expect(swapped.slots[0]).toEqual({ id: 'H', count: 2 });
    expect(swapped.cursor).toEqual({ id: 'O', count: 1 });
  });

  it('right click splits a stack in half or places a single item', () => {
    const half = rightClickSlot(inv([0, 'C', 5]), null, 0);
    expect(half.cursor).toEqual({ id: 'C', count: 3 });
    expect(half.slots[0]?.count).toBe(2);
    const one = rightClickSlot(emptySlots(9), { id: 'C', count: 3 }, 4);
    expect(one.slots[4]).toEqual({ id: 'C', count: 1 });
    expect(one.cursor).toEqual({ id: 'C', count: 2 });
  });

  it('drag-and-drop moves, merges or swaps', () => {
    expect(moveStack(inv([0, 'H', 2]), 0, 10)[10]).toEqual({ id: 'H', count: 2 });
    const merged = moveStack(inv([0, 'H', 2], [10, 'H', 63]), 0, 10);
    expect(merged[10]?.count).toBe(64);
    expect(merged[0]?.count).toBe(1);
    const swapped = moveStack(inv([0, 'H', 2], [10, 'O', 1]), 0, 10);
    expect(swapped[0]).toEqual({ id: 'O', count: 1 });
    expect(swapped[10]).toEqual({ id: 'H', count: 2 });
  });

  it('shift-click moves stacks between hotbar and main inventory', () => {
    const toMain = quickMove(inv([0, 'H', 2]), 0);
    expect(toMain[0]).toBeNull();
    expect(toMain[9]).toEqual({ id: 'H', count: 2 });
    const toHotbar = quickMove(inv([15, 'O', 4], [2, 'O', 1]), 15);
    expect(toHotbar[2]).toEqual({ id: 'O', count: 5 });
  });

  it('returns crafting-grid items to the inventory', () => {
    const grid = emptySlots(9);
    grid[0] = { id: 'H', count: 2 };
    grid[4] = { id: 'O', count: 1 };
    const r = transferAll(grid, emptySlots(36));
    expect(r.source.every((x) => x === null)).toBe(true);
    expect(countItem(r.target, 'H')).toBe(2);
    expect(countItem(r.target, 'O')).toBe(1);
  });
});
