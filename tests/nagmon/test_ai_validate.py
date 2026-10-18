# SPDX-License-Identifier: GPL-3.0
"""WP9: untrusted model output -> SDD_CONTENT items (SDD_AI §5)."""

from __future__ import annotations

import re

import pytest

from nagmon.ai.validate import (
    BANK_ITEM_KEYS,
    ValidationError,
    clean_text,
    extract_json,
    validate_items,
    validate_quest,
    validate_story,
    validate_vocab,
)

ID_RE = re.compile(r"^ai\.[0-9a-f]{8}$")


def good_item(**overrides):
    item = {
        "id": "whatever",
        "kind": "choice",
        "grade": 2,
        "difficulty": 0.5,
        "prompt_he": "מה צמח צריך כדי לגדול?",
        "prompt_en": "What does a plant need to grow?",
        "choices": [
            {"he": "מים ואור", "en": "water and light"},
            {"he": "חושך בלבד", "en": "darkness only"},
            {"he": "סוכריות", "en": "candy"},
        ],
        "answer": 0,
        "explanation_he": "צמח צריך מים, אור ואוויר כדי לייצר מזון.",
        "explanation_en": "A plant needs water, light and air to make food.",
        "tags": ["plants"],
    }
    item.update(overrides)
    return item


def run(items, **kw):
    kw.setdefault("skill_id", "science.plants.needs")
    kw.setdefault("grade", 2)
    kw.setdefault("subject", "science")
    return validate_items(items, **kw)


JSON_CASES = [
    pytest.param('{"a": 1}', {"a": 1}, id="plain"),
    pytest.param('```json\n{"a": 1}\n```', {"a": 1}, id="fenced"),
    pytest.param('Sure! Here:\n{"a": 1}\nThanks', {"a": 1}, id="chatter"),
    pytest.param('x {"a": "}{"} y', {"a": "}{"}, id="braces-in-string"),
    pytest.param('{"a": "say \\"hi\\""}', {"a": 'say "hi"'}, id="escapes"),
    pytest.param("[1, 2, 3]", [1, 2, 3], id="array"),
    pytest.param('{"a": [1, 2,],}', {"a": [1, 2]}, id="trailing-commas"),
    pytest.param('{oops} then {"a": 2}', {"a": 2}, id="skips-invalid-first"),
]


@pytest.mark.parametrize("text,expected", JSON_CASES)
def test_extract_json_from_messy_text(text, expected):
    assert extract_json(text) == expected


def test_extract_json_raises_when_nothing_found():
    with pytest.raises(ValidationError):
        extract_json("no json here")


def test_clean_text_removes_niqqud_and_control_chars():
    assert clean_text("שָׁלוֹם\x00 ‏ עוֹלָם\n") == "שלום עולם"


def test_clean_text_keeps_maqaf():
    assert clean_text("בית־ספר") == "בית־ספר"


def test_valid_item_passes_with_ai_namespace_id():
    result = run([good_item()])
    assert len(result.valid) == 1
    item = result.valid[0]
    assert ID_RE.match(item["id"])
    assert item["skill"] == "science.plants.needs"
    assert set(item) <= set(BANK_ITEM_KEYS)
    assert "ai" in item["tags"]


def test_ids_are_unique_per_item():
    result = run([good_item(), good_item(prompt_he="שאלה אחרת על צמחים?")])
    assert len({item["id"] for item in result.valid}) == 2


def test_id_factory_is_used():
    result = run([good_item()], id_factory=lambda: "ai.0000abcd")
    assert result.valid[0]["id"] == "ai.0000abcd"


def test_unknown_keys_are_dropped():
    result = run([good_item(source="model", provenance="x")])
    assert "source" not in result.valid[0]


