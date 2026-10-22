# Nagmon design ideas: making the game more fun, interesting and dynamic

Status: design analysis (docs only, no code). Date: 2026-10-22. Branch `app/design-ideas`. English; the game stays Hebrew (RTL).
Goal from the parent: keep looking at similar games and ask how Nagmon can be more fun, more interesting and more dynamic, in the spirit of Pokemon, while every system teaches. This file is a living idea bank: add rows, re-score, move to "Planned" when a spec adopts one.

How this relates to existing docs (read first): `FEATURES.md` and `TRIPS.md` (branches `app/features-spec`, `app/trips-spec`), `BATTLE_V3.md`, `INDEPENDENCE.md`, `SEL.md`, `QUESTION_AUDIT.md`. Many ideas below are already specified there; the Status column says so, so this file does not duplicate them, it ranks them and fills gaps.

## 0. Ground rules every idea must pass (from the existing specs)

1. A wrong answer never punishes; nothing is lost; no creature is "sad" because you were away.
2. Show, do not write: picture, sound, one short Hebrew line; read-aloud for non-readers.
3. Offline first; nothing about a child leaves the phone without parent consent; no family details in the public repo.
4. Questions follow the child (learning engine), never the zone or the creature level.
5. Modest and kind: long sleeves, no violence, creatures are calmed and befriended.
6. No dark patterns: no streak loss, no timed exclusives, no random-rarity rewards, no payments in the child area, no leaderboards between children. See section 6.
7. Every system carries a subject. A feature with no learning link is only allowed when it is pure delight (a wanderer, a sound) and cheap.

## 1. What exists today (so ideas land on real ground)

| Area | State (from the docs on this branch) |
|---|---|
| Battle V3 | S1 (one real turn, move choosing) built; S2 (50 moves, statuses) and S3 (see BATTLE_V3 12) in progress; juice and particle layer specified (section 10) |
| World | Hearthrock, Route 1, two academies; shop, Rest Center, home with chest and egg nest built; the world spec (zones, objects, NPC roles) is in progress |
| Learning | 77 generators, per-skill Elo, SRS, selector; question audit done; Hebrew grade 3-9 content in progress |
| Family | profiles, PIN, parents' area, consented upload, Shabbat calendar module, surprise celebrations |
| Art/audio | own creatures (70), 6 inherited music tracks, 15 inherited sound effects; own art is image-generated |

## 2. Research: what similar games do and what it teaches us

Method: web search (summaries only; most primary pages could not be fetched from the sandbox, so numbers marked "soft" come from blogs or search snippets). Source list in section 8.

| Game or topic | What drives return and delight | Lesson for Nagmon | Trap |
|---|---|---|---|
| Pokemon main series (and Legends Arceus) | Pokedex completion, a visible next goal, a partner that follows you; Arceus research tasks (each species has many tasks, any 10 points count) | Closed Book with hints; flexible per-creature tasks (P7); partner follows you (C8) | Research tasks feel tedious if all are required (reviews) |
| Pokemon-Amie / Let's Go partner play | Petting and feeding raise affection; players call it a favourite low-pressure feature | Hearts and a home meadow (C1); bond gives small help, never punishment | None if affection never falls |
| Pokemon Sleep | A weekly cycle (a new big friend each Monday), a Pokedex organised by a different axis, shared friends | Story visitors by progress (W9); alternative Book views by habitat or subject | Sleep-tied variable rewards and a weekly reset are a retention hook; ours must not expire (soft source) |
| Pokemon GO | Community days, raids, buddy hearts | Shared events are fun | Timed windows create FOMO and fan complaints (community commentary); avoid |
| Temtem | Luma (shiny) variants with real stat value | A shimmer variant is a good goal | Rates quoted 1 in 4,000 to 1 in 10,000 and a patch raised the grind; random rarity is a gambling-shaped loop: ours is deterministic |
| Cassette Beasts | Fusion of two monsters; 120 base monsters give 14,400 fusions via mix-and-match parts | Our "fusion-free" answer: parts-based creature lab (CR5) and branching evolution (C5) | Art budget; keep a closed set |
| Monster Sanctuary | Monster abilities are the keys to the map; eggs hatch from menu | Field abilities (W11), hidden places (W7), eggs without nets | Light story and uneven world design were criticised: keep the world authored |
| Yo-kai Watch / Digimon | Befriending with favourite food; medals as friendship tokens; evolution variety (Digimon care-mistake raising is old and punishing) | A favourite-food gift, creature identity (C2); never copy care mistakes | Punishing care (explicitly rejected in FEATURES 4.9) |
| Stardew Valley / Palia (life sim) | Light friction and planning; systems that feed each other; festivals, letters and rebuilding a community; NPC routines | Festival day (W5), NPC schedules (W3), museum (P9), seasons by play (W4), mail (S3) | Energy bars as friction: our "energy" must stay a gentle pause |
| Prodigy Math | Pets, spells, a story; kids love it | Keep a story and creatures | 2021 FTC complaint by child advocates: members get items even in class ("two classes of students"), kids pushed to ask parents for a $59 to $120 membership; company disputes it. No payments in the child space, no member-only items |
| Duolingo | Streaks, leagues; one soft figure says a 7-day streak makes users 3.6x more likely to finish (no method given) | Habit hook with a weekly garden, never loss | Parent guides and articles describe streak anxiety; ICO children's code treats streaks and reward loops as nudge techniques; no peer-reviewed child study found |
| Khan Academy Kids / Lingokids / Reading Eggs | A predictable path with collectible characters (Reading Eggs), variety and badges (Lingokids), free broad curriculum (Khan Kids) | A clear map and a predictable loop for 5-7; variety of mini-games | Too flashy and the game outshines the learning (one review) |
| Mathletics | Points, avatar items, teacher certificates | Certificates for parents (T1) and avatar items from subject stars (CR1) | Points-for-avatar is an extrinsic loop: keep rewards informational |
| Toca Boca / Minecraft Education | Open-ended play; Minecraft used with a self-determination (competence, autonomy, relatedness) framing in studies | Creativity set CR1-CR5; sandbox needs a goal for competence (a study noted this), so give a brief | Open play alone does not teach: add a task card |
| Juice and game feel | Hit-stop, shake, particles, sound, popups; keep them proportional and keep controls responsive | J1-J5 | Juice can drown the question and the audio cues (soft sources) |
| Motivation theory | Autonomy, competence, relatedness (SDT) predict fun; the overjustification effect (Lepper 1973) shows tangible rewards can reduce interest in an activity a child already likes, mainly when expected and contingent | Reward with surprise, story and access, not a coin per right answer; offer choice | A coin per answer on subjects the child loves can backfire (a 2022 study found the effect only for high-interest games) |

