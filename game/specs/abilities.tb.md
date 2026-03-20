# Trouble Brewing Ability Catalog Spec

## Purpose

This spec splits Trouble Brewing behavior into **ability-level contracts**.

Rationale:
- some metadata currently attached to characters actually belongs to one specific ability;
- one character may have multiple independent abilities with different timing and visibility behavior;
- ability-level contracts are easier to map to hooks, prompts, and reminders deterministically.

This file is additive to:
- `game/specs/edition.tb.md`
- `game/specs/edition.tb.plan.md`

## Ability-First Model

Each TB character is modeled as one or more `ability` entries.

Each ability entry should include:
- `ability_id`: stable id, format `<character_id>.<ability_name>`
- `character_id`: owning character
- `summary`: short rules summary
- `categories`: one or more from the taxonomy below
- `timing_windows`: concrete wake/day/trigger windows
- `activation`: `active` | `passive` | `triggered`
- `is_once_per_game`: boolean at ability level (not character level)
- `requires_choice`: boolean
- `target_constraints`: ability-scoped targeting rules
- `can_function_while_dead`: boolean
- `can_trigger_on_death`: boolean
- `visibility`: `storyteller` | `player_private` | `public` | mixed
- `misinformation_policy`: truthful only vs may misinform when drunk/poisoned
- `registration_sensitivity`: whether checks use registration query API
- `outputs`: events, prompts, markers, and/or registration decisions

## TB Ability Taxonomy

Primary categories (multi-tag allowed):
- `info`: grants private information
- `passive`: always-on condition/guard/override
- `night_wake`: resolved in night order or wake queue
- `game_setup`: setup-time mutation or seeded hidden state
- `claim`: explicitly declared/claimed day ability
- `triggered`: reacts to an event boundary (nomination, death, execution, win check)

Optional support tags:
- `protection`
- `kill`
- `registration_provider`
- `vote_constraint`
- `continuity`

## Ability Catalog (TB)

### Townsfolk

- `chef.adjacent_evil_count`
  - categories: `info`, `night_wake`
- `empath.alive_neighbor_evil_count`
  - categories: `info`, `night_wake`
- `fortune_teller.pair_demon_check`
  - categories: `info`, `night_wake`
- `fortune_teller.red_herring_seed`
  - categories: `game_setup`
- `investigator.minion_pair_info`
  - categories: `info`, `night_wake`
- `librarian.outsider_pair_info`
  - categories: `info`, `night_wake`
- `mayor.final_three_no_execution_win`
  - categories: `passive`, `triggered`
- `mayor.night_death_redirection`
  - categories: `passive`, `triggered`
- `monk.night_protection`
  - categories: `night_wake`, `protection`
- `ravenkeeper.night_death_character_read`
  - categories: `info`, `triggered`
- `slayer.public_shot`
  - categories: `claim`, `triggered`, `kill`
- `soldier.demon_kill_immunity`
  - categories: `passive`, `protection`
- `undertaker.executed_character_read`
  - categories: `info`, `night_wake`
- `virgin.first_nomination_execution`
  - categories: `passive`, `triggered`
- `washerwoman.townsfolk_pair_info`
  - categories: `info`, `night_wake`

### Outsiders

- `butler.master_selection`
  - categories: `night_wake`
- `butler.vote_restriction`
  - categories: `passive`, `vote_constraint`, `triggered`
- `drunk.perceived_role_substitution`
  - categories: `game_setup`
- `drunk.persistent_drunkenness`
  - categories: `passive`
- `recluse.registration_mask`
  - categories: `passive`, `registration_provider`
- `saint.execution_loss_trigger`
  - categories: `passive`, `triggered`

### Minions

- `baron.setup_outsider_shift`
  - categories: `game_setup`
- `poisoner.night_poison`
  - categories: `night_wake`
- `scarlet_woman.demon_takeover`
  - categories: `passive`, `triggered`, `continuity`
- `spy.grimoire_view`
  - categories: `info`, `night_wake`
- `spy.registration_mask`
  - categories: `passive`, `registration_provider`

### Demon

- `imp.night_kill`
  - categories: `night_wake`, `kill`
- `imp.self_kill_transfer`
  - categories: `triggered`, `continuity`

## Metadata Migration Rules (Character -> Ability)

The following fields should be treated as ability-scoped by default:
- `is_once_per_game`
- `requires_choice`
- `target_constraints`
- `can_function_while_dead`
- `can_trigger_on_death`
- `may_cause_drunkenness`
- `may_cause_poisoning`
- `may_change_alignment`
- `may_change_character`
- `may_register_as_other`

Character-level metadata should be limited to identity and baseline classification:
- `id`
- `name`
- `type`
- `alignment_at_start`

If a character has only one ability, ability-scoped fields may mirror character-level metadata as a temporary compatibility bridge.

## Runtime Mapping Notes

Current runtime metadata in `game/src/plugins/contracts.ts` is character-scoped (`timing_category`, flags, target constraints).

Target direction for TB:
- keep runtime compatible for now;
- treat this spec as the source of truth for future ability-level metadata refactor;
- map each `ability_id` to one or more hooks (`on_night_wake`, `on_prompt_resolved`, `on_nomination_made`, `on_pre_player_died`, `on_player_died`, `on_registration_query`, etc.).

## Acceptance Criteria

- every TB character has at least one `ability_id` in this file;
- multi-ability characters split behavior into separate ability entries;
- setup-only effects are represented as `game_setup` abilities;
- registration behavior is represented as dedicated `registration_provider` abilities;
- claim-based behavior is represented as `claim` abilities;
- category tags remain deterministic and non-overlapping in meaning.
