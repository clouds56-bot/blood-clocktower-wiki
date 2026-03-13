import type { GameState } from '../domain/types.js';
import type { ProjectionClock, StorytellerProjection } from './types.js';

function to_clock(state: GameState): ProjectionClock {
  return {
    status: state.status,
    phase: state.phase,
    subphase: state.subphase,
    day_number: state.day_number,
    night_number: state.night_number
  };
}

export function project_for_storyteller(state: GameState): StorytellerProjection {
  const players = Object.fromEntries(
    Object.entries(state.players_by_id).map(([player_id, player]) => [
      player_id,
      {
        player_id: player.player_id,
        display_name: player.display_name,
        alive: player.alive,
        dead_vote_available: player.dead_vote_available,
        true_character_id: player.true_character_id,
        true_character_type: player.true_character_type ?? null,
        perceived_character_id: player.perceived_character_id,
        true_alignment: player.true_alignment,
        registered_character_id: player.registered_character_id,
        registered_alignment: player.registered_alignment,
        drunk: player.drunk,
        poisoned: player.poisoned,
        is_traveller: player.is_traveller,
        is_demon: player.is_demon
      }
    ])
  );

  return {
    game_id: state.game_id,
    script_id: state.script_id,
    edition_id: state.edition_id,
    clock: to_clock(state),
    players,
    seat_order: [...state.seat_order],
    day_state: {
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
    },
    prompts: Object.values(state.prompts_by_id).map((prompt) => ({
      ...prompt,
      options: prompt.options.map((option) => ({ ...option })),
      resolution_payload: prompt.resolution_payload ? { ...prompt.resolution_payload } : null
    })),
    reminder_markers: state.active_reminder_marker_ids
      .map((marker_id) => state.reminder_markers_by_id[marker_id])
      .filter((marker): marker is NonNullable<typeof marker> => Boolean(marker))
      .map((marker) => ({
        ...marker,
        metadata: { ...marker.metadata }
      })),
    storyteller_notes: state.storyteller_notes.map((note) => ({ ...note })),
    winning_team: state.winning_team,
    end_reason: state.end_reason
  };
}
