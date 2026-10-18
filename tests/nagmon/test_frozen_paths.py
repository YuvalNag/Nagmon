# SPDX-License-Identifier: GPL-3.0
"""Nagmon finds its data files in a source checkout and a frozen build."""

from __future__ import annotations

from pathlib import Path

from nagmon import mod_dir


def test_source_checkout_uses_the_repository_mod():
    repo = Path(__file__).resolve().parents[2]
    assert mod_dir() == repo / "mods" / "nagmon"


def test_frozen_build_finds_mods_next_to_lib(tmp_path):
    # cx_Freeze: <build>/lib/nagmon/__init__.py, data in <build>/mods.
    anchor = tmp_path / "build" / "lib" / "nagmon" / "__init__.py"
    anchor.parent.mkdir(parents=True)
    anchor.write_text("")
    mods = tmp_path / "build" / "mods" / "nagmon"
    mods.mkdir(parents=True)
    assert mod_dir(anchor) == mods


def test_data_paths_follow_the_mod_dir():
    from nagmon.ai import canned, studio
    from nagmon.learning import content
    from nagmon.ui import emoji

    base = mod_dir()
    assert content.DEFAULT_CONTENT_DIR == base / "learning"
    assert studio.DEFAULT_CONTENT_ROOT == base / "learning"
    assert canned.DEFAULT_FAQ_PATH == base / "learning" / "owl_faq.yaml"
    assert emoji.default_root() == base / "gfx" / "emoji"
