# SPDX-License-Identifier: GPL-3.0
"""WP9: "explain it again" for a wrong answer (SDD_AI §9)."""

from __future__ import annotations

import json

from nagmon.ai.explain import Explainer
from nagmon.ai.fakes import FakeRouter
from nagmon.ai.router import AllProvidersFailed
from nagmon.ai.safety import Safety

BANK_ITEM = {
    "id": "sci.plants.001",
    "kind": "choice",
    "prompt_he": "מה צמח צריך כדי לגדול?",
    "choices": [{"he": "מים ואור"}, {"he": "חושך"}],
    "answer": 0,
    "explanation_he": "צמח צריך מים ואור כדי לייצר מזון.",
}

QUESTION_DICT = {
    "item_id": "math.mul.facts:7x8",
    "kind": "choice",
    "prompt_he": "כמה זה 7 כפול 8?",
    "choices": [
        {"id": "a", "text_he": "54"},
        {"id": "b", "text_he": "56"},
    ],
    "answer": "b",
    "explanation_he": "7 כפול 8 זה 56.",
}


def reply(text):
    return json.dumps({"answer": text}, ensure_ascii=False)


def test_explain_again_returns_new_ai_explanation(tmp_path):
    router = FakeRouter(reply("דמיינו עציץ בחדר חשוך. הוא נובל בלי אור."))
    explainer = Explainer(router, Safety(), tmp_path / "cache.json")
    result = explainer.explain_again(BANK_ITEM, 1, 7)
    assert result.source == "ai"
    assert result.text_he.startswith("דמיינו עציץ")
    assert router.calls[0]["purpose"] == "kid"


def test_prompt_includes_question_given_and_correct_answer(tmp_path):
    router = FakeRouter(reply("הסבר חדש."))
    Explainer(router, Safety(), tmp_path / "c.json").explain_again(
        BANK_ITEM, 1, 7
    )
    text = "\n".join(m["content"] for m in router.calls[0]["messages"])
    assert "מה צמח צריך כדי לגדול?" in text
    assert "חושך" in text
    assert "מים ואור" in text
    assert "צמח צריך מים ואור כדי לייצר מזון." in text
    assert "7" in text


def test_cached_by_item_and_given_answer(tmp_path):
    router = FakeRouter(reply("הסבר ראשון."), reply("הסבר שני."))
    cache = tmp_path / "cache.json"
    explainer = Explainer(router, Safety(), cache)
    first = explainer.explain_again(BANK_ITEM, 1, 7)
    again = explainer.explain_again(BANK_ITEM, 1, 7)
    assert again.text_he == first.text_he
    assert len(router.calls) == 1
    reloaded = Explainer(FakeRouter(reply("x")), Safety(), cache)
    assert reloaded.explain_again(BANK_ITEM, 1, 7).text_he == "הסבר ראשון."


def test_different_given_answer_asks_again(tmp_path):
    router = FakeRouter(reply("הסבר ראשון."), reply("הסבר שני."))
    explainer = Explainer(router, Safety(), tmp_path / "cache.json")
    explainer.explain_again(QUESTION_DICT, "a", 9)
    explainer.explain_again(QUESTION_DICT, "c", 9)
    assert len(router.calls) == 2


def test_offline_falls_back_to_item_explanation(tmp_path):
    router = FakeRouter(AllProvidersFailed("אין רשת", []))
    explainer = Explainer(router, Safety(), tmp_path / "cache.json")
    result = explainer.explain_again(BANK_ITEM, 1, 7)
    assert result.source == "canned"
    assert result.text_he == BANK_ITEM["explanation_he"]


def test_unsafe_output_falls_back_and_is_not_cached(tmp_path):
    router = FakeRouter(
        reply("See https://x.example for a gun"), reply("טוב.")
    )
    explainer = Explainer(router, Safety(), tmp_path / "cache.json")
    assert explainer.explain_again(BANK_ITEM, 1, 7).source == "canned"
    assert explainer.explain_again(BANK_ITEM, 1, 7).text_he == "טוב."


def test_accepts_question_model_dict(tmp_path):
    router = FakeRouter(reply("שבע פעמים שמונה: 8+8+8+8+8+8+8 = 56."))
    explainer = Explainer(router, Safety(), tmp_path / "cache.json")
    result = explainer.explain_again(QUESTION_DICT, "a", 9)
    assert result.source == "ai"
    text = "\n".join(m["content"] for m in router.calls[0]["messages"])
    assert "54" in text and "56" in text


def test_without_router_uses_item_explanation(tmp_path):
    explainer = Explainer(None, Safety(), tmp_path / "cache.json")
    result = explainer.explain_again(BANK_ITEM, 1, 7)
    assert result.source == "canned"


def test_explanations_are_logged_when_log_given(tmp_path):
    entries = []

    class Log:
        def append(self, entry):
            entries.append(entry)

    router = FakeRouter(reply("הסבר."))
    explainer = Explainer(
        router, Safety(), tmp_path / "cache.json", log_store=Log()
    )
    explainer.explain_again(BANK_ITEM, 1, 7)
    assert entries[-1]["kind"] == "explain"
    assert entries[-1]["item_id"] == "sci.plants.001"
