import json
import re

import pytest
from nagmon.family.profiles import (
    MAX_PROFILES,
    SCHEMA_VERSION,
    Profile,
    ProfileError,
    ProfileLimitError,
    ProfileStore,
    validate_name,
)

AVATARS = {"girl_a", "boy_a", "girl_b", "boy_b"}


class FakeClock:
    def __init__(self, t: float = 1_700_000_000.0) -> None:
        self.t = t

    def __call__(self) -> float:
        self.t += 1.0
        return self.t


@pytest.fixture
def store(tmp_path):
    return ProfileStore(tmp_path, avatars=AVATARS, clock=FakeClock())


def test_create_list_get(store, tmp_path):
    p = store.create(name="נועם", avatar="boy_a", grade=2)
    assert re.fullmatch(r"p[0-9a-f]{5}", p.id)
    assert p.name == "נועם"
    assert p.grade == 2
    assert p.created_at > 0
    assert [x.id for x in store.list()] == [p.id]
    assert store.get(p.id) == p
    pdir = tmp_path / "profiles" / p.id
    assert (pdir / "profile.json").is_file()
    assert store.save_dir(p.id) == pdir / "saves"
    assert store.save_dir(p.id).is_dir()
    data = json.loads((pdir / "profile.json").read_text("utf-8"))
    assert data["schema_version"] == SCHEMA_VERSION


def test_get_unknown_raises(store):
    with pytest.raises(KeyError):
        store.get("pzzzzz")


def test_ids_unique_with_collisions(tmp_path):
    ids = iter(["paaaaa", "paaaaa", "pbbbbb"])
    s = ProfileStore(tmp_path, avatars=AVATARS, id_factory=lambda: next(ids))
    a = s.create(name="Ann", avatar="girl_a")
    b = s.create(name="Ben", avatar="boy_a")
    assert (a.id, b.id) == ("paaaaa", "pbbbbb")


def test_save_updates_profile(store):
    p = store.create(name="מאיה", avatar="girl_a")
    p.language_level = 3
    p.interests.append("דינוזאורים")
    store.save(p)
    q = store.get(p.id)
    assert q.language_level == 3
    assert q.interests == ["דינוזאורים"]


@pytest.mark.parametrize(
    "name",
    [
        "נועם",
        "Maya",
        "בת-אל",
        "Mary Ann",
        "א",
        "אבגדהוזחטיכלמנסע",
        "שי׳",
        "D'or",
    ],
)
def test_valid_names(name):
    assert validate_name(name) == name


def test_name_is_stripped():
    assert validate_name("  נועם ") == "נועם"


@pytest.mark.parametrize(
    "name",
    [
        "",
        "   ",
        "אבגדהוזחטיכלמנסעפ",  # 17
        "נועם2",
        "Maya!",
        "נָעם",  # niqqud
        "😀",
        "נועם‏",  # RTL mark
        "-נועם",
        "נו  עם",  # double space
        "Noam_",
    ],
)
def test_invalid_names(name):
    with pytest.raises(ProfileError):
        validate_name(name)


def test_duplicate_name_rejected(store):
    store.create(name="Maya", avatar="girl_a")
    with pytest.raises(ProfileError):
        store.create(name="maya", avatar="girl_b")


def test_rename_to_own_name_is_fine(store):
    p = store.create(name="Maya", avatar="girl_a")
    p.name = "Maya"
    store.save(p)


def test_rename_to_sibling_name_rejected(store):
    store.create(name="Maya", avatar="girl_a")
    p = store.create(name="Noam", avatar="boy_a")
    p.name = "MAYA"
    with pytest.raises(ProfileError):
        store.save(p)


def test_avatar_not_in_allow_list(store):
    with pytest.raises(ProfileError):
        store.create(name="Maya", avatar="immodest_sprite")


def test_avatar_callable_allow_list(tmp_path):
    s = ProfileStore(tmp_path, avatars=lambda a: a.startswith("modest_"))
    s.create(name="Maya", avatar="modest_1")
    with pytest.raises(ProfileError):
        s.create(name="Noam", avatar="other")


def test_avatar_required(store):
    with pytest.raises(ProfileError):
        store.create(name="Maya", avatar="")
    with pytest.raises(TypeError):
        store.create(name="Maya")


