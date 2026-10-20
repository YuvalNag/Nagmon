# SPDX-License-Identifier: GPL-3.0
"""
Startup wiring for Nagmon: builds the family runtime and connects it to
Tuxemon (save folder per child, language ladder).
"""

from __future__ import annotations

import atexit
import logging
from typing import TYPE_CHECKING, Any, ClassVar

from nagmon.field_data import app_log
from nagmon.game_flow import avatar_keys
from nagmon.runtime import NagmonRuntime, get_runtime, set_runtime
from tuxemon.constants import paths
from tuxemon.platform import mobile
from tuxemon.startup_rules import StartupRule

if TYPE_CHECKING:
    from tuxemon.client import LocalPygameClient
    from tuxemon.config import TuxemonConfig

logger = logging.getLogger(__name__)

DEFAULT_SAVE_DIR = paths.USER_GAME_SAVE_DIR
HEBREW = "he_IL"


def data_root():
    return paths.USER_STORAGE_DIR / "nagmon"


def _on_activate(rt: NagmonRuntime) -> None:
    from tuxemon.locale.bilingual import set_ladder_provider

    assert rt.active is not None
    save_dir = rt.store.save_dir(rt.active.id)
    save_dir.mkdir(parents=True, exist_ok=True)
    paths.USER_GAME_SAVE_DIR = save_dir
    set_ladder_provider(rt.ladder)


def _on_deactivate(rt: NagmonRuntime) -> None:
    from tuxemon.locale.bilingual import set_ladder_provider

    paths.USER_GAME_SAVE_DIR = DEFAULT_SAVE_DIR
    set_ladder_provider(None)


def build_runtime(root=None) -> NagmonRuntime:
    """The runtime with the real learning engine (if it loads)."""
    from nagmon.learning.content import ContentLibrary
    from nagmon.learning.engine import LearningEngine
    from nagmon.learning.learner import LearnerState

    words_he: dict[str, str] = {}

    def load_content() -> Any:
        try:
            content = ContentLibrary.load(
                extra_bank_dirs=[(root or data_root()) / "ai_bank"]
            )
        except TypeError:  # older loader without extra banks
            content = ContentLibrary.load()
        if hasattr(content, "words_he"):
            words_he.update(content.words_he())
        return content

    def engine_factory(content: Any, learner: Any) -> Any:
        if content is None:
            return None
        return LearningEngine(content, learner)

    def safe_content() -> Any:
        try:
            return load_content()
        except Exception:
            # The game must still start; questions are simply skipped.
            logger.exception("Learning content failed to load")
            return None

    rt = NagmonRuntime(
        root or data_root(),
        content_loader=safe_content,
        learner_from_dict=LearnerState.from_dict,
        learner_new=LearnerState,
        engine_factory=engine_factory,
        on_activate=_on_activate,
        on_deactivate=_on_deactivate,
        avatars=avatar_keys(),
        words_he=words_he,
    )
    return rt


class NagmonStartupRule(StartupRule):
    name: ClassVar[str] = "NagmonStartupRule"

    def __init__(
        self,
        client: LocalPygameClient,
        config: TuxemonConfig,
        load_slot: int | None = None,
    ) -> None:
        self.client = client
        self.config = config
        self.load_slot = load_slot

    def should_apply(self) -> bool:
        return get_runtime() is None

    def apply(self) -> None:
        first_run = not data_root().exists()
        start_app_log()
        set_runtime(build_runtime())
        # Closing the window (or a crash) must still count the last
        # minutes of play and save the child's learning.
        atexit.register(stop_play_at_exit)
        # On a phone: switching to another app stops the clock and saves.
        mobile.on_app_switch(pause_play, resume_play)
        if first_run:
            switch_to_hebrew()
        start_intro_movie(self.client)
        logger.info("Nagmon runtime ready")


def start_intro_movie(client: Any) -> None:
    """The intro, once per launch, on a real screen (SDD_ART §2.4)."""
    from nagmon.ui.intro import start_intro

    try:
        start_intro(client)
    except Exception:  # the intro must never stop the game
        logger.exception("Could not start the intro")


def start_app_log() -> None:
    """The app's own log (SDD_FIELD_DATA §2.2); on the phone ``main.py``
    already started it, and this only restores its levels."""
    try:
        app_log.install(data_root())
    except Exception:  # the log must never stop the game
        logger.exception("Could not start the app log")


def pause_play() -> None:
    rt = get_runtime()
    if rt is not None:
        rt.pause()
    app_log.save(ending="background")


def resume_play() -> None:
    rt = get_runtime()
    if rt is not None:
        rt.resume()


def stop_play_at_exit() -> None:
    """Ends the playing child's session when the game closes."""
    rt = get_runtime()
    if rt is not None:
        try:
            rt.stop_play()
        except Exception:
            logger.exception("Could not end the play session at exit")
    app_log.save()


def switch_to_hebrew() -> None:
    """Nagmon speaks Hebrew from the very first launch."""
    from tuxemon.locale.locale import T
    from tuxemon.user_config import CONFIG

    if CONFIG.locale.slug != HEBREW and T.is_language_supported(HEBREW):
        CONFIG.update_locale(HEBREW)
        T.change_language(HEBREW)
