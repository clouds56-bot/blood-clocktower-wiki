import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Command } from '../domain/commands.js';
import type { Alignment } from '../domain/types.js';

export type CharacterType = 'townsfolk' | 'outsider' | 'minion' | 'demon' | 'traveller';

export interface EditionSetupData {
  characters: {
    townsfolk: string[];
    outsider: string[];
    minion: string[];
    demon: string[];
  };
}

export interface SetupCounts {
  townsfolk: number;
  outsiders: number;
  minions: number;
  demon: number;
}

interface SetupRulesData {
  setups: Record<string, SetupCounts>;
}

export interface AssignedCharacter {
  player_id: string;
  true_character_id: string;
  perceived_character_id: string;
  character_type: CharacterType;
  alignment: Alignment;
}

interface PickedCharacter {
  character_id: string;
  character_type: CharacterType;
}

export interface QuickSetupSeedBuild {
  script_id: string;
  edition_id: string;
  resolved_game_id: string;
  player_ids: string[];
  assignments: AssignedCharacter[];
  seed_commands: Array<Omit<Command, 'command_id'>>;
}

interface BuildRandomAssignmentsFromDataOptions {
  script_file_id: 'tb' | 'bmr' | 'snv';
  player_ids: string[];
  edition: EditionSetupData;
  setup: SetupCounts;
  rng?: () => number;
}

interface BuildRandomAssignmentsOptions {
  script_id: string;
  player_ids: string[];
  root_dir?: string;
  rng?: () => number;
}

interface BuildQuickSetupSeedCommandsOptions {
  script_input: string;
  player_num: number;
  game_id?: string;
  root_dir?: string;
  rng?: () => number;
}

function next_random(rng?: () => number): number {
  return rng ? rng() : Math.random();
}

function shuffle<T>(values: T[], rng?: () => number): T[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next_random(rng) * (i + 1));
    const left = next[i];
    const right = next[j];
    if (left === undefined || right === undefined) {
      continue;
    }
    next[i] = right;
    next[j] = left;
  }
  return next;
}

function take_random_unique(pool: string[], count: number, rng?: () => number): string[] {
  if (count === 0) {
    return [];
  }
  if (pool.length < count) {
    throw new Error(`insufficient_characters pool=${pool.length} required=${count}`);
  }
  return shuffle(pool, rng).slice(0, count);
}

export function normalize_script(script: string): string {
  return script.trim().toLowerCase();
}

export function resolve_edition_id(script: string): string {
  if (script === 'tb' || script === 'trouble_brewing') {
    return 'trouble_brewing';
  }
  if (script === 'bmr' || script === 'bad_moon_rising') {
    return 'bad_moon_rising';
  }
  if (script === 'snv' || script === 'sects_and_violets') {
    return 'sects_and_violets';
  }
  return script;
}

export function infer_alignment_from_type(character_type: CharacterType): Alignment {
  if (character_type === 'demon' || character_type === 'minion') {
    return 'evil';
  }
  return 'good';
}

export function is_character_type_token(value: string): value is CharacterType {
  return (
    value === 'townsfolk' ||
    value === 'outsider' ||
    value === 'minion' ||
    value === 'demon' ||
    value === 'traveller'
  );
}

export function build_player_ids(player_num: number): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= player_num; i += 1) {
    ids.push(`p${i}`);
  }
  return ids;
}

function resolve_script_file_id(script: string): 'tb' | 'bmr' | 'snv' | null {
  if (script === 'tb' || script === 'trouble_brewing') {
    return 'tb';
  }
  if (script === 'bmr' || script === 'bad_moon_rising') {
    return 'bmr';
  }
  if (script === 'snv' || script === 'sects_and_violets') {
    return 'snv';
  }
  return null;
}

function repo_root_dir(): string {
  const current_file = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(current_file), '../../..');
}

function read_json<T>(file_path: string): T {
  const content = readFileSync(file_path, 'utf8');
  return JSON.parse(content) as T;
}

function apply_tb_setup_modifiers(setup: SetupCounts, minion_ids: string[]): SetupCounts {
  if (!minion_ids.includes('baron')) {
    return setup;
  }

  const townsfolk = setup.townsfolk - 2;
  const outsiders = setup.outsiders + 2;

  if (townsfolk < 0) {
    throw new Error(`invalid_baron_setup_modifier townsfolk=${townsfolk}`);
  }

  return {
    ...setup,
    townsfolk,
    outsiders
  };
}