def test_unknown_field_rejected(store):
    with pytest.raises(TypeError):
        store.create(name="Maya", avatar="girl_a", favourite="x")


@pytest.mark.parametrize(
    "field,value",
    [
        ("grade", 10),
        ("grade", -1),
        ("language_level", 6),
        ("birth_year", 1800),
    ],
)
def test_out_of_range_fields(store, field, value):
    with pytest.raises(ProfileError):
        store.create(name="Maya", avatar="girl_a", **{field: value})


def test_max_profiles(store):
    names = ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg", "Hh"]
    assert len(names) == MAX_PROFILES == 8
    for n in names:
        store.create(name=n, avatar="girl_a")
    with pytest.raises(ProfileLimitError):
        store.create(name="Ii", avatar="girl_a")


def test_ordering_and_reorder(store):
    a = store.create(name="Aa", avatar="girl_a")
    b = store.create(name="Bb", avatar="girl_a")
    c = store.create(name="Cc", avatar="girl_a")
    assert [p.id for p in store.list()] == [a.id, b.id, c.id]
    store.reorder([c.id, a.id, b.id])
    assert [p.id for p in store.list()] == [c.id, a.id, b.id]
    with pytest.raises(ProfileError):
        store.reorder([c.id, a.id])
    with pytest.raises(ProfileError):
        store.reorder([c.id, a.id, a.id])


def test_delete_moves_to_trash_and_restore(store, tmp_path):
    p = store.create(name="Maya", avatar="girl_a")
    (store.save_dir(p.id) / "slot1.save").write_text("x")
    store.save_learner_dict(p.id, {"stars": 5})
    entry = store.delete(p.id)
    assert store.list() == []
    assert not (tmp_path / "profiles" / p.id).exists()
    assert entry.profile_id == p.id
    assert entry.name == "Maya"
    assert [e.entry for e in store.list_trash()] == [entry.entry]
    restored = store.restore(entry.entry)
    assert restored.id == p.id
    assert (store.save_dir(p.id) / "slot1.save").read_text() == "x"
    assert store.load_learner_dict(p.id) == {"stars": 5}
    assert store.list_trash() == []


def test_delete_unknown_raises(store):
    with pytest.raises(KeyError):
        store.delete("pzzzzz")


def test_restore_fails_when_name_taken(store):
    p = store.create(name="Maya", avatar="girl_a")
    entry = store.delete(p.id)
    store.create(name="Maya", avatar="girl_b")
    with pytest.raises(ProfileError):
        store.restore(entry.entry)


def test_restore_unknown_entry(store):
    with pytest.raises(KeyError):
        store.restore("nothing-here")
    with pytest.raises(KeyError):
        store.restore("../profiles")


def test_new_ids_avoid_trash(tmp_path):
    ids = iter(["paaaaa", "paaaaa", "pccccc"])
    s = ProfileStore(tmp_path, avatars=AVATARS, id_factory=lambda: next(ids))
    s.delete(s.create(name="Ann", avatar="girl_a").id)
    assert s.create(name="Ben", avatar="boy_a").id == "pccccc"


def test_learner_dict_round_trip_and_missing(store):
    p = store.create(name="Maya", avatar="girl_a")
    assert store.load_learner_dict(p.id) == {}
    store.save_learner_dict(p.id, {"schema_version": 1, "theta": {"m": 0.3}})
    assert store.load_learner_dict(p.id) == {
        "schema_version": 1,
        "theta": {"m": 0.3},
    }


def test_learner_dict_corrupt_recovers_from_backup(store, tmp_path):
    p = store.create(name="Maya", avatar="girl_a")
    store.save_learner_dict(p.id, {"v": 1})
    store.save_learner_dict(p.id, {"v": 2})
    path = tmp_path / "profiles" / p.id / "learning.json"
    path.write_text("{oops", "utf-8")
    assert store.load_learner_dict(p.id) == {"v": 1}
    assert list(path.parent.glob("learning.json.corrupt-*"))


def test_learner_dict_unknown_profile(store):
    with pytest.raises(KeyError):
        store.load_learner_dict("pzzzzz")


