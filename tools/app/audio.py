# SPDX-License-Identifier: GPL-3.0
"""Music and sounds: only the slugs the world uses, copied as they are.

The files are OGG Vorbis (a few sounds are WAV or MP3). Android's
WebView (Chrome) plays OGG, WAV and MP3, so nothing is re-encoded; an
iOS build would need the OGG files as AAC/MP3 (WebKit has no Vorbis).
"""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import PurePosixPath
from typing import Any

from tools.app.common import Output, mod_file
from tools.app.db import table


def build(
    out: Output, music: Iterable[str], sounds: Iterable[str]
) -> dict[str, Any]:
    music_db = table("music")
    sounds_db = table("sounds")
    tracks: dict[str, str] = {}
    missing: list[str] = []
    for slug in sorted(set(music)):
        rec = music_db.get(slug)
        src = mod_file(f"music/{rec['file']}") if rec else None
        if src is None:
            missing.append(f"music {slug}")
            continue
        dest = f"audio/music/{PurePosixPath(rec['file']).name}"
        out.add_copy(dest, src, "music")
        tracks[slug] = dest
    sfx: dict[str, str] = {}
    for slug in sorted(set(sounds)):
        rec = sounds_db.get(slug)
        src = mod_file(f"sounds/{rec['file']}") if rec else None
        if src is None:
            missing.append(f"sound {slug}")
            continue
        dest = f"audio/sfx/{rec['file']}"
        out.add_copy(dest, src, "sound")
        sfx[slug] = dest
    out.add_json("db/music.json", tracks)
    out.add_json("db/sounds.json", sfx)
    out.notes += [f"no file for {m}" for m in missing]
    formats = sorted(
        {PurePosixPath(p).suffix for p in [*tracks.values(), *sfx.values()]}
    )
    return {
        "music": len(tracks),
        "sounds": len(sfx),
        "formats": formats,
        "missing": missing,
    }
