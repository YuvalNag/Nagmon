# Question quality audit

Trigger: a parent played and said the questions are "not good, not varied, not necessarily right for their level".
Branch `app/question-quality`. All numbers come from a headless child (`app/tests/unit/learning/qsim.ts`):
fixed seeds, the real selector, `QuizSession` and `Placement`, answering right with the chance of a child whose real
level is 1.25 grades above the grade the parent chose (about 3 in 4 on the grade's own questions). Re-run with
`AUDIT_DUMP=1 AUDIT_DIR=/some/dir npx vitest run tests/unit/learning/audit_dump.test.ts` (writes JSON). The measured
properties are held by `app/tests/unit/learning/question_quality.test.ts`.

Setup: grades 0..8 (kindergarten to grade 8, `grade` as in the code), 300 battle questions per child per subject and
300 mixed (5 questions per subject in turn, like a battle each), with and without the owl's placement first.
"Shape" is the prompt with numbers taken out ("5 + 3" and "7 + 2" are one shape).

## 1. Before and after (average over grades 0..8)

| Measure | Before | After |
|---|---|---|
| Mixed session: share of questions whose shape was in the last 20 | 0.20 | 0.10 |
| Single subject: same, shape in the last 20 | 0.64 | 0.46 |
| Single subject: same item in the last 20 | 0.22 | 0.00 |
| Distinct skills per 20 questions, mixed | 11.3 | 14.9 |
| Distinct skills per 20 questions, one subject | 6.2 | 8.2 |
| Longest run of one skill, mixed (a whole battle) | 5 | 2 (5 only in the first questions of grade 0 and 1, see 4) |
| Longest run of one skill, one subject (math, science) | 300 for a grade-0 child (one open skill), 5+ elsewhere | 2 to 3 |
| Share of questions in a run of 3 or more of one skill | 0.28 | 0.00 |
| Questions two or more grades off the child's level (where the subject has content nearer) | 0.12 | 0.04 |
| Highest grade above the level | +4 | +1 |
| Typed answers (number pad), grade 2+ | 6% | 15% |
| Kinds, grade 2+: choice / true-false / number / order | 79 / 11 / 6 / 3 % | 65 / 17 / 15 / 3 % |
| Numeric choices: right answer strictly between the smallest and the largest (chance 0.5) | 0.82 | 0.49 |
| Placement within one grade of the child's real level | 74% | 79% |
| Placement two or more grades too high | 20% | 14% |
| Placement mean error (placed minus real) | +0.47 | +0.15 |
| English grammar true-or-false that are "true" | 0 of 17 | 22 of 38 |
| Science choice items where the answer is 2.5 times longer than the rest (12+ characters) | 42 | 3 (single gas names) |

Per subject (one subject, 300 questions): the same-skill runs and repeated items fell to zero in math, science, geometry,
English; the share of same-shape questions in the last 20 is still high where the content is templated: math 0.62,
geometry 0.62, logic 0.61 (see 5).

## 2. What was wrong (153 questions read by hand, then the measures)

| Problem | Seen | Example | Fix |
|---|---|---|---|
| One skill again and again, the whole battle | 28% of questions in a run of 3+; a run of 300 (grade 0, one open skill) | five `math.count.objects_5` in a row; `science.living.basic` (14 items) was the only open skill in grade 1 | variety guard in the selector (3 in a row never; fresher skills weigh more); neighbours of the level join when the frontier is thin; a prerequisite is met after 3 answers with 60% right, not only on mastery |
| Same item twice close | 22% of single-subject questions had the item in the last 20 | "מה תפקיד תאי הדם הלבנים?" twice in 8 | item window 8 to 30; wording and kind of the last questions cost points in `bestItem` |
| Level jumps | stretch up to +4; the fallback went down to -8 | kindergarten child: English `grammar.articles` (grade 3); grade-3 child: `math.negative.compare` (grade 7) | stretch at most one grade up; the fallback takes the skills nearest the level; review stays within two grades below |
| Grade-2 skill for a grade-9 child | field log, build 104 | the cashier asks `math.money.change_20` of everyone (map script) | on the map (`shop`) a skill named by a script is replaced by the family's skill nearest the child's level; lessons and placement keep theirs |
| Reading questions with no text | all 120 `english.reading.*` | "מה עומר הבין בסוף?" with no passage on screen: the passage is in `meta.passage_*` and no screen drew it | `Passage` shown in the question screen and the battle panel (English, Hebrew behind a tap) |
| Answer in the middle | 82% of numeric 4-choice questions | options `[5, 6, 7, 20]` for x = 6 | the answer takes a random place among the options |
| Impossible options | polygon sides `0, 1, 2, 3`; sudoku `5`; "0 apples"; ratio `0, 1, 2, 3` | | `min_value` / `max_value` in the numeric builder |
| Tells in the banks | science: the right option is the longest in 56% (chance 33%); English grammar true-or-false were 100% "false"; Hebrew gender options gave the answer away ("עיר גדול" / "עיר גדולה") and listed "רבים" | | 39 science items rewritten (the test allows only one-term answers), 63 English grammar items added (21 true, 42 choice), gender items now "זכר / נקבה", two doubtful plurals changed |
| Few forms | `geometry.shapes.identify` had 4 items | "איזו צורה זו?" only | "what shape is a pizza slice" form, 12 things |
| Order questions lost on the map | field log: `heb.words.059` "cannot be answered here yet" | the question screen drew no tiles, and the map asked once | the session asks again (12 tries) for a kind the screen cannot take |
| Placement | one question per subject, coin-toss forms, +2 above | kindergarten child placed in English grade 2 after one lucky guess | no true-or-false when the skill has another form; at most +1 above and -2 below the parent's grade |

## 3. Placement (6 owl questions)

Each of the six subjects gets one question; a right answer moves the next one up a grade, a wrong one down; a subject
starts at the level of its question (right) or one below (wrong). Monte Carlo, 40 children for each parent grade and real
level -2..+2 (Hebrew left out: its content ends at grade 2):

| | Before | After |
|---|---|---|
| exact | 34% | 34% |
| within one grade | 74% | 79% |
| two or more too high / too low | 20% / 6% | 14% / 7% |
| mean absolute error | 0.98 | 0.89 |

One answer per subject cannot tell neighbouring grades apart (a 3-choice question is right by luck one time in three).
Placement is a rough start; the Elo and the step-back after wrong answers do the rest. More precision needs more
questions (two per subject: twelve), a decision for the parent.

First ten questions after placement (child of grade 3, before): five of `math.sub.within_100_no_borrow`, then four of
`english.phonics.sight_words_primer`. After: eight to ten different skills; none above level +1. In grade 0 only one
math skill and one science skill are open at first (the prerequisite chains start with one skill), so the first four
questions are one skill.

## 4. Subject spread

- Battle: the subject follows the creature. Of 70 creatures, 59 are science (water, wood, venom, sky, frost, cosmic all
  map to science), 3 math, 3 geometry, 3 Hebrew, 2 English, 0 logic. Weighted by the encounter tables: science 71%,
  geometry 11%, English 8%, math 7%, Hebrew 3%, logic 0%. `solar_outer` and `solar_rocky_planets` are 100% science.
  Not changed: the link between a creature and its subject is a design choice (BATTLE.md: swap the partner to change the
  subject). Options for the parent: map some elements to other subjects in `subjects.yaml` (data only), or one question
  in three from another subject.
- Lessons and the solar chapter ask the skill named in their script, so their spread is what the scripts name.
- Hebrew content ends at grade 2: a child of grade 6 or 8 asked Hebrew gets grade-2 questions (73% below level).
  English reading, Hebrew reading and every `order` question (3% of questions) exist only in the battle's input; the map,
  the shop, the lessons and the placement cannot take `order` or `letters` and now ask again.
- Field evidence (build 104, one child at grade 9, 31 answers): `math.money.change_20` x5 (the cashier, fixed);
  13 of 31 answers math, `math.function.slope` x6 (grade 9 has four math skills; the neighbours of the level now join);
  `hebrew.words.plural` x4 (Hebrew ends at grade 2); `No text for flaskling` x4 (a creature saved by an older build,
  `flaskling` is no longer one of the 70, its name text is gone: the save should drop or replace it, not fixed here).

## 5. Left

- Hebrew: grades 3 to 9 now have content (section 6). Left there: a native review of the wording, more items at grades 8 and 9 (one grade-9 child still meets repeats: 8 skills, about 190 items), and a worked example that shows the passage of its sibling.
- Science tells: the right option is still the longest in 53% of the science items; 39 of the worst were fixed.
- Templated math and geometry: the wording is the same for every item of a skill ("כמה זה a + b?"). Story forms for
  add and subtract, and more forms for `geometry.shapes.more`, `quad.classify`, `symmetry.lines`, would help.
- Elements-to-subjects spread in the battle, and the question of whether the grade 0 and 1 chains should open two
  skills at the start.
- The storybook (private data repo) needs its `ARCH` / `PLAN` rows and a new `VERSION` for this change.

## 6. Hebrew grades 3 to 9

Trigger: the Hebrew content ended at grade 2 (160 items, 11 skills), so a child of grade 4 to 9 got grade-2 Hebrew in every
battle. Branch `app/hebrew-3-9`. 32 new bank skills, 814 original items (665 choice, 135 true-or-false, 14 order), 198 of
them questions about 35 original reading passages. Every skill has 20 to 40 items, grade tags, and a prerequisite chain
that starts at the grade 0 to 2 skills. No niqqud (the game rule), no copied text, no religious claims.

| Grade | New skills | Items |
|---|---|---|
| 3 | parts of speech, agreement, synonyms, similar-sounding letters, sentence types, reading passage | 161 (all of grade 3) |
| 4 | tenses, person, punctuation, subject and predicate, homonyms, reading passage | 146 |
| 5 | roots, prefix letters and endings, proverbs and idioms, text types, reading passage | 137 |
| 6 | binyanim, figurative language, reading passage | 82 |
| 7 | construct state (smichut), text analysis, complex sentences, reading passage | 101 |
| 8 | registers, word formation, summary and paraphrase, reading passage | 98 |
| 9 | argument text, reading poems, tone and implied meaning, reading passage | 99 |

Files: `hebrew/{grammar,vocab,spelling,text}.yaml` (items carry their skill and tag) and `hebrew/passages_3..9.yaml` (lists of
passages, `text_he` only; a poem is a literal block so its lines stay). The question screen shows the passage in Hebrew
(`white-space: pre-line` keeps a poem's lines).

Measured with the same headless child (`hebrew_audit.test.ts`, 200 Hebrew battle questions per grade, no placement):

| Child's grade | Mean grades below level, before / after | Share two or more grades below | Distinct skills in 200 questions |
|---|---|---|---|
| 3 | 1.73 / 0.28 | 0.53 / 0.09 | 11 / 16 |
| 4 | 2.65 / 0.36 | 1.00 / 0.00 | 11 / 16 |
| 5 | 3.74 / 0.01 | 1.00 / 0.00 | 11 / 11 |
| 6 | 4.74 / 0.50 | 1.00 / 0.10 | 11 / 14 |
| 7 | 5.74 / 0.68 | 1.00 / 0.23 | 11 / 14 |
| 8 | 6.75 / 0.13 | 1.00 / 0.07 | 11 / 10 |
| 9 | 7.75 / 0.23 | 1.00 / 0.00 | 11 / 8 |

The old bank against the new one (strict: the right option is longer than every other / shorter than every other):

| Measure | Old Hebrew (160) | New Hebrew (814) |
|---|---|---|
| Right option strictly the longest | 0.17 | 0.22 |
| Right option strictly the shortest | 0.20 | 0.27 |
| Place of the right option in the file (1st / 2nd / 3rd) | 0.34 / 0.34 / 0.30 | 0.33 / 0.33 / 0.34 |
| True-or-false that are "true" | 0.57 | 0.51 |
| Mean explanation length (characters) | 49 | 60 |

Held by `content_hebrew_upper.test.ts` and `tests/nagmon/test_content_hebrew_upper.py` (ids, grade, prerequisites,
20 to 40 items, no duplicate item, distinct options, no bias in length or place, true-or-false balance, explanations that
are not the question, passage length growing by grade, a worked-example sibling for every skill) and by two cases in
`question_quality.test.ts` (a grade 3 to 9 child is asked Hebrew of their own grade). The placement test that said
"Hebrew has content to grade 2" now says a grade-6 child who answers right starts Hebrew at their own level.
