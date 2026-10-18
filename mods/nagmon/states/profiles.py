# SPDX-License-Identifier: GPL-3.0
"""
"Who is playing?", the new-player wizard and the parent area
(docs/kids/SDD_PROFILES_UI.md).

The screens are thin: decisions live in nagmon.runtime, nagmon.family and
nagmon.game_flow, which are tested on their own.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from typing import TYPE_CHECKING, Any, ClassVar

from pygame_menu.locals import ALIGN_CENTER, POSITION_EAST
from pygame_menu.menu import Menu

from nagmon.family.profiles import ProfileError, validate_name
from nagmon.family.screentime import Action
from nagmon.game_flow import (
    AVATARS,
    GRADE_NAMES_HE,
    avatar_by_key,
    defaults_for_grade,
)
from nagmon.runtime import NagmonRuntime, get_runtime
from tuxemon.locale.locale import T
from tuxemon.menu.menu import PygameMenuState
from tuxemon.platform.const.graphics import BG_START_SCREEN
from tuxemon.tools import open_choice_dialog, open_dialog
from tuxemon.ui.menu_options import ChoiceOption, MenuOptions

if TYPE_CHECKING:
    from tuxemon.base_client import BaseClient

logger = logging.getLogger(__name__)

PIN_LENGTH = 4


def _later(client: BaseClient, fn: Callable[[], None]) -> None:
    """Runs ``fn`` on the next frame, after the current state closed."""
    client.queue_command(fn)


def say(client: BaseClient, text: str, then: Callable[[], None] | None = None):
    open_dialog(
        client,
        [text],
        dialog_speed="max",
        on_complete=(lambda: _later(client, then)) if then else None,
    )


def choose(
    client: BaseClient,
    options: Sequence[tuple[str, Callable[[], None]]],
    *,
    escape_key_exits: bool = True,
) -> None:
    """Shows a list of choices; the chosen action runs after it closes."""

    def wrap(fn: Callable[[], None]) -> Callable[[], None]:
        def run() -> None:
            client.pop_state()
            _later(client, fn)

        return run

    menu = MenuOptions(
        [
            ChoiceOption(key=f"o{i}", display_text=text, action=wrap(fn))
            for i, (text, fn) in enumerate(options)
        ]
    )
    open_choice_dialog(client, menu, escape_key_exits=escape_key_exits)


def ask_text(
    client: BaseClient,
    prompt: str,
    on_text: Callable[[str], None],
    *,
    char_limit: int = 16,
    initial: str = "",
) -> None:
    client.push_state(
        "InputMenu",
        prompt=prompt,
        callback=lambda text: _later(client, lambda: on_text(text)),
        char_limit=char_limit,
        initial=initial,
    )


# ---------------------------------------------------------------- parents


def with_parent(
    client: BaseClient, rt: NagmonRuntime, on_ok: Callable[[], None]
) -> None:
    """Runs ``on_ok`` once the parent proved it is them (PIN)."""
    if not rt.parent.has_pin():
        _set_pin(client, rt, on_ok)
        return
    wait = rt.parent.lockout_remaining()
    if wait > 0:
        say(client, T.format("nagmon_pin_locked", {"seconds": int(wait)}))
        return

    def check(text: str) -> None:
        result = rt.parent.verify_pin(text.strip())
        if result.ok:
            on_ok()
        elif result.locked_for > 0:
            say(
                client,
                T.format(
                    "nagmon_pin_locked", {"seconds": int(result.locked_for)}
                ),
            )
        else:
            say(client, T.translate("nagmon_pin_wrong"))

    ask_text(
        client, T.translate("nagmon_pin_prompt"), check, char_limit=PIN_LENGTH
    )


def _set_pin(
    client: BaseClient, rt: NagmonRuntime, then: Callable[[], None]
) -> None:
    def store(text: str) -> None:
        pin = text.strip()
        try:
            rt.parent.set_pin(pin)
        except ValueError:
            say(
                client,
                T.translate("nagmon_pin_invalid"),
                then=lambda: _set_pin(client, rt, then),
            )
            return
        rt.parent.save()
        say(client, T.translate("nagmon_pin_saved"), then=then)

    ask_text(
        client,
        T.translate("nagmon_set_pin_prompt"),
        store,
        char_limit=PIN_LENGTH,
    )


# ---------------------------------------------------------------- wizard


def new_child_wizard(
    client: BaseClient,
    rt: NagmonRuntime,
    on_done: Callable[[], None],
) -> None:
    """Name, then grade, then character; then the profile is created."""

    def ask_name(initial: str = "") -> None:
        ask_text(
            client,
            T.translate("nagmon_child_name_prompt"),
            got_name,
            initial=initial,
        )

    def got_name(text: str) -> None:
        try:
            name = validate_name(text)
        except ProfileError:
            say(
                client,
                T.translate("nagmon_name_invalid"),
                then=lambda: ask_name(text),
            )
            return
        choose(
            client,
            [
                (grade_name(g), lambda g=g: got_grade(name, g))
                for g in range(len(GRADE_NAMES_HE))
            ],
            escape_key_exits=False,
        )

    def got_grade(name: str, grade: int) -> None:
        choose(
            client,
            [
                (
                    a.label_he + f" {i + 1}",
                    lambda a=a: got_avatar(name, grade, a.key),
                )
                for i, a in enumerate(AVATARS)
            ],
            escape_key_exits=False,
        )

    def got_avatar(name: str, grade: int, avatar: str) -> None:
        fields = defaults_for_grade(grade)
        try:
            rt.store.create(name=name, avatar=avatar, **fields)
        except ProfileError as e:
            logger.warning("Could not create profile: %s", e)
            say(client, T.translate("nagmon_name_invalid"), then=ask_name)
            return
        say(
            client,
            T.format("nagmon_child_created", {"name": name}),
            then=on_done,
        )

    ask_name()


def grade_name(grade: int) -> str:
    return T.translate(f"nagmon_grade_{grade}")


# ---------------------------------------------------------------- screens


class ProfileSelectState(PygameMenuState):
    """Big list of the children; picking one starts their session."""

    name: ClassVar[str] = "ProfileSelectState"

    def __init__(self, client: BaseClient, **kwargs: Any) -> None:
        width, height = client.context.resolution
        super().__init__(client=client, height=height, width=width, **kwargs)
        theme = self._setup_theme(BG_START_SCREEN)
        theme.scrollarea_position = POSITION_EAST
        theme.widget_alignment = ALIGN_CENTER
        self._menu_config["theme"] = theme
        self.escape_key_exits = False
        self.add_menu_items(self.menu)
        self.reset_theme()

    @property
    def rt(self) -> NagmonRuntime:
        rt = get_runtime()
        assert rt is not None, "ProfileSelectState needs the Nagmon runtime"
        return rt

    def add_menu_items(self, menu: Menu) -> None:
        menu.add.label(
            T.translate("nagmon_who_plays"),
            font_size=self.font_type.big,
            label_id="who_plays",
        )
        profiles = self.rt.store.list()
        for profile in profiles:
            stars = 0
            try:
                learner = self.rt.store.load_learner_dict(profile.id)
                stars = sum((learner.get("stars") or {}).values())
            except (KeyError, AttributeError, TypeError):
                pass
            menu.add.button(
                T.format(
                    "nagmon_child_button",
                    {"name": profile.name, "stars": stars},
                ),
                lambda pid=profile.id: self.pick(pid),
                font_size=self.font_type.big,
                button_id=f"child_{profile.id}",
            )
        menu.add.button(
            T.translate("nagmon_new_child"),
            self.add_child,
            font_size=self.font_type.medium,
            button_id="new_child",
        )
        menu.add.button(
            T.translate("nagmon_parents"),
            self.open_parents,
            font_size=self.font_type.medium,
            button_id="parents",
        )

    def rebuild(self) -> None:
        self.menu.clear()
        self.add_menu_items(self.menu)

    def pick(self, pid: str) -> None:
        decision = self.rt.start_play(pid)
        if decision.action is Action.MUST_STOP:
            say(self.client, decision.message_he)
            return
        if decision.action is Action.WARN_SOON and decision.message_he:
            say(self.client, decision.message_he)
        self.client.pop_state(self)

    def add_child(self) -> None:
        with_parent(
            self.client,
            self.rt,
            lambda: new_child_wizard(self.client, self.rt, self.rebuild),
        )

    def open_parents(self) -> None:
        with_parent(
            self.client,
            self.rt,
            lambda: self.client.push_state("ParentMenuState"),
        )

    def resume(self) -> None:
        super().resume()
        self.rebuild()


class ParentMenuState(PygameMenuState):
    """The parent area: players, PIN, Shabbat mode, voices."""

    name: ClassVar[str] = "ParentMenuState"

    def __init__(self, client: BaseClient, **kwargs: Any) -> None:
        width, height = client.context.resolution
        super().__init__(client=client, height=height, width=width, **kwargs)
        theme = self._setup_theme(BG_START_SCREEN)
        theme.scrollarea_position = POSITION_EAST
        theme.widget_alignment = ALIGN_CENTER
        self._menu_config["theme"] = theme
        self.add_menu_items(self.menu)
        self.reset_theme()

    @property
    def rt(self) -> NagmonRuntime:
        rt = get_runtime()
        assert rt is not None
        return rt

    def add_menu_items(self, menu: Menu) -> None:
        s = self.rt.parent.settings
        menu.add.label(
            T.translate("nagmon_parents"),
            font_size=self.font_type.big,
        )
        buttons: list[tuple[str, str, Callable[[], None]]] = [
            ("players", T.translate("nagmon_parent_players"), self.players),
            (
                "shabbat",
                T.translate(
                    "nagmon_shabbat_on"
                    if s.shabbat_mode
                    else "nagmon_shabbat_off"
                ),
                self.toggle_shabbat,
            ),
            (
                "minutes",
                T.format(
                    "nagmon_daily_minutes",
                    {"minutes": s.default_limits.daily_max_minutes or 0},
                ),
                self.daily_minutes,
            ),
            ("pin", T.translate("nagmon_change_pin"), self.change_pin),
            ("back", T.translate("nagmon_back"), self.close),
        ]
        for key, text, action in buttons:
            menu.add.button(
                text,
                action,
                font_size=self.font_type.medium,
                button_id=f"parent_{key}",
            )

    def rebuild(self) -> None:
        self.menu.clear()
        self.add_menu_items(self.menu)

    def resume(self) -> None:
        super().resume()
        self.rebuild()

    def close(self) -> None:
        self.client.pop_state(self)

    def toggle_shabbat(self) -> None:
        s = self.rt.parent.settings
        s.shabbat_mode = not s.shabbat_mode
        s.holiday_mode = s.shabbat_mode
        self.rt.parent.save()
        self.rebuild()

    def daily_minutes(self) -> None:
        import dataclasses

        def set_minutes(minutes: int) -> None:
            s = self.rt.parent.settings
            s.default_limits = dataclasses.replace(
                s.default_limits, daily_max_minutes=minutes
            )
            self.rt.parent.save()
            self.rebuild()

        choose(
            self.client,
            [
                (
                    T.format("nagmon_daily_minutes", {"minutes": m}),
                    lambda m=m: set_minutes(m),
                )
                for m in (30, 45, 60, 90, 120)
            ],
        )

    def change_pin(self) -> None:
        def store(text: str) -> None:
            try:
                self.rt.parent.set_pin(text.strip())
            except ValueError:
                say(self.client, T.translate("nagmon_pin_invalid"))
                return
            self.rt.parent.save()
            say(self.client, T.translate("nagmon_pin_saved"))

        ask_text(
            self.client,
            T.translate("nagmon_set_pin_prompt"),
            store,
            char_limit=PIN_LENGTH,
        )

    def players(self) -> None:
        options = [
            (p.name, lambda pid=p.id: self.player(pid))
            for p in self.rt.store.list()
        ]
        options.append((T.translate("nagmon_restore_player"), self.restore))
        choose(self.client, options)

    def player(self, pid: str) -> None:
        profile = self.rt.store.get(pid)

        def set_grade(grade: int) -> None:
            profile.grade = grade
            self.rt.store.save(profile)

        def set_level(level: int) -> None:
            profile.language_level = level
            profile.language_locked = True
            self.rt.store.save(profile)

        def delete() -> None:
            if self.rt.active is not None and self.rt.active.id == pid:
                self.rt.stop_play()
            self.rt.store.delete(pid)
            say(
                self.client,
                T.format("nagmon_player_deleted", {"name": profile.name}),
            )

        choose(
            self.client,
            [
                (
                    T.translate("nagmon_set_grade"),
                    lambda: choose(
                        self.client,
                        [
                            (grade_name(g), lambda g=g: set_grade(g))
                            for g in range(len(GRADE_NAMES_HE))
                        ],
                    ),
                ),
                (
                    T.translate("nagmon_set_language_level"),
                    lambda: choose(
                        self.client,
                        [
                            (
                                T.translate(f"nagmon_language_level_{lv}"),
                                lambda lv=lv: set_level(lv),
                            )
                            for lv in range(6)
                        ],
                    ),
                ),
                (T.translate("nagmon_delete_player"), delete),
            ],
        )

    def restore(self) -> None:
        trash = self.rt.store.list_trash()
        if not trash:
            say(self.client, T.translate("nagmon_trash_empty"))
            return
        choose(
            self.client,
            [
                (e.name, lambda e=e: self.rt.store.restore(e.entry))
                for e in trash
            ],
        )


def avatar_template(avatar_key: str) -> tuple[str, str, str]:
    """(sprite, combat sheet, gender) for ``set_template``."""
    avatar = avatar_by_key(avatar_key)
    return avatar.sprite, avatar.combat_sheet, avatar.gender
