# SPDX-License-Identifier: GPL-3.0
"""
The parent area's "GitHub and sending data" screen
(docs/kids/SDD_FIELD_DATA.md §2.4): the connection's status, pasting the
token from the clipboard, and sending the log, the progress (without
names) or the last crash report to the private data repo.

Nothing leaves the phone without the parent's tap and a confirmation
that says what is sent and where. The network runs in the background, so
the game never freezes; the decisions live in nagmon.field_data.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import TYPE_CHECKING, Any, ClassVar

from pygame_menu.locals import ALIGN_CENTER, POSITION_EAST
from pygame_menu.menu import Menu

from nagmon.field_data import app_log
from nagmon.field_data.clipboard import find_token, read_clipboard
from nagmon.field_data.github import Check, Code, Upload
from nagmon.field_data.snapshot import progress_snapshot
from nagmon.field_data.uploads import FieldData
from nagmon.runtime import NagmonRuntime, get_runtime
from nagmon.ui.game_helpers import (
    choose,
    rebuild_menu,
    run_in_background,
    say,
)
from tuxemon.locale.locale import T
from tuxemon.menu.menu import PygameMenuState
from tuxemon.platform.const.graphics import BG_START_SCREEN

if TYPE_CHECKING:
    from tuxemon.base_client import BaseClient

logger = logging.getLogger(__name__)

#: Results that say something about the connection itself.
STATUS_CODES = (
    Code.OK,
    Code.PUBLIC,
    Code.BAD_TOKEN,
    Code.NO_PERMISSION,
    Code.NOT_FOUND,
)


def message(code: Code, repo: str) -> str:
    """The parent's sentence for a result: what happened and the fix."""
    return T.format(f"nagmon_github_{code.value}", {"repo": repo})


