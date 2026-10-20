# SPDX-License-Identifier: GPL-3.0
"""
The emulator check's driver (tools/android/e2e_flow.py,
docs/kids/SDD_ANDROID.md §5.1) without an emulator: logcat lines in,
decisions out, and the whole flow against a fake phone that answers taps
with UI maps the way the game prints them (tuxemon/ui_probe.py).
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

from tuxemon.ui_probe import lines as probe_lines

REPO = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location(
    "e2e_flow", REPO / "tools" / "android" / "e2e_flow.py"
)
e2e = importlib.util.module_from_spec(_spec)
sys.modules["e2e_flow"] = e2e
_spec.loader.exec_module(e2e)

W, H = 2400, 1080


def logcat(message: str, pid: int = 4242, tag: str = "python") -> str:
    return f"10-20 12:00:01.234  {pid}  {pid + 1} I {tag}  : {message}\n"


def snap(data: dict, seq: int = 1) -> e2e.Snapshot:
    data.setdefault("window", [W, H])
    return e2e.Snapshot(seq, data, 0.0)


def key(char: str, x: int = 0) -> dict:
    return {"char": char, "rect": [x, 700, 150, 150]}


# ------------------------------------------------------------ logcat


def test_threadtime_lines_are_split():
    pid, tag, message = e2e.parse_logcat(logcat("frame rate: 30 fps"))
    assert (pid, tag, message) == (4242, "python", "frame rate: 30 fps")
    assert e2e.parse_logcat("--------- beginning of main")[0] is None


def test_a_snapshot_in_parts_among_other_lines():
    stream = e2e.UIStream()
    payload = json.dumps(
        {"state": "InputMenu", "widgets": [key(c) for c in "אבגדהוזחטי" * 9]},
        ensure_ascii=True,
    )
    parts = probe_lines(3, payload)
    assert len(parts) > 2
    got = []
    for i, part in enumerate(parts):
        got.append(stream.feed(logcat(part)))
        stream.feed(logcat("unrelated", pid=1, tag="ActivityManager"))
    assert got[:-1] == [None] * (len(parts) - 1)
    assert got[-1].state == "InputMenu"
    assert got[-1].widgets[0]["char"] == "א"
    assert stream.latest() is got[-1]
    assert all("unrelated" not in line for line in stream.app_lines)


def test_a_lost_part_is_forgotten():
    stream = e2e.UIStream()
    first = probe_lines(1, json.dumps({"state": "A", "pad": "x" * 2000}))
    stream.feed(logcat(first[0]))  # the rest never came
    stream.feed(logcat(probe_lines(2, '{"state": "B"}')[0]))
    assert stream.latest().state == "B"
    assert stream._parts == {}


def test_the_probe_line_and_frame_rate_lines():
    stream = e2e.UIStream()
    stream.feed(logcat("NAGMON_UI probe on (intent)"))
    stream.feed(logcat("frame rate: 41 fps, slowest frame 90 ms"))
    assert stream.probe_on == "intent"
    assert stream.frame_lines == ["frame rate: 41 fps, slowest frame 90 ms"]


def test_a_restarted_app_starts_counting_again():
    stream = e2e.UIStream()
    stream.feed(logcat(probe_lines(9, '{"state": "A"}')[0]))
    stream.feed(logcat(probe_lines(1, '{"state": "B"}')[0]))
    assert [s.state for s in stream.snapshots] == ["B"]


def test_waiting_skips_a_heartbeat_with_the_same_screen():
    stream = e2e.UIStream()
    first = stream.feed(logcat(probe_lines(1, '{"state": "A"}')[0]))
    stream.feed(logcat(probe_lines(2, '{"state": "A"}')[0]))
    assert stream.wait(lambda s: True, 0.05, after=first) is None
    stream.feed(logcat(probe_lines(3, '{"state": "B"}')[0]))
    assert stream.wait(lambda s: True, 0.05, after=first).state == "B"


# ------------------------------------------------------------ decisions


def test_hebrew_is_letters_not_digits():
    assert e2e.has_hebrew("שחקן חדש")
    assert not e2e.has_hebrew("New player")
    who = snap(
        {
            "state": "ProfileSelectState",
            "widgets": [{"id": "new_child", "title": "+ New player"}],
        }
    )
    assert not e2e.speaks_hebrew(who)
    who.data["widgets"].append({"id": "parents", "title": "הורים"})
    assert e2e.speaks_hebrew(who)
    digits = snap({"state": "X", "widgets": [{"title": "1"}]})
    assert not e2e.speaks_hebrew(digits)


@pytest.mark.parametrize(
    "widgets, limit, kind",
    [
        pytest.param(
            [key("1"), key("א"), {"key": "done", "rect": [0, 0, 9, 9]}],
            4,
            "pin",
            id="letter-board-pin",
        ),
        pytest.param(
            [key("1"), key("א"), {"key": "done", "rect": [0, 0, 9, 9]}],
            16,
            "name",
            id="letter-board-name",
        ),
        pytest.param(
            [key("1"), key("a"), {"key": "done", "rect": [0, 0, 9, 9]}],
            16,
            "name",
            id="english-board-name",
        ),
        pytest.param(
            [
                {"id": "pad_1", "title": "1", "rect": [0, 0, 9, 9]},
                {"id": "pad_ok", "title": "אישור", "rect": [0, 0, 9, 9]},
            ],
            None,
            "pin",
            id="digits-pad",
        ),
    ],
)
def test_screen_kind_of_a_typing_screen(widgets, limit, kind):
    data = {"state": "InputMenu", "widgets": widgets}
    if limit is not None:
        data["char_limit"] = limit
    assert e2e.screen_kind(snap(data)) == kind


def test_keys_by_char_then_by_pad_id_then_by_title():
    board = snap({"widgets": [key("3", x=10)]})
    assert e2e.find_key(board, "3")["rect"][0] == 10
    pad = snap(
        {
            "widgets": [
                {"id": "pad_3", "title": "3", "rect": [20, 0, 9, 9]},
                {"id": "pad_ok", "title": "OK", "rect": [30, 0, 9, 9]},
            ]
        }
    )
    assert e2e.find_key(pad, "3")["rect"][0] == 20
    assert e2e.find_done(pad)["rect"][0] == 30
    assert e2e.find_key(pad, "4") is None


def test_the_way_to_the_map():
    def action(data):
        return e2e.to_world_action(snap(data))

    start = {
        "state": "StartState",
        "widgets": [{"id": "menu_new_game", "rect": [100, 100, 200, 100]}],
    }
    assert action(start).point == (200, 150)
    assert action({"state": "DialogState"}).point == (W // 2, H // 3)
    assert action({"state": "NagmonIntroState"}).point == (W // 2, H // 2)
    starter = {
        "state": "ChoiceMonster",
        "widgets": [
            {"title": "Agnite", "rect": [0, 0, 10, 10]},
            {"title": "לבחור", "rect": [0, 20, 10, 10]},
        ],
    }
    assert action(starter).point == (5, 25)
    quiz = {
        "state": "QuizState",
        "answer": "choice_b",
        "widgets": [
            {"id": "choice_a", "rect": [0, 0, 10, 10]},
            {"id": "choice_b", "rect": [100, 0, 10, 10]},
            {"id": "footer_dont_know", "rect": [200, 0, 10, 10]},
        ],
    }
    assert action(quiz).point == (105, 5)
    del quiz["answer"]
    assert action(quiz).point == (205, 5)
    assert not action({"state": "ProfileSelectState", "widgets": []})
    assert not action({"state": "SomethingNew", "widgets": []})


def test_typed_right():
    assert e2e.typed_right("12", "123", "3")
    assert not e2e.typed_right("12", "1", "3")  # the key deleted
    assert not e2e.typed_right("12", "1233", "3")  # typed twice
    assert e2e.typed_right(None, "1", "1")


def test_grade_one_by_its_name():
    grades = snap(
        {
            "state": "ChoiceState",
            "widgets": [
                {"title": "גן", "rect": [0, 0, 10, 10]},
                {"title": "כיתה א", "rect": [0, 100, 10, 10]},
            ],
        }
    )
    assert e2e.pick_grade(grades).point == (5, 105)


# ------------------------------------------------------------ a fake phone


class FakePhone:
    """
    The first run's screens as the game's UI map shows them; a tap on a
    rect does what the game does. ``bug`` breaks one thing.
    """

    def __init__(self, stream: e2e.UIStream, bug: str | None = None):
        self.stream = stream
        self.bug = bug
        self.seq = 0
        self.children: list[str] = []
        self.pin = ""
        self.player = [5, 5]
        self.taps: list[tuple[int, int, int | None]] = []
        self.show("NagmonIntroState", [])

    # what the game prints
    def show(self, state: str, widgets: list[dict], **extra) -> None:
        self.state, self.widgets, self.extra = state, widgets, extra
        self.emit()

    def emit(self, delay: float = 0.0) -> None:
        self.seq += 1
        data = {
            "state": self.state,
            "widgets": self.widgets,
            "window": [W, H],
            "logical": [W, H],
            **self.extra,
        }
        at = self.stream.clock() + delay
        for line in probe_lines(self.seq, json.dumps(data, ensure_ascii=True)):
            self.stream.feed(logcat(line), at=at)

    def words(self, he: str, en: str) -> str:
        return en if self.bug == "english" else he

    def board(self, prompt: str, limit: int, text: str = "") -> None:
        chars = "אבגדהוזחטיכלמנסעפצקרשת" + "1234567890"
        if self.bug == "english":
            chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890"
        widgets = [
            {
                "char": c,
                "rect": [60 + (i % 14) * 160, 100 + (i // 14) * 120, 150, 110],
            }
            for i, c in enumerate(chars)
        ]
        widgets += [
            {"key": "done", "rect": [1800, 900, 500, 150]},
            {"key": "delete", "rect": [40, 900, 400, 150]},
        ]
        self.show(
            "InputMenu", widgets, text=text, char_limit=limit, prompt=prompt
        )

    def who(self) -> None:
        widgets = [
            {
                "id": f"child_{n}",
                "title": f"{n} - 0",
                "rect": [900, 300, 500, 140],
            }
            for n in self.children
        ]
        widgets += [
            {
                "id": "new_child",
                "title": self.words("+ שחקן חדש", "+ New"),
                "rect": [900, 500, 400, 140],
            },
            {
                "id": "parents",
                "title": self.words("הורים", "Parents"),
                "rect": [900, 650, 300, 140],
            },
        ]
        self.show("ProfileSelectState", widgets)

    def dialog(self, text: str, then) -> None:
        self.after_dialog = then
        self.show("DialogState", [], dialog=text)

    def choice(self, titles: list[str], then) -> None:
        self.after_choice = then
        self.show(
            "ChoiceState",
            [
                {
                    "id": f"c{i}",
                    "title": t,
                    "rect": [1000, 100 + 140 * i, 300, 130],
                }
                for i, t in enumerate(titles)
            ],
        )

    # what a tap does
    def hit(self, x: int, y: int) -> dict | None:
        for widget in self.widgets:
            rx, ry, rw, rh = widget["rect"]
            if rx <= x < rx + rw and ry <= y < ry + rh:
                return widget
        return None

    def tap(self, x: int, y: int) -> None:
        self.press(x, y, None)

    def hold(self, x: int, y: int, ms: int) -> None:
        self.press(x, y, ms)

    def screenshot(self, path: Path) -> bool:
        return False

    def press(self, x: int, y: int, ms: int | None) -> None:
        self.taps.append((x, y, ms))
        state, widget = self.state, self.hit(x, y)
        if "Intro" in state:
            self.who()
        elif state == "DialogState":
            self.after_dialog()
        elif state == "ProfileSelectState" and widget:
            if widget["id"] == "new_child":
                self.board(self.words("הורה: בחרו קוד", "Parent: a code"), 4)
            elif widget["id"].startswith("child_"):
                self.show(
                    "StartState",
                    [
                        {
                            "id": "menu_new_game",
                            "title": "משחק חדש",
                            "rect": [1200, 360, 450, 150],
                        }
                    ],
                )
        elif state == "InputMenu" and widget:
            self.type(widget)
        elif state == "ChoiceState" and widget:
            self.after_choice(widget["title"])
        elif state == "StartState" and widget:
            self.dialog("ברוכים הבאים", self.starter)
        elif state == "ChoiceMonster" and widget:
            self.world()
        elif state == "WorldState":
            arrows = self.extra["arrows"]
            if ms and ms > 500 and self.hit_rect(arrows["right"], x, y):
                self.player = [self.player[0] + 1, self.player[1]]
                self.world()

    @staticmethod
    def hit_rect(rect, x, y) -> bool:
        rx, ry, rw, rh = rect
        return rx <= x < rx + rw and ry <= y < ry + rh

    def type(self, widget: dict) -> None:
        text, limit = self.extra["text"], self.extra["char_limit"]
        if widget.get("key") == "done":
            if limit == 4:
                self.pin_done(text)
            else:
                self.name_done(text)
            return
        char = widget.get("char")
        if char is None:
            return
        if self.bug == "deletes" and text:
            text = text[:-1]
        else:
            text = (text + char)[:limit]
        self.extra["text"] = text
        self.emit(delay=2.0 if self.bug == "slow" else 0.0)

    def pin_done(self, text: str) -> None:
        if self.bug == "confirm" and not self.pin:
            self.pin = text
            self.board("הקלידו שוב", 4)
            return
        self.pin = text
        self.dialog(
            "קוד ההורים נשמר", lambda: self.board("איך קוראים לשחקן?", 16)
        )

    def name_done(self, name: str) -> None:
        grades = ["גן", "כיתה א", "כיתה ב"]
        avatars = ["בן 1", "בת 2"]

        def got_grade(_):
            self.choice(avatars, got_avatar)

        def got_avatar(_):
            self.children.append(name)
            self.dialog(f"{name} נוסף", self.who)

        self.choice(grades, got_grade)

    def starter(self) -> None:
        self.show(
            "ChoiceMonster",
            [
                {"title": "Agnite", "rect": [700, 520, 280, 120]},
                {"title": "לבחור", "rect": [740, 650, 250, 120]},
            ],
        )

    def world(self) -> None:
        self.show(
            "WorldState",
            [],
            player=list(self.player),
            arrows_shown=True,
            arrows={
                "up": [40, 670, 330, 165],
                "down": [40, 915, 330, 165],
                "left": [0, 708, 165, 330],
                "right": [248, 708, 165, 330],
            },
        )


def play(tmp_path, bug=None, limit_ms=1500):
    stream = e2e.UIStream()
    phone = FakePhone(stream, bug=bug)
    log: list[str] = []
    flow = e2e.Flow(
        phone, stream, tmp_path, limit_ms=limit_ms, scale=0.02, log=log.append
    )
    flow.run()
    ok = e2e.judge(flow)
    return ok, flow, phone, log


def test_the_whole_first_run_on_a_fake_phone(tmp_path):
    ok, flow, phone, log = play(tmp_path)
    assert ok, flow.failures
    assert phone.children == ["נועה"]
    assert phone.pin == "1234"
    assert phone.player == [6, 5]
    # keys are held like a finger, not clicked
    key_taps = [t for t in phone.taps if t[2] == e2e.HOLD_MS]
    assert len(key_taps) == len("1234") + len("נועה")
    assert any("walked right" in line for line in log)
    report = "\n".join(flow.report())
    assert "slowest" in report and "key '1'" in report


def test_a_key_that_deletes_fails(tmp_path):
    ok, flow, phone, log = play(tmp_path, bug="deletes")
    assert not ok
    assert any(
        "+ key '2' gives '1'" in f or "gives ''" in f for f in flow.failures
    ), flow.failures


def test_english_on_the_screen_fails_but_the_flow_goes_on(tmp_path):
    ok, flow, phone, log = play(tmp_path, bug="english")
    assert not ok
    assert any("who-plays speaks Hebrew" in f for f in flow.failures)
    assert any("Hebrew letters" in f for f in flow.failures)
    # the rest was still played, in the board's letters
    assert phone.children == ["Noam"]
    assert phone.player == [6, 5]


def test_a_second_pin_screen_is_typed_again(tmp_path):
    ok, flow, phone, log = play(tmp_path, bug="confirm")
    assert ok, flow.failures
    assert any("PIN again" in line for line in log)
    assert phone.children == ["נועה"]


def test_a_slow_answer_fails(tmp_path):
    ok, flow, phone, log = play(tmp_path, bug="slow")
    assert not ok
    assert any("answered after" in f for f in flow.failures), flow.failures
