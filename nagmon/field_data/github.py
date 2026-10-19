# SPDX-License-Identifier: GPL-3.0
"""
The connection to the private data repo on GitHub
(docs/kids/SDD_FIELD_DATA.md §2.1): the token in ``secrets.json``, the
check that the repo is private and writable, and writing new files with
the Contents API.

The token never reaches a log, a ``repr``, an error or an uploaded file:
results carry a ``Code`` only, and HTTP bodies are never logged.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, ClassVar
from urllib.parse import quote

from nagmon.ai.config import read_secrets, write_secrets
from nagmon.ai.providers import (
    USER_AGENT,
    HttpResponse,
    Transport,
    TransportError,
    TransportTimeout,
    UrllibTransport,
)

logger = logging.getLogger(__name__)

API = "https://api.github.com"
#: The code repo is public; the data goes to its own private repo.
DEFAULT_REPO = "YuvalNag/nagmon-data"
TIMEOUT = 30.0
CHECK_TTL = 3600.0
#: PUT attempts in all when the branch moved (409/422).
MAX_TRIES = 3
SECRETS_KEY = "github"


class Code(str, Enum):
    """What happened; the parent sees ``nagmon_github_<value>``."""

    OK = "ok"
    PUBLIC = "public"
    BAD_TOKEN = "bad_token"
    NO_PERMISSION = "no_permission"
    NOT_FOUND = "not_found"
    OFFLINE = "offline"
    TIMEOUT = "timeout"
    CONFLICT = "conflict"
    FAILED = "failed"
    NOT_CONNECTED = "not_connected"


@dataclass(frozen=True)
class GitHubAccess:
    token: str
    repo: str = DEFAULT_REPO

    def __repr__(self) -> str:  # never show the token
        return f"GitHubAccess(repo={self.repo!r}, token=***)"

    __str__ = __repr__


@dataclass(frozen=True)
class Check:
    code: Code
    repo: str = ""

    @property
    def ok(self) -> bool:
        return self.code is Code.OK


@dataclass(frozen=True)
class Upload:
    code: Code
    path: str = ""

    @property
    def ok(self) -> bool:
        return self.code is Code.OK


# ----------------------------------------------------------- the token


def load_access(data_root: Path) -> GitHubAccess | None:
    """``secrets.json["github"]``, or None when not connected."""
    stored = read_secrets(data_root).get(SECRETS_KEY)
    if not isinstance(stored, dict):
        return None
    token, repo = stored.get("token"), stored.get("repo")
    if not isinstance(token, str) or not token.strip():
        return None
    if not isinstance(repo, str) or "/" not in repo:
        repo = DEFAULT_REPO
    return GitHubAccess(token.strip(), repo.strip())


def save_access(data_root: Path, access: GitHubAccess) -> None:
    """Read-merge-write: the AI keys stay."""
    data = read_secrets(data_root)
    data[SECRETS_KEY] = {"token": access.token.strip(), "repo": access.repo}
    write_secrets(data_root, data)


def forget_access(data_root: Path) -> None:
    data = read_secrets(data_root)
    if data.pop(SECRETS_KEY, None) is not None:
        write_secrets(data_root, data)


# ------------------------------------------------------------ the client


def _status_code(resp: HttpResponse) -> Code:
    """An HTTP failure in the parent's terms."""
    if resp.status == 401:
        return Code.BAD_TOKEN
    if resp.status == 403:
        if resp.header("X-RateLimit-Remaining") == "0":
            return Code.FAILED  # too many requests: try later
        return Code.NO_PERMISSION
    if resp.status == 404:
        return Code.NOT_FOUND
    return Code.FAILED


