# SPDX-License-Identifier: GPL-3.0
"""
The question screen (docs/kids/SDD_QUIZ_GAMEPLAY.md §2.4).

Shows one question from the playing child's learning engine, takes the
answer (buttons, number pad, ordering or letter tiles), then shows
feedback: right or not, the correct answer and a worked step. The caller
gets the engine's AnswerOutcome, or None when the child skipped.
"""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable, Sequence
from typing import TYPE_CHECKING, Any, ClassVar

from pygame_menu.locals import ALIGN_CENTER, POSITION_EAST
from pygame_menu.menu import Menu

from nagmon.learning.model import CHOICE_KINDS, Question
from nagmon.quiz_flow import LetterTiles, NumberPad, OrderPicker
from nagmon.runtime import get_runtime
from nagmon.ui import game_helpers
from nagmon.ui.game_helpers import emoji_loader, speech, subject_map
from tuxemon.constants.asset_loader import fetch_asset
from tuxemon.locale.locale import T
from tuxemon.menu.menu import PygameMenuState
from tuxemon.platform.const import events
from tuxemon.platform.const.graphics import BG_MINIGAME
from tuxemon.session import local_session
from tuxemon.tools import fix_measure

if TYPE_CHECKING:
    from tuxemon.base_client import BaseClient
    from tuxemon.platform.events import PlayerInput

logger = logging.getLogger(__name__)

OnResult = Callable[[Any], None]


def _choice_label(choice: Any, english_first: bool) -> str:
    if english_first and choice.text_en:
        return choice.text_en
    return choice.text_he or choice.text_en or ""


