# SPDX-License-Identifier: GPL-3.0
"""
Field data to GitHub (docs/kids/SDD_FIELD_DATA.md §2.1): the connection
check, writing files to the private data repo, keeping the token secret,
and the install id.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

from nagmon.ai.config import load_keys, save_keys
from nagmon.ai.fakes import FakeTransport, json_response
from nagmon.ai.providers import TransportError, TransportTimeout
from nagmon.field_data.github import (
    CHECK_TTL,
    DEFAULT_REPO,
    MAX_TRIES,
    TIMEOUT,
    Code,
    GitHubAccess,
    GitHubClient,
    forget_access,
    load_access,
    save_access,
)
from nagmon.field_data.uploads import FieldData, install_id, upload_path

REPO = Path(__file__).resolve().parents[2]
TOKEN = "github_pat_" + "11ABCDEFG0" * 6
DATA_REPO = "YuvalNag/nagmon-data"
API = f"https://api.github.com/repos/{DATA_REPO}"
NOW = datetime(2026, 10, 19, 14, 30, 5, tzinfo=timezone.utc)


class Clock:
    def __init__(self, t: float = NOW.timestamp()) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t


def repo_info(*, private=True, push=True, status=200):
    return json_response(
        status,
        {
            "full_name": DATA_REPO,
            "private": private,
            "default_branch": "main",
            "permissions": {"admin": False, "push": push, "pull": True},
        },
    )


def created(path="devices/x/logs/a.txt"):
    return json_response(201, {"content": {"path": path}, "commit": {}})


def fake(*put_responses, info=None) -> FakeTransport:
    transport = FakeTransport()
    if put_responses:
        transport.add("PUT", "/contents/", *put_responses)
    transport.add("GET", API, info or repo_info())
    return transport


def client(transport, clock=None) -> GitHubClient:
    return GitHubClient(
        GitHubAccess(TOKEN, DATA_REPO),
        transport=transport,
        clock=clock or Clock(),
    )


@pytest.fixture(autouse=True)
def fresh_checks():
    GitHubClient.forget_checks()
    yield
    GitHubClient.forget_checks()


# ------------------------------------------------------------- the check


def test_a_private_repo_with_push_is_connected():
    transport = fake()
    check = client(transport).check()
    assert check.code is Code.OK and check.ok
    assert check.repo == DATA_REPO
    call = transport.calls[-1]
    assert call.method == "GET" and call.url == API
    assert call.headers["Authorization"] == f"Bearer {TOKEN}"
    assert call.headers["Accept"] == "application/vnd.github+json"
    assert call.headers["User-Agent"]
    assert call.timeout == TIMEOUT == 30.0


def test_a_public_repo_is_refused():
    check = client(fake(info=repo_info(private=False))).check()
    assert check.code is Code.PUBLIC and not check.ok


@pytest.mark.parametrize(
    ("response", "code"),
    [
        (json_response(401, {"message": "Bad credentials"}), Code.BAD_TOKEN),
        (json_response(403, {"message": "nope"}), Code.NO_PERMISSION),
        (repo_info(push=False), Code.NO_PERMISSION),
        (json_response(404, {"message": "Not Found"}), Code.NOT_FOUND),
        (json_response(500, {"message": "oops"}), Code.FAILED),
        (json_response(200, ["not", "a", "repo"]), Code.FAILED),
    ],
)
def test_failed_checks_say_why(response, code):
    assert client(fake(info=response)).check().code is code


def test_a_rate_limit_is_not_called_a_missing_permission():
    limited = json_response(
        403,
        {"message": "API rate limit exceeded"},
        {"X-RateLimit-Remaining": "0"},
    )
    assert client(fake(info=limited)).check().code is Code.FAILED


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (TransportError("no route"), Code.OFFLINE),
        (TransportTimeout("slow"), Code.TIMEOUT),
    ],
)
def test_no_network_is_named(error, code):
    assert client(fake(info=error)).check().code is code


def test_every_result_has_a_hebrew_message():
    """The parent sees each code as a sentence in Hebrew (and English)."""
    hebrew = re.compile("[֐-׿]")
    for locale in ("he_IL", "en_US"):
        po = (
            REPO
            / "mods"
            / "nagmon"
            / "l18n"
            / locale
            / "LC_MESSAGES"
            / "nagmon.po"
        ).read_text("utf-8")
        for code in Code:
            found = re.search(
                rf'^msgid "nagmon_github_{code.value}"\nmsgstr "([^"]+)"',
                po,
                re.M,
            )
            assert found, (locale, code)
            if locale == "he_IL":
                assert hebrew.search(found.group(1)), code


def test_the_check_is_kept_for_an_hour():
    transport = fake()
    clock = Clock()
    first = client(transport, clock)
    first.check()
    # A new client for the same token (the screen opened again) reuses it.
    assert client(transport, clock).cached() is not None
    client(transport, clock).check()
    assert len(transport.calls) == 1
    clock.t += CHECK_TTL + 1
    assert client(transport, clock).cached() is None
    client(transport, clock).check()
    assert len(transport.calls) == 2


def test_another_token_is_checked_again():
    transport = fake()
    client(transport).check()
    GitHubClient(
        GitHubAccess(TOKEN + "x", DATA_REPO), transport=transport
    ).check()
    assert len(transport.calls) == 2


# ------------------------------------------------------------ writing


def _put_body(call) -> dict:
    return json.loads(call.body.decode("utf-8"))


def test_a_file_is_written_to_the_default_branch_as_base64():
    transport = fake(created())
    content = "שלום log\n".encode()
    result = client(transport).put(
        "devices/ab12cd34/logs/20261019T143005Z.txt",
        content,
        "Field data: log",
    )
    assert result.ok and result.code is Code.OK
    put = [c for c in transport.calls if c.method == "PUT"]
    assert len(put) == 1
    assert (
        put[0].url
        == f"{API}/contents/devices/ab12cd34/logs/20261019T143005Z.txt"
    )
    body = _put_body(put[0])
    assert base64.b64decode(body["content"]) == content
    assert body["message"] == "Field data: log"
    assert "branch" not in body and "sha" not in body
    assert put[0].timeout == 30.0


def test_the_repo_is_checked_fresh_before_every_upload():
    """A repo made public a minute ago gets nothing, cache or not."""
    transport = FakeTransport()
    transport.add("PUT", "/contents/", created())
    transport.add("GET", API, repo_info(), repo_info(private=False))
    gh = client(transport)
    assert gh.check().ok
    result = gh.put("devices/x/logs/a.txt", b"x", "m")
    assert result.code is Code.PUBLIC
    assert not [c for c in transport.calls if c.method == "PUT"]


@pytest.mark.parametrize(
    "info",
    [repo_info(private=False), repo_info(push=False), json_response(401, {})],
)
def test_nothing_is_written_when_the_check_fails(info):
    transport = fake(created(), info=info)
    assert not client(transport).put("devices/x/logs/a.txt", b"x", "m").ok
    assert not [c for c in transport.calls if c.method == "PUT"]


def test_an_empty_new_repo_gets_its_first_file():
    """The Contents API creates the first commit; 409 while it is being
    set up is retried."""
    empty = json_response(409, {"message": "Git Repository is empty."})
    transport = fake(empty, created())
    result = client(transport).put("devices/x/logs/a.txt", b"x", "m")
    assert result.ok
    assert len([c for c in transport.calls if c.method == "PUT"]) == 2


def test_a_moved_branch_is_retried_three_times_then_fails():
    moved = json_response(422, {"message": "Update is not a fast forward"})
    transport = fake(moved)
    result = client(transport).put("devices/x/logs/a.txt", b"x", "m")
    assert result.code is Code.CONFLICT and not result.ok
    assert (
        len([c for c in transport.calls if c.method == "PUT"])
        == MAX_TRIES
        == 3
    )


def test_a_retry_that_succeeds_is_a_success():
    moved = json_response(409, {"message": "conflict"})
    transport = fake(moved, moved, created())
    assert client(transport).put("devices/x/logs/a.txt", b"x", "m").ok


@pytest.mark.parametrize(
    ("response", "code"),
    [
        (
            json_response(403, {"message": "Resource not accessible"}),
            Code.NO_PERMISSION,
        ),
        (json_response(401, {}), Code.BAD_TOKEN),
        (json_response(404, {}), Code.NOT_FOUND),
        (TransportTimeout("timed out"), Code.TIMEOUT),
        (TransportError("reset"), Code.OFFLINE),
        (json_response(502, {}), Code.FAILED),
    ],
)
def test_write_failures_say_why(response, code):
    transport = fake(response)
    assert (
        client(transport).put("devices/x/logs/a.txt", b"x", "m").code is code
    )


# --------------------------------------------------------- the token


def test_the_token_is_not_in_repr():
    access = GitHubAccess(TOKEN, DATA_REPO)
    gh = client(fake())
    for text in (repr(access), str(access), repr(gh), repr(gh.check())):
        assert TOKEN not in text
    assert DATA_REPO in repr(access)


def test_the_token_is_not_in_logs_or_errors(caplog):
    caplog.set_level(logging.DEBUG)
    leaky = TransportError(f"proxy refused Authorization: Bearer {TOKEN}")
    gh = client(fake(leaky, info=repo_info()))
    result = gh.put("devices/x/logs/a.txt", b"x", "m")
    assert result.code is Code.OFFLINE
    everything = caplog.text + repr(result) + str(result.code)
    assert TOKEN not in everything
    bad = client(fake(info=TransportError(f"bad {TOKEN}"))).check()
    assert TOKEN not in repr(bad) + caplog.text


def test_the_token_is_not_in_uploaded_files(tmp_path):
    transport = fake(created())
    data = FieldData(
        tmp_path, crash_dir=tmp_path / "crash", transport=transport
    )
    data.connect(TOKEN, DATA_REPO)
    data.send_log(f"12:00:00 ERROR nagmon.x: token was {TOKEN}\n")
    data.send_progress({"note": f"x {TOKEN}"})
    put = [c for c in transport.calls if c.method == "PUT"]
    assert len(put) == 2
    for call in put:
        assert TOKEN not in call.body.decode("utf-8")
        assert (
            TOKEN not in base64.b64decode(_put_body(call)["content"]).decode()
        )
        assert TOKEN not in call.url


# --------------------------------------------------------- storing


def test_saving_the_token_keeps_the_ai_keys(tmp_path):
    save_keys(tmp_path, {"groq": "gsk_" + "k" * 30})
    save_access(tmp_path, GitHubAccess(TOKEN, DATA_REPO))
    assert load_keys(tmp_path, environ={})["groq"] == "gsk_" + "k" * 30
    assert load_access(tmp_path) == GitHubAccess(TOKEN, DATA_REPO)
    # ...and the AI keys do not wipe the token either.
    save_keys(tmp_path, {"cerebras": "csk_" + "c" * 30})
    assert load_access(tmp_path) == GitHubAccess(TOKEN, DATA_REPO)
    data = json.loads((tmp_path / "secrets.json").read_text())
    assert data["github"] == {"token": TOKEN, "repo": DATA_REPO}


@pytest.mark.skipif(sys.platform == "win32", reason="POSIX permissions")
def test_the_secrets_file_is_private(tmp_path):
    save_access(tmp_path, GitHubAccess(TOKEN, DATA_REPO))
    mode = stat.S_IMODE(os.stat(tmp_path / "secrets.json").st_mode)
    assert mode == 0o600


def test_disconnecting_removes_only_the_token(tmp_path):
    save_keys(tmp_path, {"groq": "gsk_" + "k" * 30})
    save_access(tmp_path, GitHubAccess(TOKEN, DATA_REPO))
    forget_access(tmp_path)
    assert load_access(tmp_path) is None
    assert "groq" in load_keys(tmp_path, environ={})
    assert TOKEN not in (tmp_path / "secrets.json").read_text()


def test_the_default_repo_is_the_data_repo(tmp_path):
    assert DEFAULT_REPO == "YuvalNag/nagmon-data"
    (tmp_path / "secrets.json").write_text(
        json.dumps({"github": {"token": TOKEN}})
    )
    assert load_access(tmp_path) == GitHubAccess(TOKEN, DEFAULT_REPO)


@pytest.mark.parametrize(
    "stored",
    [
        None,
        "x",
        {"github": "x"},
        {"github": {"token": ""}},
        {"github": {"token": 5}},
    ],
)
def test_a_broken_secrets_file_means_not_connected(tmp_path, stored):
    if stored is not None:
        (tmp_path / "secrets.json").write_text(json.dumps(stored))
    assert load_access(tmp_path) is None


# ---------------------------------------------------------- install id


def test_the_install_id_is_stable_between_runs(tmp_path):
    first = install_id(tmp_path)
    assert re.fullmatch(r"[0-9a-f]{8}", first)
    assert install_id(tmp_path) == first
    assert install_id(Path(str(tmp_path))) == first


def test_each_install_gets_its_own_id(tmp_path):
    assert install_id(tmp_path / "a") != install_id(tmp_path / "b")


def test_a_broken_device_file_gets_a_new_id(tmp_path):
    (tmp_path / "device.json").write_text("{broken")
    assert re.fullmatch(r"[0-9a-f]{8}", install_id(tmp_path))


def test_upload_paths():
    assert upload_path("ab12cd34", "logs", NOW) == (
        "devices/ab12cd34/logs/20261019T143005Z.txt"
    )
    assert upload_path("ab12cd34", "crashes", NOW).endswith(".txt")
    assert upload_path("ab12cd34", "progress", NOW) == (
        "devices/ab12cd34/progress/20261019T143005Z.json"
    )
    with pytest.raises(ValueError):
        upload_path("ab12cd34", "../etc", NOW)


# ------------------------------------------------------- the service


def _service(tmp_path, transport, clock=None):
    return FieldData(
        tmp_path,
        crash_dir=tmp_path / "crash",
        transport=transport,
        clock=clock or Clock(),
    )


def test_connecting_checks_then_saves(tmp_path):
    data = _service(tmp_path, fake())
    assert not data.connected
    assert data.status().code is Code.NOT_CONNECTED
    check = data.connect(f"  {TOKEN}\n", DATA_REPO)
    assert check.ok and data.connected
    assert load_access(tmp_path) == GitHubAccess(TOKEN, DATA_REPO)


def test_a_token_that_does_not_work_is_not_saved(tmp_path):
    data = _service(tmp_path, fake(info=json_response(401, {})))
    assert data.connect(TOKEN).code is Code.BAD_TOKEN
    assert load_access(tmp_path) is None


def test_a_public_repo_token_is_kept_but_nothing_is_sent(tmp_path):
    """The token works; the parent only has to make the repo private."""
    transport = fake(created(), info=repo_info(private=False))
    data = _service(tmp_path, transport)
    assert data.connect(TOKEN).code is Code.PUBLIC
    assert data.connected
    assert data.send_log("hello").code is Code.PUBLIC
    assert not [c for c in transport.calls if c.method == "PUT"]


def test_sending_needs_a_connection(tmp_path):
    transport = fake(created())
    data = _service(tmp_path, transport)
    assert data.send_log("hello").code is Code.NOT_CONNECTED
    assert transport.calls == []


def test_uploads_go_to_their_own_paths(tmp_path):
    transport = fake(created())
    data = _service(tmp_path, transport)
    data.connect(TOKEN)
    device = install_id(tmp_path)
    assert (
        data.send_log("a log").path
        == f"devices/{device}/logs/20261019T143005Z.txt"
    )
    result = data.send_progress({"schema_version": 1, "children": []})
    assert result.path == f"devices/{device}/progress/20261019T143005Z.json"
    put = [c for c in transport.calls if c.method == "PUT"]
    sent = json.loads(base64.b64decode(_put_body(put[-1])["content"]))
    assert sent == {"schema_version": 1, "children": []}
    assert DEFAULT_REPO in put[-1].url


def test_the_crash_report_is_offered_until_it_was_sent(tmp_path):
    transport = fake(created())
    data = _service(tmp_path, transport)
    assert data.pending_crash() is None
    (tmp_path / "crash").mkdir()
    (tmp_path / "crash" / "last_crash.txt").write_text(
        "Nagmon crash report\nboom"
    )
    assert data.pending_crash() is not None
    data.connect(TOKEN)
    result = data.send_crash()
    assert result.ok and "/crashes/" in result.path
    assert data.pending_crash() is None
    # A newer crash is offered again.
    (tmp_path / "crash" / "last_crash.txt").write_text(
        "Nagmon crash report\nbang"
    )
    assert data.pending_crash() == "Nagmon crash report\nbang"


def test_a_failed_crash_upload_stays_pending(tmp_path):
    transport = fake(json_response(500, {}))
    data = _service(tmp_path, transport)
    (tmp_path / "crash").mkdir()
    (tmp_path / "crash" / "last_crash.txt").write_text("boom")
    data.connect(TOKEN)
    assert data.send_crash().code is Code.FAILED
    assert data.pending_crash() == "boom"


def test_disconnecting(tmp_path):
    data = _service(tmp_path, fake())
    data.connect(TOKEN)
    data.disconnect()
    assert not data.connected
    assert data.status().code is Code.NOT_CONNECTED


def test_saved_secrets_include_the_token_and_the_ai_keys(tmp_path):
    save_keys(tmp_path, {"groq": "gsk_" + "k" * 30})
    data = _service(tmp_path, fake())
    data.connect(TOKEN)
    assert set(data.secrets()) >= {TOKEN, "gsk_" + "k" * 30}


def _children(root, *names):
    from nagmon.runtime import NagmonRuntime

    rt = NagmonRuntime(root)
    for name in names:
        rt.store.create(name=name, avatar="girl", grade=2)
    return rt


def test_childrens_names_are_not_in_an_uploaded_log_or_crash(tmp_path):
    """The game names the player after the child, and Tuxemon's warnings
    name the player: the log and the crash report go without names."""
    rt = _children(tmp_path, "נועה", "Zephyrine")
    gone = rt.store.list()[1]
    rt.store.delete(gone.id)  # a deleted child's name is hidden too
    transport = fake(created())
    data = _service(tmp_path, transport)
    data.connect(TOKEN)
    data.send_log(
        "12:00:00 WARNING tuxemon.event: נועה has no monsters\n"
        "12:00:01 ERROR tuxemon.combat: Cannot start battle, "
        "Zephyrine has no monsters!\n"
    )
    data.send_crash("Nagmon crash report\nKeyError: 'נועה'\n")
    put = [c for c in transport.calls if c.method == "PUT"]
    assert len(put) == 2
    for call in put:
        sent = base64.b64decode(_put_body(call)["content"]).decode()
        assert "נועה" not in sent and "Zephyrine" not in sent
        assert "has no monsters" in sent or "KeyError" in sent


def test_the_names_to_hide(tmp_path):
    rt = _children(tmp_path, "נועה", "Zephyrine")
    data = _service(tmp_path, fake())
    assert set(data.names()) == {"נועה", "Zephyrine"}
    rt.store.delete(rt.store.list()[0].id)
    assert set(data.names()) == {"נועה", "Zephyrine"}


def test_a_log_with_an_odd_character_is_still_sent(tmp_path):
    transport = fake(created())
    data = _service(tmp_path, transport)
    data.connect(TOKEN)
    assert data.send_log("12:00:00 WARNING nagmon.x: no file a\udcffb\n").ok


def test_a_passing_github_failure_is_not_kept_for_an_hour():
    """A 502 while the screen opened must not show "GitHub did not accept
    the request" for the next hour."""
    transport = FakeTransport()
    transport.add("GET", API, json_response(502, {}), repo_info())
    gh = client(transport)
    assert gh.check().code is Code.FAILED
    assert gh.cached() is None
    assert gh.check().code is Code.OK


@pytest.mark.parametrize(
    "repo", ["a/b/../../user", "a/b?x=1", "a b/c", "/x", "owner/", "x"]
)
def test_an_odd_repo_in_the_secrets_file_falls_back_to_the_data_repo(
    tmp_path, repo
):
    """The repo goes into the API URL as is: only owner/name is used."""
    (tmp_path / "secrets.json").write_text(
        json.dumps({"github": {"token": TOKEN, "repo": repo}})
    )
    assert load_access(tmp_path) == GitHubAccess(TOKEN, DEFAULT_REPO)


def test_another_data_repo_can_be_set(tmp_path):
    (tmp_path / "secrets.json").write_text(
        json.dumps({"github": {"token": TOKEN, "repo": "Other-1/my.data_2"}})
    )
    assert load_access(tmp_path).repo == "Other-1/my.data_2"
