# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from pygame.rect import Rect

from tuxemon.entity.npc import NPC
from tuxemon.scaling import DefaultScaling
from tuxemon.ui.combat_layout import (
    LayoutManager,
    LayoutRectFactory,
    LayoutRepository,
    LayoutSelector,
)


@pytest.fixture
def raw_layouts():
    return {
        "RIGHT_COMBAT": {"key": (1, 2, 3, 4)},
        "LEFT_COMBAT": {"key": (5, 6, 7, 8)},
    }


@pytest.fixture
def layout_groups():
    return {
        1: ["RIGHT_COMBAT"],
        2: ["RIGHT_COMBAT", "LEFT_COMBAT"],
    }


@pytest.fixture
def repo(tmp_path, raw_layouts, layout_groups, monkeypatch):
    from tuxemon.ui import combat_layout as module

    monkeypatch.setattr(
        module, "load_layouts_from_yaml", lambda _: raw_layouts
    )
    monkeypatch.setattr(module, "load_layout_groups", lambda _: layout_groups)
    yaml_path = tmp_path / "combat_layouts.yaml"
    yaml_path.write_text("fake: true")
    return LayoutRepository(yaml_path, DefaultScaling(1))


@pytest.fixture
def selector(repo):
    return LayoutSelector(repo)


@pytest.fixture
def rect_factory():
    return LayoutRectFactory()


@pytest.fixture
def manager(tmp_path, repo):
    return LayoutManager(tmp_path / "combat_layouts.yaml", DefaultScaling(1))


@pytest.fixture
def two_players():
    return [MagicMock(spec=NPC) for _ in range(2)]


def test_repo_loads_raw(repo, raw_layouts):
    assert repo.raw_layouts == raw_layouts


def test_repo_scaled_layout(repo):
    scaled = repo.get_scaled_layout("RIGHT_COMBAT")
    assert scaled["key"] == (1, 2, 3, 4)


def test_selector_valid(selector):
    layout = selector.select(0, 2)
    assert layout == {"key": (1, 2, 3, 4)}


@pytest.mark.parametrize(
    "player_count",
    [
        pytest.param(0, id="zero_players"),
        pytest.param(3, id="three_players"),
        pytest.param(-1, id="negative_players"),
    ],
)
def test_selector_invalid_player_count(selector, player_count):
    with pytest.raises(ValueError):
        selector.select(0, player_count)


@pytest.mark.parametrize(
    "index",
    [
        pytest.param(-1, id="negative_index"),
        pytest.param(2, id="out_of_range_index_2"),
        pytest.param(99, id="out_of_range_index_99"),
    ],
)
def test_selector_invalid_index(selector, index):
    with pytest.raises(IndexError):
        selector.select(index, 2)


def test_rect_factory(rect_factory):
    layout = {"key": (1, 2, 3, 4)}
    rects = rect_factory.to_rects(layout)
    assert "key" in rects
    assert isinstance(rects["key"][0], Rect)
    assert rects["key"][0].topleft == (1, 2)


def test_manager_prepare_all(manager, two_players):
    layouts = manager.prepare_all(two_players)

    assert len(layouts) == 2
    for npc, layout in layouts.items():
        assert isinstance(layout, dict)
        assert all(isinstance(r[0], Rect) for r in layout.values())


def test_manager_empty(manager):
    assert manager.prepare_all([]) == {}


def test_manager_single(manager):
    players = [MagicMock(spec=NPC)]
    layouts = manager.prepare_all(players)
    assert len(layouts) == 1


def test_selector_missing_layout_name(repo, monkeypatch):
    monkeypatch.setattr(
        repo, "raw_layouts", {"RIGHT_COMBAT": {"key": (1, 2, 3, 4)}}
    )
    selector = LayoutSelector(repo)
    with pytest.raises(KeyError):
        selector.select(1, 2)


def test_manager_rects_are_unique_instances(manager, two_players):
    layouts1 = manager.prepare_all(two_players)
    layouts2 = manager.prepare_all(two_players)
    for npc in two_players:
        for key in layouts1[npc]:
            rect1 = layouts1[npc][key][0]
            rect2 = layouts2[npc][key][0]
            assert rect1 is not rect2


