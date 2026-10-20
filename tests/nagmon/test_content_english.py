"""Schema and consistency checks for the English learning content (SDD_CONTENT).

Covers mods/nagmon/learning/english/*.yaml and skills/english.yaml.
Uses only PyYAML and the standard library.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from functools import cache
from pathlib import Path
from typing import Any

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[2] / "mods" / "nagmon" / "learning"
ENGLISH = ROOT / "english"
SKILLS_FILE = ROOT / "skills" / "english.yaml"
BANK_FILES = ("english/sentences.yaml", "english/phonics.yaml")
READING_FILE = "english/reading.yaml"

POS = {"noun", "verb", "adj", "adv", "prep", "pron", "num", "phrase", "other"}
LEVELS = ("preA1", "A1", "A2", "B1")
LEVEL_GRADES = {"preA1": (0, 2), "A1": (3, 4), "A2": (5, 6), "B1": (7, 9)}
KINDS = {"choice", "true_false", "order"}
VOCAB_MODES = {
    "picture_to_word",
    "word_to_translation",
    "listen_to_picture",
    "spelling",
    "sentence_cloze",
}
PICTURE_MODES = {"picture_to_word", "listen_to_picture"}

NIQQUD = re.compile("[֑-ׇ]")
HEBREW = re.compile("[א-ת]")
EMOJI = re.compile(r"^[0-9a-f]{2,6}(-[0-9a-f]{2,6})*$")
SKILL_ID = re.compile(
    r"^english\.(phonics|vocab|grammar|reading)\.[A-Za-z0-9_]+$"
)

MAX_PROMPT_HE = 140
MAX_CHOICE = 40
MAX_EXPLANATION = 200
MIN_ITEMS_PER_TAG = 8
MIN_WORDS_PER_TOPIC_LEVEL = 4


@cache
def load(rel: str) -> Any:
    with open(ROOT / rel, encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def words() -> list[dict[str, Any]]:
    return load("english/words.yaml")


def skills() -> list[dict[str, Any]]:
    return load("skills/english.yaml")["skills"]


def bank_items(rel: str) -> list[dict[str, Any]]:
    """Items of a bank file, with reading questions flattened and given their passage's fields."""
    data = load(rel)
    if rel == READING_FILE:
        out = []
        for passage in data:
            for q in passage["questions"]:
                item = {
                    k: passage[k]
                    for k in ("grade", "skill", "tags")
                    if k in passage
                }
                item.update(q)
                out.append(item)
        return out
    default_skill = data.get("skill")
    out = []
    for it in data["items"]:
        item = dict(it)
        item.setdefault("skill", default_skill)
        out.append(item)
    return out


def all_bank_items() -> list[tuple[str, dict[str, Any]]]:
    return [
        (rel, it)
        for rel in (*BANK_FILES, READING_FILE)
        for it in bank_items(rel)
    ]


def all_strings(obj: Any):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from all_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from all_strings(v)


def check_emoji(code: str) -> None:
    assert isinstance(code, str) and EMOJI.match(code), (
        f"bad emoji code {code!r}"
    )
    cps = [int(part, 16) for part in code.split("-")]
    for cp in cps:
        assert cp <= 0x10FFFF and not 0xD800 <= cp <= 0xDFFF, (
            f"bad code point in {code}"
        )
    # Twemoji file names drop U+FE0F unless the sequence has a ZWJ.
    if 0xFE0F in cps:
        assert 0x200D in cps, f"{code}: fe0f only allowed in ZWJ sequences"


# --------------------------------------------------------------------------- files


@pytest.mark.parametrize(
    "rel",
    [
        "english/words.yaml",
        "english/sentences.yaml",
        "english/reading.yaml",
        "english/phonics.yaml",
        "skills/english.yaml",
    ],
)
def test_file_has_no_niqqud(rel: str) -> None:
    bad = [s for s in all_strings(load(rel)) if NIQQUD.search(s)]
    assert not bad, f"niqqud/cantillation in {rel}: {bad[:5]}"


# --------------------------------------------------------------------------- words


