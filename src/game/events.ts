/** Tiny typed event bus between the game state (store) and the 3D runtime. */
export type GameEvent =
  | { type: 'zoneComplete'; zone: number }
  | { type: 'openGate'; gate: string }
  | { type: 'reactorStart' }
  | { type: 'craftSuccess'; recipe: string }
  | { type: 'craftFail' }
  | { type: 'socketPowered'; socket: string }
  | { type: 'newGame' }
  | { type: 'loadGame' }
  | { type: 'achievement'; id: string }
  | { type: 'sfx'; name: string; volume?: number }
  | { type: 'respawn' }
  | { type: 'objective' };

type Listener = (e: GameEvent) => void;
const listeners = new Set<Listener>();

export const events = {
  on(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(e: GameEvent) {
    for (const fn of [...listeners]) fn(e);
  },
};
