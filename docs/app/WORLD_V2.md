# World v2: a living world (talkable people, working objects, interim quests, coins that matter)

Status: design proposal, docs only (no code). Date: 2026-10-22. Branch `app/world-spec`. Language of the game is Hebrew (RTL); this document is English with Hebrew examples. No family details appear here.

Trigger (the parent, translated): "the world is not alive enough". Four asks: (1) interactive things in houses and places that DO something, like the PC in a Pokemon house; (2) every NPC is a definition (a persona card) connected to a cheap AI model so it answers differently each time; (3) interim quests from all kinds of people, with variety, chains and rewards, and characters that do not repeat themselves; (4) more value for money: coins must matter.

Reading guide: section 0 is the one-page answer. Section 1 is what the repo has today (measured). Section 2 is research. Sections 3 to 9 are the design (a to f of the brief). Section 10 is the build plan W1 to W6, 11 the art and audio list, 12 the questions for the parent, 13 the sources. "Soft" means a blog, a guide, a vendor page, or something I could only read as a search snippet; "memory" means I am writing it from general knowledge and did not check it in this session. I give no number from a soft source without saying so.

---

## 0. The answer in one page

| # | Decision | Recommendation |
|---|---|---|
| a | Runtime for NPC speech | **Hybrid, offline first.** Every NPC has shipped, reviewed line pools (deterministic, free, safe, always on) chosen by a small Dialogue Director with anti-repeat memory. On top, an **optional live line** from a cheap LLM, only when the parent enables it with their own API key. The model writes only the *frame* (a greeting, a reaction, a bit of small talk). **Rules, prices, quest steps, questions, answers and every science fact stay authored.** The child never types to an NPC: they tap topic chips. Safety filter before and after, caps per day, any failure falls back to the pool. |
| a | Cost | About **0.1 to 0.4 US dollars per child per month** at the cap of 40 live lines a day (section 4.9). Not a cost problem; the real limits are terms of service, Hebrew quality and consent. |
| a | Provider | Provider-agnostic (OpenAI-compatible, as the old app already did). Default recommendation **Groq with the parent's own key and Zero Data Retention**, because Google's Gemini API terms say 18+ and not for apps directed to under-18s; Gemini Flash-Lite is the quality option only if the parent accepts that (open question 2). A **Hebrew quality gate** (60 lines, native review) decides the model before anything ships. |
| b | NPC data | One YAML per NPC (`mods/nagmon/npcs/<slug>.yaml`) plus a lines file. A **placement resolver** (a pure function of day, phase, progress and a seed) decides who is where, so nobody is everywhere. NPC memory is a small local record: friendship level 0 to 3, flags, last 8 line ids. No text, no names, no PII. |
| c | Cast | **53 NPC archetypes** (section 6): 26 for Hearthrock and Route 1, 27 for the solar chapter, with Hebrew names that are ours. |
| d | Quests | 13 quest types, a daily board and a weekly one, template plus slots, cooldowns and a "recently posted" memory so nothing repeats. **35 quests catalogued** (section 7). Wrong answers never fail a quest. SEL scenes pay equally for every choice. |
| e | Objects | 17 working objects. **Slice 1 (W2): mailbox, PC (boxes, items, mail, learning journal), bookshelf, TV, fridge, notice board.** |
| f | Economy | Today coins run out of things to buy once nets are bought (section 9.1). v2 adds sinks with meaning: cosmetics, home decor, creature accessories, NPC gifts, a **Town Fund** that visibly changes the town, plus a wish list. A soft daily cap on non-battle coins. A child can buy about a quarter of the catalogue per chapter, so choices matter. **Coins never buy learning.** |
| g | Plan | W1 NPC engine and pools (M-L), W2 objects slice 1 (M), W3 quests (L), W4 economy v2 (M), W5 cosmetics, home and the rest of the cast (L), W6 optional live AI (M-L). The AI is last on purpose: pools deliver most of the value. |
| i | Parent questions | Six (section 12), each with a default. |

---

## 1. What the repo has today (read from `nagmon-app`, commit `6eade51`)

| Finding | Where | Why it matters |
|---|---|---|
| Only a few people can be talked to at all: the cashier, the shop, nurse and pet in the houses, the home chest and nest, the two tutors and the seven solar people. Every other Hearthrock talk event (tourist, gardener, kid, granny, mail carrier) **waits for actions the interpreter does not run yet** (`add_item`, `add_monster`, ...) and never runs. | `app/src/app/playConfig.ts` (`TALK_TO`), `core/world/events.ts` (`ACTIONS`) | The "NPCs say fixed text" complaint is optimistic: half of the town says nothing. W1 fixes this first. |
| One event script per person: a talk event with a **fixed msgid**, a question, then events gated on the answer's variable pay coins 3 times a day. | `mods/nagmon/maps/classic_hearthrock_city.yaml`, `tools/app/solar_missions.py` | No variation, no memory, no schedule. Same line on every visit. |
| NPCs are created by `create_npc <slug>,x,y` with fixed coordinates. | map YAMLs | Everyone is always at the same spot. |
| Solar zones are 30x20 tiles with **2 to 3 people each** and one mission per zone paying 10, 12, 15, 18 and 25 coins, or 3 coins for a daily question. A wild win at level 10 pays 15. | `tools/app/solar_texts.py`, `docs/app/BATTLE_V3.md` 5.4 | Talking to people pays less than fighting, and there are few people. |
| 20 NPC map sheets exist (owl, astronomer, Mila, Granite, granny, sage, grey hood, kid, mail carrier, moon engineer, rover driver, shopkeeper, teacher, tourist, three heroes ...). A `mailcarrier` sheet is already drawn. | `mods/nagmon/sprites/` | Some of the cast is already drawn. |
| Names in use: the owl (הינשוף החכם), אבי (cashier and shopkeeper), האחות דנה, טום התייר, הגננת מיכל, יואב, סבתא רינה, הדוור דני, מילה, האסטרונומית. | `mods/nagmon/l18n/he_IL/.../nagmon.po` | Section 6 keeps these and adds new ones. |
| Money: wild win `5 + level` coins, Keeper `15 + 2L`, guardian `50 + 5L`, seal 5, Steady and Bright stars 2 each, Brilliant +1 (max 5), cashier 20 x 3 a day, first lesson pass 40, repeat 10, daily gift 10 to 20, daily chest 30 to 40, kid and granny 30. | `battleNumbers.ts`, `economy/loot.yaml`, `lessons.ts` | Sources are fine. |
| Sinks: nets 30 and 90, snacks 10 to 60, medicine 15 to 110, helpers 15 to 20, friendship cards 45 and 60, evolution cards 120, 200 and 450, zone fares 10 to 25. **Cosmetics, decor, mirror, trophy shelf, mailbox at home: "not started".** | `economy/items.yaml`, `docs/app/FEATURES_STATUS.md` | After the first nets and a few cards there is nothing to want. That is the "no value for money" problem. |
| A parent-controlled AI setting exists (`ai: {provider, base_url, model, enabled}`, default `none`, `enabled: false`) and a Keystore-backed secret store (`ai_key.<provider>`). **The new app has no LLM client yet.** The old Python app had a complete one (router, safety, owl, canned answers, validators, studio). | `app/src/core/family/parent.ts`, `app/src/platform/secrets.ts`, `docs/kids/SDD_AI.md`, `nagmon/ai/*` | W6 is a port, not an invention. |
| Prior design that this document builds on: roles table, NPC memory idea ("hearts 0 to 3"), world objects, the Moon zone population, a "Postal clerk" role (all in `FEATURES.md` 5, branch `app/features-spec`), the SEL mechanics M1 to M14 (`docs/app/SEL.md`), battle, evolution cards and coin numbers (`BATTLE_V3.md`), shelves (`items.yaml`). | see sources | World v2 turns "roles" into **data and an engine**. |

Two files named in the brief were not on `nagmon-app`: `FEATURES.md` is on branch `app/features-spec`, and the trips text is `TRIPS.md` on `app/trips-spec` (Hebrew). I read both from those branches.

---

## 2. Research: what other games do, and what we take

Sources are in section 13 with a marker for how I read them.

### 2.1 Games

| Game | What it does (checked or memory) | What we take | What we leave |
|---|---|---|---|
| **Pokemon** (Red/Blue to Gold/Silver and later) | The PC is a menu in every house and Center: boxes for stored creatures, item storage, later mail (Bulbapedia: "Someone's PC" becomes "Bill's PC" after meeting the developer; the player withdraws and deposits in Boxes; checked). Berry trees give **one berry per tree per day** in Gold/Silver/Crystal (Bulbapedia, snippet; real-time or in-game clock unverified). Pokemon Center nurse heals for free, the Mart sells consumables (memory). Most NPCs are one-line signposts, a few are trainers, gift givers, shop clerks, or gate guards (memory). Item balls lie on the ground once (memory). | The PC as a **hub object** (boxes, items, mail, journal). Daily berry bushes. Free healer plus a shop. A mix of roles where most NPCs are cheap and a few are important. | Random encounters in houses, fixed one-line signposts (the problem we are solving). |
| **Stardew Valley** | Ten-heart friendship meter, 250 points per heart (wiki). One gift a day, two a week; gift tastes per villager (loved, liked, neutral, disliked, hated) shown in a log (wiki). Talking daily helps and not talking slowly **decays** friendship (wiki). A **Help Wanted board** posts a random quest each day; accept, then two days to finish, no penalty for failing (wiki). Villagers have daily schedules (memory; the wiki search did not return the schedule page). | Hearts per NPC, gift tastes (loved, liked, ok only), a daily board, no penalty. Schedules by day part. | **No decay, no hated gifts**, no deadlines. A child must never lose anything. |
| **Animal Crossing: New Horizons** | Visitors with their own days and hours: Wisp at night, Gulliver on weekdays, Daisy Mae on Sunday mornings, Kicks about once a week, Pascal can visit any day (GameSpot, iMore, Gfinity). Mail from villagers and Flick sends a reward by mail after three bugs (Gfinity). | **Visitors who come and go** (the cure for "everyone is always there"); letters with gifts attached; each visitor has a reason to come back. | Real-money-like turnip speculation. |
| **Dragon Quest XI and Ni no Kuni** | Optional quests are marked on the map by the giver; most are short, local, humane errands (DQ XI purple dot, German walkthrough). Ni no Kuni has 136 "errands"; Ni no Kuni II about 175, almost all one-step fetch quests that pay a currency (Tokens of Gratitude) spent on kingdom growth (GamesRadar, GamerGuides). | A **thin-quest, thick-population** approach: many small errands from many people. A currency whose sink is a *visible* town (our Town Fund). | One-step fetch quests as the only type. |
| **Yo-kai Watch** (memory, not checked) | Town side quests ("requests") from ordinary people, many solved by befriending or finding the right creature; the town is the content. | Requests tied to our creature collection ("show a creature that ..."). | |
| **Undertale** (memory, not checked) | Characters notice what the player did before and comment on it; dialogue changes with earlier choices. | **"They remember"**: a remark about the last thing the child did (also SEL M4). | Anything dark. |
| **Disney Dreamlight Valley** | Each character has a **small, finite set (about 3 to 5) of friendship quests** unlocked by friendship level; daily chats and favourite gifts raise friendship (GodisaGeek, GameSpot, snippets). | Per-NPC **chains gated by friendship level**; finite and authored, so no grind. | |
| **Spiritfarer** (memory, not checked) | Passengers have wishes and stories; helping is the game, and goodbyes land because you knew them. | Few memorable people beat many bland ones: **give every main NPC a want and a small arc.** | |

### 2.2 LLM-driven NPCs: what is known

