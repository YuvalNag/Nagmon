"""Content library: skills, banks and the generator registry.

Loads ``skills/*.yaml``, the banks they reference (SDD_CONTENT sections
2-5), the English word list and, optionally, the AI-studio bank
(SDD_LEARNING section 16). Validates everything and turns a skill + rng
into a :class:`~nagmon.learning.model.Question`.
"""

from __future__ import annotations

import logging
import random
import re
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

from nagmon.learning.generators import load_builtin_generators
from nagmon.learning.generators.common import GenContext, Generator
from nagmon.learning.generators.english import (
    VocabPool,
    VocabWord,
    parse_word,
    parse_words,
    skill_words,
    validate_vocab_params,
)
from nagmon.learning.model import (
    FALSE_ID,
    SUBJECTS,
    TRUE_ID,
    Choice,
    Figure,
    Question,
    true_false_choices,
)

DEFAULT_CONTENT_DIR = (
    Path(__file__).resolve().parents[2] / "mods" / "nagmon" / "learning"
)
WORDS_FILE = "english/words.yaml"
NIQQUD = re.compile("[֑-ׇֽֿׁׂׅׄ]")
HEBREW = re.compile("[א-ת]")
ITEM_ID = re.compile(r"^[A-Za-z0-9_.\-]+$")
LIMITS = {"prompt_he": 140, "choice": 40, "explanation_he": 200}
# libyaml when available: the content is ~40k lines of YAML.
_YAML_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
# Share of questions taken from extra (AI) items in a generator skill.
EXTRA_SHARE_MAX = 0.3
EXTRA_SHARE_HALF = 20

log = logging.getLogger(__name__)

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
    speak_en: str | None = None  # TTS text instead of prompt_en
    emoji: str | None = None  # picture shown with the prompt


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


def _choice_text(raw: Mapping[str, Any]) -> str:
    """Display text: Hebrew, or the English text of an English-only choice."""
    return str(raw.get("he") or raw.get("en") or "")


def _bank_choice(raw: Mapping[str, Any], idx: int) -> Choice:
    em = raw.get("emoji")
    return Choice(
        id=chr(ord("a") + idx),
        text_he=_choice_text(raw),
        text_en=raw.get("en"),
        image=f"emoji:{em}" if em else raw.get("image"),
    )


