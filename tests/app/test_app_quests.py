"""The quests' build step (slice W3 of docs/app/WORLD_V2.md): the data is checked, then shipped."""

from __future__ import annotations

import copy
import json
import re

import pytest

from tools.app import quests
from tools.app.common import NAG, REPO, Output
from tools.app.content import read_yaml


def ctx():
    return quests._context()


def raw():
    return copy.deepcopy(quests.load_quests())


def test_the_shipped_quests_are_valid_and_built():
    out = Output()
    summary = quests.build(out)
    assert summary["quests"] >= 12
    doc = json.loads(out.data["quests.json"])
    assert set(doc) == {"rules", "quests"}
    assert "solar_missions" not in doc["rules"]


def test_the_first_chapter_has_the_quests_the_slice_names():
    # WORLD_V2.md 10: quests 1 to 9, 11, 13 and 14 of the catalogue (17 needs the Town Fund of W4)
    assert {
        "q_kitten_home",
        "q_wallet",
        "q_baker_double",
        "q_berry_basket",
        "q_mail_round",
        "q_tom_swap",
        "q_lost_found",
        "q_clock_set",
        "q_shelf_sort",
        "q_chess_riddles",
        "q_board_fix",
        "q_mint_run",
    } <= set(quests.load_quests())


def test_quests_come_from_many_people():
    givers = {q["giver"] for q in quests.load_quests().values()}
    assert len(givers) >= 9


def test_a_step_uses_only_actions_the_interpreter_already_has():
    # the interpreter's own list (app/src/core/world/events.ts ACTIONS): a quest needs no new engine action
    text = (REPO / "app/src/core/world/events.ts").read_text(encoding="utf-8")
    block = text[text.index("export const ACTIONS") :]
    block = block[: block.index("]);")]
    known = set(re.findall(r'"([a-z_]+)"', block))
    assert set(quests.STEP_ACTIONS) <= known
    for q in quests.load_quests().values():
        for s in q["steps"]:
            for a in (s.get("enter") or []) + (s.get("done") or []):
                assert a.split()[0] in known, (q["id"], a)


def test_the_rewards_are_in_the_rules_not_in_the_code():
    rules = quests.load_rules()
    doc = quests.check_all(quests.load_quests(), ctx())
    scale = set(rules["scale"].values())
    # a quest written with a scale word comes out as the number of the rules
    assert doc["q_wallet"]["reward"]["coins"] == rules["scale"]["S"]
    assert doc["q_kitten_home"]["reward"]["coins"] == rules["scale"]["M"]
    assert scale == {10, 20, 30, 50, 80}


def test_solar_missions_pay_the_raised_coins_of_the_rules():
    from tools.app import solar_texts

    assert solar_texts.MISSION_COINS == quests.load_rules()["solar_missions"]
    assert list(solar_texts.MISSION_COINS.values()) == [25, 30, 40, 50, 60]


def test_a_kindness_quest_pays_the_same_whatever_is_chosen():
    doc = quests.check_all(quests.load_quests(), ctx())
    wallet = doc["q_wallet"]
    assert wallet["sel"] is True
    choose = [s for s in wallet["steps"] if s["kind"] == "choose"]
    assert choose and all("correct" not in s for s in choose)
    for s in choose:
        # an option has an id, a label and a reply: nothing that pays or does
        assert all(set(o) == {"id", "label", "reply"} for o in s["options"])


def test_a_pool_quest_has_six_variants_and_every_band():
    doc = quests.check_all(quests.load_quests(), ctx())
    pools = [q for q in doc.values() if q["repeat"]["kind"] == "pool"]
    assert pools
    for q in pools:
        assert len(q["variants"]) >= 6
        assert {v["band"] for v in q["variants"]} == {"A", "B", "C"}


def test_the_people_files_and_the_quests_agree_on_who_offers_what():
    # the build compares offers.quests in each person's file with the quests offered there
    quests.check_all(quests.load_quests(), ctx())
    kid = read_yaml(NAG / "npcs" / "nagmon_kid.yaml")
    assert kid["offers"]["quests"] == ["q_kitten_home"]


def mutate(change):
    d = raw()
    change(d)
    with pytest.raises(ValueError):
        quests.check_all(d, ctx())


