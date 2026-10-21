"""The data of the new battle (docs/app/BATTLE_V3.md): moves, statuses,
intents, gifts, the 70 species, the encounters and the items around them.

Table-driven from the same YAML the build ships, and checked against the
numbers the spec prints (sections 3, 4, 5.1, 5.7, 7.2, 8.4).
"""

from __future__ import annotations

import copy
import json
import re
from pathlib import Path

import pytest

from tools.app import economy, moves
from tools.app.content import read_yaml

REPO = Path(__file__).resolve().parents[2]

#: Names of other games and companies that must not appear in ours
#: (BATTLE_V3 1.5). Matched as whole words or phrases, lower case.
DENYLIST = (
    "pokemon",
    "pokémon",
    "poke ball",
    "pokeball",
    "pokedex",
    "nintendo",
    "game freak",
    "pikachu",
    "charmander",
    "charizard",
    "bulbasaur",
    "squirtle",
    "eevee",
    "mewtwo",
    "snorlax",
    "jigglypuff",
    "magikarp",
    "master ball",
    "great ball",
    "ultra ball",
    "rare candy",
    "full restore",
    "max potion",
    "super potion",
    "hyper potion",
    "max revive",
    "revive",
    "full heal",
    "thunderbolt",
    "flamethrower",
    "hyper beam",
    "tackle",
    "ember",
    "splash",
    "frost breath",
    "digimon",
    "tuxemon",
    "temtem",
    "dragon quest",
    "yo-kai",
    "elixir",
)


@pytest.fixture(scope="module")
def d():
    return moves.load()


def by_id(rows):
    return {r["id"]: r for r in rows}


def phrase_in(text: str, phrase: str) -> bool:
    text = re.sub(r"[_\-]+", " ", text.lower())
    return (
        re.search(rf"(?<![a-zé]){re.escape(phrase)}(?![a-zé])", text)
        is not None
    )


# ------------------------------------------------------------------ moves
def test_fifty_moves_in_the_spec_s_split(d):
    assert len(d["moves"]) == 50
    per: dict[str, int] = {}
    for m in d["moves"]:
        per[m["subject"]] = per.get(m["subject"], 0) + 1
    assert per == {
        "math": 8,
        "geometry": 8,
        "science": 8,
        "english": 9,
        "hebrew": 8,
        "logic": 8,
        "any": 1,
    }
    assert [m["n"] for m in d["moves"]] == list(range(1, 51))


def test_the_numbers_of_the_spec_s_move_table(d):
    mv = by_id(d["moves"])
    assert (mv["sum_spark"]["power"], mv["sum_spark"]["charges"]) == (60, 10)
    assert mv["number_nudge"]["unlock_level"] == 1
    assert mv["add_it_up"]["unlock_level"] == 4
    assert mv["total"]["unlock_level"] == 7
    assert mv["times_twister"]["power"] == 85
    assert mv["double_time"]["priority"] == 1
    assert mv["little_wiggle"]["power"] == 25
    assert mv["little_wiggle"]["charges"] is None
    assert mv["little_wiggle"]["question"] == "none"
    assert mv["echo"]["question"] == "none"
    for m in d["moves"]:
        if m["tier"] == "F":
            assert (m["hits"], m["power"], m["spark_cost"]) == (3, 70, 4)
            assert m["unlock_level"] == 6
    finishers = [m["id"] for m in d["moves"] if m["tier"] == "K"]
    assert finishers == ["total"]


def test_the_spec_s_hebrew_names_are_kept(d):
    mv = by_id(d["moves"])
    assert mv["number_nudge"]["he"] == "דחיפת מספר"
    assert mv["total"]["he"] == "סך הכול"
    assert mv["little_wiggle"]["he"] == "ריקוד קטן"
    assert mv["lullaby"]["he"] == "שיר ערש"
    assert mv["grand_puzzle"]["he"] == "חידת הענק"


def test_every_status_a_move_names_exists_and_utilities_have_a_wrong_version(
    d,
):
    st = {s["id"] for s in d["statuses"]}
    for m in d["moves"]:
        for key in ("effects", "wrong", "last_hit"):
            for fx in m.get(key, []):
                if fx["type"] == "status":
                    assert fx["status"] in st, m["id"]
        if m["tier"] == "U" and m["id"] != "echo":
            assert m["wrong"], m["id"]


def test_chain_starters_mark_their_own_subject(d):
    for m in d["moves"]:
        if m["tier"] == "C":
            mark = next(e for e in m["effects"] if e["type"] == "mark")
            assert mark["subject"] == m["subject"]
            assert mark["rounds"] == 2


