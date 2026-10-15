import { describe, expect, it } from 'vitest';
import { generateDungeon, FLOOR } from '../src/engine/world/worldgen';
import { createPlayer, stepPlayer, PLAYER } from '../src/engine/player/physics';
import { applyWorldFlags } from '../src/engine/world/worldState';

const idle = { forward: 0, strafe: 0, jump: false, sprint: false };
const run = (n: number, fn: () => void) => { for (let i = 0; i < n; i++) fn(); };

describe('player movement and collision', () => {
  const L = generateDungeon();
  const w = L.world;

  it('falls under gravity and lands on the floor', () => {
    const p = createPlayer(24.5, FLOOR + 3, 10.5);
    run(240, () => stepPlayer(w, p, idle, 1 / 120));
    expect(p.y).toBeCloseTo(FLOOR, 3);
    expect(p.onGround).toBe(true);
  });

  it('jumps a little over one block high', () => {
    const p = createPlayer(24.5, FLOOR, 10.5);
    run(10, () => stepPlayer(w, p, idle, 1 / 120));
    let maxY = p.y;
    stepPlayer(w, p, { ...idle, jump: true }, 1 / 120);
    run(120, () => { stepPlayer(w, p, idle, 1 / 120); maxY = Math.max(maxY, p.y); });
    expect(maxY - FLOOR).toBeGreaterThan(1.05);
    expect(maxY - FLOOR).toBeLessThan(1.6);
  });

  it('cannot walk through walls', () => {
    // walk west from the middle of the Waterworks into the west wall (x = 11)
    const p = createPlayer(16.5, FLOOR, 16.5, -Math.PI / 2);
    run(600, () => stepPlayer(w, p, { ...idle, forward: 1 }, 1 / 120, { autoJump: true }));
    expect(p.x).toBeGreaterThanOrEqual(12 + PLAYER.halfWidth - 0.01);
  });

  it('cannot pass a closed gate, even with auto-jump', () => {
    const p = createPlayer(23.5, FLOOR, 30.5, 0);
    run(900, () => stepPlayer(w, p, { ...idle, forward: 1, sprint: true, jump: true }, 1 / 120, { autoJump: true }));
    expect(p.z).toBeLessThan(33);
  });

  it('walks through once the gate is open', () => {
    const L2 = generateDungeon();
    applyWorldFlags(L2, { gate1_open: true });
    const p = createPlayer(23.5, FLOOR, 30.5, 0);
    run(900, () => stepPlayer(L2.world, p, { ...idle, forward: 1 }, 1 / 120, { autoJump: true }));
    expect(p.z).toBeGreaterThan(36);
  });

  it('auto-jumps up single-block steps on the exit staircase', () => {
    const L2 = generateDungeon();
    applyWorldFlags(L2, { vault_open: true });
    const p = createPlayer(23.5, FLOOR, 200.5, 0);
    run(2400, () => stepPlayer(L2.world, p, { ...idle, forward: 1 }, 1 / 120, { autoJump: true }));
    expect(p.y).toBeGreaterThanOrEqual(17.9);
    expect(p.z).toBeGreaterThan(214);
  });

  it('detects lava so the runtime can send the player back to safety', () => {
    const p = createPlayer(23.5, 3, 136.5);
    run(240, () => stepPlayer(w, p, idle, 1 / 120));
    expect(p.inLava).toBe(true);
  });
});
