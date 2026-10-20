"""Schema and quality checks for the science and Hebrew bank content (docs/kids/SDD_CONTENT.md).

Only yaml + stdlib, so the checks run fast and without pygame.
"""

from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

import pytest
import yaml

LEARNING = Path(__file__).resolve().parents[2] / "mods" / "nagmon" / "learning"
BANK_DIRS = ("science", "hebrew")
SKILL_FILES = {
    "science": "skills/science.yaml",
    "hebrew": "skills/hebrew.yaml",
}

KINDS = {"choice", "true_false", "order"}
ITEM_REQUIRED = (
    "id",
    "kind",
    "grade",
    "difficulty",
    "prompt_he",
    "prompt_en",
    "answer",
    "explanation_he",
    "explanation_en",
    "tags",
)
ITEM_ALLOWED = set(ITEM_REQUIRED) | {"skill", "choices"}
CHOICE_ALLOWED = {"he", "en", "emoji"}
ELEMENTS = (
    "cosmic",
    "earth",
    "fire",
    "frost",
    "heroic",
    "lightning",
    "metal",
    "normal",
    "shadow",
    "sky",
    "venom",
    "water",
    "wood",
)

MAX_PROMPT_HE = 140
MAX_CHOICE_HE = 40
MAX_CHOICE_EN = 60
MAX_EXPLANATION_HE = 200
MAX_FACT_HE = 200
MIN_ITEMS_PER_SKILL = 10

NIQQUD = re.compile("[֑-ׇ]")
HEBREW_LETTER = re.compile("[א-ת]")
EMOJI_DIR = LEARNING.parent / "gfx" / "emoji"
EMOJI_HEX = re.compile(r"[0-9a-f]{4,6}(-[0-9a-f]{4,6})*")
ID_RE = re.compile(r"[a-z0-9_]+(\.[a-z0-9_]+)+")


def _load(path: Path):
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def _bank_files() -> list[Path]:
    return sorted(p for d in BANK_DIRS for p in (LEARNING / d).glob("*.yaml"))


BANKS = {p.relative_to(LEARNING).as_posix(): _load(p) for p in _bank_files()}
SKILLS = {
    subject: _load(LEARNING / rel)
    for subject, rel in SKILL_FILES.items()
    if (LEARNING / rel).exists()
}
ALL_SKILLS = {s["id"]: s for doc in SKILLS.values() for s in doc["skills"]}


def _items():
    for rel, doc in BANKS.items():
        for item in doc["items"]:
            yield rel, doc, item


ITEMS = list(_items())


def _item_param_id(entry):
    return entry[2].get("id", "?") if isinstance(entry[2], dict) else "?"


def _hebrew_strings(item):
    yield "prompt_he", item["prompt_he"]
    yield "explanation_he", item["explanation_he"]
    for c in item.get("choices") or []:
        yield "choice.he", c["he"]


def test_content_present():
    assert any(rel.startswith("science/") for rel in BANKS), "no science banks"
    assert any(rel.startswith("hebrew/") for rel in BANKS), "no hebrew banks"
    science_items = [i for rel, _, i in ITEMS if rel.startswith("science/")]
    hebrew_items = [i for rel, _, i in ITEMS if rel.startswith("hebrew/")]
    assert len(science_items) >= 600
    assert len(hebrew_items) >= 120


@pytest.mark.parametrize("rel", sorted(BANKS))
def test_bank_file_shape(rel):
    doc = BANKS[rel]
    assert isinstance(doc, dict)
    assert isinstance(doc.get("items"), list) and doc["items"], (
        f"{rel}: empty items"
    )
    assert doc.get("skill") in ALL_SKILLS, (
        f"{rel}: default skill {doc.get('skill')!r} is not defined"
    )


