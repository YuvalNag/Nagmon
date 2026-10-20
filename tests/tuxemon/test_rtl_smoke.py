# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
"""Headless smoke test: a DialogState renders Hebrew text."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pygame
import pytest
from pygame.rect import Rect
from pygame.surface import Surface

from tuxemon.menu.alert import AlertManager
from tuxemon.scaling import DefaultScaling
from tuxemon.states.dialog_state import DialogState
from tuxemon.ui import bidi
from tuxemon.ui.bidi import BILINGUAL_LINE_BREAK
from tuxemon.ui.text_alignment import HorizontalAlignment
from tuxemon.user_config import CONFIG


@pytest.fixture
def rtl_locale(monkeypatch):
    monkeypatch.setattr(bidi, "_locale_is_rtl", lambda: True)
    monkeypatch.setattr(
        CONFIG.config_model.game, "font_file", "Rubik-Medium.ttf"
    )


def make_client():
    screen = pygame.display.get_surface() or pygame.display.set_mode(
        (640, 360)
    )
    context = SimpleNamespace(
        screen=screen,
        rect=screen.get_rect(),
        resolution=screen.get_size(),
        tile_size=(16, 16),
        scale=1,
        scaling=DefaultScaling(1),
    )
    client = MagicMock()
    client.context = context
    client.config.dialog_speed = "max"
    client.config.large_gui = False
    client.alert_manager = AlertManager(MagicMock())
    return client


@pytest.mark.parametrize(
    "text",
    [
        pytest.param("שלום! יש לך 3 שיקויים (Potions) בתיק.", id="hebrew"),
        pytest.param(
            f"You got a Potion!{BILINGUAL_LINE_BREAK}קיבלת שיקוי!",
            id="bilingual",
        ),
    ],
)
def test_dialog_state_renders_hebrew(rtl_locale, text):
    client = make_client()
    rect = Rect(0, 0, 600, 100)
    state = DialogState(client, rect, text=[text])
    assert state.dialog_box.h_alignment is HorizontalAlignment.RIGHT
    state.on_open()
    for _ in range(5):
        state.update(0.1)
    surface = Surface(client.context.resolution)
    state.draw(surface)
    image = state.dialog_box.image
    assert image.get_bounding_rect().width > 0
    # text hugs the right edge of the box
    bbox = image.get_bounding_rect()
    assert bbox.right >= image.get_width() - 4
