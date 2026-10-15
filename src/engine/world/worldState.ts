/**
 * Applies persistent puzzle flags to a freshly generated world (used when loading a save,
 * or to jump straight to the "after" state without animations).
 */
import { B } from './blocks';
import { Layout } from './layout';

export function applyWorldFlags(L: Layout, flags: Record<string, boolean>) {
  const w = L.world;
  const clear = (cells: [number, number, number][]) => cells.forEach(([x, y, z]) => w.set(x, y, z, B.AIR));
  if (flags.water_flowing) for (const [x, y, z] of L.waterPath) w.set(x, y, z, B.WATER);
  if (flags.gate1_open) clear(L.gates.gate1.cells);
  if (flags.ice_melted) clear(L.iceCells);
  if (flags.gate2_open) clear(L.gates.gate2.cells);
  if (flags.door3_open) clear(L.gates.door3.cells);
  if (flags.bridge_built) {
    for (const c of L.bridgeCells) w.set(c.pos[0], c.pos[1], c.pos[2], c.id);
    for (const [x, y, z] of L.wires.bridge ?? []) w.set(x, y, z, B.WIRE_ON);
  }
  for (const key of ['A', 'B', 'C', 'D']) {
    if (!flags[`socket${key}`]) continue;
    const m = L.machines.find((mm) => mm.id === `socket${key}`);
    if (m) for (const [x, y, z] of m.cells) w.set(x, y, z, B.SOCKET_ON);
    for (const [x, y, z] of L.wires[`socket${key}`] ?? []) w.set(x, y, z, B.WIRE_ON);
  }
  if (flags.reactor_on) for (const [x, y, z] of L.reactorCore) w.set(x, y, z, B.REACTOR_ON);
  if (flags.vault_open) clear(L.gates.vault.cells);
  for (const s of L.secrets) if (flags[s.id]) clear(s.cracked);
}
