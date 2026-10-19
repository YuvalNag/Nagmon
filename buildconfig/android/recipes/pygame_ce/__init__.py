# SPDX-License-Identifier: GPL-3.0
"""
pygame-ce for Android (docs/kids/SDD_ANDROID.md §2.4).

python-for-android only ships a recipe for the original pygame (2.1). The
pygame-ce source keeps the same Android build path (``setup.py`` with
``PYGAME_ANDROID`` and ``buildconfig/Setup.Android.SDL2.in``), so this is
that recipe pointed at the pygame-ce release the game uses on the PC.
"""

from pythonforandroid.recipes.pygame import Pygame2Recipe


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


recipe = PygameCERecipe()
