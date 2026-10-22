# SEL2: emotions, one by one (research and design cards)

Status: design proposal (docs only, no code). Date: 2026-10-22. Branch `app/sel-research`. English; the game stays Hebrew (RTL). No family details appear here, and none may be added.

This file extends `SEL.md` (skills, 14 mechanics, ethics, slices 1-8). It does not repeat it. It adds: a per-emotion layer (12 emotions asked for, plus 3 the research supports), age bands A (5-7), B (8-10), C (11-14), mechanics that use **only systems that exist or are already specified** (`BATTLE_V3.md`, `WORLD_V2.md`, `DESIGN_IDEAS.md`), kid-facing Hebrew lines, a slice plan, and questions for the parent.

How to read the evidence: "soft" = a parenting page, blog, vendor or press piece, or something I only saw as a search summary this session. Most primary papers could not be opened. Where a claim is mine (design judgement), it says so. Every Hebrew line is a **draft for native review** (see 5).

---

## 1. Principles and guardrails

### 1.1 What the research supports (short)

| # | Finding | Strength | Use here |
|---|---|---|---|
| R1 | CASEL names five competencies: self-awareness (recognise emotions, thoughts, values), self-management, social awareness, relationship skills, responsible decision-making. SEL programmes that teach skills in a sequence, with active practice, work better than values talks (Durlak 2011, see `SEL.md` [1]) | Strong for the framework; modest effects | Skills ladder per emotion: name, notice, choose a tool, try |
| R2 | RULER (Yale) = Recognise, Understand, Label, Express, Regulate. Its Mood Meter plots feelings on two axes: pleasant to unpleasant, low to high energy (four colour quadrants). The independent evidence for the Mood Meter alone is thin; a school cluster trial exists for RULER as a whole | Moderate for RULER, soft for the meter | Feelings are shown as **energy plus pleasantness**, not "good or bad" |
| R3 | Zones of Regulation sorts states into four colours (blue low energy, green calm and ready, yellow rising energy, red very high energy) and stresses that no zone is bad, with a personal toolbox. Independent reviews call the evidence insufficient (`SEL.md` [5]) | Popular; evidence thin | Borrow "no bad zone" and "my toolbox". Do **not** assign colours to the child, and do not use red for the child's state |
| R4 | Emotion coaching (Gottman): notice the feeling, treat it as a chance to connect, listen and validate, help name it, then set limits and problem-solve. "All feelings are fine, not all behaviours" | Parenting-science summary; the primary studies were not opened | The NPC and creature script: **validate, name, then offer options** |
| R5 | Daniel Tiger style strategy songs: one short, singable strategy per situation (for anger: stop, breathe, count), re-used across episodes. Gains in empathy and recognition appeared mainly with a parent discussing it (`SEL.md` [11], Texas Tech) | Moderate, partly producer-funded | One repeated tiny strategy per emotion, then **a parent card**, not a lecture |
| R6 | Projective play (puppets, animals, characters) lets a child look at a feeling from a distance. The mechanism is well described; controlled-trial evidence found this session was weak | Weak evidence, strong practice consensus (soft) | Always the creature or an NPC first, "and you?" optional and private (`SEL.md` P3) |
| R7 | Avoidance keeps anxiety going; gradual, small-step exposure is what works clinically, and coping skills help most alongside it. Over 20 RCTs support CBT with exposure for child anxiety (clinic and clinician pages, soft) | Strong clinically; applies to **treatment**, not to games | Never let the game teach "run away from the scary thing" as the lesson, and never present itself as the treatment. Escalation goes to the parent (1.4) |
| R8 | Shame is the riskier moral emotion for children; guilt (about an act, with a path to repair) is more adaptive. Evidence leans to this (longitudinal child studies) but the field disputes how to measure it | Moderate, contested | Talk about **what happened and how to fix it**, never about what the child **is** |
| R9 | Loneliness in childhood follows different paths; persistent, early-onset loneliness predicts later low mood (UK and Dutch cohorts, abstracts only). Most children's loneliness falls from age 7 to 11 | Moderate, abstracts | Belonging scenes are safe at all bands; the game never measures loneliness |
| R10 | Losing: strong reactions to losing are normal up to about 7; around 7-9 many children can reframe and use simple self-talk. Letting children feel disappointment is part of resilience (expert quotes in a news feature and parenting sites, soft) | Weak (expert opinion) | Band A gets more co-regulation, band B reframes, band C gets autonomy and dry humour (my judgement) |
| R11 | Sibling jealousy is common and developmentally normal; children name unequal gifts, unequal time and favouritism as triggers (Halberstadt-type studies; abstracts only) | Moderate | Equal outcomes for every creature and NPC; never "who is better" |
| R12 | Children's grasp of loss grows: 5-9 see it as final but may blame themselves or think wishes cause events; 8-10 care about fairness and may feel guilt or anger; teens understand fully and feel strongly (bereavement guides from UK, US, Hong Kong, soft; the 11-14 band is covered only indirectly) | Weak to moderate | No heavy loss content by default; longing for someone far away is handled as **ordinary missing**, with a warm local channel (mail) |
| R13 | Gratitude interventions for youth: a systematic review found few youth studies, and a school diary trial with older teens found no well-being gain | Weak, mixed | Keep gratitude as a **quiet ritual and a natural NPC exchange**, never a task or a claim of benefit |
| R14 | The UK Children's Code: data minimisation, profiling off by default, no nudges that push children to give data or lower privacy (summary pages; the ICO PDF itself was not read) | Regulation (UK), a good bar for us | `SEL.md` section 4 and 6, restated in 1.3 |

Honest summary: the framework is well established; the evidence that a **game** builds emotional skills is small and promising (`SEL.md` 1.1). We say "practice and conversation starters" and nothing stronger.

### 1.2 The twelve rules (apply to every card below)

