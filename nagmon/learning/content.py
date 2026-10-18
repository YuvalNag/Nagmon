"""Content library: skills, banks and the generator registry.

Loads ``skills/*.yaml`` and the banks they reference (SDD_CONTENT
sections 2-3), validates everything, and turns a skill + rng into a
:class:`~nagmon.learning.model.Question`.
"""

from __future__ import annotations

import random
import re
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from nagmon.learning.generators import load_builtin_generators
from nagmon.learning.generators.common import GenContext, Generator
from nagmon.learning.model import (
    FALSE_ID,
    SUBJECTS,
    TRUE_ID,
    Choice,
    Question,
    true_false_choices,
)

DEFAULT_CONTENT_DIR = (
    Path(__file__).resolve().parents[2] / "mods" / "nagmon" / "learning"
)
NIQQUD = re.compile("[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]")
LIMITS = {"prompt_he": 140, "choice": 40, "explanation_he": 200}

__all__ = [
    "BankItem",
    "ContentError",
    "ContentLibrary",
    "GenContext",
    "GeneratorRegistry",
    "MasteryRule",
    "Skill",
    "default_registry",
]


class ContentError(ValueError):
    def __init__(self, errors: list[str]) -> None:
        self.errors = list(errors)
        super().__init__("invalid learning content:\n  " + "\n  ".join(errors))


@dataclass(frozen=True)
class MasteryRule:
    min_attempts: int = 12
    threshold: float = 0.8


@dataclass(frozen=True)
class Skill:
    id: str
    subject: str
    grade: int
    title_he: str
    title_en: str
    prereq: tuple[str, ...]
    generator: str
    params: Mapping[str, Any] = field(default_factory=dict)
    mastery: MasteryRule = MasteryRule()
    srs: bool = False


@dataclass(frozen=True)
class BankItem:
    id: str
    skill: str
    kind: str
    grade: int
    difficulty: float
    prompt_he: str
    prompt_en: str | None
    choices: tuple[Mapping[str, Any], ...]
    answer: Any
    explanation_he: str
    explanation_en: str | None
    tags: tuple[str, ...] = ()
    meta: Mapping[str, Any] = field(default_factory=dict)


class GeneratorRegistry:
    def __init__(self, generators: Mapping[str, Generator] | None = None):
        self._gens: dict[str, Generator] = dict(generators or {})

    def register(self, name: str, fn: Generator) -> None:
        self._gens[name] = fn

    def get(self, name: str) -> Generator:
        return self._gens[name]

    def __contains__(self, name: object) -> bool:
        return name in self._gens

    def names(self) -> list[str]:
        return sorted(self._gens)


def default_registry() -> GeneratorRegistry:
    reg = GeneratorRegistry(load_builtin_generators())
    reg.register("bank", bank_generator)
    return reg


# --------------------------------------------------------------------------
# bank generator
# --------------------------------------------------------------------------


def _bank_choice(raw: Mapping[str, Any], idx: int) -> Choice:
    em = raw.get("emoji")
    return Choice(
        id=chr(ord("a") + idx),
        text_he=str(raw.get("he", "")),
        text_en=raw.get("en"),
        image=f"emoji:{em}" if em else raw.get("image"),
    )