def bank_question(
    item: BankItem, rng: random.Random, ctx: GenContext
) -> Question:
    speak_en = item.speak_en or item.prompt_en
    common = {
        "item_id": item.id,
        "skill_id": ctx.skill_id or item.skill,
        "subject": ctx.subject,
        "prompt_he": item.prompt_he,
        "prompt_en": item.prompt_en,
        "explanation_he": item.explanation_he,
        "explanation_en": item.explanation_en,
        "difficulty": float(item.difficulty),
        "figure": (
            Figure("objects", {"emoji": item.emoji, "count": 1})
            if item.emoji
            else None
        ),
        "speak": {
            "he": item.prompt_he,
            **({"en": speak_en} if speak_en else {}),
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
    extra: tuple[BankItem, ...] = params.get("_extra", ())
    tags = set(params.get("tags") or ())
    pool = [i for i in items if not tags or tags & set(i.tags)] or list(items)
    pool.extend(extra)  # extra (AI) items are attached by skill, not tag
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
        *,
        words: Iterable[VocabWord] = (),
        extra: Mapping[str, tuple[BankItem, ...]] | None = None,
        element_facts: Mapping[str, list[dict[str, str]]] | None = None,
        element_titles: Mapping[str, dict[str, str]] | None = None,
        warnings: Iterable[str] = (),
    ) -> None:
        self.skills: dict[str, Skill] = dict(skills)
        self.registry = registry
        self.banks: dict[str, tuple[BankItem, ...]] = dict(banks or {})
        self.words: tuple[VocabWord, ...] = tuple(words)
        self.extra: dict[str, tuple[BankItem, ...]] = dict(extra or {})
        self.element_facts: dict[str, list[dict[str, str]]] = {
            k: list(v) for k, v in (element_facts or {}).items()
        }
        self.element_titles: dict[str, dict[str, str]] = dict(
            element_titles or {}
        )
        self.warnings: list[str] = list(warnings)
        self._by_subject: dict[str, list[Skill]] = {}
        for s in sorted(self.skills.values(), key=lambda s: (s.grade, s.id)):
            self._by_subject.setdefault(s.subject, []).append(s)
        self._params: dict[str, dict[str, Any]] = {}
        for s in self.skills.values():
            p = dict(s.params)
            if s.generator == "bank":
                p["_items"] = self.banks.get(s.id, ())
                p["_extra"] = self.extra.get(s.id, ())
            elif s.generator == "english.vocab":
                p["_pool"] = VocabPool(skill_words(p, self.words))
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
        *,
        extra_bank_dirs: Iterable[str | Path] = (),
    ) -> ContentLibrary:
        """Load and validate the content folder.

        ``extra_bank_dirs``: AI-studio banks (``<data_root>`` with an
        ``ai_bank`` folder, or the ``ai_bank`` folder itself). Problems
        there only produce warnings (``library.warnings``) and never stop
        the game.
        """
        root = Path(path) if path is not None else DEFAULT_CONTENT_DIR
        registry = registry or default_registry()
        errors: list[str] = []
        raw_skills: list[tuple[str, str, Mapping[str, Any]]] = []
        for f in sorted((root / "skills").glob("*.yaml")):
            try:
                doc = _read_yaml(f) or {}
            except yaml.YAMLError as exc:
                errors.append(f"{f.name}: YAML error: {exc}")
                continue
            if not isinstance(doc, Mapping):
                errors.append(f"{f.name}: top level must be a mapping")
                continue
            subject = doc.get("subject")
            for s in doc.get("skills") or []:
                raw_skills.append((f.name, subject, s))
        built = _build(root, raw_skills, registry, errors)
        if errors:
            raise ContentError(errors)
        warnings: list[str] = []
        extra, extra_words = _load_extra(extra_bank_dirs, built, warnings)
        for w in warnings:
            log.warning("extra bank: %s", w)
        return cls(
            built.skills,
            registry,
            built.banks,
            words=(*built.words, *extra_words),
            extra=extra,
            element_facts=built.element_facts,
            element_titles=built.element_titles,
            warnings=warnings,
        )

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

    def words_he(self) -> dict[str, str]:
        """English word -> Hebrew (first entry), for the language ladder."""
        out: dict[str, str] = {}
        for w in self.words:
            out.setdefault(w.word, w.he)
        return out

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
        extra = self.extra.get(skill_id) if skill.generator != "bank" else None
        if extra:
            share = min(
                EXTRA_SHARE_MAX, len(extra) / (len(extra) + EXTRA_SHARE_HALF)
            )
            if rng.random() < share:
                return bank_question(rng.choice(extra), rng, ctx)
        gen = self.registry.get(skill.generator)
        return gen(rng, self._params[skill_id], ctx)


# --------------------------------------------------------------------------
# Building and validation
# --------------------------------------------------------------------------


@dataclass
class _Built:
    skills: dict[str, Skill]
    banks: dict[str, tuple[BankItem, ...]] = field(default_factory=dict)
    words: list[VocabWord] = field(default_factory=list)
    element_facts: dict[str, list[dict[str, str]]] = field(
        default_factory=dict
    )
    element_titles: dict[str, dict[str, str]] = field(default_factory=dict)
    item_ids: set[str] = field(default_factory=set)


@dataclass
class _ParsedBank:
    items: list[BankItem] = field(default_factory=list)
    element_facts: dict[str, list[dict[str, str]]] = field(
        default_factory=dict
    )
    element_titles: dict[str, dict[str, str]] = field(default_factory=dict)


def _text_errors(where: str, field_: str, text: Any, limit: int) -> list[str]:
    out = []
    if not isinstance(text, str) or not text.strip():
        return [f"{where}: {field_} is missing"]
    if len(text) > limit:
        out.append(f"{where}: {field_} longer than {limit} characters")
    if NIQQUD.search(text):
        out.append(f"{where}: {field_} contains niqqud")
    return out


def _read_yaml(path: Path) -> Any:
    return yaml.load(path.read_text(encoding="utf-8"), Loader=_YAML_LOADER)


