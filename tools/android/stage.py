"""
Builds a clean folder for buildozer: the game, its content, the Android
entry point, the local recipes and a generated ``buildozer.spec``
(docs/kids/SDD_ANDROID.md §2.4).

Usage:
    python tools/android/stage.py OUTDIR [--build-number N] [--arch ARCH]

Then, in OUTDIR: ``buildozer android debug`` (or ``release``).
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]

#: Folders and files of the game that go into the app.
GAME_DIRS = ("tuxemon", "nagmon", "mods")
GAME_FILES = ("run_tuxemon.py", "LICENSE")

#: Never shipped: development folders and editor / source-art files.
SKIP_DIRS = {"__pycache__", ".git", ".mypy_cache", ".pytest_cache", "tests"}
SKIP_SUFFIXES = {
    ".pyc",
    ".pyo",
    ".xcf",
    ".ase",
    ".aseprite",
    ".psd",
    ".kra",
    ".xlsx",
    ".ods",
    ".md",
    ".world",
    ".go",
    ".mid",
}

#: What python-for-android builds for the phone. Recipes (python3, sdl2,
#: pygame_ce, ...) are compiled; the rest are pure-Python wheels from PyPI,
#: pinned to what the game is tested with.
REQUIREMENTS = (
    "python3",
    "hostpython3",
    "setuptools",
    "sdl2",
    "sdl2_image",
    "sdl2_mixer",
    "sdl2_ttf",
    "pygame_ce",
    "pyjnius",
    "android",
    "Pillow",
    "pydantic-core",
    "pydantic==2.12.3",
    "annotated-types==0.8.0",
    "typing-extensions==4.16.0",
    "typing-inspection==0.4.4",
    "pyyaml_pure",
    "python_bidi_pure",
    "pytmx==3.32",
    "pyscroll==2.31",
    "natsort==8.4.0",
    "babel==2.18.0",
    "pygame-menu-ce==4.5.2",
    "pyperclip==1.11.0",
    "pyluach==2.3.0",
    "astral==3.2",
    "tzdata==2026.5",
    "certifi==2026.10.18",
    "packaging==26.3",
    "prompt-toolkit==3.0.53",
    "wcwidth==0.9.2",
    "websockets==17.2",
)

#: python-for-android, pinned so a build today equals a build next month.
P4A_COMMIT = "8ef9d1dbbf769d2c14681dbc3c116c85e2e93bae"

ICON = Path("mods/nagmon/gfx/owl/owl_icon.png")  # the Wise Owl (SDD_ART)

SPEC = """\
[app]
title = Nagmon
package.name = nagmon
package.domain = org.nagmon
source.dir = .
source.include_exts = {exts}
source.exclude_dirs = bin, .buildozer, recipes
version = {version}
requirements = {requirements}
orientation = landscape, landscape-reverse
fullscreen = 1
icon.filename = %(source.dir)s/icon.png
presplash.filename = %(source.dir)s/presplash.png
android.presplash_color = #FFFFFF
android.permissions = INTERNET
android.api = 35
android.minapi = 24
android.archs = {arch}
android.numeric_version = {build_number}
android.allow_backup = False
android.accept_sdk_license = True
android.release_artifact = apk
android.debug_artifact = apk
p4a.fork = kivy
p4a.branch = develop
p4a.commit = {p4a_commit}
p4a.bootstrap = sdl2
p4a.local_recipes = ./recipes

[buildozer]
log_level = 2
warn_on_root = 0
"""


@dataclass
class StageReport:
    files: int = 0
    bytes: int = 0
    extensions: list[str] = field(default_factory=list)


def _wanted(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    if any(part in SKIP_DIRS for part in rel.parts):
        return False
    return path.suffix != "" and path.suffix.lower() not in SKIP_SUFFIXES


def _copy_tree(src: Path, dst: Path, root: Path, report: StageReport) -> None:
    exts = set(report.extensions)
    for path in sorted(src.rglob("*")):
        if not path.is_file() or not _wanted(path, root):
            continue
        target = dst / path.relative_to(root)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        report.files += 1
        report.bytes += path.stat().st_size
        exts.add(path.suffix[1:].lower())
    report.extensions = sorted(exts)


def _version(repo: Path) -> str:
    config = repo / "buildconfig" / "build_config.yaml"
    data = yaml.safe_load(config.read_text(encoding="utf-8")) or {}
    return str(data.get("version", "0.0.0"))


def stage(
    repo: Path,
    out: Path,
    *,
    build_number: int = 1,
    arch: str = "arm64-v8a",
) -> StageReport:
    """
    Fills ``out`` with everything buildozer needs. Returns a report.
    ``arch`` is arm64-v8a for phones, x86_64 for the emulator check.
    """
    repo, out = Path(repo), Path(out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    report = StageReport(extensions=["json", "py"])

    for name in GAME_DIRS:
        _copy_tree(repo / name, out, repo, report)
    for name in GAME_FILES:
        shutil.copy2(repo / name, out / name)
        report.files += 1

    android = repo / "buildconfig" / "android"
    shutil.copy2(android / "main.py", out / "main.py")
    shutil.copytree(
        android / "recipes",
        out / "recipes",
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    shutil.copy2(repo / ICON, out / "icon.png")
    shutil.copy2(repo / ICON, out / "presplash.png")

    # Named in crash reports (docs/kids/SDD_ANDROID.md §2.6).
    (out / "build_info.json").write_text(
        json.dumps(
            {
                "version": _version(repo),
                "build": str(build_number),
                "arch": arch,
                "commit": os.environ.get("GITHUB_SHA", "local")[:10],
            }
        ),
        encoding="utf-8",
    )
    (out / "buildozer.spec").write_text(
        SPEC.format(
            exts=",".join(report.extensions),
            version=_version(repo),
            requirements=",".join(REQUIREMENTS),
            build_number=build_number,
            p4a_commit=P4A_COMMIT,
            arch=arch,
        ),
        encoding="utf-8",
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("out", type=Path)
    parser.add_argument("--build-number", type=int, default=1)
    parser.add_argument("--arch", default="arm64-v8a")
    args = parser.parse_args()
    report = stage(
        REPO, args.out, build_number=args.build_number, arch=args.arch
    )
    print(
        f"staged {report.files} files, {report.bytes / 1e6:.0f} MB, "
        f"types: {','.join(report.extensions)}"
    )


if __name__ == "__main__":
    main()