def test_words_count_and_levels() -> None:
    counts = Counter(w["level"] for w in words())
    assert sum(counts.values()) >= 850
    assert counts["preA1"] >= 280
    assert counts["A1"] >= 330
    assert counts["A2"] >= 190
    assert counts["B1"] >= 45


def test_word_entries_schema() -> None:
    required = (
        "word",
        "he",
        "pos",
        "topic",
        "level",
        "grade",
        "emoji",
        "example_en",
        "example_he",
    )
    for w in words():
        for key in required:
            assert key in w, f"{w.get('word')}: missing {key}"
        assert (
            isinstance(w["word"], str)
            and w["word"].strip() == w["word"]
            and w["word"]
        )
        assert w["pos"] in POS, f"{w['word']}: pos {w['pos']}"
        assert w["level"] in LEVELS, f"{w['word']}: level {w['level']}"
        assert isinstance(w["grade"], int) and 0 <= w["grade"] <= 9
        lo, hi = LEVEL_GRADES[w["level"]]
        assert lo <= w["grade"] <= hi, (
            f"{w['word']}: grade {w['grade']} vs {w['level']}"
        )
        assert isinstance(w["topic"], str) and re.match(
            r"^[a-z]+$", w["topic"]
        )
        assert HEBREW.search(w["he"]) and HEBREW.search(w["example_he"]), w[
            "word"
        ]
        assert not HEBREW.search(w["word"] + w["example_en"]), w["word"]
        assert len(w["word"]) <= MAX_CHOICE and len(w["he"]) <= MAX_CHOICE, w[
            "word"
        ]
        assert (
            len(w["example_en"]) <= MAX_PROMPT_HE
            and len(w["example_he"]) <= MAX_PROMPT_HE
        )
        if w["emoji"] is not None:
            check_emoji(w["emoji"])


def test_words_unique() -> None:
    keys = Counter((w["word"].lower(), w["pos"]) for w in words())
    dups = [k for k, n in keys.items() if n > 1]
    assert not dups, f"duplicate (word, pos): {dups}"


def test_example_contains_word_for_cloze() -> None:
    missing = []
    for w in words():
        stem = re.escape(w["word"].lower().rstrip("?"))
        if not re.search(r"(?<![a-z])" + stem, w["example_en"].lower()):
            missing.append(w["word"])
    assert not missing, f"example_en does not contain the word: {missing}"


def test_topic_level_groups_big_enough_for_distractors() -> None:
    groups = Counter((w["level"], w["topic"]) for w in words())
    small = {k: n for k, n in groups.items() if n < MIN_WORDS_PER_TOPIC_LEVEL}
    assert not small, f"topic/level groups with too few words: {small}"


def test_translations_unambiguous_within_group() -> None:
    seen: dict[tuple[str, str, str], str] = {}
    clashes = []
    for w in words():
        key = (w["level"], w["topic"], w["he"])
        if key in seen:
            clashes.append((seen[key], w["word"], w["he"]))
        seen[key] = w["word"]
    assert not clashes, (
        f"same Hebrew for two words in one topic/level: {clashes}"
    )


# --------------------------------------------------------------------------- bank items


def _choice_texts(item: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        c if isinstance(c, dict) else {"en": c}
        for c in item.get("choices", [])
    ]


def test_bank_item_ids_unique() -> None:
    ids = Counter(it["id"] for _, it in all_bank_items())
    dups = [i for i, n in ids.items() if n > 1]
    assert not dups, f"duplicate item ids: {dups}"