@pytest.mark.parametrize(
    "change",
    [
        lambda doc: doc["moves"].pop(),
        lambda doc: doc["moves"][1].update(id=doc["moves"][0]["id"]),
        lambda doc: doc["moves"][0].update(tier="Z"),
        lambda doc: doc["moves"][0].update(subject="art"),
        lambda doc: doc["moves"][0].update(he="x"),
        lambda doc: doc["moves"][0].update(he="הרג"),
        lambda doc: doc["moves"][0].update(desc_he="x" * 60),
        lambda doc: doc["moves"][1]["effects"].append(
            {"type": "status", "status": "ghost", "chance": 0.5}
        ),
        lambda doc: doc["moves"][1]["effects"].append({"type": "teleport"}),
        lambda doc: doc["moves"][7].update(hits=1),
        lambda doc: doc["moves"][0].update(charges=3),
        lambda doc: doc["moves"][6].pop("wrong"),
        lambda doc: doc["moves"][0].update(en="Kill Bill"),
    ],
)
def test_a_typo_in_the_moves_stops_the_build(change, d):
    doc = copy.deepcopy(read_yaml(moves.MOVES))
    change(doc)
    rules = read_yaml(moves.RULES)
    statuses = {s["id"] for s in d["statuses"]}
    with pytest.raises(ValueError):
        moves.check_moves(doc, statuses, rules)


# ------------------------------------------------- statuses, intents, gifts
def test_fourteen_statuses_with_icons_colours_and_shapes(d):
    rows = d["statuses"]
    assert [s["he"] for s in rows][:3] == ["מנומנם", "סחרחר", "איטי"]
    assert len(rows) == 14
    assert len({s["icon"] for s in rows}) == 14
    assert (
        len({s["shape"] for s in rows}) == 14
    )  # a shape for each, not colour alone
    boss = {s["id"] for s in rows if s.get("boss_immune_rounds")}
    assert boss == {"drowsy", "dizzy", "slow"}
    assert {s["group"] for s in rows if s["id"] in ("drowsy", "dizzy")} == {
        "sleepy_or_dizzy"
    }


def test_nine_intents_and_five_temperaments_that_add_up(d):
    assert [i["id"] for i in d["intents"]][0] == "fog_puff"
    assert len(d["intents"]) == 9
    ids = {i["id"] for i in d["intents"]}
    assert [t["id"] for t in d["temperaments"]] == list(moves.TEMPERAMENTS)
    for t in d["temperaments"]:
        assert sum(t["weights"].values()) == 100
        assert set(t["weights"]) <= ids
    grumpy = by_id(d["temperaments"])["grumpy"]["weights"]
    assert grumpy["fog_puff"] == 50 and grumpy["big_puff"] == 20
    assert (
        by_id(d["intents"])["drowsy_mist"]["band_a_replace"] == "silly_dance"
    )


def test_eight_gifts_and_brave_heart_is_band_a_s_default(d):
    assert len(d["gifts"]) == 8
    brave = by_id(d["gifts"])["brave_heart"]
    assert brave["default_for_bands"] == ["A"]
    used = {f["gift"] for f in d["families"].values()}
    assert used <= {g["id"] for g in d["gifts"]}
    assert len(used) >= 6


# ------------------------------------------------------------------ stats
def test_the_fog_numbers_of_section_5_1(d):
    r = d["rules"]
    assert [
        moves.fog(lv, "wild", "B", "normal", r) for lv in (3, 5, 10, 15, 18)
    ] == [
        64,
        74,
        100,
        124,
        140,
    ]


def test_the_starters_stat_table_of_section_5_7(d):
    r = d["rules"]
    fams = d["families"]
    spec = {
        "heliobud": [
            (0, 6, [40, 38, 28, 35]),
            (0, 10, [50, 49, 36, 45]),
            (1, 14, [72, 72, 52, 66]),
            (1, 20, [90, 92, 67, 84]),
            (2, 24, [123, 127, 92, 116]),
        ],
        "terrabub": [
            (0, 6, [44, 28, 38, 28]),
            (0, 10, [55, 36, 49, 36]),
            (1, 14, [79, 52, 72, 52]),
            (1, 20, [99, 67, 92, 67]),
            (2, 24, [135, 92, 127, 92]),
        ],
        "lunibble": [
            (0, 6, [40, 31, 31, 38]),
            (0, 10, [50, 40, 40, 49]),
            (1, 14, [72, 59, 59, 72]),
            (1, 20, [90, 75, 75, 92]),
            (2, 24, [123, 104, 104, 127]),
        ],
    }
    for fam, rows in spec.items():
        for stage, level, want in rows:
            assert moves.stats(fams[fam]["bases"], stage, level, r) == want, (
                fam,
                level,
            )


