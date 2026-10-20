# Validation report — candidate set, not production-approved

- Generated and saved: **26/26 candidates** across **38 generation attempts**.
- Fully validated production assets: **0/26**. Blocked: **26**. Pending generation: **0**.
- Candidate ZIP: **YES**, checked for all 26 exact filenames and readable PNG bytes.
- ZIP of 26 validated assets: **NO**. Full specification validation completed: **NO**.
- Automated file audit completed: **YES**. Every selected image reviewed visually: **YES**.

## Actual automated findings

All 26 PNGs decode. All 26 selected sheets have the expected number of major connected sprite regions:12 per MAP,2 per BATTLE,4 per MONSTER. There is no major-region clipping at the image boundary. Confidently identified near-magenta background pixels were normalized to exact RGB(255,0,255); all outer borders are exact magenta. Darker magenta artifacts in the tourist's empty left margin were also corrected. Background checks do not certify that every edge pixel belongs correctly to foreground rather than a residual halo.

**24/26** sheets have at least40 px between major sprite bounding boxes. Remaining failures: **Job11 Mila MAP:22px**; **Job26 pink evolution:21px**. Both reached their three-attempt limit. The teacher's spacing issue was corrected on its second attempt. Connected-region bounding-box measurements are conservative approximations of silhouette separation, not semantic proof.

Every image contains many thousands of distinct foreground RGB values, rather than approximately 16 flat palette colors per character. Repeated requests for indexed/coarse pixel output did not solve smoothing and tonal variation. Only background normalization was applied programmatically; no foreground quantization, resampling, frame rearrangement or hand-drawn substitute was silently introduced. Images therefore remain BLOCKED.

## Actual visual findings

The owl/teacher reference images and previously generated files were unavailable. Written specifications and diversity defaults were used; original-reference likeness cannot be certified. Hero/academy/grandma/kid/mail pairs used the generatedMAP as an identity reference. Evolution pairs used their base creature as an identity reference. Adult and elderly identities were checked, along with skin/hair/outfits, full sleeves, skirt length, no readable writing, and front/back order. Clothing hems and small accessory/pattern differences remain noted perjob. Mila's battle proportions are taller than herMAP proportions. Granite's compass hand/patterns vary acrossMAP frames.

Most humanMAP side walkA/B frames are too similar to certify genuine alternating gait, even where direction order is correct. Equal native cell geometry and foot baselines were not certified. MONSTER icons are larger and more detailed than the intended tiny native menu sprites; several bounce pairs need stronger distinction. The pink evolution has especially smooth curves despite the final pixel-style retry.

No selected image is advertised as production-ready. The perjob manifest is the resume source; all attempts and remaining defects are recorded there. Failed/superseded generations are excluded from the candidate ZIP. The selected candidate PNGs are under`qa/candidates/map`, `qa/candidates/battle`, and`qa/candidates/monsters`; production asset folders remain empty.

## Per-job findings