@pytest.mark.parametrize(
    "change",
    [
        # an action the interpreter does not have
        lambda d: d["q_kitten_home"]["steps"][0].update(done=["open_pc"]),
        lambda d: d["q_kitten_home"]["steps"][0].update(
            done=["give_item nosuchitem,1"]
        ),
        lambda d: d["q_kitten_home"]["steps"][0].update(
            done=["send_letter nosuchletter"]
        ),
        lambda d: d["q_kitten_home"]["steps"][0].update(
            done=["set_variable bad"]
        ),
        # money is paid by rewards (which the rules scale), never by a step action
        lambda d: d["q_kitten_home"]["steps"][0].update(
            done=["modify_money player,500"]
        ),
        # an option that pays or does something would make the choices unequal
        lambda d: d["q_wallet"]["steps"][0]["options"][0].update(
            reward={"coins": 90}
        ),
        lambda d: d["q_wallet"]["steps"][0]["options"][0].update(
            done=["give_item berry,1"]
        ),
        # a kindness quest has no right answer
        lambda d: d["q_wallet"]["steps"][0].update(correct="return"),
        # a right answer that is not an option
        lambda d: d["q_lost_found"]["steps"][0].update(correct="nobody"),
        # a choice with no right answer outside a kindness quest
        lambda d: d["q_lost_found"]["steps"][0].pop("correct"),
        lambda d: d["q_baker_double"]["steps"][0].update(topic="alchemy"),
        lambda d: d["q_baker_double"].update(
            variants=d["q_baker_double"]["variants"][:5]
        ),
        lambda d: d["q_baker_double"]["variants"].__setitem__(
            0, {**d["q_baker_double"]["variants"][0], "band": "Z"}
        ),
        lambda d: d["q_baker_double"].update(giver="nagmon_nobody"),
        lambda d: d["q_baker_double"]["steps"][0].update(npc="nagmon_nobody"),
        lambda d: d["q_baker_double"].update(repeat={"kind": "sometimes"}),
        lambda d: d["q_baker_double"]["offer"].update(
            lines=d["q_baker_double"]["offer"]["lines"][:1]
        ),
        lambda d: d["q_baker_double"]["reward"].update(coins="XXL"),
        lambda d: d["q_baker_double"]["reward"].update(coins=500),
        lambda d: d["q_baker_double"]["reward"].update(
            items=[{"id": "nosuchitem", "n": 1}]
        ),
        lambda d: d["q_baker_double"]["board"].update(slot="huge"),
        # no score, no failing, said to a child
        lambda d: d["q_baker_double"]["steps"][0]["say"][0].update(
            he="קיבלתם 5 נקודות"
        ),
        lambda d: d["q_baker_double"]["steps"][0]["say"][0].update(
            en="You got 5 points"
        ),
        # one line, in the right language
        lambda d: d["q_baker_double"]["steps"][0]["say"][0].update(
            he="שורה\nשתיים"
        ),
        lambda d: d["q_baker_double"]["steps"][0]["say"][0].update(en="עברית"),
        lambda d: d["q_baker_double"]["steps"][0]["say"][0].update(
            he="a" * 20
        ),
        lambda d: d["q_baker_double"]["steps"][0]["say"][0].update(
            he="א" * 130
        ),
        # a bring step needs a known item; the first step cannot wait for a day
        lambda d: d["q_berry_basket"]["steps"][0].update(item="nosuchitem"),
        lambda d: d["q_chess_riddles"]["steps"][0].update(after_days=1),
        lambda d: d["q_board_fix"].update(unlocks="free_coins"),
        lambda d: d["q_board_fix"].update(extra="x"),
    ],
)
def test_a_quest_with_a_mistake_stops_the_build(change):
    mutate(change)


def test_a_rule_with_a_mistake_stops_the_build():
    for change in (
        lambda r: r["scale"].update(M=5),
        lambda r: r.update(hint_after=3, lesser_after=3),
        lambda r: r.update(lesser_coins_pct=150),
        lambda r: r["board"].update(weekly_day=9),
        lambda r: r["board"].update(history=2),
        lambda r: r["solar_missions"].pop("moon"),
        lambda r: r.update(active_max=0),
    ):
        rules = copy.deepcopy(quests.load_rules())
        change(rules)
        with pytest.raises(ValueError):
            quests.check_rules(rules)


def test_quest_props_exist_on_the_maps():
    props = quests.prop_slugs()
    assert {"nagmon_kitten", "nagmon_wallet", "nagmon_lostfound"} <= props


def test_the_old_gated_quest_events_are_gone_from_the_maps():
    # the kitten and wallet stories ran on actions the app never had (remove_npc, translated_dialog_choice) and
    # were gated until the quest slice: the quest engine runs them now, the maps only show the props
    for name in ("classic_hearthrock_city", "classic_route_1"):
        text = (NAG / "maps" / f"{name}.yaml").read_text(encoding="utf-8")
        assert "nagmon_quests_w3" not in text
        assert "remove_npc nagmon_kitten" not in text
        assert "remove_npc nagmon_wallet" not in text
        assert "nagmon_wallet_choice" not in text
        assert "nagmon_granny_choice" not in text
