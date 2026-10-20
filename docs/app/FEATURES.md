# Nagmon app: features, gaps and deepened gameplay design

Status: design proposal (docs only). Date: 2026-10-20. Branch `app/features-spec`.
Nothing here is in the code yet unless a table says "exists". The parent's complaint is right: the new app has a map, a quiz and (on `app/engine`) a first battle, but almost none of the game around them.

**Rules every feature must follow** (from `docs/kids/GAME_PLAN.md` section 3 and `docs/app/SDD.md`):
1. A wrong answer never punishes: nothing is lost, no creature faints, no coins are taken. "Tired creatures rest at the Rest Center" is allowed as a gentle pacing story, never as a penalty.
2. Show, do not write: icon, picture, color and animation first; at most one short Hebrew line. Read-aloud later (M11).
3. Hebrew RTL. Landscape phone, 873x393 CSS px (2400x1080 at DPR 2.75), one hand: thumbs reach the left and right edges. Touch target at least 13% of height (about 51 px), real `<button>`s, action on pointer-up (`Tap`), `ScreenTime` guard on every new screen.
4. Ages 5-14 in one app: the same screen shows more detail with age/grade (see 4.0), and the question level is per subject (learning engine), never the same for every subject.
5. Everything works offline. Nothing about a child leaves the phone without the parent's consent. No family details in the public repo; nicknames and names are never uploaded.
6. Questions follow the child (learning engine), not the creature level or the zone.

---

## 1. What the base game (Tuxemon) has

Read from `tuxemon/` and `mods/tuxemon/` (counts measured on this branch).

| Area | What exists (code) |
|---|---|
| Pause menu | `world/manager.py`, `world/menu_flags.py`: Monsters (party), Bag, Player (card), Save, Load, Missions; NuPhone apps (map, contacts, radio, banking, tuxepedia, renaming) added by items (`app_*`). Presets `full`/`minimal`/`raw`. Journal and Calendar states exist. |
| Bag | `states/item_menu.py`, `item/filter.py`, `item/sorter.py`: 230 item records. Categories (db): capture 28, none 80, food 26, technique 27, morph 19, elements 13, stats 11, potion 7, phone 7, badge 5, fish 3, destroy 2, fossil 2. `sort` is `potion` or `utility`. Each item has `usable_in` (combat menu and/or world), `conditions`, `effects`, `behaviors` (consumable, throwable, resellable), `cost`. |
| Items | Potion (heal 50, price 20 in the shop economy), revive (100), tuxeball (capture, 50), 28 capture devices (element/gender/time-of-day balls with modifiers in `mods/capture_devices.yaml`), food that sets taste preference, stat boosters, technique tapes, morph (evolution) items, key items (`earthmover_key`, `escape_key`, `fishing_rod`), badges. |
| Shops | `db/economy/*.yaml` (items, monsters, `resale_multiplier` 0.5), `states/shop_item.py`, `shop_monster.py`, `shop_training.py`, `shop_healing.py` (paid healing: `base_healing_cost` 5 per HP, revive costs more), price and routing policies, `open_shop`, `set_economy`. |
| Healing center | Interiors `healing_center.tmx`, `*_center.tmx` (nurse event: `set_monster_health` on the whole party, free) plus PC access. |
| Houses and interiors | 332 maps, hundreds of interiors (`player_house_*`, `*_house*.tmx`, `professor_lab.tmx`, hospitals, pet shop, art shop). Hearthrock itself has only teleports to the two academies and routes (`Teleport to Gym 1/2`, `Route1`, `Route8`). |
| Party | `states/party.py`: reorder, sort, bond display (`menu_bond_*`: despise, wary, along, adore), `PARTY_LIMIT` = 6. |
| Monster details | `states/monster_info.py`: name, level, XP, XP to next level, HP, armour, dodge, melee, ranged, speed, height, weight, tastes, capture info, gender. Moves screen (`monster_moves.py`, `technique_menu.py`: learn/forget). |
| Tuxepedia and journal | `journal_state.py`, `journal_info.py`: seen/caught list, details. |
| Save | 3 slots plus autosave (`save_and_load.py`). |
| Money | Wallet, banking phone app, bills, `modify_money`, `transfer_money`. |
| PC | `pc.py`, `pc_kennel.py` (boxes), `pc_locker.py` (item storage), daycare and breeding (`daycare.py`), `park.py`. |
| Missions | `mission.py`, `db/mission` (1 file), `set_mission`, variables. |
| Battle menu | `combat_menus.py`, `combat/menu_visibility.py`: wild: Fight / Monster (swap) / Item / Run. Trainer: Fight / Monster / Item / Forfeit. Fight shows techniques with power, accuracy, recharge. Item menu filters usable items and targets. |
| Capture | `core/effects/capture.py`, `mods/config_capture.yaml`: 4 shakes, formula from monster HP, catch rate and device modifiers. |
| XP and levels | `combat/experience_strategies.py` (several methods, damage tracker), `level_up.py` summary, `level_range` 0-100, move learning by level, evolution state (`evolution.py`, conditions on level, items, variables). |
| Status effects | 35 (burn, poison, confused, faint, ...). |
| Elements | 13 types with multipliers 0.25 to 4 (`db/element`). |
| Battle AI | `ai_*.yaml`, `parties.yaml`, trainer battles, doubles, hordes. |
| World | Items on the ground (`add_item`, `random_item`), signs/boulders/statues (`sprites_obj`), day/night and weather (`celestial_cycles.yaml`, environment layers), fishing (`fishing.yaml`), crafting, trading, radio, email, phone calls, calendar, teleporter, minigame ("who is that monster"), cipher text, NPC patrol/wander, cinema mode. |

### What the Nagmon fork already changed (`nagmon/`, `mods/nagmon/`, `docs/kids/*`)
- Quiz before an attack (x1.5 right, x2 fast, combo super move, always hit on a right answer, "normal attack" skip), knowledge seal for capture (x1.6, chain of 3 for rare creatures), no penalty for errors.
- Learning engine (Elo per skill, SRS, selector 70/20/10, 77 generators, worked examples), subjects mapped from creature elements (`mods/nagmon/learning/subjects.yaml`).
- Profiles per child, parents' area, screen time, calendar (Shabbat), surprise celebrations, daily reward caps (3 per person per day), kindness quests (kitten, wallet), two academies (boss test, badge), owl intro with a starter choice and a gift of 5 nets and 3 potions.
- Faint is neutralised: `set_teleport_faint` sends a child to the owl, who heals. Statuses, trainer AI and the paid healing shop are not used.
- Still the Tuxemon desktop menus for bag, party, tuxepedia (not touch-friendly, English layout, tiny text): that is why the new app rewrites them.

---

## 2. What the new app has (`app/`, branches `app/quiz`, `app/engine`, `app/trips-spec`)

| Piece | State |
|---|---|
| Shell: who-plays, PIN, profiles, avatars, parents' area, GitHub upload with consent, log/crash report | Exists (M0-M2). |
| Map: Hearthrock + Route 1 + two academies as Tiled JSON, d-pad, pause menu (resume / back to who-plays), doors to academies, closed house doors (`app/closed-doors`), adaptive resolution | Exists (M3). |
| Learning core in TS: 77 generators, Elo, SRS, selector, dashboard data | Exists (`app/learning`, loaded with the map). |
| Dialog, "talk" button, quiz screen (choice cards, number pad, hint, "don't know", gentle feedback), event interpreter, cashier (20 coins, 3 a day), coins in the corner | `app/quiz` (M4), built, not merged to `nagmon-app`. |
| Placement quiz by the owl, 3-creature starter choice, `Creature{species,level,xp}`, growth points (1 per right answer, 2 if fast; `needFor(level)=3+floor(level/2)`; max level 50; evolve at about a third of the old level, min 6), seen/caught sets, bestiary counts, `Battle` core (wild creature "fog" HP `18+3*level`, damage `(3+partnerLevel)*mult`, win = the creature joins, "run" loses nothing), encounter areas, field log | `app/engine` (M5 in progress, another agent; not touched here). No battle screen and no menus yet. |
| Items DB in the app: 6 records (2 badges, potion, tuxeball, 2 berries). Monsters 41, techniques 126, elements 13 | Data only. |
| Trips plan (`app/trips-spec`, `docs/app/TRIPS.md`): field-trip chapters, trip engine and open world (M6), first trip = solar system (M7), creature abilities (swim, fly), discoveries, badges, paid fast travel, "level by child" per subject | Plan. |
| Not planned anywhere yet | Bag, shop, houses' insides, party/friends screen, creature details, bestiary screen, level-up/evolution screens, care, quests log, achievements, daily goals UI, settings, parent dashboard UI, NPC roles and world objects (this document). |