@pytest.mark.parametrize("entry", ITEMS, ids=_item_param_id)
def test_item_schema(entry):
    rel, doc, item = entry
    iid = item.get("id")
    missing = [k for k in ITEM_REQUIRED if k not in item]
    assert not missing, f"{iid}: missing {missing}"
    assert not set(item) - ITEM_ALLOWED, (
        f"{iid}: unknown keys {set(item) - ITEM_ALLOWED}"
    )
    assert isinstance(iid, str) and ID_RE.fullmatch(iid), f"bad id {iid!r}"
    assert item["kind"] in KINDS, f"{iid}: bad kind"
    assert (
        isinstance(item["grade"], int)
        and not isinstance(item["grade"], bool)
        and 0 <= item["grade"] <= 9
    )
    d = item["difficulty"]
    assert (
        isinstance(d, (int, float))
        and not isinstance(d, bool)
        and -2 <= d <= 2
    ), f"{iid}: difficulty {d}"
    for key in ("prompt_he", "prompt_en", "explanation_he", "explanation_en"):
        assert isinstance(item[key], str) and item[key].strip(), (
            f"{iid}: empty {key}"
        )
    assert isinstance(item["tags"], list) and item["tags"], (
        f"{iid}: tags must be a non-empty list"
    )
    assert all(
        isinstance(t, str) and re.fullmatch(r"[a-z0-9_]+", t)
        for t in item["tags"]
    )
    assert HEBREW_LETTER.search(item["prompt_he"]), (
        f"{iid}: prompt_he has no Hebrew"
    )
    assert HEBREW_LETTER.search(item["explanation_he"]), (
        f"{iid}: explanation_he has no Hebrew"
    )

    kind, answer, choices = item["kind"], item["answer"], item.get("choices")
    if kind == "true_false":
        assert choices is None, (
            f"{iid}: true_false choices are added by the engine"
        )
        assert isinstance(answer, bool), (
            f"{iid}: true_false answer must be true/false"
        )
        return
    assert isinstance(choices, list), f"{iid}: choices missing"
    for c in choices:
        assert (
            isinstance(c, dict) and {"he", "en"} <= set(c) <= CHOICE_ALLOWED
        ), f"{iid}: bad choice {c}"
        assert (
            isinstance(c["he"], str)
            and c["he"].strip()
            and isinstance(c["en"], str)
            and c["en"].strip()
        )
    if kind == "choice":
        assert 2 <= len(choices) <= 5, f"{iid}: {len(choices)} choices"
        assert isinstance(answer, int) and not isinstance(answer, bool), (
            f"{iid}: answer must be an index"
        )
        assert 0 <= answer < len(choices), f"{iid}: answer out of range"
    else:  # order
        assert 3 <= len(choices) <= 6, f"{iid}: order needs 3-6 steps"
        assert isinstance(answer, list) and sorted(answer) == list(
            range(len(choices))
        ), f"{iid}: answer not a permutation"
        assert answer != list(range(len(choices))), (
            f"{iid}: order shown already solved"
        )


@pytest.mark.parametrize("entry", ITEMS, ids=_item_param_id)
def test_item_choices_unique(entry):
    item = entry[2]
    choices = item.get("choices") or []
    for lang in ("he", "en"):
        texts = [c[lang].strip() for c in choices]
        assert len(texts) == len(set(texts)), (
            f"{item['id']}: duplicate {lang} choices {texts}"
        )


@pytest.mark.parametrize("entry", ITEMS, ids=_item_param_id)
def test_item_text_rules(entry):
    item = entry[2]
    iid = item["id"]
    for field, text in _hebrew_strings(item):
        assert not NIQQUD.search(text), (
            f"{iid}: niqqud/maqaf in {field}: {text!r}"
        )
    assert len(item["prompt_he"]) <= MAX_PROMPT_HE, (
        f"{iid}: prompt_he too long ({len(item['prompt_he'])})"
    )
    assert len(item["explanation_he"]) <= MAX_EXPLANATION_HE, (
        f"{iid}: explanation_he too long"
    )
    for c in item.get("choices") or []:
        assert len(c["he"]) <= MAX_CHOICE_HE, (
            f"{iid}: choice too long: {c['he']!r}"
        )
        assert len(c["en"]) <= MAX_CHOICE_EN, (
            f"{iid}: English choice too long: {c['en']!r}"
        )


def _emoji_valid(code) -> bool:
    if not isinstance(code, str) or not EMOJI_HEX.fullmatch(code):
        return False
    for part in code.split("-"):
        cp = int(part, 16)
        if part in ("200d", "fe0f"):
            continue
        # Twemoji file names: emoji code points are >= U+00A9.
        if cp < 0xA9:
            return False
    # The picture must ship with the game. (Python's own Unicode tables
    # are too old on 3.10 for newer emoji such as U+1F6DE.)
    return (EMOJI_DIR / f"{code}.png").is_file()


@pytest.mark.parametrize("entry", ITEMS, ids=_item_param_id)
def test_item_emoji(entry):
    item = entry[2]
    for c in item.get("choices") or []:
        if "emoji" in c:
            assert _emoji_valid(c["emoji"]), (
                f"{item['id']}: bad emoji code {c['emoji']!r}"
            )


def test_ids_unique_across_banks():
    ids = [item["id"] for _, _, item in ITEMS]
    for doc in BANKS.values():
        for el in (doc.get("elements") or {}).values():
            ids.extend(f["id"] for f in el["facts"])
    dupes = [i for i, n in Counter(ids).items() if n > 1]
    assert not dupes, f"duplicate ids: {dupes}"


def test_questions_unique():
    # the same prompt with the same choices is a real duplicate (same prompt, other choices is fine)
    keys = Counter(
        (
            item["prompt_he"].strip(),
            tuple(sorted(c["he"] for c in item.get("choices") or [])),
        )
        for _, _, item in ITEMS
    )
    dupes = [k[0] for k, n in keys.items() if n > 1]
    assert not dupes, f"duplicate questions: {dupes}"


def test_science_kind_mix():
    kinds = Counter(
        item["kind"] for rel, _, item in ITEMS if rel.startswith("science/")
    )
    total = sum(kinds.values())
    assert 0.12 <= kinds["true_false"] / total <= 0.30, kinds
    assert kinds["order"] / total >= 0.05, kinds
    assert kinds["choice"] / total >= 0.5, kinds


