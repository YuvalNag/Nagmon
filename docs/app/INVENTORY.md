# Nagmon rewrite: porting inventory

What exists in the Python/Tuxemon Nagmon today, and how to bring each piece into the new app
(TypeScript + React screens + Phaser map/battles + Capacitor Android). Paths are relative to the repo root.
Counts were measured on branch `nagmon-app` (October 2026).

**"Port as" keys**

| Key | Meaning |
|---|---|
| **copy** | Copy the data as it is (YAML/JSON/PNG/OGG). At most, a build step converts YAML to JSON. |
| **convert** | Same content in a new format (TMX to Tiled JSON, `.po` to JSON, frames to video). |
| **re-impl** | Write it again in TS. Keep the rules and the tests, not the code. |
| **drop** | Not needed in the new app. Either the platform does it for us, or it was a Tuxemon/pygame workaround. |

> Note: the brief says Phaser 3. The scaffold already in `app/` pins `phaser 4.2.1`, `react 19.3.1`,
> `@capacitor/* 8.5.3`, vite, vitest and playwright. Decide on one version before milestone 1.

---

## 1. Design docs (`docs/kids/*.md`): rules that must survive

Quotes are copied exactly from the Hebrew source, each followed by its English meaning.
The docs are the spec. Copy `docs/kids/` as it is and keep it as the reference.

| Doc (lines) | What must survive |
|---|---|
| `GAME_PLAN.md` (747) | **Learning is the power mechanic:** a correct answer gives a critical hit, a better capture and a shop discount. Mastery gives ⭐ that unlock things. Hard rule: "טעות היא לא עונש. תשובה שגויה = התקפה רגילה והסבר של שורה, אף פעם לא החטאה או הפסד" (a mistake is not a punishment; a wrong answer is a normal attack plus a one-line explanation, never a miss or a loss). Research overrides in §0: "בלי טיימר ובלי ניקוד מהירות מתחת לגיל 9" (no timer and no speed score under age 9). Success targets are about 80% for new material, about 90% for review and 85–90% at ages 5–7. Every question has a hint and "don't know" buttons. Feedback is always right/wrong, plus the right answer, plus a solution step. A weekly goal replaces the daily streak. Battles interleave subjects. Shabbat and holidays do not count. Privacy: "שום מידע על הילדים לא יוצא מהטלפון בלי פעולה מפורשת של ההורה" (no child data leaves the phone without an explicit parent action). Short sessions, and no dark patterns. |
| `SDD_ARCHITECTURE.md` (185) | The pure cores (`learning`, `family`, `ai`) never import the game engine. Every saved file is JSON with `schema_version` and a migration path. Contracts for `Question`, `LearningEngine`, `Profile`, `NagmonRuntime` and the `ask_quiz` script action. Port these contracts as TS types first. |
| `SDD_LEARNING.md` (523) | Engine spec, generator catalogue, figure specs and test table. See §2 below. |
| `SDD_CONTENT.md` (121) | YAML formats for skills, bank items, words, reading passages and `subjects.yaml`. Rules: unique `id`, `answer` in range, no duplicate choices, `prompt_he` ≤140 chars, choice ≤40, explanation ≤200. "בלי ניקוד" (no niqqud). "מדויק מדעית" (scientifically accurate). Content must be modest and family-appropriate, with no violence, no fear and no sensitive topics. Battle subject priority: (1) the parent's choice for this monster, (2) the monster's own subject (`monsters:`), (3) the technique's element. A subject the parent turned off makes the engine pick any enabled subject. |
| `SDD_QUIZ_GAMEPLAY.md` (92) | Before a damaging attack, push a quiz. Multipliers: correct ×1.5 (×2.0 "super" only when the timer is on), wrong ×1.0. A correct answer always hits. Every 3 correct answers in a row add +0.5 ("מכת-על", super blow). There is always a "התקפה רגילה" button (normal attack, no question): it gives ×1.0, no penalty and no rating change. There is a per-battle question budget (3 up to grade 1, otherwise 5). Capture: a correct answer gives ×1.6. A rare monster (`catch_rate` < 50) needs a chain of 3 questions, ×(1 + 0.4 × correct). Shop "cashier": a correct answer gives 10% off. |
| `SDD_WORLD.md` (159) | Chapter 1, "ערפל השכחה" (the fog of forgetting). Story, owl, starter, townspeople, route 1 and two academies. See §4. Text rules: no niqqud, gender-neutral address, "כל `\n` פותח עמוד. כל עמוד עד 120 תווים" (every `\n` opens a page, and a page holds at most 120 chars). Praise the process only. NPC prizes are capped at 3 per NPC per day, and "אין "תחזרו מחר" ואין פיתיון לחזור" (no "come back tomorrow" and no lure to return). "מטבעות לא נלקחים לעולם" (coins are never taken away). |
| `SDD_MODESTY.md` (27) | Review covered 209 overworld sprites, 360 battle portraits and 413 monsters. 101 portraits were flagged and 13 are borderline, so 114 portraits are replaced by a modest substitute with the same filename (`mods/nagmon/gfx/sprites/player/`). The heroine got a long skirt in all 17 variants. Standard: "שרוול ארוך, חצאית עד הקרסול" (long sleeve, ankle-length skirt). The avatar picker shows only allow-listed modest characters. Every new character needs long sleeves and a long skirt or trousers. Monster `hotline` is unused. |
| `SDD_FAMILY.md` (388) | Profiles, PIN, screen time, Shabbat and holidays, weekly goal, surprise celebrations and the owl log. See §7. Hard rules: "זמן מסך הוא לא פרס ולא עונש. אין שום API שמוסיף או מוריד דקות לפי ביצועים" (screen time is neither a reward nor a punishment; there is no API that adds or removes minutes based on performance). "אין שום שדה `streak` ואין הודעה על "רצף שנשבר"" (no `streak` field and no "broken streak" message). Default rewards mode is "surprise", meaning the child never sees a price list. Family goal: met only when every child meets their own goal, never a sum. |
| `SDD_PROFILES_UI.md` (72) | Startup screen "מי משחק?" (who plays?). New-child wizard: name, grade (kindergarten to grade 9), modest avatar. Parent gate: a PIN, or without a PIN a 2-digit multiplication. Locks after 5 mistakes. Screen-time watcher: `WARN_SOON` shows a gentle note, `BREAK_SUGGESTED` suggests a break, `MUST_STOP` autosaves at a natural pause, "לא באמצע קרב או דיאלוג" (not mid-battle or mid-dialog), then returns to "who plays". |
| `SDD_FIELD_DATA.md` (142) | Upload of logs, crashes and progress to the private data repo. See §7.2. Hard rules: a public repo receives nothing ("200 עם `private: false`: **לא שולחים כלום**"). The token is "לעולם לא נרשם בלוג, לא מוצג ולא נכנס לדוח" (never logged, never shown, never in a report). |
| `SDD_AI.md` (295) | Providers, router, studio, owl and safety. See §7.3. "Gemini לילדים: **כבוי**" (Gemini for kids: off). What is sent: "אף פעם לא שם, לא מזהה ילד, לא היסטוריה" (never a name, a child id or history). Every studio item passes the validator **and** manual parent approval. Owl notice that is always shown: "ההורים יכולים לקרוא את השיחות עם הינשוף" (parents can read the owl conversations). |
| `SDD_TTS.md` (243) | Speech is queued and never blocks the game. "אינטרנט רק באישור הורה. `allow_online=False` כברירת מחדל" (online voices only with parent consent; off by default), enforced in the service and not in the UI. "שום תקלה בהקראה לא מפילה את המשחק" (no TTS failure crashes the game). Questions are read aloud automatically up to grade 2. Mixed text is split into he/en segments with an English voice for English words. Math symbols are spoken as words (`×` is "כפול", `₪` is "שקלים"). |
| `SDD_HEBREW_RTL.md` (151) | The font is Rubik (OFL). The bidi contract is "logical in, visual out, once". A typing effect reveals text in **logical** order. Math expressions are wrapped in LRI…PDI (U+2066/U+2069) so `12 - 5` stays LTR inside Hebrew. Hard-coded `Lv.`, `$` (shown as `₪` in Hebrew), units and `x` become msgids. Language ladder levels 0–5: 0 Hebrew only, 1 `שיקוי · Potion`, 2 known English words inline, 3 EN line over HE line, 4 EN with HE on tap, 5 EN only. Rubik has no ✓, → ←, ♂ ♀ or U+05BE glyphs. Do not use them. |
| `SDD_TRANSLATION.md` (306) | Glossary `docs/kids/he_glossary.yaml`. Monster names stay in English. Use a plain `-` and not the Hebrew maqaf. Gender-neutral address. "אסור: "תלך/תלכי", "אתה/את", "מוכן/מוכנה" בפנייה לשחקן" (forbidden in addressing the player: gendered verb pairs, "you m./f.", "ready m./f."). Gentle wording: faint is "התעייף" (got tired), kill is "ניצח" (won), battle is "דו-קרב" (duel). Romance is reworded as friendship. Placeholders are copied exactly, and the `\n` count must match the source. |
| `SDD_ANDROID.md` (329) | Phone UI rules: text line ≥5 mm, buttons ≥9 mm (`PHONE_UI_FACTOR = 1.6`). Landscape only. "`android.allow_backup = False`". "אף פעם לא שומרים מפתח בריפו" (never keep a signing key in the repo). Always sign with the same key, because a reinstall wipes profiles. Crash report is shared only after a parent tap. Pain points: §8. |
| `SDD_ART.md` (329) | Art pipeline, HD sheets, xBRZ tiles, the owl cape, and monsters with subjects. See §6. |
| `SDD_FIGURES.md` (120) | 15 figure kinds drawn for questions, plus Twemoji pictures. See §2.4. |
| `SDD_MOD_LOADING.md` (42) | Tuxemon-only (mod layering, `.po` domains, FPS limiter). **Drop.** The one idea worth keeping: Nagmon strings live in their own namespace and fall back to English. |
| `RESEARCH_LEARNING.md` (583), `RESEARCH_AI_PROVIDERS.md` (456) | Rationale and the 21-point research checklist (§9) that the SDDs cite. **copy** as reference. |
| `HOW_TO_PLAY.md`, `STATUS.md` | Parent guide and status. Rewrite them for the new app. |