class QuizState(PygameMenuState):
    """One question, then feedback."""

    name: ClassVar[str] = "QuizState"

    def __init__(
        self,
        client: BaseClient,
        question: Question | None = None,
        subject: str | None = None,
        skill_id: str | None = None,
        skill_ids: Sequence[str] | None = None,
        context: str = "battle",
        on_result: OnResult | None = None,
        allow_skip: bool | None = None,
        **kwargs: Any,
    ) -> None:
        width, height = client.context.resolution
        super().__init__(client=client, height=height, width=width, **kwargs)
        theme = self._setup_theme(BG_MINIGAME)
        theme.scrollarea_position = POSITION_EAST
        theme.widget_alignment = ALIGN_CENTER
        self._menu_config["theme"] = theme
        self.escape_key_exits = False

        rt = get_runtime()
        self.engine = rt.engine if rt is not None else None
        self.context = context
        self.on_result = on_result
        self.allow_skip = (
            allow_skip if allow_skip is not None else context == "battle"
        )
        if question is None and self.engine is not None:
            question = self._next_question(
                subject, skill_id, skill_ids, context
            )
        self.question = question
        self.started = time.monotonic()
        self.hint_used = False
        self.hint_text = ""
        self.hidden: set[str] = set()
        self.example_seen = not bool(
            question is not None and question.meta.get("worked_example")
        )
        self.outcome: Any = None
        self.pad = NumberPad(max_len=10)
        self.order = (
            OrderPicker([c.id for c in question.choices])
            if (question is not None)
            else OrderPicker([])
        )
        self.tiles = LetterTiles(self._letters())
        self.show_view()
        if question is not None and self._auto_read():
            self.speak()

    # ------------------------------------------------------------ setup

    def _next_question(
        self,
        subject: str | None,
        skill_id: str | None,
        skill_ids: Sequence[str] | None,
        context: str,
    ) -> Question | None:
        """
        A question from the engine, or None (the screen then just lets
        the child continue). A typo in a map script's skill id or a
        broken generator must not crash the game.
        """
        assert self.engine is not None
        try:
            return self.engine.next_question(
                subject=subject,
                skill_id=skill_id,
                skill_ids=skill_ids,
                context=context,
                max_choices=self._max_choices(),
            )
        except Exception:
            logger.exception(
                "No question for subject=%s skill=%s", subject, skill_id
            )
            return None

    def _max_choices(self) -> int | None:
        rt = get_runtime()
        if rt is None or rt.active is None:
            return None
        learning = rt.active.settings.get("learning") or {}
        return learning.get("max_choices")

    def _auto_read(self) -> bool:
        rt = get_runtime()
        if rt is None or rt.active is None:
            return False
        tts = rt.active.settings.get("tts") or {}
        return bool(tts.get("auto_read_questions"))

    def _letters(self) -> list[str]:
        q = self.question
        if q is None or q.kind != "letters":
            return []
        letters = list(q.meta.get("letters") or str(q.answer))
        if not q.meta.get("letters"):
            random.Random(q.item_id).shuffle(letters)
        return letters

    def _ladder_level(self) -> int:
        rt = get_runtime()
        return rt.ladder()[0] if rt is not None else 0

    # ------------------------------------------------------------ views

    def show_view(self) -> None:
        self._menu = None
        menu = self.menu
        if self.question is None:
            menu.add.label(T.translate("nagmon_quiz_no_question"))
            menu.add.button(T.translate("nagmon_continue"), self.skip)
        elif self.outcome is not None:
            self._add_feedback(menu)
        elif not self.example_seen:
            self._add_worked_example(menu)
        else:
            self._add_question(menu)
        self._set_open()

    def _add_title(self, menu: Menu) -> None:
        q = self.question
        assert q is not None
        smap = subject_map()
        menu.add.label(
            smap.title(q.subject),
            font_size=self.font_type.medium,
            font_color=smap.color(q.subject),
            label_id="subject",
        )

    def _add_worked_example(self, menu: Menu) -> None:
        q = self.question
        assert q is not None
        self._add_title(menu)
        menu.add.label(
            T.translate("nagmon_owl_shows"),
            font_size=self.font_type.medium,
        )
        self._add_prompt(menu)
        menu.add.label(
            q.explanation_he,
            font_size=self.font_type.small,
            max_char=-1,
            wordwrap=True,
            label_id="example",
        )
        menu.add.button(
            T.translate("nagmon_lets_try"),
            self._example_done,
            font_size=self.font_type.medium,
            button_id="example_done",
        )

    def _example_done(self) -> None:
        self.example_seen = True
        self.started = time.monotonic()
        self.show_view()

    def _add_prompt(self, menu: Menu) -> None:
        q = self.question
        assert q is not None
        passage = q.meta.get("passage_en") or q.meta.get("passage_he")
        if passage:
            menu.add.label(
                passage,
                font_size=self.font_type.small,
                max_char=-1,
                wordwrap=True,
                label_id="passage",
            )
        menu.add.label(
            q.prompt_he,
            font_size=self.font_type.big,
            max_char=-1,
            wordwrap=True,
            label_id="prompt_he",
        )
        if q.prompt_en and (
            q.subject == "english" or self._ladder_level() >= 3
        ):
            menu.add.label(
                q.prompt_en,
                font_size=self.font_type.medium,
                max_char=-1,
                wordwrap=True,
                label_id="prompt_en",
            )
        if q.figure is not None:
            self._add_figure(menu)

    def _add_figure(self, menu: Menu) -> None:
        from nagmon.ui.figures import render_figure

        q = self.question
        assert q is not None and q.figure is not None
        size = (
            int(self.client.context.resolution[0] * 0.45),
            int(self.client.context.resolution[1] * 0.32),
        )
        try:
            font = fetch_asset("font", self.client.config.locale.font_file)
        except OSError:
            font = None
        surface = render_figure(
            q.figure.kind,
            q.figure.data,
            size,
            font_path=font,
            emoji_loader=emoji_loader(),
        )
        menu.add.surface(surface, surface_id="figure")

    def _add_question(self, menu: Menu) -> None:
        q = self.question
        assert q is not None
        self._add_title(menu)
        self._add_prompt(menu)
        if self.hint_text:
            menu.add.label(
                self.hint_text,
                font_size=self.font_type.small,
                max_char=-1,
                wordwrap=True,
                label_id="hint",
            )
        if q.kind in CHOICE_KINDS:
            self._add_choices(menu)
        elif q.kind == "number":
            self._add_number_pad(menu)
        elif q.kind == "order":
            self._add_order(menu)
        elif q.kind == "letters":
            self._add_letters(menu)
        else:
            self._add_choices(menu)
        self._add_footer(menu)

    def _row(self, menu: Menu, key: str) -> Any:
        frame = menu.add.frame_h(
            width=fix_measure(menu._width, 0.95),
            height=fix_measure(menu._height, 0.1),
            frame_id=key,
            align=ALIGN_CENTER,
        )
        frame._relax = True
        return frame

    def _add_choices(self, menu: Menu) -> None:
        q = self.question
        assert q is not None
        english_first = q.subject == "english"
        visible = [c for c in q.choices if c.id not in self.hidden]
        with_images = any(c.image for c in visible)
        row = self._row(menu, "choices")
        numbered = list(enumerate(visible, start=1))
        if T.is_rtl():
            # Rows fill left to right; in Hebrew choice 1 belongs on the right.
            numbered.reverse()
        for n, choice in numbered:
            label = _choice_label(choice, english_first) or str(n)
            if with_images:
                image = self._emoji_surface(choice.image, 72)
                card = menu.add.frame_v(
                    fix_measure(menu._width, 0.2),
                    fix_measure(menu._height, 0.22),
                    frame_id=f"card_{choice.id}",
                )
                card._relax = True
                if image is not None:
                    card.pack(menu.add.surface(image))
                card.pack(
                    menu.add.button(
                        label,
                        lambda c=choice.id: self.answer(c),
                        font_size=self.font_type.medium,
                        button_id=f"choice_{choice.id}",
                    ),
                    align=ALIGN_CENTER,
                )
                row.pack(card, align=ALIGN_CENTER)
            else:
                row.pack(
                    menu.add.button(
                        f"{n}. {label}" if len(visible) > 2 else label,
                        lambda c=choice.id: self.answer(c),
                        font_size=self.font_type.medium,
                        button_id=f"choice_{choice.id}",
                    ),
                    align=ALIGN_CENTER,
                )

    def _emoji_surface(self, code: str | None, size: int) -> Any:
        if not code:
            return None
        try:
            return emoji_loader().get(code, size)
        except Exception:
            return None

    def _add_number_pad(self, menu: Menu) -> None:
        menu.add.label(
            self.pad.text or "_",
            font_size=self.font_type.big,
            label_id="pad_display",
        )
        for r, keys in enumerate(
            (("7", "8", "9"), ("4", "5", "6"), ("1", "2", "3"))
        ):
            row = self._row(menu, f"pad_row_{r}")
            for key in keys:
                row.pack(
                    menu.add.button(
                        key,
                        lambda k=key: self.press_key(k),
                        font_size=self.font_type.big,
                        button_id=f"pad_{key}",
                    )
                )
        row = self._row(menu, "pad_row_3")
        for key, title in (
            ("-", "-"),
            ("0", "0"),
            (".", "."),
            ("/", "/"),
            ("back", T.translate("nagmon_erase")),
        ):
            row.pack(
                menu.add.button(
                    title,
                    lambda k=key: self.press_key(k),
                    font_size=self.font_type.big,
                    button_id=f"pad_{key}",
                )
            )
        menu.add.button(
            T.translate("nagmon_check_answer"),
            lambda: self.answer(self.pad.text) if self.pad.text else None,
            font_size=self.font_type.big,
            button_id="pad_ok",
        )

    def press_key(self, key: str) -> None:
        self.pad.press(key)
        self.show_view()

    def _add_order(self, menu: Menu) -> None:
        q = self.question
        assert q is not None
        by_id = {c.id: c for c in q.choices}
        english_first = q.subject == "english"
        picked = " ← ".join(
            _choice_label(by_id[i], english_first) for i in self.order.picked
        )
        menu.add.label(
            picked or T.translate("nagmon_order_hint"),
            font_size=self.font_type.small,
            max_char=-1,
            wordwrap=True,
            label_id="order_picked",
        )
        for choice in q.choices:
            if choice.id in self.order.picked:
                continue
            menu.add.button(
                _choice_label(choice, english_first),
                lambda c=choice.id: self._pick(c),
                font_size=self.font_type.medium,
                button_id=f"order_{choice.id}",
            )
        row = self._row(menu, "order_controls")
        row.pack(
            menu.add.button(
                T.translate("nagmon_undo"),
                self._unpick,
                font_size=self.font_type.small,
                button_id="order_undo",
            )
        )
        if self.order.complete:
            row.pack(
                menu.add.button(
                    T.translate("nagmon_check_answer"),
                    lambda: self.answer(tuple(self.order.picked)),
                    font_size=self.font_type.medium,
                    button_id="order_ok",
                )
            )

    def _pick(self, item_id: str) -> None:
        self.order.pick(item_id)
        self.show_view()

    def _unpick(self) -> None:
        self.order.undo()
        self.show_view()

    def _add_letters(self, menu: Menu) -> None:
        menu.add.label(
            self.tiles.word or "_",
            font_size=self.font_type.big,
            label_id="letters_word",
        )
        row = self._row(menu, "letters")
        for i, letter in enumerate(self.tiles.letters):
            if not self.tiles.available(i):
                continue
            row.pack(
                menu.add.button(
                    letter,
                    lambda i=i: self._tile(i),
                    font_size=self.font_type.big,
                    button_id=f"tile_{i}",
                )
            )
        row = self._row(menu, "letters_controls")
        row.pack(
            menu.add.button(
                T.translate("nagmon_undo"),
                self._untile,
                font_size=self.font_type.small,
                button_id="letters_undo",
            )
        )
        if len(self.tiles.used) == len(self.tiles.letters):
            row.pack(
                menu.add.button(
                    T.translate("nagmon_check_answer"),
                    lambda: self.answer(self.tiles.word),
                    font_size=self.font_type.medium,
                    button_id="letters_ok",
                )
            )

    def _tile(self, index: int) -> None:
        self.tiles.pick(index)
        self.show_view()

    def _untile(self) -> None:
        self.tiles.undo()
        self.show_view()

    def _add_footer(self, menu: Menu) -> None:
        row = self._row(menu, "footer")
        buttons: list[tuple[str, str, Callable[[], None]]] = []
        if not self.hint_used and self.engine is not None:
            buttons.append(("hint", T.translate("nagmon_hint"), self.hint))
        buttons.append(
            ("dont_know", T.translate("nagmon_dont_know"), self.dont_know)
        )
        buttons.append(("speak", T.translate("nagmon_read_aloud"), self.speak))
        if self.allow_skip:
            buttons.append(("skip", T.translate("nagmon_skip"), self.skip))
        if T.is_rtl():
            buttons.reverse()
        for key, title, action in buttons:
            row.pack(
                menu.add.button(
                    title,
                    action,
                    font_size=self.font_type.small,
                    button_id=f"footer_{key}",
                ),
                align=ALIGN_CENTER,
            )

    def _add_feedback(self, menu: Menu) -> None:
        q, out = self.question, self.outcome
        assert q is not None and out is not None
        if out.quality == "super":
            headline = T.translate("nagmon_feedback_super")
        elif out.correct:
            headline = T.translate("nagmon_feedback_correct")
        else:
            headline = T.translate("nagmon_feedback_wrong")
        menu.add.label(headline, font_size=self.font_type.big)
        if not out.correct and out.correct_answer:
            menu.add.label(
                T.format(
                    "nagmon_feedback_answer", {"answer": out.correct_answer}
                ),
                font_size=self.font_type.medium,
                max_char=-1,
                wordwrap=True,
                label_id="correct_answer",
            )
        if out.explanation_he:
            menu.add.label(
                out.explanation_he,
                font_size=self.font_type.small,
                max_char=-1,
                wordwrap=True,
                label_id="explanation",
            )
        if out.coins:
            menu.add.label(
                T.format("nagmon_feedback_coins", {"coins": out.coins}),
                font_size=self.font_type.medium,
            )
        for skill_id in out.newly_mastered:
            menu.add.label(
                T.format(
                    "nagmon_feedback_star", {"skill": self._skill(skill_id)}
                ),
                font_size=self.font_type.medium,
                font_color=(200, 140, 0),
            )
        menu.add.button(
            T.translate("nagmon_continue"),
            self.finish,
            font_size=self.font_type.big,
            button_id="continue",
        )

    def _skill(self, skill_id: str) -> str:
        if self.engine is None:
            return skill_id
        skill = self.engine.content.get(skill_id)
        return skill.title_he if skill is not None else skill_id

    # ------------------------------------------------------------ actions

    def hint(self) -> None:
        if self.engine is None or self.question is None:
            return
        hint = self.engine.hint(self.question)
        self.hint_used = True
        self.hint_text = hint.text_he
        self.hidden.update(hint.eliminate)
        self.show_view()

    def dont_know(self) -> None:
        self.answer(None, dont_know=True)

    def answer(self, given: Any, *, dont_know: bool = False) -> None:
        q = self.question
        if q is None or self.engine is None or self.outcome is not None:
            return
        elapsed = time.monotonic() - self.started
        self.outcome = self.engine.submit(
            q,
            given,
            elapsed_s=elapsed,
            context=self.context,
            hint_used=self.hint_used,
            dont_know=dont_know,
        )
        self._reward(self.outcome)
        self.show_view()

    def _reward(self, outcome: Any) -> None:
        rt = get_runtime()
        if rt is not None:
            try:
                rt.on_answer()
            except Exception:  # saving must never break the question
                logger.exception("Could not record the answer")
        if not outcome.coins:
            return
        try:
            wallet = local_session.player.money_controller.money_manager
            wallet.add_money(outcome.coins)
        except Exception:  # no game loaded yet (e.g. practice from menu)
            logger.debug("No player wallet for quiz coins")

    def speak(self) -> None:
        q = self.question
        tts = speech()
        if q is None or tts is None:
            return
        try:
            tts.speak_bilingual(
                q.speak.get("he") or q.prompt_he,
                q.speak.get("en")
                or (q.prompt_en if q.subject == "english" else None),
            )
        except Exception:
            logger.exception("Could not read the question aloud")

    def skip(self) -> None:
        self._close(None)

    def finish(self) -> None:
        self._close(self.outcome)

    def _close(self, result: Any) -> None:
        tts = game_helpers._TTS
        if tts is not None:
            try:
                tts.stop()
            except Exception:
                pass
        self.client.pop_state(self)
        if self.on_result is not None:
            self.on_result(result)

    def process_event(self, event: PlayerInput) -> PlayerInput | None:
        if event.pressed and event.button == events.UNICODE:
            char = str(event.value)
            q = self.question
            if q is not None and self.outcome is None and self.example_seen:
                if q.kind == "number" and char in "0123456789-./":
                    self.press_key(char)
                    return None
                if q.kind in CHOICE_KINDS and char.isdigit():
                    visible = [c for c in q.choices if c.id not in self.hidden]
                    index = int(char) - 1
                    if 0 <= index < len(visible):
                        self.answer(visible[index].id)
                        return None
        if event.pressed and event.button == events.BACKSPACE:
            q = self.question
            if q is not None and q.kind == "number" and self.outcome is None:
                self.press_key("back")
                return None
        return super().process_event(event)
