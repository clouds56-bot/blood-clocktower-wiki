export const CLI_USAGE = {
  help: 'help [all|phase]',
  next: 'next [subphase|phase|day|night] [--auto|--auto-prompt]',
  state: 'state [brief|json]',
  events: 'events [count]',
  players: 'players',
  player: 'player <player_id>',
  new_game: 'new <game_id>',
  quick_setup: 'quick-setup <script> <player_num> [game_id]',
  quit: 'quit | exit',

  view_storyteller: 'view storyteller|st [--json]',
  view_public: 'view public [--json]',
  view_player: 'view player <player_id> [--json] | view <player_id> [--json]',

  select_script: 'select-script <script_id>',
  select_edition: 'select-edition <edition_id>',
  add_player: 'add-player <player_id> <display_name>',
  set_seat_order: 'set-seat-order <player_id...>',
  assign_character: 'assign-character <player_id> <character_id> [--demon] [--traveller]',
  assign_perceived: 'assign-perceived <player_id> <character_id>',
  assign_alignment: 'assign-alignment <player_id> <good|evil>',
  setup_player:
    'setup-player <player_id> <true_character_id> [perceived_character_id] <townsfolk|outsider|minion|demon|traveller> [good|evil]',
  phase: 'phase <phase> <subphase> <day_number> <night_number>',

  open_noms: 'open-noms [day_number]',
  nominate_short: 'nominate | nom <nominator_id> <nominee_id>',
  nominate_with_id: 'nominate | nom <nomination_id> <nominator_id> <nominee_id>',
  nominate_full:
    'nominate | nom <nomination_id> <day_number> <nominator_id> <nominee_id>',
  open_vote: 'open-vote [nomination_id] [opened_by_id]',
  vote:
    'vote <voter_id> <yes|no> | vote <voter_id...> [yes|no] | vote <nomination_id> <voter_id> <yes|no>',
  claim_ability: 'claim | claim-ability | cliam-ability <claimant_player_id> <claimed_character_id>',
  close_vote: 'close-vote [nomination_id] [day_number]',
  resolve_exec: 'resolve-exec [day_number]',
  resolve_conseq: 'resolve-conseq [day_number]',
  apply_death:
    'apply-death <player_id> <execution|night_death|ability|storyteller> [day_number] [night_number]',
  survive_exec: 'survive-exec [player_id] [day_number]',
  check_win: 'check-win [day_number] [night_number]',
  force_win: 'force-win <good|evil> [rationale...]',
  end_day: 'end-day [day_number]',

  prompts: 'prompts',
  prompt: 'prompt <prompt_key>',
  create_prompt:
    'create-prompt <prompt_key> <kind> <storyteller|player|public> <reason...>',
  resolve_prompt:
    'resolve-prompt | choose | ch [prompt_key] [selected_option_id|-] [notes...]',
  choose_short: 'choose/ch with no args picks random option',
  cancel_prompt: 'cancel-prompt <prompt_key> <reason...>',

  markers: 'markers | reminders',
  marker: 'marker | reminder <marker_id>',
  apply_marker:
    'apply-marker | apply-reminder <marker_id> <kind> <effect> [target_player_id] [source_character_id] [note...]',
  clear_marker: 'clear-marker | clear-reminder <marker_id> [reason...]',
  sweep_markers: 'sweep-markers | sweep-reminders'
} as const;

export interface HelpSection {
  title: string;
  lines: string[];
}

export function help_sections_for_topic(topic: 'phase' | 'all'): HelpSection[] {
  if (topic === 'phase') {
    return [
      {
        title: 'phase flow (phase 6):',
        lines: [
          CLI_USAGE.next,
          '  - default: one deterministic step; blocked by pending prompts',
          '  - --auto / --auto-prompt: resolve pending prompts repeatedly until empty',
          '  - subphase: one subphase progression step (default)',
          '  - phase: advance until phase changes',
          '  - day/night: advance until next future boundary',
          CLI_USAGE.open_noms,
          'nominate p1 p2',
          'open-vote',
          'vote p1 yes  | vote p1 p2 (defaults to yes)',
          'close-vote',
          'resolve-exec',
          'resolve-conseq   (or survive-exec)',
          'check-win',
          'end-day'
        ]
      }
    ];
  }

  return [
    {
      title: 'local commands:',
      lines: [
        CLI_USAGE.help,
        CLI_USAGE.next,
        CLI_USAGE.new_game,
        CLI_USAGE.quick_setup,
        CLI_USAGE.state,
        CLI_USAGE.events,
        CLI_USAGE.players,
        CLI_USAGE.player,
        CLI_USAGE.view_storyteller,
        CLI_USAGE.view_public,
        CLI_USAGE.view_player,
        CLI_USAGE.prompts,
        CLI_USAGE.prompt,
        CLI_USAGE.markers,
        CLI_USAGE.marker,
        CLI_USAGE.quit
      ]
    },
    {
      title: 'engine setup commands:',
      lines: [
        CLI_USAGE.select_script,
        CLI_USAGE.select_edition,
        CLI_USAGE.add_player,
        CLI_USAGE.set_seat_order,
        CLI_USAGE.assign_character,
        CLI_USAGE.assign_perceived,
        CLI_USAGE.assign_alignment,
        CLI_USAGE.setup_player,
        CLI_USAGE.phase
      ]
    },
    {
      title: 'engine day/death/win commands:',
      lines: [
        CLI_USAGE.open_noms,
        CLI_USAGE.nominate_short,
        CLI_USAGE.nominate_with_id,
        CLI_USAGE.nominate_full,
        CLI_USAGE.open_vote,
        CLI_USAGE.vote,
        CLI_USAGE.claim_ability,
        CLI_USAGE.close_vote,
        CLI_USAGE.resolve_exec,
        CLI_USAGE.resolve_conseq,
        CLI_USAGE.apply_death,
        CLI_USAGE.survive_exec,
        CLI_USAGE.check_win,
        CLI_USAGE.force_win,
        CLI_USAGE.end_day
      ]
    },
    {
      title: 'engine prompt/marker commands:',
      lines: [
        CLI_USAGE.create_prompt,
        `${CLI_USAGE.resolve_prompt} (${CLI_USAGE.choose_short})`,
        CLI_USAGE.cancel_prompt,
        CLI_USAGE.apply_marker,
        CLI_USAGE.clear_marker,
        CLI_USAGE.sweep_markers
      ]
    }
  ];
}