| Source | Lesson for us |
|---|---|
| **Generative Agents** (Park et al., UIST 2023; arXiv 2304.03442) | Believability came from a **memory stream** (natural-language record), **retrieval** by recency, importance and relevance, and **reflection** (triggered when the importance sum passes a threshold, about 2 or 3 times a day). We copy the *idea* in a tiny deterministic form: memory = a few flags and recent line ids, retrieval = code, no free-text memory (no PII, no drift). |
| **Ubisoft NEO NPC** (GDC 2024, with Inworld and Nvidia) | A prototype only. Ubisoft stressed that **writers define each NPC's backstory, knowledge and conversational style**, and the AI works inside that. That is our persona card. |
| **Inworld, Convai** (soft: a 2026 guide by Cinevva) | Inworld has moved toward B2B infrastructure; Convai is usage-priced with a small-studio plan; hosted NPC platforms charge per use and make cost forecasting hard. Main blockers named by the guide: cost, latency, hallucination, consistency with the writer's voice. We use a plain OpenAI-compatible call with **the parent's key**, so there is no platform fee and no vendor lock-in. |
| **AI Dungeon** (Vice, The Register, Latitude's own FAQ) | A 2021 filter added under pressure **blocked innocent text** (a "four watermelons" example), was introduced without telling players, and **human review of private stories** caused a backlash; the model sometimes produced the bad text unprompted. Lessons: filter the *output* (the model can be the source), keep filters narrow, **tell people what is checked**, and do not have humans read children's play. |
| **FTC 6(b) inquiry into AI companions** (Sept 2025; snippets) | Regulators are looking at chatbots that act as companions for minors: testing for harm, limits on minors, parental information, COPPA. We therefore build **no open chat and no companion**: NPCs talk about the game world in short lines. |
| **Old Nagmon owl** (`docs/kids/SDD_AI.md`, `RESEARCH_AI_PROVIDERS.md`) | Already solved: kid-safe provider chain, no name or id sent, input and output safety, canned fallbacks, daily budget, parents can read the log. Reuse it. |

### 2.3 Rules and terms that bind the AI part (not legal advice)

| Item | Finding | Effect |
|---|---|---|
| Gemini API terms (effective 2026-03-23, via search) | Must be 18+; services must not be used in apps "directed towards or likely to be accessed by" under-18s. Paid-tier prompts are not used to improve Google products; unpaid usage may be (and may be human-reviewed). In the EEA, UK and Switzerland the paid-tier data terms apply to all services. | Gemini is **not the default** for a child's game, even though Flash-Lite is cheap. The parent decides (Q2). |
| Groq (older research, `RESEARCH_AI_PROVIDERS.md`, marked soft there) | Account holder 18+; for apps used by minors the **customer is responsible**; no training on customer data; Zero Data Retention switch in the console. | Default candidate, with ZDR on. Hebrew quality of the open models unverified (gate). |
| COPPA amended rule (FTC, Federal Register 2025-04-22) | Effective 2025-06-23; **compliance date 2026-04-22 (passed)**; privacy notices must name third parties that receive children's data; biometric identifiers widened. | If the app is ever offered to other families, a call to a third-party model is a disclosed third party, and the child's IP address is a persistent identifier. Our design sends **no child data in the prompt**, and the call is made with the *parent's* account. Lawyer review before any public release. |
| GDPR Art. 8 (memory) | Age of digital consent 13 to 16 by member state. | Same: parent consent, data minimisation. |
| Israel, Privacy Protection Law Amendment 13, in force 2025-08-14 (law-firm summaries; no minors-specific clause found) | Personal information widened to online identifiers (IP addresses); stronger enforcement. | Treat the IP address as personal data; say so in the consent text. |

---

## 3. Principles

1. **Offline first.** The world is fully alive with no network, no key and no AI. The AI only adds variety.
2. **Authored truth, generated frame.** Rules, numbers, prices, questions, answers and science facts are always ours. The model never decides anything that matters.
3. **Nothing is lost or punished.** No decay, no deadlines, no hated gifts, no failed quests; the wallet never goes below zero (as today).
4. **No one is everywhere.** An NPC is in exactly one place at a time and sometimes away.
5. **Remember a little, store nothing personal.** Memory is flags and ids.
6. **Kind, modest, Israeli ordinary life.** `SDD_MODESTY.md`; no romance, no fear, no ridicule; SEL scenes pay equally for every choice (`SEL.md` 6.2).
7. **Everything is data.** A new zone or person is a YAML file plus art, not code (`FEATURES.md` 5.5).
8. **Children do not type to NPCs.** Chips only.

---

## 4. (a) Talking: the hybrid runtime

### 4.1 The shape

```
child taps NPC (or a topic chip)
        |
  Dialogue Director  (pure TypeScript, deterministic, testable)
   1. what is the situation?   intent + context (section 4.2)
   2. who may speak it?        authored-only intents never leave step 3
   3. pick a PoolLine          filter by conditions, drop recent, weight, seeded pick
   4. if AI enabled AND intent is "llm_ok" AND budget left AND roll < ai.share:
          ask the LiveLineSource (section 4.5), 1.2 s patience
          validate and filter (section 4.6)  ->  ok: use it, else: the pool line
   5. show the line; record id (not text) in the NPC's memory
```

The Director is one interface, `LineSource.next(request): Promise<Line | null>`, with two implementations: `PoolSource` (always) and `LiveSource` (optional). W1 ships only `PoolSource`; W6 adds `LiveSource` without touching callers.

### 4.2 Intents: what may be generated

| Intent | Example | Source | Live allowed |
|---|---|---|---|
| `greet_first` (first talk today), `greet_again`, `farewell` | "בוקר טוב! הדואר כבר הגיע." | pool, or live | yes |
| `idle` (ambient, when the child stands near) | a bubble over a head | pool, or live | yes |
| `topic:<id>` (a chip the child tapped) | "מה את אוהבת לאפות?" | pool; **facts attached verbatim** | yes, frame only |
| `react:<event>` (just got a badge, caught a creature, new day after a quest) | "ראיתי שהשגתם את תג הירח!" | pool, or live | yes |
| `gift:<taste>` | reaction to a gift | pool, or live | yes |
| `joke` | one-liners | **pool only** (humour is the riskiest thing to generate) | no |
| `quest_offer`, `quest_step`, `quest_done` | the task text | **authored only** | no |
| `shop_*`, price talk | | authored only | no |
| `quiz_*`, `explain`, `fact` | | authored only (the learning engine) | no |
| `sel_scene:*` | dilemma replies | authored only, counsellor reviewed (`SEL.md` 6.2) | no |
| anything about feelings, family, the child | | not an intent; there is no such chip | no |

### 4.3 Pools: how lines are written, picked and kept fresh

A pool line:

```yaml
- id: danny.greet_first.014
  text: "בוקר טוב! הגיע היום מכתב אחד שנראה לי מיוחד."
  when: {phase: morning, friendship_min: 1}      # all optional
  weight: 1.0
  gag: false              # a running gag is shown at most once per 3 visits
  shape: greet_weather    # a tag for the global shape ring
```

Picking (deterministic given a seed, so tests can pin it):

```
cands  = lines(npc, intent) filtered by `when`
fresh  = cands minus npc.recent (last 8 ids shown by this NPC, saved)
if fresh is empty: fresh = the 3 cands seen longest ago          # never silent
score  = weight * (1 + 0.5*specificity) * (unseen ? 3 : 1/(1+seenCount))
         * (shape in the global ring of 12 recent shapes ? 0.3 : 1)
         * (gag and shown in the last 3 visits ? 0 : 1)
pick   = weighted random with seed hash(day, npc, visitNumber)
```

Targets, so a child who talks twice a day for two weeks does not see a repeat inside the ring of 8:

| NPC class | Lines per NPC (greet + idle + farewell + react + topics) | Count of NPCs | Lines |
|---|---|---|---|
| Main (owl, shop, nurse, tutor, granny, gardener, mail carrier; astronomer, Mila, the space owl and the four zone mission givers) | 60 to 80 | 14 | about 980 |
| Regular (the rest of the named cast) | 30 to 40 | 34 | about 1,190 |
| Wanderers, robots and animals | 15 to 20 | 5 | about 90 |
| **Total** | | 53 | **about 2,260 lines, about 34,000 Hebrew words** |

Authoring: draft with the Studio (the old `nagmon.ai.studio` already has `quest` and review flows), then a native Hebrew reviewer and one modesty and safety pass; about 500 lines per review day. Each line is under 90 characters and two sentences. The `{hero}` slot (the child's name) may appear in **shipped pools only**, filled on the device; it never goes into a prompt (section 4.7).

### 4.4 Topics and chips

A child can ask an NPC about up to 4 topics, shown as big chips with a picture (so ages 5 to 7 need no typing): for example `[🌤 the weather] [🏠 this town] [⭐ a fun fact] [📮 any news?]`. The topics each NPC offers come from the persona card's `knows.topics`; some unlock at friendship 1 or 2 (a reason to come back). A `fun fact` chip delivers a **verbatim fact card** from `facts.yaml` or the lesson notes, never model text.

### 4.5 The optional live line

When it runs: `ai.enabled` is true (parent PIN), a key exists in secure storage, the intent is live-allowed, the NPC's `ai.enabled` is true, today's budget is left, and a roll under `ai.share` (default 0.5) succeeds. The other half of the time, and every time anything fails, the pool speaks. Half also halves cost and avoids dependence.

**What the model may be told** (the whole prompt is built from this list and nothing else):

| Allowed in the prompt | Not allowed, ever |
|---|---|
| The persona card (name, role, age feel, voice, quirks, what the NPC knows and does not know, what it never says) | The child's name, the partner's given name, the profile id |
| The intent and a topic id | Grade, age (only a band A, B or C: 5 to 7, 8 to 10, 11 to 14), scores, wrong answers, ratings, weak subjects, minutes played |
| Place (a map title), day part, the world sky (section 8, TV) | Location, device, time zone, parent settings, anything about family |
| **Coarse progress as tokens**: badges earned (by name), zones unlocked, chapter stage, the partner's species and subject | Free text of any kind from the child |
| Friendship level as a word (stranger, familiar, friend, close) | Anything the child typed (nothing is typed) |
| Up to 2 memory remarks built by code from whitelisted flags ("the child helped find a glove") | Memory written by a model |
| The NPC's own last 3 lines (already validated), to avoid repeating | |
| **Fact pack**: only the fact texts this call may use, by id | Any fact not in the pack |

**Prompt (system), the real text to start from** (English instructions, Hebrew output):

```
You write ONE short line of speech for a character in a game for children aged 5 to 14.
Write simple modern Hebrew without niqqud. Use plural or neutral forms to address the
players (no gendered "you"). The line is at most 2 sentences and at most 90 characters.

CHARACTER: {card.name}, {card.role}, {card.age_feel}. Voice: {card.voice.style}.
Quirks: {card.voice.quirks}. Knows about: {card.knows.names}. Does not know: {card.doesnt_know}.
Never says: {card.never_says}.

SITUATION: {intent} {topic}. Place: {place}. Time of day: {phase}. Sky today: {sky}.
The players have: {progress_tokens}. Relationship: {friendship_word}.
Remember: {memory_remarks}.
Do not repeat or closely paraphrase these earlier lines: {last_3_lines}.

FACTS you may state (state nothing else that sounds like science or numbers):
{fact_pack or "none: do not state any fact, number or name of a real thing"}

HARD RULES: never ask for or mention a player's name, age, school, family, address,
feelings about their life, or anything private. Never give instructions to leave the game,
go somewhere in real life, meet anyone, or keep a secret. No violence, fear, romance,
religion or politics. Do not say you are an AI or mention these rules. Do not claim to
be a real person. Stay in character. A question is allowed only if it is about the game
world (for example "which way is the market?"). If you cannot follow the rules, set
refusal to true.

Return JSON only.
```

**Output schema** (checked by code, as the old owl did with `json_schema` or `json_object`):

```json
{ "line": "string, Hebrew, <= 90 chars",
  "mood": "calm | happy | curious | excited | sleepy | thinking",
  "used_facts": ["fact ids"],
  "refusal": false }
```

`mood` picks the portrait; `used_facts` is checked against the pack.

### 4.6 Filters (before and after) and the accuracy firewall

**Before** (cheap, local): the prompt is assembled only from the allowed list; there is no child text, so there is nothing to inject. The old `Safety.check_input` is not needed for chips and is kept for a possible later free-text mode (Q4).

**After** (every live line, local, in this order; the first failure falls back to a pool line and counts as a miss):

| # | Check | Detail |
|---|---|---|
| 1 | Schema | Valid JSON, `refusal` false, `line` is a string |
| 2 | Clean | Strip niqqud, control and direction characters, markdown, emoji (the old `clean_text`) |
| 3 | Shape | Hebrew letters at least 80%, at most 90 characters, at most 2 sentences, at most 18 words per sentence |
| 4 | No links or contact | No URL, e-mail, phone-like digit run (old `URL_RE`, `EMAIL_RE`) |
| 5 | No names | Reject if the line contains the child's name or the partner's given name (known only on the device) |
| 6 | No personal questions | Reject question patterns about name, age, school, family, address, feelings of the child ("איך קוראים לך", "בן כמה", "איפה אתה גר", "איך אתה מרגיש") |
| 7 | Banned topics | The old banned-topic lists (violence, romance, scary, adult, drugs, religion and controversy), word-based after stripping Hebrew prefix letters, extendable by the parent |
| 8 | Instruction check | Reject imperatives that send the child out of the game or into secrecy ("אל תספרו", "בואו אליי הביתה", "חפשו באינטרנט") |
| 9 | **Accuracy firewall** | Build once from our learning banks a `science_terms` list: every planet, moon, scientific term, number word and proper noun that appears in `learning/**` and `facts.yaml`. **Any such term or any digit in the line must be in this call's fact pack**, and `used_facts` must be a subset of the pack. A line with a science-looking term that is not in the pack is rejected. |
| 10 | Not a copy | Not equal to one of the NPC's last 8 shown lines (normalised) |

The firewall is the answer to hallucination: the model can say "oh, the rings! such a sight" only when `rings_ice` is in its pack, and when it states a fact it is **our sentence** in the pack, because facts are delivered as app-authored cards and the model writes the frame around them. The AI Dungeon lesson applies too: the filters are narrow lists we can read, and the parent can see what was said (section 4.8).

### 4.7 Privacy by construction

* The call goes **from the phone to the provider with the parent's key**; we run no server and see nothing. The key lives only in the Keystore-backed secret store (`ai_key.<provider>`), never in a file, log or report (as `secrets.ts` already guarantees).
* The prompt contains no identifier of the child. The provider still sees the phone's IP address and the persona text; the consent screen says so (Israel Amendment 13 treats online identifiers as personal data).
* **Logging is ids only**: `{day, npc, intent, source: pool|live|cache|fallback, reason}`. No line text in any log, report, upload or the family data repo. Field data and the parent report never include live text.
* A small **local ring** of the last 30 live lines (text) is kept for the parent viewer for 24 hours, then deleted (Q3). It is never uploaded.

### 4.8 Controls, caps, caching, offline

| Control | Default | Notes |
|---|---|---|
| Master switch `ai.enabled` | **off** | Parent PIN. Consent screen first (section 12, Q2 and Q3). |
| Provider, base URL, model | none | Exists in settings. Presets: Groq, Gemini (with the warning), custom OpenAI-compatible. |
| Live lines per child per day | 40 | The old router's `Budget(kid_per_child_per_day=60)` is the model. Counted on success. |
| Per NPC per day | 6 | So one NPC cannot eat the budget. |
| Minimum gap between calls | 4 s | Prefetch counts. |
| Timeout | 3 s hard; the child never waits | Prefetch when the NPC becomes `talkable` (a few tiles away); show the pool line at 1.2 s if the live one is not back. |
| Rate-limit or error | rest the provider (old router: 60 s or until midnight) | Status in plain Hebrew in the parent screen, as today. |
| Share | 0.5 | Half the eligible lines are live. |
| Kill switch per NPC class | on | The parent can allow live lines only for wanderers and visitors, never for tutors and shopkeepers. |
| **Line bank** | on when AI is on | Each validated live line is stored locally (per NPC and intent, up to 20) and re-served offline later, so the world stays fresh when the network is gone. A line is shown again only after the ring drops it. |
| **Promotion loop** | manual | The parent (or we, on our own phones) can export the bank in the Studio, review lines, and promote the good ones into the shipped pools in a later content release. Live use becomes a free line-writing assistant. |
| Offline | always fine | Pools plus bank. |

### 4.9 Cost per child per day

Assumptions: one live line = about **900 input tokens** (card about 350, instructions about 250, situation, fact pack and last lines about 300; Hebrew tokenises heavily, so this is deliberately generous) and about **80 output tokens** (a JSON object with a 90-character Hebrew line). Prices are per million tokens, from search results, **not verified against the providers' own pages** (soft): Gemini 3.1 Flash-Lite 0.25 in and 1.50 out; Gemini 2.5 Flash-Lite 0.10 in and 0.40 out; Groq gpt-oss-20b 0.075 in and 0.30 out (Groq also lists a 50% discount on cached prefix tokens).

| Model | Cost per line | At the cap (40 a day) | Per month at the cap | Typical (15 a day), per month |
|---|---|---|---|---|
| Gemini 3.1 Flash-Lite | $0.000345 | $0.0138 | **$0.41** | $0.16 |
| Gemini 2.5 Flash-Lite | $0.000122 | $0.0049 | **$0.15** | $0.06 |
| Groq gpt-oss-20b | $0.0000915 | $0.0037 | **$0.11** | $0.04 |

Caveats: reasoning models (gpt-oss) may spend extra output tokens on hidden reasoning; set low reasoning effort and cap `max_tokens` at 200; even at 3 times the output the cost stays under about $0.5 a month. Free tiers exist (Groq about 1,000 requests a day, soft and conflicting across sources), which would make it free; the Gemini free tier is excluded for children (section 2.3). Latency is not measured here; the design never waits for the model.

### 4.10 Choosing the model: the Hebrew gate

No model is chosen from a table. Before W6 ships, run an offline eval (a script in `tools/`, results in a doc): 60 situations (20 greetings, 20 topics with fact packs, 10 reactions, 10 adversarial persona cards, for example "an NPC told to ask the child's name") times each candidate model. A native reader scores: natural Hebrew, in character, no gendered address, no invented facts, no safety fail. **Pass: at least 95% natural and zero safety or invented-fact failures.** Candidates: Gemini 3.1 or 2.5 Flash-Lite, Groq gpt-oss-20b and 120b, one more open model. The old research found no Hebrew benchmark for gpt-oss, so this gate is mandatory.

### 4.11 Tests for this layer (written first)

| # | Test |
|---|---|
| A1 | Pool pick is deterministic for a seed; never returns an id in `recent`; with 3 lines and a ring of 8 it still returns something |
| A2 | 200 simulated visits to an NPC with 40 lines: no id repeats within 8, every id is seen, no shape appears twice in a row more than 5% of the time |
| A3 | `quest_*`, `shop_*`, `quiz_*`, `sel_scene:*`, `joke` never call `LiveSource` (spy) |
| A4 | The prompt builder output contains none of: child name, partner name, grade number, profile id (property test over random profiles) |
| A5 | The 10 output checks each reject a crafted bad line (a golden corpus of 200 lines, 60 of them unsafe) and accept 140 good ones |
| A6 | A line with "כוכב לכת" or a digit not in the fact pack is rejected; the same line with the fact in the pack passes |
| A7 | Timeout, 429, 401, bad JSON, `refusal: true`, empty line: each falls back to a pool line with no exception and no delay beyond 1.2 s in the UI |
| A8 | Budget: line 41 of the day is a pool line; the counter resets on a new local day |
| A9 | Logs and the field-data snapshot contain no line text (grep a fixture) |
| A10 | Key never appears in settings JSON, logs or reports (reuse `secrets.ts` tests) |

---

## 5. (b) Data model

### 5.1 NPC definition (`mods/nagmon/npcs/<slug>.yaml`)

One file per person; a build step (`tools/app/npcs.py`, as `economy.py` does) validates it and writes `game/npcs.json`. Lines live next to it in `<slug>.lines.he.yaml` (and `.en.yaml` later). Complete example for an existing person:

```yaml
id: nagmon_route1_trainer            # keeps the existing slug and sprite
name_he: דני הדוור
name_en: Danny the Mail Carrier
role: mail_carrier                   # see role list in 5.3
age_feel: adult                      # child | teen | adult | elder | robot | animal
sprite: nagmon_mailcarrier
portrait: null                       # later
voice:
  style: "cheerful, brisk, loves puns about letters, never rude"
  quirks: ["checks an imaginary watch", "calls the weather 'delivery conditions'"]
  catchphrases: ["על הדואר אפשר לסמוך!"]
  register: simple                   # simple | playful | formal | gentle
personality: [punctual, friendly, a little forgetful about faces]
knows:
  topics:
    - {id: weather,  label_he: "מה מזג האוויר?", icon: "1f324", unlock: 0}
    - {id: town,     label_he: "מי בעיר היום?",  icon: "1f3d8", unlock: 0}     # who-is-where hint
    - {id: letters,  label_he: "יש לי מכתב?",    icon: "2709",  unlock: 0}
    - {id: route,    label_he: "איך הדרך צפונה?", icon: "1f6e4", unlock: 1}
  facts: [water_cycle, seed_tree]    # fact ids he may use, from facts.yaml
doesnt_know: [what is inside letters, anything about families]
never_says: [names of real brands, anything scary]
goals:                               # used by the persona card and by quests
  - "deliver every letter before the evening"
  - "wants to see the sea one day"
likes:                               # gift tastes: only loved, liked, ok
  loved: [biscuit]
  liked: [berry, bun]
schedule:
  default: {map: hearthrock, spot: post_box}
  rules:
    - {when: {phase: morning},   at: {map: hearthrock, spot: post_box}}
    - {when: {phase: afternoon}, at: {map: hearthrock, spot: market_corner}}
    - {when: {phase: evening},   at: {map: route1,     spot: sign_post}}
  roam: null
  appears_if: {flag_all: [intro_done]}
offers:
  mail: {carrier: true}              # brings the daily letter to the mailbox
  quests: [q_mail_deliver, q_letter_lost]
  shop: null
  tutor: null
relationship:
  gain: {first_talk_today: 1, new_topic: 1, gift_loved: 3, gift_liked: 2, gift_ok: 1, quest_done: 3}
  levels: [0, 4, 10, 20]             # points to reach level 0, 1, 2, 3
  l3_gift: {item: sticker_pack, n: 3}
  memory_flags: [delivered_for_child, asked_about_sea, got_favourite_gift]
ai:
  enabled: true
  intents: [greet_first, greet_again, idle, topic, react, gift, farewell]
  share: 0.5
  max_live_per_day: 6
safety:
  age_min_band: A
  heavy_topics: none
```

### 5.2 A line, a topic, a mail letter

Lines are in section 4.3. A **letter** (`mods/nagmon/mail/<id>.yaml`): `{id, from: npc_id, kind: postcard|thanks|quest|gift|family, variants: [text, text, text], gift: {item,n}|{coins}, when: {flag...}, delay_days: 1}`. Letters are authored (a few variants each) and drawn like lines.

### 5.3 Roles (the `role` field)

`guide`, `hint_giver`, `shopkeeper`, `healer`, `tutor`, `quest_giver`, `trainer` (friendly 3-question duel), `scientist` (field notes), `collector` (swaps duplicates), `rival_learner` (teach-me), `lost_kid`, `mail_carrier`, `crafter` (cosmetics and decor), `trader` (cards), `host` (house), `wanderer`, `animal`, `robot`, `boss` (existing masters). One NPC has one main role and up to two side offers.

### 5.4 Who is where when: schedules and placement

**Day parts** use the phone's local clock, as the world state already does for daily counters: `morning` 05:00 to 11:59, `afternoon` 12:00 to 17:59, `evening` 18:00 to 22:59, `night` otherwise (nobody out; the Rest Center nurse and the owl only). A 7-day week gives `days`. A parent "holiday mode" exists in settings; later it can map to a calendar tag (`appears_if.calendar`), with no new mechanics now (Q6).

The **placement resolver** is a pure function:

```
resolve(map, day, phase, progress, seed, questPins) -> [{npc, spot}]
```

| Rule | Statement |
|---|---|
| R1 One place | For a given (day, phase) an NPC has exactly one position or none. Position = first matching `rules` entry, else `roam` pick, else `default`. |
| R2 Deterministic | A roamer picks from its spot pool by `hash(seed, day, phase, npc)`, so the same day looks the same on re-entry and tests can pin it. `seed` is a random per-profile number kept locally (not an id). |
| R3 Anchors | Shop, Rest Center, tutor and the owl's lab people are `anchor: true`: inside their building (open daytime), never roaming. |
| R4 Visitors | `visit: {every_days: N, stay_days: M}` NPCs are in the world only on some days (Animal Crossing visitors): a trader every 3 days, the sage every other day. |
| R5 Capacity | Each map has `max_npcs` (Hearthrock 10, solar zone 5, a house 3). Over capacity, drop the lowest-priority roamers; anchors and quest pins always stay. |
| R6 Pairs and keep-apart | `pairs: [a, b]` stand near each other and may trade an ambient line; `not_with: [a]` never share a map. |
| R7 Change daily | Each non-anchor NPC must change spot versus yesterday when it has more than one option, so the town looks different tomorrow (and "who is here today" is worth a TV item). |
| R8 Quest pin | A giver with an open offer or an accepted quest step that needs them stays at their last spot until it is done, so a child can always find them; the map shows the "!" or "?". |
| R9 Progress gates | `appears_if` can use flags, zone unlocked, friendship with another NPC. |
| R10 Same NPC across maps | The sage appears in the rocky planets and the giants zone, never both on the same day-part. |

Runtime change: the map events stop saying `create_npc slug,x,y`. One auto event, `place_npcs`, calls the resolver and creates the NPCs (a new action; the interpreter already makes NPCs per visit). Spots are named points on the map YAML (`spots: {post_box: [14, 6], ...}`), so art and layout change without touching NPC files.

**Example: Hearthrock on a weekday** (from the catalogue in section 6; `*` = anchor, inside its building):

| NPC | Morning | Afternoon | Evening |
|---|---|---|---|
| דני הדוור | post box | market corner | Route 1 sign |
| אופיר האופה | bakery door | bakery door | gone (closed) |
| הגננת מיכל | greenhouse | park flowerbed | greenhouse |
| יואב | school gate | fountain | home |
| סבתא רינה | bench by the fountain | her home | her home |
| חיים (chess) | park bench | park bench | gone |
| אבי* | shop | shop | shop |
| דנה האחות* | rest center | rest center | rest center |
| רוני (rival kid) | not here | park | fountain (every 2nd day) |
| פיתה (cat) | roams: 6 spots | roams | roams |

Result: at 17:00 a child meets about 6 of the 14 Hearthrock people, and the set differs from yesterday.

### 5.5 Relationship and memory (small, local, no PII)

Saved as a new `npcs` map in `WorldData` (schema 1 to 2, with a migration that adds an empty map; same file `profiles/<id>/saves/world.json`):

```json
"npcs": { "nagmon_granny": { "pts": 7, "lvl": 1, "met": 5, "last": "2026-10-22",
          "gift_day": "2026-10-21", "flags": ["helped_wallet","likes_berry_seen"],
          "recent": ["rina.greet_again.007","rina.idle.012"],
          "quests": {"q_tea_chain": 2} } }
```

| Field | Meaning | Size |
|---|---|---|
| `pts`, `lvl` | friendship points and level 0 to 3: stranger, familiar, friend, close | 2 ints |
| `met`, `last` | talks so far, last day | int, date |
| `gift_day` | one gift a day per NPC | date |
| `flags` | from the NPC's `memory_flags` whitelist only | at most 12 ids |
| `recent` | last 8 line ids shown (the anti-repeat ring) | 8 ids |
| `quests` | step per chain | few ints |

About 250 bytes per NPC, 53 NPCs, so about 13 KB. **Rules:** no free text ever; no child name; no model output stored (the line bank is separate and local); friendship **never decreases**; SEL choices write a flag, never points (`SEL.md` 4.2: nothing about feelings is recorded; flags like `kind_choice_seen` are the *NPC's* memory of a scene and are excluded from any upload or report, with a test).

**Friendship points** (from the YAML): first talk of the day +1 (once a day); a new topic +1 (at most 2 a day); a quest +3; a gift loved +3, liked +2, ok +1 (one gift per NPC a day). Levels at 0, 4, 10 and 20 points. At about 3 points a day a child reaches level 2 with someone in about 4 days of regular visits, and level 3 in about a week. Benefits: level 1 unlocks a topic; level 2 unlocks the NPC's personal quest chain; level 3 gives a one-time personal gift (a cosmetic or decor piece), a new line set and a letter. Gift tastes: loved, liked, ok only. No dislikes.

---

## 6. (c) The cast: 53 NPC archetypes

Names are ours, plain modern Hebrew, mixed backgrounds (Hebrew, Arabic, Amharic, Russian-speaking and Sephardi-Mizrahi families, as in any Israeli town), all modest, no one a copy of another game's character. Existing people keep their slug and name (marked **E**). "Class": **M** main (60 to 80 lines), **R** regular (30 to 40), **W** wanderer (15 to 20). `Offers` uses these shorthands: Q quests, T tips, S shop, L lesson or fact, J jokes (pool only), B battle hints, EV evolution cards, G gifts or mail, Duel (3-question friendly duel), Teach (child teaches), Swap (creature swap).

### 6.1 Hearthrock and Route 1 (26)

| # | Slug | Name (he) | Role, voice | Where and when | Offers | Class |
|---|---|---|---|---|---|---|
| 1 | `nagmon_owl` **E** | הינשוף החכם | hint-giver; warm, slightly formal, loves "why" | lab porch, always (anchor); evenings on a roof | T, L (explain last wrong answer), hint feather daily, B, Q (daily owl quest) | M |
| 2 | `nagmon_cashier` **E** | אבי המוכר | shopkeeper; chatty, counts coins aloud | shop (anchor); at the street stall on Sundays | S, money questions, a daily special, T about prices | M |
| 3 | `nagmon_house_nurse` **E** | האחות דנה | healer; calm, gentle, one health fact a visit | Rest Center (anchor) | heal, daily gift, L (health facts) | M |
| 4 | `nagmon_house_tutor` **E** | המורה עדי | tutor; patient, structured, "one card at a time" | lab (anchor) | lessons, move cards, L | M |
| 5 | `nagmon_granny` **E** | סבתא רינה | storyteller; slow, tea, proverbs | fountain bench mornings, home afternoon | Q (wallet, tea chain), stories, G (letters, knitted gifts at level 3) | M |
| 6 | `nagmon_gardener` **E** | הגננת מיכל | gardener; dreamy, plant facts | greenhouse, park flowerbed | Q (baskets), berries, L (plants), G (berry type) | M |
| 7 | `nagmon_kid` **E** | יואב | lost kid; earnest, tells everything | school gate, fountain | Q (kitten), jokes, shows the kitten | R |
| 8 | `nagmon_tourist` **E** | טום התייר | tourist; cheerful, mixes English words | market corner, station on Fridays | Teach (English), L (words), postcards (G) | R |
| 9 | `nagmon_route1_trainer` **E** | דני הדוור | mail carrier; brisk, puns about letters | post box mornings, market afternoons, Route 1 evenings | mail (G), Q (rounds), T (route) | M |
| 10 | `nagmon_baker` | אופיר האופה | baker; booming, generous, flour on everything | bakery door mornings and afternoons | Q (recipes: math), S (buns), G | R |
| 11 | `nagmon_carpenter` | סלים הנגר | carpenter; quiet, proud of his hands, riddles | workshop door, park | Q (board chain), riddles, T (measures) | R |
| 12 | `nagmon_pharmacist` | תסמה הרוקחת | pharmacist; careful, kind, explains medicine | pharmacy counter (anchor, daytime) | S (medicine shelf), Q (mint chain), L (health facts) | R |
| 13 | `nagmon_librarian` | לריסה הספרנית | librarian; whisper-voiced, loves lists | library (anchor, daytime) | Q (shelves), L (book of the day), reading stamps | R |
| 14 | `nagmon_ranger` | איתן שומר הפארק | ranger; outdoorsy, calls creatures "the neighbours" | meadow gate, berry bushes | Q (counts), T (where creatures hide), B | R |
| 15 | `nagmon_photographer` | שירה הצלמת | photographer; observant, "hold still!" | park, market | Q (show-a-creature), frames (G) | R |
| 16 | `nagmon_rival_roni` | רוני | rival who learns alongside; competitive but kind, asks "how do you do it?" | park afternoons, fountain evenings every 2nd day | Teach (3 to 4 times a chapter, remembers), Duel | R |
| 17 | `nagmon_chess_haim` | חיים השחמטאי | old chess player; dry humour, short sentences | park bench, mornings and afternoons | Q (riddle chains), logic tips | R |
| 18 | `nagmon_card_trader` | מזל סוחרת הכרטיסים | card trader; sharp, honest, bargain talk | market corner, every 2nd day | **EV** (evolution and friendship cards), Swap | R |
| 19 | `nagmon_newsboy` | אביב מחלק העיתון | newsboy; fast, shouts headlines | streets, mornings | "who is in town today", sky and TV tips, Q (moon phase) | R |
| 20 | `nagmon_tailor` | חנה התופרת | tailor; fussy about sleeves, kind | tailor shop (anchor, daytime) | **S (hero cosmetics, creature accessories)**, Q (measure) | R |
| 21 | `nagmon_clockmaker` | יוסף השען | clockmaker; precise, loves "exactly" | clock shop, tower on Thursdays | Q (clocks: time), L (time facts) | R |
| 22 | `nagmon_robot_tiky` | טיקי הרובוט | helper robot; literal, polite, beeps | roams: 5 spots | J, T (map tips), tiny gifts | W |
| 23 | `nagmon_cat_pita` | פיתה החתולה | town cat; only meows, text is the child's reading of it | roams: 6 spots | purr (a heart), rarely a berry | W |
| 24 | `nagmon_house_neighbor` **E** | השכנה גלית | house host; chatty, always cooking | friend house (anchor), tea | G (daily snack), Q (soup chain), stories | R |
| 25 | `nagmon_scout` | קרן הצופה | friendly trainer; sporty, encouraging | Route 1 camp mornings | Duel (daily), B (type tips), T | R |
| 26 | `nagmon_fisher` | פואד הדייג | fisher; patient, tells long short stories | Route 1 pond, afternoons | Q (bait), fishing spot, L (water facts) | R |

### 6.2 The solar chapter (27)

| # | Slug | Name (he) | Role, voice | Where and when | Offers | Class |
|---|---|---|---|---|---|---|
| 27 | `nagmon_solar_astronomer` **E** | האסטרונומית נוגה | trip master and tutor; precise, enthusiastic | station (anchor) | badge test, lessons, L, B | M |
| 28 | `nagmon_solar_mila` **E** | מילה | pilot; brisk, kind, jokes about turbulence | ship dock (anchor) | travel and fares, T (what to bring) | M |
| 29 | `nagmon_solar_owl` **E** | הינשוף בחליפה | hint-giver in a helmet; same voice as the owl | station lamp; follows the child to a zone each day | T, L, hint feather daily, Q (sun shield) | M |
| 30 | `nagmon_station_mechanic` | אמיר הטכנאי | mechanic; gruff, secretly soft, tool jokes | station workshop mornings, vending machine afternoons | Q (parts chain), S (vending), T | R |
| 31 | `nagmon_harbor_ruth` | רות מנהלת הנמל | dock manager; organised, dry | station board desk | the **station board** (daily quests), Q | R |
| 32 | `nagmon_robot_dudu` | דודו הרובוט | station robot; naive, asks big questions | roams: station | Teach (gravity and more), J | W |
| 33 | `nagmon_solar_moon_engineer` **E** | המהנדסת יעל | engineer; practical, patient | Moon landing pad; visits the giants every 3rd day | Q (craters), T (low gravity), L | M |
| 34 | `nagmon_geologist_sami` | סמי הגיאולוג | scientist; notebook, mumbles to himself | Moon crater field | L (field notes on first meeting of each moon creature), Q | R |
| 35 | `nagmon_young_astronaut_gil` | גיל האסטרונאוט הצעיר | lost kid; apologetic, brave | Moon crater rim | Q (glove) | R |
| 36 | `nagmon_cadet_oren` | הצוער אורן | friendly trainer; stiff, "by the book" | Moon path | Duel (Moon mix), B | R |
| 37 | `nagmon_rover_beep` | ביפ הרובר | rover robot; beeps, text is subtitles | roams: Moon | J, rides (fast walk) | W |
| 38 | `nagmon_cat_cosmo` | קוסמו החתול | cat in a suit; aloof | roams: Moon, station | purr, rare berry | W |
| 39 | `nagmon_solar_grey_hood` **E** | נועם בעל הברדס האפור | mysterious helper; speaks in short riddles, gentle | Sun zone mornings; Outer zone afternoons | Q (filter, three cards), riddles | M |
| 40 | `nagmon_physicist_tair` | הפיזיקאית תאיר | scientist; excited, explains light | Sun ridge | L (light), Q (shield measurements), T | R |
| 41 | `nagmon_sail_pilot_ron` | טייס המפרשים רון | sail pilot; breezy, loves wind | Sun launch pad | Q (sail day: weather-based), T | R |
| 42 | `nagmon_sunspot_gal` | גל, ילד הכתמים | kid collector; counts sunspots | Sun slope | Teach, Q (count), J | R |
| 43 | `nagmon_solar_rover_driver` **E** | מוחמד הנהג | driver; jokey, cautious on hills | Rocky planets rover stop; visits Outer on odd days | Q (three stops), T, rides | M |
| 44 | `nagmon_solar_sage` **E** | החכם עזרא | sage; slow, riddles, "ask again tomorrow" | Rocky planets (even days), Giants (odd days) | Q (rings riddles), L | M |
| 45 | `nagmon_collector_maya` | מאיה אוספת האסטרואידים | collector; brisk, swaps fairly | Rocky camp | Swap, Q, L (rocks) | R |
| 46 | `nagmon_meteor_dafna` | דפנה צופת המטאורים | watcher; whispers at night | Rocky ridge, evenings | Q (meteor shower nights), L | R |
| 47 | `nagmon_trader_gabriel` | גבריאל סוחר החלל | trader; smooth, honest | visitor: every 3rd day, any zone | S (rotating: seeds, stickers, one rare cosmetic), EV | R |
| 48 | `nagmon_rings_shani` | שני חוקרת הטבעות | scientist; patient, uses comparisons | Giants ring bridge | L (rings), Q (ring counts), Teach | R |
| 49 | `nagmon_moon_pilot_riyad` | ריאד טייס הירחים | pilot; calm, steady voice | Giants hangar | Q (delivery between moons), T | R |
| 50 | `nagmon_ocean_yam` | ים חוקרת האוקיינוס | scientist; bubbly | Giants ice shelf | Q (sample jars), L (water) | R |
| 51 | `nagmon_telescope_david` | דוד שומר הטלסקופ | keeper; quiet, star names | Outer observatory, evenings | star-gazing spot, L, Q | R |
| 52 | `nagmon_lighthouse_inbal` | ענבל שומרת המגדלור | keeper; thoughtful, lonely but content | Outer lighthouse (anchor) | Q (letters home), SEL scenes on missing and waiting | R |
| 53 | `nagmon_writer_rachel` | רחל הסופרת | writer; dreamy, collects postcards | visitor: Outer every 2nd day, station otherwise | Q (postcard album), postcards (G), stories | R |

Counts: 14 main, 34 regular, 5 wanderers (טיקי, פיתה, דודו, ביפ, קוסמו). Variety check: kids (4), teenager (1: רוני), adults (about 30), elders (5), robots (4), animals (2); five who are scientists, six craftspeople or shopkeepers, six who run quests. The **art cost** is the real limit (section 11): ship in waves, the 14 main NPCs first (12 of them already have a map sheet; the gardener borrows the teacher's).

---

## 7. (d) Quests

### 7.1 Types

| # | Type | The child does | Notes |
|---|---|---|---|
| T1 | **Fetch** | brings N of an item (from the Bag or the world) | items from chests, bushes, shops; no item lost on a wrong answer |
| T2 | **Deliver** | takes a letter or parcel to a named person | uses the resolver: the recipient may be elsewhere today (look for them, or read the TV or the newsboy) |
| T3 | **Riddle / problem** | answers 1 to 3 questions from the learning engine, wrapped in a story ("double the recipe") | level = the engine's, never the quest's |
| T4 | **Collection** | gathers parts or samples across a map or zones | progress dots 3 to 5 |
| T5 | **Show a creature** | shows a friend of a kind (element, zone, habitat) from the party or Meadow; no fight | ties to the creature collection |
| T6 | **Teach me** | teaches the NPC (chooses the right step; the NPC repeats it, sometimes funny-wrong first) | `FEATURES.md` 5.2 teachable agent; weakest subjects first |
| T7 | **Lost item** | finds something hidden on the map | hints grow with tries |
| T8 | **Weather or time** | does it on a sky day (full moon, meteor shower, solar wind) or at a day part | the sky is a deterministic calendar (section 8, TV) |
| T9 | **Chain** | 3 to 5 linked steps, possibly across NPCs and zones | the finale gives the big reward |
| T10 | **Kindness** | an SEL scene (include, return, wait your turn) | **equal materials for every option**, no praise line (`SEL.md` 3 and 6.2) |
| T11 | **Duel** | the NPC's 3-question friendly duel in the child's subject mix | losing is "good game" plus the owl explains |
| T12 | **Count / survey** | counts and tallies things in the world (creatures in the Meadow, sunspots) | data and counting skills |
| T13 | **Errand (escort-free)** | carries a message or a thing so someone does not have to go | the "escort" is replaced by delivery, so no following mechanic, no stuck NPC |

### 7.2 Definition (YAML, data only)

```yaml
id: q_baker_double
giver: nagmon_baker
type: problem
title_he: "כפול מתכון"
offer_when: {friendship_min: 0, phase_any: [morning, afternoon]}
repeat: {kind: pool, cooldown_days: 1, variant_cooldown: 5}   # once | pool | weekly | monthly | chain
variants:                              # chosen by grade band + the day; 6 of them
  - {id: v1, band: A, text_he: "אני צריך 2 ביצים לעוגה אחת. כמה ל-2 עוגות?", learn: {skill: math.mult.double, n: 1}}
  - {id: v2, band: B, text_he: "...", learn: {skill: math.mult.table2_5, n: 1}}
  - {id: v3, band: C, text_he: "...", learn: {skill: math.fractions.scale, n: 2}}
steps:
  - {do: talk, npc: nagmon_baker}
  - {do: ask, from: learn}             # the learning engine asks; retry is free
reward: {coins: 25, items: [{id: bun, n: 1}], friendship: 3}
on_wrong: {retry: free, hint_after: 2, lesser_after: 3, lesser_reward: {coins: 12}}
daily_coin_class: board                # counts toward the soft daily cap (section 9.5)
sel: false
```

A quest saves a few ints (`quests: {id: step}` in the NPC record plus a global `quests` map: state, variant, `done_day`). Authored text lives in the NPC's lines file; the live line source may only vary the greeting around it (section 4.2).

### 7.3 Journal and boards

* **Journal**: up to 3 active quest cards (picture, one line, 3 to 5 dots, **Show me** pins and arrows the giver on the map; the pin is the resolver's current spot for that NPC, R8). A done shelf keeps finished quests. Never timed, never lost. This extends `FEATURES.md` 4.13.
* **Boards.** The Hearthrock **notice board** and the **station board** (Ruth) show 3 postings a day: one easy (a delivery or a short problem), one normal (a collection or a show-a-creature), one **learning** (the child's subject mix). A weekly posting appears on the first day of the week (Sunday): a chain step or a monthly sky quest. Accepting is free; an accepted quest never expires (unlike Stardew's two days; the Stardew wiki confirms no penalty either way, but we have no clock at all).
* **Posting algorithm** (deterministic by day and a local seed): eligible = unlocked, not `done` if `once`, cooldown over; then pick one per slot with these constraints: **no two postings of the same type**; **a giver not used in the last 3 postings**; **a variant not used in its last 5 postings**; subject weights: 40% for the engine's two weakest subjects (computed locally, never sent anywhere), the rest uniform; a quest pinned to a visitor only if the visitor is in town that day.

### 7.4 Anti-repetition (the rules)

| Rule | Value |
|---|---|
| Once-only quests | never come back |
| Pool quests | `cooldown_days` (1 to 3) per quest, `variant_cooldown` 5 postings per variant, at least 6 variants per pool quest |
| Same giver | not in two consecutive postings; at most 2 board postings a week per giver |
| Same type | not twice in a day |
| Repeat reward | the 4th repeatable quest of the week pays 60% coins (items and friendship unchanged) |
| Chains | finale reward once; the repeat versions are different chains (a "monthly variant") |
| Dialogue | quest offer, step and done texts are authored with 2 to 3 variants each, chosen by the same Director rules as lines (section 4.3) |
| NPC memory | the NPC remarks on the *last* quest differently each time ("thanks for the dough, it rose beautifully") using flags, not generated text |

### 7.5 Ties to learning and to SEL

* **Learning.** `learn:` names a skill or subject; the learning engine supplies the question at the child's level (`ask_quiz`, the existing action). A wrong answer never fails: free retry, a hint from the owl after 2, after 3 the NPC shows the answer and the quest finishes in a **lesser form** (half coins, the rest unchanged), as `FEATURES.md` 5.3 sets for objects. Quests never lower or raise the rating beyond what the question already does; helpers keep their half weight rule.
* **Money questions** (cashier, baker) stay valuable for the money skill.
* **SEL.** T10 quests (3 more are in `SEL.md` slice 1) use this system as their venue: the board, the schedule and the NPC memory give M3, M4 and M8 a place to recur. Material outcomes are identical for all options (a test compares reward objects); the NPC's reply differs; "not now" always exists; no points, and the NPC flag is excluded from reports.

### 7.6 Catalogue: 35 quests

Rewards use the scale in section 9.4: XS 10, S 20, M 30, L 50, XL 80+ coins. "Q-coins" are the quest's coins; items are from `items.yaml` or the new lists in section 9. `Board` = may be posted on a board.

| # | Id | Giver | Type | What happens | Learning or SEL | Reward | Repeat |
|---|---|---|---|---|---|---|---|
| 1 | `q_kitten_home` **E** | יואב | T7 lost item | find the kitten on Route 1 and bring it back | navigation | 30 + 2 Dew Drop | once |
| 2 | `q_wallet` **E** | סבתא רינה | T10 kindness | a wallet on the bench: return it, ask a grown-up, or leave it | SEL M3, M4 | **equal for all**: tea and a letter the next day (today returning pays 30; to fix) | once; "second chance" stays |
| 3 | `q_baker_double` | אופיר | T3 problem | double a recipe (6 variants by grade band) | math | 25 + bun | pool, 1-day cooldown |
| 4 | `q_berry_basket` | מיכל | T1 fetch | bring N berries of the kind she names; she tells a plant fact | science.plants | 20 + friendship | weekly |
| 5 | `q_mail_round` | דני | T2 deliver | deliver 3 letters to 3 people (find them today) | reading names, map sense | 20 + friendship with all 3 | daily (Board) |
| 6 | `q_tom_swap` | טום | T6 teach | trade words: the child picks the Hebrew word for a picture, Tom says English | english.vocab | 25 | pool, 3 days, 8 word sets |
| 7 | `q_lost_found` | the lost-and-found box | T7 lost item | match 3 items to owners by clues ("loves chess") | logic, reading | 30 | daily, 12 sets (Board) |
| 8 | `q_clock_set` | יוסף | T3 problem | set the shop clocks (time) | math.time | 25 | weekly |
| 9 | `q_shelf_sort` | לריסה | T3 matching | put 4 books on the right subject shelf | logic, hebrew | 20 + library stamp | twice a week (Board) |
| 10 | `q_creature_photo` | שירה | T5 show | show a friend of a named kind (10 kinds, rotating) | science.animals | 35 + photo frame (decor) | weekly |
| 11 | `q_chess_riddles` | חיים | T9 chain of T3 | three riddles over three days (series, patterns) | logic | 15, 20, 30 | 6 chains of 3, each once |
| 12 | `q_bench` | רוני | T10 kindness | someone alone on the bench: invite, sit near, ask, or walk on | SEL M8 | none for any option | up to 3 scenes, different each time |
| 13 | `q_board_fix` | סלים | T9 chain | planks, a hinge, paint; the board gets a **4th slot** | collection | 15, 15, 40 + bench (decor) | once |
| 14 | `q_mint_run` | תסמה | T9 chain across NPCs | mint from מיכל, tea at תסמה, deliver to רינה; a health fact | cross-NPC | 25 + 2 Fresh Mint | once; monthly herb variant |
| 15 | `q_meadow_count` | איתן | T12 count | count friends by element in the Meadow, fill a tally | math.data | 20 | weekly |
| 16 | `q_paper_moon` | אביב | T8 sky | tell him tonight's moon phase (read it on the TV) | science.moon (real calendar) | 30 | monthly, 8 phases |
| 17 | `q_fountain_lights` | רינה, Town Fund | T9 sink | donate 150 to light the fountain; next morning a letter, evenings glow | none | friendship +3, the town changes | once per Fund project |
| 18 | `q_scout_duel` | קרן | T11 duel | 3 questions in the child's mix | mix | 15 + sticker | 1-day cooldown; weekly harder rematch (+10) |
| 19 | `q_fisher_bait` | פואד | T1 fetch | 3 different berries for bait; fishing spot opens | none | 25 + Magic Net | weekly |
| 20 | `q_station_parts` | אמיר | T9 chain across zones | one part in each of 4 zones (Moon, Sun, Rocky, Giants) | collection | 15 per part, finale 60 + Silver Net | once |
| 21 | `q_dock_board` | רות | board | the 3 daily postings of the station | mixed | 15 to 30 | daily |
| 22 | `q_dudu_gravity` | דודו | T6 teach | tell Dudu what gravity does; he repeats it, sometimes funny-wrong first (4 topics) | science.space | 25 + medal "explained to a friend" | weekly |
| 23 | `q_moon_glove` | גיל | T7 lost item | find the floated glove with a low-gravity jump | navigation | 30 + **Star Net** (once) | once |
| 24 | `q_phases_teach` | רוני (Moon) | T6 teach, 3 parts | explain the phases, middle and end | science.moon | 25, 25, 40 | once |
| 25 | `q_crater_log` **E** | יעל | T3 riddle | the crater log question | science | **25** (today 10) | once, then the 3-coin daily question stays |
| 26 | `q_cadet_duel` | אורן | T11 duel | space-mix duel | mix | 15 | daily cooldown |
| 27 | `q_sun_shield` **E** | הינשוף and נועם | T9 chain | the grey hood has the filter; bring it back; one question | science.energy | **30** (today 12) | once |
| 28 | `q_sail_day` | רון | T8 sky | on a solar-wind day he lets the child ride the sail; 3 energy questions | science.energy | 30 + sail cap (decor) | at most once a week, only on the sky day |
| 29 | `q_three_stops` **E** | מוחמד | T2 and T3 | drive to 3 stops, a question at each | science | **40** (today 15) | once, then a weekly route variant |
| 30 | `q_asteroid_swap` | מאיה | Swap | trade a duplicate for the zone's missing creature | classification | a creature, no coins | when an offer exists, 3-day cooldown |
| 31 | `q_rings_riddles` **E** | עזרא | T9 chain of T3 | three riddles of the rings | science | 18, 15, 17 (today 18 total) | once |
| 32 | `q_ocean_samples` | ים | T4 collection | find 3 sample jars at hidden spots; a fact each | science | 35 | once, monthly variant |
| 33 | `q_star_cards` **E** | נועם | T3 | three cards to look at, one question | science | **60** (today 25) | once |
| 34 | `q_lighthouse_letter` | ענבל | T13 errand, T10 | carry a letter home to רינה and bring the reply back, three rounds | SEL: missing, waiting | 40 + lamp (decor) | once |
| 35 | `q_postcard_album` | רחל | T9 chain | one postcard from each zone (5), the album | collection | 10 each, finale 100 + album (decor) | once |

First-chapter quest coins, once-only total: about 860 (the once quests above, counting one chess chain) plus repeatable income of about 60 to 90 a day from the boards (section 9). Mission coins in the solar zones are raised (25, 30, 40, 50, 60), because today a mission pays less than one level-10 wild win, which makes "talk to people" the worst use of time.

### 7.7 Hooks into the interpreter (names to confirm at W1 and W3)

New actions: `place_npcs`, `talk_npc <slug>` (the generic talk event: Director, topics, quests), `npc_say`, `quest_offer`, `quest_step`, `quest_complete`, `give_letter`, `fund_donate`, `open_pc`, `open_tv`, `open_book`, `open_wardrobe`, `open_board`. New conditions: `quest_state`, `friendship_at_least`, `npc_flag`, `sky_is`, `phase_is`, `weekday_is`, `npc_here`. `TALK_TO` (the allow-list) goes away: any NPC with a definition can be talked to.

---

## 8. (e) Interactive objects: things that DO something

Every object is one tap with a visible cue (a glow, a small bounce). Objects are data (`mods/nagmon/objects/<id>.yaml`: sprite, action, daily limit, requirements), created like the chest and nest are today (an NPC-like entry with a talk event), so the resolver, the "talk" button and the save logic are reused. A question is asked at most once per object per visit, and a wrong answer never locks anything (`FEATURES.md` 5.3).

The home map (`nagmon_home`) already has two blocked nooks "behind the furniture" at (2,2) and (5,2) and a closed staircase at (7,2): the **PC goes in the nook at (2,2), the bookshelf at (5,2)**, and the staircase opens in W5 to an upstairs room (living room with TV, fridge, wardrobe, calendar). Until then the slice-1 objects that need room (TV, fridge) go in the friend's house and the station lounge, which have space, and move upstairs later (the object file just changes its `map` and `spot`).

| # | Object | Where | Exact behaviour | Gets | Limit | Slice |
|---|---|---|---|---|---|---|
| 1 | **PC** | home nook (2,2); Rest Center desk (exists as the "creature desk"); station lounge later | Opens a full screen with 5 tabs. **Boxes**: the Meadow shown as named boxes with sort chips (by zone, by subject, newest) and a star "favourite"; tap a friend to move it between the party and a box, reusing the swap logic of `rest.ts`; **nothing can be released or deleted**. **Items**: an item box that holds 99 more of every item the Bag caps at 99 (no selling). **Mail**: the inbox (below). **Journal**: "What I learned": the facts the child has read, by subject, with dates (signs, lesson notes, field notes, book pages); a **Recap** button asks 3 quick recall questions from facts of the last 7 days in practice mode (not rated, no helpers needed); a stamp for every 10 facts. **People**: a card for every NPC met: portrait, friendship hearts 0 to 3, what they offer, and the gift tastes already discovered (a gift reveals "loved" or "liked"). | organisation, mail, review | none | **W2** (Mail, Journal, People, Items; Boxes reuse the Meadow) |
| 2 | **Mailbox and post box** | home door, Hearthrock post box (Danny) | If there is mail the flag is up; tap opens the Mail tab. One **daily postcard** from a rotating sender among people the child knows (a verbatim fact, optionally a recall question, sometimes a small gift). Event letters arrive the **next morning** (thanks from a helped NPC, a quest letter, a level-3 gift). | letters, small gifts, reasons to return | at most 1 postcard and 3 event letters a day, 30 kept; gifts: 1 postcard in 4 carries an item or 10 coins, at most 20 coins a week from mail | **W2** |
| 3 | **Bookshelf** | home nook (5,2); library (6 shelves, one per subject) | Home: 3 books out today (by day); tap a book for a one-page read (picture and one verbatim fact), then an optional recall question. Three different books in a day give a reading stamp (once a day); 10 stamps give a bookmark charm and 20 coins. The shelf also opens the **Book** (bestiary). | facts, stamps, the Book | one stamp a day | **W2** |
| 4 | **TV** | friend's house and station lounge now; home upstairs later | Three channels, 25 s each, switched by tap, no autoplay. **Sky today**: the moon phase computed from the real date, plus a sky event (meteor shower on real shower dates, a "solar wind" day about one in seven by date hash, otherwise clear): the data behind the weather and time quests. **Town news**: 3 headlines from the resolver ("הדוור היום בשוק", "מזל הגיעה עם כרטיסים חדשים"): this is how a child learns who is where. **Creature of the day**: one species with a picture and a fact; that species is slightly more common in the grass that day (+25% weight, a hint, never a prize). | information, hooks for quests | none | **W2** |
| 5 | **Fridge** | friend's house, home upstairs later | Once a day pick 1 of 3 snacks (berry, bun, juice); the partner gets +1 heart and a happy animation. The three change with what neighbours gave. | one free snack a day (about 10 coins of value), hearts | 1 a day | **W2** |
| 6 | **Notice board** | Hearthrock square, station (Ruth's desk) | The daily postings (section 7.3): 3 cards with a picture, a one-line goal, the giver's face; accept and the quest goes into the journal; the weekly card on Sundays. | quests | accepted quests never expire | **W2** shell (static postings) and **W3** (the generator) |
| 7 | **Wardrobe and mirror** | home upstairs, Rest Center mirror | Change hero outfit and creature accessories from what is owned; free to change; try-on preview before buying in the tailor shop. | cosmetics | none | W5 |
| 8 | **Trophy shelf** | home | Shows badges, medals, photo frames and discoveries; tap one for its story fact. Frames can be bought. | pride, a sink | none | W5 |
| 9 | **Calendar** | home wall | A week strip with a stamp for each day played (**never resets, no streak**), the visitors of the week, the sky events of the week. | planning | none | W5 |
| 10 | **Radio** | home | Pick the town music from the 6 tracks. | taste | none | W5 |
| 11 | **Telescope** | station, Outer observatory; buyable for home (decor) | One astronomy question a day; a star card and a star fragment (`FEATURES.md` 5.3, 8 fragments make a badge piece). | star cards | 1 a day per spot | W5 (the station one with the astronomer) |
| 12 | **Berry bushes** | park, gardener's greenhouse, home garden | One berry per bush per day (Pokemon-style) and a plant fact. | berries | 1 a day per bush, at most 5 bushes | W4 |
| 13 | **Lost-and-found box** | Hearthrock square | Items lost by NPCs appear here; the child matches each to its owner by clues and returns it. | quest `q_lost_found` | daily | W3 |
| 14 | **Town Fund** | Hearthrock square statue and board; station later | Shows the current project with a progress bar. Donate 25, 50 or 100 coins at a time (or all it needs). When a project fills, the town changes the next morning (lights, a bench, a swing, a library corner, a greenhouse wing) and a letter comes. Nothing is ever lost: partial progress is saved for good. | a visible, lasting result | none | W4 |
| 15 | **Bench and swing** | park | Sit with the partner or a friend; the creature leans in; the lonely kid scene (`q_bench`) sits here. No reward. | calm, SEL venue | none | W3 (the scene), W5 (the swing) |
| 16 | **Vending machine** | station, Route 1 camp | Pay step (as the shop), snacks and one hint feather at +10% price. | convenience | none | W5 |
| 17 | **Bed** | home | "Goodnight": the natural end of a session; the partner curls up (`SEL.md` M14 later). | a stopping point | none | W5 |

### 8.1 Mail data

`WorldData.mail: [{id, from, kind, day, read, claimed}]` (at most 30, oldest read ones fall off). `id` points to an authored letter (`mods/nagmon/mail/*.yaml`, 3 variants each, the variant is picked by the same Director rules). A **family note** is optional: the parents' area has a box where a parent can type up to 100 characters that arrive as a letter "from the family" (stored only on the device, never uploaded); default off (Q6 mentions it as a small extra).

### 8.2 Facts need a bigger base

`facts.yaml` has 6 facts today. Books, postcards, the TV, the PC journal and the live-line fact packs all draw from it. Plan **120 facts for the first chapter** (60 science from the existing banks and lessons, 20 English words and phrases, 15 Hebrew, 15 math and logic curiosities, 10 about the creatures), each at most 70 characters, true and simple, each with an emoji id, a subject, a band and the line `source:` (our own bank id) so the accuracy firewall can trace it.

---

## 9. (f) Economy v2: coins that matter

### 9.1 Diagnosis (from the repo)

| Observation | Number | Consequence |
|---|---|---|
| A wild win at level 10 | 15 coins, plus stars (Steady 2, Bright 2, Brilliant up to 5), seal 5 | A session of 6 wins is about 100 |
| Cashier | 20 coins, 3 a day = 60 a day (grade 2 and up) | The biggest single faucet, as large as 4 fights |
| Solar missions | 10, 12, 15, 18, 25 coins; daily NPC question 3 coins x 3 | Less than a fight: talking to people is the worst use of time |
| Starter kit | 3 nets; daily spare net; a net costs 30 | After 2 fights a child can afford everything they need |
| Evolution cards | 120, 200, 450 | The only big goals today, and they sit behind guardians and keepers |
| Cosmetics, decor, mirror, trophies | "not started" | Nothing to want |

So coins matter for the first hour and then pile up. Fix: **more, better things to want, bought at several price points, with a visible result**, plus quests that pay in kind as well as in coins.

### 9.2 Sources

| Source | Per unit | Cap | Status |
|---|---|---|---|
| Wild win | `5 + level` (8 to 20 in the first chapter) | none (it is the game) | exists |
| Keeper / guardian | `15 + 2L` / `50 + 5L` | per fight | exists |
| Steady and Bright stars, Brilliant | +2, +2, +1 (max 5) | per fight | exists |
| Seal (befriend) | 5 | per catch | exists |
| Cashier | 20 | 3 a day | exists |
| Lessons | first pass 40, repeat 10 (once a day) | | exists |
| Daily gift (nurse) and daily chest | 10 to 20 and 30 to 40 | 1 a day each | exists |
| **Quests and boards** | scale XS 10 to XL 80+ (section 9.4) | **soft cap 90 coins a day** from boards and quests | new |
| **Letters with coins** | 10 coins in 1 postcard of 4 | at most 20 a week | new |
| **Friendship level-up gifts** | an item or cosmetic, **not coins** | once per NPC per level | new |
| **Sky events** | an extra question reward on the sky day: 20 | 1 a day | new |

A single soft cap on "world coins": **cashier + quests + boards + letters + sky-day bonus = 150 a day**; the daily gift and chest are outside it (a fixed 45). Past the cap a quest pays an item of equal value and a kind line ("אין לי עוד מטבעות היום, קחו את זה"), never nothing. There is no selling (`FEATURES.md` 4.2).

### 9.3 Sinks and the price table (new items; existing prices stay)

Existing sinks (nets 30 and 90, snacks 10 to 60, medicine 15 to 110, helpers 15 to 20, friendship cards 45 and 60, evolution cards 120, 200 and 450, fares 10 to 25, Move Cards 80 and 120 in `BATTLE_V3.md`) are not changed.

| Group | Items (count) | Prices | Group total | Where sold |
|---|---|---|---|---|
| **Hero style** (modest only: long sleeves and long skirts as in `SDD_MODESTY.md`; a kippah is a free profile option and is never priced) | hats 6, scarves 4, capes 3, backpacks 4, shoes 4, glasses 2, pin holder 1 | hats 50 to 90, scarves 50 to 70, capes 120 to 150, backpacks 60 to 100, shoes 40 to 60, glasses 50 to 60, holder 80 | **1,740** | tailor חנה; one rare piece a week from the trader גבריאל |
| **Creature accessories** | 12 (bell, bow, scarf, small hat, bandana, flower crown, mini backpack, glow collar, star charm, cape, two zone scarves) | 40 to 80 | **about 750** | tailor |
| **Home decor and upgrades** | posters 3, plants 2, rugs 2, lamps 2, curtain, trophy frame, extra bookshelf, aquarium 250, telescope 300, music box, bed colours 2, wall paints 3; **PC box upgrades** 3 (more boxes: 100, 150, 200) | 30 to 300 | **about 2,270** | the shop's new shelf "home"; the carpenter סלים (frames, shelves) |
| **Gifts for friends** | bun 12, flower 18, sticker pack 20, picture book 40, shiny stone 35 | 12 to 40 | a weekly flow of about 100 | baker, gardener, shop |
| **Town Fund** | Hearthrock: 6 projects 150, 200, 250, 300, 350, 400; Station: 4 projects 200, 300, 400, 500 | | **3,050** | the square, the station |
| **Evolution and friendship cards, existing** | | 45 to 450 | 2,250 for evolution cards alone | shop, trader |
| **Tutor** | Move Cards (80 and 120), note charges | | | tutors |
| | | **Big-ticket catalogue (rows 1 to 3, 5 and 6)** | **about 10,060** | |

**Decision: coins never buy learning.** Lessons and practice are free and pay coins (as now). The tutor sells only *moves and notes*, which are power, not access. Tutor "lessons for money" would put a price tag on learning and punish the child who most needs it.

### 9.4 Reward scale and per-session income

Quest reward scale: **XS 10, S 20, M 30, L 50, XL 80 and up**; chain finales XL plus an item or decor piece. One session of 20 minutes at a typical pace: battles and seals about 100, cashier and quests and boards about 40, the daily gift and chest (once per play day) about 25: **about 165**. Over 30 sessions (about 7 weeks at 4 sessions a week): 4,950 coins; basic needs (nets, berries, medicine) about 1,050; **free to spend about 3,900, which is about 39% of the 10,000 big-ticket catalogue.** A child chooses; nobody buys everything in the chapter. Chapter 2 adds sinks worth at least twice its income, and its new cosmetics cost 1.5 times (a price ladder).

### 9.5 Inflation control

| Lever | Setting |
|---|---|
| Soft daily cap on world coins | 150, section 9.2 |
| Repeat quests | the 4th repeatable quest of a week pays 60% coins; items and friendship unchanged |
| No selling, no trading coins | removes arbitrage |
| Wish list | a child stars an item in a shop, tailor or fund; the wallet shows "62% of the way" (this makes saving a visible goal) |
| Data-only prices | all prices are in YAML; a content release can raise a price or add a sink with no code change |
| Health check | the existing field log (counts only) reports the median wallet at the end of day 7. **Target at most 300 (about 2 sessions of income).** If over 600, add sinks or raise prices; if under 30 most days, lower them or add a faucet. |
| Never stuck | spare net, free nurse, free practice stay |
| No real money, no loot boxes, no timers, no pay-to-skip, ever | principle |

### 9.6 Value moments (the child sees that coins did something)

| Moment | What happens |
|---|---|
| First hat | The tailor's try-on, then the child leaves the shop wearing it; the first villager remark about it is authored |
| Town Fund project filled | The next morning the town is different (the fountain lights glow in the evening), a letter from רינה arrives, the NPCs' idle lines mention it for a week |
| Gift to a friend | A unique reaction line per NPC for loved or liked; at level 3 a personal gift |
| Card to evolution | Already the best moment in the game (`BATTLE_V3.md` 7); the trader מזל makes it a place, not a menu |
| Daily special | A 10% price cut after a right change answer (exists in design) |
| Wish list reached | The wish item glows when affordable; buying it plays the coin counting animation |

### 9.7 Numbers for the first chapter

| Day | Typical income | Suggested spends (a child picks) |
|---|---|---|
| 1 (one session) | about 165 (fights 70 to 100, cashier 60, chest 30, gift 10) | 3 berries 30; a bun for Rina 12; start saving for a hat (50) |
| 2 | about 165 | the hat 60 (value moment 1); 2 Dew Drops 40 |
| 3 to 4 | about 330 | a wake berry 25, Moon friendship card 60 when unlocked, a poster 40, the first Town Fund donation 100 |
| week 2 | about 660 | scarf 60; creature bell 40; Fund project 1 done (150 total); a pie 60 |
| weeks 3 to 5 | about 2,000 | Fund projects 2 and 3 (450); a Zone Card 120; Spring Tonics; a cape 120; decor 300 |
| weeks 6 to 7 | about 1,300 | Subject Card 200; the aquarium or telescope 250 to 300; saving for the Bright Card 450 |

### 9.8 Tests

| # | Test |
|---|---|
| E1 | The daily soft cap: the 151st world coin of a day becomes an item of equal value; the wallet never goes below zero |
| E2 | A repeatable quest's 4th completion in a week pays 60% coins and the same items |
| E3 | Prices and catalogue sums are read from YAML (a test asserts the groups in 9.3 sum to the doc's numbers) |
| E4 | A purchase that cannot be paid for is refused kindly with how many coins are missing (as `trips.ts` does) |
| E5 | A Town Fund donation is saved at once; closing the app mid-project keeps it; a filled project changes the map the next local day |
| E6 | Wish list progress is a pure function of wallet and price |
| E7 | The field log reports wallet median and counts only (no per-item purchase history of the child in uploads beyond counts) |

---

## 10. (g) Build plan: slices W1 to W6

Working form (`CLAUDE.md`, `playbooks/*`): an SDD paragraph first, tests first, a branch per slice, a separate review agent, CI green before merge, storybook updated with each merge (`ARCH`, `SUBJECTS`, `FLOWS`, `AI`, `OPEN`, `PLAN`, `VERSION`) and republished to the same link. Effort as in `FEATURES.md` 6: S 1 to 2 days, M 3 to 6, L 1 to 2 weeks (one agent; art and content are separate lines).

| Slice | What | Files likely touched | Effort |
|---|---|---|---|
| **W1 People that vary** | NPC YAML schema and `tools/app/npcs.py` build step; `core/world/npcs.ts` (definition types, placement resolver, relationship records); `core/world/director.ts` (`PoolSource`, anti-repeat, topics); `WorldData` schema 1 to 2 with migration; generic `talk_npc` and `place_npcs` actions and the five new conditions; remove the `TALK_TO` allow-list; chips UI in `Dialog`; convert the **9 existing Hearthrock people and the 7 solar people (16)** to definitions with at least 40 reviewed lines each | `app/src/core/world/{events,mapData,worldState}.ts`, `app/src/ui/Dialog.tsx`, `mods/nagmon/npcs/*`, `tools/app/npcs.py`, `mods/nagmon/maps/*.yaml` (spots) | **L** + content (about 600 lines to author and review) |
| **W2 Objects, slice 1** | mailbox, PC (Mail, Journal, People, Items; Boxes reuse), bookshelf, TV (sky calendar, town news, creature of the day), fridge, notice board shell; mail and journal save data; 120 facts; the sky calendar (`core/world/sky.ts`) | `app/src/ui/pc/*`, `core/world/sky.ts`, `core/game/mail.ts`, `core/game/journal.ts`, `mods/nagmon/mail`, `facts.yaml`, home and friend-house maps | **M** |
| **W3 Quests** | quest YAML and `tools/app/quests.py`; engine (states, steps, boards, anti-repetition, `learn` through `ask_quiz`, lesser form); journal cards with Show me; 13 Hearthrock quests (1 to 9, 11, 13, 14, 17) and the 5 solar mission upgrades (25, 27, 29, 31, 33) with raised coins; the lost-and-found box | `core/game/quests.ts`, `ui/journal/*`, `mods/nagmon/quests/*` | **L** |
| **W4 Economy v2** | gift system and tastes; Town Fund (state, UI, map change); soft daily cap; wish list; berry bushes; data-only price tables and the field-log wallet median | `core/game/{shop,loot,gifts,fund,fieldLog}.ts`, `economy/*.yaml` | **M** |
| **W5 Style, home and the rest of the cast** | wardrobe, hero cosmetics, creature accessories, decor placement, tailor shop; the upstairs home room; calendar, radio, trophy shelf, telescope, bed; the remaining 37 NPCs in waves; the rest of the quest catalogue | `core/game/style.ts`, art, maps, content | **L** + art-heavy |
| **W6 Optional live lines** | port `nagmon/ai` to TypeScript (`core/ai/{providers,router,safety,validate}.ts`), `LiveSource`, prompt builder, the 10 output checks and the accuracy firewall, line bank, budgets, parent screen (consent, key, caps, viewer, status), the Hebrew eval harness and report, the golden corpus | `app/src/core/ai/*`, `app/src/ui/parent/AI*`, `tools/ai_eval/*` | **M-L** |

Order rationale: W1 to W4 deliver most of the felt value with no network. W2 can run in parallel with W1 after W1's save schema lands. W6 waits for the pools and the fact base (it needs both) and for Q1 and Q2.

### 10.1 Acceptance tests (the slice is done when these pass)

**W1.** (1) Every NPC with a definition can be talked to (no allow-list). (2) The resolver puts an NPC in exactly one place per (day, phase); the same inputs give the same output; anchors never roam; map capacity is respected; a quest pin keeps its giver in place. (3) Over 14 simulated days the same NPC is at the same spot at most 40% of the time (roamers). (4) Anti-repeat tests A1 and A2 (section 4.11). (5) `WorldData` v1 saves load, migrate and keep coins, items, creatures and variables byte for byte. (6) Saved NPC records contain no child name or free text (grep). (7) The cashier's money question and payment still work as before (regression, existing e2e).

**W2.** (1) The PC opens from the nook tile, its 5 tabs render in RTL at 873x393; Boxes can swap a friend with the party and never delete one. (2) The daily postcard arrives once a day, event letters the next morning, the cap of 30 holds; gifts are claimed once. (3) TV sky: the moon phase for a fixed date equals a known value; the shower and solar-wind days are deterministic. (4) Fridge: one snack a day, the second tap says "tomorrow". (5) Journal: reading a sign adds the fact once; Recap picks only facts of the last 7 days and does not touch the rating.

**W3.** (1) Quest generator: 100 simulated days never post the same type twice in a day, the same giver in two consecutive postings, or a variant inside its cooldown. (2) A wrong answer never fails a quest: retry, hint after 2, lesser form after 3. (3) A once-only quest never returns; a chain survives a restart at every step. (4) SEL quests: reward objects are equal across options (table-driven test), no points written, flags excluded from the report (test). (5) The Show me pin equals the resolver's current spot.

**W4.** (1) E1 to E7. (2) A gift: loved, liked, ok each give the right points once a day; no negative outcomes exist in data. (3) A Town Fund donation survives a kill between steps.

**W5.** (1) Every cosmetic is modest (an automated check on the manifest tags and a manual look at each sprite). (2) Each wave of NPCs has its sheet, spots, at least 25 lines and 2 quests. (3) The upstairs room is reachable from the stair and back.

**W6.** (1) A1 to A10 (section 4.11). (2) With no key, no network or `enabled: false`, the game is identical to W5 (golden run). (3) The consent text lists what is sent and what is not, and the toggle needs the parent PIN. (4) The Hebrew eval report exists and the chosen model passed section 4.10. (5) A one-hour simulated session with a fake transport never exceeds the daily budget and never shows a failed line.

---

### 10.2 W3, as built

Status of this section: what the code does, branch `app/world-w3`. Verified means a test in the repo checks it; unverified is said where it applies.

**Data.** `mods/nagmon/quests/q_*.yaml` (12 quests) and `rules.yaml`; `tools/app/quests.py` checks them and ships `game/quests.json` (Hebrew only; English is validated and kept in the YAML). All numbers are in `rules.yaml`: the reward scale (XS 10 to XL 80), `active_max` 3, `hint_after` 2, `lesser_after` 3, the lesser share 50%, the 4th repeatable quest of a week at 60%, the board's gaps, and the solar missions' raised coins (25, 30, 40, 50, 60: `tools/app/solar_texts.py` reads them). A quest names a reward as a scale word or a number. The build refuses: an action outside `set_variable`, `clear_variable`, `give_item`, `send_letter` (a test reads the interpreter's own `ACTIONS` list, so a quest adds no engine action; money is paid only by rewards); an option of a choice that carries a reward or an action (kindness quests pay the same by construction); a pool quest with fewer than 6 variants or a missing band; a score word in a line; a person or prop that is not on the maps; `offers.quests` in a person's file that disagrees with the quests offered there. No purchases exist in W3.

**Quests built (12 of the 13 in the plan).** 1 `q_kitten_home`, 2 `q_wallet` (SEL, three options, same reward), 3 `q_baker_double` (6 variants), 4 `q_berry_basket`, 5 `q_mail_round`, 6 `q_tom_swap` (6 variants), 7 `q_lost_found` (the box is a prop at (31,14) of the square), 8 `q_clock_set`, 9 `q_shelf_sort`, 11 `q_chess_riddles` (three riddles on three different days), 13 `q_board_fix` (the board gets a 4th card), 14 `q_mint_run` (across three people). The 5 solar missions keep their map events and pay the raised coins. Step kinds: say, ask (the learning engine's question: level is the engine's), bring (takes the item from the Bag), choose (with a right option: free retry; without: SEL or a free choice). Givers: 11 different people or props.

**Engine.** `core/game/quests.ts` (data, save, rules as functions), `boardGen.ts` (the board), `questFlow.ts` (talk, offers, steps, journal), `questWhere.ts` ("Show me"). The event runner asks the engine on every `talk` (after the person's greeting) and when a map opens; the host gained one method, `choose`. Quest state is `world.quests` (additive, optional; ids, days, counters, no text; schema stays 2). A wrong answer is a free retry, the owl's hint after 2, the lesser form after 3 (half coins, items and friendship unchanged). The 4th repeatable quest of a week pays 60% of the coins. "Not now" always exists; a declined offer is not repeated that day. Journal: up to 3 active.

**The board.** W2's contract held: `board.accepted[postingId]` is written by the screen and read by the engine (`syncBoard`, at accept and when a map opens). The static postings are gone from `noticeboard.yaml` (the build refuses a list there); the screen's source is the generator (`QuestEngine.source()`). The day's cards are decided once, from the day and the child's `npc_seed`, and saved (`quests.board`), so the board is the same all day. Held on every day: one card per slot (easy, normal, learning, weekly on Sunday, a second easy one once the board is mended), no two of one type in a day, never the same giver twice in a row or twice in a day, a giver at most twice a week, a variant never inside its cooldown, a once-only quest never after it is done; the giver gap of 3 postings is held while the pool allows and shrinks to "not twice in a row" when it does not. At least 40% of learning cards go to the child's two weakest subjects (computed from the local answer log, never sent).

**Journal screen** (`ui/journal`, a chunk of its own): cards with picture, title, what to do now, dots, "Show me" (says where the person is now, by asking the resolver with the map's own room, so it equals where the map puts them); the finished shelf. Reachable from the Bag (a button in its rail, outside a battle). A 6th PC tab was tried and dropped: six tabs put one under the "something is wrong" button at the top centre of the phone; `QuestJournalBody` is exported and ready for a place with room.

**Props.** The kitten and wallet stories used `remove_npc` and `translated_dialog_choice`, which the app never ran, and props were drawn from a new-game state only. The map events of the kitten and wallet are gone; the quests run those stories; the maps' `create_npc` props are now made again at every map entry from the saved variables (`propsNow`). Known: the Route 1 kitten sprite stays until the child leaves the map after she is found (there is no sprite removal).

**Tests.** Python `tests/app/test_app_quests.py` (43), objects and maps tests updated; vitest `tests/unit/quests/*` (questData, board with 100 simulated days, engine, runner, props); e2e `tests/e2e/quests.spec.ts` on phone-he at 100% and 130% text: accept via the board, journal, find the baker, answer, reward; and Yoav's kitten over three talks and two maps. The index script stays under 450 kB.

**Deferred.** Quest 17 `q_fountain_lights` (needs the Town Fund and its coin sink, W4); the soft daily cap on world coins (W4); quests 10, 12, 15 to 16, 18 to 24, 26 to 35 and the rest of the 35; 12 clue sets for the lost-and-found box (one set today); the map arrow of "Show me" (it names the place in words); NPC flags that remember the last quest; the 5 solar missions as journal cards; the weekly monthly variants; quest friendship is the giver's `quest_done` points only.

**Unverified.** The Hebrew lines are not native-reviewed (`W3_HEBREW_REVIEW.md`); nothing was run on a real phone or the emulator; the e2e runs use a fixed clock and a chosen `npc_seed`; the weak-subject weighting is tested on made-up pools, not on a real child's log.

## 11. (h) Art and audio needed

Style: **the same pipeline as the 20 existing map sheets and the owl and Mila portraits** (`tools/art/manifest.yaml`, `art_sources/`, packages imported by `tools/app/art2.py`; the manifest records each source file and hash). Modest dress in every picture (long sleeves, ankle-length skirts, no swimwear), mixed skin tones and hair, ordinary Israeli clothes, friendly faces, no weapons, no text baked into pictures. Licence for owner art is "not stated yet" (`INDEPENDENCE.md`): choose one before release.

**Prompt skeleton for ChatGPT** (one image per request, one subject, plain background so the importer can cut it): "Soft digital illustration in the same style as the attached reference sheet of Nagmon (friendly, rounded, flat colours, thin dark outline, children's game). Subject: `<name, age feel, clothes, one prop>`. Layout: `<map walking sheet: 4 directions x stand and two steps | portrait: 3 expressions friendly, thinking, cheering | object: 2 states>`. Plain flat background. Modest clothing: long sleeves, long skirt or trousers. No text, no logos, no weapons."

### 11.1 Characters (map sheets and portraits)

| Wave | Who | Pieces |
|---|---|---|
| 0 (exists) | owl, astronomer, Mila, Granite, granny, sage, grey hood, kid, mail carrier, moon engineer, rover driver, shopkeeper, teacher (also used for the gardener), tourist | 14 sheets already; **portraits** needed for the 7 solar people (the sage and grey hood have none) |
| 1 | baker, carpenter, pharmacist, librarian, ranger, photographer, tailor, card trader, clockmaker, newsboy, chess player, rival Roni, neighbour Galit | 13 map sheets + 13 portraits |
| 2 | scout, fisher, mechanic, harbor manager, geologist, young astronaut, cadet, physicist, sail pilot, sunspot kid, collector, meteor watcher, space trader | 13 map sheets + 13 portraits |
| 3 | ring researcher, moon pilot, ocean researcher, telescope keeper, lighthouse keeper, writer | 6 + 6 |
| Animals and robots | Tiky, Dudu, Beep (robots), Pita and Cosmo (cats, Pita exists as `cat_map_a/b`) | 5 map sheets, expressions as text only |
| Sums | 38 new map sheets, 32 new portraits | |

### 11.2 Objects (map sprites, 16x32 or 32x32, two states where marked)

`obj_pc` (off, on), `obj_mailbox` (flag down, up), `obj_postbox`, `obj_bookshelf`, `obj_tv` (off, on), `obj_fridge` (closed, open), `obj_wardrobe`, `obj_mirror`, `obj_noticeboard` (empty, with cards), `obj_trophy_shelf`, `obj_calendar`, `obj_radio`, `obj_telescope`, `obj_berry_bush` (empty, full), `obj_lostfound_box`, `obj_townfund_statue` + 6 project pictures (fountain lights, bench and swing, library corner, greenhouse wing, flower arch, lantern path), `obj_bench`, `obj_swing`, `obj_vending`, `obj_bed`, `obj_aquarium`. About 30 pictures.

### 11.3 UI pieces

Mail: `ui_envelope_closed/open/unread_dot`, a postcard frame, stamp art (10 reading stamps), letter paper. PC: 5 tab icons (boxes, items, mail, journal, people), box wallpapers (6). Friendship: 4 heart levels. Quest: `!` and `?` markers, quest card frame, progress dots, board card with a pin, "Show me" arrow. Sky: 8 moon phase pictures, meteor shower, solar wind. Wish star. Fund progress bar. Gift box. About 40 pieces.

### 11.4 Items and cosmetics (icons 128 px, and worn sprites)

Hero style: 6 hats, 4 scarves, 3 capes, 4 backpacks, 4 shoes, 2 glasses, pin holder = 24 items, each an icon and a worn overlay per hero sheet (3 heroes). Creature accessories: 12 icons and overlays (shared by species silhouette classes, 4 classes). Decor: 16 icons and map sprites. Gifts: bun, flower, sticker pack, picture book, shiny stone, juice (6). Other: 6 letter sprites. About 200 pictures; the overlays are the expensive part, so ship **hats, scarves and backpacks first**.

### 11.5 Audio

| Sound | Use |
|---|---|
| Mailbox ding, envelope open, page turn, stamp thump | mail, books |
| PC power-on hum and tab tick; box swap pop | PC |
| TV static blip and a soft jingle (3 channels) | TV |
| Fridge open, snack crunch | fridge |
| Paper rustle, pin, board accept chime | notice board |
| Quest accepted, step done, quest complete (3 short motifs, rising) | quests |
| Coin pour (3 sizes), purchase "clink", Town Fund fill and the morning-after sparkle | economy |
| Friendship level-up, gift reaction (loved, liked) | relationships |
| Voice blips (3 pitches: low, mid, high; 2 short robot, 1 animal purr) | NPC speech |
| Ambience: bakery bell, park birds, station hum, lighthouse waves | places |
| Music: a gentle new "post office" loop and a "station lounge" loop | optional, CC0 or generated (`INDEPENDENCE.md` stage 2) |

About 30 sounds. No speech audio is generated by the live AI (no TTS in this document).

---

## 12. (i) Questions for the parent (6, each with my recommended default)

| # | Question | Recommended default |
|---|---|---|
| 1 | **Should live AI lines exist in the first release at all?** Pools alone already fix "the same text every time". | Ship W1 to W5 with pools only. Build W6 behind a parent switch that is **off by default**; decide to ship it after the Hebrew eval report (section 4.10) and your own 10 minutes of testing. |
| 2 | **Which provider, and who pays?** Cost is about 0.1 to 0.4 US dollars a month per child. Google's Gemini API terms (as I read them) require 18+ and bar apps likely to be used by under-18s, even though Flash-Lite is cheap and good; Groq puts the responsibility on the app owner and offers Zero Data Retention. Either way the phone talks directly to the provider with **your** key, the provider sees the phone's IP address, no child data is in the prompt, and we run no server. Are you comfortable with that? | Groq with your own key and ZDR switched on, model chosen by the Hebrew gate. Gemini only if you read its terms and accept them. If you are not comfortable, no AI at all: the pools are the product. A lawyer reads this before any public release (COPPA and Israel Amendment 13 above). |
| 3 | **What can you see?** I propose: live lines marked with a small sparkle; a parents' viewer of the last 30 live lines for 24 hours on the device only; logs and uploads hold ids and counts, never text. The old owl showed a standing notice that parents can read the talks. Is that the right level, or do you want no text kept at all? | The sparkle and the 24-hour on-device viewer; nothing uploaded; a standing note in the parents' area that NPCs are made-up characters, not people. |
| 4 | **May the child ever type to an NPC?** Chips are safer and need no keyboard at ages 5 to 7. Free text brings back input filtering, personal-information risk and the FTC's companion-chatbot concerns. | No free text to NPCs in v1. Revisit for ages 10 and up only with the old owl's input filter and your say-so. |
| 5 | **Coins: are these the right sinks and caps?** Cosmetics (modest only), home decor, creature accessories, gifts, the Town Fund, a wish list; a soft cap of 150 world coins a day; repeat quests paying 60% after the 4th a week; "coins never buy learning". Granny's wallet currently pays 30 for returning it; in the SEL version every option pays the same. | Yes to all, as written. |
| 6 | **Cast, tone and calendar.** The 53 names and roles in section 6 (please veto any), a native-Hebrew and educator review before release, NPC schedules on the phone's real clock (morning, afternoon, evening, with no special Shabbat or holiday behaviour at first, though your holiday mode can later hide visitors), and an optional "note from the family" letter you could type in the parents' area. | Approve the cast with your vetoes; real clock, no calendar rules yet; the family note off unless you want it. |

---

## 13. Sources

Marker: **checked** = a search result showed the relevant text; **soft** = a blog, guide or snippet; **memory** = from general knowledge, not checked this session.

* Repo (read this session, branch `nagmon-app`, commit `6eade51`, and the two spec branches): `docs/app/{FEATURES_STATUS,INDEPENDENCE,SEL,QUESTION_AUDIT,BATTLE_V3,ART_ASSETS}.md`; `FEATURES.md` (branch `app/features-spec`) 4.2 to 4.4, 4.13, 5.1 to 5.5; `TRIPS.md` (branch `app/trips-spec`); `docs/kids/SDD_AI.md`, `RESEARCH_AI_PROVIDERS.md`, `SDD_WORLD.md`, `SDD_MODESTY.md`; `app/src/core/world/events.ts`, `worldState.ts`, `app/src/app/playConfig.ts`, `app/src/core/family/parent.ts`, `app/src/platform/secrets.ts`; `mods/nagmon/{maps,db/npc,economy,trips,lessons}`; `tools/app/solar_*.py`; `nagmon/ai/*`.
* Pokemon: PC and Boxes, "Someone's PC" and "Bill's PC", storage (Bulbapedia, **checked**): https://bulbapedia.bulbagarden.net/wiki/Personal_Computer and https://bulbapedia.bulbagarden.net/wiki/Bill. Berry trees, one berry per tree per day in Gold, Silver, Crystal (Bulbapedia, **checked as a snippet**; real-time versus in-game clock unverified): https://bulbapedia.bulbagarden.net/wiki/Berry_tree. Pokemon Center, Mart, mail and item balls: **memory**.
* Stardew Valley (wiki, **checked**): Friendship https://stardewvalleywiki.com/Friendship ; Gifts https://stardewvalleywiki.com/Gifts ; Help Wanted https://stardewvalleywiki.com/Help_Wanted . Schedules: **memory**.
* Animal Crossing: New Horizons visitors (**soft**: GameSpot, iMore, Gfinity): https://www.gamespot.com/articles/animal-crossing-new-horizons-visitors-guide-gulliv/1100-6475398/ ; https://www.imore.com/animal-crossing-new-horizons-visitor-guide-when-expect-celeste-flick-cj-kicks . Letters: **memory**.
* Ni no Kuni errands (**soft**): https://gamesradar.com/ni-no-kuni-errands-guide ; Ni no Kuni II side quests: https://gamerguides.com/ni-no-kuni-2-revenant-kingdom/guide/the-basics/gameplay ; Dragon Quest XI map markers (**soft**, German walkthrough): https://www.giga.de/spiele/dragon-quest-11/gallery/dragon-quest-11-alle-missionen-walkthrough-zu-jeder-nebenquest/ . Yo-kai Watch, Undertale, Spiritfarer: **memory**.
* Disney Dreamlight Valley friendship quests (**soft**): https://www.godisageek.com/2022/09/disney-dreamlight-valley-friendships-how-to-build-them-fast ; https://Gamespot.com/articles/disney-dreamlight-valley-friendship-guide-how-to-level-up-quickly/1100-6508169/ .
* Generative Agents, Park et al., UIST 2023 (**checked**): https://arxiv.org/pdf/2304.03442 .
* Ubisoft NEO NPC, GDC 2024 (**checked**, press release): https://staticctf.ubisoft.com/8aefmxkxpxwl/Mw2s4KjssknqHHh1VIf8V/720296810ecc3deae51778a219732c7f/PRESS_RELEASE_GDC_UbisoftUnveilsNEONPC_190324.pdf ; Game World Observer https://gameworldobserver.com/2024/03/20/ubisoft-neo-npc-genai-real-dialogue-with-game-characters .
* Inworld, Convai and AI-NPC reality check (**soft**): https://app.cinevva.com/guides/ai-npcs-dialogue .
* AI Dungeon filter and moderation backlash (**checked**): https://vice.com/en/article/text-adventure-game-community-in-chaos-over-moderators-reading-their-erotica ; https://www.theregister.com/2021/04/30/ai_dungeon_filter_vulnerabilities/ ; https://help.aidungeon.io/faq/openai-and-filters .
* FTC 6(b) inquiry into AI companion chatbots, Sept 2025 (**checked as snippets**): https://www.bitdefender.com/en-us/blog/hotforsecurity/ftc-ai-companion-kids-safety .
* COPPA amended rule, Federal Register 2025-04-22 (**checked**): https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule ; compliance date April 22, 2026 (**soft**): https://bbbprograms.org/media/insights/blog/coppa-amended .
* Israel Privacy Protection Law Amendment 13, in force 2025-08-14 (**soft**, law-firm summaries; no minors clause found): https://www.loc.gov/item/global-legal-monitor/2025-11-17/israel-amendment-to-privacy-protection-law-goes-into-effect/ ; https://www.pearlcohen.com/major-amendment-to-israeli-privacy-law-set-to-take-effect/ . GDPR Art. 8: **memory**.
* Gemini API Additional Terms (effective 2026-03-23, via search snippet, **read the live page before relying**): https://ai.google.dev/terms ; official pricing page (not opened): https://ai.google.dev/gemini-api/docs/pricing . Prices (**soft**, third party): https://www.morphllm.com/gemini-api-pricing ; Gemini 3.1 Flash-Lite model id and limits (**soft**): https://freellm.net/models/google-gemini/gemini-3-1-flash-lite . Groq prices and limits (**soft**, sources conflict; check the console): https://www.morphllm.com/groq-pricing ; https://eesel.ai/blog/groq-pricing .
* Hebrew quality of candidate models: **not found**; hence the gate in section 4.10.
