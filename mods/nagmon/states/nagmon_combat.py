# SPDX-License-Identifier: GPL-3.0
"""
Battle menu that asks a question before an attack or a capture
(docs/kids/SDD_QUIZ_GAMEPLAY.md §2.2).

Imported as a module so the state loader does not register Tuxemon's
MainCombatMenuState a second time from this file.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING, Any, ClassVar

import tuxemon.states.combat_menus as core_combat
from nagmon.quiz_flow import power_with_combo
from nagmon.runtime import get_runtime

if TYPE_CHECKING:
    from tuxemon.base_client import BaseClient
    from tuxemon.item.item import Item
    from tuxemon.monster.monster import Monster
    from tuxemon.technique.technique import Technique

DEFAULT_QUESTIONS_PER_BATTLE = 5
ASKED_KEY = "nagmon_questions_asked"
CAPTURE_MULT = 1.6
RARE_CATCH_RATE = 50.0
RARE_CHAIN = 3


def quiz_mult_key(monster: Monster) -> str:
    return f"quiz_mult_{monster.instance_id.hex}"


CAPTURE_KEY = "quiz_capture_mult"


class MainCombatMenuState(core_combat.MainCombatMenuState):
    """Tuxemon's battle menu with "knowledge power" questions."""

    name: ClassVar[str] = "MainCombatMenuState"

    def __init__(self, client: BaseClient, **kwargs: Any) -> None:
        super().__init__(client, **kwargs)

    # -------------------------------------------------------- helpers

    def _quiz_allowed(self) -> bool:
        rt = get_runtime()
        if rt is None or rt.engine is None or rt.active is None:
            return False
        limit = int(
            rt.active.settings.get(
                "questions_per_battle", DEFAULT_QUESTIONS_PER_BATTLE
            )
        )
        asked = int(self.combat_session.get_variable(ASKED_KEY) or 0)
        if asked >= limit:
            return False
        self.combat_session.set_variable(ASKED_KEY, asked + 1)
        return True

    def _subject_for(self, technique: Technique) -> str | None:
        """
        The subject of the question before this attack, or None for "any
        subject the child has on": a subject the parent turned off is not
        asked in battle either (SDD_QUIZ_GAMEPLAY §2.2).
        """
        from nagmon.ui.game_helpers import subject_map

        rt = get_runtime()
        override = None
        if rt is not None and rt.active is not None:
            override = rt.active.settings.get("element_subjects")
        types = [t.slug for t in technique.types.current]
        monster = getattr(self.monster, "slug", None)
        subject = subject_map().subject_for(types, override, monster)
        learner = getattr(getattr(rt, "engine", None), "learner", None)
        enabled = getattr(learner, "enabled_subjects", None)
        if enabled and subject not in enabled:
            return None
        return subject

    # -------------------------------------------------------- hooks

    def before_enqueue_technique(
        self,
        technique: Technique,
        target: Monster,
        proceed: Callable[[], None],
    ) -> None:
        monster = self.monster
        if not technique.has_effect("damage") or not self._quiz_allowed():
            # A boost earned for an attack that never happened (e.g. the
            # monster fainted first) is not carried into this one.
            self.combat_session.set_variable(quiz_mult_key(monster), None)
            proceed()
            return

        def done(outcome: Any) -> None:
            mult = 1.0
            if outcome is not None:
                mult = power_with_combo(
                    outcome.power_multiplier, outcome.streak
                )
                if outcome.correct:
                    self.combat_session.set_tech_hit(monster, 0.0)
            self.combat_session.set_variable(quiz_mult_key(monster), mult)
            proceed()

        self.client.push_state(
            "QuizState",
            subject=self._subject_for(technique),
            context="battle",
            on_result=done,
        )

    def before_enqueue_item(
        self, item: Item, target: Monster, proceed: Callable[[], None]
    ) -> None:
        if item.category != "capture" or not self._quiz_allowed():
            proceed()
            return
        chain = RARE_CHAIN if target.catch_rate < RARE_CATCH_RATE else 1
        results: list[bool] = []

        def ask() -> None:
            self.client.push_state(
                "QuizState",
                context="capture",
                on_result=answered,
                allow_skip=True,
            )

        def answered(outcome: Any) -> None:
            results.append(bool(outcome is not None and outcome.correct))
            if outcome is not None and len(results) < chain:
                self.client.queue_command(ask)
                return
            correct = sum(results)
            if chain == 1:
                mult = CAPTURE_MULT if correct else 1.0
            else:
                mult = 1.0 + 0.4 * correct
            self.combat_session.set_variable(CAPTURE_KEY, mult)
            proceed()

        ask()
