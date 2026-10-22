"""Hebrew language content for grades 3-9 (docs/app/QUESTION_AUDIT.md: the Hebrew content ended at grade 2).

The skill graph, the shape of every item, and the biases a quiz must not have: the right answer not always the
longest, not always in one place, true-or-false not half "false", an explanation that teaches. Only yaml + the loader,
so the checks run fast. The same properties are held on the TypeScript side by
``app/tests/unit/learning/content_hebrew_upper.test.ts``.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

import pytest
import yaml

from nagmon.learning.content import ContentLibrary

LEARNING = Path(__file__).resolve().parents[2] / "mods" / "nagmon" / "learning"
NIQQUD = re.compile("[֑-ׇ]")
WORD = re.compile(r"[א-ת0-9A-Za-z]+")
NOT_ALLOWED = ("טיפש", "מטומטם", "מפגר", "אידיוט", "אלוהים", "אלוקים", "תפילה", "גן עדן")

SKILLS = {
    s["id"]: s
    for s in yaml.safe_load((LEARNING / "skills" / "hebrew.yaml").read_text(encoding="utf-8"))["skills"]
    if s["grade"] >= 3
}


def _items(skill: dict) -> list[dict]:
    """The bank items of a skill (reading questions inherit their passage's fields)."""
    path = LEARNING / skill["params"]["bank"]
    doc = yaml.safe_load(path.read_text(encoding="utf-8"))
    tags = set(skill["params"].get("tags") or [])
    out: list[dict] = []
    if isinstance(doc, list):
        for passage in doc:
            if not tags & set(passage.get("tags") or []):
                continue
            for q in passage["questions"]:
                out.append({**q, "grade": passage["grade"], "passage": passage["text_he"]})
        return out
    for item in doc["items"]:
        if item.get("skill", doc.get("skill")) == skill["id"] and tags & set(item["tags"]):
            out.append(item)
    return out


ITEMS = {sid: _items(s) for sid, s in SKILLS.items()}
WORDS = lambda text: WORD.findall(text)  # noqa: E731


def test_skill_graph_covers_grades_3_to_9():
    assert len(SKILLS) >= 25
    for grade in range(3, 10):
        assert sum(1 for s in SKILLS.values() if s["grade"] == grade) >= 2, f"grade {grade}"


def test_prereqs_exist_chain_to_the_early_skills_and_never_point_up():
    everything = {
        s["id"]: s
        for s in yaml.safe_load((LEARNING / "skills" / "hebrew.yaml").read_text(encoding="utf-8"))["skills"]
    }

    def roots(sid: str) -> set[str]:
        skill = everything[sid]
        if not skill["prereq"]:
            return {sid}
        return set().union(*(roots(p) for p in skill["prereq"]))

    for sid, s in SKILLS.items():
        assert s["prereq"], f"{sid}: no prerequisite"
        for p in s["prereq"]:
            assert p in everything, f"{sid}: unknown prereq {p}"
            assert everything[p]["grade"] <= s["grade"], f"{sid}: prereq {p} is for a later grade"
        assert max(everything[p]["grade"] for p in s["prereq"]) >= s["grade"] - 2, f"{sid}: jump"
        assert all(everything[r]["grade"] <= 2 for r in roots(sid)), f"{sid}: chain starts too high"


@pytest.mark.parametrize("sid", sorted(SKILLS))
def test_skill_is_a_bank_of_20_to_40_items(sid):
    items = ITEMS[sid]
    assert 20 <= len(items) <= 40, f"{sid}: {len(items)} items"
    assert all(i["grade"] == SKILLS[sid]["grade"] for i in items)
    assert len({i["difficulty"] for i in items}) >= 3, f"{sid}: difficulty never varies"


def test_ids_prompts_and_explanations_are_unique_and_teach():
    seen: set[str] = set()
    for sid, items in ITEMS.items():
        explanations = [i["explanation_he"].strip() for i in items]
        assert len(set(explanations)) == len(explanations), f"{sid}: repeated explanation"
        for i in items:
            assert i["id"] not in seen, f"duplicate id {i['id']}"
            seen.add(i["id"])
            ex = i["explanation_he"].strip()
            assert len(ex) >= 25, i["id"]
            assert ex != i["prompt_he"].strip(), i["id"]
            fresh = [w for w in WORDS(ex) if w not in set(WORDS(i["prompt_he"]))]
            assert len(fresh) >= 3, f"{i['id']}: the explanation adds nothing"


def test_options_are_valid_distinct_and_the_answer_is_among_them():
    for items in ITEMS.values():
        for i in items:
            if i["kind"] == "true_false":
                assert isinstance(i["answer"], bool), i["id"]
                continue
            he = [c["he"].strip() for c in i["choices"]]
            assert len(set(he)) == len(he), f"{i['id']}: duplicate options"
            assert 3 <= len(he) <= (6 if i["kind"] == "order" else 4), i["id"]
            if i["kind"] == "choice":
                assert 0 <= i["answer"] < len(he), i["id"]
            else:
                assert sorted(i["answer"]) == list(range(len(he))), i["id"]
                assert i["answer"] != list(range(len(he))), f"{i['id']}: shown solved"


def test_the_right_answer_is_not_always_longest_or_shortest_nor_in_one_place():
    n = longest = shortest = 0
    places: Counter[int] = Counter()
    for items in ITEMS.values():
        for i in items:
            if i["kind"] != "choice":
                continue
            lens = [len(c["he"]) for c in i["choices"]]
            if len(set(lens)) == 1:
                continue
            others = [length for k, length in enumerate(lens) if k != i["answer"]]
            n += 1
            longest += lens[i["answer"]] > max(others)
            shortest += lens[i["answer"]] < min(others)
            places[i["answer"]] += 1
    assert n > 300
    assert 0.15 <= longest / n <= 0.4
    assert shortest / n <= 0.45
    for place in (0, 1, 2):
        assert 0.22 <= places[place] / n <= 0.45


def test_true_or_false_is_about_half_true_and_there_are_order_questions():
    every = [i for items in ITEMS.values() for i in items]
    tf = [i for i in every if i["kind"] == "true_false"]
    assert len(tf) >= 30
    assert 0.4 <= sum(1 for i in tf if i["answer"]) / len(tf) <= 0.6
    assert sum(1 for i in every if i["kind"] == "order") >= 12


def test_kind_and_modest_text_without_niqqud():
    for items in ITEMS.values():
        for i in items:
            text = " ".join([i["prompt_he"], i["explanation_he"], i.get("passage", "")] + [c["he"] for c in i.get("choices") or []])
            assert not NIQQUD.search(text), f"{i['id']}: niqqud"
            assert len(i["prompt_he"]) <= 140, i["id"]
            for bad in NOT_ALLOWED:
                assert bad not in text, f"{i['id']}: {bad}"
            assert not re.match(r"(טעית|טעות שלך|לא נכון|חבל)", i["explanation_he"].strip()), f"{i['id']}: scolding"


def test_reading_passages_grow_with_the_grade():
    means = []
    for grade in range(3, 10):
        doc = yaml.safe_load((LEARNING / "hebrew" / f"passages_{grade}.yaml").read_text(encoding="utf-8"))
        assert len(doc) >= 5
        lengths = [len(WORDS(p["text_he"])) for p in doc]
        assert all("text_en" not in p for p in doc)
        assert all(4 <= len(p["questions"]) <= 6 for p in doc)
        means.append(sum(lengths) / len(lengths))
    assert means == sorted(means) and len(set(means)) == len(means)


def test_the_game_loader_accepts_the_content_and_the_selector_can_open_every_skill():
    library = ContentLibrary.load(LEARNING)
    for sid in SKILLS:
        assert sid in library.skills
    assert len([s for s in library.skills.values() if s.subject == "hebrew" and s.grade >= 3]) == len(SKILLS)
