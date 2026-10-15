/**
 * Pure inventory functions. Slots are an array of (ItemStack | null).
 * Slots 0–8 are the hotbar, 9–35 the main inventory.
 * Every function returns new arrays and never mutates its inputs.
 */
import { ItemStack, getItemDef } from './items';

export type Slots = (ItemStack | null)[];

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;

export function emptySlots(n: number = INVENTORY_SIZE): Slots {
  return Array.from({ length: n }, () => null);
}

export function cloneSlots(slots: Slots): Slots {
  return slots.map((s) => (s ? { ...s } : null));
}

export function countItem(slots: Slots, id: string): number {
  let n = 0;
  for (const s of slots) if (s && s.id === id) n += s.count;
  return n;
}

export function hasItems(slots: Slots, required: Record<string, number>): boolean {
  return Object.entries(required).every(([id, n]) => countItem(slots, id) >= n);
}

/**
 * Add items: first top up existing stacks (hotbar first), then fill empty slots
 * (hotbar first, like Minecraft). Returns the new slots and anything that did not fit.
 */
export function addItem(slots: Slots, id: string, count: number): { slots: Slots; leftover: number } {
  const out = cloneSlots(slots);
  const max = getItemDef(id).maxStack;
  let remaining = count;
  for (let i = 0; i < out.length && remaining > 0; i++) {
    const s = out[i];
    if (s && s.id === id && s.count < max) {
      const add = Math.min(max - s.count, remaining);
      s.count += add;
      remaining -= add;
    }
  }
  for (let i = 0; i < out.length && remaining > 0; i++) {
    if (!out[i]) {
      const add = Math.min(max, remaining);
      out[i] = { id, count: add };
      remaining -= add;
    }
  }
  return { slots: out, leftover: remaining };
}

/** How many of `id` could be added without overflowing. */
export function spaceFor(slots: Slots, id: string): number {
  const max = getItemDef(id).maxStack;
  let n = 0;
  for (const s of slots) {
    if (!s) n += max;
    else if (s.id === id) n += Math.max(0, max - s.count);
  }
  return n;
}

/**
 * Remove up to `count` items of `id`, taking from the main inventory before the hotbar
 * so the player's selected items survive as long as possible.
 */
export function removeItem(slots: Slots, id: string, count: number): { slots: Slots; removed: number } {
  const out = cloneSlots(slots);
  let remaining = count;
  const order = [...Array(out.length).keys()].sort((a, b) => {
    const ah = a < HOTBAR_SIZE ? 1 : 0;
    const bh = b < HOTBAR_SIZE ? 1 : 0;
    return ah - bh || b - a;
  });
  for (const i of order) {
    if (remaining <= 0) break;
    const s = out[i];
    if (s && s.id === id) {
      const take = Math.min(s.count, remaining);
      s.count -= take;
      remaining -= take;
      if (s.count === 0) out[i] = null;
    }
  }
  return { slots: out, removed: count - remaining };
}

/** Result of a click interaction with a "cursor" stack held by the mouse (Minecraft style). */
export interface ClickResult {
  slots: Slots;
  cursor: ItemStack | null;
}

/**
 * Left click: pick up a whole stack, put down the whole cursor stack,
 * merge into a matching stack, or swap different items.
 */
export function leftClickSlot(slots: Slots, cursor: ItemStack | null, index: number): ClickResult {
  const out = cloneSlots(slots);
  const cur = cursor ? { ...cursor } : null;
  const slot = out[index];
  if (!cur) {
    if (!slot) return { slots: out, cursor: null };
    out[index] = null;
    return { slots: out, cursor: slot };
  }
  if (!slot) {
    out[index] = cur;
    return { slots: out, cursor: null };
  }
  if (slot.id === cur.id) {
    const max = getItemDef(slot.id).maxStack;
    const add = Math.min(max - slot.count, cur.count);
    slot.count += add;
    cur.count -= add;
    return { slots: out, cursor: cur.count > 0 ? cur : null };
  }
  out[index] = cur;
  return { slots: out, cursor: slot };
}

/**
 * Right click: with an empty cursor pick up half the stack (rounded up);
 * with a cursor place a single item into an empty or matching slot.
 */
export function rightClickSlot(slots: Slots, cursor: ItemStack | null, index: number): ClickResult {
  const out = cloneSlots(slots);
  const cur = cursor ? { ...cursor } : null;
  const slot = out[index];
  if (!cur) {
    if (!slot) return { slots: out, cursor: null };
    const take = Math.ceil(slot.count / 2);
    slot.count -= take;
    if (slot.count === 0) out[index] = null;
    return { slots: out, cursor: { id: slot.id, count: take } };
  }
  if (!slot) {
    out[index] = { id: cur.id, count: 1 };
    cur.count -= 1;
    return { slots: out, cursor: cur.count > 0 ? cur : null };
  }
  if (slot.id === cur.id && slot.count < getItemDef(slot.id).maxStack) {
    slot.count += 1;
    cur.count -= 1;
    return { slots: out, cursor: cur.count > 0 ? cur : null };
  }
  return leftClickSlot(slots, cursor, index);
}

/** Move a stack from one slot to another (drag and drop); merges or swaps. */
export function moveStack(slots: Slots, from: number, to: number): Slots {
  if (from === to) return cloneSlots(slots);
  const picked = leftClickSlot(slots, null, from);
  const dropped = leftClickSlot(picked.slots, picked.cursor, to);
  if (dropped.cursor) {
    // Merge was partial: return the rest to the source slot.
    const out = dropped.slots;
    if (!out[from]) out[from] = dropped.cursor;
    else return leftClickSlot(out, dropped.cursor, from).slots;
    return out;
  }
  return dropped.slots;
}

/** Shift-click: move a stack between the hotbar and the main inventory. */
export function quickMove(slots: Slots, index: number): Slots {
  const s = slots[index];
  if (!s) return cloneSlots(slots);
  const toHotbar = index >= HOTBAR_SIZE;
  const range = toHotbar ? [0, HOTBAR_SIZE] : [HOTBAR_SIZE, slots.length];
  const out = cloneSlots(slots);
  out[index] = null;
  const sub = out.slice(range[0], range[1]);
  const res = addItem(sub, s.id, s.count);
  for (let i = 0; i < res.slots.length; i++) out[range[0] + i] = res.slots[i];
  if (res.leftover > 0) out[index] = { id: s.id, count: res.leftover };
  return out;
}

/** Move every stack from `source` into `target` slots. Returns both arrays (source keeps what did not fit). */
export function transferAll(source: Slots, target: Slots): { source: Slots; target: Slots } {
  let tgt = cloneSlots(target);
  const src = cloneSlots(source);
  for (let i = 0; i < src.length; i++) {
    const s = src[i];
    if (!s) continue;
    const r = addItem(tgt, s.id, s.count);
    tgt = r.slots;
    src[i] = r.leftover > 0 ? { id: s.id, count: r.leftover } : null;
  }
  return { source: src, target: tgt };
}
