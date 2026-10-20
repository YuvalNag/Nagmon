# SPDX-License-Identifier: GPL-3.0
"""
The environment the game needs on a phone, set up by the app's
``main.py`` before anything from Tuxemon is imported (SDD_ANDROID §2.3).
"""

from __future__ import annotations

import logging
from collections.abc import Callable, MutableMapping

logger = logging.getLogger(__name__)


def _certifi_file() -> str:
    import certifi

    return str(certifi.where())


def prepare_environment(
    env: MutableMapping[str, str],
    *,
    cafile: Callable[[], str] = _certifi_file,
) -> None:
    """
    * HOME: the app's private folder (``ANDROID_PRIVATE``), where
      ``~/.tuxemon`` with the children's profiles lives. Android gives the
      app no home folder of its own, and private storage is not readable
      by other apps.
    * SSL_CERT_FILE: Python on Android has no certificate store, so HTTPS
      (the owl, online voices) needs certifi's bundle.
    * SDL_IOS_ORIENTATIONS (SDL's orientation hint, on Android too): the
      game only turns sideways. Without it SDL asks Android for the shape
      of the window it creates, which is the portrait desktop while the
      app starts, and the game opened upright and small (build 21).

    Values that are already set are kept.
    """
    private = env.get("ANDROID_PRIVATE")
    if private and not env.get("HOME"):
        env["HOME"] = private
    env.setdefault("SDL_IOS_ORIENTATIONS", "LandscapeLeft LandscapeRight")
    if env.get("SSL_CERT_FILE"):
        return
    try:
        env["SSL_CERT_FILE"] = cafile()
    except Exception as exc:  # no certifi: HTTPS stays off, the game runs
        logger.warning("No certificate bundle for HTTPS: %s", exc)