REPAIRS = [
    pytest.param(
        {"prompt_he": "מה צֶמַח צריך?"}, "prompt_he", "מה צמח צריך?", id="niqqud"
    ),
    pytest.param({"answer": "1"}, "answer", 1, id="answer-digit-string"),
    pytest.param({"answer": "חושך בלבד"}, "answer", 1, id="answer-as-text"),
    pytest.param({"difficulty": 7}, "difficulty", 2.0, id="difficulty-clamp"),
    pytest.param({"kind": "multiple_choice"}, "kind", "choice", id="kind"),
    pytest.param({"grade": None}, "grade", 2, id="missing-grade"),
    pytest.param(
        {"skill": "other.skill"}, "skill", "science.plants.needs", id="skill"
    ),
]


@pytest.mark.parametrize("override,field,expected", REPAIRS)
def test_item_repairs(override, field, expected):
    result = run([good_item(**override)])
    assert result.valid, result.rejected
    assert result.valid[0][field] == expected


def test_choices_given_as_strings_are_repaired():
    result = run([good_item(choices=["מים ואור", "חושך", "סוכריות"])])
    assert result.valid[0]["choices"][0] == {"he": "מים ואור"}


def test_bad_emoji_is_dropped_and_good_kept():
    choices = [
        {"he": "חתול", "emoji": "1f408"},
        {"he": "אבן", "emoji": "<img>"},
    ]
    result = run([good_item(choices=choices, answer=0)])
    assert result.valid[0]["choices"][0]["emoji"] == "1f408"
    assert "emoji" not in result.valid[0]["choices"][1]


def test_true_false_answer_repaired_and_choices_removed():
    item = good_item(
        kind="true_false",
        prompt_he="צמח צריך אור.",
        answer="נכון",
        choices=[{"he": "נכון"}, {"he": "לא נכון"}],
    )
    result = run([item])
    assert result.valid[0]["answer"] is True
    assert "choices" not in result.valid[0]


def test_order_item_with_permutation_is_valid():
    item = good_item(
        kind="order",
        prompt_he="סדרו מהקטן לגדול.",
        choices=[{"he": "נמלה"}, {"he": "עכבר"}, {"he": "פיל"}],
        answer=[0, 1, 2],
    )
    assert run([item]).valid[0]["answer"] == [0, 1, 2]


REJECTS = [
    pytest.param(
        {"choices": [{"he": "מים"}, {"he": "מים"}, {"he": "אור"}]},
        id="duplicate-choices",
    ),
    pytest.param({"choices": [{"he": "מים"}]}, id="one-choice"),
    pytest.param(
        {"choices": [{"he": str(i) + " א"} for i in range(5)]},
        id="five-choices",
    ),
    pytest.param({"answer": 3}, id="answer-out-of-range"),
    pytest.param({"answer": None}, id="answer-missing"),
    pytest.param({"prompt_he": "א" * 141}, id="prompt-too-long"),
    pytest.param(
        {"choices": [{"he": "א" * 41}, {"he": "ב"}], "answer": 1},
        id="choice-too-long",
    ),
    pytest.param({"explanation_he": "א" * 201}, id="explanation-too-long"),
    pytest.param({"explanation_he": ""}, id="explanation-missing"),
    pytest.param({"prompt_he": "What does a plant need?"}, id="no-hebrew"),
    pytest.param(
        {"explanation_he": "קראו עוד ב־https://example.com"}, id="url"
    ),
    pytest.param({"prompt_he": "איך להרוג צמח?"}, id="banned-word"),
    pytest.param({"kind": "essay"}, id="unknown-kind"),
    pytest.param({"grade": 12}, id="grade-out-of-range"),
]


@pytest.mark.parametrize("override", REJECTS)
def test_item_rejections(override):
    result = run([good_item(**override)])
    assert result.valid == []
    assert len(result.rejected) == 1
    assert result.rejected[0].errors


def test_order_with_bad_permutation_is_rejected():
    item = good_item(
        kind="order",
        choices=[{"he": "נמלה"}, {"he": "עכבר"}, {"he": "פיל"}],
        answer=[0, 0, 2],
    )
    assert run([item]).valid == []


