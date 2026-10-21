# BATTLE V3: a longer, kinder, move-choosing creature battle (design spec)

Status: **slice S1 (12.1) is built on branch `app/battle-v3-s1`, see "S1, as built" under 12.1; everything else is still design.** Written 2026-10-21 after the parent played build 104 (battle slice 2) and was not happy. This document replaces the "Concept A/B/C" discussion of `BATTLE.md` for everything about the battle loop. `BATTLE.md` stays as the record of slices 1 and 2 and of the research behind the question presentations (section 4.5 there) and the anti-frustration rules (4.10), which still apply.
Scope: `app/src/core/game/battle*.ts`, `app/src/ui/BattleScreen.tsx`, `app/src/ui/battle/*`, `app/src/ui/QuizScreen.tsx`, the economy (`mods/nagmon/economy/items.yaml`), `collection.ts` (growth and evolution), the first chapter data (`mods/nagmon/trips/solar.yaml`, `mods/nagmon/learning/subjects.yaml`, `mods/nagmon/db/monster/*`). Phone, landscape, 873 x 393 CSS px.
Language: this document is English; the game stays Hebrew (RTL). All move and creature names below are English placeholders to be written in Hebrew later.
Tone rules from the parent, kept everywhere: modest and kind; no violence, no gore; creatures are **fogged**, and the player **calms and befriends** them, never defeats or kills them. "Fainting" is a creature **dozing off** and it always wakes up.

How to read the numbers: every number in sections 5 to 8 is a first value to be tuned by play. Where a number comes from a calculation it was checked with the simulation in Appendix A (run on 2026-10-21, 6,000 fights per row). Where something comes from outside the repo it carries a source link; sources are collected in Appendix C, and "from memory" marks facts I know but could not re-confirm online (the sandbox could not reach Bulbapedia or Wikipedia directly; only search summaries were available, so every number taken from other games below is cross-checked against at least one search result or marked).

---

## 0. Decisions at a glance

