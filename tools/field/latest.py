"""
Prints the newest uploads from the phones, per device and kind, with a
one-line summary each (docs/kids/SDD_FIELD_DATA.md §2.6).

Reads a local clone of the private data repo, where the game writes
devices/<install-id>/{logs,crashes,progress}/<UTC>.*:

    git -C ../nagmon-data pull
    python tools/field/latest.py ../nagmon-data [--per 3]

Exits 1 when the folder has no uploads.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

KINDS = ("crashes", "logs", "progress")
#: Same as nagmon.crash_report.LOG_MARKER (the tool runs on its own).
LOG_MARKER = "--- app log (last lines) ---"
START_MARK = "=== Nagmon start"
STAMP = re.compile(r"\d{8}T\d{6}Z")
LEVEL = re.compile(r"^\d\d:\d\d:\d\d (ERROR|WARNING|CRITICAL) (.*)$")
WIDTH = 160


def scan(root: Path) -> dict[tuple[str, str], list[Path]]:
    """(device, kind) -> uploads, newest first."""
    found: dict[tuple[str, str], list[Path]] = {}
    devices = Path(root) / "devices"
    if not devices.is_dir():
        return found
    for device in sorted(p for p in devices.iterdir() if p.is_dir()):
        for kind in KINDS:
            files = [
                f
                for f in (device / kind).glob("*")
                if f.is_file()
                and STAMP.fullmatch(f.stem)
                and f.suffix in (".txt", ".json")
            ]
            if files:
                found[(device.name, kind)] = sorted(
                    files, key=lambda f: f.name, reverse=True
                )
    return found


def _log(text: str) -> str:
    lines = text.splitlines()
    starts = [line for line in lines if line.startswith(START_MARK)]
    parts = [f"{len(lines)} lines"]
    if starts:
        start = starts[-1]
        build = re.search(r"build (\S+)", start)
        ended = re.search(r"previous exit: ([^·]+)", start)
        if build:
            parts.append(f"build {build.group(1)}")
        if ended:
            parts.append(f"previous exit: {ended.group(1).strip()}")
    levels = [m for m in map(LEVEL.match, lines) if m]
    errors = [m for m in levels if m.group(1) in ("ERROR", "CRITICAL")]
    warnings = [m for m in levels if m.group(1) == "WARNING"]
    parts.append(f"{len(errors)} ERROR")
    parts.append(f"{len(warnings)} WARNING")
    if errors:
        parts.append(f"last error: {errors[-1].group(2)}")
    return " · ".join(parts)


def _crash(text: str) -> str:
    report = text.split(LOG_MARKER, 1)[0]
    head, _, body = report.partition("\n\n")
    build = re.search(r"^build: (.+)$", head, re.M)
    error = [line.strip() for line in body.splitlines() if line.strip()]
    parts = [f"build {build.group(1).strip()}"] if build else []
    parts.append(error[-1] if error else "no error text")
    if LOG_MARKER in text:
        parts.append("with log")
    return " · ".join(parts)


def _progress(text: str) -> str:
    data = json.loads(text)
    children = data.get("children") or []
    answers = sum(
        int(subject.get("attempts") or 0)
        for child in children
        for subject in (child.get("subjects") or {}).values()
    )
    minutes = sum(int(c.get("minutes_14d_total") or 0) for c in children)
    build = (data.get("app") or {}).get("build", "?")
    return (
        f"build {build} · {len(children)} children · {answers} answers"
        f" · {minutes} min in 14 days"
    )


def summarize(kind: str, text: str) -> str:
    """One line about one upload; a broken file says so."""
    try:
        if kind == "logs":
            line = _log(text)
        elif kind == "crashes":
            line = _crash(text)
        else:
            line = _progress(text)
    except (ValueError, TypeError, AttributeError) as exc:
        line = f"unreadable ({exc})"
    line = " ".join(line.split())
    return line if len(line) <= WIDTH else line[: WIDTH - 3] + "..."


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument(
        "clone", type=Path, help="local clone of the data repo"
    )
    parser.add_argument(
        "--per", type=int, default=3, help="uploads per device and kind"
    )
    args = parser.parse_args(argv)
    found = scan(args.clone)
    if not found:
        print(f"No uploads in {args.clone}")
        return 1
    device = None
    for (dev, kind), files in sorted(found.items()):
        if dev != device:
            print(f"device {dev}")
            device = dev
        for path in files[: max(1, args.per)]:
            text = path.read_text(encoding="utf-8", errors="replace")
            print(f"  {kind:<9} {path.name}  {summarize(kind, text)}")
    return 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