def _json(resp: HttpResponse) -> Any:
    try:
        return json.loads(resp.body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None


class GitHubClient:
    """
    Talks to one repo with one token. The check is kept for an hour (in
    memory only) so the parent area does not ask GitHub on every visit;
    every upload checks afresh.
    """

    _checks: ClassVar[dict[tuple[str, str], tuple[float, Check]]] = {}

    def __init__(
        self,
        access: GitHubAccess,
        *,
        transport: Transport | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._access = access
        self.repo = access.repo
        self._transport = transport or UrllibTransport()
        self._clock = clock

    def __repr__(self) -> str:
        return f"GitHubClient(repo={self.repo!r})"

    @classmethod
    def forget_checks(cls) -> None:
        cls._checks.clear()

    @property
    def _cache_key(self) -> tuple[str, str]:
        digest = hashlib.sha256(self._access.token.encode()).hexdigest()
        return self.repo, digest

    # ------------------------------------------------------------ HTTP

    def _request(
        self, method: str, path: str, body: Any = None
    ) -> HttpResponse:
        """Raises ``TransportError`` (``TransportTimeout``) as is."""
        headers = {
            "Authorization": f"Bearer {self._access.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": USER_AGENT,
        }
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        url = f"{API}/repos/{self.repo}{path}"
        resp = self._transport(method, url, headers, data, TIMEOUT)
        logger.info("GitHub %s %s: %s", method, path or "/", resp.status)
        return resp

    def _network_code(self, err: TransportError) -> Code:
        # The error text may quote request headers: it is not logged.
        logger.warning("GitHub unreachable: %s", type(err).__name__)
        if isinstance(err, TransportTimeout):
            return Code.TIMEOUT
        return Code.OFFLINE

    # ----------------------------------------------------------- check

    def cached(self) -> Check | None:
        """The last check, if it is less than an hour old."""
        hit = self._checks.get(self._cache_key)
        if hit is None or self._clock() - hit[0] > CHECK_TTL:
            return None
        return hit[1]

    def check(self, *, fresh: bool = False) -> Check:
        """``GET /repos/{repo}``: private and writable, or why not."""
        if not fresh:
            hit = self.cached()
            if hit is not None:
                return hit
        try:
            resp = self._request("GET", "")
        except TransportError as err:
            return Check(self._network_code(err), self.repo)  # not kept
        check = Check(self._classify(resp), self.repo)
        self._checks[self._cache_key] = (self._clock(), check)
        return check

    def _classify(self, resp: HttpResponse) -> Code:
        if resp.status != 200:
            return _status_code(resp)
        info = _json(resp)
        if not isinstance(info, dict) or "private" not in info:
            return Code.FAILED
        if info.get("private") is not True:
            return Code.PUBLIC
        permissions = info.get("permissions")
        if not isinstance(permissions, dict) or not permissions.get("push"):
            return Code.NO_PERMISSION
        return Code.OK

    # ----------------------------------------------------------- write

    def put(self, path: str, content: bytes, message: str) -> Upload:
        """
        A new file at ``path`` on the repo's default branch. Nothing is
        written unless a fresh check says the repo is private and
        writable. Each path is new, so no ``sha`` is needed.
        """
        check = self.check(fresh=True)
        if not check.ok:
            return Upload(check.code, path)
        body = {
            "message": message,
            "content": base64.b64encode(content).decode("ascii"),
        }
        url_path = "/contents/" + quote(path)
        for attempt in range(1, MAX_TRIES + 1):
            try:
                resp = self._request("PUT", url_path, body)
            except TransportError as err:
                return Upload(self._network_code(err), path)
            if resp.status in (200, 201):
                return Upload(Code.OK, path)
            if resp.status not in (409, 422):
                return Upload(_status_code(resp), path)
            # The branch moved, or a brand-new repo is still empty: look
            # again and retry.
            logger.info("GitHub write retry %d/%d", attempt, MAX_TRIES)
            if attempt < MAX_TRIES:
                again = self.check(fresh=True)
                if not again.ok:
                    return Upload(again.code, path)
        return Upload(Code.CONFLICT, path)
