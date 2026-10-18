# SPDX-License-Identifier: GPL-3.0
"""
Startup wiring for Nagmon: builds the family runtime and connects it to
Tuxemon (save folder per child, language ladder).
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, ClassVar

from nagmon.game_flow import avatar_keys
from nagmon.runtime import NagmonRuntime, get_runtime, set_runtime
from tuxemon.constants import paths
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
        set_runtime(build_runtime())
        if first_run:
            switch_to_hebrew()
        logger.info("Nagmon runtime ready")


def switch_to_hebrew() -> None:
    """Nagmon speaks Hebrew from the very first launch."""
    from tuxemon.locale.locale import T
    from tuxemon.user_config import CONFIG

    if CONFIG.locale.slug != HEBREW and T.is_language_supported(HEBREW):
        CONFIG.update_locale(HEBREW)
        T.change_language(HEBREW)
