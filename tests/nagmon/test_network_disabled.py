# SPDX-License-Identifier: GPL-3.0
"""The family build must not open network ports by default."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

from tuxemon.config import GameConfig
from tuxemon.network.manager import NetworkManager


def test_network_disabled_by_default():
    assert GameConfig().network_enabled is False


def test_manager_does_not_start_server_when_disabled():
    parent = SimpleNamespace(config=SimpleNamespace(network_enabled=False))
    with (
        patch("tuxemon.network.manager.TuxemonServer") as server,
        patch("tuxemon.network.manager.TuxemonClient") as client,
    ):
        manager = NetworkManager(parent)
        manager.initialize()
    server.assert_not_called()
    client.assert_not_called()
    assert manager.server is None and manager.client is None


def test_manager_starts_server_when_enabled():
    parent = SimpleNamespace(config=SimpleNamespace(network_enabled=True))
    with (
        patch("tuxemon.network.manager.TuxemonServer") as server,
        patch("tuxemon.network.manager.TuxemonClient"),
    ):
        NetworkManager(parent).initialize()
    server.assert_called_once()
