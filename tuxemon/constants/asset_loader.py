# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING

import yaml

from tuxemon.constants import paths

if TYPE_CHECKING:
    from tuxemon.config import TuxemonConfig

logger = logging.getLogger(__name__)

_MOD_ASSET_ROOTS: tuple[Path, ...] = ()
_HAS_POPULATED: bool = False
_WARNED_UNPOPULATED: bool = False


def fetch_mod_asset_roots(config: TuxemonConfig, force: bool = False) -> None:
    """
    Populates internal mod asset root paths. Run once during startup,
    or forcibly re-populates if `force=True`.

    Parameters:
        config: Object with a .mods list
        paths: Object with .mods_folder, .system_installed_folders, and .BASEDIR
        force: If True, re-scans mod roots even if previously populated
    """
    global _MOD_ASSET_ROOTS, _HAS_POPULATED
    if _HAS_POPULATED and not force:
        logger.debug("[ModRoots] Already populated; skipping.")
        return

    discovered_roots = []

    # Later mods in the list win, and every mod wins over its dependencies.
    for mod_name in _expand_dependencies(list(reversed(config.mods))):
        root = _resolve_mod_root(mod_name)
        if root is not None:
            discovered_roots.append(root)
            logger.info(f"[ModRoot] '{mod_name}' -> {root}")
        else:
            logger.warning(
                f"[ModRoot] '{mod_name}' not found in any expected location"
            )

    _MOD_ASSET_ROOTS = tuple(discovered_roots)
    _HAS_POPULATED = True
    logger.debug(f"[ModRoots] Final mod asset roots: {_MOD_ASSET_ROOTS}")


def _resolve_mod_root(mod_name: str) -> Path | None:
    """Returns the directory of a mod, preferring the last match found."""
    candidates = []

    # Standard mod folder
    p = paths.mods_folder / mod_name
    if p.is_dir():
        candidates.append(p)

    # System-installed folders
    for root in paths.system_installed_folders:
        p = root / "mods" / mod_name
        if p.is_dir():
            candidates.append(p)

    # BASEDIR fallback
    p = paths.BASEDIR / "mods" / mod_name
    if p.is_dir():
        candidates.append(p)

    return candidates[-1] if candidates else None


def _read_dependencies(mod_name: str) -> list[str]:
    """Reads the ``dependencies`` list from a mod's mod.yaml, if any."""
    root = _resolve_mod_root(mod_name)
    if root is None:
        return []
    meta_path = root / "mod.yaml"
    if not meta_path.is_file():
        return []
    try:
        with meta_path.open(encoding="utf-8") as f:
            meta = yaml.safe_load(f) or {}
    except (OSError, yaml.YAMLError) as e:
        logger.warning(f"[ModRoot] Could not read {meta_path}: {e}")
        return []
    deps = meta.get("dependencies") or []
    return [str(dep) for dep in deps]


def _expand_dependencies(mods: list[str]) -> list[str]:
    """
    Returns the mods (highest priority first) with their dependencies,
    each once and highest priority first. A dependency always comes after
    every mod that needs it, so two mods built on the same base both win
    over that base.
    """
    seen: set[str] = set()
    lowest_first: list[str] = []

    def visit(mod_name: str) -> None:
        if mod_name in seen:
            return
        seen.add(mod_name)
        for dep in _read_dependencies(mod_name):
            visit(dep)
        lowest_first.append(mod_name)

    for mod_name in reversed(mods):
        visit(mod_name)
    return list(reversed(lowest_first))


def fetch_all_assets(*args: str) -> list[str]:
    """
    Returns every mod's copy of an asset, lowest priority first.

    Useful for files that are merged rather than replaced, such as the
    event scripts a mod adds to another mod's map.

    Parameters:
        *args: Path components to join into a relative path

    Returns:
        POSIX paths of the existing copies, dependencies before the mods
        that build on them.
    """
    relative = Path(*args)
    found = [
        (root / relative).as_posix()
        for root in _MOD_ASSET_ROOTS
        if (root / relative).exists()
    ]
    return list(reversed(found))


def fetch_all_l18n_roots() -> list[Path]:
    """
    Returns a list of all discovered 'l18n' directories within mod asset roots.
    """
    l18n_roots = []
    if not _HAS_POPULATED:
        logger.warning(
            "Attempted to fetch l18n roots before _MOD_ASSET_ROOTS was populated."
        )

    for root in _MOD_ASSET_ROOTS:
        l18n_path = root / "l18n"
        if l18n_path.is_dir():
            l18n_roots.append(l18n_path)
            logger.debug(f"Discovered l18n root: {l18n_path}")
        else:
            logger.debug(f"No l18n directory found in mod root: {root}")
    return l18n_roots


@lru_cache(maxsize=512)
def fetch_asset(*args: str) -> str:
    """
    Returns the filesystem path to the requested asset.

    Parameters:
        *args: Path components to join into a relative path

    Returns:
        str: POSIX string path to the asset

    Raises:
        OSError: If the asset cannot be found
    """
    relative = Path(*args)

    for root in _MOD_ASSET_ROOTS:
        full_path = root / relative
        logger.debug(f"[Fetch] Checking: {full_path}")
        if full_path.exists():
            logger.info(f"[Fetch] Found: {full_path}")
            return full_path.as_posix()

    raise OSError(f"[Fetch] Asset not found: {relative}")


def resolve_mod_path(path: str) -> str:
    """
    The copy of the file at ``path`` that wins by mod order.

    A TSX names its image next to itself, inside one mod (say
    mods/tuxemon), so the image would never come from a mod that builds
    on it. When ``path`` lies inside a mod root, the same relative path
    is looked up again by mod order (SDD_ART §2.11). Any other path, or
    one no mod has, comes back unchanged.
    """
    global _WARNED_UNPOPULATED
    if not _HAS_POPULATED:
        # every tileset of a map asks: one warning is enough
        if not _WARNED_UNPOPULATED:
            logger.warning("[Resolve] mod roots not populated yet: %s", path)
            _WARNED_UNPOPULATED = True
        return path
    target = Path(path).resolve()
    for root in _MOD_ASSET_ROOTS:
        try:
            relative = target.relative_to(root.resolve())
        except ValueError:
            continue
        try:
            return fetch_asset(*relative.parts)
        except OSError:
            return path
    return path
