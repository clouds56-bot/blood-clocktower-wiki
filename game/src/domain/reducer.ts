import type { DomainEvent } from './events.js';
import { create_empty_day_state, type ActiveVote, type GameState, type PlayerState } from './types.js';

function clone_payload(payload: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(payload);
}

function clone_state(state: GameState): GameState {
  return {
    ...state,
    players_by_id: Object.fromEntries(
      Object.entries(state.players_by_id).map(([player_id, player]) => [player_id, { ...player }])
    ),
    seat_order: [...state.seat_order],
    day_state: {
      has_nominated_today: { ...state.day_state.has_nominated_today },
      has_been_nominated_today: { ...state.day_state.has_been_nominated_today },
      nominations_today: state.day_state.nominations_today.map((nomination) => ({ ...nomination })),
      active_vote: state.day_state.active_vote
        ? {
            ...state.day_state.active_vote,
            votes_by_player_id: { ...state.day_state.active_vote.votes_by_player_id }
          }
        : null,
      nomination_window_open: state.day_state.nomination_window_open,
      execution_attempted_today: state.day_state.execution_attempted_today,
      execution_occurred_today: state.day_state.execution_occurred_today,
      executed_player_id: state.day_state.executed_player_id,
      execution_outcome: state.day_state.execution_outcome,
      execution_consequences_resolved_today: state.day_state.execution_consequences_resolved_today
    },
    execution_history: state.execution_history.map((item) => ({ ...item })),
    death_history: state.death_history.map((item) => ({ ...item })),
    wake_queue: state.wake_queue.map((item) => ({ ...item })),
    interrupt_queue: state.interrupt_queue.map((item) => ({ ...item, payload: clone_payload(item.payload) })),
    prompts_by_id: Object.fromEntries(
      Object.entries(state.prompts_by_id).map(([prompt_id, prompt]) => [
        prompt_id,
        {
          ...prompt,
          options: prompt.options.map((option) => ({ ...option })),
          resolution_payload: prompt.resolution_payload ? { ...prompt.resolution_payload } : null
        }
      ])
    ),
    pending_prompts: [...state.pending_prompts],
    reminder_markers_by_id: Object.fromEntries(
      Object.entries(state.reminder_markers_by_id).map(([marker_id, marker]) => [
        marker_id,
        {
          ...marker,
          metadata: clone_payload(marker.metadata)
        }
      ])
    ),
    active_reminder_marker_ids: [...state.active_reminder_marker_ids],
    storyteller_notes: state.storyteller_notes.map((note) => ({ ...note })),
    winning_team: state.winning_team,
    end_reason: state.end_reason,
    ended_at_event_id: state.ended_at_event_id,
    domain_events: [...state.domain_events]
  };
}

function active_markers_for_player_effect(
  state: GameState,
  player_id: string,
  effect: 'poisoned' | 'drunk'
): number {
  let count = 0;
  for (const marker_id of state.active_reminder_marker_ids) {
    const marker = state.reminder_markers_by_id[marker_id];
    if (!marker || marker.status !== 'active' || !marker.authoritative) {
      continue;
    }
    if (marker.target_player_id !== player_id || marker.effect !== effect) {
      continue;
    }
    count += 1;
  }
  return count;
}

function sync_derived_effect_flags(state: GameState, player_id: string): void {
  const player = ensure_player(state, player_id);
  player.poisoned = active_markers_for_player_effect(state, player_id, 'poisoned') > 0;
  player.drunk = active_markers_for_player_effect(state, player_id, 'drunk') > 0;
}

function clear_marker(state: GameState, marker_id: string, event_id: string, status: 'cleared' | 'expired'): void {
  const marker = state.reminder_markers_by_id[marker_id];
  if (!marker || marker.status !== 'active') {
    return;
  }

  marker.status = status;
  marker.cleared_at_event_id = event_id;
  state.active_reminder_marker_ids = state.active_reminder_marker_ids.filter((item) => item !== marker_id);
  if (marker.target_player_id) {
    sync_derived_effect_flags(state, marker.target_player_id);
  }
}

function ensure_player(state: GameState, player_id: string): PlayerState {
  const player = state.players_by_id[player_id];
  if (!player) {
    throw new Error(`player_not_found:${player_id}`);
  }
  return player;
}

