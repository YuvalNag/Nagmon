# SPDX-License-Identifier: GPL-3.0
"""Remote LLM support for Nagmon (SDD_AI.md).

Pure Python: no pygame and no tuxemon imports. Every network call goes
through an injectable ``Transport`` so tests never touch the network.
"""
