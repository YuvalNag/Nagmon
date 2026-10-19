"""
Boots the game headless, starts a new game for a child and walks through
the first world chapter (docs/kids/SDD_WORLD.md §4).

Usage:
    HOME=/tmp/nagmon-home python tools/dev/world_tour.py OUTDIR
    HOME=/tmp/nagmon-home python tools/dev/world_tour.py --smoke

Use a throwaway HOME: the game writes its config, saves and profiles
there. With OUTDIR it saves world_*.png screenshots: the intro dialog,
the Wise Owl in town, a quiz at the shop, a wild battle with the new
subject monsters, the academy master, and the owl in its cape after
the first badge. With
--smoke it only checks that a new game starts in Hearthrock with the
child's name, and prints one JSON line.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
os.chdir(REPO)

SMOKE = "--smoke" in sys.argv
args = [a for a in sys.argv[1:] if not a.startswith("--")]
out = Path(args[0]) if args else None
if out is not None:
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

CONFIG.update_locale("he_IL")
T.change_language("he_IL")
config = CONFIG.copy()
config.config_model.display.splash = False
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
    if out is None:
        return
    path = out / f"{name}.png"
    pygame.image.save(pygame.display.get_surface(), path)
    print("saved", path, names())


def press(key: int = pygame.K_RETURN) -> None:
    pygame.event.post(pygame.event.Event(pygame.KEYDOWN, key=key))
    step(2)
    pygame.event.post(pygame.event.Event(pygame.KEYUP, key=key))
    step(2)


def wait_for(state: str, frames: int = 2400, skip_intro: bool = True) -> bool:
    for _ in range(frames // 20):
        if state in names():
            return True
        step(20)
        if skip_intro and "IntroState" in names():
            press()
    return state in names()


def dialog_text() -> str:
    for s in client.active_states:
        if s.name == "DialogState":
            return str(getattr(s, "text_area", None) and s.text_area.text)
    return ""


def close_dialogs(limit: int = 200) -> None:
    """Page through open dialogs until none is left."""
    for _ in range(limit):
        if "DialogState" not in names():
            return
        press()
        step(6)


def player():
    return local_session.player


def var(key: str):
    return player().game_variables.get(key)


# ------------------------------------------------------------ profiles
from nagmon.runtime import get_runtime  # noqa: E402

assert wait_for("ProfileSelectState"), names()
rt = get_runtime()
assert rt is not None
from nagmon.family.screentime import ScreenLimits  # noqa: E402

rt.parent.settings.default_limits = ScreenLimits(
    daily_max_minutes=None,
    weekday_windows=None,
    weekend_windows=None,
    bedtime=None,
)
rt.parent.settings.shabbat_mode = False
rt.parent.settings.holiday_mode = False
if not rt.store.list():
    from nagmon.game_flow import defaults_for_grade

    rt.store.create(name="נועה", avatar="girl_light", **defaults_for_grade(2))
child = rt.store.list()[0]
client.get_state_by_name("ProfileSelectState").pick(child.id)
assert wait_for("StartState"), names()
step(20)

# ------------------------------------------------------------ new game
from tuxemon.database.runtime import db  # noqa: E402
from tuxemon.launcher import GameLauncher  # noqa: E402

GameLauncher(client).launch(
    session=local_session,
    meta=db.mod_metadata.get_mod_metadata(client.config.mods[0]),
    remove_states=["StartState"],
)
assert wait_for("DialogState", frames=1200, skip_intro=False), names()
step(240)  # let the first page type out


def map_slug() -> str:
    current = client.map_manager.current_map
    return Path(str(getattr(current, "filename", ""))).stem if current else ""


def dialog_avatar() -> list[int] | None:
    """Size of the speaker's portrait on the open dialog, if it is drawn."""
    if "DialogState" not in names():
        return None
    dialog = client.get_state_by_name("DialogState")
    avatar = dialog.avatar
    if avatar is None or avatar not in dialog.sprites:
        return None
    return list(avatar.rect.size)


if SMOKE:
    result = {
        "map": map_slug(),
        "player_name": player().name,
        "profile_name": child.name,
        "owl": client.get_npc("nagmon_owl") is not None,
        "started": var("nagmon_started"),
        "dialog": "DialogState" in names(),
        "avatar": dialog_avatar(),
        "engine": rt.engine is not None,
    }
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0)