def test_pep_of_a_basic_creature_with_base_ten(d):
    r = d["rules"]
    pep = lambda lv, st=0: moves.stats([10, 10, 10, 10], st, lv, r)[0]  # noqa: E731
    assert [pep(5), pep(10), pep(15), pep(20)] == [37, 50, 62, 75]
    assert pep(20, 2) == 108


def test_the_wheel_of_section_2_3(d):
    w = d["rules"]["wheel"]
    assert w == ["math", "logic", "geometry", "science", "english", "hebrew"]
    assert moves.wheel_weak("logic", w) == "math"  # math beats logic
    assert moves.wheel_weak("math", w) == "hebrew"  # hebrew beats math


# --------------------------------------------------------------- families
def test_twenty_five_families_cover_seventy_species(d):
    assert len(d["families"]) == 25
    assert len(d["species"]) == 70
    zone_species = {s for z in d["trip"]["zones"] for s in z["monsters"]}
    assert set(d["species"]) == zone_species
    stages = [s["stage"] for s in d["species"].values()]
    assert stages.count(0) == 25


def test_the_family_table_of_section_5_7(d):
    f = d["families"]
    assert f["heliobud"]["subject"] == "math" and f["heliobud"]["bases"] == [
        10,
        11,
        8,
        10,
    ]
    assert f["mercurip"]["weak"] == ["geometry", "hebrew"]
    assert f["probip"]["catch_rate"] == 130
    assert f["ringlet"]["temperament"] == "proud"
    assert f["terrabub"]["weak"] == ["logic", "science"]
    for fam in f.values():
        assert fam["weak"][0] == moves.wheel_weak(
            fam["subject"], d["rules"]["wheel"]
        )


def test_stage_one_and_two_forms_inherit_and_have_the_spec_catch_rates(d):
    sp = d["species"]
    assert sp["heliolynx"]["catch_rate"] == 150
    assert sp["heliarch"]["catch_rate"] == 100
    assert sp["heliarch"]["stage_mult"] == 1.45
    assert sp["heliarch"]["subject"] == sp["heliobud"]["subject"]
    assert sp["heliobud"]["evolves_to"] == "heliolynx"


def test_every_species_has_four_real_moves_by_level_ten(d):
    mv = by_id(d["moves"])
    for slug, s in d["species"].items():
        ids = s["equipped"]["10"]
        assert len(ids) == 4 and "little_wiggle" not in ids, slug
        assert len(set(ids)) == 4, slug
        for mid in s["equipped"]["10"]:
            assert mid in mv
            assert mv[mid]["unlock_level"] <= 12
        assert s["equipped"]["1"][:2] != ["little_wiggle"] * 2, slug
        # a starter begins with its two level 1 attacks and shows the Wiggle
        assert s["equipped"]["1"][2:] == ["little_wiggle", "little_wiggle"], (
            slug
        )


def test_every_move_a_species_learns_exists_and_levels_are_sorted(d):
    mv = by_id(d["moves"])
    for slug, s in d["species"].items():
        levels = [r["level"] for r in s["learnset"]]
        assert levels == sorted(levels), slug
        for r in s["learnset"]:
            assert r["move"] in mv, (slug, r)
        assert s["finale"] in {m["id"] for m in d["moves"] if m["tier"] == "F"}
        own = [r for r in s["learnset"] if r["from"] == "home"]
        assert len(own) >= 6, slug


def test_the_spec_s_example_loadout_of_heliobud_at_level_ten(d):
    assert d["species"]["heliobud"]["equipped"]["10"] == [
        "sum_spark",
        "add_it_up",
        "total",
        "times_twister",
    ]


def test_signatures_swap_one_move_for_another_subjects_of_the_same_tier(d):
    mv = by_id(d["moves"])
    swapped = [f for f in d["families"].values() if f["signature"]]
    assert len(swapped) == 22  # the three starters learn theirs from a lesson
    for fid, f in d["families"].items():
        if f["signature"]:
            old, new = (
                mv[f["signature"]["replace"]],
                mv[f["signature"]["with"]],
            )
            assert (
                old["tier"] == new["tier"] and new["subject"] != f["subject"]
            )
            learned = [
                r
                for r in d["species"][fid]["learnset"]
                if r["from"] == "signature"
            ]
            assert [(r["move"], r["level"]) for r in learned] == [
                (new["id"], old["unlock_level"])
            ]
    for starter in ("heliobud", "terrabub", "lunibble"):
        assert d["families"][starter]["signature"] is None


