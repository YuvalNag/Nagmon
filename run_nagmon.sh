#!/bin/sh
# Nagmon - run from a terminal: ./run_nagmon.sh (Linux).
# First time: installs what the game needs into a private folder (.venv).
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then
    echo "Setting up Nagmon for the first time..."
    python3 -m venv .venv || exit 1
    .venv/bin/python -m pip install --upgrade pip
    .venv/bin/python -m pip install -r requirements.txt || exit 1
fi
exec .venv/bin/python run_tuxemon.py "$@"
