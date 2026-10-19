"""
Checks that a built APK holds everything the game needs to start
(docs/kids/SDD_ANDROID.md §3): the game itself, its content, and every
library it imports, with the compiled parts built for the phone.

Usage:
    python tools/android/check_apk.py path/to/nagmon.apk [--layout]

python-for-android puts the app into ``assets/private.tar`` and the
Python libraries into ``lib/<arch>/libpybundle.so`` (a tar file with a
library's name); this looks inside both. Exits non-zero and names
what is missing.
"""

from __future__ import annotations

import io
import re
import sys
import tarfile
import zipfile
from pathlib import Path

#: Folders the game needs (app files, then libraries in site-packages).
APP_PATHS = (
    "main.py",
    "run_tuxemon.py",
    "tuxemon/",
    "nagmon/",
    "mods/tuxemon/",
    "mods/nagmon/",
    "mods/db_config.yaml",
)

LIBRARIES = (
    "PIL",
    "android",
    "annotated_types",
    "astral",
    "babel",
    "bidi",
    "certifi",
    "jnius",
    "natsort",
    "packaging",
    "prompt_toolkit",
    "pydantic",
    "pydantic_core",
    "pygame",
    "pygame_menu",
    "pyluach",
    "pyperclip",
    "pyscroll",
    "pytmx",
    "typing_inspection",
    "tzdata",
    "wcwidth",
    "websockets",
    "yaml",
)

#: Compiled pieces that must exist (built for arm64): pattern in any name.
NATIVE = {
    "pygame": re.compile(r"pygame/base[^/]*\.so$"),
    "pydantic_core": re.compile(r"pydantic_core/_pydantic_core[^/]*\.so$"),
    "SDL2": re.compile(r"lib/arm64-v8a/libSDL2\.so$"),
    "python": re.compile(r"lib/arm64-v8a/libpython3\.\d+\.so$"),
}

#: Libraries that must stay pure Python (their native parts do not exist
#: for Android, so a native file here means the wrong package came in).
PURE_ONLY = {"bidi": re.compile(r"bidi/[^/]*\.so$")}


def _is_bundle(name: str) -> bool:
    """The app (assets/private.tar) and the libraries (libpybundle.so)."""
    return (name.startswith("assets/") and ".tar" in name) or name.endswith(
        "/libpybundle.so"
    )


def names_in_apk(apk: Path) -> list[str]:
    """Every file name in the APK, including inside its asset tar files."""
    names: list[str] = []
    with zipfile.ZipFile(apk) as zf:
        for name in zf.namelist():
            names.append(name)
            if _is_bundle(name):
                data = zf.read(name)
                with tarfile.open(fileobj=io.BytesIO(data), mode="r:*") as tf:
                    names.extend(m.name.lstrip("./") for m in tf.getmembers())
    return names


def _has_library(names: list[str], lib: str) -> bool:
    marker = f"site-packages/{lib}/"
    single = (f"site-packages/{lib}.py", f"site-packages/{lib}.pyc")
    return any(marker in n or n.endswith(single) for n in names)


def problems(names: list[str]) -> list[str]:
    found: list[str] = []
    for path in APP_PATHS:
        if path.endswith("/"):
            if not any(n.startswith(path) for n in names):
                found.append(f"missing app folder {path}")
        elif path not in names and path + "c" not in names:
            # Python files are byte-compiled: main.py ships as main.pyc.
            found.append(f"missing app file {path}")
    for lib in LIBRARIES:
        if not _has_library(names, lib):
            found.append(f"missing library {lib}")
    for what, pattern in NATIVE.items():
        if not any(pattern.search(n) for n in names):
            found.append(f"missing compiled {what}")
    for what, pattern in PURE_ONLY.items():
        if any(pattern.search(n) for n in names):
            found.append(f"{what} has native code (expected pure Python)")
    return found


def layout(names: list[str], depth: int = 2) -> dict[str, int]:
    """File counts per folder, a few levels deep (for the build log)."""
    counts: dict[str, int] = {}
    for name in names:
        key = "/".join(name.split("/")[:depth])
        counts[key] = counts.get(key, 0) + 1
    return dict(sorted(counts.items()))


def main() -> int:
    apk = Path(sys.argv[1])
    names = names_in_apk(apk)
    found = problems(names)
    print(f"{apk.name}: {apk.stat().st_size / 1e6:.0f} MB, {len(names)} files")
    if "--layout" in sys.argv:
        for folder, count in layout(names).items():
            print(f"  {count:6d}  {folder}")
    for problem in found:
        print("  FAIL", problem)
    if not found:
        print("  everything the game needs is inside")
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