function ensure_active_vote(state: GameState): ActiveVote {
  const active_vote = state.day_state.active_vote;
  if (!active_vote) {
    throw new Error('active_vote_not_found');
  }
  return active_vote;
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
        true_character_type: null,
        perceived_character_id: null,
        true_alignment: null,
        registered_character_id: null,
        registered_alignment: null,
        drunk: false,
        poisoned: false,
        is_traveller: false,
        is_demon: false
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
      if (event.payload.true_character_type !== undefined) {
        player.true_character_type = event.payload.true_character_type;
      }
      if (event.payload.is_demon !== undefined) {
        player.is_demon = event.payload.is_demon;
      }
      if (event.payload.is_traveller !== undefined) {
        player.is_traveller = event.payload.is_traveller;
      }
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

      if (event.payload.phase === 'day' && event.payload.subphase === 'open_discussion') {
        next.day_state = create_empty_day_state();
      }
      break;
    }
    case 'NominationWindowOpened': {
      next.day_state.nomination_window_open = true;
      break;
    }
    case 'NominationMade': {
      const nomination = {
        nomination_id: event.payload.nomination_id,
        nominator_player_id: event.payload.nominator_player_id,
        nominee_player_id: event.payload.nominee_player_id,
        day_number: event.payload.day_number,
        vote_total: null,
        threshold: null
      };

      next.day_state.nominations_today.push(nomination);
      next.day_state.has_nominated_today[event.payload.nominator_player_id] = true;
      next.day_state.has_been_nominated_today[event.payload.nominee_player_id] = true;
      break;
    }
    case 'VoteOpened': {
      next.day_state.active_vote = {
        nomination_id: event.payload.nomination_id,
        nominee_player_id: event.payload.nominee_player_id,
        opened_by_player_id: event.payload.opened_by_player_id,
        votes_by_player_id: {}
      };
      break;
    }
    case 'VoteCast': {
      const active_vote = ensure_active_vote(next);
      active_vote.votes_by_player_id[event.payload.voter_player_id] = event.payload.in_favor;
      break;
    }
    case 'VoteClosed': {
      const nomination = next.day_state.nominations_today.find(
        (item) => item.nomination_id === event.payload.nomination_id
      );
      if (!nomination) {
        throw new Error(`nomination_not_found:${event.payload.nomination_id}`);
      }
      nomination.vote_total = event.payload.vote_total;
      nomination.threshold = event.payload.threshold;
      next.day_state.active_vote = null;
      break;
    }
    case 'ExecutionResolutionCompleted': {
      next.day_state.execution_attempted_today = true;
      next.day_state.execution_occurred_today = event.payload.had_execution;
      break;
    }
    case 'ExecutionOccurred': {
      next.execution_history.push({
        day_number: event.payload.day_number,
        player_id: event.payload.player_id,
        nomination_id: event.payload.nomination_id
      });
      next.day_state.execution_attempted_today = true;
      next.day_state.execution_occurred_today = true;
      next.day_state.executed_player_id = event.payload.player_id;
      next.day_state.execution_outcome = 'pending';
      next.day_state.execution_consequences_resolved_today = false;
      break;
    }
    case 'PlayerExecuted': {
      // Execution and death are intentionally separate.
      break;
    }
    case 'PlayerSurvivedExecution': {
      next.day_state.execution_outcome = 'survived';
      next.day_state.execution_consequences_resolved_today = true;
      break;
    }
    case 'ExecutionConsequencesResolved': {
      next.day_state.execution_consequences_resolved_today = true;
      if (event.payload.outcome !== 'none') {
        next.day_state.execution_outcome = event.payload.outcome;
      }
      break;
    }
    case 'PlayerDied': {
      const player = ensure_player(next, event.payload.player_id);
      if (player.alive) {
        player.alive = false;
        player.dead_vote_available = true;
        next.death_history.push({
          player_id: event.payload.player_id,
          day_number: event.payload.day_number,
          night_number: event.payload.night_number,
          reason: event.payload.reason
        });
      }
      break;
    }
    case 'ReminderMarkerApplied': {
      const marker_id = event.payload.marker_id;
      if (next.reminder_markers_by_id[marker_id]) {
        break;
      }

      next.reminder_markers_by_id[marker_id] = {
        marker_id,
        kind: event.payload.kind,
        effect: event.payload.effect,
        note: event.payload.note,
        status: 'active',
        source_player_id: event.payload.source_player_id,
        source_character_id: event.payload.source_character_id,
        target_player_id: event.payload.target_player_id,
        target_scope: event.payload.target_scope,
        authoritative: event.payload.authoritative,
        expires_policy: event.payload.expires_policy,
        expires_at_day_number: event.payload.expires_at_day_number,
        expires_at_night_number: event.payload.expires_at_night_number,
        created_at_event_id: event.event_id,
        cleared_at_event_id: null,
        source_event_id: event.payload.source_event_id,
        metadata: clone_payload(event.payload.metadata)
      };
      if (!next.active_reminder_marker_ids.includes(marker_id)) {
        next.active_reminder_marker_ids.push(marker_id);
      }
      if (event.payload.target_player_id) {
        sync_derived_effect_flags(next, event.payload.target_player_id);
      }
      break;
    }
    case 'ReminderMarkerCleared': {
      clear_marker(next, event.payload.marker_id, event.event_id, 'cleared');
      break;
    }
    case 'ReminderMarkerExpired': {
      clear_marker(next, event.payload.marker_id, event.event_id, 'expired');
      break;
    }
    case 'DrunkApplied': {
      const player = ensure_player(next, event.payload.player_id);
      player.drunk = true;
      break;
    }
    case 'SobrietyRestored': {
      const player = ensure_player(next, event.payload.player_id);
      player.drunk = false;
      break;
    }
    case 'HealthRestored': {
      const player = ensure_player(next, event.payload.player_id);
      player.poisoned = false;
      break;
    }
    case 'PoisonApplied': {
      const player = ensure_player(next, event.payload.player_id);
      player.poisoned = true;
      break;
    }
    case 'PoisonCleared': {
      const player = ensure_player(next, event.payload.player_id);
      player.poisoned = false;
      break;
    }
    case 'DeadVoteConsumed': {
      const player = ensure_player(next, event.payload.player_id);
      if (!player.alive) {
        player.dead_vote_available = false;
      }
      break;
    }
    case 'WakeScheduled': {
      ensure_player(next, event.payload.player_id);
      if (!next.wake_queue.some((item) => item.wake_id === event.payload.wake_id)) {
        next.wake_queue.push({
          wake_id: event.payload.wake_id,
          character_id: event.payload.character_id,
          player_id: event.payload.player_id
        });
      }
      break;
    }
    case 'WakeConsumed': {
      next.wake_queue = next.wake_queue.filter((item) => item.wake_id !== event.payload.wake_id);
      break;
    }
    case 'InterruptScheduled': {
      if (!next.interrupt_queue.some((item) => item.interrupt_id === event.payload.interrupt_id)) {
        next.interrupt_queue.push({
          interrupt_id: event.payload.interrupt_id,
          kind: event.payload.kind,
          source_plugin_id: event.payload.source_plugin_id,
          payload: clone_payload(event.payload.payload)
        });
      }
      break;
    }
    case 'InterruptConsumed': {
      next.interrupt_queue = next.interrupt_queue.filter(
        (item) => item.interrupt_id !== event.payload.interrupt_id
      );
      break;
    }
    case 'PromptQueued': {
      if (next.prompts_by_id[event.payload.prompt_id]) {
        throw new Error(`prompt_id_already_exists:${event.payload.prompt_id}`);
      }
      next.prompts_by_id[event.payload.prompt_id] = {
        prompt_id: event.payload.prompt_id,
        kind: event.payload.kind,
        reason: event.payload.reason,
        visibility: event.payload.visibility,
        options: event.payload.options.map((option) => ({ ...option })),
        status: 'pending',
        created_at_event_id: event.event_id,
        resolved_at_event_id: null,
        resolution_payload: null,
        notes: null
      };
      if (!next.pending_prompts.includes(event.payload.prompt_id)) {
        next.pending_prompts.push(event.payload.prompt_id);
      }
      break;
    }
    case 'PromptResolved': {
      const prompt = next.prompts_by_id[event.payload.prompt_id];
      if (!prompt) {
        throw new Error(`prompt_not_found:${event.payload.prompt_id}`);
      }
      prompt.status = 'resolved';
      prompt.resolved_at_event_id = event.event_id;
      prompt.resolution_payload = {
        selected_option_id: event.payload.selected_option_id,
        freeform: event.payload.freeform
      };
      prompt.notes = event.payload.notes;
      next.pending_prompts = next.pending_prompts.filter((prompt_id) => prompt_id !== event.payload.prompt_id);
      break;
    }
    case 'PromptCancelled': {
      const prompt = next.prompts_by_id[event.payload.prompt_id];
      if (!prompt) {
        throw new Error(`prompt_not_found:${event.payload.prompt_id}`);
      }
      prompt.status = 'cancelled';
      prompt.resolved_at_event_id = event.event_id;
      prompt.notes = event.payload.reason;
      next.pending_prompts = next.pending_prompts.filter((prompt_id) => prompt_id !== event.payload.prompt_id);
      break;
    }
    case 'StorytellerChoiceMade': {
      break;
    }
    case 'StorytellerRulingRecorded': {
      next.storyteller_notes.push({
        note_id: event.event_id,
        prompt_id: event.payload.prompt_id,
        text: event.payload.note,
        created_at_event_id: event.event_id
      });
      break;
    }
    case 'WinCheckCompleted': {
      break;
    }
    case 'GameWon': {
      break;
    }
    case 'ForcedVictoryDeclared': {
      break;
    }
    case 'GameEnded': {
      next.status = 'ended';
      next.phase = 'ended';
      next.subphase = 'complete';
      next.winning_team = event.payload.winning_team;
      next.end_reason = event.payload.reason;
      next.ended_at_event_id = event.event_id;
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