def test_bank_items_schema() -> None:
    skill_ids = {s["id"] for s in skills()}
    for rel, it in all_bank_items():
        where = f"{rel}:{it.get('id')}"
        for key in (
            "id",
            "kind",
            "prompt_he",
            "answer",
            "explanation_he",
            "skill",
        ):
            assert key in it, f"{where}: missing {key}"
        assert it["kind"] in KINDS, where
        assert it["skill"] in skill_ids, (
            f"{where}: unknown skill {it['skill']}"
        )
        grade = it.get("grade")
        assert isinstance(grade, int) and 0 <= grade <= 9, where
        diff = it.get("difficulty", 0.0)
        assert isinstance(diff, (int, float)) and -2 <= diff <= 2, where
        assert HEBREW.search(it["prompt_he"]), where
        assert len(it["prompt_he"]) <= MAX_PROMPT_HE, where
        assert (
            it["explanation_he"]
            and len(it["explanation_he"]) <= MAX_EXPLANATION
        ), where
        assert isinstance(it.get("tags", []), list), where
        if "emoji" in it:
            check_emoji(it["emoji"])
        if "speak_en" in it:
            assert (
                isinstance(it["speak_en"], str) and it["speak_en"].strip()
            ), where

        choices = _choice_texts(it)
        if it["kind"] == "true_false":
            assert it["answer"] in (True, False), where
            assert not choices, f"{where}: true_false must not list choices"
            continue
        assert 2 <= len(choices) <= 6, where
        for c in choices:
            assert c.get("en") or c.get("he"), where
            for lang in ("en", "he"):
                if c.get(lang) is not None:
                    assert isinstance(c[lang], str), where
                    assert len(c[lang]) <= MAX_CHOICE, (
                        f"{where}: choice too long {c[lang]!r}"
                    )
            if c.get("emoji"):
                check_emoji(c["emoji"])
        for lang in ("en", "he"):
            texts = [c[lang].strip().lower() for c in choices if c.get(lang)]
            assert len(texts) == len(set(texts)), (
                f"{where}: duplicate choices {texts}"
            )
        if it["kind"] == "choice":
            assert len(choices) <= 4, where
            assert isinstance(it["answer"], int) and not isinstance(
                it["answer"], bool
            ), where
            assert 0 <= it["answer"] < len(choices), (
                f"{where}: answer out of range"
            )
        else:  # order
            assert sorted(it["answer"]) == list(range(len(choices))), (
                f"{where}: bad order answer"
            )
            assert it["answer"] != list(range(len(choices))), (
                f"{where}: tiles not shuffled"
            )


def test_grammar_items_have_english_prompt() -> None:
    for it in bank_items("english/sentences.yaml"):
        assert it.get("prompt_en"), it["id"]
        assert it["skill"].startswith("english.grammar."), it["id"]
        assert it["tags"] == [it["skill"].rsplit(".", 1)[1]], it["id"]


def test_grammar_bank_size() -> None:
    assert len(bank_items("english/sentences.yaml")) >= 230


def test_phonics_listening_items_have_speech() -> None:
    items = bank_items("english/phonics.yaml")
    assert len(items) >= 200
    for it in items:
        assert it["skill"].startswith("english.phonics."), it["id"]
        assert it["grade"] <= 2, it["id"]
        if "Listen" in (it.get("prompt_en") or "") or it["tags"][0] in {
            "letter_names",
            "initial_sounds",
            "digraphs",
        }:
            assert it.get("speak_en"), (
                f"{it['id']}: listening item needs speak_en"
            )


# --------------------------------------------------------------------------- reading


def _word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9'-]+", text))


def test_reading_passages_schema() -> None:
    passages = load(READING_FILE)
    assert len(passages) >= 28
    ids = Counter(p["id"] for p in passages)
    assert all(n == 1 for n in ids.values()), ids
    for p in passages:
        for key in (
            "id",
            "grade",
            "level",
            "title",
            "text_en",
            "text_he",
            "questions",
            "skill",
        ):
            assert key in p, f"{p.get('id')}: missing {key}"
        assert p["level"] in LEVELS, p["id"]
        assert 3 <= p["grade"] <= 9, p["id"]
        assert re.match(r"^english\.reading\.level\d+$", p["skill"]), p["id"]
        assert HEBREW.search(p["text_he"]) and not HEBREW.search(
            p["text_en"]
        ), p["id"]
        assert 25 <= _word_count(p["text_en"]) <= 200, p["id"]
        assert 3 <= len(p["questions"]) <= 4, p["id"]
        for q in p["questions"]:
            assert q["id"].startswith(p["id"] + ".q"), q["id"]
            assert q.get("prompt_en"), q["id"]


