# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from types import SimpleNamespace
from unittest.mock import MagicMock

import pygame_menu
import pytest
from pygame.font import Font
from pygame.rect import Rect
from pygame.surface import Surface
from pygame_menu.locals import ALIGN_LEFT, ALIGN_RIGHT

from tuxemon.constants.paths import mods_folder
from tuxemon.locale.locale import T
from tuxemon.menu import theme as theme_module
from tuxemon.menu.cursor import MenuCursorController
from tuxemon.menu.rtl import install_pygame_menu_bidi, start_menu_alignment
from tuxemon.platform.const import buttons
from tuxemon.scaling import DefaultScaling
from tuxemon.sprite import RelativeGroup, Sprite, SpriteGroup, VisualSpriteList
from tuxemon.ui import bidi
from tuxemon.ui.input_display import InputDisplay, InputDisplayConfig

HEBREW_FONT = mods_folder / "tuxemon/font/Rubik-Medium.ttf"


class FakeSprite(Sprite):
    def __init__(self, w=10, h=10):
        super().__init__()
        self.image = Surface((w, h))
        self.rect = self.image.get_rect()
        self.enabled = True


@pytest.fixture
def rtl_locale(monkeypatch):
    monkeypatch.setattr(bidi, "_locale_is_rtl", lambda: True)


@pytest.fixture
def ltr_locale(monkeypatch):
    monkeypatch.setattr(bidi, "_locale_is_rtl", lambda: False)


def _grid(count, columns):
    parent = RelativeGroup(parent=lambda: Rect(0, 0, 300, 300))
    parent.update_rect_from_parent()
    grid = VisualSpriteList(parent=parent)
    grid.columns = columns
    for _ in range(count):
        grid.add(FakeSprite(w=20))
    return grid


def test_menu_alignment(rtl_locale):
    assert start_menu_alignment() == ALIGN_RIGHT


def test_menu_alignment_ltr(ltr_locale):
    assert start_menu_alignment() == ALIGN_LEFT


def test_grid_ltr_unchanged(ltr_locale):
    grid = _grid(4, 2)
    grid.arrange_menu_items()
    lefts = [s.rect.left for s in grid.sprites()]
    assert lefts == [0, 150, 0, 150]


def test_grid_rtl_mirrors_columns(rtl_locale):
    grid = _grid(4, 2)
    grid.arrange_menu_items()
    rights = [s.rect.right for s in grid.sprites()]
    assert rights == [300, 150, 300, 150]


def test_single_column_rtl_right_aligned(rtl_locale):
    grid = _grid(3, 1)
    grid.arrange_menu_items()
    assert all(s.rect.right == 300 for s in grid.sprites())


def test_grid_rtl_left_right_keys_mirrored(rtl_locale):
    grid = _grid(4, 2)
    assert grid._advance_input(0, buttons.LEFT) == 1
    assert grid._advance_input(1, buttons.RIGHT) == 0


def test_grid_ltr_keys(ltr_locale):
    grid = _grid(4, 2)
    assert grid._advance_input(0, buttons.RIGHT) == 1


def _cursor(rtl):
    image = Surface((8, 8))
    image.fill((0, 0, 0))
    image.set_at((0, 0), (255, 0, 0))  # marker on the left edge
    item = SimpleNamespace(rect=Rect(100, 50, 60, 10))
    controller = MenuCursorController(
        cursor_filename="",
        menu_sprites=SpriteGroup(),
        get_selected_item=lambda: item,
        animate=MagicMock(),
        duration=0.1,
        context=MagicMock(),
        remove_animations=MagicMock(),
        cursor_image=image,
        rtl=rtl,
    )
    return controller, item


def test_cursor_left_of_item_ltr():
    controller, item = _cursor(rtl=False)
    controller.trigger_cursor_update(animate=False)
    assert controller.arrow.rect.right == item.rect.left
    assert controller.arrow.image.get_at((0, 0))[:3] == (255, 0, 0)


def test_cursor_right_of_item_rtl():
    controller, item = _cursor(rtl=True)
    controller.trigger_cursor_update(animate=False)
    assert controller.arrow.rect.left == item.rect.right
    # the arrow image is mirrored
    assert controller.arrow.image.get_at((7, 0))[:3] == (255, 0, 0)