function assign_tb_perceived_characters(
  assignments: AssignedCharacter[],
  edition: EditionSetupData,
  rng?: () => number
): AssignedCharacter[] {
  const in_play_townsfolk = new Set(
    assignments
      .filter((assignment) => assignment.character_type === 'townsfolk')
      .map((assignment) => assignment.true_character_id)
  );

  return assignments.map((assignment) => {
    if (assignment.true_character_id !== 'drunk') {
      return assignment;
    }

    const out_of_play_townsfolk = edition.characters.townsfolk.filter(
      (character_id) => !in_play_townsfolk.has(character_id)
    );
    const perceived_pool =
      out_of_play_townsfolk.length > 0 ? out_of_play_townsfolk : edition.characters.townsfolk;
    const perceived_character_id = take_random_unique(perceived_pool, 1, rng)[0];
    if (!perceived_character_id) {
      throw new Error('failed_to_assign_drunk_perceived_character');
    }

    return {
      ...assignment,
      perceived_character_id
    };
  });
}

export function build_random_assignments_from_data(
  options: BuildRandomAssignmentsFromDataOptions
): AssignedCharacter[] {
  const { script_file_id, player_ids, edition, setup, rng } = options;

  const picked_demons = take_random_unique(edition.characters.demon, setup.demon, rng);
  const picked_minions = take_random_unique(edition.characters.minion, setup.minions, rng);
  const setup_after_modifiers =
    script_file_id === 'tb' ? apply_tb_setup_modifiers(setup, picked_minions) : setup;
  const picked_outsiders = take_random_unique(
    edition.characters.outsider,
    setup_after_modifiers.outsiders,
    rng
  );
  const picked_townsfolk = take_random_unique(
    edition.characters.townsfolk,
    setup_after_modifiers.townsfolk,
    rng
  );

  const picked: PickedCharacter[] = [];
  for (const character_id of picked_townsfolk) {
    picked.push({ character_id, character_type: 'townsfolk' });
  }
  for (const character_id of picked_outsiders) {
    picked.push({ character_id, character_type: 'outsider' });
  }
  for (const character_id of picked_minions) {
    picked.push({ character_id, character_type: 'minion' });
  }
  for (const character_id of picked_demons) {
    picked.push({ character_id, character_type: 'demon' });
  }

  if (picked.length !== player_ids.length) {
    throw new Error(`setup_mismatch expected=${player_ids.length} got=${picked.length}`);
  }

  const randomized = shuffle(picked, rng);
  const assignments = randomized.map((item, index) => {
    const player_id = player_ids[index];
    if (!player_id) {
      throw new Error(`player_id_missing_at_index:${index}`);
    }

    return {
      player_id,
      true_character_id: item.character_id,
      perceived_character_id: item.character_id,
      character_type: item.character_type,
      alignment: infer_alignment_from_type(item.character_type)
    } as AssignedCharacter;
  });

  if (script_file_id === 'tb') {
    return assign_tb_perceived_characters(assignments, edition, rng);
  }

  return assignments;
}

export function build_random_assignments(options: BuildRandomAssignmentsOptions): AssignedCharacter[] {
  const { script_id, player_ids, root_dir, rng } = options;
  const script_file_id = resolve_script_file_id(script_id);
  if (!script_file_id) {
    throw new Error(`unsupported_quick_setup_script:${script_id}`);
  }

  const root = root_dir ?? repo_root_dir();
  const edition_path = path.resolve(root, `data/editions/${script_file_id}.json`);
  const setup_path = path.resolve(root, 'data/rules/setup.json');
  const edition = read_json<EditionSetupData>(edition_path);
  const setup_rules = read_json<SetupRulesData>(setup_path);

  const setup_key = `${player_ids.length}_players`;
  const setup = setup_rules.setups[setup_key];
  if (!setup) {
    throw new Error(`unsupported_player_count:${player_ids.length}`);
  }

  const build_options: BuildRandomAssignmentsFromDataOptions = {
    script_file_id,
    player_ids,
    edition,
    setup
  };
  if (rng) {
    build_options.rng = rng;
  }

  return build_random_assignments_from_data(build_options);
}

