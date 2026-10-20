# SPDX-License-Identifier: GPL-3.0
"""Let a parent try the voices on this PC.

python -m nagmon.tts.cli "שלום, מה שלומך?" --lang he
python -m nagmon.tts.cli "Hello" --lang en --online
python -m nagmon.tts.cli --list-voices
"""

from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Callable, Sequence
from dataclasses import replace
from pathlib import Path

from nagmon.tts.backends import Backend, Pyttsx3Backend
from nagmon.tts.factory import build_backends, default_cache_dir
from nagmon.tts.factory import default_player as _default_player
from nagmon.tts.player import Player
from nagmon.tts.service import TTSService
from nagmon.tts.settings import TTSSettings


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m nagmon.tts.cli",
        description="בדיקת קולות ההקראה של נגמון",
    )
    p.add_argument("text", nargs="?", help="הטקסט להקראה")
    p.add_argument("--lang", choices=("he", "en"), default="he")
    p.add_argument(
        "--online",
        action="store_true",
        help="לאפשר קול מהאינטרנט (Microsoft Edge)",
    )
    p.add_argument("--voice", help="שם קול מקוון, למשל he-IL-AvriNeural")
    p.add_argument("--offline-voice", help="חלק משם קול במחשב, למשל Asaf")
    p.add_argument("--rate", help='קצב, למשל "-20%%"')
    p.add_argument("--cache-dir", type=Path)
    p.add_argument(
        "--list-voices", action="store_true", help="רשימת הקולות במחשב"
    )
    return p


def _utf8_stdout() -> None:
    try:
        sys.stdout.reconfigure(errors="replace")  # type: ignore[union-attr]
    except Exception:
        pass


def main(
    argv: Sequence[str] | None = None,
    *,
    backends_factory: Callable[[TTSSettings], list[Backend]] | None = None,
    player: Player | None = None,
) -> int:
    _utf8_stdout()
    os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
    parser = _parser()
    args = parser.parse_args(argv)
    lang = args.lang
    settings = TTSSettings(allow_online=args.online)
    if args.voice:
        settings = replace(settings, **{f"voice_{lang}": args.voice})
    if args.offline_voice:
        settings = replace(
            settings, **{f"offline_voice_{lang}": args.offline_voice}
        )
    if args.rate:
        settings = replace(settings, **{f"rate_{lang}": args.rate})

    if args.list_voices:
        voices = Pyttsx3Backend(settings).list_voices()
        print("קולות במחשב:" if voices else "לא נמצאו קולות במחשב.")
        for v in voices:
            print(f"  [{v['lang'] or '?'}] {v['name']}  ({v['id']})")
        print(f"קול מקוון בעברית: {settings.voice_he}")
        print(f"קול מקוון באנגלית: {settings.voice_en}")
        return 0
    if not args.text:
        parser.error("צריך טקסט להקראה")

    backends = (backends_factory or build_backends)(settings)
    if player is None:
        player = _default_player(settings)
    service = TTSService(
        backends,
        args.cache_dir or default_cache_dir(),
        player,
        settings=settings,
    )
    try:
        for code, backend_id in service.voice_status().items():
            print(f"{code}: {backend_id or 'אין קול'}")
        service.speak(args.text, lang)
        service.wait_idle(timeout=120)
        for clip in service.history:
            print(f"[{clip.backend_id}] {clip.lang}: {clip.text}")
            print(f"  {clip.path}")
        if service.last_error is not None:
            print(f"שגיאה: {service.last_error.message_he}")
            if service.last_error.detail:
                print(f"  ({service.last_error.detail})")
        return 0 if service.history else 1
    finally:
        service.shutdown()


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
