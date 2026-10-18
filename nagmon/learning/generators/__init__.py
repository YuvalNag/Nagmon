"""Procedural question generators (math, geometry, logic).

Importing :func:`load_builtin_generators` registers every built-in
generator in :data:`nagmon.learning.generators.common.GENERATORS`.
"""

from __future__ import annotations

from collections.abc import Callable


def load_builtin_generators() -> dict[str, Callable]:
    from nagmon.learning.generators import (  # noqa: F401
        algebra,
        arithmetic,
        geometry,
        logic,
        rational,
        word_problems,
    )
    from nagmon.learning.generators.common import GENERATORS

    return dict(GENERATORS)
