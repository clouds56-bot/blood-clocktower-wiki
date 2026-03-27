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
- `summary`: short rules summary (shown in docs catalogs)
- `category`: exactly one value from the category taxonomy below
- `timing_windows`: concrete wake/day/trigger windows
- `activation`: one or more from the activation taxonomy below
- `is_once_per_game`: boolean at ability level (not character level)
- `is_once_per_day`: boolean (for day-repeat-limited skills)
- `requires_choice`: boolean
- `target_constraints`: ability-scoped targeting rules
- `can_function_while_dead`: boolean
- `can_trigger_on_death`: boolean
- `visibility`: `storyteller` | `player_private` | `public` | mixed
- `misinformation_policy`: truthful only vs may misinform when drunk/poisoned
- `registration_sensitivity`: whether checks use registration query API
- `outputs`: events, prompts, markers, and/or registration decisions
- `reminders`: reminder marker kinds that this ability may apply/clear

## TB Category Taxonomy

Primary categories (single value per ability):
- `info`: grants information. While drunk/poisoned, outcome may be truthful or misinformation per Storyteller adjudication/rules path.
- `passive`: persistent effect/guard while functional. If source becomes drunk/poisoned, effect is lost immediately; when source returns healthy/sober, effect is restored if still applicable.
- `skill`: activatable ability that may be spent (for example once per game or once per day). If used while drunk/poisoned, spend is consumed and effect may fail.
- `registration`: special passive category for registration behavior (query-time alternate registration responses, no direct active resolution).

## TB Activation Taxonomy

Activation windows and styles (multi-tag allowed):
- `game_setup`: setup-time mutation or seeded hidden state.
- `night_wake`: resolved in night order or wake queue.
- `claim`: explicitly declared day action (public claim path).
- `triggered`: reacts at an event boundary (nomination, vote, death, execution, win check).
- `passive`: continuously evaluated guard/override state.

Optional support tags:
- `protection`
- `kill`
- `registration_provider`
- `vote_constraint`
- `continuity`

## Ability Catalog (TB)

### Townsfolk

- `chef.adjacent_evil_count`
  - `character_id`: `chef`
  - `summary`: first night, learn how many adjacent pairs are evil.
  - `category`: `info`
  - `activation`: `night_wake`
- `empath.alive_neighbor_evil_count`
  - `character_id`: `empath`
  - `summary`: each night, learn how many alive neighbors are evil.
  - `category`: `info`
  - `activation`: `night_wake`
- `fortune_teller.pair_demon_check`
  - `character_id`: `fortune_teller`
  - `summary`: each night, choose 2 players and learn whether either registers as Demon.
  - `category`: `info`
  - `activation`: `night_wake`
- `fortune_teller.red_herring_seed`
  - `character_id`: `fortune_teller`
  - `summary`: at setup, seed one good player as Fortune Teller red herring.
  - `category`: `skill`
  - `activation`: `game_setup`
  - `reminders`: `fortune_teller:red_herring`
- `investigator.minion_pair_info`
  - `character_id`: `investigator`
  - `summary`: first night, learn one of two players is a specific Minion.
  - `category`: `info`
  - `activation`: `night_wake`
  - `reminders`: `investigator:minion`, `investigator:wrong`
- `librarian.outsider_pair_info`
  - `character_id`: `librarian`
  - `summary`: first night, learn one of two players is a specific Outsider (or none in play).
  - `category`: `info`
  - `activation`: `night_wake`
  - `reminders`: `librarian:outsider`, `librarian:wrong`
- `mayor.final_three_no_execution_win`
  - `character_id`: `mayor`
  - `summary`: with 3 alive, if no execution occurs, good wins.
  - `category`: `skill`
  - `activation`: `triggered`
- `mayor.night_death_redirection`
  - `character_id`: `mayor`
  - `summary`: if Mayor would die at night, Storyteller may redirect death.
  - `category`: `skill`
  - `activation`: `triggered`
- `monk.night_protection`
  - `character_id`: `monk`
  - `summary`: each night except first, choose a non-self player safe from Demon tonight.
  - `category`: `skill`
  - `activation`: `night_wake`
  - support tags: `protection`
  - `reminders`: `monk:safe`
- `ravenkeeper.night_death_character_read`
  - `character_id`: `ravenkeeper`
  - `summary`: if killed at night, choose a player and learn their character.
  - `category`: `info`
  - `activation`: `triggered`
- `slayer.public_shot`
  - `character_id`: `slayer`
  - `summary`: once per game by public claim, choose a player; Demon target dies.
  - `category`: `skill`
  - `activation`: `claim`
  - support tags: `kill`
  - `reminders`: `slayer:spent`
