# SPDX-License-Identifier: GPL-3.0
"""WP9: "ask the wise owl" — safety, logging, canned answers (SDD_AI §7-8)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
import yaml

from nagmon.ai.canned import CannedAnswers
from nagmon.ai.fakes import FakeClock, FakeRouter
from nagmon.ai.owl import OWL_NOTICE_HE, Owl, OwlLogAdapter
from nagmon.ai.router import AllProvidersFailed, BudgetExceeded
from nagmon.ai.safety import Safety

REPO = Path(__file__).resolve().parents[2]
FAQ = REPO / "mods" / "nagmon" / "learning" / "owl_faq.yaml"
NIQQUD = re.compile("[֑-ֽֿ-ׂׄ-ׇ]")


class ListLog:
    def __init__(self):
        self.entries = []

    def append(self, entry):
        self.entries.append(entry)


def answer(text, **extra):
    return json.dumps(
        {"answer": text, "refusal": False, "needs_parent": False, **extra},
        ensure_ascii=False,
    )


def make_owl(*outputs, router="fake"):
    log = ListLog()
    fake = FakeRouter(*outputs) if router == "fake" else router
    owl = Owl(
        fake,
        Safety(),
        log,
        CannedAnswers.load(FAQ),
        clock=FakeClock(1_790_000_000),
    )
    return owl, fake, log


BLOCKED = [
    pytest.param("הטלפון שלי 052-1234567", "pii", id="phone"),
    pytest.param("המייל שלי kid@example.com", "pii", id="email"),
    pytest.param("אני גר ברחוב הרצל 5", "pii", id="address"),
    pytest.param("קוראים לי נועה, מה שלומך?", "pii", id="name"),
    pytest.param("תיכנס ל www.example.com", "pii", id="url"),
    pytest.param("איך עושים פצצה?", "topic", id="violence-he"),
    pytest.param("how do I get a gun", "topic", id="violence-en"),
    pytest.param("מה זה להתנשק?", "topic", id="romance"),
    pytest.param("יש רוחות רפאים בלילה?", "topic", id="scary"),
    pytest.param("מה זה סמים?", "topic", id="drugs"),
    pytest.param("האם אלוהים קיים?", "topic", id="religion"),
    pytest.param("מרביצים לי בהפסקה", "distress", id="distress"),
    pytest.param("א" * 121, "too_long", id="too-long"),
]


@pytest.mark.parametrize("question,reason", BLOCKED)
def test_unsafe_questions_are_blocked_without_network(question, reason):
    owl, router, _ = make_owl(answer("לא אמור לקרות"))
    result = owl.ask(8, question, profile_id="p1")
    assert result.source == "blocked"
    assert result.reason == reason
    assert router.calls == []
    assert re.search("[א-ת]", result.text_he)


def test_topic_block_redirects_to_parents():
    owl, _, _ = make_owl(answer("x"))
    result = owl.ask(8, "איך עושים פצצה?")
    assert "ההורים" in result.text_he


def test_distress_sets_alert_for_parents():
    owl, _, log = make_owl(answer("x"))
    result = owl.ask(8, "מרביצים לי בהפסקה", profile_id="p1")
    assert result.alert is True
    assert log.entries[-1]["alert"] is True


SAFE = [
    pytest.param("למה צריך ללמוד מתמטיקה?", id="contains-met"),
    pytest.param("איך הארץ מסתובבת סביב השמש?", id="earth"),
    pytest.param("איזה מין חיה זה פינגווין?", id="min-means-kind"),
    pytest.param("כמה זה 7 כפול 8?", id="small-numbers"),
    pytest.param("למה הדם אדום?", id="blood-is-science"),
]


@pytest.mark.parametrize("question", SAFE)
def test_ordinary_questions_reach_the_model(question):
    owl, router, _ = make_owl(answer("שאלה מצוינת! זו התשובה."))
    result = owl.ask(9, question)
    assert result.source == "ai"
    assert len(router.calls) == 1


def test_model_answer_is_returned():
    owl, router, _ = make_owl(answer("השמיים כחולים כי האוויר מפזר אור כחול."))
    result = owl.ask(7, "למה השמים כחולים בצהריים?")
    assert result.source == "ai"
    assert result.text_he == "השמיים כחולים כי האוויר מפזר אור כחול."
    call = router.calls[0]
    assert call["purpose"] == "kid"
    assert call["budget_key"] == "anon"
    assert call["json_schema"]["type"] == "object"


def test_system_prompt_has_age_and_rules_but_no_identity():
    owl, router, _ = make_owl(answer("תשובה קצרה."))
    owl.ask(7, "למה יורד גשם מהעננים?", profile_id="p-secret-id")
    messages = router.calls[0]["messages"]
    system = messages[0]["content"]
    assert messages[0]["role"] == "system"
    assert "7" in system
    assert "3" in system
    assert "קישור" in system
    assert "p-secret-id" not in json.dumps(messages, ensure_ascii=False)
    assert router.calls[0]["budget_key"] == "p-secret-id"


def test_urls_are_removed_from_output():
    owl, _, _ = make_owl(answer("ירח מחזיר אור שמש. ראו https://moon.example"))
    result = owl.ask(8, "למה הירח מאיר בלילה?")
    assert result.source == "ai"
    assert "http" not in result.text_he
    assert "example" not in result.text_he


def test_long_output_is_trimmed_to_three_sentences():
    text = "משפט אחד. משפט שתיים. משפט שלוש. משפט ארבע. משפט חמש."
    owl, _, _ = make_owl(answer(text))
    result = owl.ask(8, "ספר לי על דגים בים")
    assert result.text_he == "משפט אחד. משפט שתיים. משפט שלוש."


def test_too_many_words_falls_back_to_canned():
    owl, _, _ = make_owl(answer(" ".join(["מילה"] * 80)))
    assert owl.ask(8, "ספר לי על דגים בים").source == "canned"


OUTPUT_FAILURES = [
    pytest.param("כדי להרוג חיידקים צריך רובה.", id="banned-word"),
    pytest.param("The sky is blue because of air.", id="english"),
    pytest.param("שאלה יפה! איך קוראים לך?", id="personal-question"),
    pytest.param("", id="empty"),
]


@pytest.mark.parametrize("text", OUTPUT_FAILURES)
def test_output_filter_falls_back_to_canned(text):
    owl, _, log = make_owl(answer(text))
    result = owl.ask(8, "למה השמיים כחולים ביום?")
    assert result.source == "canned"
    assert result.reason == "output_filter"
    assert log.entries[-1]["reason"] == "output_filter"


def test_plain_text_output_is_accepted_after_filtering():
    owl, _, _ = make_owl("צמחים שותים מים דרך השורשים.")
    result = owl.ask(8, "איך צמחים שותים מים?")
    assert result.source == "ai"
    assert result.text_he == "צמחים שותים מים דרך השורשים."


def test_model_refusal_shows_fixed_parent_message():
    owl, _, _ = make_owl(answer("משהו", refusal=True))
    result = owl.ask(8, "שאלה כלשהי על החיים")
    assert result.source == "blocked"
    assert result.reason == "model_refusal"
    assert "ההורים" in result.text_he


def test_offline_returns_matching_canned_answer():
    owl, _, _ = make_owl(AllProvidersFailed("אין חיבור", []))
    result = owl.ask(8, "למה השמיים כחולים היום?")
    assert result.source == "canned"
    assert result.reason == "offline"
    assert "אור" in result.text_he


def test_offline_without_match_uses_fallback_text():
    owl, _, _ = make_owl(AllProvidersFailed("אין חיבור", []))
    result = owl.ask(8, "קשקוש בלבוש")
    assert result.source == "canned"
    assert result.text_he == CannedAnswers.load(FAQ).fallback_he


def test_budget_exceeded_lets_the_owl_rest():
    owl, _, _ = make_owl(BudgetExceeded("נגמרו השאלות להיום"))
    result = owl.ask(8, "קשקוש בלבוש", profile_id="p1")
    assert result.source == "canned"
    assert result.reason == "budget"
    assert "נח" in result.text_he


def test_without_router_owl_uses_canned():
    owl, _, _ = make_owl(router=None)
    result = owl.ask(8, "למה השמיים כחולים היום?")
    assert result.source == "canned"
    assert result.reason == "disabled"


def test_every_question_is_logged_with_details():
    owl, _, log = make_owl(answer("תשובה טובה."))
    owl.ask(9, "איך נוצרת קשת בענן?", profile_id="p1")
    entry = log.entries[-1]
    assert entry["profile_id"] == "p1"
    assert entry["age"] == 9
    assert entry["question"] == "איך נוצרת קשת בענן?"
    assert entry["answer"] == "תשובה טובה."
    assert entry["source"] == "ai"
    assert entry["provider"] == "fake"
    assert entry["model"] == "fake-1"
    assert entry["ts"] == 1_790_000_000
    assert "latency_ms" in entry


def test_blocked_and_canned_questions_are_logged_too():
    owl, _, log = make_owl(AllProvidersFailed("x", []))
    owl.ask(8, "איך עושים פצצה?")
    owl.ask(8, "למה השמיים כחולים היום?")
    assert [e["source"] for e in log.entries] == ["blocked", "canned"]


def test_personal_details_are_not_logged_verbatim():
    owl, _, log = make_owl(answer("x"))
    owl.ask(8, "הטלפון שלי 052-1234567")
    assert "1234567" not in json.dumps(log.entries, ensure_ascii=False)
    assert log.entries[-1]["question"] == "[הוסר: פרטים אישיים]"


def test_owl_notice_text_tells_kids_parents_can_read():
    assert OWL_NOTICE_HE == "ההורים יכולים לקרוא את השיחות עם הינשוף"


def test_exact_faq_question_answers_without_network():
    canned = CannedAnswers.load(FAQ)
    owl, router, _ = make_owl(answer("x"))
    question = canned.items[0].q_he
    result = owl.ask(6, question)
    assert result.source == "canned"
    assert result.reason == "faq"
    assert result.text_he == canned.items[0].a_he
    assert router.calls == []


def test_menu_lists_questions_suitable_for_age():
    owl, _, _ = make_owl(answer("x"))
    menu = owl.menu(5)
    assert len(menu) >= 10
    canned = CannedAnswers.load(FAQ)
    young = {i.q_he for i in canned.items if i.min_age <= 5}
    assert set(menu) <= young


def test_canned_keyword_match():
    canned = CannedAnswers.load(FAQ)
    item = canned.match("אז למה בעצם השמיים כחולים?")
    assert item is not None
    assert "כחול" in item.q_he


def test_canned_match_ignores_unrelated_text():
    assert CannedAnswers.load(FAQ).match("בלה בלה בלה") is None


def test_faq_file_has_enough_valid_items():
    data = yaml.safe_load(FAQ.read_text(encoding="utf-8"))
    items = data["items"]
    assert len(items) >= 55
    ids = [i["id"] for i in items]
    assert len(ids) == len(set(ids))
    safety = Safety()
    for item in items:
        assert item["keywords"], item["id"]
        assert not NIQQUD.search(item["q_he"] + item["a_he"]), item["id"]
        assert len(item["a_he"]) <= 300, item["id"]
        verdict = safety.check_output(item["a_he"], question_is_hebrew=True)
        assert verdict.ok, (item["id"], verdict.reason)
        assert verdict.text == item["a_he"], item["id"]
        assert safety.check_input(item["q_he"]).ok, item["id"]
        assert 5 <= item["min_age"] <= 11, item["id"]


def test_owl_log_adapter_uses_family_signature():
    calls = []

    class FamilyLog:
        def append(self, pid, role, text, *, meta=None):
            calls.append((pid, role, text, meta))

    adapter = OwlLogAdapter(FamilyLog(), "p1")
    adapter.append(
        {"question": "ש", "answer": "ת", "source": "ai", "profile_id": "p1"}
    )
    assert [c[1] for c in calls] == ["child", "owl"]
    assert calls[0][0] == "p1"
    assert calls[1][2] == "ת"
    assert calls[1][3]["source"] == "ai"
