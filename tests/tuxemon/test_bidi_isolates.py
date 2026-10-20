# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
"""I13 (SDD_LEARNING section 16): math isolates U+2066/U+2069.

The learning generators wrap expressions as LRI ... PDI. The pure-Python
bidi algorithm does not know isolates and the Rubik font has no glyph for
them, so they must be handled before drawing.
"""

import pytest
from pygame.font import Font
from pygame.rect import Rect

from tuxemon.constants.paths import mods_folder
from tuxemon.platform.const.graphics import FONT_COLOR, FONT_SHADOW_COLOR
from tuxemon.scaling import DefaultScaling
from tuxemon.ui import bidi
from tuxemon.ui.bidi import (
    ensure_visual,
    reorder,
    strip_bidi_controls,
    to_visual,
)
from tuxemon.ui.draw import RenderMode, iter_render_text
from tuxemon.ui.text_renderer import TextRenderer

LRI, RLI, FSI, PDI = "⁦", "⁧", "⁨", "⁩"
CONTROLS = set("‎‏‪‫‬‭‮⁦⁧⁨⁩؜")
HEBREW_FONT = mods_folder / "tuxemon/font/Rubik-Medium.ttf"
MATH_HE = f"כמה זה {LRI}12 - 5{PDI} ?"
PLAIN_HE = "כמה זה 12 - 5 ?"


@pytest.fixture
def rtl_locale(monkeypatch):
    monkeypatch.setattr(bidi, "_locale_is_rtl", lambda: True)


@pytest.fixture
def font():
    return Font(HEBREW_FONT.as_posix(), 16)


def test_strip_bidi_controls():
    assert strip_bidi_controls(f"{LRI}3 + 4{PDI}") == "3 + 4"
    assert strip_bidi_controls("abc") == "abc"
    assert strip_bidi_controls("‏א‪ב‬") == "אב"


def test_isolates_do_not_crash_and_are_removed():
    visual, mapping = reorder(MATH_HE, True)
    assert not CONTROLS & set(visual)
    # the expression keeps its left-to-right order inside the RTL line
    assert visual == "? 12 - 5 הז המכ"
    assert len(mapping) == len(visual)
    for v_index, l_index in enumerate(mapping):
        assert MATH_HE[l_index] == visual[v_index] or visual[v_index] in "()"


def test_isolated_negative_number_stays_together():
    visual = to_visual(f"התוצאה היא {LRI}-3{PDI}", True)
    assert "-3" in visual
    assert not CONTROLS & set(visual)


@pytest.mark.parametrize(
    "opener",
    [
        pytest.param(LRI, id="lri"),
        pytest.param(RLI, id="rli"),
        pytest.param(FSI, id="fsi"),
    ],
)
def test_all_isolate_kinds(opener):
    visual = to_visual(f"א {opener}1 + 2{PDI} ב", True)
    assert not CONTROLS & set(visual)


def test_ltr_only_line_is_stripped():
    assert to_visual(f"{LRI}12 - 5{PDI} = ?", False) == "12 - 5 = ?"
    visual, mapping = reorder(f"{LRI}7{PDI}", False)
    assert visual == "7" and mapping == (1,)
    assert ensure_visual(f"{LRI}3 + 4{PDI}") == "3 + 4"
    assert ensure_visual(MATH_HE) == "? 12 - 5 הז המכ"


def test_font_has_no_glyph_for_isolates(font):
    """Why we strip: rendering the marks alone fails / draws tofu."""
    with pytest.raises(Exception):
        font.render(LRI, True, (255, 255, 255))


@pytest.mark.parametrize(
    "mode",
    [
        pytest.param(RenderMode.CHARACTER, id="character"),
        pytest.param(RenderMode.TOKEN, id="token"),
        pytest.param(RenderMode.LINE, id="line"),
    ],
)
def test_render_without_tofu(rtl_locale, font, mode):
    scaling = DefaultScaling(1)
    rect = Rect(0, 0, 400, 100)

    def render(text):
        return list(
            iter_render_text(
                text,
                font,
                FONT_COLOR,
                FONT_SHADOW_COLOR,
                rect,
                scaling,
                mode=mode,
            )
        )

    with_marks = render(MATH_HE)
    without = render(PLAIN_HE)
    assert not any(CONTROLS & set(c.char) for c in with_marks)

    def width(chars):
        return max(c.rect.right for c in chars) - min(
            c.rect.left for c in chars
        )

    assert width(with_marks) == width(without)


def test_render_ltr_line_without_tofu(font):
    scaling = DefaultScaling(1)
    rect = Rect(0, 0, 400, 100)
    chars = list(
        iter_render_text(
            f"{LRI}12 - 5{PDI} = ?",
            font,
            FONT_COLOR,
            FONT_SHADOW_COLOR,
            rect,
            scaling,
        )
    )
    assert "".join(c.char for c in chars).replace(" ", "") == "12-5=?"


def test_shadow_text_width_matches(font):
    renderer = TextRenderer(
        scaling=DefaultScaling(1),
        font_color=FONT_COLOR,
        font_shadow_color=FONT_SHADOW_COLOR,
        font=font,
    )
    a = renderer.shadow_text(f"{LRI}3 + 4{PDI}")
    b = renderer.shadow_text("3 + 4")
    assert a.get_size() == b.get_size()
