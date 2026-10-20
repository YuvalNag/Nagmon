# SPDX-License-Identifier: GPL-3.0
"""
The phone's side of the crash report (docs/kids/SDD_ANDROID.md §2.6):
the phone's details, a window that asks the parent, and Android's share
sheet; when the parent connected GitHub, "send" goes to the private data
repo instead (SDD_FIELD_DATA.md §2.5). Uses pyjnius, so it runs only on
the phone; the logic it serves is in ``nagmon/crash_report.py`` and
tested there.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable

from jnius import PythonJavaClass, autoclass, java_method

TITLE = "המשחק נעצר"
MESSAGE = (
    "קרתה תקלה. אפשר לשלוח את הפרטים כדי שנתקן אותה. "
    "לפני השליחה רואים בדיוק מה נשלח, ואין בפרטים מפתחות או נתונים של הילדים."
)
#: When GitHub is connected: says where the report goes.
MESSAGE_GITHUB = (
    "קרתה תקלה. אפשר לשלוח את הפרטים לריפו הנתונים הפרטי {repo} "
    "כדי שנתקן אותה. אין בפרטים מפתחות או נתונים של הילדים."
)
SEND = "שליחה"
CLOSE = "סגירה"
SHARE_TITLE = "שליחת פרטי התקלה"
SUBJECT = "Nagmon crash report"

#: DialogInterface.BUTTON_POSITIVE
_SEND_BUTTON = -1


def _activity():
    return autoclass("org.kivy.android.PythonActivity").mActivity


def _jstr(text: str):
    return autoclass("java.lang.String")(text)


class _Click(PythonJavaClass):
    __javainterfaces__ = ["android/content/DialogInterface$OnClickListener"]
    __javacontext__ = "app"

    def __init__(self, on_click) -> None:
        super().__init__()
        self._on_click = on_click

    @java_method("(Landroid/content/DialogInterface;I)V")
    def onClick(self, dialog, which) -> None:
        self._on_click(which)


def phone_details() -> dict[str, str]:
    build = autoclass("android.os.Build")
    version = autoclass("android.os.Build$VERSION")
    return {
        "device": f"{build.MANUFACTURER} {build.MODEL}",
        "android": f"{version.RELEASE} (API {version.SDK_INT})",
    }


def share(
    text: str, *, subject: str = SUBJECT, title: str = SHARE_TITLE
) -> None:
    """Android's share sheet with ``text`` (the report, or the log)."""
    intent_class = autoclass("android.content.Intent")
    intent = intent_class(intent_class.ACTION_SEND)
    intent.setType("text/plain")
    intent.putExtra(intent_class.EXTRA_SUBJECT, _jstr(subject))
    intent.putExtra(intent_class.EXTRA_TEXT, _jstr(text))
    _activity().startActivity(intent_class.createChooser(intent, _jstr(title)))


def offer(
    text: str,
    *,
    send: Callable[[str], object] | None = None,
    repo: str | None = None,
    timeout: float = 600.0,
) -> None:
    """
    Asks the parent; sends only on "send". Blocks the game's thread
    until they answer (the window runs on Android's own thread).

    ``send`` (default: the share sheet) returns "share" when it opened the
    share sheet; ``repo`` names the data repo in the message.
    """
    message = MESSAGE_GITHUB.format(repo=repo) if repo else MESSAGE
    from android.runnable import run_on_ui_thread

    answered = threading.Event()
    choice: dict[str, int] = {}

    def on_click(which: int) -> None:
        choice["which"] = which
        answered.set()

    listener = _Click(on_click)  # kept alive here while the window is open

    @run_on_ui_thread
    def show() -> None:
        builder = autoclass("android.app.AlertDialog$Builder")(_activity())
        builder.setTitle(_jstr(TITLE))
        builder.setMessage(_jstr(message))
        builder.setPositiveButton(_jstr(SEND), listener)
        builder.setNegativeButton(_jstr(CLOSE), listener)
        builder.setCancelable(False)
        builder.show()

    show()
    answered.wait(timeout)
    if choice.get("which") != _SEND_BUTTON:
        return
    if send is None:
        share(text)
        how: object = "share"
    else:
        how = send(text)
    if how == "share":
        time.sleep(3)  # let the share sheet open before the game exits
