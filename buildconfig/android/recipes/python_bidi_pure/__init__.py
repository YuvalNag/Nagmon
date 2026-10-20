# SPDX-License-Identifier: GPL-3.0
"""
The pure-Python half of python-bidi (docs/kids/SDD_ANDROID.md §2.4).

python-bidi 0.6 is a Rust extension, but it still ships the pure
``bidi.algorithm`` module, which is all ``tuxemon/ui/bidi.py`` uses. This
recipe installs only that, with an ``__init__`` that does not load Rust.
"""

import shutil
from pathlib import Path

from pythonforandroid.recipe import Recipe

PURE_FILES = ("algorithm.py", "mirror.py")
INIT = (
    '"""python-bidi, pure-Python algorithm only (Nagmon Android build)."""\n'
)


def install_pure_bidi(source: Path, site_packages: Path) -> None:
    """Copies ``bidi/{algorithm,mirror}.py`` from an unpacked sdist."""
    target = Path(site_packages) / "bidi"
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    for name in PURE_FILES:
        shutil.copy2(Path(source) / "bidi" / name, target / name)
    (target / "__init__.py").write_text(INIT)


class PythonBidiPureRecipe(Recipe):
    version = "0.6.11"
    url = (
        "https://files.pythonhosted.org/packages/source/p/python-bidi/"
        "python_bidi-{version}.tar.gz"
    )
    name = "python_bidi_pure"
    depends = ["python3"]
    conflicts = ["python-bidi"]

    def should_build(self, arch):
        site = Path(self.ctx.get_site_packages_dir(arch))
        return not (site / "bidi" / "algorithm.py").exists()

    def build_arch(self, arch):
        install_pure_bidi(
            Path(self.get_build_dir(arch.arch)),
            Path(self.ctx.get_site_packages_dir(arch)),
        )


recipe = PythonBidiPureRecipe()
