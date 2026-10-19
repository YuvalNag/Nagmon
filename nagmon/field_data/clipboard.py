# SPDX-License-Identifier: GPL-3.0
"""
The token from the clipboard (docs/kids/SDD_FIELD_DATA.md §2.4): on the
phone through Android's ClipboardManager (``nagmon/android/clipboard.py``),
on a computer through pyperclip. What is on the clipboard is never logged.
"""

from __future__ import annotations

import logging
import os
import re

logger = logging.getLogger(__name__)

#: A fine-grained token, or a classic one.
TOKEN = re.compile(r"github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}")

#: Set by python-for-android (as in tuxemon.platform.mobile).
_P4A = ("ANDROID_ARGUMENT", "ANDROID_PRIVATE", "ANDROID_APP_PATH")


def _on_android() -> bool:
    return any(os.environ.get(name) for name in _P4A)


def find_token(text: str | None) -> str | None:
    """The token, if the clipboard holds one and nothing else."""
    if not text:
        return None
    text = text.strip()
    return text if TOKEN.fullmatch(text) else None


def read_clipboard() -> str:
    """The clipboard's text, or "" (empty, or no clipboard here)."""
    if _on_android():
        from nagmon.android.clipboard import paste

        return paste() or ""
    import pyperclip

    try:
        return pyperclip.paste() or ""
    except pyperclip.PyperclipException as exc:
        logger.warning("No clipboard on this computer: %s", exc)
        return ""
