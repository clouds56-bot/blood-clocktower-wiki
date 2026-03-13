import assert from 'node:assert/strict';
import test from 'node:test';

import type { ApplyReminderMarkerCommand, Command } from '../../src/domain/commands.js';
import {
  build_random_assignments_from_data,
  build_tb_setup_marker_commands,
  infer_alignment_from_type,
  type EditionSetupData,
  type AssignedCharacter,
  type SetupCounts
} from '../../src/cli/quick-setup.js';

function make_rng(sequence: number[]): () => number {
  let index = 0;
  return () => {
    const value = sequence[index % sequence.length];
    index += 1;
    return value ?? 0;
  };
}

function is_apply_reminder_marker_command(
  command: Omit<Command, 'command_id'>
): command is Omit<ApplyReminderMarkerCommand, 'command_id'> {
  return command.command_type === 'ApplyReminderMarker';
}

test('TB Baron setup modifier adjusts townsfolk/outsider counts', () => {
  const edition: EditionSetupData = {
    characters: {
      townsfolk: ['chef', 'empath', 'fortune_teller'],
      outsider: ['drunk', 'saint'],
      minion: ['baron'],
      demon: ['imp']
    }
  };
  const setup: SetupCounts = {
    townsfolk: 3,
    outsiders: 0,
    minions: 1,
    demon: 1
  };
  const player_ids = ['p1', 'p2', 'p3', 'p4', 'p5'];

  const assignments = build_random_assignments_from_data({
    script_file_id: 'tb',
    player_ids,
    edition,
    setup,
    rng: make_rng([0.13, 0.71, 0.42, 0.9])
  });

  const townsfolk_count = assignments.filter(
    (assignment) => assignment.character_type === 'townsfolk'
  ).length;
  const outsider_count = assignments.filter(
    (assignment) => assignment.character_type === 'outsider'
  ).length;

  assert.equal(townsfolk_count, 1);
  assert.equal(outsider_count, 2);

  const drunk_assignment = assignments.find((assignment) => assignment.true_character_id === 'drunk');
  assert.ok(drunk_assignment);
  assert.ok(edition.characters.townsfolk.includes(drunk_assignment.perceived_character_id));
});

test('TB setup marker builder creates Drunk and red herring markers', () => {
  const assignments: AssignedCharacter[] = [
    {
      player_id: 'p1',
      true_character_id: 'fortune_teller',
      perceived_character_id: 'fortune_teller',
      character_type: 'townsfolk',
      alignment: infer_alignment_from_type('townsfolk')
    },
    {
      player_id: 'p2',
      true_character_id: 'drunk',
      perceived_character_id: 'chef',
      character_type: 'outsider',
      alignment: infer_alignment_from_type('outsider')
    },
    {
      player_id: 'p3',
      true_character_id: 'baron',
      perceived_character_id: 'baron',
      character_type: 'minion',
      alignment: infer_alignment_from_type('minion')
    },
    {
      player_id: 'p4',
      true_character_id: 'chef',
      perceived_character_id: 'chef',
      character_type: 'townsfolk',
      alignment: infer_alignment_from_type('townsfolk')
    },
    {
      player_id: 'p5',
      true_character_id: 'imp',
      perceived_character_id: 'imp',
      character_type: 'demon',
      alignment: infer_alignment_from_type('demon')
    }
  ];

  const marker_commands = build_tb_setup_marker_commands(assignments, make_rng([0.2, 0.8])).filter(
    is_apply_reminder_marker_command
  );

  const drunk_marker = marker_commands.find(
    (command) =>
      command.command_type === 'ApplyReminderMarker' &&
      command.payload.kind === 'drunk:is_the_drunk' &&
      command.payload.effect === 'drunk'
  );
  const red_herring_marker = marker_commands.find(
    (command) =>
      command.command_type === 'ApplyReminderMarker' &&
      command.payload.kind === 'fortune_teller:red_herring'
  );

  assert.ok(drunk_marker);
  assert.ok(red_herring_marker);

  if (drunk_marker && red_herring_marker) {
    assert.equal(drunk_marker.payload.target_player_id, 'p2');
    assert.equal(red_herring_marker.payload.source_player_id, 'p1');
    assert.ok(['p1', 'p2', 'p4'].includes(red_herring_marker.payload.target_player_id ?? ''));
  }
});
