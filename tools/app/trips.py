# SPDX-License-Identifier: GPL-3.0
"""Trips: ``mods/nagmon/trips/*.yaml`` as ``game/trips/<name>.json``.

The shape of a trip file is documented in
``app/src/core/game/trips.ts``. With no trip files nothing is written,
and the app plays without a trip.
"""

from __future__ import annotations

from typing import Any

from tools.app.common import NAG, Output
from tools.app.content import read_yaml

TRIPS = NAG / "trips"


def build(out: Output) -> dict[str, Any]:
    names = []
    for path in sorted(TRIPS.glob("*.yaml")) if TRIPS.is_dir() else []:
        doc = read_yaml(path)
        if not isinstance(doc, dict) or not isinstance(doc.get("zones"), list):
            raise ValueError(f"{path.name}: a trip needs a list of zones")
        out.add_json(f"trips/{path.stem}.json", doc, compact=True)
        names.append(path.stem)
    return {"trips": names}