1. **The game is not therapy and does not diagnose.** It never says or implies that a child has anxiety, depression, anger problems or trauma. It never treats, screens or assesses (`SEL.md` 6.1.8).
2. **No emotional scoring, labelling or profile of the child.** No "angry child" bucket, no zone assigned to the player, no trend of moods, no empathy points. Creatures and NPCs have moods and temperaments; **the child has none recorded** (`SEL.md` X3).
3. **Never shame.** No red, no buzzer, no "wrong", no "you should". Lines are about the situation or the creature, never "you are...". No peer comparison, no public failure.
4. **Everything about feelings is optional and skippable.** "Not now" on every choice; nothing gates progress, coins, evolution or befriending on doing an emotion activity (`SEL.md` M2).
5. **Distance first.** Creature, then a third person (NPC), then "and you?" as an optional private tap that is **not stored** (`SEL.md` P3, open question 5).
6. **No collection of sensitive disclosures.** No free text, voice, photo, camera, or "how do you feel today" answers saved. A pick of a face is never written to disk, a log or an upload. The only SEL data the game may keep is what `SEL.md` 4.2 allows: opt-in story choices `{day, sceneId, optionId}` and the NPC's own memory flag (WORLD_V2 5.5), both excluded from every upload with a test.
7. **Adults, not the game, are the safety net.** The child-side button is a bridge to a trusted person ("לדבר עם מבוגר", `SEL.md` 6.1.5). Escalation guidance (resources, signs to talk to a professional) lives in the **parents' area only**, never in front of the child, and never triggered by anything the child did in the game (the game has no signal to trigger it).
8. **Parent visibility = gentle, opt-in, descriptive.** Same shape as `SEL.md` 4.2: scene and chosen option, a conversation question, no counts, no good/bad, no alerts, no mood summary. The generic monthly conversation card needs no data at all and is the default.
9. **Equal outcomes.** Every option in an emotion scene gives the same coins and items (a data test, `SEL.md` X2). The difference is what a person says back.
10. **No dark patterns.** No streaks, no "your creature misses you", no guilt lines, no timed emotional events, no sad faces for absence, no reward for checking in (`DESIGN_IDEAS.md` 5 and 6). A creature that is "sad" is never sad **because of the child**.
11. **No sermon.** No closing lesson sentence, no praise for the "kind" option (`SEL.md` X1). A silence or a question is allowed; a verdict is not.
12. **Heavy topics are off by default.** Death, serious illness, abuse, family conflict, war and security anxiety, bodies and romance are not used. "Missing someone" and "sad" are written as everyday experiences (a friend moved away for the week, the creature misses the meadow). The parent may add a named topic later (`SEL.md` open question 6).

### 1.3 Data rule in one table

| Item | May be stored? | Where |
|---|---|---|
| Which face the child tapped on a check-in | No, never | nowhere |
| "Calm tools" the child picked | Yes: it is a **setting** (a list of tool ids), like a chosen outfit, not a feeling record | profile |
| Dilemma scene id and option id | Only if the parent turned the summary on; 30 days or 20 scenes, delete button | local, never uploaded |
| NPC remembers a scene (flag) | Yes, as the **NPC's memory**, whitelisted flag ids | `WorldData.npcs`, excluded from uploads (test) |
| Time spent on an SEL scene, retries, skips | No | nowhere |
| Free text about feelings | Never collected. (The existing parent-typed family note, WORLD_V2 8.1, is typed by a parent, not by the child) | device only |

### 1.4 Escalation: for the parent only

The parents' area carries one static page, "When to talk to someone" (slice S-SEL7). It states plainly that the game is practice and conversation, not treatment, and lists neutral prompts a parent might use to decide to talk to the child, the school counsellor (יועצת) or a professional: a feeling that is very strong or lasting for weeks, changes in sleep or eating, avoiding school or friends, talk of not wanting to be here, or anything the parent is worried about. Resource names and lines come from `SEL.md` 6.3 and must be re-verified on each organisation's own site before publishing. The page is a link the **parent** opens; the game never shows it to the child, never auto-dials, and never decides "your child needs help". There is no automatic detection in the game, so there is nothing to escalate from; this is deliberate.

### 1.5 The kid-facing line style (applies to all Hebrew samples)

- Short: 4-9 words, one idea. Present tense. Warm, a little playful, never clinical (not "ויסות", yes "להירגע").
- **Name the creature's or NPC's feeling in words and body** ("הבטן שלו מתכווצת"), not the child's.
- Validate first, offer second: "זה בסדר לכעוס. מה עוזר?" (R4). Options are phrased as things that help **some** people, not "you should".
- Neutral gender for the child: infinitive, plural ("נעשה"), or a question ("מה עושים?"). Creatures and NPCs may be gendered.
- Never: "אתה כועס", "אל תבכה", "זה לא נורא", "תהיה חזק", "גדולים לא פוחדים", "לא יפה", "מה קרה לך".
- A choice always includes "לא עכשיו".

### 1.6 Age bands, in one view

| Band | Emotion words | What works | Too much |
|---|---|---|---|
| A (5-7) | 4 faces (שמח, עצוב, כועס, מפחד), body clues, "tummy/chest/hands", creature does it first | Doing with the body (breath ring, hug, count to 3), animals, one thing per scene, read-aloud | Abstract talk, "why" questions, two sides at once, being alone, loss |
| B (8-10) | 8 words, same feeling in small/big sizes, fair/unfair, "two sides", names of tools | Choosing among 3 options, funny NPCs, secrets that may be told, the "not yet" frame | Public humiliation, betrayal, baby faces |
| C (11-14) | Shaded and mixed feelings ("גאה וגם לחוץ"), triggers, "what helps me" | Dry humour, no right answer, autonomy ("your call"), privacy, realistic reactions | Cute mascots, being told how to feel, anything like a school assembly, feeling watched |

---

## 2. Per-emotion cards

Format of each card: **What it is** (short) / **Bands** (A, B, C differences) / **In the game** (2-3 mechanics, **existing systems only**) / **Lines** (3 Hebrew samples, draft) / **Do not**. System names: battle statuses and temperaments are `BATTLE_V3.md` 4.1 and 4.3; Spark 5.3; Run and dozing 6; befriending 8; NPC memory `WORLD_V2.md` 5.5; journal 7.3; objects 8 (PC and its Journal tab, mailbox, bookshelf, TV, fridge, bench and swing, bed, notice board). "Rest Center" is the existing building with the party swap and the creature desk. Temperaments are Shy, Playful, Grumpy, Sleepy, Proud (BATTLE_V3 4.3); `DESIGN_IDEAS.md` C2 proposes ~6 creature personalities and is treated here as planned, not built.

### 2.1 Anger (כעס)

