# Blood on the Clocktower App Rules Spec

## Purpose

This document is the implementation-facing rules contract for building a Blood on the Clocktower game-running app from the materials in `data/rules`.

It is intentionally written as a product and engineering spec, not as player-facing rules text.

Use this document as the single source of truth for:

- game setup and player-count rules;
- game phases and turn flow;
- public vs hidden state;
- nomination, voting, execution, death, and win conditions;
- core state systems such as alignment, character, death, drunkenness, poisoning, and madness;
- the boundary between deterministic engine behavior and Storyteller adjudication.

## Scope and limits

This spec is derived from the general rules content in `data/rules`. It is sufficient to design the app shell, state model, action system, hidden-information model, voting flow, phase engine, and Storyteller tooling.

However, the source material in `data/rules` does not contain the full per-character almanac for every character. Therefore:

- this document defines the generic engine contract for character abilities;
- concrete character logic must be supplied by separate character data and handlers;
- if a character-specific interaction is not stated here, the app must support human Storyteller adjudication instead of inventing logic.

In practice: build the app so the core game loop is rules-driven, while character resolution is plugin-driven and may require Storyteller choices.

## Design goals for the app

The app should support at least these modes:

- a full Storyteller console with complete hidden state;
- a player view that reveals only allowed information;
- optionally a public town-square view for alive/dead state, votes, nominations, and day status.

The app must preserve the central Clocktower rule that players can say anything publicly or privately, while the engine tracks only official state and official disclosures.

## Canonical game concepts

### Core entities

- `Game`: one match.
- `Player`: any seated participant with an in-play character, excluding the Storyteller.
- `Storyteller`: the game runner and final adjudicator when judgment is needed.
- `Character`: the role assigned to a player.
- `Alignment`: `good` or `evil`.
- `Type`: `townsfolk`, `outsider`, `minion`, `demon`, `traveller`, or `fabled`.
- `Edition` or `Script`: the available character pool for the game.
- `Grimoire`: hidden authoritative state.

### Core player states

Each player may have multiple independent states at once.

- life state: `alive` or `dead`;
- alignment state: `good` or `evil`;
- character state: current character identity;
- sobriety state: `sober` or `drunk`;
- health state: `healthy` or `poisoned`;
- madness state: `mad` or not mad, when relevant.

Important independence rules:

- character and alignment are independent;
- drunkenness and poisoning are independent of character;
- alive/dead is independent of drunk/poisoned;
- a player can be both drunk and poisoned.

## Recommended architecture

Split the system into:

- `rules engine`: deterministic generic rules in this document;
- `character engine`: per-character handlers and metadata;
- `storyteller adjudication layer`: explicit prompts where the rules allow discretion;
- `visibility layer`: computes what each player, the Storyteller, and the public may see.

The engine should be event-sourced or at least event-oriented. This game has many temporary, reversible, and timing-sensitive effects.

## Game setup

### Player counts

Standard setup counts apply to 5-15 non-Traveller players.

| Players | Townsfolk | Outsiders | Minions | Demons |
| --- | ---: | ---: | ---: | ---: |
| 5 | 3 | 0 | 1 | 1 |
| 6 | 3 | 1 | 1 | 1 |
| 7 | 5 | 0 | 1 | 1 |
| 8 | 5 | 1 | 1 | 1 |
| 9 | 5 | 2 | 1 | 1 |
| 10 | 7 | 0 | 2 | 1 |
| 11 | 7 | 1 | 2 | 1 |
| 12 | 7 | 2 | 2 | 1 |
| 13 | 9 | 0 | 3 | 1 |
| 14 | 9 | 1 | 3 | 1 |
| 15 | 9 | 2 | 3 | 1 |

Rules:

- Trouble Brewing requires at least 5 players.
- Other standard editions are recommended at 7 or more players.
- Travellers do not count toward the base setup counts.
- More than 15 players requires using Travellers.

### Seating and order

Players sit in a definite circular order.

The engine must store a stable seating order because many rules depend on clockwise, counterclockwise, neighbors, alive neighbors, vote counting order, and night targeting.

Required derived relations:

