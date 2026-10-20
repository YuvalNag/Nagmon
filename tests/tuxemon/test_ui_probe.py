# SPDX-License-Identifier: GPL-3.0
"""
The UI map for the emulator check (docs/kids/SDD_ANDROID.md §5.1): off
by default, switched on by an env variable, an intent extra or a file;
one JSON per change, cut into lines logcat keeps; keys by their char.
"""

from __future__ import annotations

import json
import re
from types import SimpleNamespace
from unittest.mock import MagicMock

import pygame
import pytest
from pygame.rect import Rect
from pygame.surface import Surface

from tuxemon import ui_probe
from tuxemon.menu import theme as theme_mod
from tuxemon.menu.alert import AlertManager
from tuxemon.scaling import DefaultScaling

W, H = 2400, 1080
LINE = re.compile(r"^NAGMON_UI (\d+) (\d+)/(\d+) (.*)$")


def join(lines: list[str]) -> dict:
    parts = [LINE.match(line) for line in lines]
    assert all(parts)
    assert len({p.group(1) for p in parts}) == 1
    assert [int(p.group(2)) for p in parts] == list(range(1, len(parts) + 1))
    return json.loads("".join(p.group(4) for p in parts))


# ------------------------------------------------------------ switching on


def test_off_by_default_on_a_computer():
    assert ui_probe.wanted({}, android=False) is None
    assert ui_probe.start({"HOME": "/x"}) is None


def test_on_with_the_env_variable():
    assert ui_probe.wanted({"NAGMON_PROBE": "1"}, android=False) == "env"
    assert ui_probe.wanted({"NAGMON_PROBE": "0"}, android=False) is None


def test_on_with_the_intent_extra():
    why = ui_probe.wanted(
        {}, android=True, intent_flag=lambda: True, folders=lambda: []
    )
    assert why == "intent"


def test_on_with_a_file(tmp_path):
    def no_intent() -> bool:
        raise RuntimeError("no jnius on a computer")

    def folders():
        return [None, tmp_path]

    assert (
        ui_probe.wanted(
            {}, android=True, intent_flag=no_intent, folders=folders
        )
        is None
    )
    (tmp_path / "nagmon_probe").touch()
    assert (
        ui_probe.wanted(
            {}, android=True, intent_flag=no_intent, folders=folders
        )
        == "file"
    )


def test_off_on_a_phone_without_a_flag():
    def broken():
        raise OSError("no storage")

    assert (
        ui_probe.wanted(
            {}, android=True, intent_flag=lambda: False, folders=broken
        )
        is None
    )


# ------------------------------------------------------------ lines


def test_a_long_snapshot_comes_in_lines_logcat_keeps():
    payload = json.dumps(
        {"widgets": [{"char": chr(0x5D0 + i % 27)} for i in range(400)]},
        ensure_ascii=True,
    )
    lines = ui_probe.lines(7, payload)
    assert len(lines) > 3
    assert all(len(line.encode()) < 1000 for line in lines)
    assert lines[0].startswith("NAGMON_UI 7 1/")
    assert join(lines) == json.loads(payload)


def test_a_short_snapshot_is_one_line():
    assert ui_probe.lines(1, '{"a": 1}') == ['NAGMON_UI 1 1/1 {"a": 1}']


# ------------------------------------------------------------ geometry


def test_same_size_is_the_identity():
    mapping = ui_probe.screen_mapping((2400, 1080), (2400, 1080))
    assert ui_probe.to_screen(Rect(10, 20, 30, 40), mapping) == [
        10,
        20,
        30,
        40,
    ]


def test_a_bigger_window_scales_and_centres():
    # 1280x720 drawn on a 2400x1080 window: scale 1.5, bars on the sides
    mapping = ui_probe.screen_mapping((1280, 720), (2400, 1080))
    assert mapping == (1.5, 240.0, 0.0)
    assert ui_probe.to_screen((0, 0, 100, 100), mapping) == [240, 0, 150, 150]


# ------------------------------------------------------------ when it prints


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def test_prints_a_change_once_it_is_stable_then_a_heartbeat():
    clock = Clock()
    printed: list[str] = []
    screen = {"state": "A"}
    probe = ui_probe.UIProbe(
        echo=printed.append,
        clock=clock,
        sample_every=0.05,
        heartbeat=5.0,
        take=lambda client: dict(screen),
    )

    def run(seconds: float) -> None:
        end = clock.now + seconds
        while clock.now < end:
            probe.frame(None)
            clock.now += 0.02

    run(0.2)
    assert [join([p])["state"] for p in printed] == ["A"]
    screen["state"] = "B"
    run(0.2)
    assert [join([p])["state"] for p in printed] == ["A", "B"]
    run(4.0)
    assert len(printed) == 2
    run(1.5)
    assert [join([p])["state"] for p in printed] == ["A", "B", "B"]


