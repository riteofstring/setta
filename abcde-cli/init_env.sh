#!/bin/sh
if ! . ./check_python.sh; then
    return 1
fi

python3 -m venv abcde_env
. ./activate.sh
pip install -e .[dev]