- `clockwiseNeighbor(player)`
- `counterclockwiseNeighbor(player)`
- `neighbors(player)`
- `aliveNeighbors(player)`: nearest alive player clockwise and nearest alive player counterclockwise, skipping dead players between them.

### Script or edition selection

Before play starts, the Storyteller chooses an edition or custom script.

The app must support:

- standard editions;
- custom scripts;
- Teensyville-style small scripts for 5-6 players.

### Character selection

The Storyteller secretly chooses in-play characters that match the required counts.

Base rules:

- chosen characters must match the setup counts after all setup modifications are applied;
- the final number of in-play character tokens always equals the number of non-Traveller players;
- players do not know which characters are in play unless game effects reveal that.

### Setup modifiers

Some characters modify setup, such as adding or removing Outsiders.

The app must support a setup-time mutation phase after initial selection and before tokens are distributed.

At minimum, the setup pipeline should be:

1. choose player count and script;
2. calculate base type counts;
3. choose base in-play characters;
4. apply setup modifiers from characters that alter composition;
5. validate final counts and total player-character count;
6. distribute characters;
7. initialize Grimoire, reminders, night order, and player views.

### Reminder and night metadata

Character tokens may imply:

- reminder tokens to place in the Grimoire;
- first-night wake behavior;
- non-first-night wake behavior;
- setup modification behavior.

The app should model these as character metadata fields, not hard-coded UI rules.

### Character distribution

Each player receives exactly one character token secretly.

The Grimoire stores the true mapping from seat to character.

The player-facing app must support the case where a player thinks they are a different character from their true character. Therefore store:

- `trueCharacterId`
- `perceivedCharacterId`

These are usually equal, but not always.

### Starting evil information

For games with 7 or more players, the source glossary defines standard evil start information:

- Minions learn which other players are Minions and which player is the Demon.
- The Demon learns which players are the Minions.
- The Demon also learns 3 good characters that are not in play as bluff options.

The app must support delivering this private start information.

## Visibility model

The app must distinguish between at least four kinds of truth.

### 1. True hidden state

Visible only to the Storyteller and engine.

Examples:

- true character;
- true alignment;
- drunk/poisoned state;
- pending reminders and persistent effects;
- whether a player merely appears to be something else.

### 2. Player-known truth

Facts the rules guarantee the player learns.

Examples:

- their perceived starting character;
- their own alignment, except special cases where rules intentionally mislead them;
- changes to their character or alignment at the earliest opportunity, except specific exception characters like Drunk/Lunatic-style cases.

Default non-exposure rule:

- internal registration fields (registered character/alignment) are not automatically player-visible;
- expose them to a player only when a concrete rules effect explicitly grants that knowledge.

### 3. Official public truth

Facts the whole table learns through official game flow.

Examples:

- who is alive or dead;
- who was nominated;
- vote totals;
- who was executed;
- which players died in the night.

The table does not automatically learn the cause of a death or the source of an effect.

### 4. Social claims

Anything players say. These are not authoritative game state and should not be treated as engine truth.

The app may allow note-taking or claim tracking, but those must be clearly separate from official state.

## Game phases

The game starts at Night, then alternates Night -> Day -> Night until a win condition is met.

Recommended top-level phase enum:

- `setup`
- `first_night`
- `day`
- `night`
- `ended`

Recommended day substates:

- `open_discussion`
- `nomination_window`
- `vote_in_progress`
- `execution_resolution`
- `day_end`

Recommended night substates:

- `dusk`
- `night_wake_sequence`
- `immediate_interrupt_resolution`
- `dawn`

## Day rules

### Discussion

During the day:

- players may talk publicly or privately;
- players may say whatever they want;
- dead players still participate in discussion;
- the app must not attempt to enforce truthfulness of player speech.

### Nomination eligibility

Rules from the source set:

- only alive players may nominate;
- a player may nominate at most once per day;
- a player may be nominated at most once per day;
- dead players may not nominate.

Recommended daily tracking:

- `hasNominatedToday[playerId]`
- `hasBeenNominatedToday[playerId]`

### Voting procedure

When a nomination is opened:

