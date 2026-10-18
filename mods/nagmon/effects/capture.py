# SPDX-License-Identifier: GPL-3.0
"""
Capture with "knowledge seals": correct answers before throwing raise the
capture chance (docs/kids/SDD_QUIZ_GAMEPLAY.md §2.3).

Imported as a module so the effect loader does not pick up Tuxemon's
CaptureEffect from this file as well.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import tuxemon.core.effects.capture as core_capture
from tuxemon import formula
from tuxemon.core.core_effect import ItemEffectResult

if TYPE_CHECKING:
    from tuxemon.item.item import Item
    from tuxemon.monster.monster import Monster
    from tuxemon.session import Session

CAPTURE_KEY = "quiz_capture_mult"


@dataclass
class KnowledgeCaptureEffect(core_capture.CaptureEffect):
    """Tuxemon's capture, with the quiz multiplier on the device bonus."""

    name = "capture"

    def apply_item_target(
        self, session: Session, item: Item, target: Monster
    ) -> ItemEffectResult:
        self.session = session
        self.client = session.client
        combat = session.client.combat_session
        quiz = float(combat.get_variable(CAPTURE_KEY) or 1.0)
        combat.set_variable(CAPTURE_KEY, None)

        status_modifier = formula.calculate_status_modifier(item, target)
        tuxeball_modifier = formula.calculate_capdev_modifier(
            item, target, session.player
        )
        shake_check = formula.shake_check(
            target, status_modifier, tuxeball_modifier * quiz
        )
        capture, shakes = formula.capture(shake_check)
        extras = ["quiz_capture_boost"] if quiz > 1.0 else []

        if not capture:
            self._handle_capture_failure(item, target)
            return ItemEffectResult(
                name=item.name, num_shakes=shakes, extras=extras
            )

        self._apply_capture_effects(item, target)
        return ItemEffectResult(
            name=item.name, success=True, num_shakes=shakes, extras=extras
        )
