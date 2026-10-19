# SPDX-License-Identifier: GPL-3.0
"""
The phone's clipboard (docs/kids/SDD_FIELD_DATA.md §2.4), for pasting the
GitHub token in the parent area. Uses pyjnius, so it runs only on the
phone; the logic it serves is in ``nagmon/field_data/clipboard.py``.

Android reads the clipboard only for the app on screen, and its
ClipboardManager wants Android's own (UI) thread, so the read runs there
and the game's thread waits for it.
"""

from __future__ import annotations

import threading

from jnius import autoclass, cast


def paste(*, timeout: float = 5.0) -> str:
    """The clipboard's first item as text, or ""."""
    from android.runnable import run_on_ui_thread

    done = threading.Event()
    found: dict[str, str] = {}

    @run_on_ui_thread
    def read() -> None:
        try:
            activity = autoclass("org.kivy.android.PythonActivity").mActivity
            context = autoclass("android.content.Context")
            service = activity.getSystemService(context.CLIPBOARD_SERVICE)
            # getSystemService returns an Object: cast to reach its methods.
            manager = cast("android.content.ClipboardManager", service)
            clip = manager.getPrimaryClip() if manager else None
            if clip is not None and clip.getItemCount() > 0:
                text = clip.getItemAt(0).coerceToText(activity)
                found["text"] = text.toString() if text is not None else ""
        finally:
            done.set()

    read()
    done.wait(timeout)
    return found.get("text", "")