- the Storyteller counts votes clockwise;
- if a player's hand is up when counted, that is a vote in favor;
- a player may vote for as few or as many nominees as they want during the day;
- dead players may vote only once for the rest of the game.

Recommended tracking:

- `deadVoteAvailable: boolean` on each dead player;
- consume that flag the first time a dead player casts a valid vote after death.

### Execution threshold

A nominated player is executed only if both are true:

- they receive votes greater than or equal to half of alive players;
- they receive more votes than any other nominee that day.

Implementation rule:

- threshold = `ceil(alivePlayerCount / 2)`.

Tie rule:

- if multiple nominees tie for highest vote total, neither is executed.

Execution count rule:

- at most one execution can occur per day;
- a day may end with no execution.

### Execution vs death

Execution and death are not the same thing.

The engine must represent them separately.

- a player may be executed yet remain alive;
- a dead player may be executed again;
- regardless of whether execution causes death, that still uses the one execution for the day.

Recommended event split:

- `player_executed`
- `player_died`

Do not collapse them into one event.

## Night rules

### Basic night behavior

During the night:

- players close their eyes;
- some players wake to act or receive information;
- the Storyteller may communicate using silent signals;
- at dawn the Storyteller wakes everyone and announces night deaths.

### Wake order

The night sheet provides the normal wake order for a script.

However, ability text takes priority over the listed order. Some abilities may resolve immediately when triggered, even outside normal wake order.

Therefore the app needs two layers:

- a default ordered list of character wake steps;
- an interrupt/immediate-resolution queue for triggered abilities.

### Night interaction protocol

The physical rules use taps, gestures, and pointing. In an app, model these as structured prompts and responses.

Required interaction primitives:

- wake player;
- present yes/no;
- present good/evil;
- present numeric info;
- ask player to choose one or more players;
- reveal character token or info token;
- confirm target choice.

## Death and survival rules

### Death consequences

When a player dies:

- they become dead immediately;
- they lose their ability immediately, unless the ability explicitly functions on death or while dead;
- persistent effects from that ability end immediately;
- they may no longer nominate;
- they retain exactly one vote for the rest of the game;
- they still talk and still win or lose with their team.

### Dead players cannot die again

If a dead player is attacked again, no new death occurs and the group does not learn that they died again.

### Death announcements

At the start of each day, players learn which players died that night.

Players do not automatically learn:

- what caused the death;
- which ability caused it;
- why no death occurred.

## Win conditions

### Standard victory

- good wins if the Demon dies;
- evil wins when only 2 players are alive, not including Travellers.

### Early ending

The Storyteller may end the game when victory is certain for one team.

For app design, treat this as a supported Storyteller action, not as a fully automatic rule, because certainty may depend on remaining abilities.

Recommended model:

- compute obvious automatic win states;
- also offer `declare_forced_victory(team, rationale)` as a Storyteller override.

## Alignment and character rules

### Alignment and character are separate axes

- a player has an alignment;
- a player has a character;
- changing one does not automatically change the other.

Examples implied by the rules:

- a good player may have an evil character;
- an evil player may have a good character.

### Changes must be learned

If a player's alignment or character changes, they learn the change at the earliest opportunity, in secret.

This knowledge is not treated like ordinary information and is not blocked by drunkenness, poisoning, or Vortox-like misinformation logic.

Exception support is still required for characters designed to misidentify themselves.

### Becoming a new character

When a player becomes a new character:

- they lose the old ability immediately;
- old persistent effects end immediately;
- they gain the new ability immediately;
- if the new ability is once per game, they may use it even if the previous character's once-per-game ability was already used;
- if the new ability normally works only on the first night, it works at the moment they become that character.

If a player becomes a Minion or Demon mid-game, they do not automatically learn the evil team info that starting evil players receive.

## Drunkenness and poisoning

These are core engine systems.

### Shared effect

Drunk and poisoned do the same thing functionally:

- the player has no ability;
- the Storyteller behaves as if they do;
- if they would receive information, it may be false;
- the player is not told they are drunk or poisoned.

### Independence and stacking