---

## 3. Gap table

Legend: **Tux** = Tuxemon, **Old** = Nagmon on Tuxemon, **New** = the app today (incl. `app/engine`). Action: **Build** (new design here), **Adapt** (take the idea, change the rules), **Drop**.

| # | Feature | Tux | Old | New | What to do |
|---|---|---|---|---|---|
| 1 | Main menu with icons | Text list | Same, desktop | Pause: resume / who-plays only | **Build** "Backpack" hub: 6 big icons (Friends, Bag, Book, Quests, Me, Settings); save is automatic |
| 2 | Bag with categories | 13 db categories, sorter | Same | 6 item records, no UI | **Build** 5 tabs: Nets, Snacks, Helpers, Tonics, Keys (4.2) |
| 3 | Use items outside battle | Potion, food, morph | Same | None | **Build** (snack, tonic, egg warmer, key) |
| 4 | Use items in battle | Item menu | Same, nets | None (win = auto-join) | **Build** Net, Helpers (4.5) |
| 5 | Shops with prices | Economy YAML, resale | Cashier only gives coins | Coins have no use | **Build** shop interior, buying is a small math moment (4.3) |
| 6 | Capture balls bought and thrown | Tuxeball + 28 devices | Net + knowledge seal | None | **Adapt** Net + seal question, ball kept on a miss (4.5) |
| 7 | Healing center | Free heal | Owl heals | None (no HP) | **Adapt** Rest Center: rest, party desk, daily gift (4.4) |
| 8 | Houses with interiors | Hundreds | Closed doors | 5 doors walled up | **Build** every door opens, each with a reason (4.4) |
| 9 | Party and reorder | 6, reorder, sort | Same | `creatures[0]` = partner | **Build** Friends screen, party of 4 (4.7) |
| 10 | Creature details/stats | 6 stats, tastes | Same | None | **Adapt** 3 bars + hearts + skills; numbers for older kids (4.6) |
| 11 | Moves / skills | 274 techniques, learn/forget | Same | None in battle | **Adapt** skills tied to subjects, 4 roles (4.8) |
| 12 | Tuxepedia | Seen/caught list | Same | seen/caught sets, no UI | **Build** Book (bestiary) with facts and completion (4.11) |
| 13 | Levels and XP per creature | Damage-based XP, lv 0-100 | Same | Growth points, no screen | **Keep engine rule**, **Build** level-up card (4.6) |
| 14 | Child level / progress | None | Stars per subject (parent view) | Engine has per-subject Elo | **Build** "Me" card: subject rings, explorer rank (4.6) |
| 15 | Evolution | Level, items, variables | Level; learning variables | Engine rule, no screen | **Build** evolution scene with "later" button |
| 16 | Move learning | On level | Same | None | **Adapt** "new skill" card on level-up |
| 17 | Status effects (35) | Yes | Unused | None | **Drop** (punishing); keep 3 positive buffs as skill effects |
| 18 | Types / elements | 13, multipliers | Element = subject | Table copied, unused | **Adapt** element = subject; "super fit" x1.5 icon only |
| 19 | Battle AI | Yes | Unused | None (enemy never attacks) | **Drop**; enemies only react |
| 20 | Trainer battles | Yes | Friendly duels, boss tests | None | **Adapt** question duels and chapter bosses (5) |
| 21 | Items on the ground | `add_item` | Wallet quest | None | **Build** sparkles, chests, hidden spots (5) |
| 22 | NPC roles | Wander, trainers, nurse, shopkeeper | 5 residents in Hearthrock | Cashier only | **Build** role system (5) |
| 23 | Eggs, daycare, breeding | Yes | Unused | None | **Adapt** eggs found in the world (5), **Drop** breeding |
| 24 | Friendship/bond | `modify_monster_bond` | Unused | None | **Build** hearts, care (4.9) |
| 25 | Naming | `rename_monster` | Same | None | **Build** optional, `LetterBoard` (4.10) |
| 26 | PC boxes / storage | Kennel, locker | Same | list up to 60 | **Adapt** Meadow at home + Rest Center desk |
| 27 | Journal / missions | `mission.py` | Script quests | Variables only | **Build** Quests screen: 3 cards max (4.13) |
| 28 | Badges / achievements | Badge items | Academy badges | 2 badge items | **Build** Trophies (4.14) |
| 29 | Daily goal / streak | Phone/email hooks | Parent goals, 3/day caps | `core/family/goals.ts`, no UI | **Build** gentle weekly garden (4.12) |
| 30 | Options | Volume, keys, language | Same | Parents' area only | **Build** kid settings + parent pages (4.15, 4.16) |
| 31 | Parent dashboard | None | Python dashboard | Data in learning core, no UI | **Build** page (4.16) |
| 32 | Cosmetics | Flair, avatars | Avatars | Avatars at profile | **Build** wardrobe, creature accessories, home decor (4.9) |
| 33 | Day/night, weather | Yes | Yes | Not in the app | **Later**, tie to science (moon phase) |
| 34 | Fast travel | Teleporter | None | Trips plan: paid | **Later** (M6) |
| 35 | Fishing, crafting, trading, radio, email, phone, park, minigames | Yes | Fishing idea, phone challenge idea | None | Fishing/digging/star-gazing spots **Adapt** (5); radio, email, phone, crafting, park **Drop**; trading **Adapt** as "swap" with a collector NPC |
| 36 | Read aloud | No | TTS | M11 plan | Keep M11 |
| 37 | Tutors and lessons at institutes | None | Owl worked example only | Engine has worked examples, no lesson UI | **Build** tutor NPC per institute, lessons per skill, Notes in battle, coins and stamps (4.17) |

---

## 4. The deepened design

### 4.0 One app for ages 5-14: three detail levels
Chosen automatically from the profile grade (the parent can override): **A** (gan-grade 1: pictures and voice later, at most 3 choices, hearts and stars only, no numbers beyond counts), **B** (grades 2-5: short word labels, numbers on bars), **C** (grades 6-9: "details" pane with exact numbers, filters and sort). Same screens, same layout, only the amount of text and numbers changes. Source of age bands: UX guidance usually splits 3-5, 6-8, 9-12 (usertesting, uxmatters; see sources).

### 4.1 The Backpack hub (pause menu)
Tap the menu button (top). A full-screen hub with 6 big icon tiles in 2 rows of 3, plus "Continue". Tiles: Friends (creatures), Bag, Book (bestiary), Quests, Me (card), Settings. Badge dot on a tile when something new (a new item, a new entry). No Save tile: the game saves on every answer already (SDD 8.2). "Back to who-plays" moves under Settings. The hub pauses the map as today (`pause("menu")`).

### 4.2 Bag
**Layout (873x393).** A vertical rail of 5 tab icons on the start (right) edge, 56 px each. Middle: a grid of item cards, 4 columns x 2 rows visible, each card about 100x100 px, icon, "x3" count badge; swipe/scroll to page. End (left) panel 220 px: big icon, name, one-line effect with a tiny icon, and a big **Use** button. Tap a card selects it (detail appears); tap **Use** acts. Empty tabs show a friendly empty shelf and where to buy.

| Tab | Items | In battle | Outside battle |
|---|---|---|---|
| Nets | Magic Net, Silver Net, Star Net | Throw at a calm creature | Not usable |
| Snacks | Berries, biscuits, pie... (from `food` items) | Not usable (keeps battles simple) | Feed a friend: hearts and a small growth bonus |
| Helpers | Hint Feather, Clover (50/50), Owl's Pass, Safety Net | One per question, see 4.5 | Not usable |
| Tonics | Rest Tonic, Growth Tonic | Not usable | Rest Tonic wakes a sleepy friend (when energy exists); Growth Tonic doubles growth for the next 5 right answers |
| Keys | Badges, map, tickets, quest items, eggs in warmers | n/a | Auto-used at the right door or chest; shown as a collection |

