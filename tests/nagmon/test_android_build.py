"""
WP13: what goes into the Android app and how it is built
(docs/kids/SDD_ANDROID.md §2.4).
"""

from __future__ import annotations

import configparser
import importlib.util
import io
import subprocess
import sys
import tarfile
import types
import zipfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "tools" / "android"))

import stage  # noqa: E402

RECIPES = REPO / "buildconfig" / "android" / "recipes"


def _fake_repo(root: Path) -> Path:
    files = {
        "run_tuxemon.py": "print('game')\n",
        "LICENSE": "GPL\n",
        "tuxemon/__init__.py": "",
        "tuxemon/client.py": "",
        "tuxemon/__pycache__/client.cpython-313.pyc": "x",
        "nagmon/__init__.py": "",
        "nagmon/android/setup.py": "",
        "mods/db_config.yaml": "a: 1\n",
        "mods/tuxemon/maps/town.tmx": "<map/>",
        "mods/tuxemon/music/song.ogg": "ogg",
        "mods/tuxemon/gfx/kelvin palette.ase": "x",
        "mods/tuxemon/gfx/sheet.xcf": "x",
        "mods/tuxemon/music/patches/Xsynth_8bit": "x",
        "mods/nagmon/l18n/he_IL/LC_MESSAGES/nagmon.po": "msgid",
        "mods/nagmon/gfx/emoji/1f989.png": "png",
        "tests/test_x.py": "",
        "docs/kids/GAME_PLAN.md": "",
        "tools/dev/tour.py": "",
        "buildconfig/build_config.yaml": "name: Nagmon\nversion: 1.2.3\n",
    }
    for rel, text in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    (root / "buildconfig/android").mkdir(parents=True)
    for rel in ("main.py",):
        (root / "buildconfig/android" / rel).write_text(
            (REPO / "buildconfig/android" / rel).read_text()
        )
    recipes = root / "buildconfig/android/recipes/pygame_ce"
    recipes.mkdir(parents=True)
    (recipes / "__init__.py").write_text("recipe = None\n")
    return root


@pytest.fixture
def staged(tmp_path):
    repo = _fake_repo(tmp_path / "repo")
    out = tmp_path / "app"
    report = stage.stage(repo, out, build_number=7)
    return repo, out, report


def test_game_code_and_content_are_staged(staged):
    _, out, _ = staged
    for rel in (
        "run_tuxemon.py",
        "LICENSE",
        "tuxemon/client.py",
        "nagmon/android/setup.py",
        "mods/db_config.yaml",
        "mods/tuxemon/maps/town.tmx",
        "mods/tuxemon/music/song.ogg",
        "mods/nagmon/l18n/he_IL/LC_MESSAGES/nagmon.po",
    ):
        assert (out / rel).is_file(), rel


def test_development_files_stay_out(staged):
    _, out, _ = staged
    for rel in (
        "tests",
        "docs",
        "tools",
        "tuxemon/__pycache__",
        "mods/tuxemon/gfx/sheet.xcf",
        "mods/tuxemon/gfx/kelvin palette.ase",
        "mods/tuxemon/music/patches/Xsynth_8bit",
    ):
        assert not (out / rel).exists(), rel


def test_entry_point_and_recipes_are_in_place(staged):
    _, out, _ = staged
    assert "prepare_environment" in (out / "main.py").read_text()
    assert (out / "recipes/pygame_ce/__init__.py").is_file()
    assert (out / "icon.png").is_file()
    assert (out / "presplash.png").is_file()


def _spec(out: Path) -> configparser.ConfigParser:
    spec = configparser.ConfigParser(interpolation=None)
    spec.read(out / "buildozer.spec")
    return spec


def test_spec_packages_every_file_type_that_was_staged(staged):
    _, out, report = staged
    exts = set(_spec(out)["app"]["source.include_exts"].split(","))
    assert {"py", "yaml", "tmx", "ogg", "po", "png"} <= exts
    assert "xcf" not in exts and "pyc" not in exts
    assert exts == set(report.extensions)


def test_spec_versions(staged):
    _, out, _ = staged
    app = _spec(out)["app"]
    assert app["version"] == "1.2.3"
    assert app["android.numeric_version"] == "7"


def test_spec_targets_the_phone_and_keeps_data_private(staged):
    _, out, _ = staged
    app = _spec(out)["app"]
    assert app["android.archs"] == "arm64-v8a"
    assert int(app["android.api"]) >= 35
    assert app["android.allow_backup"] == "False"
    assert app["android.permissions"] == "INTERNET"
    assert app["orientation"].startswith("landscape")
    assert app["p4a.local_recipes"] == "./recipes"


