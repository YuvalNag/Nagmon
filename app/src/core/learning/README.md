# Learning core (`app/src/core/learning`)

The adaptive learning engine of the old app (`nagmon/learning/`, Python),
ported to pure TypeScript: no React, no Phaser, no DOM (a test checks the
imports). Rules and numbers are the Python ones; see `docs/app/INVENTORY.md` §2.

## Tests: Python file → TS file

Counts are collected test cases (pytest `--collect-only`, Vitest cases), so
parametrised cases count one by one.

| Python test file (`tests/nagmon/`) | Python cases | TS file (`app/tests/unit/learning/`) | TS cases | Notes |
|---|---|---|---|---|
| `test_learning_model.py` | 33 | `model.test.ts` | 33 | same cases |
| `test_learning_rating.py` | 9 | `rating.test.ts` | 9 | convergence uses `PyRandom`, the same draws as Python |
| `test_learning_srs.py` | 7 | `srs.test.ts` | 7 | |
| `test_learning_selector.py` | 13 | `selector.test.ts` | 13 | 70/20/10 ±5%, focus ≥55%, no repeats, targets, boss balance |
| `test_learning_engine.py` | 14 | `engine.test.ts` | 15 | +1: `save()` / `restore()` round trip. E10 (< 5 ms per question) takes the best of 3 rounds after a warm-up, so parallel test files do not make it flaky |
| `test_learning_learner.py` | 6 | `learner.test.ts` | 6 | fixture `fixtures/learner_v0.json` copied |
| `test_learning_content.py` | 17 | `content.test.ts` | 19 | +2: the pipeline's `.json` names load the same; strict loading |
| `test_learning_generators.py` | 118 | `generators.test.ts` | 202 | G1/G2 split into one case per generator (77), × 200 seeds × 4 contexts, `meta.calc` re-evaluated (> 10,000). +6 range checks for add, sub, mul, div, money change, count. Every distractor is checked to be wrong and every prompt to have Hebrew |
| `test_learning_integration.py` | 31 | `integration.test.ts` | 31 | AI-studio banks are passed as parsed files; an unreadable file is passed as an `Error` |
| `test_learning_dashboard.py` | 4 | `dashboard.test.ts` | 4 | |
| `test_learning_purity.py` | 1 | `purity.test.ts` | 26 | one case per source file: relative imports only, no DOM/timer/network globals |
| `test_content_english.py` | 24 | `content_english.test.ts` | 24 | reads the YAML (PyYAML booleans) |
| `test_content_science.py` | 3,616 | `content_science.test.ts` | 30 | the 5 per-item checks walk all items in one case each (same checks) |
| `test_quiz_flow.py` | 21 | `quiz_flow.test.ts` | 21 | `quiz_flow.ts` |
| `test_math_isolation.py` | 7 | `quiz_flow.test.ts` | 6 | `text.ts`. Not ported: `test_equation_reads_left_to_right_in_hebrew_line` (Tuxemon's bidi `to_visual`; the browser does bidi) |
| — | — | `golden.test.ts` | 261 | new: every skill × 5 contexts × 40 seeds gives the same question as Python, field by field |

Totals: 3,921 Python cases (305 without the per-item science cases) → 707 Vitest cases, all green.

**Not ported yet:** the one `to_visual` case above. Everything else in INVENTORY §2.3 is ported.

## Generators: 77 of 77, plus `bank`

All 78 registered generators are ported and replay Python exactly
(`golden.test.ts`): arithmetic (22), rational (14), geometry (23), logic (10),
algebra (6), word problems (1), `english.vocab` (1), `bank`.

## Randomness: `PyRandom` replays Python's seeds

`random.ts` is MT19937 with CPython's seeding (`init_by_array` on the 32-bit
words of the seed) and CPython 3.13's methods (`random`, `getrandbits`,
`_randbelow`, `randrange`, `randint`, `choice`, `shuffle`, both `sample`
algorithms, `choices` with `bisect_right`, `uniform`). The generators are
line-by-line ports that make the same calls in the same order, keep Python's
float operation order, banker's rounding (`pyRound`), `//` and `%` on
negatives, `{:g}`, tuple `repr` and even CPython's tuple `hash()` (one geometry
item id uses it). So the same seed gives the same question in both apps.

What this means for the phone's `learning.json`: a Leitner card stores its
item's seed, and that seed regenerates the same item here. Checked for
seeds 0–39 in 5 contexts per skill (`golden/make_golden.py` writes the
hashes from the Python; run it again if the Python generators change).
The proof is per seed, not universal: a seed outside the tested range that
hits a path the tests never reach could still differ. If that ever matters,
regenerate a card from its `item_id` instead. New cards store the seed
`PyRandom` drew, as before.

## Loading content

`loadContent(docs, opts)` takes parsed files keyed by their path under
`mods/nagmon/learning/` (`"skills/math.yaml"`, `"science/living.yaml"`,
`"english/words.yaml"`). The build pipeline's JSON (same structure, `.json`
names) works as it is. Every problem is collected into one `ContentError`.
AI-studio banks (`opts.extraBanks`) only warn. Tests read the YAML with the
`yaml` package set to PyYAML's rules (YAML 1.1, booleans without `y`/`n`;
`N` stays a letter).

## Public API (`index.ts`)

```ts
loadContent(docs: ContentDocs, opts?: { registry?, extraBanks?, allowMissingGenerators? }): ContentLibrary
new LearningEngine(content: ContentLibrary, learner: LearnerState, opts?: { rng?: PyRandom; clock?: () => number; config?: Partial<SelectorConfig> })
LearningEngine.restore(content, saved: Record<string, unknown>, opts?): LearningEngine   // saved learning.json, v0 or v1
engine.nextQuestion({ subject?, skill_id?, skill_ids?, context?, max_choices?, difficulty_bias? }): Question
engine.submit(q, given: Given, { elapsed_s, context?, hint_used?, dont_know? }): AnswerOutcome
engine.hint(q): Hint                       // { text_he, eliminate: choice ids }
engine.save(): LearnerData                 // write to learning.json after every answer
engine.subjectProgress(subject): SubjectProgress
engine.dashboard(): DashboardData          // every number with explanation_he
engine.expectedSuccess(q): number
engine.weakSubjects(): string[]
checkAnswer(q, given): CheckResult         // { correct, normalized, misconception }
displayAnswer(q): string
stripBidi(text): string                    // for a canvas that cannot draw LRI/PDI
isolateMath(text): string                  // text.ts
SubjectMap, comboBonus, powerWithCombo, BattleQuizBudget, NumberPad, OrderPicker, LetterTiles   // quiz_flow.ts
```

Times are seconds since the epoch, as in Python, so `learning.json` moves
over unchanged. The streak lives in the engine only and is never saved.

## Findings while porting

- Some generator explanations have no Hebrew word at all, only math (for
  example the times-table explanation `4 × 3 = 4 × 2 + 4 = 12.`). The port
  keeps them; the prompt always has Hebrew.
