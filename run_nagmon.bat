@echo off
rem Nagmon - double-click to play (Windows).
rem First time: installs what the game needs into a private folder (.venv).
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
    echo Setting up Nagmon for the first time...
    py -3 -m venv .venv || python -m venv .venv
    .venv\Scripts\python.exe -m pip install --upgrade pip
    .venv\Scripts\python.exe -m pip install -r requirements.txt
)
.venv\Scripts\python.exe run_tuxemon.py
