# SPDX-License-Identifier: GPL-3.0
"""A mod's map script may replace a TMX event by name (SDD_ART §2.3)."""

from __future__ import annotations

from types import SimpleNamespace

from tuxemon.map.loader import MapLoader


class FakeMap:
    def __init__(self, names):
        self._events = [SimpleNamespace(name=n) for n in names]
        self.inits = []
        self.collision_map = {}

    @property
    def events(self):
        return self._events

    def remove_event(self, event):
        self._events.remove(event)

    def add_events(self, events):
        self._events.extend(events)

    def add_inits(self, inits):
        self.inits.extend(inits)


def test_an_event_with_replaces_takes_the_tmx_events_place(tmp_path):
    script = tmp_path / "route.yaml"
    script.write_text(
        "events:\n"
        "  Our Encounters:\n"
        "    type: event\n"
        "    replaces: Random Encounters 1\n"
        "    x: 2\n"
        "    y: 5\n"
        "    actions:\n"
        "    - random_encounter ours,11\n"
        "    conditions:\n"
        "    - is char_at player\n"
    )
    txmn_map = FakeMap(
        ["Random Encounters 1", "Random Encounters 2", "Teleport"]
    )
    MapLoader(context=None).process_and_merge_events(txmn_map, [script])
    names = [e.name for e in txmn_map.events]
    assert names == ["Random Encounters 2", "Teleport", "Our Encounters"]


def test_without_replaces_events_are_only_added(tmp_path):
    script = tmp_path / "route.yaml"
    script.write_text(
        "events:\n"
        "  Random Encounters 1:\n"
        "    type: event\n"
        "    actions:\n"
        "    - random_encounter ours,11\n"
    )
    txmn_map = FakeMap(["Random Encounters 1"])
    MapLoader(context=None).process_and_merge_events(txmn_map, [script])
    assert [e.name for e in txmn_map.events] == ["Random Encounters 1"] * 2


def _merge(tmp_path, text, names=("Random Encounters 1", "Teleport")):
    script = tmp_path / "route.yaml"
    script.write_text(text)
    txmn_map = FakeMap(list(names))
    MapLoader(context=None).process_and_merge_events(txmn_map, [script])
    return [e.name for e in txmn_map.events]


def test_a_malformed_script_is_logged_and_the_map_still_loads(tmp_path):
    for text in (
        "events:\n- replaces: Random Encounters 1\n",  # events is a list
        "- events: {}\n",  # the whole file is a list
        "events: [\n",  # not YAML
    ):
        assert _merge(tmp_path, text) == ["Random Encounters 1", "Teleport"]


def test_the_tmx_event_stays_when_its_replacement_did_not_build(tmp_path):
    names = _merge(
        tmp_path,
        "events:\n"
        "  Our Encounters:\n"
        "    type: event\n"
        "    replaces: Random Encounters 1\n"
        "    width: 0\n"  # an invalid box: the event is not built
        "    actions:\n"
        "    - random_encounter ours,11\n",
    )
    assert names == ["Random Encounters 1", "Teleport"]


def test_a_replaces_that_matches_nothing_is_a_warning(tmp_path, caplog):
    with caplog.at_level("WARNING"):
        names = _merge(
            tmp_path,
            "events:\n"
            "  Our Encounters:\n"
            "    type: event\n"
            "    replaces: Random Encounters 9\n"
            "    actions:\n"
            "    - random_encounter ours,11\n",
        )
    assert names == ["Random Encounters 1", "Teleport", "Our Encounters"]
    assert any("Random Encounters 9" in r.getMessage() for r in caplog.records)
