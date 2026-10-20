# SPDX-License-Identifier: GPL-3.0
"""
The UI map for the emulator check (docs/kids/SDD_ANDROID.md §5.1).

When switched on, the game prints what is on the screen, so a test can
tap a button or a key by its name instead of by guessed pixels::

    NAGMON_UI 12 1/1 {"state": "InputMenu", "widgets": [...], ...}

``12`` counts the snapshots, ``1/1`` is the part: logcat cuts a line
after about 4000 bytes, so a long snapshot comes in several lines with
the same number. A snapshot is printed when the screen changed and
stayed so for one more sample (no half-slid menus), and again every
few seconds. Rects are ``[x, y, w, h]`` in the screen's own pixels,
which is what ``adb shell input tap`` takes.

Off by default; when off ``start`` returns None and the game loop only
tests that. Switched on by:

* ``NAGMON_PROBE=1`` in the environment (a computer);
* on Android, the extra ``nagmon_probe`` of the intent that opened the
  app: ``adb shell am start -n PKG/org.kivy.android.PythonActivity
  --es nagmon_probe 1`` (any build, nothing to push);
* on Android, a file ``nagmon_probe`` in the app's external files folder
  (``/sdcard/Android/data/PKG/files/``), which ``adb push`` can write.
"""

from __future__ import annotations

import json
import logging
import os
import time
from collections.abc import Callable, Iterable, Mapping
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

PREFIX = "NAGMON_UI"
FLAG = "nagmon_probe"
#: Characters of JSON per logcat line (Hebrew is escaped, so ASCII).
CHUNK = 900

Rect4 = list[int]


# ------------------------------------------------------------ switching on


def _android_intent_flag() -> bool:
    from jnius import autoclass

    activity = autoclass("org.kivy.android.PythonActivity").mActivity
    intent = activity.getIntent()
    if intent is None:
        return False
    value = intent.getStringExtra(FLAG)
    return bool(value) and value not in ("0", "false", "no")


def _android_external_dir() -> Path | None:
    from jnius import autoclass

    activity = autoclass("org.kivy.android.PythonActivity").mActivity
    folder = activity.getExternalFilesDir(None)
    return Path(folder.getAbsolutePath()) if folder is not None else None


def wanted(
    env: Mapping[str, str] | None = None,
    *,
    android: bool | None = None,
    intent_flag: Callable[[], bool] = _android_intent_flag,
    folders: Callable[[], Iterable[Path | None]] | None = None,
) -> str | None:
    """Why the probe is on ("env", "intent", "file"), or None."""
    env = os.environ if env is None else env
    if env.get("NAGMON_PROBE", "") not in ("", "0"):
        return "env"
    if android is None:
        from tuxemon.platform import mobile

        android = mobile.is_android(env)
    if not android:
        return None
    try:
        if intent_flag():
            return "intent"
    except Exception as exc:
        logger.debug("No intent for the UI probe: %s", exc)
    if folders is None:

        def folders() -> Iterable[Path | None]:
            yield _android_external_dir()
            private = env.get("ANDROID_PRIVATE")
            yield Path(private) if private else None

    try:
        for folder in folders():
            if folder is not None and (folder / FLAG).exists():
                return "file"
    except Exception as exc:
        logger.debug("No folder for the UI probe: %s", exc)
    return None


# ------------------------------------------------------------ geometry


def screen_mapping(
    logical: tuple[int, int], window: tuple[int, int]
) -> tuple[float, float, float]:
    """
    Scale and offset from the drawing surface to the window: SDL's
    SCALED mode keeps the shape and centres it (black bars if the shapes
    differ).
    """
    lw, lh = logical
    ww, wh = window
    if lw <= 0 or lh <= 0 or ww <= 0 or wh <= 0:
        return 1.0, 0.0, 0.0
    scale = min(ww / lw, wh / lh)
    return scale, (ww - lw * scale) / 2, (wh - lh * scale) / 2


def to_screen(rect: Any, mapping: tuple[float, float, float]) -> Rect4:
    scale, dx, dy = mapping
    x, y, w, h = (int(v) for v in rect)
    return [
        round(x * scale + dx),
        round(y * scale + dy),
        round(w * scale),
        round(h * scale),
    ]


# ------------------------------------------------------------ the snapshot


def _pygame_menu_widgets(menu: Any, mapping: Any) -> list[dict[str, Any]]:
    out = []
    for widget in menu.get_widgets():
        try:
            if not widget.is_visible() or not widget.is_selectable:
                continue
            rect = widget.get_rect(to_real_position=True)
        except Exception:
            continue
        if rect.width <= 0 or rect.height <= 0:
            continue
        out.append(
            {
                "id": widget.get_id(),
                "title": str(widget.get_title()),
                "rect": to_screen(rect, mapping),
            }
        )
    return out


