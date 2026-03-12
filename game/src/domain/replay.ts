import type { DomainEvent } from './events.js';
import { apply_events } from './reducer.js';
import { create_initial_state } from './state.js';
import type { GameState } from './types.js';

export function replay_events(events: DomainEvent[], initial_state?: GameState): GameState {
  const seed = initial_state ?? create_initial_state('uninitialized_game');
  return apply_events(seed, events);
}
