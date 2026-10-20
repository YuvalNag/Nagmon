"""WP13: Android platform helpers (docs/kids/SDD_ANDROID.md §2.3)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from nagmon.android import is_android
from nagmon.android.setup import prepare_environment
from tuxemon.config import TuxemonConfig
from tuxemon.platform.const.sizes import NATIVE_RESOLUTION
from tuxemon.platform.mobile import logical_resolution, touch_defaults
from tuxemon.scaling import make_default_scaling


@pytest.mark.parametrize(
    ("env", "expected"),
    [
        pytest.param({}, False, id="desktop"),
        pytest.param({"ANDROID_ARGUMENT": "/data/app"}, True, id="argument"),
        pytest.param({"ANDROID_PRIVATE": "/data/x"}, True, id="private"),
        pytest.param({"ANDROID_APP_PATH": "/data/x"}, True, id="app-path"),
        pytest.param({"ANDROID_ARGUMENT": ""}, False, id="empty-is-unset"),
    ],
)
def test_is_android(env, expected):
    assert is_android(env) is expected


@pytest.mark.parametrize(
    ("screen", "expected"),
    [
        # The phone's own pixels: nothing is scaled up, so text and
        # pictures stay sharp (a 1.5x stretch made everything blurry).
        pytest.param((2400, 1080), (2400, 1080), id="poco-f3-20-9"),
        pytest.param((1080, 2400), (2400, 1080), id="portrait-is-turned"),
        pytest.param((1920, 1080), (1920, 1080), id="16-9"),
        pytest.param((2340, 1080), (2340, 1080), id="19.5-9"),
        # Sharper screens are drawn 1080 high and scaled up a little:
        # more pixels would slow the game for no visible gain.
        pytest.param((3200, 1440), (2400, 1080), id="1440p-phone"),
        pytest.param((2048, 1536), (1440, 1080), id="tablet-4-3"),
        pytest.param((2000, 1200), (1800, 1080), id="16-10"),
        # Small screens keep the 1280x720 minimum the menus are made for.
        pytest.param((854, 480), (1280, 720), id="small-phone"),
    ],
)
def test_logical_resolution(screen, expected):
    assert logical_resolution(*screen) == expected


def test_logical_resolution_is_even():
    for w in range(1200, 3200, 7):
        rw, rh = logical_resolution(w, 1080)
        assert rw % 2 == 0 and rh % 2 == 0
        assert rw >= 1280 and rh >= 720


def test_logical_resolution_rejects_nonsense():
    assert logical_resolution(0, 0) == (1280, 720)


def test_touch_defaults():
    config = {"controller": {"overlay": False}, "display": {}}
    touch_defaults(config)
    assert config["controller"] == {
        "overlay": True,
        "hide_mouse": False,
        "transparency": 150,
    }
    assert config["display"]["fullscreen"] is True


def test_config_on_a_phone_turns_on_touch(monkeypatch):
    monkeypatch.setenv("ANDROID_ARGUMENT", "/data/app")
    config = TuxemonConfig()
    assert config.controller.overlay is True
    assert config.controller.hide_mouse is False
    assert config.fullscreen is True


def test_config_on_a_phone_keeps_the_players_choice(monkeypatch, tmp_path):
    monkeypatch.setenv("ANDROID_ARGUMENT", "/data/app")
    path = tmp_path / "tuxemon.yaml"
    path.write_text("controller:\n  overlay: false\n")
    assert TuxemonConfig(path).controller.overlay is False


def test_config_on_a_pc(monkeypatch):
    for name in ("ANDROID_ARGUMENT", "ANDROID_PRIVATE", "ANDROID_APP_PATH"):
        monkeypatch.delenv(name, raising=False)
    config = TuxemonConfig()
    assert config.controller.overlay is False
    # Children click answers with the mouse on the PC too.
    assert config.controller.hide_mouse is False


@pytest.mark.parametrize(
    ("resolution", "scale"),
    [
        pytest.param((1280, 720), 5, id="16-9"),
        pytest.param((1600, 720), 5, id="wide"),
        pytest.param((2400, 1080), 7, id="poco-f3"),
        pytest.param((1280, 960), 5, id="tablet-tall"),
        pytest.param((2560, 1440), 10, id="2k"),
    ],
)
def test_scaling_fits_the_shorter_side(resolution, scale):
    config = SimpleNamespace(
        large_gui=False, scaling=True, resolution=resolution
    )
    s = make_default_scaling(config, NATIVE_RESOLUTION)  # type: ignore[arg-type]
    assert s._scale == scale
    assert NATIVE_RESOLUTION[1] * s._scale <= resolution[1]


def test_prepare_environment_uses_the_private_folder_as_home():
    env = {"ANDROID_PRIVATE": "/data/user/0/org.nagmon/files"}
    prepare_environment(env, cafile=lambda: "/c.pem")
    assert env["HOME"] == "/data/user/0/org.nagmon/files"


def test_prepare_environment_keeps_a_home():
    env = {"ANDROID_PRIVATE": "/data/x", "HOME": "/home/kid"}
    prepare_environment(env, cafile=lambda: "/c.pem")
    assert env["HOME"] == "/home/kid"


def test_prepare_environment_sets_certificates():
    env: dict[str, str] = {}
    prepare_environment(env, cafile=lambda: "/app/certifi/cacert.pem")
    assert env["SSL_CERT_FILE"] == "/app/certifi/cacert.pem"


def test_prepare_environment_keeps_existing_certificates():
    env = {"SSL_CERT_FILE": "/mine.pem"}
    prepare_environment(env, cafile=lambda: "/app/certifi/cacert.pem")
    assert env["SSL_CERT_FILE"] == "/mine.pem"


def test_prepare_environment_without_certifi():
    env: dict[str, str] = {}

    def missing() -> str:
        raise ImportError("no certifi")

    prepare_environment(env, cafile=missing)
    assert "SSL_CERT_FILE" not in env


def test_phone_screen_sets_the_drawing_size(monkeypatch):
    import pygame

    from tuxemon.prepare import fit_to_phone_screen

    pygame.display.init()
    info = pygame.display.Info()
    expected = logical_resolution(info.current_w, info.current_h)
    monkeypatch.setenv("ANDROID_ARGUMENT", "/data/app")
    config = TuxemonConfig()
    flags = fit_to_phone_screen(config)
    assert config.resolution == expected
    assert flags & pygame.SCALED and flags & pygame.FULLSCREEN


def test_pc_screen_is_left_alone(monkeypatch):
    from tuxemon.prepare import fit_to_phone_screen

    for name in ("ANDROID_ARGUMENT", "ANDROID_PRIVATE", "ANDROID_APP_PATH"):
        monkeypatch.delenv(name, raising=False)
    config = TuxemonConfig()
    assert fit_to_phone_screen(config) == 0
    assert config.resolution == (1280, 720)


def test_prepare_environment_keeps_the_game_landscape():
    """
    Build 21 opened in portrait on the phone: with FULLSCREEN|SCALED, SDL
    creates the window at the desktop size, which is portrait while the
    app starts, and without a hint asks Android for portrait
    (requestedOrientation=7 in the emulator log). The hint tells SDL the
    game only turns sideways.
    """
    env: dict[str, str] = {}
    prepare_environment(env, cafile=lambda: "/c.pem")
    assert env["SDL_IOS_ORIENTATIONS"] == "LandscapeLeft LandscapeRight"


def test_prepare_environment_keeps_a_chosen_orientation():
    env = {"SDL_IOS_ORIENTATIONS": "LandscapeLeft"}
    prepare_environment(env, cafile=lambda: "/c.pem")
    assert env["SDL_IOS_ORIENTATIONS"] == "LandscapeLeft"


def test_prepare_environment_follows_the_spec_orientation():
    env = {"KIVY_ORIENTATION": "LandscapeLeft"}
    prepare_environment(env, cafile=lambda: "/c.pem")
    assert env["SDL_IOS_ORIENTATIONS"] == "LandscapeLeft"
