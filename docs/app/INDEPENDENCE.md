# Independence from Tuxemon: an inventory

This is an inventory of what the NEW APP (`app/`, built data in
`app/public/game`) still takes from Tuxemon, and what it would take to
replace it. It is not legal advice. Licence statements below come from the
app's own `credits.json` and `licenses/`, and from the repo; before any
release decision that depends on them, have a lawyer read the real licence
texts.

Measured on branch `app/independence` (October 2026), after the creature
cleanup: the app now ships 70 creatures, all declared by the trip files in
`mods/nagmon/trips/` and defined in `mods/nagmon/db/monster`. None is from
`mods/tuxemon` (guarded by `tests/app/test_app_independence.py`).

## 1. The short version

* The app is a derivative work of Tuxemon today and ships as GPL-3.0
  (`credits.json` says so). Being GPL is allowed; it is the price of the
  current state, not a violation.
* Creatures are done: 70 of 70 are our own.
* Of 636 credited assets, 423 are Twemoji (not Tuxemon) and 71 come from
  Tuxemon; the rest (142) is our own art. Of the 71, 37 have no licence
  recorded in `ATTRIBUTIONS.md` (see 3.2).
* The biggest remaining dependency is the maps and tilesets (4 Tuxemon maps,
  9 tileset atlases, plus 5 houses laid out on Tuxemon tiles).
* The repo is a public GitHub fork of `Tuxemon/Tuxemon` (checked with the
  GitHub API: `fork: true`, parent `Tuxemon/Tuxemon`).
* The build tools import Tuxemon's Python code, and `mods/tuxemon` (196 MB)
  is the source of most of the data.

## 2. Inventory by category

Counts are what ships in `app/public/game`. "Tuxemon" means the file comes
from, or is an adaptation of, something under `mods/tuxemon` or `tuxemon/`.

| # | Category | In the app | From Tuxemon | Licence (per the app's credits) |
|---|---|---|---|---|
| 1 | Creatures (art, data, texts) | 70 | 0 | own art, licence not chosen yet |
| 2 | Techniques db | 10 | 10 | data from Tuxemon (YAML); animations below |
| 3 | Items db and icons | 6 | 4 (potion, tuxeball, two berries) | CC0 (potion), CC BY-SA 4.0 (tuxeball), 2 not listed |
| 4 | Elements and status db | 13 elements | 13, plus their 13 type icons | icons: CC0 / not listed |
| 5 | Maps | 15 | 4 (city, Route 1, 2 gyms) | not listed in `ATTRIBUTIONS.md` |
| 6 | House interiors | 5 | layouts copied from Tuxemon interiors | follow the tileset (CC BY-SA 4.0) |
| 7 | Tilesets | 15 atlases | 9 (xBRZ x4 of Tuxemon core tilesets) | CC BY-SA 4.0, adapted |
| 8 | Character sprites | 23 NPC sheets | 2 (the pet cat sprite, a sign) | CC BY-SA 4.0, CC0 |
| 9 | Portraits | 20 | 0 | own, licence not chosen yet |
| 10 | Battle backgrounds, islands, HUD | 27 UI images | 27 | CC0, CC BY, 12 not listed |
| 11 | Technique and item animations | 11 | 11 | 1 CC BY-SA, 10 not listed |
| 12 | Music | 6 tracks | 6 | CC BY 3.0 (credited to one artist) |
| 13 | Sound effects | 15 | 15 | CC0 (5), CC BY 3.0 (1), 9 not listed |
| 14 | UI and battle texts (he/en) | about 965 msgids | about 560 from Tuxemon's `base.po` | GPL-3.0 (Tuxemon translators) |
| 15 | Event and action vocabulary | 27 actions, 15 conditions | all of them, plus the YAML script format | GPL-3.0 (concepts and code) |
| 16 | Engine code | `app/src` (126 files, TypeScript) | 0 copied; 10 files cite Tuxemon as the behaviour they re-implement | ours, but see 3.3 |
| 17 | Build tools | `tools/app` | import `tuxemon.database.loader` and `tuxemon.map.loader` | GPL-3.0 |
| 18 | Learning engine | `app/src/core/learning` | 0 (our own port of `nagmon/`) | ours |
| 19 | Fonts | Rubik | 0 (OFL font, shipped through npm; also kept in `mods/tuxemon/font`) | SIL OFL 1.1 |
| 20 | Emoji | 423 | 0 (Twemoji) | CC BY 4.0 |

