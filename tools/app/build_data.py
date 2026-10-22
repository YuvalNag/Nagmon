# SPDX-License-Identifier: GPL-3.0
"""Build the new app's data into ``app/public/game`` (docs/app/SDD.md §2).

    python tools/app/build_data.py           # regenerate everything
    python tools/app/build_data.py --check   # fail if it is out of date

One source for everything the app ships: the learning content, the
battle's moves and numbers, the texts, the four maps with their atlases,
the database subset with its
sprites, the music and sounds, the emoji subset and the credits.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from tools.app import (  # noqa: E402
    art2,
    audio,
    content,
    credits,
    db,
    display,
    economy,
    emoji,
    i18n,
    lessons,
    maps,
    moves,
    npcs,
    objects,
    quests,
    solar_maps,
    trips,
)
from tools.app.common import OUT, Output  # noqa: E402


def build() -> tuple[Output, dict[str, Any]]:
    out = Output()
    report: dict[str, Any] = {}
    report["content"] = content.build(out)
    report["maps"] = maps.build(out)
    report["maps"].update(solar_maps.build(out))
    scripts = [
        script
        for summary in report["maps"].values()
        for script in summary.pop("scripts")
    ]
    world = db.build(out, scripts)
    msgids = world.pop("msgids")
    report["db"] = world
    interface = {
        slug
        for slug, rec in db.table("sounds").items()
        if any(s.endswith("/interface.yaml") for s in rec["_source"])
    }
    report["audio"] = audio.build(
        out, world["music"], set(world["sounds"]) | interface
    )
    report["i18n"] = i18n.build(out, msgids)
    report["trips"] = trips.build(out)
    report["lessons"] = lessons.build(out)
    report["economy"] = economy.build(out)
    report["objects"] = objects.build(out)
    report["npcs"] = npcs.build(out)
    report["quests"] = quests.build(out)
    report["battle"] = moves.build(out)
    report["emoji"] = emoji.build(out)
    report["display"] = display.build(out)
    report["art2"] = art2.build(out)
    report["credits"] = credits.build(out)
    report["notes"] = out.notes
    return out, report


def build_isolated() -> tuple[Output, dict[str, Any]]:
    """
    :func:`build` with a HOME of its own, removed afterwards: the steps
    import tuxemon, which writes its config and cache under HOME.
    """
    old = os.environ.get("HOME")
    os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
    os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
    with tempfile.TemporaryDirectory(prefix="nagmon-build-") as home:
        os.environ["HOME"] = home
        try:
            return build()
        finally:
            if old is None:
                del os.environ["HOME"]
            else:
                os.environ["HOME"] = old


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--check",
        action="store_true",
        help="compare with the committed files instead of writing them",
    )
    parser.add_argument(
        "--report", action="store_true", help="print the build report"
    )
    args = parser.parse_args(argv)
    out, report = build_isolated()
    if args.report:
        print(json.dumps(report, ensure_ascii=False, indent=1))
    for note in out.notes:
        print(f"note: {note}")
    if args.check:
        problems = out.differences(OUT)
        for problem in problems:
            print(problem)
        if problems:
            print(
                "app/public/game is out of date: run tools/app/build_data.py"
            )
            return 1
        print("app/public/game is up to date")
        return 0
    out.write(OUT)
    size = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"wrote {len(out.paths())} files, {size / 1e6:.1f} MB, to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