def _build(
    root: Path,
    raw_skills: Iterable[tuple[str, str, Mapping[str, Any]]],
    registry: GeneratorRegistry,
    errors: list[str],
) -> _Built:
    built = _Built(_build_skills(raw_skills, registry, errors))
    skills = built.skills
    uses_vocab = any(s.generator == "english.vocab" for s in skills.values())
    if uses_vocab or (root / WORDS_FILE).is_file():
        built.words = _load_words(root, errors)
    for sid, sk in skills.items():
        if sk.generator == "english.vocab":
            errors.extend(
                f"{sid}: {e}"
                for e in validate_vocab_params(sk.params, built.words)
            )
    parsed: dict[str, _ParsedBank] = {}
    owner: dict[str, str] = {}  # item id -> bank file
    for sid, sk in skills.items():
        if sk.generator != "bank":
            continue
        rel = sk.params.get("bank")
        if not rel:
            errors.append(f"{sid}: bank generator needs params.bank")
            continue
        if rel not in parsed:
            bank = _load_bank(root, rel, errors)
            if bank is None:
                continue
            parsed[rel] = bank
            for it in bank.items:
                if it.id in owner:
                    errors.append(f"{rel}:{it.id}: duplicate item id")
                    continue
                owner[it.id] = rel
                if it.skill and it.skill not in skills:
                    errors.append(f"{rel}:{it.id}: unknown skill {it.skill!r}")
            for element, facts in bank.element_facts.items():
                built.element_facts.setdefault(element, []).extend(facts)
            built.element_titles.update(bank.element_titles)
        items = parsed[rel].items
        mine = [it for it in items if it.skill == sid]
        built.banks[sid] = tuple(mine or items)
    built.item_ids = set(owner)
    return built


def _build_skills(
    raw_skills: Iterable[tuple[str, str, Mapping[str, Any]]],
    registry: GeneratorRegistry,
    errors: list[str],
) -> dict[str, Skill]:
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
            srs=bool(s.get("srs", gen in ("bank", "english.vocab"))),
        )
        if not skills[sid].title_he:
            errors.append(f"{where}: title_he is missing")
    for sid, sk in skills.items():
        for p in sk.prereq:
            if p not in skills:
                errors.append(f"{sid}: missing prereq {p!r}")
    errors.extend(_cycles(skills))
    return skills


def _load_words(root: Path, errors: list[str]) -> list[VocabWord]:
    path = root / WORDS_FILE
    if not path.is_file():
        errors.append(f"{WORDS_FILE}: file not found")
        return []
    try:
        doc = _read_yaml(path)
    except yaml.YAMLError as exc:
        errors.append(f"{WORDS_FILE}: YAML error: {exc}")
        return []
    words, errs = parse_words(doc)
    errors.extend(f"{WORDS_FILE}: {e}" for e in errs)
    for w in words:
        for name, text in (("he", w.he), ("example_he", w.example_he)):
            if NIQQUD.search(text):
                errors.append(f"{WORDS_FILE}:{w.word}: {name} has niqqud")
    return words


def _load_bank(root: Path, rel: str, errors: list[str]) -> _ParsedBank | None:
    path = root / rel
    if not path.is_file():
        errors.append(f"bank file not found: {rel}")
        return None
    try:
        doc = _read_yaml(path)
    except yaml.YAMLError as exc:
        errors.append(f"{rel}: YAML error: {exc}")
        return None
    bank = _ParsedBank()
    raw_items, file_errors = _bank_raw_items(doc)
    errors.extend(f"{rel}: {e}" for e in file_errors)
    seen: set[str] = set()
    for raw, defaults in raw_items:
        item, errs = _parse_item(rel, raw, defaults)
        errors.extend(errs)
        if item is None:
            continue
        if item.id in seen:
            errors.append(f"{rel}:{item.id}: duplicate item id")
            continue
        seen.add(item.id)
        bank.items.append(item)
    if isinstance(doc, Mapping) and doc.get("elements") is not None:
        _parse_elements(rel, doc["elements"], bank, errors)
    return bank


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


_PASSAGE_INHERIT = ("grade", "skill", "tags", "level")


def _bank_raw_items(
    doc: Any,
) -> tuple[list[tuple[Any, dict[str, Any]]], list[str]]:
    """(raw item, defaults) pairs of a bank document.

    ``{skill, items}`` banks, or a list of reading passages whose
    questions inherit grade, skill, tags and level, and carry the passage
    text in ``meta`` (SDD_LEARNING section 16).
    """
    if doc is None:
        return [], []
    if isinstance(doc, Mapping):
        items = doc.get("items") or []
        if not isinstance(items, list):
            return [], ["items must be a list"]
        defaults = {"skill": doc.get("skill")}
        return [(raw, defaults) for raw in items], []
    if not isinstance(doc, list):
        return [], ["top level must be a mapping or a list of passages"]
    out: list[tuple[Any, dict[str, Any]]] = []
    errors: list[str] = []
    for passage in doc:
        if not isinstance(passage, Mapping):
            errors.append("passage must be a mapping")
            continue
        pid = passage.get("id")
        if not passage.get("text_en") and not passage.get("text_he"):
            errors.append(f"{pid}: passage text is missing")
        defaults = {k: passage[k] for k in _PASSAGE_INHERIT if k in passage}
        defaults["meta"] = {
            "passage_id": pid,
            "passage_title": passage.get("title"),
            "passage_en": passage.get("text_en"),
            "passage_he": passage.get("text_he"),
        }
        for q in passage.get("questions") or []:
            out.append((q, defaults))
    return out, errors