class FieldDataState(PygameMenuState):
    """Status, connect, send log / progress / crash report, disconnect."""

    name: ClassVar[str] = "FieldDataState"

    def __init__(self, client: BaseClient, **kwargs: Any) -> None:
        width, height = client.context.resolution
        super().__init__(client=client, height=height, width=width, **kwargs)
        theme = self._setup_theme(BG_START_SCREEN)
        theme.scrollarea_position = POSITION_EAST
        theme.widget_alignment = ALIGN_CENTER
        self._menu_config["theme"] = theme
        self.data = FieldData(self.rt.root)
        #: The last known status; None while GitHub is being asked.
        self.status: Check | None = self.data.cached_status()
        self.add_menu_items(self.menu)
        self.reset_theme()
        if self.status is None:
            run_in_background(self.client, self.data.status, self._got_status)

    @property
    def rt(self) -> NagmonRuntime:
        rt = get_runtime()
        assert rt is not None
        return rt

    # ------------------------------------------------------------ the menu

    def status_text(self) -> str:
        if not self.data.connected:
            return T.translate("nagmon_github_not_connected")
        if self.status is None:
            return T.translate("nagmon_github_checking")
        return message(self.status.code, self.status.repo or self.data.repo)

    def buttons(self) -> list[tuple[str, str, Callable[[], None]]]:
        items: list[tuple[str, str, Callable[[], None]]] = [
            ("connect", T.translate("nagmon_github_connect"), self.paste),
            ("send_log", T.translate("nagmon_github_send_log"), self.send_log),
            (
                "send_progress",
                T.translate("nagmon_github_send_progress"),
                self.send_progress,
            ),
        ]
        if self.data.pending_crash() is not None:
            items.append(
                (
                    "send_crash",
                    T.translate("nagmon_github_send_crash"),
                    self.send_crash,
                )
            )
        if self.data.connected:
            items.append(
                (
                    "disconnect",
                    T.translate("nagmon_github_disconnect"),
                    self.disconnect,
                )
            )
        items.append(("back", T.translate("nagmon_back"), self.close))
        return items

    def add_menu_items(self, menu: Menu) -> None:
        menu.add.label(
            T.translate("nagmon_parent_github"), font_size=self.font_type.big
        )
        menu.add.label(
            self.status_text(),
            font_size=self.font_type.small,
            max_char=-1,
            wordwrap=True,
            label_id="github_status",
        )
        for key, text, action in self.buttons():
            menu.add.button(
                text,
                action,
                font_size=self.font_type.medium,
                button_id=f"github_{key}",
            )

    def rebuild(self) -> None:
        rebuild_menu(self)

    def close(self) -> None:
        self.client.pop_state(self)

    def _got_status(self, check: Check | None) -> None:
        self.status = check or Check(Code.FAILED, self.data.repo)
        self.rebuild()

    # ---------------------------------------------------------- connecting

    def paste(self) -> None:
        """Reads the token from the clipboard, checks it and keeps it."""
        try:
            text = read_clipboard()
        except Exception:  # what was on the clipboard is not logged
            logger.warning("Could not read the clipboard")
            text = ""
        if not text or not text.strip():
            say(self.client, T.translate("nagmon_github_clipboard_empty"))
            return
        token = find_token(text)
        if token is None:
            say(self.client, T.translate("nagmon_github_clipboard_not_token"))
            return
        repo = self.data.repo
        before, self.status = self.status, None  # "checking..."
        self.rebuild()
        run_in_background(
            self.client,
            lambda: self.data.connect(token, repo),
            lambda check: self._connected(check, repo, before),
        )

    def _connected(
        self, check: Check | None, repo: str, before: Check | None
    ) -> None:
        check = check or Check(Code.FAILED, repo)
        # A token that did not work was not kept: the old status stays.
        kept = check.code in (Code.OK, Code.PUBLIC)
        self.status = check if kept else before
        self.rebuild()
        say(self.client, message(check.code, repo))

    def disconnect(self) -> None:
        self.data.disconnect()
        self.status = Check(Code.NOT_CONNECTED, self.data.repo)
        self.rebuild()
        say(self.client, T.translate("nagmon_github_disconnected"))

    # ------------------------------------------------------------- sending

    def _confirm(
        self, question: str, prepare: Callable[[], Callable[[], Upload] | None]
    ) -> None:
        """
        Says what is sent and where, then "send" / "cancel". On "send",
        ``prepare`` (on the game's thread) gives the upload to run in the
        background, or None when there is nothing to send.
        """
        if not self.data.connected:
            say(self.client, T.translate("nagmon_github_not_connected"))
            return

        def go() -> None:
            upload = prepare()
            if upload is not None:
                run_in_background(self.client, upload, self._sent)

        say(
            self.client,
            question,
            then=lambda: choose(
                self.client,
                [
                    (T.translate("nagmon_github_send"), go),
                    (T.translate("nagmon_github_cancel"), lambda: None),
                ],
            ),
        )

    def _sent(self, result: Upload | None) -> None:
        repo = self.data.repo
        result = result or Upload(Code.FAILED)
        if result.code in STATUS_CODES:
            self.status = Check(result.code, repo)
        self.rebuild()
        if result.ok:
            say(self.client, T.translate("nagmon_github_sent"))
        else:
            say(self.client, message(result.code, repo))

    def send_log(self) -> None:
        def prepare() -> Callable[[], Upload] | None:
            app_log.save()
            text = app_log.text()
            if not text.strip():
                say(self.client, T.translate("nagmon_github_log_empty"))
                return None
            return lambda: self.data.send_log(text)

        self._confirm(
            T.format("nagmon_github_confirm_log", {"repo": self.data.repo}),
            prepare,
        )

    def send_progress(self) -> None:
        def prepare() -> Callable[[], Upload] | None:
            # Read on the game's thread: the runtime is not thread-safe.
            snapshot = progress_snapshot(self.rt)
            return lambda: self.data.send_progress(snapshot)

        count = len(self.rt.store.list())
        key = (
            "nagmon_github_confirm_progress_one"
            if count == 1
            else "nagmon_github_confirm_progress"
        )
        self._confirm(
            T.format(key, {"count": count, "repo": self.data.repo}), prepare
        )

    def send_crash(self) -> None:
        text = self.data.pending_crash()
        if text is None:
            return
        self._confirm(
            T.format("nagmon_github_confirm_crash", {"repo": self.data.repo}),
            lambda: lambda: self.data.send_crash(text),
        )
