"""Child profiles: one card per child on the "who is playing?" screen.

Layout under ``root``::

    profiles/<id>/profile.json
    profiles/<id>/learning.json   # opaque dict (LearnerState lives elsewhere)
    profiles/<id>/saves/
    trash/<id>-<stamp>/           # deleted profiles, recoverable
"""

from __future__ import annotations

import logging
import os
import re
import secrets
import time
from collections.abc import Callable, Collection, Sequence
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any

from nagmon.family._jsonio import atomic_write_json, load_json

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 2
MAX_PROFILES = 8
MAX_NAME_LEN = 16
RECOVERED_NAME = "שחקן"

_LETTER = "A-Za-zא-ת"
_NAME_RE = re.compile(
    rf"[{_LETTER}]"  # starts with a letter
    rf"(?:[{_LETTER}]"  # more letters
    rf"|(?<=[{_LETTER}])['׳]"  # apostrophe / geresh after a letter
    rf"|[ \-](?=[{_LETTER}])"  # single space / hyphen between letters
    r")*"
)
_ID_RE = re.compile(r"p[0-9a-f]{5}")

AvatarAllowList = Collection[str] | Callable[[str], bool] | None


class ProfileError(ValueError):
    """Invalid profile data."""


class ProfileLimitError(ProfileError):
    """Too many profiles."""


def validate_name(name: str) -> str:
    """Return the stripped name or raise :class:`ProfileError`."""
    if not isinstance(name, str):
        raise ProfileError("name must be a string")
    name = name.strip()
    if not 1 <= len(name) <= MAX_NAME_LEN:
        raise ProfileError(f"name must be 1-{MAX_NAME_LEN} characters")
    if not _NAME_RE.fullmatch(name):
        raise ProfileError("name may contain Hebrew or English letters only")
    return name


@dataclass
class Profile:
    id: str
    name: str
    avatar: str
    birth_year: int | None = None
    grade: int = 0
    language_level: int = 0
    language_locked: bool = False
    interests: list[str] = field(default_factory=list)
    settings: dict[str, Any] = field(default_factory=dict)
    created_at: float = 0.0
    order: int = 0
    extra: dict[str, Any] = field(default_factory=dict, compare=False)

    def to_dict(self) -> dict[str, Any]:
        d = dict(self.extra)
        for f in fields(self):
            if f.name != "extra":
                d[f.name] = getattr(self, f.name)
        d["interests"] = list(self.interests)
        d["settings"] = dict(self.settings)
        d["schema_version"] = SCHEMA_VERSION
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Profile:
        d = _migrate(dict(d))
        known = {f.name for f in fields(cls)} - {"extra"}
        kwargs = {k: v for k, v in d.items() if k in known}
        extra = {
            k: v
            for k, v in d.items()
            if k not in known and k != "schema_version"
        }
        p = cls(**kwargs)
        p.interests = list(p.interests or [])
        p.settings = dict(p.settings or {})
        p.extra = extra
        return p


def _migrate(d: dict[str, Any]) -> dict[str, Any]:
    version = d.get("schema_version", 1)
    if not isinstance(version, int):
        version = 1
    if version < 2:
        # v1 (first contract) had no "order"; the store fixes the order
        # from created_at after loading all profiles.
        d.setdefault("order", -1)
    d["schema_version"] = max(version, SCHEMA_VERSION)
    return d


@dataclass(frozen=True)
class TrashEntry:
    entry: str  # directory name under trash/
    profile_id: str
    name: str
    deleted_at: float


