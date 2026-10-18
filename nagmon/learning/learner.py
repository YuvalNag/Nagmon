"""Per-learner state with JSON (de)serialization (SDD_LEARNING s.8, s.10)."""

from __future__ import annotations

import math
from collections import deque
from collections.abc import Mapping
from dataclasses import asdict, dataclass, field, fields
from typing import Any

from nagmon.learning.rating import initial_theta
from nagmon.learning.srs import LeitnerDeck

SCHEMA_VERSION = 1
LOG_MAX = 5000
RECENT_MAX = 20
ITEMS_MAX = 4000


@dataclass
class SkillStats:
    theta: float = 0.0
    n: int = 0
    correct: int = 0
    last: float = 0.0
    recent: list[int] = field(default_factory=list)  # 1/0, newest last
    misconceptions: dict[str, int] = field(default_factory=dict)

    def push(self, correct: bool) -> None:
        self.recent.append(1 if correct else 0)
        if len(self.recent) > RECENT_MAX:
            del self.recent[: len(self.recent) - RECENT_MAX]

    def recent_accuracy(self, window: int = 10) -> float | None:
        tail = self.recent[-window:]
        return sum(tail) / len(tail) if tail else None


@dataclass
class ItemStats:
    b_offset: float = 0.0
    n: int = 0
    last: float = 0.0


@dataclass
class LogEntry:
    ts: float
    skill: str
    item: str
    subject: str
    correct: bool
    quality: str
    elapsed: float
    context: str = "battle"
    mis: str | None = None
    hint: bool = False
    dk: bool = False  # "I don't know"
    worked: bool = False  # answer to a worked example

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        # Keep the log compact: drop default-valued flags.
        for key in ("mis", "hint", "dk", "worked"):
            if not d[key]:
                del d[key]
        return d

    @classmethod
    def from_dict(cls, d: Mapping[str, Any]) -> LogEntry:
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in names})


def _default_targets(age: int | None, grade: int) -> tuple[float, float]:
    young = age is not None and age <= 7
    if age is None:
        young = grade <= 1
    return (0.875 if young else 0.80), 0.90


@dataclass
class LearnerState:
    learner_id: str = ""
    name: str = ""
    grade: int = 0
    age: int | None = None
    settings: dict[str, Any] = field(default_factory=dict)
    skills: dict[str, SkillStats] = field(default_factory=dict)
    items: dict[str, ItemStats] = field(default_factory=dict)
    srs: LeitnerDeck = field(default_factory=LeitnerDeck)
    mastered: dict[str, float] = field(default_factory=dict)
    stars: dict[str, int] = field(default_factory=dict)
    log: deque[LogEntry] = field(default_factory=lambda: deque(maxlen=LOG_MAX))
    words: dict[str, float] = field(default_factory=dict)
    worked_examples: set[str] = field(default_factory=set)
    coins_total: int = 0
    answers_total: int = 0
    correct_total: int = 0
    time_total_s: float = 0.0

    # -- settings with age-derived defaults --------------------------------
    @property
    def timer_on(self) -> bool:
        if "timer" in self.settings:
            return bool(self.settings["timer"])
        if self.age is not None:
            return self.age >= 9
        return self.grade >= 4

    @property
    def target_frontier(self) -> float:
        value = self.settings.get("target_frontier")
        if value is None:
            return _default_targets(self.age, self.grade)[0]
        return float(value)

    @property
    def target_review(self) -> float:
        value = self.settings.get("target_review")
        if value is None:
            return _default_targets(self.age, self.grade)[1]
        return float(value)

    @property
    def worked_examples_on(self) -> bool:
        return bool(self.settings.get("worked_examples", True))

    @property
    def enabled_subjects(self) -> tuple[str, ...] | None:
        subjects = self.settings.get("subjects")
        return tuple(subjects) if subjects else None

    @property
    def focus(self) -> tuple[str, ...]:
        return tuple(self.settings.get("focus") or ())

    # -- accessors ---------------------------------------------------------
    def skill(
        self, skill_id: str, skill_grade: int | None = None
    ) -> SkillStats:
        st = self.skills.get(skill_id)
        if st is None:
            g = self.grade if skill_grade is None else skill_grade
            st = SkillStats(theta=initial_theta(self.grade, g))
            self.skills[skill_id] = st
        return st

    def item(self, item_id: str) -> ItemStats:
        it = self.items.get(item_id)
        if it is None:
            it = ItemStats()
            self.items[item_id] = it
        return it

    def prune_items(self, limit: int = ITEMS_MAX) -> None:
        if len(self.items) <= limit:
            return
        keep = sorted(self.items.items(), key=lambda kv: kv[1].last)
        self.items = dict(keep[len(keep) - limit :])

    def log_answer(self, entry: LogEntry) -> None:
        self.log.append(entry)

    # -- serialization -----------------------------------------------------
    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "learner_id": self.learner_id,
            "name": self.name,
            "grade": self.grade,
            "age": self.age,
            "settings": dict(self.settings),
            "skills": {k: asdict(v) for k, v in self.skills.items()},
            "items": {k: asdict(v) for k, v in self.items.items()},
            "srs": self.srs.to_dict(),
            "mastered": dict(self.mastered),
            "stars": dict(self.stars),
            "log": [e.to_dict() for e in self.log],
            "words": dict(self.words),
            "worked_examples": sorted(self.worked_examples),
            "coins_total": self.coins_total,
            "answers_total": self.answers_total,
            "correct_total": self.correct_total,
            "time_total_s": self.time_total_s,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> LearnerState:
        d = migrate(data)
        s = cls(
            learner_id=d.get("learner_id", ""),
            name=d.get("name", ""),
            grade=int(d.get("grade", 0)),
            age=d.get("age"),
            settings=dict(d.get("settings") or {}),
        )
        s.skills = {
            k: SkillStats(**v) for k, v in (d.get("skills") or {}).items()
        }
        s.items = {
            k: ItemStats(**v) for k, v in (d.get("items") or {}).items()
        }
        s.srs = LeitnerDeck.from_dict(d.get("srs"))
        s.mastered = dict(d.get("mastered") or {})
        s.stars = {k: int(v) for k, v in (d.get("stars") or {}).items()}
        for raw in d.get("log") or []:
            s.log.append(LogEntry.from_dict(raw))
        s.words = dict(d.get("words") or {})
        s.worked_examples = set(d.get("worked_examples") or ())
        s.coins_total = int(d.get("coins_total", 0))
        s.answers_total = int(d.get("answers_total", 0))
        s.correct_total = int(d.get("correct_total", 0))
        s.time_total_s = float(d.get("time_total_s", 0.0))
        return s


