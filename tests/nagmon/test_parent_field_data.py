# SPDX-License-Identifier: GPL-3.0
"""
The parent area's "GitHub and sending data" screen
(docs/kids/SDD_FIELD_DATA.md §2.4): pasting the token from the
clipboard, the status, a confirmation before every upload, and plain
Hebrew results. The screen is built without a display; the network is a
fake transport and background work runs at once.
"""

from __future__ import annotations

import base64
import json
from unittest.mock import MagicMock

import pytest

from mods.nagmon.states import field_data as screen
from nagmon import runtime as runtime_mod
from nagmon.ai.fakes import FakeTransport, json_response
from nagmon.field_data import clipboard
from nagmon.field_data.github import GitHubClient
from nagmon.field_data.uploads import FieldData
from nagmon.runtime import NagmonRuntime
from tuxemon.locale.locale import T

TOKEN = "github_pat_" + "11ABCDEFG0" * 6
DATA_REPO = "YuvalNag/nagmon-data"
API = f"https://api.github.com/repos/{DATA_REPO}"


def repo_info(*, private=True, push=True):
    return json_response(
        200,
        {
            "private": private,
            "default_branch": "main",
            "permissions": {"push": push},
        },
    )


class Screen:
    """The screen, what it said, what it offered and what it sent."""

    def __init__(self, tmp_path, monkeypatch, *, info=None, put=None) -> None:
        self.said: list[str] = []
        self.offers: list[list[tuple[str, object]]] = []
        self.clipboard = ""
        self.transport = FakeTransport()
        self.transport.add(
            "PUT", "/contents/", put or json_response(201, {"content": {}})
        )
        self.transport.add("GET", API, info or repo_info())
        self.rt = NagmonRuntime(tmp_path / "nagmon")
        for name in ("נועה", "Zephyrine"):
            self.rt.store.create(name=name, avatar="girl", grade=2)
        runtime_mod.set_runtime(self.rt)
        monkeypatch.setattr(screen, "say", self._say)
        monkeypatch.setattr(
            screen,
            "choose",
            lambda client, options, **kw: self.offers.append(options),
        )
        monkeypatch.setattr(
            screen,
            "run_in_background",
            lambda client, work, done: done(work()),
        )
        monkeypatch.setattr(screen, "read_clipboard", lambda: self.clipboard)
        monkeypatch.setattr(screen.app_log, "save", lambda **kw: None)
        monkeypatch.setattr(
            screen.app_log, "text", lambda: "12:00:00 INFO nagmon: hi\n"
        )
        self.state = screen.FieldDataState.__new__(screen.FieldDataState)
        self.state.client = MagicMock()
        self.state.data = FieldData(
            self.rt.root,
            crash_dir=self.rt.root / "crash",
            transport=self.transport,
        )
        self.state.status = None
        self.state.rebuild = lambda: None

    def _say(self, client, text, then=None) -> None:
        """The dialog: the parent reads it, taps, and ``then`` runs."""
        self.said.append(text)
        if then is not None:
            then()

    @property
    def puts(self):
        return [c for c in self.transport.calls if c.method == "PUT"]

    def tap(self, label_key: str) -> None:
        """Taps the option with this text in the last offer."""
        wanted = T.translate(label_key)
        options = self.offers[-1]
        action = next(fn for text, fn in options if text == wanted)
        action()

    def button_keys(self) -> list[str]:
        return [key for key, _text, _action in self.state.buttons()]


@pytest.fixture
def ui(tmp_path, monkeypatch):
    GitHubClient.forget_checks()
    made = Screen(tmp_path, monkeypatch)
    yield made
    runtime_mod.set_runtime(None)
    GitHubClient.forget_checks()


def connect(ui) -> None:
    ui.clipboard = TOKEN
    ui.state.paste()
    ui.said.clear()


# ------------------------------------------------------------ connecting


def test_not_connected_says_how(ui):
    assert ui.state.status_text() == T.translate("nagmon_github_not_connected")


