"""A language with its own fonts gets them even from a minimal config."""

from __future__ import annotations

import yaml

from tuxemon.config import LOCALE_FONT_MAP, TuxemonConfig


def _config(tmp_path, game: dict) -> TuxemonConfig:
    path = tmp_path / "tuxemon.yaml"
    path.write_text(yaml.safe_dump({"game": game}), encoding="utf-8")
    return TuxemonConfig(path)


def test_hebrew_locale_gets_hebrew_fonts(tmp_path):
    cfg = _config(tmp_path, {"locale": "he_IL"})
    main, thin, minimal = LOCALE_FONT_MAP["he_IL"]
    assert cfg.locale.font_file == main
    assert cfg.locale.thin_font_file == thin
    assert cfg.locale.minimal_font_file == minimal


def test_custom_font_is_kept(tmp_path):
    cfg = _config(tmp_path, {"locale": "he_IL", "font_file": "Mine.ttf"})
    assert cfg.locale.font_file == "Mine.ttf"


def test_english_keeps_default_fonts(tmp_path):
    cfg = _config(tmp_path, {"locale": "en_US"})
    assert cfg.locale.font_file == LOCALE_FONT_MAP["default"][0]
