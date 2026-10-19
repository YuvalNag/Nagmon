# SPDX-License-Identifier: GPL-3.0
"""
pygame-ce for Android (docs/kids/SDD_ANDROID.md §2.4).

python-for-android only ships a recipe for the original pygame (2.1). The
pygame-ce source keeps the same Android build path (``setup.py`` with
``PYGAME_ANDROID`` and ``buildconfig/Setup.Android.SDL2.in``), so this is
that recipe pointed at the pygame-ce release the game uses on the PC.

One difference: pygame-ce's ``pyproject.toml`` builds with meson, so the
usual ``pip install .`` would start a second, native (wrong-architecture)
build. ``setup.py build`` already made the whole package for the phone;
it is copied into place instead.
"""

import glob
import shutil
from pathlib import Path

from pythonforandroid.recipes.pygame import Pygame2Recipe


def install_built_package(build_dir: Path, install_dir: Path) -> Path:
    """Copies ``build/lib.*/pygame`` (made by setup.py) into the app."""
    found = sorted(
        glob.glob(str(Path(build_dir) / "build" / "lib*" / "pygame"))
    )
    if not found:
        raise RuntimeError(f"setup.py build left no pygame in {build_dir}")
    target = Path(install_dir) / "pygame"
    if target.exists():
        shutil.rmtree(target)
    shutil.copytree(found[-1], target)
    return target


class PygameCERecipe(Pygame2Recipe):
    version = "2.5.7"
    url = (
        "https://files.pythonhosted.org/packages/source/p/pygame-ce/"
        "pygame_ce-{version}.tar.gz"
    )
    name = "pygame_ce"
    site_packages_name = "pygame"
    conflicts = ["pygame"]
    # setup.py turns the _sdl2 .pyx files into C.
    hostpython_prerequisites = ["cython>=3.0"]
    # Python files, data and extensions, not only the extensions.
    build_cmd = "build"

    def install_python_package(self, arch, name=None, env=None, is_dir=True):
        install_built_package(
            Path(self.get_build_dir(arch.arch)),
            Path(self.ctx.get_python_install_dir(arch.arch)),
        )


recipe = PygameCERecipe()
