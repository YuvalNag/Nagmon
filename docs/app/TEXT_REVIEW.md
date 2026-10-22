# Text review: the parent approves or corrects Hebrew lines on the phone

Status: slice built on branch `app/text-review`. Follows SDD.md (spec first, tests first).

## 1. Why

Every Hebrew line the game says was written by a model. A native speaker must read them. Until now that meant
`W1_HEBREW_REVIEW.md`-style tables read on a laptop. The parent has the phone in hand: one line at a time, one
tap to approve, one text field to correct. The decisions travel to the private data repo through the upload the
app already has, and a tool applies them to the YAML sources, with a test-checked diff.

Nothing here is for the child. The screen is inside the parents' area (which is behind the parent code), the
upload carries lines of the game and the parent's decisions, never a name, a score or anything about a child.

## 2. The data (`tools/app/review.py`, a step of `build_data`)

### 2.1 What is a review item

A line of shipped Hebrew content, one item per line:

| type | source | key (path inside the file, `/` between parts) | context (Hebrew, for the parent) |
|---|---|---|---|
| `quest` | `mods/nagmon/quests/*.yaml` | `offer/lines/0/he`, `steps/1/say/0/he`, `title/he` ... | the giver, and what the line is: offer, story before the question, closing, hint ... |
| `npc` | `mods/nagmon/npcs/<slug>.lines.he.yaml` | `greet_first/3`, `topic.bread/1/text` | the person, the pool (first greeting, farewell, answer to a topic ...), the hour or friendship condition |
| `mail` | `mods/nagmon/mail/letters.yaml` | `letters/postcard_owl/variants/0/text_he` | the sender, daily postcard or event letter |
| `fact` | `mods/nagmon/economy/facts.yaml` | `facts/owl_night/text_he` | the subject, where facts appear |
| `ui` | `app/src/i18n.ts` | the text key (`parentsTitle`) | the section comment above it and the key |

Not items: names (places, props, senders' names, topic chip labels), `item_*` UI keys (their source is the
economy YAML) and `i18nEvolution.ts` (twinned with the `.po` catalogue). These are deferred (section 9).

An item is `{id, type, src, key, he, en?, ctx, hash}`:

- `id` = `<type>:<file stem>:<key>`, e.g. `npc:nagmon_baker:greet_first/0`. Stable while the line stays where it is.
  NPC pools only grow at the end (npcs.py), quest lists keep their order, so an id keeps meaning the same line.
- `hash` = first 16 hex of SHA-256 of the NFC-normalised Hebrew text. The text a decision is *about*.
- `en` is the English twin when the source has one (quests).

### 2.2 What is already reviewed

`mods/nagmon/review/status.yaml`:

```yaml
version: 1
approved:
  "npc:nagmon_baker:greet_first/0": "0123456789abcdef"   # id -> hash of the approved text
```

Only items whose current hash differs from the approved one (or that have no entry) are *pending*. A line the
parent approved and a developer later rewrote comes back, because its hash changed.

### 2.3 What is shipped

`game/review.json` (lazy: fetched by the review screen only; **not** in the start script, which stays
<= 450,000 bytes):

```json
{"version": 1, "items": [{"id": "...", "type": "npc", "src": "mods/...", "key": "...", "he": "...", "ctx": "...", "hash": "..."}]}
```

It lists the pending items only. `build_data --check` covers it like every other file.

## 3. The screen (`'בדיקת ניסוח'`)

A lazy chunk (`ui/screens/parents/ReviewPage.tsx`, loaded from the parents' area; its words are in the chunk's own
table, so the start script does not grow). Reached from the parents' home by a fifth door; the area itself is
behind the parent code, so the screen is parent-PIN gated and is not reachable from who-plays.

One line at a time:

- the context (small), the Hebrew line (large, RTL), the English twin when there is one;
- three buttons, each >= 48 px: **מאשר** (approve), **לתקן** (opens the edit view), **דלג** (skip);
- edit view: a text field with the line prefilled, RTL, `inputmode` text, `enterkeyhint` done. The phone is
  landscape, so the keyboard takes about half the height: the field sits at the top of the view, its buttons
  (**שמירה**, **ביטול**) beside it, the view scrolls and the field scrolls itself into view when it gets focus.
  A correction must keep the line's `{placeholders}` (`{name}`, `{who}`): without them the save is refused with a
  sentence, so a corrected line cannot show `{name}` to the child.
