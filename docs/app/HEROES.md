# Heroes: how to add one

The heroes a child can be are **data**. The list is
`mods/nagmon/heroes/heroes.yaml`; the build checks it
(`tools/app/heroes.py`) and ships it as `app/public/game/heroes.json`.
The app reads that file and has no hero list in `app/src/`. Adding a
hero is a data entry plus its art, with no code change.

## What a hero is

| field | meaning |
|---|---|
| `id` | what a child's save stores (`boy_blue`). Lower-case letters, digits, `_`. Never rename a shipped id: saves hold it. |
| `name.he`, `name.en` | the label on the card. Named by look, not "boy" or "girl": any child may pick any hero. |
| `order` | picker order, lowest first (ties by id). Leave gaps (10, 20, 30). |
| `enabled` | `true`: offered in the pickers. `false`: not offered, but a child who already has it still sees it. Use it to retire a hero without breaking saves. |
| `art.map` | art id of the walk sheet (3 frames across, 4 directions down; a frame is 16x32 at 1x, any whole multiple). |
| `art.portrait` | art id of the large portrait (dialogs). |
| `art.face` | art id of the face on the cards and in the battle. |
| `colors.primary`, `colors.secondary` | default colors, `#rrggbb` (outfit, hair). |
| `variants` | optional looks of the same hero, see below. |
| `source` | the sheet names the art pipeline reads (`tools/app/db.py`): `sprite` (map sheet under `mods/nagmon/sprites`) and `combat_sheet` (under `mods/nagmon/gfx/sprites/player`). |

Top of the file: `max_heroes` (at most 12: the picker is tested up to
that), `fallback` (the hero an unknown saved id is drawn as; it must be
enabled) and `legacy` (ids the old app saved -> the hero they are drawn
as).

## Steps

1. **Art.** Two source sheets per hero, made like the shipped heroes
   (see `tools/art/manifest.yaml`, `nagmon_hero_boy_map` and
   `nagmon_hero_boy`): the walk sheet `mods/nagmon/sprites/<sprite>.png`
   and the combat sheet `mods/nagmon/gfx/sprites/player/<combat_sheet>.png`
   (back on the left, front on the right). The build cuts the face card
   (`avatars/<id>.png`) from the combat sheet and writes the map sheet and
   portrait under `app/public/game`. Name them in `source:`. Do not touch
   existing art.
2. **Manifest and placeholders.** `python -m tools.app.art_sprites` lists
   them as `sprite.npc.*`, `sprite.portrait.*`, `sprite.avatar.*`;
   `python -m tools.app.placeholders` draws their stand-ins.
3. **Data.** Add the entry to `heroes.yaml` (copy a shipped one).
4. **Build.** `python tools/app/build_data.py`. It stops with the reason
   when an art id is not in the manifest, has no placeholder, an id is
   used twice, there are more than `max_heroes`, or a color/name is
   missing.
5. **Test.** `cd app && npx vitest run`; the picker lays out any number
   of heroes from 3 to 12 (e2e: `tests/e2e/heroes.spec.ts`).

A picture whose file is not in the build (a private pack not installed,
art not delivered yet) is drawn from its placeholder, so a new hero never
shows a broken image.

## Layout

Up to 5 heroes the cards sit in one row. More wrap into rows that fill
the width, and the list scrolls up and down when the rows do not fit
(12 heroes at 130% text). Cards are at least 48 px both ways. To see
the picker with another number of heroes, set localStorage
`nagmon.heroes.preview` to a whole `heroes.json` (the e2e does).

## Saves

A profile stores the hero `id` (`profile.avatar`). Old saves keep working:
the old app's ids (`boy_light`, `girl_dark`...) are in `legacy` and are
drawn as the hero they map to; an unknown id is drawn as `fallback`. The
stored id is not rewritten. Retiring a hero (`enabled: false`) keeps it
drawable for the children who have it.

## Variants (a kippah, a hairstyle)

A variant is a look of the same hero, a **data-level option**:

```yaml
variants:
  - id: kippah
    kind: head_covering        # or hair, glasses...
    name: {he: כיפה, en: Kippah}
    art: {map: sprite.npc.nagmon_hero_boy_kippah}   # only what changes
```

A variant lists only the pictures it changes (`map`, `portrait`,
`face`); the others come from the hero. Its art ids are checked like the
hero's. The app resolves them (`heroes.file(id, art, variant)`,
`heroSheet(id, variant)`), but no screen lets a child pick a variant yet
and profiles do not store one: that is a later feature. Adding a variant
now means data plus art, as for a hero.

## ChatGPT art checklist

Ask for each hero, in the same style as the shipped three (hand-drawn,
soft outlines, one picture pixel, no anti-aliased halo):

- [ ] **Modest**: long sleeves, knee-length or longer, no short skirt
  (docs/kids/SDD_MODESTY.md). A head covering as a variant, not a
  different hero, when it is an option.
- [ ] **Walk sheet** (384x1024 like the shipped ones): 3 frames across
  (step, stand, step) x 4 rows (down, left, right, up), transparent
  background, every frame the same size (128x256), the feet on the same
  line in every frame.
- [ ] **Combat sheet** (384x384): the back view on the left half, the
  front view on the right, transparent. It becomes the portrait and the
  face card (the right half, trimmed). The coherence guard compares it
  with the walk sheet: same hair, same clothes.
- [ ] Same person in both sheets; no text, no logo, no real child's likeness.
- [ ] A name by look (`name.he` one or two words), distinct from the others.
- [ ] Colors: the outfit and the hair, as `#rrggbb`.
- [ ] Credits: the file is the owner's art (`nagmon_` prefix): it ships
  from the private pack; the public build shows its placeholder.