def test_build_details_for_crash_reports(staged, monkeypatch):
    import json

    _, out, _ = staged
    info = json.loads((out / "build_info.json").read_text())
    assert info["version"] == "1.2.3"
    assert info["build"] == "7"
    assert info["arch"] == "arm64-v8a"
    assert "commit" in info


def test_an_emulator_build_targets_x86_64(tmp_path):
    repo = _fake_repo(tmp_path / "repo")
    stage.stage(repo, tmp_path / "app", arch="x86_64")
    assert _spec(tmp_path / "app")["app"]["android.archs"] == "x86_64"


def test_requirements_use_the_android_builds():
    reqs = stage.REQUIREMENTS
    names = {r.split("==")[0] for r in reqs}
    # Local recipes instead of what does not build for Android.
    assert {"pygame_ce", "python_bidi_pure", "pyyaml_pure"} <= names
    assert "pygame" not in names and "python-bidi" not in names
    # Desktop-only speech engines stay out; the phone's own voice is used.
    assert not names & {"edge-tts", "pyttsx3", "comtypes"}
    assert {"pyjnius", "android", "certifi", "tzdata"} <= names
    # pydantic must match the pydantic-core recipe exactly.
    assert "pydantic==2.12.3" in reqs and "pydantic-core" in names


def test_every_imported_library_is_packaged():
    # The third-party modules the game imports while playing (recorded
    # from tools/dev/touch_tour.py), by the requirement that brings each.
    provided_by = {
        "PIL": "Pillow",
        "annotated_types": "annotated-types",
        "astral": "astral",
        "babel": "babel",
        "bidi": "python_bidi_pure",
        "natsort": "natsort",
        "packaging": "packaging",
        "prompt_toolkit": "prompt-toolkit",
        "pydantic": "pydantic",
        "pydantic_core": "pydantic-core",
        "pygame": "pygame_ce",
        "pygame_menu": "pygame-menu-ce",
        "pyluach": "pyluach",
        "pyperclip": "pyperclip",
        "pyscroll": "pyscroll",
        "pytmx": "pytmx",
        "typing_extensions": "typing-extensions",
        "typing_inspection": "typing-inspection",
        "wcwidth": "wcwidth",
        "websockets": "websockets",
        "yaml": "pyyaml_pure",
    }
    names = {r.split("==")[0] for r in stage.REQUIREMENTS}
    missing = {m: r for m, r in provided_by.items() if r not in names}
    assert missing == {}


