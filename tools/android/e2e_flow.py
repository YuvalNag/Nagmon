# SPDX-License-Identifier: GPL-3.0
"""
Plays the first run on an Android emulator the way a parent and a child
do, with real taps (``adb shell input``), and fails when something is
wrong (docs/kids/SDD_ANDROID.md §5.1).

The game is opened with its UI map switched on (tuxemon/ui_probe.py):
it prints the screen's buttons and keys to logcat, so every tap here is
on a button or key by its name, never on guessed pixels.

    who plays -> new player -> the parent's PIN (held taps, one digit at
    a time, the typed text checked after each) -> maybe the PIN again ->
    the child's name in Hebrew -> grade -> character -> who plays lists
    the child -> tap the child -> the title -> new game -> the map ->
    hold an arrow: the player walks.

Checked on the way: the screens speak Hebrew whatever the phone's
language, a key adds exactly its letter, every tap is answered within
``--limit-ms`` (the time from the end of the tap to the new screen in
logcat). After each step a screenshot goes into the log
(screen_shape.py show); on a failure the app's last 300 log lines too.

Usage (a running emulator, the APK installed):
    python3 tools/android/e2e_flow.py --out smoke/e2e-he --locale he-IL

Standard library only; runs on the CI machine, not on the phone.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import threading
import time
from collections import deque
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PKG = "org.nagmon.nagmon"
ACTIVITY = "org.kivy.android.PythonActivity"
PREFIX = "NAGMON_UI"
PIN = "1234"
NAME = "נועה"
#: Typed when the board has no Hebrew letters (that already failed).
LATIN_NAME = "Noam"
#: A child's finger stays down about this long.
HOLD_MS = 150
HERE = Path(__file__).resolve().parent

HEBREW = re.compile(r"[\u05d0-\u05ea]")
LOGCAT = re.compile(
    r"^\d\d-\d\d\s+\d\d:\d\d:\d\d\.\d+\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+"
    r"(.*?)\s*:\s?(.*)$"
)
PART = re.compile(rf"{PREFIX} (\d+) (\d+)/(\d+) (.*)$")
APP_TAGS = ("python", "SDL", "PythonActivity", "AndroidRuntime", "DEBUG")


class FlowError(Exception):
    """The flow cannot go on."""


# ------------------------------------------------------------ the UI map


@dataclass
class Snapshot:
    seq: int
    data: dict[str, Any]
    at: float

    @property
    def state(self) -> str | None:
        return self.data.get("state")

    @property
    def widgets(self) -> list[dict[str, Any]]:
        return list(self.data.get("widgets") or [])

    @property
    def text(self) -> str | None:
        return self.data.get("text")

    @property
    def window(self) -> tuple[int, int]:
        w, h = self.data.get("window") or self.data.get("logical") or (0, 0)
        return int(w), int(h)


def parse_logcat(line: str) -> tuple[int | None, str, str]:
    """(pid, tag, message) of a ``logcat -v threadtime`` line."""
    m = LOGCAT.match(line.rstrip("\r\n"))
    if not m:
        return None, "", line.rstrip("\r\n")
    return int(m.group(1)), m.group(4), m.group(5)


class UIStream:
    """
    Collects the app's log: UI snapshots (put together from their
    parts), frame-rate lines and the app's last lines. Fed from a logcat
    thread; read by the flow.
    """

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self.clock = clock
        self.snapshots: list[Snapshot] = []
        self.frame_lines: list[str] = []
        self.app_lines: deque[str] = deque(maxlen=300)
        self.probe_on: str | None = None
        self.pid: int | None = None
        self._parts: dict[int, dict[int, str]] = {}
        self._cond = threading.Condition()

    def feed(self, line: str, at: float | None = None) -> Snapshot | None:
        at = self.clock() if at is None else at
        pid, tag, message = parse_logcat(line)
        with self._cond:
            mine = (pid is not None and pid == self.pid) or tag in APP_TAGS
            if mine or PREFIX in message:
                self.app_lines.append(line.rstrip("\r\n"))
            if "frame rate:" in message:
                self.frame_lines.append(message.strip())
            if f"{PREFIX} probe on" in message:
                self.probe_on = message.split("(", 1)[-1].rstrip(")")
                self._cond.notify_all()
                return None
            m = PART.search(message)
            if not m:
                return None
            seq, part, total = (int(m.group(i)) for i in (1, 2, 3))
            parts = self._parts.setdefault(seq, {})
            parts[part] = m.group(4)
            if len(parts) < total:
                return None
            del self._parts[seq]
            for old in [s for s in self._parts if s < seq]:
                del self._parts[old]  # a part was lost: forget it
            try:
                data = json.loads("".join(parts[i + 1] for i in range(total)))
            except (ValueError, KeyError):
                return None
            if self.snapshots and seq <= self.snapshots[-1].seq:
                self.snapshots.clear()  # the app started again
            snap = Snapshot(seq, data, at)
            self.snapshots.append(snap)
            self._cond.notify_all()
            return snap

    def latest(self) -> Snapshot | None:
        with self._cond:
            return self.snapshots[-1] if self.snapshots else None

    def wait(
        self,
        pred: Callable[[Snapshot], bool],
        timeout: float,
        after: Snapshot | None = None,
    ) -> Snapshot | None:
        """The first snapshot newer than ``after`` that ``pred`` likes."""
        end = time.monotonic() + timeout
        with self._cond:
            while True:
                for snap in self.snapshots:
                    newer = after is None or snap.seq > after.seq
                    if newer and snap.data != getattr(after, "data", None):
                        if pred(snap):
                            return snap
                left = end - time.monotonic()
                if left <= 0:
                    return None
                self._cond.wait(min(left, 0.5))

    def wait_probe(self, timeout: float) -> str | None:
        end = time.monotonic() + timeout
        with self._cond:
            while self.probe_on is None and not self.snapshots:
                left = end - time.monotonic()
                if left <= 0:
                    return None
                self._cond.wait(min(left, 0.5))
            return self.probe_on or "seen"


# ------------------------------------------------------------ decisions


def has_hebrew(text: str | None) -> bool:
    return bool(text) and bool(HEBREW.search(text))


def center(rect: Sequence[int]) -> tuple[int, int]:
    x, y, w, h = rect
    return int(x + w // 2), int(y + h // 2)


def find_widget(
    snap: Snapshot,
    *,
    id: str | None = None,
    prefix: str | None = None,
    title: str | re.Pattern[str] | None = None,
) -> dict[str, Any] | None:
    for widget in snap.widgets:
        wid = str(widget.get("id", ""))
        if id is not None and wid == id:
            return widget
        if prefix is not None and wid.startswith(prefix):
            return widget
        if title is not None:
            text = str(widget.get("title", ""))
            if isinstance(title, re.Pattern):
                if title.search(text):
                    return widget
            elif text == title:
                return widget
    return None


#: Names a digits pad or a done button may get (the board's keys carry
#: ``char``; pygame_menu buttons an id).
DONE_IDS = ("done", "ok", "pin_done", "pin_ok", "pad_ok", "confirm")


def find_key(snap: Snapshot, char: str) -> dict[str, Any] | None:
    """The key that types ``char``: by its char, else a pad button."""
    for widget in snap.widgets:
        if widget.get("char") == char:
            return widget
    for widget in snap.widgets:
        wid = str(widget.get("id", ""))
        if re.fullmatch(rf"(pad|pin|digit|key)_{re.escape(char)}", wid):
            return widget
    for widget in snap.widgets:
        if str(widget.get("title", "")).strip() == char:
            return widget
    return None


def find_done(snap: Snapshot) -> dict[str, Any] | None:
    for widget in snap.widgets:
        if widget.get("key") == "done":
            return widget
    for widget in snap.widgets:
        wid = str(widget.get("id", ""))
        if wid in DONE_IDS or wid.endswith(("_ok", "_done")):
            return widget
    return None


def screen_kind(snap: Snapshot) -> str:
    """
    "pin" (digits to type), "name" (letters to type), "dialog",
    "choice", "who" (who plays), "intro", or the state's name.
    """
    state = snap.state or ""
    if state == "ProfileSelectState":
        return "who"
    if "Intro" in state or state == "SplashState":
        return "intro"
    if state == "DialogState":
        return "dialog"
    if find_key(snap, "1") is not None and find_done(snap) is not None:
        letters = any(str(w.get("char", "")).isalpha() for w in snap.widgets)
        limit = snap.data.get("char_limit")
        if limit is not None and limit <= 8 or limit is None and not letters:
            return "pin"
        return "name"
    if state == "ChoiceState":
        return "choice"
    return state


def ui_titles(snap: Snapshot) -> list[str]:
    titles = [str(w.get("title", "")) for w in snap.widgets]
    for key in ("prompt", "dialog"):
        if snap.data.get(key):
            titles.append(str(snap.data[key]))
    return [t for t in titles if t.strip()]


def speaks_hebrew(snap: Snapshot) -> bool:
    """Words on the screen, and they are Hebrew (digits do not count)."""
    words = [t for t in ui_titles(snap) if re.search(r"[^\W\d_]", t)]
    return bool(words) and any(has_hebrew(t) for t in words)


@dataclass
class Action:
    """What to tap next: a widget, a point, or nothing (wait)."""

    what: str
    point: tuple[int, int] | None = None

    def __bool__(self) -> bool:
        return self.point is not None


def widget_action(widget: dict[str, Any] | None, what: str) -> Action:
    if widget is None:
        return Action(f"no {what}")
    return Action(what, center(widget["rect"]))


def to_world_action(snap: Snapshot) -> Action:
    """
    One tap towards the map, as the touch tour does: through dialogs,
    the starter monster, choices, the journal and questions.
    """
    w, h = snap.window
    state = snap.state or ""
    widgets = snap.widgets
    if state == "ProfileSelectState":
        return Action("wait for the child's game")
    if state == "StartState":
        return widget_action(find_widget(snap, id="menu_new_game"), "new game")
    if state == "DialogState":
        return Action("next line", (w // 2, h // 3))
    if "Intro" in state or state == "JournalInfoState":
        return Action(f"skip {state}", (w // 2, h // 2))
    if state == "ChoiceMonster":
        pick = widgets[1] if len(widgets) > 1 else (widgets or [None])[0]
        return widget_action(pick, "choose the starter")
    if state == "QuizState":
        for wid in ("example_done", "continue"):
            found = find_widget(snap, id=wid)
            if found is not None:
                return widget_action(found, wid)
        answer = snap.data.get("answer")
        if answer and find_widget(snap, id=answer):
            return widget_action(find_widget(snap, id=answer), "answer")
        return widget_action(
            find_widget(snap, id="footer_dont_know"), "don't know"
        )
    if widgets:
        return widget_action(widgets[0], f"first button of {state}")
    return Action(f"wait on {state}")


GRADE_ONE = re.compile(r"(כיתה א$|^Grade 1$|1)")


def pick_grade(snap: Snapshot) -> Action:
    found = find_widget(snap, title=GRADE_ONE)
    if found is None and snap.widgets:
        found = snap.widgets[0]
    return widget_action(found, "grade")


def typed_right(before: str | None, after: str | None, char: str) -> bool:
    return (before or "") + char == (after or "")


# ------------------------------------------------------------ the device


class Adb:
    def __init__(self, adb: str = "adb", serial: str | None = None) -> None:
        self.base = [adb] + (["-s", serial] if serial else [])

    def run(
        self, *args: Any, timeout: float = 60, check: bool = False
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [*self.base, *(str(a) for a in args)],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=check,
        )

    def shell(self, *args: Any, timeout: float = 60) -> str:
        done = self.run("shell", *args, timeout=timeout)
        return (done.stdout + done.stderr).strip()

    def tap(self, x: int, y: int) -> None:
        self.shell("input", "tap", x, y)

    def hold(self, x: int, y: int, ms: int) -> None:
        self.shell("input", "swipe", x, y, x, y, ms)

    def screenshot(self, path: Path) -> bool:
        with path.open("wb") as out:
            done = subprocess.run(
                [*self.base, "exec-out", "screencap", "-p"],
                stdout=out,
                timeout=60,
            )
        return done.returncode == 0 and path.stat().st_size > 0

    def logcat(self, stream: UIStream) -> subprocess.Popen[str]:
        proc = subprocess.Popen(
            [*self.base, "logcat", "-v", "threadtime"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        def pump() -> None:
            assert proc.stdout is not None
            for line in proc.stdout:
                stream.feed(line)

        threading.Thread(target=pump, name="logcat", daemon=True).start()
        return proc


def set_locale(adb: Adb, locale: str, log: Callable[[str], None]) -> str:
    """
    Sets the phone's language, trying what each Android version
    accepts. Returns the configuration Android reports afterwards.
    """
    under = locale.replace("-", "_")
    tries = [
        ("cmd locale", ["cmd", "locale", "set-system-locales", locale]),
        (
            "custom locale app",
            [
                "am",
                "broadcast",
                "-a",
                "com.android.intent.action.SET_LOCALE",
                "--es",
                "com.android.intent.extra.LOCALE",
                under,
                "com.android.customlocale2",
            ],
        ),
    ]
    lang = locale.split("-")[0]
    names = {lang, {"he": "iw", "iw": "he"}.get(lang, lang)}

    def current() -> str:
        return adb.shell("am", "get-config")

    def matches(config: str) -> bool:
        m = re.search(r"config:\s*(\S+)", config) or re.search(
            r"(\S+-r\w\w)", config
        )
        if not m:
            return False
        first = m.group(1).split(",")[0]
        return any(f"-{n}-" in f"-{first}" for n in names)

    for what, args in tries:
        out = adb.shell(*args)
        time.sleep(3)
        config = current()
        log(f"locale via {what}: {out[:200]!r}")
        if matches(config):
            return config
    # root (google_apis images): the property, then restart Android
    adb.run("root", timeout=60)
    time.sleep(3)
    adb.run("wait-for-device", timeout=120)
    adb.shell("setprop", "persist.sys.locale", locale)
    adb.shell("settings", "put", "system", "system_locales", locale)
    adb.shell("stop")
    adb.shell("start")
    for _ in range(60):
        time.sleep(5)
        if adb.shell("getprop", "sys.boot_completed") == "1":
            break
    time.sleep(10)
    config = current()
    log(f"locale via setprop and restart: {config[:200]!r}")
    return config


# ------------------------------------------------------------ the flow


@dataclass
class Latency:
    what: str
    from_start_ms: int
    from_end_ms: int


@dataclass
class Flow:
    """The steps; ``device`` taps, ``stream`` says what the screen shows."""

    device: Any
    stream: UIStream
    out: Path
    limit_ms: int = 1500
    scale: float = 1.0
    log: Callable[[str], None] = print
    show: Callable[[Path], None] | None = None
    failures: list[str] = field(default_factory=list)
    latencies: list[Latency] = field(default_factory=list)
    shots: list[Path] = field(default_factory=list)
    name: str = NAME

    # -------------------------------------------------- helpers

    def check(self, ok: bool, what: str, *, hard: bool = False) -> bool:
        self.log(("ok   " if ok else "FAIL ") + what)
        if not ok:
            self.failures.append(what)
            if hard:
                raise FlowError(what)
        return ok

    def shot(self, name: str) -> None:
        path = self.out / f"{len(self.shots):02d}-{name}.png"
        try:
            if not self.device.screenshot(path):
                return
        except Exception as exc:
            self.log(f"no screenshot {name}: {exc}")
            return
        self.shots.append(path)
        if self.show is not None:
            self.show(path)

    def now(self) -> Snapshot:
        snap = self.stream.latest()
        if snap is None:
            raise FlowError("the game printed no UI map")
        return snap

    def wait_for(
        self,
        pred: Callable[[Snapshot], bool],
        what: str,
        timeout: float = 20.0,
        *,
        skip_intro: bool = True,
    ) -> Snapshot:
        """Waits for a screen; taps through an intro on the way."""
        end = time.monotonic() + timeout * self.scale
        snap = self.stream.latest()
        while True:
            if snap is not None and pred(snap):
                return snap
            if (
                snap is not None
                and skip_intro
                and screen_kind(snap) == "intro"
            ):
                self.tap(to_world_action(snap), required=False)
            left = end - time.monotonic()
            if left <= 0:
                raise FlowError(
                    f"waited {timeout * self.scale:.0f}s for {what}; the "
                    f"screen is {snap.state if snap else None}"
                )
            snap = (
                self.stream.wait(lambda s: True, min(left, 5.0), after=snap)
                or self.stream.latest()
            )

    def settle(
        self, quiet: float = 0.3, longest: float = 3.0
    ) -> Snapshot | None:
        """The screen once no new UI map came for ``quiet`` seconds."""
        end = time.monotonic() + longest * self.scale
        snap = self.stream.latest()
        while time.monotonic() < end:
            newer = self.stream.wait(
                lambda s: True, quiet * self.scale, after=snap
            )
            if newer is None:
                break
            snap = self.stream.latest()
        return snap

    def tap(
        self,
        action: Action,
        *,
        hold_ms: int | None = None,
        expect: Callable[[Snapshot], bool] = lambda s: True,
        required: bool = True,
        timeout: float = 15.0,
    ) -> Snapshot | None:
        """
        Taps (or holds) the action's point and waits for the screen to
        change; records how long that took.
        """
        if not action:
            raise FlowError(f"nothing to tap: {action.what}")
        before = self.settle()
        x, y = action.point  # type: ignore[misc]
        start = time.monotonic()
        if hold_ms:
            self.device.hold(x, y, hold_ms)
        else:
            self.device.tap(x, y)
        end = time.monotonic()
        snap = self.stream.wait(expect, timeout * self.scale, after=before)
        if snap is None:
            if required:
                raise FlowError(
                    f"tap on {action.what} at {x},{y}: no change in "
                    f"{timeout * self.scale:.0f}s (screen "
                    f"{before.state if before else None})"
                )
            return None
        late = Latency(
            action.what,
            round((snap.at - start) * 1000),
            max(0, round((snap.at - end) * 1000)),
        )
        self.latencies.append(late)
        self.log(
            f"tap {action.what} at {x},{y} -> {snap.state} in "
            f"{late.from_end_ms} ms ({late.from_start_ms} ms from the "
            "start of the adb command)"
        )
        return snap

    def type_text(self, text: str, what: str) -> None:
        """Held taps, one key at a time; the typed text grows by it."""
        for char in text:
            self.settle()
            snap = self.now()
            key = find_key(snap, char)
            self.check(
                key is not None, f"{what}: a key for {char!r}", hard=True
            )
            before = snap.text
            after = self.tap(
                widget_action(key, f"key {char!r}"),
                hold_ms=HOLD_MS,
                expect=lambda s: s.text != snap.text or s.state != snap.state,
            )
            assert after is not None
            if after.state != snap.state and char == text[-1]:
                self.log(f"{what}: the last key moved on to {after.state}")
                return
            got = after.text
            self.check(
                typed_right(before, got, char),
                f"{what}: {before!r} + key {char!r} gives {got!r}",
                hard=True,
            )

    def through_dialogs(self, limit: int = 8) -> Snapshot:
        snap = self.now()
        for _ in range(limit):
            if screen_kind(snap) not in ("dialog", "intro"):
                return snap
            self.tap(to_world_action(snap), required=False, timeout=4)
            snap = self.now()
        return snap

    # -------------------------------------------------- the steps

    def run(self) -> bool:
        try:
            self.steps()
        except FlowError as exc:
            self.failures.append(str(exc))
            self.log(f"FAIL {exc}")
        return not self.failures

    def steps(self) -> None:
        who = self.wait_for(
            lambda s: screen_kind(s) == "who", "who plays", timeout=300
        )
        self.shot("who-plays")
        self.check(
            speaks_hebrew(who),
            f"who-plays speaks Hebrew: {ui_titles(who)}",
        )
        self.check(
            not [
                w for w in who.widgets if str(w.get("id")).startswith("child_")
            ],
            "a fresh install lists no child yet",
        )

        self.tap(widget_action(find_widget(who, id="new_child"), "new player"))
        self.set_pin()

        name = self.wait_for(
            lambda s: screen_kind(s) in ("name", "choice"), "the name screen"
        )
        self.check(screen_kind(name) == "name", "the name screen", hard=True)
        self.check(
            speaks_hebrew(name),
            f"the name screen speaks Hebrew: {name.data.get('prompt')!r}",
        )
        self.check(name.text == "", f"the name starts empty: {name.text!r}")
        typed = NAME
        if find_key(name, NAME[0]) is None:
            # not the Hebrew board: say so, and go on in its letters
            self.check(False, "the name screen has Hebrew letters")
            typed = LATIN_NAME
        self.type_text(typed, "name")
        self.name = typed
        self.shot("name-typed")
        self.tap(widget_action(find_done(self.now()), "done"))
        snap = self.through_dialogs()

        grade = self.wait_for(lambda s: s.state == "ChoiceState", "grades")
        self.shot("grade")
        self.check(
            speaks_hebrew(grade), f"grades in Hebrew: {ui_titles(grade)}"
        )
        self.tap(pick_grade(grade))
        avatar = self.wait_for(
            lambda s: s.state == "ChoiceState" and s.data != grade.data,
            "characters",
        )
        self.shot("character")
        self.tap(widget_action((avatar.widgets or [None])[0], "character"))
        self.through_dialogs()

        who = self.wait_for(
            lambda s: (
                screen_kind(s) == "who"
                and find_widget(s, prefix="child_") is not None
            ),
            "who plays with the child",
        )
        self.shot("who-plays-child")
        child = find_widget(who, prefix="child_")
        assert child is not None
        self.check(
            self.name in str(child.get("title")),
            f"the child: {child.get('title')!r}",
        )
        self.tap(
            widget_action(child, "the child"),
            expect=lambda s: s.state != "ProfileSelectState",
        )

        snap = self.walk_to_world()
        self.walk(snap)

    def set_pin(self) -> None:
        pin = self.wait_for(
            lambda s: screen_kind(s) in ("pin", "name"), "the PIN screen"
        )
        self.shot("pin")
        self.check(screen_kind(pin) == "pin", "the PIN screen", hard=True)
        self.check(
            speaks_hebrew(pin),
            f"the PIN screen speaks Hebrew: {pin.data.get('prompt')!r}",
        )
        for round_ in ("PIN", "PIN again"):
            pin = self.now()
            state = pin.state
            self.type_text(PIN, round_)
            snap = self.now()
            self.shot(round_.replace(" ", "-").lower())
            if snap.state == state and find_done(snap) is not None:
                self.tap(widget_action(find_done(snap), "done"))
            snap = self.through_dialogs()
            if screen_kind(snap) != "pin" or snap.text:
                return
            self.log("asked for the PIN again: confirming it")
        self.check(False, "the PIN screen came a third time", hard=True)

    def walk_to_world(self) -> Snapshot:
        seen: list[str] = []
        snap = self.now()
        for _ in range(80):
            if snap.state == "WorldState":
                self.check(
                    "StartState" in seen, f"the title on the way: {seen}"
                )
                self.shot("map")
                return snap
            name = snap.state or "?"
            if not seen or seen[-1] != name:
                seen.append(name)
                if name in ("StartState", "ChoiceMonster", "QuizState"):
                    self.shot(name)
            action = to_world_action(snap)
            if not action:
                snap = (
                    self.stream.wait(
                        lambda s: True, 5 * self.scale, after=snap
                    )
                    or self.now()
                )
                continue
            got = self.tap(action, required=False, timeout=6)
            snap = got or self.now()
        raise FlowError(f"never reached the map; screens: {seen}")

    def walk(self, snap: Snapshot) -> None:
        snap = self.wait_for(
            lambda s: s.state == "WorldState" and bool(s.data.get("arrows")),
            "the arrows on the map",
        )
        self.check(
            bool(snap.data.get("arrows_shown")), "arrows shown on the map"
        )
        start = snap.data.get("player")
        self.check(start is not None, f"the player is on tile {start}")
        for arrow in ("right", "left", "down", "up"):
            rect = snap.data["arrows"][arrow]
            moved = self.tap(
                Action(f"hold the {arrow} arrow", center(rect)),
                hold_ms=1200,
                expect=lambda s: (
                    s.state == "WorldState" and s.data.get("player") != start
                ),
                required=False,
                timeout=6,
            )
            if moved is not None:
                self.log(
                    f"walked {arrow}: {start} -> {moved.data.get('player')}"
                )
                self.shot("walked")
                return
        self.check(False, f"holding an arrow walks (stayed on {start})")

    # -------------------------------------------------- the report

    def slow_taps(self) -> list[Latency]:
        return [t for t in self.latencies if t.from_end_ms > self.limit_ms]

    def report(self) -> list[str]:
        out = [
            "tap -> answer (ms after the tap; from the adb command's start)"
        ]
        for t in self.latencies:
            out.append(
                f"  {t.from_end_ms:5d} ({t.from_start_ms:5d})  {t.what}"
            )
        if self.latencies:
            worst = max(self.latencies, key=lambda t: t.from_end_ms)
            out.append(f"  slowest: {worst.from_end_ms} ms, {worst.what}")
        out.append("frame rate lines:")
        out.extend(f"  {line}" for line in self.stream.frame_lines)
        return out


def judge(flow: Flow) -> bool:
    """Every check passed and no tap took longer than the limit."""
    for slow in flow.slow_taps():
        flow.check(
            False,
            f"{slow.what} answered after {slow.from_end_ms} ms "
            f"(limit {flow.limit_ms})",
        )
    return not flow.failures


# ------------------------------------------------------------ main


def show_screenshot(path: Path) -> None:
    subprocess.run(
        [sys.executable, str(HERE / "screen_shape.py"), "show", str(path)]
    )


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--out", type=Path, default=Path("smoke/e2e"))
    parser.add_argument("--locale", default="he-IL")
    parser.add_argument("--package", default=PKG)
    parser.add_argument("--limit-ms", type=int, default=1500)
    parser.add_argument("--serial")
    args = parser.parse_args(list(argv) if argv is not None else None)
    args.out.mkdir(parents=True, exist_ok=True)
    adb = Adb(serial=args.serial)
    pkg = args.package

    config = set_locale(adb, args.locale, print)
    print(f"the phone's language: {config.splitlines()[0] if config else '?'}")
    # a fresh install: no data, as on a new phone
    print("clearing the app's data:", adb.shell("pm", "clear", pkg))
    adb.shell("am", "force-stop", pkg)
    adb.run("logcat", "-c")
    stream = UIStream()
    logcat = adb.logcat(stream)
    flow = Flow(
        adb, stream, args.out, limit_ms=args.limit_ms, show=show_screenshot
    )
    print(
        "starting with the UI map:",
        adb.shell(
            "am",
            "start",
            "-n",
            f"{pkg}/{ACTIVITY}",
            "--es",
            "nagmon_probe",
            "1",
        ),
    )
    time.sleep(5)
    pid = adb.shell("pidof", pkg)
    stream.pid = (
        int(pid.split()[0])
        if pid.split() and pid.split()[0].isdigit()
        else None
    )
    if stream.wait_probe(180) is None:
        print("no UI map yet; trying the flag file as well")
        folder = f"/sdcard/Android/data/{pkg}/files"
        adb.shell("mkdir", "-p", folder)
        adb.shell("touch", f"{folder}/nagmon_probe")
        if stream.wait_probe(120) is None:
            flow.failures.append(
                "the app printed no UI map (an APK from before tuxemon/ui_probe.py?)"
            )
    if not flow.failures:
        print(f"UI map on ({stream.probe_on})")
        flow.run()
    ok = judge(flow)
    if flow.shots:
        size = flow.shots[0].read_bytes()[16:24]
        width, height = (
            int.from_bytes(size[:4], "big"),
            int.from_bytes(size[4:], "big"),
        )
        snap = stream.latest()
        if snap is not None:
            print(
                f"screenshot {width}x{height}, the game's window {snap.window}, "
                f"drawing {snap.data.get('logical')}"
            )
    for line in flow.report():
        print(line)
    (args.out / "logcat-app.txt").write_text(
        "\n".join(stream.app_lines) + "\n"
    )
    if not ok:
        flow.shot("failure")
        print("::group::the app's last 300 log lines")
        for line in stream.app_lines:
            print(line)
        print("::endgroup::")
        print("FAILED:")
        for failure in flow.failures:
            print(f"  {failure}")
    else:
        print(f"the first run plays through on the emulator ({args.locale})")
    logcat.terminate()
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
