# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
import pytest
from pygame.font import Font
from pygame.rect import Rect
from pygame.surface import Surface

from tuxemon.constants.paths import mods_folder
from tuxemon.platform.const.graphics import FONT_COLOR, FONT_SHADOW_COLOR
from tuxemon.scaling import DefaultScaling
from tuxemon.ui import bidi
from tuxemon.ui.bidi import BILINGUAL_LINE_BREAK, VisualStr
from tuxemon.ui.draw import (
    RenderMode,
    TextOverflow,
    _prepare_text_lines_with_direction,
    iter_render_text,
)
from tuxemon.ui.text import MultilineTextRenderer, TextArea, draw_text
from tuxemon.ui.text_alignment import HorizontalAlignment
from tuxemon.ui.text_renderer import TextRenderer

HEBREW_FONT = mods_folder / "tuxemon/font/Rubik-Medium.ttf"


@pytest.fixture
def scaling():
    return DefaultScaling(1)


@pytest.fixture
def font():
    return Font(HEBREW_FONT.as_posix(), 16)


@pytest.fixture
def rtl_locale(monkeypatch):
    monkeypatch.setattr(bidi, "_locale_is_rtl", lambda: True)


@pytest.fixture
def ltr_locale(monkeypatch):
    monkeypatch.setattr(bidi, "_locale_is_rtl", lambda: False)


def _render(text, font, rect, scaling, **kwargs):
    return list(
        iter_render_text(
            text,
            font,
            FONT_COLOR,
            FONT_SHADOW_COLOR,
            rect,
            scaling,
            **kwargs,
        )
    )


def test_wrap_then_reorder_each_line(rtl_locale, font):
    text = "שלום לכם ילדים יקרים מאוד מאוד"
    lines = _prepare_text_lines_with_direction(
        text, font, 120, TextOverflow.CLIP
    )
    assert len(lines) > 1
    joined = " ".join(line for line, _ in lines)
    assert joined == text  # wrapping happens on logical text
    assert all(base_rtl for _, base_rtl in lines)


def test_paragraph_direction_per_paragraph(rtl_locale, font):
    text = f"You got a potion!{BILINGUAL_LINE_BREAK}קיבלת שיקוי!"
    lines = _prepare_text_lines_with_direction(
        text, font, 1000, TextOverflow.CLIP
    )
    assert lines == [
        ("You got a potion!", False),
        ("קיבלת שיקוי!", True),
    ]


def test_typewriter_reveal_is_logical_order(rtl_locale, font, scaling):
    rect = Rect(0, 0, 300, 100)
    chars = _render(
        "אבג", font, rect, scaling, h_alignment=HorizontalAlignment.RIGHT
    )
    assert [c.char for c in chars] == ["א", "ב", "ג"]
    xs = [c.rect.left for c in chars]
    assert xs == sorted(xs, reverse=True)  # first letter is rightmost
    assert chars[0].rect.right <= rect.right
    assert chars[0].rect.right >= rect.right - 3


def test_typewriter_mixed_line(rtl_locale, font, scaling):
    rect = Rect(0, 0, 400, 100)
    chars = _render(
        "יש 12 ab",
        font,
        rect,
        scaling,
        h_alignment=HorizontalAlignment.RIGHT,
    )
    order = [c.char for c in chars]
    # reveal follows the logical (reading) order
    assert order == ["י", "ש", "1", "2", "a", "b"]
    x = {c.char: c.rect.left for c in chars}
    assert x["י"] > x["ש"] > x["2"] > x["1"]  # Hebrew runs right to left
    assert x["a"] < x["b"]  # embedded English runs left to right
    assert x["b"] < x["1"]  # English word is left of the number


def test_mirrored_glyph_in_rtl(rtl_locale, font, scaling):
    rect = Rect(0, 0, 400, 100)
    chars = _render("א (ב)", font, rect, scaling)
    # "(" in logical order is drawn as ")" glyph
    assert [c.char for c in chars] == ["א", ")", "ב", "("]


def test_rtl_lines_right_aligned(rtl_locale, font, scaling):
    rect = Rect(10, 0, 300, 200)
    chars = _render(
        "שלום\nעולם יפה",
        font,
        rect,
        scaling,
        h_alignment=HorizontalAlignment.RIGHT,
    )
    tops = sorted({c.rect.top for c in chars})
    assert len(tops) == 2
    for top in tops:
        right = max(c.rect.right for c in chars if c.rect.top == top)
        assert rect.right - 3 <= right <= rect.right