def test_non_dict_items_are_rejected():
    result = run(["just text", 5])
    assert result.valid == []
    assert len(result.rejected) == 2


def test_items_wrapper_object_is_accepted():
    assert len(run({"items": [good_item()]}).valid) == 1


def test_english_language_requires_prompt_en():
    result = run([good_item(prompt_en="")], language="en")
    assert result.valid == []


def good_word(**overrides):
    word = {
        "word": "dog",
        "he": "כלב",
        "pos": "noun",
        "topic": "animals",
        "level": "preA1",
        "grade": 1,
        "emoji": "1f436",
        "example_en": "The dog is happy.",
        "example_he": "הכלב שמח.",
    }
    word.update(overrides)
    return word


def test_valid_vocab_word_passes():
    result = validate_vocab([good_word()])
    assert result.valid == [good_word()]


VOCAB_REJECTS = [
    pytest.param({"pos": "thing"}, id="bad-pos"),
    pytest.param({"level": "C2"}, id="bad-level"),
    pytest.param({"example_en": "It is happy."}, id="example-without-word"),
    pytest.param({"he": "dog"}, id="he-not-hebrew"),
    pytest.param({"word": "כלב"}, id="word-not-latin"),
    pytest.param({"grade": "x"}, id="bad-grade"),
]


@pytest.mark.parametrize("override", VOCAB_REJECTS)
def test_vocab_rejections(override):
    assert validate_vocab([good_word(**override)]).valid == []


def test_vocab_bad_emoji_becomes_null():
    result = validate_vocab([good_word(emoji="dog!")])
    assert result.valid[0]["emoji"] is None


def good_story(**overrides):
    story = {
        "title": "My Cat",
        "level": "A1",
        "grade": 4,
        "text_en": "I have a cat. Her name is Mitzi. She is black and white.",
        "text_he": "יש לי חתולה. קוראים לה מיצי. היא שחורה ולבנה.",
        "questions": [
            {
                "kind": "choice",
                "prompt_en": "What color is Mitzi?",
                "prompt_he": "באיזה צבע מיצי?",
                "choices": [
                    {"he": "שחור ולבן", "en": "black and white"},
                    {"he": "כתום", "en": "orange"},
                ],
                "answer": 0,
                "explanation_he": "בסיפור כתוב שהיא שחורה ולבנה.",
            }
        ],
    }
    story.update(overrides)
    return story


def test_valid_story_gets_ids_for_story_and_questions():
    result = validate_story([good_story()], grade=4, level="A1")
    story = result.valid[0]
    assert ID_RE.match(story["id"])
    assert story["questions"][0]["id"] == story["id"] + ".q1"
    assert story["questions"][0]["skill"] == "english.reading"


def test_story_without_valid_questions_is_rejected():
    story = good_story(questions=[{"kind": "choice", "answer": 9}])
    assert validate_story([story], grade=4, level="A1").valid == []


def test_story_too_long_is_rejected():
    story = good_story(text_en="word " * 400)
    assert validate_story([story], grade=4, level="A1").valid == []


def good_quest(**overrides):
    quest = {
        "title_he": "הגינה של סבתא",
        "npc_name_he": "סבתא רות",
        "intro_he": "העגבניות בגינה צמאות!",
        "task_he": "עזרו לי לגלות מה הצמחים צריכים.",
        "success_he": "כל הכבוד! הגינה פורחת.",
    }
    quest.update(overrides)
    return quest


def test_valid_quest_passes():
    result = validate_quest(
        [good_quest()], grade=2, skill_id="science.plants.needs"
    )
    quest = result.valid[0]
    assert ID_RE.match(quest["id"])
    assert quest["skill"] == "science.plants.needs"
    assert quest["grade"] == 2


def test_quest_with_long_intro_is_rejected():
    result = validate_quest(
        [good_quest(intro_he="א" * 201)], grade=2, skill_id="s.x"
    )
    assert result.valid == []
