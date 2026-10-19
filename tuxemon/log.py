# SPDX-License-Identifier: GPL-3.0
# Copyright (c) 2014-2026 William Edwards <shadowapex@gmail.com>, Benjamin Bean <superman2k5@gmail.com>
import logging
import subprocess


def get_git_hash() -> str:
    """
    Gets the current Git hash, or "N/A" when git cannot run (not
    installed, or refused, as on Android phones where running it raises
    PermissionError).
    """
    try:
        githash = (
            subprocess.check_output(
                ["git", "describe", "--always"],
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            .strip()
            .decode()
        )
        return f"Git Hash: {githash}"
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        logging.warning("Git command failed. Git hash not available.")
        return "N/A"
    except OSError as exc:
        logging.warning("Git cannot run (%s). Git hash not available.", exc)
        return "N/A"