def test_ellipsis_on_left_for_rtl(rtl_locale, font, scaling):
    rect = Rect(0, 0, 40, 40)
    chars = _render(
        "אבגדהוזחטיכלמנ",
        font,
        rect,
        scaling,
        h_alignment=HorizontalAlignment.RIGHT,
        overflow_behavior=TextOverflow.ELLIPSIS,
    )
    assert chars[-1].char == "…"
    assert chars[-1].rect.left == rect.left
    for c in chars[:-1]:
        assert c.rect.left >= rect.left + font.size("…")[0]
        assert c.rect.right <= rect.right + 2


def test_ltr_unchanged(ltr_locale, font, scaling):
    rect = Rect(0, 0, 300, 100)
    chars = _render("abc", font, rect, scaling)
    assert [c.char for c in chars] == ["a", "b", "c"]
    assert chars[0].rect.left == 0


def test_soft_break_renders_two_lines(ltr_locale, font, scaling):
    rect = Rect(0, 0, 300, 100)
    chars = _render(f"ab{BILINGUAL_LINE_BREAK}cd", font, rect, scaling)
    assert len({c.rect.top for c in chars}) == 2


def test_token_mode_rtl(rtl_locale, font, scaling):
    rect = Rect(0, 0, 300, 100)
    chars = _render(
        "שלום עולם",
        font,
        rect,
        scaling,
        mode=RenderMode.TOKEN,
        h_alignment=HorizontalAlignment.RIGHT,
    )
    assert [c.char for c in chars] == ["םולש", "םלוע"]
    assert chars[0].rect.left > chars[1].rect.left


def test_line_mode_rtl(rtl_locale, font, scaling):
    rect = Rect(0, 0, 300, 100)
    chars = _render(
        "שלום עולם",
        font,
        rect,
        scaling,
        mode=RenderMode.LINE,
        h_alignment=HorizontalAlignment.RIGHT,
    )
    assert [c.char for c in chars] == ["םלוע םולש"]


def test_shadow_text_converts_logical(rtl_locale, font, scaling):
    renderer = TextRenderer(scaling=scaling, font_color=FONT_COLOR, font=font)
    a = renderer.shadow_text("שלום (1)")
    b = renderer.shadow_text(VisualStr(bidi.to_visual("שלום (1)", True)))
    assert a.get_size() == b.get_size()
    assert bytes(a.get_buffer()) == bytes(b.get_buffer())


def test_shadow_text_does_not_reconvert_visual(rtl_locale, font, scaling):
    renderer = TextRenderer(scaling=scaling, font_color=FONT_COLOR, font=font)
    visual = bidi.to_visual("שלום", True)
    a = renderer.shadow_text(visual)
    b = renderer.shadow_text(VisualStr(str(visual)[::-1]))
    assert bytes(a.get_buffer()) != bytes(b.get_buffer())


def test_multiline_renderer_reorders(rtl_locale, font, scaling, monkeypatch):
    renderer = TextRenderer(scaling=scaling, font_color=FONT_COLOR, font=font)
    seen = []
    original = renderer.shadow_text

    def spy(text, *args, **kwargs):
        seen.append(text)
        return original(text, *args, **kwargs)

    monkeypatch.setattr(renderer, "shadow_text", spy)
    MultilineTextRenderer(renderer).render_lines("שלום\nעולם", 300)
    assert seen == ["םולש", "םלוע"]
    assert all(isinstance(s, VisualStr) for s in seen)


def test_draw_text_right_aligns_each_line(rtl_locale, font, scaling):
    surface = Surface((300, 100))
    rect = Rect(0, 0, 300, 100)
    metrics = draw_text(
        surface,
        "שלום\nעולם יפה מאוד",
        rect,
        scaling,
        font=font,
        h_alignment=HorizontalAlignment.RIGHT,
        return_metrics=True,
    )
    assert metrics is not None
    assert metrics["line_rects"]
    for line_rect in metrics["line_rects"]:
        assert line_rect.right == rect.right


def test_textarea_default_alignment_rtl(rtl_locale, font, scaling):
    area = TextArea(font, FONT_COLOR, Rect(0, 0, 100, 30), scaling)
    assert area.h_alignment is HorizontalAlignment.RIGHT


def test_textarea_default_alignment_ltr(ltr_locale, font, scaling):
    area = TextArea(font, FONT_COLOR, Rect(0, 0, 100, 30), scaling)
    assert area.h_alignment is HorizontalAlignment.LEFT


def test_textarea_static_right_aligned(rtl_locale, font, scaling):
    area = TextArea(font, FONT_COLOR, Rect(0, 0, 200, 30), scaling)
    area.animated = False
    area.text = "אב"
    bbox = area.image.get_bounding_rect()
    assert bbox.right >= 195
    assert bbox.left > 100