class FakeLearner:
    def __init__(self, data):
        self.data = dict(data)

    def to_dict(self):
        return dict(self.data)

    @classmethod
    def from_dict(cls, d):
        return cls(d)


def test_load_save_learner_with_factory(tmp_path):
    s = ProfileStore(
        tmp_path,
        avatars=AVATARS,
        learner_from_dict=FakeLearner.from_dict,
        learner_new=lambda: FakeLearner({"fresh": True}),
    )
    p = s.create(name="Maya", avatar="girl_a")
    assert s.load_learner(p.id).data == {"fresh": True}
    s.save_learner(p.id, FakeLearner({"stars": 3}))
    assert s.load_learner(p.id).data == {"stars": 3}


def test_load_learner_without_factory_raises(store):
    p = store.create(name="Maya", avatar="girl_a")
    with pytest.raises(RuntimeError):
        store.load_learner(p.id)


def test_load_learner_without_new_uses_from_dict_empty(tmp_path):
    s = ProfileStore(
        tmp_path, avatars=AVATARS, learner_from_dict=FakeLearner.from_dict
    )
    p = s.create(name="Maya", avatar="girl_a")
    assert s.load_learner(p.id).data == {}


def test_migration_v1_to_v2(tmp_path):
    for i, (pid, name, created) in enumerate(
        [("pbbbbb", "Ben", 200.0), ("paaaaa", "Ann", 100.0)]
    ):
        d = tmp_path / "profiles" / pid
        d.mkdir(parents=True)
        (d / "profile.json").write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "id": pid,
                    "name": name,
                    "avatar": "girl_a",
                    "birth_year": None,
                    "grade": 1,
                    "language_level": 0,
                    "language_locked": False,
                    "interests": [],
                    "settings": {},
                    "created_at": created,
                }
            ),
            "utf-8",
        )
    s = ProfileStore(tmp_path, avatars=AVATARS)
    profiles = s.list()
    assert [p.name for p in profiles] == ["Ann", "Ben"]
    assert [p.order for p in profiles] == [0, 1]
    s.save(profiles[0])
    data = json.loads(
        (tmp_path / "profiles" / "paaaaa" / "profile.json").read_text("utf-8")
    )
    assert data["schema_version"] == SCHEMA_VERSION


def test_unknown_fields_survive_round_trip(store, tmp_path):
    p = store.create(name="Maya", avatar="girl_a")
    path = tmp_path / "profiles" / p.id / "profile.json"
    data = json.loads(path.read_text("utf-8"))
    data["future_field"] = {"x": 1}
    path.write_text(json.dumps(data), "utf-8")
    q = store.get(p.id)
    store.save(q)
    data = json.loads(path.read_text("utf-8"))
    assert data["future_field"] == {"x": 1}


def test_corrupt_profile_without_backup_is_recovered(store, tmp_path):
    p = store.create(name="Maya", avatar="girl_a")
    path = tmp_path / "profiles" / p.id / "profile.json"
    path.write_text("garbage", "utf-8")
    (path.parent / "profile.json.bak").unlink(missing_ok=True)
    q = store.get(p.id)
    assert q.id == p.id
    assert q.settings.get("recovered") is True
    assert validate_name(q.name) == q.name
    assert list(path.parent.glob("profile.json.corrupt-*"))


def test_corrupt_profile_with_backup(store, tmp_path):
    p = store.create(name="Maya", avatar="girl_a")
    p.grade = 4
    store.save(p)
    path = tmp_path / "profiles" / p.id / "profile.json"
    path.write_text("garbage", "utf-8")
    q = store.get(p.id)
    assert q.name == "Maya"
    assert q.grade == 0  # previous version from the .bak


def test_profile_dataclass_round_trip():
    p = Profile(
        id="pabcde",
        name="Maya",
        avatar="girl_a",
        grade=3,
        interests=["כדורגל"],
        settings={"text_speed": 2},
        created_at=5.0,
    )
    assert Profile.from_dict(p.to_dict()) == p


def test_stray_dirs_are_ignored(store, tmp_path):
    store.create(name="Maya", avatar="girl_a")
    (tmp_path / "profiles" / "junk").mkdir()
    (tmp_path / "profiles" / "file.txt").write_text("x")
    assert len(store.list()) == 1
