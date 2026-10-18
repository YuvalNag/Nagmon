import json

import pytest

from nagmon.family.owl_log import MAX_ENTRIES, OwlLog


@pytest.fixture
def log(tmp_path):
    (tmp_path / "profiles" / "p1").mkdir(parents=True)
    t = iter(range(1, 100_000))
    return OwlLog(tmp_path, clock=lambda: float(next(t)))


def test_append_and_read(log, tmp_path):
    log.append("p1", "child", "למה השמיים כחולים?")
    log.append("p1", "owl", "שאלה מצוינת!", meta={"provider": "x"})
    entries = log.read("p1")
    assert [e.role for e in entries] == ["child", "owl"]
    assert entries[0].text == "למה השמיים כחולים?"
    assert entries[1].meta == {"provider": "x"}
    assert entries[0].ts < entries[1].ts
    path = tmp_path / "profiles" / "p1" / "owl_log.jsonl"
    lines = path.read_text("utf-8").splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0])["text"] == "למה השמיים כחולים?"


def test_read_limit_returns_latest(log):
    for i in range(10):
        log.append("p1", "child", f"q{i}")
    assert [e.text for e in log.read("p1", limit=3)] == ["q7", "q8", "q9"]


def test_retention(log):
    assert MAX_ENTRIES == 500
    for i in range(MAX_ENTRIES + 20):
        log.append("p1", "child", f"q{i}")
    entries = log.read("p1")
    assert len(entries) == MAX_ENTRIES
    assert entries[0].text == "q20"
    assert entries[-1].text == f"q{MAX_ENTRIES + 19}"


def test_bad_role_and_unknown_profile(log):
    with pytest.raises(ValueError):
        log.append("p1", "hacker", "x")
    with pytest.raises(KeyError):
        log.append("p9", "child", "x")
    with pytest.raises(KeyError):
        log.append("../p1", "child", "x")
    assert log.read("p9") == []


def test_corrupt_lines_are_skipped(log, tmp_path):
    log.append("p1", "child", "a")
    path = tmp_path / "profiles" / "p1" / "owl_log.jsonl"
    with path.open("a", encoding="utf-8") as f:
        f.write("{broken\n")
    log.append("p1", "owl", "b")
    assert [e.text for e in log.read("p1")] == ["a", "b"]


def test_no_mutation_api(log):
    assert not hasattr(log, "delete")
    assert not hasattr(log, "edit")