def test_manager_rects_not_shared_between_players(manager, two_players):
    layouts = manager.prepare_all(two_players)
    rects = []
    for npc in two_players:
        for key in layouts[npc]:
            rects.append(layouts[npc][key][0])
    assert len(rects) == len(set(id(r) for r in rects))


def test_manager_deterministic_output(manager, two_players):
    layouts1 = manager.prepare_all(two_players)
    layouts2 = manager.prepare_all(two_players)
    assert list(layouts1.keys()) == list(layouts2.keys())

    for npc in two_players:
        assert layouts1[npc].keys() == layouts2[npc].keys()


def test_selector_error_message_player_count(selector):
    with pytest.raises(ValueError) as exc:
        selector.select(0, 99)
    assert "99" in str(exc.value)


def test_selector_error_message_index(selector):
    with pytest.raises(IndexError) as exc:
        selector.select(5, 2)
    assert "5" in str(exc.value)


def test_full_pipeline_integration(manager, two_players):
    layouts = manager.prepare_all(two_players)
    assert len(layouts) == 2
    for npc, layout in layouts.items():
        assert isinstance(layout, dict)
        for rect_list in layout.values():
            assert isinstance(rect_list[0], Rect)


# ------------------------------------------- a wide screen (SDD_ANDROID §2.7)

REAL_YAML = (
    Path(__file__).resolve().parents[2] / "mods" / "combat_layouts.yaml"
)


def _wide(screen_width):
    return LayoutRepository(REAL_YAML, DefaultScaling(7), screen_width)


def test_a_20_9_screen_moves_the_right_half_by_the_whole_extra():
    # 2400 pixels at scale 7: the 256-point layout is 1792 wide, 608 short.
    narrow, wide = _wide(None), _wide(2400)
    player = narrow.get_scaled_layout("LEFT_COMBAT")
    player_wide = wide.get_scaled_layout("LEFT_COMBAT")
    # the player's monster (left) stays, its HUD (right) moves
    assert player_wide["home"] == player["home"]
    assert player_wide["hud"][0] == player["hud"][0] + 608
    assert player_wide["hud"][1:] == player["hud"][1:]
    assert player_wide["monster_status_icon"][0] == (
        player["monster_status_icon"][0] + 608
    )
    opponent = narrow.get_scaled_layout("RIGHT_COMBAT")
    opponent_wide = wide.get_scaled_layout("RIGHT_COMBAT")
    # the opponent's monster (right) moves, its HUD (left) stays
    assert opponent_wide["home"][0] == opponent["home"][0] + 608
    assert opponent_wide["home0"][0] == opponent["home0"][0] + 608
    assert opponent_wide["home1"][0] == opponent["home1"][0] + 608
    assert opponent_wide["hud"] == opponent["hud"]


def test_the_player_hud_still_rests_at_the_right_edge():
    hud = _wide(2400).get_scaled_layout("LEFT_COMBAT")["hud"]
    assert 2400 - (hud[0] + hud[2]) == 7  # 1 point, as on a 16:9 screen


def test_hud_text_offsets_do_not_move():
    for name in ("LEFT_COMBAT", "RIGHT_COMBAT", "CENTER_COMBAT"):
        narrow = _wide(None).get_scaled_layout(name)
        wide = _wide(2400).get_scaled_layout(name)
        assert wide["hud_line1"] == narrow["hud_line1"]
        assert wide["hud_line2"] == narrow["hud_line2"]


def test_the_centre_layout_moves_by_half():
    narrow = _wide(None).get_scaled_layout("CENTER_COMBAT")
    wide = _wide(2400).get_scaled_layout("CENTER_COMBAT")
    assert wide["home"][0] == narrow["home"][0] + 304


@pytest.mark.parametrize(
    "width",
    [
        pytest.param(None, id="unknown"),
        pytest.param(1792, id="exactly_256_points"),
        pytest.param(1700, id="narrower"),
    ],
)
def test_no_extra_room_changes_nothing(width):
    # exactly 256 points wide, or narrower (never moved left)
    for name in ("LEFT_COMBAT", "RIGHT_COMBAT", "CENTER_COMBAT"):
        assert _wide(width).get_scaled_layout(name) == _wide(
            None
        ).get_scaled_layout(name)


def test_the_manager_passes_the_screen_width():
    manager = LayoutManager(REAL_YAML, DefaultScaling(7), screen_width=2400)
    assert manager.repo.screen_width == 2400
