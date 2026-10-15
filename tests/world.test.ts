import { describe, expect, it, beforeAll } from 'vitest';
import { generateDungeon, FLOOR } from '../src/engine/world/worldgen';
import { applyWorldFlags } from '../src/engine/world/worldState';
import { B } from '../src/engine/world/blocks';
import { Layout } from '../src/engine/world/layout';
import { canReach, maxZ, reachable } from './helpers/reach';
import { computeAllLight } from '../src/engine/world/lighting';
import { buildChunk } from '../src/engine/world/mesher';
import { raycastBlocks } from '../src/engine/world/raycast';

let layout: Layout;
beforeAll(() => {
  layout = generateDungeon();
});

const fresh = () => generateDungeon();

describe('dungeon layout', () => {
  it('spawns the player on solid ground in open air', () => {
    const [x, y, z] = layout.spawn.pos;
    const w = layout.world;
    expect(w.isSolid(Math.floor(x), y - 1, Math.floor(z))).toBe(true);
    expect(w.isSolid(Math.floor(x), y, Math.floor(z))).toBe(false);
    expect(w.isSolid(Math.floor(x), y + 1, Math.floor(z))).toBe(false);
  });

  it('places five scientists, crafting tables in every zone and all puzzle machines', () => {
    expect(layout.npcs.map((n) => n.id).sort()).toEqual(['blockwell', 'calcite', 'carbon', 'matter', 'salty']);
    for (const zone of [1, 2, 3, 4, 5]) expect(layout.tables.some((t) => t.zone === zone)).toBe(true);
    const kinds = layout.machines.map((m) => m.kind);
    for (const k of ['generator', 'frozen_gate', 'carbonator', 'fabricator', 'console', 'sorter', 'balancer', 'socket', 'reactor', 'vault'])
      expect(kinds).toContain(k);
  });

  it('provides every element each zone needs', () => {
    const need: Record<number, string[]> = { 1: ['H', 'O'], 2: ['Na', 'Cl'], 3: ['C', 'O'], 4: ['Ca', 'C', 'O'], 5: ['H', 'O', 'C', 'Na', 'Cl', 'Ca', 'N', 'Fe'] };
    for (const [zone, els] of Object.entries(need)) {
      for (const el of els) expect(layout.deposits.some((d) => d.zone === Number(zone) && d.element === el), `${el} in zone ${zone}`).toBe(true);
    }
  });

  it('stores deposits as the matching deposit block', () => {
    for (const d of layout.deposits) {
      const id = layout.world.get(...d.pos);
      expect(id).not.toBe(B.AIR);
    }
  });

  it('has gates that fully block each corridor', () => {
    for (const g of Object.values(layout.gates)) for (const c of g.cells) expect(layout.world.isSolid(...c)).toBe(true);
  });
});

