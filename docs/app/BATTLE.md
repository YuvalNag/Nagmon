# BATTLE: a better, more playable battle (research and design)

Status: design only. Nothing here is in the code unless a section says "today". Language of the game stays Hebrew (RTL); this document is English.
Trigger: the parent's feedback after playing: the battle is not good; make it more interesting, interactive and visual; a question every moment is tiring.
Scope: `app/src/core/game/battle.ts`, `app/src/ui/BattleScreen.tsx`, `app/src/ui/QuizScreen.tsx`, `app/src/ui/battle/*`, the learning engine (`app/src/core/learning`). Phone, landscape, 873x393 CSS px.

---

## 1. How the battle plays today (read from the code)

### 1.1 Tap by tap (wild encounter)

| # | Child does | Screen | What happens (code) |
|---|---|---|---|
| 1 | (map) steps into an encounter | `BattleScreen` view `meet` | Arena: wild creature (front) and partner (back), two name cards, wild "fog" bar, a text line "A wild X, level N". Action bar: Ask, Net (disabled), Bag, Friends, Leave. |
| 2 | Taps **Ask** | `QuizScreen` full-screen, replaces the arena | One question for the partner's subject. Choice cards, or number pad. Foot row: subject, Hint, helpers, "don't know". The arena is not visible. |
| 3 | Taps an answer | `QuizScreen` phase `feedback` (a second full screen) | Headline text ("right" or "not quite"), the right answer if wrong, an explanation text, "Continue". Nothing animates. |
| 4 | Taps **Continue** | Back to the arena | `battle.last` is shown: partner `lunge` (0.5 s CSS, 28 px sideways), wild `hit` (0.5 s CSS, 8 px shake), fog bar width eases 0.7 s, message line "X hits Y for N". On a wrong answer: the text "battleMiss", nothing moves. |
| 5 | Taps **Next question** (same button) | `QuizScreen` again | Repeat 2 to 4. |
| 6 | Fog bar reaches 0 | Arena, `calm` | "Calm" text; **Ask** disabled; **Net** pulses. |
| 7 | Taps **Net** (or picks a net in the Bag) | `QuizScreen` (`seal`) | A seal question. Right: one seal off (1 seal; 3 for a grown-up form; a silver net saves 1). Wrong: "try again", the net is kept. Nothing is drawn of the net flying or shaking. |
| 8 | Repeats 7 until the seal count is 0 | Arena then `NameCard` | New friend card, three name suggestions, own name via `LetterBoard`, or skip. |
| 9 | Taps Name or Skip | Map | Done. |

A master's test is the same with twice the fog and no net (prize: a badge).

### 1.2 Numbers

| Quantity | Value today | Source |
|---|---|---|
| Wild health ("fog") | `18 + 3 * level` (x2 master) | `hpFor` |
| Damage of a right answer | `round((3 + partnerLevel) * m)`, m = 1.5 right, 2 fast (fast only when the timer is on, grade 3+) | `damageFor`, `MULTIPLIER` |
| Right answers to calm | about 3 (partner level equals wild level, level 5: 33 / 12 = 3), up to 4 at low levels | derived |
| Seal answers | 1, or 3 for grown-up forms, minus 1 for a silver net; a wrong seal answer is a free retry | `sealNeeded` |
| Questions per battle | no cap in the code. About 4 to 5 for a basic creature (3 fog, 1 seal, plus wrong ones), about 6 to 8 for a rare one (3 fog, 3 seals, plus wrong ones). The "default 6 per battle" cap promised in FEATURES 4.5 is **not wired**: `BattleQuizBudget` exists in `quiz_flow.ts` and nothing uses it. | `battle.ts`, `quiz_flow.ts` |
| Screens per question | 3: Ask (arena) then question then feedback then arena | `BattleScreen` |
| Taps per question | at least 3 (Ask, answer, Continue), 4 with a number pad (digits plus check) | |
| Animations | 3 CSS keyframes (shake 0.5 s, lunge 0.5 s, happy bob 0.9 s x2) and a pulse on the Net button; HP bar width transition | `styles.css` 1365 to 1395 |
| Sound, haptics, particles, damage numbers, screen shake, hit flash, attack effect, capture animation | none (the only sound code is the lifecycle "stop all sound") | grep |
| Child's choices besides the answer | swap partner (changes subject), open Bag (nets, helpers), Leave. No move choice, no target, no timing, no tactic. | |
| Already in the engine but unused in battle | `comboBonus` (every 3rd right in a row: +0.5 power), `engine.streak`, `OrderPicker` and `LetterTiles` (order and letters inputs; `QuizSession` rejects those kinds today and the battle retries up to 5 times, so those questions never appear) | `quiz_flow.ts`, `quiz.ts` |

### 1.3 What the child sees and feels

- The arena shows the monsters only **between** questions; while a question is open the child is looking at a quiz page, not at a battle.
- Feedback for a right answer is a line of text on a second page, then a half-second shake. The reward arrives **after** a tap on "Continue", away from the moment of the answer.
- A wrong answer produces text and an explanation; nothing funny, nothing the creature does.
- The fog bar goes down in 3 equal steps. No sense of building up to something.

### 1.4 Why it is tiring (diagnosis)

| # | Cause | Evidence in the code | Effect on the child |
|---|---|---|---|
| D1 | **One question per turn, always.** The only verb is "Ask". The battle is a quiz with a health bar. | `ActionBar`: Ask is the primary button, `next()` always makes a question | Every beat is the same demand; no rest, no rhythm. |
| D2 | **No variety.** Two inputs only (choice cards, number pad), one presentation each; `order` and `letters` are not shown at all. | `QuizSession` `CHOICE_KINDS`, `PAD_KINDS` | After 3 questions it feels like a worksheet. |
| D3 | **Little visual reward.** 0.5 s shake, no effect, no number, no sound. The payoff is a sentence. | `styles.css`, no audio | A right answer does not feel powerful, so there is no pull to answer again. |
| D4 | **No tension, no agency.** Damage is fixed, nothing can go wrong, nothing is chosen. The enemy never acts. | `Battle.answered` | No reason to think about the battle itself. |
| D5 | **Three screens per question** and a forced "Continue" every time. | `QuizScreen` feedback phase | Lots of taps that are not play; the pace is slow and stop-start. |
| D6 | **Questions are not integrated** with the action: the child answers, then watches. (Compare Zombie Division, below: the answer *is* the move.) | | Learning feels like a toll gate ("chocolate-covered broccoli"). |
| D7 | **The capture is also just questions** (1 to 3 more), with no animation of a net. | `sealed` | The best moment of the game (a new friend) is the least visual. |
| D8 | **No per-battle limit and no pacing rule.** A rare creature or a run of wrong answers can mean 8+ questions in a row. | no budget wired | Fatigue grows; the child leaves. |

