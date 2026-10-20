"""
The look on a big phone screen (docs/kids/SDD_ANDROID.md §2.7): no
Tuxemon title screen, a battle across the whole 20:9 screen, HD twins
of Tuxemon's UI images.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import numpy as np
import pygame
import pytest

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

# ---------------------------------------------------------------- the title


def _intro_state(on_top: bool = True):
    from mods.nagmon.states.nagmon_intro import IntroState

    client = MagicMock()
    state = IntroState(client=client)
    client.current_state = state if on_top else object()
    return state, client


def test_the_game_registers_nagmons_intro_state():
    from tuxemon.constants.paths import LIBDIR
    from tuxemon.state.loader import StateLoader
    from tuxemon.state.repository import StateRepository

    repo = StateRepository.from_loader(StateLoader("tuxemon.states", LIBDIR))
    cls = repo.get_state("IntroState")
    assert cls.__module__ == "mods.nagmon.states.nagmon_intro"
    # The movie is still there, under its own name.
    assert repo.get_state("NagmonIntroState").__module__ == cls.__module__


def test_nagmons_intro_state_is_not_tuxemons_press_a_key_screen():
    from mods.nagmon.states.nagmon_intro import IntroState
    from tuxemon.states.intro_state import IntroState as TuxemonIntro

    assert not issubclass(IntroState, TuxemonIntro)
    state, client = _intro_state()
    # No "intro" animation (the girl in the short skirt) and no music.
    client.current_music.play.assert_not_called()
    surface = pygame.Surface((64, 36))
    surface.fill((1, 2, 3))
    state.draw(surface)
    assert surface.get_at((10, 10))[:3] == (1, 2, 3)


def test_on_top_it_goes_straight_to_the_title_once():
    state, client = _intro_state()
    state.update(0.016)
    state.update(0.016)
    client.queue_command.assert_called_once()
    client.queue_command.call_args[0][0]()
    client.replace_state.assert_called_once_with("StartState")


def test_under_the_intro_movie_it_waits():
    # At launch the movie is above it: replacing the *top* state would
    # close the movie instead.
    state, client = _intro_state(on_top=False)
    state.update(0.016)
    client.queue_command.assert_not_called()
    client.replace_state.assert_not_called()


def test_a_key_or_a_tap_is_swallowed():
    state, client = _intro_state()
    event = MagicMock(pressed=True)
    assert state.process_event(event) is None
    client.replace_state.assert_not_called()


# ----------------------------------------------------------- HD twins


@pytest.fixture
def display():
    pygame.init()
    if pygame.display.get_surface() is None:
        pygame.display.set_mode((640, 480))
    yield


@pytest.fixture
def mods(tmp_path, monkeypatch):
    """Two mods: "nagmon" before "tuxemon", as the game orders them."""
    # Imported first: importing them finds the real mods.
    import tuxemon.environment  # noqa: F401
    import tuxemon.menu.menu  # noqa: F401
    import tuxemon.menu.theme  # noqa: F401
    from tuxemon.constants import asset_loader

    roots = (tmp_path / "nagmon", tmp_path / "tuxemon")
    for root in roots:
        (root / "gfx").mkdir(parents=True)
    monkeypatch.setattr(asset_loader, "_MOD_ASSET_ROOTS", roots)
    _forget()
    yield roots
    _forget()


def _forget() -> None:
    from tuxemon.constants.asset_loader import fetch_asset
    from tuxemon.graphics import fetch_hd_twin

    fetch_asset.cache_clear()
    fetch_hd_twin.cache_clear()


def _save(surface: pygame.Surface, path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pygame.image.save(surface, str(path))


def _checker(size, k=1) -> pygame.Surface:
    """A checkerboard whose every native pixel is a k x k block."""
    w, h = size
    surf = pygame.Surface((w * k, h * k))
    for y in range(h):
        for x in range(w):
            color = (200, 40, 40) if (x + y) % 2 else (40, 40, 200)
            surf.fill(color, (x * k, y * k, k, k))
    return surf


def test_the_twin_name():
    from tuxemon.graphics import hd_twin_name

    assert hd_twin_name("gfx/borders/borders.png") == (
        "gfx/borders/borders@4x.png"
    )


def test_a_twin_is_found_by_mod_order(mods, display):
    from tuxemon.graphics import fetch_hd_twin

    nagmon, tuxemon = mods
    _save(_checker((6, 6)), tuxemon / "gfx" / "box.png")
    assert fetch_hd_twin("gfx/box.png") is None
    _save(_checker((6, 6), 4), nagmon / "gfx" / "box@4x.png")
    _forget()
    assert fetch_hd_twin("gfx/box.png") == (
        (nagmon / "gfx" / "box@4x.png").as_posix()
    )


def test_load_and_scale_gives_the_same_size_from_a_twin(mods, display):
    from tuxemon.graphics import load_and_scale

    nagmon, tuxemon = mods
    _save(_checker((18, 12)), tuxemon / "gfx" / "box.png")
    before = load_and_scale("gfx/box.png", 7)
    _save(_checker((18, 12), 4), nagmon / "gfx" / "box@4x.png")
    _forget()
    after = load_and_scale("gfx/box.png", 7)
    assert before.get_size() == after.get_size() == (126, 84)
    # the twin's colours, smoothly scaled: the middle of a block is it
    assert after.get_at((3, 3))[:3] == before.get_at((3, 3))[:3]


def test_without_a_twin_the_pixels_do_not_change(mods, display):
    from tuxemon.graphics import load_and_scale, load_image, scale_surface

    _, tuxemon = mods
    _save(_checker((18, 12)), tuxemon / "gfx" / "box.png")
    old = scale_surface(load_image("gfx/box.png"), 7)
    new = load_and_scale("gfx/box.png", 7)
    assert pygame.image.tobytes(old, "RGB") == pygame.image.tobytes(new, "RGB")


# ------------------------------------------------------- the battle background


def _environment(background: str, scale: int):
    from tuxemon.environment import Environment

    data = MagicMock()
    data.get_battle_graphics.return_value.background = background
    context = MagicMock()
    context.scale = scale
    return Environment(data, context)


def _background(width=256, height=108) -> pygame.Surface:
    """Green, with a red column in the middle and a blue top row."""
    surf = pygame.Surface((width, height))
    surf.fill((0, 160, 0))
    surf.fill((220, 0, 0), (width // 2 - 2, 0, 4, height))
    surf.fill((0, 0, 220), (0, 0, width, 1))
    return surf


@pytest.mark.parametrize(
    "twin",
    [pytest.param(False, id="native"), pytest.param(True, id="hd_twin")],
)
def test_the_battle_background_covers_a_20_9_screen(mods, display, twin):
    nagmon, tuxemon = mods
    _save(_background(), tuxemon / "gfx" / "bg.png")
    if twin:
        hd = pygame.transform.scale(_background(), (1024, 432))
        _save(hd, nagmon / "gfx" / "bg@4x.png")
    surf = _environment("gfx/bg.png", 7).prepare_background((2400, 1080))
    assert surf.get_size() == (2400, 1080)
    # no black column at the right edge, anywhere
    for y in range(0, 1080, 40):
        assert surf.get_at((2399, y))[:3] != (0, 0, 0), y
    # not stretched: the middle of the picture is the middle of the screen
    row = [surf.get_at((x, 500))[:3] for x in range(2400)]
    reds = [x for x, c in enumerate(row) if c[0] > 150 and c[1] < 80]
    assert reds and abs((reds[0] + reds[-1]) / 2 - 1200) <= 6
    # the width of the red column grew by 2400/256, as the height did
    assert abs(len(reds) - 4 * 2400 / 256) <= 3


def test_the_battle_background_on_a_16_9_screen_is_as_before(mods, display):
    from tuxemon.graphics import scale_surface

    _, tuxemon = mods
    _save(_background(), tuxemon / "gfx" / "bg.png")
    surf = _environment("gfx/bg.png", 7).prepare_background((1792, 1008))
    old = scale_surface(_background(), 7)
    assert surf.get_at((5, 0))[:3] == (0, 0, 220)  # the top row is kept
    assert pygame.image.tobytes(
        surf.subsurface((0, 0, 1792, 756)), "RGB"
    ) == pygame.image.tobytes(old.convert(surf), "RGB")
    # under the picture, its last row goes on (the menu covers it)
    assert surf.get_at((5, 1000))[:3] == (0, 160, 0)


def test_an_island_sheet_twin_gives_the_same_frames(mods, display):
    from tuxemon.environment import IslandSheet

    nagmon, tuxemon = mods
    _save(_checker((20, 8)), tuxemon / "gfx" / "isl.png")
    context = MagicMock(scale=7)
    old = IslandSheet(context, "gfx/isl.png", 10, 8).frames
    twin = pygame.Surface((80, 32))
    twin.fill((0, 200, 0))
    _save(twin, nagmon / "gfx" / "isl@4x.png")
    _forget()
    new = IslandSheet(context, "gfx/isl.png", 10, 8).frames
    for side in ("back", "front"):
        assert old[side].get_size() == new[side].get_size() == (70, 56)
        assert new[side].get_at((3, 3))[:3] == (0, 200, 0)


def test_the_menu_border_comes_from_its_twin(mods, display):
    from tuxemon.menu.theme import border_image

    nagmon, tuxemon = mods
    _save(_checker((18, 18)), tuxemon / "gfx" / "b.png")
    old = border_image("gfx/b.png", 7)
    _save(_checker((18, 18), 4), nagmon / "gfx" / "b@4x.png")
    _forget()
    new = border_image("gfx/b.png", 7)
    assert old.get_size() == new.get_size() == (126, 126)
    assert new.get_path() == (nagmon / "gfx" / "b@4x.png").as_posix()


def test_a_menu_background_is_its_twin(mods, display):
    from tuxemon.menu.menu import PygameMenuState

    nagmon, tuxemon = mods
    _save(_checker((256, 144)), tuxemon / "gfx" / "bg.png")
    state = PygameMenuState.__new__(PygameMenuState)
    assert state._create_background("gfx/bg.png").get_path() == (
        (tuxemon / "gfx" / "bg.png").as_posix()
    )
    _save(_checker((256, 144), 4), nagmon / "gfx" / "bg@4x.png")
    _forget()
    assert state._create_background("gfx/bg.png").get_path() == (
        (nagmon / "gfx" / "bg@4x.png").as_posix()
    )


def test_an_image_added_to_a_menu_keeps_its_native_size(mods, display):
    # ImageState checks the background is 256x144, and icons are scaled
    # by the game's factor: a 4x twin there broke both (review).
    from tuxemon.menu.menu import PygameMenuState

    nagmon, tuxemon = mods
    _save(_checker((256, 144)), tuxemon / "gfx" / "bg.png")
    _save(_checker((256, 144), 4), nagmon / "gfx" / "bg@4x.png")
    state = PygameMenuState.__new__(PygameMenuState)
    image = state._create_image("gfx/bg.png")
    assert image.get_size() == (256, 144)
    assert image.get_path() == (tuxemon / "gfx" / "bg.png").as_posix()


def test_image_state_opens_on_a_background_with_a_twin():
    # gradient_blue has a twin in mods/nagmon; ImageState measured the
    # twin (1024x576) against 256x144 and stopped the game (review).
    from types import SimpleNamespace

    from tuxemon.menu import theme as theme_mod
    from tuxemon.menu.alert import AlertManager
    from tuxemon.scaling import DefaultScaling
    from tuxemon.states.image_state import ImageState

    pygame.init()
    pygame.display.set_mode((2400, 1080))
    theme_mod.reset_theme_cache()
    screen = pygame.Surface((2400, 1080))
    client = MagicMock()
    client.context = SimpleNamespace(
        screen=screen,
        rect=screen.get_rect(),
        resolution=(2400, 1080),
        tile_size=(16, 16),
        scale=7,
        scaling=DefaultScaling(7),
    )
    client.config.locale.font_file = "Rubik-Medium.ttf"
    client.config.large_gui = False
    client.config.sound_volume = 0.0
    client.sound_manager.get_sound_filename.return_value = None
    client.alert_manager = AlertManager(MagicMock())
    state = ImageState(client, background="gradient_blue")
    assert state.menu is not None
    theme_mod.reset_theme_cache()


# ------------------------------------------------- the twins in the repo

REPO = Path(__file__).resolve().parents[2]


def _tool():
    sys.path.insert(0, str(REPO / "tools" / "art"))
    import upscale_ui

    return upscale_ui


def test_every_twin_is_four_times_its_tuxemon_image():
    from PIL import Image

    tool = _tool()
    twins = tool.twins()
    assert len(twins) > 60
    for twin in twins:
        target = REPO / tool.OUT_MOD / twin.target
        assert target.is_file(), f"run tools/art/upscale_ui.py: {target}"
        with (
            Image.open(REPO / tool.SOURCE_MOD / twin.source) as src,
            Image.open(target) as big,
        ):
            assert big.size == (src.width * 4, src.height * 4), twin


def test_the_priority_images_have_twins():
    targets = {t.source for t in _tool().twins()}
    for rel in (
        "gfx/borders/borders.png",  # every dialog and menu
        "gfx/ui/background/gradient_blue.png",  # the title, who plays
        "gfx/ui/combat/grass_background.png",
        "gfx/ui/combat/night_grass_background.png",
        "gfx/ui/combat/battle_interior.png",
        "gfx/ui/combat/hp_player_nohp.png",
        "gfx/ui/combat/hp_opponent_nohp.png",
        "gfx/ui/island_sheet/grass_island_sheet.png",
    ):
        assert rel in targets, rel
    # faded in through a colorkey: smooth edges would turn magenta
    assert not any("icons/party" in rel for rel in targets)
    assert not list((REPO / "mods/nagmon/gfx/ui/icons/party").glob("*@4x*"))


def test_a_border_side_and_middle_repeat_without_a_notch():
    from PIL import Image

    tool = _tool()
    path = REPO / tool.OUT_MOD / "gfx" / "borders" / "borders@4x.png"
    with Image.open(path) as image:
        big = np.array(image.convert("RGBA"))
    t = big.shape[0] // 3
    north = big[0:t, t : 2 * t]
    west = big[t : 2 * t, 0:t]
    middle = big[t : 2 * t, t : 2 * t]
    assert (north == north[:, :1]).all()  # every column the same
    assert (west == west[:1, :]).all()  # every row the same
    assert (middle == middle[0, 0]).all()


def test_the_title_gradient_has_no_stripes():
    from PIL import Image

    tool = _tool()
    path = REPO / tool.OUT_MOD / "gfx/ui/background/gradient_blue@4x.png"
    with Image.open(path) as image:
        column = np.array(image.convert("RGB"))[:, 100].astype(int)
    # neighbouring rows differ by a level or two, not white against cyan
    assert np.abs(np.diff(column, axis=0)).max() <= 3


# ------------------------------------- menus above the battle menu (review)


def _battle_menu(screen_width: int, hud_left: int | None):
    from pygame.rect import Rect

    from tuxemon.scaling import DefaultScaling
    from tuxemon.states.combat_menus import MainCombatMenuState

    menu = MainCombatMenuState.__new__(MainCombatMenuState)
    menu.client = MagicMock()
    menu.client.context.rect = Rect(0, 0, screen_width, 1080)
    menu.client.context.scaling = DefaultScaling(7)
    menu.rect = Rect(screen_width - 714, 810, 714, 270)
    monster = MagicMock()
    menu.party = [monster]
    hud = None
    if hud_left is not None:
        hud = MagicMock()
        hud.rect = Rect(hud_left, 450, 770, 175)
    menu.combat = MagicMock()
    menu.combat.hud_manager.get_hud.return_value = hud
    return menu


def test_on_20_9_the_attack_list_stops_at_the_players_hud():
    # The HUD moved to the right edge; the list used to cover it.
    assert _battle_menu(2400, 1623).submenu_right() == 1623


def test_on_16_9_the_attack_list_is_at_the_screen_edge():
    assert _battle_menu(1792, 1015).submenu_right() == 1792


def test_without_a_hud_the_attack_list_is_at_the_screen_edge():
    assert _battle_menu(2400, None).submenu_right() == 2400


def test_a_menu_too_wide_for_the_room_stays_at_the_screen_edge():
    battle = _battle_menu(2400, 1623)
    narrow, wide = MagicMock(), MagicMock()
    narrow.rect.width, wide.rect.width = 400, 2000
    battle.anchor_above(narrow)
    battle.anchor_above(wide)
    narrow.anchor.assert_any_call("right", 1623)
    narrow.anchor.assert_any_call("bottom", 810)
    wide.anchor.assert_any_call("right", 2400)
    # the attack list is screen-wide until it shrinks to the names
    shrinking = MagicMock()
    shrinking.rect.width = 2400
    battle.anchor_above(shrinking, shrinks=True)
    shrinking.anchor.assert_any_call("right", 1623)


def test_bleed_gives_clear_pixels_the_nearest_colour():
    tool = _tool()
    image = np.zeros((5, 7, 4), dtype=np.uint8)
    image[2, 1] = (200, 10, 10, 255)  # red at the left
    image[2, 5] = (10, 10, 200, 128)  # half-clear blue at the right
    out = tool.bleed(image)
    assert (out[..., 3] == image[..., 3]).all()  # alpha untouched
    assert tuple(out[2, 0, :3]) == (200, 10, 10)
    assert tuple(out[0, 1, :3]) == (200, 10, 10)
    assert tuple(out[2, 6, :3]) == (10, 10, 200)
    assert tuple(out[2, 5]) == (10, 10, 200, 128)  # not clear: kept


def test_the_clear_pixels_of_a_twin_take_their_neighbours_colour():
    # Smooth scaling mixes clear pixels into the edge: black ones gave
    # the HUDs a dark fringe (review).
    from PIL import Image

    tool = _tool()
    path = REPO / tool.OUT_MOD / "gfx/ui/combat/hp_player_nohp@4x.png"
    with Image.open(path) as image:
        big = np.array(image.convert("RGBA")).astype(int)
    alpha = big[..., 3]
    clear = alpha == 0
    # a clear pixel right of an opaque one has a colour close to it
    left_opaque = np.zeros_like(clear)
    left_opaque[:, 1:] = alpha[:, :-1] == 255
    edge = clear & left_opaque
    assert edge.any()
    ys, xs = np.nonzero(edge)
    diff = np.abs(big[ys, xs, :3] - big[ys, xs - 1, :3]).max(axis=1)
    assert np.median(diff) <= 40
    assert not (big[ys, xs, :3] == 0).all(axis=1).all()
