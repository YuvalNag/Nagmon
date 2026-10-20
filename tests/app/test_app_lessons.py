"""Tutor lessons: the build step, and every lesson file is sound."""

from __future__ import annotations

import json
import re

import pytest

from tools.app import lessons
from tools.app.common import Output
from tools.app.content import LEARNING, read_yaml

#: Four-point stars and crosses (and the Star of David) stay out of the game.
FORBIDDEN = set("✦✧✩✪✫✬✭✮✯✰✡✝✞✟✚✛✜☦☨†‡➕🕎✠✢✣✤✥")
#: Family details never go in the public repo.
FAMILY = re.compile(
    r"yuval|nag\b|mila\b|דנה|יובל|נגר|משפחת|סבתא|סבא", re.IGNORECASE
)
MAX_TEXT = 60


def bank_items() -> dict[str, dict]:
    items: dict[str, dict] = {}
    for path in sorted((LEARNING).rglob("*.yaml")):
        doc = read_yaml(path)
        if isinstance(doc, dict) and isinstance(doc.get("items"), list):
            for item in doc["items"]:
                if "id" in item:
                    items[item["id"]] = {
                        "skill": doc.get("skill"),
                        **item,
                    }
    return items


def skill_ids() -> set[str]:
    ids: set[str] = set()
    for path in sorted((LEARNING / "skills").glob("*.yaml")):
        ids |= {s["id"] for s in read_yaml(path)["skills"]}
    return ids


DOCS = lessons.documents()


def texts(doc: dict) -> list[str]:
    out = []
    for card in [*doc["cards"], doc.get("notes") or {}]:
        out += [card.get("he", ""), card.get("en", "")]
    out += [doc.get("title_he", ""), doc.get("title_en", "")]
    return out


def test_the_solar_chapter_has_its_three_lessons():
    assert {"moon", "solar_system", "stars"} <= set(DOCS)


@pytest.mark.parametrize("name", sorted(DOCS))
def test_the_lesson_is_sound(name):
    doc = DOCS[name]
    assert doc.get("id", name) == name
    assert doc["skill"] in skill_ids()
    assert 2 <= len(doc["cards"]) <= 4
    for card in doc["cards"]:
        for lang in ("he", "en"):
            text = card.get(lang)
            assert isinstance(text, str) and text.strip(), (name, card)
            assert len(text) < MAX_TEXT, (name, text)
        assert card.get("emoji"), (name, card)
        if card.get("highlight"):
            assert card["highlight"] in card["he"]
    notes = doc.get("notes")
    if notes:
        assert 0 < len(notes["he"]) < MAX_TEXT * 2
        assert notes.get("en")
    assert any("א" <= c <= "ת" for c in doc["cards"][0]["he"])


@pytest.mark.parametrize("name", sorted(DOCS))
def test_the_practice_is_one_question_with_one_right_answer(name):
    practice = DOCS[name]["practice"]
    if "bank" in practice:
        item = bank_items()[practice["bank"]]
        assert item["skill"] == DOCS[name]["skill"]
        assert item["kind"] in ("choice", "true_false")
        return
    choices = practice["inline"]["choices"]
    assert len(choices) >= 2
    assert sum(1 for c in choices if c.get("correct")) == 1
    assert practice["inline"]["prompt_he"] and practice["inline"]["prompt_en"]


@pytest.mark.parametrize("name", sorted(DOCS))
def test_no_forbidden_symbols_or_family_details(name):
    blob = json.dumps(DOCS[name], ensure_ascii=False)
    assert not (FORBIDDEN & set(blob)), name
    assert not FAMILY.search(blob), name


@pytest.mark.parametrize("name", sorted(DOCS))
def test_the_note_does_not_quote_an_answer(name):
    doc = DOCS[name]
    note = (doc.get("notes") or {}).get("he", "")
    for item in bank_items().values():
        if (
            item["skill"] != doc["skill"]
            or "choices" not in item
            or not isinstance(item["answer"], int)
        ):
            continue
        right = item["choices"][item["answer"]]["he"]
        if len(right) > 3:
            assert right not in note, (name, item["id"])


def test_no_lesson_files_write_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(lessons, "LESSONS", tmp_path / "none")
    out = Output()
    assert lessons.build(out) == {"lessons": []}
    assert not [p for p in out.paths() if str(p).startswith("lessons/")]


def test_a_lesson_file_becomes_json(tmp_path, monkeypatch):
    (tmp_path / "x.yaml").write_text(
        "skill: s\ncards: [{he: a}]\n", encoding="utf-8"
    )
    monkeypatch.setattr(lessons, "LESSONS", tmp_path)
    out = Output()
    assert lessons.build(out) == {"lessons": ["x"]}
    assert "lessons/x.json" in {str(p) for p in out.paths()}


def test_a_file_without_cards_stops_the_build(tmp_path, monkeypatch):
    (tmp_path / "bad.yaml").write_text("skill: s\n", encoding="utf-8")
    monkeypatch.setattr(lessons, "LESSONS", tmp_path)
    with pytest.raises(ValueError):
        lessons.build(Output())


def test_the_build_ships_the_lessons_and_their_pictures(built):
    out, report = built
    assert set(report["lessons"]["lessons"]) == set(DOCS)
    shipped = json.loads(out.data["emoji/index.json"])["codes"]
    assert lessons.emoji_codes() <= set(shipped)
