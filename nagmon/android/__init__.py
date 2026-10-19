# SPDX-License-Identifier: GPL-3.0
"""
Nagmon on an Android phone (docs/kids/SDD_ANDROID.md).

Everything here is plain Python that also runs (and is tested) on a PC;
only ``jnius_tts`` talks to Java and is imported on the phone alone.
"""

from __future__ import annotations

from tuxemon.platform.mobile import is_android

__all__ = ["is_android"]