Rules: no item can be lost or wasted by a wrong answer; consumed only on success (see nets). No selling (Tuxemon's resale 0.5 dropped: less math friction, nothing to regret). Stack limit 99. Items are fixed small set (about 20 for the first chapter), not 230.

### 4.3 Items, shops, prices and the coins economy
**Item catalog (first chapter).**

| Item | Effect (one line) | Price | Source |
|---|---|---|---|
| Magic Net | Catches a calm creature | 30 | Shop; owl gift of 5; chests |
| Silver Net | Seal chain needs one fewer answer; for rare creatures | 90 | Shop (after first academy badge), chests |
| Star Net | Never "slips" (guaranteed after the seal answers) | 200 | Academy rewards, big chests |
| Berry (per element, 6 kinds) | +1 heart; favourite kind +2 | 10 | Shop, gardener, bushes |
| Biscuit / Pie | +2 hearts, growth bonus | 25 / 60 | Shop, friends' houses |
| Hint Feather | The next question shows its first solution step | 15 | Shop, chests, daily chest |
| Clover (50/50) | Removes two wrong choices | 20 | Shop, chests |
| Owl's Pass | Swap this question for a new one (no penalty, no reward) | 15 | Shop, owl |
| Safety Net | In a boss test, one extra mistake allowed | 50 | Shop, achievements |
| Rest Tonic | Wakes a sleepy friend (later) | 25 | Shop, Rest Center gift |
| Growth Tonic | Growth x2 for 5 right answers | 60 | Shop, quests |

**Fairness of helpers.** An answer given with a helper counts half in the Elo update and never counts toward mastery or stars (same as "don't know" at half weight in `app/quiz`). Using a helper is praised ("smart to ask for help"), because help-seeking is the behaviour we want.

**Income (design target about 60-100 coins per 20-minute session).**
- Right answer in battle: 2 coins (3 on the child's weakest subject, as in GAME_PLAN 5.3). Super/fast: +1 only for age 9+ (no speed pressure below 9).
- Cashier: 20 per right answer, max 3 a day (exists). Chests 10-50. Daily chest 30. Quests 30-100. Seal success 5. Never negative: the wallet stays at zero at minimum (exists).
- **Sinks:** nets, snacks, helpers (above), cosmetics (hero hat or cape 80-150, creature accessory 40-120, home decor 50-300), fast travel (M6).
- **Never stuck:** with 0 nets and 0 coins after a win, the owl hands over a "spare net" (once per day). No dead ends, no real money, no loot boxes, ever.

**Shop interior.** Counter with the shopkeeper, 3 shelves = 3 categories, 6 items visible at a time (cards like the bag). Tap an item card: price tag (coin icon x number) and **Buy**. **The purchase is the lesson:** the pay screen shows the price; the child taps coin stacks to match it. Age A: count up to 10 with 1-coin and 5-coin stacks; B: make exact change, choose which bills to give; C: a "10% off today" tag and unit price. A wrong amount shows "a bit more" or "a bit less" with the coins counted aloud by animation; after 2 tries the shopkeeper counts it with them. Never blocked, never charged extra. Once the money skill is mastered a "quick buy" button appears (the parent can switch it off). A right change answer gives the 10% discount from GAME_PLAN 5.4.

### 4.4 Houses and their insides: every door opens
Rule: no door leads nowhere (the closed-door fix stays for any building that has no interior yet). Each interior is a small Tiled map (about 14x10 tiles), built from existing Tuxemon interiors (`player_house_bedroom.tmx`, `healing_center.tmx`, `professor_lab.tmx`, `*_center.tmx`) with the HD pipeline (`tools/app/hd.py`), modest characters only (`SDD_MODESTY.md`). One tap on the door-mat tile to leave. Mapping the five closed Hearthrock doors to these is a proposal: confirm against the map.

| Building | What the child sees | One-tap actions | Reason to enter | MVP |
|---|---|---|---|---|
| **Home** | Bedroom + meadow corner, bed, trophy shelf, bookcase (Book), mirror (wardrobe), mailbox, creature mats | Pet a creature (heart pops), feed from the bowl, open the daily chest, look in the mirror, bed = "goodnight" (natural stop point for screen time, M8) | Daily chest, see friends at rest, swap party from the Meadow, decorate, trophies | Yes |
| **Rest Center** (hospital) | Nurse at a counter, sleeping mats, a "creature desk" (computer) | Nurse: "rest everyone" (instant, free); desk: change party / see Meadow; free daily snack | Rest (tired friends, when energy exists), party swap, a daily gift, nurse tells one health/science fact | Yes (desk + gift + rest) |
| **Shop** | Shopkeeper, shelves, price tags | Buy (4.3) | Nets, snacks, helpers, cosmetics | Yes |
| **Owl's lab / school** | Owl, a "skills board" (my level per subject), a scanner for creature facts, placement re-check | Talk: owl explains; board: see subject rings; scanner: fact cards of caught creatures | Learning home: "explain it to me" (5.2), rank, retake placement, evolution blessing | Next |
| **Friends' houses** (gardener's greenhouse, the grandmother's, the kid with the kitten, the tourist's lodging) | One room each with a signature object | Garden: plant a berry (grows by real time or by 5 right answers); grandmother: story and tea | A friend gives one gift a day (cap 3 per person exists), one question, a new line each visit, a quest step | Next |
| **Academies** (Mila, Granite) | Exist | Boss test | Badges | Exists |

### 4.5 Battle flow, tap by tap
**Principle:** the answer is the attack. Nothing the child does can lose anything. The wild creature has a "fog" bar (the engine's HP), the child's partner has none.

**Screen layout (873x393).**
- Arena fills the top 270 px: wild creature upper start side (name, level chip, subject color icon, fog bar), partner lower end side.
- **Action bar** across the bottom 123 px, 5 buttons, each at least 120x72 px, ordered from the thumb outward (right-hand thumb at the end edge in RTL):
  1. **Ask** (large, 2x width, bolt icon): the main action.
  2. **Net** (net icon, pulses when the creature is calm).
  3. **Bag** (helpers and snacks are chosen on the question screen, so the bag here is a shortcut).
  4. **Friends** (swap partner = choose the subject).
  5. **Leave** (footprints; "go on your way", always free).
- Mapping to Tuxemon: Fight -> Ask, Monster -> Friends, Item -> Bag/Net, Run -> Leave. Trainer battle's "Forfeit" becomes "Rest" (always available).

**Taps for a normal wild encounter.**

| Step | Child does | Screen | What happens |
|---|---|---|---|
| 0 | Walks in grass (hold d-pad) | Map | "!" bubble 0.6 s, short swirl, arena appears. Per-map frequency is not random every step: first encounter after at least 8 steps; the parent can lower it |
| 1 | Nothing (optional tap to skip) | Arena | Line: "A wild X!" with picture; action bar appears |
| 2 | Tap **Ask** | Question overlay (the existing quiz screen) | Question for the creature's subject at the child's level; 2-4 choice cards (max 3 up to grade 1) or number pad; helpers strip at the top (hint, clover, pass if owned); "don't know" |
| 3 | Tap an answer | Same | Instant feedback: star burst and chime for right; for wrong, a soft wobble and the right answer plus a one-step explanation, no red, no buzzer |
| 4 | Tap **Continue** (or auto after 2.5 s for age A) | Arena | Right: partner's skill animation, fog bar drops, +2 coins pop, growth bar fills. Wrong: partner "cheers", fog unchanged, no loss |
| 5 | Repeat 2-4 (about 3-5 right answers; the parent caps questions per battle, default 6) | | After 2 wrong in a row the owl floats in with a free hint and the selector serves an easier item |
| 6 | (automatic) | Arena | Fog is gone: the creature is **calm** and sits. Net button pulses |
| 7 | Tap **Net** (choose type only if more than one) | Net sheet | Net flies, lands |
| 8 | Tap an answer to the **seal question** (1 question; 3 for rare creatures, one seal breaks per right answer) | Question overlay | Right: seal glows; wrong: net bounces, **net is not used up**, hint offered, try again; after 3 tries the creature wanders off calmly and stays in the encounter table (nothing lost) |
| 9 | (automatic) | Arena | 3 shakes, a click, "New friend!" with sparkle |
| 10 | Tap **Name it** or **Skip** | Name card | `LetterBoard` (4.10) |
| 11 | Tap **Continue** | Book card | Bestiary entry opens with a real fact; first catch shows "NEW" |
| 12 | (automatic) | Map | Back to the same tile; summary toast: coins, growth, new level if any |

A typical battle is about 15 taps and 2-3 minutes. **Leave** at any step returns to the map, nothing lost, the creature stays. If there are no nets, step 7 offers the owl's daily spare net, or "visit the shop" as an arrow on the map.

**Swapping partner (Friends).** Opens a strip of up to 4 creature cards with subject icon and level. Tap one: it becomes the partner and the questions change to its subject. This is the child's subject choice (GAME_PLAN principle 4). "Super fit" shows a sparkle arrow on the enemy when the partner's element is effective against it (x1.5 damage, element table from `db/element`), no other multipliers.

**Combos.** 3 right answers in a row fill the Knowledge meter and the next skill is a **super move** (exists in the old game, kept).

**Helpers on the question screen.** Hint Feather, Clover, Owl's Pass appear as 3 small icon buttons (only those owned), at most one use per question; the free first hint from `app/quiz` stays.

**Trainer duels (friendly).** Same flow, but the opponent has 3 questions instead of a fog bar, and the NPC's creature does a cheer animation. Win = a small prize; lose = "good game", the NPC teaches the answer.

**Chapter boss test** (academy master, trip master): 5-8 mixed questions in one subject, 2 mistakes allowed (Safety Net gives a third). Not passed: "Let's practise first", the owl offers a focused 3-minute drill; nothing taken away. Pass: badge.

### 4.6 Creature stats, levels, XP, evolution
**What a creature has.**

| Field | Shown as | Notes |
|---|---|---|
| Level (1-50) | Number in a leaf | From the engine; XP bar is "growth points" |
| Subject | Colored icon | From element/species (`subjects.yaml`); this is the only "type" a child needs |
| Power | 1-5 paws (numbers for level C) | Damage `(3 + level) x quality`; the only stat that matters in a fight |
| Hearts | 0-5 hearts | Friendship (4.9); never decreases |
| Skills | 3-4 icons | 4.8 |
| Energy (next) | 5 pips | Pacing (4.9); never zero-punishing |
| Facts | Book entry | Habitat, a real-world fact |

Tuxemon's HP, armour, dodge, melee, ranged and speed are not exposed: they are constants behind the scenes. Dropping them removes spreadsheet reading for kids and keeps the battle about the answer.

**Growth (engine rules, kept).** Right answer = 1 growth point (2 when fast and age 9+); needs `3 + floor(level/2)` points per level, so level 10 is about 47 right answers, level 20 about 147. A session of 20 minutes is 20-30 answers: about one level every session early, slower later. **Bench share:** friends in the party that did not fight get 50% of the points, so the whole party grows (like the Exp. Share in Pokemon). Captured creatures start at the wild creature's level.

**Level-up card** (full-screen, 2.5 s, tap to close): creature jumps, number goes up, bar refills, shows a new skill if any. **Evolution:** at the engine's threshold (about a third of the old level, min 6), a scene with the owl, the silhouette morphs, new Book entry. A big **Evolve** and a small **Later** button (children who love the small form can keep it; it asks again at the next level). Evolution can also depend on mastery ("evolves after the child masters the subject skill": GAME_PLAN 5.3), later.

**The child's own progress ("Me" card).** Not a level from grinding but three things: (1) **Subject rings**, one per subject, filled by the learning engine, with the grade-level label ("Math: grade 3 level"); (2) **Explorer rank** (Apprentice, Scout, Keeper, Guardian, Master) from stars + bestiary + discoveries; (3) trophies count. The parent sees the same plus numbers (4.16).

### 4.7 Party, storage, naming
- **Party size 4** (not Tuxemon's 6): fits a landscape strip, gives 4 subjects at most, easier for ages 5-7. Open question 3 offers 3 or 6.
- **Storage = the Meadow** at home and the desk at the Rest Center, up to 60 (engine `MAX_CREATURES`). New catches go to the party if there is room, otherwise to the Meadow with a toast. Swap at the desk or at home. When 60 is reached a new friend still counts in the Book ("visited") and the owl says "your meadow is full, let's tidy up".
- **Release:** none in the MVP. Later: "send to the wild meadow", with a confirm card, the creature stays in the Book and can be visited.
- **Friends screen (the party):** 4 big cards; tap = details (4.6); long-press (or tap the pin icon) = "partner first". No drag-sorting needed.

### 4.8 Skills tied to subjects
Tuxemon techniques stay as animations and names (126 are already in the app DB), but a creature shows only 3-4 learned skills and each skill has one of 4 **roles** that help learning rather than raising stats:

| Role | Effect | Example use |
|---|---|---|
| Strike | Normal damage (default skill) | Every right answer |
| Insight | Reveals a free hint, once per battle | Hard subject |
| Calm | Seal chain needs one fewer answer | Rare creature |
| Cheer | Next 3 right answers give +1 coin and +50% growth | Long session |

Skills unlock at levels from the species' moveset (`level_learned`). Choosing a skill is optional: a small row of skill icons sits above **Ask** (default Strike). One extra tap only when the child wants it. New skills appear on the level-up card ("New skill!"); there is no forgetting and no skill limit that needs a choice (max 4, auto-replace the weakest role duplicate).

### 4.9 Care, friendship, naming, cosmetics
Model: **Pokemon-Amie / Let's Go partner play** (pet, feed, play, hearts, small gifts) and **not** Digimon's care mistakes.
- **Hearts (0-5):** pet (tap a creature at home or in the Friends screen: a heart pops, up to 3 times a day), feed a snack (favourite kind = double; the creature's taste from the Tuxemon `taste_warm/cold` field maps to a favourite berry), fight together, evolve. Hearts never go down. No hunger, no sickness, no care mistakes.
- **What hearts give:** at 3 hearts the creature lights the question's hint button for free once per battle; at 5 hearts it **brings a gift** once a day (a berry, coins or a helper), shown as a gift icon on its card. The partner shows hearts on the arena.
- **Energy (Next):** each creature has 5 energy pips. A battle uses 1 pip (not a wrong answer: it is time, not mistakes). At 0 the creature is "sleepy", cannot be the partner but is still collected and can be swapped; Rest Tonic, a snack, the Rest Center (free, instant) or the next morning refill it. If the whole party is sleepy the game shows a one-tap **Rest** button right in the arena. This implements the pacing line "creatures are tired, let's drink water" from GAME_PLAN 3.6 and the 20-minute break suggestion, and gives the Rest Center a real job. It is a pause, never a loss.
- **Naming:** optional after a catch (step 10) with the existing `LetterBoard`; 3 suggested names plus free typing; names stay on the phone and never enter uploads or logs.
- **Cosmetics, all earned or bought with coins, never random:** creature accessories (bows, scarves, hats) shown in Book and battle; hero outfits (long sleeves and skirts only, per `SDD_MODESTY.md`); home decor (wallpaper, rug, plants, shelves). Wardrobe is the mirror at home. A "shimmer" colour variant of a creature is **deterministic** (awarded for mastery of its subject or a perfect seal), not a random shiny roll (Temtem's Luma is random; we avoid random reward schedules for children).

### 4.10 Naming UI
Name card: creature picture, a text field (RTL), the `LetterBoard`, **Done** (big), **Skip** (big, far from Done), 3 suggestion chips. Parent setting "free names" (default on, off = suggestions only).

### 4.11 Book (bestiary) and completion
- Grid of all creatures in the app DB (41 now; closed set so completion is reachable). States: unseen silhouette with "?" and habitat pin after first sighting; seen = grey picture; caught = colour card with a **real fact** (`content/science/monster_facts.json`), subject, habitat, evolutions chain, "met on" date. No percentages shown to age A, only a fill bar of stars.
- Completion tiers per chapter: bronze = all seen, silver = all caught, gold = all evolutions; each tier gives a cosmetic + coins. Tuxemon's Tuxepedia is the base (`journal_state.py`); Pokemon's Dex is the model.
- Tapping a caught creature opens its Friends card.
- Hints, not secrets: after seeing a creature, the Book says where it lives (zone icon), so completion never depends on guessing.

### 4.12 Daily goals and gentle streaks
- **Weekly garden, not a streak.** One flower grows for each day the child plays (any amount); 3 flowers = the weekly goal (matches GAME_PLAN 0: weekly goal with slack). Days off, Shabbat and holidays never count against it (calendar, M8). Missing a day removes nothing, ever.
- **Owl's daily challenge** (5 mixed questions, about 3 minutes) opens the **daily chest** at home: coins, a helper, sometimes a cosmetic. Available once a day, no expiry penalty.
- **No push notifications, no "come back" nudges, no loss framing, no countdown timers.** The UK ICO Children's Code lists streaks and rewards loops among "nudge techniques" to avoid for children (see sources); streak-freezes exist elsewhere because streaks cause anxiety. A parent can hide the garden entirely.
- Parent-defined surprise celebrations (exists in the old game) stay as the real-life reward channel, on effort (practice days, a mastered skill), with no visible price list (research basis in GAME_PLAN 0).

### 4.13 Quests (Journal)
- Quests screen = up to 3 active cards, each with a picture, a one-line goal, and 3-5 dots of progress; a **Show me** button puts a pin and an arrow on the map.
- Kinds: **Kindness** (wallet, kitten; exist), **Story** (chapter), **Daily** (owl), **Collection** ("find 3 water friends"), **Subject week** (parent-approved focus).
- Rewards: coins, items, cosmetics. Never timed, never lost. Finished quests stay in a "done" shelf.
- Tuxemon's `mission.py`/`set_mission` and the event interpreter variables are the base (M4 interpreter).

### 4.14 Achievements and badges
- **Badges** (exist): academies and trip masters (physical trophy on the home shelf).
- **Medals for effort, not speed:** "Asked for help", "Tried a hard one", "Came back after a break", "Explained it to a friend" (5.2), "10 right in a row", "All creatures of a zone seen", "First evolution", "Fed 5 friends". 30-40 medals, each with a picture and a one-line reason. No medals for being fast or for long play time.
- Where: Me card -> Trophies. Each gives coins or a cosmetic. Parent dashboard lists them.

### 4.15 Settings (child)
Sound and music volume (two sliders), **left-handed layout** (swap d-pad and talk side), larger text, reduce motion, colour-safe feedback (shapes plus colours, already the default), read-aloud on/off (M11), help ("how to play" pictures). No language switch (Hebrew only, per SDD).

### 4.16 Parent controls and dashboard (PIN, `parents/` area)
Existing: children, code, GitHub upload. Add pages: **Learning** (subjects on/off, start grade per subject, show/hide levels), **Play** (questions per battle 3-10, timer on/off age 9+, encounter frequency, quick buy, free names, show weekly garden, daily time (M8)), **Dashboard** (per subject: level, accuracy, time, hints/helpers used, weakest skills, weekly garden days, bestiary count; every number explained). Creatures, quest and shop activity as counts only. Dashboard data already exists in `core/learning/dashboard.ts`.

### 4.17 Tutors and lessons: learn first, then it helps (and pays)
Every institute (an academy in Hearthrock; in the solar chapter the observatory and the space station) has a **tutor NPC** for its subject. The tutor's room is the one place where the child learns on purpose; the knowledge then helps in every question of that subject.

**A lesson = one skill.** The lesson id is the learning engine's skill id (`science.space.moon`, `math.add.within_20`; the app has 82 math, 56 science, 38 geometry skills plus English, Hebrew and logic). The engine already knows `mastered`, `stars` and `worked_examples` per skill, so "learned" is a new flag `lessons_done` beside them, and the selector can prefer a skill the child has just learned.

**Structure (2-4 cards, about 1-2 minutes).**
1. **Hook card:** one picture and one question in a few words ("Why does the Moon change shape?"). No answer needed.
2. **Idea card(s) (1-2):** a picture or short animation, at most 12 Hebrew words, key word highlighted, optional read-aloud button (M11). Tap anywhere (large) to continue; back arrow always available.
3. **Example card:** the existing worked example of that skill (generator's `worked_example`), shown with the steps.
4. **Practice (tiny):** 3 questions from the same skill generator at the child's level, with the normal quiz screen. Pass = 2 of 3 right. Not passed: the tutor says "let's look at the card again", the card replays, 3 new questions; unlimited tries, no cost.
Authoring: a lesson is a small JSON/YAML file next to the skills: `lessons/<skill_id>.json` with `cards[]` (image id, text_he, optional text_en, highlight), `levels` (which grade bands it applies to) and `notes` (the 1-2 line card text used in battle). The generator already supplies the example and the practice, so authoring is only the 2-3 cards. A missing lesson file means the tutor offers nothing for that skill (a build test lists skills without lessons per institute, like the existing content checks). Hebrew text first; images from the existing art/emoji set.

**How many.**
| Scope | Lessons |
|---|---|
| Per institute | 6-10 (one per skill of its subject at the child's grade band, about 2 per star) |
| Per grade band (A: gan-1, B: 2-5, C: 6-9) | 2-4 per skill group; the tutor shows only lessons of skills at or one above the child's level (engine frontier), so a grade 2 child is not offered grade 8 |
| Solar chapter (4 zones) | 8-12 total: moon (phases, craters), day/night and the Sun as a star, rocky planets, giants and rings, stars and galaxies, gravity |

**Benefits (all positive, never punishing).**
- **(a) Lesson notes in battle and quiz.** Once a lesson is done, a small **Notes** button (book icon) appears on the question screen for questions of that skill (or its subject if the skill has no note). Tap: a bottom sheet slides up over the lower 45% of the screen (about 175 px high on 393), the question stays visible above. It shows the lesson's note card (a picture + one line of the *idea*), never the answer. Close with a tap outside or the X. Cost: **free once per battle**; extra uses cost 1 **Note charge** (a Helpers-tab item, 10 coins, 3 in a pack; the tutor gives 1 per lesson passed). When the child has learned a skill, the engine may also show an **auto-hint**: a small lightbulb pulse that offers Notes after 2 wrong answers in a row (the child still taps).
- **(b) Coins.** Finish a lesson and pass the practice: **40 coins once** per lesson (first time only). Repeat (re-do a lesson and pass the practice): **10 coins, once per day per institute** (cap, so it is not a farm). Compare: net 30, berry 10, hint 15, silver net 90, creature accessory 40-120: one lesson pays about one net or an accessory; a full institute (8 lessons) pays about 320 coins, similar to 5-6 sessions of battle income. Battle stays the main income; lessons are a fast, calm way to earn, as asked.
- **(c) Stamps and badge.** Each passed lesson stamps the institute's **stamp card** (a card with N circles, shown at the tutor's desk and on the Me card). When all stamps are done the tutor gives the institute **badge** (exists for the academies, new for the station) plus a cosmetic. Passing stamps never expire.

**Anti-abuse and learning integrity.**
- Notes explain the idea, they do not state the answer for this item. Note text is written as a concept ("A new Moon is when the sunlit side faces away from us") and the test is that no question in the bank is answered by quoting the note word for word (a build check compares note text with the correct answers of its skill's bank and flags verbatim matches).
- The child still chooses; the answer is never highlighted or removed (that is Clover's job).
- A question answered after opening Notes counts **half** in the Elo update and does not count toward mastery or stars (same rule as helpers, 4.3). The tutor's practice questions use the same half rule only if notes were opened there (notes are disabled inside practice, so practice counts fully).
- Coin rewards are once per lesson (+ one small daily repeat per institute), so notes and lessons cannot be farmed; shop prices are unchanged by this.
- Never any penalty: failing the practice just replays the card; Notes cannot run out in a way that blocks a question (without charges the child simply answers without them).

**Placement of the tutor.** In the institute building, a desk with the tutor and a **blackboard**; the stamp card on the wall. One tap on the tutor opens the **lesson list** (cards with the skill icon, a stamp or an empty circle, a lock icon only for skills far above the child's level). The tutor remembers the last lesson ("shall we do the next one?") and, as a mini-lesson NPC (5.2), also appears at a chalkboard next to a hard topic.

**MVP-now:** one tutor (the astronomer's assistant) in the station for the solar chapter, **3 lessons** (`science.space.moon`, `science.space.solar_system`, `science.space.stars`; `science.space.day_night` is the fourth, later), each 3 cards + 3-question practice, Notes sheet in battle (free once per battle, no charges yet), 40 coins first time, stamp card of 3, badge piece. **Later:** Note charges as an item, the daily repeat reward, auto-hint pulse, tutors for the two academies (math, geometry), read-aloud, lessons by grade band, "explain it to me" teachable-agent tie-in (5.2), a tutor in every trip.

---

## 5. The people and things in the world

Why: the child should feel the world is alive, always has "something over there", and that talking to someone or tapping something is always worth one tap. Inspirations: Pokemon NPC roles (gym leaders as checkpoints, rivals as foils, daily-gift NPCs such as the Berry Masters), Animal Crossing (distinct, simple characters with their own routines; friendship through talking and requests), Zelda-likes (curiosity and anticipation drive exploration; landmarks that pull the eye; collectibles need real rewards or players skip them), Stardew (gift and friendship hearts), teachable-agent research (children learn more when they teach a character, especially weaker pupils), Pokemon GO eggs (hatch by distance walked). Sources are in section 8.

### 5.1 Character roles
How to read the table: **See** = what the child sees; **Tap** = the one action; **Learning** = how it ties to learning; **Memory/Respawn**; **Effort** S/M/L; **MVP** = needed for the first chapter feeling alive.

| Role | See | Tap | Gets | Learning | Memory / Respawn | Eff. | MVP |
|---|---|---|---|---|---|---|---|
| **Guide** (the teacher character, exists as a persona) | Exclamation over her head near trip starts | Talk | Direction, the trip goal, a pin on the map | None (orients) | Line changes after each zone; always repeats the goal on request | S | Yes |
| **Hint-giver** (the owl) | Owl on a branch or floating helmeted owl | Talk | Hint Feather once a day; explains the last wrong answer | "Explain" and worked examples (exists) | Remembers the last skill you missed | S | Yes |
| **Friendly trainer** (cadet, mail carrier) | Stands facing a path, "!" when you come near | Talk, then **Ask** duel | Coins, an item | 3 questions in the child's current subject mix; losing = "good game" + owl explains | New line per visit; rematch with harder mix after 1 day | M | Yes (1) |
| **Chapter boss / leader** | Special building, badge icon | Talk | Badge, rare item, cosmetic | Mixed-subject test (4.5) | Rematch for a gold badge | L | Per trip |
| **Healer** (nurse) | Counter inside the Rest Center | Talk | Rest, daily snack, a health fact | One fact card a visit | Daily gift once | S | Yes |
| **Shopkeeper / vending machine** | Counter or a machine on the street | Tap | Buy (4.3) | Money skill is the purchase | Stock grows with badges; daily "special" at -10% after a right change answer | M | Yes |
| **Quest-giver** | "!" bubble, a worry face | Talk | Starts a quest card | Story problem in a subject (the baker doubles a recipe, the gardener fences a garden) | Quest stays until done; a thank-you line after | M | Yes (2) |
| **Collector / swapper** | Table with a showcase of creatures | Talk | Swap one duplicate creature for one the child lacks of the same zone (offer is fixed, not random) | A sorting/matching question ("which of these is a mammal?") | Offer changes when the child catches new species | M | Next |
| **Scientist explainer** | Notebook, magnifier; appears near a creature the first time you meet it | Talk | A **field note** (fact card) and a Book entry upgrade | Fact then one recall question later | Once per species, then lives in the Book | M | Yes |
| **Lost kid / someone to help** | Looks around, a missing item above the head | Talk, then find the item | Thanks, an item, a "kindness" medal | Directions (left/right, coordinates for older kids) or a counting hunt | Remembers: "thank you for helping last time" | M | Yes (1) |
| **Rival who learns alongside** | A kid with their own creature, same age feel | Talk | Friendly duel **or** "explain it to me": the rival asks the child to teach it a topic (child picks the right choice for the rival, the rival "learns" and levels up) | **Learning by teaching** (teachable agent): the rival's mistakes mirror the child's weak skill | Appears 3-4 times per chapter, remembers the previous result, grows | L | Next |
| **Teacher / mini-lesson NPC** | Chalkboard or telescope next to a hard topic | Talk | 30-second visual lesson (3 cards) before the first question of a new skill | Worked example (exists) as a place | Cards stay in a "lessons" shelf in the Me card | M | Yes (1) |
| **Wanderer / life** (cat in a suit, robot, birds) | Walks a short path, funny line | Talk | One funny line, rarely a berry | None (delight) | New line each of 3 visits, then loops | S | Yes (2) |
| **Postal clerk** | Postbox + mailbox | Tap | Postcard once a day from a story character | A fact or a question in the card | One per day, no expiry | S | Next |

**How people remember the child.** Each NPC keeps a small record: visits, last result, last gift date, hearts 0-3 ("they know you"). Lines are chosen by visit count (first, second, third, then a rotating pool of 3), by what the child did last ("you helped the kid, thank you"), and by the learning engine (a quiz about the child's current weakest skill). Daily gifts are capped at one per person per day (the old rule of 3 rewards per person per day stays for question rewards). At 3 hearts an NPC gives a **small personal gift** once (a cosmetic or a berry type) and, in friends' houses, a decor piece. No NPC ever shames or scolds.

### 5.2 Teaching moments
- **Mini-lesson before a hard topic:** the first time the child meets a new skill in a place (chalkboard, telescope), a 3-card lesson plays (image, one sentence, one example), then the existing worked example, then the question.
- **"Explain it to me" (teachable agent):** an NPC (a rival, a young creature, a lost kid) asks the child to "teach" it; the child chooses the correct step; the NPC repeats it back correctly or humorously wrong first. Used only in the child's **weakest** subjects, rewarded with the "Explained it to a friend" medal. Research on teachable agents (Lund University math games, Betty's Brain) finds gains especially for weaker pupils and more persistence.

### 5.3 World objects
Every object is a **one-tap** object with a visible cue. A question is asked at most once per object per visit, from the learning engine at the child's level. Wrong answer = the object wiggles, the answer and a one-step explanation appear, and the child can retry for free (after 2 tries the owl offers a free hint, after 3 the object opens anyway in a lesser form, never a lock-out).

| Object | See | Tap does | Gets | Learning | Respawn | Eff. | MVP |
|---|---|---|---|---|---|---|---|
| **Treasure chest (question lock)** | Chest with a lock showing the subject icon | Tap, answer | Coins, item, bait, hint token, cosmetic, or an egg | A question of the lock's subject | Never (one-time, 10-20% are in the Book of discoveries) | S | Yes |
| **Treasure chest (key)** | Chest with a key-shaped lock | Walk to it with the key (auto) | Bigger prize | Key found elsewhere in the zone (exploration) | Never | S | Yes |
| **Egg** | Spotted egg in a nest, rock or chest; element pattern hints the type | Tap to pick up, place in the "warmer" slot | A creature | **Warms by correct answers (10) or steps (300), whichever first**, shown as a crack bar; species comes from the zone's pool, never random from the whole game | One-time per nest; a daily "egg from friend" gift at 5 hearts | M | Yes (2) |
| **Hiding creature** | Rustling grass, a shaking bush, a loose rock or crate | Tap | A battle with a creature of the zone (counts for the Book) | Normal battle questions | Daily for grass/bush; rocks and crates once | S | Yes |
| **Shimmer / rare spawn** | Sparkle around the creature | Tap | A rare creature | Seal chain of 3 | **Deterministic**: appears under a condition shown in the Book hints (for example the full-moon phase in-game); never a dice roll | M | Next |
| **Sign / notice board** | Sign (`sign.png`) with a picture | Tap | A fact card; a new word in English for the English subject | One recall question the next time, from the same card | Always readable; the fact joins a "learned facts" shelf | S | Yes |
| **Hidden spot** | Faint sparkle or an odd tile ("gravity" landmark visible from far, the secret near it) | Tap | A discovery entry (+ the TRIPS discovery album) and 1 star fragment | A fact + 1 question | One-time | S | Yes |
| **Dig spot** | Crack in the ground / dust patch | Tap, answer | Fragment, fossil clue, coins | A matching or measuring question | 3 per day per map | S | Next |
| **Fishing spot** | Water ripple with bait icon | Tap, answer | Fish or an item | The existing "answer fishing" idea (`fishing.yaml`) | 3 per day | M | Later |
| **Star-gazing spot** | Telescope or flat rock under the sky | Tap, answer | A constellation or planet card + a star fragment | Astronomy question (53 space questions exist) | Daily, 1 per spot | M | Yes in the solar chapter |
| **Vending machine** | Colourful machine | Tap, pay with coins | A snack or a helper | Money skill | Always; price tags | S | Yes in solar |
| **Lock puzzle door** | Door with a keypad or shapes | Tap, solve | Opens a shortcut or a room with a chest | Number series, shapes or a letter code (grade by child) | One-time, afterwards open | M | Yes (1) |
| **Checkpoint / save point** | Lamp or camp fire | Tap | Rest, "fast return" to the zone entrance (free), safe message | None | Always | S | Yes |
| **Collectible fragments (stars)** | Tiny stars in nooks, in chests, on signs | Walk onto | A fragment (8 per zone = a badge piece) | A fact each | One-time | S | Yes |
| **Postbox / mailbox** | Postbox in town and a mailbox at home | Tap | One postcard a day (fact or question) | A fact or a question | Daily, no expiry | S | Next |
| **Bush berries / garden** | Berry bush | Tap | A berry | A plant fact | Daily per bush | S | Yes |

**Chest contents (the fixed menu):** coins 10-50, a net, a helper, a snack, **bait** (for the fishing spot), a hint token, a cosmetic, or an egg. The mix per chest is **authored**, not random, so a child can see "that chest has an egg" in a hint on the map and never gets "nothing". Egg-in-a-chest is the premium prize.

**Respawn principle.** One-time objects fill the Book of discoveries (completion drive). A few daily objects (bush, dig spot, grass, postbox, vending special) renew at local midnight for continuity; none punish a missed day, and none stack up beyond the day's cap.

### 5.4 Population of one chapter map: the Moon zone (example)
From `docs/app/TRIPS.md` section 3: low gravity, long jumps, craters; subject: the Moon and its phases; creatures: the moon line (working names Yarchon -> Saharon, element cosmic or sky, so science questions). A zone of about 40x28 tiles with 3 sub-areas: **Landing pad**, **Crater field**, **Moon base ridge**.

| Count | Kind | Role / contents | Where |
|---|---|---|---|
| 1 | Guide | The teacher in a space suit: trip goal, pin on the boss ridge | Landing pad |
| 1 | Hint-giver | The owl with a helmet: feather once a day, explains the last wrong answer | Landing pad, by the lamp |
| 1 | Scientist explainer | Geologist with a notebook: field note on first meeting each moon creature, the moon-phase lesson | Crater field entrance |
| 1 | Friendly trainer | Cadet: 3-question duel on the Moon | Crater field path |
| 1 | Lost kid | Young astronaut lost a glove that floated away; find it with a low-gravity jump; reward: Star Net | Crater field, glove behind a jump |
| 1 | Rival who learns | A kid with a small creature; "explain the phases to me" in the middle and at the end | Ridge (appears 3 times) |
| 1 | Collector | Rover owner: swap a duplicate for the zone's missing creature | Moon base ridge |
| 1 | Teacher mini-lesson | A chalkboard-screen showing phases in 3 cards | Landing pad |
| 2 | Wanderers | A rover robot that beeps; a cat in a suit | Anywhere |
| 1 | Boss | The astronomer (trip master) at the station: mixed Moon test, badge | Moon base ridge (end) |
| 5 | Chests | 2 question-locked (science), 1 key-locked (key at the glove quest), 1 on a crater rim reached by a low-gravity jump, 1 with an egg | Spread over the 3 areas |
| 3 | Eggs | 1 in a crater nest, 1 in the egg chest, 1 gift from the collector at 3 hearts | |
| 6 | Hiding creatures | 4 in dust patches (daily), 1 under a rock, 1 in a crate | Crater field |
| 1 | Rare spawn | A "full-moon" creature that only appears when the in-game moon phase is full | Ridge |
| 3 | Signs / boards | Phase of the Moon, why craters, gravity (each a fact card, 1 recall question later) | Landing, crater, ridge |
| 2 | Hidden spots | A "gravity landmark" tower seen from afar and a secret under a crater rim | Crater field |
| 1 | Star-gazing spot | Telescope: constellation card + 1 star fragment | Ridge |
| 1 | Dig spot | Dust patch with a daily dig (3 a day) | Crater field |
| 1 | Vending machine | Moon snack machine: snacks and Hint Feathers | Landing pad |
| 1 | Lock puzzle door | Airlock keypad: number series opens a shortcut to the ridge | Ridge |
| 2 | Checkpoints | Landing pad lamp, crater camp | |
| 8 | Star fragments | 8 fragments total (chests 2, signs 3, hidden 2, star-gazing 1) = one badge piece | |
| 1 | Postbox | Daily postcard from the owl | Landing pad |

Tallies: about 10 characters, 5 chests, 3 eggs, 8+ hidden/collect points. Rule of thumb for future zones: about one interactive thing every 4-6 tiles of walking and one landmark visible from afar (Zelda "gravity").

### 5.5 Effort summary for the world layer
- Authoring format: all NPCs, chests, eggs and objects are **data** (extend the event interpreter in `core/world/events.ts` with `open_chest`, `give_item`, `place_egg`, `spawn_creature`, `show_fact`, `set_hearts`), not code per object, so a new zone is art and data only (TRIPS section 2).
- Art: chest, egg, nest, dust patch, bush, telescope, vending machine, keypad door, signs (Tuxemon has `sign.png`, `box.png`, `boulder.png` props to start).

---

## 6. Prioritized roadmap

Milestones: M4 quiz/cashier/coins (built on `app/quiz`), M5 battle (in progress on `app/engine`), M6 trips engine, M7 solar chapter, M8 screen time/calendar, M11 read aloud. Effort: S = 1-2 days, M = 3-6 days, L = 1-2 weeks of an agent's work. Each item needs SDD + TDD + review per the playbook.

### MVP-now (smallest set that makes the chapter feel like a real game)
| # | Item | Effort | Depends on | Milestone |
|---|---|---|---|---|
| 1 | Backpack hub (6 tiles; no save tile) | S | M3 pause menu | M5 |
| 2 | Battle screen with the 5-button action bar and the Leave rule | M | `app/engine` battle core | M5 |
| 3 | Calm creature -> Net -> seal question -> catch -> name/skip; owl's spare net | M | 2, nets in items DB | M5 |
| 4 | Bag screen, 3 tabs (Nets, Snacks, Helpers) + feeding outside battle | M | items DB (about 12 items) | M5 |
| 5 | Helpers on the question screen (Hint Feather, Clover, Owl's Pass) with half-weight rating | S | M4 quiz screen | M5 |
| 6 | Friends screen: party of 4, details card (level, subject, power, hearts, skills), partner pick | M | engine creatures | M5 |
| 7 | Level-up card, new skill card, evolution scene with "Later" | S | engine growth | M5 |
| 8 | Book (bestiary) with silhouettes, fact cards, habitat pin | M | engine seen/caught, monster facts | M5 |
| 9 | Shop interior + buy with coin-counting; cashier door gets an inside | M | coins (M4), items | M5 |
| 10 | Home interior: meadow (pet, feed), bed, trophy shelf, daily chest | M | 4, 6 | M5 |
| 11 | Rest Center: desk (party swap), nurse daily gift, rest | S | 6 | M5 |
| 12 | NPC memory + roles: scientist explainer, friendly trainer, quest-giver (reuse kitten/wallet), wanderer | M | M4 interpreter | M5/M7 |
| 13 | World objects v1: chest (question + key), hidden spot, sign, star fragment, checkpoint | M | interpreter actions | M7 (first on Route 1 in M5) |
| 14 | Tutor in the station: 3 lessons (moon, solar system, stars), Notes sheet in battle, 40 coins first pass, stamp card and badge piece (4.17) | M | quiz screen, skill ids, space content (53 questions) | M7 |

Total MVP is about 8 weeks of one agent, so slice as M5a (items 2, 3, 5, 7), M5b (1, 4, 6, 8), M5c (9, 10, 11), then 12-14 with M7. If time is tight, drop 11 and 12 first.

### Next
| Item | Effort | Depends on | Milestone |
|---|---|---|---|
| Energy pips + sleepy state + Rest Tonic | M | 6, 11 | M5+ |
| Skill roles (Insight, Calm, Cheer) and skill row on Ask | M | 6 | M5+ |
| Weekly garden + owl's daily challenge + daily chest | M | goals.ts, M8 calendar | M8 |
| Quests screen (3 cards, pin on map) | M | interpreter | M6 |
| Medals (30-40) and Me card with subject rings | M | dashboard data | M6 |
| Parent pages: Learning, Play, Dashboard | M | parents' area | M8 |
| Note charges, daily lesson repeat reward, auto-hint pulse, tutors for the academies and every trip | M | 14 | M7+ |
| Eggs and hatching; collector swap; rival who learns; mini-lessons | M-L | chest/object actions | M7 |
| Owl's lab interior and friends' houses | M each | art | M7 |
| Cosmetics: wardrobe, creature accessories, home decor | M | art, modesty check | M6 |
| Dig, star-gazing, vending, lock door, postbox | S-M each | interpreter | M7 |
| Super fit icon and x1.5 | S | element table | M5+ |

### Later
Fast travel (M6, paid), creature abilities swim/fly (M6), day/night and weather and moon phase tie-in, rare spawns by condition, shimmer by mastery, fishing, release to the meadow, evolve-by-mastery, left-hand layout polish, read-aloud (M11), sibling co-op, extra trips (body, sea, volcano).

---

## 7. Open questions for the parent (6 core plus 1 extra, each with a recommended default)

1. **How should "tired creatures" work?** Options: none, a gentle energy system, or free Rest Center only. *Recommended:* gentle energy (5 pips per creature, 1 per battle, free instant rest at the Rest Center, never zero-punishing), added after the MVP.
2. **Party size:** 3, 4 or 6? *Recommended:* 4.
3. **Free creature names:** let children type any name or choose from suggestions? *Recommended:* free typing on the device (names never uploaded), with the parent switch "suggestions only".
4. **Coins and shop:** is a coin-counting "pay" step OK, with "quick buy" after mastery? *Recommended:* yes, parent can switch quick buy off.
5. **Who draws the new interiors and props** (home, shop, Rest Center, chests, eggs)? *Recommended:* reuse Tuxemon interiors via the HD pipeline, plus the new-art generator for the egg and chest; all characters pass the modesty rule.
6. **Competition between siblings:** should the app show any sibling comparison or shared family goal? *Recommended:* none visible between children; only each child's own weekly garden and an optional shared "family flower" the parent turns on.
7. **(Extra, from the lessons design)** Should lessons pay coins (40 first pass, 10 daily repeat)? *Recommended:* yes, as designed; parent can set the amounts to 0.

---

## 8. Sources

Code and docs read for this document: `tuxemon/` (`world/manager.py`, `world/menu_flags.py`, `states/*.py`, `combat/menu_visibility.py`, `combat/experience_strategies.py`, `platform/const/sizes.py`), `mods/tuxemon/` (db item/economy/technique/monster/element, maps, `sprites_obj`), `mods/*.yaml`, `mods/nagmon/`, `docs/kids/GAME_PLAN.md`, `SDD_WORLD.md`, `SDD_QUIZ_GAMEPLAY.md`, `SDD_MODESTY.md`, `docs/app/SDD.md`, `INVENTORY.md`, `TRIPS.md` (branch `app/trips-spec`), `app/src` and `app/public/game/db`, branch `app/engine` (`core/game/battle.ts`, `collection.ts`, `starters.ts`, `world/worldState.ts`; read only).

Web (searched 2026-10-20; blogs and fan wikis are weaker evidence than papers, noted where used):
- Pokemon loop, Poke Center, Poke Mart, catching: https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9Mart and https://en.wikipedia.org/wiki/Gameplay_of_Pok%C3%A9mon (via search results)
- Friendship, Pokemon-Amie, Let's Go partner play: https://bulbapedia.bulbagarden.net/wiki/Pok%C3%A9mon-Amie and https://bulbapedia.bulbagarden.net/wiki/Partner_Play
- NPC roles (gym leaders as checkpoints, rivals, professor, daily-gift NPCs, wandering NPCs): https://bulbapedia.bulbagarden.net/wiki/Non-player_character
- Pokemon GO daily bonuses and egg hatching by distance: https://techcrunch.com/2016/11/02/pokemon-go-introduces-daily-bonuses-to-keep-players-coming-back and https://bulbapedia.bulbagarden.net/wiki/Walkthrough:Pok%C3%A9mon_GO/Eggs
- Pokemon Sleep (progress tied to a healthy habit, a completion layer): https://www.pockettactics.com/pokemon-sleep/review
- Tuxemon items (Ancient Tuxeball, Fire Tuxeball): https://wiki.tuxemon.org/Ancient_Tuxeball and https://wiki.tuxemon.org/Fire_Tuxeball
- Temtem (housing, cosmetics, Luma, dojos): https://www.timeextension.com/games/nintendo-switch/temtem and https://blog.playstation.com/?p=368788
- Monster Sanctuary (monsters help exploration, skill trees): https://en.wikipedia.org/wiki/Monster_Sanctuary and https://turnbasedlovers.com/review/monster-sanctuary-2/
- Cassette Beasts (fusion, relationship with a partner, accessibility critique): https://www.theouterhaven.net/2023/04/cassette-beasts-review-monster-collecting-master/ and https://godisageek.com/reviews/cassette-beasts-review/
- Coromon (spinners, difficulty options, evolution by level/quest): https://coromon.wiki.gg/wiki/Coromon_(game)
- Digimon World (care mistakes, feeding, discipline; used as what not to copy): https://www.giantbomb.com/games/3030-3899/ and https://twinfinite.net/?p=256013
- Prodigy Math Game (answering is the spell; membership criticism, 16 ads vs 4 problems in 19 minutes): https://en.wikipedia.org/wiki/Prodigy_Math_Game and https://fairplayforkids.org/pf/prodigy/
- Kahoot and anxiety (mixed evidence, about a quarter find a live leaderboard stressful; explanations after answers fix misconceptions): https://www.ejmste.com/article/game-based-learning-with-kahoot-effects-on-grade-12-learners-anxiety-engagement-and-academic-19124
- Feedback in children's educational games (explanatory feedback beats right/wrong; fear of risk): https://reacheveryreader.gse.harvard.edu/?p=1615 and https://arxiv.org/pdf/2008.13749 and https://dl.digra.org/index.php/dl/article/download/923/923/920
- Self-determination in games (autonomy, competence, relatedness predict enjoyment): https://www.rochester.edu/warner/lida/wp-content/uploads/2022/11/02bfe513dd59366750000000.pdf
- Streak design and ethics: https://smashingmagazine.com/2026/02/designing-streak-system-ux-psychology/ (practitioner source, no child-specific data)
- Children's Code (nudge techniques, streaks): https://cy.ico.org.uk/about-the-ico/media-centre/news-and-blogs/2023/02/new-guidance-to-industry-issued-for-game-developers-on-protecting-children and https://www.pymnts.com/legal/2019/uk-regulator-kids-apps/ (coverage; check the ICO text before relying on exact wording)
- UX for kids by age (3-5, 6-8, 9-12; larger targets; icons and narration; blog-level): https://www.usertesting.com/blog/ux-for-kids and https://uxmatters.com/mt/archives/2020/01/ux-design-for-kids-key-design-considerations.php
- Animal Crossing villagers (distinct silhouettes, routines, friendship by talking and requests): https://gonintendo.com/stories/368235-nintendo-details-their-process-for-creating-unique-villagers-in-a and https://animalcrossing.fandom.com/wiki/Villager
- Zelda-likes exploration (curiosity, landmarks, collectibles need real incentives): https://www.gamedeveloper.com/design/designing-for-a-sense-of-mystery-and-wonder and https://mechanicsofmagic.com/?p=4824 and https://www.zeldadungeon.net/?p=41746
- Stardew gift and friendship hearts (250 points per heart; guide, not primary): https://shockbyte.com/blog/stardew-valley-gift-guide
- Teachable agents (learning by teaching, math games with 7-14 year olds, preschool version): https://link.springer.com/article/10.1007/s40593-020-00193-4 and https://www.fokusforskning.lu.se/?p=970

Not verified: Temtem egg mechanics, Cassette Beasts NPC recruiting, Monster Sanctuary fainting, Coromon item details, Stardew schedules and dig spots, Prodigy efficacy research, and any child-specific streak studies: the searches did not return them, so the design does not rely on them.
