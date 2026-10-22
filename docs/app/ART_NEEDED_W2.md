# Art needed for the working objects (slice W2)

Every picture below is drawn today in SVG, CSS or a small pixel stand-in, and sits behind ONE component or
one file, so the generated art replaces that body and nothing else changes. Style: the same pipeline as the
20 existing map sheets (`tools/art/manifest.yaml`, `art_sources/`); modest dress in any person, friendly
faces, no text baked into a picture, no weapons.

## Map props (16x32 px, transparent, the bottom of the picture is the tile it stands on)

Stand-ins: `mods/nagmon/sprites_obj/nagmon_<name>.png` (pixel drawings made for this slice).

| Asset | Used at | States wanted |
|---|---|---|
| `obj_pc` | home nook (2,2), Rest Center (1,3) | off, on (screen glows) |
| `obj_mailbox` | home, by the door (2,6) | flag down, flag up (the flag shows unread mail; today it is always one picture) |
| `obj_bookshelf` | home nook (5,2), lab library (7,3) | one picture; a second with a book half out for "books not read today" |
| `obj_tv` | friend's house (2,2) | off, on |
| `obj_fridge` | friend's house (7,2) | closed, open |
| `obj_noticeboard` | Hearthrock square (18,15) | empty, with cards |

Also wanted: a soft glow or small bounce cue for "this can be tapped" on every object (the spec asks for a
visible cue; none is drawn yet).

## UI pieces (components in `app/src/ui/pc/ObjectArt.tsx`)

| Component | Asset names for the generated art |
|---|---|
| `Pic` (people portraits, snacks, posting pictures, facts) | portraits `portrait_<npc slug>.png` (14 people of the PC's directory); snack icons `snack_berry/cookie/bun/juice/apple/carrot.png`; posting pictures if emoji is not enough |
| `MoonArt` | `moon_new`, `moon_waxing_crescent`, `moon_first_quarter`, `moon_waxing_gibbous`, `moon_full`, `moon_waning_gibbous`, `moon_last_quarter`, `moon_waning_crescent` (all `.svg` or `.png`) |
| (sky events) | `sky_meteor_shower`, `sky_solar_wind` pictures for the TV |
| `EnvelopeArt` | `ui_envelope_closed`, `ui_envelope_open`, `ui_envelope_unread_dot`; a postcard frame and letter paper background |
| `StarIcon` | `ui_star_on`, `ui_star_off` (the favourite star of a friend) |
| `BookArt` | a book cover template in 6 colours (one per subject), `book_spine` |
| `StampArt` | 10 reading-stamp pictures (one for each of the first ten stamps) and `ui_bookmark_charm` |
| `TvFrame` | `tv_frame.png` (wooden box with two knobs) |
| `FridgeArt` | `fridge_open.png` with three shelves |
| PC tabs (emoji today) | 5 tab icons: `tab_boxes`, `tab_items`, `tab_mail`, `tab_journal`, `tab_people` |
| Box wallpapers | 6 wallpapers behind the box grid (`box_bg_1` to `box_bg_6`) |
| Friendship | `heart_full`, `heart_empty` (3 levels are shown) |
| Notice board cards | `board_card_frame` with a pin, 4 slot badges (easy, normal, learning, weekly) |

## ChatGPT prompt starters

* "Pixel art, 16x32 px, transparent background, soft outline, a child-friendly desktop computer on a small
  table, two frames: screen off (dark) and screen on (light blue with a smile). No text."
* "Eight moon phase icons, flat style, round, dark blue disc and cream lit part, lit on the right while it
  grows and on the left while it shrinks, 128 px, transparent background, no text."
* "A set of 10 round stamp icons, each with a small open book and a different small animal, red ink, 96 px."
* "Friendly portrait of a shopkeeper in a brown apron, shoulders up, 256 px, flat colours, warm light."
