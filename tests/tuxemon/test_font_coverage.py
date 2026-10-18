# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
import pygame.freetype
import pytest

from tuxemon.config import LOCALE_FONT_MAP, TuxemonConfig
from tuxemon.constants.paths import mods_folder

FONT_DIR = mods_folder / "tuxemon/font"

HEBREW_LETTERS = "".join(chr(c) for c in range(0x05D0, 0x05EB))
FINAL_FORMS = "ךםןףץ"
LATIN = "".join(chr(c) for c in range(0x20, 0x7F))
EXTRA = "₪…·→←×״׳"


@pytest.fixture(scope="module")
def ft():
    pygame.freetype.init()
    yield pygame.freetype
    pygame.freetype.quit()


def missing_glyphs(ft, font_name: str, text: str) -> list[str]:
    font = ft.Font((FONT_DIR / font_name).as_posix(), 16)
    metrics = font.get_metrics(text)
    return [hex(ord(ch)) for ch, m in zip(text, metrics) if m is None]


def test_missing_glyph_detection_works(ft):
    # sanity: the default pixel font has no Hebrew
    assert missing_glyphs(ft, "PressStart2P.ttf", "א")


@pytest.mark.parametrize(
    "text",
    [
        pytest.param(HEBREW_LETTERS, id="hebrew_block"),
        pytest.param(FINAL_FORMS, id="final_forms"),
        pytest.param(LATIN, id="latin_digits"),
        pytest.param(EXTRA, id="shekel_and_symbols"),
    ],
)
def test_hebrew_font_coverage(ft, text):
    for font_name in set(LOCALE_FONT_MAP["he_IL"]):
        assert missing_glyphs(ft, font_name, text) == []


def test_hebrew_font_files_exist_with_license():
    for font_name in LOCALE_FONT_MAP["he_IL"]:
        assert (FONT_DIR / font_name).is_file()
    license_text = (FONT_DIR / "Rubik-OFL.txt").read_text(encoding="utf-8")
    assert "SIL Open Font License" in license_text


def test_font_map_covers_minimal_font():
    for value in LOCALE_FONT_MAP.values():
        assert len(value) == 3
        for font_name in value:
            assert (FONT_DIR / font_name).is_file()
    assert LOCALE_FONT_MAP["default"][2] == "Minimal3x5.ttf"


def test_update_locale_sets_all_fonts(tmp_path):
    cfg = TuxemonConfig(tmp_path / "tuxemon.yaml")
    cfg.update_locale("he_IL")
    game = cfg.config_model.game
    assert game.font_file == "Rubik-Medium.ttf"
    assert game.thin_font_file == "Rubik-Medium.ttf"
    assert game.minimal_font_file == "Rubik-Medium.ttf"
    cfg.update_locale("en_US")
    assert game.font_file == "PressStart2P.ttf"
    assert game.thin_font_file == "Pizel.ttf"
    assert game.minimal_font_file == "Minimal3x5.ttf"