def _norm_choice(raw: Any) -> Mapping[str, Any]:
    if isinstance(raw, Mapping):
        return raw
    text = str(raw)
    return {"he": text} if HEBREW.search(text) else {"en": text}


def _choice_errors(
    where: str, choices: Sequence[Mapping[str, Any]]
) -> list[str]:
    errors = []
    if len(choices) < 2:
        errors.append(f"{where}: needs at least 2 choices")
    for lang in ("he", "en"):
        texts = [
            str(c[lang]).strip().casefold() for c in choices if c.get(lang)
        ]
        if len(set(texts)) != len(texts):
            errors.append(f"{where}: duplicate choice")
            break
    for c in choices:
        if not c.get("he") and not c.get("en"):
            errors.append(f"{where}: choice is missing")
            continue
        # the displayed text (Hebrew, or English for an English-only choice)
        errors.extend(
            _text_errors(where, "choice", _choice_text(c), LIMITS["choice"])
        )
    with_emoji = sum(1 for c in choices if c.get("emoji"))
    if 0 < with_emoji < len(choices):
        errors.append(f"{where}: emoji on some choices only (a giveaway)")
    return errors


def _parse_item(
    rel: str, raw: Any, defaults: Mapping[str, Any]
) -> tuple[BankItem | None, list[str]]:
    if not isinstance(raw, Mapping):
        return None, [f"{rel}: item must be a mapping"]
    iid = raw.get("id")
    where = f"{rel}:{iid}"
    if not iid or not isinstance(iid, str):
        return None, [f"{rel}: item without id"]
    errors: list[str] = []
    if not ITEM_ID.match(iid):
        errors.append(f"{where}: id may use only A-Z a-z 0-9 _ . -")
    kind = raw.get("kind", "choice")
    choices = tuple(_norm_choice(c) for c in raw.get("choices") or ())
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
        choices = ()
    elif kind in ("choice", "order"):
        errors.extend(_choice_errors(where, choices))
        n = len(choices)
        if kind == "choice":
            if (
                not isinstance(answer, int)
                or isinstance(answer, bool)
                or not 0 <= answer < n
            ):
                errors.append(f"{where}: answer out of range")
        elif not isinstance(answer, list) or sorted(answer) != list(range(n)):
            errors.append(
                f"{where}: order answer must list all choice indexes"
            )
    else:
        errors.append(f"{where}: unknown kind {kind!r}")
    for key in ("speak_en", "emoji"):
        if raw.get(key) is not None and not isinstance(raw.get(key), str):
            errors.append(f"{where}: {key} must be text")
    grade = raw.get("grade", defaults.get("grade", 0))
    if not isinstance(grade, int) or isinstance(grade, bool):
        errors.append(f"{where}: grade must be an integer")
        grade = 0
    try:
        difficulty = float(raw.get("difficulty", 0.0))
    except (TypeError, ValueError):
        errors.append(f"{where}: difficulty must be a number")
        difficulty = 0.0
    if errors:
        return None, errors
    meta = dict(defaults.get("meta") or {})
    meta.update(raw.get("meta") or {})
    if defaults.get("level") and "level" not in meta:
        meta["level"] = defaults["level"]
    return (
        BankItem(
            id=iid,
            skill=str(raw.get("skill") or defaults.get("skill") or ""),
            kind=kind,
            grade=grade,
            difficulty=difficulty,
            prompt_he=str(raw.get("prompt_he", "")),
            prompt_en=raw.get("prompt_en"),
            choices=choices,
            answer=answer,
            explanation_he=str(raw.get("explanation_he", "")),
            explanation_en=raw.get("explanation_en"),
            tags=tuple(raw.get("tags") or defaults.get("tags") or ()),
            meta=meta,
            speak_en=raw.get("speak_en") or None,
            emoji=raw.get("emoji") or None,
        ),
        [],
    )


