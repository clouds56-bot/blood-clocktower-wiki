# Trouble Brewing 10-Player Simulation Log (Engine Adjudication)

## Match Metadata

- Edition: Trouble Brewing
- Players: 10 (no Travellers)
- Required composition: 7 Townsfolk, 0 Outsiders, 2 Minions, 1 Demon
- Result: Good victory (Demon executed on Day 3)

## Seating and True Setup

| Seat | Player | True Character | Alignment | Status |
| --- | --- | --- | --- | --- |
| 1 | p1 | Investigator | Good | Alive |
| 2 | p2 | Chef | Good | Alive |
| 3 | p3 | Empath | Good | Alive |
| 4 | p4 | Monk | Good | Alive |
| 5 | p5 | Fortune Teller | Good | Alive |
| 6 | p6 | Undertaker | Good | Dead (Night 3) |
| 7 | p7 | Slayer | Good | Dead (Day 2 execution) |
| 8 | p8 | Poisoner | Evil | Dead (Day 1 execution) |
| 9 | p9 | Spy | Evil | Alive |
| 10 | p10 | Imp | Evil | Dead (Day 3 execution) |

### Starting Evil Info Delivered

- Minions informed: p8 and p9 are Minions; p10 is Demon.
- Demon informed: p8 and p9 are Minions.
- Demon bluffs delivered: Washerwoman, Virgin, Soldier.

---

## Night 1 (First Night)

### Hidden Resolution

1. Poisoner (p8) chooses p5. p5 is poisoned for Night 1.
2. Spy (p9) sees full Grimoire.
3. Investigator (p1) receives: "One of p8 or p9 is the Poisoner."
4. Chef (p2) receives: `2` adjacent evil pairs.
5. Empath (p3) receives: `0` evil alive neighbors.
6. Fortune Teller (p5, poisoned) chooses p1 and p10; receives false result: "No."
7. No first-night Demon kill.

### Public Dawn Announcement

- No deaths in the night.

---

## Day 1

- Alive count: 10
- Execution threshold: 5 votes

### Nominations and Voting

1. p7 nominates p3.
   - Votes in favor: 4
   - Result: Not executed (below threshold).

2. p1 nominates p8.
   - Votes in favor: 6
   - Result: p8 is executed and dies.

### End of Day 1 State

- Dead players: p8
- Dead vote availability:
  - p8: available (unused)

---

## Night 2

### Hidden Resolution

1. Monk (p4) protects p5.
2. Spy (p9) sees full Grimoire.
3. Imp (p10) attacks p5.
4. Monk protection prevents p5's death.
5. Empath (p3) receives: `0` evil alive neighbors.
6. Fortune Teller (p5, healthy) chooses p10 and p2; receives: "Yes."
7. Undertaker (p6) learns: p8 was the Poisoner.

### Public Dawn Announcement

- No deaths in the night.

---

## Day 2

- Alive count: 9
- Execution threshold: 5 votes

### Day Actions

1. p7 uses Slayer shot on p9.
   - Result: No effect (p9 is not the Demon).
   - Slayer ability is spent.

### Nominations and Voting

1. p5 nominates p10.
   - Votes in favor: 4
   - Result: Not executed.

2. p9 nominates p7.
   - Votes in favor: 5
   - Result: p7 is executed and dies.

### End of Day 2 State

- Dead players: p8, p7
- Dead vote availability:
  - p8: available (unused)
  - p7: available (unused)

---

## Night 3

### Hidden Resolution

1. Monk (p4) protects p5.
2. Spy (p9) sees full Grimoire.
3. Imp (p10) attacks p6.
4. p6 dies.
5. Empath (p3) receives: `0` evil alive neighbors.
6. Fortune Teller (p5) chooses p10 and p4; receives: "Yes."

### Public Dawn Announcement

- p6 died in the night.

---

## Day 3

- Alive count: 7
- Execution threshold: 4 votes

### Nominations and Voting

1. p3 nominates p10.
   - Votes in favor: 6
   - Dead votes spent on this nomination: p7, p6
   - Result: p10 is executed and dies.

### Win Check

- Demon is dead.
- Immediate result: Good team wins.

---

## Final Ledger

### Death Order

1. p8 (Poisoner) - executed Day 1
2. p7 (Slayer) - executed Day 2
3. p6 (Undertaker) - killed Night 3
4. p10 (Imp) - executed Day 3

### Dead Vote Consumption

- p8: not used
- p7: used Day 3
- p6: used Day 3

### Information Path That Solved the Game

- Investigator narrowed Poisoner to p8/p9.
- Day 1 execution confirmed p8 as Poisoner via Undertaker on Night 2.
- Fortune Teller produced two consecutive "Yes" results including p10 (N2, N3).
- Combined pressure converted to Day 3 execution on p10.