def _load_recipe(name: str, monkeypatch) -> types.ModuleType:
    """Imports a recipe with a stand-in for python-for-android."""

    class _Base:
        def __init__(self, *a, **k):
            pass

    p4a = types.ModuleType("pythonforandroid")
    recipe_mod = types.ModuleType("pythonforandroid.recipe")
    recipe_mod.Recipe = _Base
    recipe_mod.PythonRecipe = _Base
    recipes_pkg = types.ModuleType("pythonforandroid.recipes")
    pygame_mod = types.ModuleType("pythonforandroid.recipes.pygame")
    pygame_mod.Pygame2Recipe = _Base
    logger = types.ModuleType("pythonforandroid.logger")
    logger.info = lambda *a, **k: None
    for mod_name, mod in {
        "pythonforandroid": p4a,
        "pythonforandroid.recipe": recipe_mod,
        "pythonforandroid.recipes": recipes_pkg,
        "pythonforandroid.recipes.pygame": pygame_mod,
        "pythonforandroid.logger": logger,
    }.items():
        monkeypatch.setitem(sys.modules, mod_name, mod)
    spec = importlib.util.spec_from_file_location(
        f"recipe_{name}", RECIPES / name / "__init__.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _pinned(package: str) -> str:
    for line in (REPO / "requirements.txt").read_text().splitlines():
        if line.lower().startswith(package + "=="):
            return line.split("==")[1].strip()
    raise AssertionError(f"{package} is not pinned")


def test_pygame_ce_recipe_matches_the_desktop_version(monkeypatch):
    module = _load_recipe("pygame_ce", monkeypatch)
    recipe = module.recipe
    assert recipe.version == _pinned("pygame-ce")
    assert recipe.site_packages_name == "pygame"
    assert "pygame-ce" in recipe.url.format(version=recipe.version)
    assert "pygame" in recipe.conflicts


def test_python_bidi_recipe_matches_the_desktop_version(monkeypatch):
    module = _load_recipe("python_bidi_pure", monkeypatch)
    assert module.recipe.version == _pinned("python-bidi")


def test_pure_bidi_copy_works_without_the_rust_part(monkeypatch, tmp_path):
    module = _load_recipe("python_bidi_pure", monkeypatch)
    sdist = tmp_path / "python_bidi" / "bidi"
    sdist.mkdir(parents=True)
    installed = Path(importlib.util.find_spec("bidi").origin).parent
    for name in ("algorithm.py", "mirror.py", "__init__.py"):
        (sdist / name).write_text((installed / name).read_text())
    site = tmp_path / "site-packages"
    module.install_pure_bidi(sdist.parent, site)
    assert sorted(p.name for p in (site / "bidi").iterdir()) == [
        "__init__.py",
        "algorithm.py",
        "mirror.py",
    ]
    code = (
        "import sys; sys.path.insert(0, sys.argv[1]);"
        "from bidi import algorithm;"
        "print(algorithm.get_display('abc שלום'))"
    )
    out = subprocess.run(
        [sys.executable, "-I", "-c", code, str(site)],
        capture_output=True,
        text=True,
        check=True,
    )
    assert out.stdout.strip() == "abc םולש"


def test_pure_yaml_copy(monkeypatch, tmp_path):
    module = _load_recipe("pyyaml_pure", monkeypatch)
    assert module.recipe.version == "6.0.3"
    sdist = tmp_path / "pyyaml"
    (sdist / "lib" / "yaml").mkdir(parents=True)
    (sdist / "lib" / "yaml" / "__init__.py").write_text("X = 1\n")
    (sdist / "lib" / "yaml" / "cyaml.py").write_text(
        "from yaml._yaml import *\n"
    )
    site = tmp_path / "site-packages"
    module.install_pure_yaml(sdist, site)
    assert (site / "yaml" / "__init__.py").read_text() == "X = 1\n"
    assert (site / "yaml" / "cyaml.py").is_file()


def test_pygame_ce_installs_what_setup_py_built(monkeypatch, tmp_path):
    # pip install . would start a native meson build of pygame-ce.
    module = _load_recipe("pygame_ce", monkeypatch)
    assert module.recipe.build_cmd == "build"
    built = (
        tmp_path / "src" / "build" / "lib.linux-aarch64-cpython-314" / "pygame"
    )
    (built / "_sdl2").mkdir(parents=True)
    (built / "__init__.py").write_text("")
    (built / "base.so").write_text("elf")
    (built / "_sdl2" / "video.so").write_text("elf")
    install = tmp_path / "python-installs"
    target = module.install_built_package(tmp_path / "src", install)
    assert target == install / "pygame"
    assert (install / "pygame" / "base.so").is_file()
    assert (install / "pygame" / "_sdl2" / "video.so").is_file()


def test_pygame_ce_without_a_build_fails_loudly(monkeypatch, tmp_path):
    module = _load_recipe("pygame_ce", monkeypatch)
    with pytest.raises(RuntimeError):
        module.install_built_package(tmp_path, tmp_path / "out")


# --------------------------------------------------- what the APK must hold

import check_apk  # noqa: E402


def _tar(members) -> bytes:
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w:gz") as tf:
        for name in members:
            info = tarfile.TarInfo(name)
            info.size = 0
            tf.addfile(info, io.BytesIO(b""))
    return data.getvalue()


def _apk(tmp_path, *, drop=(), extra=(), arch="arm64-v8a"):
    """
    A fake APK shaped like python-for-android's: the byte-compiled app in
    assets/private.tar, the libraries in lib/arm64-v8a/libpybundle.so.
    """
    site = "_python_bundle/site-packages"
    app = [
        "main.pyc",
        "run_tuxemon.pyc",
        "tuxemon/__init__.pyc",
        "nagmon/__init__.pyc",
        "mods/tuxemon/mod.yaml",
        "mods/nagmon/mod.yaml",
        "mods/db_config.yaml",
    ]
    libs = [
        f"{site}/pygame/base.cpython-314-aarch64-linux-android.so",
        f"{site}/pydantic_core/_pydantic_core.cpython-314.so",
    ]
    libs += [f"{site}/{lib}/__init__.pyc" for lib in check_apk.LIBRARIES]
    keep = lambda names: [m for m in names if not any(d in m for d in drop)]  # noqa: E731
    apk = tmp_path / "nagmon.apk"
    with zipfile.ZipFile(apk, "w") as zf:
        zf.writestr("assets/private.tar", _tar(keep(app)))
        zf.writestr(
            f"lib/{arch}/libpybundle.so", _tar(keep(libs) + list(extra))
        )
        zf.writestr(f"lib/{arch}/libSDL2.so", b"")
        zf.writestr(f"lib/{arch}/libpython3.14.so", b"")
    return apk


def test_complete_apk_passes(tmp_path):
    assert check_apk.problems(check_apk.names_in_apk(_apk(tmp_path))) == []


@pytest.mark.parametrize(
    ("drop", "expected"),
    [
        pytest.param(
            ("mods/nagmon/",),
            "missing app folder mods/nagmon/",
            id="no-content",
        ),
        pytest.param(("/yaml/",), "missing library yaml", id="no-yaml"),
        pytest.param(
            ("base.cpython",), "missing compiled pygame", id="pygame-not-built"
        ),
        pytest.param(
            ("main.pyc",), "missing app file main.py", id="no-entry-point"
        ),
    ],
)
def test_incomplete_apk_is_named(tmp_path, drop, expected):
    found = check_apk.problems(
        check_apk.names_in_apk(_apk(tmp_path, drop=drop))
    )
    assert expected in found


def test_emulator_apk_passes(tmp_path):
    apk = _apk(tmp_path, arch="x86_64")
    assert check_apk.problems(check_apk.names_in_apk(apk)) == []


def test_native_bidi_is_caught(tmp_path):
    apk = _apk(tmp_path, extra=["_python_bundle/site-packages/bidi/bidi.so"])
    found = check_apk.problems(check_apk.names_in_apk(apk))
    assert "bidi has native code (expected pure Python)" in found


def test_layout_counts_files_per_folder():
    counts = check_apk.layout(["a/b/c.py", "a/b/d.py", "a/e.py"], depth=2)
    assert counts == {"a/b": 2, "a/e.py": 1}


def test_every_apk_is_opened_on_an_emulator():
    import yaml

    workflows = REPO / ".github" / "workflows"
    build = yaml.safe_load((workflows / "android.yml").read_text())
    job = build["jobs"]["emulator"]
    assert job["needs"] == "apk"
    assert job["uses"] == "./.github/workflows/android-smoke.yml"
    smoke = (workflows / "android-smoke.yml").read_text()
    assert "bash tools/android/smoke.sh apk" in smoke
    # The emulator cannot run the phone's arm64 code (its ARM translator
    # stops on some instructions), so it gets its own x86_64 build.
    legs = build["jobs"]["apk"]["strategy"]["matrix"]["include"]
    assert {leg["arch"] for leg in legs} == {"arm64-v8a", "x86_64"}
    assert "pattern: nagmon-emulator-*" in smoke
    script = (REPO / "tools" / "android" / "smoke.sh").read_text()
    # It fails on a stopped app or a Python error, not only on install.
    assert "the app stopped" in script and "Traceback" in script


def test_the_compiled_app_boots_before_the_long_build():
    import yaml

    build = yaml.safe_load(
        (REPO / ".github/workflows/android.yml").read_text()
    )
    names = [s.get("name", "") for s in build["jobs"]["apk"]["steps"]]
    boot = names.index("Boot the app the way the phone holds it")
    assert boot < names.index("Build")
    script = (REPO / "tools/android/compiled_boot.sh").read_text()
    assert (
        "-OO -m compileall -b" in script and "-name '*.py' -delete" in script
    )


def test_every_build_is_signed_with_one_kept_key():
    """
    Without one key, every build needs an uninstall on the phone, which
    deletes the children's progress (SDD_ANDROID.md §2.4). The build owns
    the key (Gradle's own debug key lives where no cache can keep it) and
    fails when the APK is signed with anything else.
    """
    import yaml

    text = (REPO / ".github/workflows/android.yml").read_text()
    build = yaml.safe_load(text)
    steps = build["jobs"]["apk"]["steps"]
    names = [s.get("name", "") for s in steps]
    keep = steps[names.index("Keep one signing key for every build")]
    assert keep["uses"].startswith("actions/cache@")
    assert keep["with"]["path"] == "~/.nagmon-signing"
    assert (
        names.index("Keep one signing key for every build")
        < names.index("Signing key")
        < names.index("Build")
        < names.index("Signing key fingerprint")
    )
    assert "buildozer android release" in text
    assert "buildozer android debug" not in text
    fingerprint = steps[names.index("Signing key fingerprint")]["run"]
    assert "exit 1" in fingerprint and "$P4A_RELEASE_KEYSTORE" in fingerprint
