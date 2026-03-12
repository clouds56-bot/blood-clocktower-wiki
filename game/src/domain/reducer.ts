import type { DomainEvent } from './events.js';
import type { GameState, PlayerState } from './types.js';

function clone_state(state: GameState): GameState {
  return {
    ...state,
    players_by_id: { ...state.players_by_id },
    seat_order: [...state.seat_order],
    domain_events: [...state.domain_events]
  };
}

function ensure_player(state: GameState, player_id: string): PlayerState {
  const player = state.players_by_id[player_id];
  if (!player) {
    throw new Error(`player_not_found:${player_id}`);
  }
  return player;
}

export function apply_event(state: GameState, event: DomainEvent): GameState {
  const next = clone_state(state);

  if (next.domain_events.some((existing) => existing.event_id === event.event_id)) {
    return next;
  }

  switch (event.event_type) {
    case 'GameCreated': {
      next.game_id = event.payload.game_id;
      break;
    }
    case 'ScriptSelected': {
      next.script_id = event.payload.script_id;
      break;
    }
    case 'EditionSelected': {
      next.edition_id = event.payload.edition_id;
      break;
    }
    case 'PlayerAdded': {
      const { player_id, display_name } = event.payload;
      next.players_by_id[player_id] = {
        player_id,
        display_name,
        alive: true,
        dead_vote_available: true,
        true_character_id: null,
        perceived_character_id: null,
        true_alignment: null,
        registered_character_id: null,
        registered_alignment: null,
        drunk: false,
        poisoned: false
      };
      break;
    }
    case 'SeatOrderSet': {
      next.seat_order = [...event.payload.seat_order];
      break;
    }
    case 'CharacterAssigned': {
      const player = ensure_player(next, event.payload.player_id);
      player.true_character_id = event.payload.true_character_id;
      break;
    }
    case 'PerceivedCharacterAssigned': {
      const player = ensure_player(next, event.payload.player_id);
      player.perceived_character_id = event.payload.perceived_character_id;
      break;
    }
    case 'AlignmentAssigned': {
      const player = ensure_player(next, event.payload.player_id);
      player.true_alignment = event.payload.true_alignment;
      break;
    }
    case 'PhaseAdvanced': {
      next.phase = event.payload.phase;
      next.subphase = event.payload.subphase;
      next.day_number = event.payload.day_number;
      next.night_number = event.payload.night_number;
      next.status = event.payload.phase === 'ended' ? 'ended' : 'in_progress';
      break;
    }
    default: {
      const neverEvent: never = event;
      throw new Error(`unknown_event_type:${JSON.stringify(neverEvent)}`);
    }
  }

  const envelope = {
    event_id: event.event_id,
    event_type: event.event_type,
    created_at: event.created_at
  } as const;

  next.domain_events.push(
    event.actor_id === undefined
      ? envelope
      : {
          ...envelope,
          actor_id: event.actor_id
        }
  );

  return next;
}

export function apply_events(initial_state: GameState, events: DomainEvent[]): GameState {
  return events.reduce((state, event) => apply_event(state, event), initial_state);
}