## 3. The idea bank (56 ideas)

Columns: Eff S/M/L (S 1-2 days, M 3-6, L 1-2 weeks of one agent, as in FEATURES). Risk L/M/H with the reason. Ages: the band it suits (5-7, 8-10, 11-14). 6y and 13y: impact 1-5 for a 6-year-old and a 13-year-old. Score = 6y + 13y - Eff (S 0, M 1, L 2) - Risk (L 0, M 1, H 2) + Trust bonus (parent-trust or safety foundations: T1 and T2 +2, T3 +2, W12, S2, S3 +1). Status: "Planned" means a spec already has it; "New" means it is not in any doc on this branch.

### World dynamism

| ID | Idea | What it is and why it works | Fit with Nagmon (subject, kind) | Eff | Risk | Ages | 6y | 13y | Score | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| W1 | Day/night and weather | Map tint and sound follow the phone clock; some creatures and NPCs appear only at dusk or in rain. Pokemon day/night and Stardew rhythm make a known place feel alive. A campfire skips the time, so nothing is ever missed. | Science (moon phase, weather facts, the sun); Book hints say "seen at night" | M | L: never gate by real time; campfire skips | all | 3 | 3 | 5 | Planned later (TRIPS/FEATURES "day/night") |
| W3 | Schedules and wandering NPCs | The baker is at the market in the morning, the cadet walks a route, a kid asks a new thing each visit. NPCs with routines are the Stardew core; the child learns to look for people. NPC memory is already specified. | Each NPC carries a subject question; routes are data in map YAML | M | L: keep routes short, no "missed" lines | all | 3 | 3 | 5 | Partly planned (FEATURES 5.1 memory) |
| W4 | Seasons that advance with play, not the calendar | Leaves, snow, spring flowers change the zones and a few creature variants. Every 12 play-days the season turns. Gives a reason to revisit and a sense of time passing (Stardew seasons). | Science (seasons, plant cycles); Hebrew season words | S | L: calendar seasons would make content expire, so no | all | 3 | 2 | 5 | New |
| W5 | Fair day (in-game festival) | A town festival that opens after a story step: a stall row of 4 mini-games, a parade of your creatures, a small prize each. Stardew festivals are the emotional high point of a season. | Every stall is one subject mini-game (see M-ideas); parade = creature collection | M | L: a fair is always open once unlocked, never a timer | all | 4 | 3 | 6 | New |
| W6 | Optional Jewish-calendar pack (parent toggle, off by default) | Light, content-neutral hooks: apple-and-honey berry in autumn, a build-a-sukkah room task (geometry), counting lights (ordinals and addition), a Purim costume parade for creatures (modest outfits), spring-cleaning "search for the hidden crumb" riddle, Tu BiShvat tree planting (plant science). The app already has a Shabbat calendar. | Science, geometry, Hebrew; uses the existing calendar module; no religious claims inside questions | M | M: tone and correctness: the parent reviews text; never required | 5-12 | 3 | 3 | 4 | New (calendar exists, M8) |
| W7 | Hidden places and secret doors | Sparkle on an odd tile, a waterfall to walk behind, a cave that needs a creature ability. Legends Arceus and Monster Sanctuary both lean on "I wonder what is over there". Curiosity is the strongest non-pressure motive. | One fact plus one question per secret; fills a "discoveries" page | S | L: none; always hinted in the Book | all | 4 | 4 | 8 | Planned (FEATURES 5.3 hidden spot) - ship early |
| W8 | Sticker, fossil and shell albums | Small collectible sets per zone (8 stickers, 6 fossils) found in grass, chests, digs; each has a real fact. Set completion is the cheapest "one more" loop and is closed (no random rarity). | Science facts; Hebrew word on each sticker | S | L: closed sets only; show where to find the last one | 5-11 | 3 | 3 | 6 | New (stars exist in FEATURES 5.3) |
| W9 | Story visitors (a traveling merchant or comet that stays until seen) | A visitor arrives when the child reaches a story point and stays until met. Pokemon Sleep proves a weekly arrival works; we trigger it by progress, not by the clock. | Visitor sells one subject recipe or tells a fact; comet = astronomy | M | M: becomes FOMO if it ever leaves on a timer | all | 3 | 3 | 4 | New |
| W11 | Creature abilities as field keys (swim, fly, light, break rock) | Creature subject decides the ability and the child sees locked places early. Monster Sanctuary is built on this. Gives every creature a use outside battle. | Water = swim, sky = fly; unlocked by a small subject test (already in TRIPS 7.1) | L | L: needs map design discipline | all | 4 | 4 | 6 | Planned (TRIPS 7.1) |
| W12 | Episodes with a "where you were" recap | Each chapter is an episode with a 10-second recap card on return; after a gap of weeks the owl says welcome back with one line of what is next. Removes the guilt of returning and helps small children remember the story. | Owl line plus map pin; no stats about days away | S | L: never say "you missed" | all | 3 | 3 | 7 | New |

