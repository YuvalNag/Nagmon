# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
import sys
from pathlib import Path

import pygame
import pytest
from _pytest.mark.structures import ParameterSet


@pytest.fixture(scope="module", autouse=True)
def pygame_init():
    pygame.init()
    pygame.display.set_mode((800, 600))
    yield
    pygame.quit()


@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Enhance test reports with better error messages."""
    outcome = yield
    rep = outcome.get_result()

    if rep.failed and call.when == "call":
        pass


def pytest_collection_modifyitems(items):
    """Checks every test for missing pytest.param IDs"""
    errors = set()

    here = Path(__file__).resolve().parent
    for item in items:
        # Collection hooks see every test; only enforce this folder's rule.
        if here not in Path(str(item.fspath)).resolve().parents:
            continue
        for marker in item.iter_markers(name="parametrize"):
            params = marker.args[1]
            for i, param in enumerate(params):
                if isinstance(param, ParameterSet):
                    if param.id is None:
                        file_info = f"{item.location[0]}:{item.location[1]}"
                        errors.add(f"  - {file_info}: Missing id at index {i}")
                else:
                    file_info = f"{item.location[0]}:{item.location[1]}"
                    errors.add(
                        f"  - {file_info}: Param at index {i} is not a ParameterSet"
                    )

    if errors:
        pytest.exit(
            "\n[ID CHECK FAILED]:\n" + "\n".join(sorted(errors)),
            returncode=1,
        )


TUXEMON_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(TUXEMON_ROOT))
