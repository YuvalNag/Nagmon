"""
Boots the game headless and saves screenshots of the Nagmon screens.

Usage:
    HOME=/tmp/nagmon-home python tools/dev/headless_tour.py OUTDIR [he_IL]

Use a throwaway HOME: the game writes its config, saves and profiles
there. Steps: splash -> "who is playing" (empty) -> a parent creates two
children -> "who is playing" -> pick the first -> title menu.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
os.chdir(REPO)

out = Path(sys.argv[1])
locale = sys.argv[2] if len(sys.argv) > 2 else "he_IL"
out.mkdir(parents=True, exist_ok=True)

from tuxemon.platform import platform  # noqa: E402

platform.init()
from tuxemon.prepare import pygame_init  # noqa: E402

context = pygame_init()

import pygame  # noqa: E402

from tuxemon import main as tm  # noqa: E402
from tuxemon.client import LocalPygameClient  # noqa: E402
from tuxemon.locale.locale import T  # noqa: E402
from tuxemon.session import local_session  # noqa: E402
from tuxemon.user_config import CONFIG  # noqa: E402

config = CONFIG.copy()
config.config_model.display.splash = False
T.change_language(locale)
client = LocalPygameClient.create(config, context)
local_session.set_client(client)
tm.configure_game_states(client, config, None)

DT = 1.0 / 60


def step(n: int) -> None:
    for _ in range(n):
        client.update(DT)
        client.draw()
        pygame.display.update()


def names() -> list[str]:
    return [s.name for s in client.active_states]


def shot(name: str) -> None:
    path = out / f"{name}.png"
    pygame.image.save(pygame.display.get_surface(), path)
    print("saved", path, names())


def wait_for(state: str, frames: int = 2400) -> bool:
    for _ in range(frames // 20):
        if state in names():
            return True
        step(20)
        if "IntroState" in names():
            pygame.event.post(
                pygame.event.Event(pygame.KEYDOWN, key=pygame.K_RETURN)
            )
    return state in names()


from nagmon.runtime import get_runtime  # noqa: E402

assert wait_for("ProfileSelectState"), names()
step(30)
shot("01_who_plays_empty")

rt = get_runtime()
assert rt is not None
if not rt.store.list():
    from nagmon.game_flow import defaults_for_grade

    rt.store.create(name="נועה", avatar="girl_light", **defaults_for_grade(2))
    rt.store.create(name="אורי", avatar="boy_light", **defaults_for_grade(6))
client.get_state_by_name("ProfileSelectState").rebuild()
step(30)
shot("02_who_plays")

first = rt.store.list()[0]
client.get_state_by_name("ProfileSelectState").pick(first.id)
step(60)
shot("03_title_for_child")
print("active:", rt.active.name if rt.active else None)