class ProfileStore:
    def __init__(
        self,
        root: Path,
        *,
        avatars: AvatarAllowList = None,
        learner_from_dict: Callable[[dict[str, Any]], Any] | None = None,
        learner_new: Callable[[], Any] | None = None,
        clock: Callable[[], float] = time.time,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self.root = Path(root)
        self.profiles_dir = self.root / "profiles"
        self.trash_dir = self.root / "trash"
        self._avatars = avatars
        self._learner_from_dict = learner_from_dict
        self._learner_new = learner_new
        self._clock = clock
        self._id_factory = id_factory or _random_id
        self.profiles_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------ queries

    def list(self) -> list[Profile]:
        profiles = [self._load(pid) for pid in self._ids()]
        unordered = sorted(
            (p for p in profiles if p.order < 0),
            key=lambda p: (p.created_at, p.id),
        )
        start = max((p.order for p in profiles), default=-1) + 1
        for i, p in enumerate(unordered):
            p.order = start + i
        profiles.sort(key=lambda p: (p.order, p.created_at, p.id))
        return profiles

    def get(self, pid: str) -> Profile:
        if pid not in self._ids():
            raise KeyError(pid)
        return self._load(pid)

    def save_dir(self, pid: str) -> Path:
        path = self._dir(pid) / "saves"
        path.mkdir(parents=True, exist_ok=True)
        return path

    # ---------------------------------------------------------- mutations

    def create(self, *, name: str, avatar: str, **fields_: Any) -> Profile:
        allowed = {f.name for f in fields(Profile)} - {
            "id",
            "name",
            "avatar",
            "created_at",
            "order",
            "extra",
        }
        unknown = set(fields_) - allowed
        if unknown:
            raise TypeError(f"unknown profile fields: {sorted(unknown)}")
        existing = self.list()
        if len(existing) >= MAX_PROFILES:
            raise ProfileLimitError(f"at most {MAX_PROFILES} profiles")
        p = Profile(
            id=self._new_id(),
            name=name,
            avatar=avatar,
            created_at=self._clock(),
            order=max((x.order for x in existing), default=-1) + 1,
            **fields_,
        )
        self._validate(p, existing)
        self._dir(p.id).mkdir(parents=True, exist_ok=True)
        self.save_dir(p.id)
        self._write(p)
        return p

    def save(self, p: Profile) -> None:
        if p.id not in self._ids():
            raise KeyError(p.id)
        others = [x for x in self.list() if x.id != p.id]
        self._validate(p, others)
        self._write(p)

    def reorder(self, pids: Sequence[str]) -> None:
        profiles = {p.id: p for p in self.list()}
        if sorted(pids) != sorted(profiles) or len(set(pids)) != len(pids):
            raise ProfileError("reorder needs every profile exactly once")
        for i, pid in enumerate(pids):
            profiles[pid].order = i
            self._write(profiles[pid])

    def delete(self, pid: str) -> TrashEntry:
        p = self.get(pid)
        now = self._clock()
        self.trash_dir.mkdir(parents=True, exist_ok=True)
        entry = f"{pid}-{int(now * 1000)}"
        os.replace(self._dir(pid), self.trash_dir / entry)
        return TrashEntry(entry, pid, p.name, now)

    def list_trash(self) -> list[TrashEntry]:
        if not self.trash_dir.is_dir():
            return []
        out = []
        for d in sorted(self.trash_dir.iterdir()):
            pid, _, stamp = d.name.partition("-")
            if not d.is_dir() or not _ID_RE.fullmatch(pid):
                continue
            res = load_json(d / "profile.json")
            name = (res.data or {}).get("name", "")
            deleted = int(stamp) / 1000 if stamp.isdigit() else 0.0
            out.append(TrashEntry(d.name, pid, name, deleted))
        return out

    def restore(self, entry: str) -> Profile:
        found = {e.entry: e for e in self.list_trash()}
        if entry not in found:
            raise KeyError(entry)
        info = found[entry]
        existing = self.list()
        if info.profile_id in {p.id for p in existing}:
            raise ProfileError("a profile with this id already exists")
        if len(existing) >= MAX_PROFILES:
            raise ProfileLimitError(f"at most {MAX_PROFILES} profiles")
        src = self.trash_dir / entry
        p = self._read(info.profile_id, src / "profile.json")
        self._validate(p, existing, check_avatar=False)
        p.order = max((x.order for x in existing), default=-1) + 1
        os.replace(src, self._dir(info.profile_id))
        self._write(p)
        return p

    # ------------------------------------------------------------ learner

    def load_learner_dict(self, pid: str) -> dict[str, Any]:
        self.get(pid)
        res = load_json(self._dir(pid) / "learning.json")
        if res.recovered:
            logger.warning("learning.json of %s recovered (%s)", pid, res)
        return res.data or {}

    def save_learner_dict(self, pid: str, data: dict[str, Any]) -> None:
        self.get(pid)
        atomic_write_json(self._dir(pid) / "learning.json", data)

    def load_learner(self, pid: str) -> Any:
        if self._learner_from_dict is None:
            raise RuntimeError("ProfileStore has no learner_from_dict factory")
        data = self.load_learner_dict(pid)
        if not data and self._learner_new is not None:
            return self._learner_new()
        return self._learner_from_dict(data)

    def save_learner(self, pid: str, state: Any) -> None:
        self.save_learner_dict(pid, state.to_dict())

    # ------------------------------------------------------------ helpers

    def _dir(self, pid: str) -> Path:
        return self.profiles_dir / pid

    def _ids(self) -> list[str]:
        return sorted(
            d.name
            for d in self.profiles_dir.iterdir()
            if d.is_dir() and _ID_RE.fullmatch(d.name)
        )

    def _new_id(self) -> str:
        taken = set(self._ids()) | {e.profile_id for e in self.list_trash()}
        for _ in range(1000):
            pid = self._id_factory()
            if pid not in taken:
                return pid
        raise RuntimeError("could not generate a unique profile id")

    def _load(self, pid: str) -> Profile:
        return self._read(pid, self._dir(pid) / "profile.json")

    def _read(self, pid: str, path: Path) -> Profile:
        res = load_json(path)
        if res.data is not None:
            try:
                p = Profile.from_dict(res.data)
                p.id = pid
                return p
            except TypeError:
                logger.warning("profile %s has invalid fields", pid)
        logger.warning("profile %s could not be read; using defaults", pid)
        return Profile(
            id=pid,
            name=RECOVERED_NAME,
            avatar="",
            settings={"recovered": True},
            order=-1,
        )

    def _write(self, p: Profile) -> None:
        atomic_write_json(self._dir(p.id) / "profile.json", p.to_dict())

    def _validate(
        self,
        p: Profile,
        others: Sequence[Profile],
        *,
        check_avatar: bool = True,
    ) -> None:
        p.name = validate_name(p.name)
        taken = {o.name.casefold() for o in others}
        if p.name.casefold() in taken:
            raise ProfileError("another profile already has this name")
        if check_avatar:
            self._check_avatar(p.avatar)
        if not isinstance(p.grade, int) or not 0 <= p.grade <= 9:
            raise ProfileError("grade must be 0..9")
        if not isinstance(p.language_level, int) or not (
            0 <= p.language_level <= 5
        ):
            raise ProfileError("language_level must be 0..5")
        if p.birth_year is not None and not (
            isinstance(p.birth_year, int) and 1990 <= p.birth_year <= 2100
        ):
            raise ProfileError("birth_year out of range")

    def _check_avatar(self, avatar: str) -> None:
        if not isinstance(avatar, str) or not avatar:
            raise ProfileError("avatar is required")
        allow = self._avatars
        if allow is None:
            return
        ok = allow(avatar) if callable(allow) else avatar in allow
        if not ok:
            raise ProfileError("avatar is not in the allowed list")


def _random_id() -> str:
    return "p" + format(secrets.randbelow(16**5), "05x")
