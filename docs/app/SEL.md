# SEL: teaching emotional intelligence and social coping in Nagmon (research and design)

Status: design proposal (docs only, no code). Date: 2026-10-21. Branch `app/sel-spec`.
Trigger: the parent asked that the game also teach and develop emotional intelligence and coping with social situations, for personality. Language of the game stays Hebrew (RTL); this document is English with Hebrew examples. No family details appear here.

Reading guide: sections 1-2 are research and the skill map; 3 is the catalogue of game mechanics; 4 is how to measure without recording feelings; 5 is the roadmap (slice 1 first); 6 is safety and ethics; 7 is the open questions. Sources are in section 8. "Soft" = a blog, press piece, vendor page or a source I could only read as a search snippet; I give no number from a soft source without saying so. A few primary papers could not be opened in this session (the fetch tool had no route to pubmed/casel.org); those claims rest on search summaries and are marked.

---

## 0. What the game already has that this builds on (read from the repo)

| Existing piece | Where | Why it matters here |
|---|---|---|
| Battle is already about **calming a frightened creature**: the wild creature's "fog" (forgetting) goes down with right answers, then it sits **calm** and a net/seal question follows. Nothing is lost; "Leave" is always free. | `docs/app/BATTLE.md` 1.1 and 4; `app/src/core/game/battle.ts` (phase `fighting` -> `calm`) | The calm moment is a natural, already-meaningful place for a regulation step (breath, name, count). |
| Hearts (0-5) with the partner and friends; hearts never go down; care model is Pokemon-Amie style, not Digimon-style punishment. | `docs/app/FEATURES.md` 4.9 (branch `app/features-spec`) | Relationship feedback without scores or loss. |
| NPC roles with **memory** ("they remember what you did"), a "lost kid" role, a "rival who learns alongside" and the **teachable-agent** pattern ("explain it to me"). | `FEATURES.md` 5.1, 5.2 | The vehicle for dilemma NPCs, repair and "teach the creature". |
| Kindness quests: the kitten and **the wallet** (found wallet, return or keep; a second chance if kept). | `mods/nagmon/maps/classic_hearthrock_city.yaml` (events `Wallet ...`, `Granny ...`, `Kitten ...`) | The seed of the dilemma format. See 0.1 for what to fix. |
| Rules: a wrong answer never punishes; show, don't write (one short Hebrew line); nothing about a child leaves the phone without consent; no family details in the public repo; modest characters. | `FEATURES.md` rules 1-6, `docs/kids/SDD_MODESTY.md` | The SEL layer must obey all of them. |
| Parents' area (PIN), profiles per child, log upload only with consent. | `docs/kids/GAME_PLAN.md` 9-10, `FEATURES.md` 4.16 | Where parent conversation cards and settings would live. |