**What it is.** A high-energy unpleasant feeling about something unfair or blocked. Normal and useful. The skill is to feel it **without hurting** and to choose what to do (R3 red/yellow energy; R4 "all feelings fine, not all behaviours").

**Bands.** A: shows it with the body (stomping, shouting); needs a body tool (squeeze, stomp, breathe) and an adult beside. B: can say "that is unfair", can pick between talk, break, tell. C: anger often hides hurt or embarrassment; wants privacy and a way out that is not "calm down".

**In the game.**
1. **Grumpy enemies are not villains.** A wild creature with the Grumpy temperament (Puff 50, Big Puff 20) is shown with a stomp and a puff. When the fog clears and it sits **Calm** (status 13), its pose changes from stomp to a long exhale. The child sees anger go down, with no verdict. (Battle UI only; no new system.)
2. **Windup is a pause button for feelings.** The orange Windup ring (I2) is an existing "something big is building" signal. An optional **נושמים ביחד** (SEL.md M2) can be offered once while a Windup shows: the creature does the breath with the child; the Windup is not cancelled by it (no gameplay edge, no gaming). Band C gets a quiet "count to 4" ring, no text.
3. **A friend NPC loses patience** in a queue or a friendly-duel scene (`SEL.md` M9): the NPC sighs "אוף!" and the child chooses: wait, offer to swap, say something kind, walk away. Each is answered differently; no option is "the calm one".

**Lines (draft, native review).**
- Creature (A): "הוא רוקע ברגליים. אולי ננשום ביחד?"
- NPC (B): "אוף! זה לא הוגן! … אני צריך רגע."
- NPC (C): "לא, אני לא כועס. טוב, קצת. תן לי דקה."

**Do not.** Do not say "אל תכעס". Do not let a breath step lower enemy damage or raise Spark. Do not show the child's own anger as a meter. Do not make a tantrum NPC the butt of a joke. Do not use red to mean "angry child".

### 2.2 Longing, missing someone (געגוע)

**What it is.** Wanting to be with a person, place or time that is not here now: a friend on holiday, a relative far away, a past summer. It is a mix of warmth and ache and it is ordinary. The skill is to hold both and to have a warm way to **connect** (R12). This card is about ordinary missing, not bereavement (heavy topics off by default, 1.2 rule 12).

**Bands.** A: "I want mum/dad/gran now"; understands time as "sleeps"; needs a concrete "when". Waiting is hard; magical thinking is possible. B: can hold "I miss them and I am okay", likes a plan (a letter, a call, a drawing). C: may be embarrassed to say it, or may fill it with music and memories; wants privacy and not to be told "do not be sad".

