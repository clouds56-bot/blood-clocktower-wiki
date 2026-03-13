import type { GameState, PlayerState } from '../domain/types.js';
import type { ProjectionClock, PublicPlayerView, PublicProjection } from './types.js';

function to_clock(state: GameState): ProjectionClock {
  return {
    status: state.status,
    phase: state.phase,
    subphase: state.subphase,
    day_number: state.day_number,
    night_number: state.night_number
  };
}

function to_public_player(player: PlayerState): PublicPlayerView {
  return {
    player_id: player.player_id,
    display_name: player.display_name,
    alive: player.alive,
    dead_vote_available: player.dead_vote_available
  };
}

function clone_day_state(state: GameState): PublicProjection['day_state'] {
  return {
    ...state.day_state,
    has_nominated_today: { ...state.day_state.has_nominated_today },
    has_been_nominated_today: { ...state.day_state.has_been_nominated_today },
    nominations_today: state.day_state.nominations_today.map((nomination) => ({ ...nomination })),
    active_vote: state.day_state.active_vote
      ? {
          ...state.day_state.active_vote,
          votes_by_player_id: { ...state.day_state.active_vote.votes_by_player_id }
        }
      : null
  };
}

export function project_for_public(state: GameState): PublicProjection {
  const players = state.seat_order
    .map((player_id) => state.players_by_id[player_id])
    .filter((player): player is PlayerState => Boolean(player))
    .map(to_public_player);

  return {
    game_id: state.game_id,
    script_id: state.script_id,
    edition_id: state.edition_id,
    clock: to_clock(state),
    players,
    seat_order: [...state.seat_order],
    day_state: clone_day_state(state),
    winning_team: state.winning_team,
    end_reason: state.end_reason
  };
}