def test_evolution_gates_follow_section_7_1(d):
    sp = d["species"]
    e0 = sp["heliobud"]["evolve"]
    assert (e0["level"], e0["know_how"], e0["stars"], e0["hearts"]) == (
        12,
        40,
        2,
        2,
    )
    assert e0["lesson"] == "solar_system" and e0["place"] is None
    e1 = sp["heliolynx"]["evolve"]
    assert (e1["level"], e1["know_how"], e1["stars"], e1["hearts"]) == (
        24,
        120,
        6,
        4,
    )
    assert e1["place"] == "sun"
    assert sp["lunibble"]["evolve"]["lesson"] == "moon"
    assert sp["heliarch"]["evolve"] is None
    assert sp["mercurip"]["evolve"]["lesson"] is None


def test_the_subjects_yaml_matches_the_families(d):
    subjects = read_yaml(moves.NAG / "learning" / "subjects.yaml")["subjects"]
    for sub, rec in subjects.items():
        listed = set(rec.get("monsters", []))
        mine = {s for s, v in d["species"].items() if v["subject"] == sub}
        assert mine <= listed, sub
        # nothing of the chapter is listed under another subject
        assert not (listed & set(d["species"])) - mine, sub


# ------------------------------------------------------------- encounters
def test_wild_fights_are_spread_over_the_subjects(d):
    for zid, table in d["tables"].items():
        share = table["subject_share"]
        assert max(share.values()) <= 0.5, zid
        if zid != "moon":  # the first zone teaches the wheel with two subjects
            assert len(share) >= 3, zid
    assert d["tables"]["route1"]["subject_share"]["science"] <= 0.4
    assert len(d["tables"]["route1"]["subject_share"]) == 6
    assert len(d["tables"]["outer"]["subject_share"]) == 6
    assert len(d["tables"]["giants"]["subject_share"]) == 6


def test_wild_levels_match_the_zones_and_route_one(d):
    assert d["tables"]["route1"]["levels"] == [3, 8]
    wanted = {
        "moon": [3, 6],
        "sun": [4, 7],
        "rocky_planets": [6, 9],
        "giants": [9, 12],
        "outer": [12, 15],
    }
    for zid, lv in wanted.items():
        assert d["tables"][zid]["levels"] == lv


def test_guardians_and_the_master_follow_sections_5_5_and_5_6(d):
    g = d["encounters"]["guardians"]
    assert [(x["species"], x["level_floor"]) for x in g] == [
        ("lunwarden", 7),
        ("heliarch", 8),
        ("marstrix", 10),
        ("ringwarden", 13),
        ("nepstorm", 16),
    ]
    m = d["encounters"]["master"]
    assert (m["species"], m["level_floor"]) == ("jovigale", 18)
    assert d["trip"]["master"]["level"] == 18
    for x in g:
        assert x["phases"] and len(x["phases"]) == 3
        assert x["fog_at_floor"]["B"] > 0
    assert (
        d["encounters"]["master"]["fog_at_floor"]["B"]
        > g[-1]["fog_at_floor"]["B"]
    )
    final = m["phases"][2]["final_windup"]
    assert final["power"] == 80


def test_guardian_fog_is_the_pacing_number(d):
    r = d["rules"]
    # guardian 3.6, master 4.2, band B, normal length
    assert moves.fog(14, "guardian", "B", "normal", r) == 3 * 0 + int(
        int(10 * 24 / 4) * 3.6
    )
    assert moves.fog(18, "master", "B", "normal", r) == int(
        int(10 * 28 / 4) * 4.2
    )