### Creature life

| ID | Idea | What it is and why it works | Fit with Nagmon (subject, kind) | Eff | Risk | Ages | 6y | 13y | Score | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| C1 | Habitat meadow at home | Creatures wander on a home meadow with their own biome patch (pond, rocks, flowers); tapping makes a heart and a sound. Pokemon-Amie, Pokemon Camp and Palia homes show the "cozy sink" players keep. | Habitat per creature element is a science fact; placing decor = area/grid for older kids | M | L: no hunger or sickness, ever | 5-10 | 4 | 3 | 6 | Partly planned (home meadow, hearts 4.9) |
| C2 | Personalities and moods | Each creature has one of ~6 personalities (curious, shy, bold, sleepy, silly, careful) that colours its lines, emotes and favourite berry; moods are named with feeling words. Pokemon natures and Yo-kai tribes give each creature an identity. | SEL feeling vocabulary (SEL.md); personality may map to the subject move it loves | M | L: avoid stereotypes (no "lazy" label); moods never drop | 5-12 | 4 | 3 | 6 | New (SEL link) |
| C4 | Egg incubator: the child picks the subject that warms it | Warm an egg with questions of a subject you choose; the egg pattern shows the zone family. Monster Sanctuary and Pokemon use eggs as a patient reward. Choosing the subject gives autonomy. | Egg from the zone pool (authored, not random); hatch ceremony shows a fact | S | L: pool is visible, no random species | 5-10 | 4 | 2 | 6 | Partly built (eggs in FEATURES_STATUS) |
| C5 | Branching evolution by the subject you train | Same base, two or three forms; the form follows which subject earned the most Know-how, previewed in the Book. Gives "fusion-free" depth (Cassette Beasts and Digimon show how much players love form variety) with no random roll. | Math-trained and logic-trained forms differ; the child decides by what it studies | L | L: 2x art; fix the preview so nobody is surprised | 8-14 | 4 | 5 | 7 | New (BATTLE_V3 7 has gates only) |
| C6 | Creature jobs in town (no timers) | A water creature waters the gardener's plot, a bright creature lights the lighthouse; the NPC thanks you and gives a daily item. Gives creatures a place outside battle. Completed by one question, never by waiting. | NPC problem in the creature's subject (the gardener needs 3 x 4 pots) | M | M: idle-timer reward loops are the trap, so none | 6-12 | 3 | 3 | 4 | New |
| C8 | Follower creature on the map | Your partner walks behind you, reacts to rain and doors, and says its cry when tapped (Pokemon HGSS, Let's Go). Biggest bond-per-effort in the genre. | Partner element hints at the current zone's subject; tap = one fun fact | M | L: needs a 4-direction walk sheet per creature | all | 5 | 3 | 7 | New |
| C10 | Photo mode and photo journal | An in-game camera: frame a wild creature in its habitat to fill a Book page (Pokemon Snap idea). Teaches observation. Photos stay local; parent can export with consent. | Science: habitat and behaviour facts; the question asks what the child saw | M | L: no real camera, no faces | 6-14 | 4 | 3 | 6 | New |

### Progression

| ID | Idea | What it is and why it works | Fit with Nagmon (subject, kind) | Eff | Risk | Ages | 6y | 13y | Score | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | Explorer ranks (Cadet to Navigator) | A personal title from total mastery stars across subjects, shown on the card. Gives a long ladder to climb that is about you, not others. | Mastery stars from the learning engine | S | L: never shown to others; no loss of rank | 8-14 | 3 | 3 | 6 | New |
| P2 | Mastery map (skills as stars or a fogged map) | Each subject is a garden or constellation; every mastered skill lights a spot and the fog clears. Shows the child their own progress; the dashboard data already exists. | Direct from learning engine skill ids; parents see the same picture | M | L: dashboard accuracy must match; no percent shown to age 5-7 | 8-14 | 3 | 4 | 6 | Partly planned (fog story, dashboard) |
| P3 | Quest journal (3 active cards, pin on map) | Kindness, story, collection, subject-week cards with "show me". Legends Arceus research and Pokemon story beats give a next thing to do. | Subject-week quests are parent-approved | M | L: none; never timed | all | 4 | 3 | 6 | Planned (FEATURES 4.13) |
| P5 | Effort medals (asked for help, came back after a break, tried a hard one) | 30-40 medals for behaviours not speed. Praises process, which is what research on growth mindset asks for (from memory). | Reason line on each; parent dashboard lists them | M | L: keep them rare enough to mean something | all | 3 | 3 | 5 | Planned (FEATURES 4.14) |
| P6 | Expert trials (optional stretch fights, no loss) | Opt-in harder questions with a mastery stamp, not a bigger prize. Gives 11-14 a reason to push without a timer or a penalty. | Stretch skills one grade up; owl explains misses | M | L: do not auto-enable; no pressure copy | 11-14 | 1 | 4 | 4 | New |
| P7 | Creature research tasks (Legends Arceus style) | Each creature has ~8 small tasks (see it at night, feed its favourite, win with a stretch question); any 10 points fill its page. Reviewers praise the "tick a box" loop and the many ways to complete it, and also call it tedious when it is forced. | Tasks mix play and subject questions; tasks are optional and flexible | M | M: tedium if every task is required; need only 10 points | 8-14 | 3 | 4 | 5 | New |
| P9 | Town museum (Stardew-style donations) | Donate fossils, stickers, facts and photos to a museum room that fills visually. Collection with a place to show it, and a reason to learn what each item is. | Science, history facts; each donation = 1 recall question | M | L: none; closed sets | 8-14 | 3 | 4 | 6 | New |

### Social and family

| ID | Idea | What it is and why it works | Fit with Nagmon (subject, kind) | Eff | Risk | Ages | 6y | 13y | Score | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | Two kids, one phone: duo battle | Two profiles take turns; each answers questions at their own level; Pep is shared so a 6-year-old and a 12-year-old can win together. Co-op, not versus. | Each child's own skill engine; moves chosen jointly | M | M: older child may take over: strict alternation | all | 5 | 3 | 6 | New |
| S2 | Parent-child quest of the week | One real-world task shared by parent and child (measure the table, bake, find 3 shapes at home). The game gives a stamp and a story line. Fits parent-trust and the existing surprise celebrations. | Math, science, Hebrew at home; parent confirms in the parents' area | S | L: must stay optional and tiny, parent time is scarce | 5-10 | 4 | 2 | 7 | New |
| S3 | Grandparent mail | The parent types, or pastes, a short message or a photo from a grandparent into the parents' area; it arrives in the in-game mailbox once. Remote delivery is later. High emotional value, no new data leaves the phone. | Postal clerk NPC (FEATURES 5.1); the card can hold one question for the child to answer back | S | M: privacy: local only first; real sending needs consent design | 5-12 | 5 | 2 | 7 | New (mailbox planned) |
| S4 | Sibling gifts (no trade) | A profile can gift a duplicate friend or berry to a sibling on the same phone. Shows kindness; no prices, no trade ladder. | Kindness quest medal | M | M: older child can extract from younger: parent switch, gifts only | 6-12 | 3 | 3 | 4 | New |
| S5 | Mentor mode for older children | An older child picks a creature or a skill and "teaches" a younger sibling's creature, choosing the hint and reading the explanation. Learning by teaching is a well-known effect (teachable agents, from memory). | Weak-skill review for the mentor in disguise | M | M: keep it voluntary; never assign to the child | 10-14 | 2 | 4 | 4 | New (teachable agent in FEATURES 5.2) |
| S6 | Family garden (shared goal, no ranking) | One garden grows with everyone's effort in the family; flowers, no names. A cooperative meter, not a leaderboard. | Hide switch in parents' area | M | M: becomes comparison if shown per child | all | 3 | 2 | 3 | New (weekly garden planned) |

### Parent trust

| ID | Idea | What it is and why it works | Fit with Nagmon (subject, kind) | Eff | Risk | Ages | 6y | 13y | Score | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| T1 | Proud-moments digest for parents | A weekly page of 3 plain sentences ("Noa mastered fractions up to quarters, asked for a hint 4 times - good") plus a conversation starter, instead of a table of numbers. | Built from existing dashboard data and medals | S | L: keep wording non-judging | parent | 1 | 1 | 4 | New (dashboard exists) |
| T2 | Honest-design charter in the parents' area | One page, written once: no ads, no purchases in the child area, no streak loss, no timers, no data leaves the phone. Builds trust and keeps future us honest. | Links to the rules in FEATURES | S | L: must stay true | parent | 1 | 1 | 4 | New |
| T3 | Wind-down and break checkpoints | At the parent's time limit creatures "go to bed" with a calm scene and a lullaby; after 20 minutes the owl suggests water and a stretch. The ICO games tips ask for checkpoints and break prompts. | Screen-time guard already exists (M8) | S | L: never block mid-battle; finish the fight | all | 2 | 2 | 6 | Planned (M8 screen time) |
| O1 | Real-world stamp cards (read 10 pages, go outside) | Parent confirms a real-world activity; the child gets a stamp and a small story. No coins, to avoid paying for chores. | Hebrew reading time; science walk | S | M: overjustification: tangible rewards can reduce interest, so story only | 5-12 | 3 | 2 | 4 | New |

### Creativity

| ID | Idea | What it is and why it works | Fit with Nagmon (subject, kind) | Eff | Risk | Ages | 6y | 13y | Score | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| CR1 | Hero designer (modest outfits, hair, colours) | A mirror at home with hats, scarves, long sleeves and skirts, all earned. Avatars already exist in the shell; this makes you feel it is "me". | Modesty rules in SDD_MODESTY; costumes unlocked by subject stars | M | L: art volume; all long sleeves | all | 4 | 4 | 7 | Partly planned (cosmetics 4.9) |
| CR2 | Room and meadow decorating | Drag wallpaper, rug, shelf, plants onto a grid; area counts for older kids ("fit a 2x3 rug"). Toca Boca and Stardew show that rearranging a home is endless play. | Geometry (area, symmetry) as a build constraint | M | L: keep placement simple for age 5 | 5-12 | 4 | 3 | 6 | Planned later (decor) |
| CR3 | Name everything | Name creatures (planned), the trip ship, the museum, the town cat. Names stay on the phone. | Letter board practice (Hebrew letters) | S | L: no names in uploads (existing rule) | 5-10 | 4 | 3 | 7 | Planned (FEATURES 4.10) |
| CR4 | Sketchbook | A finger-draw pad for stickers and postcards that decorate the room or go in grandparent mail. Pure creativity; local only. | Symmetry draw mode for older kids | M | L: no sharing outside the phone | all | 4 | 3 | 6 | New |
| CR5 | Creature lab (parts, colours, patterns) | Pick body, colour, pattern from the game's own art kit to design an imaginary friend that lives in a book, with a subject and a habitat. Cassette Beasts shows that mixing parts delights, with no random rolls. | Picking its subject and habitat is a mini-lesson; no battle stats | M | M: art kit cost, and balance if it ever fights | 6-12 | 4 | 4 | 6 | New |

### Subject mini-games

| ID | Idea | What it is and why it works | Fit with Nagmon (subject, kind) | Eff | Risk | Ages | 6y | 13y | Score | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| M1 | Fishing = measuring and comparing | Cast with a timing bar, then the fish is a number problem: compare lengths in cm, read a scale, add the catch of the day. Fishing exists in Tuxemon and as a planned "answer fishing". | Math: measurement, decimals for older kids | M | L: keep the timing bar optional (motor skill) | 6-12 | 4 | 3 | 6 | Planned later (FEATURES 5.3) |
| M2 | Cooking = fractions and ratios | Recipe cards: halve for 2, triple for 6, 1/4 cup; a creature loves a dish. Feeds hearts. Fractions are the classic 8-12 stumbling point. | Math: fractions, ratios, units; creature taste preferences already in the DB | M | L: add a "taste test" funny result for wrong amounts | 8-13 | 3 | 4 | 6 | New |
| M3 | Bridge building = geometry and structure | Place beams and triangles so a creature crosses a gap; length and angle given. Cheap physics intuition and a satisfying "it holds". | Geometry: shapes, angles, perimeter | L | L: physics tuning is real work | 9-14 | 3 | 4 | 5 | New |
| M4 | Music maker = patterns and rhythm | Echo a creature's song (pattern), then build a bar in 4/4 with note lengths as fractions. Rhythm games teach sequence and fractions. | Math patterns, fractions; logic sequences | M | L: sound licensing for samples | 5-12 | 4 | 3 | 6 | New |
| M5 | Library puzzles = Hebrew | Letter jigsaws, nikud (vowel) match, root-family word webs, word ladders, a crossword for 11+. Built on the Hebrew 3-9 content now in progress. | Hebrew: letters, nikud, roots (shoresh), gender and number; kid-friendly wordplay | M | L: content correctness; audio for 5-6 year olds | 5-14 | 4 | 4 | 7 | New |
| M6 | Run a stall | Take orders, count change, set prices, track a week's profit. The shop already makes the child a buyer; this flips it. | Math: money, percent, simple graphs | M | L: no real money talk | 9-14 | 2 | 4 | 5 | New (shop built) |
| M7 | Garden = plant science and ratios | Seeds grow with right answers (not real time), different needs for water and light, a harvest for creatures. | Science: plant cycles, variables | M | L: no real-time growth | 6-12 | 3 | 3 | 5 | New (berry bush planned) |
| M8 | Treasure map = coordinates and directions | A map with a grid (or compass words); dig where X marks. Hebrew directions for young kids, (x,y) for older. | Math/geometry; Hebrew direction words | S | L: none | 6-14 | 3 | 4 | 7 | New (lost kid planned) |
| M10 | Clock tower repair | Set hands, read time, add minutes; creatures live by the town clock. Reading clocks is a grade 1-3 pain point. | Math: time | S | L: none | 5-9 | 4 | 1 | 5 | New |

### Challenges

| ID | Idea | What it is and why it works | Fit with Nagmon (subject, kind) | Eff | Risk | Ages | 6y | 13y | Score | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| CH1 | Boss riddles | Zone guardians ask a 3-step riddle chained across skills, with a hint ladder, and riddles join a collection. Hebrew word-play riddles are a native fit. Gym puzzles (Pokemon) and sphinx riddles show that "think" is a fun beat. | One subject per riddle step; ladder: hint, simpler step, show | M | L: keep a free skip with an explanation | 8-14 | 3 | 5 | 7 | New |
| CH3 | Personal-best speed round (opt-in) | Race your own ghost in a 60-second round; personal best only. Older kids like to beat their last run. | Fluency practice; a parent can hide it | S | M: timers cause anxiety; off for under 9 | 9-14 | 1 | 4 | 4 | New (timer age 9+ planned) |
| CH4 | Trial rooms before a guardian | Small puzzle rooms (plates, patterns, balances) using the room's subject; they unlock the shortcut to the guardian. Pokemon gyms and Zelda dungeons use the same pacing. | Locks use numbers, shapes, letters by grade | M | L: keep each under 3 minutes | all | 3 | 4 | 6 | Partly planned (lock door) |

### Feedback and juice

| ID | Idea | What it is and why it works | Fit with Nagmon (subject, kind) | Eff | Risk | Ages | 6y | 13y | Score | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| J1 | Layered adaptive music | Same tune with layers: base on the map, +drums in battle, +melody on a right-answer chain, calm pad on a miss. Pokemon and Cassette Beasts use this feel; never a sad sound for a wrong answer. | Music is one of the 6 inherited tracks now; replace with our own loops | M | L: licensing and file size | all | 4 | 4 | 7 | New |
| J2 | Haptics | Short vibration for a tap, a tick on a right answer, a swell on evolution (Android vibrate); a setting turns it off. | Part of reduce-motion setting | S | L: not supported on every device | all | 3 | 2 | 5 | New |
| J3 | Celebration scale: particles, hit-stop, camera | Three sizes: small (sparkle), medium (level up), big (evolution); a brief hit-stop and zoom on the move; the canvas particle layer is already specified. Juice research says keep it proportional to the action and keep controls responsive. | Pure presentation; reduce-motion switch | S | L: too much juice hides the question; test with a 6-year-old | all | 4 | 4 | 8 | Planned (BATTLE_V3 10) - extend to the map |
| J4 | Creature cries and read-aloud everywhere | Each creature gets a half-second voice and its Hebrew name spoken when tapped; read-aloud for every card. Cries are the sound of Pokemon. For a 5-year-old who cannot read, voice is the interface. | Hebrew TTS M11 (planned); audio generator for cries | M | L: TTS quality and size; parent volume | 5-9 | 5 | 3 | 7 | Planned read-aloud (M11); cries new |
| J5 | Answer chime ladder | A pitch that rises over a chain of right answers and resets softly, never harshly. Tiny cost, strong "I am on a roll" feeling. | Audio only | S | L: keep it gentle | all | 3 | 3 | 6 | New |

## 4. Ranked top 15

The raw score favours cheap work. This ranking adds judgement: dependencies on what is built, and the biggest change for a 6-year-old and for a 13-year-old.

| # | Idea | Why this rank | 6y | 13y | Needs |
|---|---|---|---|---|---|
| 1 | J3 Celebration scale (particles, hit-stop, camera; + J2 haptics, J5 chime ladder) | Cheapest way to make S1-S3 battles feel good; already specified; works for both ages | 4 | 4 | S1 done, particle layer from BATTLE_V3 10 |
| 2 | C8 Follower partner on the map | Single strongest "this is a Pokemon-like game" feeling for a 6-year-old; also makes the world feel populated | 5 | 3 | walk sheets for the 70 creatures (start with starters) |
| 3 | J4 Creature cries + read-aloud | A non-reader can play alone; cries make creatures real | 5 | 3 | M11 TTS; cries from an audio generator |
| 4 | M5 Library puzzles (Hebrew) | Rides the Hebrew 3-9 content; fills the weakest "fun" subject with a game | 4 | 4 | Hebrew content in progress |
| 5 | W7 Hidden places + W8 albums | Curiosity loop at tiny cost, fits the world spec as data | 4 | 4 | world spec objects |
| 6 | CH1 Boss riddles | Gives 11-14 a "think" moment that is not a speed quiz; Hebrew riddles are native | 3 | 5 | guardian scripts (BATTLE_V3 5.6) |
| 7 | C5 Branching evolution by trained subject | Makes training choices matter; strongest long-term hook for 13y; no random roll | 4 | 5 | BATTLE_V3 7 gates built (S3), 2x art for chosen lines |
| 8 | CR1 Hero designer + CR3 naming | Ownership: "my hero, my names"; cheap and safe | 4 | 4 | cosmetics art; modesty review |
| 9 | P2 Mastery map | Lets a 13-year-old see real progress; parents see the same picture | 3 | 4 | learning dashboard data (exists) |
| 10 | C2 Personalities and moods | Identity per creature; carries SEL vocabulary | 4 | 3 | SEL slice 1 |
| 11 | S1 Duo battle (two kids, one phone) | Siblings play together without level conflict | 5 | 3 | S2/S3 move set, two profiles |
| 12 | W1 Day/night + weather (with W3 schedules) | Makes the world dynamic after the first zone exists | 3 | 3 | world spec; Phaser tint layer |
| 13 | M8 Treasure map (coordinates), then M2 cooking | One cheap mini-game per age band to prove the mini-game frame | 3 | 4 | object system |
| 14 | S3 Grandparent mail (+ S2 family quest) | The highest emotional value per effort; and builds parent trust | 5 | 2 | mailbox object, parents' area |
| 15 | J1 Layered music | Strong feel upgrade; needs licensed or generated loops | 4 | 4 | own music source (INDEPENDENCE row 12) |

Next ten if the above go well: W5 Fair day, C1 habitat meadow, P3 quest journal, P7 research tasks, P9 museum, M1 fishing, M4 music maker, C10 photo mode, CR5 creature lab, T3 wind-down.

### 4.1 Recommended order against what exists

| Phase | When | Ideas | Reason |
|---|---|---|---|
| A: feel | now, with BATTLE_V3 S2/S3 | J3 (with J2, J5), CR3 | no new systems; makes finished battle work feel better |
| B: world | with the world spec (zones, objects) | W7, W8, C8 (start with the starter), W3, W1, M8, W12, CH1 | all are data or small art on the object and NPC system |
| C: Hebrew and voice | with Hebrew 3-9 content and M11 | M5, J4 | content and TTS arrive together |
| D: depth | after S3 evolution is in | C5, P2, C2, CR1, S1 | need the battle and creature records stable |
| E: warmth | after D | S3, S2, T3, T1, J1 | family and polish; also parent-trust package |

### 4.2 What makes the biggest difference

| Child | Today the likely gap | Top moves |
|---|---|---|
| 6-year-old (cannot read well, plays with a thumb, loves animals) | Everything is text and quiz; creatures do not feel alive | C8 follower, J4 cries and voice, J3 juice, C1 meadow, M10 clocks, S3 mail from grandma, CR3 naming |
| 13-year-old (can feel the game is "for kids") | Battle questions are the only loop; little depth, nothing to master | CH1 riddles, C5 branching evolution, P2 mastery map, P6 expert trials, M2/M3 mini-games, P7 research tasks, S5 mentor mode (teaches a sibling) |

For the 13-year-old, also use the three-level detail rule from FEATURES 4.0: same systems, fewer cartoons, more numbers and choices. Avoid adding mini-games that look babyish; give them a build or a puzzle with real constraints.

## 5. Dynamism without pressure: design patterns

| Pattern | Do | Do not |
|---|---|---|
| Time | Clock-based looks (night, rain) with a campfire to skip; seasons that turn by play-days | Rewards that disappear when the clock moves |
| Events | A festival or visitor unlocked by story, always returns | Limited-time events, countdowns, "only today" |
| Rarity | Authored pools, visible hints in the Book, shimmer variants by mastery | Random odds, "1 in 4,000" hunts, loot boxes |
| Habit | Weekly garden, welcome back recap, stamp cards | Streak numbers, streak freeze, guilt lines |
| Social | Co-op on one phone, gifts, mail from family | Leaderboards, rankings between children, public chat |
| Care | Hearts only go up; the creature greets you the same after a month | Hunger, sadness or sickness from absence |
| Reward | Surprise, story, access, cosmetics earned by mastery | A coin on every right answer; paywalls |

## 6. The five riskiest dark-pattern traps (and the guard for each)

| # | Trap | Where it comes from | Where Nagmon could slip | Guard |
|---|---|---|---|---|
| 1 | Streaks and loss framing | Duolingo streaks; ICO lists streaks and reward loops as nudges | "Come back tomorrow", weekly garden that loses flowers, shop discounts that expire | No number of days; flowers never wither; parent can hide it; test copy for loss words |
| 2 | Timed exclusives (FOMO) | Pokemon GO events and community days | Seasonal creatures, a visiting merchant, a daily gift that "expires" | Seasons by play, visitors stay until met, every creature obtainable all year, daily gifts stack to one |
| 3 | Random-rarity rewards | Temtem Luma odds; loot boxes | Random eggs, random shiny, random chest contents | Authored pools, visible hints, deterministic shimmer by mastery |
| 4 | Upsell and two-tier children | Prodigy FTC complaint (2021): kids pushed to ask parents for premium; members get items | Any future paid pack, ads, "unlock the next zone" | No purchase screen in the child area ever; any paid thing lives in the parents' area and never gates learning or items |
| 5 | Guilt and comparison | Needy creatures (old Tamagotchi and Digimon care), leagues and leaderboards | Creature "misses you", ranks, sibling comparison on the dashboard, S1 duo where the older child dominates | Creatures greet the same after a month; ranks are personal (P1); duo alternates strictly; dashboards show one child at a time |

Also watch: over-rewarding (overjustification), sessions that run past the screen-time limit (finish the fight, then wind down), and too much juice hiding the question.

## 7. How to use this file

1. Pick an idea, copy its row into a spec (SDD with acceptance tests), and mark Status "Planned in <doc>".
2. Re-score after a play session with a 6-year-old and a 13-year-old; record what they did without prompting.
3. Add new rows from every new game or paper we look at (one line of source). Keep the five traps list current.
4. Update the storybook (`ARCH`/`PLAN` data) when an idea becomes code.

## 8. Sources (short)

Soft = blog, forum, press, vendor or search snippet only. The sandbox could not fetch most primary pages, so claims rest on search summaries.

- Pokemon Sleep weekly cycle and Dex by sleep type: pocketmonsters.net/Sleep, dittobase.com/games/pokemon-sleep (soft)
- Pokemon-Amie and Let's Go bonding: bulbagarden.net thread "pokemon-amie new bonding feature", supercheats.com Let's Go walkthrough (soft)
- Pokemon GO community day and FOMO: massivelyop.com "Massively on the go" 2022 to 2026 columns; sportskeeda Reddit summary (soft, community opinion)
- Pokemon Legends Arceus research tasks: Digital Trends, NME, Siliconera and looper.com reviews/explainers
- Temtem Luma odds: temtem.wiki.gg/wiki/Luma, pcgamesn.com/temtem/luma-rate, gamesradar.com/temtem-luma-shiny
- Cassette Beasts fusion: wiki.cassettebeasts.com/wiki/Fusion, cassettebeasts.com/2020/05/11/fusion, gamingonlinux.com (June 2022)
- Monster Sanctuary reviews: thesixthaxis.com, keengamer.com, siliconera.com
- Yo-kai Watch medals and befriending: Prima Games eGuide, yokaiwatch.fandom.com (soft)
- Stardew-style loops: summerengine.com and gametyrant.com articles (soft); Palia sources were thin
- Prodigy: axios.com "Kids' online math game criticized by watchdogs", edweek.org (Feb 2021), Fairplay prodigy page (search summary only; the page could not be fetched), Trustpilot reviews (anonymous, not evidence)
- Duolingo streaks: screenwiseapp.com parent guides, terms.law, uxmag.com (soft; no peer-reviewed child study found; the 3.6x figure has no method)
- UK ICO Children's Code and games top tips (Feb 2023): cy.ico.org.uk news, iapp.org, mishcon.com, harbottle.com; streak wording is from the 2019 draft consultation, final text not re-checked
- Reading Eggs, Lingokids, Khan Academy Kids: pastory.app comparisons, techpoint.africa review (soft; little on Khan Kids)
- Mathletics: Wikipedia and knowledgebase.mathletics.com (vendor), wiki.ubc.ca MET page; no critical studies found
- Self-determination in games and Minecraft: gamedeveloper.com "why do we really play", Temple University dissertation record (findings not seen)
- Overjustification: Lepper, Greene and Nisbett 1973 via octet.design and psychologynoteshq.com summaries; Springer s12144-022-02905-6 (2022 study); Bear et al. 2017 and Cameron and Pierce 1994 named but not read
- Game feel: eastondev.com, wayline.io articles; GDC 2012 "Juice It or Lose It" (soft)
- Not researched for lack of results: Digimon World care mechanics, Toca Boca specifics, Palia design. Items drawn from memory are marked "from memory" in the table.
