# SPDX-License-Identifier: GPL-3.0
"""
The layouts of the solar-system trip's maps (docs/app/TRIPS.md §3).

A layout is small data; ``tools/app/solar_maps.py`` turns it into a Tiled
map. Every zone is 30x20 tiles: a ship (Mila's, 3x3) at the left with
its door (the exit) in front, the spawn below the door, a free
rectangle where the zone's wild animals appear, and two or three people.

Tiles are cells of the new tile sheets (mods/nagmon/gfx/solar): a cell
is ``(row, column)``, counted from 1, on 256 px cells that the build
scales to 64 px. A *piece* is a rectangle of cells (a 2x2 crater, a
3x3 ship) cut into tiles.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from tools.app.solar_texts import TEXTS

WIDTH, HEIGHT = 30, 20

#: Where the things of a zone stand (tile coordinates).
SHIP = (2, 11)  # top-left of the 3x3 ship
EXIT = (3, 14)  # the ship's door: stepping here leaves the zone
SPAWN = (3, 16)
WILD = (14, 4, 25, 11)  # x0, y0, x1, y1 (inclusive)
SPOTS = [(8, 14), (11, 5), (22, 15)]


@dataclass(frozen=True)
class Piece:
    """A rectangle of cells of a sheet, drawn above the ground."""

    sheet: str
    row: int
    col: int
    w: int = 1
    h: int = 1
    #: a tile of the piece blocks the player
    solid: bool = True


@dataclass
class Zone:
    name: str
    #: the sheet of the ground tiles, and its cells
    ground: list[tuple[str, int, int]]
    #: other ground kinds by their character in ``ops``
    kinds: dict[str, list[tuple[str, int, int]]] = field(default_factory=dict)
    #: the wall that frames the map, cycled
    border: list[Piece] = field(default_factory=list)
    #: scattered obstacles and decorations
    rocks: list[Piece] = field(default_factory=list)
    decor: list[Piece] = field(default_factory=list)
    #: (character, piece): placed by ``ops``
    pieces: dict[str, Piece] = field(default_factory=dict)
    #: ("put", ch, x, y) | ("fill", ch, x0, y0, x1, y1)
    ops: list[tuple] = field(default_factory=list)
    #: who stands on each spot: slug of the NPC, facing
    npcs: list[tuple[str, str]] = field(default_factory=list)
    seed: int = 1


SHIP_PIECE = Piece("spaceship", 1, 1, 3, 3)


def _moon() -> Zone:
    return Zone(
        "moon",
        ground=[("moon", r, c) for r in (1, 2) for c in (1, 2, 3, 4)],
        border=[Piece("moon", 3, 3), Piece("moon", 3, 4)],
        rocks=[Piece("moon", 3, 3), Piece("moon", 3, 4)],
        decor=[
            Piece("moon", 3, 1, solid=False),
            Piece("moon", 3, 2, solid=False),
            Piece("moon", 4, 1, solid=False),
        ],
        pieces={
            "C": Piece("moon", 4, 3, 2, 2),
            "P": Piece("moon", 4, 2, solid=False),
        },
        ops=[("put", "C", 19, 14), ("put", "P", 7, 17)],
        npcs=[
            ("nagmon_solar_moon_engineer", "down"),
            ("nagmon_solar_owl", "down"),
        ],
        seed=3,
    )


def _sun() -> Zone:
    return Zone(
        "sun",
        ground=[("sun", 1, c) for c in (1, 2, 3, 4)]
        + [("sun", 2, 1), ("sun", 2, 2)],
        border=[Piece("sun", 3, 1), Piece("sun", 3, 2)],
        rocks=[Piece("sun", 3, 1), Piece("sun", 3, 2), Piece("sun", 2, 3)],
        decor=[],
        pieces={"T": Piece("sun", 3, 3)},
        ops=[("put", "T", 12, 15), ("put", "T", 26, 15)],
        npcs=[
            ("nagmon_solar_owl", "down"),
            ("nagmon_solar_grey_hood", "left"),
        ],
        seed=5,
    )


def _rocky() -> Zone:
    return Zone(
        "rocky_planets",
        ground=[("rocky", 1, c) for c in (1, 2, 3, 4)]
        + [("rocky", 2, 1), ("rocky", 2, 2)],
        kinds={
            ",": [("rocky", 4, 2), ("rocky", 4, 3)],
            ";": [("rocky", 4, 4), ("rocky", 5, 1)],
            "~": [("rocky", 2, 3), ("rocky", 2, 4)],
        },
        border=[
            Piece("rocky", 3, 1),
            Piece("rocky", 3, 2),
            Piece("rocky", 3, 3),
        ],
        rocks=[
            Piece("rocky", 3, 1),
            Piece("rocky", 3, 2),
            Piece("rocky", 3, 3),
        ],
        decor=[],
        pieces={
            "k": Piece("rocky", 3, 4),
            "K": Piece("rocky", 4, 1),
        },
        ops=[
            ("fill", ",", 10, 12, 20, 17),
            ("fill", ";", 21, 12, 28, 17),
            ("fill", "~", 5, 2, 12, 3),
            ("put", "k", 12, 18),
            ("put", "K", 13, 18),
        ],
        npcs=[
            ("nagmon_solar_rover_driver", "right"),
            ("nagmon_solar_sage", "down"),
            ("nagmon_solar_owl", "left"),
        ],
        seed=7,
    )


def _giants() -> Zone:
    return Zone(
        "giants",
        ground=[("giants", 1, c) for c in (1, 2, 3, 4)]
        + [("giants", 2, 1), ("giants", 2, 2)],
        border=[
            Piece("giants", 3, 3),
            Piece("giants", 3, 4),
            Piece("giants", 4, 1),
        ],
        rocks=[
            Piece("giants", 3, 3),
            Piece("giants", 3, 4),
            Piece("giants", 4, 1),
        ],
        decor=[Piece("giants", 4, 2, solid=False)],
        pieces={
            "a": Piece("giants", 2, 3),
            "b": Piece("giants", 2, 4),
            "l": Piece("giants", 3, 1),
            "r": Piece("giants", 3, 2),
        },
        ops=[
            ("put", "a", 9, 8),
            ("put", "b", 9, 9),
            ("put", "l", 27, 14),
            ("put", "r", 27, 15),
        ],
        npcs=[
            ("nagmon_solar_sage", "down"),
            ("nagmon_solar_moon_engineer", "left"),
            ("nagmon_solar_owl", "down"),
        ],
        seed=11,
    )


def _outer() -> Zone:
    return Zone(
        "outer",
        ground=[("outer", r, c) for r in (1, 2) for c in (1, 2, 3, 4)][:6],
        border=[
            Piece("outer", 3, 1),
            Piece("outer", 3, 2),
            Piece("outer", 3, 3),
        ],
        rocks=[
            Piece("outer", 3, 1),
            Piece("outer", 3, 2),
            Piece("outer", 3, 3),
        ],
        decor=[Piece("outer", 3, 4)],
        pieces={"v": Piece("outer", 2, 3), "w": Piece("outer", 2, 4)},
        ops=[("put", "v", 17, 14), ("put", "w", 18, 14)],
        npcs=[
            ("nagmon_solar_grey_hood", "down"),
            ("nagmon_solar_rover_driver", "left"),
            ("nagmon_solar_owl", "down"),
        ],
        seed=13,
    )


ZONES: dict[str, Zone] = {
    z.name: z for z in (_moon(), _sun(), _rocky(), _giants(), _outer())
}

#: The station's doorway x per zone, in the order of the trip.
DOORS = {"moon": 4, "sun": 10, "rocky_planets": 15, "giants": 20, "outer": 25}
STATION_SPAWN = (15, 10)
#: The way back to Hearthrock: a doorway in the station's south wall.
STATION_HOME = (19, 17)
STATION_SPOTS = [(21, 7), (12, 15)]
STATION_NPCS = [
    ("nagmon_solar_astronomer", "left"),
    ("nagmon_solar_mila", "right"),
]

#: What the people say: (zone or "station", npc slug[_part]) -> (Hebrew, English).
#: The texts are in ``solar_texts``: 2-3 true facts a person, and the steps of
#: a mission; the questions come from the quiz.
DIALOGS = TEXTS


def dialog_id(zone: str, npc: str) -> str:
    return f"nagmon_solar_{zone}_{npc.removeprefix('nagmon_solar_')}"


#: Names of the people (msgid = the NPC slug): Hebrew, English.
NPC_NAMES = {
    "nagmon_solar_astronomer": ("האסטרונומית", "The Astronomer"),
    "nagmon_solar_mila": ("מילה", "Mila"),
    "nagmon_solar_owl": ("הינשוף", "The Owl"),
    "nagmon_solar_moon_engineer": ("מהנדסת הירח", "The Moon Engineer"),
    "nagmon_solar_rover_driver": ("נהג הרובר", "The Rover Driver"),
    "nagmon_solar_sage": ("החכם", "The Sage"),
    "nagmon_solar_grey_hood": ("הברדס האפור", "The Grey Hood"),
}