# --------------------------------------------------------------------------
# Migration
# --------------------------------------------------------------------------

ELO_400_TO_LOGIT = math.log(10) / 400.0


def _migrate_v0(d: Mapping[str, Any]) -> dict[str, Any]:
    """v0 = the GAME_PLAN draft: Elo around 1200, ``leitner``, ``ok`` log."""
    skills = {}
    for sid, rating in (d.get("ratings") or {}).items():
        skills[sid] = asdict(
            SkillStats(theta=(float(rating) - 1200.0) * ELO_400_TO_LOGIT)
        )
    cards = []
    for item_id, raw in (d.get("leitner") or {}).items():
        if isinstance(raw, Mapping):
            box, skill = int(raw.get("box", 1)), raw.get("skill", "")
        else:
            box, skill = int(raw), ""
        cards.append(
            {
                "item_id": item_id,
                "skill_id": skill,
                "seed": None,
                "box": max(1, min(5, box)),
                "due": 0.0,  # due immediately: we don't know the schedule
            }
        )
    log = []
    for e in d.get("log") or []:
        ok = bool(e.get("ok", e.get("correct", False)))
        log.append(
            {
                "ts": float(e.get("t", e.get("ts", 0.0))),
                "skill": e.get("skill", ""),
                "item": e.get("item", ""),
                "subject": e.get("subject")
                or str(e.get("skill", "")).split(".")[0],
                "correct": ok,
                "quality": "correct" if ok else "wrong",
                "elapsed": float(e.get("secs", e.get("elapsed", 0.0))),
                "context": e.get("where", e.get("context", "battle")),
            }
        )
    correct = sum(1 for e in log if e["correct"])
    for e in log:
        st = skills.setdefault(e["skill"], asdict(SkillStats()))
        st["n"] += 1
        st["correct"] += int(e["correct"])
        st["recent"].append(int(e["correct"]))
        st["last"] = max(st["last"], e["ts"])
    return {
        "schema_version": 1,
        "learner_id": d.get("id", d.get("learner_id", "")),
        "name": d.get("name", ""),
        "grade": d.get("grade", 0),
        "age": d.get("age"),
        "settings": dict(d.get("settings") or {}),
        "skills": skills,
        "srs": {"cards": cards},
        "stars": dict(d.get("stars") or {}),
        "log": log,
        "coins_total": int(d.get("coins", 0)),
        "answers_total": len(log),
        "correct_total": correct,
        "time_total_s": sum(e["elapsed"] for e in log),
    }


_MIGRATIONS = {0: _migrate_v0}


def migrate(data: Mapping[str, Any]) -> dict[str, Any]:
    """Upgrade a saved learner dict to ``SCHEMA_VERSION``."""
    d = dict(data)
    version = int(d.get("schema_version", 0))
    if version > SCHEMA_VERSION:
        raise ValueError(
            f"learner schema_version {version} is newer than "
            f"supported {SCHEMA_VERSION}"
        )
    while version < SCHEMA_VERSION:
        d = _MIGRATIONS[version](d)
        version = int(d["schema_version"])
    return d
