import Table from 'cli-table3';
import type { DomainEvent } from '../domain/events.js';
import type { GameState, PlayerState, PromptState } from '../domain/types.js';
import type { PlayerProjection, PublicProjection, StorytellerProjection } from '../projections/types.js';

const ANSI = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
} as const;

function color_enabled(): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  return Boolean(process.stdout.isTTY);
}

function paint(text: string, color: keyof typeof ANSI): string {
  if (!color_enabled() || color === 'reset') {
    return text;
  }
  return `${ANSI[color]}${text}${ANSI.reset}`;
}

function event_color(event_type: DomainEvent['event_type']): keyof typeof ANSI {
  if (event_type === 'GameEnded' || event_type === 'GameWon' || event_type === 'ForcedVictoryDeclared') {
    return 'magenta';
  }
  if (event_type === 'PlayerDied' || event_type === 'PlayerExecuted') {
    return 'red';
  }
  if (event_type === 'PhaseAdvanced') {
    return 'blue';
  }
  if (
    event_type === 'NominationMade' ||
    event_type === 'VoteOpened' ||
    event_type === 'VoteCast' ||
    event_type === 'VoteClosed'
  ) {
    return 'yellow';
  }
  if (event_type === 'WinCheckCompleted' || event_type === 'ExecutionResolutionCompleted') {
    return 'cyan';
  }
  return 'gray';
}

export function format_state_brief(state: GameState): string {
  const players = Object.values(state.players_by_id);
  const alive_count = players.filter((player) => player.alive).length;
  const dead_count = players.length - alive_count;

  return [
    `game=${state.game_id} status=${state.status}`,
    `phase=${state.phase}/${state.subphase} day=${state.day_number} night=${state.night_number}`,
    `players total=${players.length} alive=${alive_count} dead=${dead_count}`,
    `today nominations=${state.day_state.nominations_today.length} execution_occurred=${state.day_state.execution_occurred_today} outcome=${state.day_state.execution_outcome}`,
    `history executions=${state.execution_history.length} deaths=${state.death_history.length}`,
    `outcome winning_team=${state.winning_team ?? 'none'} end_reason=${state.end_reason ?? 'none'}`
  ].join('\n');
}