def _parse_elements(
    rel: str, elements: Any, bank: _ParsedBank, errors: list[str]
) -> None:
    """``elements: {name: {title_he, title_en, facts: [{id, he, en}]}}``."""
    if not isinstance(elements, Mapping):
        errors.append(f"{rel}: elements must be a mapping")
        return
    ids: set[str] = set()
    for name, block in elements.items():
        where = f"{rel}:elements.{name}"
        if not isinstance(block, Mapping):
            errors.append(f"{where}: must be a mapping")
            continue
        bank.element_titles[str(name)] = {
            "he": str(block.get("title_he") or ""),
            "en": str(block.get("title_en") or ""),
        }
        facts = []
        for f in block.get("facts") or []:
            fid = f.get("id") if isinstance(f, Mapping) else None
            if not fid:
                errors.append(f"{where}: fact without id")
                continue
            if fid in ids:
                errors.append(f"{where}:{fid}: duplicate fact id")
                continue
            ids.add(fid)
            he = f.get("he")
            if not isinstance(he, str) or not he.strip():
                errors.append(f"{where}:{fid}: he is missing")
                continue
            if NIQQUD.search(he):
                errors.append(f"{where}:{fid}: he contains niqqud")
            facts.append(
                {"id": str(fid), "he": he, "en": str(f.get("en") or "")}
            )
        bank.element_facts[str(name)] = facts


# --------------------------------------------------------------------------
# Extra banks (AI studio, SDD_AI section 2)
# --------------------------------------------------------------------------


def _load_extra(
    dirs: Iterable[str | Path], built: _Built, warnings: list[str]
) -> tuple[dict[str, tuple[BankItem, ...]], list[VocabWord]]:
    extra: dict[str, list[BankItem]] = {}
    words: list[VocabWord] = []
    seen_ids = set(built.item_ids)
    seen_words = {(w.word.lower(), w.pos) for w in built.words}
    for d in dirs:
        base = Path(d)
        if (base / "ai_bank").is_dir():
            base = base / "ai_bank"
        if not base.is_dir():
            continue
        for name in (*SUBJECTS, "reading"):
            path = base / f"{name}.yaml"
            if path.is_file():
                _load_extra_bank(path, built, seen_ids, extra, warnings)
        vocab = base / "vocab.yaml"
        if vocab.is_file():
            words.extend(_load_extra_words(vocab, seen_words, warnings))
    return {k: tuple(v) for k, v in extra.items()}, words


def _safe_read(path: Path, warnings: list[str]) -> Any:
    try:
        return _read_yaml(path)
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as exc:
        warnings.append(f"{path.name}: cannot read: {exc}")
        return None


def _load_extra_bank(
    path: Path,
    built: _Built,
    seen_ids: set[str],
    extra: dict[str, list[BankItem]],
    warnings: list[str],
) -> None:
    doc = _safe_read(path, warnings)
    raw_items, file_errors = _bank_raw_items(doc)
    warnings.extend(f"{path.name}: {e}" for e in file_errors)
    for raw, defaults in raw_items:
        item, errs = _parse_item(path.name, raw, defaults)
        if item is None:
            warnings.append(f"skipped: {'; '.join(errs)}")
            continue
        where = f"{path.name}:{item.id}"
        if item.id in seen_ids:
            warnings.append(f"{where}: duplicate item id, skipped")
            continue
        skill = _resolve_skill(item, built.skills)
        if skill is None:
            warnings.append(f"{where}: unknown skill {item.skill!r}, skipped")
            continue
        seen_ids.add(item.id)
        extra.setdefault(skill, []).append(item)


def _resolve_skill(item: BankItem, skills: Mapping[str, Skill]) -> str | None:
    """The item's skill, or for a generic id (the studio writes stories as
    ``english.reading``) the skill under that prefix nearest in grade."""
    if item.skill in skills:
        return item.skill
    if not item.skill:
        return None
    under = [s for s in skills.values() if s.id.startswith(item.skill + ".")]
    if not under:
        return None
    best = min(under, key=lambda s: (abs(s.grade - item.grade), s.grade, s.id))
    return best.id


def _load_extra_words(
    path: Path, seen: set[tuple[str, str]], warnings: list[str]
) -> list[VocabWord]:
    doc = _safe_read(path, warnings)
    if doc is None:
        return []
    if not isinstance(doc, list):
        warnings.append(f"{path.name}: top level must be a list of words")
        return []
    out = []
    for raw in doc:
        w, errs = parse_word(raw)
        if w is None:
            warnings.append(f"{path.name}: skipped: {'; '.join(errs)}")
            continue
        if NIQQUD.search(w.he):
            warnings.append(f"{path.name}:{w.word}: niqqud, skipped")
            continue
        key = (w.word.lower(), w.pos)
        if key in seen:
            continue  # already in the main list
        seen.add(key)
        out.append(w)
    return out


def iter_skill_ids(
    lib: ContentLibrary, pred: Callable[[Skill], bool]
) -> list[str]:
    return [s.id for s in lib.skills.values() if pred(s)]
