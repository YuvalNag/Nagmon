# SPDX-License-Identifier: GPL-3.0
"""
UI helpers shared by Nagmon's game screens (mods/nagmon/states): dialogs,
choices, text input, menu rebuilding, the subject map, emoji and speech.

They live in the nagmon package (not in mods/) so screens can import them
the same way in a source checkout and in a frozen Windows build.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable, Sequence
from typing import TYPE_CHECKING, Any

from nagmon.quiz_flow import SubjectMap
from nagmon.runtime import get_runtime
from tuxemon.constants.asset_loader import fetch_asset
from tuxemon.tools import open_choice_dialog, open_dialog
from tuxemon.ui.menu_options import ChoiceOption, MenuOptions

if TYPE_CHECKING:
    from tuxemon.base_client import BaseClient
    from tuxemon.menu.menu import PygameMenuState

logger = logging.getLogger(__name__)


def later(client: BaseClient, fn: Callable[[], None]) -> None:
    """Runs ``fn`` on the next frame, after the current state closed."""
    client.queue_command(fn)


def say(client: BaseClient, text: str, then: Callable[[], None] | None = None):
    open_dialog(
        client,
        [text],
        dialog_speed="max",
        on_complete=(lambda: later(client, then)) if then else None,
    )


def choose(
    client: BaseClient,
    options: Sequence[tuple[str, Callable[[], None]]],
    *,
    escape_key_exits: bool = True,
) -> None:
    """Shows a list of choices; the chosen action runs after it closes."""

    def wrap(fn: Callable[[], None]) -> Callable[[], None]:
        def run() -> None:
            client.pop_state()
            later(client, fn)

        return run

    menu = MenuOptions(
        [
            ChoiceOption(key=f"o{i}", display_text=text, action=wrap(fn))
            for i, (text, fn) in enumerate(options)
        ]
    )
    open_choice_dialog(client, menu, escape_key_exits=escape_key_exits)


def ask_text(
    client: BaseClient,
    prompt: str,
    on_text: Callable[[str], None],
    *,
    char_limit: int = 16,
    initial: str = "",
) -> None:
    client.push_state(
        "InputMenu",
        prompt=prompt,
        callback=lambda text: later(client, lambda: on_text(text)),
        char_limit=char_limit,
        initial=initial,
    )


def rebuild_menu(state: PygameMenuState) -> None:
    """
    Rebuilds a menu state's widgets with a fresh pygame_menu Menu.
    Clearing and refilling the old Menu keeps drawing its first layout.
    """
    state._menu = None
    state.add_menu_items(state.menu)
    state.reset_theme()
    state._set_open()


_SUBJECTS: SubjectMap | None = None
_EMOJI: Any = None
_TTS: Any = None


def subject_map() -> SubjectMap:
    global _SUBJECTS
    if _SUBJECTS is None:
        _SUBJECTS = SubjectMap.load(
            fetch_asset("learning", "subjects.yaml")  # type: ignore[arg-type]
        )
    return _SUBJECTS


def emoji_loader() -> Any:
    global _EMOJI
    if _EMOJI is None:
        from nagmon.ui.emoji import EmojiLoader, default_root

        _EMOJI = EmojiLoader(default_root())
    return _EMOJI


def speech() -> Any:
    """The text-to-speech service for the playing child, or None."""
    global _TTS
    rt = get_runtime()
    if rt is None or rt.active is None:
        return None
    try:
        from nagmon.tts.factory import create_service
        from nagmon.tts.settings import TTSSettings

        settings = TTSSettings.from_dict(rt.active.settings.get("tts") or {})
        if _TTS is None:
            _TTS = create_service(settings)
        else:
            _TTS.apply_settings(settings)
    except Exception:  # speech must never break the game
        logger.exception("Text-to-speech unavailable")
        return None
    return _TTS


_HEBREW = re.compile("[\u0590-\u05ff]")
_ISOLATED = re.compile("\u2066[^\u2069]*\u2069")
# Two or more numbers joined by math operators (+ - × ÷ * / = < >).
_MATH = re.compile(r"\d+(?:[.,]\d+)?(?:\s*[-+=×÷*/<>:]\s*\d+(?:[.,]\d+)?)+")


def isolate_math(text: str) -> str:
    """
    Wraps math expressions in Hebrew text in left-to-right isolates, so
    "20 - 9 = 11" is not shown as "11 = 9 - 20". Parts that are already
    isolated, and text without Hebrew, are left alone.
    """
    if not text or not _HEBREW.search(text):
        return text
    out = []
    pos = 0
    for done in _ISOLATED.finditer(text):
        out.append(_wrap(text[pos : done.start()]))
        out.append(done.group(0))
        pos = done.end()
    out.append(_wrap(text[pos:]))
    return "".join(out)


def _wrap(part: str) -> str:
    return _MATH.sub(lambda m: f"\u2066{m.group(0)}\u2069", part)