export function format_state_json(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

export function format_projection_json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function render_table(head: string[], rows: string[][]): string {
  const table = new Table({ head });
  for (const row of rows) {
    table.push(row);
  }
  return table.toString();
}

function bool_emoji(value: boolean): string {
  return value ? '✅' : '❌';
}

function format_nominations(day_state: PublicProjection['day_state']): string {
  if (day_state.nominations_today.length === 0) {
    return 'nominations: none';
  }

  const table = render_table(
    ['id', 'nominator', 'nominee', 'votes', 'threshold'],
    day_state.nominations_today.map((nomination) => [
      nomination.nomination_id,
      nomination.nominator_player_id,
      nomination.nominee_player_id,
      nomination.vote_total === null ? '-' : String(nomination.vote_total),
      nomination.threshold === null ? '-' : String(nomination.threshold)
    ])
  );

  return ['nominations:', table].join('\n');
}

function format_active_vote(day_state: PublicProjection['day_state']): string {
  if (!day_state.active_vote) {
    return 'active_vote: none';
  }

  const votes = Object.entries(day_state.active_vote.votes_by_player_id)
    .sort(([left], [right]) => left.localeCompare(right));
  const votes_table = votes.length === 0
    ? 'active_votes: none'
    : [
        'active_votes:',
        render_table(
          ['voter', 'vote'],
          votes.map(([player_id, in_favor]) => [player_id, in_favor ? 'yes' : 'no'])
        )
      ].join('\n');

  const summary = `active_vote id=${day_state.active_vote.nomination_id} nominee=${day_state.active_vote.nominee_player_id} opened_by=${day_state.active_vote.opened_by_player_id}`;
  return [summary, votes_table].join('\n');
}

function format_day_summary(projection: PublicProjection): string {
  return [
    `nom_window=${bool_emoji(projection.day_state.nomination_window_open)}`,
    `exec_attempted=${bool_emoji(projection.day_state.execution_attempted_today)}`,
    `exec_occurred=${bool_emoji(projection.day_state.execution_occurred_today)}`,
    `exec_player=${projection.day_state.executed_player_id ?? 'none'}`,
    `exec_outcome=${projection.day_state.execution_outcome}`,
    `exec_resolved=${bool_emoji(projection.day_state.execution_consequences_resolved_today)}`,
    `winning_team=${projection.winning_team ?? 'none'}`,
    `end_reason=${projection.end_reason ?? 'none'}`
  ].join(' ');
}

export function format_public_projection(projection: PublicProjection): string {
  const header = [
    `game=${projection.game_id}`,
    `script=${projection.script_id ?? 'none'}`,
    `edition=${projection.edition_id ?? 'none'}`,
    `phase=${projection.clock.phase}/${projection.clock.subphase}`,
    `day=${projection.clock.day_number} night=${projection.clock.night_number}`
  ].join(' ');

  const players = render_table(
    ['id', 'name', 'alive', 'dead_vote'],
    projection.players.map((player) => [
      player.player_id,
      player.display_name,
      bool_emoji(player.alive),
      bool_emoji(player.dead_vote_available)
    ])
  );

  const day_summary = format_day_summary(projection);

  return [
    header,
    players,
    day_summary,
    format_nominations(projection.day_state),
    format_active_vote(projection.day_state)
  ].join('\n');
}

export function format_player_projection(projection: PlayerProjection): string {
  const base = format_public_projection(projection);
  const self = render_table(
    ['id', 'perceived', 'team'],
    [[
      projection.viewer_player_id,
      projection.self.perceived_character_id ?? 'null',
      projection.self.known_alignment ?? 'null'
    ]]
  );
  return [base, self].join('\n');
}

export function format_storyteller_projection(projection: StorytellerProjection): string {
  const header = [
    `game=${projection.game_id}`,
    `script=${projection.script_id ?? 'none'}`,
    `edition=${projection.edition_id ?? 'none'}`,
    `phase=${projection.clock.phase}/${projection.clock.subphase}`,
    `day=${projection.clock.day_number} night=${projection.clock.night_number}`
  ].join(' ');

  const has_traveller = Object.values(projection.players).some((player) => player.is_traveller);

  const ordered_player_ids = [
    ...projection.seat_order,
    ...Object.keys(projection.players)
      .filter((player_id) => !projection.seat_order.includes(player_id))
      .sort((a, b) => a.localeCompare(b))
  ];

  const rows = ordered_player_ids
    .map((player_id) => projection.players[player_id])
    .filter((player): player is NonNullable<typeof player> => Boolean(player))
    .map((player) => {
      const char = player.true_character_id ?? 'null';
      const perceived = player.perceived_character_id ?? 'null';
      const perceived_display = char === perceived ? '' : perceived;
      const row = [
        player.player_id,
        player.display_name,
        char,
        perceived_display,
        player.true_alignment ?? 'null',
        bool_emoji(player.alive),
        bool_emoji(player.is_demon),
        bool_emoji(player.drunk),
        bool_emoji(player.poisoned)
      ];
      if (has_traveller) {
        row.push(bool_emoji(player.is_traveller));
      }
      return row;
    });

  const player_head = ['id', 'name', 'char', 'perceived', 'team', 'alive', 'demon', 'drunk', 'pois'];
  if (has_traveller) {
    player_head.push('trav');
  }

  const players = render_table(player_head, rows);

  const day_projection: PublicProjection = {
    game_id: projection.game_id,
    script_id: projection.script_id,
    edition_id: projection.edition_id,
    clock: projection.clock,
    players: [],
    seat_order: projection.seat_order,
    day_state: projection.day_state,
    winning_team: projection.winning_team,
    end_reason: projection.end_reason
  };

  const prompts = projection.prompts.length === 0
    ? 'prompts: none'
    : [
        'prompts:',
        render_table(
          ['id', 'kind', 'status', 'vis', 'choice', 'notes'],
          projection.prompts.map((prompt) => [
            prompt.prompt_id,
            prompt.kind,
            prompt.status,
            prompt.visibility,
            prompt.resolution_payload?.selected_option_id ?? '-',
            prompt.notes ?? '-'
          ])
        )
      ].join('\n');

  const notes = projection.storyteller_notes.length === 0
    ? 'notes: none'
    : [
        'notes:',
        render_table(
          ['id', 'prompt_id', 'text'],
          projection.storyteller_notes.map((note) => [note.note_id, note.prompt_id ?? '-', note.text])
        )
      ].join('\n');

  return [
    header,
    players,
    format_day_summary(day_projection),
    format_nominations(projection.day_state),
    format_active_vote(projection.day_state),
    prompts,
    notes
  ].join('\n');
}

export function format_event(event: DomainEvent, index: number): string {
  return `#${index} ${paint(event.event_type, event_color(event.event_type))} ${JSON.stringify(event.payload)}`;
}

export function format_player(player: PlayerState): string {
  return [
    `player_id=${player.player_id} display_name=${player.display_name}`,
    `alive=${player.alive} dead_vote_available=${player.dead_vote_available}`,
    `true_character_id=${player.true_character_id ?? 'null'} perceived_character_id=${player.perceived_character_id ?? 'null'}`,
    `true_alignment=${player.true_alignment ?? 'null'} registered_alignment=${player.registered_alignment ?? 'null'}`,
    `drunk=${player.drunk} poisoned=${player.poisoned} is_demon=${player.is_demon} is_traveller=${player.is_traveller}`
  ].join('\n');
}

export function format_players_table(state: GameState): string {
  const rows = Object.values(state.players_by_id)
    .map((player) => {
      const life = player.alive ? paint('alive', 'green') : paint('dead', 'red');
      return `${player.player_id}\t${player.display_name}\t${life}\tdead_vote=${player.dead_vote_available}`;
    })
    .sort();

  if (rows.length === 0) {
    return 'no players';
  }

  return ['player_id\tdisplay_name\tlife\tdead_vote', ...rows].join('\n');
}

export function format_prompt_list(state: GameState): string {
  if (state.pending_prompts.length === 0) {
    return 'no pending prompts';
  }

  const rows = state.pending_prompts.map((prompt_id) => {
    const prompt = state.prompts_by_id[prompt_id];
    if (!prompt) {
      return `${prompt_id}\t<missing>`;
    }
    return `${prompt.prompt_id}\t${prompt.kind}\t${prompt.visibility}\t${prompt.reason}`;
  });

  return ['prompt_id\tkind\tvisibility\treason', ...rows].join('\n');
}

export function format_prompt(prompt: PromptState): string {
  const options = prompt.options.length === 0
    ? 'none'
    : prompt.options.map((option) => `${option.option_id}:${option.label}`).join(', ');
  const selected_option_id = prompt.resolution_payload?.selected_option_id ?? 'null';
  const freeform = prompt.resolution_payload?.freeform ?? 'null';

  return [
    `prompt_id=${prompt.prompt_id} status=${prompt.status}`,
    `kind=${prompt.kind} visibility=${prompt.visibility}`,
    `reason=${prompt.reason}`,
    `options=${options}`,
    `selected_option_id=${selected_option_id} freeform=${freeform}`,
    `notes=${prompt.notes ?? 'null'} created_at_event_id=${prompt.created_at_event_id} resolved_at_event_id=${prompt.resolved_at_event_id ?? 'null'}`
  ].join('\n');
}

export function format_help(topic: 'phase' | 'all'): string {
  if (topic === 'phase') {
    return [
      paint('phase flow (phase 5):', 'cyan'),
      '  next-phase   (auto: open-noms/open-vote/close-vote/resolve-exec/resolve-conseq when applicable)',
      '  open-noms',
      '  nominate p1 p2',
      '  open-vote',
      '  vote p1 yes  | vote p1 p2 (defaults to yes)',
      '  close-vote',
      '  resolve-exec',
      '  resolve-conseq   (or survive-exec)',
      '  check-win',
      '  end-day'
    ].join('\n');
  }

  return [
    paint('local commands:', 'cyan'),
    '  help [all|phase]',
    '  next-phase | next | n',
    '  new <game_id>',
    '  quick-setup | quick-start | start <script> <player_num> [game_id]',
    '  state [brief|json]',
    '  events [count]',
    '  players',
    '  player <player_id>',
    '  view storyteller|st [--json]',
    '  view public [--json]',
    '  view player <player_id> [--json] | view <player_id> [--json]',
    '  prompts',
    '  prompt <prompt_id>',
    '  quit | exit',
    '',
    paint('engine setup commands:', 'cyan'),
    '  select-script <script_id>',
    '  select-edition <edition_id>',
    '  add-player <player_id> <display_name>',
    '  set-seat-order <player_id...>',
    '  assign-character <player_id> <character_id> [--demon] [--traveller]',
    '  assign-perceived <player_id> <character_id>',
    '  assign-alignment <player_id> <good|evil>',
    '  setup-player <player_id> <true_character_id> [perceived_character_id] <townsfolk|outsider|minion|demon|traveller> [good|evil]',
    '  phase <phase> <subphase> <day_number> <night_number>',
    '',
    paint('engine day/death/win commands:', 'cyan'),
    '  open-noms [day_number]',
    '  nominate | nom <nominator_id> <nominee_id>',
    '  nominate | nom <nomination_id> <nominator_id> <nominee_id>',
    '  nominate | nom <nomination_id> <day_number> <nominator_id> <nominee_id>',
    '  open-vote [nomination_id] [opened_by_id]',
    '  vote <voter_id> <yes|no> | vote <voter_id...> [yes|no] | vote <nomination_id> <voter_id> <yes|no>',
    '  close-vote [nomination_id] [day_number]',
    '  resolve-exec [day_number]',
    '  resolve-conseq [day_number]',
    '  apply-death <player_id> <execution|night_death|ability|storyteller> [day_number] [night_number]',
    '  survive-exec [player_id] [day_number]',
    '  check-win [day_number] [night_number]',
    '  force-win <good|evil> [rationale...]',
    '  create-prompt <prompt_id> <kind> <storyteller|player|public> <reason...>',
    '  resolve-prompt <prompt_id> [selected_option_id|-] [notes...]',
    '  cancel-prompt <prompt_id> <reason...>',
    '  end-day [day_number]'
  ].join('\n');
}
