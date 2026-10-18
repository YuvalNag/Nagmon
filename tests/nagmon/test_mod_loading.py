# SPDX-License-Identifier: GPL-3.0
"""WP1: nagmon mod loads on top of tuxemon (see docs/kids/SDD_MOD_LOADING.md)."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml
from babel.messages.catalog import Catalog
from babel.messages.mofile import write_mo

from tuxemon.constants import asset_loader, paths
from tuxemon.database.config import ModMetadata
from tuxemon.frame_limiter import FrameLimiter
from tuxemon.locale.translator import TranslatorPo
from tuxemon.map.loader import MapLoader

REPO = Path(__file__).resolve().parents[2]


def _make_mod(root: Path, name: str, deps: list[str] | None = None) -> Path:
    mod = root / name
    mod.mkdir(parents=True)
    meta = {"slug": name}
    if deps is not None:
        meta["dependencies"] = deps
    (mod / "mod.yaml").write_text(yaml.safe_dump(meta), encoding="utf-8")
    return mod


@pytest.fixture
def fake_mods(tmp_path, monkeypatch):
    mods = tmp_path / "mods"
    mods.mkdir()
    monkeypatch.setattr(paths, "mods_folder", mods)
    monkeypatch.setattr(paths, "system_installed_folders", [])
    monkeypatch.setattr(paths, "BASEDIR", tmp_path / "nowhere")
    old_roots = asset_loader._MOD_ASSET_ROOTS
    old_flag = asset_loader._HAS_POPULATED
    yield mods
    asset_loader._MOD_ASSET_ROOTS = old_roots
    asset_loader._HAS_POPULATED = old_flag
    asset_loader.fetch_asset.cache_clear()


def _populate(mods: list[str]) -> tuple[Path, ...]:
    asset_loader.fetch_asset.cache_clear()
    asset_loader.fetch_mod_asset_roots(SimpleNamespace(mods=mods), force=True)
    return asset_loader._MOD_ASSET_ROOTS


def test_dependency_roots_follow_mod(fake_mods):
    a = _make_mod(fake_mods, "a", ["b"])
    b = _make_mod(fake_mods, "b")
    assert _populate(["a"]) == (a, b)


def test_cyclic_dependencies_do_not_loop(fake_mods):
    a = _make_mod(fake_mods, "a", ["b"])
    b = _make_mod(fake_mods, "b", ["a"])
    assert _populate(["a"]) == (a, b)


def test_nested_dependencies_are_flattened_once(fake_mods):
    a = _make_mod(fake_mods, "a", ["b", "c"])
    b = _make_mod(fake_mods, "b", ["c"])
    c = _make_mod(fake_mods, "c")
    assert _populate(["a"]) == (a, b, c)


def test_asset_only_in_dependency_is_found(fake_mods):
    _make_mod(fake_mods, "a", ["b"])
    b = _make_mod(fake_mods, "b")
    (b / "maps").mkdir()
    (b / "maps" / "town.tmx").write_text("x")
    _populate(["a"])
    assert (
        asset_loader.fetch_asset("maps", "town.tmx")
        == (b / "maps" / "town.tmx").as_posix()
    )


def test_asset_in_mod_wins_over_dependency(fake_mods):
    a = _make_mod(fake_mods, "a", ["b"])
    b = _make_mod(fake_mods, "b")
    for mod in (a, b):
        (mod / "gfx").mkdir()
        (mod / "gfx" / "icon.png").write_text(mod.name)
    _populate(["a"])
    assert (
        asset_loader.fetch_asset("gfx", "icon.png")
        == (a / "gfx" / "icon.png").as_posix()
    )


def test_mod_metadata_dependencies_field():
    base = dict(
        slug="x",
        description="d",
        name="X",
        version="1.0.0",
        starting_map="m.tmx",
        sprite="s",
        combat_sheet="c",
    )
    assert ModMetadata(**base).dependencies == []
    assert ModMetadata(**base, dependencies=["tuxemon"]).dependencies == [
        "tuxemon"
    ]


def _write_catalog(
    localedir: Path, locale: str, domain: str, messages: dict[str, str]
) -> None:
    catalog = Catalog(locale=locale, domain=domain)
    for msgid, msgstr in messages.items():
        catalog.add(msgid, msgstr)
    target = localedir / locale / "LC_MESSAGES"
    target.mkdir(parents=True, exist_ok=True)
    with open(target / f"{domain}.mo", "wb") as f:
        write_mo(f, catalog)


@pytest.fixture
def localedir(tmp_path):
    d = tmp_path / "l18n"
    _write_catalog(d, "en_US", "base", {"hello": "Hello", "shared": "Base"})
    _write_catalog(d, "he_IL", "base", {"hello": "שלום", "shared": "בסיס"})
    _write_catalog(
        d,
        "en_US",
        "nagmon",
        {"quiz_ok": "Correct!", "only_en": "English only", "shared": "N"},
    )
    _write_catalog(
        d, "he_IL", "nagmon", {"quiz_ok": "נכון!", "shared": "נגמון"}
    )
    return d


def _base_translator(localedir: Path, locale: str) -> TranslatorPo:
    return TranslatorPo(
        locale_name=locale,
        domain="base",
        localedir=localedir,
        extra_domains=("nagmon",),
    )


def test_chain_finds_mod_domain_in_active_language(localedir):
    t = _base_translator(localedir, "he_IL")
    assert t.translate("quiz_ok") == "נכון!"
    assert t.translate("hello") == "שלום"


def test_chain_mod_domain_overrides_base(localedir):
    assert _base_translator(localedir, "he_IL").translate("shared") == "נגמון"


def test_chain_falls_back_to_english_of_mod_domain(localedir):
    t = _base_translator(localedir, "he_IL")
    assert t.translate("only_en") == "English only"
    assert t.translate("missing_key") == "missing_key"


def test_chain_without_extra_domains_is_unchanged(localedir):
    t = TranslatorPo(locale_name="he_IL", domain="base", localedir=localedir)
    assert t.translate("hello") == "שלום"
    assert t.translate("quiz_ok") == "quiz_ok"


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.slept: list[float] = []

    def time(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


def test_frame_limiter_sleeps_remaining_time():
    clock = FakeClock()
    limiter = FrameLimiter(60, clock=clock.time, sleep=clock.sleep)
    limiter.start_frame()
    clock.now += 0.005
    limiter.end_frame()
    assert clock.slept == [pytest.approx(1 / 60 - 0.005)]


def test_frame_limiter_does_not_sleep_on_slow_frame():
    clock = FakeClock()
    limiter = FrameLimiter(60, clock=clock.time, sleep=clock.sleep)
    limiter.start_frame()
    clock.now += 0.05
    limiter.end_frame()
    assert clock.slept == []


def test_frame_limiter_disabled_for_zero_fps():
    clock = FakeClock()
    limiter = FrameLimiter(0, clock=clock.time, sleep=clock.sleep)
    limiter.start_frame()
    limiter.end_frame()
    assert clock.slept == []


def test_default_config_runs_nagmon_on_top_of_tuxemon():
    from tuxemon.user_config import CONFIG

    assert CONFIG.mods == ["nagmon"]
    meta = yaml.safe_load(
        (REPO / "mods" / "nagmon" / "mod.yaml").read_text(encoding="utf-8")
    )
    assert meta["dependencies"] == ["tuxemon"]
    db_config = yaml.safe_load(
        (REPO / "mods" / "db_config.yaml").read_text(encoding="utf-8")
    )
    assert "nagmon" in db_config["active_mods"]
    assert db_config["mod_dependencies"]["nagmon"] == ["tuxemon"]


def test_asset_roots_put_nagmon_before_tuxemon():
    import tuxemon.locale.locale  # noqa: F401  (populates the roots)

    roots = [p.name for p in asset_loader._MOD_ASSET_ROOTS]
    assert roots[:2] == ["nagmon", "tuxemon"]


def test_database_loads_with_nagmon_active():
    # A private ModData, so the shared runtime database stays untouched.
    from tuxemon.constants.paths import mods_folder
    from tuxemon.database.data import ModData
    from tuxemon.database.loader import ModelLoader
    from tuxemon.database.utils import load_config
    from tuxemon.db import load_model_map

    config = load_config((mods_folder / "db_config.yaml").as_posix())
    data = ModData(config, ModelLoader(load_model_map(config.model_map)))
    data.preload()
    data.load()
    assert data.mod_metadata.get_mod_metadata("nagmon").slug == "nagmon"
    assert data.lookup("rockitten", table="monster").slug == "rockitten"


def test_fetch_all_assets_lists_every_copy_lowest_priority_first(fake_mods):
    a = _make_mod(fake_mods, "a", ["b"])
    b = _make_mod(fake_mods, "b")
    for mod in (a, b):
        (mod / "maps").mkdir()
        (mod / "maps" / "town.yaml").write_text("events: {}")
    _populate(["a"])
    assert asset_loader.fetch_all_assets("maps", "town.yaml") == [
        (b / "maps" / "town.yaml").as_posix(),
        (a / "maps" / "town.yaml").as_posix(),
    ]
    assert asset_loader.fetch_all_assets("maps", "nothing.yaml") == []


def test_map_loads_event_scripts_added_by_other_mods(fake_mods):
    _make_mod(fake_mods, "a", ["b"])
    b = _make_mod(fake_mods, "b")
    a = fake_mods / "a"
    (b / "maps").mkdir()
    (a / "maps").mkdir()
    tmx = b / "maps" / "town.tmx"
    tmx.write_text("<map/>")
    (b / "maps" / "town.yaml").write_text("events: {}")
    (a / "maps" / "town.yaml").write_text("events: {}")
    _populate(["a"])
    files = MapLoader.resolve_yaml_files(
        None, SimpleNamespace(scenario=None), str(tmx)
    )
    assert files == [b / "maps" / "town.yaml", a / "maps" / "town.yaml"]