### 0.1 The wallet choice, read critically (it is the template, so its flaws matter)
- Choices are labelled outright: "להחזיר לסבתא רינה" / "לשמור לעצמי". One option is plainly the "good" one.
- Returning pays: 30 coins plus a water berry, then a closing sentence names the value ("החזרת אותו, גם כשאף אחד לא ראה. זה יושר." and "יושר עוזר לכולם להרגיש בטוחים."). That is both a **reward for the right answer** (invites gaming) and a **sermon** (the two pitfalls in section 1.3).
- Keeping has no cost and a **good** second chance (Granny Lost -> "להחזיר את הארנק" / "אולי אחר כך"). Keep this: repair without shame is exactly right.
- Missing: a third, realistic option ("ask a grown-up to help"), and any visible effect of the choice on the world (Granny's mood, the street).

### 0.2 What the code can do today (matters for slice 1)
`translated_dialog_choice` is a Tuxemon action used by the mod's map YAML (it stores the chosen msgid in a variable, e.g. `nagmon_wallet_choice`, which later events test with `is variable_set`). It is whitelisted as a msgid action in `app/src/core/data/types.ts` (`MSGID_ACTIONS`), but the **app's event interpreter does not run it yet**: `app/src/core/world/events.ts` `ACTIONS` contains `translated_dialog`, `set_variable`, `clear_variable`, `modify_money`, `nagmon_daily_count`, `ask_quiz`, `create_npc`, `char_face` only, `EventHost` has `say()` and `quiz()` but no `choose()`, and `RunnerOptions.talkTo` opens the cashier only. So today the wallet, granny and kitten quests work in the old Tuxemon build and **not in the new app**. Slice 1 must add the choice action (host method, dialog buttons, tests) before any dilemma can be played.

---

## 1. Research summary (one page)

### 1.1 What the evidence says, in short
- **School SEL works, modestly, and mostly on skills.** Durlak et al. 2011 (213 universal school programmes, 270,034 pupils): better SEL skills, attitudes, prosocial behaviour, fewer conduct problems and less distress, and an 11-percentile-point academic gain. As I recall the paper (not re-opened this session), the effect on **skills** was the largest (about 0.5 standard deviations) and the others small (about 0.2-0.3). Programmes that were **SAFE** (Sequenced, Active, Focused, Explicit) did better; those that were not showed no significant effects. Taylor et al. 2017 (82 programmes, follow-ups from 6 months to 18 years): benefits persist but are often small, and two of four authors are at CASEL, the advocacy body. [1][2][3]
- **Named programmes** have thin-to-moderate independent evidence: Zones of Regulation is popular but independent reviews call the evidence insufficient to class it evidence-based (developer briefs are practice-based, so soft) [5]; PATHS: the US What Works Clearinghouse reviewed 35 studies, only 2 met standards [6]; RULER (mood meter) has a 62-school cluster trial showing better classroom climate, mostly Yale-affiliated authors, and no trial isolating the mood meter alone [4]; KiVa (anti-bullying, bystander roles) has the largest trials: victimisation fell in the UK trial of 11,000+ pupils, but "defender" roles did not rise, so bystander training is **hard** [7].
- **Digital games for emotional skills: small and promising, not proven.** A review of digital emotion-regulation interventions for ages 8-14 (39 studies, 27 of them games): games reduced negative emotional experience, Hedges g = -0.19, strongest in anxiety-prone youth; across all digital interventions the regulation effect was not significant [8]. Zoo U (social-skills game for grades 2-4) has a **pilot** RCT, n = 47 (23 vs 24 wait-list), with gains in impulse control, emotion regulation and social initiation, described by its authors as preliminary; the larger IES trial results I could not find [9][10]. No pooled effect size exists for "SEL games" in general; do not promise one.
- **Adults multiply it.** Daniel Tiger studies: children who used the show's strategies more a month later, and gains in empathy and emotion recognition appeared mainly when a **parent discussed** the content (Texas Tech, 127 children aged 2-6; a producer-commissioned UCLA survey is soft) [11][12].
- **Growth mindset and breathing: small effects, keep the claims small.** Mindset interventions: d about 0.05-0.1 on achievement, larger only for at-risk pupils and when peers support the message [13]. School mindfulness: g about 0.2 (figures differ between sources) [14].

### 1.2 The 8 principles that work (and how each shows up in Nagmon)
| # | Principle | Evidence | In this game |
|---|---|---|---|
| P1 | **Teach skills explicitly, in a sequence, with active practice** (SAFE), not just values | [1] | A small ladder per skill (name it, notice it, choose a tool, try it); the child does something, not reads something |
| P2 | **Practise in realistic situations, low stakes, repeated, spaced** | [1], [9] | Scenes recur with variations in different places and age bands; no scene is a one-off lecture |
| P3 | **Start at a distance: the creature or a third person first, then "me"** | clinical practice, soft; Daniel Tiger [11] | Feelings check-in starts with the partner; dilemmas happen to NPCs; "and you?" is optional and private |
| P4 | **Grow the emotion vocabulary gradually** (good/bad and calm/excited first, then specific words; categories settle around ages 5-6 and keep sharpening) | [15] | 4 faces for ages 5-7, 8 words for 8-10, mixed and shaded feelings (both proud and nervous) for 11-14 |
| P5 | **A small toolbox of regulation strategies, practised when calm, chosen by the child** (breath, count, name it, safe place, tell someone, step away, reframe) | [1], [8], [14] | The calm step in battle; "my calm tools" the child picks; strategies appear in stories, not as commands |
| P6 | **Perspective-taking is asked, not assumed**: "what might they feel? how could you find out?" The honest answer is "ask them" | theory-of-mind work: false belief about 4-5, second-order about 6-8, faux pas understanding keeps growing past 8 [16] | Guess-then-ask scenes; two viewpoints in one scene for 8+; no single "correct" reading of a face |
| P7 | **Show consequences inside relationships, never as points** (an NPC remembers, a creature relaxes, a friend plays) | moral-choice game research [17]; Zoo U logs choices as stealth assessment [9] | NPC memory lines next visit; hearts are relationship, not score |
| P8 | **Bring adults in**: the game opens a conversation, a real person closes it | [11][12] | Optional parent conversation cards; a "talk to a grown-up" button always available |

### 1.3 The 6 pitfalls (and the guard for each)
| # | Pitfall | What it looks like | Guard |
|---|---|---|---|
| X1 | **Moralising** | A closing sentence that names the lesson ("זה יושר"); a green tick on the kind option | No lesson line. The NPC reacts as a person would. Reflection is a question or a silence, never a verdict |
| X2 | **Gaming the right answer** | The child learns that "kind option = coins" and taps it; second playthrough picks "evil" to see (players do, [17]) | Equal material outcomes for every option (a test, section 5); options not pre-labelled good/bad; consequences are relational and delayed; the game cannot verify honesty so it never scores it |
| X3 | **Shame, labelling, diagnosing** | "You seem angry"; colour-zones assigned to the child; a profile like "low empathy" | The game never names the child's state; no scores, no labels, no profile; checks are about the creature first; nothing "wrong" to feel |
| X4 | **Surveillance and privacy** | Recording feelings, free text, voice, uploads, a parent dashboard of the child's inner life | Section 4 and 6: local only, opt-in, story choices only, no feeling log, no free text, never in the log upload |
| X5 | **Wrong level**: babyish for 11-14, too heavy for 5-7, cutesy faces for teens | Eye-rolls and quitting; or nightmares | Three detail bands (5-7, 8-10, 11-14), different art tone and scene weight, heavy topics off by default |
| X6 | **Over-claiming and no transfer** | "The game builds empathy"; skills practised only inside the game | Say "practice and conversation starters"; the parent cards and real-life prompts carry transfer; evidence above is modest and we say so |

### 1.4 Jewish and Israeli context in short
- **Ministry of Education (Israel)** runs social-emotional work through the educational climate (אקלים חינוכי) and the school's counselling and psychological service: for kindergartens "מעגל הקסם" (a group discussion circle on feelings, social and values topics with fixed respect rules; adapted from a US programme of the 1970s) [18]; for primary school the "הל"ב" class-as-social-group work and a **dilemma-based** "Storybook" kit (pupils decide how a fantasy-story continues, topics include exclusion and peer pressure, grades 5-6) [19]; and the 2023-24 "מאלימות למנהיגות" ("from violence to leadership: together creating a safe space") plan on belonging, social rejection, exclusion and boycott [20]. I found no single current document listing the whole framework; check the Pedagogical Administration pages before quoting it to a school (soft).
  - Lesson for us: **circle talk, open dilemmas, class belonging and exclusion** are the Israeli vocabulary a child may meet at school; mirroring them in the game helps transfer.
- **Character (מידות) and Mussar.** Mussar teaches traits as **ranges, not rules**: too little or too much of patience, kindness (חסד), gratitude (הכרת הטוב), humility, honesty (אמת), and practice-based (notice, then practise) rather than preaching. The Mussar Institute has a children's curriculum for about ages 4-8 built on early-childhood educators, aiming to move from awareness to practice and balance [21]. Bein adam lechavero (בין אדם לחברו, between a person and another) covers exactly our topics: derech eretz (דרך ארץ), not shaming (not embarrassing someone), watching speech (שמירת הלשון: teasing, gossip), judging favourably (דן לכף זכות: assume good intent), returning a lost item (השבת אבידה: the wallet), welcoming (הכנסת אורחים), thanks.
  - **Secular-neutral way in:** plain words that happen to be the traits (סבלנות, נדיבות, יושר, תודה, כבוד), shown by what characters do. The word "מידות" and any source text live only in an optional **parent layer**. Open question 1 and 2 ask the parent how far to go.
- **Language:** kids' Hebrew, short, warm, present tense; avoid clinical words (לא "ויסות רגשי", כן "להירגע", "לנשום ביחד"). Hebrew is gendered: use the profile's gender form or neutral phrasing (infinitive, "מה עושים?") for the child; creature lines are free.

---

## 2. Competency map: CASEL areas, adapted, plus family character traits, by age band

Bands match `FEATURES.md` 4.0 (A: 5-7 about gan to grade 1-2; B: 8-10 grades 3-5; C: 11-14 grades 6-9). "Can do" is design judgement from the developmental sources above [15][16][22]; the bands overlap and the parent can override.

| CASEL area (adapted) | Family trait (neutral word / traditional name) | A: 5-7 | B: 8-10 | C: 11-14 |
|---|---|---|---|---|
| **Self-awareness**: notice and name feelings, strengths | knowing yourself; humility (ענווה) as "not too big, not too small" | Point to a face (happy, sad, mad, scared); "my tummy feels..." body clues | 8-10 feeling words; strength spotting ("I am good at waiting"); same feeling at different sizes | Mixed and shaded feelings (proud and nervous), triggers and patterns, what helps me |
| **Self-management**: calm down, wait, persist, handle a loss | patience (סבלנות), self-control | Belly breathing, count to 5, "stop and ask for help"; take turns | 3-4 tools, choose one; frustration after a mistake ("not yet"); losing a game and staying friends | Plan for a hard moment, reframing, stepping away without storming off, delayed reward |
| **Social awareness**: see other viewpoints, empathy, respect | caring, judging kindly (דן לכף זכות), derech eretz | "She is sad because..."; helping someone sad; kind words | Two viewpoints in one scene; faux pas ("he did not mean it"); fairness | Hidden feelings, group dynamics, why people tease, who is left out, norms; sympathy for people you do not know |
| **Relationship skills**: friendship, communication, conflict, repair | kindness (חסד), honest speech, forgiveness (מחילה), welcoming | Share, invite, say sorry when ready, "I feel ... when ..." in 3 words | Join a group, take turns in talk, I-messages, negotiate, apologise and repair, ask for help | Disagree respectfully, set a boundary, stand up for someone (upstander), end a hurtful friendship pattern, gossip and trust |
| **Responsible decision-making**: weigh choices and consequences | honesty (יושר/אמת), returning lost things, gratitude (הכרת הטוב) | Two options, "what happens then?"; tell the truth about a small mistake | Steps (stop, think, choose); who is affected; being honest when no one sees | Competing loyalties, peer pressure, long-term effects, own values; "what would I want done to me" |
| **Growth and resilience** (not a CASEL area; added because of learning) | perseverance, thanks | "I can't do it **yet**" | A mistake is information; ask for a hint is brave | Effort strategies, setbacks; keep claims small [13] |

What feels babyish or too heavy:
| Band | Feels babyish | Too heavy | Works |
|---|---|---|---|
| A | Long text, abstract talk | Cruel exclusion, loss, fear of loud things, being alone | Big faces, animals, one clear thing per scene, a calm voice, doing with the body |
| B | Cartoon faces for every feeling, "baby" breathing balloons | Betrayal, public humiliation | Fair/unfair, friend groups, two sides, funny NPCs, secrets that can be told |
| C | Cute mascots, speech bubbles that tell them how to feel, praise for being kind | Anything that sounds like a school assembly; being "watched" | Realistic and dry-humoured scenes, no right answer, real consequences, privacy, autonomy, "your call" |

---

## 3. Catalogue of game mechanics (14) that fit this game

Common rules for every mechanic: nothing is lost or punished; skipping is always available; no timers; one short Hebrew line, then pictures; the NPC or creature **reacts**, there is no "correct" banner; the learning engine's Elo/SRS is **not** touched by any of these (they are not graded); Leave works everywhere; modest figures only. Cost: S = 1-2 days, M = 3-6, L = 1-2 weeks (as in `FEATURES.md` 6).

### 3.1 The catalogue

| # | Mechanic | The child does (one line) | Learns | Ages | Lives in | Cost | No moralising | No gaming |
|---|---|---|---|---|---|---|---|---|
| M1 | **Partner check-in** | Taps the partner on the Friends card or at home: "איך X מרגיש היום?"; picks a face; the creature answers with an animation; optional second tap "ואני?" (private, not stored) | Name feelings; notice that feelings change; start at a distance (P3, P4) | A-C (faces differ by band) | Friends card, home meadow, arena before a battle | S | The creature just does its thing (curls up, hops); no advice | Nothing to win: no reward, no streak; a daily cap keeps it from being a chore |
| M2 | **Breathe with it (calm step)** | After the fog is gone and the creature sits **calm** (or when a creature is "scared"), an optional button **נושמים ביחד**: three slow breaths with an expanding ring and the creature; then the Net | Breath as a tool (P5); co-regulation | A-C (the ring is calmer and smaller for C) | `BattleScreen` calm view, beside **Net**; also Rest Center and home | S | The line is one invitation, no explanation; no "good job relaxing" | Never required: Net works without it; no meter, no reward for doing it, so no reason to spam it; reduced motion = static count 1-2-3 |
| M3 | **Dilemma NPC** | Talks to someone with a small problem or a temptation; picks from 2-3 plain options (including "ask a grown-up" and "not now") | Decision-making, consequences, honesty, kindness (P2, P7) | A-C (weight by band) | Hearthrock streets, Route 1, houses | M (needs the choice action) then S per scene | The NPC answers as a person ("אוף, נו, תודה"), no narrator lesson | Equal coins/items for all options; neither labelled good/bad; consequences are the NPC's mood and what they say next time |
| M4 | **They remember** | Returns a day later: the NPC mentions what you chose ("ראיתי שחלקת את התות, תודה"), or a quiet change in the scene | Actions have effects on relationships (P7) | A-C | NPC memory in `FEATURES.md` 5.1 | S per scene (the memory exists in the roles design) | Memory is a plain remark or an object that changed, not praise | Relational only; a "bad" choice is remembered with understanding and a path to repair (see M7) |
| M5 | **Guess, then ask** | A character shows a feeling by face and body; the child guesses; then taps **לשאול** and the character says what it really is, often not what you guessed | Perspective-taking: you cannot know, you can ask (P6) | A (one face) B C (shaded or hidden feelings) | Wanderer and lost-kid roles; Rest Center nurse | S per scene | The character just tells: "בעצם אני פשוט עייף" | The guess is never marked wrong; the answer is whatever the character says (several possible truths per scene) |
| M6 | **Say it kindly (word cards)** | Builds a sentence with 3 cards (when / I feel / could we...) to tell an NPC something hard; the NPC reacts to the **tone** | I-messages, asking, boundaries, tone (P1) | B-C | Sibling-style and friend scenes; family NPCs | M (card UI, tone reactions) | NPC reacts honestly, including "hmm" for harsh cards, and keeps talking | Several workable combinations; harsh cards are allowed and lead to a different (not failing) conversation, so the child can see tone matter by trying |
| M7 | **Repair** | After a mistake that hurt someone (the partner's tail knocks a flower stall, a joke went too far), the child chooses: say sorry / help fix it / ask what they need / not yet | Apology as repair, being ready not forced, forgiveness takes time [23] | A-C | Hearthrock, after M3/M4 scenes; also after the wallet kept | M | The other character says what they feel; "not yet" is a legal answer and the NPC says "ok, I will be here" | Sorry-card is not the "winning" card: each repair option gets a different response; a coerced-sounding choice reads worse to the NPC (kids themselves judge forced apologies as ineffective [23]) |
| M8 | **Include** | Meets a creature or kid standing alone at the bench; chooses to invite, sit near, ask, or walk on | Including, courage to approach; what exclusion feels like from outside (P6) | A-C | Hearthrock park bench / playground-like corner, Route 1 camp | S per scene | The kid answers like a kid: "אולי אחר כך" is allowed; no automatic happy ending | Same outcomes materially; an invite is not always accepted, so it cannot be a button-that-wins |
| M9 | **Wait your turn** | Two NPCs and the child reach one berry bush or one shop counter; the child may go first, wait, or share; a visible queue tells who is next | Patience, fairness, sharing (P5) | A-B (C as negotiation) | Shop counter, berry bush, friendly duel (the NPC goes first) | S | The queue and the NPCs' remarks, no tick | Waiting costs nothing and gives nothing; nothing times out; the choice is only about people |
| M10 | **My calm toolbox + teach the creature** | Picks 2-3 favourite calm tools (breath, count, name it, safe place, tell someone) for the toolbox; later a young creature or rival asks "what do I do when I am scared?" and the child chooses to teach one | Self-management; teaching consolidates (teachable agent, `FEATURES.md` 5.2) | B-C (A: just two tools) | Me card; the rival role; calm step shows the child's tools | M | The creature tries it back, sometimes funny-wrong first, never "correct!" | No right tool; whichever the child teaches, the creature tries it and says how it went (different, believable results) |
| M11 | **Not-yet reframe** | After a few wrong answers in a row the owl or partner offers an option: "עוד לא, ננסה אחרת?" with a hint or a different task | Frustration tolerance, help-seeking as brave (P5) | A-C (C: dry, short) | Question screen, battle (ties to the existing "after 2 wrong in a row the owl floats in with a hint") | S | One short, specific line about the **task** ("this one is tricky"), not about the child | Not a grade; no coins or streaks depend on it; no praise-for-failing loop |
| M12 | **When no one sees** | A small chance to take advantage (a shopkeeper gives too much change; a chest left open; an unobserved berry patch) with options to take, tell, or leave | Honesty, trust, how it feels afterwards (P7) | B-C (A: lost-and-found only) | Shop counter, Route 1 chest, wallet-like scenes | S per scene | No notification, no sound; later, the shopkeeper's line differs ("שמעת, תמיד נעים לסמוך עליך" / or just normal chat) | The game cannot see inside the child, so it **never records, scores or rewards** honesty; outcomes equal; a taken extra coin is just quietly handled by a repair scene if the child wants (M7) |
| M13 | **Stand-by-me (teasing and bystanders)** | A kid trainer teases a smaller kid or a creature; the child can stand next to them, say a line, get a grown-up, move on, or watch | Upstander options, bystander effect, what helps (P6) [7] | B-C (A: a creature "being mean" in a simple form) | Route 1, academy yard | M | The teased kid says what helped or did not ("הוא הפסיק, אבל אני עדיין...") and the teaser is a person too | Every option has a realistic, partly good, partly incomplete result; no instantly winning button; telling an adult is shown as strength, not snitching |
| M14 | **Good-thing stone (evening ritual)** | At home, at "goodnight", the partner asks for one small good thing from the day (pick a picture: a friend, food, a game, my family, a surprise) or just a pat | Gratitude (הכרת הטוב), savouring | A-C | Home bedroom, bed = natural stop for screen time (`FEATURES.md` 4.4) | S | A warm silent animation, no message about gratitude | Optional, not counted; no streak; nothing collected unless the parent opts into cards (section 4) |

Mechanics I considered and left out: a chat or voice conversation with an AI about feelings (privacy, risk of wrong advice for a child, and `docs/kids/SDD_AI.md` keeps AI for content, not personal talk); emotion-recognition by camera (invasive, error-prone); scoring "empathy points"; leaderboards between siblings (`FEATURES.md` open question 6).

### 3.2 The ten situations, three scenarios each (Hebrew, one line a scene)

Format: **A** (5-7), **B** (8-10), **C** (11-14). The first option listed is not "the right one"; all options are offered in a shuffled order, and the NPC reply shows what each does. Mechanic numbers refer to 3.1.

| Situation (mechanic) | A: 5-7 | B: 8-10 | C: 11-14 |
|---|---|---|---|
| **Friend left out** (M8) | ילד קטן יושב לבד על הספסל. "רוצים להצטרף?" אפשרויות: לשבת לידו / להזמין אותו לשחק / ללכת | שלושה ילדים משחקים עם הצבים שלהם, ויעל עומדת בצד. אפשרויות: להזמין אותה, לשאול את החבורה אם יש מקום, לחכות לראות | בקבוצה שמחליטה מי נכנס לקרב הצוות, מישהו לא נבחר. אפשרויות: להציע לצרף אותו, לדבר איתו אחר כך, לא להתערב כי לא נעים. התגובה: "לא צריך, באמת" ואפשר להמשיך לשאול |
| **A lost game** (M9, M11) | החתול שלך הפסיד במשחק הכדורים. "אוף!" אפשרויות: לנשום, לבקש עוד פעם, לספר לחבר | ההפסד בדו-קרב ידידותי: "הפעם הוא ניצח". אפשרויות: ללחוץ ידיים, לבקש חידון חוזר, לעזוב בשקט | הפסד אחרי הרבה תרגול. אפשרויות: "מה אפשר ללמוד מזה?", לקחת הפסקה, להתעצבן וללכת. המאמן לא מסכם; הוא שואל אם רוצים לנסות אחרת |
| **A sibling takes my thing** (M6, M3) | אחות קטנה לקחה את הכדור שלך. "היא לקחה! מה עושים?" אפשרויות: לצעוק / להגיד "זה שלי, בבקשה" / לקרוא לאמא | אח לקח את הפרי שלך בלי לשאול. כרטיסים: "כשאתה לוקח" + "אני מרגיש" + "אפשר לבקש שתשאל?". התגובה משתנה לפי הכרטיסים | הצעיר "השאיל" את ציוד הצוות שלך ושבר אותו. אפשרויות: לדבר אחרי שמתקררים, לשים גבול, להתעלם. תגובה אנושית, גם "סליחה, לא חשבתי" וגם "זה לא כזה נורא" |
| **Being teased** (M13) | ילד אחר צוחק על השם של היצור הקטן. אפשרויות: לעמוד לידו / "די!" / לקרוא לגדול | ילד מצחיק את הכיתה על חבר שהתבלבל. אפשרויות: לצחוק, לא לצחוק ולהגיד משהו אחר, לפנות אליו אחר כך | הקבוצה מעבירה בדיחה על מישהו שחסר. אפשרויות: לצחוק, לשתוק, "די, זה לא מצחיק", לשלוח לו הודעה, לספר למבוגר. התוצאה היא חלקית ואמיתית |
| **A mistake that hurts someone** (M7) | הזנב של היצור שבר דוכן פרחים. אפשרויות: לבקש סליחה / לעזור לסדר / לברוח לרגע | אמרת על חבר דבר שפגע בו. אפשרויות: לבקש סליחה, לשאול מה הוא מרגיש, לתת לו זמן. "עוד לא" מותר | אמרת סוד של חבר. אפשרויות: להודות, לתקן, לבקש מחילה בלי תירוץ. מי שנפגע עונה כמו אדם: "אני צריך זמן" |
| **Someone is sad** (M5, M1) | הילדה על הספסל בוכה. "מה עושים?" אפשרויות: לשבת לידה / לתת פרי / לשאול "מה קרה?" | הוא שותק ולא מסתכל. אפשרויות: לנחש, לשאול, להמתין לידו. התשובה: "אני פשוט עייף" או "לא בא לי לדבר" | חברה אומרת "הכול בסדר" אבל נראית אחרת. אפשרויות: ללחוץ, להציע בלי לדחוק, "אני פה אם תרצי". תגובה: "תודה, אולי אחר כך" |
| **Waiting my turn** (M9) | שניים רוצים את התותים. התור: "אני אחרי הילד". אפשרויות: לחכות / לשתף / לקחת | תור ארוך בחנות. אפשרויות: לחכות בשקט, להציע למי שחיפש רק דבר קטן לעבור, לעזוב ולחזור | שני חברים מתווכחים על התור בדו-קרב. אפשרויות: להציע הגרלה, לתת לאחד, לצאת מזה. כל אחת משנה את מצב הרוח |
| **Honesty when no one sees** (M12) | נשאר ארנק על המדרכה, ואף אחד לא רואה. אפשרויות: להחזיר / לקחת / לשאול את ינשוף | המוכר נתן עודף גדול מדי. אפשרויות: להחזיר, לשתוק, לקחת ולספר אחר כך. הוא פשוט מודה ושואל "יש עוד משהו?" | תיבה פתוחה בדרך עם מטבעות. אפשרויות: לקחת, להשאיר לבעלים (יש שם פתק), להניח ולמסור. אין צלצול, אין הודעה |
| **A creature that is scared** (M2, M1) | היצור מתכרבל. "נושמים ביחד?" שלוש נשימות | היצור רועד בקרב. אפשרויות: לספור ל-5 איתו, לשאול איך הוא מרגיש, להתרחק קצת | יצור פראי חרד אחרי הרבה שאלות. אפשרויות: מרחב שקט, מעט מילים, ללכת בלי לתפוס. הכול נחשב, גם ללכת |
| **Losing a battle** (M11, M2) | הצעד האחרון לא הצליח. היצור מתכווץ. "עוד פעם?" אפשרויות: לנשום / לנסות שוב / ללכת | "לא תפסנו הפעם". אפשרויות: לנסות רמז, לחזור אחר כך, לספר ליצור שזה בסדר. בלי "הפסדת" | שלושה ניסיונות לתפיסה ללא הצלחה. אפשרויות: "עוד לא" ולנסות אחרת, לקחת הפסקה, להשוות מה השתנה. אין טקסט מחזק |

Authoring rule for all of them: write the **NPC's reply** for each option first; if one reply would make the child feel stupid, rewrite it. Heavy variants (loss, illness, family conflict, war) are not in this catalogue and are off by default (section 6).

---

## 4. How to measure lightly, without recording feelings

### 4.1 What we do not measure
Moods, feelings picks, check-ins, breath step use, free text, voice, time on scenes, "right" choices, any empathy score, any label or profile. The learning engine's Elo/SRS never sees SEL.

### 4.2 What we can keep (opt-in, local, neutral): the **story-choices summary**
- **Off by default.** The parent turns it on per child in the parents' area (PIN). When on, the child sees a one-line, non-scary notice once ("הורים יכולים לראות מה בחרת בסיפורים. זה בשביל לדבר ביחד"). Open question 4.
- **What is stored:** one small local record per dilemma scene: `{day, sceneId, optionId}` (no text, no free input, no feelings, no scoring). Kept at most 30 days or the last 20 scenes, with a "delete" button. It never joins the field log, the crash report or the GitHub upload (an explicit exclusion in the upload code, with a test).
- **What the parent sees (parents' area, one card per recent scene, max 3 a week):** neutral and descriptive, with **no counts, no good/bad, no comparison between children or to a norm**:
  - "בסיפור, יעל נשארה לבד על הספסל. ילדכם בחר: **להזמין אותה לשחק**. אפשר לשאול: מה חשבת באותו רגע? מה היית עושה אצלנו בכיתה?"
  - "ילדכם בחר: **לשאול אדם בוגר** מה לעשות עם הארנק. אפשר לשאול: מה הרגיש לך נכון בזה?"
- **What the card must not do:** no "your child chose the kind option", no trend lines, no alerts like "your child may be sad". If a parent worries about the child, the card includes a standing line: "אם משהו מדאיג אתכם בילד, כדאי לדבר איתו או עם איש מקצוע" with the resources in section 6.
- **Value check:** the point of the card is the **conversation** (P8, [11][12]). If parents do not use it, the feature costs nothing.
- **A lighter second tier:** a monthly "family conversation card" (a fixed question list by theme, not tied to anything the child chose). Needs no data at all and is the recommended default for anyone who does not want logging.

### 4.3 How we know it works, as a product, without watching children
- Playtests with the parent and the child, watching what they do, asking "what did the NPC feel?".
- Anonymous counts that the game already keeps for balance (how many scenes finished; never which option) only if the parent shares the field log, as today.
- A tone review by a school counsellor or psychologist for each new scene set (section 6).

---

## 5. Roadmap: thin, playable slices

Estimates in S/M/L as in `FEATURES.md`. Each slice is playable, has an SDD paragraph first, TDD tests first, a feature branch, a separate code-review agent and a green CI before merge (per `CLAUDE.md` and the playbooks). Update the storybook (`ARCH`, `SUBJECTS`/`FLOWS`, `OPEN`, `PLAN`, `VERSION`) with each merge. Files are "likely" because the engine and UI are changing on `app/quiz` and `app/engine`; verify the paths against `nagmon-app` when the slice starts.

### Slice 1 (M overall): the game visibly teaches one skill, three ways
Goal: in one 5-minute play, a child (a) checks in with the partner's feelings, (b) faces a dilemma with an NPC and sees the NPC respond, (c) breathes with a calm creature before the net. Records nothing new. Depends on the dialog/quiz work (`app/quiz`) and the battle (`app/engine`).

| Step | What | Cost | Files likely touched | Tests (written first) |
|---|---|---|---|---|
| 1a | **Choice action in the interpreter**: `translated_dialog_choice` in `ACTIONS`; `EventHost.choose(options, speaker)`; the chosen msgid goes into the named variable (as the YAML expects); `Dialog.tsx` shows 2-3 big buttons (plus an always-visible "not now"); `talkTo` lets the new NPCs talk | S-M | `app/src/core/world/events.ts`, `mapData.ts`, `dialog.ts`, `app/src/ui/Dialog.tsx`, the host in the world screen, `app/src/core/data/types.ts` | choice is stored in the named variable; closing without a choice writes nothing and rerunning is fine; the later event reads `is variable_set` and branches; the choice is saved before the next dialog (like `changed()`); every option msgid exists in he and en |
| 1b | **Partner check-in (M1)**: on the Friends card and when talking to the partner, 4 faces for A (happy, sad, mad, scared), 8 for B-C, creature animation reply; no storage; once a day gets a gentle "how is X today?" prompt, never forced | S | new `app/src/core/sel/feelings.ts` (face sets by band, reply lines), `app/src/ui/FriendsView.tsx`, `app/src/ui/sel/CheckIn.tsx` (new) | face set by band; no write to the profile/log (spy on storage); skip path; RTL layout; touch target size |
| 1c | **Two dilemma NPCs in Hearthrock (M3, M4)**: (i) **the wallet reworked**: three options (return it; ask the owl/a grown-up; keep it), equal materials, no sermon line, Granny's reaction plus a next-day remark, the "second chance" stays; (ii) **the lonely kid on the bench (M8)** with an invite that is sometimes "אולי אחר כך" | S per scene (S-M total) | `mods/nagmon/maps/classic_hearthrock_city.yaml` (and the app's copy of the events), `mods/nagmon/l18n/he_IL` and `en_US` `.po` files, NPC memory variables | **property test on the map data**: all options of a dilemma give identical coins/items (anti-gaming); no event writes a negative reward; no `modify_money` on the keep path; every option leads somewhere (no dead end); lines under a length limit; no line contains a lesson phrase from a short banned list (e.g. "זה יושר", "מה שחשוב הוא") |
| 1d | **Breathe with it (M2)**: an optional **נושמים ביחד** button at the calm moment, three breaths with an expanding ring (2 s in, 2 s out for A, 4/4 for C), the creature mirrors it, then Net pulses; reduced motion = static 1-2-3; no score | S | `app/src/ui/BattleScreen.tsx`, `app/src/ui/battle/ActionBar.tsx` (or the calm view), `app/src/ui/battle/Breath.tsx` (new), `styles.css` (a CSS keyframe, nothing flashes) | Net works without breathing (never gated); the step makes no change to fog, coins, growth, Elo; reduced motion shows no animation; no timer failure; button is a real button, 51 px target; one breath sequence at most per battle |

Why this is the smallest thing that teaches: three different skills (naming, deciding with consequences, regulating) in the loop the child already plays, with zero new data collected.

### Later slices
| # | Slice | Cost | Files likely | Tests |
|---|---|---|---|---|
| 2 | **Read the face, then ask (M5)** and the growing vocabulary (A 4 words, B 8, C shaded): 6 wanderer/lost-kid scenes | S-M | `core/sel/*`, NPC scenes, `.po` | several valid truths per scene; no "wrong" state; vocabulary set by band |
| 3 | **My calm toolbox + teach the creature (M10)** and the "not yet" reframe (M11): choose 2-3 tools in the Me card; the calm step uses them; the rival asks | M | Me card, `ui/battle/*`, `FEATURES.md` 5.2 rival | tools persist per profile (the toolbox is a **setting**, not a feeling record); the rival's reaction exists for every tool; the reframe line fires after 2 wrong in a row and never changes rating |
| 4 | **Conflict and repair (M6, M7, M3)**: sibling takes my thing, apology and "not yet", sorry-and-fix; word cards | M | scenes, a small card UI | every card combo reaches a continuing scene; the harsh-card reply is not a game over |
| 5 | **Bystander and include (M13, M8, M9)** with NPC memory hearts | M | scenes, NPC memory per `FEATURES.md` 5.1 | equal outcomes; "tell an adult" is never framed as telling-on |
| 6 | **Parent side**: opt-in story-choices summary, conversation cards, "talk to someone" resource page, settings (heavier topics, vocabulary) | M | `parents/` pages, `core/family/*`, profile storage | opt-in default off; delete works; the record holds no free text; **the upload and log code never include the SEL record** (test); the card text never contains a label or score |
| 7 | **Evening good-thing stone (M14)**, **when no one sees (M12)** and the optional **character-trait vocabulary** (parent layer only) | S-M | home interior, shop counter | M12 never records the choice unless the parent opted in; no streak anywhere |
| 8 | **Review and tuning**: counsellor/psychologist review of all scenes, age-band playtests, tone pass in Hebrew by a native speaker | S | content only | checklist in section 6 passes |

Rough size: slice 1 about 1-1.5 weeks of one agent; slices 2-5 about 1 week each; slice 6 about 1 week. If time is short, keep slices 1, 3 and 6.

---

## 6. Safety and ethics

### 6.1 Principles
1. **It never diagnoses, labels or infers.** No "you seem sad/angry". No profile of the child. The check-in is about the creature; the child's own pick is private and not saved.
2. **It never records feelings or personal disclosures.** No free text, voice, camera or photo for SEL, ever. No uploads of any SEL record. If a parent later wants a field log of SEL scenes, it is a separate, explicit consent and still holds only scene ids.
3. **Parent controls** (parents' area, PIN): SEL on/off; the story-choices summary on/off (default off); band override; "heavier topics" list off by default; vocabulary (plain Hebrew vs character-trait names); the traditional-framing layer; delete all SEL records.
4. **No shame.** No red, no buzzer, no "wrong"; no one is cruel without a person-sized reason; the teased or excluded character is never mocked for being sad.
5. **A way to talk to a real adult, always.** A small "לדבר עם מבוגר" button (Backpack > Me and the dilemma screens) shows a soft card: "מי אפשר לספר לו? אמא, אבא, מישהו שאתה סומך עליו" with parent-set first names (local only, optional) and nothing to type. In the parents' area: a page of resources (see 6.3). It is a bridge to adults, not a clinical service, and the game says nothing like "get help if you are sad" to a child unprompted.
6. **Trauma-sensitive by default.** Choice and control (everything skippable, "not now" everywhere), predictability (the same button positions, no jump scares), no timers, no loud sound or flashing, no re-enacting of violence, abuse, loss, serious illness or war as scene topics unless the parent opts into a named list. Avoid the "forced emotion" pattern (no "tell me how you feel" gating progress). Evidence on content warnings and avoidance is mixed (soft sources); the safest design is choice, not warnings [24].
7. **No AI chat about feelings with the child.** AI stays for content authoring and the existing question tools; no model reads what a child picks.
8. **Scope honesty.** The game teaches practice of skills and opens conversations. It does not treat anxiety, bullying, grief or any condition. Say that in the parents' area.
9. **Modesty and tone.** All characters follow `SDD_MODESTY.md`; no romance, crush or body topics; no ridicule of religious or ethnic groups; stories feature ordinary Israeli kid life (park, school bus, shop, Shabbat-aware calendar, berries and creatures).
10. **Over-pathologising check.** Anger, jealousy, shyness and sadness are shown as normal parts of a day; the tools are "things that help some people", not fixes for a defect.

### 6.2 Pre-release checklist per scene set
- Every option gets an NPC reply written first; none makes the child feel stupid.
- All options have equal material outcomes (test).
- No lesson sentence; no word of praise for the "kind" option.
- A heavy-topic check against the parent's list.
- Reading level matches the band; Hebrew gender forms handled.
- A counsellor or psychologist (school counsellor, "יועצת בית ספר") has read the set once before it ships beyond the family.
- Nothing stored beyond what 4.2 says.

### 6.3 Resources the parent can open (verify before publishing; numbers change)
Found in search, soft until checked against each organisation's own site:
- **ער"ן (ERAN)**: 24/7 anonymous emotional first aid for all ages, phone **1201**, chat on the site, WhatsApp line (the number returned: 052-8451201, 8:00-midnight) [25].
- **מוקד 118** (Ministry of Welfare, 24/7 social-worker emergency line; text 050-2270118) [25].
- **נט"ל** (trauma line): **1-800-363-363**, or 3362* (the sources disagree; confirm) [25].
- **מוקד 105** (national centre for protecting children online, for children, teens and parents) [26].
- The school's counsellor (יועצת) and the family doctor/community clinic for ongoing concerns.
The parents' page shows these as links the **parent** opens, never auto-dialled, never shown to a child, with the line "not a substitute for professional help".

---

## 7. Open questions for the parent (8, each with my recommended default)

1. **How religious or traditional should the framing be?** Options: none, gentle (Shabbat and chaverim in the setting), or explicit (sources and mitzvah names). *Recommended:* gentle in the story world (ordinary Israeli-traditional life, no preaching), and an **optional parent layer** with the traditional name and a one-line source on each parent card.
2. **Use the character-trait vocabulary (מידות) in the child's UI?** *Recommended:* not as a label in the game; the child meets the plain words (סבלנות, נדיבות, יושר, תודה) only through what characters do. The parent card may say "מידת הסבלנות" if the parent turns the layer on.
3. **Parent conversation cards on or off?** *Recommended:* the monthly generic conversation card **on** (no data needed); the **story-choices summary off** until the parent opts in per child.
4. **Does the child know the parent can see story choices, and may an 11-14 child decline?** *Recommended:* yes, always told in one line; for 11-14 the child can switch the sharing off (the parent can see that it is off, not what was chosen). No feeling check-ins are ever visible to anyone.
5. **Feelings check-in: creature only, or also "and me?"** *Recommended:* creature first; "ואני?" is an optional second tap, private, never stored, and absent for band A until the child asks to try it.
6. **Which sensitive situations are in or out?** *Recommended:* in: exclusion, teasing, a lost game, sibling conflict, small dishonesty, shyness. Out by default: loss and death, family conflict, illness, abuse, war and security anxiety, bodies and romance. The parent can add a named topic later; nothing is added without them.
7. **The "talk to a grown-up" button:** generic ("אמא/אבא/מישהו שסומכים עליו") or names you enter? *Recommended:* generic, with optional local first names; resource page in the parents' area only.
8. **Who reviews the content?** *Recommended:* you read every scene set; for slice 3 onwards a school counsellor or child psychologist reads once before it is used outside the family; a native Hebrew pass for tone and gender forms on all lines.

---

## 8. Sources

Numbered as cited. "Soft" = blog, press, vendor, forum or snippet I could not open.

1. Durlak, Weissberg, Dymnicki, Taylor, Schellinger (2011), *The impact of enhancing students' social and emotional learning*, Child Development: abstract on PubMed https://pubmed.ncbi.nlm.nih.gov/21291449/ ; CASEL PDF https://casel.org/wp-content/uploads/2016/01/meta-analysis-child-development-1.pdf ; summary https://www.ascd.org/el/articles/sel-what-the-research-says . (213 programmes, 270,034 pupils, +11 percentile points: from search snippets of the abstract; effect-size figures by outcome are from my recollection of the paper, not re-opened here.)
2. Taylor, Oberle, Durlak, Weissberg (2017), Child Development follow-up meta-analysis: https://casel.org/2017-meta-analysis-summary/?view=true ; https://edsource.org/2017/social-and-emotional-learning-appears-to-provide-benefits-that-last/584784?amp=1 (soft, press).
3. CASEL framework and the 2020 definition update: https://www.the74million.org/article/niemi-casel-is-updating-the-most-widely-recognized-definition-of-social-emotional-learning-heres-why/ (soft, press); https://www.cde.ca.gov/Ci/se/tselcompetencies.asp
4. Rivers, Brackett, Reyes, Elbertson, Salovey (2013), RULER cluster trial, Prevention Science 14: https://link.springer.com/content/pdf/10.1007/s11121-012-0305-2.pdf ; https://medicine.yale.edu/myysm/news-article/research-in-the-news-learning-emotional-intelligence-is-a-classroom-boon-researchers-find/ (soft, institution news).
5. Zones of Regulation evidence: https://asatonline.org/research-treatment/research-synopses/review-of-the-zones-of-regulation-program/ (independent review synopsis, soft); https://ojs.unisa.edu.au/index.php/tahs/article/view/1595 ; developer brief https://zonesofregulation.com/wp-content/uploads/2024/09/Evidence-of-Effectiveness-Brief.pdf (vendor, soft).
6. PATHS, What Works Clearinghouse intervention report (2021): https://ies.ed.gov/ncee/WWC/Docs/InterventionReports/wwc_SLE_PATHS_IR_mar2021.pdf ; preschool review https://read.qxmd.com/read/30569827/is-the-preschool-paths-curriculum-effective-a-review . (Second Step: no source retrieved; treat as unverified.)
7. KiVa UK Stand Together trial and bystander roles: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11851402/ ; https://www.frontiersin.org/articles/10.3389/fpsyg.2024.1116860/full
8. Digital interventions for emotion regulation in ages 8-14, systematic review and meta-analysis: https://kris.kl.ac.at/en/publications/digital-interventions-for-emotion-regulation-in-children-and-earl/ (abstract; g = -0.19 for games on negative emotional experience); early childhood game-based learning review https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11018941/
9. Zoo U: Craig, Brown, Upright, DeRosier (2016) pilot RCT https://mijn.bsl.nl/enhancing-children-s-social-emotional-functioning-through-virtua/798292 ; IES grant for the cluster trial https://ies.ed.gov/use-work/awards/testing-efficacy-zoo-u-improving-childrens-social-and-emotional-outcomes
10. Zoo U as stealth assessment (DeRosier and colleagues): https://doaj.org/article/10f4f819fd9c458ebf226f279becb085
11. Daniel Tiger studies (app and strategies, 2018): https://red.library.usd.edu/se-fp/19 ; Texas Tech (co-viewing and empathy) https://scholars.ttu.edu/en/publications/relation-between-active-mediation-exposure-to-daniel-tigers-neigh-12
12. UCLA teen follow-up (producer-commissioned): https://www.allyourscreens.com/latest-news/u-s/3749-new-ucla-study-reveals-the-lasting-impact-of-pbs-kids-series-daniel-tigers-neighborhood (soft).
13. Sisk et al. (2018), Psychological Science, growth-mindset meta-analyses: https://hhs.purdue.edu/skill-learning-and-performance-lab/wp-content/uploads/sites/43/2024/08/sisk-et-al-2018-to-what-extent-and-under-which-circumstances-are-growth-mind-sets-important-to-academic-achievement-two.pdf ; Yeager et al. (2019), Nature: https://www.hks.harvard.edu/publications/national-experiment-reveals-where-growth-mindset-improves-achievement
14. School mindfulness (Dunning et al. 2019 and later): https://eprints.whiterose.ac.uk/id/eprint/144191/ ; https://acamh.org/?p=10644 (figures inconsistent between summaries; breathing alone not found).
15. Children's emotion concepts (Widen and Russell; valence first, categories settle around 5-6): https://how-emotions-are-made.com/notes/Russell-2 (soft); https://pmc.ncbi.nlm.nih.gov/articles/PMC9203044/ . Ekman and Plutchik basic-emotion models and their developmental trajectory: not searched in depth; the game does not rely on a fixed basic-emotion list (4 to 8 words by band).
16. Theory of mind in school-age children: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11922878/ ; faux pas at 6-8 https://xbna.pku.edu.cn/EN/Y2008/V44/I4/639 (soft). The standard reference for the age 4-5 false-belief milestone is Wellman, Cross and Watson (2001), not opened here.
17. Moral choices in games: https://gamescriticism.org/2023/07/14/youre-just-gonna-be-nice-how-players-engage-with-moral-choice-systems/ ; https://www.popmatters.com/183687-values-and-the-meaning-of-moral-behavior-in-video-games-2495639384.html (both soft: design writing, citing Consalvo and a 1,000-gamer survey).
18. Ministry of Education, "מעגל הקסם": https://meyda.education.gov.il/files/Shefi/pdf/maagal_hakesem.pdf ; kindergarten page https://pop.education.gov.il/kindergarten/magar-ganey-yeladim/circles-kindergarten-yaar
19. Ministry of Education, social-dilemma "Storybook" kit and dilemma-based dialogue: https://meyda.education.gov.il/files/yesodi/shaagat_haari/documents/storybook_hevrati.pdf ; https://meyda.education.gov.il/files/Pop/0files/shviley-moreshet/Junior-High/dilemma-based-dialogic-learning.pdf
20. Ministry of Education, "מקום לכולם" and "מאלימות למנהיגות": https://pop.education.gov.il/place-for-everyone/ ; https://pop.education.gov.il/place-for-everyone/elementary/
21. Mussar for children and the middot: https://www.mussarinstitute.org/?p=645 ; https://mussarinstitute.org/what-are-mussar-middot/ (Mussar Institute, an adult-education organisation: soft for child outcomes).
22. Empathy and prosocial development (sympathy rises in late childhood and adolescence; personal distress falls): Eisenberg and colleagues, summaries at https://pmc.ncbi.nlm.nih.gov/articles/PMC2893741 and https://www.mindandlife.org/?p=15787 (abstract-level only).
23. Apology: Smith and colleagues, forced apologies judged ineffective especially by 7-9-year-olds; press coverage https://www.futurity.org/forced-apologies-children-1920802-2/ (soft; primary paper not opened).
24. Content choice in games and trauma-aware design: https://www.takethis.org/2023/12/community-spotlight-game-content-triggers-database (soft); no authoritative children's-games guideline found, so the rules in 6.1 are my judgement from the above and from standard trauma-informed principles (safety, choice, predictability).
25. Israeli support lines: https://www.kolzchut.org.il/he/ער%22ן_-_עזרה_ראשונה_נפשית_בטלפון ; https://www.maariv.co.il/news/israel/article-1290261 ; https://timeout.co.il/%D7%A2%D7%96%D7%A8%D7%94-%D7%A0%D7%A4%D7%A9%D7%99%D7%AA-%D7%91%D7%9E%D7%9C%D7%97%D7%9E%D7%94/ (press, soft: verify every number on the organisation's own site).
26. Hotline 105: https://www.btl.gov.il/Funds/kolotkorim/kolotKorimList/KKMoked105.pdf (government document, 2022).

Not covered by research in this session (marked as gaps): Second Step evidence, Inside-Out-style emotion wheel studies, Quest Atlantis, Mind Yeti/Headspace for Kids/Smiling Mind evidence, Pokemon-Amie and Animal Crossing effects on children (only Common Sense review and fan descriptions; no research), Kind Words, Temtem, Florence/Gris, Life is Strange, Undertale beyond design commentary, ages 11-14 evidence for digital SEL, Israeli "אקלים חינוכי" primary document, Ekman/Plutchik trajectory. These shape the design only as inspiration (Undertale's mercy and per-enemy "act" options, Pokemon-Amie's hearts and gifts), never as evidence.
