# SPDX-License-Identifier: GPL-3.0
"""
The parent code (docs/kids/SDD_ANDROID.md §2.7): a pad with digits only,
a prompt that says what it is, the code typed twice, back to the pad
after a mistake, and where the GitHub token goes.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from mods.nagmon.states import profiles
from nagmon.family.parent import (
    LOCKOUT_SECONDS,
    MAX_ATTEMPTS,
    MIN_PBKDF2_ITERATIONS,
    ParentStore,
)
from tuxemon.locale.locale import T


class Screens:
    """The pads and dialogs the parent sees, in order; types on the pad."""

    def __init__(self, monkeypatch) -> None:
        self.seen: list[tuple[str, str]] = []
        self.pad_options: list[dict] = []
        self._pad = None
        monkeypatch.setattr(profiles, "ask_text", self.ask_text)
        monkeypatch.setattr(profiles, "say", self.say)

    def ask_text(self, client, prompt, on_text, **options) -> None:
        self.seen.append(("pad", prompt))
        self.pad_options.append(options)
        self._pad = on_text

    def say(self, client, text, then=None) -> None:
        self.seen.append(("say", text))
        if then is not None:
            then()

    @property
    def pad_open(self) -> bool:
        return self._pad is not None

    def type(self, text: str) -> None:
        pad, self._pad = self._pad, None
        assert pad is not None, "no pad is open"
        pad(text)

    def last(self) -> tuple[str, str]:
        return self.seen[-1]


@pytest.fixture
def screens(monkeypatch):
    return Screens(monkeypatch)


@pytest.fixture
def rt(tmp_path):
    parent = ParentStore(tmp_path, iterations=MIN_PBKDF2_ITERATIONS)
    return SimpleNamespace(parent=parent)


def _say(msgid: str, **values) -> tuple[str, str]:
    text = T.format(msgid, values) if values else T.translate(msgid)
    return ("say", text)


def _pad(msgid: str) -> tuple[str, str]:
    return ("pad", T.translate(msgid))


# ------------------------------------------------------------ setting it


def test_the_first_code_is_typed_twice(screens, rt):
    opened = []
    profiles.with_parent(MagicMock(), rt, lambda: opened.append(1))
    assert screens.last() == _pad("nagmon_set_pin_prompt")
    # a pad with digits only, the digits hidden, four of them
    assert screens.pad_options[-1] == {
        "char_limit": 4,
        "digits": True,
        "secret": True,
    }
    screens.type("1234")
    assert screens.last() == _pad("nagmon_confirm_pin_prompt")
    assert not rt.parent.has_pin()
    screens.type("1234")
    assert rt.parent.has_pin() and rt.parent.verify_pin("1234").ok
    # saved, and one line on where the GitHub token goes
    assert screens.seen[-2:] == [
        _say("nagmon_pin_saved"),
        _say("nagmon_github_where"),
    ]
    assert opened == [1]


def test_two_different_codes_start_again(screens, rt):
    opened = []
    profiles.with_parent(MagicMock(), rt, lambda: opened.append(1))
    screens.type("1234")
    screens.type("4321")
    assert screens.seen[-2:] == [
        _say("nagmon_pin_mismatch"),
        _pad("nagmon_set_pin_prompt"),
    ]
    assert screens.pad_open and not rt.parent.has_pin() and not opened


@pytest.mark.parametrize("typed", ["12", "", "12345"])
def test_a_short_code_goes_back_to_the_pad(screens, rt, typed):
    profiles.with_parent(MagicMock(), rt, lambda: None)
    screens.type(typed)
    assert screens.seen[-2:] == [
        _say("nagmon_pin_invalid"),
        _pad("nagmon_set_pin_prompt"),
    ]
    assert screens.pad_open


# ------------------------------------------------------------ asking it


def _with_code(rt) -> None:
    rt.parent.set_pin("1234")


def test_a_wrong_code_goes_back_to_the_pad(screens, rt):
    _with_code(rt)
    opened = []
    profiles.with_parent(MagicMock(), rt, lambda: opened.append(1))
    assert screens.last() == _pad("nagmon_pin_prompt")
    assert screens.pad_options[-1]["digits"] is True
    screens.type("9999")
    assert screens.seen[-2:] == [
        _say("nagmon_pin_wrong"),
        _pad("nagmon_pin_prompt"),
    ]
    screens.type("1234")
    assert opened == [1]


def test_a_short_code_is_not_a_wrong_try(screens, rt):
    _with_code(rt)
    profiles.with_parent(MagicMock(), rt, lambda: None)
    screens.type("12")
    assert screens.seen[-2:] == [
        _say("nagmon_pin_invalid"),
        _pad("nagmon_pin_prompt"),
    ]
    assert rt.parent.settings.failed_attempts == 0


def test_too_many_wrong_codes_lock_and_close_the_pad(screens, rt):
    _with_code(rt)
    profiles.with_parent(MagicMock(), rt, lambda: None)
    for _ in range(MAX_ATTEMPTS):
        screens.type("9999")
    assert screens.last() == _say(
        "nagmon_pin_locked", seconds=int(LOCKOUT_SECONDS)
    )
    assert not screens.pad_open
    # while locked, no pad at all
    profiles.with_parent(MagicMock(), rt, lambda: None)
    assert screens.last()[0] == "say" and not screens.pad_open


def test_changing_the_code_asks_the_current_one(screens, rt):
    _with_code(rt)
    profiles.change_pin(MagicMock(), rt)
    assert screens.last() == _pad("nagmon_pin_prompt")
    screens.type("1234")
    assert screens.last() == _pad("nagmon_set_pin_prompt")
    screens.type("5678")
    screens.type("5678")
    assert rt.parent.verify_pin("5678").ok
    # the GitHub line is for the first time only
    assert screens.last() == _say("nagmon_pin_saved")


def test_changing_the_code_with_a_wrong_current_one(screens, rt):
    _with_code(rt)
    profiles.change_pin(MagicMock(), rt)
    screens.type("0000")
    assert screens.last() == _pad("nagmon_pin_prompt")
    assert rt.parent.verify_pin("1234").ok


# ------------------------------------------------------------ the words


def test_the_hebrew_prompt_says_what_the_code_is():
    first, second = T.translate_in("nagmon_set_pin_prompt", "he_IL").split(
        "\n"
    )
    assert first == "קוד הורים"
    assert "4 ספרות" in second and "אזור ההורים" in second
    again = T.translate_in("nagmon_confirm_pin_prompt", "he_IL")
    assert again.split("\n")[0] == "קוד הורים"
    english = T.translate_in("nagmon_set_pin_prompt", "en_US")
    assert english.split("\n")[0] == "Parent code"


def test_the_github_button_says_what_it_is_for():
    label = T.translate_in("nagmon_parent_github", "he_IL")
    assert label == "שליחת נתונים למפתח (GitHub)"
    assert label in T.translate_in("nagmon_github_where", "he_IL")
    assert T.translate_in("nagmon_parent_github", "en_US") in (
        T.translate_in("nagmon_github_where", "en_US")
    )


def test_ask_text_can_open_a_digit_pad():
    from nagmon.ui.game_helpers import ask_text

    client = MagicMock()
    ask_text(
        client, "?", lambda _: None, char_limit=4, digits=True, secret=True
    )
    name, kwargs = (
        client.push_state.call_args[0][0],
        (client.push_state.call_args[1]),
    )
    assert name == "InputMenu"
    assert kwargs["secret"] is True
    assert kwargs["char_manager"].all_chars == "1234567890"
    ask_text(client, "?", lambda _: None)
    kwargs = client.push_state.call_args[1]
    assert kwargs.get("char_manager") is None and not kwargs.get("secret")
