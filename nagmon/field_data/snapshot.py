# SPDX-License-Identifier: GPL-3.0
"""
The progress snapshot (docs/kids/SDD_FIELD_DATA.md §2.3): what each child
practised, as numbers, so a problem can be found without the child's
data leaving the phone.

Only fields chosen here go in; nothing is copied wholesale. Out stay
names and profile ids (children are ``child-1``, ``child-2``... in
profile order), free text, the owl's chats, the answer log, the PIN,
keys and the exact place (the city stays: it sets Shabbat times).
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from typing import Any

from nagmon.field_data.app_log import build_info
from nagmon.runtime import NagmonRuntime

SCHEMA_VERSION = 1
DAYS = 14


def _number(value: Any, default: float = 0.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    return float(value)


def _day(ts: float, rt: NagmonRuntime) -> str | None:
    if ts <= 0:
        return None
    return datetime.fromtimestamp(ts, tz=rt.zone).date().isoformat()


def _learner_dict(rt: NagmonRuntime, pid: str) -> dict[str, Any]:
    """The playing child's live learner, else the saved one."""
    if (
        rt.active is not None
        and rt.active.id == pid
        and rt.learner is not None
    ):
        to_dict = getattr(rt.learner, "to_dict", None)
        if callable(to_dict):
            data = to_dict()
            if isinstance(data, dict):
                return data
    try:
        return rt.store.load_learner_dict(pid)
    except (KeyError, OSError, ValueError):
        return {}


def _subjects(rt: NagmonRuntime, learner: Mapping[str, Any]) -> dict:
    subjects: dict[str, dict[str, Any]] = {}

    def subject(sid: str) -> dict[str, Any]:
        return subjects.setdefault(
            sid,
            {
                "attempts": 0,
                "correct": 0,
                "mastered": 0,
                "stars": 0,
                "skills": {},
            },
        )

    skills = learner.get("skills")
    for skill_id, stats in (
        skills if isinstance(skills, dict) else {}
    ).items():
        if not isinstance(stats, dict):
            continue
        n = int(_number(stats.get("n")))
        correct = int(_number(stats.get("correct")))
        entry = subject(str(skill_id).split(".")[0])
        entry["attempts"] += n
        entry["correct"] += correct
        entry["skills"][str(skill_id)] = {
            "attempts": n,
            "success": round(correct / n, 3) if n else None,
            "rating": round(_number(stats.get("theta")), 3),
            "last": _day(_number(stats.get("last")), rt),
        }
    mastered = learner.get("mastered")
    for skill_id in mastered if isinstance(mastered, dict) else {}:
        subject(str(skill_id).split(".")[0])["mastered"] += 1
    stars = learner.get("stars")
    for sid, count in (stars if isinstance(stars, dict) else {}).items():
        subject(str(sid))["stars"] = int(_number(count))
    for entry in subjects.values():
        n = entry["attempts"]
        entry["success"] = round(entry["correct"] / n, 3) if n else None
    return subjects


def _minutes(rt: NagmonRuntime, pid: str) -> dict[str, int]:
    today = rt.now().date()
    days = [today - timedelta(days=i) for i in range(DAYS - 1, -1, -1)]
    return {
        d.isoformat(): int(round(rt.tracker.used_seconds(pid, d) / 60))
        for d in days
    }


def _child(rt: NagmonRuntime, index: int, pid: str) -> dict[str, Any]:
    from nagmon.runtime import age_from_profile

    profile = rt.store.get(pid)
    learner = _learner_dict(rt, pid)
    minutes = _minutes(rt, pid)
    s = rt.parent.settings
    return {
        "child": f"child-{index}",
        "grade": profile.grade,
        "language_level": profile.language_level,
        "subjects": _subjects(rt, learner),
        "answers_total": int(_number(learner.get("answers_total"))),
        "correct_total": int(_number(learner.get("correct_total"))),
        "minutes_14d": minutes,
        "minutes_14d_total": sum(minutes.values()),
        "practice_days_total": rt.practice.total_days(pid),
        "limits": s.limits_for(pid).to_dict(),
        "weekly_days_target": s.weekly_days_for(
            pid, age_from_profile(profile, rt.clock())
        ),
    }


def _settings(rt: NagmonRuntime) -> dict[str, Any]:
    from nagmon.owl_service import load_ai_settings

    s = rt.parent.settings
    values = s.values
    return {
        "city": s.location.city_he,
        "tz": s.location.tz,
        "candle_minutes": s.location.candle_minutes,
        "shabbat_mode": s.shabbat_mode,
        "holiday_mode": s.holiday_mode,
        "shabbat_stop_before_minutes": s.shabbat_stop_before_minutes,
        "default_limits": s.default_limits.to_dict(),
        "values": {
            "kindness_quests": values.kindness_quests,
            "gentle_battle_wording": values.gentle_battle_wording,
            "modesty_filter": values.modesty_filter,
            "emphasis": list(values.emphasis),
        },
        "ai": load_ai_settings(rt.root).to_dict(),
        "ai_provider": s.ai.provider,
    }


def progress_snapshot(
    rt: NagmonRuntime, *, build: Mapping[str, str] | None = None
) -> dict[str, Any]:
    """The family's progress as JSON-ready data, without names."""
    info = dict(build) if build is not None else build_info()
    now = datetime.fromtimestamp(rt.clock(), tz=timezone.utc)
    return {
        "schema_version": SCHEMA_VERSION,
        "created": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "app": {
            "version": str(info.get("version", "")),
            "build": str(info.get("build", "")),
        },
        "settings": _settings(rt),
        "children": [
            _child(rt, i, p.id) for i, p in enumerate(rt.store.list(), 1)
        ],
    }