**In the game.**
1. **The mailbox as a warm channel.** The existing daily postcard (WORLD_V2 8, object 2) and the parent-typed **family note** (up to 100 characters, local only, parent's choice) are the one place a real "I am thinking of you" can arrive. Design stays inside the existing mail object; no new mechanics. (Needs a parent decision: S-SEL5.)
2. **A creature that "misses the meadow", then goes there.** A Shy creature in the Rest Center or on Route 1 looks toward its home meadow. The child can take it to the home meadow (existing home map) and it brightens. The creature does **not** miss the child: the longing is about a place, never "you left me" (rule 10).
3. **Evening Good-thing stone (M14).** At the Bed object ("Goodnight") the partner can ask for one good thing; one of the picture choices is "מישהו שאני אוהב" (someone I love). A warm silent animation; nothing is stored.

**Lines.**
- Partner (A): "הוא חושב על המדשאה. נלך לשם?"
- Mail (B): "יש דואר בשבילך. מישהו חשב עליך."
- NPC (C): "לפעמים מתגעגעים. זה בסדר. אפשר לצייר, לכתוב, או סתם להקשיב לשיר."

**Do not.** Do not let any creature or NPC say "I miss you" **to the child because they were away** (a guilt hook; `DESIGN_IDEAS.md` 6 trap 5). Do not show a countdown to a reunion. Do not ask who the child misses and do not store it. Do not use death imagery (stars as "gone", sleep as "went away").

### 2.3 Sadness (עצב)

**What it is.** A low-energy unpleasant feeling about loss or disappointment. It passes, it can be shared, it does not need fixing. The skill is to **let it be there** and know that company helps (R2 blue, R4).

**Bands.** A: cries, wants a hug; "sad" is a face and a tummy. B: names what made it sad; wants someone to just listen. C: may say "I'm fine", withdraws, uses humour or music; needs to be asked gently and allowed to decline.

**In the game.**
1. **Sit with it (bench and swing, WORLD_V2 object 15).** An NPC or creature sits sad on the bench. Options: sit next to them, bring a berry, ask, walk on. The NPC answers like a person ("אני פשוט עצוב. תישאר?"). No fix is delivered; sitting is a complete answer.
2. **Sleepy temperament as "low energy, okay".** The Sleepy temperament and the Drowsy status already show low energy. A creature curled up in the Rest Center is just resting; the nurse says so. This teaches that low energy is not an emergency.
3. **Dozing is not defeat** (BATTLE_V3 6). When a friend dozes the line is "X is sleepy. Who will help?" and the **free swap** is the comfort: someone else steps up, the sleeper naps on the bench. This quietly models "someone takes over while you rest".

**Lines.**
- Creature (A): "הוא עצוב. אפשר לחבק?"
- NPC (B): "לא בא לי לדבר. אבל תשב איתי."
- NPC (C): "אני בסדר. … טוב, לא ממש. תודה ששאלת."

**Do not.** Do not say "אל תבכה" or "בטח יהיה בסדר". Do not turn sadness into a puzzle to solve or a prize to earn. Do not use sad faces for a wrong answer, an absence or a fainted creature (BATTLE_V3 6.6 already forbids it). Do not ask the child to rate their sadness.

### 2.4 Fear and anxiety (פחד, חרדה)

**What it is.** Fear is an alarm about a present threat; worry is the alarm going off about something that might happen. Both are normal. Most of the skill is to **notice the alarm, use a body tool, and approach in small steps** (R7). Avoidance feeds worry, so the game must not teach "make the scary thing go away".

**Bands.** A: fears of dark, noise, being alone; needs a safe place and a hand. B: worry about school, mistakes, social events; can use "what is the worst, the best, the most likely?". C: social worry, performance worry; hides it; needs autonomy and a small-step plan.

**In the game.**
1. **The calm creature is already a fear scene.** BATTLE.md frames a wild creature as a scared one whose fog goes down. The existing **Calm** status and the befriending step (8) become the "approach slowly" model: the child does a small step (a question, a gentle throw), the creature relaxes a bit more. Never forced: **Run** is always free and is shown as a fine choice (BATTLE_V3 6.4).
2. **Shy temperament (Thicken 30, Giggle 20).** A Shy creature hides behind a "Thicken" cloud. The line when the child waits: "אפשר לחכות. הוא יצא כשירצה". This models "take your time". Optional breath ring at the Calm moment (M2).
3. **Windup as "something big is coming; here is what helps".** A Windup is a visible, known threat with a counter (Stagger). The child sees: scary things can be predicted and answered. No score on how the child reacted.

**Lines.**
- Creature (A): "הוא מתחבא. נחכה קצת?"
- Partner (B): "גם לי יש פרפרים בבטן. נספור ביחד עד ארבע?"
- NPC (C): "לא פשוט להתחיל. אפשר להתחיל בקטן."

**Do not.** Do not say "אין ממה לפחד" or "גדולים לא פוחדים". Do not use jump scares, sudden loud sounds, dark screens or timers (`SEL.md` 6.1.6). Do not encourage "just leave" as the moral of every scene (R7); do show small steps and a choice to try later. Do not name the child's anxiety or suggest they have it. Do not use this as practice for a clinical fear; if a parent worries, that is for a professional (1.4).

### 2.5 Jealousy and envy (קנאה)

**What it is.** The sting of seeing someone else get what you wanted: attention, a gift, a skill. Jealousy (fear of losing someone's attention to another) and envy (wanting what another has) are both normal and especially common between siblings (R11). The skill is to **notice it, say it, and do something that is not hurting**.

**Bands.** A: grabs, sulks, "she got more!". B: sharp sense of fairness, counts everything. C: hides it behind sarcasm; compares talent and friends; privacy matters.

**In the game.**
1. **Equal gifts, visible.** The Fridge object (a snack a day for the partner) and the gift system (WORLD_V2 5.5: loved/liked/ok only, no dislikes) give every creature and NPC the same kind of reply. A "gift goes to someone else first" NPC scene (a neighbour gives a berry to the other creature) lets the child feel the sting and choose: say "I wanted one too", share, walk away. Each is answered; **materials are equal** (test).
2. **Spark and Silly Dance are not a ranking.** Spark is a team meter (5.3); there is no scoreboard between friends. Keep it that way: no "best creature" labels in the SEL layer.
3. **The proud rival (rival role).** A Proud temperament rival with a nicer creature: the child can ask, congratulate, ignore. The rival's answer is human ("הא, תודה. את היצור שלך אני דווקא אוהב"). No "one is better".

**Lines.**
- Creature (A): "הוא רצה גם. נשתף?"
- NPC (B): "היא קיבלה יותר! … אולי לא יותר. אבל זה הרגיש ככה."
- NPC (C): "כן, קינאתי קצת. עכשיו עבר."

**Do not.** Do not rank creatures or children. Do not show who has more of anything between siblings (`FEATURES.md` open question 6; `DESIGN_IDEAS.md` S6). Do not make envy a sin or a character flaw. Do not show a sibling's progress on a child's screen.

### 2.6 Disappointment, losing and failing (אכזבה, הפסד)

**What it is.** The drop when something expected does not happen, and the sting of losing a game. The skill is to feel it, stay in the game, and try again or stop, with the relationship intact. Strong reactions are normal up to about 7; reframing grows from about 7-9 (R10, soft).

**Bands.** A: tears, quitting, "it's not fair"; needs co-regulation and a quick "again?". B: counts "unfair", can reframe with help ("the tail was close"). C: wants a dry, short answer; may want to leave without explaining; cares about face.

**In the game.**
1. **Losing in battle never says "lost".** Dozing and **Run** (BATTLE_V3 6) are already soft. Add a **one-line, task-focused** line after Run or a full-team doze: "הפעם לא תפסנו. הוא עוד כאן." plus "ננסה שוב? / אחר כך". The Steady star is simply not earned; nothing is subtracted (6.5).
2. **Befriending that misses** (8): "the creature was not ready yet." The tray offers "again", "a hint", "later". The line is about the creature's readiness, not the child's skill.
3. **Friendly duel losing (M9 and SEL.md "A lost game")**: the rival or NPC says "good fight" in their own voice; the child chooses: handshake, rematch, leave quietly. The NPC remembers (flag) without praise or pity.

**Lines.**
- Creature (A): "אוף! כמעט! עוד פעם?"
- Narrator-free (B): "לא הפעם. הוא עוד ממש כאן."
- NPC (C): "הפסדנו? בסדר. נעשה הפסקה ונחשוב."

**Do not.** Do not say "הפסדת", "נכשלת", "כמעט הצלחת" (the last invites an unfair comparison). Do not give a consolation prize in coins for losing (it teaches that losing pays). Do not show a defeat animation of the partner. Do not force a retry.

### 2.7 Shame and embarrassment (בושה, מבוכה)

**What it is.** The feeling of being seen as small or wrong. Embarrassment is a lighter, fleeting version after a slip (wrong answer in public, a joke that fell flat). Shame ("I am bad") is more painful and, for children, the riskier of the two; guilt ("I did something wrong and can fix it") is more constructive (R8). The skill is to separate **the act from the self** and to repair.

**Bands.** A: hides face, "I'm bad"; needs "that happened; you are okay". B: very sensitive to being laughed at; needs privacy for mistakes. C: shame hides behind jokes and anger; being seen to fail is the main fear.

**In the game.**
1. **Wrong answers are private and unnamed.** The existing rule (wrong answer never punishes; owl hint after 2 wrong) is the foundation. In SEL scenes, no audience NPC reacts to a wrong answer; no "everybody saw". Spec test: no SEL scene writes a line that comments on the child's mistake.
2. **Repair (M7), "not yet" is allowed.** After a scene where the child hurt someone (the tail knocks a flower stall), options: say sorry, help fix it, ask what they need, not yet. The NPC says "אני אהיה כאן" to "not yet". This models guilt-with-repair, not shame. A sorry that is coerced reads worse to the NPC (`SEL.md` [23]).
3. **Creature slips.** A creature trips, the child sees embarrassment (cover face with paws) and the NPC laughs **with** it, not at it (Giggly status is a warm "silly" signal). Models "everyone slips".

**Lines.**
- Creature (A): "אופס! קורה. עוד פעם?"
- NPC (B): "שברת? לא נורא, נסדר ביחד."
- NPC (C): "כולם מתבלבלים לפעמים. גם אני."

**Do not.** Do not say "איזה בושה". Do not have an audience laugh at the child's mistake. Do not use a public board of errors. Do not define the child by one act ("אתה אחד ש..."). Do not use "you should be ashamed" in any tone. Do not rank mistakes. Do not tie repair to coins.

### 2.8 Frustration with learning (תסכול בלמידה)

**What it is.** The tension when a question will not yield. It is a signal the task is at the edge (good) and that the child may need a hint, a different path or a break (R10 and growth-mindset effects, which are small: `SEL.md` [13]). The skill is to say "not yet", ask for help, or switch.

**Bands.** A: gives up quickly or taps randomly; needs a short task and a hint. B: "I'm bad at this", wants to be told it is normal; benefits from "mistakes are information". C: guards pride; wants a way to stretch without being watched; resents "baby" encouragement.

**In the game.**
1. **The owl hint ladder** (existing: owl after 2 wrong, hint, easier tier, +1 Spark after 3 wrong, BATTLE_V3 5.3). Add a **one-line, task-focused** owl line ("השאלה הזו מסובכת", not "you are struggling"). No change in rating or reward.
2. **Dream Replay** (BATTLE_V3 6.2) is already "try that question again, no pressure". Frame it as "let's look again", never "you got it wrong".
3. **Quest "show me" and "lesser form"** (WORLD_V2 7.5): after 3 tries the NPC shows the answer and the quest finishes in a lesser form (half coins, rest unchanged). The line is "נראה ביחד", never "you failed". The journal keeps it as done.

**Lines.**
- Owl (A): "זו חידה קשה. רוצים רמז?"
- Owl (B): "עוד לא. אנסה אחרת איתך?"
- Owl (C): "הקשה הזה אחד מהם. שניה, ננסה זווית אחרת."

**Do not.** Do not praise for failing ("כל הכבוד על שטעית") in a loop; do not say "זה קל". Do not show an accuracy percent to bands A and B. Do not lower the next question silently in a way the child sees as being treated as dumb: the easier tier stays unlabelled. Do not use a timer.

### 2.9 Loneliness (בדידות)

**What it is.** Wanting more or better connection than one has. Different from being alone (which can be fine). Often it passes; persistent loneliness matters (R9). The skill is to **reach out in a small way**, to notice others, and to accept an "not now".

**Bands.** A: "no one to play with"; needs an adult-set-up invitation. B: group belonging matters; friend groups form and exclude. C: belonging is central; fear of being left out; hiding it.

**In the game.**
1. **The lonely kid on the bench (M8, `q_bench`, WORLD_V2 15).** The child chooses: sit near, invite, ask, walk on. The kid answers like a kid: sometimes "אולי אחר כך". No guaranteed happy ending, no reward (materials equal). The NPC remembers (flag) a plain remark next visit.
2. **The partner is always there, without guilt.** The partner greets the same after a day or a month (rule 10). A hug on the home meadow is just a hug. This is a safe reference point for belonging, not a replacement for people (design judgement); nothing says "you only have me".
3. **People card** (PC, WORLD_V2 object 1, tab "People"): friendship hearts 0 to 3 **never decrease** (5.5). A new face is a small, visible invitation to say hello, never a score.

**Lines.**
- NPC kid (A): "אני לבד. רוצים לשחק?"
- NPC kid (B): "אני לא מכיר אף אחד פה. אתה חדש גם?"
- NPC (C): "לא צריך, באמת. … אבל תודה שניסית."

**Do not.** Do not have the partner say "I'm all you need". Do not show friendship hearts as a leaderboard or "you have no friends". Do not ask the child if they are lonely. Do not measure social connection. Do not make an "excluded" scene cruel in band A.

### 2.10 Joy and pride (שמחה, גאווה)

**What it is.** Joy is high-energy pleasant (R2 yellow). Pride is a good feeling after effort. Savouring it is a skill: noticing the good, sharing it. The risk is **hubris** or an addiction to praise (overjustification, `DESIGN_IDEAS.md` 2).

**Bands.** A: jumps, claps, shows everyone. B: wants to be seen, collects. C: wants quiet pride, may find shows embarrassing.

**In the game.**
1. **Evolution and Brilliant hits already carry joy** (BATTLE_V3 3.4, 7). Let the animation breathe (skippable) and let the partner celebrate in its own way; the line is about the creature's joy.
2. **Trophy shelf and Town Fund** (WORLD_V2 objects 8, 14): the child **shows** something and an NPC reacts as a person ("וואו, זה אתה בנית?"). No ranking, no comparison.
3. **Savour at the Bed object** (M14): "what was nice today?" as a picture pick, no store.

**Lines.**
- Creature (A): "הוא קופץ משמחה!"
- NPC (B): "וואו. את זה בנית בעצמך?"
- NPC (C): "יפה. אני רואה כמה עבדת על זה."

**Do not.** Do not praise the person ("אתה חכם"); praise the effort or the thing ("עבדת על זה"). Do not make pride a currency. Do not require sharing. Do not let a sibling see another's trophies without the child's choice.

### 2.11 Empathy (אמפתיה)

**What it is.** Noticing another's feeling (cognitive), feeling with them (affective), and wanting to help (compassion). Perspective-taking is learned stepwise; the honest answer is often "ask them" (`SEL.md` P6, theory-of-mind work). Sympathy grows through late childhood.

**Bands.** A: "she is sad because…", helps if shown how. B: two viewpoints in one scene; faux pas. C: hidden feelings, group dynamics, sympathy for strangers.

**In the game.**
1. **Guess, then ask (M5).** A character shows a feeling; the child guesses; "ask" reveals the truth, often not the guess. Never marked wrong.
2. **Creature feeling cues without telling.** The temperament and status icons (Giggly, Drowsy, Calm, Sniffly) are visible cues; the child learns to **read** creatures. The Book can have a "how I know it feels..." page with the cues (planned, no new system).
3. **NPC memory** (5.5): an NPC remembers a kindness as a plain remark ("תודה על הפרי"), not a reward; the reward is the NPC being warm.

**Lines.**
- NPC (A): "היא בוכה. מה עושים?"
- NPC (B): "הוא שותק. איך נדע מה קרה?"
- NPC (C): "היא אומרת שהכול בסדר. אולי כן, אולי לא."

**Do not.** Do not claim the game builds empathy. Do not say "you made her happy" as a verdict. Do not assign "empathy points". Do not make the guess a test.

### 2.12 Gratitude (הכרת הטוב, תודה)

**What it is.** Noticing what is good and who contributed to it; saying thanks. The evidence for formal gratitude exercises in youth is thin and mixed (R13); as an ordinary social act it is part of derech eretz (`SEL.md` 1.4).

**Bands.** A: "thank you" is a habit; likes giving. B: understands reciprocity; may be embarrassed by too much. C: sincere but private; forced thanks reads as fake.

**In the game.**
1. **NPC thanks are plain.** The mailbox event letters (thanks from a helped NPC, arriving next morning, WORLD_V2 8) are the vehicle; one line, no lesson.
2. **Give a gift (existing gift system).** One gift per NPC per day; the NPC reacts loved/liked/ok. The child feels the exchange; no points for "kindness".
3. **Good-thing stone at the Bed (M14).** One picture choice per night, optional, not stored, no streak.

**Lines.**
- NPC (A): "תודה! זה בדיוק מה שרציתי."
- Letter (B): "קיבלתי את הלחם. הוא התפח יפה. תודה."
- NPC (C): "לא היית חייב. תודה."

**Do not.** Do not make thanks a task, a streak or a "gratitude journal". Do not say "תגיד תודה". Do not claim benefits. Do not reward saying thanks.

### 2.13 Extra: Guilt and repair (אשמה, תיקון)

**What it is.** The feeling that I did something that hurt someone; the constructive sibling of shame (R8). The skill is **repair**.

**In the game.** M7 Repair (see 2.7), the wallet kept and a second chance (`SEL.md` 0.1: keep), a "tail knocked the stall" scene.

**Lines.** "הוא שבר. מה עושים?" / "אני צריך זמן." / "תודה שחזרת."

**Do not.** Do not make a sorry a currency. Do not show "forgiven" as a result. Do not force an apology.

### 2.14 Extra: Overwhelm and tiredness (הצפה, עייפות)

**What it is.** Too much input or too little energy. Low-energy states are easily mistaken for sadness or laziness; naming them is a skill (R2, R3).

**In the game.** The Rest Center and the existing screen-time wind-down (`DESIGN_IDEAS.md` T3: creatures go to bed after the parent's limit, a lullaby). The Sleepy temperament and Drowsy status. The Bed object ends the session. Energy is a pacing aid, never a penalty (FEATURES 4.9).

**Lines.** "הוא עייף. נעשה הפסקה?" / "קצת הרבה. נשב רגע." / "גם אני צריך מנוחה."

**Do not.** Do not call a tired child lazy. Do not use "you've played too long" as guilt. Do not make rest a cost.

### 2.15 Extra: Courage and hope (אומץ, תקווה)

**What it is.** Courage is acting while afraid, in small steps; hope is the sense that things can improve and I can do something (the opposite of "I am bad at this"). The skill is **small steps**, which is also what clinical practice uses (R7).

**In the game.** Befriending as gradual approach (2.4); a "try a harder one" opt-in (`DESIGN_IDEAS.md` P6 expert trials); the next quest card in the journal as a visible next step (WORLD_V2 7.3).

**Lines.** "קטן קטן, ואז עוד קצת." / "זה היה צעד. יפה." (about the step, not the person) / "אפשר לנסות שוב מחר."

**Do not.** Do not say "אל תפחד". Do not make courage a bar. Do not push a child to the hardest step.

### 2.16 Grid: where each emotion lives (existing systems)

| Emotion | Battle (statuses, temperaments, Spark, fainting) | Befriending, evolution | NPC and quests | Objects | Rest Center |
|---|---|---|---|---|---|
| Anger | Grumpy, Windup, optional breath | calm at the end | impatient NPC (M9) | | |
| Longing | | | | mailbox, family note, Bed | Shy creature at the meadow |
| Sadness | dozing + free swap | | bench NPC | bench, swing | Sleepy creature resting |
| Fear/anxiety | Shy, Windup, Run | gradual approach | | | |
| Jealousy | no ranking in Spark | | rival, gift scene | Fridge | |
| Disappointment | Run, doze, Steady star | "not yet" tray | friendly duel | | |
| Shame | private wrong answers | | repair scenes | | |
| Frustration | owl hint ladder, Dream Replay | | quest "lesser form" | PC Journal recap | |
| Loneliness | | | lonely kid | bench, People card | |
| Joy, pride | Brilliant, Finale | evolution | NPC reactions | Trophy shelf, Town Fund | |
| Empathy | cues via icons | | guess then ask | Book cues page | nurse NPC |
| Gratitude | | | thanks letters, gifts | mailbox, Bed | |

---

## 3. Slice plan (S-SEL1..S-SEL8)

These slices complement `SEL.md` section 5 (its slices 1-8 stay as they are; S-SEL slices add the emotion layer on top). Effort S/M/L as in `FEATURES.md`. Each slice: SDD paragraph first, TDD tests first, feature branch, separate review agent, green CI, storybook update with `VERSION` (per `CLAUDE.md`). "Needs" = depends on a slice or a parent decision.

| # | Slice | What | Effort | Needs | Tests (first) | Parent decision |
|---|---|---|---|---|---|---|
| S-SEL1 | **Guardrail lint and vocabulary data** | `core/sel/vocab.ts`: emotion words by band (4/8/shaded), body-cue phrases, a **banned phrase list** (the "never" lines of 1.5 and each card), a **no-storage test harness** (spies fail if SEL code writes a face pick, time or retries to storage or upload). Content-lint test runs on every SEL `.po` line: length limit, no "אתה כועס"-type phrases, no moralising closers | S | `SEL.md` slice 1 choice action | banned list fails a seeded bad line; no write to any store on a check-in; every line has he and en | Approve banned list and band word sets |
| S-SEL2 | **Creature feelings through existing temperaments** | Map the 5 temperaments and 14 statuses to feeling words and body cues (read-only); animation and line pools per temperament; Book "how I know" cue page | S-M | S-SEL1, BATTLE_V3 S2 (statuses) | each temperament has lines for 3 bands; no line addresses the child's state; creature never sad "because of the child"; reduced-motion path | None, unless the planned personalities (C2) are added |
| S-SEL3 | **Battle moments: anger, fear, losing, frustration** | Optional breath at Calm and at Windup (M2); task-focused owl lines; soft lines after Run and full-team doze; "not yet" tray lines in befriending; no reward or Spark change from any of it | M | BATTLE_V3 S2 and S3; `SEL.md` 1d | Net works without breath; the breath changes no fog, coins, Spark, Elo; lines contain no "הפסדת/נכשלת"; Run never costs; one breath per battle | Gentle vs Normal strength knob already exists; confirm band A default |
| S-SEL4 | **Quiet corners: sadness, overwhelm, loneliness** | Bench and swing scene set (sit with, bring a berry, ask, walk on), lonely kid on the bench, Rest Center "rest" lines, Sleepy and Drowsy framing; bed "Goodnight" with the optional good-thing stone | M | WORLD_V2 W3 (bench) and W5 (bed) | all options equal material outcome; "not now" exists; no sermon line; memory flag whitelisted and excluded from export | Which sensitive situations are in (open question 6) |
| S-SEL5 | **Longing: the warm mail channel** | Daily postcard framing and the parent-typed family note (100 characters, device only); an optional **"send a thought" picture reply** to a parent-chosen contact is **out of scope** (no outbound channel) | S | WORLD_V2 W2 (mailbox), parents' area | note never leaves device; never in upload (test); no counter, no streak; child cannot type; parent sees only what they typed | **Yes:** on or off for the family note; tone guide for what to write; whether to enable it at all |
| S-SEL6 | **Envy, pride, gratitude, repair via NPC scenes** | Gift-to-someone-else scene, rival congratulations, thanks letters, repair scenes with "not yet"; NPC memory remarks | M | WORLD_V2 W3 (quest hooks), `SEL.md` slice 4 | equal rewards; rival never "better"; no rank anywhere; thanks not rewarded; repair not tied to coins | Confirm rival tone, and whether sibling-themed scenes are in |
| S-SEL7 | **Parent layer: cards and "when to talk to someone"** | Monthly generic conversation cards **per emotion** (no data needed); opt-in story-choices summary (from `SEL.md` 4.2); static "When to talk to someone" page; resource links (parent-opened) | M | `SEL.md` slice 6 | cards contain no label, count or score; summary off by default; delete works; resource page not reachable from the child side; links re-verified | **Yes:** which cards, language, whether the child sees that parents can view choices (open question 4) |
| S-SEL8 | **Review and tuning** | Native Hebrew pass (gender, tone, glossary in section 5), school counsellor or child psychologist reads all lines once, playtest per band (watch, do not record) | S | all above | checklist of `SEL.md` 6.2 plus this file's section 1.2 | **Yes:** who reviews; whether to hold back band C scenes until reviewed |

Suggested order: S-SEL1, S-SEL2, S-SEL3, S-SEL4, then S-SEL7, S-SEL5, S-SEL6, S-SEL8 before any release beyond the family. If time is short, keep S-SEL1, S-SEL3, S-SEL7.

---

## 4. Open questions for the parent (recommended default each)

1. **Longing and the family note.** Do you want the optional parent-typed note (100 characters, device only) in the mailbox? *Recommended:* off by default, a one-line setting; the generic daily postcard stays on.
2. **Sensitive topics.** Which of these are in: anger, jealousy between siblings, losing, shame after a mistake, loneliness/exclusion, ordinary missing someone? *Recommended:* all in at bands B and C; band A gets anger, losing, fear-of-a-creature and sadness only. Out by default: loss and death, illness, family conflict, abuse, war.
3. **Child sees what parents can see?** *Recommended:* yes, one line, once (`SEL.md` open question 4).
4. **Check-in "and you?"** *Recommended:* optional, private, never stored, absent for band A until asked (`SEL.md` open question 5).
5. **Creature personalities (DESIGN_IDEAS C2).** Do we add them, or use only the 5 temperaments now? *Recommended:* temperaments now; personalities later.
6. **Parent cards.** Generic monthly cards: on; story-choices summary: off until opted in. Language: Hebrew only, or also English? *Recommended:* Hebrew first.
7. **Professional review.** Who reads the scene sets (a school counsellor or child psychologist) and when? *Recommended:* before anything is used outside the family; a native Hebrew pass on all lines.
8. **Escalation page.** Do you want the "When to talk to someone" page? *Recommended:* yes, parents' area only; resources re-verified before release.
9. **Tone for band C.** Should 11-14 get the same scenes with shorter, drier lines, or a separate set? *Recommended:* the same scenes, drier lines, more "your call".
10. **Religious framing.** As `SEL.md` open questions 1 and 2: *Recommended:* plain words in the game; traditional names only in the optional parent layer.

---

## 5. Hebrew glossary (draft; **native review needed on every row**)

Marked **(?)** where I am unsure of register, gender or child usage. All forms are neutral or given as masculine/feminine pairs where the child is addressed.

| English | Hebrew | Note |
|---|---|---|
| feeling | רגש (?) / הרגשה | "הרגשה" is more child-friendly |
| happy / joy | שמח / שמחה | |
| sad / sadness | עצוב / עצב | |
| angry / anger | כועס / כעס | |
| afraid / fear | מפחד / פחד | |
| worry / worried | דאגה / דואג | |
| anxiety | חרדה (?) | adult word; keep out of kid lines; parent layer only |
| missing someone / longing | געגוע / מתגעגע | verify with native speaker for a child (?) |
| jealousy / envy | קנאה | |
| disappointment | אכזבה | |
| losing | להפסיד | avoid in lines about the child (1.5) |
| shame | בושה | parent layer only; kid lines use "מבוכה" (?) |
| embarrassment | מבוכה / נבוך (?) | |
| guilt | אשמה (?) | prefer "סליחה" and "לתקן" |
| frustration | תסכול | kid lines: "מתסכל", "לא מצליח" (?) |
| loneliness / lonely | בדידות / בודד | |
| pride / proud | גאווה / גאה | |
| empathy | אמפתיה | parent layer; kids: "להבין מה מרגישים" |
| gratitude / thank you | הכרת הטוב / תודה | |
| calm / to calm down | רגוע / להירגע | |
| breathe | לנשום | "נושמים ביחד" |
| tired | עייף | |
| overwhelmed | מוצף (?) | kid lines: "יותר מדי" |
| brave / courage | אמיץ / אומץ | |
| hope | תקווה | |
| safe place | מקום בטוח | |
| ask for help | לבקש עזרה | |
| not yet | עוד לא | |
| not now | לא עכשיו | |
| sorry | סליחה | |
| friend | חבר / חברה | |
| talk to a grown-up | לדבר עם מבוגר | |
| butterflies in the tummy | פרפרים בבטן | idiom, check it is current (?) |

---

## 6. Sources

Soft = a parenting page, blog, vendor, press piece, or a search summary I could not open. No claim above goes beyond what the source summary says.

1. CASEL, "What is SEL?" https://casel.org/what-is-SEL/ ; 2020 framework wheel PDF https://ocde.us/EducationalServices/StudentInitiativesPartnershipsAndEvents/SiteAssets/Pages/PhysicalEducationandPhysicalActivity/CASELs%20Framework%20for%20Systemic%20Social%20%26%20Emotional%20Learning%20Wheel.pdf (framework; school copy). The five competencies and the 2020 self-awareness wording come from these; sub-skill lists on teaching-wiki sites are soft.
2. Yale Center for Emotional Intelligence, RULER and the Mood Meter: https://medicine.yale.edu/childstudy/services/community-and-schools-programs/center-for-emotional-intelligence/training/ruler ; Families MoodMeter overview https://rulerapproach.org/wp-content/uploads/2025/07/Families_MoodMeter_Overview.pdf ; preschool video https://news.yale.edu/videos/preschool-ruler-mood-meter (institution pages). Cluster-trial evidence: `SEL.md` [4].
3. Zones of Regulation (Leah Kuypers): https://zonesofregulation.com/blog/archives/04-2023 ; summary sheets https://bso.bradford.gov.uk/userfiles/file/Andrew/SCIL%20Autism/ZOR%20Helpsheet.pdf (educational pages, soft). Evidence caveat: `SEL.md` [5].
4. Gottman emotion coaching: https://www.gottman.com/ (blog summaries) and publisher page https://publishersweekly.com/9780684801308 (secondary; primary studies not opened).
5. Daniel Tiger strategy songs: episode and PBS pages https://www.neighborhoodarchive.com/dtn/episodes/104a , https://www.pbs.org/parents/thrive/your-favorite-songs-from-daniel-tigers-neighborhood (soft); studies in `SEL.md` [11][12].
6. Shame and guilt in children: Tangney-line longitudinal work and the functionalist critique, summarised at https://www2.mdpi.com/2076-328X/7/4/83 and https://scalda.mijn.bsl.nl/children-s-proneness-to-shame-and-guilt-predict-risky-and-illega/530064 and https://research.vu.nl/ws/files/1661416/Olthof%20British%20Journal%20of%20Developmental%20Psychology%2018(1)%202000%20u.pdf (abstract-level; contested field).
7. Child anxiety, avoidance and exposure: clinic and clinician pages https://www.psychotherapy.net/article/addressing-common-myths-about-exposure-therapy and https://mghcme.org/app/uploads/2021/03/Henin-2021_Henin_Young_Child.pdf (soft; clinical, not about games).
8. Childhood grief and understanding of loss by age: https://whatsyourgrief.com/childhood-grief/ , https://www.hiahealth.org/2025/05/01/childrens-understanding-of-death-developmental-guidelines/ , https://haringey.gov.uk/children-young-people-families/send-local-offer/bereavement-guide-families/supporting-bereaved-children-young-people (guides, soft; the 11-14 band is thin).
9. Play and puppets as projection: https://www.igi-global.com/chapter/expanding-the-range-of-puppetry-in-expressive-play-therapy/175944/ and a small master's thesis https://digitalcollection.naz.edu/works/publication-dissertation/hgdjk-s4853 (weak evidence; mechanism described only).
10. Loneliness trajectories: https://pmc.ncbi.nlm.nih.gov/articles/PMC11590972 ; https://digitalcommons.memphis.edu/facpubs/8337 ; https://clok.uclan.ac.uk/id/eprint/1265/1/1265_qualter_acceptedversion.pdf ; https://research.ou.nl/en/publications/loneliness-self-esteem-anxiety-and-depressive-symptoms-across-ado/ (abstracts only).
11. Losing and frustration tolerance by age: https://en.ara.cat/kids/why-do-you-get-angry-when-you-lose_1_5486364.html and parenting pages (news feature and blogs, soft; no primary study found).
12. Sibling jealousy: https://www.andrews.edu/~rbailey/Chapter%2012/6327015.pdf (Child Development 2002, 73(2)) ; https://journals.sagepub.com/doi/10.1177/02654075221131079 ; https://www.ebsco.com/research-starters/psychology/sibling-rivalry (abstract and starter-level).
13. Gratitude interventions in youth: https://eprints.soton.ac.uk/371951/1/tara_20diebel_20thesis_20FINAL.pdf and https://bps.org.uk/exploring-effectiveness-school-based-gratitude-intervention-childrens-levels-anxiety-sense-school (a thesis and an abstract; no pooled youth meta-analysis found this session).
14. UK ICO Children's Code: https://ico.org.uk/media/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services-2-1.pdf (listed in search; I read summary pages, not the PDF) ; https://brodies.com/insights/ip-technology-and-data/what-do-you-need-to-know-about-the-icos-age-appropriate-design-code/ (summary, soft).
15. Prior art in this repo: `SEL.md` (sources [1]-[26]), `BATTLE_V3.md`, `WORLD_V2.md`, `DESIGN_IDEAS.md`.

Not researched in this session (gaps): primary papers behind Gottman, Tangney and the loss-by-age guides; ages 11-14 evidence for digital SEL; Inside-Out-style emotion wheel studies; whether any "worry game" for children has been trialled; Israeli school SEL documents beyond `SEL.md` 1.4. The design relies on practice consensus there, and says so.
