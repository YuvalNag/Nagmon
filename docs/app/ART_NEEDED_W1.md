# Art still needed after W1 (People and pools)

W1 reuses the 20 existing map sheets, so 16 of the 33 people stand in with another person's picture
(`mods/nagmon/db/npc/nagmon_cast.yaml` says which). Each needs its own map sheet (and, later, a portrait).
Prompt skeleton: `docs/app/WORLD_V2.md` section 11. Sheet layout: 3 frames across (step, stand, step) x 4 rows
(down, left, right, up), each frame 128x256. Modest dress, mixed skin tones, friendly faces, no text, no weapons.

| Person (slug) | Stand-in today | What to draw |
|---|---|---|
| Ofir the baker (`nagmon_baker`) | the old man with the compass (granite) | big man, flour-dusted apron, a tray of bread |
| Salim the carpenter (`nagmon_carpenter`) | the shopkeeper's apron | quiet man, work apron, a plank or a small saw |
| Tasma the pharmacist (`nagmon_pharmacist`) | the astronomer (headscarf) | woman, white coat over long sleeves, a small bottle |
| Larisa the librarian (`nagmon_librarian`) | the grey hood | woman, cardigan, glasses, an armful of books |
| Eitan the ranger (`nagmon_ranger`) | the moon engineer's hard hat | outdoorsy man, hat, binoculars |
| Shira the photographer (`nagmon_photographer`) | Mila's orange dress | woman, long skirt, a camera |
| Roni, the rival (`nagmon_rival_roni`) | the rover driver | teen, sporty, a notebook |
| Haim, chess (`nagmon_chess_haim`) | the sage | old man, cap, a folded chess board |
| Mazal, cards (`nagmon_card_trader`) | Mila's space suit | woman, scarf, a fan of cards |
| Aviv, newsboy (`nagmon_newsboy`) | Yoav (kid) | boy, cap, a rolled newspaper |
| Hana, tailor (`nagmon_tailor`) | the teacher | woman, tape measure round the neck |
| Yosef, clockmaker (`nagmon_clockmaker`) | the astronomer | old man, glasses, a pocket watch |
| Tiky, robot (`nagmon_robot_tiky`) | the moon engineer | small round helper robot, friendly face |
| Pita, cat (`nagmon_cat_pita`) | the pet cat `rockitten` | town cat sheet with sit, walk, sleep |
| Keren, scout (`nagmon_scout`) | the rover driver | teen girl, hiking clothes, a backpack |
| Fuad, fisher (`nagmon_fisher`) | the old man with the compass | patient man, hat, a fishing rod |

Also: portraits for the 7 solar people and the new 16; Galit (friend house) and Hana, Rina and the
nurse/gardener share two sheets (granny, teacher) and would each like their own.

Prompt for each (one image per request): "Soft digital illustration in the same style as the attached reference sheet
of Nagmon (friendly, rounded, flat colours, thin dark outline, children's game). Subject: <person from the table>.
Layout: map walking sheet, 4 directions x stand and two steps. Plain flat background. Modest clothing. No text."

## Done with the owner's art (tools/app/skins.py)

Fuad (`nagmon_fisher`), Ofir (`nagmon_baker`) and Larisa (`nagmon_librarian`) walk with their own sheets. Left on borrowed pictures: the house nurse (the registry has a nurse, but the
portrait guard needs her portrait to match first), and because the match is not certain: the carpenter (a builder is drawn), the gardener (the farmer is a man), the scout (sheet needs revision), Haim (the
grandpa may not be him), the kids. W2 props: the notice board, the mailbox (its flag is always up) and both
bookshelves use the owner's props; the PC, TV and fridge keep their stand-ins.