export function build_tb_setup_marker_commands(
  assignments: AssignedCharacter[],
  rng?: () => number
): Array<Omit<Command, 'command_id'>> {
  const marker_commands: Array<Omit<Command, 'command_id'>> = [];

  for (const assignment of assignments) {
    if (assignment.true_character_id !== 'drunk') {
      continue;
    }

    marker_commands.push({
      command_type: 'ApplyReminderMarker',
      payload: {
        marker_id: `setup:drunk:${assignment.player_id}`,
        kind: 'drunk:is_the_drunk',
        effect: 'drunk',
        note: 'TB setup: the Drunk has no ability.',
        source_player_id: null,
        source_character_id: 'drunk',
        target_player_id: assignment.player_id,
        target_scope: 'player',
        authoritative: true,
        expires_policy: 'manual',
        expires_at_day_number: null,
        expires_at_night_number: null,
        source_event_id: null,
        metadata: {
          setup_effect: true,
          edition: 'tb'
        }
      }
    });
  }

  const fortune_teller = assignments.find((assignment) => assignment.true_character_id === 'fortune_teller');
  if (!fortune_teller) {
    return marker_commands;
  }

  const good_player_ids = assignments
    .filter((assignment) => assignment.alignment === 'good')
    .map((assignment) => assignment.player_id);
  const red_herring_target = take_random_unique(good_player_ids, 1, rng)[0];
  if (!red_herring_target) {
    throw new Error('failed_to_assign_fortune_teller_red_herring');
  }

  marker_commands.push({
    command_type: 'ApplyReminderMarker',
    payload: {
      marker_id: 'setup:fortune_teller:red_herring',
      kind: 'fortune_teller:red_herring',
      effect: 'register_as_demon',
      note: 'TB setup: this good player registers as Demon to the Fortune Teller.',
      source_player_id: fortune_teller.player_id,
      source_character_id: 'fortune_teller',
      target_player_id: red_herring_target,
      target_scope: 'player',
      authoritative: true,
      expires_policy: 'manual',
      expires_at_day_number: null,
      expires_at_night_number: null,
      source_event_id: null,
      metadata: {
        setup_effect: true,
        edition: 'tb',
        registers_as: 'demon',
        for_character_id: 'fortune_teller'
      }
    }
  });

  return marker_commands;
}

export function build_quick_setup_seed_commands(
  options: BuildQuickSetupSeedCommandsOptions
): QuickSetupSeedBuild {
  const script_id = normalize_script(options.script_input);
  const edition_id = resolve_edition_id(script_id);
  const player_ids = build_player_ids(options.player_num);
  const resolved_game_id = options.game_id ?? `${script_id}_${options.player_num}`;

  const assignment_options: BuildRandomAssignmentsOptions = {
    script_id,
    player_ids
  };
  if (options.root_dir) {
    assignment_options.root_dir = options.root_dir;
  }
  if (options.rng) {
    assignment_options.rng = options.rng;
  }

  const assignments = build_random_assignments(assignment_options);

  const seed_commands: Array<Omit<Command, 'command_id'>> = [
    {
      command_type: 'SelectScript',
      payload: {
        script_id
      }
    },
    {
      command_type: 'SelectEdition',
      payload: {
        edition_id
      }
    }
  ];

  for (let i = 0; i < player_ids.length; i += 1) {
    const player_id = player_ids[i];
    if (!player_id) {
      throw new Error(`player_id_missing_at_index:${i}`);
    }

    seed_commands.push({
      command_type: 'AddPlayer',
      payload: {
        player_id,
        display_name: `Player ${i + 1}`
      }
    });
  }

  seed_commands.push({
    command_type: 'SetSeatOrder',
    payload: {
      seat_order: player_ids
    }
  });

  for (const assignment of assignments) {
    seed_commands.push({
      command_type: 'AssignCharacter',
      payload: {
        player_id: assignment.player_id,
        true_character_id: assignment.true_character_id,
        true_character_type: assignment.character_type,
        is_demon: assignment.character_type === 'demon',
        is_traveller: assignment.character_type === 'traveller'
      }
    });
    seed_commands.push({
      command_type: 'AssignPerceivedCharacter',
      payload: {
        player_id: assignment.player_id,
        perceived_character_id: assignment.perceived_character_id
      }
    });
    seed_commands.push({
      command_type: 'AssignAlignment',
      payload: {
        player_id: assignment.player_id,
        true_alignment: assignment.alignment
      }
    });
  }

  const script_file_id = resolve_script_file_id(script_id);
  if (script_file_id === 'tb') {
    seed_commands.push(...build_tb_setup_marker_commands(assignments, options.rng));
  }

  seed_commands.push({
    command_type: 'AdvancePhase',
    payload: {
      phase: 'first_night',
      subphase: 'night_wake_sequence',
      day_number: 0,
      night_number: 1
    }
  });

  return {
    script_id,
    edition_id,
    resolved_game_id,
    player_ids,
    assignments,
    seed_commands
  };
}
