import json

from nagmon.family import _jsonio


def test_atomic_write_leaves_no_tmp_and_keeps_backup(tmp_path):
    path = tmp_path / "data.json"
    _jsonio.atomic_write_json(path, {"a": 1})
    _jsonio.atomic_write_json(path, {"a": 2})
    assert json.loads(path.read_text("utf-8")) == {"a": 2}
    assert json.loads((tmp_path / "data.json.bak").read_text("utf-8")) == {
        "a": 1
    }
    assert not list(tmp_path.glob("*.tmp"))


def test_atomic_write_keeps_hebrew_readable(tmp_path):
    path = tmp_path / "data.json"
    _jsonio.atomic_write_json(path, {"name": "נועם"})
    assert "נועם" in path.read_text("utf-8")


def test_load_missing_file(tmp_path):
    res = _jsonio.load_json(tmp_path / "nope.json")
    assert res.data is None
    assert res.status == "missing"


def test_load_ok(tmp_path):
    path = tmp_path / "data.json"
    _jsonio.atomic_write_json(path, {"a": 1})
    res = _jsonio.load_json(path)
    assert res.data == {"a": 1}
    assert res.status == "ok"
    assert not res.recovered


def test_corrupt_file_falls_back_to_backup(tmp_path):
    path = tmp_path / "data.json"
    _jsonio.atomic_write_json(path, {"a": 1})
    _jsonio.atomic_write_json(path, {"a": 2})
    path.write_text("{not json", "utf-8")
    res = _jsonio.load_json(path)
    assert res.data == {"a": 1}
    assert res.status == "backup"
    assert res.recovered
    corrupt = list(tmp_path.glob("data.json.corrupt-*"))
    assert len(corrupt) == 1
    assert corrupt[0].read_text("utf-8") == "{not json"


def test_corrupt_file_without_backup_resets(tmp_path):
    path = tmp_path / "data.json"
    path.write_text("\x00\x01garbage", "utf-8")
    res = _jsonio.load_json(path)
    assert res.data is None
    assert res.status == "reset"
    assert res.recovered
    assert not path.exists()
    assert list(tmp_path.glob("data.json.corrupt-*"))


def test_non_object_json_is_treated_as_corrupt(tmp_path):
    path = tmp_path / "data.json"
    path.write_text("[1, 2, 3]", "utf-8")
    res = _jsonio.load_json(path)
    assert res.data is None
    assert res.status == "reset"


def test_two_corruptions_do_not_overwrite_each_other(tmp_path):
    path = tmp_path / "data.json"
    path.write_text("bad1", "utf-8")
    _jsonio.load_json(path)
    path.write_text("bad2", "utf-8")
    _jsonio.load_json(path)
    assert len(list(tmp_path.glob("data.json.corrupt-*"))) == 2
