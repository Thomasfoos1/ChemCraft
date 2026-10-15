import { describe, expect, it } from 'vitest';
import { createNewSave, serializeSave, deserializeSave, SAVE_VERSION } from '../src/game/save';
import { defaultTeacherConfig } from '../src/game/config';
import { addItem } from '../src/game/inventory';

const fresh = () => createNewSave(defaultTeacherConfig(), { pos: [24.5, 6, 8.5], yaw: 0 }, 1000);

describe('save/load serialization', () => {
  it('round-trips all progress', () => {
    const s = fresh();
    s.inventory = addItem(s.inventory, 'H', 3).slots;
    s.craftGrid[4] = { id: 'O', count: 1 };
    s.player = { pos: [30, 6, 50], yaw: 1.2, pitch: -0.3 };
    s.zones[1] = { step: 5, completed: true };
    s.flags.gate1_open = true;
    s.recipesDiscovered.push('water');
    s.elementsDiscovered.push('H', 'O');
    s.achievements.push('first_reaction');
    s.stats.hintsUsed = 4;
    s.final.sockets.A = true;
    s.questionLog.push({ id: 'z1_atoms_h2o', topic: 'formulas', zone: 1, attempts: 1, correct: true, firstTry: true, hints: 0 });
    const back = deserializeSave(serializeSave(s))!;
    expect(back).not.toBeNull();
    expect(back.inventory[0]).toEqual({ id: 'H', count: 3 });
    expect(back.craftGrid[4]).toEqual({ id: 'O', count: 1 });
    expect(back.player).toEqual(s.player);
    expect(back.zones[1]).toEqual({ step: 5, completed: true });
    expect(back.flags.gate1_open).toBe(true);
    expect(back.recipesDiscovered).toEqual(['water']);
    expect(back.stats.hintsUsed).toBe(4);
    expect(back.final.sockets.A).toBe(true);
    expect(back.questionLog).toHaveLength(1);
    expect(back.config).toEqual(s.config);
  });

  it('rejects corrupt or foreign data', () => {
    expect(deserializeSave(null)).toBeNull();
    expect(deserializeSave('{not json')).toBeNull();
    expect(deserializeSave(JSON.stringify({ version: SAVE_VERSION + 1 }))).toBeNull();
  });

  it('sanitises bad values instead of crashing', () => {
    const s = JSON.parse(serializeSave(fresh()));
    s.inventory[0] = { id: 'H', count: -5 };
    s.inventory[1] = { id: 42, count: 2 };
    s.selected = 99;
    s.player.pos = ['a', 1, 2];
    s.nickname = 'x'.repeat(100);
    s.flags.weird = 'yes';
    const back = deserializeSave(JSON.stringify(s))!;
    expect(back.inventory[0]).toBeNull();
    expect(back.inventory[1]).toBeNull();
    expect(back.selected).toBe(8);
    expect(back.player.pos).toEqual([24.5, 6, 8.5]);
    expect(back.nickname).toHaveLength(24);
    expect(back.flags.weird).toBeUndefined();
  });

  it('stores no personal information by default', () => {
    const s = fresh();
    expect(s.nickname).toBe('');
    expect(Object.keys(s)).not.toContain('email');
  });
});
