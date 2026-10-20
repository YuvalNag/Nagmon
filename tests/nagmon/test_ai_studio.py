# SPDX-License-Identifier: GPL-3.0
"""WP9: parent content studio, pending review and approval (SDD_AI §6)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
import yaml

from nagmon.ai import studio as studio_module
from nagmon.ai.fakes import FakeClock, FakeRouter
from nagmon.ai.studio import Studio

EXISTING_BANK = {
    "skill": "science.plants.needs",
    "items": [
        {
            "id": "sci.plants.001",
            "kind": "choice",
            "grade": 2,
            "difficulty": 0.0,
            "prompt_he": "מה צמח צריך כדי לחיות?",
            "choices": [{"he": "מים"}, {"he": "חול בלבד"}],
            "answer": 0,
            "explanation_he": "צמח צריך מים כדי לחיות ולגדול.",
        }
    ],
}


def model_item(prompt="למה עלים ירוקים?", **overrides):
    item = {
        "kind": "choice",
        "grade": 3,
        "difficulty": 0,
        "prompt_he": prompt,
        "prompt_en": "Why are leaves green?",
        "choices": [
            {"he": "בגלל כלורופיל", "en": "chlorophyll"},
            {"he": "בגלל הגשם", "en": "rain"},
            {"he": "בגלל הרוח", "en": "wind"},
        ],
        "answer": 0,
        "explanation_he": "בעלים יש כלורופיל. הוא קולט אור ומחזיר צבע ירוק.",
        "tags": ["plants"],
    }
    item.update(overrides)
    return item


def payload(*items):
    return json.dumps({"items": list(items)}, ensure_ascii=False)


@pytest.fixture
def content_root(tmp_path):
    root = tmp_path / "learning"
    (root / "science").mkdir(parents=True)
    (root / "science" / "plants.yaml").write_text(
        yaml.safe_dump(EXISTING_BANK, allow_unicode=True), encoding="utf-8"
    )
    return root


def make_studio(tmp_path, content_root, *outputs):
    router = FakeRouter(*outputs)
    ids = iter(f"ai.{n:08x}" for n in range(1, 1000))
    studio = Studio(
        router,
        tmp_path / "data",
        content_root=content_root,
        clock=FakeClock(1_790_000_000),
        id_factory=lambda: next(ids),
    )
    return studio, router


def generate(studio, **kw):
    kw.setdefault("skill_id", "science.plants.needs")
    kw.setdefault("grade", 3)
    kw.setdefault("subject", "science")
    kw.setdefault("n", 2)
    return studio.generate_questions(**kw)


def test_generate_questions_writes_pending_file(tmp_path, content_root):
    studio, _ = make_studio(
        tmp_path,
        content_root,
        payload(model_item(), model_item("מה עושים השורשים?")),
    )
    batch = generate(studio)
    assert batch.path.parent == tmp_path / "data" / "ai_pending"
    data = yaml.safe_load(batch.path.read_text(encoding="utf-8"))
    assert data["schema_version"] == 1
    assert data["provenance"] == {"provider": "fake", "model": "fake-1"}
    assert [e["item"]["id"] for e in data["entries"]] == [
        "ai.00000001",
        "ai.00000002",
    ]
    assert data["entries"][0]["type"] == "question"
    assert data["entries"][0]["subject"] == "science"


def test_invalid_items_are_listed_for_the_parent(tmp_path, content_root):
    studio, _ = make_studio(
        tmp_path, content_root, payload(model_item(), model_item(answer=9))
    )
    batch = generate(studio)
    data = yaml.safe_load(batch.path.read_text(encoding="utf-8"))
    assert len(data["entries"]) == 1
    assert len(data["rejected_by_validator"]) == 1
    assert data["rejected_by_validator"][0]["errors"]


def test_prompt_is_hebrew_with_few_shot_and_requirements(
    tmp_path, content_root
):
    studio, router = make_studio(tmp_path, content_root, payload(model_item()))
    generate(studio, interests=["כדורגל"])
    call = router.calls[0]
    assert call["purpose"] == "studio"
    assert call["json_schema"]["type"] == "object"
    text = "\n".join(m["content"] for m in call["messages"])
    assert "מה צמח צריך כדי לחיות?" in text
    assert "ניקוד" in text
    assert "מסיח" in text
    assert "כדורגל" in text
    assert "science.plants.needs" in text
    assert re.search("טעויות נפוצות|טעות נפוצה", text)


def test_built_in_example_when_no_bank_exists(tmp_path):
    studio, router = make_studio(
        tmp_path, tmp_path / "missing", payload(model_item())
    )
    generate(studio, skill_id="science.space.moon", n=1)
    text = "\n".join(m["content"] for m in router.calls[0]["messages"])
    assert "prompt_he" in text


def test_approve_moves_items_to_ai_bank_with_provenance(
    tmp_path, content_root
):
    studio, _ = make_studio(
        tmp_path,
        content_root,
        payload(model_item(), model_item("מה עושים השורשים?")),
    )
    batch = generate(studio)
    approved = studio.approve(["ai.00000001"])
    assert approved == ["ai.00000001"]
    bank_path = tmp_path / "data" / "ai_bank" / "science.yaml"
    bank = yaml.safe_load(bank_path.read_text(encoding="utf-8"))
    assert [i["id"] for i in bank["items"]] == ["ai.00000001"]
    assert bank["items"][0]["skill"] == "science.plants.needs"
    provenance = yaml.safe_load(
        (tmp_path / "data" / "ai_bank" / "provenance.yaml").read_text(
            encoding="utf-8"
        )
    )
    assert provenance["ai.00000001"]["provider"] == "fake"
    remaining = [e.item_id for e in studio.pending()]
    assert remaining == ["ai.00000002"]
    assert batch.path.exists()


def test_reject_removes_item_and_logs_it(tmp_path, content_root):
    studio, _ = make_studio(tmp_path, content_root, payload(model_item()))
    batch = generate(studio)
    assert studio.reject(["ai.00000001"]) == ["ai.00000001"]
    assert studio.pending() == []
    assert not batch.path.exists()
    log = tmp_path / "data" / "ai_pending" / "rejected.jsonl"
    assert "ai.00000001" in log.read_text(encoding="utf-8")


def test_unknown_ids_are_ignored(tmp_path, content_root):
    studio, _ = make_studio(tmp_path, content_root, payload(model_item()))
    generate(studio)
    assert studio.approve(["ai.ffffffff"]) == []


def test_repair_attempt_on_non_json_output(tmp_path, content_root):
    studio, router = make_studio(
        tmp_path,
        content_root,
        "Sorry, here are some ideas without json",
        payload(model_item()),
    )
    batch = generate(studio, n=1)
    assert len(router.calls) == 2
    assert "JSON" in router.calls[1]["messages"][-1]["content"]
    assert len(batch.entries) == 1


def test_gives_up_after_one_repair(tmp_path, content_root):
    studio, router = make_studio(tmp_path, content_root, "nope", "still nope")
    batch = generate(studio, n=1)
    assert len(router.calls) == 2
    assert batch.entries == []


def test_duplicate_of_existing_bank_question_is_rejected(
    tmp_path, content_root
):
    studio, _ = make_studio(
        tmp_path, content_root, payload(model_item("מה צמח צריך כדי לחיות?"))
    )
    batch = generate(studio, n=1)
    assert batch.entries == []
    assert "כפול" in " ".join(batch.rejected[0]["errors"])


def test_edit_revalidates_item(tmp_path, content_root):
    studio, _ = make_studio(tmp_path, content_root, payload(model_item()))
    generate(studio, n=1)
    entry = studio.pending()[0]
    new_item = dict(entry.item, prompt_he="למה רוב העלים ירוקים?")
    updated = studio.edit("ai.00000001", new_item)
    assert updated.item["prompt_he"] == "למה רוב העלים ירוקים?"
    assert updated.item["id"] == "ai.00000001"
    with pytest.raises(ValueError):
        studio.edit("ai.00000001", dict(entry.item, answer=7))


def story_payload():
    return json.dumps(
        {
            "title": "The Big Game",
            "level": "A1",
            "grade": 4,
            "text_en": "Dan plays football. He kicks the ball. Goal!",
            "text_he": "דן משחק כדורגל. הוא בועט בכדור. גול!",
            "questions": [
                {
                    "kind": "choice",
                    "prompt_en": "What does Dan play?",
                    "prompt_he": "במה דן משחק?",
                    "choices": [{"he": "כדורגל"}, {"he": "שחמט"}],
                    "answer": 0,
                    "explanation_he": "בסיפור כתוב שדן משחק כדורגל.",
                }
            ],
        },
        ensure_ascii=False,
    )


def test_story_goes_to_pending_then_reading_bank(tmp_path, content_root):
    studio, router = make_studio(tmp_path, content_root, story_payload())
    batch = studio.generate_story(grade=4, level="A1", interests=["כדורגל"])
    story_id = batch.entries[0].item_id
    assert batch.entries[0].type == "story"
    text = "\n".join(m["content"] for m in router.calls[0]["messages"])
    assert "A1" in text
    studio.approve([story_id])
    reading = yaml.safe_load(
        (tmp_path / "data" / "ai_bank" / "reading.yaml").read_text(
            encoding="utf-8"
        )
    )
    assert reading[0]["id"] == story_id
    assert reading[0]["questions"][0]["id"] == story_id + ".q1"


def test_quest_goes_to_pending_then_quest_bank(tmp_path, content_root):
    quest = {
        "title_he": "הגינה של סבתא",
        "npc_name_he": "סבתא רות",
        "intro_he": "העגבניות בגינה צמאות!",
        "task_he": "עזרו לי לגלות מה הצמחים צריכים.",
        "success_he": "כל הכבוד! הגינה פורחת.",
    }
    studio, _ = make_studio(
        tmp_path, content_root, json.dumps(quest, ensure_ascii=False)
    )
    batch = studio.generate_quest(
        grade=2, skill_id="science.plants.needs", subject="science"
    )
    studio.approve([batch.entries[0].item_id])
    quests = yaml.safe_load(
        (tmp_path / "data" / "ai_bank" / "quests.yaml").read_text(
            encoding="utf-8"
        )
    )
    assert quests[0]["npc_name_he"] == "סבתא רות"


def test_vocab_goes_to_pending_then_vocab_bank(tmp_path, content_root):
    words = {
        "words": [
            {
                "word": "cat",
                "he": "חתול",
                "pos": "noun",
                "topic": "animals",
                "level": "preA1",
                "grade": 1,
                "emoji": "1f408",
                "example_en": "The cat sleeps.",
                "example_he": "החתול ישן.",
            }
        ]
    }
    studio, _ = make_studio(
        tmp_path, content_root, json.dumps(words, ensure_ascii=False)
    )
    batch = studio.generate_vocab(topic="animals", level="preA1", grade=1)
    studio.approve([batch.entries[0].item_id])
    vocab = yaml.safe_load(
        (tmp_path / "data" / "ai_bank" / "vocab.yaml").read_text(
            encoding="utf-8"
        )
    )
    assert vocab[0]["word"] == "cat"


def run_cli(tmp_path, argv, answers=(), router=None):
    printed = []
    answers = iter(answers)
    code = studio_module.main(
        ["--data-root", str(tmp_path / "data"), *argv],
        router_factory=lambda keys, root: router or FakeRouter("{}"),
        input_fn=lambda prompt="": next(answers),
        print_fn=lambda *a, **k: printed.append(" ".join(map(str, a))),
    )
    return code, "\n".join(printed)


def seed_pending(tmp_path, content_root, n=2):
    items = [model_item(), model_item("מה עושים השורשים?")][:n]
    studio, _ = make_studio(tmp_path, content_root, payload(*items))
    generate(studio, n=n)
    return studio


def test_cli_review_approves_and_rejects(tmp_path, content_root):
    studio = seed_pending(tmp_path, content_root)
    code, out = run_cli(tmp_path, ["review"], answers=["y", "n"])
    assert code == 0
    assert "למה עלים ירוקים?" in out
    bank = tmp_path / "data" / "ai_bank" / "science.yaml"
    assert "ai.00000001" in bank.read_text(encoding="utf-8")
    assert studio.pending() == []


def test_cli_review_edit_then_approve(tmp_path, content_root):
    seed_pending(tmp_path, content_root, n=1)
    code, _ = run_cli(
        tmp_path,
        ["review"],
        answers=["e", "prompt_he", "למה רוב העלים ירוקים?", "y"],
    )
    bank = tmp_path / "data" / "ai_bank" / "science.yaml"
    assert "למה רוב העלים ירוקים?" in bank.read_text(encoding="utf-8")


def test_cli_auto_validate_only_does_not_approve(tmp_path, content_root):
    studio = seed_pending(tmp_path, content_root)
    code, out = run_cli(tmp_path, ["review", "--auto-validate-only"])
    assert code == 0
    assert "2" in out
    assert len(studio.pending()) == 2
    assert not (tmp_path / "data" / "ai_bank").exists()


def test_cli_list_and_approve(tmp_path, content_root):
    studio = seed_pending(tmp_path, content_root)
    code, out = run_cli(tmp_path, ["list"])
    assert "ai.00000001" in out and "ai.00000002" in out
    run_cli(tmp_path, ["approve", "ai.00000002"])
    assert [e.item_id for e in studio.pending()] == ["ai.00000001"]


def test_cli_generates_questions_with_injected_router(tmp_path, content_root):
    router = FakeRouter(payload(model_item()))
    code, out = run_cli(
        tmp_path,
        [
            "questions",
            "--skill",
            "science.plants.needs",
            "--grade",
            "3",
            "--subject",
            "science",
            "-n",
            "1",
            "--content-root",
            str(content_root),
        ],
        router=router,
    )
    assert code == 0
    pending = list((tmp_path / "data" / "ai_pending").glob("*.yaml"))
    assert len(pending) == 1


def test_studio_module_runs_as_main():
    assert Path(studio_module.__file__).name == "studio.py"
    assert callable(studio_module.main)