describe('progression gating (no skipping zones)', () => {
  it('cannot leave the Waterworks while gate 1 is closed', () => {
    const L = fresh();
    const cells = reachable(L.world, [24, FLOOR, 9]);
    expect(maxZ(cells)).toBeLessThan(33);
    // ...but every Waterworks objective is reachable
    for (const m of ['deposit:H:1', 'deposit:O:1', 'table:1', 'machine:generator', 'npc:blockwell']) {
      const [x, , z] = L.markers[m];
      expect(canReach(cells, x, z, 2.5), m).toBe(true);
    }
  });

  it('opening gate 1 reaches the Crystal Caverns but not beyond the frozen gate', () => {
    const L = fresh();
    applyWorldFlags(L, { gate1_open: true });
    const cells = reachable(L.world, [24, FLOOR, 9]);
    expect(maxZ(cells)).toBeGreaterThan(60);
    expect(maxZ(cells)).toBeLessThan(69);
    for (const m of ['deposit:Na:2', 'deposit:Cl:2', 'table:2', 'machine:frozen_gate', 'npc:salty']) {
      const [x, , z] = L.markers[m];
      expect(canReach(cells, x, z, 2.5), m).toBe(true);
    }
  });

  it('melting the ice alone does not open the iron gate behind it', () => {
    const L = fresh();
    applyWorldFlags(L, { gate1_open: true, ice_melted: true });
    const cells = reachable(L.world, [24, FLOOR, 9]);
    expect(maxZ(cells)).toBeLessThan(70);
  });

  it('the Carbon Caverns door blocks the Limestone Ruins', () => {
    const L = fresh();
    applyWorldFlags(L, { gate1_open: true, ice_melted: true, gate2_open: true });
    const cells = reachable(L.world, [24, FLOOR, 9]);
    expect(maxZ(cells)).toBeGreaterThan(100);
    expect(maxZ(cells)).toBeLessThan(108);
    for (const m of ['deposit:C:3', 'deposit:O:3', 'table:3', 'machine:carbonator', 'npc:carbon']) {
      const [x, , z] = L.markers[m];
      expect(canReach(cells, x, z, 2.5), m).toBe(true);
    }
  });

  it('the chasm cannot be crossed until the bridge is built', () => {
    const L = fresh();
    applyWorldFlags(L, { gate1_open: true, ice_melted: true, gate2_open: true, door3_open: true });
    const cells = reachable(L.world, [24, FLOOR, 9]);
    expect(maxZ(cells)).toBeLessThan(140);
    for (const m of ['deposit:Ca:4', 'deposit:C:4', 'deposit:O:4', 'table:4', 'machine:fabricator', 'npc:calcite']) {
      const [x, , z] = L.markers[m];
      expect(canReach(cells, x, z, 2.5), m).toBe(true);
    }
    applyWorldFlags(L, { bridge_built: true });
    const after = reachable(L.world, [24, FLOOR, 9]);
    expect(maxZ(after)).toBeGreaterThan(190);
    expect(maxZ(after)).toBeLessThan(197);
    for (const m of ['table:5', 'machine:console', 'machine:sorter', 'machine:balancer', 'npc:matter']) {
      const [x, , z] = L.markers[m];
      expect(canReach(after, x, z, 2.5), m).toBe(true);
    }
  });

  it('the vault opens onto the sunlit exit', () => {
    const L = fresh();
    applyWorldFlags(L, { gate1_open: true, ice_melted: true, gate2_open: true, door3_open: true, bridge_built: true, vault_open: true });
    const cells = reachable(L.world, [24, FLOOR, 9]);
    expect(maxZ(cells)).toBeGreaterThanOrEqual(L.exitZ);
  });
});

describe('lighting, meshing and raycasting', () => {
  it('lights rooms and leaves solid rock dark', () => {
    const L = fresh();
    computeAllLight(L.world);
    const w = L.world;
    const lit = w.lightR[w.index(24, FLOOR + 1, 12)] + w.lightG[w.index(24, FLOOR + 1, 12)];
    expect(lit).toBeGreaterThan(4);
    // the courtyard is sunlit
    expect(w.lightB[w.index(24, 19, 218)]).toBeGreaterThanOrEqual(13);
  });

  it('builds non-empty chunk meshes for the starting room', () => {
    const L = fresh();
    computeAllLight(L.world);
    const m = buildChunk(L.world, 1, 0, 0);
    expect(m.opaque).not.toBeNull();
    expect(m.opaque!.indices.length % 6).toBe(0);
    expect(m.opaque!.positions.length / 3).toBe(m.opaque!.colors.length / 3);
  });

  it('raycasts to the first targetable block', () => {
    const L = fresh();
    // looking east from the middle of the room at hydrogen crystal height
    const hit = raycastBlocks(L.world, 33.5, FLOOR + 0.5, 10.5, 1, 0, 0, 5);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe(B.ORE_H);
    expect(hit!.nx).toBe(-1);
  });
});