Notes:

* Rows 1, 9 and the solar tilesets, plus 21 people, 2 badges and a wallet,
  are art made with image generators and listed as "not stated yet": the
  owner still has to choose a licence for them. That is a separate task from
  independence, but it must be done before the repo can say "all art is ours".
* The pet cat (`rockitten`, used by two NPCs) is the
  last Tuxemon creature picture in the app. It is an NPC map sprite, not a
  creature in the monster table.
* `tuxeball` is a Tuxemon name and picture; the item should be renamed and
  redrawn when row 3 is replaced.

## 3. What disconnecting means

### 3.1 Practically

"Disconnected" can mean three different things; pick one on purpose.

1. **No Tuxemon creatures** (done). Visible to a child, removes the most
   recognisable part. Legally nothing changes.
2. **No Tuxemon assets and data** in the app. The app no longer shows or
   ships any Tuxemon picture, sound, text or database record.
3. **No Tuxemon code and no Tuxemon history**: the build tools stop
   importing Tuxemon, `mods/tuxemon` and `tuxemon/` leave the repo, and the
   repo is no longer a fork.

Only level 3 can end the GPL obligation that comes from Tuxemon.

### 3.2 Legally (an inventory of obligations, not advice)

While anything from Tuxemon stays in the app:

* **GPL-3.0 code and data.** The combined work is distributed under
  GPL-3.0, with the licence text and a way to get the source (the public
  repo does this). The app already shows `licenses/GPL-3.0.txt`.
* **CC BY-SA 4.0 art** (the tileset atlases, tuxeball, the cat sprite and
  one animation). Needs: the author credit, the licence link, a note that it
  was changed (our xBRZ upscales are changes), and the adaptation under the
  same licence. CC publishes BY-SA 4.0 as one-way compatible with GPL-3.0,
  which is why the mix works today.
* **CC BY 3.0 music.** Credit the artist, link the licence, mark changes.
* **CC0 pieces.** No obligation; keep the credit anyway.
* **The 37 assets with no licence in `ATTRIBUTIONS.md`** (4 maps, 12 UI
  images, 10 animations, 9 sounds, 2 items). This is the weakest point: the
  upstream file does not say, so the app cannot show the licence it needs.
  Either find the upstream licence, or replace those files first. The app's
  credits screen marks them "unknown", honestly.
* **Tuxemon's name.** The name and logo are not used in the app, but
  `tuxeball` and some file names carry it.

Once nothing from Tuxemon is left (level 3), the remaining third-party
parts are Twemoji (CC BY 4.0), Rubik (OFL) and the npm packages (check each
licence), plus whatever licence the owner picks for our own art and
code. Own code is not bound by the GPL on its own, but it was written inside
a GPL repo and while reading Tuxemon's code; see 3.3.

### 3.3 The clean-room path

A strict clean room means the new code is written by people who never read
Tuxemon's source, from a written specification. That is not how `app/src`
was written: ten files say they re-implement what the old game does, and the
old game is Tuxemon-based. Two honest options:

* **Treat the TypeScript as independent** because nothing was copied (it is a
  different language and architecture), and keep the credits. This is a
  judgement call; ask a lawyer.
* **Re-derive** the few ports that mirror Tuxemon behaviour closely (event
  runner, grid/collision, walker, camera) from our own written spec, by
  someone who has not read the Tuxemon files. S to M each; do it only if the
  lawyer says it matters.

The vocabulary (`add_monster`, `random_encounter`, ...) is names for ideas,
which copyright usually does not protect, but the YAML script format and the
loaders are Tuxemon's. Our own format is cheap (S) and removes the question.

### 3.4 The repo, the fork and the history

* The repo is a fork. GitHub support can detach a fork from its network on
  request; the repo, history, issues and stars stay. Confirm the current
  procedure with GitHub, since it is done by a support ticket. Detaching
  changes the label, not the licence: every Tuxemon commit already in the
  history stays GPL-3.0.
* A fresh repo is the only way to leave the Tuxemon history behind. Two ways:
  a plain snapshot (no history; the simplest) or `git filter-repo` keeping
  only our paths (`app/`, `nagmon/`, `docs/app`, `art_sources`,
  `mods/nagmon`). The old repo can then be archived or kept private.
