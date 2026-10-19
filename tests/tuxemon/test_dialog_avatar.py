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