- a player can be both drunk and poisoned;
- those states do not cancel each other out;
- the state belongs to the player, not the character.

If a drunk or poisoned player changes character, the player remains drunk or poisoned.

### Persistent effects stop immediately

If a player becomes drunk or poisoned:

- they lose their ability immediately;
- ongoing protections, curses, poison effects, and similar persistent effects from that ability stop immediately.

If the player later becomes sober or healthy again, those persistent effects resume only if the ability is still relevant and still applicable under the rules.

### Used abilities while malfunctioning are wasted

If a player uses or triggers an ability while drunk or poisoned:

- the ability has no effect;
- if it was once per game, it is still spent;
- it does not retroactively start working if the player later becomes sober or healthy.

### Abilities targeting a drunk or poisoned player still work normally

If another player's ability targets a drunk or poisoned player, that targeting ability resolves against the target's true game properties unless some other rule says otherwise.

Example principle:

- an Empath can correctly learn the alignment of drunk neighbors;
- a Fortune Teller can correctly identify a poisoned Demon.

### Rules truth is always true

Even when a player is drunk or poisoned, the Storyteller must still answer rules questions truthfully.

## Information rules

### Reveal only what the ability grants

Players learn only what their own character ability says they learn.

The app must not automatically leak:

- whether a Slayer shot succeeded because they are the Slayer;
- that a Monk protection happened;
- that a Demon transferred;
- why an action failed.

### False information policy

False information is allowed when rules explicitly allow ability malfunction, chiefly drunkenness and poisoning.

Outside explicit allowance, the app must not fabricate information.

### Rules explanations are always accurate

The Storyteller and app must always provide true rules information, even to malfunctioning players.

## Ability resolution contract

Because character almanac text is outside the current rule corpus, the app needs a generic ability contract.

### Minimal ability metadata

Each character definition should eventually provide at least:

- `id`
- `name`
- `type`
- `alignmentAtStart`
- `timingCategory` such as `first_night`, `each_night`, `each_night_except_first`, `day`, `on_death`, `passive`, `setup`, `traveller`, `fabled`
- `isOncePerGame`
- `requiresChoice`
- `targetConstraints`
- `canFunctionWhileDead`
- `canTriggerOnDeath`
- `mayCauseDrunkenness`
- `mayCausePoisoning`
- `mayChangeAlignment`
- `mayChangeCharacter`
- `mayRegisterAsOther`
- `handler`

### Generic ability rules

- abilities work immediately when used unless the ability text says otherwise;
- if ability text says `choose`, the player chooses;
- if `choose` is absent, the Storyteller chooses;
- if a player tries to choose an illegal target, the app should reject the target and require a valid choice;
- if a player dies, becomes drunk, or becomes poisoned, their ability is lost immediately;
- death-triggered and `even if dead` abilities are exceptions and must be supported explicitly.

### Immediate resolution priority

If an ability triggers now, it resolves now, even if that means acting outside normal night-sheet order.

The engine must therefore support nested resolution.

## Registration rules

Some players may register as a different alignment or character for rule purposes.

The app must distinguish between:

- `true state`
- `registered state`
- `perceived state`

These are not the same.

Registration rules:

- registering as a character or alignment affects rule checks and other players' abilities;
- it does not grant the registered character's ability;
- it does not change the player's true team win condition unless an actual alignment change happens.

Visibility guidance:

- registered state is Storyteller/internal by default;
- player/public views should not leak registered state without explicit rules-backed disclosure.

## Madness rules

Madness is not a purely mechanical hidden-state system. It is partly social and judgment-based.

### Definition

A player who is mad about something is trying to convince the group that something is true.

### Engine support

The app should not attempt to determine madness automatically from chat.

Instead, provide Storyteller tools to record:

- that a player is under a madness instruction;
- what they are supposed to be mad about or not mad about;
- what penalty or benefit may apply;
- whether the Storyteller judges that the player complied.

### Madness rules to preserve

- players are never forced to say anything;
- madness creates incentives and penalties, not compelled speech;
- once a player is no longer mad, they may talk about the prior madness without penalty;
- the Storyteller is the final judge of whether a player behaved madly.