**Defaults to keep exactly** (`nagmon/family/screentime.py`, `parent.py`, `calendar.py`):

| Setting | Value |
|---|---|
| Daily limit | 60 min |
| Weekday play window | 16:00–19:30 |
| Weekend play windows (Fri, Sat) | 08:00–12:00 and 16:00–19:30 |
| Bedtime / wake | 20:00 / 06:00 |
| Breaks | break suggested every 20 min, for 5 min |
| Warnings | warn 5 min before the end, 3 min grace to reach a natural pause |
| Shabbat | game closes 10 min before candle lighting |
| Default location | Jerusalem, candles 40 min before sunset. Presets: Haifa 30, Petah Tikva 20, others 18 |
| Tzeit (end of Shabbat) | sun 8.5° below the horizon |
| Priority in `evaluate` | MUST_STOP (Shabbat/holiday > bedtime > outside window > daily quota) > WARN_SOON > BREAK_SUGGESTED > ALLOW |

---

## 2. Learning engine (`nagmon/learning/`, ~12k lines, pure Python): **re-impl in TS**

### 2.1 Algorithms (exact)

| Part | File | Algorithm |
|---|---|---|
| Rating | `rating.py` (132) | **Elo-style online IRT on a logit scale (Rasch/1PL with a fixed guessing floor), as in Math Garden / Pelánek.** `P = g + (1−g)·σ(θ−b)`. `g` is 1/n for choice and tap_figure, ½ for true/false, 1/n! for order, 0 for open answers. Update: `θ += K_θ·w·(S−E)` and `b −= K_b·w·(S−E)`. Dynamic K: `K(n)=k_min+(k_max−k_min)/(1+n/n_half)`. Learner K is (0.6, 0.12, 12). Item K is (0.4, 0.05, 20). Weight `w` is 0.5 for "don't know" (S=0) and for correct-with-hint. With the timer on, a *correct* answer gets `w·=1+0.5·max(0,1−t/deadline)`. There is no slowness penalty and no fast-wrong penalty (Math Garden's HSHS was replaced). Initial θ is `clip(0.8·(child grade − skill grade), ±2.4)`. Item `b` is the item's difficulty plus a per-child offset, capped at 4,000 items with LRU pruning. |
| SRS | `srs.py` (105) | **Leitner, 5 boxes, intervals 1/3/7/14/30 days**, injected clock. A new item answered right goes to box 2, wrong to box 1. A known item answered right moves up one box; wrong goes back to box 1 with `lapses+1`. Correct-with-hint does not promote. Each card holds `seed`, so the same question can be regenerated. Applies to skills with `srs: true` and to every `bank` and `english.vocab` skill. |
| Selection | `selector.py` (470) | Bucket draw **70% frontier / 20% review / 10% stretch**, falling back in that order. Frontier skill weight: `(0.05+exp(−((σ(θ)−T)/0.15)²))·(1+0.5·min(misconceptions,4))`. **Interleaving:** 30% of frontier picks in `battle` come from any skill already met in the subject, weighted by days since last practice (cap 14). **Remediation:** a struggling frontier skill adds its prerequisites as candidates. **Parent focus:** 60% exclusive when available, otherwise ×4 weight. **Boss:** least-asked skill of a set, no worked example. **Worked example** once per skill on first meeting; it does not change rating, mastery or SRS. Item pick: 8 candidate seeds, skip the last 8 items, take the one whose expected P is closest to the target. Targets: frontier 0.80 (0.875 at ages 5–7), review 0.90. |
| Mastery and economy | `engine.py` (349) | Mastered when `n ≥ 12` **and** `θ ≥ logit(0.8)` **and** last-10 accuracy ≥ 0.8. Each mastery gives one star, and "כוכב לא נלקח בחזרה" (a star is never taken back). Coins: `1+round(3·(1−p))`, plus 2 for a weak subject, plus 1 for super, half with a hint (min 1), 1 for a worked example, 0 when wrong. Super threshold at age 11: choice 6 s, true/false 4, number 8, order 12, letters 12, tap 6. Multiply by `1+0.15·(11−age)`, clamped to [1, 2]. Streak lives in the session only and is never saved. Hint: removes one wrong choice, or shows the first explanation step. |
| Answer check | `model.py` (323) | `check_answer` normalisation: NFKC, strip bidi controls and niqqud, numbers (`"07"`, `"3,5"`, `"1,000"`, unicode minus, `₪ % °`), exact fractions and mixed numbers. `fraction_form` is `value` or `simplest`; `simplest` tags a non-reduced answer `not_simplified`. True/false accepts נכון/כן/true/yes. Order compares the id tuple. A misconception map turns a wrong answer into a tag. |
| Learner state | `learner.py` (303) | `schema_version: 1`. Per skill: `{theta, n, correct, last, recent[≤20], misconceptions{tag:n}}`. Per item: `{b_offset, n, last}`. Also `srs` cards, `mastered{skill:ts}`, `stars{subject:n}`, `log` (deque ≤5000), `words{word:ts}`, `worked_examples`, and totals. Migration v0→v1 converts a 1200-scale rating with `θ=(r−1200)·ln10/400`. A future version raises an error. |
| Content loader | `content.py` (906) | Loads `skills/*.yaml` and the banks, then validates. Every problem is collected into one `ContentError`: duplicate id, unknown generator, missing prerequisite, cycle, grade outside 0..9, lengths, niqqud, partial emoji (it would give away the answer). `extra_bank_dirs` loads AI-approved items and **never crashes** on bad items (it logs a warning and skips). `element_facts`, `words_he()`. |
| Dashboard | `dashboard.py` (212) | Every number is a `Stat(value, explanation_he)` (for example "75% הצלחה = 30 נכונות מתוך 40", 75% success = 30 right out of 40). Accuracy over 7 and 30 days, time, mastered skills, struggles (≥6 attempts in 30 days and <60% accuracy, with up to 3 misconception tags), new English words. |

**Public API to mirror** (`nagmon/learning/__init__.py`): `LearningEngine(content, learner, rng, clock, config)` with
`next_question({subject, skill_id, skill_ids, context, max_choices, difficulty_bias})`,
`submit(q, given, {elapsed_s, context, hint_used, dont_know}) → AnswerOutcome`, `hint(q)`,
`subject_progress(subject)`, `dashboard()`, `expected_success(q)`, `weak_subjects()`.
Also `Question`, `Choice`, `Figure`, `CheckResult`, `check_answer`, `display_answer`, `LearnerState.to_dict/from_dict`,
`ContentLibrary.load`, `GeneratorRegistry`.
`AnswerOutcome` holds `{correct, quality: super|correct|wrong, misconception, explanation_he, coins, newly_mastered, streak, power_multiplier, correct_answer, expected, worked_example}`.

**Port traps**

- **RNG.** Generators are deterministic per seed through Python's `random.Random` (MT19937). Use a seedable TS PRNG. Existing phone `learning.json` cards hold Python seeds that a TS generator will not reproduce. Either regenerate a card from its `item_id`, or reset the SRS seeds during migration. θ, b and the log migrate as they are.
- **LRI/PDI.** Generator output contains these isolates. React/DOM renders them correctly. A Phaser canvas text must strip them (the same as `model.normalize_text`).

### 2.2 Generators (`nagmon/learning/generators/`, 7 modules + 3 helpers): **re-impl**

| Module | Lines | `@generator`s | Notes |
|---|---|---|---|
| `arithmetic.py` | 1251 | 22 | count … average, money, clock |
| `geometry.py` | 1668 | 23 | shapes, angles, area, solids, coordinates, Pythagoras, similarity |
| `rational.py` | 784 | 14 | fractions, decimals, percent, ratio |
| `logic.py` | 746 | 10 | pattern, sequence, sudoku, robot program, statements |
| `algebra.py` | 538 | 6 | negatives, powers, equations, substitution, linear |
| `word_problems.py` | 331 | 1 | `word.problem` |
| `english.py` | 510 | 1 | `english.vocab`, 6 modes: picture_to_word, word_to_translation, translation_to_word, listen_to_picture, spelling (letter tiles), sentence_cloze. Ages 5–7 get picture/listen modes only. |
| `common.py` | 418 | – | `GenContext`, question builders, LRI/PDI wrapping |
| `misconceptions.py` | 388 | – | **107 tags**, each with `parent_he` and `hint_he`. **copy as data** (JSON). |
| `names.py` | 87 | – | Names, objects and emoji used in word problems. **copy as data.** |

In total: 77 procedural generators plus `bank` (78 registered). All 78 are used by the skill files.
Choice count is 3 up to age 6 (or kindergarten), otherwise 4. `auto` kind: choice at age ≤7, otherwise choice 60% of the time.

### 2.3 Tests to port as TS (vitest)

The counts below are `def test_` functions. Parametrised cases add more; the repo total is 9,736 including Tuxemon.

| Port as TS tests (pure logic) | Count |
|---|---|
| `tests/nagmon/test_learning_model.py` | 13 |
| `test_learning_rating.py` (includes the convergence check: simulated learner θ*∈{−1,0,1.5}, \|θ̂−θ*\|<0.6) | 7 |
| `test_learning_srs.py` | 7 |
| `test_learning_selector.py` (bucket split ±5%, focus ≥55%, no repeats, targets, boss balance) | 11 |
| `test_learning_engine.py` | 14 |
| `test_learning_learner.py` (needs fixture `tests/nagmon/fixtures/learner_v0.json`) | 6 |
| `test_learning_content.py` | 12 |
| `test_learning_generators.py` (every generator × 200 seeds: answer is among the choices, choices unique, no niqqud, `meta.calc` recomputes the answer) | 7 |
| `test_learning_integration.py` | 23 |
| `test_learning_dashboard.py` | 4 |
| `test_learning_purity.py`. Becomes an ESLint import-boundary rule: the core never imports phaser/react. | 1 |
| `test_content_english.py`, `test_content_science.py` (content validation) | 20 + 16 |
| `test_quiz_flow.py` (SubjectMap, combo, budget, NumberPad/OrderPicker/LetterTiles) | 14 |
| `test_math_isolation.py` | 2 |

---

## 3. Content (`mods/nagmon/learning/`, 1.3 MB YAML): **copy** (YAML → JSON at build)

**Skills** (`skills/*.yaml`, 260 in total; `srs: true` on 10 math skills):

| Subject | Skills | By grade (0 = kindergarten … 9) | Generators |
|---|---|---|---|
| math | 82 | 0:5 1:12 2:11 3:12 4:13 5:8 6:5 7:7 8:5 9:4 | procedural |
| geometry | 38 | 0:2 1:2 2:3 3:5 4:6 5:7 6:5 7:4 8:2 9:2 | procedural |
| logic | 16 | 0:2 1:1 2:3 3:3 4:2 5:2 6:2 7:1 | procedural |
| english | 57 | 0:5 1:7 2:3 3:10 4:11 5:6 6:8 7:2 8:5 | 23 × `english.vocab`, the rest `bank` |
| science | 56 | 1:9 2:9 3:15 4:8 5:7 6:3 7:2 8:3 | `bank` |
| hebrew | 11 | 0:3 1:4 2:4 | `bank` |

**Banks and other data**

| File | Count | Grade split | Notes |
|---|---|---|---|
| `english/words.yaml` | 1,008 words | preA1 340, A1 389, A2 221, B1 58. By grade 0:120 1:182 2:38 3:214 4:175 5:142 6:79 7:14 8:31 9:13 | 34 topics, 354 with emoji |
| `english/phonics.yaml` | 260 items (all choice) | 0:64 1:121 2:75 | uses `speak_en` |
| `english/sentences.yaml` | 281 items (260 choice, 17 true/false, 4 order) | 3:58 4:92 5:39 6:63 7:3 8:25 9:1 | grammar |
| `english/reading.yaml` | 30 passages, 111 questions | grades 3–9 | passage text goes into `meta.passage_*` |
| `science/*.yaml` (11 files) | **721 items** | grades 1–9 | animals 77, body 75, earth 75, ecology 51, energy 111, living 55, matter 86, plants 62, space 53, technology 50, monster_facts 26 |
| `science/monster_facts.yaml` | 13 elements × 8 facts = 104 | | monster "science cards" |
| `hebrew/{letters,words,reading}.yaml` | **160 items** (60 + 72 + 28) | grades 0–3 | |
| `owl_faq.yaml` | 67 Q&A plus `fallback_he` and `sleepy_he` | `min_age` per entry | offline owl answers |
| `subjects.yaml` | 6 subjects | | element → subject map, colour, `monsters:` (scrollo, megillon → hebrew) |
| `docs/kids/he_glossary.yaml` | | | translation glossary |
| `content/modesty/sprites_review.yaml` | | | modesty review, allow-list source |

The content validators run as content tests in CI (`test_content_*`, `test_learning_content`).

---

## 4. The world

### 4.1 Maps used: **convert** TMX → Tiled JSON, with tilesets embedded

Nagmon has **no TMX of its own**. It merges YAML scripts (`mods/nagmon/maps/*.yaml`, 90 events) into four Tuxemon TMX maps.
The TMX files use 16 px tiles and base64 + zlib layers.

| Map (`mods/tuxemon/maps/`) | Size | Tilesets | TMX events | Nagmon script |
|---|---|---|---|---|
| `classic_hearthrock_city.tmx` (home town) | 40×20 | `core_city_and_country`, `core_outdoor`, `core_set pieces`, `core_buildings`, `core_outdoor_water`, `core_outdoor_nature` | music `music_town_theme`, day/night environment, teleports to route 1 (32,0), **route 8** (39,15), gym Mila door (18,13), gym Granite door (23,13). 15 collision rects. | `classic_hearthrock_city.yaml`, 52 events (below) |
| `classic_route_1.tmx` | 40×20 | same 6 | 3 × `random_encounter spyder_citypark,11` in grass areas, teleports to Hearthrock and **Steamshore** (5,0) | `classic_route_1.yaml`, 14 events. The 3 encounters are replaced (`replaces:`) by `nagmon_route1`. |
| `classic_gym_granite.tmx` | 20×20 | `core_indoor_floors`, `core_indoor_walls`, `core_set pieces` | creates the leader at (10,5) and a level-20 battle event, which Nagmon retires with `set_battle`. Music `music_cathedral_theme`. | `classic_gym_granite.yaml`, 12 events |
| `classic_gym_mila.tmx` | 20×20 | same 3 | same as Granite | `classic_gym_mila.yaml`, 12 events (math, team level 10/11) |

Route 8 and Steamshore can be reached but are unscripted Tuxemon maps. **Wall them off in the slice.**
Phaser loads only Tiled **JSON** with **embedded** tilesets. Convert in a build script (`tiled --export-map json --embed-tilesets`, or pako + xml).
Bake collisions from the "Collisions" object rects and from TSX tile properties into a grid.

### 4.2 Story and quest line (chapter 1): **convert** scripts to a small TS event interpreter

| Event group | Behaviour |
|---|---|
| New game | `nagmon_apply_profile` (child's name, avatar, gender), `method_money:conserved`, `blackout_no_monsters`. Faint teleport to the owl at (29,16). Start position `[29,16]` in front of the owl's house. |
| Owl (`nagmon_owl`, at 29,15) | 3-page intro: story, "knowledge power", starter. `choice_monster agnite:rockitten:kroki` (repeats until a pick is made). Starter arrives at level 7. Gifts: 5 `tuxeball`, 3 `potion`. First question `ask_quiz math`: a warm line whether right or wrong. Later talks heal and give a tip per stage. |
| Owl evolution | On `academy_granite_done:yes` the owl congratulates once, then `set_template nagmon_owl,nagmon_owl_caped,nagmon_owl` (puts on a cape). "Create Owl Caped" reapplies it on every map load, so a save keeps the cape. |
| Townspeople | Cashier (13,14): question by grade (k → `math`, grade 1 → `math.money.coins`, ≥2 → `math.money.change_20`, context `shop`). Correct gives 20 coins. Tourist (20,7): `english`, gives a `potion`. Gardener (4,16): `science`, gives a `wood_berry`. Each is capped by `nagmon_daily_below <npc>,3` and `nagmon_daily_count`. Above the cap, praise only. |
| Kindness quest | A kid NPC (24,7) lost a kitten (`nagmon_kitten`, rockitten sprite) on route 1 at (21,16). Bring it back: 2 potions and 30 coins, and the kitten appears at (25,7). |
| Honesty quest | A wallet prop at (12,7). Choice is return or keep. Keeping has no punishment: the granny NPC (35,7) gives a second chance. Return gives 30 coins and a `water_berry`. |
| Route 1 | Friendly duel with `nagmon_route1_trainer` at (30,16): team Nut L5 and Dandicub L6, only on talk, with a choice. A loss heals the player and respawns the trainer with a fresh team. Bilingual sign at (36,17): TREE = עץ. |
| Academies | Talking to the master resets the test. 3 × `ask_quiz <subject>,q<i>,boss`. Each answer is counted in its own event, and `skip` counts as a pass. A score of ≥2/3 passes and starts a duel (Hydrone L8 and Nudikill L9). A lower score: "train a little and try again", unlimited. A win gives `nagmon_badge_granite`, 100 coins and `academy_granite_done:yes`. A lost duel heals the player, keeps the passed test and allows a rematch. Mila is the same with `math` and `academy_mila_done`. |

The scripts use these actions:
`translated_dialog`(84), `set_variable`, `clear_variable`, `create_npc`, `ask_quiz`(12), `char_face`, `add_monster`, `add_item`,
`variable_math`, `set_monster_health/status`, `remove_npc`, `modify_money`, `start_battle`, `translated_dialog_choice`,
`random_encounter`, `play_map_animation`, `nagmon_daily_count`, `set_template`, `set_battle`, `set_teleport_faint`,
`nagmon_apply_profile`, `choice_monster`. The TMX adds `play_music`, `set_environment`, `transition_teleport` and `char_talk`.

The scripts use these conditions: `variable_set`, `one_of`, `char_exists`, `variable_is`, `nagmon_daily_below`, `char_at`, `char_moved`,
`profile_grade_at_least`, `char_defeated`, `battle_outcome`, `party_size`, plus the `talk` behaviour. The TMX adds `music_playing`,
`time_is`, `environment_is` and `char_facing`.

Event semantics to keep: every frame, each event whose conditions hold and that is not running starts. Actions run in sequence.
Branching is done by separate events gated on variables. An event that hands over sets its "next step" variable **last**.
Conditions must have no side effects.

### 4.3 Database (`mods/nagmon/db`, 84 KB): **copy as data**, and pull the inherited records it needs

| Table | Nagmon-specific | Inherited from Tuxemon and actually used |
|---|---|---|
| monster | 12 records, `txmn_id` 394–405: geometrion→polygonos, alphabel→lexicon, pluson→multivolt, flaskling→botanikos, puzzlet→enigmon, scrollo→megillon. All evolve at L16. | 29: starters agnite/rockitten/kroki and their evolutions (agnidon, agnigon, rockat, krokivip, leviadile…); duel monsters nut, dandicub (and bolt, dandylion); gym hydrone, nudikill; route-1 wilds cardiling, cardiwing, cataspike, eyenemy, axolightl, tourbidi, squabbit, puparmor, plus their evolution chains. **41 monsters in total.** |
| technique | 0 (moves reuse Tuxemon techniques; violent ones were removed, and `wicked_wind` was renamed "Mystery Wind") | **126** techniques from the 41 movesets. 14 effect types; the slice needs only `damage`. 84 animations / 99 frames (0.4 MB). |
| element | – | 12 of 13 elements (every one except frost), with their strength/weakness chart (`mods/tuxemon/db/element/`) |
| item | 2 badges (`nagmon_badge_granite`, `nagmon_badge_mila`, category badge) | `tuxeball`, `potion`, `wood_berry`, `water_berry` |
| npc | `nagmon_world.yaml`: owl, cashier, tourist, gardener, kid, kitten, granny, route1_trainer, wallet (prop), sign_route1 (prop); overrides of `classic_gym_leader_granite` and `_mila` (new templates, same speech msgids) | templates `professor`, `shopkeeper`, `cooldude`, `florist`, `childactor`, `granny`, `postboy`, `monk` (the slug field only) |
| encounter | `nagmon_route1` (12 entries: the 8 of `spyder_citypark` plus geometrion 2, alphabel 2, pluson 1, flaskling 1, L5–8) | – |
| environment | – | `grass`, `night_grass`, `interior` (battle background, island sheet, HUD, music) |
| music/sounds | – | 6 music slugs, 63 sfx slugs (see §6) |

Engine formulas to **re-impl** (only what the slice needs): `tuxemon/formula.py` `simple_damage_calculate` (with `additional_factors`),
`shake_check` and `capture`, plus the experience/level-up and evolution-at-level rules.

---

## 5. Texts (`.po`): **convert** to JSON message catalogues

| File | msgids | Notes |
|---|---|---|
| `mods/nagmon/l18n/he_IL/LC_MESSAGES/nagmon.po` | 257 | domain `nagmon`. Prefixes: `nagmon_world_*` 60, `nagmon_github_*` 28, `nagmon_owl_*` 27, `nagmon_grade_*` 10, the rest UI (`pin`, `parent`, `feedback`, `language`…). Also 12 `cat_*`, 4 `quiz_*`, the 12 monster descriptions, and overrides of `classic_gym_leader_granite/mila` and `wicked_wind`. |
| `mods/nagmon/l18n/en_US/LC_MESSAGES/nagmon.po` | 257 | same ids (a test enforces parity) |
| `mods/tuxemon/l18n/he_IL/LC_MESSAGES/base.po` | 5,391 | full Hebrew translation of Tuxemon (domain `base`) |
| `mods/tuxemon/l18n/en_US/LC_MESSAGES/base.po` | 5,394 | |

Core Tuxemon strings the Nagmon world shows (≈810, so port a subset and not all 5.4k):

- about 350 content strings: names and descriptions of the 41 monsters and 126 techniques, their `cat_*`, the 4 items and the element names;
- about 460 generic UI and battle strings with the prefixes `combat_` (109), `menu_` (139), `tuxeball_`, `unit_`, `level_*`, `currency_symbol`, `monster_`, `technique_`, `status_`, `stat_`, `taste_`, `terrain_`, `weather_`, `month_`, `relation_`, `tuxepedia_`, `app_`;
- `classic_gym_leader_{granite,mila}{,_pre,_post}`.

Also: **47 Python files contain hard-coded Hebrew** strings: screen-time messages, misconception hints, generator prompts, calendar names and crash dialog texts.
Move them all into the catalogue. Keep generator prompts in code or data, because they are content and not UI.
Placeholders: `{name}` and `${{name}}` (player name, currency and so on). Each `\n` is a page break in dialogs.

---

## 6. Art and audio

| Asset | Path | Count / size | Format | Port as |
|---|---|---|---|---|
| Twemoji 72×72 | `mods/nagmon/gfx/emoji/` | 7,562 files, 32 MB | PNG `<codepoints>.png` | **copy subset.** About 460 codes are referenced (405 in content and ~59 in generators). Ship only those (about 2 MB), or use the Twemoji SVG subset. |
| Intro | `mods/nagmon/gfx/intro/` | 120 JPG at 960×540 and 12 fps (9.7 MB), plus `intro.ogg` (128 KB) | JPG, OGG | **convert.** Encode `art_sources/intro.mp4` (5.2 MB, 1280×720, 10 s) as H.264/WebM `<video>`. Rules: skip on any tap, letterbox with the edge colour, once per launch. |
| HD tilesets (xBRZ ×4) | `mods/nagmon/gfx/tilesets/core_*.png`, written by `tools/art/upscale_tiles.py` and `pixel_upscale.py` | 9 sheets, 11.3 MB, up to **4096×8192** | PNG | **convert.** 8192 px exceeds the 4096 texture limit common on mobile WebGL. Pack only the tiles the 4 maps use into ≤4096 atlases (the city draws ~180 of 4,056 tiles). Keep per-tile 2 px neighbour borders, which avoid seams. |
| Original core tilesets | `mods/tuxemon/gfx/tilesets/core_*.{png,tsx}` | 9 PNG, 1.3 MB, plus TSX (~590 KB of tile properties) | PNG/TSX | **copy.** Needed for collisions, terrain properties and animation. |
| Map sheets (HD k=8) | `mods/nagmon/sprites/nagmon_*.png` | 13 sheets, 3.8 MB, 384×1024. Owl, owl_caped, shopkeeper, tourist, teacher, granite, mila, granny, kid, mailcarrier, hero_boy/girl/curly | 3×4 frames (step, stand, step × down, left, right, up) | **copy.** Downscale once to screen size. |
| Battle portraits (HD k=3) | `mods/nagmon/gfx/sprites/player/nagmon_*.png` | 12 (384×192; players 384×384) | back on the left, front on the right | **copy** |
| Modesty overlays | `mods/nagmon/gfx/sprites/player/*.png` (non-`nagmon_`) | 114 portraits plus heroine variants | same names as Tuxemon | **copy only the ones used** (heroine, heroineblack for avatars). Keep the review YAML. |
| Monster sheets | `mods/nagmon/gfx/sprites/battle/*-sheet.png` | 12 sheets (1.1 MB, HD 384×264) | front 64², back 64², 2 menu icons 24², in a 128×88 layout | **copy.** In the app all 41 sheets are 384×264 (scale 3): the 29 Tuxemon ones are xBRZ ×3 copies (§6.2). |
| Owl | `mods/nagmon/gfx/owl/owl_icon.png` (512², app icon and splash), `owl_portrait.png` (192²) | 312 KB | PNG | **copy** |
| Items, props | `mods/nagmon/gfx/items/` (2 badges), `sprites_obj/nagmon_wallet.png` | 20 KB | PNG | **copy** |
| Avatars | `nagmon/game_flow.py` `AVATARS` | 7: `boy_blue`, `girl_teal`, `girl_curly` (Nagmon HD), and `boy_light`/adventurer, `boy_dark`/adventurerblack, `girl_light`/heroine, `girl_dark`/brownheroine_brown + heroineblack (Tuxemon, modest versions). Fallback `boy_light`. | data | **copy as data.** Keep the keys, because existing profiles store them. |
| Grade defaults | `game_flow.defaults_for_grade` | language level 0 (grade ≤1), 1 (≤3), 2 (≤6), 3. Timer from grade 3. Max choices 3 up to grade 1. Auto-read up to grade 2. Questions per battle 3 up to grade 1, otherwise 5. | | **re-impl** (port `test_game_flow.py`, 6 tests) |
| Tuxemon art used | monster sheets (29), player/NPC sprites (adventurer, heroine…, `sign`, `rockitten` overworld), battle backgrounds and HUD (`gfx/ui/combat/{grass,night_grass}_background.png`, `battle_interior.png`, 3 island sheets, HP bars, trays: 88 KB), UI borders `gfx/borders/borders.png` (44 KB), d-pad/A/B buttons | about 1.5 MB | PNG | **copy subset**, as HD xBRZ copies made by the app build (§6.2) |
| Music used | `mods/tuxemon/music/`: `JRPG_town_loop` (town), `JRPG_royalCourt_loop` (gyms), `JRPG_battle_loop`, `JRPG_winBattleBoss`, `JRPG_gameOver`, `JRPG_mainTheme` (menu) | 6 tracks, 6.0 MB of the 147 MB total | OGG | **copy subset.** These are Yubatake's JRPG Collection, CC-BY 3.0. |
| SFX used | `mods/tuxemon/sounds/` | 63 slugs (monster calls and technique sounds), 2.4 MB | OGG/WAV | **copy subset** |
| Font | `mods/tuxemon/font/Rubik-Medium.ttf` and `Rubik-OFL.txt` | | TTF | **drop.** The app already ships `@fontsource-variable/rubik` (OFL). Keep the OFL notice. |
| Art sources | `art_sources/` | 47 files, 49 MB: owl_sheet.jpg, teachers.jpg, monsters_math_english.jpg, intro.mp4, map/battle PNGs, `batch3/` (26 PNG and a validation report) | | **keep in repo, not in the APK** |
| Art manifest and tools | `tools/art/manifest.yaml` (39 outputs: source box → game file, layout, k, `take`/`flip:`), `import_art.py`, `upscale_tiles.py`, `pixel_upscale.py`, `tools/modesty/*.py`, `tools/dev/draw_world_assets.py` | | Python (numpy/scipy) | **keep as offline Python tools.** The app consumes their output. |

**Asset budget for the new app**, if only used assets ship: roughly 35 MB (HD tiles 11, music 6, intro video 5, sprites 7, sfx 2.4, emoji 2, the rest under 2).
Measured: `app/public/game` is 21.2 MB (sprites 9.4, audio 8.5, content 1.2); it was 18.3 MB before the HD copies of §6.2.
The old APK shipped the full 147 MB of music.

### 6.1 Licences: what the new app must ship

| Item | Licence | Obligation |
|---|---|---|
| Code (Tuxemon and the Nagmon fork) | **GPL-3.0** (`LICENSE`) | A TS port of Tuxemon formulas or engine logic is a derivative work, so keep the app GPL-3.0, ship the licence and publish the source if the app is distributed. Nagmon's own files carry `SPDX GPL-3.0` too. |
| Tuxemon art (monsters, characters, portraits, concept) | mostly **CC-BY-SA 4.0** (169 mentions in `ATTRIBUTIONS.md`), some CC-BY 3.0/4.0, CC0, public domain | Credit every author. **Share-alike** applies to modified files: the modesty overlays, the long-skirt heroine and HD upscales of CC-BY-SA art stay CC-BY-SA 4.0. |
| Core tilesets | CC-BY 3.0 (George_, rubberduck, Kyrodian Legends/Midi), CC0 (Superpowers) | Attribution. The xBRZ HD copies are derivatives and carry the same credit. |
| Maps (classic) | per `ATTRIBUTIONS.md` "Maps" (CC-BY 4.0) | Attribution |
| Music used | **CC-BY 3.0** (Yubatake, JRPG Collection 1 and 2) | Attribution |
| SFX used | CC0, CC-BY 3.0/4.0, one CC-BY-SA 3.0 | Attribution per file (`ATTRIBUTIONS.md` "Sounds") |
| Twemoji | **CC-BY 4.0** (© Twitter/X and contributors, jdecked fork v15.1.0) | Attribution |
| Rubik font | **SIL OFL 1.1** | Ship the OFL text |
| Owner art (owl, NPCs, heroes, 12 Nagmon monsters, intro) | made by the owner with image generators. **No licence is stated** in the repo. | The owner must choose a licence. Until then, do not mark it CC. |

**Action:** build an in-app "Credits" screen (parent area) generated from a trimmed `ATTRIBUTIONS.md` that covers only the shipped assets.
Ship `LICENSE`, `ATTRIBUTIONS.md` and `Rubik-OFL.txt` in the APK.

### 6.2 HD copies in the app build (`tools/app/hd.py`)

The rule (SDD §10, "תמונות"): no picture is shown on the phone at more than 2× its own pixels.
Tuxemon's 1× art would be shown about 6× (a 64 px monster at ~400 device px), so the build ships an HD copy of every 1× picture.
The upscaler is the tiles' one: xBRZ 1.8 (`tools/art/pixel_upscale.py`) and the alpha bleed of `tools/art/upscale_tiles.py`.
Each frame is scaled on its own, inside a 2 px frame of its own edge pixels, so frames never blend and cut edges stay straight.

| Pictures | Scale | Shown at (device px per 1× px) | Enlargement on the phone |
|---|---|---|---|
| Monster sheets (29 Tuxemon; the 12 Nagmon ones are already ×3) | ×3, 384×264 | battle 6 (a 384 px frame); menu icon 132 px | 2.0, 1.83 |
| Technique and capture animations (85) | ×4; strips wider than 4096 wrap into rows (`frames`, `columns`) | battle 6 | 1.5 |
| Map animation `grass`, `rockitten` map sheet, `sign`, `nagmon_wallet` | ×4 (the tiles' scale) | map 8 (a 16 px tile is 128 px: a whole zoom of 2 over the ×4 atlas) | 2.0 |
| Items (6), type icons (13): 24 px | ×4, 96 px | 48 dp = 132 px | 1.38 |
| Battle backgrounds, HUD, trays, party icons, islands | ×6 (one `scale` per environment) | background covers the screen (10); the rest battle 6 | 1.67; 1.0 |
| Nagmon HD map sheets (k=8), portraits (k=3), hero cards, atlases | as they are | map 8; battle 6; card 26vh | 1.0; 2.0; 1.48; 2.0 |

- The records say each picture's scale (`db.py` docstring): monster `sprites.scale`, map `scale` and `frame`, `portrait_scale`, `sprite_scale`, `icon_scale`, animation `scale`/`frames`/`columns`, environment `battle_graphics.scale` and `island_width`/`island_height`.
- Credits: every upscaled picture has `adapted: "xBRZ xN"` and a note; a real licence also ends with ", adapted (xBRZ xN)" (not "unknown…" or the owner's "not stated yet").
- PNGs are written in the smaller of two lossless encodings: RGBA or a palette with per-entry alpha.
- Display sizes have one source: `tools/app/display.py`, written to `db/display.json`, read by `app/src/game/display.ts` and by `tests/app/test_app_hd.py`. The test fails if any shipped picture would be shown above 2× on the phone, or on a 2560×1600 tablet except the battle background and the who-plays card (SDD §10.1).
- The record fields are declared in `app/src/core/data/types.ts`; `app/tests/unit/data.test.ts` checks them against the real JSON and pictures.
- The 2× limit for monsters assumes a battle frame of at most 384 device px: the Nagmon monsters are drawn at ~190 px, so a larger frame needs new art, not a bigger upscale.
- xBRZ turns dithered texture into small squiggles: visible on the grass island sheets and the `bite` teeth; the rest looked clean at phone size.

---

## 7. `nagmon/` services: features, rules and port notes

| Module | Lines | Feature and rules | Port as |
|---|---|---|---|
| `family/profiles.py` | 362 | Id is `p` plus 5 hex chars. Name 1–16 chars, Hebrew or Latin letters, a single space, `-` or `'` allowed between letters only. No digits, niqqud, emoji or bidi marks. Case-insensitive unique. Avatar must be allow-listed. **Max 8 profiles.** Delete moves the profile to trash and it can be restored. `schema_version 2`. | **re-impl** and port `test_family_profiles` (34) |
| `family/parent.py` | 385 | **PIN 4–8 digits, PBKDF2-HMAC-SHA256, 16-byte salt, 240,000 iterations (min 200k), constant-time compare.** Rehash when the iteration count was lower. "Change PIN" needs the current PIN. **5 wrong attempts lock it for 60 s.** "בזמן נעילה גם PIN נכון נדחה" (while locked, even a correct PIN is refused). The lock is saved to disk, and a clock moved backwards does not extend it. Gate without a PIN: a×b with a, b in 12–99, excluding multiples of 10 and 11. Sensitive actions always need the PIN. `redact()` and `scrub()`. Secrets live in `secrets.json` (0600, read-merge-write) and never in `parent.json`. | **re-impl.** Use WebCrypto PBKDF2. Keep secrets in Android Keystore-backed secure storage, not in Preferences. Port `test_family_parent` (27). Also mask the PIN while typing (§8). |
| `family/screentime.py` | 593 | `ScreenTimePolicy.evaluate(now, used, since_break)` returns a `Decision` (action, reason, minutes_left, message_he, grace_seconds). `SessionTracker`: usage per local day in `usage.json` (35 days kept), a tick that crosses midnight is split, a negative tick counts 0, a jump is clipped to 120 s, grace 3 min, `at_natural_break` ends the grace at once. Pause on app background, so time in other apps is not counted. | **re-impl** and port `test_family_screentime` (39), `test_screen_watch` (5) |
| `family/calendar.py` | 415 | Shabbat and yom tov in Israel (2 days of Rosh Hashana, Yom Kippur, Sukkot I, Shemini Atzeret, Pesach I and VII, Shavuot). Outside Israel (`israel=False`), a second day. Consecutive restricted days form one window, from candle lighting on the first day to tzeit on the last. Candles = sunset − N min. Tzeit = 8.5° or fixed minutes. Holidays list includes the modern days with their shifting rules (Yom HaAtzmaut moves from Friday/Shabbat to Thursday and from Monday to Tuesday) and `solemn` days (fasts, Yom HaShoah, Yom HaZikaron, where nothing festive is shown). Uses `pyluach` and `astral`. | **re-impl** with a Hebrew-calendar library (for example `@hebcal/core`; check its licence fits GPL-3.0) and a sun library (`suncalc`). Port `test_family_calendar` (25), including the reference times. |
| `family/goals.py` | 204 | Week starts on Sunday. Weekly target K: 3 at ages 5–7, otherwise 4; the parent can override it. Rest days are removed from the denominator. `weeks_met` counts finished weeks only. The family goal is met only when **all** children meet theirs. | **re-impl** (`test_family_goals` 15) |
| `family/rewards.py` | 478 | Surprise mode is the default. Milestones are effort-based only (practice days, mastered skills, academy, weekly goals, stars) and **never screen time**. A milestone becomes a *suggestion to the parent*. The child message carries information only and never the prize name. Repeatable milestones trigger once per level. Dismiss is final. Visible-goals mode needs the parent to read a warning, and every claim needs parent approval. | **re-impl** (`test_family_rewards` 15) |
| `family/dashboard.py`, `parent_report.py` | 79 + 123 | One Hebrew conversation-starter sentence per week (priority: mastered > struggle > practised > quiet week, no blame). Report lines that each carry an explanation. | **re-impl** (7 + 6 tests) |
| `family/owl_log.py`, `values.py`, `_jsonio.py` | 95 + 48 + 142 | Owl log: JSONL per child, append-only, last 500 entries. Values: kindness quests, gentle wording, modesty filter, emphasis list. JSON I/O: atomic write (tmp, fsync, rename, `.bak`); a corrupt file is renamed `.corrupt-<stamp>` and loading falls back to `.bak`, then to defaults with a `recovered` flag, so the child keeps playing. | **re-impl** on Capacitor Filesystem (`test_family_owl_log` 6, `values` 5, `jsonio` 8) |
| `runtime.py` | 296 | Active profile, engine, per-profile save dir, `persist()` after **every answer**, pause/resume on background, ladder provider. | **re-impl** as an app store (`test_runtime` 22) |
| `quiz_flow.py` | 174 | `SubjectMap`, combo bonus (+0.5 every 3), per-battle budget, NumberPad, OrderPicker, LetterTiles buffers. | **re-impl** (14 tests) |
| `screen_watch.py` | 47 | Asks the runtime once a minute (every 3 s while a stop is pending). Warns once. | **re-impl** |
| `ai/` (providers 535, router 525, config 348, validate 686, safety 370, owl 234, canned 134, explain 207, studio 1159, text 78, fakes 145) | ~4.4k | OpenAI-compatible client with model discovery (`/models`, cached 24 h, preference match, no tts/image/embed/guard models). Router: per-model rest on 429 (per minute, or until the provider's midnight for daily quotas), one retry on 5xx, auth problems explained in Hebrew. Budget: 300 studio and **60 kid requests per child per day**. Kid chain is Groq (ZDR) → Cloudflare → canned; `purpose="kid"` admits only `kid_safe` providers. Timeouts: 45 s per request and 120 s total for the studio, 15 s and 30 s for kids. **Safety input check:** ≤120 chars, PII (email, URL, 7 or more digits, address, "my name is") is blocked and the value is not logged; distress gives "tell a trusted adult" plus `alert`; blocked topics give "ask your parents". Words are matched after stripping Hebrew prefix letters, so "מתמטיקה" is not caught by "מת". **Output check:** ≤3 sentences, ≤60 words, ≤300 chars, ≥70% Hebrew letters, no URL, no personal questions, otherwise the canned answer. FAQ match needs one keyword **and** ≥60% overlap of content words. Studio: Hebrew prompts, few-shot from the banks, one JSON repair attempt, dedupe, a pending file and parent approval into `ai_bank/`. | **re-impl** (pure TS; use CapacitorHttp so CORS does not block). Port `test_ai_validate` (26), `safety`/`owl` (29), `router` (26), `providers` (26), `config` (15), `explain` (9). The studio (20 tests) can come later as a parent-only screen. |
| `owl_service.py` | 62 | Builds the owl per child. Without keys it answers offline only. | **re-impl** (3 tests) |
| `tts/` (service 426, text 304, backends 295, cache 121, settings 88, factory 82, cli 114, player 30, pygame_player 59, fakes 95) | ~1.6k | One worker with a priority queue (speech before prefetch), generation counter so stop/interrupt is immediate, bilingual he→en, cache key `sha256(backend\|voice\|rate\|text)` with LRU at 200 MB, retry a failed backend after 60 s, Hebrew error messages. Rate −10%. Voices he-IL-HilaNeural / en-US-AnaNeural (online, only when allowed). | **re-impl:** `clean_for_speech` and `split_by_language` (port `test_tts_text` 8 and the queue semantics from `test_tts_service` 34). Backend: Android TextToSpeech through a Capacitor TTS plugin. **drop** pyttsx3, edge-tts, the pygame player and the CLI. |
| `android/` (setup 55, tts 107, jnius_tts 114, clipboard 49, crash_dialog 126) | ~450 | HOME and `SSL_CERT_FILE` (certifi), landscape hint, pyjnius TTS and clipboard, native crash dialog with share. | **drop.** Capacitor gives these: `@capacitor/clipboard`, `@capacitor/share`, a TTS plugin, `android:screenOrientation="sensorLandscape"`, `allowBackup="false"`. |
| `crash_report.py` | 232 | Report: version, build, device, Android version, UTC time, traceback, and the last 100 log lines (≤8,000 chars) within a 20,000-char report. `redact_secrets`: `gsk_…`, `AIza…`, `github_pat_…`, `gh[pousr]_…`, `sk-…`, `Bearer …`, plus every stored key. `hide_names`: every profile name, including deleted ones, becomes `<child>`. Only the last report is kept. Shared only after a parent tap. | **re-impl** with `window.onerror`/`unhandledrejection` and a native crash hook (`test_crash_report` 37, most of them portable) |
| `field_data/app_log.py` | 311 | `RingLog` of 400 lines: INFO for nagmon code, WARNING for the rest. Redaction on write. HTTP bodies are never logged. A start line with version, build, device and previous exit (normal/crash/unknown). Saved on background, on exit and before sending. Times in UTC. | **re-impl** (`test_app_log` 19) |
| `field_data/snapshot.py` | 174 | Progress JSON, `schema_version 1`. Children appear as `child-1…` **with no names and no profile ids**. Each has grade, language level, per subject and skill attempts, success, rating and last day, 14 days of minutes, limits and weekly target. Parent settings appear without PIN or keys. The city is allowed but not coordinates. Forbidden: names, free text the child typed, owl conversations, PIN, keys, exact location. | **re-impl** (`test_snapshot` 10, including "no name anywhere") |
| `field_data/github.py`, `uploads.py`, `clipboard.py` | 279 + 257 + 47 | See §7.2 | **re-impl** (`test_field_github` 42, `test_parent_field_data` 25 as UI tests). Port `tools/field/latest.py` unchanged; it stays in Python. |
| `ui/figures.py`, `ui/emoji.py` | 1748 + 143 | pygame drawing of 15 figure kinds: objects (emoji/groups/coins), clock, pie, bar_model, number_line, polygon, circle, angle, grid_area, solid (oblique, dashed hidden edges), coordinate, grid_path, pattern, grid_numbers, symmetry. Never throws; an unknown kind draws a "?" placeholder. Pastel kids' theme, y axis up. | **re-impl as React SVG components** (crisp, RTL-safe). Port the scenarios of `test_figures` (24) as snapshot tests. |
| `ui/intro.py`, `ui/game_helpers.py` | 269 + 198 | Intro frame player; `run_in_background`. | **drop** (use `<video>` and promises) |
| `keys_cli.py`, `mods/nagmon/states/*`, `effects/*`, `event/*`, `rules.py` | | pygame and Tuxemon glue: QuizState (28 KB), ProfileSelect and ParentMenu (26 KB), FieldDataState, OwlState, combat hook, intro, StartState override, damage and capture effect overrides, `ask_quiz`, `nagmon_apply_profile`, daily counter, conditions. | **re-impl** as React screens, Phaser scenes and the event interpreter. Keep the behaviour from the SDDs. |

### 7.1 Data layout (keep the same names so migration is a copy)

```
<data root>/parent.json  secrets.json(0600)  usage.json  practice.json  rewards.json  device.json
            ai_settings.json  ai_state_{studio,kid}.json  ai_pending/  ai_bank/  ai_explain_cache.json
            profiles/<id>/{profile.json, learning.json, saves/, owl_log.jsonl}   trash/<id>-<stamp>/
            crash/last_crash.txt   nagmon/app_log.txt
```

The old APK is `org.nagmon.nagmon`. It keeps its data in the app's external files dir (`getExternalFilesDir`, a Tuxemon user dir with `nagmon/` under it).
A Capacitor app with the **same package id and signing key** installs over it and can read that dir (`Directory.External`) to migrate the profiles.
A different id or key means a fresh start, and an uninstall wipes the data.

### 7.2 Field data → private repo (`YuvalNag/nagmon-data`)

| Step | Rule |
|---|---|
| Token | Fine-grained token for the data repo only, permission **Contents: Read and write**. Stored in `secrets.json["github"] = {token, repo}` (read-merge-write, so `ai_keys` is never clobbered). `repr` is masked. A valid token for a public repo is saved but sends nothing. A failing token (401/403/404/network) is not saved. Repo must match `owner/name`. |
| Check | `GET https://api.github.com/repos/{repo}`. 200 with `private:true` means connected. `private:false` means **block everything**. 401: bad or expired token. 403 or `push:false`: missing Contents permission. 404: not found. Network failure: offline. The result is cached 1 h for the status line only. **A fresh check runs before every PUT.** 5xx and rate-limit results are not cached. |
| Write | `PUT /repos/{repo}/contents/{path}` with base64 content, message `Field data: <kind>`, and **no `branch`**, so it goes to the default branch (`main`); an empty repo gets its first commit this way. Every path is unique, so no `sha` is needed. 409/422: re-check and retry, at most 3 attempts. Timeout 30 s. One upload at a time ("שולח...", sending…). |
| Paths | `devices/<install-id>/logs/<UTC>.txt`, `devices/<install-id>/crashes/<UTC>.txt`, `devices/<install-id>/progress/<UTC>.json`. `install-id` is 8 random hex chars kept in `device.json`; it is not a device identifier. `device.json` also stores the sha256 of the crash already sent. |
| Redaction | Every text goes through `redact_secrets` (key patterns plus stored keys) and `hide_names` again right before upload. The progress snapshot is built without names. |
| UI | Parent area → "GitHub ושליחת נתונים" (GitHub and data upload): status, paste token from the clipboard, send log, send progress, send last crash (only when unsent), disconnect. A confirm dialog says what is sent and where ("יישלח: התקדמות של {count} ילדים, בלי שמות…", will be sent: progress of {count} children, without names…), with singular wording for one child. Crash dialog: send to GitHub when connected, otherwise (or on failure) the share sheet. |

### 7.3 Owl (AI) privacy rules to keep verbatim

- Only the question and an age range are sent. Never a name, a profile id or history. Temperature 0.3, JSON schema `{answer, refusal, needs_parent}`.
- Every question and answer is logged for the parent, with source, reason, alert, provider, model and latency. PII questions are logged as "[הוסר: פרטים אישיים]" (removed: personal details).
- Ages 5–7 get a menu of ready-made questions only, no keyboard. The notice `OWL_NOTICE_HE` is always on screen.
- Gemini is on for kids only if the parent sets `allow_gemini_for_kids` after reading `GEMINI_KID_WARNING_HE`, and then it comes last in the chain.

---

## 8. Known pain points to avoid (`STATUS.md`, `SDD_ANDROID.md`, open items)

| Found on the phone or in the touch tour | Rule for the new app |
|---|---|
| Tapping did nothing in pygame_menu screens (quiz, who-plays, parent area). The mouse was hidden by default. | Every control is a real DOM button with a hit area of at least 9 mm. No hidden-cursor modes. |
| A **release** after a dialog closed pressed the selected button underneath ("new player" opened by itself). A held finger (5–10 frames) pressed buttons under the dialog. | Act on `pointerup` only when `pointerdown` started on the same control. Ignore pointers that began before the current screen appeared. |
| First letter swallowed; a long press typed a letter every frame; DELETE sat next to the letters and erased text; the Android keyboard never opened. | Whole-key hit areas. Fire once per press. Put Done / Space / Delete on their own row, away from the letters (Delete in red). The in-app Hebrew keyboard has 42 keys in 3×14. Do not rely on the system keyboard. |
| On-screen arrows covered answers, a tap on an arrow also sent a click, and the back button did nothing. | D-pad on the map scene only. The Android back button closes the top screen (Capacitor `backButton`). |
| Build 21 opened in **portrait**, small, because the orientation hint was ignored. | Lock landscape in the manifest and test it in an emulator e2e run (the old smoke test failed when the screenshot was taller than it was wide). |
| Stretch ×1.5 blurred text, scaling by width gave ×6 and menus overflowed, text was 2.5 mm. | Render at device pixels. Layout by min(width, height). Text ≥5 mm per line. Test at 2400×1080 (20:9) with Playwright. |
| Build 19 crashed on the first map touch (`fingerid` renamed to `finger_id`). Build 18 hit a `PermissionError` running `git` on the phone. | Use no native-only APIs at runtime without a guard and a test. Never shell out. |
| Builds 12/13 were signed with different keys, and GitHub deletes an unused cache after 7 days. | Keep the signing key in Actions secrets (`ANDROID_KEYSTORE_BASE64`, …). Fail the build on a key mismatch. Never put the key in the repo. |
| A stale `.mo` after an update showed raw msgids, and the DB stopped on a missing monster string. | Bundle the message JSON with the build. Keep a test that every used key exists in both locales. |
| Peak memory 915 MB loading a map (pytmx loaded 4,056 tiles to draw about 180). Map cache of 10. | Atlas only the used tiles. Keep at most 2 maps in memory. Measure on the phone. |
| First launch takes 30–60 s. JPEG decoding in the APK and SVG support were unverified. Hebrew Google TTS was never heard on the device. | Show a splash quickly and load lazily. Write a device checklist: open, touch, Hebrew TTS, exit and resume keeps progress, PIN, first upload. |
| Rubik lacks ✓, arrows, ♂/♀ and the Hebrew maqaf; they showed as boxes. | Add a glyph-coverage test over all UI strings. |
| PIN visible while typing (STATUS "what next" #7). | Mask the PIN (dots) with an optional "show" toggle. |
| Hidden failures: no app log on the phone, and crashes reached logcat only. | Ring log, crash report and an upload button from day one (§7.2). |
| Drawing 2.25× more pixels at 2400×1080 risked stutter. The intro audio could run ahead of the image. | Use a frame-time log line once a minute (as `FrameStats`). Use `<video>` for the intro. |

---

## 9. Suggested port order

Each milestone ends with CI green, a reviewed PR, the storybook updated, and an APK the parent can install.

| # | Milestone | Contents | Exit test |
|---|---|---|---|
| **M0** | Decisions and pipeline | Pick the Phaser version. Build scripts: YAML → JSON (content, subjects, db subset); TMX → Tiled JSON with embedded tilesets and a baked collision grid; `.po` → JSON (nagmon plus the ≈810 core keys); a used-tile atlas from the HD sheets; emoji subset. Licence files and a credits list. | Converted data is validated in CI (the content tests from §2.3 and §3). |
| **M1** | Pure cores in TS | `learning/model` (`check_answer`), `rating`, `srs`, `learner` (+ v0 migration), `content` loader, the `bank` generator plus `arithmetic.add` and `money_change`; `family/profiles`, `parent` (PIN), `_jsonio` on Capacitor Filesystem. | The ported tests pass: model, rating, srs, learner, profiles, parent. |
| **M2** | Who-plays, PIN, one child | React: who-plays cards, first-run parent PIN, new-child wizard (Hebrew keyboard, grade, modest avatar), parent gate with lockout. RTL layout and Rubik. | Playwright at 2400×1080: create a PIN and a child, pick the child, wrong PIN ×5 locks. |
| **M3** | A map and walking | Phaser: Hearthrock from the converted JSON with HD atlas tiles, player sprite from the avatar, touch d-pad (map only), collisions, camera, town music. Exits to route 8 and Steamshore are blocked. | e2e: walk from the start (29,16) to the owl, collisions hold, landscape at 20:9. |
| **M4** | One quiz | Event interpreter (subset: `translated_dialog`, `set/clear_variable`, `variable_set`, `one_of`, `create_npc`, `talk`, `ask_quiz`, `modify_money`, `nagmon_daily_*`, `profile_grade_at_least`). React dialog with pages ≤120 chars. QuizState: choice and number pad, hint, don't know, feedback with explanation, coins. `persist()` after the answer. The cashier NPC runs end to end. | e2e: talk to the cashier, answer, see feedback, coins +20; the third prize of the day works and the fourth gives praise only. |
| **M5** | One battle | Route 1 map, the `nagmon_route1` encounter, a battle scene (backgrounds, HUD, 2 monsters), the starter pick (agnite/rockitten/kroki) and the owl intro. A quiz before each attack with ×1.5/×1.0, always-hit on correct, a combo, the "normal attack" skip and the per-battle budget. Damage formula port. Gentle wording. | e2e: win a wild battle with a quiz answer; the skip gives no penalty. **APK on the phone: vertical slice done.** |
| M6 | Full learning engine | Selector (70/20/10, interleave, remediation, focus, boss, worked example), all 77 generators, `english.vocab`, figures as SVG, emoji, letters/order input, dashboard data. | All learning tests (§2.3), generator × seeds tests. |
| M7 | Chapter 1 complete | All 90 scripted events: owl gifts and first question, tourist, gardener, kitten, wallet, route 1 duel and sign, both academies (boss test, badge, rematch), owl cape. Capture with the knowledge seal and the rare chain. Saves per profile. | Port `test_world_scripts` checks (msgids in both locales, slugs exist, positions not on collision tiles, boss 2/3 pass simulation). |
| M8 | Screen time and calendar | `screentime`, `calendar` (Shabbat, yom tov, holidays, DST), watcher with natural-pause stop, pause on background, Shabbat message on who-plays. | `test_family_screentime`, `calendar`, `screen_watch` ported. |
| M9 | Parent area | Dashboard with explained numbers, report, conversation prompt, weekly goal, surprise celebrations, values, per-child settings (subjects, focus, language level, timer, questions per battle), trash and restore, change PIN, credits. | `goals`, `rewards`, `dashboard`, `parent_report` tests. |
| M10 | Field data | Ring log, crash capture and report, progress snapshot, GitHub connect, check and PUT, confirm dialogs. | `test_field_github`, `app_log`, `snapshot`, `crash_report` ported; first upload from the phone. |
| M11 | TTS | Android TTS plugin, `clean_for_speech`, he/en split, queue and interrupt, auto-read by grade, speaker buttons. | `test_tts_text` plus queue tests. Hebrew heard on the device. |
| M12 | Language ladder | `bilingual.compose` levels 0–5 for dialogs and the English-word cards. | Port `tests/tuxemon/test_bilingual.py` scenarios. |
| M13 | Owl and AI | Offline FAQ owl first, then the Groq kid router, safety, owl log; later "explain again" and the parent studio. | `test_ai_*` ported (fake transport, no network). |
| M14 | Polish | Intro video, HD art everywhere, owl caped portrait, performance log, migration from the old APK data dir. | Device checklist (§8). |