press()  # page 2: the fog
step(240)
shot("world_01_intro")

# Through the story to the starter choice.
for _ in range(80):
    if "ChoiceMonster" in names():
        break
    close_dialogs(1)
    step(6)
step(20)
shot("world_02_starter")
press(pygame.K_DOWN)  # from the name to "pick" under Agnite
press()
step(30)
if var("nagmon_starter") is None:  # menu layout changed: pick directly
    player().game_variables.set("nagmon_starter", "agnite")
    client.remove_state_by_name("ChoiceMonster")
for state in ("JournalInfoState",):
    while state in names():
        client.remove_state_by_name(state)

# Gifts, then the first practice question.
for _ in range(80):
    if "QuizState" in names() or var("nagmon_intro_done") == "yes":
        break
    close_dialogs(1)
    step(6)
quiz = (
    client.get_state_by_name("QuizState") if "QuizState" in names() else None
)
if quiz is not None and quiz.question is not None:
    quiz.answer(quiz.question.answer)
    step(20)
    quiz.finish()
for _ in range(80):
    if var("nagmon_intro_done") == "yes" and "DialogState" not in names():
        break
    close_dialogs(1)
    step(6)
step(30)
press()  # talk to the owl: rest and a tip
step(240)
shot("world_03_owl")
close_dialogs()

# A quiz in the world: Avi the shopkeeper.
ex = client.event_engine.execute_action
ex("teleport", ["player", "classic_hearthrock_city.tmx", 13, 15])
step(20)
ex("char_face", ["player", "up"])
step(10)
press()
step(240)
shot("world_04_shop")
for _ in range(60):
    if "QuizState" in names():
        break
    close_dialogs(1)
    step(6)
step(90)
if "QuizState" in names():
    shot("world_05_shop_quiz")
quiz = (
    client.get_state_by_name("QuizState") if "QuizState" in names() else None
)
if quiz is not None:
    if quiz.question is not None:
        quiz.answer(quiz.question.answer)
        step(20)
        shot("world_06_shop_feedback")
        quiz.finish()
    else:
        quiz.skip()
step(10)
close_dialogs()

# A wild battle with the new subject monsters (docs/kids/SDD_ART.md).
close_dialogs()
step(10)
ex("add_monster", ["alphabel", "10"])
party = player().monsters
party.insert(0, party.pop())
# skip: the action waits for the battle to end; let the frames run it.
ex("wild_encounter", ["geometrion", "6"], True)
for _ in range(60):
    if "CombatState" in names():
        break
    step(10)
step(240)
shot("world_08_battle")
print("battle:", names())
for _ in range(5):
    if names()[0] == "WorldState":
        break
    client.pop_state()
    step(2)
step(10)

# The academy master.
ex("teleport", ["player", "classic_gym_granite.tmx", 10, 6])
step(60)
ex("char_face", ["player", "up"])
step(10)
press()
step(240)
shot("world_07_academy_master")
print(
    "variables:",
    {
        k: v
        for k, v in player().game_variables.items()
        if "nagmon" in k or "academy" in k
    },
)

# The first badge: back in town the owl congratulates and wears its cape
# (docs/kids/SDD_ART.md §2.8).
for _ in range(5):
    if names()[0] == "WorldState":
        break
    client.pop_state()
    step(2)
player().game_variables.set("academy_granite_done", "yes")
ex(
    "transition_teleport",
    ["player", "classic_hearthrock_city.tmx", 29, 17, 0.3],
)
for _ in range(80):
    if dialog_text() and "DialogState" in names():
        break
    step(10)
press()  # page 2 of the congratulation
step(120)
for _ in range(6):
    if client.get_npc("nagmon_owl") is not None and "cape" in str(
        client.get_npc("nagmon_owl").appearance_manager.state.sprite_name
    ):
        break
    close_dialogs(1)
    step(30)
step(120)
shot("world_09_owl_cape")
owl = client.get_npc("nagmon_owl")
print("owl sprite:", owl.appearance_manager.state.sprite_name if owl else None)