# ------------------------------------------------------------------ items
def test_medicine_wakes_dozing_friends_only_where_the_parent_allows(d):
    items = by_id(read_yaml(economy.SOURCE)["items"])
    med = {i: v for i, v in items.items() if v["kind"] == "medicine"}
    assert {
        "dew_drop",
        "spring_tonic",
        "sunny_syrup",
        "fresh_mint",
        "all_better",
        "wake_berry",
        "sunrise_berry",
        "energy_berry",
    } == set(med)
    wake = {i for i, v in med.items() if v["heals_dozing"]}
    assert wake == {"wake_berry", "sunrise_berry"}
    assert (
        med["wake_berry"]["heal_share"] == 0.5
        and med["wake_berry"]["price"] == 25
    )
    assert med["sunrise_berry"]["heal_share"] == 1.0
    # tiers rise in price and strength
    tiers = [med[k] for k in ("dew_drop", "spring_tonic", "sunny_syrup")]
    assert [t["price"] for t in tiers] == sorted(t["price"] for t in tiers)
    assert [t["heal_share"] for t in tiers] == sorted(
        t["heal_share"] for t in tiers
    )
    assert d["rules"]["dozing"]["wakes_at_battle_end"] is False
    assert d["rules"]["dozing"]["heal_only_with"] == ["medicine", "nurse"]


def test_befriend_tools_follow_section_8_4():
    items = by_id(read_yaml(economy.SOURCE)["items"])
    assert (
        items["magic_net"]["tool_mult"] == 1.0
        and items["magic_net"]["price"] == 30
    )
    assert (
        items["silver_net"]["tool_mult"] == 1.5
        and items["silver_net"]["price"] == 90
    )
    assert (
        items["star_net"]["tool_mult"] == 2.2
        and items["star_net"].get("sold") is False
    )
    assert items["star_net"]["first_shake_never_fails"] is True
    assert (
        items["berry"]["treat_mult"],
        items["biscuit"]["treat_mult"],
        items["pie"]["treat_mult"],
    ) == (1.2, 1.4, 1.6)
    subject = [i for i in items.values() if i["id"].startswith("friend_card_")]
    zone = [
        i for i in items.values() if i["id"].startswith("zone_friend_card_")
    ]
    assert len(subject) == 6 and len(zone) == 5
    assert {i["tool_mult"] for i in subject} == {2.0} and {
        i["price"] for i in subject
    } == {45}
    assert {i["tool_mult"] for i in zone} == {1.8} and {
        i["price"] for i in zone
    } == {60}
    assert {i["scope_id"] for i in subject} == set(moves.SUBJECTS)


def test_evolution_cards_follow_section_7_2():
    items = by_id(read_yaml(economy.SOURCE)["items"])
    zone = [i for i in items.values() if i["id"].startswith("zone_card_")]
    subject = [
        i for i in items.values() if i["id"].startswith("subject_card_")
    ]
    assert len(zone) == 5 and {i["price"] for i in zone} == {120}
    assert len(subject) == 6 and {i["price"] for i in subject} == {200}
    assert (
        items["bright_card"]["price"] == 450
        and items["bright_card"]["from_stage"] == 1
    )
    assert (
        items["rainbow_card"].get("sold") is False
        and items["rainbow_card"]["min_level"] == 8
    )
    assert {i["scope_id"] for i in zone} == {
        z["id"] for z in read_yaml(moves.TRIP)["zones"]
    }


def test_every_shelf_holds_at_most_six_and_old_items_keep_their_shelves():
    doc = read_yaml(economy.SOURCE)
    counts: dict[str, int] = {}
    for item in doc["items"]:
        shelf = economy.shelf_of(item)
        if shelf:
            counts[shelf] = counts.get(shelf, 0) + 1
    assert max(counts.values()) <= 6
    assert set(counts) <= set(doc["shelves"])
    items = by_id(doc["items"])
    assert economy.shelf_of(items["magic_net"]) == "nets"
    assert economy.shelf_of(items["growth_tonic"]) == "snacks"
    assert economy.shelf_of(items["clover"]) == "helpers"
    assert economy.shelf_of(items["mystery_egg"]) is None
    assert economy.shelf_of(items["star_net"]) is None
    assert economy.shelf_of(items["wake_berry"]) == "medicine"


@pytest.mark.parametrize(
    "change",
    [
        lambda i: i["dew_drop"].update(heals_dozing=True),
        lambda i: i["wake_berry"].update(heals_dozing=False),
        lambda i: i["dew_drop"].update(effect="explode"),
        lambda i: i["dew_drop"].update(heal_share=0),
        lambda i: i["star_net"].update(tool_mult=9),
        lambda i: i["friend_card_math"].pop("scope_id"),
        lambda i: i["zone_card_moon"].update(card="gold"),
        lambda i: i["zone_card_moon"].update(sold_after="whenever"),
        lambda i: i["dew_drop"].update(shelf="vault"),
        lambda i: i["dew_drop"].update(name_he="הרג"),
        lambda i: i["zone_card_moon"].update(price=0),
    ],
)
def test_a_mistake_in_the_new_items_stops_the_build(change):
    doc = copy.deepcopy(read_yaml(economy.SOURCE))
    change(by_id(doc["items"]))
    with pytest.raises(ValueError):
        economy.check(doc)


