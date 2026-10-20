"""nagmon.family must stay pure Python: no pygame, no tuxemon."""

import ast
from pathlib import Path

import nagmon.family

FORBIDDEN = ("pygame", "tuxemon")


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text("utf-8"))
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
    return names


def test_family_modules_do_not_import_engine():
    pkg_dir = Path(nagmon.family.__file__).parent
    files = sorted(pkg_dir.glob("*.py"))
    assert len(files) >= 7
    for path in files:
        for name in _imported_modules(path):
            root = name.split(".")[0]
            assert root not in FORBIDDEN, f"{path.name} imports {name}"
