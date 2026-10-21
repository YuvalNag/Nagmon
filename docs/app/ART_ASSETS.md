# Art assets, batch 2 (owner art, groups 7, 8, 9)

Shipped under `app/public/game/art/` as WebP, listed in `art/manifest.json`.
Total: 72 pictures, 7.7 MB (budget 12 MB, checked by `tests/app/test_app_art2.py`).

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
