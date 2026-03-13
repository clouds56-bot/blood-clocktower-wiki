import type { GameState } from '../domain/types.js';
import { project_for_public } from './public.js';
import type { PlayerProjection, ProjectionResult } from './types.js';

function error(code: string, message: string): ProjectionResult<never> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

export function project_for_player(state: GameState, player_id: string): ProjectionResult<PlayerProjection> {
  const self = state.players_by_id[player_id];
  if (!self) {
    return error('player_not_found', `player not found: ${player_id}`);
  }

  const base = project_for_public(state);
  return {
    ok: true,
    value: {
      ...base,
      viewer_player_id: player_id,
      self: {
        player_id: self.player_id,
        display_name: self.display_name,
        alive: self.alive,
        dead_vote_available: self.dead_vote_available,
        perceived_character_id: self.perceived_character_id,
        known_alignment: self.true_alignment,
        registered_character_id: self.registered_character_id,
        registered_alignment: self.registered_alignment
      }
    }
  };
}