def test_pasting_a_token_connects(ui):
    ui.clipboard = f"  {TOKEN}\n"
    ui.state.paste()
    assert ui.state.data.connected
    expected = T.format("nagmon_github_ok", {"repo": DATA_REPO})
    assert ui.said == [expected]
    assert ui.state.status_text() == expected


def test_an_empty_clipboard_explains_how_to_copy(ui):
    ui.clipboard = ""
    ui.state.paste()
    assert ui.said == [T.translate("nagmon_github_clipboard_empty")]
    assert ui.transport.calls == []


def test_something_else_on_the_clipboard_is_not_sent_anywhere(ui):
    ui.clipboard = "שלום, מה שלומך?"
    ui.state.paste()
    assert ui.said == [T.translate("nagmon_github_clipboard_not_token")]
    assert ui.transport.calls == []
    assert not ui.state.data.connected


def test_a_broken_clipboard_counts_as_empty(ui, monkeypatch):
    def broken():
        raise RuntimeError("no clipboard")

    monkeypatch.setattr(screen, "read_clipboard", broken)
    ui.state.paste()
    assert ui.said == [T.translate("nagmon_github_clipboard_empty")]


def test_a_bad_token_says_why_and_is_not_saved(tmp_path, monkeypatch):
    GitHubClient.forget_checks()
    ui = Screen(tmp_path, monkeypatch, info=json_response(401, {}))
    try:
        ui.clipboard = TOKEN
        ui.state.paste()
        assert ui.said == [
            T.format("nagmon_github_bad_token", {"repo": DATA_REPO})
        ]
        assert not ui.state.data.connected
    finally:
        runtime_mod.set_runtime(None)


def test_a_public_repo_is_shown_and_nothing_is_sent(tmp_path, monkeypatch):
    GitHubClient.forget_checks()
    ui = Screen(tmp_path, monkeypatch, info=repo_info(private=False))
    try:
        connect(ui)
        public = T.format("nagmon_github_public", {"repo": DATA_REPO})
        assert ui.state.status_text() == public
        ui.state.send_log()
        ui.tap("nagmon_github_send")
        assert ui.said[-1] == public
        assert ui.puts == []
    finally:
        runtime_mod.set_runtime(None)


def test_disconnecting_forgets_the_token(ui):
    connect(ui)
    ui.state.disconnect()
    assert not ui.state.data.connected
    assert ui.said == [T.translate("nagmon_github_disconnected")]
    assert TOKEN not in (ui.rt.root / "secrets.json").read_text()


# --------------------------------------------------------------- buttons


def test_the_buttons(ui):
    assert ui.button_keys() == [
        "connect",
        "send_log",
        "send_progress",
        "back",
    ]
    connect(ui)
    assert ui.button_keys() == [
        "connect",
        "send_log",
        "send_progress",
        "disconnect",
        "back",
    ]


def test_the_crash_button_only_with_an_unsent_report(ui):
    connect(ui)
    crash = ui.rt.root / "crash"
    crash.mkdir()
    (crash / "last_crash.txt").write_text("Nagmon crash report\nboom")
    assert "send_crash" in ui.button_keys()
    ui.state.send_crash()
    assert ui.said[-1] == T.format(
        "nagmon_github_confirm_crash", {"repo": DATA_REPO}
    )
    ui.tap("nagmon_github_send")
    assert ui.said[-1] == T.translate("nagmon_github_sent")
    assert "send_crash" not in ui.button_keys()


def test_the_screen_is_in_the_parent_area():
    from mods.nagmon.states import profiles

    source = profiles.__file__
    text = open(source, encoding="utf-8").read()
    assert '"FieldDataState"' in text and "nagmon_parent_github" in text


# ------------------------------------------------------------- sending


def test_sending_progress_asks_first_and_names_the_repo(ui):
    connect(ui)
    ui.state.send_progress()
    assert ui.puts == []  # nothing before the parent says yes
    question = ui.said[-1]
    assert question == T.format(
        "nagmon_github_confirm_progress", {"count": 2, "repo": DATA_REPO}
    )
    labels = [text for text, _fn in ui.offers[-1]]
    assert labels == [
        T.translate("nagmon_github_send"),
        T.translate("nagmon_github_cancel"),
    ]
    ui.tap("nagmon_github_send")
    assert len(ui.puts) == 1
    assert ui.said[-1] == T.translate("nagmon_github_sent")
    sent = base64.b64decode(json.loads(ui.puts[0].body)["content"]).decode()
    assert "נועה" not in sent and "Zephyrine" not in sent
    assert json.loads(sent)["schema_version"] == 1


