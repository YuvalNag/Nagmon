# SPDX-License-Identifier: GPL-3.0
"""How large the app shows its pictures: the one source of truth.

The build writes this as ``db/display.json``. The renderer reads it
(``app/src/game/display.ts``) and so does the check that no shipped
picture is shown above twice its pixels (``tests/app/test_app_hd.py``,
docs/app/SDD.md §10). Sizes are device pixels for one pixel of 1x art
(a 16 px Tuxemon tile, a 64 px monster frame).

The layout, on any screen:

* map: a fixed scale; a larger screen shows more of the map;
* battle: monsters, islands, HUD and animations share one scale, the
  smaller of ``battle.max_scale`` and the screen height over
  ``battle.stage_height``; the stage is centred;
* battle background: covers the screen (the larger of width and height
  over the picture's), so on a tall tablet it is enlarged the most;
* icons: ``icon_dp`` density-independent px; who-plays card picture:
  ``card_vh`` of the screen height.

The targets are phones in landscape; the tablet row says what a larger
screen does, and only the background may pass 2x there.
"""

from __future__ import annotations

from typing import Any

#: No picture is shown at more than this many times its pixels.
MAX_ENLARGEMENT = 2.0

DISPLAY: dict[str, Any] = {
    "max_enlargement": MAX_ENLARGEMENT,
    "targets": {
        # the family's phone: 2400x1080 at 2.75 px per CSS px
        "phone": {"screen": [2400, 1080], "dpr": 2.75, "required": True},
        # a 10" tablet in landscape: what a larger screen does
        "tablet": {
            "screen": [2560, 1600],
            "dpr": 2.0,
            "required": False,
            # the background covers a taller screen; the who-plays card
            # is 26vh (styles.css), 416 px for a 190 px hero
            "may_exceed": ["battle background", "who-plays card"],
        },
    },
    # 6: a 64 px monster frame is 384 device px (the Nagmon monsters are
    # drawn at ~190 px, 3x sheets: 2 x 3 is the most the rule allows);
    # 180 1x px of stage height fill the phone's 1080 px.
    "battle": {"max_scale": 6, "stage_height": 180},
    # a 16 px tile is 112 device px (the old game's phone scale)
    "map": {"scale": 7},
    "icon_dp": 48,
    "card_vh": 0.26,
}


def battle_scale(doc: dict[str, Any], screen_height: float) -> float:
    """Device px per 1x px in battle (``battleScale`` in display.ts)."""
    b = doc["battle"]
    return min(b["max_scale"], screen_height / b["stage_height"])


def background_scale(image: tuple[int, int], screen: tuple[int, int]) -> float:
    """
    Device px per picture px of a background that covers the screen
    (``backgroundScale`` in display.ts).
    """
    return max(screen[0] / image[0], screen[1] / image[1])


def build(out: Any) -> dict[str, Any]:
    out.add_json("db/display.json", DISPLAY)
    return {"targets": sorted(DISPLAY["targets"])}
