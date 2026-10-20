"""The trips build step: a trip file becomes JSON; no files, nothing."""

from __future__ import annotations

import pytest

from tools.app import trips
from tools.app.common import Output


def test_no_trip_files_write_nothing(tmp_path, monkeypatch):
    monkeypatch.setattr(trips, "TRIPS", tmp_path / "none")
    out = Output()
    assert trips.build(out) == {"trips": []}
    assert not [p for p in out.paths() if str(p).startswith("trips/")]


def test_a_trip_file_becomes_json(tmp_path, monkeypatch):
    (tmp_path / "solar.yaml").write_text(
        "id: solar\nzones:\n- id: moon\n  map: space_moon\n", encoding="utf-8"
    )
    monkeypatch.setattr(trips, "TRIPS", tmp_path)
    out = Output()
    assert trips.build(out) == {"trips": ["solar"]}
    assert "trips/solar.json" in {str(p) for p in out.paths()}


def test_a_file_without_zones_stops_the_build(tmp_path, monkeypatch):
    (tmp_path / "bad.yaml").write_text("id: x\n", encoding="utf-8")
    monkeypatch.setattr(trips, "TRIPS", tmp_path)
    with pytest.raises(ValueError):
        trips.build(Output())