def test_a_moving_screen_is_not_printed_until_it_stops():
    clock = Clock()
    printed: list[str] = []
    step = iter(range(1000))
    probe = ui_probe.UIProbe(
        echo=printed.append,
        clock=clock,
        sample_every=0.0,
        take=lambda client: {"x": next(step)},
    )
    for _ in range(10):
        probe.frame(None)
        clock.now += 0.016
    assert printed == []


def test_a_broken_snapshot_never_stops_the_game():
    def take(client):
        raise AttributeError("half-built state")

    probe = ui_probe.UIProbe(echo=print, take=take)
    probe.frame(None)
    probe.frame(None)


# ------------------------------------------------------------ real screens


@pytest.fixture
def phone_hebrew(monkeypatch):
    from tuxemon.locale.locale import T
    from tuxemon.ui import bidi
    from tuxemon.user_config import CONFIG

    import pygame_menu.font

    pygame.init()
    # an earlier test may have closed pygame's fonts under the cache
    pygame_menu.font._cache.clear()
    pygame.display.set_mode((W, H))
    monkeypatch.setenv("ANDROID_ARGUMENT", "/data/app")
    monkeypatch.setattr(bidi, "_locale_is_rtl", lambda: True)
    monkeypatch.setattr(T, "is_rtl", lambda: True)
    monkeypatch.setattr(
        CONFIG.config_model.game, "font_file", "Rubik-Medium.ttf"
    )
    theme_mod.reset_theme_cache()
    yield
    theme_mod.reset_theme_cache()


def make_client():
    screen = Surface((W, H))
    context = SimpleNamespace(
        screen=screen,
        rect=screen.get_rect(),
        resolution=(W, H),
        tile_size=(16, 16),
        scale=7,
        scaling=DefaultScaling(7),
    )
    client = MagicMock()
    client.context = context
    client.config.dialog_speed = "max"
    client.config.large_gui = False
    client.config.sound_volume = 0.0
    client.config.locale.font_file = "Rubik-Medium.ttf"
    client.config.fps = 60
    client.sound_manager.get_sound_filename.return_value = None
    client.alert_manager = AlertManager(MagicMock())
    return client


def letter_board(client, initial=""):
    from tuxemon.locale.locale import T
    from tuxemon.menu.input import CharacterSetManager
    from tuxemon.states.input import InputMenu

    menu = InputMenu(
        client,
        prompt="קוד",
        callback=lambda text: None,
        char_limit=4,
        initial=initial,
        char_manager=CharacterSetManager(
            chars=T.translate_in("menu_alphabet", "he_IL"), char_variants=""
        ),
    )
    menu.reload_items()
    menu.refresh_layout()
    return menu


def test_the_letter_board_by_char(phone_hebrew):
    client = make_client()
    board = letter_board(client, initial="12")
    client.active_states = [board]
    snap = ui_probe.snapshot(client, window=(W, H))
    assert snap["state"] == "InputMenu"
    assert snap["text"] == "12"
    assert snap["char_limit"] == 4
    assert snap["prompt"] == "קוד"
    chars = {w["char"]: w["rect"] for w in snap["widgets"] if "char" in w}
    assert set("1234567890") <= set(chars)
    assert "א" in chars
    keys = {w.get("key") for w in snap["widgets"]}
    assert {"done", "delete"} <= keys
    screen = Rect(0, 0, W, H)
    for widget in snap["widgets"]:
        assert screen.contains(Rect(widget["rect"])), widget
    # the probe's rect is where a tap presses that key
    handler = board._input_handler
    x, y, w, h = chars["3"]
    index = handler._item_at((x + w // 2, y + h // 2))
    assert board.menu_items.sprites()[index].game_object.char == "3"


def test_a_choice_list_by_title(phone_hebrew):
    from tuxemon.states.choice_state import ChoiceState
    from tuxemon.ui.menu_options import ChoiceOption, MenuOptions

    client = make_client()
    options = MenuOptions(
        [
            ChoiceOption(key=f"o{i}", display_text=f"כיתה {i}", action=print)
            for i in range(3)
        ]
    )
    state = ChoiceState(client, options)
    state.transition.apply(state.menu, 1.0, client.context)
    client.active_states = [state]
    snap = ui_probe.snapshot(client, window=(W, H))
    titles = [w["title"] for w in snap["widgets"]]
    assert sorted(titles) == ["כיתה 0", "כיתה 1", "כיתה 2"]
    assert all(w["id"] for w in snap["widgets"])


def test_the_whole_line_is_ascii_and_round_trips(phone_hebrew):
    client = make_client()
    client.active_states = [letter_board(client, initial="נו")]
    probe = ui_probe.UIProbe(echo=print, take=lambda c: {})
    out: list[str] = []
    probe._echo = out.append
    probe.print(
        json.dumps(ui_probe.snapshot(client, window=(W, H)), ensure_ascii=True)
    )
    assert all(line.isascii() for line in out)
    assert join(out)["text"] == "נו"
