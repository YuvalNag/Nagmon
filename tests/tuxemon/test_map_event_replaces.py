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
