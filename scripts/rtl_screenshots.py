#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
"""
Render the WP3 right-to-left screenshots headlessly (SDL dummy driver).

    HOME=/tmp/some-scratch-home python scripts/rtl_screenshots.py

Writes docs/kids/img/rtl_dialog.png, rtl_menu.png and rtl_bilingual.png.

The he_IL catalogue is only a skeleton until WP4 translates it, so the menu
labels and the Hebrew half of the bilingual message are DEMO strings
injected in this process only (see DEMO_HEBREW); nothing is written to the
.po files. The user config is not saved either.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "docs/kids/img"

DEMO_HEBREW = {
    "menu_new_game": "משחק חדש",
    "menu_load": "טעינה",
    "menu_autosave": "שמירה אוטומטית",
    "menu_battle": "קרב",
    "menu_minigame": "משחקון",
    "menu_options": "הגדרות",
    "exit": "יציאה",
    "gotfivetuxeballs": "קיבלת 5 כדורי טוקסבול!",
}


def switch_to_hebrew() -> None:
    """Activate he_IL without saving the user's config file."""
    from tuxemon.config import LOCALE_FONT_MAP
    from tuxemon.locale.locale import T
    from tuxemon.user_config import CONFIG

    game = CONFIG.config_model.game
    game.locale = "he_IL"
    game.font_file, game.thin_font_file, game.minimal_font_file = (
        LOCALE_FONT_MAP["he_IL"]
    )
    game.language_font = game.font_file
    CONFIG.config_model.gameplay.dialog_speed = "max"
    for domain in list(T._translators):
        T.load_translator_for_domain(domain, "he_IL")
    T.invoke_language_changed_callbacks("he_IL")

    real_translate = T.translate
    real_lookup = T.lookup_in

    def translate(message: str, domain: str | None = None) -> str:
        return DEMO_HEBREW.get(message) or real_translate(message, domain)

    def lookup_in(
        msgid: str, locale_name: str, domain: str | None = None
    ) -> str | None:
        if locale_name == "he_IL" and msgid in DEMO_HEBREW:
            return DEMO_HEBREW[msgid]
        return real_lookup(msgid, locale_name, domain)

    T.translate = translate  # type: ignore[method-assign]
    T.lookup_in = lookup_in  # type: ignore[method-assign]


def settle(client, frames: int = 30) -> None:
    for _ in range(frames):
        client.update(1 / 30)


def snapshot(client, name: str) -> None:
    import pygame

    client.screen.fill((0, 0, 0))
    client.state_drawer.draw()
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    pygame.image.save(client.screen, path.as_posix())
    print(f"saved {path.relative_to(ROOT)}")


def clear(client) -> None:
    while client.active_states:
        client.pop_state()


def main() -> None:
    from tuxemon.platform import platform

    platform.init()

    from tuxemon.client import LocalPygameClient
    from tuxemon.locale.bilingual import set_ladder_provider
    from tuxemon.locale.locale import T
    from tuxemon.prepare import pygame_init
    from tuxemon.session import local_session
    from tuxemon.tools import open_dialog
    from tuxemon.ui.text_formatter import TextFormatter
    from tuxemon.user_config import CONFIG

    context = pygame_init()
    # after pygame_init: core_init reloads the translators
    switch_to_hebrew()
    client = LocalPygameClient.create(CONFIG, context)
    local_session.set_client(client)

    # 1. Hebrew dialog (mixed Hebrew, numbers, English and brackets)
    client.push_state("BackgroundState")
    open_dialog(
        client,
        [
            "שלום! יש לך 3 שיקויים (Potions) בתיק, ו־120 ₪ בארנק. "
            "בוא נצא להרפתקה עם Rockitten!"
        ],
        dialog_speed="max",
    )
    settle(client)
    snapshot(client, "rtl_dialog.png")
    clear(client)

    # 2. Hebrew menu (pygame_menu: right aligned, arrow on the right)
    client.push_state("BackgroundState")
    client.push_state("StartState")
    settle(client)
    snapshot(client, "rtl_menu.png")
    clear(client)

    # 3. Level-3 bilingual dialog: English line, Hebrew line, one page
    # (no save game is loaded, so the formatter gets a stand-in session)
    set_ladder_provider(lambda: (3, {}))
    session = MagicMock()
    session.player.monsters = []
    session.player.game_variables = {}
    session.client.config.unit_measure = "metric"
    pages = TextFormatter(session, T).paginate_translation("gotfivetuxeballs")
    client.push_state("BackgroundState")
    open_dialog(client, pages, dialog_speed="max")
    settle(client)
    snapshot(client, "rtl_bilingual.png")
    clear(client)


if __name__ == "__main__":
    main()
