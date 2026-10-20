# SPDX-License-Identifier: GPL-3.0
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, final

from nagmon.runtime import active_engine
from tuxemon.event.eventaction import EventAction
from tuxemon.session import Session


def result_word(outcome: Any) -> str:
    """The variable value a script sees for a quiz outcome."""
    if outcome is None:
        return "skip"
    if outcome.quality == "super":
        return "super"
    return "correct" if outcome.correct else "wrong"


@final
@dataclass
class AskQuizAction(EventAction):
    """
    Ask the playing child a question and store the result.

    Script usage:
        .. code-block::

            ask_quiz <subject_or_skill>,<variable>[,context]

    Script parameters:
        subject_or_skill: A subject ("math", "english"...) or a skill id
            (contains a dot, e.g. "math.money.change").
        variable: Gets "super", "correct", "wrong" or "skip".
        context: "quest" (default), "shop", "boss"...
    """

    name = "ask_quiz"
    topic: str
    variable: str
    context: str = "quest"

    def start(self, session: Session) -> None:
        player = session.player
        if active_engine() is None:
            player.game_variables.set(self.variable, "skip")
            self.stop()
            return
        kwargs: dict[str, Any] = {"context": self.context}
        if "." in self.topic:
            kwargs["skill_id"] = self.topic
        else:
            kwargs["subject"] = self.topic

        def on_result(outcome: Any) -> None:
            player.game_variables.set(self.variable, result_word(outcome))

        session.client.push_state(
            "QuizState", on_result=on_result, allow_skip=False, **kwargs
        )

    def update(self, session: Session, dt: float) -> None:
        if "QuizState" not in session.client.active_state_names:
            self.stop()
