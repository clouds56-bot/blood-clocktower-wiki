import type { CharacterPlugin, PluginResult } from '../contracts.js';
import type { PlayerState } from '../../domain/types.js';
import { build_ravenkeeper_reveal_prompt } from './ravenkeeper.js';

const IMP_PROMPT_PREFIX = 'plugin:imp';
const IMP_TRANSFER_PROMPT_PREFIX = 'plugin:imp:transfer_target';
const IMP_TRANSFER_MARKER_KIND = 'imp:self_kill_transfer_pending';

function night_time_key(night_number: number): string {
  return `n${night_number}`;
}

function build_imp_prompt_key(night_number: number, player_id: string): string {
  return `plugin:imp:night_kill:${night_time_key(night_number)}:${player_id}`;
}

function build_imp_prompt_id(night_number: number, player_id: string): string {
  return `plugin:imp:night_kill:${night_number}:${player_id}`;
}

export const imp_plugin: CharacterPlugin = {
  metadata: {
    id: 'imp',
    name: 'Imp',
    type: 'demon',
    alignment_at_start: 'evil',
    timing_category: 'each_night_except_first',
    is_once_per_game: false,
    target_constraints: {
      min_targets: 1,
      max_targets: 1,
      allow_self: true,
      require_alive: false,
      allow_travellers: false
    },
    flags: {
      can_function_while_dead: false,
      can_trigger_on_death: false,
      may_cause_drunkenness: false,
      may_cause_poisoning: false,
      may_change_alignment: false,
      may_change_character: true,
      may_register_as_other: false
    }
  },
  hooks: {
    on_night_wake: (context): PluginResult => {
      const options = Object.values(context.state.players_by_id)
        .map((player) => ({
          option_id: player.player_id,
          label: player.display_name
        }));

      return {
        emitted_events: [],
        queued_prompts: [
          {
            prompt_id: build_imp_prompt_id(context.state.night_number, context.player_id),
            prompt_key: build_imp_prompt_key(context.state.night_number, context.player_id),
            kind: 'choice',
            reason: `plugin:imp:choose_night_kill_target:${night_time_key(context.state.night_number)}:${context.player_id}`,
            visibility: 'player',
            options
          }
        ],
        queued_interrupts: []
      };
    },
    on_prompt_resolved: (context): PluginResult => {
      const imp_player_id = parse_imp_prompt_owner_player_id(context.prompt_id);
      if (!imp_player_id && !is_imp_transfer_prompt_id(context.prompt_id)) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (is_imp_transfer_prompt_id(context.prompt_id)) {
        return resolve_imp_transfer_prompt(context);
      }

      if (!imp_player_id) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const imp_player = context.state.players_by_id[imp_player_id];
      if (!imp_player || !imp_player.alive || imp_player.drunk || imp_player.poisoned) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (context.selected_option_id === null) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const target_player = context.state.players_by_id[context.selected_option_id];
      if (!target_player || !target_player.alive) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const target_is_poisoned_or_drunk = target_player.poisoned || target_player.drunk;
      const target_is_soldier =
        target_player.true_character_id === 'soldier' && !target_is_poisoned_or_drunk;
      const target_protected_by_monk =
        !target_is_poisoned_or_drunk &&
        context.state.active_reminder_marker_ids.some((marker_id) => {
          const marker = context.state.reminder_markers_by_id[marker_id];
          return Boolean(
            marker &&
              marker.status === 'active' &&
              marker.kind === 'monk:safe' &&
              marker.authoritative &&
              marker.target_player_id === context.selected_option_id
          );
        });

      if (target_is_soldier || target_protected_by_monk) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const emitted_events: PluginResult['emitted_events'] = [
        {
          event_type: 'PlayerDied',
          payload: {
            player_id: context.selected_option_id,
            day_number: context.state.day_number,
            night_number: context.state.night_number,
            reason: 'night_death'
          }
        }
      ];

      if (context.selected_option_id === imp_player_id) {
        emitted_events.push({
          event_type: 'ReminderMarkerApplied',
          payload: {
            marker_id: build_imp_transfer_marker_id(context.state, imp_player_id),
            kind: IMP_TRANSFER_MARKER_KIND,
            effect: 'imp_transfer_pending',
            note: 'Imp self-kill transfer pending',
            source_player_id: imp_player_id,
            source_character_id: 'imp',
            target_player_id: imp_player_id,
            target_scope: 'player',
            authoritative: true,
            expires_policy: 'manual',
            expires_at_day_number: null,
            expires_at_night_number: null,
            source_event_id: null,
            metadata: {
              day_number: context.state.day_number,
              night_number: context.state.night_number
            }
          }
        });
      }

      const queued_prompts: PluginResult['queued_prompts'] = [];
      if (
        target_player.true_character_id === 'ravenkeeper' &&
        !target_player.poisoned &&
        !target_player.drunk
      ) {
        queued_prompts.push(build_ravenkeeper_reveal_prompt(context.state, target_player.player_id));
      }

      return {
        emitted_events,
        queued_prompts,
        queued_interrupts: []
      };
    },
    on_player_died: (context): PluginResult => {
      const dead_player = context.state.players_by_id[context.player_id];
      if (!dead_player || dead_player.alive || dead_player.true_character_id !== 'imp') {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const pending_marker = context.state.active_reminder_marker_ids
        .map((marker_id) => context.state.reminder_markers_by_id[marker_id])
        .find((marker) => {
          return Boolean(
            marker &&
              marker.status === 'active' &&
              marker.kind === IMP_TRANSFER_MARKER_KIND &&
              marker.source_player_id === dead_player.player_id
          );
        });

      if (!pending_marker) {
        return {
          emitted_events: [],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      const alive_evil_minions = list_alive_evil_minions(context.state, dead_player.player_id);
      const scarlet_woman_target = alive_evil_minions.find(
        (player) => player.true_character_id === 'scarlet_woman'
      );

      if (scarlet_woman_target) {
        return {
          emitted_events: [
            ...build_imp_transfer_events(context.state, dead_player.player_id, scarlet_woman_target.player_id),
            {
              event_type: 'ReminderMarkerCleared',
              payload: {
                marker_id: pending_marker.marker_id,
                reason: 'imp_transfer_resolved'
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      if (alive_evil_minions.length === 0) {
        return {
          emitted_events: [
            {
              event_type: 'ReminderMarkerCleared',
              payload: {
                marker_id: pending_marker.marker_id,
                reason: 'imp_transfer_no_target'
              }
            }
          ],
          queued_prompts: [],
          queued_interrupts: []
        };
      }

      return {
        emitted_events: [],
        queued_prompts: [
          {
            prompt_id: build_imp_transfer_prompt_id(context.state, dead_player.player_id),
            kind: 'choice',
            reason: 'plugin:imp:choose transfer target',
            visibility: 'storyteller',
            options: alive_evil_minions.map((player) => ({
              option_id: player.player_id,
              label: player.display_name
            }))
          }
        ],
        queued_interrupts: []
      };
    }
  }
};

export function is_imp_prompt_id(prompt_id: string): boolean {
  return prompt_id.startsWith(`${IMP_PROMPT_PREFIX}:night_kill:`) ||
    /^plugin:imp:night_kill:n\d+:[a-z0-9_-]+$/.test(prompt_id);
}

function parse_imp_prompt_owner_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  if (parts.length >= 5 && parts[0] === 'plugin' && parts[1] === 'imp' && parts[2] === 'night_kill') {
    return parts[4] ?? null;
  }
  if (parts.length >= 5 && parts[0] === 'plugin' && parts[1] === 'imp' && parts[2] === 'night_kill' && /^n\d+$/.test(parts[3] ?? '')) {
    return parts[4] ?? null;
  }
  if (parts.length < 5) {
    return null;
  }
  return null;
}

function resolve_imp_transfer_prompt(
  context: Parameters<NonNullable<CharacterPlugin['hooks']['on_prompt_resolved']>>[0]
): PluginResult {
  const dead_imp_id = parse_imp_transfer_prompt_dead_player_id(context.prompt_id);
  if (!dead_imp_id || !context.selected_option_id) {
    return {
      emitted_events: [],
      queued_prompts: [],
      queued_interrupts: []
    };
  }

  const dead_imp = context.state.players_by_id[dead_imp_id];
  const target = context.state.players_by_id[context.selected_option_id];
  if (!dead_imp || dead_imp.alive || dead_imp.true_character_id !== 'imp' || !target || !target.alive) {
    return {
      emitted_events: [],
      queued_prompts: [],
      queued_interrupts: []
    };
  }

  if (target.true_alignment !== 'evil' || target.true_character_type !== 'minion') {
    return {
      emitted_events: [],
      queued_prompts: [],
      queued_interrupts: []
    };
  }

  const pending_marker = find_imp_transfer_pending_marker(context.state, dead_imp_id);

  return {
    emitted_events: [
      ...build_imp_transfer_events(context.state, dead_imp_id, target.player_id),
      ...(pending_marker
        ? [
            {
              event_type: 'ReminderMarkerCleared' as const,
              payload: {
                marker_id: pending_marker.marker_id,
                reason: 'imp_transfer_resolved'
              }
            }
          ]
        : [])
    ],
    queued_prompts: [],
    queued_interrupts: []
  };
}

function build_imp_transfer_events(
  state: Parameters<typeof build_ravenkeeper_reveal_prompt>[0],
  dead_imp_id: string,
  target_player_id: string
): PluginResult['emitted_events'] {
  const dead_imp = state.players_by_id[dead_imp_id];
  if (!dead_imp || !dead_imp.true_character_id || !dead_imp.true_character_type) {
    return [];
  }

  return [
    {
      event_type: 'CharacterAssigned',
      payload: {
        player_id: dead_imp_id,
        true_character_id: dead_imp.true_character_id,
        true_character_type: dead_imp.true_character_type,
        is_demon: false
      }
    },
    {
      event_type: 'CharacterAssigned',
      payload: {
        player_id: target_player_id,
        true_character_id: dead_imp.true_character_id,
        true_character_type: dead_imp.true_character_type,
        is_demon: true
      }
    }
  ];
}

function is_imp_transfer_prompt_id(prompt_id: string): boolean {
  return prompt_id.startsWith(IMP_TRANSFER_PROMPT_PREFIX);
}

function parse_imp_transfer_prompt_dead_player_id(prompt_id: string): string | null {
  const parts = prompt_id.split(':');
  if (parts.length < 6) {
    return null;
  }
  if (parts[0] !== 'plugin' || parts[1] !== 'imp' || parts[2] !== 'transfer_target') {
    return null;
  }
  return parts[5] ?? null;
}

function build_imp_transfer_prompt_id(
  state: Parameters<typeof build_ravenkeeper_reveal_prompt>[0],
  dead_imp_id: string
): string {
  return `${IMP_TRANSFER_PROMPT_PREFIX}:${state.night_number}:${state.day_number}:${dead_imp_id}`;
}

function build_imp_transfer_marker_id(
  state: Parameters<typeof build_ravenkeeper_reveal_prompt>[0],
  imp_player_id: string
): string {
  return `plugin:imp:transfer_pending:${state.night_number}:${state.day_number}:${imp_player_id}`;
}

function list_alive_evil_minions(
  state: Parameters<typeof build_ravenkeeper_reveal_prompt>[0],
  exclude_player_id: string
): PlayerState[] {
  return state.seat_order
    .map((player_id) => state.players_by_id[player_id])
    .filter((player): player is PlayerState => {
      return Boolean(
        player &&
          player.alive &&
          player.player_id !== exclude_player_id &&
          player.true_alignment === 'evil' &&
          player.true_character_type === 'minion'
      );
    });
}

function find_imp_transfer_pending_marker(
  state: Parameters<typeof build_ravenkeeper_reveal_prompt>[0],
  dead_imp_id: string
) {
  return state.active_reminder_marker_ids
    .map((marker_id) => state.reminder_markers_by_id[marker_id])
    .find((marker) => {
      return Boolean(
        marker &&
          marker.status === 'active' &&
          marker.kind === IMP_TRANSFER_MARKER_KIND &&
          marker.source_player_id === dead_imp_id
      );
    });
}