- progress: `3 מתוך 120`, counting decided lines (approved, corrected or skipped) against all the lines shown by
  the filter;
- filter by source type (all, quests, people, mail, facts, screens): one row of chips, >= 48 px;
- works at 100% and 130% text at phone widths (873x393 landscape and a 360 px portrait phone): the screen scrolls
  when it must, the buttons never leave it.

### 3.1 Decisions are kept on the phone

`review/decisions.json` in the app's data store (`DATA_FILES.review`): `{schema_version, decisions: {id: {action,
newText?, baseHash, sent?}}}`, written with the same atomic `writeJson` as the rest. They survive restarts. A
decision is about `(id, baseHash)`: when a later build ships the same id with another hash, the old decision does
not hide it. Skipped lines are not shown again in the queue (they come back when the parent taps "show skipped",
and in the next build, as they were never approved).

## 4. Upload (`core/fieldData/uploads.ts`)

Same mechanism as reports: the consent is the saved token plus the parents' switch; the file goes to

```
devices/<install-id>/review/<UTC>/decisions.json
```

(`uploadPath(device, "review", now)`), content:

```json
{"schema_version": 1, "decisions": [{"id": "...", "action": "approve|edit|skip", "newText": "...", "baseHash": "..."}]}
```

`newText` only for `edit`. No child, no name, no score is in it (the text is cleaned of keys and names once more
like every upload).

Queue and retry like reports: the screen keeps the decisions not yet sent (`sent` flag per decision). After every
decision, and on every start, `FieldData.deliverReview()` sends the unsent ones when consent exists ("sent" /
"queued" / "off"; never rejects); a failed upload leaves them queued for the next try. The screen shows
"N בתור לשליחה" / "הכל נשלח" / "השליחה כבויה (אין חיבור ל־GitHub)". The queue is visible in the parents' home too.

## 5. The apply tool

```
python -m tools.app.review apply <decisions.json> [--dry-run] [--no-build]
python -m tools.app.review stats
```

For each decision (`skip` does nothing):

1. unknown `id` -> refused;
2. `baseHash` differs from the line's hash now -> refused (somebody changed it since the parent saw it);
3. `edit` with empty text, a newline, or other `{placeholders}` than the old line -> refused;
4. `edit`: the scalar is replaced **in place in the source text**, in the style it had (double-quoted, single-quoted,
   plain); a block scalar is refused. Nothing else in the file moves: comments, order and quoting stay. The
   scalar's position comes from PyYAML's node marks, not from searching the text, so a line that occurs twice is
   still the right one. TS strings (`i18n.ts`) are replaced on their line as a JSON string literal.
5. approved and corrected lines are recorded in `status.yaml` (id -> hash of the final text), sorted.

Then `build_data` runs (unless `--no-build`). `--dry-run` writes nothing and prints a unified diff of the files and
of `status.yaml`. A refusal never stops the other decisions; the exit code is 1 when anything was refused.

## 6. Tests

- `tests/app/test_app_review.py`: hash (NFC, stable), extract (each type, ids, context, English, names excluded),
  pending/status, build output, apply (approve, edit in each quoting style, comments kept, duplicate text, refused
  hash, refused placeholders, block scalar, dry-run diff, status sorted, ts).
- vitest: the screen (queue, approve, edit, skip, filter, progress, restart keeps decisions, placeholder guard),
  the upload (path, content, retry, off without consent).
- e2e `review.spec.ts` on phone-he at 100% and 130%: into the area through the code, open the screen, approve one,
  correct one, see "2 בתור" and the GitHub mock receive `devices/<id>/review/<UTC>/decisions.json`; and with no
  network the decisions stay queued.

## 7. Privacy

The repo is public; the data repo is private. The shipped review items are game text only. The decisions file holds
ids, hashes and corrected game lines. A corrected line is typed by the parent: it passes through `clean` like all
uploads (keys and children's names are removed).

## 8. Size

`review.json` is lazy (its own file, `game/`), the screen is its own chunk. The start script does not change
(checked by `startBundle.test.ts`, limit 450,000, not raised).

## 9. Deferred

- items whose source is twinned: `item_*` UI keys (economy YAML), `i18nEvolution.ts` (`.po` catalogue);
- Hebrew in learning content (`mods/nagmon/learning`: questions, passages), the moves and the battle texts;
- an "undo" for a decision already sent;
- showing the parent a whole conversation (greeting, topic, farewell) in order.