- `soldier.demon_kill_immunity`
  - `character_id`: `soldier`
  - `summary`: while functional, Soldier is safe from Demon attacks.
  - `category`: `passive`
  - `activation`: `passive`
  - support tags: `protection`
- `undertaker.executed_character_read`
  - `character_id`: `undertaker`
  - `summary`: each night except first, learn the character of the executed player.
  - `category`: `info`
  - `activation`: `night_wake`
- `virgin.first_nomination_execution`
  - `character_id`: `virgin`
  - `summary`: first time nominated, if nominator is Townsfolk, nominator is executed.
  - `category`: `skill`
  - `activation`: `triggered`
  - `reminders`: `virgin:spent`
- `washerwoman.townsfolk_pair_info`
  - `character_id`: `washerwoman`
  - `summary`: first night, learn one of two players is a specific Townsfolk.
  - `category`: `info`
  - `activation`: `night_wake`
  - `reminders`: `washerwoman:townsfolk`, `washerwoman:wrong`

### Outsiders

- `butler.master_selection`
  - `character_id`: `butler`
  - `summary`: each night, choose a master.
  - `category`: `skill`
  - `activation`: `night_wake`
  - `reminders`: `butler:master`
- `butler.vote_restriction`
  - `character_id`: `butler`
  - `summary`: while functional, Butler may only vote when master votes.
  - `category`: `passive`
  - `activation`: `passive`
  - support tags: `vote_constraint`
- `drunk.perceived_role_substitution`
  - `character_id`: `drunk`
  - `summary`: at setup, Drunk receives a Townsfolk perceived identity instead of true identity.
  - `category`: `registration`
  - `activation`: `game_setup`
  - `reminders`: `drunk:is_the_drunk`
- `drunk.persistent_registration_mask`
  - `character_id`: `drunk`
  - `summary`: Drunk remains an Outsider with perceived Townsfolk identity for role-facing interactions.
  - `category`: `registration`
  - `activation`: `passive`
- `recluse.registration_mask`
  - `character_id`: `recluse`
  - `summary`: Recluse may register as evil and as Minion or Demon per check.
  - `category`: `registration`
  - `activation`: `passive`
  - support tags: `registration_provider`
- `saint.execution_loss_trigger`
  - `character_id`: `saint`
  - `summary`: if Saint is executed and dies while functional, good loses.
  - `category`: `passive`
  - `activation`: `triggered`

### Minions

- `baron.setup_outsider_shift`
  - `character_id`: `baron`
  - `summary`: setup adds 2 Outsiders and removes 2 Townsfolk.
  - `category`: `passive`
  - `activation`: `game_setup`
- `poisoner.night_poison`
  - `character_id`: `poisoner`
  - `summary`: each night, choose a player poisoned tonight and next day.
  - `category`: `skill`
  - `activation`: `night_wake`
  - `reminders`: `poisoner:poisoned`
- `scarlet_woman.demon_takeover`
  - `character_id`: `scarlet_woman`
  - `summary`: if Demon dies with 5+ alive non-travellers, Scarlet Woman becomes Demon.
  - `category`: `passive`
  - `activation`: `triggered`
  - support tags: `continuity`
- `spy.grimoire_view`
  - `character_id`: `spy`
  - `summary`: each night, Spy sees the Grimoire.
  - `category`: `info`
  - `activation`: `night_wake`
- `spy.registration_mask`
  - `character_id`: `spy`
  - `summary`: Spy may register as good and as Townsfolk or Outsider per check, even if dead.
  - `category`: `registration`
  - `activation`: `passive`
  - support tags: `registration_provider`

### Demon

- `imp.night_kill`
  - `character_id`: `imp`
  - `summary`: each night except first, choose a player; chosen player dies if not prevented.
  - `category`: `skill`
  - `activation`: `night_wake`
  - support tags: `kill`
- `imp.self_kill_transfer`
  - `character_id`: `imp`
  - `summary`: if Imp kills self this way, an alive Minion becomes Imp.
  - `category`: `skill`
  - `activation`: `triggered`
  - support tags: `continuity`

## Metadata Migration Rules (Character -> Ability)

The following fields should be treated as ability-scoped by default:
- `is_once_per_game`
- `is_once_per_day`
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
- claim-based behavior is represented with activation `claim`;
- each ability entry declares both `category` and `activation`;
- docs-visible catalog rows include `ability_id` and `character_id`;
- docs-facing catalog rows include `summary` for each ability;
- category tags remain deterministic and non-overlapping in meaning.
