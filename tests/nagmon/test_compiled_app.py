"""
On the phone the game ships byte-compiled: python-for-android keeps
``client.pyc`` next to where ``client.py`` was, and no ``.py`` at all
(docs/kids/SDD_ANDROID.md §2.4). Everything that finds modules by file
must see both, or the game starts with no screens ("State
'BackgroundState' is not registered", found on the emulator).
"""

from __future__ import annotations

import re
from pathlib import Path

from tuxemon.plugin import module_stems

REPO = Path(__file__).resolve().parents[2]


def test_compiled_modules_are_found(tmp_path):
    for name in ("world.py", "menu.pyc", "__init__.pyc", "notes.txt"):
        (tmp_path / name).write_text("")
    (tmp_path / "__pycache__").mkdir()
    (tmp_path / "__pycache__" / "world.cpython-314.pyc").write_text("")
    assert module_stems(tmp_path) == ["__init__", "menu", "world"]


def test_a_module_in_both_forms_is_named_once(tmp_path):
    (tmp_path / "world.py").write_text("")
    (tmp_path / "world.pyc").write_text("")
    assert module_stems(tmp_path) == ["world"]


def test_a_missing_folder_has_no_modules(tmp_path):
    assert module_stems(tmp_path / "nope") == []


def test_no_code_looks_only_for_py_files():
    pattern = re.compile(r"""glob\(\s*["']\*\.py["']\s*\)""")
    offenders = [
        f"{path.relative_to(REPO)}:{n}"
        for top in ("tuxemon", "nagmon", "mods")
        for path in (REPO / top).rglob("*.py")
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if pattern.search(line)
    ]
    assert offenders == [], "use tuxemon.plugin.module_stems: " + ", ".join(offenders)