def test_the_new_items_have_their_names_in_the_apps_text_table():
    ts = (REPO / "app" / "src" / "i18n.ts").read_text(encoding="utf-8")
    for item in read_yaml(economy.SOURCE)["items"]:
        if item["kind"] in ("medicine", "befriend_tool", "evolution_card"):
            assert f'item_{item["id"]}_name: "{item["name_he"]}"' in ts, item[
                "id"
            ]
            assert f'item_{item["id"]}_desc: "{item["desc_he"]}"' in ts, item[
                "id"
            ]


# ----------------------------------------------- names, tone, third parties
def all_names(d) -> list[tuple[str, str]]:
    names: list[tuple[str, str]] = []
    for key in ("moves", "statuses", "intents", "gifts", "temperaments"):
        for r in d[key]:
            names += [
                (f"{key}.{r['id']}", r["id"]),
                (f"{key}.{r['id']}", r["en"]),
                (f"{key}.{r['id']}", r["he"]),
            ]
    for slug in d["species"]:
        names.append((f"species.{slug}", slug))
    for item in read_yaml(economy.SOURCE)["items"]:
        names += [
            (f"item.{item['id']}", item["id"]),
            (f"item.{item['id']}", item.get("name_en", "")),
        ]
    for g in d["encounters"]["guardians"]:
        names.append((f"guardian.{g['zone']}", g["title_en"]))
    return names


def test_no_third_party_names_in_moves_statuses_creatures_or_items(d):
    for where, name in all_names(d):
        for term in DENYLIST:
            assert not phrase_in(name, term), (where, name, term)


def test_the_denylist_does_catch_a_copied_name():
    assert phrase_in("Frost Breath", "frost breath")
    assert phrase_in("pokeball_2", "pokeball")
    assert phrase_in("Great Ball", "great ball")
    assert not phrase_in("Snowflake Breeze", "frost breath")
    assert not phrase_in("Splashy Day", "splash")


def test_child_facing_hebrew_is_short_kind_and_in_hebrew(d):
    texts: list[tuple[str, str, int]] = []
    for key in ("moves", "statuses", "intents", "gifts", "temperaments"):
        for r in d[key]:
            texts.append((r["id"], r["he"], moves.NAME_MAX))
            if "desc_he" in r:
                texts.append((r["id"], r["desc_he"], moves.DESC_MAX))
    for item in read_yaml(economy.SOURCE)["items"]:
        if "name_he" in item:
            texts += [
                (item["id"], item["name_he"], moves.NAME_MAX),
                (item["id"], item["desc_he"], moves.DESC_MAX),
            ]
    for g in d["encounters"]["guardians"]:
        texts.append((g["zone"], g["title_he"], moves.NAME_MAX))
    assert len(texts) > 150
    for where, text, limit in texts:
        moves.check_text(where, text, limit=limit)
        for word in moves.VIOLENCE_HE:
            assert word not in re.findall(r"[א-ת]+", text), (where, text)


def test_no_english_violence_in_names(d):
    for key in ("moves", "statuses", "intents", "gifts"):
        for r in d[key]:
            moves.check_english(r["id"], r["en"])
    assert {w for w in moves.VIOLENCE_EN} >= {
        "kill",
        "blood",
        "weapon",
        "faint",
    }


def test_the_two_names_that_collided_with_other_games_were_changed(d):
    mv = by_id(d["moves"])
    assert (
        mv["water_plink"]["he"] == "התזת מים"
    )  # the Hebrew name of the spec stays
    assert mv["snowflake_breeze"]["he"] == "נשימת קרח"
    assert "splash" not in mv and "frost_breath" not in mv


# ------------------------------------------------------------------ build
def test_the_build_writes_the_seven_files(built):
    out, report = built
    for name in (
        "moves.json",
        "statuses.json",
        "intents.json",
        "gifts.json",
        "species_battle.json",
        "battle_encounters.json",
        "battle_rules.json",
    ):
        assert name in out.paths(), name
    assert report["battle"] == {
        "moves": 50,
        "statuses": 14,
        "intents": 9,
        "gifts": 8,
        "species": 70,
        "families": 25,
    }
    data = json.loads(out.data["species_battle.json"])
    assert len(data["species"]) == 70
    assert (
        json.loads(out.data["moves.json"])["moves"][0]["id"] == "number_nudge"
    )