This is a strong reason the app must keep a human adjudication layer.

## Travellers and Fabled

### Travellers

Travellers are special player characters for late joiners or early leavers.

Rules the app must support:

- Traveller characters are chosen by the player;
- Traveller alignment is chosen by the Storyteller;
- Travellers do not count toward the base setup player counts;
- Travellers may be exiled by the group;
- exile is not a vote and not an execution;
- abilities cannot affect exile.

### Fabled

Fabled are public Storyteller-side modifiers used to make unusual situations fairer or more manageable.

The app should model Fabled as game modifiers with public visibility and Storyteller-owned effects.

## Public procedure rules to preserve

The app should support, but not hard-enforce, these table norms:

- no peeking into the Grimoire;
- players can ask rules questions privately;
- private player-to-player conversations are allowed;
- dead players continue participating socially;
- early character discussion before the first night may need Storyteller moderation in some groups.

These are mostly moderation and UX concerns, not engine rules.

## Data model recommendation

At minimum, a persisted game should store:

- game id, script id, edition id, status;
- seat order;
- players and display names;
- true character per player;
- perceived character per player;
- true alignment per player;
- alive/dead state per player;
- drunk/sober state per player;
- poisoned/healthy state per player;
- madness instructions and adjudication notes;
- whether a dead vote remains;
- per-day nomination usage;
- per-day nomination targets already nominated;
- execution history;
- death history;
- exile history;
- reminders and temporary effects;
- current phase and subphase;
- current night number and day number;
- pending wake queue;
- pending interrupt queue;
- per-player private info log;
- public event log;
- Storyteller-only adjudication notes.

## Event model recommendation

Support at least these event families:

- setup events: script selected, characters selected, setup modified, reminders placed;
- assignment events: character assigned, perceived character assigned, alignment assigned;
- phase events: day started, nominations opened, night started, dawn reached;
- social procedure events: nomination made, vote opened, vote cast, vote closed;
- consequence events: execution occurred, player died, player survived execution, exile occurred;
- state events: drunk applied, poison applied, sobriety restored, health restored, alignment changed, character changed, registration changed;
- info events: private info shown, public death announced, bluff info shown, evil info shown;
- adjudication events: Storyteller choice made, Storyteller ruling recorded, penalty applied.

## Validation and invariants

The engine should continuously validate these invariants:

- exactly one true character per non-Traveller player;
- final in-play non-Traveller character count equals non-Traveller player count;
- only alive players can nominate;
- a player nominates at most once per day;
- a player is nominated at most once per day;
- only one execution can occur per day;
- dead players cannot die again;
- dead players cannot nominate;
- dead players can spend at most one post-death vote;
- good and evil win checks exclude Travellers from the evil 2-alive condition;
- private information is not leaked to unauthorized views.

## Storyteller discretion points

The app must surface explicit Storyteller decisions anywhere the rules allow judgment.

Examples from the source rules:

- selecting false information for drunk or poisoned players;
- deciding outcomes where ability text says `might`;
- judging madness compliance;
- handling odd timing windows where generic rules are insufficient;
- ending the game early when victory is certain;
- making clear rulings in unusual custom-script interactions.

Do not silently automate these.

## What this spec does not define

This document does not define:

- the exact ability text or almanac behavior of every character;
- all jinxes or script-specific pair restrictions;
- all custom-script balance guidance;
- every edge case involving unusual modern characters outside the general rules.

For those, the app should support one of two paths:

- load richer character-rule data when available; or
- require explicit human Storyteller adjudication.

## Implementation summary

If you build from this document alone, the safe development plan is:

1. implement the core state model, visibility model, setup pipeline, day/night phase loop, nomination/vote/execution flow, death flow, and win checks;
2. implement generic systems for alignment changes, character changes, drunkenness, poisoning, registration, and madness tracking;
3. implement a character plugin interface instead of hard-coding character behavior into the generic engine;
4. implement Storyteller prompts anywhere the rules require discretion or missing character detail;
5. treat this document as authoritative for generic rules and treat character-specific logic as external extensions.

That approach matches the source material and avoids inventing unsupported rules.
