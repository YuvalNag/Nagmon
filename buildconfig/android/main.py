# SPDX-License-Identifier: GPL-3.0
"""
The Android app's entry point: python-for-android runs ``main.py``
(docs/kids/SDD_ANDROID.md §2.4). Sets up the phone's environment before
anything from Tuxemon reads a path, then starts the game under the crash
guard (§2.6): if it breaks, the parent is offered a report to send.
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


def offer(text: str) -> None:
    from nagmon.android.crash_dialog import offer as ask_and_share

    ask_and_share(text)


def saved_keys():
    from nagmon.ai.config import load_keys
    from tuxemon.constants import paths

    return load_keys(paths.USER_STORAGE_DIR / "nagmon").values()


guard = CrashGuard(
    CrashReports(Path(os.environ.get("ANDROID_PRIVATE", APP)) / "crash"),
    info=build_details,
    offer=offer,
    secrets=saved_keys,
)


def start() -> None:
    import run_tuxemon
    from run_tuxemon import launch_game

    run_tuxemon.on_fatal_error = guard.report
    sys.argv = [str(APP / "run_tuxemon.py")]
    launch_game()


guard.run(start)