def test_reading_gets_longer_with_level() -> None:
    by_level: dict[int, list[int]] = defaultdict(list)
    for p in load(READING_FILE):
        n = int(p["skill"].rsplit("level", 1)[1])
        by_level[n].append(_word_count(p["text_en"]))
    averages = [sum(v) / len(v) for _, v in sorted(by_level.items())]
    assert averages == sorted(averages), averages
    assert averages[0] < 50 and averages[-1] > 150


# --------------------------------------------------------------------------- skills


def test_skills_schema() -> None:
    data = load("skills/english.yaml")
    assert data["subject"] == "english"
    ids = Counter(s["id"] for s in skills())
    assert all(n == 1 for n in ids.values()), [
        i for i, n in ids.items() if n > 1
    ]
    assert len(ids) >= 40
    for s in skills():
        for key in (
            "id",
            "grade",
            "title_he",
            "title_en",
            "prereq",
            "generator",
            "params",
        ):
            assert key in s, f"{s.get('id')}: missing {key}"
        assert SKILL_ID.match(s["id"]), s["id"]
        assert isinstance(s["grade"], int) and 0 <= s["grade"] <= 9, s["id"]
        assert HEBREW.search(s["title_he"]), s["id"]
        assert isinstance(s["prereq"], list), s["id"]


def test_prereqs_exist_and_not_later_grade() -> None:
    by_id = {s["id"]: s for s in skills()}
    for s in skills():
        for p in s["prereq"]:
            assert p in by_id, f"{s['id']}: unknown prereq {p}"
            assert p != s["id"], s["id"]
            assert by_id[p]["grade"] <= s["grade"], (
                f"{s['id']}: prereq {p} has a later grade"
            )


def test_skill_graph_has_no_cycles() -> None:
    graph = {s["id"]: list(s["prereq"]) for s in skills()}
    state: dict[str, int] = {}

    def visit(node: str, path: list[str]) -> None:
        if state.get(node) == 2:
            return
        assert state.get(node) != 1, f"cycle: {' -> '.join(path + [node])}"
        state[node] = 1
        for nxt in graph.get(node, []):
            visit(nxt, path + [node])
        state[node] = 2

    for node in graph:
        visit(node, [])


def test_bank_skills_reference_existing_banks_and_tags() -> None:
    for s in skills():
        if s["generator"] != "bank":
            continue
        rel = s["params"]["bank"]
        assert (ROOT / rel).is_file(), f"{s['id']}: missing bank {rel}"
        items = bank_items(rel)
        for tag in s["params"].get("tags", []):
            n = sum(1 for it in items if tag in it.get("tags", []))
            assert n >= MIN_ITEMS_PER_TAG, (
                f"{s['id']}: tag {tag} has only {n} items"
            )
        if not s["params"].get("tags"):
            assert any(it["skill"] == s["id"] for it in items), s["id"]


def test_every_bank_tag_is_used_by_a_skill() -> None:
    used = defaultdict(set)
    for s in skills():
        if s["generator"] == "bank":
            used[s["params"]["bank"]].update(s["params"].get("tags", []))
    for rel in (*BANK_FILES, READING_FILE):
        tags = {t for it in bank_items(rel) for t in it.get("tags", [])}
        assert tags <= used[rel], (
            f"{rel}: tags without a skill: {sorted(tags - used[rel])}"
        )


def test_vocab_skills_match_word_list() -> None:
    groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for w in words():
        groups[(w["level"], w["topic"])].append(w)
    covered = set()
    for s in skills():
        if s["generator"] != "english.vocab":
            continue
        params = s["params"]
        assert params["level"] in LEVELS, s["id"]
        assert params["modes"] and set(params["modes"]) <= VOCAB_MODES, s["id"]
        pics = 0
        for topic in params["topics"]:
            group = groups.get((params["level"], topic))
            assert group, (
                f"{s['id']}: no {params['level']} words for topic {topic}"
            )
            pics += sum(1 for w in group if w["emoji"])
            covered.add((params["level"], topic))
        if PICTURE_MODES & set(params["modes"]):
            assert pics >= 4, (
                f"{s['id']}: picture modes need at least 4 words with emoji"
            )
    assert covered == set(groups), (
        f"word groups without a skill: {sorted(set(groups) - covered)}"
    )