# ---------------------------------------------------------------- skills


@pytest.mark.parametrize("subject", sorted(SKILL_FILES))
def test_skill_file_shape(subject):
    assert subject in SKILLS, f"missing {SKILL_FILES[subject]}"
    doc = SKILLS[subject]
    assert doc["subject"] == subject
    ids = [s["id"] for s in doc["skills"]]
    assert len(ids) == len(set(ids)), "duplicate skill ids"
    for s in doc["skills"]:
        sid = s["id"]
        assert re.fullmatch(rf"{subject}\.[a-z0-9_]+\.[a-z0-9_]+", sid), (
            f"bad skill id {sid}"
        )
        assert isinstance(s["grade"], int) and 0 <= s["grade"] <= 9, sid
        for key in ("title_he", "title_en"):
            assert isinstance(s[key], str) and s[key].strip(), f"{sid}: {key}"
        assert not NIQQUD.search(s["title_he"]), f"{sid}: niqqud in title"
        assert isinstance(s.get("prereq"), list), (
            f"{sid}: prereq must be a list"
        )
        assert s["generator"] == "bank", f"{sid}: expected bank generator"
        if "mastery" in s:
            assert set(s["mastery"]) <= {"min_attempts", "threshold", "rating"}


def test_skill_counts():
    assert len(SKILLS["science"]["skills"]) >= 40
    assert len(SKILLS["hebrew"]["skills"]) >= 8


def _skill_items(skill):
    params = skill["params"]
    doc = BANKS.get(params["bank"])
    assert doc is not None, f"{skill['id']}: bank {params['bank']} not found"
    tags = set(params.get("tags") or [])
    return [i for i in doc["items"] if not tags or tags & set(i["tags"])]


@pytest.mark.parametrize("sid", sorted(ALL_SKILLS))
def test_skill_bank_resolves(sid):
    skill = ALL_SKILLS[sid]
    params = skill["params"]
    assert set(params) <= {"bank", "tags"}
    assert params["bank"].split("/")[0] in BANK_DIRS
    items = _skill_items(skill)
    assert len(items) >= MIN_ITEMS_PER_SKILL, f"{sid}: only {len(items)} items"


def test_prereqs_exist_and_acyclic():
    for sid, s in ALL_SKILLS.items():
        for p in s["prereq"]:
            assert p in ALL_SKILLS, f"{sid}: unknown prereq {p}"
            assert p != sid
            assert ALL_SKILLS[p]["grade"] <= s["grade"], (
                f"{sid}: prereq {p} is for a later grade"
            )
    state: dict[str, int] = {}

    def visit(node, path):
        if state.get(node) == 1:
            raise AssertionError(f"prereq cycle: {' -> '.join(path + [node])}")
        if state.get(node) == 2:
            return
        state[node] = 1
        for p in ALL_SKILLS[node]["prereq"]:
            visit(p, path + [node])
        state[node] = 2

    for sid in ALL_SKILLS:
        visit(sid, [])


def test_items_belong_to_their_skill():
    for rel, doc, item in ITEMS:
        sid = item.get("skill", doc["skill"])
        assert sid in ALL_SKILLS, f"{item['id']}: unknown skill {sid}"
        skill = ALL_SKILLS[sid]
        assert skill["params"]["bank"] == rel, (
            f"{item['id']}: skill {sid} reads another bank"
        )
        tags = set(skill["params"].get("tags") or [])
        assert not tags or tags & set(item["tags"]), (
            f"{item['id']}: not selected by its skill {sid}"
        )


def test_every_item_reachable():
    reachable = {i["id"] for s in ALL_SKILLS.values() for i in _skill_items(s)}
    orphans = [
        item["id"] for _, _, item in ITEMS if item["id"] not in reachable
    ]
    assert not orphans, f"items no skill can draw: {orphans[:10]}"


# ---------------------------------------------------------------- monster science cards


def test_monster_facts():
    doc = BANKS.get("science/monster_facts.yaml")
    assert doc is not None
    elements = doc["elements"]
    assert sorted(elements) == sorted(ELEMENTS)
    for name, el in elements.items():
        assert el["title_he"] and el["title_en"]
        facts = el["facts"]
        assert len(facts) == 8, f"{name}: {len(facts)} facts"
        for f in facts:
            assert set(f) == {"id", "he", "en"}
            assert HEBREW_LETTER.search(f["he"]) and f["en"].strip()
            assert not NIQQUD.search(f["he"]), f"{f['id']}: niqqud"
            assert len(f["he"]) <= MAX_FACT_HE, f"{f['id']}: fact too long"
        assert len({f["he"] for f in facts}) == 8, f"{name}: duplicate facts"
        quiz = [i for i in doc["items"] if f"element_{name}" in i["tags"]]
        assert len(quiz) >= 2, f"{name}: needs 2 quiz items"