| # | Decision | Where |
|---|---|---|
| D1 | The battle is **turn based, with a menu of the creature's own moves**: the child picks one of the partner's **4 moves**; each move belongs to a school subject; **choosing the move IS the question**. Right answer = full effect, wrong answer = weak effect (35% damage, no status), never a punishment. The old Move / Power-up / Assist cards and the pip meter are removed. | 2, 3 |
| D2 | Enemies have a **weak subject** (and a sturdy one) through a **subject wheel** (math beats logic beats geometry beats science beats English beats Hebrew beats math), shown as a glowing chip. Moves of the right subject "sparkle" (x1.5). | 2.3, 5.2 |
| D3 | Both sides have a bar: the enemy's **Fog** (calm it to 0) and the partner's **Pep**. At 0 Pep a creature **dozes** (educational-safe fainting): it is carried off with a blanket, a friend steps in for free, and **everyone wakes at the end of every battle at full Pep**. Nothing is lost, ever. | 6 |
| D4 | **50 moves** in 6 subjects (8 to 9 each): easy, normal and stretch attacks, and moves that **dizzy, put to sleep, slow, shield, heal, boost, charm, mark, copy**, plus **chain** moves (a "Mark" then a "Finisher") and a 3-question **Finale** (paid by the Spark meter). 14 status icons. | 3, 4 |
| D5 | **A longer fight**: a wild fight is about **6 to 9 questions in 6 to 7 turns, 2 to 3 minutes** with intro and befriending; a zone guardian is **11 to 16 questions, about 5 minutes**. Fog and damage formulas are in section 5 and were calibrated by simulation. | 5, App. A |
| D6 | **Evolution is slower and richer**: three gates (level, Know-how in the creature's subject, subject stars from the learning engine) plus **Evolution Cards** (bought, found, or gifted by tutors). Stage 1 at level 12 and stage 2 at level 24; growth is about 2 times slower than today. A 10-beat animation. | 7 |
| D7 | **Catching is no longer "the net button"**: a tray of tools (nets, cards, treats), a probability from Fog left, status, species, level and tool (a probability built from Fog left, status, species, level and tool, with three shake checks), an optional question boost, a visible chance word, pity so that a try always succeeds by the 4th. It may fail, and failing is gentle. | 8 |
| D8 | **Flow**: intro 2.2 s, no dead waiting, every animation skippable, the next menu opens during the enemy's animation, one results card, evolution only after the results. | 9 |
| D9 | **Animation tech**: CSS + the Web Animations API (zero dependencies) for the battle UI, **Phaser** (already shipped) for the map (grass sway, dust, glow), one tiny canvas particle layer of our own for battle and evolution. No GSAP, Motion, react-spring, Lottie or Pixi for now. | 10 |
| D10 | Five slices, S1 to S5, each with tests and acceptance; S1 alone already changes how a fight feels. | 12 |

---

## Decisions (parent, 2026-10-21)

These override the text above where they differ. S1 is built to them.

1. **Fainting is real.** A creature whose Pep reaches 0 faints. It is **not lost**, but a fainted creature cannot be used in battle, nor in field abilities (for example swimming or other field uses, once they exist), until it is healed. It is healed **only** with **medicine bought in the shop** (an item) or by **the nurse at the Rest Center / hospital** (free, in the world). There is no auto-wake after rounds, no "nap on the bench", no "Dream Replay" wake and **no "everyone wakes at the end of the fight"**: section 6.2's table is replaced by this rule, and the word "dozing" in sections 4.1 and 6 now means fainted ("fell asleep, needs rest"). The wording stays gentle (no violence, no red). If the **whole team has fainted**, the child **is carried back** to the Rest Center and the team is healed there for free, so the game never dead-ends; no coin fee is charged. Ages 5 to 7: Gentle mode still applies (the enemy hits at x0.55 and Brave Heart is on by default), so a creature faints only after a long chain of hits.
2. **Evolution Cards skip the learning gates** (the spec default). That is slice S4, not built now.
3. **Befriending may fail**, with the classic catch-rate logic of 8.2. That is slice S3, not built now; S1 keeps the current Net button and seal question.
4. **Fight length, weakness wheel with one extra weak subject, data and names**: the spec defaults.

---

## 1. What was wrong with slice 2 (from the field log)

Source: the device log `devices/77bcce20/logs/20261021T171927Z.txt` in the private data repo (the parent's phone, 2026-10-21, version 0.1.0, Android 16). Quoted numbers only; no family details.

### 1.1 The three-minute fight

The fight of 16:50:31 to 16:53:35 (a level 10 Rustip, partner Heliobud, the child's band C, fog 48):

| Time | Log line | Fog change |
|---|---|---|
| 16:50:53 | BEAT pick=power damage=0 | 0 (opens a question) |
| 16:51:25 | question answered (32 s later), METER 1/3 | 48 to 43 (5) |
| 16:51:32 | BEAT pick=move damage=6 | 43 to 37 |
| 16:51:33 | BEAT pick=power damage=0 | 0 |
| 16:51:42 | question answered (9 s), METER 2/3 | 37 to 32 (5) |
| 16:51:47 | BEAT pick=assist damage=6 | 32 to 26 |
| 16:51:49 | BEAT pick=assist damage=2 | 26 to 24 |
| 16:51:51 | BEAT pick=power damage=0 | 0 |
| 16:52:10 | question answered (19 s), METER 3/3 | 24 to 19 (5) |
| 16:52:13 | BEAT pick=move **damage=0** (below the 50% floor) | 0 |
| 16:52:14 | BEAT pick=special damage=0, burst starts | 0 |
| 16:52:18 / 16:52:33 / 16:53:21 | three burst questions (4 s, 4 s, **47 s**) | 19 to 12 to 5 to 0 (7, 7, 5) |
| 16:53:26 | magic net used; 16:53:35 CATCH (one seal question) | |

What the numbers say:

1. **Length: 184 s wall clock for 7 questions**, of which 124 s were inside questions (END line `ms=124105`) and 60 s were taps, menus and animations. The child spent 15 beats (8 beat picks, 6 fog-damage results, 1 net) to take 48 fog.
2. **Half the beats did nothing: 5 of the 8 beat picks show `damage=0`.** Three were "Power-up" (a question opener: the damage arrives on a separate line), one was a **Move at the floor** (free beats stop at 50% of the fog, so after 16:52:10 a tap on Move can only do 0), one was the Special's start. A child tapping a big glowing card and seeing "0" is exactly the "dead beat" the parent complained about.
3. **The free beats were small and the questions were small**: free beats took 14 of 48 fog in total (2 to 6 each), questions 5 to 7 each. Nothing felt big and nothing was a decision: Move, Power-up and Assist are three buttons with one right answer for a given state.
4. **Question times range from 4 s to 47 s** (median of this fight 14 s; other fights in the same log: 3 to 25 s). A question that takes 47 s inside a burst is a stall with the whole battle waiting; nothing else can happen meanwhile.
5. **The enemy never acts**: no turn order, no threat, no reason to choose a different card. The 15 beats are the same decision repeated.
6. **The meter and the cards are confusing**: "METER 1/3", "assists=2", "Power-up", "Special" (taking Move's place) are four systems for one idea. The parent said the power-up and meter cards are confusing; the log shows the child used Assist twice in a row for 6 and 2 damage, the second one at the fog floor.
7. **Elsewhere in the same log**: a fight that was left open for 21 minutes (`BATTLE start venubud` 16:58:12, `end result=ran questions=0` 17:19:09), a Mercurip fight where one beat took 76 s to choose (10:10:28 to 10:11:44), two "stuck" reports from the child (16:48:06 `chip=stuck`, 16:54:14 `chip=stuck` on the letters screen), and one battle of 28 s and 4 questions (`flaskling`, 04:26:15), which the parent also noted as too short. The map ran at about 120 fps on the phone (log lines "map frames: 119 fps average"), so the device has headroom for more animation.

### 1.2 Causes, in one table

| # | Cause | Effect | Fixed by (this spec) |
|---|---|---|---|
| W1 | Four overlapping systems (Move, Power-up, Assist, Special) plus a meter | Confusion; "which card?" is not a real choice | One menu: 4 moves of the creature (2.2) |
| W2 | Free beats capped at 50% of the fog | Dead beats with "0" | No free damage move except the fallback Wiggle; every attack is a question (3.1) |
| W3 | Question and attack are separate | Learning feels like a toll gate (see BATTLE.md D6, Habgood and Ainsworth) | The question is the cast of the chosen move (2.1) |
| W4 | The enemy is passive | No tension, no planning | Intents telegraphed (Slay the Spire style), windups, statuses (2.4, 4) |
| W5 | One verb, one subject | No strategy, no reason for a team | Subjects as "types", weak subject, team of 4 (2.3) |
| W6 | Short, fixed fights (3 fog questions) and a net button | Over in 28 s or dragged by dead beats; capture is a chore | 6 to 9 questions in a shaped fight (5), a real catching system (8) |
| W7 | Evolution at level 6 by an arithmetic rule | Evolution happens before the child cares about the creature | Gates by level, Know-how and stars, plus cards (7) |
| W8 | Three screens per question in slice 1, a panel over the arena in slice 2 but still a stop-start rhythm | Waiting | Flow rules (9) |

---

## 1.5 Legal and IP boundary (parent's decision, applies to the whole document)

We borrow **ideas**: public, general game rules and mathematical shapes that are described in open references (turn order by speed, a bonus for a matching kind of move, a chance of a lucky hit, a catch chance that rises as the target weakens, evolution by level, by item and by bond, a meter of uses per move, telegraphed enemy actions). We do **not** copy:

| We do NOT use | What we do instead |
|---|---|
| Any data table, move list, stat table, type chart, catch-rate list, experience table or evolution list from Nintendo, Game Freak, Pokemon Essentials, Bulbapedia or any fan wiki | Every number in this spec is our own, chosen for a 2-to-3 minute fight with a child and checked in Appendix A. The "type chart" is **our subject wheel** (section 2.3), authored for school subjects. |
| Their names and terms: no "Pokemon", no ball names, no move names, no status names, no creature names, no ability names, no "PP" as a word in the game | Our own words: **Fog** and **Pep** (bars), **Spark** (meter), **Know-how** (training), **Gifts** (passive traits), **doze** (fainting), **befriend** (catching), **Marks**, **Finale**, **Evolution Card**. Moves have our own English names and our own **Hebrew names** (section 3). Status names and icons are ours (section 4). "Uses left" is shown as dots, called **Charges** in the game. |
| Their art, sounds, animations, UI layouts | New art and audio per section 11, generated for this game |
| Their code | All code is written from this spec in the Nagmon repo |

The shapes we do reuse are formulas in the public domain of game design (a damage product of a base term and a few multipliers; a chance that goes up as health goes down). Where the text below says "inspired by", it names a mechanic (never a copied table) so a reader can look up the idea. Research notes in Appendix B discuss other games' mechanics only to explain why we chose or skipped an idea. A review for IP is part of S5 acceptance (12.5): a name check of all creatures, moves, items and statuses against a list of third-party terms.

---

## 2. The new battle loop

### 2.1 Principles (each traced to the research in Appendix B)

1. **The move is the question.** The child chooses *what to do* (which move, so which subject and how hard), and the question is how the move is cast. This is the "intrinsic integration" that Habgood and Ainsworth found made children learn more and choose to play longer (BATTLE.md 2.2) and it is what Prodigy-style games do right (a spell per answer) minus the repetition.
2. **A real choice every turn**: four moves that differ in subject (enemy weakness), difficulty tier (risk and reward), side effect (status, shield, heal), and charges left. Choosing well is a skill that is not the same skill as answering.
3. **Never a punishment.** A wrong answer makes the move weak (35% damage, no status, no Spark). Nobody loses anything permanent, no creature is hurt in a lasting way, nothing is taken from the Bag, no coins, no hearts. The only costs of a long fight are time and a dozing creature that wakes up.
4. **The enemy acts and says what it will do** (intents), so the child plans instead of guessing.
5. **A rhythm, not a wall of questions**: one question per turn, with a varied presentation, an easy tier for a quick one, a Finale for a burst, and moves that need no question (the fallback Wiggle, swapping, the Bag, befriending, Echo).
6. **Subjects interleave by design**: a mix bonus for changing subject (Rohrer and others on interleaving, BATTLE.md 2.2), and weaknesses that reward a team of different subjects.
7. **Nothing flashes** (WCAG 2.3.1, 3 flashes per second max), no timer in battle (speed counts for nothing, as in slice 2), a calm-effects switch, and every tap target at least 48 dp.

### 2.2 The screen (873 x 393)

```
+--------------------------------------------------------------------------+
| [Subject chip: loves MATH]  ENEMY NAME  Lv 10      [status icons]        |
| [Fog ======================---]   (intent bubble above the creature)     |
|                                               ENEMY (front, upper right) |
|                                                                          |
| PARTNER (back, lower left)                                               |
| [Pep ==============]  [Spark: 3 of 4 stars]  [status icons]              |
+--------------------------------------------------------------------------+
| Friends strip      | MOVE 1 | MOVE 2 |            | Befriend |  Bag | Run |
| (4 portraits)      | MOVE 3 | MOVE 4 |            |                      |
+--------------------------------------------------------------------------+
```

* **Moves**: a 2 x 2 grid of cards, each at least 150 x 56 px. A card shows: the move name, the **subject icon** in the subject color, **power flames** (1 to 4), **Charge dots**, a small **tier badge** (leaf = easy, star = normal, crown = stretch), a **sparkle** if the enemy loves that subject, and a tiny **status or effect glyph** (for example a snail for "may slow"). A greyed card with "2/4" stars is the Finale waiting for Spark.
* **Friends strip**: the four partner portraits (the active one lit, dozing ones dimmed with a blanket). **One tap on a portrait swaps** (it costs the turn; after a doze it is free, see 6.3). Long press shows details.
* **Right column**: **Befriend** (opens the tray, 8.3), **Bag** (snacks, helpers, wake berry), **Run** (always free, always works).
* **Question panel**: opens as soon as a move card is tapped, over the bottom 55% of the screen; the arena stays visible above. The move cards are replaced by the question; the move's name and subject icon sit in the panel header so the child sees what is being cast. Hint, helpers and "I don't know" stay as in slice 2 (BATTLE.md 4.5). The answer is not a separate page: the panel closes on the tap of the answer and the move plays at once.
* **Spark meter** (replaces the pip meter and the Power-up card): 4 stars under the Pep bar. A right answer fills 1 star (2 on a stretch move), a hard hit taken fills 1, a wrong answer fills none. At 4 stars the **Finale** card of the creature's subject lights up in the move grid's fifth slot (it replaces nothing: the grid becomes 2 x 2 plus a wide Finale bar under it, only while charged). After the Finale the stars reset to 0. The meter is shared by the whole team and survives swaps.

### 2.3 Weakness: the subject wheel (our own chart)

Six subjects stand on a wheel, in this order, and each subject is **good against the next one** (the arrow), and **sturdy against the one before it**:

```
Math  ->  Logic  ->  Geometry  ->  Science  ->  English  ->  Hebrew  ->  (back to Math)
```

| Move subject vs enemy subject | Multiplier | Shown as |
|---|---|---|
| the next one on the wheel (for example Math vs Logic) | **x1.5** "Sparkle" | the card sparkles; enemy "loves" chip; a gold ring on the hit number |
| the one before it (for example Math vs Hebrew) | **x0.67** "Sturdy" | a small shield glyph on the card; the hit number is grey |
| anything else | x1.0 | nothing |

* **Species may add a second weak subject** (data field `weak`), so that a starter always has something to aim at in the first zone (for example the Moon's Terrabub is weak to Logic from the wheel and Science by data). The chapter table in 5.7 lists them.
* **Learning the chart**: ages 5 to 7 always see the "loves" chip. Ages 8 to 10 see it after the creature was seen once (the Book keeps it). Ages 11 to 14 see a "?" until a Sparkle or Sturdy hit happens, or a Detective Lens move reveals it; the Book then keeps it. The wheel is also drawn small in the Friends screen.
* **It is not a trap for weak subjects**: the question in a Sparkle move comes at the child's own level (tiers in 5.1), so a child who is weak in Hebrew still gets Hebrew questions they can answer; the reward of a Sparkle is for choosing it, not for knowing more. A **Mix bonus** (x1.1 when the move's subject differs from the previous move's) keeps all subjects in play.
* A starter of one subject has its home subject's moves (full STAB-like bonus x1.25 called **Home bonus**) and can learn **one off-subject move** from a tutor lesson (3.4) so that coverage is possible.

### 2.4 Turn order, intents and the round

A round is: the child chooses (and answers), then both sides act in order of **Speed**.

1. **Round start**: the enemy's **intent** is already shown as a bubble above it (icons in 4.3). A and B bands see the icon; B also sees the number ("about 8"); C also sees who is faster this round.
2. **The child picks a move** (or swaps, Bag, Befriend, Run). Picking a damage or utility move opens its question. The answer is graded; the move's strength is now known (right = full, wrong = weak).
3. **Resolution** (animated, 1.5 to 2.5 s): the creature with the higher Speed acts first; ties go to the child. **Quick** moves (+1 priority) always go first. The child's move is **never cancelled**: even if the enemy's first action brings Pep to 0, the answered move still happens, and the doze begins at the end of the round ("the last act" rule).
4. **End of round**: ticks (Regen, Sniffly), status counters go down, Spark may rise, dozing begins, the next intent is drawn and shown.

**Windup and Stagger** (Slay-the-Spire-style telegraph and the "break a big move" idea): some intents are **Windups**: the enemy shows an orange ring with "1" and will use a big move at the **end of the next round**. The child can **Stagger** it by dealing at least **25% of the enemy's maximum Fog in one round** (a Finale counts as one round), or by putting it to sleep, or by 33% dizzy luck; a Shield or the Mirror move makes the hit gentle instead. A Staggered enemy tumbles and loses that action (a funny 1 s animation). Windups are the main drama of boss fights (5.6).

**No dead beats**: every action the child can pick either asks a question that matters or (the fallback Wiggle, swap, Bag, Befriend, Echo, Run) does something visible at once. The enemy's "Silly dance" turn gives the child +1 Spark ("a breather").

### 2.5 A turn-by-turn example

Child in band B. Partner **Heliobud** (Math, level 10: Pep 50, Power 49, Guard 36, Speed 45) knows Sum Spark (normal), Add It Up (chain starter), Total! (chain finisher), Times Twister (stretch). Wild **Mercurip** (Science, level 10: Fog 100; Power 40, Guard 45, Speed 45; weak to Geometry and Hebrew), temperament Playful. Neutral matchup (Math vs Science: no Sparkle). Random factor fixed at 0.96 for the example; the numbers come from the formula in 5.2 and were computed by script.

| Turn | Intent shown | Child's choice | Question | Result (numbers) | Spark | Time |
|---|---|---|---|---|---|---|
| 0 | | Intro: enemy slides in, "Loves: Hebrew, Geometry" hidden as "?" (band B sees it after the first sighting) | | | 0 | 2.2 s |
| 1 | Fog Puff | **Sum Spark** (normal) | 11 s, right | 11 damage (Fog 100 to 89). The puff then hits for 7 (Pep 50 to 43) | 1 | 17 s |
| 2 | **Windup** (big puff next round) | **Add It Up** (starter): puts a Math Mark on the enemy | 11 s, right | 7 damage (Fog 82), Math Mark on the enemy for 2 rounds | 2 | 16 s |
| 3 | (windup resolves at end of round) | **Total!** (finisher): consumes the Mark | 11 s, right, 3rd right in a row | **Brilliant** hit: raw 10.49, bonuses 1.25 x 1.75 x 1.5 = 3.28, capped at 2.5, = **25 damage** (Fog 57). 25 is at least 25% of 100: **Stagger**, the windup is cancelled, Mercurip tumbles | 3 | 16 s |
| 4 | Fog Puff | **Times Twister** (stretch) | 16 s, **wrong** | weak hit: 5 damage (Fog 52). The creature "oops" bounce, never a buzzer. Puff: 7 (Pep 36) | 3 | 22 s |
| 5 | Fog Puff | **Sum Spark** (changes tier, so Mix bonus x1.1) | 11 s, right | 12 damage (Fog 40). Puff: 7 (Pep 29) | **4** | 17 s |
| 6 | Giggle (would heal 5%) | **Star Shower** (Finale, Math): 3 questions | 3 x 11 s, all right | 13 + 15 + 17 = 45 (chain bonus x1.0, x1.15, x1.3). Fog 0: **calm** | 0 | 39 s |
| 7 | | Befriend tray: Magic Net, the enemy is Calm, chance word **Great (97%)**; one tap on the net | | three shakes, caught (8.7) | | about 14 s |

(Had the child befriended at turn 5, with Fog 40 of 100, the chance would have been **Good (60%)**, and **Great (90%)** after the optional Gift question; a Lullaby first would make it 97%. See 8.)

Totals: **8 questions in 6 turns**, 7 right, Pep never below 29 (no doze), about **2 min 30 s** from the first map step to the new friend card including intro (2.2 s) and results (about 8 s). Enemy actions were 3 puffs and one cancelled windup.

---

## 3. Moves catalogue

### 3.1 Rules every move follows

| Rule | Value |
|---|---|
| Four moves equipped; a creature may know more and choose in the Friends screen (auto-fill picks one of each role) | 4 |
| **Tier** of the move sets the question: **E** easy (leaf badge), **N** normal (star), **S** stretch (crown), **F** Finale (3 questions), **U** utility (a normal question, no damage), **C** chain starter, **K** chain finisher, **Q** quick (priority +1, easy question) | see table |
| Question difficulty per tier: the learning engine's `difficulty_bias` (exists in `SelectOptions`) is set so the expected chance of a right answer is, by band A / B / C: **E 90 / 85 / 80%, N 80 / 72 / 68%, S 65 / 55 / 50%** (values to verify against real data in S1) | band table in 5.8 |
| Question presentation by tier: E uses the quick kinds (true/false thumbs, picture tiles, 3 choices); N uses 3 to 4 choices, order or letters; S can use the number pad and multi-step. Never two questions of the same shape in a row (the guard of slice 2 stays) | |
| **Power** (MP) is the move's base number in the damage formula (5.2): E 40, N 60, S 85, a Finale hit 70, a chain starter 35, a finisher 65 | |
| **Charges** (uses per battle, shown as dots; refilled in full after every battle): E 15, N 10, S 6, utilities 4 to 8; the Finale costs the Spark meter, not charges | |
| When a move has no charges left it is dimmed; if all four are empty the fallback **Little Wiggle** is the only card (infinite, no question, Power 25, so no child is ever stuck) | |
| **Right** = full effect. **Wrong** = damage x0.35 (at least 1), **no status, no Mark, no crit, no Spark**, and for a pure status/shield/heal/boost move the weak version given in the "wrong" note (usually 1 round or one third the amount). A wrong answer never costs extra charges, hearts, coins or time | |
| **Unlock level** is the creature's level; a creature knows every move of its home subject up to its level (the table is shared by all creatures of the subject; species can swap one move for a signature move in data) | |
| Boss and guardian creatures resist a major status for 3 rounds after one lands (5.6) | |

### 3.2 The 50 moves

Columns: `#`, English name / Hebrew name, **Subj**ect, tier, **MP** (power), **Ch**arges, effect when right, unlock level (Lv), and the animation note (what the child sees; effects are soft: leaves, bubbles, stars, numbers, letters, shapes). "r" = rounds. Statuses are in section 4.

**Math (orange)**

| # | Move (English / Hebrew) | T | MP | Ch | Effect when right | Lv | Animation |
|---|---|---|---|---|---|---|---|
| 1 | Number Nudge / דחיפת מספר | E | 40 | 15 | plain | 1 | Digit leaves hop across to the target, a soft tick |
| 2 | Sum Spark / ניצוץ סכום | N | 60 | 10 | plain | 1 | A little star with a plus sign arcs over |
| 3 | Add It Up / עוד ועוד | C | 35 | 10 | puts a **Math Mark** on the target (2 r) | 4 | A stack of plus signs drops, a sticker lands |
| 4 | Total! / סך הכול | K | 65 | 8 | x1.5 per Mark of any subject, x1.75 if it is a Math Mark, x2.0 for two different Marks (consumed) | 7 | A big equals sign stamps down softly |
| 5 | Times Twister / סופת כפל | S | 85 | 6 | 20% **Weaken** (Power -1, 3 r) | 8 | A whirl of multiplication signs, a breeze |
| 6 | Double Time / כפול מהר | Q | 40 | 10 | priority +1 | 10 | Two quick hops, "x2" pops |
| 7 | Multiply Me / כפל כוח | U | none | 6 | self **Boost** Power +1 (3 r). Wrong: 1 r | 12 | Glow rings, tiny x signs float up |
| 8 | Star Shower / מטר כוכבי מספרים | F | 70 x3 | Spark 4 | 3 questions, chain bonus x1.0 / 1.15 / 1.3 | 6 | Digits fall like a meteor shower, slow and gentle |

**Geometry (blue)**

| # | Move | T | MP | Ch | Effect when right | Lv | Animation |
|---|---|---|---|---|---|---|---|
| 9 | Dot Tap / נקישת נקודה | E | 40 | 15 | plain | 1 | A dot rolls over and taps |
| 10 | Block Bounce / קפיצת קובייה | N | 60 | 10 | plain | 1 | A cube bounces in an arc |
| 11 | Round Bubble / בועה עגולה | U | none | 8 | self **Shield** (absorbs 30% of max Pep, 2 r). Wrong: 12% | 3 | A shimmering circle closes around the creature |
| 12 | Spin Top / סביבון | N | 50 | 10 | 30% **Dizzy** (3 r) | 5 | A top spins, the target's eyes make spirals |
| 13 | Angle Trap / מלכודת זווית | S | 80 | 6 | 40% **Slow** (3 r) | 9 | A triangle folds down like a hat |
| 14 | Mirror Shape / צורת מראה | U | none | 5 | **Mirror** (1 r): the next enemy attack is softened by 60% and 60% of it is returned as Fog damage. Wrong: 30% | 11 | A mirror panel glints, a beam bounces back |
| 15 | Shape Parade / מצעד צורות | C | 35 | 10 | puts a **Geometry Mark** (2 r) | 7 | Circles, squares and triangles march past |
| 16 | Golden Pyramid / פירמידת זהב | F | 70 x3 | Spark 4 | 3 questions; the last hit also gives self Shield 15% | 6 | Golden triangles stack into a pyramid, a hum |

**Science (green)**

| # | Move | T | MP | Ch | Effect when right | Lv | Animation |
|---|---|---|---|---|---|---|---|
| 17 | Leaf Flick / נפנוף עלה | E | 40 | 15 | plain | 1 | A leaf flutters across |
| 18 | Splash / התזת מים | N | 60 | 10 | 10% **Sniffly** (3 r) | 1 | Water drops arc and plink |
| 19 | Healing Rain / גשם מרפא | U | none | 6 | heals 30% of max Pep. Wrong: 10% | 4 | A small cloud rains sparkles on the creature |
| 20 | Frost Breath / נשימת קרח | N | 55 | 8 | 40% **Slow** (3 r) | 6 | Sparkly snowflakes drift |
| 21 | Sunbeam / קרן שמש | U | none | 5 | **Regen** 8% of max Pep per round (3 r). Wrong: 1 r | 9 | A warm beam, floating hearts |
| 22 | Fresh Air / אוויר צח | U | none | 6 | cleanses own statuses and heals 10%. Wrong: cleanse only | 8 | A breeze clears a little fog off the creature |
| 23 | Warm Bloom / פריחה חמה | S | 85 | 6 | 20% **Weaken** (Guard -1, 3 r) | 11 | A flower opens and releases warm light |
| 24 | Comet Parade / מצעד שביטים | F | 70 x3 | Spark 4 | 3 questions; the last hit has 25% Slow | 6 | Three comets with tails, one after the other |

**English (yellow)**

| # | Move | T | MP | Ch | Effect when right | Lv | Animation |
|---|---|---|---|---|---|---|---|
| 25 | Letter Toss / זריקת אות | E | 40 | 15 | plain | 1 | A letter A spins over |
| 26 | Word Wave / גל מילים | N | 60 | 10 | plain | 1 | A wave of small words rolls across |
| 27 | Cheer Cheer / קריאות עידוד | U | none | 6 | self **Boost** Power +1 and Speed +1 (3 r). Wrong: 1 r | 4 | Pom-pom stars and a little "yay!" |
| 28 | Spelling Spell / קסם איות | N | 50 | 8 | 30% **Giggly** (target's next attack x0.5) | 6 | Letters rearrange in a loop, the target giggles |
| 29 | Rhyme Time / זמן חריזה | C | 35 | 10 | puts an **English Mark** (2 r) | 7 | Two words clink together |
| 30 | Alphabet Soup / מרק אותיות | U | none | 5 | heals 15% and cleanses one status. Wrong: heal 5% | 9 | A steaming bowl, letters float up |
| 31 | Echo / הד | U | none | 5 | **repeats the last damage move your team used**, at 60% power, with no new question (needs a damage move to have been used this fight) | 10 | A ghost copy of the last effect, softer |
| 32 | Story Storm / סערת סיפור | S | 85 | 6 | 20% **Dizzy** (3 r) | 12 | Pages swirl in a tiny whirlwind |
| 33 | Rhyme Parade / מצעד חרוזים | F | 70 x3 | Spark 4 | 3 questions; the last hit has 25% Giggly | 6 | Word bubbles rise in a line, each pops with a chime |

**Hebrew (pink)**

| # | Move | T | MP | Ch | Effect when right | Lv | Animation |
|---|---|---|---|---|---|---|---|
| 34 | Aleph Hop / קפיצת אלף | E | 40 | 15 | plain | 1 | The letter aleph hops across |
| 35 | Word Bloom / פריחת מילה | N | 60 | 10 | plain | 1 | A flower of letters opens at the target |
| 36 | Lullaby / שיר ערש | U | none | 5 | **Drowsy** on the enemy: it skips its next 2 actions (bosses 1). Wrong: 1 action (bosses 0) | 5 | Soft notes and a crescent moon, the enemy yawns |
| 37 | Story Hug / חיבוק סיפור | U | none | 6 | heals 25% of max Pep. Wrong: 8% | 7 | An open book glows and wraps the creature |
| 38 | Proverb Shield / מגן פתגם | U | none | 5 | self **Boost** Guard +1 (4 r) and Shield 15%. Wrong: Shield 6% | 8 | A scroll unrolls into a soft wall |
| 39 | Word Chain / שרשרת מילים | C | 35 | 10 | puts a **Hebrew Mark** (2 r) | 7 | A chain of linked letters |
| 40 | Sentence Spiral / ספירלת משפט | S | 85 | 6 | 25% **Drowsy** (1 action) | 11 | A spiral of words winds around the target |
| 41 | Song of Letters / שיר האותיות | F | 70 x3 | Spark 4 | 3 questions; the last hit heals self 10% | 6 | Letters rise like musical notes, a chorus |

**Logic (purple)**

| # | Move | T | MP | Ch | Effect when right | Lv | Animation |
|---|---|---|---|---|---|---|---|
| 42 | Pattern Peek / הצצה בתבנית | E | 40 | 15 | plain | 1 | A pattern of dots peeks out and bumps |
| 43 | Puzzle Pop / פופ חידה | N | 60 | 10 | plain | 1 | A puzzle piece snaps into place with a pop |
| 44 | Riddle Fog / ערפל חידה | U | none | 6 | **Dizzy** on the enemy (3 r). Wrong: 1 r | 4 | Question marks drift into the enemy's eyes |
| 45 | Detective Lens / זכוכית בלשים | U | none | 6 | **reveals** the enemy's weak subject and its next two intents, and gives self **Focus** (next right answer is Brilliant). Wrong: reveals the weak subject only | 3 | A big magnifier sweeps over the enemy |
| 46 | Maze Mud / בוץ מבוך | N | 55 | 8 | 50% **Slow** (3 r) | 7 | A tiny maze of mud puddles |
| 47 | Swap Trick / תעלול החלפה | U | none | 4 | **copies the enemy's Boosts** onto self and removes them from the enemy. Wrong: removes them only | 10 | Two arrows swap places |
| 48 | Mind Glimmer / ניצנוץ מחשבה | S | 85 | 6 | ignores the enemy's Shield; always Brilliant when right (already true for S) | 12 | A lightbulb glows slowly, soft rays (no flashing) |
| 49 | Grand Puzzle / חידת הענק | F | 70 x3 | Spark 4 | 3 questions; the last hit has 25% Dizzy | 6 | Giant puzzle pieces assemble one by one |

**Any creature**

| # | Move | T | MP | Ch | Effect | Lv | Animation |
|---|---|---|---|---|---|---|---|
| 50 | Little Wiggle / ריקוד קטן | fallback | 25 | infinite | **no question**; plain small hit; used only when all four moves are out of charges, or when the child taps "no question" on a dimmed card | 1 | The creature dances, a few stars |

Count: 8 Math, 8 Geometry, 8 Science, 9 English, 8 Hebrew, 8 Logic, plus 1 universal = **50**. Roles per subject, for the child to learn by playing: **Math** = damage, combos and power boosts; **Geometry** = shields, dizziness, counters; **Science** = healing, slowing, regeneration; **English** = cheering, charm, copying; **Hebrew** = sleep, healing, defence; **Logic** = confusion, revealing, tricks. Every subject also has plain attacks, so any partner can fight alone.

### 3.3 Learning moves: levels, lessons and cards

* **By level**: the creature learns its home subject's moves at the levels in the table (level 1: two attacks; level 3 to 5: the first utility and chain starter; level 6: the Finale; level 12: the last). A starter begins with its two level-1 attacks; the empty slots show the Little Wiggle until the next move arrives, and the first lesson card fills a slot at once.
* **By lesson**: a completed tutor lesson (FEATURES 4.17) gives a **Move Card** of that lesson's subject: any creature can learn that subject's move of the level it has reached. This is how a Math partner gets a Hebrew sleep move to have coverage for weaknesses (no Home bonus, but a Sparkle works). First lessons: Moon, Sun and Solar-system lessons give Science cards.
* **Chests and shop**: Move Cards are also found in chests and sold in the shop at 80 coins (utilities) and 120 coins (stretch moves). A creature knows at most 6 moves and equips 4 (no forgetting, no confirmation steps: the extra ones simply wait).

### 3.4 Chains: Marks and Finishers

* A **chain starter** (C) deals a small hit and puts a **Mark** of its subject on the enemy for 2 rounds (max 2 Marks, any subjects; a third replaces the oldest).
* A **finisher** (K) consumes the Marks. In chapter 1 the one finisher is **Total!** (Math): x1.5 for one Mark of any subject, x1.75 when the Mark is Math, x2.0 when two Marks of different subjects are on the enemy (both consumed). Other subjects' finishers arrive in later chapters (not counted in the 50).
* **Team chains**: Marks belong to the enemy, so a Geometry partner can Mark and, after a free swap-in or a swap turn, a Math partner can finish. This is the "combo" idea: two subjects in a row for a better result (inspired by Temtem's Synergy: pairs of moves that boost each other).
* **Finale** (F): after the Spark meter reaches 4. Three questions in one go, a hit for each, with a chain bonus on consecutive right answers (x1.0, x1.15, x1.3); a wrong answer deals x0.35 and **resets the chain**, but the Finale continues to its third question (nothing ends early, unlike slice 2's burst). Time cost about 35 s, so the Finale is a highlight, not a chore. A Finale can only be started on a turn after Spark 4, never twice in a row.
* **Brilliant hits** (x1.5): a right answer to a stretch question; or the third, sixth, ... right answer in a row; or a lucky star (1 in 16 on any right answer, an actual random delight). Not stacked: one Brilliant at most.

### 3.5 Gifts (passive traits, our version of "abilities")

Each species has one **Gift**, visible in its Book card, from a short list of eight (a data field, not needed before S5):

| Gift | Effect |
|---|---|
| Brave Heart | Once per battle, a hit that would doze this creature leaves it at 1 Pep instead. Default for all creatures in band A |
| Cheerful | The battle starts with 1 Spark |
| Steady | Immune to Dizzy |
| Warm Fog | Heal moves heal 20% more |
| Quick Learner | +20% Know-how (7.2) and growth points |
| Curious | +15% befriend chance as a partner (8.2) |
| Sturdy Shell | Shields it casts last 1 round longer |
| Sparkly | Its Sparkle hits (x1.5) are x1.65 instead |

---

## 4. Status effects

### 4.1 The list (14 icons)

All icons are round badges, 64 x 64 art shown at 28 px beside the bar, with the subject-neutral color given below and a one-word label on long press. Every status comes with a **colour and a shape**, not colour alone (accessibility). "r" = rounds; a round ends after both sides acted.

| # | Status (English / Hebrew) | Icon (shape, colour) | On the enemy | On our creature (softened: the child's answer is never wasted) | Cure |
|---|---|---|---|---|---|
| 1 | **Drowsy** / מנומנם | crescent moon with Zz, lilac | skips its next 2 actions (boss 1) | "Yawn": this turn only easy-tier moves, power -25%; tap the creature 3 times to wake it at once | time, 3 taps, Fresh Air, Wake Berry |
| 2 | **Dizzy** / סחרחר | spiral eyes, violet | 33% of its actions "stumble" for 3 r | no stretch moves for 2 r, the answer tiles wobble once at the start | time, Fresh Air |
| 3 | **Slow** / איטי | snail, brown | Speed x0.5 for 3 r | Speed x0.5 for 3 r (the enemy moves first; Quick moves still go first) | time |
| 4 | **Shield** / מגן | soft bubble, cyan | absorbs the next hits up to 20% of its max Fog for 2 r | absorbs up to the stated share of max Pep for 2 r | time, or used up |
| 5 | **Regen** / התחדשות | leaf with heart, green | Fog +4% of max per round for 3 r | Pep +8% of max per round for 3 r | time |
| 6 | **Boost** / חיזוק | up-arrow in the stat's colour (1 to 3 arrows) | stat stage +1 to +3 | stat stage +1 to +3 | 4 r |
| 7 | **Weaken** / החלשה | down-arrow in the stat's colour | stat stage -1 to -3 | stat stage -1 to -3 | 3 r |
| 8 | **Focus** / ריכוז | eye with sparkle, gold | | the next right answer is Brilliant | consumed |
| 9 | **Giggly** / צוחק | laughing face, pink | its next attack x0.5 | our next attack x0.5 (used only by Playful enemies) | 1 attack |
| 10 | **Mark** / סימן | sticker in the subject colour (math, geometry, ...) | chain Mark, 2 r, max 2 | n/a (enemies do not use Marks) | 2 r |
| 11 | **Sniffly** / מצונן | water drop, light blue | Fog -3% of max per round for 3 r (never below 1) | Pep -6% per round for 3 r, **never below 1 Pep** (never dozes by itself) | time, Fresh Air |
| 12 | **Windup** / הכנה | orange ring with number | the big move comes at the end of next round | n/a | Stagger |
| 13 | **Calm** / רגוע | smiling face, warm yellow | Fog is 0: the enemy stops acting; befriending gets a bonus | n/a | n/a |
| 14 | **Dozing** / נרדם | blanket with Zz, grey-blue | n/a | the creature is out of this battle (section 6) | wake rules in 6.2 |

### 4.2 Stat stages (our own numbers)

Power, Guard and Speed can be raised or lowered in **stages**, at most +3 and -3: multiplier = 1 + 0.25 x stage for positive stages (+1 x1.25, +2 x1.5, +3 x1.75) and 1 / (1 + 0.25 x |stage|) for negative stages (-1 x0.8, -2 x0.67, -3 x0.57). A stage lasts the rounds in the table and resets when the creature leaves the battle (swap or doze). The icons stack as 1 to 3 arrows.

### 4.3 Enemy actions (intents) and temperaments

| # | Intent (English / Hebrew) | Bubble icon | Effect |
|---|---|---|---|
| I1 | Fog Puff / נשיפת ערפל | puff of cloud | A hit on Pep, Power 50 (wild) or 40 (boss) |
| I2 | Big Puff / נשיפה גדולה | puff + orange ring "1" | **Windup**; next round's end: Power 60 (boss; wilds do not use it before level 8). Can be Staggered |
| I3 | Thicken / ערפל סמיך | thick cloud | Shield 20% of max Fog, 2 r |
| I4 | Giggle / צחקוק | laughing mouth | Fog +5% of max (once every 3 rounds at most) |
| I5 | Drowsy Mist / אד מנומנם | moon mist | puts "Yawn" on us (band A: replaced by Silly Dance) |
| I6 | Dizzy Swirl / מערבולת | spiral | puts Dizzy on us |
| I7 | Sticky Mud / בוץ דביק | mud blob | puts Slow on us |
| I8 | Cheer Up / עידוד עצמי | arrow up | enemy Boost Power +1 (3 r) |
| I9 | Silly Dance / ריקוד מצחיק | dancing notes | nothing; the child gets **+1 Spark** (a breather) |

| Temperament | Typical intent weights (percent) |
|---|---|
| Shy | Thicken 30, Giggle 20, Puff 30, Silly 20 |
| Playful | Silly 30, Puff 30, Dizzy 15, Mud 10, Cheer 15 |
| Grumpy | Puff 50, Big Puff 20 (level 8 and up), Cheer 15, Mud 15 |
| Sleepy | Drowsy Mist 30, Silly 25, Puff 30, Giggle 15 |
| Proud | Cheer 20, Big Puff 25, Puff 35, Thicken 20 |

Rules: an intent is drawn at the end of each round and **never changes** once shown (except a Staggered or slept enemy loses it); never two statuses in a row on the child; the child is never hit twice in a row by a Puff above 15% of Pep without a Silly turn. Keepers and bosses use **scripts** (5.6) instead of weights. Wild creatures never pick moves based on weakness; Keepers and bosses do.

### 4.4 Status rules

* Only one of Drowsy and Dizzy at a time (a new one replaces the old). Slow, Shield, Regen, Boost, Weaken, Focus, Giggly, Mark can stack with those.
* **Boss and guardian immunity**: after a Drowsy, Dizzy or Slow lands on a boss, it is immune to that kind for 3 rounds (the icon shows a small lock).
* A Staggered, slept or dizzy-stumbling enemy still gets its Windup cancelled.
* Statuses are not carried out of the battle; all clear at the end.

---

## 5. Number tables and formulas

All numbers are ours (see 1.5). `floor` = round down; `L` = level.

### 5.1 Stats

Each species has four **base** numbers around 8 to 13: `bp` (Pep), `bw` (Power), `bg` (Guard), `bs` (Speed). Evolution stage multiplies the bases: basic x1.0, stage 1 x1.2, stage 2 x1.45.

```
Pep   = floor(bp * (L + 10) / 4)
Power = floor(bw * (L + 8) / 4)       Guard and Speed the same with bg and bs
Fog   = floor( floor(10 * (L + 10) / 4) * kind * band * length )   (enemy only)
```

* **Fog is a pacing number, not a stat**: it depends on the enemy's level and the kind of fight, never on its stage or species, so fights last the same however big the creature looks. Bigger forms hit harder (Power) but are not longer to calm.
* `kind`: wild **2.0**, keeper's creature **1.4** (each of two), zone guardian **3.6**, master **4.2**. `band` (age): A **0.8**, B **1.0**, C **0.9**. `length`: the parent's knob Short 0.75, Normal 1.0, Long 1.3.
* Example (band B, Normal): wild level 3, 5, 10, 15, 18 have Fog **64, 74, 100, 124, 140**.
* Pep of a basic creature with bp 10: level 5 **37**, 10 **50**, 15 **62**, 20 **75**; a stage 2 form at level 20 (bp 10): **108**.

### 5.2 The damage formula (a "base times multipliers" shape, our constants)

```
raw    = ((0.4 * Lattacker + 2) * MP * (Power / Guard)) / 50 + 2
bonus  = min( 2.5, Home * Wheel * Mark * Brilliant * Mix )
damage = max( 1, floor( raw * bonus * Quality * Roll ) )
```

| Term | Value |
|---|---|
| `MP` | the move's power: E 40, N 60, S 85, starter 35, finisher 65, Finale hit 70, Wiggle 25; enemy Puff 50 (wild) or 40 (boss), Big Puff 60 |
| `Home` | x1.25 when the move's subject is the creature's own subject |
| `Wheel` | x1.5 Sparkle, x0.67 Sturdy, otherwise 1 (2.3) |
| `Mark` | finisher bonus (3.4) |
| `Brilliant` | x1.5 for a right stretch answer, the 3rd right answer in a row, or a lucky star (1/16); at most once |
| `Mix` | x1.1 when the move's subject differs from the previous move's (any side of the team) |
| `Quality` | right 1.0; **wrong 0.35 and `bonus` ignored except Home and Wheel** (so a wrong answer is weak but not silly) |
| `Roll` | random 0.92 to 1.00 |
| cap | `bonus` never exceeds **x2.5**, so four good decisions at once are big but not absurd |

For an **enemy's attack** the same formula is used with the enemy's Power, the partner's Guard, MP of the intent, no Home or Wheel, multiplied at the end by **gentle**: A **0.55**, B **0.9**, C **1.15** (and the parent's knob Gentle 0.7, Lively 1.3).

Worked examples (Heliobud level 10, Power 49, Guard 36, against Mercurip level 10, Power 40, Guard 45, Roll 0.96):

| Case | Calculation | Result |
|---|---|---|
| Sum Spark, right | raw = (6 x 60 x 49/45)/50 + 2 = 9.84; bonus 1.25 (Home) | **11** |
| Sparkle: a level 10 Terrabub (Power 36) using Block Bounce (N, 60) on the same Mercurip (Guard 45), without and with the wheel bonus | raw = (6 x 60 x 36/45)/50 + 2 = 7.76; Home 1.25 gives 9; Home x Sparkle = 1.875 gives 13 | **9** vs **13** |
| Sum Spark, **wrong** | raw 9.84 x 1.25 x 0.35 x 0.96 | **4** (at least 1) |
| Times Twister (stretch), right, Brilliant | raw = (6 x 85 x 1.089)/50 + 2 = 13.11; bonus 1.25 x 1.5 = 1.875 | **23** |
| Total! with Math Mark and Brilliant | raw 10.49; bonus 1.25 x 1.75 x 1.5 = 3.28, capped 2.5 | **25** |
| Mercurip's Fog Puff on Heliobud, band B | raw = (6 x 50 x 40/36)/50 + 2 = 8.67; x0.9 x 0.96 | **7** (14% of Pep 50) |
| Same puff, band A / band C | x0.55 / x1.15 | 4 / 9 |

### 5.3 Speed, turn order, crit, Spark, charges

* **Turn order**: higher Speed acts first; ties go to the child; Quick moves (+1) first. Speed has no timer: it is the creature's stat, never the child's reaction time. With the stat table, a level 10 Heliobud (Speed 45) and a level 10 Mercurip (45) tie, so the child goes first; at level 10 a Mercurip with bs 13 is Speed 58 and goes first, which is why Double Time and Slow matter.
* **Brilliant**: see 3.4. Expected Brilliant rate for a 72% player: about 1 hit in 3 (streak hits and stretch hits).
* **Spark**: +1 per right answer, +2 per right stretch answer, +1 when the partner takes a hit of at least 15% of its max Pep (a comeback for a struggling child), max 4, shared by the team, reset by the Finale. Cheerful gift: start at 1.
* **Charges**: 15 / 10 / 6 per battle for E / N / S; full refill after every battle (and a Wake/Energy Berry refills one move in battle). A normal 7-turn fight uses 2 to 4 charges of one move, so charges matter for variety, not for running out. A boss at 14 turns can empty a move; the Little Wiggle is the safety net.
* **Kindness rules (from BATTLE.md 4.10, kept)**: three wrong answers in a row: the owl offers a free hint, the next question is one tier easier and Spark +1; Run is always free; a **question cap** (wild 10 / 13 / 11 for bands A / B / C; guardian 18 / 22 / 19): at the cap the enemy calms by itself ("it gets sleepy and happy") and the child gets the normal reward minus the Brilliant bonuses.

### 5.4 Growth, Know-how and coins

| Quantity | Value |
|---|---|
| Points to the next level | `need(L) = 6 + L` (today: `3 + floor(L/2)`). Cumulative from level 1: level 6: 45, 10: 99, 12: 132, 15: 189, 20: 304, 24: 414 |
| Points per right answer | 1; 2 for a right stretch answer; Quick Learner +20% |
| Points per fight | wild win +3, befriending +2, Keeper win +6, guardian win +12; benched friends share **50%** (rounded up) |
| Typical wild fight (band B, 72%) | about 5.7 right + 0.5 stretch + 3 + 2 = **about 11 points**; a level 10 creature needs 16, so 1.5 fights per level at level 10 |
| Time to level 12 from level 3 | 117 points, about 10.6 fights, **about 27 minutes of fights** (today about 14 minutes at 4 points a minute). So about **2 times slower** in play time, with richer fights |
| **Know-how** (new, per creature) | +1 for every right answer in the creature's home subject while it is the partner (battle or quiz). Shown as a ring around the portrait; used by evolution (7.1) |
| Coins | wild win `5 + L`, Keeper `15 + 2L`, guardian `50 + 5L` plus a chest, befriend +5 (as today); a Brilliant hit adds +1 (max 5 a fight). A level 10 wild fight pays about 15 to 20 coins, so a net (30) every two fights |

Migration: levels already earned are kept; the new curve applies to the next levels (a creature never loses a level). The old `evolveLevel(at_level)` rule (level 6 for Heliobud, 12 for Heliolynx) is replaced by 7.1.

### 5.5 Enemy kinds: wild, Keeper, guardian, master

| Kind | Creatures | Fog (per creature) | Intents | Befriend | Target length (band B, 72%) | Rewards |
|---|---|---|---|---|---|---|
| **Wild** | 1 | `kind` 2.0 | temperament weights (4.3); no weakness-aware choice | yes (8) | **7 to 8 questions, 6 to 7 turns, 2 to 3 min with intro and befriending** | coins, points, a chest sometimes (5%), a card sometimes (2%) |
| **Keeper** (trainer-like; NPCs with a name, a line of dialogue and 2 creatures shown as two dots; can be met again) | 2, the second one level +1, sent out after the first calms | 1.4 each | weights, but the Keeper picks a **Sparkle move if it has one** and swaps to the better subject once | no ("they are the Keeper's friends": a gift instead: a card or item) | 10 to 11 questions, 3.5 to 4 min | coins `15 + 2L`, a Keeper badge sticker, a treat or card (30%) |
| **Zone guardian** | 1 | 3.6 | **script** with 3 phases (5.6); Windups | no; "visit" card in the Book and a friend gift | **12 to 16 questions, about 5 min** | coins, a chest, the zone's Evolution Card (first time), a Move Card |
| **Master** (astronomer's test) | 1 | 4.2 | script with 3 phases and a final Windup | no | about 6 min, 15 to 18 questions | badge, Rainbow Card, an egg |

Level of an enemy: wild = clamp(partner level + band shift + roll{-1,0,+1}, zone min, zone max) with band shift A -1, B 0, C +1. Keeper = partner level, then +1. Guardian = max(table level, partner level), at most table + 4 (a guardian is never weaker than the partner, never an impossible wall). Master = max(18, partner level), at most 22. (`solar.yaml` has the master at level 14 while the outer zone's wild creatures reach 15: the master should be 18; changing the data is part of S5.)

### 5.6 Guardian and master scripts

A guardian has Fog `3.6` and three phases at 100% to 66%, 66% to 33%, 33% to 0%. At each phase change a 2.5 s beat plays (the fog swirls, a new intent appears; nothing is hurt). Windups are drawn from the temperament but at least every 3rd round in phase 2 and every 2nd round in phase 3. A guardian cannot be put to sleep for more than one action and resists a major status for 3 rounds.

| Zone | Guardian (level floor) | Subject; weak to | Phase 1 | Phase 2 | Phase 3 | First-clear reward |
|---|---|---|---|---|---|---|
| Moon | **Lunwarden**, the Crater Keeper (7) | Science; Geometry, Math | Puff, Giggle, Silly | Thicken, Windup every 3rd round | Cheer Up, then Puff, Puff, Windup | Moon Card, Science Move Card |
| Sun | **Heliarch**, the Sun Keeper (8) | Math; Hebrew, Science | Puff, Cheer Up | Dizzy Swirl, Windup every 3rd | Cheer Up twice, Windup every 2nd | Sun Card, Math Move Card |
| Rocky planets | **Marstrix**, the Red Dune Keeper (10) | Logic; Math, Hebrew | Puff, Sticky Mud | Thicken, Windup every 3rd | Sticky Mud, Cheer Up, Windup every 2nd | Planet Card, Logic Move Card |
| Giants | **Ringwarden**, the Ring Keeper (13) | Hebrew; English, Math | Puff, Silly | Drowsy Mist (band A: Silly), Thicken, Windup | Shield + Windups every 2nd round | Giant Card, Hebrew Move Card |
| Outer edge | **Nepstorm**, the Far Keeper (16) | Science; Geometry, Hebrew | Puff, Dizzy Swirl | Thicken, Sticky Mud, Windup | two Windups close together (Stagger once to clear both) | Far Card, a chance of a Bright Card |
| Master | **Jovigale**, the Astronomer's Test (18 floor; data says 14) | Science; Geometry, Hebrew | all intents mixed | Windups every 3rd, Thicken | final **Starlight Windup** (Power 80); Staggering it ends the fight with a "calm" special animation | Astronomer badge, Rainbow Card, Mystery Egg |

### 5.7 First chapter tables (the solar system)

**Starters** (the three the child picks from, by subject: Heliobud Math, Terrabub Geometry, Lunibble Science; the code picks one per subject as today in `starters.ts`). Base numbers (Pep / Power / Guard / Speed), and the computed stats of each stage at levels 6, 10, 14, 20 (stage multipliers 1.0 / 1.2 / 1.45; level 6 is shown for stage 0 only in play):

| Creature | Subject | Bases P / W / G / S | Lv 6, stage 0 | Lv 10, stage 0 | Lv 14, stage 1 | Lv 20, stage 1 | Lv 24, stage 2 |
|---|---|---|---|---|---|---|---|
| **Heliobud** line (to Heliolynx, Heliarch) | Math | 10 / 11 / 8 / 10 | 40 / 38 / 28 / 35 | 50 / 49 / 36 / 45 | 72 / 72 / 52 / 66 | 90 / 92 / 67 / 84 | 123 / 127 / 92 / 116 |
| **Terrabub** line (to Terratot, Terravault) | Geometry | 11 / 8 / 11 / 8 | 44 / 28 / 38 / 28 | 55 / 36 / 49 / 36 | 79 / 52 / 72 / 52 | 99 / 67 / 92 / 67 | 135 / 92 / 127 / 92 |
| **Lunibble** line (to Lunihare, Lunwarden) | Science | 10 / 9 / 9 / 11 | 40 / 31 / 31 / 38 | 50 / 40 / 40 / 49 | 72 / 59 / 59 / 72 | 90 / 75 / 75 / 92 | 123 / 104 / 104 / 127 |

(Each cell is Pep / Power / Guard / Speed. The stage multiplier is applied to the bases before the level formula; stage 0 at levels 6 and 10, stage 1 at 14 and 20, stage 2 at 24, which are the levels where each stage is normally met in play.)

**Wild families by zone** (proposal; `solar.yaml` lists the families; the subject column needs entries in `subjects.yaml`; "weak" = the wheel's subject plus one data subject; catch rate is the base of 8.2; levels from `solar.yaml`):

| Zone (wild levels) | Family (stage 0) | Subject | Weak to | Temperament | Bases P/W/G/S | Catch rate |
|---|---|---|---|---|---|---|
| **Moon** (3 to 6) | Lunibble | Science | Geometry, Math | Playful | 10/9/9/11 | 200 |
| | Terrabub | Geometry | Logic, Science | Sleepy | 11/8/11/8 | 200 |
| **Sun** (4 to 7) | Heliobud | Math | Hebrew, Science | Playful | 10/11/8/10 | 200 |
| | Solwind | Science | Geometry, English | Playful | 9/10/8/12 | 190 |
| | Sailbit | English | Science, Logic | Shy | 9/9/9/12 | 200 |
| **Rocky planets** (6 to 9) | Mercurip | Science | Geometry, Hebrew | Playful | 9/9/9/13 | 190 |
| | Venubud | Hebrew | English, Logic | Shy | 11/8/10/9 | 190 |
| | Rustip | Logic | Math, Hebrew | Grumpy | 10/11/9/9 | 190 |
| | Roveroo | Logic | Math, Geometry | Proud | 10/9/11/10 | 180 |
| | Asterchip | Geometry | Logic, English | Sleepy | 9/10/12/7 | 200 |
| | Meteet | Science | Geometry, Hebrew | Grumpy | 8/12/8/12 | 180 |
| | Dustip | English | Science, Math | Shy | 10/8/9/12 | 200 |
| **Giants** (9 to 12) | Jovibud | Science | Geometry, Logic | Proud | 12/10/10/8 | 170 |
| | Iobud | Math | Hebrew, English | Grumpy | 10/12/8/10 | 170 |
| | Europip | English | Science, Geometry | Shy | 11/8/11/10 | 170 |
| | Ganybit | Geometry | Logic, Hebrew | Sleepy | 12/9/12/7 | 170 |
| | Ringlet | Hebrew | English, Math | Proud | 11/9/11/9 | 160 |
| | Titanip | Logic | Math, Science | Sleepy | 11/10/10/9 | 160 |
| | Gravip | Math | Hebrew, Logic | Proud | 10/10/12/8 | 160 |
| **Outer edge** (12 to 15) | Tiltip | Geometry | Logic, Math | Playful | 11/9/11/9 | 150 |
| | Nepbit | Science | Geometry, Hebrew | Playful | 10/10/10/10 | 150 |
| | Plutot | Hebrew | English, Geometry | Shy | 9/9/9/13 | 140 |
| | Kuipip | English | Science, Hebrew | Playful | 10/10/9/11 | 150 |
| | Combit | Logic | Math, English | Grumpy | 9/11/8/12 | 140 |
| | Probip | Math | Hebrew, Geometry | Proud | 10/10/10/10 | 130 |

Subject spread: every zone has at least 3 subjects (Moon has 2 by design, so the first zone teaches the wheel with a single obvious answer). Stage 1 and 2 forms use the same subject; stage 1 catch rate is 150 and stage 2 is 100 (a grown-up form is shyer).

**Zone treats and cards** (used by 7 and 8) are in their sections.

### 5.8 Age bands

| Setting | A (5 to 7) | B (8 to 10) | C (11 to 14) |
|---|---|---|---|
| Fog band multiplier | 0.8 | 1.0 | 0.9 |
| Enemy gentle factor | 0.55 | 0.9 | 1.15 |
| Chance of a right answer by tier (E / N / S) | 90 / 80 / 65% | 85 / 72 / 55% | 80 / 68 / 50% |
| Choices per question | 3 | 4 | 4, pad, order |
| Wild level shift | -1 | 0 | +1 |
| Question cap (wild / guardian) | 10 / 18 | 13 / 22 | 11 / 19 |
| Intent bubble | icon | icon + number | icon + number + order |
| Weak-subject chip | always shown | shown after first sighting | "?" until revealed |
| Brave Heart | default on for every creature | off | off |
| Interaction | taps only; tap-tap instead of drag | drag allowed | all |
| Look | big, cute, slower beats (skippable) | normal | faster animation set; no baby sparkles |
| Questions in a wild fight (72% right) | **6.5** (5 to 9) | **7.4 to 8.2** (5 to 11) | **6.4 to 7.0** (4 to 10) |
| Questions in a guardian fight (72% right) | **12 to 13** | **14 to 16** | **12 to 14** |
| Chance that someone dozes in a guardian fight (72% right) | about 1% | about 50% | about 50% |
| Parent knobs (all bands) | Strength Gentle 0.7 / Normal / Lively 1.3; Length Short 0.75 / Normal / Long 1.3 | | |

### 5.9 Checked by simulation, and the time budget

Appendix A is the simulation. The "player" picks easy, normal or stretch moves by a fixed habit (stretch more in band C), is right with the probabilities of the tier table, meets a weak enemy half of the time, never uses a utility move, shield, heal or swap (so doze rates are an upper bound), and, after a doze, continues with a friend at 35% Pep (a swap). Level 10 wild enemy against a level 10 partner, level 14 guardian against a level 12 partner:

| fight | questions (mean) | p10-p90 | turns | minutes (fight only) | any doze |
|---|---|---|---|---|---|
| wild, band A, 50% right | 9.5 | 6-13 | 8.5 | 2.6 | 0% |
| wild, band A, 72% right | 7.2 | 5-10 | 6.2 | 1.9 | 0% |
| wild, band A, 90% right | 5.9 | 5-7 | 5.2 | 1.6 | 0% |
| wild, band B, 50% right | 11.2 | 7-15 | 9.7 | 3.2 | 11% |
| wild, band B, 72% right | 8.2 | 6-11 | 6.7 | 2.3 | 1% |
| wild, band B, 90% right | 6.6 | 5-8 | 5.2 | 1.8 | 0% |
| wild, band C, 50% right | 9.3 | 6-13 | 7.2 | 2.7 | 10% |
| wild, band C, 72% right | 7.0 | 5-10 | 5.2 | 2.0 | 1% |
| wild, band C, 90% right | 5.6 | 4-7 | 4.0 | 1.6 | 0% |
| guardian, band A, 72% right | 13.3 | 10-17 | 10.9 | 3.5 | 1% |
| guardian, band B, 72% right | 15.7 | 12-20 | 12.2 | 4.4 | 50% |
| guardian, band C, 72% right | 13.6 | 10-18 | 9.6 | 3.9 | 53% |
| guardian, band B, 50% right | 21.8 | 16-28 | 17.7 | 6.2 | 89% |
| guardian, band B, 90% right | 12.5 | 10-15 | 9.4 | 3.5 | 15% |

Reading: a typical wild fight has **6 to 9 questions** over **5 to 7 turns**. A child who answers about half right gets up to 11 and hits the cap (13 for band B) in about one fight in four, so the creature then calms by itself. A guardian is **12 to 16 questions and 3.5 to 4.4 minutes of fight plus about a minute of intro, phase beats and outro: about 5 minutes**. Wild fights almost never doze anyone (the child is learning the game); guardians do in about half the fights of bands B and C, which is what makes swapping and the doze rules (section 6) real. Band A rarely dozes: the parent's Strength knob can raise it.

Time budget of one wild fight (band B, 72%):

| Phase | Seconds |
|---|---|
| Map to arena transition and intro (enemy slides in, intent shows, menu rises) | 2.2 |
| 6.5 turns x (choose 2.0 + question 11 + our animation 2.0 + enemy animation 1.5 + ticks 0.4) | 6.5 x 17 = about 110 |
| A Finale (in about 1 fight in 2) adds | 2 x 11 + 14 = about 25 on average half the time |
| Calm moment | 1.5 |
| Befriending (tray, one throw, shakes, result) | 12 |
| Results card, level up, items | 8 |
| **Total** | **about 2 min 20 s to 2 min 45 s** |

Compare slice 2's 184 s for 7 questions: new fights run about 17 s per question beat instead of 26 s, and every beat does something.

---

## 6. Dozing (fainting) and recovery rules

Design goal: the parent wants creatures to be able to "faint". We keep the drama (a creature can run out of Pep, you must choose a friend, the fight has stakes) and remove everything that could scare a child or punish learning: no loss, no cost in coins or hearts, no red, no "defeated" word, no permanent anything.

### 6.1 What happens

1. **Pep reaches 0 during a round**: the creature does not drop at once. The round finishes (the answered move always plays, see 2.4). At the **end of the round** the creature **dozes**: it yawns, curls up, a little blanket and "Zz" appear (1.4 s, soft lilac, a soft yawn sound). The bar shows a moon.
2. **The game says**: "Heliobud is sleepy. Who will help?" (never "fainted", "KO", "defeated"). The Friends strip opens at once (a **free swap**, no turn used, no question).
3. If the creature that dozed was the last awake one, see 6.4.

### 6.2 How a dozing creature comes back (all optional, all free)

| Way | Rule |
|---|---|
| **Nap on the bench** | While on the bench a dozing creature recovers 10% of max Pep each round and **wakes at 35% Pep after 4 rounds**. So in a long fight your first partner is back for the second half |
| **Wake Berry** (new snack, 25 coins; the Bag) | Wakes one creature at once at 50% Pep (one tap on the berry, one on the creature) |
| **Dream Replay** (optional learning moment) | Tap a dozing portrait: the owl shows **one question the child missed in this battle** (never a new one). Right: the creature wakes at 50% Pep at once. Wrong or skipped: the nap goes on, nothing lost. Once per creature per battle; no timer; not offered if the child missed nothing |
| **Healing moves** (Story Hug, Healing Rain) | Heal only awake creatures |
| **End of the battle** | **Everyone wakes at full Pep and full Charges**, whatever happened: no trip to the Rest Center, no "nap time" screen |

The Rest Center keeps its job (swapping the party, hearts, energy for pacing in FEATURES 4.9); dozing never lowers energy or hearts.

### 6.3 Swapping

* **Voluntary swap** (tap a portrait on your turn): uses the turn, asks no question; the incoming creature takes the enemy's action of the round. Animation 0.8 s (the old friend jumps out of the picture, the new one jumps in).
* **Swap after a doze**: free, immediately, no enemy action in between.
* Marks and the enemy's statuses stay; the partner's stat stages and statuses reset when it leaves; Spark stays (team meter).
* Subject strategy: the team strip shows each friend's subject icon; the weak subject chip of the enemy glows on any friend who has a Sparkle move.

### 6.4 When the whole team is dozing

This is the "fainting at its worst", and it is still gentle:

1. A lullaby plays and the enemy takes a Silly turn (it also yawns).
2. **After 2 rounds** the friend with the highest Pep wakes at 35% (nap timers keep counting) and the fight continues. The child can also use a Wake Berry or Dream Replay at once.
3. The child can always tap **Run**: the fog drifts off, no reward from the fight except the points already earned, and the creature may be met again.
4. The only score effect: the **Steady star** of the results (6.5) is not earned.

### 6.5 Results stars (no penalty, a small bonus)

| Star | Condition | Bonus |
|---|---|---|
| Calm | the fog was cleared | the normal reward |
| Steady | nobody dozed | +2 coins |
| Bright | at least 2 Brilliant hits or 1 Sparkle hit that was Brilliant | +2 coins |

Missing a star never subtracts anything.

### 6.6 Look and sound (not scary)

No red, no flashing, no sad face; the dozing pose is a calm sleeping pose with a blanket sprite drawn over the same creature art (no per-creature art needed); the sound is a soft yawn and two descending notes in a major key; the creature "wakes with a stretch" and a small sparkle. Band A may switch to "sleepy bunny" wording; all bands get the same visuals.

### 6.7 Brave Heart and the parent's knob

* **Brave Heart** (3.5) is the default gift for all creatures in band A: the first doze of the battle leaves 1 Pep instead. 
* **Strength** (Gentle / Normal / Lively) scales enemy damage by 0.7 / 1 / 1.3. Gentle plus band A is effectively "nobody ever dozes", for families that want that.

---

## 7. Evolution

### 7.1 Gates

Today a creature evolves automatically at `max(6, round(at_level / 3))` (Heliobud at level 6), with no choice and no ceremony. New rule: evolution has **gates**, and the child chooses when to evolve.

| Gate | Stage 0 to 1 | Stage 1 to 2 | Source |
|---|---|---|---|
| **Level** | 12 | 24 | the creature |
| **Know-how** (right answers in its home subject while it was the partner) | 40 | 120 | new counter, 5.4 |
| **Subject stars** (`learner.stars[subject]`: one star per mastered skill, already in the engine) | 2 | 6 | learning engine |
| **Hearts** (FEATURES 4.9, 0 to 5) | 2 | 4 | care |

* The check happens **after the results card** of a fight, never in the middle of one. When all gates are met, the creature's portrait gets a gold ring and the results card shows "Heliobud feels something warm" with a big **Evolve** button and a small **Later**.
* In the creature's details a **checklist** of the four gates shows ticks and rings (for example "Know-how 31 of 40", "Stars 1 of 2"), so the child sees what is missing and in which subject to practise (this is borrowed from the requirement checklist of Digimon Story: Cyber Sleuth, see Appendix B). This is the "evolution by learning" the parent asked for.
* **Optional extra gates in data** (a field `evolve` on a species): `lesson: <id>` (a tutor lesson completed, for example the Moon family needs `science.space.moon`), `place: <zone>` (the child stands in the creature's home zone, for stage 2), `subject_stars: n`. In chapter 1 use `lesson` for the three Moon and Sun families and `place` for the stage 2 of each zone's creatures.
* **Keep small**: a "Keep small" ribbon on a creature (a toggle) stops the prompt; children who love the small form keep it; the ribbon can be removed anytime.
* **Pace check** (5.4): level 12 needs about 27 minutes of fights; Know-how 40 needs about 8 fights with that creature as the partner; stars come from the child's real mastery. So a first evolution takes **three to four play sessions**, about twice as long as today. Stage 2 (level 24) is a chapter-2 goal: in chapter 1 almost nobody reaches it except through a Bright Card.
* **Evolution by learning gives a Shimmer**: a permanent soft aura in the creature's subject colour (a deterministic cosmetic; FEATURES 4.9 already avoids random shinies) and the Spark meter starts at +1 for that creature. A card evolution has neither.

### 7.2 Evolution Cards

Cards are items (a new "Cards" tab in the Bag) that **replace the Know-how, stars, hearts and lesson gates** but not the level gate: a card works from **gate level minus 3** (level 9 for stage 1, level 21 for stage 2). The card is used up. Only creatures that qualify glow when a card is chosen.

| Card | Evolves | Shop price | Where else |
|---|---|---|---|
| **Zone Card** (5: Moon, Sun, Planet, Giant, Far) | a stage 0 creature native to that zone to stage 1 | **120 coins** (sold once the zone's guardian has been calmed) | guardian first clear; Keeper gift 10%; chest 3% |
| **Subject Card** (6: Math, Geometry, Science, English, Hebrew, Logic) | a stage 0 creature of that subject, from any zone, to stage 1 | **200 coins** (sold after the first Keeper battle) | **tutor's gift**: every 4th lesson passed in a subject gives that subject's card; chest 2% |
| **Bright Card** | any stage 1 creature to stage 2 | **450 coins** (sold after the third guardian) | Nepstorm's first clear (chance 50%); chest 1% |
| **Rainbow Card** | any creature, one stage, no level gate except 8 | not sold | the master's reward; one per child |

Money check: a level 10 wild fight pays about 17 coins (5.4), so a Zone Card is about **7 fights** (about 17 minutes); the natural route to level 12 takes about 27 minutes plus the learning gates, so cards are a faster route that skips the learning, at a price in play time that is real but not huge. Coin sources never go negative (as today).

### 7.3 After evolution

Level and Know-how stay; Pep, Power, Guard and Speed jump by the new stage multiplier; the move set stays and the new subject moves of a higher level unlock as usual; a new Book entry; the old and new forms are both in the Book. Known moves and equipped moves do not change.

### 7.4 The evolution animation: storyboard (about 10.6 s, skippable)

Layer plan: a dim layer (DOM `div`), the creature as two stacked `<img>`s (old and new) with a runtime-built **white silhouette** of each (drawn once on an offscreen canvas with `source-in`, so no extra art and only **opacity and transform** animate, which the compositor can run), a radial glow image, and one **canvas particle layer** (10.3). Colours come from the creature's subject colour. Easing names are CSS: `out-cubic` = `cubic-bezier(0.215,0.61,0.355,1)`, `in-out-sine` = `cubic-bezier(0.37,0,0.63,1)`, `back-out` = `cubic-bezier(0.34,1.56,0.64,1)`, `out-expo` = `cubic-bezier(0.16,1,0.3,1)`.

| Beat | Time (s) | What the child sees | Motion and easing | Particles | Sound | Tech |
|---|---|---|---|---|---|---|
| B0 Ready | 0.0 to 0.4 | Child taps Evolve (or a card flies from the Bag to the creature and dissolves). The screen dims | dim layer opacity 0 to 0.6, 400 ms, `out-cubic` | 6 gold motes rise from the card | soft "tink" | CSS transition |
| B1 Step into the light | 0.4 to 1.4 | The creature slides to the centre and grows; a soft radial glow of the subject colour appears behind it | translate + scale 1 to 1.3, 600 ms, `back-out`; glow opacity 0 to 0.6, 800 ms, `in-out-sine` | none | a low pad begins | WAAPI |
| B2 Gathering | 1.4 to 3.2 | 16 small light motes spiral in from the screen edges to the creature; a ring grows behind it; the creature bobs gently | motes: 1.2 to 1.6 s each, staggered 60 ms, `in-cubic`, path = a logarithmic spiral; ring scale 0.8 to 1.1 and opacity 0 to 0.8 over 1.8 s; bob 4 px, 1.2 s sine | 16 motes (canvas) | rising hum (+5 semitones over 1.8 s) and a twinkle per mote arrival (3 variants, at most 8 per second) | canvas + WAAPI |
| B3 Glow | 3.2 to 4.4 | The creature turns into a bright silhouette | crossfade picture to white silhouette over 900 ms (opacity, no flicker, no step faster than 300 ms); two slow scale pulses 1.3 to 1.38 at 1.5 Hz | motes keep arriving, slower | hum peaks, a soft bell | WAAPI |
| B4 Change | 4.4 to 5.6 | The old silhouette shrinks and the new one grows into its place while a band of light circles once around | old scale 1.38 to 0.9, new scale 0.8 to 1.0, opacity crossfade 700 ms, `in-out-sine`; ribbon rotation 360 degrees in 1.2 s | 12 ribbon sparks along the circle | shimmer glissando up an octave | WAAPI + canvas |
| B5 Burst | 5.6 to 6.4 | A ring of light expands, stars fly out, the dim lifts | ring scale 0 to 1.8 screen heights, 800 ms, `out-expo`, opacity 0.7 to 0; dim 0.6 to 0 over 600 ms | 24 stars radial (220 to 420 px/s, life 900 ms, gravity 120 px/s2, alpha and scale to 0), subject colour and white | soft whoosh and a major chime chord | canvas + WAAPI |
| B6 Reveal | 6.4 to 7.6 | The new creature appears in full colour and lands with a small hop | silhouette fades out over 600 ms; scale 1.0 to 1.15 to 0.95 to 1.0 over 650 ms, `back-out`; hop 16 px | a few stars | the new creature's call | WAAPI |
| B7 Name and stats | 7.6 to 9.0 | A card slides up: "Heliobud grew into Heliolynx!"; Pep, Power, Guard, Speed count up; new moves or a Gift flip in | card translateY 100% to 0, 400 ms, `back-out`; numbers count 600 ms each, `out-cubic`, one soft tick per change (max 10 a second); move card rotateY 180 degrees, 400 ms | none | gentle arpeggio, ticks | CSS + a tiny number-tween helper |
| B8 Celebrate | 9.0 to 10.0 | 8 hearts and stars float up; the owl speaks one line; the Book icon pulses "new entry" | float 1.2 s `out-cubic`, alpha out | 8 hearts and stars | fanfare, under 3 s | canvas |
| B9 Settle | 10.0 to 10.6 | The card drops away; the creature shrinks back into the team strip; the screen returns | scale 1 to 0.4 with translate, 500 ms, `in-out-sine` | none | a soft "pop" | WAAPI |

* **Skip**: a tap after 1.4 s turns playback to a fast version (animation `playbackRate` 3) that still shows B6 and B7; the evolution is never lost by skipping.
* **Second and later evolutions** use the same sequence; the parent can choose "short" (about 6 s: B2 halved, B8 dropped).
* **Calm effects / reduced motion**: B1 to B6 become one 1.6 s crossfade with a static halo, no particles, no scale; sound and B7 stay.
* **Safety**: no step of brightness change faster than 300 ms; pulses at 1.5 Hz at most (below the 3 flashes per second of WCAG 2.3.1); the white silhouette is never full-screen white (the dim layer stays under it until B5).
* **Haptics (optional)**: one light 30 ms vibration at B5 through `navigator.vibrate` (unverified in this WebView; no plugin is added for it).

---

## 8. Catching: befriending

### 8.1 Principles

1. Befriending is a **decision** (when, with which tool), not a chore at the end. It is available **at any time** from the menu (Befriend), and it is **always allowed** except in Keeper and guardian fights.
2. It is **probabilistic with visible logic**: the chance rises as the Fog goes down, with status (a sleeping or dizzy creature is easier), with the species' shyness, with the level, with the tool, with a treat the creature likes, and with an optional question. The child sees a **chance word** (Low, Fair, Good, Great) before throwing, as Dragon Quest Monsters' scout meter does.
3. It **may fail, gently**, and failing makes the next try better (pity).
4. A try is **one tap** from the tray when a good default is chosen; the question is optional.

### 8.2 The formula

```
hpFactor = (3 * Fmax - 2 * Fnow) / (3 * Fmax)          1/3 at full Fog, 1 at 0
levelMod = clamp(1.2 - 0.02 * (L - 5), 0.7, 1.2)       small creatures are friendlier
a   = min( 247, rate * hpFactor * levelMod * tool * treat * status * gift ) + pity
p   = min(0.97, a / 255)
```

* `rate`: the species' base (basic 200, stage 1 150, stage 2 100; family values in 5.7). `tool`: 8.4. `treat`: 8.4. `status`: 8.5. `gift`: 1.5 after a right Gift question, else 1. Curious gift: x1.15.
* **Pity**: after each failed try, add 30 to `a` for the rest of this fight (band A 45, band C 25). **Mercy**: the 4th try of one fight (3rd in band A) always succeeds.
* **Three shake checks**: each check succeeds with probability `q = p^(1/3)`, so the whole try succeeds with probability `p` and the child sees up to three shakes (a failure can come on the first, second or third shake, which is where the suspense is).
* **Chance word**: Low under 25%, Fair 25 to 49%, Good 50 to 79%, Great 80% and over. The words are shown; the numbers are not (band C's details sheet shows them).
* Calm (Fog 0) gives the status bonus x2, so a calmed basic creature is 97% and a stage 2 creature 86%.

Chance with a Magic Net (tool x1.0), level 10, no status (calm uses the x2 status bonus):

| Fog left | rate 200 (basic) | rate 150 (stage 1) | rate 100 (stage 2) |
|---|---|---|---|
| 100% | 29% | 22% | 14% |
| 75% | 43% | 32% | 22% |
| 50% | 58% | 43% | 29% |
| 25% | 72% | 54% | 36% |
| 10% | 81% | 60% | 40% |
| 0% (Calm) | 97% | 97% | 86% |

Combinations at 50% Fog, rate 200: Magic Net 58%, Silver Net 86%, Silver Net + Berry 97%, Magic Net + Gift question 86%, Magic Net after a Lullaby (asleep, x2) 97%. A stage 2 creature (rate 100, level 18) at 50% Fog: Magic Net 25%, Silver Net 37%, Silver Net + Gift question 55%, asleep + Silver + Gift 97%. The point: **you can always do it the careful way; the quick way is a gamble**.

### 8.3 The Befriend tray (one tap in the common case)

Tapping **Befriend** opens a small tray over the right column (0.25 s):

```
 [Tool: Magic Net  x3 ]  [Treat: Berry x5 ]  [ Gift question: a book, +50% ]   Chance: GOOD
                          [ THROW ]  (the tray remembers the last choice; "Auto" picks the best you own)
```

* Tools and treats are tiles; tapping a tile cycles through what the child owns (long press opens the list). **Throw** is the big button. A child who just wants to try taps Befriend then Throw (2 taps, one between ideas). Auto picks the highest-multiplier tool and a treat the creature likes, never a rare item the child did not choose to spend (Star Net and Rainbow stuff need an explicit tap).
* The **Gift question** tile: one normal-tier question in the creature's subject ("sing a song for the creature"); right: x1.5; wrong or skipped: x1, no penalty; the tile can be used once per try.
* The chance word updates live as tiles change; the creature reacts (leans closer, ears up).

### 8.4 Tools

Tool = net or card, one per try; treat = optional, one per try. `tool x treat` multiply.

| Item | Multiplier | Price | Where |
|---|---|---|---|
| **Magic Net** (existing) | tool x1.0 | 30 | shop; starter kit 3; owl's daily gift when none |
| **Silver Net** (existing) | x1.5 | 90 | shop after the first guardian; chests |
| **Star Net** (new, from FEATURES 4.3) | x2.2, and the first shake never fails | 200 | guardian rewards; big chests; not for sale at first |
| **Subject Friendship Card** (6; new) | x2.0 on creatures of its subject, x1.0 on others | 45 | shop; Keepers |
| **Zone Friendship Card** (5; new) | x1.8 on creatures native to the zone, x1.0 others | 60 | shop in that zone; chests |
| **Berry** (existing snack) | treat x1.2 | 10 | shop; ground |
| **Biscuit** (existing) | treat x1.4 | 25 | shop |
| **Pie** (existing) | treat x1.6 | 60 | shop; chests |
| **Favourite treat** | +0.3 to the treat's multiplier when it is the species' liked treat (for example 1.2 becomes 1.5) | | the Book shows each creature's liked treat after the first befriend; the treat link uses the existing taste field (FEATURES 4.9) |

Treats are consumed and also grow the new friend's hearts by 1 on joining (the existing snack effect). A used tool is consumed whether the try succeeds or not; a Net that fails is **given back 50% of the time** (a "the net came back" sparkle), a kindness for the youngest bands (band A: 100% of the time).

### 8.5 Status bonuses (the reason to use Lullaby and Dizzy)

| Status of the creature | Bonus |
|---|---|
| Drowsy (asleep) | x2.0 |
| Calm (Fog 0) | x2.0 |
| Dizzy | x1.5 |
| Slow | x1.3 |
| Giggly | x1.25 |
| Shield (thick fog) | x0.8 |
| Windup in progress | x0.8 |

Only the largest status bonus counts (no stacking), so the tool and the treat are where combinations come from.

### 8.6 Rules of the world

* **Keeper creatures and guardians cannot be befriended** (their story is told in the Book as a visit and a gift).
* **A wild creature does not run away** after a failed try (nobody is chased); it only "sniffs and steps back" and the next chance is a little better. The Run button still ends the fight.
* **A befriended creature joins at its wild level**, with Know-how 0; it goes to the party if there is room, otherwise the Meadow (as today). A new friend card appears with the **naming moved out of the way**: a one-tap "Name it" chip that can be used later from the Friends screen (no blocking letter board right after a catch).
* **Repeat species**: a second Heliobud is welcome (the Book already counts); the new friend card says "another friend of the same kind" and offers a gift (a treat).
* Dragon Quest Monsters' observation that duplicates are harder to scout is **not** copied: duplicates are useful to teams.

### 8.7 The throw: timeline (about 4 s, skippable by tap)

| Step | Time (s) | What the child sees | Motion and easing | Sound |
|---|---|---|---|---|
| Tool flies | 0.0 to 0.6 | The net (or card, or treat first) arcs from the partner to the creature | translate along a parabola, ease-out up and ease-in down; spin | whoosh |
| Catch | 0.6 to 1.0 | The creature shrinks softly into the net (it giggles, no fear); the net drops to the ground | scale 1 to 0.3, 400 ms `in-out-sine`; net drops with a small bounce | soft "boop" |
| Shake 1 | 1.0 to 1.7 | The net wobbles left and right | rotate +/-14 degrees, 500 ms; pause 200 ms | wood-tick |
| Shake 2 | 1.7 to 2.4 | Again | same | tick (higher) |
| Shake 3 | 2.4 to 3.1 | Again, slower | same, 600 ms | tick (highest) |
| Success | 3.1 to 4.0 | The net glows, stars burst, "click" | glow opacity pulse 0 to 0.7 to 0.3, 500 ms; 14 stars | chime and jingle |
| Fail on shake k | at the failing shake | The net pops open early, the creature giggles and trots back to its place | net scale 1 to 1.1 to 0 in 200 ms; creature hop back 300 ms | "pop" and a giggle |

Failing also shows the chance word moving up one step and "sniffs the net" text. Nothing red.

### 8.8 Optional skill moment (later)

For ages 8 and up an **optional "nice throw"** (a shrinking ring with a tap, as in some other games): Nice x1.1, Great x1.2, never required, never changes learning ratings, off for band A. Not in S3 (12.3); decided after play.

---

## 9. Flow, transitions and the "no dead waiting" rules

### 9.1 The whole fight as a list of transitions (budgets in seconds)

| # | From to | What happens | Time | Skippable |
|---|---|---|---|---|
| T1 | walking in grass | the grass tiles sway as the hero passes (10.4); a rustle and a small "!" bubble over the hero | 0.5 | no |
| T2 | map to battle | a soft fog wipe in the zone's colour from the hero outwards, the map music ducks 6 dB and the battle theme fades in | 0.45 | tap |
| T3 | intro | the enemy slides in from the right with its name card and "loves" chip, the partner pops from the ship's light, the first intent bubble pops | 2.2 | tap |
| T4 | menu | the move cards rise from the bottom as the intro ends (they can be tapped during the last 0.4 s of the intro) | 0.3 | n/a |
| T5 | move tap to question | the panel opens at once (the tapped card moves to the panel header) | 0.2 | n/a |
| T6 | answer tap to effect | the panel closes (0.15 s) while the move animation starts (the answer is highlighted briefly in the panel, then gone) | 0.15 | n/a |
| T7 | effect | our animation, the number, the bar, the status icon | 1.5 to 2.2 | tap to speed 2x |
| T8 | enemy's action | its animation, our Pep bar | 1.5 | tap to speed 2x |
| T9 | end of round | ticks and counters, next intent bubble | 0.4 | no |
| T10 | menu again | **the menu is live from 0.6 s into the enemy's animation** (a tap during the animation is buffered and runs at its end) | 0 | n/a |
| T11 | phase change (guardian) | the fog swirls and a new intent set appears | 2.5 | tap |
| T12 | doze | the creature curls up, the Friends strip opens | 1.4 | tap |
| T13 | swap | out and in | 0.8 | tap |
| T14 | calm | the enemy's Fog dissolves into sparkles, it sits happy, the Befriend tray pops up by itself (Auto choice highlighted) | 1.5 | tap |
| T15 | throw | 8.7 | about 4 | tap |
| T16 | results | **one card**: stars, points as bars filling, coins, items, a card; level-up shown inline as a pop on the bar; auto-closes after 6 s if not touched, or one tap | 6 | one tap |
| T17 | evolution prompt | only if a creature is ready | 0 | Later |
| T18 | return | a fade to the map, music crossfade 0.6 s | 0.4 | no |

### 9.2 Rules

1. **No dead waiting**: every phase either shows motion or accepts input; no screen waits for a button that is only "Continue" (the slice 1 feedback page is gone).
2. **Input buffering**: a move tap during the enemy's animation is queued and starts at the end of it.
3. **Skip and speed**: a tap anywhere during an animation (not on a button) speeds it 2x; a second tap skips to its end state.
4. **One tap between ideas**: Move 1 tap; swap 1 tap; Bag item 2 taps; Befriend 2 taps; Run 1 tap (no confirm; it is always free).
5. **The question is where the child looks**: the arena stays visible above the question panel; the move's effect lands on that same view.
6. **Learning feedback without a page**: a right answer shows a green tick on the tile and the hit; a wrong answer shows the right tile in gold and a "Why?" chip in the results card; the **explanation is shown in the results card** ("2 to remember"), not mid-fight. Missed questions feed Dream Replay (6.2) and the tutor.
7. **Calm effects**: no shake, no particles, fades only; the hit numbers still show; one switch in the child's settings and honoured automatically with `prefers-reduced-motion`.
8. **Sound ducks and layers**: fight music at -8 dB under SFX; a "calm" sting; all SFX can be turned off together; the existing map music resumes after the fight.
9. **Never two long waits in a row**: a phase break or evolution is followed by control, not by another cinematic.

---

## 10. Animation technology: what to use

Current stack (read from the repo): React 19, Phaser 4.2.1 (a lazy chunk used only by the map scene `src/game/mapGame.ts`), CSS keyframes in `styles.css` (about 30), no animation library. The battle UI is DOM/React, not Phaser. The only device data we have: a modern Android 16 phone whose log reports the map at about **120 fps on average** (lines "map frames: 119 fps"), plus one "resolution lowered, median 0.0 fps over 3 s" event at 16:55:01 right after the app returned from a menu (a stall to investigate, not a sign of general slowness). `minSdkVersion` is 24, so older WebViews exist on paper; we have **no data** from an old phone.

### 10.1 Facts, measured and cited

Measured on 2026-10-21 in a scratch project: `import` of the one entry point, bundled with esbuild (minified, ESM, production), then `gzip -9`. These are our measurements, not vendor numbers; "docs" is what the vendor says.

| Option | Version | Gzip, measured | Docs / notes | What it gives |
|---|---|---|---|---|
| CSS transitions and keyframes | n/a | 0 | `transform` and `opacity` run on the compositor ([web.dev](https://web.dev/articles/animations-and-performance)); each promoted layer costs GPU memory, so use `will-change` only around an animation ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)) | State changes: bars, menus, icons, idle bobs |
| **Web Animations API** (`element.animate`) | built in | 0 | first implemented in Chrome 36, same compositor path as CSS for transform and opacity ([Chrome blog](https://developer.chrome.com/blog/web-animations)); WebView is Chromium, so the same applies (our inference; not verified on the parent's phone) | Sequenced one-offs with Promises (`.finished`), `playbackRate` for "tap to speed", `commitStyles`, `getAnimations()` to pause or skip all |
| Motion (the library formerly called Framer Motion) | 14.5.0 | `animate` 24.3 KB; `motion/mini` **3.4 KB**; `motion/react` with `LazyMotion`: 31.2 KB; full `motion` component: 45.5 KB | docs say mini is 2.3 to 2.5 KB and hybrid 17 KB ([Motion docs](https://motion.dev/docs/react-reduce-bundle-size)); our import measurement is larger | WAAPI wrapper with springs and sequences |
| react-spring | 10.1.2 (`@react-spring/web`) | 17.2 KB | spring physics for React props | physics-based UI motion |
| GSAP | 3.15.0 | core 27.6 KB | since Webflow's acquisition all plugins are free under the "no charge" standard license, with a restriction on tools that compete with Webflow's visual animation builders ([Webflow](https://webflow.com/blog/gsap-becomes-free)) | the most capable timelines |
| anime.js | 4.5.0 | 12.7 KB | | small timeline engine |
| Lottie (`lottie-web` light build) | 5.13.0 | 48.8 KB | needs animations authored as vector (After Effects) | vector animation playback |
| dotLottie (`@lottiefiles/dotlottie-web`) | 0.81.0 | JS 13.7 KB, **plus a WASM file of 1.24 MB (496 KB gzip) shipped in the package** | LottieFiles says the runtime is about 150 KB ([LottieFiles](https://lottiefiles.com/dotlottie)); I could not reconcile that with the 1.24 MB file in the npm package | the same, faster, bigger |
| Pixi | 8.22.0 | 265 KB for a full import (a tree-shaken subset would be smaller, not measured) | a second WebGL renderer next to Phaser | sprite/WebGL rendering |
| **Phaser** (already shipped) | 4.2.1 | the lazy chunk is 1.38 MB minified, 353 KB gzip | tweens with chains, stagger, easing; a particle emitter with `explode`; a filter system (glow, bloom, blur, vignette, colour matrix, displacement, wipe) that is WebGL only; camera shake ([Phaser 4 filter system](https://phaser.io/news/2026/05/phaser-4-filter-system), the skills docs in the package) | the map scene |

### 10.2 Recommendation (the minimal set)

| Need | Use | Why | Cost |
|---|---|---|---|
| Bars, menus, move cards, status icons, idle bob, damage numbers | **CSS transitions and keyframes** (`transform` and `opacity` only; the HP bar is `scaleX` with a trailing "ghost" bar) | zero cost; compositor friendly; already how slice 2 works | 0 KB |
| One-off sequences: our attack, hit flash, screen shake, enemy intent, doze, swap, throw, evolution beats, results | **WAAPI through a 60-line helper `fx.ts`** (`play(el, keyframes, opts): Promise`, `seq`, `skip()`, `speed(2)`, calm switch, `prefers-reduced-motion`) | Promises give readable choreography; `playbackRate` gives skip and speed-up for free; no new dependency to learn or audit | about 1 KB own code |
| Particles in the battle and the evolution | **a tiny canvas layer of our own** (10.3) | Phaser is not loaded during a DOM battle (and should not be: 353 KB gzip to draw 24 stars); Pixi is worse | about 3 KB own code |
| Grass sway while walking, dust, ambient motes, zone glow, camera shake on the map | **Phaser tweens, particles and `cameras.main.shake`** in `mapGame.ts` (10.4); `addGlow` only if measured cheap, otherwise an additive-blend radial sprite | the map already runs in Phaser at about 120 fps; nothing new to ship | 0 KB |
| Springy UI | none. A `back-out` cubic-bezier gives the overshoot we use | react-spring or Motion would add 17 to 31 KB for something one easing does | 0 |
| Optional later | `motion/mini` (3.4 KB measured) if hand-written WAAPI sequencing becomes painful in S4 | the only library whose cost is under 4 KB | 3.4 KB gzip |
| **Not now** | GSAP, Motion (full), react-spring, anime.js, Lottie, dotLottie, Pixi | each duplicates what WAAPI plus Phaser already do; Lottie needs vector authoring while our art is generated raster; dotLottie ships a 1.24 MB WASM; Pixi duplicates Phaser's renderer | |

**APK size budget.** The repo has no stated limit. Current `app/public/game` is 22 MB (sprites 9.9 MB, audio 6.2 MB, emoji 1.8 MB, content 1.4 MB, atlas 0.9 MB) plus the Phaser chunk (1.4 MB). Google Play's current help page lists 200 MB for the base module of an app bundle (another capture of the same page says 500 MB; check the live page before relying on either) ([Play Console help](https://support.google.com/googleplay/android-developer/answer/9859372)). Proposed budget for BATTLE V3: **JavaScript +15 KB gzip at most (planned: about 4 KB), new art +8 MB, new audio +3 MB** (OGG mono about 64 kbps: 30 effects about 1 MB, four music loops of 60 s about 2 MB).

### 10.3 The canvas particle layer

* One `<canvas>` over the arena (and over the evolution screen), size = arena size, device pixel ratio capped at 2, **no animation loop while empty** (it starts with the first `emit` and stops when the pool is empty).
* A pool of up to **48** particles (slice 2's limit of 24 is raised because the evolution burst needs 24 and the ring sparks 12); each particle is a pre-rendered sprite frame (star, leaf, bubble, heart, digit, letter, shape glyph, mote) drawn with `drawImage`, with position, velocity, gravity, life, scale and alpha curves; no per-frame allocation.
* API: `emit(kind, x, y, count, opts)`, `burst`, `spiral(target, n)`, `clear()`. Calm switch: `emit` becomes a no-op and the hit shows a single static star.
* Tests: a deterministic seed drives a unit test of the motion maths; a performance test logs `fx frames: N fps average, slowest M ms` in the field log (like the map's), so the parent's phone reports its own numbers.

### 10.4 On the map (Phaser)

* **Grass sway**: each tall-grass tile is an overlay sprite; when the hero is within 1.5 tiles its angle tweens +/-6 degrees and x +/-1 px with a sine ease (400 ms, yoyo, staggered by distance), and 2 to 3 leaf particles fly (a pooled Phaser emitter, `explode(3)`). Reduced motion: no tween, a single frame change.
* **Encounter**: the grass rustles hard for 0.5 s, the "!" bubble pops (a DOM overlay), then the fog wipe (T2).
* **Dust** when walking: a 2-particle puff per step, pooled.
* **Zone glow and ambient motes**: a low-alpha radial sprite with additive blend and a few drifting motes; Phaser's WebGL `Glow` filter only if a measurement on the phone shows it free.
* Everything on the map respects the existing resolution-lowering logic and the "calm effects" switch.

### 10.5 Device check (part of S1)

A one-page checklist on the parent's phone: frames per second with 48 particles plus four moving layers; `will-change` memory (no more than 6 promoted layers at once); a cold start of the battle screen under 300 ms; and a note of the WebView version from the log's user agent. If any number is bad on a low-end phone, the first fallback is "calm effects" automatically.

---

## 11. Art and audio needed (lists for ChatGPT prompts)

Style for every prompt (prefix): "soft children's storybook illustration, rounded shapes, gentle colours, no outlines darker than mid-grey, no violence, no weapons, no blood, no scary faces, friendly, modest, transparent background, centred, high contrast against dark and light backgrounds". Sizes are the delivered sizes; PNG with alpha unless noted. Name files as in the table so S1 can wire them. Totals aim at +8 MB art and +3 MB audio (10.2).

### 11.1 Art

| Group | Items | Size / format | Count |
|---|---|---|---|
| **Subject icons** | math (an orange number), geometry (a blue shape trio), science (a green leaf and drop), English (a yellow A), Hebrew (a pink aleph), logic (a purple puzzle piece); each as a round badge | 128 x 128 | 6 |
| **Move effect sprites** | per subject: one projectile (digit leaves, a dot, a leaf, a letter, an aleph, a puzzle piece) and one soft impact burst in the subject colour | 128 x 128 projectile, 256 x 256 burst | 12 |
| **Utility effects** | shield bubble, heal rain cloud, regen beam, boost glow ring, charm hearts, mirror panel, magnifier, lullaby moon and notes, question marks, mud blob, snowflake, maze puddles, equals sign, plus signs, rhyme words | 128 to 256 | 15 |
| **Status icons** | the 14 in 4.1 (drowsy, dizzy, slow, shield, regen, boost arrows, weaken arrows, focus, giggly, mark in 6 subject colours, sniffly, windup ring, calm, dozing) | 64 x 64, shown at 28 | 14 (+5 colour variants) |
| **Intent icons** | puff, big puff with ring, thick fog, giggle, drowsy mist, dizzy swirl, sticky mud, cheer-up arrow, silly dance | 96 x 96 | 9 |
| **HUD** | Fog bar frame, Pep bar frame, trailing ghost bar, Spark star (empty, half, full), tier badges (leaf, star, crown), power flames 1 to 4, charge dot, sparkle corner, shield-glyph (sturdy), moon (dozing) | various, 9-slice where possible | 14 |
| **Move cards** | card frames for E, N, S, U, F tiers (5), a dimmed state, the question panel header | 9-slice 300 x 120 | 7 |
| **Doze overlay** | a blanket sprite and "Zz" in two sizes that sit on top of any creature | 256 x 256 | 3 |
| **Befriend** | Magic, Silver and Star nets (3), Friendship Card faces (6 subject + 5 zone icons), treat icons (berry, biscuit, pie, wake berry), tray frame, chance words art (4), the "net popped" puff | 128 to 192 | 24 |
| **Evolution** | light mote, glow radial, ring, ribbon spark, star, heart, evolution card frames (5 zone, 6 subject, bright, rainbow = 13), ready-ring | 64 to 512 | 22 |
| **Backdrops** | one battle backdrop per zone (Moon, Sun, Rocky planets, Giants, Outer edge) at 1746 x 786 (2x of 873 x 393) as JPEG or WebP, plus a master arena | 5 + 1 | 6 |
| **Fog layers** | three tileable soft fog textures (zone colours via tint) | 512 x 512 | 3 |
| **Map** | tall grass overlay frames (2 swaying frames per zone tileset), dust puff, leaf | 32 x 32 | about 12 |
| **Particle glyphs** | digits 0 to 9, Hebrew and Latin letters (a set of 8), triangle, circle, square, droplet, spark | 64 x 64 | about 28 |
| **Results and cards** | results card frame, star (3 states), coin pile, level-up ribbon, "new friend" card frame | various | 8 |
| **Keeper art** | a spacesuit explorer portrait (3 variants), a guardian name banner per zone | 256 x 256 | 3 + 6 |

### 11.2 Audio

Short, soft, major-key, kind. OGG, mono, 64 kbps, loudness matched. All can be turned off together.

| Group | Items | Count |
|---|---|---|
| UI | menu tap, move select, card flip, panel open and close, tray open, chance word up | 7 |
| Answer | right chime (3 pitches by streak), wrong "boing" (silly, soft; never a buzzer), Spark star fill, Spark full | 7 |
| Hits by subject | a soft impact per subject (6), a Sparkle ring (1), a Sturdy "tink" (1), Brilliant sting (1) | 9 |
| Status | lullaby notes, dizzy swirl, slow squelch, shield bubble, heal chime, boost whoosh, weaken sigh, mark sticker, giggle, sniffle | 10 |
| Enemy | windup warning (soft rising tone), stagger "oops", puff, thicken, silly dance bounce | 5 |
| Team | swap whoosh, doze (yawn and two notes), wake stretch, Wake Berry crunch | 4 |
| Befriend | tool whoosh, boop, three shake ticks (3 pitches), success chime and jingle, fail pop and giggle, "the net came back" sparkle | 8 |
| Evolution | pad (loop 8 s), rising hum, mote twinkles (3), shimmer glissando, whoosh and chime chord, fanfare under 3 s, number tick | 9 |
| Level-up, results, coins | level-up, results tally ticks, coin | 4 |
| Music | wild fight loop (60 s), Keeper loop (60 s), guardian loop (60 s, with a Windup stinger layer), calm and victory sting (6 s), evolution theme (loop 20 s) | 5 |
| Creature voices | uses the existing `combat_call` sounds | 0 new |

---

## 12. Slices to build (S1 to S5, in order)

Working form (CLAUDE.md and the playbooks): SDD and TDD for every feature, a branch for each slice, a separate review agent, green CI before merge, the storybook (`ARCH`, `SUBJECTS`, `FLOWS`, `AI`, `OPEN`, `PLAN`, `VERSION`) updated with each merge, and `BATTLE.md`'s status line pointing here. Move and status data live in two new YAML files (`mods/nagmon/moves.yaml`, `mods/nagmon/statuses.yaml`) read like `economy/items.yaml`, so tests are table-driven from the same tables as this document.

### 12.1 S1: One real turn (effort L)

Content: replace Move, Power-up, Assist, Special and the pip meter with **four move cards**; the question is the cast; Fog and Pep bars; damage formula (5.2) with Home bonus, the wheel and Sparkle, Mix bonus, quality 1 / 0.35; moves 1, 2, 9, 10, 17, 18 and Little Wiggle (Math, Geometry, Science, easy and normal only); enemy intents Puff, Giggle, Silly with temperament weights; doze, free swap, Wake Berry, Brave Heart for band A, the question cap and the kindness rules; the results card with stars; the transition skeleton T2 to T10 (intro, panel, input buffering, skip and speed); `fx.ts` and the calm switch; the device check (10.5). Removed code: `battleBeats.ts` (meter, burst, assists) is deleted; `BattleQuizBudget` is wired (it was never used).

Tests:
* Unit, table-driven: every number of 5.1 and 5.2 (Fog 64 / 74 / 100 / 124 / 140 for levels 3 / 5 / 10 / 15 / 18; damage 11, 4, 23, 25, 9 and 13 in the worked examples; enemy puff 7, 4, 9 by band); the wheel for all 36 pairs; stat tables of 5.7; `legal moves` (dimmed at 0 charges, Wiggle when all four are empty).
* Rule tests: the answered move always plays even if the enemy's first action brings Pep to 0; doze at end of round; forced swap is free; nap wakes at 35% after 4 rounds; wake at battle end at full Pep and Charges; Run always works; a wrong answer deals at least 1 and never touches the Bag, coins or hearts; question cap ends the fight kindly.
* Simulation test (the Appendix A script as a test, seeded, 2,000 fights per band at 72% right): mean questions between 5.5 and 9.5, p90 at most the cap, no fight over 16 turns, wild doze rate under 5%.
* E2E (Playwright, 873 x 393): fight start to win; a doze and a swap; Run; calm switch; axe accessibility on the move cards and the question panel.

Acceptance: **no beat with 0 damage except by a wrong answer's minimum of 1 or a Silly turn**; a wild fight with 6 to 9 questions and 2 to 3 minutes on the parent's phone (the log gets `MOVE`, `ROUND`, `DOZE` and a `BATTLE end` line with questions, turns and seconds); the parent plays three fights and says "now I choose".

#### S1, as built (differences from the text above, and what was measured)

* **Decisions of the parent** (the block after section 0) are applied: fainting is real (`Creature.fainted`, saved; healed only by the shop's **medicine**, 25 coins, or by the **nurse** at the Rest Center, free; no wake at the end of a fight; the whole team down: carried back and healed, no fee); the "Dozing" auto-recovery, nap and Dream Replay are not built. Fainted friends cannot be partner in a battle; `faint.ts` (`usable`) is the one question for the field abilities that do not exist yet.
* **Pep and Charges are per battle**: every awake friend starts a battle full; only fainting carries over (a decision in the gap: the parent said nothing about Pep between fights).
* **Moves**: the twelve plain E and N attacks of the six subjects and the Little Wiggle (rows 1, 2, 9, 10, 17, 18 and 25, 26, 34, 35, 42, 43, 50 of 3.2) are the default table in `moves.ts`; `game/moves.json`, when the data branch has it, takes over (field names `id subject tier mp charges lv`). The four cards are the home E and N moves plus two **coverage** moves (a normal one two places on the wheel, an easy one four places on) so that the wheel gives a real choice before lesson cards (S2) exist. The Wiggle shows only when all four cards are out of charges (a wild fight asks at most 13 questions and an easy move has 15 charges, so it appears in long fights only).
* **Stats and species**: `battleNumbers.ts` (5.1, 5.2, the wheel 2.3, the bands 5.8) and `battleSpecies.ts` (the 25 families of 5.7 as defaults, the data's fields `bp bw bg bs weak temperament subject` win when `db/monsters.json` has them, nested in `battle` or at the top).
* **Intents**: Puff, Giggle and Silly Dance only. The spec's other intents are folded by what they do (attacks into Puff, self-care into Silly), so the temperament weights are the spec's sums (tested). Giggle once in three rounds; no second big Puff (more than 15% of Pep) without a Silly turn. No Windup, Stagger or Spark yet (S2).
* **Brilliant** (the third right answer in a row, or a lucky star 1 in 16) is built because it is in the damage formula; the stretch and finisher parts are S2. **Mix** x1.1 is built. Brilliant pays +1 coin (at most 5), the Steady star (nobody fainted) and the Bright star (two Brilliant hits) +2 coins each; a missing star takes nothing away.
* **Pacing**: `S1_PACING = 0.75` multiplies the Fog of 5.1 in the fight (the spec's table is `fogOf` with its default). Without the Finale and the stretch moves, whose damage the spec's 2.0 counted on, the same fight is about 10 questions; with 0.75 the seeded simulation (`tests/unit/game/battleSim.test.ts`, 2,000 fights a band, the real `Battle` class, answers scripted with the tier table's chances) gives the questions below. S2 returns the constant to 1.0 together with the Finale.

  | band | questions (mean) | p10 to p90 | most | turns (mean) | fight minutes | someone fainted | question cap hit |
  |---|---|---|---|---|---|---|---|
  | A | 6.3 | 4 to 8 | 10 | 6.3 | 1.5 | 0% | 1% |
  | B | 8.1 | 6 to 11 | 13 | 8.1 | 2.1 | 2% | 2% |
  | C | 7.4 | 5 to 10 | 11 | 7.4 | 1.9 | 3% | 5% |

  (One question a turn here: turns equal questions; the spec's 6 to 7 turns counted a Finale as one turn.)
* **Rewards**: a wild win pays `5 + level` coins plus the stars; right answers no longer pay coins by themselves; +1 growth point for a right answer (as before), +3 for the win and +2 for befriending. The share for benched friends is not built (it could evolve a friend silently; S4). The growth curve and evolution are untouched (S4).
* **Question**: it keeps slice 2's presentation (the answers float around the enemy, the question is a panel at the top); the move's name and subject head it. The bottom 55% panel of 2.2 is not built. A tier sets `difficulty_bias` from the learner's own target (`biasFor`), and easy moves use the quick shapes only.
* **Flow**: the round plays as our beat (the answer's line shows with it), the enemy's beat, the tick, with `Pace` (a tap speeds up 2x, a second tap skips), a move tapped from 0.6 s into the enemy's beat waits and opens at the end of the round, and a friend's portrait swaps (a voluntary swap uses the turn). The intro (the enemy slides in, the cards rise) never blocks a tap. `fx.ts` (WAAPI: shake, lunge, flash; the calm switch and reduced motion turn movement off) is used for the enemy's hit; our own attack keeps slice 2's CSS effects; the canvas particle layer, the device check (10.5) and sound for the new beats are not built.
* **Enemy level** is the map's (the band shift of 5.5 is S5); the master has 4.2 Fog and the guardian's question caps, with no script yet.
* **Log lines** (ids and numbers only, no names): `MOVE n move subject tier ok dmg wheel brilliant ms fog max monster partner`; `ROUND n intent enemy first pep pep_max fog next action`; `DOZE species n awake`; `CAP asked limit band`; `NURSE woke`; `CARRIED at=start|round`; `BATTLE end result questions correct ms turns secs`. The old BEAT, METER, SPECIAL and `BATTLE result` lines are gone.
* **Test hooks** (localStorage numbers read once by the battle, never set by the game): `nagmon.battle.seed` (the enemy's draws), `nagmon.battle.timescale` (the beats' length), `nagmon.battle.pep`, `.fog`, `.charges` (start values), and `window.__nagmonBattle()` (phase, Fog, Pep, intent, turns, cards, team).

### 12.2 S2: The full move set and statuses (effort L)

Content: all 50 moves (3.2), the 14 statuses (4.1) and stat stages (4.2), Marks and the finisher, the Finale and the Spark meter, Brilliant, all 9 intents and 5 temperaments, Windup and Stagger, boss status immunity, Move Cards (lessons, chests, the 80 and 120 coin shop), the lesson-to-move link, move equipment in the Friends screen, all effect animations at placeholder quality (CSS shapes) with the particle layer.

Tests: one table-driven test per move (effect, wrong version, charges, unlock level) from `moves.yaml`; status rules (Drowsy and Dizzy exclusive, boss immunity, softened versions on our side, nothing wastes an answer); Windup and Stagger at exactly 25% of max Fog; Marks (2 maximum, 2 rounds, finisher multipliers 1.5 / 1.75 / 2.0); Finale chain bonus and reset; bonus cap 2.5; the simulation reproduces the Appendix A tables within 0.5 questions; no flashing (the effect plan test of slice 2 extended).

Acceptance: every move can be seen in the "move lab" debug page; the parent reads the first-chapter moves and approves names (Hebrew included); no status makes the child lose an answered question.

### 12.3 S3: Befriending (effort M)

Content: the formula (8.2), the tray, tools and treats (8.4), status bonuses (8.5), the Gift question, pity and Mercy, the throw animation (8.7), Star Net, Friendship Cards, the shop and chest entries, the "name it later" chip, repeat-species gift, Keepers and guardians not befriendable.

Tests: the table of 8.2 for 12 combinations; `q = p^(1/3)` per shake and the product equals `p` over 100,000 seeded tries within 1%; pity adds 30 / 45 / 25; Mercy at the 4th (3rd) try; consumption and the 50% / 100% net return; the chance words at the boundaries; Auto never spends a rare tool unasked; E2E: the throw, a fail and a success.

Acceptance: over 30 real tries on the phone a normal try succeeds about as often as the chance word says (Good about 2 in 3); the parent says "it is not always the same button".

### 12.4 S4: Growth and evolution (effort L)

Content: `need(L) = 6 + L` with a migration that keeps levels; Know-how; the gates and the checklist UI; Evolution Cards (items, shop, tutor gift, guardian reward), "Keep small", Shimmer, the Book update; the 10-beat animation (7.4) with skip, the short version, and calm effects; Rainbow Card.

Tests: gate truth table (all four gates, with and without a card, at level 8 / 9 / 12); cumulative points 99 at level 10, 132 at level 12, 414 at level 24; migration does not lower a level and keeps `species`; the evolution is never triggered mid-fight; skipping still completes the evolution; the animation clock test (a fake clock sums to 10.6 s plus or minus 0.2; skip uses rate 3); the engine's `stars` read is covered by a test with a fake learner.

Acceptance: a child who plays normally reaches the first evolution in three to four sessions; the parent watches the animation twice and the second time chooses "short"; no step flashes (measured: no brightness step under 300 ms, no more than 2 pulses a second).

### 12.5 S5: Fights that matter and polish (effort L)

Content: Keepers (8.6 and 5.5), the five guardians and the master with scripts (5.6), the master's level fix, the first chapter data (subjects for 25 families, weak subjects, temperaments, bases, catch rates), the three age bands and the parent knobs (Strength and Length), Gifts (3.5), grass sway, dust and encounter wipe on the map (10.4), backdrops, the new art and audio replacing placeholders, and the IP name check.

Tests: scripts (the phases at 66% and 33%, Windup cadence, the Starlight Windup and its special end); guardian simulation 12 to 16 questions in bands B and C; the knobs scale Fog by 0.75 / 1 / 1.3 and enemy damage by 0.7 / 1 / 1.3; the name check compares every creature, move, item and status name against a list of third-party terms and fails the build on a hit; asset budgets (art under +8 MB, audio under +3 MB, JS under +15 KB gzip).

Acceptance: the parent plays the whole first chapter; a guardian fight takes about 5 minutes measured from the log; nobody asks "why did it take so long" or "why can't I choose".

---

## 13. Open questions for the parent (6, each with a recommended default)

1. **How real should fainting be?** Recommended: as designed in section 6: a creature dozes, a friend steps in free, nap or Wake Berry or Dream Replay bring it back, **everyone wakes at the end of every fight**, and the only cost is the small Steady star. Alternative: make the doze last until the Rest Center. (A child who is upset by it can set Strength to Gentle.)
2. **Evolution pace and cards.** Recommended: stage 1 at level 12 and stage 2 at level 24, three learning gates (Know-how, subject stars, hearts), cards at 120 / 200 / 450 coins that skip the learning gates but not the level (gate minus 3). Do you want cards to skip the learning gate at all? (If not, a card would only skip hearts and Know-how and still need the stars.)
3. **May befriending fail?** Recommended: yes, with a chance word, pity (+30) and a guaranteed success on the 4th try (3rd for ages 5 to 7); failing never costs more than the net, and half the nets come back.
4. **Fight length.** Recommended: wild fights of 6 to 9 questions (about 2.5 minutes), guardians of 12 to 16 (about 5 minutes), with the Short / Normal / Long knob. Confirm after you play S1; the number that will move first is the wild Fog multiplier 2.0.
5. **Weakness chart.** Recommended: the subject wheel (Math beats Logic beats Geometry beats Science beats English beats Hebrew beats Math) plus one extra weak subject per creature in data, shown always to ages 5 to 7, after first sighting to 8 to 10, and as "?" until discovered for 11 to 14. Alternative: a per-creature list with no wheel.
6. **Data and names to approve.** Recommended: the subject of each of the 25 families in 5.7, the master's level changed from 14 to 18, and the move and status names in English and Hebrew in section 3 and 4 (you edit the Hebrew during S2). The art and audio budget (+8 MB and +3 MB) is a proposal.

---

## Appendix A: the simulation (checks section 5.9)

Node, no dependencies. `fight()` is one fight; the player model is described in 5.9. Run with `node sim.mjs`. S1 turns this into a seeded unit test.

```js
let seed = Number(process.env.SEED || 7);
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const pep  = (b, L) => Math.floor(b * (L + 10) / 4);
const stat = (b, L) => Math.floor(b * (L + 8) / 4);
const FOG = { wild: 2.0, boss: 3.6 }, FOG_AGE = { A: 0.8, B: 1.0, C: 0.9 };
const GENTLE = { A: 0.55, B: 0.9, C: 1.15 };
const EMP = { wild: 50, boss: 40 }, CHARGE = 60, CAP = 2.5;
const TIER = { E: { mp: 40, dq: +0.13, sec: 6 }, N: { mp: 60, dq: 0, sec: 11 }, S: { mp: 85, dq: -0.17, sec: 16 } };
const dmg = (L, mp, A, D, m) => Math.max(1, Math.floor(((0.4 * L + 2) * mp * (A / D) / 50 + 2) * m));
function fight({ pL, eL, age, acc, kind }) {
  const gentle = GENTLE[age];
  let P = pep(10, pL); const PMAX = P, Pw = stat(10, pL);
  const FMAX = Math.floor(pep(10, eL) * FOG[kind] * FOG_AGE[age]); let fog = FMAX;
  const Ew = stat(10, eL), Eg = stat(9, eL), Pg = stat(9, pL);
  const pp = { E: 15, N: 10, S: 6 };
  let spark = 0, streak = 0, q = 0, turns = 0, dozes = 0, secs = 0, last = null, wind = 0;
  const sparkle = rnd() < 0.5;          // the enemy is weak to a move we own in half of the fights
  while (fog > 0 && turns < 40) {
    turns++; const r = rnd(); let tier;
    if (spark >= 4) tier = 'F';
    else if (r < 0.25 * (age === 'C' ? 1.6 : age === 'A' ? 0.4 : 1) && pp.S > 0) tier = 'S';
    else if (r < 0.38 && pp.E > 0 && age !== 'C') tier = 'E';
    else tier = pp.N > 0 ? 'N' : pp.E > 0 ? 'E' : 'S';
    const n = tier === 'F' ? 3 : 1; let dealt = 0, chain = 0;
    for (let k = 0; k < n && fog > 0; k++) {
      const t = tier === 'F' ? 'N' : tier, T = TIER[t];
      const ok = rnd() < Math.min(0.97, Math.max(0.15, acc + T.dq)); q++; secs += T.sec;
      const mp = tier === 'F' ? 70 : T.mp;
      let m = 1.25 * (sparkle && rnd() < 0.6 ? 1.5 : 1);
      if (ok) { if (t === 'S' || streak >= 2) m *= 1.5; else if (rnd() < 1 / 16) m *= 1.5;
                if (tier === 'F') m *= [1, 1.15, 1.3][chain]; }
      if (last !== null && last !== t && tier !== 'F') m *= 1.1;
      m = Math.min(CAP, m) * (ok ? 1 : 0.35) * (0.92 + 0.08 * rnd());
      const d = dmg(pL, mp, Pw, Eg, m); fog -= d; dealt += d; last = t;
      if (ok) { streak++; chain++; spark = Math.min(4, spark + (t === 'S' ? 2 : 1)); } else { streak = 0; chain = 0; }
    }
    if (tier === 'F') spark = 0; else pp[tier]--;
    secs += 2.2; if (fog <= 0) break;
    if (wind && dealt >= 0.25 * FMAX) { wind = 0; secs += 1.2; continue; }   // Stagger
    const x = rnd(); let hit = 0;
    if (wind) { wind = 0; hit = dmg(eL, CHARGE, Ew, Pg, gentle); secs += 1.8; }
    else if (x < 0.55) { hit = dmg(eL, EMP[kind], Ew, Pg, gentle * (0.92 + 0.08 * rnd())); secs += 1.5; }
    else if (x < 0.70 && kind === 'boss') { wind = 1; secs += 1.2; }
    else if (x < 0.80) { fog = Math.min(FMAX, fog + Math.floor(FMAX * 0.05)); secs += 1.2; }
    else secs += 1.0;
    P -= hit; if (hit >= 0.15 * PMAX) spark = Math.min(4, spark + 1);
    if (P <= 0) { dozes++; P = Math.floor(PMAX * 0.35); secs += 3; }
  }
  return { q, turns, dozes, secs: secs + turns * 3.5 };
}
```

Not modelled (so real fights differ): utility moves, shields, heals, swaps, statuses, Sparkle choice by the child, the question cap, kindness rules. Dozing is therefore an upper bound for wild fights and a rough estimate for guardians.

## Appendix B: research digest (ideas only; see 1.5)

For each source: what we take, how a question fits, how it avoids "drill-and-kill" fatigue, and the age fit. Sources are in Appendix C. "Soft" = a blog or fan wiki. Items I could not confirm are said so.

### B.1 The best-known creature-collecting series (research reference only; no data copied)

| Mechanic (public rule) | What we take (as an idea) | How a question fits | Fatigue control | Age fit |
|---|---|---|---|---|
| **Damage** is a product of a level term, a base power, an attack/defence ratio and multipliers; Gen I used a different crit and the later games a random 85 to 100% roll ([Bulbapedia, Damage](https://bulbapedia.bulbagarden.net/wiki/Damage)) | Our own shape in 5.2 with our constants (random 0.92 to 1.00, bonus cap) | Quality multiplier: right 1, wrong 0.35 | Cap so that no combination looks absurd; numbers small and readable | all |
| **Critical hits**: x2 in Gen I to V, x1.5 from VI; a stage system of 1/24, 1/8, 1/2, always ([Bulbapedia, Critical hit](https://m.bulbapedia.bulbagarden.net/wiki/Critical_hit)). Gen I's speed-based crit rate is from memory | "Brilliant", but earned by skill (a right stretch answer or a streak) with a small lucky-star chance | the crit is a **reward for a harder or repeated right answer**, so it teaches nothing wrong | the luck part is only 1/16 | B, C |
| **Types and STAB**: a move of the user's own type gets x1.5, matchups x0, x0.5, x2 | The subject wheel (x1.5 / x0.67) and the Home bonus (x1.25), our own chart of six subjects | choosing a subject = choosing which kind of question; a Sparkle rewards choosing, not knowing more | the wheel is learnable; "?" for older children keeps discovery | A to C |
| **Statuses** (sleep 1 to 3 turns from Gen V, 1 to 7 before; paralysis 25% to skip; burn 1/16 per turn; freeze 20% thaw; confusion about a third of self-hit) ([fan wiki, soft](https://pokemon.fandom.com/wiki/Status_condition), [PokeBase, soft](https://pokemondb.net/pokebase/214236/what-are-all-the-status-conditions)) | Our own 14 statuses, with **no self-harm and no skipped turns for the child**: on our side they limit tiers or speed instead of wasting answers | the child's answer is never thrown away; statuses change which question tier is available | no 1-to-7-turn sleeps; durations 1 to 3 rounds | all |
| **Stat stages** (+/-6, each a fraction) ([Bulbapedia, Stat stages](https://bulbapedia.bulbagarden.net/wiki/Stat_stages); the exact multipliers are from memory) | Our stages: +/-3, x1.25 per stage | Boost and Weaken are moves with a question | small, readable | B, C |
| **Catch rate**: `a = ((3 MaxHP - 2 HP) * rate * ball) / (3 MaxHP) * status`, then shake checks (4 in Gen III and IV; Gen V and later 3 plus critical capture) ([Dragonfly Cave](https://www.dragonflycave.com/mechanics/gen-iii-iv-capturing/), [Smogon](https://www.smogon.com/ingame/guides/capture_mechanics), [Serebii](https://www.serebii.net/games/capture.shtml)); sleep and freeze 2x to 2.5x, others 1.5x (the sources disagree on the exact values) | The shape "chance rises as health falls and with status and tool" with **our constants**, 3 shakes with `q = p^(1/3)`, pity and Mercy | the optional Gift question is a question that raises the chance | pity avoids a slot-machine frustration; the chance word makes it a readable decision | A to C |
| **Evolution methods**: level, stone (item), trade, friendship (threshold 220), time of day, held item, known move, location ([Bulbapedia, Methods of evolution](https://bulbapedia.bulbagarden.net/wiki/Methods_of_evolution), [Gen IV data](https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Evolution_data_structure_(Generation_IV))) | Level, **Know-how and stars** (our "learning" method), hearts (our friendship), **cards** (our items), lesson done (our "known move"), place (our location). No trade, no time of day | the learning gates ARE the question link | cards give a no-grind route | B, C like the checklist; A mostly sees the ceremony |
| **Experience**: a formula of base yield, level, participants, wild or trainer factor 1 / 1.5; Lucky Egg 1.5x ([PokeBase, soft](https://pokemondb.net/pokebase/202058/what-is-the-battle-experience-formula-in-pokemon-x-y)) | Points per answer and per fight, a bench share (already in FEATURES), Keepers pay more than wild | points come from answers | the curve is slow enough for an evolution to feel earned | all |
| **Abilities** (Gen III on; one or two per species) and **PP** (uses per move; Pressure costs extra) ([Bulbapedia, Pressure](https://m.bulbapedia.bulbagarden.net/wiki/Pressure)) | **Gifts** (a short list, 3.5) and **Charges** (dots, refilled after each fight) | Charges make a child pick different moves, which means different subjects | no persistent depletion, so no "I ran out of everything" frustration | B, C |
| **EVs** (up to 510 total, 252 useful per stat) | not used; **Know-how** is the simple cousin (a counter in one subject) | counts right answers | nothing to optimise by hand | n/a |
| **Catching without battle, and catching by sneaking** (Let's Go style: a timing ring, Nice / Great / Excellent, berries; Legends: Arceus: sneak and back strikes) ([GameSkinny](https://www.gameskinny.com/efdq3/pokemon-lets-go-pikachu-and-eevee-catching-combo-catch-guide), [Twinfinite](https://twinfinite.net/2022/01/pokemon-legends-arceus-sneak-catch-pokemon-easily/)) | An **optional** timing throw (8.8), treats as a probability booster, and status (a sleeping creature is easier) as "sneaking" | the optional question | optional, never in the rating | 8 and up |

### B.2 Other games

| Game | Idea | What we take | How a question fits | Fatigue control | Age fit |
|---|---|---|---|---|---|
| **Yo-kai Watch** | A Soul meter that fills over time and unlocks a big move played as a touch minigame; "Inspirit" auras; befriending by giving food ([Prima](https://primagames.com/eguides/yo-kai-watch-eguide/game-basics/yo-kai-battles), [Nintendo Life, soft](https://www.nintendolife.com/news/2015/06/first_impressions_getting_into_the_spirit_with_yo-kai_watch)) | Spark meter and the Finale; treats raise the befriend chance and are liked or not | the Finale is 3 questions as a "minigame" | a Finale at most once per 4 right answers, and a chain bonus rather than an all-or-nothing | A to C |
| **Dragon Quest Monsters** | Scouting shows a **chance meter**; synthesis (fusing two monsters) creates new ones ([Pure Nintendo fact sheet](https://purenintendo.com/dragon-quest-monsters-joker-2-fact-sheet/)) | The visible chance word in the Befriend tray. Synthesis is **not** taken (too complex; maybe a later "merge two cards" idea) | optional Gift question | | B, C |
| **Cassette Beasts** | Moves cost action points; the fusion meter fills when you take damage; status effects add up ([Cassette Beasts wiki](https://wiki.cassettebeasts.com/wiki/Fusion)) | The Spark meter also fills when the partner takes a big hit (a comeback); Charges as dots | | comeback keeps a struggling child in the game | B, C |
| **Temtem** | Stamina instead of PP; **Synergy**: marked move pairs boost each other ([TheGamer, soft](https://www.thegamer.com/temtem-combat-guide-tips-tricks-synergy/)) | Marks and the Finisher (team chains across subjects) | two questions in two subjects in a row are rewarded | interleaving bonus without a rule to memorise | B, C |
| **Digimon Story: Cyber Sleuth** | Digivolution lists each target's requirements with a tick or an X; branching; reversible ([Twinfinite, soft](https://twinfinite.net/guides/digimon-cyber-sleuth-hackers-memory-digivolution-evolve-digimon-how/); forum accounts of exact numbers conflict, not used) | The **checklist** of gates (7.1) | gates are learning gates | the checklist turns grinding into a clear goal | B, C |
| **Slay the Spire** | Enemy **intent icons** (an attack icon with a number, buffs, debuffs) so the player plans ([untapped guide to StS2, soft](https://sts2.untapped.gg/guides/how-to-read-enemy-intent)) | Intent bubbles with the number for B and C; Windup and Stagger | the child chooses a move for the intent, not only the subject | planning replaces guessing; a Silly turn is a breather | A (icon only) to C |
| **Prodigy Math** | A spell per answer, with complaints mostly about ads, paywalls and repetition ([Fairplay](https://fairplayforkids.org/pf/prodigy/), [Modulo, soft](https://www.modulo.app/all-resources/prodigymathgame), [Common Sense teacher review](https://www.commonsense.org/education/reviews/prodigy-math/teacher-reviews/4075336)). I found no source on questions per battle; the "about 3 per battle" figure is from BATTLE.md | The question wrapper itself is not the problem: we keep it, add choice, variety and a moving enemy | | no ads; no limit on battles; a cap so a fight cannot drag; Dream Replay is optional | all |
| **Pokemon Quest and Rumble** | Quest: auto-battle with two moves on cooldown, manual special use, cooking ([iMore](https://www.imore.com/pokemon-quest-beginners-guide)). Rumble: my search returned nothing, so I draw no conclusion from it | Not taken for the loop. Cooking is a possible later source of treats | | | |
| **Monster Hunter Stories** | A rock-paper-scissors triangle (Power, Speed, Technical), double attacks, a Kinship gauge ([Wikipedia](https://en.wikipedia.org/wiki/Monster_Hunter_Stories), [iMore](https://imore.com/monster-hunter-stories-2-wings-ruin-tips-and-tricks)) | The idea that a **cycle** is easier to learn than a table: our wheel generalises the triangle to six | | | A to C |
| **Ni no Kuni** | Tamed familiars with treats; they level and evolve with the party; a real-time pause system ([Wikipedia](https://en.wikipedia.org/wiki/Ni_no_Kuni:_Wrath_of_the_White_Witch)); I found no details on metamorphosis | Treats as a link between care and growth; the evolution as a ceremony | | | B, C |

### B.3 Learning science that shapes the numbers

From `BATTLE.md` 2.2 and 2.3: intrinsic integration (Habgood and Ainsworth), interleaving, no time pressure for the young, WCAG 2.3.1 limits, calm effects. New in this document: the **tiers** (a child chooses how hard the question is: a self-set challenge, which is in line with flow theory's challenge-skill match, BATTLE.md 2.2), **Dream Replay** (retrieval of a missed item, offered not forced), and the cap on questions per fight (fatigue).

## Appendix C: sources

* Existing: the sources of `docs/app/BATTLE.md` section 7 (Habgood and Ainsworth; Rohrer; Kahoot; WCAG; Paper Mario action commands; Cassette Beasts; Temtem; Slay the Spire; Pokemon Quest; Prodigy).
* Damage: https://bulbapedia.bulbagarden.net/wiki/Damage ; critical hits: https://m.bulbapedia.bulbagarden.net/wiki/Critical_hit ; stat stages: https://bulbapedia.bulbagarden.net/wiki/Stat_stages
* Catching: https://www.dragonflycave.com/mechanics/gen-iii-iv-capturing/ ; https://www.smogon.com/ingame/guides/capture_mechanics ; https://www.serebii.net/games/capture.shtml
* Statuses: https://pokemon.fandom.com/wiki/Status_condition ; https://pokemondb.net/pokebase/214236/what-are-all-the-status-conditions
* Evolution: https://bulbapedia.bulbagarden.net/wiki/Methods_of_evolution ; https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon_Evolution_data_structure_(Generation_IV)
* Experience and abilities: https://pokemondb.net/pokebase/202058/what-is-the-battle-experience-formula-in-pokemon-x-y ; https://m.bulbapedia.bulbagarden.net/wiki/Pressure
* Catching without battle: https://www.gameskinny.com/efdq3/pokemon-lets-go-pikachu-and-eevee-catching-combo-catch-guide ; https://twinfinite.net/2022/01/pokemon-legends-arceus-sneak-catch-pokemon-easily/
* Yo-kai Watch: https://primagames.com/eguides/yo-kai-watch-eguide/game-basics/yo-kai-battles ; https://www.nintendolife.com/news/2015/06/first_impressions_getting_into_the_spirit_with_yo-kai_watch
* Dragon Quest Monsters: https://purenintendo.com/dragon-quest-monsters-joker-2-fact-sheet/
* Cassette Beasts: https://wiki.cassettebeasts.com/wiki/Fusion ; Temtem: https://www.thegamer.com/temtem-combat-guide-tips-tricks-synergy/
* Digimon: https://twinfinite.net/guides/digimon-cyber-sleuth-hackers-memory-digivolution-evolve-digimon-how/
* Slay the Spire intents: https://sts2.untapped.gg/guides/how-to-read-enemy-intent
* Prodigy: https://fairplayforkids.org/pf/prodigy/ ; https://www.modulo.app/all-resources/prodigymathgame ; https://www.commonsense.org/education/reviews/prodigy-math/teacher-reviews/4075336
* Pokemon Quest: https://www.imore.com/pokemon-quest-beginners-guide ; Monster Hunter Stories: https://en.wikipedia.org/wiki/Monster_Hunter_Stories , https://imore.com/monster-hunter-stories-2-wings-ruin-tips-and-tricks ; Ni no Kuni: https://en.wikipedia.org/wiki/Ni_no_Kuni:_Wrath_of_the_White_Witch
* Animation and performance: https://web.dev/articles/animations-and-performance ; https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count ; https://developer.chrome.com/blog/web-animations ; https://motion.dev/docs/react-reduce-bundle-size ; https://webflow.com/blog/gsap-becomes-free ; https://lottiefiles.com/dotlottie ; https://phaser.io/news/2026/05/phaser-4-filter-system ; Phaser 4.2.1 package skills docs (`filters-and-postfx`, `particles`, `tweens`)
* Size limits: https://support.google.com/googleplay/android-developer/answer/9859372
* Our measurements: esbuild import-size of each library (2026-10-21, gzip -9) and the Appendix A simulation. The sandbox could not open Bulbapedia, Wikipedia, motion.dev or other sites directly (a proxy policy blocked them); every external fact above comes from search-result summaries and is marked "soft" or "from memory" where the summary was not a primary page.
