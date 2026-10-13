#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/python -m playwright install chromium
echo "Pronto! Rode ./start.sh"