def bank_question(
    item: BankItem, rng: random.Random, ctx: GenContext
) -> Question:
    common = {
        "item_id": item.id,
        "skill_id": ctx.skill_id or item.skill,
        "subject": ctx.subject,
        "prompt_he": item.prompt_he,
        "prompt_en": item.prompt_en,
        "explanation_he": item.explanation_he,
        "explanation_en": item.explanation_en,
        "difficulty": float(item.difficulty),
        "speak": {
            "he": item.prompt_he,
            **({"en": item.prompt_en} if item.prompt_en else {}),
        },
        "source": "bank",
        "meta": dict(item.meta),
    }
    if item.kind == "true_false":
        return Question(
            kind="true_false",
            choices=true_false_choices(),
            answer=TRUE_ID if item.answer else FALSE_ID,
            **common,
        )
    choices = [_bank_choice(c, i) for i, c in enumerate(item.choices)]
    if item.kind == "order":
        order = [choices[i].id for i in item.answer]
        shuffled = choices[:]
        rng.shuffle(shuffled)
        return Question(
            kind="order",
            choices=tuple(shuffled),
            answer=tuple(order),
            **common,
        )
    correct = choices[int(item.answer)]
    limit = len(choices)
    if ctx.max_choices:
        limit = max(2, min(limit, ctx.max_choices))
    others = [c for c in choices if c is not correct]
    keep = rng.sample(others, limit - 1)
    opts = [correct, *keep]
    rng.shuffle(opts)
    # Re-letter so ids stay a, b, c... after trimming.
    relettered = []
    answer = "a"
    for i, c in enumerate(opts):
        nc = Choice(chr(ord("a") + i), c.text_he, c.text_en, c.image)
        relettered.append(nc)
        if c is correct:
            answer = nc.id
    return Question(
        kind="choice", choices=tuple(relettered), answer=answer, **common
    )


def bank_generator(
    rng: random.Random, params: Mapping[str, Any], ctx: GenContext
) -> Question:
    items: tuple[BankItem, ...] = params["_items"]
    tags = set(params.get("tags") or ())
    pool = [i for i in items if not tags or tags & set(i.tags)] or list(items)
    return bank_question(rng.choice(pool), rng, ctx)


# --------------------------------------------------------------------------
# Library
# --------------------------------------------------------------------------


class ContentLibrary:
    def __init__(
        self,
        skills: Mapping[str, Skill],
        registry: GeneratorRegistry,
        banks: Mapping[str, tuple[BankItem, ...]] | None = None,
    ) -> None:
        self.skills: dict[str, Skill] = dict(skills)
        self.registry = registry
        self.banks: dict[str, tuple[BankItem, ...]] = dict(banks or {})
        self._by_subject: dict[str, list[Skill]] = {}
        for s in sorted(self.skills.values(), key=lambda s: (s.grade, s.id)):
            self._by_subject.setdefault(s.subject, []).append(s)
        self._params: dict[str, dict[str, Any]] = {}
        for s in self.skills.values():
            p = dict(s.params)
            if s.generator == "bank":
                p["_items"] = self.banks.get(s.id, ())
            self._params[s.id] = p
        self._dependents: dict[str, list[str]] = {}
        for s in self.skills.values():
            for p in s.prereq:
                self._dependents.setdefault(p, []).append(s.id)

    # -- loading -----------------------------------------------------------
    @classmethod
    def load(
        cls,
        path: str | Path | None = None,
        registry: GeneratorRegistry | None = None,
    ) -> ContentLibrary:
        root = Path(path) if path is not None else DEFAULT_CONTENT_DIR
        registry = registry or default_registry()
        errors: list[str] = []
        raw_skills: list[tuple[str, str, Mapping[str, Any]]] = []
        for f in sorted((root / "skills").glob("*.yaml")):
            try:
                doc = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
            except yaml.YAMLError as exc:
                errors.append(f"{f.name}: YAML error: {exc}")
                continue
            if not isinstance(doc, Mapping):
                errors.append(f"{f.name}: top level must be a mapping")
                continue
            subject = doc.get("subject")
            for s in doc.get("skills") or []:
                raw_skills.append((f.name, subject, s))
        skills, banks = _build(root, raw_skills, registry, errors)
        if errors:
            raise ContentError(errors)
        return cls(skills, registry, banks)

    # -- queries -----------------------------------------------------------
    def skill(self, skill_id: str) -> Skill:
        return self.skills[skill_id]

    def get(self, skill_id: str) -> Skill | None:
        return self.skills.get(skill_id)

    def by_subject(self, subject: str) -> list[Skill]:
        return list(self._by_subject.get(subject, ()))

    def subjects(self) -> list[str]:
        return [s for s in SUBJECTS if s in self._by_subject]

    def dependents(self, skill_id: str) -> list[str]:
        return list(self._dependents.get(skill_id, ()))

    def generate(
        self,
        skill_id: str,
        rng: random.Random,
        ctx: GenContext | None = None,
    ) -> Question:
        skill = self.skills[skill_id]
        if ctx is None:
            ctx = GenContext(skill.id, skill.subject, grade=skill.grade)
        elif ctx.skill_id != skill.id or ctx.subject != skill.subject:
            ctx = GenContext(
                skill.id,
                skill.subject,
                ctx.grade,
                ctx.age,
                ctx.max_choices,
                ctx.prefer_kind,
            )
        gen = self.registry.get(skill.generator)
        return gen(rng, self._params[skill_id], ctx)