def test_cursor_default_follows_locale(rtl_locale):
    image = Surface((8, 8))
    controller = MenuCursorController(
        cursor_filename="",
        menu_sprites=SpriteGroup(),
        get_selected_item=lambda: None,
        animate=MagicMock(),
        duration=0.1,
        context=MagicMock(),
        remove_animations=MagicMock(),
        cursor_image=image,
    )
    assert controller.rtl is True


def _display():
    context = SimpleNamespace(scaling=DefaultScaling(1))
    font = Font(HEBREW_FONT.as_posix(), 12)
    return InputDisplay(
        context,
        font,
        (0, 0, 0),
        "שם:",
        "דני",
        Rect(0, 0, 400, 200),
        InputDisplayConfig(),
    )


def test_input_display_right_anchored(rtl_locale):
    display = _display()
    cfg = InputDisplayConfig()
    assert display.prompt.rect.right == 400 - cfg.prompt_offset_x
    assert display.text_area.rect.right == 400 - cfg.text_area_offset_x
    display.update_char_counter(5)
    assert display.char_counter.rect.right == cfg.char_counter_offset_x


def test_input_display_ltr_unchanged(ltr_locale):
    display = _display()
    cfg = InputDisplayConfig()
    assert display.prompt.rect.left == cfg.prompt_offset_x
    display.update_char_counter(5)
    assert display.char_counter.rect.left == 400 - cfg.char_counter_offset_x


@pytest.fixture
def fresh_theme():
    theme_module.reset_theme_cache()
    yield
    theme_module.reset_theme_cache()


def test_theme_rtl(rtl_locale, fresh_theme):
    theme = theme_module.get_theme(DefaultScaling(1))
    assert theme.widget_alignment == ALIGN_RIGHT
    selection = theme.widget_selection_effect
    top, left, bottom, right = selection.get_margin()
    assert right > 0
    assert left == 0


def test_theme_ltr(ltr_locale, fresh_theme):
    theme = theme_module.get_theme(DefaultScaling(1))
    assert theme.widget_alignment == ALIGN_LEFT


def test_theme_cache_reset_on_language_change(ltr_locale, fresh_theme):
    first = theme_module.get_theme(DefaultScaling(1))
    assert theme_module.get_theme(DefaultScaling(1)) is first
    assert theme_module.reset_theme_cache in T.language_changed_callbacks
    T.invoke_language_changed_callbacks("he_IL")
    assert theme_module.get_theme(DefaultScaling(1)) is not first


def test_menu_font_resolved_at_runtime(monkeypatch):
    from tuxemon.menu import menu as menu_module
    from tuxemon.user_config import CONFIG

    assert menu_module.Menu.font_filename is None
    monkeypatch.setattr(
        CONFIG.config_model.game, "font_file", "Rubik-Medium.ttf"
    )
    assert menu_module.resolve_menu_font(None).endswith("Rubik-Medium.ttf")
    assert menu_module.resolve_menu_font("Pizel.ttf").endswith("Pizel.ttf")


def test_pygame_menu_label_is_visual(ltr_locale):
    install_pygame_menu_bidi()
    install_pygame_menu_bidi()  # idempotent
    menu = pygame_menu.Menu("", 300, 200)
    label = menu.add.label("שלום (1)")
    font = label._font
    rendered = label._font_render_string("שלום (1)", (0, 0, 0))
    expected = font.render(
        "(1) םולש",
        label._font_antialias,
        (0, 0, 0),
        label._font_background_color,
    )
    assert rendered.get_size() == expected.get_size()
    assert bytes(rendered.get_buffer()) == bytes(expected.get_buffer())


def test_pygame_menu_latin_untouched(ltr_locale):
    install_pygame_menu_bidi()
    menu = pygame_menu.Menu("", 300, 200)
    label = menu.add.label("Hello (1)!")
    rendered = label._font_render_string("Hello (1)!", (0, 0, 0))
    expected = label._font.render(
        "Hello (1)!",
        label._font_antialias,
        (0, 0, 0),
        label._font_background_color,
    )
    assert bytes(rendered.get_buffer()) == bytes(expected.get_buffer())
