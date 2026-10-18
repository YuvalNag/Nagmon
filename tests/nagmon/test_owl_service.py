"""The owl for the playing child (docs/kids/SDD_AI.md)."""

from __future__ import annotations

from nagmon.ai.config import AISettings
from nagmon.owl_service import (
    build_owl,
    load_ai_settings,
    owl_log_lines,
    save_ai_settings,
)


def test_settings_roundtrip_and_default_off(tmp_path):
    assert load_ai_settings(tmp_path).owl_enabled is False
    save_ai_settings(tmp_path, AISettings(owl_enabled=True))
    assert load_ai_settings(tmp_path).owl_enabled is True


def test_owl_without_keys_answers_offline_and_logs(tmp_path):
    (tmp_path / "profiles" / "pab123").mkdir(parents=True)
    owl = build_owl(tmp_path, "pab123", keys={})
    question = owl.menu(6)[0]
    answer = owl.ask(6, question, profile_id="pab123")
    assert answer.text_he
    assert answer.source in ("canned", "faq", "offline")
    lines = owl_log_lines(tmp_path, "pab123")
    assert lines and lines[0].startswith("ילד/ה:")
    assert any(line.startswith("ינשוף:") for line in lines)


def test_owl_blocks_personal_details(tmp_path):
    owl = build_owl(tmp_path, "pab123", keys={})
    answer = owl.ask(9, "הטלפון שלי 0501234567", profile_id="pab123")
    assert answer.source == "blocked"
