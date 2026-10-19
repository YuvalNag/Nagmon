# SPDX-License-Identifier: GPL-3.0
"""
"Ask the wise owl" (docs/kids/SDD_AI.md): ready questions for everyone,
free text from the age the parent chose. Parents can read every chat.
"""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING, Any, ClassVar

import pygame
from pygame_menu.locals import ALIGN_CENTER, POSITION_EAST
from pygame_menu.menu import Menu

from nagmon import mod_dir
from nagmon.ai.owl import OWL_NOTICE_HE
from nagmon.owl_service import build_owl, load_ai_settings
from nagmon.runtime import age_from_profile, get_runtime
from tuxemon.locale.locale import T
from tuxemon.menu.menu import PygameMenuState
from tuxemon.platform.const.graphics import BG_MINIGAME

if TYPE_CHECKING:
    from tuxemon.base_client import BaseClient

logger = logging.getLogger(__name__)

MAX_READY_QUESTIONS = 6

#: The owner's owl, HD (docs/kids/SDD_ART.md §2.2).
OWL_PORTRAIT = mod_dir() / "gfx" / "owl" / "owl_portrait.png"


def owl_portrait(screen_height: int) -> pygame.Surface | None:
    """The portrait, smoothly scaled to a fifth of the screen's height."""
    try:
        image = pygame.image.load(str(OWL_PORTRAIT))
    except (OSError, pygame.error):
        logger.warning("No owl portrait at %s", OWL_PORTRAIT)
        return None
    height = max(1, screen_height // 5)
    width = round(image.get_width() * height / image.get_height())
    if image.get_bitsize() < 24:
        return pygame.transform.scale(image, (width, height))
    return pygame.transform.smoothscale(image, (width, height))


class OwlState(PygameMenuState):
    """The child asks, the owl answers in short, simple Hebrew."""

    name: ClassVar[str] = "OwlState"

    def __init__(self, client: BaseClient, **kwargs: Any) -> None:
        width, height = client.context.resolution
        super().__init__(client=client, height=height, width=width, **kwargs)
        theme = self._setup_theme(BG_MINIGAME)
        theme.scrollarea_position = POSITION_EAST
        theme.widget_alignment = ALIGN_CENTER
        self._menu_config["theme"] = theme

        rt = get_runtime()
        assert rt is not None and rt.active is not None
        self.pid = rt.active.id
        self.age = age_from_profile(rt.active, rt.clock())
        self.settings = load_ai_settings(rt.root)
        self.owl = build_owl(rt.root, self.pid, settings=self.settings)
        self.question = ""
        self.answer: Any = None
        self.thinking = False
        self._result: list[Any] = []
        self.show()

    def show(self) -> None:
        self._menu = None
        menu = self.menu
        portrait = owl_portrait(self.client.context.resolution[1])
        if portrait is not None:
            menu.add.surface(portrait, surface_id="owl_portrait")
        menu.add.label(
            T.translate("nagmon_owl_title"), font_size=self.font_type.big
        )
        menu.add.label(
            OWL_NOTICE_HE,
            font_size=self.font_type.small,
            max_char=-1,
            wordwrap=True,
        )
        if self.thinking:
            menu.add.label(
                T.translate("nagmon_owl_thinking"),
                font_size=self.font_type.medium,
            )
        elif self.answer is not None:
            self._add_answer(menu)
        else:
            self._add_questions(menu)
        menu.add.button(
            T.translate("nagmon_back"),
            lambda: self.client.pop_state(self),
            font_size=self.font_type.medium,
            button_id="owl_back",
        )
        self._set_open()

    def _add_questions(self, menu: Menu) -> None:
        for i, text in enumerate(
            self.owl.menu(self.age)[:MAX_READY_QUESTIONS]
        ):
            menu.add.button(
                text,
                lambda t=text: self.ask(t),
                font_size=self.font_type.small,
                button_id=f"owl_q{i}",
            )
        if self.age >= self.settings.free_text_min_age:
            menu.add.button(
                T.translate("nagmon_owl_my_question"),
                self.ask_free_text,
                font_size=self.font_type.medium,
                button_id="owl_free",
            )

    def _add_answer(self, menu: Menu) -> None:
        menu.add.label(
            self.question,
            font_size=self.font_type.medium,
            max_char=-1,
            wordwrap=True,
        )
        menu.add.label(
            self.answer.text_he,
            font_size=self.font_type.medium,
            max_char=-1,
            wordwrap=True,
            label_id="owl_answer",
        )
        menu.add.button(
            T.translate("nagmon_owl_another"),
            self.reset,
            font_size=self.font_type.medium,
            button_id="owl_again",
        )

    def ask_free_text(self) -> None:
        from nagmon.ui.game_helpers import ask_text

        ask_text(
            self.client,
            T.translate("nagmon_owl_my_question"),
            lambda text: self.ask(text) if text.strip() else None,
            char_limit=120,
        )

    def ask(self, text: str) -> None:
        self.question = text
        self.thinking = True
        self._result = []

        def work() -> None:
            try:
                self._result.append(
                    self.owl.ask(self.age, text, profile_id=self.pid)
                )
            except Exception:
                logger.exception("Owl failed")
                self._result.append(None)

        threading.Thread(target=work, daemon=True).start()
        self.show()

    def reset(self) -> None:
        self.answer = None
        self.show()

    def update(self, dt: float) -> None:
        super().update(dt)
        if self.thinking and self._result:
            answer = self._result[0]
            self.thinking = False
            self.answer = answer or _Fallback()
            self.show()
            self._read_aloud(self.answer.text_he)

    def _read_aloud(self, text: str) -> None:
        from nagmon.ui.game_helpers import speech

        tts = speech()
        if tts is not None:
            try:
                tts.speak(text, "he")
            except Exception:
                logger.exception("Could not read the owl's answer")


class _Fallback:
    text_he = "הינשוף עייף עכשיו. אפשר לנסות שוב מאוחר יותר."