# --------------------------------------------------------------------------
# Building and validation
# --------------------------------------------------------------------------


def _text_errors(where: str, field_: str, text: Any, limit: int) -> list[str]:
    out = []
    if not isinstance(text, str) or not text.strip():
        return [f"{where}: {field_} is missing"]
    if len(text) > limit:
        out.append(f"{where}: {field_} longer than {limit} characters")
    if NIQQUD.search(text):
        out.append(f"{where}: {field_} contains niqqud")
    return out


def _build(
    root: Path,
    raw_skills: Iterable[tuple[str, str, Mapping[str, Any]]],
    registry: GeneratorRegistry,
    errors: list[str],
) -> tuple[dict[str, Skill], dict[str, tuple[BankItem, ...]]]:
    skills: dict[str, Skill] = {}
    for fname, subject, s in raw_skills:
        sid = s.get("id") if isinstance(s, Mapping) else None
        where = f"{fname}:{sid}"
        if not sid or not isinstance(sid, str):
            errors.append(f"{fname}: skill without id")
            continue
        if sid in skills:
            errors.append(f"{where}: duplicate skill id")
            continue
        subj = s.get("subject", subject)
        if subj not in SUBJECTS:
            errors.append(f"{where}: unknown subject {subj!r}")
        elif sid.split(".")[0] != subj:
            errors.append(f"{where}: id prefix does not match subject {subj}")
        grade = s.get("grade")
        if not isinstance(grade, int) or not 0 <= grade <= 9:
            errors.append(f"{where}: grade must be an integer 0..9")
            grade = 0
        gen = s.get("generator")
        if gen not in registry:
            errors.append(f"{where}: unknown generator {gen!r}")
        m = s.get("mastery") or {}
        rule = MasteryRule(
            int(m.get("min_attempts", 12)), float(m.get("threshold", 0.8))
        )
        if not 0 < rule.threshold < 1 or rule.min_attempts < 1:
            errors.append(f"{where}: bad mastery rule")
        params = dict(s.get("params") or {})
        skills[sid] = Skill(
            id=sid,
            subject=subj,
            grade=grade,
            title_he=str(s.get("title_he", "")),
            title_en=str(s.get("title_en", "")),
            prereq=tuple(s.get("prereq") or ()),
            generator=gen,
            params=params,
            mastery=rule,
            srs=bool(s.get("srs", gen == "bank")),
        )
        if not skills[sid].title_he:
            errors.append(f"{where}: title_he is missing")
    for sid, sk in skills.items():
        for p in sk.prereq:
            if p not in skills:
                errors.append(f"{sid}: missing prereq {p!r}")
    errors.extend(_cycles(skills))
    banks: dict[str, tuple[BankItem, ...]] = {}
    seen_items: dict[str, str] = {}
    for sid, sk in skills.items():
        if sk.generator != "bank":
            continue
        rel = sk.params.get("bank")
        if not rel:
            errors.append(f"{sid}: bank generator needs params.bank")
            continue
        path = root / rel
        if not path.is_file():
            errors.append(f"{sid}: bank file not found: {rel}")
            continue
        try:
            doc = yaml.safe_load(path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            errors.append(f"{rel}: YAML error: {exc}")
            continue
        items = _bank_items(rel, doc, sid, errors)
        for it in items:
            if it.id in seen_items and seen_items[it.id] != rel:
                errors.append(f"{rel}:{it.id}: duplicate item id")
        mine = [it for it in items if it.skill == sid]
        banks[sid] = tuple(mine or items)
        for it in items:
            seen_items.setdefault(it.id, rel)
    return skills, banks


def _cycles(skills: Mapping[str, Skill]) -> list[str]:
    state: dict[str, int] = {}
    errors: list[str] = []

    def visit(sid: str, path: list[str]) -> None:
        st = state.get(sid, 0)
        if st == 1:
            cyc = path[path.index(sid) :] + [sid]
            errors.append("prereq cycle: " + " -> ".join(cyc))
            return
        if st == 2 or sid not in skills:
            return
        state[sid] = 1
        for p in skills[sid].prereq:
            visit(p, path + [sid])
        state[sid] = 2

    for sid in skills:
        visit(sid, [])
    return errors


def _flatten_bank(doc: Any) -> tuple[str | None, list[Mapping[str, Any]]]:
    if isinstance(doc, Mapping):
        return doc.get("skill"), list(doc.get("items") or [])
    if isinstance(doc, list):  # reading passages with questions
        items: list[Mapping[str, Any]] = []
        for passage in doc:
            for q in passage.get("questions") or []:
                q = dict(q)
                q.setdefault("grade", passage.get("grade", 0))
                meta = dict(q.get("meta") or {})
                meta["passage"] = passage.get("id")
                q["meta"] = meta
                items.append(q)
        return None, items
    return None, []


def _bank_items(
    rel: str, doc: Any, default_skill: str, errors: list[str]
) -> list[BankItem]:
    file_skill, raw_items = _flatten_bank(doc)
    out: list[BankItem] = []
    ids: set[str] = set()
    for raw in raw_items:
        iid = raw.get("id")
        where = f"{rel}:{iid}"
        if not iid:
            errors.append(f"{rel}: item without id")
            continue
        if iid in ids:
            errors.append(f"{where}: duplicate item id")
            continue
        ids.add(iid)
        kind = raw.get("kind", "choice")
        choices = tuple(raw.get("choices") or ())
        answer = raw.get("answer")
        errors.extend(
            _text_errors(
                where, "prompt_he", raw.get("prompt_he"), LIMITS["prompt_he"]
            )
        )
        if raw.get("explanation_he"):
            errors.extend(
                _text_errors(
                    where,
                    "explanation_he",
                    raw.get("explanation_he"),
                    LIMITS["explanation_he"],
                )
            )
        if kind == "true_false":
            if not isinstance(answer, bool):
                errors.append(f"{where}: true_false needs answer: true|false")
        elif kind in ("choice", "order"):
            texts = [str(c.get("he", "")) for c in choices]
            if len(texts) < 2:
                errors.append(f"{where}: needs at least 2 choices")
            if len(set(texts)) != len(texts):
                errors.append(f"{where}: duplicate choice")
            for t in texts:
                errors.extend(
                    _text_errors(where, "choice", t, LIMITS["choice"])
                )
            if kind == "choice":
                if not isinstance(answer, int) or not 0 <= answer < len(texts):
                    errors.append(f"{where}: answer out of range")
            else:
                if not isinstance(answer, list) or sorted(answer) != list(
                    range(len(texts))
                ):
                    errors.append(
                        f"{where}: order answer must list all choice indexes"
                    )
        else:
            errors.append(f"{where}: unknown kind {kind!r}")
        out.append(
            BankItem(
                id=iid,
                skill=raw.get("skill") or file_skill or default_skill,
                kind=kind,
                grade=int(raw.get("grade", 0)),
                difficulty=float(raw.get("difficulty", 0.0)),
                prompt_he=str(raw.get("prompt_he", "")),
                prompt_en=raw.get("prompt_en"),
                choices=choices,
                answer=answer,
                explanation_he=str(raw.get("explanation_he", "")),
                explanation_en=raw.get("explanation_en"),
                tags=tuple(raw.get("tags") or ()),
                meta=dict(raw.get("meta") or {}),
            )
        )
    return out


def iter_skill_ids(
    lib: ContentLibrary, pred: Callable[[Skill], bool]
) -> list[str]:
    return [s.id for s in lib.skills.values() if pred(s)]
