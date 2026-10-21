# Shop, Rest Center, Home: status and the art still needed

Status table for `docs/app/FEATURES.md` sections 4.3, 4.4 and 5.3 (that file lives on
branch `app/features-spec`; this table is meant to be pasted into it when the branches meet).
Every picture below is drawn in SVG or CSS today and sits behind ONE component, so the generated
art replaces the body of that component and nothing else changes.

| Feature | State | Where |
|---|---|---|
| Shop: 3 shelves, 6 items a shelf, prices from `economy/items.yaml`, Buy | Built | `ui/ShopScreen.tsx`, `core/game/shop.ts` |
| Pay step: A counts up to 10 with stacks of 1 and 5, B exact change, C "10% off today"; "a bit more / a bit less" counted aloud; shopkeeper counts after 2 tries; never blocked, never over the shelf price | Built | `ui/PayStep.tsx` |
| Quick buy after the money skill is mastered (engine skill of the band, or 5 exact first tries in a row), parents' switch | Built | `core/family/shopSettings.ts`, parents' child page |
| Rest Center: friends resting and cheerful, party/Meadow swap, partner, daily gift (once a day, local date) | Built | `ui/RestScreen.tsx`, `core/game/rest.ts`, `core/game/loot.ts` |
| Home: daily chest (7,4) with a question lock, egg nest (1,4) | Built | `mods/nagmon/maps/nagmon_home.yaml` |
| Actions `open_shop`, `open_rest`, `open_chest`, `give_item`, `place_egg`, `show_fact` | Built | `core/world/events.ts` |
| Eggs: warm with right answers anywhere, hatch into a friend of the zone, progress ring on Friends | Built | `core/game/eggs.ts`, `ui/FriendsView.tsx` |
| Loot and facts tables | Built | `mods/nagmon/economy/loot.yaml`, `facts.yaml` |
| Placing chests, signs and nests on the other maps | Later (another agent) | use the actions above |
| Cosmetics, decor, mirror, trophy shelf, mailbox at home | Not started | |
| Nurse's health fact, "rest everyone" with energy | Not started (no energy mechanic yet) | |

## Art we would need (asset names)

| Visual | Component today | Asset names for the generated art |
|---|---|---|
| Coin icon by prices and wallet | `CoinIcon` | `coin_icon.svg` |
| Coins and bills to pay with | `CoinArt`, `StackArt` | `coin_1.svg`, `coin_2.svg`, `coin_5.svg`, `coin_10.svg`, `bill_20.svg`, `bill_50.svg`, `stack_1.svg`, `stack_5.svg` |
| Shop shelf boards | `ShelfArt` | `shop_shelf_board.png` (tileable strip), `shop_shelf_back.png` |
| Item icons (13) | emoji in `economy/items.yaml` | `item_<id>.png` for each id |
| Nurse's desk | `DeskArt` | `rest_desk.png` |
| Resting mat | `MatArt` | `rest_mat.png` |
| Gift box | `GiftArt` | `gift_closed.png`, `gift_open.png` |
| Chest (card) | `ChestArt` | `chest_closed.png`, `chest_open.png` |
| Chest on the map (16x32 prop) | `mods/nagmon/sprites_obj/nagmon_chest.png` | `nagmon_chest.png` with a closed and an open frame |
| Egg (card, ring) | `EggArt`, `EggRing` | `egg_<element>.png` (13 patterns), `egg_crack_1.png` to `egg_crack_3.png` |
| Nest on the map (16x32 prop) | `mods/nagmon/sprites_obj/nagmon_nest.png` | `nagmon_nest.png`, `nagmon_nest_empty.png` |
| Sign / notice board | `NoticeArt` | `notice_board.png` |
| Fact pictures | emoji set (`facts.yaml`) | one picture per fact id if emoji is not enough |
