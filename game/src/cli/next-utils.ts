import type { GameState } from '../domain/types.js';

export interface NextScopeAnchor {
  day_number: number;
  night_number: number;
}

export function create_next_scope_anchor(state: GameState): NextScopeAnchor {
  return {
    day_number: state.day_number,
    night_number: state.night_number
  };
}

export function has_reached_next_scope_target(
  state: GameState,
  scope: 'day' | 'night',
  anchor: NextScopeAnchor
): boolean {
  if (scope === 'day') {
    return state.phase === 'day' && state.day_number > anchor.day_number;
  }

  return (state.phase === 'first_night' || state.phase === 'night') && state.night_number > anchor.night_number;
}