* What a fresh repo costs: the stars, issues and PR links; CI secrets and
  workflows to set up again; every link that points at the old repo (the
  data repo's tooling, the storybook, in-app "report a problem" paths, the
  Android build); a clean-up of contributors, since upstream authors appear
  in the history (this clone is
  shallow, so the full list is not visible here). About one to two days of work, plus the replacement of
  everything in section 2 first, because a fresh repo that still contains
  Tuxemon files is still a derivative work.
* Do the repo step last: a fresh repo without the clean-up of sections 2 and
  3.3 gains nothing.

## 4. Replacing each category

Effort: S = a day or less, M = a few days, L = weeks. "Generator" means the
image generator the family already uses for creatures and people.

| Category | How to replace | Effort | Order |
|---|---|---|---|
| Provenance of the 37 unlisted files | find upstream licences, or schedule these files first | S | 0 |
| Own art licence (creatures, people, tiles, badges) | the owner picks one licence and we record it in `credits.json` | S | 0 |
| Techniques (10), elements (13), status | rewrite as our own JSON in our own format, new names and Hebrew texts | S | 1 |
| Items (4) and `tuxeball` | rewrite data, generate 4 icons, rename the ball | S | 1 |
| Event and action vocabulary | own script format and loader (in `tools/app`), keep behaviour | M | 1 |
| UI and battle texts (~560 msgids) | write our own Hebrew and English strings; the app only needs the ones its screens show | M | 1 |
| Sound effects (15) | CC0 sources (verify each file's page) or generated; 15 short files | S | 2 |
| Music (6) | license-free sources (CC0) or generated tracks; need loops for town, battle, win, game over, menu, court | M | 2 |
| Type icons (13), HUD, party icons (14 UI images) | generator, one consistent set; 13 icons are small | S to M | 2 |
| Battle backgrounds, islands (3 environments, 4 images) | generator, same style as the solar maps | M | 2 |
| Animations (11) | generator sprite strips; only 8 frames each are needed | M | 2 |
| Pet cat and sign (2 sprites) | generator, same pipeline as the other people | S | 2 |
| Tilesets (9 atlases) | new tile art from the generator; the solar tilesets already prove the pipeline (`tools/app/solar_maps.py`) | L | 3 |
| Maps (city, Route 1, 2 gyms) and the 5 houses | re-lay out on the new tiles, in our format; the solar maps are the template | L | 3 |
| Build tools' import of Tuxemon code | read our own data only (`tools/app/db.py` already reads only our creatures) | M | 4 |
| Remove `mods/tuxemon`, `tuxemon/`, the old-game tests | after 1 to 3 are done; this is also the 196 MB saving | S | 4 |
| Closely mirrored engine ports | optional re-derivation from our spec (3.3) | S to M each | 4, if advised |
| Repo: detach or fresh | see 3.4 | S | 5 |

## 5. Recommended staged plan

1. **Stage 0, bookkeeping (S).** Record a licence for our own art.
   Resolve or schedule the 37 unlisted Tuxemon files. This stands even if
   nothing else is done, because shipping files without a licence is the
   biggest risk today.
2. **Stage 1, data and words (S to M).** Own techniques, items, elements,
   texts and script format. No art needed. After this the app has no
   Tuxemon data, and the build can stop reading `mods/tuxemon/db`.
3. **Stage 2, sound and small art (M).** Sound, music, type icons, HUD,
   backgrounds, animations, the cat. Each is independent: replace in any
   order, one pull request each, with the build's credits step proving the
   Tuxemon count goes down (`credits.json` has a per-asset source path).
4. **Stage 3, tiles and maps (L).** The only large piece. Start with Route 1
   and the town, then the gyms and the houses. Until this is done the app
   stays CC BY-SA 4.0 and GPL-3.0.
5. **Stage 4, code (M).** Build tools without the Tuxemon import, delete
   `mods/tuxemon` and `tuxemon/`, move or drop the old-game tests, and
   decide on 3.3 with a lawyer.
6. **Stage 5, repo (S).** Detach the fork, or start a fresh repo from our
   paths only. Choose the app's licence on purpose.

A useful check at every stage: a test that counts Tuxemon-sourced assets in
`credits.json` and fails if the number goes up, then goes to zero at the
end. The creature guard in `tests/app/test_app_independence.py` is the
first such check.

## 6. What this document does not settle

* Whether our own TypeScript counts as a derivative of Tuxemon (3.3).
* Whether the owner wants the app to stay GPL-3.0 after Stage 5.
* The exact GitHub procedure and any limits on detaching (ask GitHub).
* The licence of the 37 files the upstream attributions do not list.