---

## 2. Research (what other games and learning science say)

Sources are cited inline; all were reachable when written (searched October 2026). Where a source is a blog or fan wiki it is marked "soft". Claims I could not confirm are not used.

### 2.1 Creature and RPG battles

| Game | What it does | Lesson for Nagmon | Source |
|---|---|---|---|
| Pokemon | The move choice, the type chip ("super effective") and the animation that matches the move are the fun; weak animations and frozen models are the most common complaint. A clear type-effectiveness label helps the player decide fast. | Give each creature 2 to 3 distinct visible moves with an element; show "good match" sparkle on the enemy; animation per move. | [PokeCommunity battle visuals (soft)](https://daily.pokecommunity.com/2022/07/10/battle-visuals-analysis-in-pokemon-legends-arceus), [Sword/Shield battles (soft)](https://daily.pokecommunity.com/2020/01/17/battles-visually-left-behind-in-pokemon-switch-titles) |
| Pokemon Go catching | A skill throw: a shrinking ring gives Nice / Great / Excellent, a spin gives a curveball bonus; bonuses multiply catch odds. | A small optional skill moment at capture that makes it **feel** earned. But the throw must not change learning rating (section 5.6). | [GamePress](https://pogo.gamepress.gg/node/18601), [iMore](https://www.imore.com/how-to-throw-curveball-pokemon-go) |
| Paper Mario / Mario and Luigi | **Action commands**: a button press at the right moment boosts damage; it keeps mundane battles active; the choice of jump vs hammer depends on the enemy. Numbers stay small so each hit matters. | A short, forgiving timed tap or hold-and-release **as the delivery of an answer** (power flourish), plus "which move for which enemy". | [Notes on Paper Mario combat](https://www.dampfkraft.com/games/paper-mario-combat.html), [Mario Wiki Action Command](https://www.mariowiki.com/Action_Command) |
| Cassette Beasts | Action points per turn: strike early with a cheap move or save for a strong one; a charged fusion meter unlocks a big move; type matchups cause status effects, not only multipliers. | A **charge meter** that the child chooses when to spend; the matchup does something visible (and funny), not a hidden number. | [Cassette Beasts wiki Fusion](https://wiki.cassettebeasts.com/wiki/Fusion), [Destructoid](https://destructoid.com/?p=250835) (soft) |
| Monster Sanctuary / Temtem | Ordering attacks into combos; team synergies; 3v3 or 2v2 with partner effects. | The partner and a **friend assist** give combos (fire creature then wind creature); keep it 1v1 plus one assist for kids. | [Monster Sanctuary overview (soft)](https://turnbasedlovers.com/overview/monster-sanctuary), [Temtem squad](https://temtem.wiki.gg/wiki/Squad) |
| Slay the Spire | A **hand** of cards plus a fixed energy budget forces choices; enemy **intent icons** telegraph the next action so planning replaces guessing. | A hand of 3 move cards; the wild creature shows an intent bubble (harmless: it sneezes, it hides, it dances) so the child can plan. | [Wikipedia](https://en.wikipedia.org/wiki/Slay_the_Spire), [RPGamer review](https://rpgamer.com/review/slay-the-spire-review/) |
| Pokemon Quest | Auto-battle where the player only triggers specials and dodges; reviewers say it is only half idle. | Optional: a short **auto-play** beat (the creatures play on their own) is good rest between question bursts. | [Wikipedia](https://en.wikipedia.org/wiki/Pok%C3%A9mon_Quest), [Siliconera (soft)](https://www.siliconera.com/pokemon-quest-idle-amusement/) |

### 2.2 Educational games

| Source | Finding | Lesson |
|---|---|---|
| Habgood and Ainsworth, *Motivating children to learn effectively: intrinsic integration* (Zombie Division, ages 7 to 11; study 1 n=58, study 2 n=16; small, one game) | When the learning content is the **game mechanic itself** (a right sword hit splits the enemy into the right number of parts) children learned more in the same time and chose to play about 7 times longer than with the same content as a separate quiz. [Nottingham repository](https://nottingham-repository.worktribe.com/output/23577510), [KQED summary](https://www.kqed.org/mindshift/20765/whats-the-secret-sauce-to-a-great-educational-game) | Make the answer **the move**: the interaction with the question should look like the battle (drag the number onto the enemy, set the dial and release), not a form. |
| Prodigy Math (battle loop: a correct answer casts a spell; Magic Points refill by answering; teacher resource says about 3 questions per battle) | Complaints in reviews are mostly about ads, paywalls and being battle-heavy and repetitive; Fairplay counted 4 battles in 19 minutes with 16 ads (advocacy source). So the "question per spell" wrapper itself is not what kids hate; the **repetition and distractions** are. [Wikipedia](https://en.wikipedia.org/wiki/Prodigy_Math_Game), [Common Sense Media](https://www.commonsensemedia.org/app-reviews/prodigy-math-game), [Fairplay](https://fairplayforkids.org/pf/prodigy/), [Kimola review analysis](https://kimola.com/reports/discover-insights-from-prodigy-math-game-user-feedback-google-play-en-144430) | Keep it short, vary it, no monetisation noise. Prodigy's "wrong twice: show the answer and skip your turn" is a mild penalty; ours should be funny, not a lost turn. |
| Duolingo | Short lessons of mixed exercise types (matching, translating, listening); streak is the retention tool, with a documented downside when gamification gets in the way of learning. Lesson length "about 5 minutes" is from a soft source. [arXiv case study of gamification misuse](https://arxiv.org/pdf/2203.16175), [Desirability Lab on streak design](https://desirabilitylab.com/backfill/backfill-2025-46-duolingo-streak-design) | Mix presentation types inside one session; keep sessions short with a clear end; do not build a streak that punishes missing a day (the plan already avoids this). |
| Kahoot | Speed points and answer-streak bonus; Kahoot's own testing says the streak level motivates more than the points (company claim). Reviews of studies note time pressure and competition can raise anxiety for some students; non-graded play was found low-anxiety. Kahoot added an "accuracy" mode with no speed bonus (2025). [Kahoot](https://kahoot.com/?p=127954), [Adkins-Jablonsky et al. 2021](https://lifescied.org/doi/10.1187/cbe.20-08-0187) | **Streaks yes, speed pressure no** (at least for the young). |
| Interleaving (Rohrer et al.) | Mixing problem types beats blocking them by type, shown mostly in grade 7 maths: 61% vs 38% a month later in a 54-class trial; teachers noted mixed sets feel harder and take longer. [Rohrer 2014 (PDF)](https://www.Gwern.net/doc/psychology/spaced-repetition/2014-rohrer-2.pdf), [Scientific American](https://www.scientificamerican.com/article/the-interleaving-effect-mixing-it-up-boosts-learning/), [summary of the 2020 trial](https://www.structural-learning.com/research-briefings/mix-it-up) | A battle that draws different skills, and different presentations, is better for learning, not only for fun. The adaptive selector already interleaves skills inside a subject; the redesign adds **presentation** variety. |
| Time pressure | Boaler argues timed tests cause maths anxiety (opinion); Hechinger found no strong experiments proving it; the US Department of Education guide recommends *timed activities* for fluency alongside other practice. Evidence is contested. [Stanford GSE](https://ed.stanford.edu/news/boaler-timed-tests-and-development-math-anxiety), [Hechinger](https://hechingerreport.org/proof-points-do-math-drills-help-children-learn/) | Keep time out of the rating and out of the young band; any timing is **optional flourish** with no penalty (as the code already does: no timer under grade 3). |
| Flow | Flow needs challenge matched to skill, clear goals, unambiguous feedback and a sense of control. [ICE-Net blog on flow and ZPD (soft)](https://icenet.blog/2025/12/02/in-the-zone-the-intersection-of-flow-theory-and-the-zone-of-proximal-development-in-game-based-learning/) | Our adaptive rating handles challenge; the redesign adds **control** (choosing) and clear feedback. |
| Children and drag and drop | Under-5s cannot drag reliably; "tap and tap" is the workaround. For ages 5 to 7 a drag should be forgiving (large drop zones, a tap-to-place alternative). [UXPA Playful Interfaces](https://oldmagazine.uxpa.org/?p=11776), [Google building for kids](https://developers.google.com/building-for-kids/designing-engaging-apps) | Every drag interaction needs a tap-tap alternative. |

### 2.3 Juice and accessibility

| Topic | Finding | Use |
|---|---|---|
| Juice | Flash, short shake (0.1 to 0.3 s), floating numbers, particles, sound and **hit-stop** (about 0.05 to 0.1 s) make hits feel strong; a 2022 study ranked hit-stop, sound coherence and camera as most influential. Counterpoint: juice for its own sake distracts. [GDC "Juice it or lose it" summary (soft)](https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/), [rpgplayground research (soft)](https://rpgplayground.com/research-making-a-juicy-game/) | Put the juice **on the answer moment**, keep it short, and let it scale with how well the child did. |
| Flashing | WCAG 2.3.1: no more than 3 flashes in any second, or below the general/red flash thresholds. [W3C Understanding 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) | Hard rule: nothing flashes; glows fade over at least 300 ms. |
| Reduced motion, timers | Offer motion toggles (a shake slider, not only on/off); let players remove timers. [Game accessibility checklists (soft)](https://gamesforchange.org/studentchallenge/wp-content/uploads/2022/01/Tips_Resources_for-Considering-the-Needs-of-Disabled-Gamers-in-Design.pdf) | `prefers-reduced-motion` plus an in-game "calm effects" switch. |

### 2.4 Age bands (what the research and the code defaults support)

| Band | Grades | Interaction | Pacing | Notes |
|---|---|---|---|---|
| A: 5 to 7 | K to 2 | Taps only; 3 choices; tap-tap instead of drag; large targets; reading aloud; no timer (matches `defaultsForGrade`) | Short beats; many animation payoffs; 3 to 4 questions per battle | Reward is mostly visual and sound; no speed. |
| B: 8 to 10 | 3 to 5 | Drag allowed; number pad; sort; match; optional timer from grade 3 (exists) | 4 to 6 questions | Choice of moves matters; streaks and combos land well. |
| C: 11 to 14 | 6 to 9 | Everything; slider and number line; multi-step; optional challenge modes | 5 to 8 questions | Wants mastery and efficiency (fewer, harder, bigger payoff); dislikes baby animations, so cool-not-cute presets. |

Soft spot: sources for ages 8 to 14 were thin in the search; the bands above are design judgement, and slice 6 asks the parent to confirm them by playing.

---

## 3. Three redesign concepts

Common to all three: nothing can be lost; Leave is always free; the arena stays visible (the question is a **panel over the lower part of the arena**, not a separate screen); the answer is the move; feedback lands on the answer, not after a "Continue".

### Concept A: Charge Meter and Special Move

**Pitch.** The partner has a **Knowledge meter** of 5 pips. Plain attacks cost nothing and fill nothing; **every right answer fills a pip** and fires a small attack immediately. At full charge a big **Special** button glows; the child taps it and the partner does a long, spectacular, element-themed finish that takes a large piece of the fog. Questions are the way to charge, so the child feels each answer building towards something they can see and want.

Flow (landscape 873x393):
1. Arena fills the screen; wild creature top-start, partner bottom-end; charge meter (5 pips) next to the partner; bottom bar: **Power-up** (big), Net (locked), Friends, Bag, Leave.
2. Child taps **Power-up**. A question panel slides over the bottom 45% of the screen (arena still visible above). 
3. Child answers. Right: pip fills with a pop, the partner does a short hit (0.6 s), a damage number floats. Wrong: partner stumbles comically, pip does not fill, the creature tries again with a smaller hit.
4. Repeat; at 5 pips the **Special** button pulses; tap it: 2 s animation, big fog drop. Fog reaches 0: calm.
5. Capture as today, with a net animation.

Questions: one at a time, always asked on demand. Visual plan: pip pop, charge glow on the partner (slow, no flash), a special cut-in per element. Effort: **M**. Risks: still "a question per beat" (the same fatigue, only prettier); the only choice is when to charge.

### Concept B: Card Hand, Choose Your Move

**Pitch.** Each round the child gets a **hand of 3 move cards** (from the partner and a friend). Some cards are pure action (a free move: Tackle, Dance, Shield-up); some are **question cards** marked with a small book that deal double damage or a heal-the-friend effect if answered. The wild creature shows an **intent bubble** (it will curl up, it will sneeze, it will charge). The child chooses cards for the intent and the element. Questions become a choice the child takes when the card is worth it.

Flow:
1. Arena at top; wild creature with an intent bubble; **hand of 3 cards across the bottom** (each 230x110 px minimum); end-turn is automatic after one card (kid version: one card per round, 2 for age C).
2. Tap a card: a free card plays its animation (0.8 to 1.2 s). A question card opens the question panel; right: strong effect; wrong: the card "fizzles" funny, returns to the hand.
3. Wild creature does its harmless intent animation; new hand of 3.
4. 4 to 6 rounds to calm; capture as today.

Questions: only on question cards, so about 1 in 3 cards. Visual plan: card flip, card art by element, intent bubble, matchup sparkle. Effort: **L** (card system, content for moves, intents, balance). Risks: complexity and reading load for age A; too many rules; needs authored move data for every species (the game has many); can let the child avoid questions unless the fog has a floor (section 5.2).

### Concept C: Timed Action Command

**Pitch.** Like Paper Mario: the child taps **Attack**; the partner winds up and a **timing ring** appears; a tap at the right moment makes the hit stronger (Nice / Great / Excellent). The question is "the wind-up": answer to load the move, then do the timing flourish to deliver it. Hold-and-release and a swipe to dodge the wild creature's harmless reply keep the thumb busy.

Flow: tap Attack, answer a question (panel), tap on the shrinking ring (0.8 to 1.2 s), see the hit scaled by ring result, the creature replies with a harmless move; the child swipes to "dodge" (cosmetic), repeat 4 to 5 rounds, then capture with a ring throw.

Questions: one per attack (the same density as today, plus a reflex step). Visual plan: ring, hit-stop, scale of the effect by result. Effort: **M**. Risks: reflex skill mixes with knowledge (unfair to a slow-thumbed 6-year-old); extra input to accessibility-test; more taps per beat, not fewer; frustrates age A. Good only as a flourish.

### Comparison

| Criterion | A Charge and Special | B Card hand | C Action command |
|---|---|---|---|
| Fixes D1 (a question every beat) | partly (the meter is a goal, but still a question each beat) | **yes** (questions are some of the cards) | no |
| Fixes D2 (variety) | no | **yes** (cards differ; presentations can vary per card) | little |
| Fixes D3 (visual reward) | **yes** (special move) | yes | yes (hit-stop) |
| Fixes D4 (agency and tension) | partly (when to spend) | **yes** (choose by intent and element) | partly (timing) |
| Fits ages 5 to 7 | **yes** | hard (reading load) | no (reflex) |
| Elo stays about knowledge | yes | yes | at risk |
| Effort | M | L | M |

Best parts: A's visible charge and a spectacular Special; B's choice between **tactic** and **question** and the intent bubble (in a simpler form than 3 cards); C's timing only as a tiny optional flourish with no effect on damage tiers (cosmetic) and none on rating.

---

## 4. Recommended design: "Charge and Choose"

One sentence: a battle is a few short **beats**; each beat the child picks one of **three big choices** (Move, Power-up, Friend); only **Power-up** asks a question; right answers **charge** a meter that the child spends on a **Special**; every 3rd beat is a free, visual one; a **burst** of 3 questions is a chain with a streak.

### 4.1 The beat loop (landscape layout)

Layout: the arena always visible. Bottom bar is three big action cards plus two small icons:

| Slot | Name (Hebrew gloss) | What it does | Asks a question? |
|---|---|---|---|
| 1 (large) | **Move** (תנועה) | Partner uses one of its 2 moves (element A, element B, shown as chips). Matchup "sparkle" if the enemy likes it. Small damage (about 1/3 of a right answer). Gives 1 **spark**. | **No** |
| 2 (large) | **Power-up** (כוח) | Opens the question panel. Right: a big hit and **1 charge pip** (2 when it is part of a burst). Wrong: a funny oops, the creature tries again with a small hit, no pip lost. | **Yes** (1 question) |
| 3 (large) | **Friend** (חבר) | Calls the bench friend for an **assist** (a free cheerful animation, small damage, element bonus). Cooldown 2 beats. Also the swap/Bag shortcut. | **No** |
| small | Net (appears when calm), Bag, Leave | as today | seal question as today |

When the meter is full, **Move** is replaced by **Special** (a pulsing card). Special is the burst: see 4.3.

The wild creature shows an **intent bubble** each beat ("it will hide", "it will tickle", "it will stomp", always harmless, 3 or 4 variants). Tactic: a "Move" of the right element on that intent gets a bonus (the wild creature is "tickled" and its fog drops extra); a Friend assist can cancel it. Purpose: choosing without reading numbers.

### 4.2 The "not every beat" rule (core answer to the parent's complaint)

| Rule | Value |
|---|---|
| Questions are **chosen** by the child (Power-up), never forced by a button that is the only button | yes |
| Fog floor: free moves can take the fog **down to 50% only** (and the seal needs a question anyway) | so the child cannot skip learning |
| After the child has taken a question, the **next beat is a free beat** by default (a Move or a Friend assist is highlighted; the child can override once) | never two question beats in a row, except inside a burst |
| Burst: at full charge (3 pips for A, 4 for B and C), **Special** asks **3 questions in a row** as a chain | the only place questions come back to back |
| Max consecutive question screens before a non-question animation of at least 3 s | 3 |
| Idle prompt: if the child plays 3 Moves in a row and the fog is at 50%, the creature "looks at you" and Power-up pulses; no forcing | yes |
| Hard cap per battle (`BattleQuizBudget`, wired) | by age band, section 4.4 |
| "Rest beat": after a burst or 2 wrong in a row, the game plays a 3 to 4 s cheerful scene (the creatures play) with a skip | yes |

### 4.3 Special and the streak chain

- Charge: a right answer = 1 pip; 3 or 4 pips = full (by age). A wrong answer neither empties nor fills it.
- **Special** = a chain of 3 questions, panel stays open, the arena plays one **hit per right answer** and the final hit grows with the number right (0, 1, 2, 3 hits): 3 of 3 = the full spectacle ("Perfect!"), 1 of 3 still fires a small move. Nothing is "lost", wrong ones only skip a hit.
- The chain shows 3 dots; the child sees a streak building (Kahoot: streak motivates more than points). The streak does not reset across the battle; it resets in a new battle. No daily streak.
- The existing `comboBonus` (every third right in a row) is replaced by this chain (same idea, visible).

### 4.4 How many questions per battle (by age band)

Counting fog questions only; the seal question(s) come on top (1, or 3 for grown-up forms; keep as is, but see slice 5).

| Band | Fog questions (target) | Hard cap incl. wrong answers | Seal | Free beats (no question) | Typical time |
|---|---|---|---|---|---|
| A (5 to 7) | 3 | 5 | 1 (always 1 for A, even for grown-up forms) | at least 2 | 1.5 to 2 min |
| B (8 to 10) | 4 | 7 | 1 or 3 | at least 2 | 2 to 3 min |
| C (11 to 14) | 5 | 8 | 1 or 3 | at least 2 | 2.5 to 3.5 min |

When the cap is hit the creature "gets tired and calms": the battle ends in the calm state, so a long run of wrong answers never traps the child (anti-frustration). Fog values must be re-tuned so a child needs about the target number of right answers (damage per question = fog for the questions share / target).

Evidence status: the numbers are design judgement. The only external data points are Prodigy's reported "about 3 questions per battle" (teacher resource, soft) and Duolingo "about 5 minutes" (soft); they are consistent with the table, not proof. Slice 6 measures real counts from the field log (`battleEnd` already logs questions, correct and ms).

### 4.5 Catalogue of question presentations (interactions)

These are **presentations of the existing question kinds**; the engine stays the judge (`checkAnswer`). The answer value given to `engine.submit` is unchanged, so rating and content do not change. Each is rendered in the panel over the arena.

| # | Presentation | Maps to engine kind | Input (touch) | Ages | Notes |
|---|---|---|---|---|---|
| P1 | **Cards** (today's choice cards, made bigger and animated in) | choice, tap_figure | tap | A, B, C | default; 3 choices for A (`maxChoices`) |
| P2 | **Throw it**: drag the answer ball onto the enemy (tap-tap alternative: tap ball then tap enemy) | choice (2 to 4 options), true_false | drag or tap-tap | A (tap-tap), B, C | answer as the throw; Zombie-Division style |
| P3 | **Tap the wrong one** ("which one does not belong?") | choice, tap_figure (inverted wording is authored; **only** where the content already has "odd one out") | tap | A, B | adds variety; no new content needed when the kind exists |
| P4 | **True or false shield**: swipe left (false) or right (true), or two big buttons | true_false | swipe or tap | A (buttons), B, C | quick, light beat |
| P5 | **Build the number**: tap digit tiles into slots (place value), then confirm | number | tap tiles | B, C (A: 1 to 2 digits) | replaces the generic pad for place-value and arithmetic skills; pad stays for everything else |
| P6 | **Number pad** (today) | number | tap | B, C | keep as is |
| P7 | **Sort into two boxes** | order, or choice with a category figure | drag or tap-tap | B, C | uses `OrderPicker` from `quiz_flow.ts`; needs order kind enabled |
| P8 | **Arrange the order** (put cards in order, with a tap-to-add list) | order | tap to add, tap to remove | B, C | `OrderPicker` already exists; `QuizSession` blocks "order" today |
| P9 | **Number-line slide**: slide a marker, release to answer | number (with the `number_line` figure) | slide and release | B, C | figure exists; the answer is checked as a number with a tolerance **only if the content declares one** (open question, slice 7) |
| P10 | **Letter tiles**: spell the word from tiles | letters | tap tiles | A (3 letters), B, C | `LetterTiles` exists; blocked in `QuizSession` today |
| P11 | **Match pairs** (2 or 3 pairs; each right pair gives a mini-hit) | a set of 2 to 3 short `choice` questions in one panel | tap pair | B, C | this is a **batch** of questions; every pair is rated separately; only inside Special |
| P12 | **Hold and release dial** (cosmetic flourish after the answer: hold to charge the swing, release inside the green zone, zone is wide; the result changes only the **look**) | any | hold and release | B, C, optional | never changes damage tier or rating (section 5.6) |

Rules: a presentation is chosen **by the content and the kind** (the same question always has the same valid presentations), then **varied** by a rotation so two consecutive questions do not look the same (anti-fatigue, interleaving of presentation). Maximum one presentation the child has not met yet per battle, introduced with a 3-second demo. If a presentation is not built yet, the engine kind falls back to P1/P6.

### 4.6 Visual and animation list

| Moment | Animation | Budget |
|---|---|---|
| Both creatures at rest | **idle bob**: 3 px, 2.4 s loop, offset between the two | continuous, off for reduced motion |
| Enemy intent bubble | pop in 150 ms, wobble once | per beat |
| Move chosen | partner lunge (today's `lunge`, but 40 px), element effect on the enemy (see table below), enemy `hit` squash, **damage number** floats up 400 ms | 0.8 to 1.2 s |
| Right answer | answer card "pops" (scale 1.08, 120 ms) and stars (6 to 10 particles) fly from the answer to the partner; hit-stop 80 ms on impact; fog bar drains with a trailing ghost (lighter segment) | 1 s |
| Wrong answer (never red) | answer card wiggles and fades; partner does a **funny oops** (trips, sneezes a bubble, spins), the enemy blinks; then the partner **tries again** with a weak hit (a "boop") and a line "good try!" | 1.2 s |
| Matchup | sparkle arrow over the enemy; "tickled" or "wobbly" text | 0.5 s |
| Charge | pip fills with a pop; partner aura grows by level (soft glow, no strobe) | continuous |
| Special | cut-in banner (partner portrait, 0.6 s), element finisher of 1.5 to 2 s, camera zoom 1.0 to 1.08, one shake (see limits) | 2.5 s |
| Fog gone | enemy **sits, calm, blinks, a heart pops**; fog bar becomes a calm "ripple" | 1 s |
| Net | net arcs (400 ms), lands, **3 shakes** (400 ms each, with a click), then the seal question appears on the 3rd shake; success: sparkles and the new friend does a **victory dance** (3 hops), then the NameCard | 2.5 s |
| Level-up, evolution | as today (`GrowthCard`), plus a short ring burst | existing |
| Partner or master win | victory dance and confetti (reduced to a static sticker when "calm effects" is on) | 1.5 s |

Attack animations by element (map the monster's types from `monsters` data) and subject (the partner's subject only decides the colour of the question panel and chips):

| Element | Effect | Subject colour chip |
|---|---|---|
| fire / light | flame puff or beam | maths |
| water / ice | splash or snow | science |
| leaf / earth | leaves or rocks | geometry |
| wind / air | swirl and feathers | english |
| electric / metal | sparks (soft, no strobe) | logic |
| shadow / spirit | puff of stars | hebrew |
| normal | star-burst | family |

(Final element names come from the monster table; only 7 effect families are drawn, others reuse the nearest.) All effects are drawn with CSS, SVG or Phaser sprites already in the app; no new art is required for slice 1.

Limits: screen shake at most **once per beat**, at most 6 px, 200 ms, none for reduced motion; no full-screen flash; glows fade in at least 300 ms; particles at most 24 at once; any effect longer than 2.5 s has a visible **skip** by tapping.

### 4.7 Sound and haptics

| Event | Sound | Haptic |
|---|---|---|
| Tap on an answer | soft click | none |
| Right | short rising chime (0.3 s) | light tick (20 ms) |
| Wrong | gentle "boing" (not a buzzer) | none |
| Pip full / Special | whoosh and cheer | medium pulse (40 ms) |
| Net shake | click each | light tick |
| New friend | jingle (1 s) | double tick |

All optional: a Sound switch and a Vibration switch in the parent's settings; defaults on for sound at a low volume, haptics on; sounds are tiny files (under 30 KB each, ogg); `stopPageSound` (lifecycle) already stops them when the app is hidden. No voice except the existing read-aloud.

### 4.8 Accessibility

- **Reduced motion**: respect `prefers-reduced-motion` and add an in-game "calm effects" switch (parent settings): idle bob off, no shake, particles replaced by one static icon, long animations shortened to 400 ms fades; nothing in the loop depends on the animation.
- **No flashing**: nothing flashes more than 3 times a second (WCAG 2.3.1), no strobing glow, no saturated red flashes; every glow ramps over 300 ms or longer.
- **Big targets**: every tappable at least 72 px high (existing action bar is 120x72); answer cards at least 150x72; drag handles at least 72 px; every drag has a tap-tap alternative.
- **No timer for ages 5 to 7** (existing default); the optional timer for B and C never ends a question, it only shows (see 5.6).
- **Read aloud** for the question stays; the panel keeps the Hint, helpers and "don't know".
- **Not colour only**: right and wrong are an icon plus text plus motion, not just green and red.
- Back (Android) still leaves.

### 4.9 Fairness with the adaptive rating

Today (`engine.ts`, `rating.ts`): a right answer gets a speed bonus in the Elo weight when the timer is on (`SPEED_BONUS = 0.5`, up to 1.5x weight when answered instantly), and "super" quality (fast) raises damage to x2. So reflexes already leak a little into the rating for grade 3 and up.

Rules for the new design:

| Rule | Reason |
|---|---|
| **Flourishes never reach the engine.** Timing (P12), throw, dodge, ring and hold-and-release change only the animation size and sound, never the damage tier and never `submit` arguments. | the rating must stay about knowledge |
| Damage tiers depend on **correctness, charge and matchup**, not speed. | fairness for slower children |
| Recommended change: in battle, call `submit` with `elapsed_s` as now (the log keeps the time for the parent's dashboard) but **turn off the Elo speed bonus** (`timer` false for rating in battle contexts) and keep "super" only as a cosmetic "Super!" badge. Fluency practice can keep a timer in a separate non-battle drill. | evidence on timed practice is contested; there is no need to pay the risk for a battle |
| Free moves, assists and flourishes never log an answer. | no phantom data |
| Helpers and hints count as today (half weight, no mastery). | existing rule |
| Burst chains: each question is rated separately; the order and the streak do not change the rating. | no streak effect on theta |
| Presentation changes (drag instead of tap) change the **input**, not the question, so `difficulty` stays; to be safe, track `presentation` in the field log (`mis`/`ctx`) so the parent can see whether a presentation is hard (e.g. P5 builds are harder than P1 for the youngest). | detect bias |
| Fewer questions per battle is fine: the selector picks higher-value items (it already adapts); to hit the target amount of practice, the child plays more battles, or the daily trip questions fill the gap. | |

### 4.10 Anti-frustration rules

1. Nothing is lost: no hearts, no timer that ends a turn, no failure screen, Leave always free.
2. A wrong answer never ends a beat in text only: always the funny oops, then the partner **tries again** with a weak hit (the fog still moves a little, so a wrong answer never feels like zero). Weak hit = 1/3 of a right hit; it never pays coins or growth.
3. After 2 wrong answers in a row: the **owl** offers a free hint, the selector serves an easier item, and a rest beat plays.
4. After 3 wrong in a battle: the Power-up card says "the owl helps" and shows the worked step first (existing `explanation_he`), counted half.
5. Hard cap of questions per battle (4.4); at the cap the creature calms by itself.
6. A burst can be left after any question ("save my charge"): the charge stays for the next beat.
7. Never two question beats in a row, except in a burst the child chose.
8. The first time a new presentation appears there is a 3-second demo and it is **not rated** if the child asks "show me how" (a "practice" flag; half weight at most).
9. A failed capture (a wrong seal answer) shakes the net once and **tries again**; the net is kept (existing).

---

## 5. Implementation roadmap (thin slices)

Each slice is playable by itself and merged with CI green. Process per `playbooks/APP_PLAYBOOK.md`: SDD (update `docs/app/SDD.md`), TDD, a branch per slice, a separate review agent, then update the storybook and `VERSION`.

| Slice | Title | Effort | What the child gets | Files likely touched | Tests |
|---|---|---|---|---|---|
| **1** | **Juicy answer, one-page battle** | **S** to M | Question as a **panel over the arena** (no second page); the answer **plays the hit right then and there**: partner lunge, stars, damage number, fog drain, hit-stop, funny oops on a wrong answer, and the partner tries again; feedback text becomes a small banner (auto-closes after 1.5 s, tap to read the explanation); sound click, chime, boing; haptic tick; reduced-motion respected. No rules change. | `ui/BattleScreen.tsx` (panel instead of the `question` view), `ui/QuizScreen.tsx` (a `panel` mode: no separate feedback page for battle), `ui/battle/Effects.tsx` (new: damage number, stars), `styles.css`, `platform/sfx.ts` (new, tiny), `i18n` | unit: the turn data (`Battle.last`) unchanged; component tests: the panel shows the arena, the oops class on wrong, the number on right, reduced motion class; a browser spec taps through a battle and reads `data-*` |
| **2** | **Beat menu: Move / Power-up / Friend** and the "not every beat" rules | M | The big three choices; Move and Friend assist need no question; fog floor 50%; no two question beats in a row; the per-battle question cap by age band (wires `BattleQuizBudget`); calm at the cap | `core/game/battle.ts` (`move()`, `assist()`, `floor`, `budget`), `ui/battle/ActionBar.tsx`, `BattleScreen.tsx`, `core/game/moves.ts` (new: 2 moves per element), field log events | unit (TDD first): floor 50%, cap by band, no question in a free beat, wrong answer still moves fog 1/3, never two questions in a row; the rating is **not** updated by free beats |
| **3** | **Charge meter and Special burst** | M | Pips, Special, chain of 3, streak dots, the finisher animation | `battle.ts` (`charge`, `special()`), `ui/battle/ChargeMeter.tsx`, `SpecialBurst.tsx`, remove `comboBonus` use | unit: charge rules; chain of 3 rates each question separately; wrong never empties; browser spec for the chain |
| **4** | **Question presentations, first 5** (P2 throw with tap-tap, P4 buttons, P5 build the number, P8 order, P10 letter tiles) and the rotation rule | M to L | Variety. Enable `order` and `letters` kinds in `QuizSession` (today blocked) using `OrderPicker` and `LetterTiles` | `core/world/quiz.ts` (kinds), `ui/battle/presentations/*`, `QuizScreen` (dispatch by kind and presentation), `i18n` | unit: each presentation produces the same `given` as the engine expects (`checkAnswer`); a fuzz that every kind is answerable; a browser spec per presentation; the tap-tap alternative |
| **5** | **Capture as a mini-scene** | S to M | Net arc, 3 shakes, seal question on the shake, success dance; a simpler seal for age A (1 seal even for rare) | `BattleScreen`, `battle.ts` (`sealNeeded` by band), CSS | unit: seal counts by band; spec: shake sequence and the outcome |
| **6** | **Intent bubbles, matchups, friend assist, element effects, rest beats** | L | Tactics layer: the child chooses by intent and element; seven element effect families | `core/game/moves.ts`, `ui/battle/Intent.tsx`, `effects/*`, monster table lookups | unit: matchup bonus; intent bonus; deterministic per seed |
| **7** | **Field-test and tune** | S | Read `devices/` logs: questions per battle, wrong streaks, leaves, time per battle; re-tune the cap, fog and the free-beat ratio; decide on P9 (number-line slide) and P11 (match pairs) | `battle.ts` constants, docs | unit tests keep the numbers; the log analysis script |

**Slice 1 (the smallest change that makes the battle clearly more fun)** in detail:

1. No rule change, the engine and `Battle` stay the same; only the screen changes.
2. The question opens as a panel over the lower 55% of the arena; the arena (both creatures, the fog bar) stays visible above, so the child sees the enemy while thinking.
3. On the answer, the result plays **in the arena immediately**: right: the answer pops, 8 stars fly, the partner lunges, a floating damage number, a 80 ms hit-stop, a fog bar drain; wrong: wiggle, funny oops, the partner tries a weak "boop" (cosmetic in slice 1, since no rule change: show the "boop" with 0 damage and the text "try again later").
4. The banner (1.5 s, tap to read more) replaces the feedback page; the explanation is one tap away, and always shown after a wrong answer for 3 s unless tapped away (learning is not lost).
5. Three tiny sounds and one haptic tick, behind the parent's Sound and Vibration switches (default on, low volume).
6. Reduced motion: the stars become one static star, no lunge, no shake.
Done when: a recorded play-through shows the arena visible during questions, the payoff within 200 ms of the answer, and a battle needs 2 fewer taps per question (Ask, answer, then next; no Continue).

---

## 6. Open questions for the parent (with a recommended default)

| # | Question | Recommended default |
|---|---|---|
| 1 | Should a child be able to **skip** questions by only using free moves? (The fog floor means they can reach 50%, never calm.) | Yes with the 50% floor; questions stay the only way to calm and capture. |
| 2 | Sound and vibration: on or off by default? | Sound on at low volume, vibration on, both easy to switch off in the parent's settings. |
| 3 | Should the battle have a **speed option** (a visible timer, speed bonus coins) for the older child? | No speed in the rating (recommended); an optional "challenge" with a timer for ages 11 to 14 that pays only cosmetic stars; off by default. |
| 4 | Number of questions per battle: do the targets 3 / 4 / 5 fit (age bands A / B / C)? | Start with these, review after a week of logs (slice 7). |
| 5 | Should **wrong answers** cost anything (even a small thing like a missed pip)? | No. The partner always tries again with a small hit; nothing is lost. |
| 6 | Is it OK that the wild creature "acts" (intent bubbles: harmless tickles, hiding) even though nobody is ever hurt? | Yes, with friendly animations only; a setting "no enemy actions" for a sensitive child. |

---

## 7. Sources

- Habgood and Ainsworth, intrinsic integration: https://nottingham-repository.worktribe.com/output/23577510 ; https://www.kqed.org/mindshift/20765/whats-the-secret-sauce-to-a-great-educational-game
- Prodigy: https://en.wikipedia.org/wiki/Prodigy_Math_Game ; https://www.commonsensemedia.org/app-reviews/prodigy-math-game ; https://fairplayforkids.org/pf/prodigy/ ; https://kimola.com/reports/discover-insights-from-prodigy-math-game-user-feedback-google-play-en-144430
- Paper Mario and action commands: https://www.dampfkraft.com/games/paper-mario-combat.html ; https://www.mariowiki.com/Action_Command
- Cassette Beasts: https://wiki.cassettebeasts.com/wiki/Fusion ; https://destructoid.com/?p=250835
- Monster Sanctuary, Temtem: https://turnbasedlovers.com/overview/monster-sanctuary ; https://temtem.wiki.gg/wiki/Squad
- Slay the Spire: https://en.wikipedia.org/wiki/Slay_the_Spire ; https://rpgamer.com/review/slay-the-spire-review/
- Pokemon battle visuals: https://daily.pokecommunity.com/2022/07/10/battle-visuals-analysis-in-pokemon-legends-arceus ; https://daily.pokecommunity.com/2020/01/17/battles-visually-left-behind-in-pokemon-switch-titles
- Pokemon Go throws: https://pogo.gamepress.gg/node/18601 ; https://www.imore.com/how-to-throw-curveball-pokemon-go
- Pokemon Quest: https://en.wikipedia.org/wiki/Pok%C3%A9mon_Quest ; https://www.siliconera.com/pokemon-quest-idle-amusement/
- Duolingo: https://arxiv.org/pdf/2203.16175 ; https://desirabilitylab.com/backfill/backfill-2025-46-duolingo-streak-design
- Kahoot: https://kahoot.com/?p=127954 ; https://lifescied.org/doi/10.1187/cbe.20-08-0187
- Interleaving: https://www.Gwern.net/doc/psychology/spaced-repetition/2014-rohrer-2.pdf ; https://www.scientificamerican.com/article/the-interleaving-effect-mixing-it-up-boosts-learning/ ; https://www.structural-learning.com/research-briefings/mix-it-up
- Timed practice and anxiety: https://ed.stanford.edu/news/boaler-timed-tests-and-development-math-anxiety ; https://hechingerreport.org/proof-points-do-math-drills-help-children-learn/
- Flow: https://icenet.blog/2025/12/02/in-the-zone-the-intersection-of-flow-theory-and-the-zone-of-proximal-development-in-game-based-learning/
- Children and touch, drag and drop: https://oldmagazine.uxpa.org/?p=11776 ; https://developers.google.com/building-for-kids/designing-engaging-apps
- Juice: https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/ ; https://rpgplayground.com/research-making-a-juicy-game/
- Accessibility: https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html ; https://gamesforchange.org/studentchallenge/wp-content/uploads/2022/01/Tips_Resources_for-Considering-the-Needs-of-Disabled-Gamers-in-Design.pdf

---

## 8. Parent's direction video

The parent sent a short concept video (AI-generated concept art, not part of the repo) and said: this is the direction the battle should take. What it shows, and what slice 1 and the later slices do with it.

### 8.1 What the video shows

1. **The fog of forgetting, as a story.** A grey, colourless world; the wise owl flies in with a glowing book and colour, seasons and sunlight return in a swirl.
2. **The battle.** A full-screen scenic backdrop (sunny hills, olive trees, stone houses). The child (seen from the side) at the start side with the partner floating beside them; the wild creature at the other side with small floating geometric objects around it (it is made of cubes and pyramids: the subject shows in its look). Pixel-RPG cards in the corners (name, level, HP and energy bars; the enemy's top end, the partner's top start; the child's own small box in a bottom corner). A pixel-font **question panel at the top centre** ("5+3=?"). The **answers are numbers floating around the enemy** that the child taps. A **helper portrait with a speech bubble** gives the hint. A **message box at the bottom** with a small down arrow. A pause button in a top corner.
3. **The result.** The child points, the partner launches a magical attack (a green swirl of leaves and stars), the enemy is hit and wobbles, the bars update, then victory: the child raises a fist and smiles, the wild creature turns friendly and calm; the capture comes next.

### 8.2 The recommended merge: Charge-and-Choose in this visual language

Section 4 (the beat loop, the meter, Special, the "not every beat" rule) stays the **rules**; the video is the **look and the way a question is asked**:

| Part of the video | Where it lives in the plan |
|---|---|
| Scenic backdrop, soft rays, clouds, leaves | The arena of every slice. |
| Cards in the corners, the child's own stat box | The HUD; the charge meter (slice 3) goes in the partner's card, the child's box can show the streak dots. |
| Question panel at the top centre | The panel of every presentation (P1 to P12 draw inside or under it). |
| Answers floating around the enemy | Presentation P1 (cards), and P2 (throw it): the floating answer is the thing that is thrown. |
| Helper bubble | The owl's hint, free hint and "the owl helps" (anti-frustration rules 3 and 4). |
| Message box with the arrow | The result line (1.5 s, "why?" one tap away) and the narration of Move, Friend and Special beats. |
| Attack, hit, victory pose | The result animations of 4.6; the Special finisher (slice 3) is the same swirl, bigger. |
| The fog story | The first battle of a new child, and the "fog gone" moment; it needs art (below). |

### 8.3 What slice 1 builds of it, and what it does not

In slice 1 (branch `app/battle-slice1`):

- The scenic backdrop is the existing grass picture with a sky, soft sun rays, two clouds and a few leaves drifting; all of it stands still for calm effects.
- The child is shown by the chosen hero picture, with the partner floating beside; the wild creature has little shapes (or letters, for Hebrew and English) drifting around it, by subject.
- Corner cards, the question panel at the top centre, the answers floating around the wild creature in a tidy ring of at most four (each a button of at least 48 CSS px, apart from each other, a slow drift that stops for calm effects). A typed answer keeps a compact number pad at the bottom end, and the wild creature stands nearer the middle.
- The owl's speech bubble in the bottom row holds the hint (and, before a hint, what to do). The bottom message box shows the result; "why?" opens the explanation.
- The result: the partner lunges and a green bolt of leaves flies to the creature, a short pause on impact, stars, a number, the fog bar drains with a ghost behind it; a wrong answer is a harmless oops (the partner trips, the wild creature smirks and wobbles). The child cheers when the fog is gone.
- Calm effects: the parents' switch (per child), or the device's own "reduce motion".

Not in slice 1 (for the later slices, and why): the fog story and the colour returning (needs art and a script); the child seen from the side or behind (we have only front-facing hero pictures); the cube-and-pyramid enemy design (the creatures are the solar ones we ship; the little shapes stand in); a pixel font for the panel (the app has one font, Rubik); a pause button in the arena (Android's back and "going on" exist); the child's own stat box (nothing to put in it before slice 3); a real "throw the number" drag (slice 4, P2); more than four answers (a question with more choices shows the right one and the first others).

### 8.4 Art and assets we do not have (a list for the parent)

1. The grey-to-colour fog story: a grey and a coloured version of one backdrop, the owl flying in with the book, a swirl (a short sprite sheet).
2. A real scenic backdrop: sunny hills, olive trees and stone houses, in two or three layers for a slow parallax. Today: a forest and grass picture from the Tuxemon set.
3. The child from the side or behind (and a pointing pose and a fist-raised pose) for each of the three heroes. Today: one front picture each.
4. The enemy built of cubes, pyramids and spheres, and a small floating-objects sheet for each subject. Today: little drawn shapes and letters.
5. A pixel font with Hebrew letters and digits for the question panel and the cards.
6. A helper portrait set (listening, speaking, surprised) for the owl. Today: one owl portrait.
7. Hand-drawn attack effects (the green swirl, per element, see 4.6); today: CSS and SVG leaves, stars and an orb.
8. Proper sound design: today the three sounds are plain tones synthesized by `tools/sfx_battle.py`.
