# Art assets, batch 2 (owner art, groups 7, 8, 9)

Shipped under `app/public/game/art/` as WebP, listed in `art/manifest.json`.
Total: 72 pictures, 7.7 MB (budget 12 MB, checked by `tests/app/test_app_art2.py`).

Batch 3 (checkpoint 59: people, upgrades, props, icons, interiors, trip, chapters) is described at the end of this file; its importer and the one-command replace flow are `tools/app/art3.py`.

## How it is made

`python -m tools.app.art2 --packages <unzipped ChatGPT packages> --fixed <code-fixed copies>`
reads the packages (a fixed copy wins over the package's), resizes, encodes
and writes the files and the manifest. Each entry records the source file name
and its SHA-256. The packages (about 100 MB of PNG) are not in the repo; the
WebP files are. `build_data` calls `art2.build`: it validates the manifest
against the files, registers them (so nothing deletes them, and credits.json
lists them as owner art, licence not stated yet) and `--check` fails on a
missing, unlisted or mismatched file.

Sizes: backdrops, seasons, grey valley, color burst, title: 1920x864 (lossy q82,
from the 2560x1152 upscales). Story cards 1672x941 (native). Sheets: frames of 320 px
(portraits 384, cat battle 512, cat map 288), lossy q82 with lossless alpha.
UI pieces: native size, lossless. Logo 512x512.

## Manifest

```
{ "version": 1,
  "backdrops": { "default": id, "maps": { "<map name>": id }, "night": id },
  "assets": [ entry, ... ] }
```

Entry: `id`, `kind` (backdrop, story, title, effect, portrait, pose,
enemy_parts, ui, cat), `file` (under `game/`), `size` [w,h], `frame` [w,h],
`frames`, `cols`, `rows` (a sheet is read left to right, top to bottom; a
single picture has one frame), `labels` (one per frame, from the package's
atlas), `blend` ("normal" or "add") and `fps` for effects, `of` (an additive
effect names its keyed twin; same frames), `source` {name, sha256}.

Ids: `backdrop_{hearthrock,moon,sun,rocky,giants,outer,night}`,
`story_{grey_valley,color_burst,season_*}`, `card_{forgetting_fog,owl_help,colors_return,creature_steps}`,
`title_sunrise`, `title_band`, `logo`, `fx_<name>` and `fx_<name>_add` (11 effects:
attack_math/geometry/hebrew/english/science/logic, effect_hit/heal/net/befriend/levelup;
8 frames: onset ... almost gone), `portrait_{owl,mila}` (friendly, thinking, cheering),
`pose_{boy,girl,curly}` (8 poses), `parts_<subject>` (8 or 12 parts), `ui_<piece>` (16),
`cat_battle` (rear, front), `cat_map_a` (front, left; step A, sit, step B), `cat_map_b` (right, back).

Additive sheets are RGB on black: draw them with an additive blend. Keyed sheets
are RGBA.

## In the app

`src/game/art.ts`: `artUrl(id)`, `backdropFor(map, night)`.

Wired:
- Battle backdrop (`Stage.tsx`): `solar_moon` moon, `solar_sun` sun,
  `solar_rocky_planets` rocky, `solar_giants` giants, `solar_outer` outer; every
  other map (Hearthrock, Route 1, insides, the station) Hearthrock. The old grass
  picture, sun rays, clouds and leaves are gone.
- Owl intro (`IntroScreen.tsx`, `Dialog` `art` prop): owl help behind the hello,
  forgetting fog behind the story and questions, creature steps at the starters,
  colors return at the end. No new taps.

Available only (not wired): night backdrop (no map has a grey or frozen edge yet),
seasons, grey valley, color burst, title and logo (there is no title screen:
the first screen is "who plays"), effects, portraits, poses, enemy parts, UI kit,
cat. Not imported: `story_owl_fly` (magenta matte, not keyed), the seamless tiles
and town tiles (map tile ids are untouched).

---

# Art assets, batch 3 (ChatGPT checkpoint 59: people, upgrades, props, icons, interiors, trip, seven chapters)

Written by `tools/app/art3.py`. Everything in the checkpoint that has a use is in
`art/manifest.json`: 317 pictures, 23.5 MB. Drafts and pictures that need repair are
**in**, flagged. The idea: **a repaired file replaces its old one (same id, same path,
same atlas layout) with one command and no change in the code.**

## Where each thing is, and the numbers

| pack | files | accepted | draft | needs repair | MB | in the app |
|---|---|---|---|---|---|---|
| people (14 people x map_a, map_b, battle, + face icon) | 56 | 52 | 0 | 4 | 2.72 | always |
| upgrades (Mila and the owl, redrawn) | 8 | 8 | 0 | 0 | 0.42 | always |
| props (world, hidden, home_pets, 16 each) | 3 | 3 | 0 | 0 | 0.30 | always |
| icons (items 32, UI 44) | 2 | 2 | 0 | 0 | 0.27 | always |
| interiors (home, shop, rest, lab, station) | 5 | 0 | 5 | 0 | 0.44 | always (draft) |
| tiles (the 16 seamless ground tiles of art_fixed) | 16 | 0 | 16 | 0 | 2.15 | always (draft) |
| trip (small ship, 4 places, astronomer badge) | 6 | 6 | 0 | 0 | 0.42 | always |
| chapters: sea / numbers / letters / harbor / shapes / puzzle / body | 221 | 150 | 0 | 71 | 16.8 | **lazy folder** |

Added to the app: **6.7 MB** (the whole art folder was 7.6 MB before). The chapters
(16.8 MB) are over the 14 MB budget, so they sit in `art/chapters/<name>/` and are
**not in `dist/` (not in the APK) by default**. To ship them (for example when a chapter
is wired): `NAGMON_CHAPTER_ART=1 npm run build`. The manifest says `"chapters_lazy": true`
and each chapter entry says `"lazy": true`; `artUsable(id)` in `src/game/art.ts` is false for
a lazy picture in a build without them. `chapters_lazy` is decided once at the first import
(`--chapters auto|bundled|lazy`) and kept by `--update`, so no path ever moves.

## Ids and paths (stable)

| what | id | file |
|---|---|---|
| a person's walk, front+left | `npc.nagmon_baker.map_a` | `art/npc/nagmon_baker/map_a.webp` |
| a person's walk, right+back | `npc.nagmon_baker.map_b` | `.../map_b.webp` |
| a person's battle picture (back, front) | `npc.nagmon_baker.battle` | `.../battle.webp` |
| a person's face icon (made from the battle picture) | `npc.nagmon_baker.icon` | `.../icon.webp` |
| Mila / owl upgrades | `npc.nagmon_mila.*`, `npc.nagmon_owl.*` | `art/npc/nagmon_mila/...` |
| item icons / UI icons | `icon.items`, `icon.ui` | `art/icon/items.webp` |
| props | `props.world`, `props.hidden`, `props.home_pets` | `art/props/world.webp` |
| room tiles (draft) | `interior.home` ... `interior.station` | `art/interior/home.webp` |
| seamless ground (draft) | `tile.town_ground_00` ... `tile.route_tiles_03` | `art/tile/...` |
| trip | `trip.ship_small` (12 frames), `trip.place_moon_base`, `trip.badge_astronomer` | `art/trip/...` |
| chapter pack | `chapter.numbers.hub`, `chapter.numbers.background`, `chapter.sea.mila.map_a`, `chapter.sea.vehicle` (the object) / `chapter.sea.vehicle.map_a` (its walk), `chapter.sea.place_2`, `chapter.sea.badge`, `chapter.sea.icons`, `chapter.sea.props`, `chapter.sea.card_3` | `art/chapters/sea/hub.webp` ... |

The id comes from the **package-relative path** of the source PNG (the table is `RULES` in
`art3.py`); that is how `--update` finds the entry. Frame labels are in the manifest
(`labels`): a walk sheet is `down_0..2, left_0..2` (map_a) or `right_0..2, up_0..2` (map_b)
(columns: left foot forward, standing, right foot forward); a battle sheet is `back, front`;
icons, props, room tiles, zone tiles and hub tiles are named (`feather`, `chest_closed`,
`door_open`, `wall_straight`...).

## An entry

On top of art2's fields (`id kind file size frame frames cols rows labels`):
`status` (`accepted | draft | needs_revision`), `known_issues` (tags: `magenta`,
`mirrored_floor`, `door_size`, `wall_join`, `cut_off`, `foot_order`, `wrong_hand`, `star_mark`,
`profile_view`, `size_off`, `margins`, `see_note`; the meanings are in the manifest's
`issues`), `pack`, `importer: "art3"`, `empty_frames`, `lazy`, and for walk sheets
`anchor` (the point of the feet, in frame pixels) and per-frame `feet`.
What the app does not need at its start is in **`art/manifest_detail.json`** (by id):
`source` {path, sha256, native size}, `cleanup` {pink and matte pixels before and after},
`boxes`, `feet`, `note` (the package's QA note), `package_status`, `cut_frames`.
`art3.load_manifest()` merges the two.

Top-level keys: `drafts_enabled` (**true**; later map wiring chooses draft or the previous
art by it: `draftsEnabled()` / `artUsable(id)`), `chapters_lazy`, `icons` (item id -> frame of
`icon.items`; UI name -> frame of `icon.ui`), `npc_sprites`, `issues`.
`art/icons.json` is a small copy of the icon part (the shop and the bag read it at the app's
start, without the manifest).

### The NPC sprite registry (for the world's NPC files)

`npc_sprites["nagmon_baker"]` (also `nagmon_mila`, `nagmon_owl`, and the chapter people as
`sea_guide`, `numbers_master`...): `sheets` (art ids), `walk` {down, left, right, up -> sheet and
3 frame numbers}, `frame` (the shipped cell, 256 px), `anchor` and `feet` (the point that
stands on the tile), `battle` {sheet, back, front}, `icon`, `status`, `sheet_status`,
`known_issues`. The loader is in `src/game/art.ts`: `npcSprite(id)`,
`npcWalkFrame(id, facing, step)` (sheet url, frame rectangle, feet point), `npcBattleFrame(id)`,
`npcIconId(id)`. An NPC file only has to name the id. It is not wired into any map yet.

## What the keyer does (`tools/app/art3_key.py`)

The package is RGBA with a hard alpha and the exact magenta under it. The cleanup keeps the
size and every real pixel: a hole of matte inside a figure (between arm and body, the middle
of a gear, the space between the balloon's ropes) becomes transparent; the 2 px ring round
the silhouette is keyed (alpha and true colour estimated from the matte, magenta despilled);
the colour under transparent pixels is the nearest real colour, so scaling never mixes pink
in. A thick pink thing that is the picture (the fisher's rod, `KEEP_FUCHSIA`) stays. Sheets
are cut per cell (a cell may be fractional, 1024/3) and scaled so that a cell is 256 px (walk),
1064 px wide (battle), 192 (icons), 320 (props), 256 (tiles); nothing is enlarged.
Opaque art (cards, backgrounds, floors) is not keyed.

## The replace flow (for the maintainer)

1. A new package arrives from ChatGPT: a **zip** (or several: the checkpoint is in 7 independent
   parts) or an unzipped folder, with the same folders as before (`group1_people/art_inbox/...`);
   a wrapper folder in front is fine. If it has an `ASSET_STATUS.json`, the new statuses come from it.
2. Put the zip(s) anywhere (for example next to the repo) and run, from the repo's root:

```
python -m tools.app.art3 --update ~/Downloads/nagmon_fix_part1.zip ~/Downloads/nagmon_fix_part2.zip --dry-run
```

   It prints what would happen, one line per picture: `new`, `replaced` (with `size ... -> ...`
   and `status needs_revision -> accepted` when they changed), `status` (same picture, new
   status) and how many are unchanged. Nothing is written.
3. Look at the table. Then run the same line **without** `--dry-run`. It checks first (any
   problem stops everything, nothing is written): the picture opens; it is **not smaller** than
   before (use `--allow-smaller` if that is meant); a transparent sheet has transparency; no
   flat matte blob is left after the cleanup; the atlas grid is the same. Then it cleans, scales
   and writes each file **at its old path**, updates the entry, rebuilds the registries and the
   face icons, and writes `art/manifest.json`, `art/manifest_detail.json`, `art/icons.json`.
4. `python -m tools.app.build_data` then `python -m tools.app.build_data --check`
   (the files keep their paths, so only the pictures and the manifest change), run the tests,
   commit. **No code changes.**

A file whose path is not in the table (`RULES`) is ignored. A new file of a known kind
(say `chapter_sea/tiles/sea_deep_2.png`) is added as `new` with its own id and path; the
code can use it when it is ready. `python -m tools.app.art3 --report` prints the table above.
First import (not needed again): `python -m tools.app.art3 --package <checkpoint dir> --seamless <art_fixed/seamless_tiles>`
(about 25 minutes; the package is untrusted data: nothing in it is ever run).

## In the app

* **Item icons** (`src/ui/ItemIcon.tsx`, `src/game/icons.ts`): Shop (shelves, detail, pay step,
  bought), Bag (cards, detail), found cards (`prizeLook`: rest center and world cards) and the
  befriend tray show the icon of `icon.items` for 16 items (the nets, berries, biscuit, pie,
  tonics, feather, clover, owl pass, map, badge case, egg); the other items (cards, dew drop, mint,
  syrup, all-better, star net, ticket) keep their emoji, and so does an item whose sheet is not usable.
  The icon sheet's cells are about half picture, so an icon is drawn at 1.6 em with a negative margin.
  The tabs (nets, snacks, tools) and the quiz helpers are still emoji.
* **Owl and Mila upgrades**: `Dialog` has a `speaker` prop (a registry id): the person's battle
  picture (front) stands on the box (`dialog-speaker`). The owl's intro uses `nagmon_owl`; Mila's
  vehicle screen (`TripScreen`) has `nagmon_mila` in its title. The portrait is its own chunk
  (the manifest is not in the start bundle).
* Nothing else is wired: no map, tileset, collision or NPC file changed.

## Honest QA (what the contact sheets show)

Status per pack is in the table above; per picture it is in the manifest.

* Looks right in context: the 14 people (walk, battle, icon), the upgrades, the item and UI icons,
  the three prop sheets, the trip ship and places, the room-tile objects (bed, shelves, counters...).
* **Draft or needs repair, as the package says**: four people's `map_a` (`foot_order`: scientist, scout
  girl, grandpa, artist: the front walk's leading foot is on the wrong side; the walk is usable, just
  mirrored); all five interior sheets and all chapter tile sheets are `mirrored_floor` (kaleidoscope floors,
  not seamless) and the interiors also `wall_join` (the straight wall is shorter than the corner); the
  chapter zone sheets have `door_size` (door overlay too big for the building) and the `hub` sheets `wall_join`;
  chapter cards 5, 7, 8 of numbers and 1, 4, 5 of letters have unrequested stars or a wrong held object.
* **Cut off or touching the cell edge** (`cut_off`, computed): the farmer's `map_b`, the baker's `map_a`
  (frames 4 and 5), the owl upgrade's `map_b` (frame 4), and in the chapters the owl `map_b` of numbers and
  harbor, the sea guide `map_b`, the harbor guide `map_a`, the letters Mila `map_b`... In the farmer's case the
  boots reach the cell's last row (feet at the bottom edge, not at y 464 of 512), so standing on the tile
  anchor works but the soles may be clipped; check in place before use.
* **Fuchsia left on purpose**: the fisher's rod (`magenta`, `KEEP_FUCHSIA`): it is the same colour as the matte,
  so it cannot be told from a gap by colour; a repaired file with a non-matte colour should drop it from the list.
  `chapter.letters.owl.battle` and `chapter.sea.mila.map_a` keep a few hundred pink pixels (a thin stripe or
  a pink detail); look before using.
* The ship's cockpit glass was magenta-tinted in the source; after the cleanup it is clear/white in some frames.
* The shipped icon cells are small inside their frames (fill ratio about 50%); that is the package's, not the keyer's.
* The 16 seamless ground tiles come from `art_fixed` (made by code from the earlier town sheets, offset
  cross-blend), not from checkpoint 59; they are `draft` and unchecked in a map.

## App icon

The launcher icon, splash and favicon are the Nagmon badge (`app/public/game/art/title/logo.webp`), made by `python -m tools.app.icons` (adaptive foreground and monochrome inside the safe zone, legacy mipmaps, splash, `app/public/favicon.png`); `--check` fails when a file differs. The badge is cropped and scaled, never redrawn. Tests: `tests/app/test_app_icons.py`.