def _classic_items(state: Any, mapping: Any) -> list[dict[str, Any]]:
    """The items of a classic Tuxemon menu; the keys of the letter board."""
    items = state.menu_items
    try:
        items.update_rect_from_parent()
    except Exception:
        pass
    origin = items.rect.topleft
    actions = {
        "done": getattr(state, "confirm", None),
        "delete": getattr(state, "backspace", None),
    }
    out = []
    for item in items:
        if not getattr(item, "enabled", True):
            continue
        rect = item.rect.move(origin)
        if rect.width <= 0 or rect.height <= 0:
            continue
        entry: dict[str, Any] = {"rect": to_screen(rect, mapping)}
        obj = getattr(item, "game_object", None)
        char = getattr(obj, "char", None)
        action = getattr(obj, "action", None)
        if char is not None:
            entry["char"] = char
        for name, method in actions.items():
            if method is not None and action == method:
                entry["key"] = name
        if char is None and "key" not in entry:
            entry["key"] = "button"
        if getattr(item, "label", None):
            entry["title"] = str(item.label)
        out.append(entry)
    return out


def _world(client: Any, mapping: Any) -> dict[str, Any]:
    from tuxemon.session import local_session

    out: dict[str, Any] = {}
    try:
        out["player"] = list(local_session.player.tile_pos)
    except Exception:
        pass
    overlay = getattr(
        getattr(client.input_manager, "core_devices", None), "overlay", None
    )
    if overlay is not None:
        out["arrows_shown"] = bool(getattr(overlay, "active", False))
        try:
            dpad = overlay.ui.dpad.rect
            out["arrows"] = {
                name: to_screen(getattr(dpad, name), mapping)
                for name in ("up", "down", "left", "right")
            }
        except Exception:
            pass
    return out


def snapshot(
    client: Any, window: tuple[int, int] | None = None
) -> dict[str, Any]:
    """What is on the screen now, as plain data."""
    states = list(client.active_states)
    lw, lh = client.context.resolution
    logical = (int(lw), int(lh))
    if window is None:
        import pygame

        try:
            ww, wh = pygame.display.get_window_size()
            window = (int(ww), int(wh))
        except Exception:
            window = logical
    mapping = screen_mapping(logical, window)
    snap: dict[str, Any] = {
        "state": states[0].name if states else None,
        "stack": [s.name for s in states],
        "logical": list(logical),
        "window": list(window),
        "widgets": [],
    }
    if not states:
        return snap
    top = states[0]
    menu = getattr(top, "_menu", None)
    if menu is not None and hasattr(menu, "get_widgets"):
        snap["widgets"] = _pygame_menu_widgets(menu, mapping)
    elif hasattr(top, "menu_items"):
        snap["widgets"] = _classic_items(top, mapping)
    controller = getattr(top, "input_controller", None)
    if controller is not None:
        snap["text"] = controller.current_string
        snap["char_limit"] = controller.char_limit
        display = getattr(top, "input_display", None)
        prompt = getattr(getattr(display, "prompt", None), "text", None)
        if prompt is not None:
            snap["prompt"] = str(prompt)
    box = getattr(top, "dialog_box", None)
    if box is not None:
        snap["dialog"] = str(getattr(box, "text", ""))[:160]
    extra = getattr(top, "probe_info", None)
    if callable(extra):
        snap.update(extra())
    if top.name == "WorldState":
        snap.update(_world(client, mapping))
    return snap


def lines(seq: int, payload: str, chunk: int = CHUNK) -> list[str]:
    """The logcat lines of one snapshot."""
    parts = [payload[i : i + chunk] for i in range(0, len(payload), chunk)]
    parts = parts or [""]
    return [
        f"{PREFIX} {seq} {i + 1}/{len(parts)} {part}"
        for i, part in enumerate(parts)
    ]


class UIProbe:
    """Prints the UI map when the screen changes (see the module)."""

    def __init__(
        self,
        echo: Callable[[str], object] = print,
        clock: Callable[[], float] = time.monotonic,
        sample_every: float = 0.05,
        heartbeat: float = 5.0,
        take: Callable[[Any], dict[str, Any]] = snapshot,
    ) -> None:
        self._echo = echo
        self._clock = clock
        self.sample_every = sample_every
        self.heartbeat = heartbeat
        self._take = take
        self._next_sample = 0.0
        self._previous: str | None = None
        self._printed: str | None = None
        self._printed_at = 0.0
        self.seq = 0

    def frame(self, client: Any) -> None:
        now = self._clock()
        if now < self._next_sample:
            return
        self._next_sample = now + self.sample_every
        try:
            data = self._take(client)
            current = json.dumps(data, ensure_ascii=True, sort_keys=True)
        except Exception as exc:  # never stops the game
            logger.debug("UI probe failed: %s", exc)
            return
        stable = current == self._previous
        self._previous = current
        changed = current != self._printed
        if (changed and stable) or (
            not changed and now - self._printed_at >= self.heartbeat
        ):
            self.print(current, now)

    def print(self, payload: str, now: float | None = None) -> None:
        self.seq += 1
        for line in lines(self.seq, payload):
            self._echo(line)
        self._printed = payload
        self._printed_at = self._clock() if now is None else now


def start(env: Mapping[str, str] | None = None) -> UIProbe | None:
    """The probe when it is switched on, else None (the default)."""
    why = wanted(env)
    if why is None:
        return None
    print(f"{PREFIX} probe on ({why})")
    return UIProbe()