def test_one_child_is_said_in_the_singular(ui):
    connect(ui)
    ui.rt.store.delete(ui.rt.store.list()[0].id)
    ui.state.send_progress()
    assert ui.said[-1] == T.format(
        "nagmon_github_confirm_progress_one", {"count": 1, "repo": DATA_REPO}
    )


def test_cancel_sends_nothing(ui):
    connect(ui)
    for send in (ui.state.send_log, ui.state.send_progress):
        send()
        ui.tap("nagmon_github_cancel")
    assert ui.puts == []
    assert T.translate("nagmon_github_sent") not in ui.said


def test_sending_the_log(ui):
    connect(ui)
    ui.state.send_log()
    assert ui.said[-1] == T.format(
        "nagmon_github_confirm_log", {"repo": DATA_REPO}
    )
    ui.tap("nagmon_github_send")
    assert ui.said[-1] == T.translate("nagmon_github_sent")
    sent = base64.b64decode(json.loads(ui.puts[0].body)["content"]).decode()
    assert "12:00:00 INFO nagmon: hi" in sent
    assert "/logs/" in ui.puts[0].url


def test_sending_without_a_connection_says_how_to_connect(ui):
    ui.state.send_log()
    assert ui.said == [T.translate("nagmon_github_not_connected")]
    assert ui.offers == []


def test_a_failed_upload_says_why(tmp_path, monkeypatch):
    GitHubClient.forget_checks()
    ui = Screen(
        tmp_path,
        monkeypatch,
        put=json_response(403, {"message": "Resource not accessible"}),
    )
    try:
        connect(ui)
        ui.state.send_log()
        ui.tap("nagmon_github_send")
        assert ui.said[-1] == T.format(
            "nagmon_github_no_permission", {"repo": DATA_REPO}
        )
    finally:
        runtime_mod.set_runtime(None)


def test_background_work_that_breaks_is_reported(ui, monkeypatch):
    connect(ui)
    monkeypatch.setattr(
        screen, "run_in_background", lambda client, work, done: done(None)
    )
    ui.state.send_log()
    ui.tap("nagmon_github_send")
    assert ui.said[-1] == T.format("nagmon_github_failed", {"repo": DATA_REPO})


# --------------------------------------------------------------- clipboard


@pytest.mark.parametrize(
    ("text", "token"),
    [
        (TOKEN, TOKEN),
        (f"\n {TOKEN} \n", TOKEN),
        ("ghp_" + "a" * 36, "ghp_" + "a" * 36),
        ("", None),
        ("   ", None),
        ("hello world", None),
        (f"{TOKEN} and more words", None),
        (None, None),
    ],
)
def test_finding_the_token_on_the_clipboard(text, token):
    assert clipboard.find_token(text) == token


def test_desktop_clipboard_uses_pyperclip(monkeypatch):
    import pyperclip

    monkeypatch.setattr(clipboard, "_on_android", lambda: False)
    monkeypatch.setattr(pyperclip, "paste", lambda: "copied")
    assert clipboard.read_clipboard() == "copied"

    def no_clipboard():
        raise pyperclip.PyperclipException("no xclip")

    monkeypatch.setattr(pyperclip, "paste", no_clipboard)
    assert clipboard.read_clipboard() == ""


def test_android_clipboard_uses_the_phone(monkeypatch):
    import sys
    import types

    fake = types.ModuleType("nagmon.android.clipboard")
    fake.paste = lambda: "from the phone"
    monkeypatch.setitem(sys.modules, "nagmon.android.clipboard", fake)
    monkeypatch.setattr(clipboard, "_on_android", lambda: True)
    assert clipboard.read_clipboard() == "from the phone"
