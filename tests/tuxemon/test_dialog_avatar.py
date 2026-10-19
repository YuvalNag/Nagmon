# SPDX-License-Identifier: GPL-3.0
"""The speaker's portrait on a dialog (docs/kids/SDD_ART.md §2.2)."""

from __future__ import annotations

from types import SimpleNamespace

from tuxemon.state.state import State
from tuxemon.states.dialog_state import DialogState


class CountingAvatar:
    def __init__(self) -> None:
        self.updates = 0

    def update(self, dt: float) -> None:
        self.updates += 1


def test_an_animated_avatar_advances_once_per_update(monkeypatch):
    # The avatar is one of the dialog's sprites (it is drawn with them),
    # so the state's own sprite update is the only one it needs.
    avatar = CountingAvatar()
    sprites = SimpleNamespace(update=lambda dt: avatar.update(dt))
    monkeypatch.setattr(
        State, "update", lambda self, dt: self.sprites.update(dt)
    )
    dialog = DialogState.__new__(DialogState)
    dialog.__dict__.update(
        sprites=sprites,
        avatar=avatar,
        dialog_box=SimpleNamespace(drawing_text=False),
        _timer_active=False,
        close_after=None,
    )
    dialog.update(0.1)
    assert avatar.updates == 1


class Sprites(list):
    def add(self, sprite):
        self.append(sprite)


def test_opening_the_dialog_adds_the_avatar_to_its_sprites(monkeypatch):
    # So the avatar is drawn, and animated by the sprite update.
    import pygame

    from tuxemon.menu.menu import PopUpMenu
    from tuxemon.sprite import Sprite

    monkeypatch.setattr(PopUpMenu, "on_open", lambda self: None)
    avatar = Sprite(image=pygame.Surface((32, 32)))
    dialog = DialogState.__new__(DialogState)
    dialog.__dict__.update(
        sprites=Sprites(),
        avatar=avatar,
        dialog_box=SimpleNamespace(
            rect=None, image=None, _render_background=lambda: None
        ),
        text_queue=[],
        auto_close=True,
    )
    dialog.calc_internal_rect = lambda: pygame.Rect(10, 50, 100, 20)
    dialog.calc_final_rect = lambda: pygame.Rect(0, 40, 120, 40)
    dialog.next_text = lambda: None
    dialog.on_open()
    dialog.on_open()  # opening again does not add it twice
    assert dialog.sprites.count(avatar) == 1
    assert avatar.rect.bottom == 40  # standing on the box