| Job | Filename | Dimensions | Foreground RGB colors | Major regions | Minimum box gap(px) | Visual findings |
|---|---|---|---:|---:|---:|---|
| 1 | owl_map.png | 1086×1448 | 107980 | 12 | 49.0 | 12 correct directional poses; true back view; distinct walking feet; consistent owl identity. Nonuniform logical pixel grid and oversize RGB palette. |
| 2 | shopkeeper_map.png | 1086×1448 | 105352 | 12 | 46.0 | 12 poses with corrected front,left,right,back row order and wrist sleeves; walking phase distinction is weak in side rows. Original reference absent. |
| 3 | tourist_map.png | 1024×1536 | 142929 | 12 | 47.0 | 12 correct directions, full sleeves, khaki hat, auburn hair and red backpack; walking foot distinction weak in rear row. Reference unavailable. |
| 4 | teacher_map.png | 1024×1536 | 95807 | 12 | 105.0 | Teacher figures reduced within cells for larger gaps;12 correct facing poses, adult identity and outfit retained. Side gait distinction/ankle hem strictness remains uncertain; palette smoothing persists. |
| 5 | hero_boy_map.png | 1024×1536 | 119615 | 12 | 49.0 | Sleeves corrected to wrists, 12 poses, correct facing rows, consistent outfit. Side walking phases still too similar to certify animation. |
| 6 | hero_boy_battle.png | 1774×887 | 82908 | 2 | 321.0 | Two full-body poses, rear three-quarter left and front three-quarter right; same boy, palette, backpack, shoes, wrist-length red sleeves; no extra text. |
| 7 | hero_girl_map.png | 1024×1536 | 103864 | 12 | 53.0 | 12 correctly ordered directions, brown skin and natural black curls, matching teal-yellow clothing/backpack, wrist sleeves and long skirt. Side gait phases too similar for certification. |
| 8 | hero_girl_battle.png | 1536×1024 | 64762 | 2 | 274.0 | Two full-body girl views in correct rear/front order, consistent brown skin/curls/teal-yellow outfit/backpack; sleeves and skirt modest. Small face portion visible from rear3/4. |
| 9 | granite_map.png | 1024×1536 | 166863 | 12 | 50.0 | 12 correct facing rows, mature brown-skinned Granite with gray curls/beard, gray-blue robe and wooden drafting compass. Compass switches hands in front walkB; side gait phases weak; embroidery varies slightly. |
| 10 | granite_battle.png | 1774×887 | 94405 | 2 | 347.0 | Two correct rear/front three-quarter views; same mature brown-skinned Granite, gray curls/beard, robe palette, wooden drafting compass in right hand. Robe motif arrangement varies from MAP. |
| 11 | mila_map.png | 1024×1536 | 110971 | 12 | 22.0 | All12 facing directions now correct. Deep-brown adult Mila, high natural curly bun, ankle-length orange dress, chalk, wrist sleeves. Walking poses remain similar, embroidery fluctuates. |
| 12 | mila_battle.png | 1536×1024 | 68493 | 2 | 286.0 | Two correct rear/front adult Mila poses; deep-brown skin, curly high bun, orange ankle dress, chalk and wrist sleeves retained. Battle body proportions taller/slimmer than chibi MAP; embroidery varies. |
| 13 | granny_map.png | 1086×1448 | 150853 | 12 | 46.0 | Clearly elderly Rina with wrinkles, gray curls, rose scarf, sage cardigan, long burgundy skirt, cane; all12 facing rows correct. Side walk phases weak; small ankle exposure in walking front/back. |
| 14 | granny_battle.png | 1774×887 | 81476 | 2 | 329.0 | Two elderly Rina poses, correct rear/front orientation, warm worried expression, right-hand cane, same scarf/cardigan/skirt/shoes; gentle supportive stance. |
| 15 | kid_map.png | 1024×1536 | 106773 | 12 | 56.0 | 12 town-kid poses, dark-brown skin, short coiled black hair, full striped sleeves, navy trousers/red sneakers, blue ball. Correct facing rows; side walkA/B too similar, ball partly occluded in right idle. |
| 16 | kid_battle.png | 1774×887 | 61677 | 2 | 431.0 | Two playful kid views, rear three-quarter left/front three-quarter right, matching dark skin/coiled hair/stripes/long sleeves/trousers/sneakers and left-arm blue ball; friendly wave. |
| 17 | mailcarrier_map.png | 1024×1536 | 115997 | 12 | 47.0 | 12 correct facing rows, olive-skinned young mail carrier with wavy black hair/cap, full blue sleeves/navy trousers, left-hip satchel/plain envelopes. Side gait phases weak; cap patch is envelope symbol without writing. |
| 18 | mailcarrier_battle.png | 1774×887 | 72683 | 2 | 416.0 | Two full-body rear/front trainer poses, consistent olive skin/wavy black hair/navy cap/blue long sleeves/trousers/shoes/left-hip satchel. Plain envelope held in front pose, no writing. |
| 19 | math_monster.png | 2084×755 | 63582 | 4 | 73.0 | Four same plus-shaped orange lightning creatures in correct front/back/iconA/iconB order; friendly and recognizable. Icons larger than preferred tiny target; visible orange gradient and base color not guaranteed exact. |
| 20 | math_monster_evo.png | 2084×754 | 70997 | 4 | 52.0 | Four evolved plus-shaped orange creatures, clear base lineage and larger elaborate lightning tail, correct front/back/icon order. Icons about35-40pct large height rather than tiny target; gradient remains. |
| 21 | science_monster.png | 1983×793 | 119775 | 4 | 108.0 | Four green round-flask creatures with leaves/bubbles, clear front and true back, two smaller bounce icons, friendly face. Glass/green fills contain tonal gradients, icon scale above preferred tiny. |
| 22 | science_monster_evo.png | 1983×793 | 139573 | 4 | 75.0 | Four evolved flask depictions, more leaves/bubbles and larger body, clear base lineage, front/back correct. Icons are medium-small with weak bounce distinction; glass/green gradients remain. |
| 23 | logic_monster.png | 2172×724 | 49946 | 4 | 168.0 | Fourth icon corrected to front bounceB with eye visible and raised position; correct4-depiction order. Same friendly purple puzzle identity/no glow; fills still smoothed and icons above tiny target. |
| 24 | logic_monster_evo.png | 2172×724 | 55865 | 4 | 95.0 | Evolution now clearly distinct: two top puzzle tabs, broader torso, confident eyebrow, more curled attached wisps, same purple one-eye lineage;4 correct views. Palette/soft color variation remains. |
| 25 | hebrew_monster.png | 2172×724 | 96194 | 4 | 85.0 | Four friendly pink scroll-book depictions, ribbon arms, cream pages, abstract curls with no readable text, correct front/back/icon order and distinct bounce. Pink gradients and nonindexed palette remain. |
| 26 | hebrew_monster_evo.png | 2172×724 | 108684 | 4 | 21.0 | Spacing/pixel edit shrank large views and sharpened block edges; same evolved double-scroll/ribbons/curls identity and correct4-depiction order. Still nonindexed palette and oversized detailed icons; exact40 px icon gap pending audit. |
