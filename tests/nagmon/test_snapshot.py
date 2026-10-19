# SPDX-License-Identifier: GPL-3.0
"""
The progress snapshot (docs/kids/SDD_FIELD_DATA.md §2.3): what each child
practised, without names, free text, owl chats, PIN, keys or the exact
place.
"""

from __future__ import annotations

import json
from datetime import datetime

import pytest

from nagmon.ai.config import save_keys
from nagmon.family.calendar import Location
from nagmon.field_data.github import GitHubAccess, save_access
from nagmon.field_data.snapshot import SCHEMA_VERSION, progress_snapshot
from nagmon.learning.learner import LearnerState
from nagmon.runtime import NagmonRuntime

# Monday 19 Oct 2026, 17:30 in Jerusalem.
NOW = datetime.fromisoformat("2026-10-19T17:30:00+03:00").timestamp()
NAMES = ["נועה", "Zephyrine", "בת-אל", "Mary Ann"]
GROQ = "gsk_" + "Q" * 40
TOKEN = "github_pat_" + "11ABCDEFG0" * 6
OWL_TEXT = "the owl said something private"
FREE_TEXT = "my dog is called Rexy"


@pytest.fixture
def rt(tmp_path) -> NagmonRuntime:
    root = tmp_path / "nagmon"
    rt = NagmonRuntime(
        root,
        learner_from_dict=LearnerState.from_dict,
        learner_new=LearnerState,
        clock=lambda: NOW,
    )
    rt.parent.set_pin("4821")
    rt.parent.settings.location = Location(
        lat=31.778123,
        lon=35.235456,
        tz="Asia/Jerusalem",
        city_he="ירושלים",
        candle_minutes=40,
    )
    rt.parent.save()
    save_keys(root, {"groq": GROQ})
    save_access(root, GitHubAccess(TOKEN, "YuvalNag/nagmon-data"))
    for grade, name in enumerate(NAMES, start=1):
        p = rt.store.create(name=name, avatar="girl", grade=grade)
        rt.store.save_learner_dict(
            p.id,
            {
                "schema_version": 1,
                "name": name,
                "learner_id": p.id,
                "skills": {
                    "math.add.within10": {
                        "theta": 0.75,
                        "n": 8,
                        "correct": 6,
                        "last": NOW - 86400,
                        "recent": [1, 0, 1],
                        "misconceptions": {},
                    },
                    "hebrew.letters.first": {
                        "theta": -0.5,
                        "n": 4,
                        "correct": 1,
                        "last": NOW - 3600,
                    },
                },
                "mastered": {"math.add.within5": NOW - 7 * 86400},
                "stars": {"math": 3},
                "log": [
                    {
                        "ts": NOW - 60,
                        "skill": "english.free",
                        "item": FREE_TEXT,
                        "subject": "english",
                        "correct": True,
                        "quality": "ok",
                        "elapsed": 3.0,
                    }
                ],
                "answers_total": 12,
                "correct_total": 7,
            },
        )
        owl = rt.store.save_dir(p.id).parent / "owl_log.jsonl"
        owl.write_text(
            json.dumps({"q": OWL_TEXT, "who": name}) + "\n", "utf-8"
        )
    # Play time: 10 minutes yesterday for the first child, 3 days ago 5 min.
    first = rt.store.list()[0].id
    (root / "usage.json").write_text(
        json.dumps(
            {
                "schema_version": 1,
                "days": {
                    "2026-10-18": {first: 600.0},
                    "2026-10-16": {first: 300.0},
                    "2026-09-01": {first: 9999.0},  # older than 14 days
                },
            }
        ),
        "utf-8",
    )
    return NagmonRuntime(
        root,
        learner_from_dict=LearnerState.from_dict,
        learner_new=LearnerState,
        clock=lambda: NOW,
    )


def _dump(snap) -> str:
    return json.dumps(snap, ensure_ascii=False) + json.dumps(snap)


def test_no_name_appears_anywhere(rt):
    text = _dump(progress_snapshot(rt))
    for name in NAMES:
        assert name not in text, name
    for profile in rt.store.list():
        assert profile.name not in text


def test_children_are_numbered_in_profile_order(rt):
    snap = progress_snapshot(rt)
    assert [c["child"] for c in snap["children"]] == [
        "child-1",
        "child-2",
        "child-3",
        "child-4",
    ]
    assert [c["grade"] for c in snap["children"]] == [1, 2, 3, 4]


def test_no_profile_ids_either(rt):
    """Ids are random, but they link uploads to folders on the phone."""
    text = _dump(progress_snapshot(rt))
    for profile in rt.store.list():
        assert profile.id not in text


def test_no_pin_keys_free_text_or_owl_chats(rt):
    text = _dump(progress_snapshot(rt))
    s = rt.parent.settings
    for secret in (s.pin_hash, s.pin_salt, GROQ, TOKEN, OWL_TEXT, FREE_TEXT):
        assert secret and secret not in text
    assert "pin_" not in text.lower()


def test_the_city_but_not_the_exact_place(rt):
    snap = progress_snapshot(rt)
    text = _dump(snap)
    assert "31.778123" not in text and "35.235456" not in text
    assert snap["settings"]["city"] == "ירושלים"


def test_skills_have_attempts_success_rating_and_last_date(rt):
    child = progress_snapshot(rt)["children"][0]
    skill = child["subjects"]["math"]["skills"]["math.add.within10"]
    assert skill == {
        "attempts": 8,
        "success": 0.75,
        "rating": 0.75,
        "last": "2026-10-18",
    }
    assert (
        child["subjects"]["hebrew"]["skills"]["hebrew.letters.first"][
            "success"
        ]
        == 0.25
    )
    assert child["subjects"]["math"]["mastered"] == 1
    assert child["subjects"]["math"]["stars"] == 3


def test_play_minutes_in_the_last_14_days(rt):
    child = progress_snapshot(rt)["children"][0]
    minutes = child["minutes_14d"]
    assert len(minutes) == 14
    assert minutes["2026-10-18"] == 10 and minutes["2026-10-16"] == 5
    assert "2026-09-01" not in minutes
    assert child["minutes_14d_total"] == 15


def test_limits_and_general_settings(rt):
    snap = progress_snapshot(rt, build={"version": "0.4.35", "build": "11"})
    assert snap["schema_version"] == SCHEMA_VERSION == 1
    assert snap["app"] == {"version": "0.4.35", "build": "11"}
    assert snap["created"] == "2026-10-19T14:30:00Z"
    child = snap["children"][0]
    assert child["limits"]["daily_max_minutes"] == 60
    assert "weekly_days_target" in child
    settings = snap["settings"]
    assert settings["shabbat_mode"] is True
    assert "owl_enabled" in settings["ai"]
    assert set(settings) >= {
        "city",
        "candle_minutes",
        "default_limits",
        "values",
    }


def test_the_playing_childs_unsaved_progress_counts(rt):
    pid = rt.store.list()[0].id
    rt.activate(pid)
    rt.learner.skill("math.add.within10").n += 1
    child = progress_snapshot(rt)["children"][0]
    assert (
        child["subjects"]["math"]["skills"]["math.add.within10"]["attempts"]
        == 9
    )


def test_an_empty_family(tmp_path):
    rt = NagmonRuntime(tmp_path, clock=lambda: NOW)
    snap = progress_snapshot(rt)
    assert snap["children"] == []
    json.dumps(snap)
