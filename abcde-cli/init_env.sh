#!/bin/sh
python3 -m venv abcde_env
. ./activate.sh
pip install -e .[dev]