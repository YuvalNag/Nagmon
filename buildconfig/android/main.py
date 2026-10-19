# SPDX-License-Identifier: GPL-3.0
"""
The Android app's entry point: python-for-android runs ``main.py``
(docs/kids/SDD_ANDROID.md §2.4). Sets up the phone's environment before
anything from Tuxemon reads a path, then starts the game.
"""

import os
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent
os.chdir(APP)
if str(APP) not in sys.path:
    sys.path.insert(0, str(APP))

from nagmon.android.setup import prepare_environment  # noqa: E402

prepare_environment(os.environ)

from run_tuxemon import launch_game  # noqa: E402

sys.argv = [str(APP / "run_tuxemon.py")]
launch_game()
