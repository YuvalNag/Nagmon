# SPDX-License-Identifier: GPL-3.0
"""
The Android app's entry point: python-for-android runs ``main.py``
(docs/kids/SDD_ANDROID.md §2.4). Sets up the phone's environment before
anything from Tuxemon reads a path, starts the app's own log
(SDD_FIELD_DATA.md §2.2), then starts the game under the crash guard
(§2.6): if it breaks, the parent is offered a report to send, to the
private GitHub data repo when connected, else through the share sheet.
"""

import json
import os
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent
os.chdir(APP)
if str(APP) not in sys.path:
    sys.path.insert(0, str(APP))

from nagmon.android.setup import prepare_environment  # noqa: E402
from nagmon.crash_report import CrashGuard, CrashReports  # noqa: E402

prepare_environment(os.environ)

CRASH_DIR = Path(os.environ.get("ANDROID_PRIVATE", APP)) / "crash"


def data_root() -> Path:
    from tuxemon.constants import paths

    return paths.USER_STORAGE_DIR / "nagmon"


def build_details() -> dict:
    """The build (from stage.py) and the phone."""
    try:
        details = json.loads((APP / "build_info.json").read_text())
    except (OSError, ValueError):
        details = {}
    try:
        from nagmon.android.crash_dialog import phone_details

        details.update(phone_details())
    except Exception as exc:
        details["phone"] = f"unknown ({exc})"
    details["python"] = sys.version.split()[0]
    return details


def start_log() -> None:
    """The app's log from the first line; a failure only loses the log."""
    try:
        from nagmon.field_data import app_log

        app_log.install(data_root(), details=build_details())
    except Exception as exc:
        print(f"Nagmon: no app log ({exc})")


def log_tail() -> str:
    from nagmon.field_data import app_log

    return app_log.tail(100)


def field_data():
    from nagmon.field_data.uploads import FieldData

    return FieldData(data_root(), crash_dir=CRASH_DIR)


def offer(text: str) -> None:
    from nagmon.android.crash_dialog import offer as ask_and_send
    from nagmon.android.crash_dialog import share
    from nagmon.field_data import app_log
    from nagmon.field_data.uploads import send_crash_or_share

    app_log.note_crash()
    app_log.save()
    try:
        field = field_data()
        repo = field.repo if field.connected else None
    except Exception:  # no GitHub: the share sheet, as before
        field, repo = None, None
    ask_and_send(
        text,
        send=lambda report: send_crash_or_share(report, field, share),
        repo=repo,
    )


def saved_keys():
    """The AI keys and the GitHub token, hidden in the report."""
    return field_data().secrets()


guard = CrashGuard(
    CrashReports(CRASH_DIR),
    info=build_details,
    offer=offer,
    secrets=saved_keys,
    log=log_tail,
)


def start() -> None:
    import run_tuxemon
    from run_tuxemon import launch_game

    run_tuxemon.on_fatal_error = guard.report
    sys.argv = [str(APP / "run_tuxemon.py")]
    launch_game()


start_log()
guard.run(start)
